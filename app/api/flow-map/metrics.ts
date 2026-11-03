/**
 * นิยามตัวเลขสดของแผนผังการทำงาน (ฝั่ง server) — ที่เดียวทั้ง "นับ" (/api/flow-map/health) และ "ดูรายการ" (/api/flow-map/list)
 * เงื่อนไขกรองชุดเดียวกัน → ตัวเลขกับรายการตรงกันเสมอ · ชื่อ/ความหมายอยู่ที่ lib/flow-map.ts (FLOW_METRICS)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { FlowMetricKey } from "@/lib/flow-map";
import { openLink } from "@/lib/open-link";

type Admin = ReturnType<typeof supabaseAdmin>;
type FB = ReturnType<ReturnType<Admin["from"]>["select"]>;
type Row = Record<string, unknown>;

/** 1 แถวในป๊อปรายการ — href = หน้าที่เปิด (มี ?open= ถ้าหน้านั้นรองรับ) */
export type FlowMetricRow = { id: string; no: string; sub: string; date: string | null; status: string | null; href: string };

// ใบขายก่อนวันนี้ = ใบเก่าที่ยังจองของค้าง (ตรงกับคำเตือนในหน้าใบขาย /sales-orders)
export const STOCK_CUT_SINCE = "2026-11-02";
const BILL_OPEN = ["confirmed", "in_production", "ready"];
const PO_LINE_DONE = "(received,short_closed,closed_short,cancelled)";
const since30 = () => new Date(Date.now() - 30 * 86400000).toISOString();
const str = (v: unknown) => (v == null ? "" : String(v));
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const qtyTxt = (v: unknown) => (Number(v) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

type CountDef = {
  kind: "count"; table: string; apply: (q: FB) => FB;
  cols: string; order: string; asc?: boolean; row: (r: Row) => FlowMetricRow;
};
type CustomDef = { kind: "custom"; count: (admin: Admin) => Promise<number>; list: (admin: Admin) => Promise<FlowMetricRow[]> };

const bill = (apply: (q: FB) => FB): CountDef => ({
  kind: "count", table: "erp_playground_sales_orders", apply, cols: "id, so_number, customer_name, order_date, status, grand_total", order: "order_date",
  row: (r) => ({ id: str(r.id), no: str(r.so_number) || "(ยังไม่มีเลข)", sub: `${str(r.customer_name)} · ฿${qtyTxt(r.grand_total)}`, date: day(r.order_date), status: str(r.status), href: openLink("/sales-orders", str(r.id)) }),
});
const pr = (apply: (q: FB) => FB): CountDef => ({
  kind: "count", table: "purchase_requests_v2", apply, cols: "id, pr_no, item_name, qty, status, order_date, source_mo_no", order: "order_date",
  row: (r) => ({ id: str(r.id), no: str(r.pr_no), sub: `${str(r.item_name)} · ${qtyTxt(r.qty)}${r.source_mo_no ? ` · ${str(r.source_mo_no)}` : ""}`, date: day(r.order_date), status: str(r.status), href: "/purchasing/orders" }),
});

/** ยอดคลังรายสินค้าของโซน (WH-RAW/WIP/FG) — นับรวม หรือรายการ 200 ตัวที่ยอดมาก/ติดลบมากสุด */
async function stockRows(admin: Admin, code: string, field: "qty_on_hand" | "qty_reserved"): Promise<{ total: number; rows: FlowMetricRow[] }> {
  const { data: wh, error: wErr } = await admin.from("erp_playground_warehouses").select("id").eq("code", code).maybeSingle();
  if (wErr) throw new Error(wErr.message);
  if (!wh?.id) return { total: 0, rows: [] };
  const all: { product_id: string; v: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("erp_playground_stock_balances").select(`product_id, ${field}`).eq("warehouse_id", wh.id).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const b of (data ?? []) as Row[]) { const v = Number(b[field]) || 0; if (v) all.push({ product_id: str(b.product_id), v }); }
    if ((data ?? []).length < 1000) break;
  }
  const total = all.reduce((s, x) => s + x.v, 0);
  const top = all.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 200);
  const names = new Map<string, { code: string; name: string }>();
  const ids = top.map((x) => x.product_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("skus_v2").select("id, code, name_th").in("id", ids.slice(i, i + 200));
    for (const s of (data ?? []) as Row[]) names.set(str(s.id), { code: str(s.code), name: str(s.name_th) });
  }
  return { total, rows: top.map((x) => ({ id: x.product_id, no: names.get(x.product_id)?.code || "(ไม่พบรหัส)", sub: `${names.get(x.product_id)?.name ?? ""} · ${qtyTxt(x.v)}`, date: null, status: x.v < 0 ? "ติดลบ" : null, href: "/inventory" })) };
}
const stock = (code: string, field: "qty_on_hand" | "qty_reserved"): CustomDef => ({
  kind: "custom", count: async (a) => (await stockRows(a, code, field)).total, list: async (a) => (await stockRows(a, code, field)).rows,
});

async function dnUnlinked(admin: Admin): Promise<FlowMetricRow[]> {
  const { data, error } = await admin.from("erp_playground_delivery_notes").select("id, dn_number, customer_name, delivery_date, status, so_ids").neq("status", "cancelled").order("delivery_date", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).filter((r) => !Array.isArray(r.so_ids) || r.so_ids.length === 0)
    .map((r) => ({ id: str(r.id), no: str(r.dn_number) || "(ร่าง)", sub: str(r.customer_name) || "(ไม่มีลูกค้า)", date: day(r.delivery_date), status: str(r.status), href: "/delivery-notes" }));
}

export const FLOW_METRIC_DEFS: Record<FlowMetricKey, CountDef | CustomDef> = {
  qt_open: { kind: "count", table: "erp_playground_quotations", apply: (q) => q.in("status", ["draft", "sent"]), cols: "id, quote_number, customer_name, quote_date, status", order: "quote_date",
    row: (r) => ({ id: str(r.id), no: str(r.quote_number) || "(ร่าง)", sub: str(r.customer_name), date: day(r.quote_date), status: str(r.status), href: "/quotations" }) },
  so_open: { kind: "count", table: "so_orders", apply: (q) => q.eq("status", "confirmed"), cols: "id, order_no, customer_name, order_date, status", order: "order_date",
    row: (r) => ({ id: str(r.id), no: str(r.order_no), sub: str(r.customer_name), date: day(r.order_date), status: str(r.status), href: "/sales/orders" }) },
  bill_draft: bill((q) => q.eq("status", "draft")),
  bill_unshipped: bill((q) => q.in("status", BILL_OPEN)),
  bill_old_reserved: bill((q) => q.in("status", BILL_OPEN).eq("stock_reserved", true).lt("order_date", STOCK_CUT_SINCE)),
  dn_unlinked: { kind: "custom", count: async (a) => (await dnUnlinked(a)).length, list: dnUnlinked },
  bn_open: { kind: "count", table: "erp_playground_billing_notes", apply: (q) => q.in("status", ["draft", "issued"]), cols: "id, bill_number, customer_name, bill_date, status, grand_total", order: "bill_date",
    row: (r) => ({ id: str(r.id), no: str(r.bill_number) || "(ร่าง)", sub: `${str(r.customer_name)} · ฿${qtyTxt(r.grand_total)}`, date: day(r.bill_date), status: str(r.status), href: openLink("/billing-notes", str(r.id)) }) },
  rc_30d: { kind: "count", table: "customer_receipts", apply: (q) => q.eq("status", "confirmed").gte("created_at", since30()), cols: "id, receipt_no, customer_name, receipt_date, status", order: "receipt_date",
    row: (r) => ({ id: str(r.id), no: str(r.receipt_no), sub: str(r.customer_name), date: day(r.receipt_date), status: str(r.status), href: "/receipts" }) },
  cn_issued: { kind: "count", table: "erp_playground_credit_notes", apply: (q) => q.eq("status", "issued"), cols: "id, cn_number, customer_name, cn_date, status, grand_total", order: "cn_date",
    row: (r) => ({ id: str(r.id), no: str(r.cn_number), sub: `${str(r.customer_name)} · ฿${qtyTxt(r.grand_total)}`, date: day(r.cn_date), status: str(r.status), href: openLink("/credit-notes", str(r.id)) }) },
  ds_active: { kind: "count", table: "design_sheets", apply: (q) => q.not("is_active", "is", false).not("status", "in", "(cancelled,sku_created)"), cols: "id, code, name, order_date, status, created_at", order: "created_at",
    row: (r) => ({ id: str(r.id), no: str(r.code) || "—", sub: str(r.name), date: day(r.order_date ?? r.created_at), status: str(r.status), href: openLink("/master/design-sheets", str(r.id)) }) },
  mo_open: { kind: "count", table: "manufacturing_orders", apply: (q) => q.eq("is_active", true).not("status", "in", "(done,cancelled)"), cols: "id, mo_no, product_sku, product_name, qty, due_date, status", order: "due_date", asc: true,
    row: (r) => ({ id: str(r.id), no: str(r.mo_no), sub: `${str(r.product_name) || str(r.product_sku)} · ${qtyTxt(r.qty)} ชิ้น`, date: day(r.due_date), status: str(r.status), href: "/master/manufacturing-orders" }) },
  mat_not_ready: { kind: "count", table: "mo_material_summary", apply: (q) => q.eq("is_active", true).eq("is_ready", false), cols: "id, mo_no, component_sku, component_name, required_qty, on_hand_qty, created_at", order: "created_at",
    row: (r) => ({ id: str(r.id), no: str(r.mo_no), sub: `${str(r.component_sku)} ${str(r.component_name)} · ต้องใช้ ${qtyTxt(r.required_qty)} มี ${qtyTxt(r.on_hand_qty)}`, date: day(r.created_at), status: null, href: "/master/material-readiness" }) },
  wo_open: { kind: "count", table: "mo_work_orders", apply: (q) => q.in("status", ["dispatched", "partial_return"]).not("is_active", "is", false), cols: "id, wo_no, mo_no, product_name, assignee_name, qty, received_qty, dispatch_date, status", order: "dispatch_date",
    row: (r) => ({ id: str(r.id), no: str(r.wo_no) || str(r.mo_no), sub: `${str(r.product_name)} · ${str(r.assignee_name)} · คืน ${qtyTxt(r.received_qty)}/${qtyTxt(r.qty)}`, date: day(r.dispatch_date), status: str(r.status), href: "/master/work-board" }) },
  sub_30d: { kind: "count", table: "wo_submissions", apply: (q) => q.gte("created_at", since30()), cols: "id, wo_no, mo_no, sku_name, craftsman_name, qty, created_at", order: "created_at",
    row: (r) => ({ id: str(r.id), no: str(r.wo_no) || str(r.mo_no), sub: `${str(r.sku_name)} · ${str(r.craftsman_name)} · ${qtyTxt(r.qty)} ชิ้น`, date: day(r.created_at), status: null, href: "/master/work-submissions" }) },
  qc_shelf: { kind: "count", table: "qc_warehouse_items", apply: (q) => q, cols: "id, sku, sku_name, qty, status, mo_no, created_at", order: "created_at",
    row: (r) => ({ id: str(r.id), no: str(r.sku), sub: `${str(r.sku_name)} · ${qtyTxt(r.qty)} ชิ้น${r.mo_no ? ` · ${str(r.mo_no)}` : ""}`, date: day(r.created_at), status: str(r.status), href: "/master/qc-warehouse" }) },
  pr_waiting: pr((q) => q.eq("status", "waiting").not("is_active", "is", false)),
  pr_mo_nosku_open: pr((q) => q.not("is_active", "is", false).not("source_mo_no", "is", null).is("item_sku_id", null).is("po_id", null).neq("status", "rejected")),
  po_lines_nosku_open: { kind: "count", table: "purchase_order_lines_v2", apply: (q) => q.is("item_sku_id", null).not("is_active", "is", false).or(`line_status.is.null,line_status.not.in.${PO_LINE_DONE}`),
    cols: "id, po_id, item_name, qty, qty_received, line_status, created_at", order: "created_at",
    row: (r) => ({ id: str(r.id), no: str(r.item_name), sub: `รับแล้ว ${qtyTxt(r.qty_received)}/${qtyTxt(r.qty)}`, date: day(r.created_at), status: str(r.line_status) || "รอรับ", href: openLink("/purchasing/po-list", str(r.po_id)) }) },
  po_unpaid: { kind: "count", table: "purchase_orders_v2", apply: (q) => q.neq("status", "cancelled").or("payment_status.is.null,payment_status.neq.paid"), cols: "id, po_no, seller_name, order_date, status, grand_total", order: "order_date",
    row: (r) => ({ id: str(r.id), no: str(r.po_no), sub: `${str(r.seller_name)} · ${qtyTxt(r.grand_total)}`, date: day(r.order_date), status: str(r.status), href: openLink("/purchasing/po-list", str(r.id)) }) },
  gr_30d: { kind: "count", table: "goods_receipts_v2", apply: (q) => q.eq("status", "done").gte("created_at", since30()), cols: "id, gr_no, po_no, seller_name, receive_date, status", order: "receive_date",
    row: (r) => ({ id: str(r.id), no: str(r.gr_no), sub: `${str(r.po_no)} · ${str(r.seller_name)}`, date: day(r.receive_date), status: str(r.status), href: "/purchasing/receive-history" }) },
  pv_draft: { kind: "count", table: "purchase_vouchers_v2", apply: (q) => q.eq("status", "draft"), cols: "id, pv_no, seller_name, voucher_date, status, grand_total_thb", order: "voucher_date",
    row: (r) => ({ id: str(r.id), no: str(r.pv_no) || "(ร่าง)", sub: `${str(r.seller_name)} · ฿${qtyTxt(r.grand_total_thb)}`, date: day(r.voucher_date), status: str(r.status), href: `/purchasing/vouchers/${str(r.id)}` }) },
  stock_raw: stock("WH-RAW", "qty_on_hand"),
  stock_wip: stock("WH-WIP", "qty_on_hand"),
  stock_fg: stock("WH-FG", "qty_on_hand"),
  fg_reserved: stock("WH-FG", "qty_reserved"),
};

export async function countFlowMetric(admin: Admin, key: FlowMetricKey): Promise<number> {
  const d = FLOW_METRIC_DEFS[key];
  if (d.kind === "custom") return d.count(admin);
  const { count, error } = await d.apply(admin.from(d.table).select("id", { count: "exact", head: true }));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listFlowMetric(admin: Admin, key: FlowMetricKey, limit = 200): Promise<FlowMetricRow[]> {
  const d = FLOW_METRIC_DEFS[key];
  if (d.kind === "custom") return (await d.list(admin)).slice(0, limit);
  const { data, error } = await d.apply(admin.from(d.table).select(d.cols)).order(d.order, { ascending: !!d.asc, nullsFirst: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(d.row);
}
