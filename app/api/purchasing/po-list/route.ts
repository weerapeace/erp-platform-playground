/**
 * GET /api/purchasing/po-list — รายการใบสั่งซื้อทั้งหมด (สำหรับหน้า /purchasing/po-list)
 *
 * คืนทุกอย่างที่ตารางต้องใช้ในคำขอเดียว (ตาม [[perf_contention_load_order]] — อย่ายิงหลายรอบ):
 *   เลขที่ · ร้าน · วันสั่ง · สถานะรับของ · สถานะจ่าย · ยอด+สกุล · ยอดบาท · วันครบกำหนดจ่าย · จำนวนรายการ
 *
 * วันครบกำหนดจ่าย: ถ้าใบยังไม่ได้ตั้งเอง → คิดสดจาก "เครดิตร้าน" (ของกลาง lib/credit-term)
 * เหมือนปฏิทินจัดซื้อเป๊ะ ๆ → แก้เครดิตที่ร้าน ทุกใบขยับตาม (auto_due = true)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { computeDueDate } from "@/lib/credit-term";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type PoListRow = {
  id: string;
  po_no: string;
  seller: string | null;
  seller_partner_id: string | null;
  order_date: string | null;
  currency: string | null;
  grand_total: number;
  amount_thb: number;
  /** สถานะรับของรวมทั้งใบ: draft | confirmed | partial | received | ... */
  status: string | null;
  /** สรุปเป็นภาษาคน: ร่าง / รอรับของ / รับบางส่วน / รับครบแล้ว */
  receive_label: string;
  payment_status: string | null;
  paid_date: string | null;
  payment_due_date: string | null;
  /** true = วันครบกำหนดคิดจากเครดิตร้านอัตโนมัติ (ยังไม่ได้ตั้งเอง) */
  auto_due: boolean;
  expected_date: string | null;
  line_count: number;
  received_lines: number;
  note: string | null;
};

/** สถานะรับของเป็นภาษาคน — เผื่อค่าจากระบบเก่า (เจอจริงในข้อมูล: draft / purchase / partial) */
function receiveLabel(status: string | null, lineCount: number, receivedLines: number): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "received") return "รับครบแล้ว";
  if (s === "partial") return "รับบางส่วน";
  if (s === "cancelled") return "ยกเลิก";
  if (lineCount > 0 && receivedLines >= lineCount) return "รับครบแล้ว";
  if (receivedLines > 0) return "รับบางส่วน";
  if (s === "draft") return "ร่าง";
  return "รอรับของ";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  const admin = supabaseAdmin();
  const url = new URL(request.url);
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit")) || 500));

  const [poRes, lineRes, partnerRes, rateRes] = await Promise.all([
    admin.from("purchase_orders_v2")
      .select("id, po_no, seller_name, seller_partner_id, order_date, currency, grand_total, status, payment_status, paid_date, payment_due_date, expected_date, note")
      .order("order_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    admin.from("purchase_order_lines_v2").select("po_id, qty, qty_received, line_status, is_active"),
    admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active, purchase_credit_term"),
    admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (poRes.error) return NextResponse.json({ data: [], error: poRes.error.message }, { status: 500 });

  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  // นับบรรทัด/บรรทัดที่รับครบ ต่อใบ
  const lineCount = new Map<string, number>();
  const doneCount = new Map<string, number>();
  for (const l of ((lineRes.data ?? []) as Record<string, unknown>[])) {
    if (l.is_active === false) continue;
    const k = String(l.po_id);
    lineCount.set(k, (lineCount.get(k) ?? 0) + 1);
    const st = String(l.line_status ?? "");
    const remain = num(l.qty) - num(l.qty_received);
    // รองรับทั้ง short_closed และ closed_short (ข้อมูลจริงมีทั้งสองแบบ)
    if (st === "received" || st === "short_closed" || st === "closed_short" || remain <= 0) {
      doneCount.set(k, (doneCount.get(k) ?? 0) + 1);
    }
  }

  // เครดิตร้าน — จับคู่ด้วยของกลาง (po ไม่มี FK เสมอไป จึงต้องจับจากชื่อด้วย)
  const partners = (partnerRes.data ?? []) as Record<string, unknown>[];
  const matcher = buildPartnerMatcher(partners as unknown as PartnerLike[]);
  const termById = new Map<string, string | null>();
  for (const p of partners) termById.set(String(p.id), (p.purchase_credit_term as string) ?? null);

  const rows: PoListRow[] = ((poRes.data ?? []) as Record<string, unknown>[]).map((p) => {
    const id = String(p.id);
    const lc = lineCount.get(id) ?? 0;
    const dc = doneCount.get(id) ?? 0;
    const total = num(p.grand_total);

    const partnerId = (p.seller_partner_id as string) ?? matcher.match(String(p.seller_name ?? ""))?.id ?? null;
    const term = partnerId ? termById.get(partnerId) ?? null : null;

    const ownDue = (p.payment_due_date as string) ?? null;
    const autoDue = !ownDue ? computeDueDate((p.order_date as string) ?? null, term) : null;

    return {
      id,
      po_no: String(p.po_no ?? "—"),
      seller: (p.seller_name as string) ?? null,
      seller_partner_id: partnerId,
      order_date: (p.order_date as string) ?? null,
      currency: (p.currency as string) ?? null,
      grand_total: total,
      amount_thb: Math.round(total * (isCNY(p.currency) ? rmb : 1)),
      status: (p.status as string) ?? null,
      receive_label: receiveLabel((p.status as string) ?? null, lc, dc),
      payment_status: (p.payment_status as string) ?? null,
      paid_date: (p.paid_date as string) ?? null,
      payment_due_date: ownDue ?? autoDue,
      auto_due: !ownDue && !!autoDue,
      expected_date: (p.expected_date as string) ?? null,
      line_count: lc,
      received_lines: dc,
      note: (p.note as string) ?? null,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
