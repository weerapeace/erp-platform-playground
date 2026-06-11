import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { saveAttendanceImportDraft, listAttendanceImportBatches } from "@/lib/payroll-attendance-import-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function actorFromRequest(req: NextRequest) {
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    return { id: data.user?.id ?? null, name: data.user?.email ?? null };
  } catch {
    return { id: null, name: null };
  }
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id") || req.nextUrl.searchParams.get("payroll_period_id") || "";
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });
  try {
    const data = await listAttendanceImportBatches(supabaseAdmin(), periodId);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "โหลด draft import ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json();
    const data = await saveAttendanceImportDraft(supabaseAdmin(), body, await actorFromRequest(req));
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึก draft import ไม่สำเร็จ" }, { status: 500 });
  }
}
