import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { getPayrollExportPreview } from "@/lib/payroll-export";
import { savePnd3AllocationOverrides, type SavePnd3AllocationRow } from "@/lib/payroll-pnd3-allocation-db";
import { savePnd3ExportRowOverrides, type SavePnd3ExportRowOverride } from "@/lib/payroll-pnd3-export-row-overrides-db";
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
    const periodId = req.nextUrl.searchParams.get("period_id") ?? "";
    if (!periodId) return NextResponse.json({ data: null, error: "ต้องเลือกงวดเงินเดือน" }, { status: 400 });
    const preview = await getPayrollExportPreview(periodId, "pnd3");
    return NextResponse.json({ data: preview.pnd3_allocation ?? null, error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "โหลดการกระจายยอด ภ.ง.ด.3 ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json();
    const periodId = String(body?.period_id ?? "");
    const rows = Array.isArray(body?.rows) ? (body.rows as SavePnd3AllocationRow[]) : [];
    const rowOverrides = Array.isArray(body?.row_overrides) ? (body.row_overrides as SavePnd3ExportRowOverride[]) : [];
    const actor = await actorFrom(req);
    await savePnd3AllocationOverrides(periodId, rows, actor);
    await savePnd3ExportRowOverrides(periodId, rowOverrides, actor);
    const preview = await getPayrollExportPreview(periodId, "pnd3");
    return NextResponse.json({ data: preview.pnd3_allocation ?? null, error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "บันทึกการกระจายยอด ภ.ง.ด.3 ไม่สำเร็จ" }, { status: 500 });
  }
}
