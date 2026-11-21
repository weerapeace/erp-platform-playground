import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { LINE_MEMBER_ACTIONS, listLineMembers, updateLineMemberStatus, type LineMemberAction } from "@/lib/line-employee-portal-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await listLineMembers(), error: null });
  } catch (e) {
    return NextResponse.json({ data: { linked: [], not_linked: [] }, error: e instanceof Error ? e.message : "Load LINE members failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    const action = String(body.action ?? "").trim() as LineMemberAction;
    if (!id || !LINE_MEMBER_ACTIONS.includes(action)) {
      return NextResponse.json({ data: null, error: "invalid action" }, { status: 400 });
    }
    // ชื่อคนกด = จากบัญชีที่ล็อกอิน (ไม่เชื่อชื่อที่หน้าเว็บส่งมา) — ใช้ลงประวัติ + "ยืนยันโดย"
    const { data: { user } } = await supabaseFromRequest(req).auth.getUser();
    const actor = user?.email || String(body.actor ?? "").trim() || null;
    return NextResponse.json({ data: await updateLineMemberStatus(id, action, actor), error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "Update LINE member failed" }, { status: 500 });
  }
}

