/**
 * /api/reports/monthly — รายงานสรุปรายเดือน (ของกลาง): ผลิตต่อโต๊ะ / ขาย / ใบวางบิล / QC
 *
 * GET ?month=YYYY-MM-DD → RPC erp_monthly_report(p_month) (SECURITY DEFINER)
 * gate admin (มีข้อมูลเงิน: ยอดขาย/ใบวางบิล/ค่าแรง) — เหมือนหน้าผู้บริหาร
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MonthlyReport = {
  month: string;
  production: {
    workers: { worker: string; jobs: number; qty: number; wage: number }[];
    total_wage: number; total_qty: number; total_jobs: number;
  };
  sales: { orders: number; total: number; by_customer: { customer: string; orders: number; total: number }[] };
  billing: { notes: number; total: number; paid: number; unpaid: number };
  qc: { defects: number; defect_qty: number; by_type: { type: string; count: number; qty: number }[] };
};
export type MonthlyReportResponse = { data: MonthlyReport | null; error: string | null };

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);

  const { data: allowed, error: canErr } = await supabase.rpc("erp_can", { p_permission: "admin.users" });
  if (canErr) return NextResponse.json({ data: null, error: canErr.message }, { status: 500 });
  if (allowed !== true) return NextResponse.json({ data: null, error: "ไม่มีสิทธิ์ดูรายงานสรุป" }, { status: 403 });

  const month = new URL(request.url).searchParams.get("month");   // YYYY-MM-DD (วันใดก็ได้ในเดือน)
  if (!month) return NextResponse.json({ data: null, error: "ต้องระบุ month" }, { status: 400 });

  // ผ่าน gate admin แล้ว → เรียก RPC ผ่าน service-role (RPC ถูกจำกัดให้ service_role เท่านั้น)
  const { data, error } = await supabaseAdmin().rpc("erp_monthly_report", { p_month: month });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json(
    { data: (data ?? null) as MonthlyReport | null, error: null },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
