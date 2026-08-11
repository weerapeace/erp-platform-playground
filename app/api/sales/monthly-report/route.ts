/**
 * GET /api/sales/monthly-report?month=YYYY-MM — ข้อมูลสรุปยอดขายรายเดือน
 *
 * ใช้โดยหน้า /sales/monthly (ดูบนจอ + พิมพ์/PDF)
 * สรุป: ยอดขาย · จำนวนใบ · ก่อนภาษี/VAT/หัก ณ ที่จ่าย · วางบิลแล้ว/ยังไม่วางบิล
 *       แยกตามลูกค้า · พนักงานขาย · สถานะ · สินค้าขายดี · รายวัน · รายการใบขายทั้งเดือน
 *
 * กติกาการนับ (ให้ตรงกับแดชบอร์ดขาย):
 *   - เดือน = order_date (วันที่สั่ง)
 *   - "ยอดขายรวม" ไม่นับใบยกเลิก (แต่ยังรายงานยอดยกเลิกแยกให้ดู)
 *   - "ยืนยันแล้ว" = สถานะ confirmed ขึ้นไป (ของจริง) · "ร่าง" แยกออกมาให้เห็นชัด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { SO_ACTIVE_STATUSES } from "@/lib/so-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** บรรทัดสินค้าในใบขาย (ใช้ตอนเปิด "แสดงรายการสินค้าในแต่ละใบ") */
export type SalesMonthlyLine = {
  sku: string | null;
  name: string;
  qty: number;
  unit: string | null;
  unit_price: number;
  amount: number;       // ยอดหลังส่วนลด ก่อน VAT
};

export type SalesMonthlyRow = {
  id: string;
  so_number: string | null;
  order_date: string | null;
  customer_name: string | null;
  customer_code: string | null;
  sale_person_name: string | null;
  status: string;
  taxable: number;      // ยอดก่อนภาษี
  vat: number;
  wht: number;
  grand_total: number;
  lines: number;
  items: SalesMonthlyLine[];
  billed: boolean;      // อยู่ในใบวางบิลที่ไม่ถูกยกเลิกแล้วหรือยัง
};

export type SalesMonthlySummary = {
  n: number; amt: number;                       // ไม่รวมยกเลิก
  confirmed_n: number; confirmed_amt: number;   // ยืนยันขึ้นไป
  draft_n: number; draft_amt: number;
  cancelled_n: number; cancelled_amt: number;
  taxable: number; vat: number; wht: number;    // ของกลุ่มที่ไม่ยกเลิก
  avg: number;                                  // เฉลี่ยต่อใบ
  billed_n: number; billed_amt: number;
  unbilled_n: number; unbilled_amt: number;     // ยืนยันแล้วแต่ยังไม่อยู่ในใบวางบิล
  customers: number; skus: number; qty: number;
};

export type SalesMonthlyReport = {
  month: string;
  summary: SalesMonthlySummary;
  prev: { month: string; n: number; amt: number } | null;
  daily: { d: number; amt: number; n: number }[];
  by_customer: { name: string; code: string | null; n: number; amt: number }[];
  by_sales: { name: string; n: number; amt: number }[];
  by_status: { status: string; n: number; amt: number }[];
  top_products: { sku: string | null; name: string; qty: number; unit: string | null; amt: number }[];
  rows: SalesMonthlyRow[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const month = (sp.get("month") ?? "").match(/^\d{4}-\d{2}$/) ? sp.get("month")! : new Date().toISOString().slice(0, 7);
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  // ต้องใช้ Date.UTC — ถ้าใช้ new Date(y, m, 1) ในเวลาไทย (UTC+7) จะร่นไป 1 วัน = ใบวันสุดท้ายของเดือนหาย
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);

  const admin = supabaseAdmin();

  const { data, error } = await admin.from("erp_playground_sales_orders")
    .select("id, so_number, order_date, customer_name, customer_code, sale_person_name, status, taxable, total_vat, total_wht, grand_total")
    .gte("order_date", from).lt("order_date", to)
    .order("order_date", { ascending: true }).limit(3000);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const soRows = (data ?? []) as Record<string, unknown>[];
  const soIds = soRows.map(s => String(s.id));
  // ใบที่ยกเลิกไม่ควรถูกนับเป็น "สินค้าขายดี" — เก็บสถานะไว้กรองตอนรวมบรรทัด
  const cancelledIds = new Set(soRows.filter(s => s.status === "cancelled").map(s => String(s.id)));

  // ---- บรรทัดสินค้า: รายการต่อใบ + สินค้าขายดี (ไม่นับใบยกเลิก) ----
  const itemsBySo = new Map<string, SalesMonthlyLine[]>();
  const prodMap = new Map<string, { sku: string | null; name: string; qty: number; unit: string | null; amt: number }>();
  let totalQty = 0;
  for (let i = 0; i < soIds.length; i += 200) {
    const { data: ls } = await admin.from("erp_playground_so_lines")
      .select("so_id, sku, product_name, qty, unit, unit_price, net_amount, sort_order")
      .in("so_id", soIds.slice(i, i + 200))
      .order("sort_order", { ascending: true });
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
      const soId = String(l.so_id);
      const bucket = itemsBySo.get(soId) ?? []; itemsBySo.set(soId, bucket);
      bucket.push({
        sku: (l.sku as string) ?? null, name: String(l.product_name ?? "(ไม่ระบุ)"),
        qty: num(l.qty), unit: (l.unit as string) ?? null,
        unit_price: num(l.unit_price), amount: num(l.net_amount),
      });
      if (cancelledIds.has(soId)) continue;
      const key = String(l.sku ?? "").trim() || String(l.product_name ?? "(ไม่ระบุ)");
      const e = prodMap.get(key) ?? {
        sku: (l.sku as string) ?? null, name: String(l.product_name ?? key), qty: 0, unit: (l.unit as string) ?? null, amt: 0,
      };
      prodMap.set(key, e);
      e.qty += num(l.qty); e.amt += num(l.net_amount);
      totalQty += num(l.qty);
    }
  }

  // ---- วางบิลแล้วหรือยัง (อยู่ในใบวางบิลที่ยังไม่ถูกยกเลิก) ----
  const billedSoIds = new Set<string>();
  const bnLines: { so_id: string; billing_note_id: string }[] = [];
  for (let i = 0; i < soIds.length; i += 200) {
    const { data: bl } = await admin.from("erp_playground_billing_note_lines")
      .select("so_id, billing_note_id").in("so_id", soIds.slice(i, i + 200));
    for (const r of (bl ?? []) as Record<string, unknown>[]) {
      bnLines.push({ so_id: String(r.so_id), billing_note_id: String(r.billing_note_id) });
    }
  }
  if (bnLines.length) {
    const noteIds = [...new Set(bnLines.map(b => b.billing_note_id))];
    const liveNotes = new Set<string>();
    for (let i = 0; i < noteIds.length; i += 200) {
      const { data: bn } = await admin.from("erp_playground_billing_notes")
        .select("id, status").in("id", noteIds.slice(i, i + 200));
      for (const n of (bn ?? []) as Record<string, unknown>[]) {
        if (n.status !== "cancelled") liveNotes.add(String(n.id));
      }
    }
    for (const b of bnLines) if (liveNotes.has(b.billing_note_id)) billedSoIds.add(b.so_id);
  }

  const rows: SalesMonthlyRow[] = soRows.map(s => ({
    id: String(s.id),
    so_number: (s.so_number as string) ?? null,
    order_date: (s.order_date as string) ?? null,
    customer_name: (s.customer_name as string) ?? null,
    customer_code: (s.customer_code as string) ?? null,
    sale_person_name: (s.sale_person_name as string) ?? null,
    status: String(s.status ?? "draft"),
    taxable: num(s.taxable),
    vat: num(s.total_vat),
    wht: num(s.total_wht),
    grand_total: num(s.grand_total),
    lines: (itemsBySo.get(String(s.id)) ?? []).length,
    items: itemsBySo.get(String(s.id)) ?? [],
    billed: billedSoIds.has(String(s.id)),
  }));

  // ---- สรุป ----
  const active = rows.filter(r => r.status !== "cancelled");
  const confirmed = rows.filter(r => (SO_ACTIVE_STATUSES as string[]).includes(r.status));
  const drafts = rows.filter(r => r.status === "draft");
  const cancelled = rows.filter(r => r.status === "cancelled");
  const billed = confirmed.filter(r => r.billed);
  const unbilled = confirmed.filter(r => !r.billed);
  const sum = (list: SalesMonthlyRow[], f: (r: SalesMonthlyRow) => number) => list.reduce((a, r) => a + f(r), 0);

  const summary: SalesMonthlySummary = {
    n: active.length, amt: sum(active, r => r.grand_total),
    confirmed_n: confirmed.length, confirmed_amt: sum(confirmed, r => r.grand_total),
    draft_n: drafts.length, draft_amt: sum(drafts, r => r.grand_total),
    cancelled_n: cancelled.length, cancelled_amt: sum(cancelled, r => r.grand_total),
    taxable: sum(active, r => r.taxable), vat: sum(active, r => r.vat), wht: sum(active, r => r.wht),
    avg: active.length ? sum(active, r => r.grand_total) / active.length : 0,
    billed_n: billed.length, billed_amt: sum(billed, r => r.grand_total),
    unbilled_n: unbilled.length, unbilled_amt: sum(unbilled, r => r.grand_total),
    customers: new Set(active.map(r => r.customer_name ?? "")).size,
    skus: prodMap.size, qty: totalQty,
  };

  // ---- เดือนก่อน (ไว้เทียบ) ----
  const { data: prevData } = await admin.from("erp_playground_sales_orders")
    .select("grand_total, status").gte("order_date", prevFrom).lt("order_date", from).limit(3000);
  const prevRows = ((prevData ?? []) as Record<string, unknown>[]).filter(p => p.status !== "cancelled");
  const prev = {
    month: prevFrom.slice(0, 7),
    n: prevRows.length,
    amt: prevRows.reduce((a, p) => a + num(p.grand_total), 0),
  };

  // ---- รายวัน (ทุกวันในเดือน แม้ไม่มียอด เพื่อให้กราฟเต็มเดือน) ----
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({ d: i + 1, amt: 0, n: 0 }));
  for (const r of active) {
    const d = Number((r.order_date ?? "").slice(8, 10));
    if (d >= 1 && d <= daysInMonth) { daily[d - 1].amt += r.grand_total; daily[d - 1].n++; }
  }

  // ---- แยกกลุ่ม ----
  const groupBy = <T,>(list: SalesMonthlyRow[], key: (r: SalesMonthlyRow) => string, make: (r: SalesMonthlyRow) => T) => {
    const map = new Map<string, T & { n: number; amt: number }>();
    for (const r of list) {
      const k = key(r);
      const e = map.get(k) ?? { ...make(r), n: 0, amt: 0 };
      map.set(k, e); e.n++; e.amt += r.grand_total;
    }
    return [...map.values()].sort((a, b) => b.amt - a.amt);
  };

  const by_customer = groupBy(active, r => r.customer_name ?? "(ไม่ระบุ)",
    r => ({ name: r.customer_name ?? "(ไม่ระบุ)", code: r.customer_code ?? null }));
  const by_sales = groupBy(active, r => r.sale_person_name ?? "(ไม่ระบุ)",
    r => ({ name: r.sale_person_name ?? "(ไม่ระบุ)" }));
  const by_status = groupBy(rows, r => r.status, r => ({ status: r.status }));

  const top_products = [...prodMap.values()].sort((a, b) => b.amt - a.amt).slice(0, 20);

  const report: SalesMonthlyReport = {
    month, summary, prev, daily, by_customer, by_sales, by_status, top_products,
    rows: rows.sort((a, b) => (a.order_date ?? "").localeCompare(b.order_date ?? "") || (a.so_number ?? "").localeCompare(b.so_number ?? "")),
  };
  return NextResponse.json({ data: report, error: null });
}
