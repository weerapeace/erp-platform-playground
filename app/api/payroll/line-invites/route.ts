/**
 * ออกบัตร QR "สมัครรับสลิปทาง LINE" ให้พนักงาน (หน้าพิมพ์ /print/payroll-line-invites)
 * POST { employee_ids: string[] } → { invites, skipped } · ต้องมีสิทธิ์แก้ข้อมูลพนักงาน · บันทึก audit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { issueLineInvites } from "@/lib/line-employee-portal-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.employee_ids) ? body.employee_ids.map(String) : [];
    let actor: { id?: string | null; name?: string | null } = {};
    try {
      const { data } = await supabaseFromRequest(req).auth.getUser();
      actor = { id: data.user?.id ?? null, name: data.user?.email ?? null };
    } catch {
      // ไม่รู้ผู้ทำ = บันทึก audit แบบไม่ระบุชื่อ
    }
    return NextResponse.json({ data: await issueLineInvites(ids, actor), error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "ออกบัตร QR ไม่สำเร็จ" }, { status: 400 });
  }
}
