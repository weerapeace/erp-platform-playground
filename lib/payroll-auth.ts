/**
 * Payroll module — ตรวจสิทธิ์ API (ความปลอดภัย / สำคัญมาก)
 *
 * ข้อมูลเงินเดือน/พนักงานเป็นข้อมูลอ่อนไหว — ทุก API route ต้องเรียก guardPayroll()
 * ก่อนคืนข้อมูล กัน data หลุดให้คนที่ไม่ได้ล็อกอิน
 *
 * ใช้ supabaseFromRequest (forward JWT ผู้ใช้) + erp_can() (SECURITY DEFINER ตรวจ role)
 * — unauthenticated → auth.uid() null → erp_can คืน false → 401
 */
import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type PayrollPerm = "employees.view" | "employees.create" | "employees.edit";

/** คืน NextResponse error ถ้าไม่ผ่าน, null ถ้าผ่าน */
export async function guardPayroll(request: Request, perm: PayrollPerm = "employees.view"): Promise<NextResponse | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: perm });
  if (error) return NextResponse.json({ data: [], error: "ตรวจสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  if (data !== true) return NextResponse.json({ data: [], error: "ต้องเข้าสู่ระบบและมีสิทธิ์ดูข้อมูลพนักงาน (employees.view)" }, { status: 401 });
  return null;
}
