/**
 * Payroll — ผังพนักงาน (Board) Phase 2 — ย้ายแผนกแบบลากวาง
 * POST /api/payroll/board/move { employee_id, department_id|null }
 * อัปเดต employees.department_id (null = ไม่ระบุแผนก) + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(req).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const employee_id = String(body.employee_id ?? "");
  const department_id = body.department_id ? String(body.department_id) : null;
  if (!employee_id) return NextResponse.json({ error: "missing employee_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("employees").update({ department_id }).eq("id", employee_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "payroll.move_dept", entityType: "employees", entityId: employee_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { department_id } });
  return NextResponse.json({ error: null });
}
