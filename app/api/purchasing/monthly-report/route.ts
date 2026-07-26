/**
 * GET /api/purchasing/monthly-report?month=YYYY-MM — ข้อมูลรายงานจัดซื้อรายเดือน (สำหรับหน้าพิมพ์)
 *   สรุป: ยอดซื้อ · จำนวนใบ · จ่ายแล้ว/ยังไม่จ่าย · รับเข้าแล้ว/ยังไม่รับเข้า
 *   แยกตามร้าน + รายการใบสั่งซื้อทั้งเดือน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type MonthlyPo = {
  id: string; po_no: string; seller: string | null; order_date: string | null;
  amount_thb: number; currency: string | null;
  payment_status: string | null; paid_date: string | null; paid_amount_thb: number | null;
  lines: number; received_lines: number;
};
export type MonthlySummary = {
  po_count: number; total_thb: number;
  paid_count: number; paid_thb: number;
  unpaid_count: number; unpaid_thb: number;
  received_lines: number; pending_receive_lines: number;
  paid_invoiced_thb: number;   // ยอด "ตามใบ" ของใบที่จ่ายแล้ว (ไว้เทียบกับยอดจ่ายจริง)
};
export type MonthlyReport = {
  month: string;
  summary: MonthlySummary;
  prev: { month: string; total_thb: number; po_count: number } | null;   // เดือนก่อน (ไว้เทียบ)
  by_seller: { name: string; po_count: number; thb: number }[];
  pos: MonthlyPo[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const month = (sp.get("month") ?? "").match(/^\d{4}-\d{2}$/) ? sp.get("month")! : new Date().toISOString().slice(0, 7);
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  // วันที่ 1 ของเดือนถัดไป — ต้องใช้ Date.UTC ไม่งั้นเวลาไทย (UTC+7) ทำให้ร่นไป 1 วัน = ใบวันสุดท้ายของเดือนหาย
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const admin = supabaseAdmin();
  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  const { data, error } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, grand_total, currency, order_date, payment_status, paid_date, paid_amount_thb, status, is_active")
    .gte("order_date", from).lt("order_date", to)
    .neq("status", "draft").neq("status", "cancelled")
    .order("order_date", { ascending: true }).limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ตัดใบที่ถูกปิดใช้งาน (is_active=false) — กรองใน JS เพื่อไม่ให้ row ที่ค่าเป็น null หลุดหาย
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((p) => p.is_active !== false);
  const poIds = rows.map((p) => String(p.id));

  // นับบรรทัด + บรรทัดที่รับครบแล้ว ต่อใบ
  const lineStat = new Map<string, { total: number; received: number }>();
  for (let i = 0; i < poIds.length; i += 200) {
    const { data: ls } = await admin.from("purchase_order_lines_v2")
      .select("po_id, qty, qty_received, line_status, is_active").in("po_id", poIds.slice(i, i + 200));
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
      if (l.is_active === false) continue;
      const k = String(l.po_id);
      const st = lineStat.get(k) ?? { total: 0, received: 0 }; lineStat.set(k, st);
      st.total++;
      // สถานะจริงในฐานข้อมูลคือ "closed_short" (เผื่อ short_closed ไว้ด้วยกันพลาด)
      const closed = l.line_status === "received" || l.line_status === "closed_short" || l.line_status === "short_closed";
      const remain = Math.max(0, num(l.qty) - num(l.qty_received));
      if (closed || (remain === 0 && num(l.qty) > 0)) st.received++;
    }
  }

  const pos: MonthlyPo[] = rows.map((p) => {
    const st = lineStat.get(String(p.id)) ?? { total: 0, received: 0 };
    return {
      id: String(p.id), po_no: String(p.po_no ?? "—"), seller: (p.seller_name as string) ?? null,
      order_date: (p.order_date as string) ?? null,
      amount_thb: Math.round(num(p.grand_total) * (isCNY(p.currency) ? rmb : 1)),
      currency: (p.currency as string) ?? null,
      payment_status: (p.payment_status as string) ?? null,
      paid_date: (p.paid_date as string) ?? null,
      paid_amount_thb: p.paid_amount_thb == null ? null : num(p.paid_amount_thb),
      lines: st.total, received_lines: st.received,
    };
  });

  const summary: MonthlySummary = pos.reduce((a, p) => {
    a.po_count++; a.total_thb += p.amount_thb;
    if (p.payment_status === "paid") {
      a.paid_count++;
      a.paid_thb += p.paid_amount_thb ?? p.amount_thb;   // ยอดจ่ายจริง (ไม่มีก็ใช้ยอดตามใบ)
      a.paid_invoiced_thb += p.amount_thb;                // ยอดตามใบของกลุ่มที่จ่ายแล้ว
    } else { a.unpaid_count++; a.unpaid_thb += p.amount_thb; }
    a.received_lines += p.received_lines;
    a.pending_receive_lines += Math.max(0, p.lines - p.received_lines);
    return a;
  }, { po_count: 0, total_thb: 0, paid_count: 0, paid_thb: 0, unpaid_count: 0, unpaid_thb: 0, received_lines: 0, pending_receive_lines: 0, paid_invoiced_thb: 0 });

  // เดือนก่อน (ยอดรวม + จำนวนใบ) — ไว้เทียบว่าเดือนนี้ซื้อมากขึ้น/น้อยลง
  const prevFrom = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const { data: prevData } = await admin.from("purchase_orders_v2")
    .select("grand_total, currency, is_active")
    .gte("order_date", prevFrom).lt("order_date", from)
    .neq("status", "draft").neq("status", "cancelled").limit(2000);
  const prevRows = ((prevData ?? []) as Record<string, unknown>[]).filter((p) => p.is_active !== false);
  const prev = {
    month: prevFrom.slice(0, 7),
    po_count: prevRows.length,
    total_thb: Math.round(prevRows.reduce((a, p) => a + num(p.grand_total) * (isCNY(p.currency) ? rmb : 1), 0)),
  };

  const sellerMap = new Map<string, { po_count: number; thb: number }>();
  for (const p of pos) {
    const k = p.seller || "— ไม่ระบุร้าน —";
    const e = sellerMap.get(k) ?? { po_count: 0, thb: 0 }; sellerMap.set(k, e);
    e.po_count++; e.thb += p.amount_thb;
  }
  const by_seller = [...sellerMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.thb - a.thb);

  const report: MonthlyReport = { month, summary, prev, by_seller, pos };
  return NextResponse.json({ data: report, error: null });
}
