/**
 * 🚚 ขนส่งของศูนย์ออเดอร์ — /api/platform-orders/ship   (ขั้น 1 อนุมัติ 2026-11-10 · เฟส 1 SHIPPOP 2026-11-19)
 *   กติกา lib/order-shipping · ตัวเรียกผ่านชั้นกลาง lib/shipping/provider (ตอนนี้ = SHIPPOP) · จุดส่งของ shipping_profiles ต่อแบรนด์
 *   โหมด = orderCenterShippingForce(): ไม่มีกุญแจ = จำลอง · กุญแจทดลอง = ระบบทดลอง SHIPPOP (ไม่เสียเงิน) · กุญแจจริง = จำลองจนตั้ง SHIPPOP_ORDER_CENTER_LIVE=1
 *   กล่อง = ขนาดกล่องของรุ่นสินค้า (parcel_sizes) ใหญ่สุดในออเดอร์ → ไม่มี = ค่าตั้งต้นแบรนด์ · COD ส่งรายการสินค้าไปด้วย (คู่มือบังคับ)
 *   จองจริงบันทึกค่าส่งที่ศูนย์ค่าใช้จ่าย (lib/shipping/cost)
 *
 * GET  ?ids=a,b&size=A4                          (platform_orders.view)   → { mode, html | null, sims } ข้อมูลใบปะหน้า (size ตาม LABEL_SIZES)
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
import { SHIPPOP_STATUS_LABEL, labelSizeOf, normalizeCourier, type BookItem, type ShippopAddress, type ShippopProduct } from "@/lib/shippop";
import { shippingProvider } from "@/lib/shipping/provider";
import { logShippingCost } from "@/lib/shipping/cost";
import {
  boxOfItems, orderCenterShippingForce, orderCenterShippingMode, bookItemOf, canShipViaShippop, carrierOfShipping, isShippingActive, newShipping, nextSimStatus,
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

type Parcel = { grams: number; missing: number; box: string | null; boxName: string | null; boxMissing: number; multi: boolean; products: ShippopProduct[] };
/** พัสดุต่อออเดอร์: น้ำหนักรุ่น (parent_skus_v2.weight_g) × จำนวน · กล่องใหญ่สุดจากรุ่น (parcel_size_id) · รายการสินค้า (ส่งไปกับ COD) */
async function parcelsOf(admin: Admin, ids: string[], defaultPerPiece: number): Promise<Map<string, Parcel>> {
  const { data: items } = await admin.from("platform_order_items").select("order_id, sku_code, name, qty, price, matched_sku_id, matched_parent_sku_id").in("order_id", ids);
  const its = (items ?? []) as { order_id: string; sku_code: string | null; name: string | null; qty: number; price: number | null; matched_sku_id: string | null; matched_parent_sku_id: string | null }[];
  const skuIds = [...new Set(its.map((i) => i.matched_sku_id).filter((x): x is string => !!x))];
  const { data: skus } = skuIds.length ? await admin.from("skus_v2").select("id, parent_sku_id").in("id", skuIds) : { data: [] };
  const parentOfSku = new Map(((skus ?? []) as { id: string; parent_sku_id: string | null }[]).map((s) => [s.id, s.parent_sku_id]));
  const parentIds = [...new Set(its.map((i) => (i.matched_sku_id ? parentOfSku.get(i.matched_sku_id) : null) ?? i.matched_parent_sku_id).filter((x): x is string => !!x))];
  const { data: parents } = parentIds.length ? await admin.from("parent_skus_v2").select("id, weight_g, parcel_size_id").in("id", parentIds) : { data: [] };
  const pRows = (parents ?? []) as { id: string; weight_g: number | null; parcel_size_id: string | null }[];
  const w = new Map(pRows.map((p) => [p.id, Number(p.weight_g) || 0]));
  const boxIds = [...new Set(pRows.map((p) => p.parcel_size_id).filter((x): x is string => !!x))];
  const { data: sizes } = boxIds.length ? await admin.from("parcel_sizes").select("id, name, width_cm, length_cm, height_cm").in("id", boxIds) : { data: [] };
  const sizeById = new Map(((sizes ?? []) as { id: string; name: string | null; width_cm: number | null; length_cm: number | null; height_cm: number | null }[]).map((z) => [z.id, z]));
  const boxOfParent = new Map(pRows.map((p) => [p.id, p.parcel_size_id ? sizeById.get(p.parcel_size_id) ?? null : null]));
  const out = new Map<string, Parcel>();
  const def = Math.max(50, Math.round(Number(defaultPerPiece) || 500));
  for (const id of ids) {
    const rows = its.filter((i) => i.order_id === id).map((i) => {
      const pid = (i.matched_sku_id ? parentOfSku.get(i.matched_sku_id) : null) ?? i.matched_parent_sku_id;
      return { ...i, qty: Number(i.qty) || 0, weight_g: pid ? w.get(pid) ?? null : null, box: pid ? boxOfParent.get(pid) ?? null : null };
    });
    const wt = parcelWeight(rows, defaultPerPiece);
    const bx = boxOfItems(rows);
    const products: ShippopProduct[] = rows.filter((r) => r.qty > 0).map((r) => ({
      product_code: r.sku_code || "-", name: r.name || r.sku_code || "สินค้า", price: Number(r.price) || 0, amount: r.qty, weight: r.weight_g || def,
    }));
    out.set(id, { grams: wt.grams, missing: wt.missing, box: bx.box, boxName: bx.name, boxMissing: bx.missing, multi: bx.multi, products });
  }
  return out;
}

/** กล่องให้เลือกในป๊อปจอง (parcel_sizes) — เรียงตามจำนวนรุ่นที่ใช้กล่องนั้น (ใช้บ่อยก่อน) · dims รูปแบบเดียวกับ boxOfItems/parseBox */
async function boxOptions(admin: Admin): Promise<{ name: string; dims: string; used: number }[]> {
  const [{ data: sizes }, { data: used }] = await Promise.all([
    admin.from("parcel_sizes").select("id, name, width_cm, length_cm, height_cm"),
    admin.from("parent_skus_v2").select("parcel_size_id").not("parcel_size_id", "is", null).limit(5000),
  ]);
  const n = new Map<string, number>();
  for (const r of (used ?? []) as { parcel_size_id: string }[]) n.set(r.parcel_size_id, (n.get(r.parcel_size_id) ?? 0) + 1);
  return ((sizes ?? []) as { id: string; name: string | null; width_cm: number | null; length_cm: number | null; height_cm: number | null }[])
    .filter((z) => Number(z.width_cm) > 0 && Number(z.length_cm) > 0 && Number(z.height_cm) > 0)
    .map((z) => ({ name: z.name || "กล่อง", dims: `${Number(z.width_cm)}x${Number(z.length_cm)}x${Number(z.height_cm)}`, used: n.get(z.id) ?? 0 }))
    .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name));
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
  const size = labelSizeOf(request.nextUrl.searchParams.get("size"));
  const rows = (await loadRows(supabaseAdmin(), ids.filter((x) => !isDemoId(x)))).filter((o) => isShippingActive(o.shipping));
  const live = rows.filter((o) => o.shipping!.mode === "live").map((o) => o.shipping!.trackingCode);
  const sims = rows.filter((o) => o.shipping!.mode === "sim").map((o) => ({
    id: o.id, orderNo: noOf(o), name: o.ship_to?.name ?? "", tel: o.ship_to?.phone ?? "", address: shipToText(o.ship_to),
    courier: shippingProvider().courierLabel(o.shipping!.courierCode), tracking: trackingOfShipping(o.shipping!), cod: o.shipping!.codAmount,
  }));
  try {
    // ใบปะหน้าของการจองจริง/ทดลอง ขอจาก SHIPPOP เสมอ (จองแล้วต้องพิมพ์ได้แม้สวิตช์กลับเป็นจำลอง)
    const booked = rows.filter((o) => o.shipping!.mode === "live").map((o) => o.id);
    return NextResponse.json({ mode: orderCenterShippingMode(), size, html: await shippingProvider().labelHtml(live, undefined, size), sims, booked, error: null }, { headers: { "Cache-Control": "no-store" } });
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
      const quotes = await Promise.all(ok.map((o, i) => shippingProvider().quote(DEMO_FROM, o.ship_to ? { name: o.ship_to.name, address: o.ship_to.address, district: o.ship_to.subdistrict, state: o.ship_to.district, province: o.ship_to.province, postcode: o.ship_to.postal, tel: o.ship_to.phone } : DEMO_FROM, { name: "ตัวอย่าง", weight: orders[i].grams, width: 20, length: 30, height: 10 }, "sim")));
      const sum = new Map<string, { courierCode: string; courierName: string; price: number; available: boolean; estimate: string }>();
      for (const qs of quotes) for (const q of qs) { const cur = sum.get(q.courierCode); sum.set(q.courierCode, cur ? { ...cur, price: cur.price + q.price } : { ...q }); }
      return NextResponse.json({ mode: "sim", demo: true, quotes: [...sum.values()].sort((a, c) => a.price - c.price), orders, blocked, sender: { name: DEMO_FROM.name, province: DEMO_FROM.province }, boxes: await boxOptions(supabaseAdmin()).catch(() => []), error: null });
    }
    return NextResponse.json({ ok: true, demo: true, error: null });
  }

  const admin = supabaseAdmin();
  const prov = shippingProvider();
  const FORCE = orderCenterShippingForce();
  const MODE = orderCenterShippingMode();
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
    const weights = await parcelsOf(admin, ok.map((o) => o.id), profile!.default_weight_g);
    const boxIn = ok.length === 1 ? String(b?.box ?? "").trim() : "";
    const courier = normalizeCourier(String(b?.courier ?? profile!.default_courier ?? "FLE"));
    const items: BookItem[] = [];
    for (const o of ok) {
      const pc = weights.get(o.id);
      const g = ok.length === 1 && grams ? grams : pc?.grams ?? profile!.default_weight_g;
      const it = bookItemOf(o, sender.from, { courierCode: courier, grams: g, box: boxIn || pc?.box || profile!.default_box, products: pc?.products });
      if (it.ok) items.push(it.item); else blocked.push({ id: o.id, order_no: noOf(o), reason: it.error });
    }
    if (!items.length) return NextResponse.json({ error: blocked[0]?.reason ?? "ที่อยู่ผู้รับไม่ครบ", blocked }, { status: 400 });

    if (action === "quote") {
      try {
        const all = await Promise.all(items.map((it) => prov.quote(it.from, it.to, it.parcel, FORCE)));
        const sum = new Map<string, { courierCode: string; courierName: string; price: number; available: boolean; estimate: string }>();
        for (const qs of all) for (const q of qs) {
          const cur = sum.get(q.courierCode);
          sum.set(q.courierCode, cur ? { ...cur, price: cur.price + q.price, available: cur.available && q.available } : { ...q });
        }
        return NextResponse.json({
          mode: MODE, quotes: [...sum.values()].sort((a, c) => a.price - c.price), defaultCourier: profile!.default_courier ? normalizeCourier(profile!.default_courier) : null,
          orders: items.map((it) => {
            const pc = weights.get(it.key);
            return { id: it.key, order_no: it.ref, grams: it.parcel.weight, missing: pc?.missing ?? 0, cod: it.codAmount, box: `${it.parcel.width}x${it.parcel.length}x${it.parcel.height}`,
              boxName: boxIn ? null : pc?.boxName ?? null, boxFromProduct: !boxIn && !!pc?.box, boxMissing: pc?.boxMissing ?? 0, multi: pc?.multi ?? false };
          }),
          blocked, sender: { name: sender.from.name, province: sender.from.province }, boxes: await boxOptions(admin).catch(() => []), error: null,
        });
      } catch (e) { return NextResponse.json({ error: `ดูราคาไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 }); }
    }

    if (!prov.isKnownCourier(courier)) return NextResponse.json({ error: "เลือกขนส่งก่อน" }, { status: 400 });
    let booked: Awaited<ReturnType<typeof prov.book>>;
    try { booked = await prov.book(items, FORCE); }
    catch (e) {
      await logShippingCost({ mode: FORCE === "sim" ? "sim" : "live", sandbox: prov.env() !== "prod", courier, price: 0, ok: false, error: (e as Error).message, userId: actor.id });
      return NextResponse.json({ error: `จองไม่สำเร็จ: ${(e as Error).message}`, blocked }, { status: 502 });
    }
    const sandbox = booked.mode === "live" && prov.env() !== "prod";
    const now = new Date().toISOString();
    const failed = blocked.map((x) => ({ order_no: x.order_no, error: x.reason }));
    let done = 0;
    for (const r of booked.results) {
      const o = ok.find((x) => x.id === r.key)!;
      const item = items.find((x) => x.key === r.key)!;
      if (!r.ok || !r.trackingCode) { failed.push({ order_no: noOf(o), error: r.error ?? "จองไม่สำเร็จ" }); continue; }
      await logShippingCost({ mode: booked.mode, sandbox, courier, price: r.price ?? 0, ok: true, userId: actor.id });
      const sh = newShipping({ mode: booked.mode, sandbox, purchaseId: booked.purchaseId, trackingCode: r.trackingCode, courierCode: courier, courierTrackingCode: r.courierTrackingCode, price: r.price, codAmount: item.codAmount, at: now });
      const patch: Record<string, unknown> = { shipping: sh, tracking_no: trackingOfShipping(sh), carrier: prov.courierLabel(courier), updated_at: now };
      if (checkTransition(o, "packed").ok && o.status !== "packed") patch.status = "packed";
      const { error } = await admin.from("platform_orders").update(patch).eq("id", o.id);
      if (error) { failed.push({ order_no: noOf(o), error: "จองแล้วแต่บันทึกไม่สำเร็จ — แจ้งผู้ดูแล" }); continue; }
      await writeAudit(admin, { action: "ship_book", entityType: "platform_order", entityId: o.id, actorId: actor.id, actorName: actor.email, metadata: { order_no: noOf(o), mode: booked.mode, courier, tracking: sh.trackingCode, price: sh.price, cod: sh.codAmount, carrier: carrierOfShipping(sh), ...auditChangeMeta(o, { status: patch.status ?? o.status, tracking_no: patch.tracking_no }) } });
      done++;
    }
    return NextResponse.json({ ok: done > 0, done, failed, mode: booked.mode === "live" ? (sandbox ? "sandbox" : "prod") : "sim", error: null });
  }

  const o = rows[0];
  if (!o.shipping || !isShippingActive(o.shipping)) return NextResponse.json({ error: "ออเดอร์นี้ยังไม่ได้จองขนส่ง" }, { status: 404 });
  const now = new Date().toISOString();

  if (action === "cancel") {
    if (o.shipping.status !== "booking") return NextResponse.json({ error: "ขนส่งรับพัสดุไปแล้ว — ยกเลิกไม่ได้ (ติดต่อ SHIPPOP)" }, { status: 409 });
    try {
      if (!(await prov.cancel(trackingOfShipping(o.shipping), o.shipping.mode === "live" ? undefined : "sim"))) return NextResponse.json({ error: "SHIPPOP ไม่ยอมยกเลิก — ติดต่อ SHIPPOP" }, { status: 409 });
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
