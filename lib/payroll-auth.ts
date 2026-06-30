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

export type PayrollPerm = "employees.view" | "employees.create" | "employees.edit" | "payroll.calculate";

/**
 * คืน NextResponse error ถ้าไม่ผ่าน, null ถ้าผ่าน
 *
 * กัน 2 ชั้น: (1) ต้องมีสิทธิ์ "เข้าแอป Payroll" (app.payroll) ก่อนเสมอ — ตรงกับล็อกหน้าจอ
 * เพราะ employees.view ให้ staff/viewer ด้วย ถ้าเช็คแค่ perm นั้นพนักงานยิง API ตรงดึงข้อมูลได้
 * (2) เช็ค perm เฉพาะงานอีกชั้น (เช่น payroll.calculate). admin ผ่านทุกข้อ · เคารพ grant/revoke รายคน
 */
export async function guardPayroll(request: Request, perm: PayrollPerm = "employees.view"): Promise<NextResponse | null> {
  const sb = supabaseFromRequest(request);
  const [appRes, permRes] = await Promise.all([
    sb.rpc("erp_can", { p_permission: "app.payroll" }),
    sb.rpc("erp_can", { p_permission: perm }),
  ]);
  if (appRes.error || permRes.error) return NextResponse.json({ data: [], error: "ตรวจสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  if (appRes.data !== true) return NextResponse.json({ data: [], error: "ต้องมีสิทธิ์เข้าแอป Payroll — ติดต่อผู้ดูแลระบบ" }, { status: 401 });
  if (permRes.data !== true) return NextResponse.json({ data: [], error: `ต้องมีสิทธิ์ดูข้อมูลพนักงาน (${perm})` }, { status: 401 });
  return null;
}
