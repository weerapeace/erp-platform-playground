/**
 * แก้ข้อมูลสินค้าบน Lazada — ลิ้นชักสินค้าบนร้าน (แก้ร้านจริง)
 *  เฟส 2: ชื่อ / รายละเอียด / จุดเด่น · เฟส 4: รูปสินค้า + รูปตัวเลือก + น้ำหนัก/ขนาดกล่อง
 *  POST { listing_id, before: LazadaEditState, edit: LazadaEditState, sku_before?: LazadaSkuMediaRow[], sku_edit?: LazadaSkuMediaRow[] }   (products.platforms.publish)
 *
 *   1) ดึงสินค้าตัวนี้สดจาก Lazada → ถ้าต่างจาก "before" (ที่คนเห็นตอนเปิดลิ้นชัก) = มีคนแก้บนร้านไปแล้ว → 409 ไม่ส่งทับ
 *   2) planLazadaEdit + planLazadaSkuMedia (กฎเดียวกับหน้าเว็บ) → ตรวจไม่ผ่าน = 400 ไม่ส่งอะไร · ไม่มีอะไรเปลี่ยน = ok ไม่ส่ง
 *   3) รูปจากคลังรูปในระบบ ("r2:<key>") → ฝากกับ Lazada (/image/migrate · JPG จัตุรัสพื้นขาว 1500px) — ไม่ผ่าน = หยุด ไม่แก้สินค้า
 *   4) /product/update — ส่งเฉพาะที่เปลี่ยน + SKU ครบตามลำดับเดิมพร้อมสถานะเดิมทุกตัว (lazUpdateProductXml)
 *   5) ดึงใหม่ → ตรวจผล + สถานะรอตรวจ (Pending QC) → สำเนาย่อในระบบ · ดึงไม่ได้ = แสดงตามที่ส่ง + เตือน
 *   6) ประวัติ (audit) ทั้งสำเร็จและไม่สำเร็จ — ก่อน → หลัง
 *  → LazadaWriteResponse
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazErrorText, lazMigrateImage, lazUpdateProduct } from "@/lib/lazada";
import {
  lazadaEditStateFromView, lazadaListingView, lazadaSkuMediaFromView, lazMigrateImageXml, lazResolveRefs, lazSystemImageKey, lazUpdateProductXml, lazViewAfterWrite,
  planLazadaEdit, planLazadaSkuMedia, type LazadaEditState, type LazadaSkuMediaRow, type LazadaWriteResponse, type LazSkuExtra,
} from "@/lib/lazada-listing-edit";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadLazListingLive, refetchLazItem, saveLazSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: LazadaWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const strList = (v: unknown): string[] | null => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : null);
const num = (x: unknown) => { if (x == null || x === "") return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
/** images ไม่ส่งมา (หน้าเว็บรุ่นเก่า) = null → ใช้ของบนร้าน (ไม่เทียบ ไม่แก้) */
const cleanState = (v: unknown): (Omit<LazadaEditState, "images"> & { images: string[] | null }) | null => {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : null;
  if (!o) return null;
  return { name: String(o.name ?? ""), description: String(o.description ?? ""), highlights: String(o.highlights ?? ""), images: strList(o.images) };
};
const cleanSku = (v: unknown): LazadaSkuMediaRow[] | null => {
  if (!Array.isArray(v)) return null;
  return v.map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {})).map((o) => ({
    skuId: String(o.skuId ?? ""), sellerSku: o.sellerSku == null ? null : String(o.sellerSku), label: String(o.label ?? ""),
    images: strList(o.images) ?? [], weight: num(o.weight), length: num(o.length), width: num(o.width), height: num(o.height),
  })).filter((r) => r.skuId);
};
const norm = (s: LazadaEditState) => [s.name.replace(/\s+/g, " ").trim(), s.description, s.highlights.split("\n").map((x) => x.trim()).filter(Boolean).join("\n"), s.images.join("\n")].join("\u0000");
const skuSame = (a: LazadaSkuMediaRow, b: LazadaSkuMediaRow) => a.images.join("\n") === b.images.join("\n") && a.weight === b.weight && a.length === b.length && a.width === b.width && a.height === b.height;
/** ลิงก์ที่ Lazada ดาวน์โหลดได้: รูปในระบบ → JPG จัตุรัสพื้นขาว 1500px (Lazada รับ jpg/png เท่านั้น · /api/r2-image &sq=1) */
const migrateSource = (key: string) => `${publicImageUrl(key)}&w=1500&sq=1`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: unknown; edit?: unknown; sku_before?: unknown; sku_edit?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const seen0 = cleanState(body.before); const after0 = cleanState(body.edit);
  if (!listingId || !seen0 || !after0) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before + edit)" }, 400);
  const skuSeen = cleanSku(body.sku_before); const skuEdit = cleanSku(body.sku_edit);

  const admin = supabaseAdmin();
  const live = await loadLazListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก Lazada ก่อน" }, 400);
  const liveView = lazadaListingView(live.item);
  if (!liveView) return reply({ ok: false, view: null, error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  const liveState = lazadaEditStateFromView(liveView);
  const seen: LazadaEditState = { ...seen0, images: seen0.images ?? liveState.images };
  const after: LazadaEditState = { ...after0, images: after0.images ?? (seen0.images ? seen.images : liveState.images) };

  // 1) มีคนแก้บนร้านหลังเปิดลิ้นชัก → ไม่ส่งทับ (ข้อมูล/รูปสินค้า + ตัวเลือกที่คนแก้)
  const staleMsg = "ข้อมูลบนร้าน Lazada เปลี่ยนไปตั้งแต่เปิดลิ้นชัก (มีคนแก้ในร้าน?) — ระบบโหลดข้อมูลล่าสุดให้แล้ว ตรวจแล้วแก้อีกครั้ง";
  if (norm(liveState) !== norm(seen)) return reply({ ok: false, view: liveView, error: staleMsg }, 409);
  const liveSku = lazadaSkuMediaFromView(liveView);
  let skuAfter = liveSku;
  if (skuSeen && skuEdit) {
    const seenById = new Map(skuSeen.map((r) => [r.skuId, r]));
    const liveById = new Map(liveSku.map((r) => [r.skuId, r]));
    const touched = skuEdit.filter((e) => { const b = seenById.get(e.skuId); return b && !skuSame(b, e); });
    if (touched.some((e) => { const l = liveById.get(e.skuId); return !l || !skuSame(seenById.get(e.skuId)!, l); })) return reply({ ok: false, view: liveView, error: staleMsg }, 409);
    const touchedById = new Map(touched.map((e) => [e.skuId, e]));
    skuAfter = liveSku.map((l) => { const e = touchedById.get(l.skuId); return e ? { ...l, images: e.images, weight: e.weight, length: e.length, width: e.width, height: e.height } : l; });
  }

  // 2) ตรวจ + เลือกเฉพาะที่เปลี่ยน
  const plan = planLazadaEdit(liveState, after);
  const skuPlan = planLazadaSkuMedia(liveSku, skuAfter);
  const errors = [...plan.errors, ...skuPlan.errors];
  if (errors.length) return reply({ ok: false, view: liveView, error: errors.join(" · ") }, 400);
  const changes = [...plan.changes, ...skuPlan.changes];
  if (changes.length === 0) return reply({ ok: true, view: liveView, changes: [], error: null });

  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_listing_edit", item_id: live.itemId, title: live.row.title, changes, ...meta },
  });

  // 3) ฝากรูปจากระบบกับ Lazada ก่อน (ทีละรูป · ไม่ผ่าน = หยุด ไม่แก้สินค้า)
  const refs = [...(plan.fields.images ?? []), ...[...skuPlan.extras.values()].flatMap((e) => e.images ?? [])];
  const toMigrate = [...new Set(refs.filter((r) => lazSystemImageKey(r)))];
  const migrated = new Map<string, string>();
  for (const ref of toMigrate) {
    try { migrated.set(ref, await lazMigrateImage(live.gateway, live.accessToken, lazMigrateImageXml(migrateSource(lazSystemImageKey(ref)!)))); }
    catch (e) {
      const error = `ฝากรูปกับ Lazada ไม่สำเร็จ (${migrated.size + 1}/${toMigrate.length}): ${lazErrorText(e)} — รูปต้องเป็น jpg/png ไม่เกิน 3MB ด้านละ 330–5000px`;
      await audit({ ok: false, error, raw_error: (e as Error).message, migrated: migrated.size });
      return reply({ ok: false, view: liveView, error: `${error} · ยังไม่ได้แก้อะไรบนร้าน` }, 502);
    }
  }
  const fields = { ...plan.fields, ...(plan.fields.images ? { images: lazResolveRefs(plan.fields.images, migrated) } : {}) };
  const extras = new Map<string, LazSkuExtra>([...skuPlan.extras].map(([id, e]) => [id, e.images ? { ...e, images: lazResolveRefs(e.images, migrated) } : e]));

  // 4) ส่งขึ้น Lazada
  const xml = lazUpdateProductXml(live.itemId, liveView.skus.map((s) => ({ skuId: s.skuId, sellerSku: s.sellerSku, status: s.status })), fields, undefined, extras);
  let res: Record<string, unknown>;
  try { res = await lazUpdateProduct(live.gateway, live.accessToken, xml); }
  catch (e) {
    const error = lazErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message, migrated: migrated.size });
    return reply({ ok: false, view: liveView, error: `ส่งขึ้น Lazada ไม่สำเร็จ: ${error}` }, 502);
  }

  // 5) ดึงใหม่ → ตรวจผล + สำเนาย่อ
  const warnings = [...plan.warnings, ...skuPlan.warnings].filter((w) => !w.includes("ตรวจใหม่") && !w.includes("ฝากกับ Lazada"));
  const resData = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  const fresh = await refetchLazItem(live.gateway, live.accessToken, live.itemId);   // ลองซ้ำถ้า Lazada จำกัดความถี่
  const freshView = fresh ? lazadaListingView(fresh) : null;
  const qc = /pending/i.test(String(resData.item_status ?? "")) || /pending/i.test(String(freshView?.status ?? ""));
  if (qc) warnings.push("Lazada ส่งสินค้าไปรอตรวจ (Pending QC · ไม่เกิน 24 ชม.)");
  if (!freshView) {
    // ส่งสำเร็จแล้ว แต่ดึงกลับไม่ได้ → แสดงตามที่ส่ง + ชื่อในระบบตามที่ส่ง + เตือนให้ยืนยันเอง (ไม่โชว์ของเก่าให้เข้าใจผิดว่าไม่สำเร็จ)
    warnings.push("Lazada ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ (Lazada ตอบช้า) — ระบบแสดงตามที่ส่งไว้ก่อน กด “ดึงตัวนี้จาก Lazada” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
    if (fields.name) await admin.from("platform_catalog_listings").update({ title: fields.name, updated_at: new Date().toISOString() }).eq("id", live.row.id);
    await audit({ ok: true, qc, warnings, refreshed: false, optimistic: true, migrated: migrated.size });
    return reply({ ok: true, view: lazViewAfterWrite(liveView, { fields, skuExtras: extras }), changes, qc, warnings, error: null });
  }
  if (fields.name && freshView.name.replace(/\s+/g, " ").trim() !== fields.name) warnings.push("Lazada ตอบรับแล้ว แต่ชื่อบนร้านยังเป็นชื่อเดิม (อาจรอตรวจ) — ดูอีกครั้งภายหลัง");
  if (fields.images && freshView.images.length !== fields.images.length) warnings.push(`ส่งรูปสินค้า ${fields.images.length} รูป แต่บนร้านเห็น ${freshView.images.length} รูป — ตรวจในแท็บรูป (Lazada อาจไม่ลบรูปที่เอาออก)`);
  // เรียงใหม่/เปลี่ยนปกด้วยรูปเดิม (ไม่มีรูปฝากใหม่) → ลิงก์ต้องตรงลำดับ · ไม่ตรง = เตือน (ไม่ใช่แค่นับจำนวน)
  else if (fields.images && migrated.size === 0 && freshView.images.join("\n") !== fields.images.join("\n")) warnings.push("Lazada ตอบรับแล้ว แต่ลำดับรูป/ปกบนร้านยังไม่ตรงกับที่ส่ง — ตรวจในแท็บรูป");
  // น้ำหนัก/กล่องที่ส่ง ต้องเห็นค่าเดียวกันบนร้าน
  const pkgOff = [...extras].filter(([id, e]) => {
    const f = freshView.skus.find((s) => s.skuId === id); if (!f) return false;
    return (e.weight != null && f.weight !== e.weight) || (e.length != null && f.length !== e.length) || (e.width != null && f.width !== e.width) || (e.height != null && f.height !== e.height);
  }).length;
  if (pkgOff) warnings.push(`Lazada ตอบรับแล้ว แต่น้ำหนัก/ขนาดกล่องบนร้านยังไม่ตรง ${pkgOff} ตัวเลือก — ตรวจในแท็บตัวเลือก`);
  const changedStatus = freshView.skus.filter((s) => liveView.skus.find((b) => b.skuId === s.skuId)?.status !== s.status).length;
  if (changedStatus) warnings.push(`สถานะตัวเลือกเปลี่ยนไป ${changedStatus} ตัวหลังแก้ — ตรวจในแท็บตัวเลือก`);
  const err = await saveLazSlimCopy(admin, live.row, fresh!);
  if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);

  // 6) ประวัติ
  await audit({ ok: true, qc, warnings, refreshed: true, migrated: migrated.size });
  return reply({ ok: true, view: freshView, changes, qc, warnings, error: null });
}
