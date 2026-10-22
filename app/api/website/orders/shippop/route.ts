/**
 * 🚚 Shippop ของออเดอร์เว็บ — /api/website/orders/shippop  (กฎ/ตัวเรียก lib/shippop · DB lib/shippop-db)
 * POST { action: "quote", orderId, weight?, box? }                  → { mode, quotes } ราคาทุกขนส่ง (products.view)
 * POST { action: "book", orderIds[], courierCode, weight?, box? }   → จอง + ยืนยัน → เติม tracking_no/tracking_carrier + store_orders.shippop + audit (products.edit)
 * POST { action: "cancel", orderId }                                → ยกเลิกกับขนส่ง (ก่อนเข้ารับ) + ล้างเลขพัสดุ + audit
 * POST { action: "simulate", orderId, status }                      → (โหมดจำลองเท่านั้น) ทำเหมือน webhook — ไว้ลองลำดับสถานะ
 * GET  ?ids=a,b → { mode, html | null, sims } ใบปะหน้าของ Shippop (จองจำลอง = sims → หน้าพิมพ์ทำใบปะหน้าของเราเอง)
 * ยังไม่ตั้ง SHIPPOP_API_KEY = โหมดจำลอง (ไม่เรียก Shippop จริง ไม่เสียเงิน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { readSiteInfo } from "@/lib/website-site-info";
import { SHIPPOP_COURIERS, SHIPPOP_STATUS_LABEL, carrierOf, shippopBookAndConfirm, shippopCancel, shippopLabelHtml, shippopMode, shippopQuote, type ShippopInfo } from "@/lib/shippop";
import { SHIPPOP_ORDER_SELECT, applyShippopStatus, bookItemOf, senderOf, type ShippopOrderRow } from "@/lib/shippop-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
type Admin = ReturnType<typeof supabaseAdmin>;

async function loadOrders(sb: Admin, ids: string[]): Promise<ShippopOrderRow[]> {
  const { data } = await sb.from("store_orders").select(SHIPPOP_ORDER_SELECT).in("id", ids);
  return (data ?? []) as unknown as ShippopOrderRow[];
}
async function qtyOf(sb: Admin, ids: string[]): Promise<Map<string, number>> {
  const { data } = await sb.from("store_order_items").select("order_id, qty").in("order_id", ids);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { order_id: string; qty: number }[]) m.set(r.order_id, (m.get(r.order_id) ?? 0) + (Number(r.qty) || 0));
  return m;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 100);
  if (!ids.length) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  const orders = await loadOrders(supabaseAdmin(), ids);
  // ใบปะหน้าจาก Shippop เฉพาะที่จองจริง (จำลอง = ใช้ใบปะหน้าของเราเอง)
  const codes = orders.filter((o) => o.shippop?.mode === "live" && o.shippop.status !== "cancel").map((o) => o.shippop!.trackingCode);
  // โหมดจำลอง/จองจำลอง: ส่งข้อมูลให้หน้าพิมพ์ทำใบปะหน้าของเราเอง (มีลายน้ำ "จำลอง")
  const sims = orders.filter((o) => o.shippop && o.shippop.mode === "sim" && o.shippop.status !== "cancel").map((o) => ({ orderNo: o.order_no, name: o.customer_name, tel: o.customer_phone, address: [o.ship_address_line, o.ship_subdistrict, o.ship_district, o.ship_province, o.ship_postal].filter(Boolean).join(" "), courier: o.shippop!.courierCode, tracking: o.shippop!.courierTrackingCode || o.shippop!.trackingCode, cod: o.shippop!.codAmount }));
  try {
    return NextResponse.json({ mode: shippopMode(), html: await shippopLabelHtml(codes), sims }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `ดึงใบปะหน้าไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { action?: string; orderId?: string; orderIds?: string[]; courierCode?: string; weight?: number; box?: string; status?: string } | null;
  const action = String(body?.action ?? "");
  const denied = await guardApi(request, action === "quote" ? "products.view" : "products.edit");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const mode = shippopMode();

  if (action === "quote") {
    const [o] = UUID.test(String(body?.orderId)) ? await loadOrders(sb, [String(body!.orderId)]) : [];
    if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    const info = await readSiteInfo(sb, o.shop_id);
    const s = senderOf(info);
    if (!s.ok) return NextResponse.json({ error: s.error }, { status: 409 });
    const qty = (await qtyOf(sb, [o.id])).get(o.id) ?? 1;
    const it = bookItemOf(o, s.from, info, { courierCode: info.shippop_courier, qty, weight: body?.weight, box: body?.box });
    if (!it.ok) return NextResponse.json({ error: it.error }, { status: 400 });
    try {
      return NextResponse.json({ mode, quotes: await shippopQuote(it.item.from, it.item.to, it.item.parcel), weight: it.item.parcel.weight });
    } catch (e) {
      return NextResponse.json({ error: `ดูราคาไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
    }
  }

  if (action === "book") {
    const ids = (Array.isArray(body?.orderIds) ? body!.orderIds : []).filter((x) => UUID.test(String(x))).slice(0, 50);
    const courier = String(body?.courierCode ?? "");
    if (!ids.length) return NextResponse.json({ error: "เลือกออเดอร์ก่อน" }, { status: 400 });
    if (!SHIPPOP_COURIERS.some((c) => c.code === courier)) return NextResponse.json({ error: "เลือกขนส่งก่อน" }, { status: 400 });
    const orders = await loadOrders(sb, ids);
    if (!orders.length) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    const shopId = orders[0].shop_id;
    if (orders.some((o) => o.shop_id !== shopId)) return NextResponse.json({ error: "จองได้ทีละร้าน" }, { status: 400 });
    const info = await readSiteInfo(sb, shopId);
    if (!info.shippop_enabled) return NextResponse.json({ error: "ยังไม่ได้เปิด Shippop — 🏪 ข้อมูลร้าน › 🚚" }, { status: 409 });
    const s = senderOf(info);
    if (!s.ok) return NextResponse.json({ error: s.error }, { status: 409 });
    const qty = await qtyOf(sb, ids);
    const failed: { orderNo: string; error: string }[] = [];
    const items = [];
    for (const o of orders) {
      if (o.status === "cancelled") failed.push({ orderNo: o.order_no, error: "ยกเลิกแล้ว" });
      else if (o.shippop && o.shippop.status !== "cancel") failed.push({ orderNo: o.order_no, error: "จองไปแล้ว" });
      else {
        const it = bookItemOf(o, s.from, info, { courierCode: courier, qty: qty.get(o.id) ?? 1, weight: ids.length === 1 ? body?.weight : undefined, box: ids.length === 1 ? body?.box : undefined });
        if (it.ok) items.push(it.item);
        else failed.push({ orderNo: o.order_no, error: it.error });
      }
    }
    if (!items.length) return NextResponse.json({ ok: false, done: 0, failed }, { status: 400 });
    let booked: Awaited<ReturnType<typeof shippopBookAndConfirm>>;
    try {
      booked = await shippopBookAndConfirm(items);
    } catch (e) {
      return NextResponse.json({ ok: false, error: `จองไม่สำเร็จ: ${(e as Error).message}`, failed }, { status: 502 });
    }
    let done = 0;
    const now = new Date().toISOString();
    for (const r of booked.results) {
      const o = orders.find((x) => x.id === r.key)!;
      const item = items.find((x) => x.key === r.key)!;
      if (!r.ok || !r.trackingCode) {
        failed.push({ orderNo: o.order_no, error: r.error ?? "จองไม่สำเร็จ" });
        continue;
      }
      const sp: ShippopInfo = { mode: booked.mode, purchaseId: booked.purchaseId, trackingCode: r.trackingCode, courierCode: courier, courierTrackingCode: r.courierTrackingCode ?? "", price: r.price ?? 0, codAmount: item.codAmount, status: "booking", bookedAt: now, history: [{ status: "booking", at: now }] };
      await sb.from("store_orders").update({ shippop: sp, tracking_no: sp.courierTrackingCode || sp.trackingCode, tracking_carrier: carrierOf(courier) }).eq("id", o.id);
      await writeAuditFor(request, sb, { action: "update", entityType: "store_orders", entityId: o.id, metadata: { kind: "shippop_book", orderNo: o.order_no, mode: booked.mode, courier, trackingCode: sp.trackingCode, courierTrackingCode: sp.courierTrackingCode, price: sp.price, cod: item.codAmount } });
      done++;
    }
    return NextResponse.json({ ok: done > 0, done, failed, mode: booked.mode });
  }

  const [o] = UUID.test(String(body?.orderId)) ? await loadOrders(sb, [String(body!.orderId)]) : [];
  if (!o?.shippop) return NextResponse.json({ error: "ออเดอร์นี้ยังไม่ได้จอง Shippop" }, { status: 404 });

  if (action === "cancel") {
    if (["shipping", "complete", "return"].includes(o.shippop.status)) return NextResponse.json({ error: "ขนส่งรับพัสดุไปแล้ว — ยกเลิกไม่ได้ (ติดต่อ Shippop)" }, { status: 409 });
    try {
      if (o.shippop.mode === "live" && !(await shippopCancel(o.shippop.courierTrackingCode || o.shippop.trackingCode))) return NextResponse.json({ error: "Shippop ไม่ยอมยกเลิก — ติดต่อ Shippop" }, { status: 409 });
    } catch (e) {
      return NextResponse.json({ error: `ยกเลิกไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
    }
    const now = new Date().toISOString();
    const clearTracking = o.tracking_no === (o.shippop.courierTrackingCode || o.shippop.trackingCode);
    await sb.from("store_orders").update({ shippop: { ...o.shippop, status: "cancel", history: [...o.shippop.history, { status: "cancel", at: now }] }, ...(clearTracking ? { tracking_no: null, tracking_carrier: null } : {}) }).eq("id", o.id);
    await writeAuditFor(request, sb, { action: "cancel", entityType: "store_orders", entityId: o.id, metadata: { kind: "shippop_cancel", orderNo: o.order_no, trackingCode: o.shippop.trackingCode } });
    return NextResponse.json({ ok: true });
  }

  if (action === "simulate") {
    if (o.shippop.mode !== "sim") return NextResponse.json({ error: "จำลองได้เฉพาะการจองในโหมดจำลอง" }, { status: 409 });
    const status = String(body?.status ?? "");
    if (!SHIPPOP_STATUS_LABEL[status]) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    const r = await applyShippopStatus(sb, o, status, new Date().toISOString(), "จำลอง", "Shippop (จำลอง)");
    return NextResponse.json({ ok: true, orderStatus: r.orderStatus });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
