/**
 * Payroll — ประวัติการย้ายแผนกของพนักงาน
 * GET /api/payroll/board/history?employee_id=...  → ล่าสุดก่อน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DeptHistory = {
  id: string; from_department_name: string | null; to_department_name: string | null;
  moved_by_name: string | null; moved_at: string;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = await guardPayroll(req); if (denied) return denied;
  const employee_id = new URL(req.url).searchParams.get("employee_id") ?? "";
  if (!employee_id) return NextResponse.json({ data: [], error: "missing employee_id" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("employee_dept_history")
    .select("id, from_department_name, to_department_name, moved_by_name, moved_at")
    .eq("employee_id", employee_id).order("moved_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}
