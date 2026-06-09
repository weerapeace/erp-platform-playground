import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  return NextResponse.json({
    data: { deleted: [], failed: [] },
    error: "ปุ่มลบงวดทดสอบแบบเก่าถูกยกเลิกแล้ว กรุณารีเฟรชหน้า แล้วใช้ปุ่ม \"ลบงวดพร้อมข้อมูลคำนวณ\" แทน",
  }, { status: 410 });
}
