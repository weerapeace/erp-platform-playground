/**
 * GET /api/flow-map/health — ตัวเลขสดของแผนผังการทำงาน (/master/flow-map)
 * ชื่อ/ความหมายของแต่ละตัวอยู่ที่ lib/flow-map.ts (FLOW_METRICS) · คิดที่นี่ที่เดียว
 * ตัวไหนอ่านไม่สำเร็จ = null (ไม่ล้มทั้งหน้า)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { FlowMetricKey } from "@/lib/flow-map";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ใบขายก่อนวันนี้ = ใบเก่าที่ยังจองของค้าง (ตรงกับคำเตือนในหน้าใบขาย /sales-orders)
const STOCK_CUT_SINCE = "2026-11-02";
const BILL_OPEN = ["confirmed", "in_production", "ready"];
const PO_LINE_DONE = "(received,short_closed,closed_short,cancelled)";

type Counted = PromiseLike<{ count: number | null; error: { message: string } | null }>;
const count = async (q: Counted) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.count ?? 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const head = { count: "exact" as const, head: true };
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

  // ยอดคลังต่อโซน (รวมทุก SKU) — อ่านครั้งเดียวใช้ 4 ตัวเลข
  let stockOnce: Promise<Record<string, { onHand: number; reserved: number }>> | null = null;
  const stock = () => (stockOnce ??= (async () => {
    const { data: whs, error: wErr } = await admin.from("erp_playground_warehouses").select("id, code").in("code", ["WH-RAW", "WH-WIP", "WH-FG"]);
    if (wErr) throw new Error(wErr.message);
    const codeById = new Map(((whs ?? []) as { id: string; code: string }[]).map((w) => [String(w.id), w.code]));
    const out: Record<string, { onHand: number; reserved: number }> = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("erp_playground_stock_balances").select("warehouse_id, qty_on_hand, qty_reserved")
        .in("warehouse_id", [...codeById.keys()]).range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const b of (data ?? []) as { warehouse_id: string; qty_on_hand: number | null; qty_reserved: number | null }[]) {
        const code = codeById.get(String(b.warehouse_id)); if (!code) continue;
        const s = (out[code] ??= { onHand: 0, reserved: 0 });
        s.onHand += Number(b.qty_on_hand) || 0; s.reserved += Number(b.qty_reserved) || 0;
      }
      if ((data ?? []).length < 1000) break;
    }
    return out;
  })());

  const jobs: Record<FlowMetricKey, () => Promise<number>> = {
    qt_open: () => count(admin.from("erp_playground_quotations").select("id", head).in("status", ["draft", "sent"])),
    so_open: () => count(admin.from("so_orders").select("id", head).eq("status", "confirmed")),
    bill_draft: () => count(admin.from("erp_playground_sales_orders").select("id", head).eq("status", "draft")),
    bill_unshipped: () => count(admin.from("erp_playground_sales_orders").select("id", head).in("status", BILL_OPEN)),
    bill_old_reserved: () => count(admin.from("erp_playground_sales_orders").select("id", head).in("status", BILL_OPEN).eq("stock_reserved", true).lt("order_date", STOCK_CUT_SINCE)),
    dn_unlinked: async () => {
      const { data, error } = await admin.from("erp_playground_delivery_notes").select("so_ids").neq("status", "cancelled");
      if (error) throw new Error(error.message);
      return ((data ?? []) as { so_ids: unknown }[]).filter((r) => !Array.isArray(r.so_ids) || r.so_ids.length === 0).length;
    },
    bn_open: () => count(admin.from("erp_playground_billing_notes").select("id", head).in("status", ["draft", "issued"])),
    rc_30d: () => count(admin.from("customer_receipts").select("id", head).eq("status", "confirmed").gte("created_at", since30)),
    cn_issued: () => count(admin.from("erp_playground_credit_notes").select("id", head).eq("status", "issued")),
    ds_active: () => count(admin.from("design_sheets").select("id", head).not("is_active", "is", false).not("status", "in", "(cancelled,sku_created)")),
    mo_open: () => count(admin.from("manufacturing_orders").select("id", head).eq("is_active", true).not("status", "in", "(done,cancelled)")),
    mat_not_ready: () => count(admin.from("mo_material_summary").select("id", head).eq("is_active", true).eq("is_ready", false)),
    wo_open: () => count(admin.from("mo_work_orders").select("id", head).in("status", ["dispatched", "partial_return"]).not("is_active", "is", false)),
    sub_30d: () => count(admin.from("wo_submissions").select("id", head).gte("created_at", since30)),
    qc_shelf: () => count(admin.from("qc_warehouse_items").select("id", head)),
    pr_waiting: () => count(admin.from("purchase_requests_v2").select("id", head).eq("status", "waiting").not("is_active", "is", false)),
    pr_mo_nosku_open: () => count(admin.from("purchase_requests_v2").select("id", head).not("is_active", "is", false)
      .not("source_mo_no", "is", null).is("item_sku_id", null).is("po_id", null).neq("status", "rejected")),
    po_lines_nosku_open: () => count(admin.from("purchase_order_lines_v2").select("id", head).is("item_sku_id", null).not("is_active", "is", false)
      .or(`line_status.is.null,line_status.not.in.${PO_LINE_DONE}`)),
    po_unpaid: () => count(admin.from("purchase_orders_v2").select("id", head).neq("status", "cancelled").or("payment_status.is.null,payment_status.neq.paid")),
    gr_30d: () => count(admin.from("goods_receipts_v2").select("id", head).eq("status", "done").gte("created_at", since30)),
    pv_draft: () => count(admin.from("purchase_vouchers_v2").select("id", head).eq("status", "draft")),
    stock_raw: async () => (await stock())["WH-RAW"]?.onHand ?? 0,
    stock_wip: async () => (await stock())["WH-WIP"]?.onHand ?? 0,
    stock_fg: async () => (await stock())["WH-FG"]?.onHand ?? 0,
    fg_reserved: async () => (await stock())["WH-FG"]?.reserved ?? 0,
  };

  const keys = Object.keys(jobs) as FlowMetricKey[];
  const results = await Promise.allSettled(keys.map((k) => jobs[k]()));
  const data: Partial<Record<FlowMetricKey, number | null>> = {};
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") data[keys[i]] = Math.round(r.value * 100) / 100;
    else { data[keys[i]] = null; failed.push(keys[i]); console.error(`[flow-map/health] ${keys[i]}:`, r.reason instanceof Error ? r.reason.message : r.reason); }
  });
  return NextResponse.json({ data, failed, at: new Date().toISOString(), error: null });
}
