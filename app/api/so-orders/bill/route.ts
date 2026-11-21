/**
 * เปิดใบขายจากใบสั่งขาย (ส่งของบางส่วน/ทั้งหมด) — POST /api/so-orders/bill
 *   body { picks: [{ so_line_id, qty }], order_date? }
 *   → ออกใบขาย (ยืนยัน + จัดส่ง = ตัดของ) · ผูกเข้าใบสั่งผลิตของแต่ละรายการ · ใบสั่งขายที่ส่งครบ = "ส่งแล้ว"
 *   คืน { invoice_id, so_number, mos: [{ mo_no, qty, left, partial }] } — ใบสั่งผลิตที่ยังเหลือ หน้าจอจะถามต่อว่าที่เหลืออยู่ขั้นไหน
 *   GET ?ids=<so_order_id,…> → รายการพร้อม "ค้างส่ง" (ป๊อปสร้างใบขาย "ดึงจากใบสั่งขาย" + ป๊อปเปิดใบขายในลิ้นชัก)
 * กติกา: ทุกรายการต้องเป็นลูกค้าเดียวกัน · ใบยกเลิกใช้ไม่ได้ · ส่งเกินค้างไม่ได้ (รายการที่มีใบสั่งผลิต)
 * สิทธิ์: ดู so.view · ออกใบ so.ship · audit so_order.bill + mo.sales_link (ship-lines.ts)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { actorOf, createInvoice, linkBillToSoLines, loadLineShipState, type ShipPick } from "../ship-lines";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export type BillSourceLine = {
  so_line_id: string; order_id: string; order_no: string | null; line_no: number;
  sku: string | null; product_name: string; unit: string | null; unit_price: number;
  discount_type: string | null; discount_value: number;
  ordered: number; shipped: number; remaining: number; mo_nos: string[]; image_url: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  if (!ids.length) return NextResponse.json({ data: { orders: [], lines: [] } });
  const admin = supabaseAdmin();
  const { data: orders } = await admin.from("so_orders").select("*").in("id", ids);
  const state = await loadLineShipState(admin, ids);
  const noOf = new Map(((orders ?? []) as Row[]).map((o) => [String(o.id), (o.order_no as string) ?? null]));
  const codes = [...new Set([...state.values()].map((s) => String(s.line.sku ?? "").trim()).filter(Boolean))];
  const imgOf = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data: skus } = await admin.from("skus_v2").select(`code, is_active, ${SKU_COVER_SELECT}`).in("code", codes.slice(i, i + 200));
    for (const s of ((skus ?? []) as Row[]).sort((a, b) => Number(!!a.is_active) - Number(!!b.is_active))) {
      const url = coverUrl(resolveSkuCover(s).key);
      if (url) imgOf.set(String(s.code), `${url}&w=160`);
    }
  }
  const lines: BillSourceLine[] = [...state.entries()].map(([id, s]) => ({
    so_line_id: id, order_id: s.order_id, order_no: noOf.get(s.order_id) ?? null, line_no: Number(s.line.line_no) || 0,
    sku: (s.line.sku as string) ?? null, product_name: String(s.line.product_name ?? s.line.sku ?? ""), unit: (s.line.unit as string) ?? null,
    unit_price: Number(s.line.unit_price) || 0, discount_type: (s.line.discount_type as string) ?? null, discount_value: Number(s.line.discount_value) || 0,
    ordered: s.ordered, shipped: s.shipped, remaining: s.remaining, mo_nos: s.mos.map((m) => m.mo_no),
    image_url: imgOf.get(String(s.line.sku ?? "").trim()) ?? null,
  })).sort((a, b) => String(a.order_no).localeCompare(String(b.order_no)) || a.line_no - b.line_no);
  return NextResponse.json({ data: { orders: orders ?? [], lines } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.ship"); if (denied) return denied;
  const body = await request.json().catch(() => null) as { picks?: ShipPick[]; order_date?: string | null } | null;
  const picks = (Array.isArray(body?.picks) ? body!.picks : []).map((p) => ({ so_line_id: String(p.so_line_id ?? ""), qty: Number(p.qty) || 0 })).filter((p) => p.so_line_id && p.qty > 0);
  if (!picks.length) return bad("เลือกรายการและใส่จำนวนที่จะส่งอย่างน้อย 1 รายการ");
  const admin = supabaseAdmin();
  const { data: pl } = await admin.from("so_order_lines").select("id, order_id").in("id", picks.map((p) => p.so_line_id));
  const orderIds = [...new Set(((pl ?? []) as Row[]).map((r) => String(r.order_id)))];
  if (!orderIds.length) return bad("ไม่พบรายการ — ปิดแล้วเปิดใบใหม่อีกครั้ง");
  const { data: os } = await admin.from("so_orders").select("*").in("id", orderIds);
  const orders = (os ?? []) as Row[];
  if (orders.some((o) => o.status === "cancelled")) return bad("มีใบสั่งขายที่ยกเลิกแล้ว — ออกใบขายไม่ได้");
  const custKey = (o: Row) => String(o.customer_id ?? o.customer_name ?? "");
  if (new Set(orders.map(custKey)).size > 1) return bad("ใบขาย 1 ใบต้องเป็นลูกค้าเดียวกัน — เลือกเฉพาะใบสั่งขายของลูกค้าเดียวกัน");
  const state = await loadLineShipState(admin, orderIds);
  const lines: { line: Row; qty: number }[] = [];
  for (const p of picks) {
    const s = state.get(p.so_line_id);
    if (!s) return bad("ไม่พบรายการบางรายการ — ปิดแล้วเปิดใบใหม่อีกครั้ง");
    if (s.mos.length && p.qty > s.remaining + 0.0001) return bad(`${s.line.sku ?? s.line.product_name} ค้างส่ง ${s.remaining} — ส่งเกินไม่ได้`);
    lines.push({ line: s.line, qty: p.qty });
  }
  const me = await actorOf(request, admin);
  const first = orders.sort((a, b) => String(a.order_no).localeCompare(String(b.order_no)))[0];
  const inv = await createInvoice(request, admin, first, lines, me.email, { orderNos: orders.map((o) => String(o.order_no ?? "")), orderDate: body?.order_date ?? null });
  if (inv.error || !inv.id) return bad(inv.error ?? "ออกใบขายไม่สำเร็จ");
  const linked = await linkBillToSoLines(admin, inv.id, picks, { id: me.id, name: me.name });
  const { data: bill } = await admin.from("erp_playground_sales_orders").select("so_number").eq("id", inv.id).maybeSingle();
  return NextResponse.json({
    ok: true, invoice_id: inv.id, so_number: (bill as Row | null)?.so_number ?? null,
    warning: [inv.warning, linked.error].filter(Boolean).join(" · ") || null,
    mos: linked.mos, skipped: linked.skipped, orders_shipped: linked.orders_shipped,
  });
}
