/**
 * /api/dashboard/executive — ศูนย์บัญชาการผู้บริหาร (ตัวเลขสุขภาพธุรกิจ)
 *
 * GET → RPC erp_executive_summary() (SECURITY DEFINER) ยิงครั้งเดียวได้ครบทุกด้าน:
 *       ยอดขาย / กำไรประมาณ / การเงิน (เจ้าหนี้-ลูกหนี้-เงินกู้-OD) / สต๊อก / งานค้าง
 *
 * ⚠️ ข้อมูลอ่อนไหว (เงิน/กำไร/หนี้) → gate เฉพาะ admin ที่ server (admin.users)
 *    ไม่พึ่งการซ่อนปุ่มฝั่ง client อย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ExecutiveSummary = {
  as_of: string;
  fx_rate: number;
  sales: { today: number; month: number; internal_month: number; marketplace_month: number };
  profit: { margin_pct: number; gross_est_month: number };
  finance: {
    ap_unpaid: number; ap_count: number;
    ar_due: number; ar_count: number;
    loan_outstanding: number; loan_due30: number;
    od_used: number; od_limit: number; od_interest: number;
  };
  stock: { value: number; low: number };
  ops: { pr_waiting: number; mo_active: number; mo_overdue: number; qc_defect: number };
};

export type ExecutiveResponse = { data: ExecutiveSummary | null; error: string | null };

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);

  // gate: เฉพาะ admin (ข้อมูลเงิน/กำไร/หนี้)
  const { data: allowed, error: canErr } = await supabase.rpc("erp_can", { p_permission: "admin.users" });
  if (canErr) return NextResponse.json({ data: null, error: canErr.message }, { status: 500 });
  if (allowed !== true) {
    return NextResponse.json({ data: null, error: "ไม่มีสิทธิ์ดูศูนย์บัญชาการผู้บริหาร" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("erp_executive_summary");
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json(
    { data: (data ?? null) as ExecutiveSummary | null, error: null },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
