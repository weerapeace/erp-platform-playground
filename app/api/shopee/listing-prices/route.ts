/**
 * แก้ราคาตั้ง (original_price) ต่อตัวเลือก สินค้าบน Shopee — ลิ้นชักสินค้าบนร้าน · เฟส 4B (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, before: [{ model_id, price }], prices: [{ model_id, label, price }] }   (products.platforms.publish)
 *
 *   ก่อนส่ง: ดึงสด → ราคาบนร้านไม่ตรงกับตอนเปิดลิ้นชัก (before) = 409 (มีคนแก้ใน Seller Centre → ไม่ทับ)
 *   → planShopeePrices (จำนวนเต็มบาท · ช่วงราคาร้าน · เปลี่ยน ≥80% บล็อก · ในโปรโมชันเตือน) → v2.product.update_price ชุดละ 50
 *   หลังส่ง: ผลรายตัว (failure_list = เหตุผลจาก Shopee เช่น อยู่ในโปรโมชัน) → ดึงกลับจนเห็นราคาใหม่ (~9 วิ · ไม่ทัน = แสดงตามที่ส่งสำเร็จ)
 *   ตัวที่ Shopee ไม่บอกผลรายตัว = "ยังไม่ยืนยัน" → ตัดสินจากราคาจริงที่ดึงกลับ (เห็นราคาใหม่ = ผ่าน · ไม่เห็น = เตือนให้กดดึงตัวนี้ภายหลัง ไม่นับว่าล้ม)
 *   ✅ ลองจริง 2026-11-14 BCG01-03 (ไม่มีตัวเลือก): ส่ง model_id 0 แต่คำตอบไม่มี 0 → รอบแรกขึ้นว่าไม่สำเร็จ ทั้งที่ Shopee รับคำสั่ง · คำตอบดิบเก็บใน audit shopee_responses แล้ว
 *   → สำเนาย่อ → ประวัติ (audit shopee_listing_prices · ค่าเดิม→ใหม่รายตัวเลือก + ตัวที่ไม่ผ่าน)
 *  → ShopeeWriteResponse
 * ⚠️ ไม่แตะสต๊อก (BigSeller ยังซิงค์) · ราคาที่ลูกค้าจ่ายจากโปรโมชัน (current_price) แก้ตรงนี้ไม่ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { shopeeErrorText, shopeeUpdatePrice } from "@/lib/shopee";
import {
  planShopeePrices, shopeeListingView, shopeePriceBatches, shopeePriceChangeText, shopeePriceResult, shopeePriceRowsFromView,
  type ShopeePriceRow, type ShopeeWriteResponse,
} from "@/lib/shopee-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadShopeeListingLive, refetchShopeeLive, saveShopeeSlimCopy, shopeeWriteEcho, type ShopeeLive } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: ShopeeWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const numOrNull = (v: unknown) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** ราคาตั้งต่อตัวเลือกจากข้อมูลที่ดึงมา (model 0 = สินค้าไม่มีตัวเลือก) */
function originalOf(live: ShopeeLive): Map<string, number | null> {
  const v = shopeeListingView(live.base, live.models);
  return new Map((v ? shopeePriceRowsFromView(v) : []).map((r) => [r.modelId, r.price]));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: { model_id?: string; price?: unknown }[]; prices?: { model_id?: string; label?: string; price?: unknown }[] };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId || !Array.isArray(body.prices) || !body.prices.length || !Array.isArray(body.before)) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before + prices)" }, 400);

  const admin = supabaseAdmin();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return reply({ ok: false, view: null, error: r.error }, r.status);
  if (isGoneStatus(r.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย “ไม่อยู่บนร้านแล้ว” — กดดึงตัวนี้จาก Shopee ก่อน" }, 400);
  const view = r.view;
  // มีคนแก้ราคาบนร้านระหว่างที่เปิดลิ้นชัก → ไม่ทับ
  const liveRows = new Map(shopeePriceRowsFromView(view).map((x) => [x.modelId, x]));
  const moved = body.before.some((b) => { const lv = liveRows.get(String(b.model_id ?? "")); return !!lv && lv.price !== numOrNull(b.price); });
  if (moved) return reply({ ok: false, view, error: "ราคาบนร้าน Shopee เปลี่ยนไปหลังจากเปิดหน้านี้ (อาจมีคนแก้ใน Seller Centre) — ระบบโหลดราคาล่าสุดให้แล้ว ตรวจแล้วแก้ใหม่อีกครั้ง" }, 409);

  const edit: ShopeePriceRow[] = body.prices.map((p) => {
    const id = String(p.model_id ?? "");
    return { modelId: id, label: liveRows.get(id)?.label ?? String(p.label ?? id), price: numOrNull(p.price), promo: liveRows.get(id)?.promo ?? false };
  });
  const plan = planShopeePrices(view, edit);
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (!plan.changes.length) return reply({ ok: true, view, summary: "ราคาไม่มีอะไรเปลี่ยน", error: null });

  const labelOf = new Map(plan.changes.map((c) => [c.modelId, c.label]));
  // ประวัติแบบกลาง "จากอะไรเป็นอะไร" ต่อตัวเลือก (+ label ให้ลิ้นชักอ่าน)
  const changes = plan.changes.map((c) => ({ field: `price:${c.modelId}`, label: c.label, old: c.before, new: c.after, text: shopeePriceChangeText(c) }));
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: r.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "shopee_listing_prices", item_id: r.itemId, shop_id: r.shopId, name: view.name, changes, ...meta },
  });

  // ส่งทีละชุด (≤50) · ชุดที่ล้มทั้งชุด = นับทุกตัวในชุดเป็นไม่ผ่าน (ชุดอื่นยังส่ง)
  const okIds: string[] = [];
  const unsureIds: string[] = []; // Shopee ตอบรับแต่ไม่บอกรายตัว → ดึงราคาจริงกลับมาตัดสิน
  const failed: { modelId: string; reason: string }[] = [];
  const echoes: ReturnType<typeof shopeeWriteEcho>[] = [];
  for (const batch of shopeePriceBatches(r.itemId, plan.changes)) {
    const ids = batch.price_list.map((p) => String(p.model_id));
    try {
      const resp = await shopeeUpdatePrice(r.accessToken, r.shopId, batch);
      echoes.push(shopeeWriteEcho(resp));
      const res = shopeePriceResult(resp, ids);
      okIds.push(...res.ok); failed.push(...res.failed); unsureIds.push(...res.unsure);
    } catch (e) {
      const reason = shopeeErrorText(e);
      failed.push(...ids.map((id) => ({ modelId: id, reason })));
    }
  }
  const failText = () => failed.map((f) => `${labelOf.get(f.modelId) ?? f.modelId}: ${f.reason}`);
  const shown = echoes.map((e) => e.show).filter((s): s is string => !!s);
  // คำตอบดิบของ Shopee ทุกชุด (ตัดยาว) — ไว้ดูย้อนหลังว่า Shopee ตอบอะไร
  const shopeeResp = { shopee_warning: echoes[0]?.warning ?? null, shopee_responses: echoes.map((e) => e.response) };
  if (!okIds.length && !unsureIds.length) {
    await audit({ ok: false, sent: 0, failed, error: failText().join(" · "), ...shopeeResp });
    return reply({ ok: false, view, error: `แก้ราคาบน Shopee ไม่สำเร็จ: ${failText().join(" · ")}` }, 502);
  }

  // ดึงกลับจนเห็นราคาใหม่ (~9 วิ) — ทั้งตัวที่ Shopee ยืนยัน และตัวที่ยังไม่ยืนยัน (เห็นราคาใหม่ = ผ่านจริง)
  const afterOf = new Map(plan.changes.map((c) => [c.modelId, c.after]));
  const want = new Map([...okIds, ...unsureIds].map((id) => [id, afterOf.get(id)!]));
  const landed = (l: ShopeeLive) => { const m = originalOf(l); return [...want].every(([id, p]) => m.get(id) === p); };
  const fresh = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId, landed);
  const nowPrice = fresh ? originalOf(fresh) : null;
  const readbackOk = unsureIds.filter((id) => nowPrice?.get(id) === afterOf.get(id));
  okIds.push(...readbackOk);
  const stillUnsure = unsureIds.filter((id) => !readbackOk.includes(id));
  // แสดงตามที่ส่ง (optimistic) เฉพาะตัวที่ Shopee ยืนยันแล้วแต่ข้อมูลยังไม่อัปเดต · ตัวที่ยังไม่ยืนยัน = แสดงราคาจริงบนร้าน
  const wantOk = new Map(okIds.map((id) => [id, afterOf.get(id)!]));
  const isLanded = !!fresh && [...wantOk].every(([id, p]) => nowPrice?.get(id) === p);
  let shownLive: ShopeeLive | null = fresh;
  if (fresh && !isLanded) {
    shownLive = fresh.models
      ? { ...fresh, models: { ...fresh.models, models: fresh.models.models.map((m) => (wantOk.has(m.model_id) ? { ...m, original_price: wantOk.get(m.model_id)! } : m)) } }
      : { ...fresh, base: { ...fresh.base, price_info: [{ ...((Array.isArray(fresh.base.price_info) ? fresh.base.price_info[0] : null) as Record<string, unknown> ?? {}), original_price: wantOk.get("0") }] } };
  }
  const freshView = shownLive ? shopeeListingView(shownLive.base, shownLive.models, view.limits) : null;
  const warnings: string[] = [...shown.map((s) => `Shopee แจ้ง: ${s}`)];
  if (failed.length) warnings.push(`ไม่ผ่าน ${failed.length} ตัวเลือก — ${failText().join(" · ")}`);
  if (stillUnsure.length) warnings.push(`Shopee รับคำสั่งแต่ยังไม่ยืนยัน ${stillUnsure.length} ตัวเลือก (${stillUnsure.map((id) => labelOf.get(id) ?? id).join(", ")}) และราคาบนร้านยังไม่เปลี่ยนตอนเช็ก — ข้อมูล Shopee อัปเดตช้าได้ กด “ดึงตัวนี้จาก Shopee” ในอีกสักครู่เพื่อดูราคาจริง`);
  if (!fresh) warnings.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else if (!isLanded) warnings.push("Shopee รับราคาใหม่แล้ว — ข้อมูลบนร้านมักอัปเดตช้า (ไม่กี่วินาที–ไม่กี่นาที) ระบบแสดงตามที่ส่งไว้ก่อน · กด “ดึงตัวนี้จาก Shopee” ภายหลังเพื่อยืนยัน");
  if (shownLive) { const err = await saveShopeeSlimCopy(admin, r.row, shownLive); if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
  const summary = okIds.length
    ? `แก้ราคาบน Shopee แล้ว ${okIds.length} ตัวเลือก${stillUnsure.length ? ` · รอยืนยัน ${stillUnsure.length}` : ""}${failed.length ? ` (ไม่ผ่าน ${failed.length})` : ""}`
    : `ส่งราคาขึ้น Shopee แล้ว — รอ Shopee ยืนยัน ${stillUnsure.length} ตัวเลือก${failed.length ? ` (ไม่ผ่าน ${failed.length})` : ""}`;
  await audit({
    ok: failed.length === 0, partial: failed.length > 0, sent: okIds.length, failed, unsure: stillUnsure, confirmed_by_readback: readbackOk,
    summary, warnings, refreshed: !!fresh, optimistic: !!fresh && !isLanded, error: failed.length ? failText().join(" · ") : null, ...shopeeResp,
  });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, error: null });
}
