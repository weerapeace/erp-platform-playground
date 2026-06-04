/**
 * ของกลาง — ตรวจสิทธิ์ API (ความปลอดภัย / สำคัญมาก)
 *
 * ปัญหาที่แก้: API กลาง master-v2 / master ใช้ supabaseAdmin (service-role, bypass RLS)
 * ดึงข้อมูลโดยไม่ตรวจ auth ที่ "ชั้น API" → เรียก URL ตรง ๆ โดยไม่ล็อกอินก็ได้ข้อมูล master หลุด
 * (parent_skus, skus, partners ฯลฯ). ทุก handler จึงต้องเรียก guardApi() ก่อนทำงาน
 *
 * วิธีทำงาน: ใช้ supabaseFromRequest (forward JWT ผู้ใช้) + erp_can() (SECURITY DEFINER ตรวจ role)
 *  - ไม่ล็อกอิน          → auth.uid() = null → erp_can คืน false → 401
 *  - ล็อกอินแต่ไม่มีสิทธิ์ → erp_can คืน false               → 401
 *  - ล็อกอินและมีสิทธิ์   → erp_can คืน true                 → ผ่าน (null)
 *
 * เป็น pattern เดียวกับ lib/payroll-auth.ts (guardPayroll) — ของกลางสำหรับโมดูล master
 */
import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

/** คืน NextResponse error ถ้าไม่ผ่าน (401/500), คืน null ถ้าผ่าน */
export async function guardApi(request: Request, permission: string): Promise<NextResponse | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: permission });
  if (error) return NextResponse.json({ data: [], error: "ตรวจสิทธิ์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (data !== true)
    return NextResponse.json(
      { data: [], error: `ต้องเข้าสู่ระบบและมีสิทธิ์ใช้งาน (${permission})` },
      { status: 401 },
    );
  return null;
}
