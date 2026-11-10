/**
 * 🚚 ขนส่งของศูนย์ออเดอร์ — /api/platform-orders/ship   (ขั้น 1 · ล็อกโหมดจำลอง · เจ้าของอนุมัติ 2026-11-10)
 *   กติกา lib/order-shipping · ตัวเรียก SHIPPOP lib/shippop (ตัวเดียวกับเว็บร้าน) · จุดส่งของ shipping_profiles ต่อแบรนด์
 *   ⚠️ ORDER_CENTER_SHIPPING_FORCE = "sim" → ไม่เรียกขนส่งจริง ไม่เสียเงิน แม้มีกุญแจ SHIPPOP แล้ว (เปิดจริง = ขั้น 2)
 *
 * GET  ?ids=a,b                                   (platform_orders.view)   → { mode, html | null, sims } ข้อมูลใบปะหน้า
 * POST { action: "quote", ids[], grams?, box? }   (platform_orders.view)   → ราคารวมต่อขนส่ง + ออเดอร์ที่ส่งไม่ได้พร้อมเหตุผล
 * POST { action: "book", ids[], courier, grams?, box? } (platform_orders.manage) → จอง + ยืนยัน → เลขพัสดุ · สถานะออเดอร์ = แพ็กแล้ว
 * POST { action: "cancel", id }                   (platform_orders.manage) → ยกเลิกการจอง (ก่อนขนส่งเข้ารับ)
 * POST { action: "simulate", id }                 (platform_orders.manage) → จำลองสถานะถัดไป (จองจำลองเท่านั้น)
 * id ขึ้นต้น demo- = ออเดอร์ตัวอย่าง ตอบผลจำลองโดยไม่บันทึก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { SHIPPOP_COURIERS, SHIPPOP_STATUS_LABEL, courierLabel, shippopBookAndConfirm, shippopCancel, shippopLabelHtml, shippopQuote, type BookItem, type ShippopAddress } from "@/lib/shippop";
import {
  ORDER_CENTER_SHIPPING_FORCE as FORCE, bookItemOf, canShipViaShippop, carrierOfShipping, isShippingActive, newShipping, nextSimStatus,
  orderStatusFromShipping, parcelWeight, senderOfProfile, shipToText, trackingOfShipping, type OrderShipping, type ShipTo, type ShippingProfile,
} from "@/lib/order-shipping";
import { checkTransition } from "@/lib/platform-order-status";
import { demoOrders, isDemoId } from "@/lib/platform-order-demo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = {
  id: string; order_no: string | null; external_order_id: string | null; platform_id: string | null; platform_code: string | null; brand_id: string | null;
  status: string; source: string | null; ship_to: ShipTo | null; cod_amount: number | null; shipping: OrderShipping | null; tracking_no: string | null; carrier: string | null;
};
const MAX_QUOTE = 20, MAX_BOOK = 50;
const PROFILE_COLS = "brand_id, sender_name, sender_phone, sender_address, sender_subdistrict, sender_district, sender_province, sender_postal, default_box, default_weight_g, default_courier";
const noOf = (o: Pick<Row, "order_no" | "external_order_id" | "id">) => o.order_no || o.external_order_id || o.id;

async function loadRows(admin: Admin, ids: string[]): Promise<Row[]> {
  const [{ data }, { data: pf }] = await Promise.all([
    admin.from("platform_orders").select("id, order_no, external_order_id, platform_id, brand_id, status, source, ship_to, cod_amount, shipping, tracking_no, carrier").in("id", ids),
    admin.from("erp_platforms").select("id, code"),
  ]);
  const code = new Map(((pf ?? []) as { id: string; code: string }[]).map((p) => [p.id, p.code]));
  return ((data ?? []) as Omit<Row, "platform_code">[]).map((r) => ({ ...r, cod_amount: r.cod_amount == null ? 0 : Number(r.cod_amount), platform_code: r.platform_id ? code.get(r.platform_id) ?? null : null }));
}

/** น้ำหนักต่อออเดอร์: น้ำหนักรุ่น (parent_skus_v2.weight_g) ของแต่ละรายการ × จำนวน · ไม่มี = ค่าตั้งต้น */
async function weightsOf(admin: Admin, ids: string[], defaultPerPiece: number): Promise<Map<string, { grams: number; missing: number }>> {
  const { data: items } = await admin.from("platform_order_items").select("order_id, qty, matched_sku_id, matched_parent_sku_id").in("order_id", ids);
  const its = (items ?? []) as { order_id: string; qty: number; matched_sku_id: string | null; matched_parent_sku_id: string | null }[];
  const skuIds = [...new Set(its.map((i) => i.matched_sku_id).filter((x): x is string => !!x))];
  const { data: skus } = skuIds.length ? await admin.from("skus_v2").select("id, parent_sku_id").in("id", skuIds) : { data: [] };
  const parentOfSku = new Map(((skus ?? []) as { id: string; parent_sku_id: string | null }[]).map((s) => [s.id, s.parent_sku_id]));
  const parentIds = [...new Set(its.map((i) => (i.matched_sku_id ? parentOfSku.get(i.matched_sku_id) : null) ?? i.matched_parent_sku_id).filter((x): x is string => !!x))];
  const { data: parents } = parentIds.length ? await admin.from("parent_skus_v2").select("id, weight_g").in("id", parentIds) : { data: [] };
  const w = new Map(((parents ?? []) as { id: string; weight_g: number | null }[]).map((p) => [p.id, Number(p.weight_g) || 0]));
  const out = new Map<string, { grams: number; missing: number }>();
  for (const id of ids) {
    const list = its.filter((i) => i.order_id === id).map((i) => {
      const pid = (i.matched_sku_id ? parentOfSku.get(i.matched_sku_id) : null) ?? i.matched_parent_sku_id;
      return { qty: Number(i.qty) || 0, weight_g: pid ? w.get(pid) ?? null : null };
    });
    out.set(id, parcelWeight(list, defaultPerPiece));
  }
  return out;
}

async function profileOf(admin: Admin, brandId: string | null): Promise<ShippingProfile | null> {
  if (!brandId) return null;
  const { data } = await admin.from("shipping_profiles").select(PROFILE_COLS).eq("brand_id", brandId).maybeSingle();
  return (data as ShippingProfile | null) ?? null;
}

// ---- ออเดอร์ตัวอย่าง (โหมดทดลองของหน้า) — ใช้กติกาเดียวกับของจริง (ออเดอร์แบบ Shopee ส่งผ่าน SHIPPOP ไม่ได้) ----
const DEMO_FROM: ShippopAddress = { name: "ร้านตัวอย่าง", address: "1 ถ.ทดสอบ", district: "ในเมือง", state: "เมือง", province: "ขอนแก่น", postcode: "40000", tel: "0800000000" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  if (ids.every(isDemoId)) return NextResponse.json({ mode: "sim", html: null, sims: [], demo: true, error: null });
  const rows = (await loadRows(supabaseAdmin(), ids.filter((x) => !isDemoId(x)))).filter((o) => isShippingActive(o.shipping));
  const live = rows.filter((o) => o.shipping!.mode === "live").map((o) => o.shipping!.trackingCode);
  const sims = rows.filter((o) => o.shipping!.mode === "sim").map((o) => ({
    id: o.id, orderNo: noOf(o), name: o.ship_to?.name ?? "", tel: o.ship_to?.phone ?? "", address: shipToText(o.ship_to),
    courier: courierLabel(o.shipping!.courierCode), tracking: trackingOfShipping(o.shipping!), cod: o.shipping!.codAmount,
  }));
  try {
    return NextResponse.json({ mode: FORCE, html: await shippopLabelHtml(live, FORCE), sims, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `ดึงใบปะหน้าไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}

type Body = { action?: string; ids?: string[]; id?: string; courier?: string; grams?: number; box?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const b = (await request.json().catch(() => null)) as Body | null;
  const action = String(b?.action ?? "");
  const denied = await guardApi(request, action === "quote" ? "platform_orders.view" : "platform_orders.manage"); if (denied) return denied;
  const ids = [...new Set([...(Array.isArray(b?.ids) ? b!.ids : []), ...(b?.id ? [b.id] : [])].map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return NextResponse.json({ error: "เลือกออเดอร์ก่อน" }, { status: 400 });
  if (ids.some(isDemoId) && !ids.every(isDemoId)) return NextResponse.json({ error: "ปนออเดอร์ตัวอย่างกับของจริงไม่ได้" }, { status: 400 });
  const grams = Number(b?.grams) > 0 ? Math.round(Number(b?.grams)) : null;

  // ---------- โหมดทดลองของหน้า: ไม่แตะฐานข้อมูล ----------
  if (ids.every(isDemoId)) {
    const all = demoOrders();
    const list = ids.map((id) => all.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
    const blocked: { id: string; order_no: string; reason: string }[] = [];
    const ok = list.filter((o) => { const c = canShipViaShippop({ source: "manual", platform_code: o.platform_code, status: o.status }); if (!c.ok) blocked.push({ id: o.id, order_no: noOf(o), reason: c.reason }); return c.ok; });
    if (action === "quote" || action === "book") {
      if (!ok.length) return NextResponse.json({ error: blocked[0]?.reason ?? "ไม่มีออเดอร์ที่ส่งผ่าน SHIPPOP ได้", blocked, demo: true }, { status: 400 });
      if (action === "book") return NextResponse.json({ ok: true, demo: true, mode: "sim", done: ok.length, failed: blocked.map((x) => ({ order_no: x.order_no, error: x.reason })), error: null });
      const orders = ok.map((o) => ({ id: o.id, grams: ok.length === 1 && grams ? grams : 500 * o.items.reduce((a, i) => a + i.qty, 0), missing: 0, cod: o.cod_amount ?? 0 }));
      const quotes = await Promise.all(ok.map((o, i) => shippopQuote(DEMO_FROM, o.ship_to ? { name: o.ship_to.name, address: o.ship_to.address, district: o.ship_to.subdistrict, state: o.ship_to.district, province: o.ship_to.province, postcode: o.ship_to.postal, tel: o.ship_to.phone } : DEMO_FROM, { name: "ตัวอย่าง", weight: orders[i].grams, width: 20, length: 30, height: 10 }, "sim")));
      const sum = new Map<string, { courierCode: string; courierName: string; price: number; available: boolean; estimate: string }>();
      for (const qs of quotes) for (const q of qs) { const cur = sum.get(q.courierCode); sum.set(q.courierCode, cur ? { ...cur, price: cur.price + q.price } : { ...q }); }
      return NextResponse.json({ mode: "sim", demo: true, quotes: [...sum.values()].sort((a, c) => a.price - c.price), orders, blocked, sender: { name: DEMO_FROM.name, province: DEMO_FROM.province }, error: null });
    }
    return NextResponse.json({ ok: true, demo: true, error: null });
  }

  const admin = supabaseAdmin();
  const rows = await loadRows(admin, ids);
  if (!rows.length) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = { id: user?.id ?? null, email: user?.email ?? null };

  if (action === "quote" || action === "book") {
    const list = rows.slice(0, action === "quote" ? MAX_QUOTE : MAX_BOOK);
    const blocked: { id: string; order_no: string; reason: string }[] = [];
    const ok = list.filter((o) => { const c = canShipViaShippop(o); if (!c.ok) blocked.push({ id: o.id, order_no: noOf(o), reason: c.reason }); return c.ok; });
    if (!ok.length) return NextResponse.json({ error: blocked[0]?.reason ?? "ไม่มีออเดอร์ที่ส่งผ่าน SHIPPOP ได้", blocked }, { status: 400 });
    const brand = ok[0].brand_id;
    if (ok.some((o) => o.brand_id !== brand)) return NextResponse.json({ error: "เลือกออเดอร์ของแบรนด์เดียวกัน (จุดส่งของคนละที่)" , blocked }, { status: 400 });
    const profile = await profileOf(admin, brand);
    const sender = senderOfProfile(profile);
    if (!sender.ok) return NextResponse.json({ error: sender.error, blocked }, { status: 409 });
    const weights = await weightsOf(admin, ok.map((o) => o.id), profile!.default_weight_g);
    const box = String(b?.box ?? "").trim() || profile!.default_box;
    const courier = String(b?.courier ?? profile!.default_courier ?? "FLE");
    const items: BookItem[] = [];
    for (const o of ok) {
      const g = ok.length === 1 && grams ? grams : weights.get(o.id)?.grams ?? profile!.default_weight_g;
      const it = bookItemOf(o, sender.from, { courierCode: courier, grams: g, box });
      if (it.ok) items.push(it.item); else blocked.push({ id: o.id, order_no: noOf(o), reason: it.error });
    }
    if (!items.length) return NextResponse.json({ error: blocked[0]?.reason ?? "ที่อยู่ผู้รับไม่ครบ", blocked }, { status: 400 });

    if (action === "quote") {
      try {
        const all = await Promise.all(items.map((it) => shippopQuote(it.from, it.to, it.parcel, FORCE)));
        const sum = new Map<string, { courierCode: string; courierName: string; price: number; available: boolean; estimate: string }>();
        for (const qs of all) for (const q of qs) {
          const cur = sum.get(q.courierCode);
          sum.set(q.courierCode, cur ? { ...cur, price: cur.price + q.price, available: cur.available && q.available } : { ...q });
        }
        return NextResponse.json({
          mode: FORCE, quotes: [...sum.values()].sort((a, c) => a.price - c.price),
          orders: items.map((it) => ({ id: it.key, grams: it.parcel.weight, missing: weights.get(it.key)?.missing ?? 0, cod: it.codAmount })),
          blocked, sender: { name: sender.from.name, province: sender.from.province }, error: null,
        });
      } catch (e) { return NextResponse.json({ error: `ดูราคาไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 }); }
    }

    if (!SHIPPOP_COURIERS.some((c) => c.code === courier)) return NextResponse.json({ error: "เลือกขนส่งก่อน" }, { status: 400 });
    let booked: Awaited<ReturnType<typeof shippopBookAndConfirm>>;
    try { booked = await shippopBookAndConfirm(items, FORCE); }
    catch (e) { return NextResponse.json({ error: `จองไม่สำเร็จ: ${(e as Error).message}`, blocked }, { status: 502 }); }
    const now = new Date().toISOString();
    const failed = blocked.map((x) => ({ order_no: x.order_no, error: x.reason }));
    let done = 0;
    for (const r of booked.results) {
      const o = ok.find((x) => x.id === r.key)!;
      const item = items.find((x) => x.key === r.key)!;
      if (!r.ok || !r.trackingCode) { failed.push({ order_no: noOf(o), error: r.error ?? "จองไม่สำเร็จ" }); continue; }
      const sh = newShipping({ mode: booked.mode, purchaseId: booked.purchaseId, trackingCode: r.trackingCode, courierCode: courier, courierTrackingCode: r.courierTrackingCode, price: r.price, codAmount: item.codAmount, at: now });
      const patch: Record<string, unknown> = { shipping: sh, tracking_no: trackingOfShipping(sh), carrier: courierLabel(courier), updated_at: now };
      if (checkTransition(o, "packed").ok && o.status !== "packed") patch.status = "packed";
      const { error } = await admin.from("platform_orders").update(patch).eq("id", o.id);
      if (error) { failed.push({ order_no: noOf(o), error: "จองแล้วแต่บันทึกไม่สำเร็จ — แจ้งผู้ดูแล" }); continue; }
      await writeAudit(admin, { action: "ship_book", entityType: "platform_order", entityId: o.id, actorId: actor.id, actorName: actor.email, metadata: { order_no: noOf(o), mode: booked.mode, courier, tracking: sh.trackingCode, price: sh.price, cod: sh.codAmount, carrier: carrierOfShipping(sh), ...auditChangeMeta(o, { status: patch.status ?? o.status, tracking_no: patch.tracking_no }) } });
      done++;
    }
    return NextResponse.json({ ok: done > 0, done, failed, mode: booked.mode, error: null });
  }

  const o = rows[0];
  if (!o.shipping || !isShippingActive(o.shipping)) return NextResponse.json({ error: "ออเดอร์นี้ยังไม่ได้จองขนส่ง" }, { status: 404 });
  const now = new Date().toISOString();

  if (action === "cancel") {
    if (o.shipping.status !== "booking") return NextResponse.json({ error: "ขนส่งรับพัสดุไปแล้ว — ยกเลิกไม่ได้ (ติดต่อ SHIPPOP)" }, { status: 409 });
    try {
      if (!(await shippopCancel(trackingOfShipping(o.shipping), o.shipping.mode === "live" ? undefined : "sim"))) return NextResponse.json({ error: "SHIPPOP ไม่ยอมยกเลิก — ติดต่อ SHIPPOP" }, { status: 409 });
    } catch (e) { return NextResponse.json({ error: `ยกเลิกไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 }); }
    const sh: OrderShipping = { ...o.shipping, status: "cancel", history: [...o.shipping.history, { status: "cancel", at: now }] };
    const clear = o.tracking_no === trackingOfShipping(o.shipping);
    await admin.from("platform_orders").update({ shipping: sh, ...(clear ? { tracking_no: null, carrier: null } : {}), updated_at: now }).eq("id", o.id);
    await writeAudit(admin, { action: "ship_cancel", entityType: "platform_order", entityId: o.id, actorId: actor.id, actorName: actor.email, metadata: { order_no: noOf(o), tracking: o.shipping.trackingCode } });
    return NextResponse.json({ ok: true, error: null });
  }

  if (action === "simulate") {
    if (o.shipping.mode !== "sim") return NextResponse.json({ error: "จำลองได้เฉพาะการจองในโหมดจำลอง" }, { status: 409 });
    const next = nextSimStatus(o.shipping.status);
    if (!next || !SHIPPOP_STATUS_LABEL[next]) return NextResponse.json({ error: "ถึงสถานะสุดท้ายแล้ว" }, { status: 409 });
    const sh: OrderShipping = { ...o.shipping, status: next, history: [...o.shipping.history, { status: next, at: now, note: "จำลอง" }] };
    const patch: Record<string, unknown> = { shipping: sh, updated_at: now };
    const to = orderStatusFromShipping(next);
    if (to && to !== o.status && checkTransition(o, to).ok) patch.status = to;
    await admin.from("platform_orders").update(patch).eq("id", o.id);
    await writeAudit(admin, { action: "ship_status", entityType: "platform_order", entityId: o.id, actorId: actor.id, actorName: actor.email ?? "SHIPPOP (จำลอง)", metadata: { order_no: noOf(o), shipping_status: next, simulated: true, ...auditChangeMeta(o, { status: patch.status ?? o.status }) } });
    return NextResponse.json({ ok: true, shipping_status: next, order_status: patch.status ?? o.status, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
