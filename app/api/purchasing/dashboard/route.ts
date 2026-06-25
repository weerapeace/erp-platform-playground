/**
 * GET /api/purchasing/dashboard — สรุปตัวเลขแดชบอร์ดจัดซื้อ "ในคำขอเดียว"
 * (รวม KPI + กราฟรายเดือน + สถานะ PR + ร้านค้า + รายการรออนุมัติ → ลด round-trip ฝั่ง client)
 *
 * มูลค่าทุกตัวแปลงเป็น "บาท" — PO สกุล RMB/YUAN คูณเรตหยวนล่าสุด (daily_rates)
 * นับเฉพาะ PO ที่ commit แล้ว (ตัด draft/cancelled) สำหรับยอดซื้อ/ร้านค้า/รอจ่าย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { timeRoute } from "@/lib/api-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => { const s = String(c ?? "").toUpperCase(); return s === "RMB" || s === "YUAN" || s === "CNY"; };
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

async function _GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  // เรตหยวน→บาท ล่าสุด (ไว้แปลง PO สกุลหยวนเป็นบาท)
  // perf: ยิง query ทั้งหมดพร้อมกัน (Promise.all) → เวลา = query ช้าสุด ไม่ใช่ผลรวม (กันเด้งไป Tokyo ทีละตัว)
  const [rateRes, prRes, poRes, lineRes] = await Promise.all([
    admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("purchase_requests_v2").select("id, status, requester, price_est, currency, seller_name, created_at, order_date").limit(5000),
    admin.from("purchase_orders_v2").select("status, payment_status, currency, grand_total, seller_name, order_date").limit(5000),
    admin.from("purchase_order_lines_v2").select("qty, qty_received, line_status").limit(20000),
  ]);
  const rmbRate = num((rateRes.data as { rate?: number } | null)?.rate) || 5;
  const toThb = (amount: number, currency: unknown) => amount * (isCNY(currency) ? rmbRate : 1);

  // ── ใบขอซื้อ (PR): สถานะ + รายการรออนุมัติ ──
  const prRows = (prRes.data ?? []) as Record<string, unknown>[];

  const prStatusCounts: Record<string, number> = {};
  for (const p of prRows) { const s = String(p.status ?? "unknown"); prStatusCounts[s] = (prStatusCounts[s] ?? 0) + 1; }

  const waitingList = prRows
    .filter((p) => p.status === "waiting")
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 8)
    .map((p) => ({
      id: String(p.id),
      requester: (p.requester as string) ?? "—",
      seller_name: (p.seller_name as string) ?? null,
      amount_thb: Math.round(toThb(num(p.price_est), p.currency)),
      created_at: (p.created_at as string) ?? null,
    }));

  // ── ใบสั่งซื้อ (PO): ยอดซื้อ / รอจ่าย / รายเดือน / ร้านค้า ──
  const poRows = (poRes.data ?? []) as Record<string, unknown>[];
  const committed = poRows.filter((p) => p.status !== "draft" && p.status !== "cancelled");

  const now = new Date();
  const thisMonth = monthKey(now);
  // 6 เดือนล่าสุด (เก่า→ใหม่)
  const months: { key: string; label: string; thb: number; po_count: number; pr_count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: monthKey(d), label: TH_MONTH[d.getUTCMonth()], thb: 0, po_count: 0, pr_count: 0 });
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  // จำนวนใบขอซื้อ (PR) ต่อเดือน — ตามวันที่สร้าง
  for (const p of prRows) {
    const cd = p.created_at ? new Date(String(p.created_at)) : null;
    const mk = cd && !isNaN(cd.getTime()) ? monthKey(cd) : null;
    if (mk && monthIdx.has(mk)) months[monthIdx.get(mk)!].pr_count++;
  }

  let spendThisMonth = 0;
  let unpaidSum = 0;
  const bySeller = new Map<string, number>();
  for (const p of committed) {
    const thb = toThb(num(p.grand_total), p.currency);
    const od = p.order_date ? new Date(String(p.order_date) + "T00:00:00Z") : null;
    const mk = od && !isNaN(od.getTime()) ? monthKey(od) : null;
    if (mk === thisMonth) spendThisMonth += thb;
    if (mk && monthIdx.has(mk)) { const mi = monthIdx.get(mk)!; months[mi].thb += thb; months[mi].po_count++; }
    if (p.payment_status === "unpaid") unpaidSum += thb;
    const seller = (p.seller_name as string) || "—";
    bySeller.set(seller, (bySeller.get(seller) ?? 0) + thb);
  }
  const topSuppliers = [...bySeller.entries()]
    .map(([name, thb]) => ({ name, thb: Math.round(thb) }))
    .sort((a, b) => b.thb - a.thb)
    .slice(0, 5);

  // ── ค้างรับเข้า: บรรทัด PO ที่ยังรับไม่ครบ + ยังไม่ปิด (lines ดึงมาพร้อมกันแล้วด้านบน) ──
  let pendingReceive = 0;
  for (const l of (lineRes.data ?? []) as Record<string, unknown>[]) {
    const st = l.line_status as string | null;
    if (st === "received" || st === "short_closed") continue;
    if (Math.max(0, num(l.qty) - num(l.qty_received)) > 0) pendingReceive++;
  }

  return NextResponse.json({
    error: null,
    rmb_rate: rmbRate,
    kpi: {
      waiting: prStatusCounts["waiting"] ?? 0,
      pending_receive: pendingReceive,
      unpaid_thb: Math.round(unpaidSum),
      spend_this_month_thb: Math.round(spendThisMonth),
    },
    pr_status: prStatusCounts,
    monthly: months,            // [{key,label,thb}] เก่า→ใหม่
    top_suppliers: topSuppliers, // [{name,thb}]
    waiting_list: waitingList,   // [{id,requester,seller_name,amount_thb,created_at}]
  });
}

export const GET = timeRoute("purchasing:dashboard", _GET as any) as any;
