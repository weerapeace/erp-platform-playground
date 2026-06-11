import { NextRequest, NextResponse } from "next/server";
import { deleteAttendanceImportDraft, getAttendanceImportBatch } from "@/lib/payroll-attendance-import-db";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

async function actorFromRequest(req: NextRequest) {
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    return { id: data.user?.id ?? null, name: data.user?.email ?? null };
  } catch {
    return { id: null, name: null };
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const data = await getAttendanceImportBatch(supabaseAdmin(), id);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "โหลด draft import ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const data = await deleteAttendanceImportDraft(supabaseAdmin(), id, await actorFromRequest(req));
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ลบ draft import ไม่สำเร็จ" }, { status: 500 });
  }
}
