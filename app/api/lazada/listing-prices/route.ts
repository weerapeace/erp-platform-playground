/**
 * ราคา / ราคาลด ต่อตัวเลือก ของสินค้าบน Lazada — ลิ้นชักสินค้าบนร้าน · เฟส 3 (แก้ร้านจริง)
 *  POST { listing_id, before: LazadaPriceRow[], edit: LazadaPriceRow[] }   (products.platforms.publish)
 *
 *   1) ดึงสดจาก Lazada → ตัวที่คนแก้ ถ้าราคาบนร้านต่างจาก "before" (ที่เห็นตอนเปิด) = มีคนแก้ไปแล้ว → 409 ไม่ส่งทับ
 *      ตัวที่ไม่ได้แก้ = ใช้ค่าบนร้านล่าสุด (ไม่ย้อนของคนอื่น)
 *   2) planLazadaPrices (กฎเดียวกับหน้าเว็บ: ≥ 80% ไม่ส่ง · ราคาลด < ราคาปกติ + มีช่วงวัน) → ไม่ผ่าน = 400 ไม่ส่งอะไร
 *   3) /product/price_quantity/update ทีละชุด 20 ตัว — ไม่มี Quantity (สต๊อก = BigSeller) · ชุดพลาด = รายงาน ชุดอื่นทำต่อ
 *   4) ดึงใหม่ (ลองซ้ำ) → สำเนาย่อ · ดึงไม่ได้ = แสดงตามที่ส่ง + เตือน
 *   5) ประวัติ (audit) ทุกครั้ง
 *  → LazadaWriteResponse
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazErrorText, lazUpdatePriceQuantity } from "@/lib/lazada";
import {
  LAZADA_PRICE_BATCH, lazadaListingView, lazadaPriceRowsFromView, lazPriceQuantityXml, lazViewAfterWrite, planLazadaPrices,
  type LazadaPriceRow, type LazadaWriteResponse, type LazPriceSku,
} from "@/lib/lazada-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadLazListingLive, refetchLazItem, saveLazSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: LazadaWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const num = (x: unknown) => { if (x == null || x === "") return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const s = (x: unknown) => { const t = x == null ? "" : String(x).trim(); return t || null; };
const cleanRows = (v: unknown): LazadaPriceRow[] | null => {
  if (!Array.isArray(v)) return null;
  return v.map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {})).map((o) => ({
    skuId: String(o.skuId ?? ""), sellerSku: s(o.sellerSku), label: String(o.label ?? ""),
    price: num(o.price), special: num(o.special), from: s(o.from), to: s(o.to),
  })).filter((r) => r.skuId);
};
const same = (a: LazadaPriceRow, b: LazadaPriceRow) => a.price === b.price && a.special === b.special && (a.special == null || (a.from === b.from && a.to === b.to));

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: unknown; edit?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const seen = cleanRows(body.before); const edit = cleanRows(body.edit);
  if (!listingId || !seen || !edit) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before + edit)" }, 400);

  const admin = supabaseAdmin();
  const live = await loadLazListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก Lazada ก่อน" }, 400);
  const liveView = lazadaListingView(live.item);
  if (!liveView) return reply({ ok: false, view: null, error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  const liveRows = lazadaPriceRowsFromView(liveView);
  const liveById = new Map(liveRows.map((r) => [r.skuId, r]));
  const seenById = new Map(seen.map((r) => [r.skuId, r]));

  // 1) เฉพาะตัวที่คนแก้ · ร้านเปลี่ยนตั้งแต่เปิด = ไม่ส่งทับ
  const touched = edit.filter((e) => { const b = seenById.get(e.skuId); return b && !same(b, e); });
  const moved = touched.filter((e) => { const b = seenById.get(e.skuId)!; const l = liveById.get(e.skuId); return !l || !same(b, l); });
  if (moved.length) return reply({ ok: false, view: liveView, error: `ราคาบน Lazada เปลี่ยนไปตั้งแต่เปิดลิ้นชัก ${moved.length} ตัวเลือก (มีคนแก้ในร้าน?) — ระบบโหลดราคาล่าสุดให้แล้ว ตรวจแล้วแก้อีกครั้ง` }, 409);
  const touchedById = new Map(touched.map((e) => [e.skuId, e]));
  const after = liveRows.map((l) => { const e = touchedById.get(l.skuId); return e ? { ...l, price: e.price, special: e.special, from: e.from, to: e.to } : l; });

  // 2) ตรวจ + เลือกเฉพาะที่เปลี่ยน
  const plan = planLazadaPrices(liveRows, after);
  if (plan.errors.length) return reply({ ok: false, view: liveView, error: plan.errors.join(" · ") }, 400);
  if (plan.skus.length === 0) return reply({ ok: true, view: liveView, changes: [], error: null });

  // 3) ส่งทีละชุด
  const sent: LazPriceSku[] = []; const fails: string[] = [];
  for (let i = 0; i < plan.skus.length; i += LAZADA_PRICE_BATCH) {
    const batch = plan.skus.slice(i, i + LAZADA_PRICE_BATCH);
    try { await lazUpdatePriceQuantity(live.gateway, live.accessToken, lazPriceQuantityXml(live.itemId, batch)); sent.push(...batch); }
    catch (e) { fails.push(`${batch.map((b) => b.sellerSku ?? b.skuId).join(", ")}: ${lazErrorText(e)}`); console.warn(`[lazada] ส่งราคา #${live.itemId} ไม่สำเร็จ: ${(e as Error).message}`); }
  }
  const sentIds = new Set(sent.map((x) => x.skuId));
  const okChanges = plan.changes.filter((c) => liveView.skus.some((sk) => sentIds.has(sk.skuId) && c.label === `ราคา ${sk.label}`));
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_listing_prices", item_id: live.itemId, title: live.row.title, changes: okChanges, sent: sent.length, planned: plan.skus.length, ...(fails.length ? { error: fails.join(" | ") } : {}), ...meta },
  });
  if (sent.length === 0) {
    await audit({ ok: false });
    return reply({ ok: false, view: liveView, error: `ส่งราคาขึ้น Lazada ไม่สำเร็จ: ${fails.join(" | ")}` }, 502);
  }

  // 4) ดึงใหม่ตรวจผล
  const warnings = [...plan.warnings];
  const fresh = await refetchLazItem(live.gateway, live.accessToken, live.itemId);
  const freshView = fresh ? lazadaListingView(fresh) : null;
  if (freshView) {
    const notYet = sent.filter((x) => { const f = freshView.skus.find((sk) => sk.skuId === x.skuId); return !f || (x.price != null && f.price !== x.price) || (x.salePrice != null && f.specialPrice !== x.salePrice); });
    if (notYet.length) warnings.push(`Lazada ตอบรับแล้ว แต่ยังเห็นราคาเดิม ${notYet.length} ตัวเลือก (อาจใช้เวลา/รอตรวจ) — กดดึงตัวนี้อีกครั้งภายหลัง`);
    const qc = /pending/i.test(String(freshView.status ?? ""));
    if (qc) warnings.push("Lazada ส่งสินค้าไปรอตรวจ (Pending QC · ไม่เกิน 24 ชม.)");
    const err = await saveLazSlimCopy(admin, live.row, fresh!);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  } else warnings.push("Lazada ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ (Lazada ตอบช้า) — ระบบแสดงตามที่ส่งไว้ก่อน กด “ดึงตัวนี้จาก Lazada” อีกครั้งในอีกสักครู่เพื่อยืนยัน");

  // 5) ประวัติ
  const ok = fails.length === 0;
  await audit({ ok, warnings, refreshed: !!freshView, ...(freshView ? {} : { optimistic: true }) });
  return reply({
    ok, view: freshView ?? lazViewAfterWrite(liveView, { prices: sent }), changes: okChanges, warnings,
    error: ok ? null : `ส่งได้ ${sent.length}/${plan.skus.length} ตัวเลือก — ที่เหลือไม่สำเร็จ: ${fails.join(" | ")}`,
  }, ok ? 200 : 207);
}
