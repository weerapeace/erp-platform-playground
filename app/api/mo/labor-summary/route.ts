/**
 * สรุปค่าแรงรายเดือน แยกตามช่าง — /api/mo/labor-summary?ym=YYYY-MM
 *
 * รวม 2 ทาง:
 *   1) งานผลิต  = ใบส่งงาน (wo_submissions) ที่ส่งในเดือนนั้น → จำนวนชิ้น + ค่าแรง
 *   2) งานเหมา  = mo_piecework ที่กด "เสร็จ" ในเดือนนั้น → rate × total_qty
 *
 * ตอบกลับ: รายคน (ชิ้น/เงิน/จำนวนใบ/รายการที่ยังไม่ใส่ค่าแรง) + ยอดรวมทั้งเดือน
 * ⚠️ ใบส่งงานที่ติ๊ก "รอลงวันที่/ค่าแรง" (info_pending) จะยังไม่มีเงิน — นับแยกให้เห็นว่าค้างกี่รายการ
 *
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LaborPerson = {
  name: string;
  dept: string | null;
  sub_count: number;      // จำนวนใบส่งงาน
  qty: number;            // ชิ้นที่ส่ง
  prod_wage: number;      // ค่าแรงงานผลิต
  piece_count: number;    // งานเหมาที่เสร็จ
  piece_wage: number;     // ค่าแรงงานเหมา
  total: number;
  pending: number;        // ใบส่งงานที่ยังไม่ใส่ค่าแรง/วันที่
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const ym = (request.nextUrl.searchParams.get("ym") ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: "ต้องระบุเดือนเป็น YYYY-MM" }, { status: 400 });

  // ช่วงเดือน — คิดแบบวันที่ล้วน (ไม่แปลง timezone) กันวันสุดท้ายของเดือนหาย
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const admin = supabaseAdmin();
  const [{ data: subs }, { data: pieces }] = await Promise.all([
    admin.from("wo_submissions")
      .select("craftsman_name, department_name, qty, wage, info_pending, submitted_at, sku, mo_no, wo_no")
      .gte("submitted_at", from).lt("submitted_at", nextM).limit(5000),
    admin.from("mo_piecework")
      .select("assignee_name, job_name, rate, total_qty, done_at, mo_no, status")
      .eq("is_active", true).eq("status", "done")
      .gte("done_at", from).lt("done_at", nextM).limit(5000),
  ]);

  const by = new Map<string, LaborPerson>();
  const get = (name: string, dept: string | null) => {
    const k = name || "— ไม่ระบุช่าง —";
    const cur = by.get(k) ?? { name: k, dept, sub_count: 0, qty: 0, prod_wage: 0, piece_count: 0, piece_wage: 0, total: 0, pending: 0 };
    if (!cur.dept && dept) cur.dept = dept;
    by.set(k, cur); return cur;
  };

  for (const s of (subs ?? []) as Record<string, unknown>[]) {
    const p = get(String(s.craftsman_name ?? ""), (s.department_name as string) ?? null);
    p.sub_count += 1;
    p.qty += Number(s.qty) || 0;
    p.prod_wage += Number(s.wage) || 0;
    if (s.info_pending || s.wage == null) p.pending += 1;
  }
  for (const q of (pieces ?? []) as Record<string, unknown>[]) {
    const p = get(String(q.assignee_name ?? ""), null);
    p.piece_count += 1;
    p.piece_wage += (Number(q.rate) || 0) * (Number(q.total_qty) || 0);
  }
  for (const p of by.values()) {
    p.prod_wage = r2(p.prod_wage); p.piece_wage = r2(p.piece_wage);
    p.total = r2(p.prod_wage + p.piece_wage);
  }

  const people = [...by.values()].sort((a, b) => b.total - a.total || b.qty - a.qty);
  const totals = people.reduce((t, p) => ({
    qty: t.qty + p.qty, prod_wage: r2(t.prod_wage + p.prod_wage), piece_wage: r2(t.piece_wage + p.piece_wage),
    total: r2(t.total + p.total), pending: t.pending + p.pending, sub_count: t.sub_count + p.sub_count,
  }), { qty: 0, prod_wage: 0, piece_wage: 0, total: 0, pending: 0, sub_count: 0 });

  return NextResponse.json({ ym, people, totals, error: null });
}
