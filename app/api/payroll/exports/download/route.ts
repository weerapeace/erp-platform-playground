import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import {
  auditPayrollExport,
  buildPayrollExportWorkbook,
  payrollExportFilename,
  type PayrollExportType,
} from "@/lib/payroll-export";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TYPES = new Set<PayrollExportType>(["pnd3", "payroll_register"]);

async function actorFrom(req: NextRequest) {
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    return { actorId: data.user?.id ?? null, actorName: data.user?.email ?? null };
  } catch {
    return { actorId: null, actorName: null };
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;

  let body: { period_id?: string; type?: PayrollExportType; payment_date?: string; employee_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  }

  const periodId = body.period_id ?? "";
  const type = (body.type ?? "payroll_register") as PayrollExportType;
  const employeeIds = Array.isArray(body.employee_ids) ? body.employee_ids.filter(Boolean) : [];
  if (!periodId) return NextResponse.json({ error: "ต้องระบุงวดเงินเดือน" }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ error: "ประเภทไฟล์ไม่ถูกต้อง" }, { status: 400 });

  try {
    const actor = await actorFrom(req);
    const result = await buildPayrollExportWorkbook(periodId, type, body.payment_date ?? "", employeeIds);
    await auditPayrollExport(periodId, type, result.rows.length, actor, {
      period_name: result.preview.period.period_name,
      run_id: result.preview.run?.id ?? null,
      selected_count: employeeIds.length,
      totals: result.totals,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(payrollExportFilename(result.preview.period.period_name, type))}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างไฟล์ Excel ไม่สำเร็จ" }, { status: 500 });
  }
}
