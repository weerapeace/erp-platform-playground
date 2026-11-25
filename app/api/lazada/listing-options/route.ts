/**
 * แท็บตัวเลือกของสินค้าบน Lazada — แก้ชื่อตัวเลือก + เพิ่มสีจากระบบ (แก้ร้านจริง · หน้าเว็บถามยืนยันก่อน) · เจ้าของเลือก 2026-11-24 แบบ A
 *  POST { listing_id, before_sig, names: { "ชั้น|ค่าเดิม": ชื่อใหม่ }, adds: LazOptAdd[], color_group }   (products.platforms.publish)
 *   1) ดึงสดจาก Lazada → ลายเซ็นตัวเลือกต่างจากที่หน้าเว็บเห็น = 409 ไม่ส่งทับ (คืนของล่าสุดให้)
 *   2) planLazadaOptions (กฎเดียวกับหน้าเว็บ) → ไม่ผ่าน = 400
 *   3) รูปสีใหม่จากระบบ ("r2:<key>") → ฝากกับ Lazada (/image/migrate) — ไม่ผ่าน = หยุด ไม่แก้อะไร
 *   4) /product/update รอบแก้ชื่อ (SKU ที่ค่าเปลี่ยน + สถานะเดิม) → รอบเพิ่มสี (AssociatedSku + SKU ใหม่ · สต๊อก 0)
 *   5) ดึงใหม่ → ตรวจว่าชื่อ/สีใหม่ขึ้นจริง → สำเนาย่อ → ประวัติ (audit lazada_listing_options) ทั้งสำเร็จ/ไม่สำเร็จ
 * กฎ: lib/lazada-option-edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazErrorText, lazMigrateImage, lazUpdateProduct } from "@/lib/lazada";
import { lazadaListingView, lazMigrateImageXml, lazSystemImageKey, type LazadaWriteResponse } from "@/lib/lazada-listing-edit";
import { lazAddSkusXml, lazOptionGroups, lazOptionSignature, lazRenameXml, planLazadaOptions, type LazOptAdd, type LazOptForm } from "@/lib/lazada-option-edit";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadLazListingLive, refetchLazItem, saveLazSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: LazadaWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const numOrNull = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => String(v ?? "").trim();
const addsOf = (v: unknown): LazOptAdd[] => (Array.isArray(v) ? v.slice(0, 50) : []).map((x): LazOptAdd | null => {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const code = str(o.code); if (!code) return null;
  const sizes = Array.isArray(o.sizes) ? o.sizes.map((z) => { const q = (z && typeof z === "object" ? z : {}) as Record<string, unknown>; return { value: str(q.value), sku: str(q.sku), price: numOrNull(q.price) }; }).filter((z) => z.value) : undefined;
  return { code, name: str(o.name), image: str(o.image) || null, price: numOrNull(o.price), special: numOrNull(o.special), ...(sizes ? { sizes } : {}) };
}).filter((x): x is LazOptAdd => !!x);
const namesOf = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
  return out;
};
const migrateSource = (key: string) => `${publicImageUrl(key)}&w=1500&sq=1`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before_sig?: unknown; names?: unknown; adds?: unknown; color_group?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = str(body.listing_id);
  if (!listingId || typeof body.before_sig !== "string") return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before_sig)" }, 400);
  const form: LazOptForm = { names: namesOf(body.names), adds: addsOf(body.adds), colorGroup: str(body.color_group) || null };

  const admin = supabaseAdmin();
  const live = await loadLazListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก Lazada ก่อน" }, 400);
  const view = lazadaListingView(live.item);
  if (!view) return reply({ ok: false, view: null, error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  if (lazOptionSignature(view) !== body.before_sig) return reply({ ok: false, view, error: "ตัวเลือกบนร้าน Lazada เปลี่ยนไปตั้งแต่เปิดลิ้นชัก (มีคนแก้ในร้าน?) — ระบบโหลดของล่าสุดให้แล้ว ตรวจแล้วแก้อีกครั้ง" }, 409);

  const groups = lazOptionGroups(view);
  if (form.adds.length && !groups.some((g) => g.name === form.colorGroup)) return reply({ ok: false, view, error: "ไม่รู้ว่าชั้นไหนคือสี — ปิดแล้วเปิดลิ้นชักใหม่" }, 400);
  const plan = planLazadaOptions(view, groups, form);
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (!plan.changed) return reply({ ok: true, view, changes: [], summary: "เหมือนเดิม — ไม่มีอะไรต้องส่ง", error: null });

  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_listing_options", item_id: live.itemId, title: live.row.title, changes: plan.changes, ...meta },
  });

  // 3) รูปสีใหม่ → ฝากกับ Lazada ก่อน
  const migrated = new Map<string, string>();
  for (const ref of plan.newImages) {
    const key = lazSystemImageKey(ref); if (!key) continue;
    try { migrated.set(ref, await lazMigrateImage(live.gateway, live.accessToken, lazMigrateImageXml(migrateSource(key)))); }
    catch (e) {
      const error = `ฝากรูปสีใหม่กับ Lazada ไม่สำเร็จ (${migrated.size + 1}/${plan.newImages.length}): ${lazErrorText(e)}`;
      await audit({ ok: false, step: "migrate", error, raw_error: (e as Error).message });
      return reply({ ok: false, view, error: `${error} · ยังไม่ได้แก้อะไรบนร้าน` }, 502);
    }
  }

  // 4) แก้ชื่อ → เพิ่มสี (รอบแรกพลาด = ไม่ทำรอบสอง)
  const done: string[] = [];
  const renameXml = lazRenameXml(live.itemId, view, groups, form);
  if (renameXml) {
    try { await lazUpdateProduct(live.gateway, live.accessToken, renameXml); done.push(`ชื่อตัวเลือก ${plan.renamedSkuIds.length} ตัว`); }
    catch (e) {
      const error = lazErrorText(e);
      await audit({ ok: false, step: "rename", error, raw_error: (e as Error).message });
      return reply({ ok: false, view, error: `แก้ชื่อตัวเลือกบน Lazada ไม่สำเร็จ: ${error} — ยังไม่ได้แก้อะไร` }, 502);
    }
  }
  let newSkus: string[] = [];
  if (plan.addsChanged) {
    const built = lazAddSkusXml(live.itemId, view, groups, form, (ref) => migrated.get(ref) ?? (/^https?:\/\//i.test(ref) ? ref : null));
    if (built.errors.length || !built.xml) {
      const error = built.errors.join(" · ") || "สร้างคำสั่งเพิ่มสีไม่ได้";
      await audit({ ok: false, step: "adds_build", error, done });
      return reply({ ok: false, view, error: `${error}${done.length ? ` (แก้${done.join(" · ")}แล้ว)` : ""}` }, 400);
    }
    newSkus = built.sellerSkus;
    try { await lazUpdateProduct(live.gateway, live.accessToken, built.xml); done.push(`เพิ่มสี ${form.adds.length} สี (${newSkus.length} ตัวเลือก)`); }
    catch (e) {
      const error = lazErrorText(e);
      await audit({ ok: false, step: "adds", error, raw_error: (e as Error).message, done, new_skus: newSkus });
      const fresh = done.length ? await refetchLazItem(live.gateway, live.accessToken, live.itemId) : null;
      return reply({ ok: false, view: (fresh && lazadaListingView(fresh)) || view, error: `เพิ่มสีบน Lazada ไม่สำเร็จ: ${error}${done.length ? ` — แก้${done.join(" · ")}ไปแล้ว` : " — ยังไม่ได้แก้อะไร"}` }, 502);
    }
  }

  // 5) ดึงใหม่ → ตรวจผล
  const warnings = plan.warnings.filter((w) => !w.includes("BigSeller เติม"));
  const fresh = await refetchLazItem(live.gateway, live.accessToken, live.itemId);
  const freshView = fresh ? lazadaListingView(fresh) : null;
  if (!freshView) warnings.push("Lazada ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Lazada” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else {
    const freshGroups = lazOptionGroups(freshView);
    const missingNames = plan.changes.filter((c) => c.label.startsWith("ชื่อตัวเลือก") && !freshGroups.some((g) => g.values.some((x) => x.value === c.after))).length;
    if (missingNames) warnings.push(`Lazada ตอบรับแล้ว แต่ยังไม่เห็นชื่อใหม่ ${missingNames} ค่า (อาจรอตรวจ) — ดูอีกครั้งภายหลัง`);
    const seen = newSkus.filter((ss) => freshView.skus.some((x) => (x.sellerSku ?? "").toUpperCase() === ss.toUpperCase())).length;
    if (newSkus.length && seen < newSkus.length) warnings.push(`Lazada ตอบรับแล้ว แต่ยังไม่เห็นสีใหม่ ${newSkus.length - seen} ตัวเลือก (อาจรอตรวจ Pending QC) — ดูอีกครั้งภายหลัง`);
    const statusMoved = freshView.skus.filter((x) => { const b = view.skus.find((y) => y.skuId === x.skuId); return b && b.status !== x.status; }).length;
    if (statusMoved) warnings.push(`สถานะเปิด/ปิดของตัวเลือกเดิมเปลี่ยนไป ${statusMoved} ตัว — ตรวจในแท็บตัวเลือก`);
    if (/pending/i.test(String(freshView.status ?? ""))) warnings.push("Lazada ส่งสินค้าไปรอตรวจ (Pending QC · ไม่เกิน 24 ชม.)");
    const err = await saveLazSlimCopy(admin, live.row, fresh!);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  await audit({ ok: true, done, new_skus: newSkus, adds: form.adds, warnings, refreshed: !!freshView, migrated: migrated.size });
  return reply({ ok: true, view: freshView ?? view, changes: plan.changes, summary: done.join(" · "), warnings, error: null });
}
