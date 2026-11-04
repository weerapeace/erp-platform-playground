/**
 * 🟢 กลุ่ม LINE ที่บอทอยู่ (ให้หน้าแก้ไขรายงานเลือกปลายทาง) — GET /api/admin/email-reports/line
 * → { has_token, groups: [{ id, name, members, reachable, uses }] } · ถามชื่อกลุ่มจาก LINE (อ่านอย่างเดียว ไม่ส่งข้อความ)
 * ใช้ตัวกลาง lib/line-intake loadLineGroupSetup (กลุ่มที่ระบบรู้จัก = กลุ่มของทุกระบบในศูนย์ LINE + กลุ่มล่าสุดที่บอทเห็น)
 * สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadLineGroupSetup } from "@/lib/line-intake";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  try {
    const setup = await loadLineGroupSetup(supabaseAdmin(), "", []);
    return NextResponse.json({
      has_token: setup.has_token,
      groups: setup.groups.map((g) => ({ id: g.id, name: g.name, members: g.members, reachable: g.reachable, uses: g.uses })),
      error: null,
    });
  } catch (e) {
    console.error("[email-reports/line]", e);
    return NextResponse.json({ has_token: false, groups: [], error: "โหลดกลุ่ม LINE ไม่สำเร็จ" }, { status: 500 });
  }
}
