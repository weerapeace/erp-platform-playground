import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { createPayrollRegisterRecurringItem, listPayrollRegisterRecurringItems } from "@/lib/payroll-register-recurring-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function actorFrom(req: NextRequest) {
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    return { actorId: data.user?.id ?? null, actorName: data.user?.email ?? null };
  } catch {
    return { actorId: null, actorName: null };
  }
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;
  try {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";
    const data = await listPayrollRegisterRecurringItems(includeInactive);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดคนนอกประจำทะเบียนเงินเดือนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json();
    const data = await createPayrollRegisterRecurringItem(body, await actorFrom(req));
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างคนนอกประจำทะเบียนเงินเดือนไม่สำเร็จ" }, { status: 500 });
  }
}
