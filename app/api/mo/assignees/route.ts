/**
 * รายชื่อผู้รับงาน (สำหรับใบจ่ายงาน + ไอคอนพนักงานบนบอร์ด) — ช่าง (พนักงาน) + แผนก
 * GET /api/mo/assignees  → { craftsmen, departments, dept_wages }
 * อ่าน employees ผ่าน service role (ตาราง employees มี RLS เข้ม— ผู้ใช้บอร์ดทั่วไปอ่านไม่ได้)
 * ความเป็นส่วนตัว: ไม่ส่งเงินเดือนรายคนออกไป — ส่งเฉพาะ "ผลรวมค่าแรงต่อแผนก" (dept_wages)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Assignee = { id: string; name: string; code: string | null; department_id?: string | null; photo?: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data: emps }, { data: deps }] = await Promise.all([
    admin.from("employees")
      .select("id, employee_code, nickname, first_name_th, last_name_th, first_name, last_name, resign_date, department_id, payroll_register_base_salary, profile_photo_key")
      .is("resign_date", null).limit(2000),
    admin.from("departments").select("id, code, name, status").limit(500),
  ]);

  const craftsmen: Assignee[] = (emps ?? []).map((e: Record<string, unknown>) => {
    const th = [e.first_name_th, e.last_name_th].filter(Boolean).join(" ").trim();
    const en = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
    const nick = (e.nickname as string) || "";
    const name = [th || en, nick && `(${nick})`].filter(Boolean).join(" ") || (e.employee_code as string) || "—";
    const photoKey = (e.profile_photo_key as string) || "";
    return {
      id: String(e.id), name, code: (e.employee_code as string) ?? null, department_id: (e.department_id as string) ?? null,
      photo: photoKey ? `/api/r2-image?key=${encodeURIComponent(photoKey)}` : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "th"));

  // ผลรวมค่าแรง (เงินเดือน) ต่อแผนก — คิดฝั่ง server ไม่ส่งรายคนออกไป
  const dept_wages: Record<string, number> = {};
  for (const e of (emps ?? []) as Record<string, unknown>[]) {
    const d = e.department_id as string | null;
    if (!d) continue;
    dept_wages[d] = (dept_wages[d] ?? 0) + (Number(e.payroll_register_base_salary) || 0);
  }

  const departments: Assignee[] = (deps ?? [])
    .filter((d: Record<string, unknown>) => !d.status || d.status === "active")
    .map((d: Record<string, unknown>) => ({ id: String(d.id), name: (d.name as string) ?? "—", code: (d.code as string) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return NextResponse.json({ craftsmen, departments, dept_wages, error: null }, { headers: { "Cache-Control": "private, max-age=30" } });
}
