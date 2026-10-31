import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { loadPeriodRecheck } from "@/lib/payroll-period-recheck-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** ตรวจทั้งงวด — ที่มาของเงินทุกบาท + ตรวจอัตโนมัติ (อ่านอย่างเดียว) */
export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });
  try {
    const data = await loadPeriodRecheck(periodId);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ตรวจทั้งงวดไม่สำเร็จ" }, { status: 500 });
  }
}
