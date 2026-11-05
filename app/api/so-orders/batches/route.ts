/**
 * ใบสั่งขาย "ตามชุด" — /api/so-orders/batches
 *   GET → ทุกชุดที่มีรายการในใบสั่งขาย (ไม่นับใบที่ยกเลิก) + ขั้นของแต่ละรายการ + ยอดรวมต่อขั้น
 * ขั้นคิดสดจากใบสั่งผลิต (lib/mo-dispatch → moProgress) ผ่าน lib/so-order-stage — ไม่เก็บสถานะชุดแยก
 * "ส่งแล้วกี่ชิ้น" = ใบขาย(บิล)ที่ผูกกับใบสั่งผลิตของรายการ (mo_sales_links) — ครบจำนวน = ขั้นส่งลูกค้าแล้ว
 * สิทธิ์: so.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadMoDispatch } from "@/lib/mo-dispatch";
import { soLineStage, soShipState, type SoLineStage, type SoShipState } from "@/lib/so-order-stage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

export type BatchLine = {
  line_id: string; order_id: string; order_no: string | null; customer_name: string | null;
  sku: string | null; product_name: string; qty: number; unit: string;
  due_date: string | null; mo_id: string | null; mo_no: string | null; stage: SoLineStage;
  /** ส่งลูกค้าแล้วกี่ชิ้น (ใบขายที่ผูกกับใบสั่งผลิต) · note = หมายเหตุของรายการ */
  shipped: number; ship: SoShipState; note: string | null;
};
export type SoBatch = {
  id: string; name: string;
  lines: BatchLine[];
  /** จำนวนรายการที่ "ถึงขั้นนี้แล้ว" (index = ขั้น 0..4) */
  reached: number[];
  min_stage: SoLineStage;
  qty: number;
  customers: string[];
  orders: { id: string; order_no: string | null; status: string; all_in_batch: boolean }[];
  due_min: string | null;
  /** ส่งแล้ว (ไม่เกินจำนวนของแต่ละรายการ) · นับรายการ ส่งครบ/บางส่วน/ยังไม่ส่ง */
  shipped_qty: number;
  ship_count: Record<SoShipState, number>;
};

const chunks = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const lines = await fetchAllPages<Row>((from, to) => admin.from("so_order_lines")
    .select("id, order_id, line_no, sku, product_name, qty, unit, due_date, mo_id, mo_no, mo_group_id, note")
    .not("mo_group_id", "is", null).order("id").range(from, to));
  if (lines.length === 0) return NextResponse.json({ data: [], error: null });

  const orderIds = [...new Set(lines.map((l) => String(l.order_id)))];
  const groupIds = [...new Set(lines.map((l) => String(l.mo_group_id)))];
  const moIds = [...new Set(lines.map((l) => (l.mo_id as string) ?? "").filter(Boolean))];

  const orders: Row[] = [];
  for (const c of chunks(orderIds)) {
    const { data } = await admin.from("so_orders").select("id, order_no, status, customer_name, due_date").in("id", c);
    orders.push(...((data ?? []) as Row[]));
  }
  const orderOf = new Map(orders.map((o) => [String(o.id), o]));
  // รายการทุกบรรทัดของใบเหล่านี้ (ไว้บอกว่าใบไหน "อยู่ในชุดนี้ทั้งใบ" — ส่งของทั้งชุดได้เฉพาะใบแบบนี้)
  const allLines: Row[] = [];
  for (const c of chunks(orderIds)) {
    allLines.push(...await fetchAllPages<Row>((from, to) => admin.from("so_order_lines").select("order_id, mo_group_id").in("order_id", c).order("id").range(from, to)));
  }
  const groupsOfOrder = new Map<string, Set<string | null>>();
  for (const l of allLines) (groupsOfOrder.get(String(l.order_id)) ?? groupsOfOrder.set(String(l.order_id), new Set()).get(String(l.order_id))!).add((l.mo_group_id as string) ?? null);

  const { data: gs } = await admin.from("mo_groups").select("id, name, is_active").in("id", groupIds);
  const groupName = new Map(((gs ?? []) as Row[]).filter((g) => g.is_active !== false).map((g) => [String(g.id), String(g.name)]));

  const mos: Row[] = [];
  for (const c of chunks(moIds)) {
    const { data } = await admin.from("manufacturing_orders").select("id, mo_no, qty, status, skipped_stages, is_active").in("id", c);
    mos.push(...((data ?? []) as Row[]));
  }
  const moOf = new Map(mos.map((m) => [String(m.id), m]));
  const disp = await loadMoDispatch(admin, mos);
  // ใบขายที่ผูกกับใบสั่งผลิต → ส่งแล้วกี่ชิ้น (is_active null ก็นับ — ไม่ใช้ .neq ที่ตัด null ทิ้ง)
  const shippedOf = new Map<string, number>();
  for (const c of chunks(moIds)) {
    const { data } = await admin.from("mo_sales_links").select("mo_id, qty").in("mo_id", c).not("is_active", "is", false);
    for (const r of (data ?? []) as Row[]) shippedOf.set(String(r.mo_id), (shippedOf.get(String(r.mo_id)) ?? 0) + (Number(r.qty) || 0));
  }

  const batches = new Map<string, SoBatch>();
  for (const l of lines) {
    const gid = String(l.mo_group_id);
    if (!groupName.has(gid)) continue;
    const o = orderOf.get(String(l.order_id));
    if (!o || o.status === "cancelled") continue;
    const mo = l.mo_id ? moOf.get(String(l.mo_id)) : undefined;
    const d = mo ? disp.get(String(mo.mo_no)) : undefined;
    const qty = Number(l.qty) || 0;
    const shipped = mo ? (shippedOf.get(String(mo.id)) ?? 0) : 0;
    const ship = soShipState(qty, shipped);
    const stage = soLineStage({
      // ใบสั่งผลิตที่ถูกยกเลิกในข้อมูลจริง = is_active false (status ยังเป็น draft) → นับเป็นยกเลิก
      orderShipped: o.status === "shipped", hasMo: !!mo, moStatus: mo && mo.is_active === false ? "cancelled" : ((mo?.status as string) ?? null),
      dispatched: !!d?.dispatched, submitted: !!d?.submitted, delivered: ship === "full",
    });
    const b = batches.get(gid) ?? { id: gid, name: groupName.get(gid)!, lines: [], reached: [0, 0, 0, 0, 0], min_stage: 4 as SoLineStage, qty: 0, customers: [], orders: [], due_min: null, shipped_qty: 0, ship_count: { full: 0, part: 0, none: 0 } };
    const due = (l.due_date as string) || (o.due_date as string) || null;
    b.lines.push({
      line_id: String(l.id), order_id: String(o.id), order_no: (o.order_no as string) ?? null, customer_name: (o.customer_name as string) ?? null,
      sku: (l.sku as string) ?? null, product_name: String(l.product_name ?? ""), qty: Number(l.qty) || 0, unit: String(l.unit ?? "ชิ้น"),
      due_date: due, mo_id: (l.mo_id as string) ?? null, mo_no: (mo?.mo_no as string) ?? (l.mo_no as string) ?? null, stage,
      shipped, ship, note: (l.note as string) ?? null,
    });
    b.shipped_qty += Math.min(shipped, qty);
    b.ship_count[ship]++;
    for (let k = 0; k <= stage; k++) b.reached[k]++;
    b.min_stage = Math.min(b.min_stage, stage) as SoLineStage;
    b.qty += qty;
    const cust = (o.customer_name as string) ?? ""; if (cust && !b.customers.includes(cust)) b.customers.push(cust);
    if (!b.orders.some((x) => x.id === String(o.id))) {
      const gset = groupsOfOrder.get(String(o.id)) ?? new Set();
      b.orders.push({ id: String(o.id), order_no: (o.order_no as string) ?? null, status: String(o.status), all_in_batch: gset.size === 1 && gset.has(gid) });
    }
    if (due && (!b.due_min || due < b.due_min)) b.due_min = due;
    batches.set(gid, b);
  }

  const data = [...batches.values()].sort((a, b) =>
    (a.min_stage === 4 ? 1 : 0) - (b.min_stage === 4 ? 1 : 0)              // ชุดที่ส่งครบแล้วไปท้าย
    || (a.due_min ?? "9999").localeCompare(b.due_min ?? "9999") || a.name.localeCompare(b.name, "th"));
  return NextResponse.json({ data, error: null });
}
