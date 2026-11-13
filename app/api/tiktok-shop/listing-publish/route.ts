/**
 * เผยแพร่ฉบับร่างบน TikTok — ปุ่ม "เผยแพร่" ในลิ้นชักสินค้าบนร้าน (เจ้าของเลือก 2026-11-13 "ตามแนะนำเลย")
 *  POST { listing_id, stock: [{ sku_id, qty }] }   (products.platforms.publish · หน้าเว็บถามก่อนเสมอ)
 *
 *   1) ดึงสดจาก TikTok → ต้องเป็นฉบับร่าง (DRAFT) · ช่องบังคับของหมวดครบ (ttsCategoryMeta) · ชื่อ/รูป/ราคาครบ · สต๊อกทุกตัวเลือก 1–99,999 (planTiktokPublish)
 *   2) ตั้งสต๊อกจริง (Update Inventory · คลังเดิมของร่าง) — ใส่ครั้งเดียวตอนเปิดตัว ไม่ใช่ซิงค์
 *   3) Partial Edit save_mode=LISTING (ส่งชื่อเดิม) → TikTok ส่งตรวจ (สถานะ PENDING · ผ่านแล้วขายได้)
 *   4) ดึงกลับ → สำเนาย่อ → ประวัติ (audit tiktok_listing_publish) ทั้งสำเร็จ/ไม่สำเร็จ + สถานะทีละขั้น
 *  → TiktokWriteResponse & { steps }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsErrorText, ttsPartialEdit, ttsShopWarehouseId, ttsUpdateInventory } from "@/lib/tiktok-shop";
import { planTiktokPublish, type TiktokWriteResponse } from "@/lib/tiktok-listing-edit";
import type { CreateStep } from "@/lib/platform-create-registry";
import { loadTtsListingLive, saveTtsSlimCopy, ttsCategoryMeta, ttsGetProductRetry, ttsViewWithReview } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Resp = TiktokWriteResponse & { steps?: CreateStep[] };
const reply = (body: Resp, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** คลังของแต่ละ SKU ในร่าง (Get Product skus[].inventory[].warehouse_id) */
function warehouseOf(detail: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of (Array.isArray(detail.skus) ? detail.skus as Record<string, unknown>[] : [])) {
    const inv = Array.isArray(s.inventory) ? s.inventory as Record<string, unknown>[] : [];
    const wh = inv.map((x) => String(x.warehouse_id ?? "").trim()).find(Boolean);
    if (wh && s.id) out.set(String(s.id), wh);
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; stock?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const stock: Record<string, number | null> = {};
  for (const x of Array.isArray(body.stock) ? body.stock as Record<string, unknown>[] : []) {
    const id = String(x?.sku_id ?? "").trim(); const q = Number(x?.qty);
    if (id) stock[id] = Number.isFinite(q) ? q : null;
  }
  if (!listingId) return reply({ ok: false, view: null, error: "ต้องระบุ listing_id" }, 400);

  const steps: CreateStep[] = [];
  const admin = supabaseAdmin();
  const live = await loadTtsListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return reply({ ok: false, view: null, error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);

  // ช่องบังคับของหมวด (ตามค่าที่อยู่บนร้านตอนนี้)
  const meta = view.categoryId ? await ttsCategoryMeta(live.accessToken, live.cipher, view.categoryId) : null;
  const requiredMissing = meta?.fields ? meta.fields.filter((f) => f.required && !(view.attrs[f.id] ?? []).length).map((f) => f.name) : null;
  const plan = planTiktokPublish(view, { stock, requiredMissing });
  if (plan.errors.length) {
    steps.push({ key: "check", label: "ตรวจข้อมูล", state: "fail", detail: plan.errors.join(" · ") });
    return reply({ ok: false, view, error: plan.errors.join(" · "), steps }, 400);
  }
  steps.push({ key: "check", label: "ตรวจข้อมูล", state: "ok", detail: `${plan.rows.length} ตัวเลือก` });

  const changes = plan.rows.map((r) => ({ label: `สต๊อก ${r.label}`, before: "1 (ร่าง)", after: String(r.qty) }));
  const audit = (meta2: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_listing_publish", product_id: live.productId, title: view.title, changes, steps, ...meta2 },
  });

  // 1) สต๊อกจริง (คลังเดิมของร่าง · ไม่มี = คลังของร้าน)
  try {
    const whOf = warehouseOf(live.detail);
    const fallback = whOf.size < plan.rows.length ? await ttsShopWarehouseId(live.accessToken, live.cipher) : null;
    const skus = plan.rows.map((r) => ({ id: r.skuId, warehouseId: whOf.get(r.skuId) ?? fallback ?? "", quantity: r.qty }));
    if (skus.some((s) => !s.warehouseId)) throw new Error("ไม่รู้คลังสินค้าของร้าน TikTok");
    await ttsUpdateInventory(live.accessToken, live.cipher, live.productId, skus);
    steps.push({ key: "stock", label: "ตั้งสต๊อก", state: "ok", detail: plan.rows.map((r) => `${r.label} ${r.qty}`).join(" · ") });
  } catch (e) {
    const error = `ตั้งสต๊อกบน TikTok ไม่สำเร็จ: ${ttsErrorText(e)} — ยังไม่ได้เผยแพร่`;
    steps.push({ key: "stock", label: "ตั้งสต๊อก", state: "fail", detail: ttsErrorText(e) });
    await audit({ ok: false, error });
    return reply({ ok: false, view, error, steps }, 502);
  }

  // 2) ส่งตรวจ (save_mode=LISTING · ส่งชื่อเดิม)
  try {
    await ttsPartialEdit(live.accessToken, live.cipher, live.productId, { title: view.title }, { saveMode: "LISTING" });
    steps.push({ key: "publish", label: "ส่งให้ TikTok ตรวจ", state: "ok" });
  } catch (e) {
    const error = `ส่งเผยแพร่ไม่สำเร็จ: ${ttsErrorText(e)} (ตั้งสต๊อกในร่างแล้ว)`;
    steps.push({ key: "publish", label: "ส่งให้ TikTok ตรวจ", state: "fail", detail: ttsErrorText(e) });
    await audit({ ok: false, error });
    return reply({ ok: false, view, error, steps }, 502);
  }

  // 3) ดึงกลับ + สำเนาย่อ
  const warnings: string[] = [];
  let freshDetail: Record<string, unknown> | null = null;
  try { freshDetail = await ttsGetProductRetry(live.accessToken, live.cipher, live.productId); } catch { /* เตือนด้านล่าง */ }
  const freshView = freshDetail ? await ttsViewWithReview(live.accessToken, live.cipher, freshDetail) : null;
  const status = freshView ? (freshView.status ?? freshView.productStatus) : null;
  if (!freshView) warnings.push("TikTok ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กดดึงตัวนี้อีกครั้งภายหลัง");
  else if (status === "DRAFT") warnings.push("TikTok ตอบรับแล้ว แต่ยังเห็นเป็นฉบับร่าง — กดดึงตัวนี้อีกครั้งในอีกสักครู่");
  if (freshDetail) {
    const err = await saveTtsSlimCopy(admin, live.row, freshDetail);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  const summary = status === "ACTIVATE" ? "เผยแพร่แล้ว — ขึ้นขายแล้ว" : "ส่งเผยแพร่แล้ว — รอ TikTok ตรวจ (ผ่านแล้วขายได้ทันที)";
  await audit({ ok: true, summary, status_after: status, warnings });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, steps, error: null });
}
