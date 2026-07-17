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

// แคชผล erp_can ใน isolate (token+permission) อายุสั้น ~15วิ — ลดการยิง RPC ตรวจสิทธิ์ซ้ำทุก API call
// (1 หน้าเรียกหลาย endpoint ด้วยสิทธิ์เดิม → เดิมยิง erp_can ทุกครั้ง = หลายรอบ Supabase ที่โตเกียว)
const canCache = new Map<string, { at: number; ok: boolean }>();
const CAN_TTL = 15000;

function deny(permission: string) {
  return NextResponse.json({ data: [], error: `ต้องเข้าสู่ระบบและมีสิทธิ์ใช้งาน (${permission})` }, { status: 401 });
}

/**
 * เช็คสิทธิ์แบบคืน boolean (ไม่คืน response) — ใช้ตอนต้องตัดสินใจต่อ เช่น
 * "รายการงานต้องมีสิทธิ์ edit แต่รายการส่วนตัวของตัวเองใช้แค่ view ก็แก้ได้"
 * แชร์ cache เดียวกับ guardApi
 */
export async function apiCan(request: Request, permission: string): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const cacheKey = token ? `${token}|${permission}` : "";

  if (cacheKey) {
    const hit = canCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CAN_TTL) return hit.ok;
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: permission });
  if (error) return false;
  const ok = data === true;

  if (cacheKey) {
    if (canCache.size > 500) { const now = Date.now(); for (const [k, v] of canCache) if (now - v.at > CAN_TTL) canCache.delete(k); } // กันบวม
    canCache.set(cacheKey, { at: Date.now(), ok });
  }
  return ok;
}

/** คืน NextResponse error ถ้าไม่ผ่าน (401/500), คืน null ถ้าผ่าน */
export async function guardApi(request: Request, permission: string): Promise<NextResponse | null> {
  const ok = await apiCan(request, permission);
  return ok ? null : deny(permission);
}
