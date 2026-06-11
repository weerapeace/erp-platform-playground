import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { getPayrollExportPreview, type PayrollExportType } from "@/lib/payroll-export";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TYPES = new Set<PayrollExportType>(["pnd3", "payroll_register"]);

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  const periodId = req.nextUrl.searchParams.get("period_id") ?? "";
  const type = (req.nextUrl.searchParams.get("type") ?? "payroll_register") as PayrollExportType;
  if (!periodId) return NextResponse.json({ error: "ต้องระบุงวดเงินเดือน" }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ error: "ประเภทไฟล์ไม่ถูกต้อง" }, { status: 400 });

  try {
    const data = await getPayrollExportPreview(periodId, type);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดรายการ export ไม่สำเร็จ" }, { status: 500 });
  }
}
