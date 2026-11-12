/**
 * แก้ราคาต่อตัวเลือกบน TikTok Shop — ลิ้นชักสินค้าบนร้าน · เฟส B (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, before: TiktokPriceRow[], edit: TiktokPriceRow[] }   (products.platforms.publish)
 *
 *   1) ดึงสดจาก TikTok → สินค้าต้องเปิดขายอยู่ (tiktokPriceBlock) · ราคาบนร้านของตัวที่จะแก้ต่างจาก before = 409 ไม่ส่งทับ
 *   2) planTiktokPrices เทียบ "ราคาบนร้านตอนนี้" กับที่แก้ (30–260,000 · ทศนิยม 2) — กฎเดียวกับหน้าเว็บ · ส่งเฉพาะตัวที่เปลี่ยน
 *   3) Update Price 202309 (มีผลทันที ไม่ต้องรอตรวจ) → ดึงกลับเทียบราคาทุกตัว → สำเนาย่อ → ประวัติ (audit tiktok_listing_prices) ทั้งสำเร็จ/ไม่สำเร็จ
 *  → TiktokWriteResponse
 * ไม่แตะชื่อ/สต๊อก/สถานะ · สินค้าในโปรโมชัน TikTok จะปฏิเสธ (ส่งข้อความกลับตามจริง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsErrorText, ttsUpdatePrices } from "@/lib/tiktok-shop";
import { planTiktokPrices, tiktokListingView, tiktokPriceBlock, tiktokPriceChangeText, tiktokPriceRowsFromView, type TiktokPriceRow, type TiktokWriteResponse } from "@/lib/tiktok-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadTtsListingLive, saveTtsSlimCopy, ttsGetProductRetry } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: TiktokWriteResponse & { changes?: unknown[] }, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** อ่านแถวราคาจาก body (กันค่าแปลก) */
function rowsOf(v: unknown): TiktokPriceRow[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const p = o.price == null || o.price === "" ? null : Number(o.price);
    return { skuId: String(o.skuId ?? "").trim(), label: String(o.label ?? ""), sellerSku: o.sellerSku == null ? null : String(o.sellerSku), price: p != null && Number.isFinite(p) ? p : null };
  }).filter((r) => r.skuId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: unknown; edit?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const before = rowsOf(body.before), edit = rowsOf(body.edit);
  if (!listingId || !before || !edit || !edit.length) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before + edit)" }, 400);

  const admin = supabaseAdmin();
  const live = await loadTtsListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก TikTok ก่อน" }, 400);
  const view = tiktokListingView(live.detail);
  if (!view) return reply({ ok: false, view: null, error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  const block = tiktokPriceBlock(view);
  if (block) return reply({ ok: false, view, error: block }, 400);

  // กันส่งทับ: ตัวที่จะแก้ ราคาบนร้านตอนนี้ต้องเท่ากับที่หน้าเว็บเห็น
  const liveRows = tiktokPriceRowsFromView(view);
  const shown = new Map(before.map((r) => [r.skuId, r.price]));
  const intended = planTiktokPrices(before, edit);
  const moved = intended.changes.filter((c) => {
    const lr = liveRows.find((r) => r.skuId === c.skuId);
    const was = shown.get(c.skuId) ?? null;
    return !lr || (lr.price == null) !== (was == null) || (lr.price != null && was != null && Math.abs(lr.price - was) >= 0.005);
  });
  if (moved.length) return reply({ ok: false, view, error: `ราคาบนร้าน TikTok เปลี่ยนไปแล้ว ${moved.length} ตัวเลือกหลังจากเปิดหน้านี้ — ระบบโหลดของล่าสุดให้แล้ว ตรวจแล้วแก้ใหม่อีกครั้ง` }, 409);

  const plan = planTiktokPrices(liveRows, edit.filter((e) => intended.changes.some((c) => c.skuId === e.skuId)));
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (!plan.changes.length) return reply({ ok: true, view, summary: "ราคาเท่าเดิม — ไม่มีอะไรต้องส่ง", error: null });

  const changes = plan.changes.map((c) => ({ label: `ราคา ${c.label}`, sku_id: c.skuId, before: c.before, after: c.after, text: tiktokPriceChangeText(c) }));
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_listing_prices", product_id: live.productId, title: view.title, changes, ...meta },
  });

  try { await ttsUpdatePrices(live.accessToken, live.cipher, live.productId, plan.changes.map((c) => ({ id: c.skuId, amount: c.after }))); }
  catch (e) {
    const error = ttsErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `แก้ราคาบน TikTok ไม่สำเร็จ: ${error}` }, 502);
  }

  // ดึงกลับเทียบราคาทุกตัวที่ส่ง
  const warnings: string[] = [];
  let fresh: Record<string, unknown> | null = null;
  try { fresh = await ttsGetProductRetry(live.accessToken, live.cipher, live.productId); } catch { /* เตือนด้านล่าง */ }
  const freshView = fresh ? tiktokListingView(fresh) : null;
  if (!freshView) warnings.push("TikTok ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก TikTok” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else {
    const notYet = plan.changes.filter((c) => { const s = freshView.skus.find((x) => x.skuId === c.skuId); return !s || s.price == null || Math.abs(s.price - c.after) >= 0.005; });
    if (notYet.length) warnings.push(`TikTok ตอบรับแล้ว แต่ยังเห็นราคาเดิม ${notYet.length} ตัวเลือก (อาจใช้เวลาสักครู่) — กดดึงตัวนี้อีกครั้งภายหลัง`);
  }
  if (fresh) {
    const err = await saveTtsSlimCopy(admin, live.row, fresh);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  const summary = `แก้ราคา ${plan.changes.length.toLocaleString()} ตัวเลือก`;
  await audit({ ok: true, summary, warnings, refreshed: !!freshView });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, changes, error: null });
}
