/**
 * รายชื่อผู้รับงาน (สำหรับใบจ่ายงาน + ไอคอนพนักงานบนบอร์ด) — ช่าง (พนักงาน) + แผนก
 * GET /api/mo/assignees  → { craftsmen, departments, dept_wages }
 * POST /api/mo/assignees { name, nickname?, code?, department_id, is_subcontract? } → เพิ่มช่างใหม่จากหน้าบอร์ด (ช่างเหมาที่เพิ่งรับเข้ามา ไม่ต้องวิ่งไปหน้า HR)
 * อ่าน employees ผ่าน service role (ตาราง employees มี RLS เข้ม— ผู้ใช้บอร์ดทั่วไปอ่านไม่ได้)
 * ความเป็นส่วนตัว: ไม่ส่งเงินเดือนรายคนออกไป — ส่งเฉพาะ "ผลรวมค่าแรงต่อแผนก" (dept_wages)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { nextEmployeeCode, bumpCode } from "@/lib/employee-code";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Assignee = { id: string; name: string; nickname?: string | null; code: string | null; department_id?: string | null; photo?: string | null };

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
      id: String(e.id), name, nickname: nick || null, code: (e.employee_code as string) ?? null, department_id: (e.department_id as string) ?? null,
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

/**
 * เพิ่มช่างใหม่ (พนักงาน 1 คน) จากป๊อปเลือกช่างบนบอร์ดจ่ายงาน
 * - รหัสพนักงานเว้นว่างได้ → ระบบต่อเลขจากคนในแผนกเดียวกันให้ (เช่น ISG-CM-1017 → ISG-CM-1018)
 * - ช่างเหมา (แผนกมีคำว่า "เหมา") → ติ๊ก is_subcontract ให้อัตโนมัติ
 * สิทธิ์: work_board.dispatch (คนที่จ่ายงานได้ = เพิ่มช่างที่รับงานได้)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { name?: string; nickname?: string; code?: string; department_id?: string; is_subcontract?: boolean };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const full = (b.name ?? "").trim().replace(/\s+/g, " ");
  if (!full) return NextResponse.json({ error: "ต้องใส่ชื่อช่าง" }, { status: 400 });
  const deptId = (b.department_id ?? "").trim() || null;
  const nickname = (b.nickname ?? "").trim() || null;
  const [firstName, ...rest] = full.split(" ");
  const lastName = rest.join(" ");

  const admin = supabaseAdmin();
  const dept = deptId ? (await admin.from("departments").select("id, name").eq("id", deptId).maybeSingle()).data as { id: string; name: string } | null : null;
  if (deptId && !dept) return NextResponse.json({ error: "ไม่พบแผนก/โต๊ะที่เลือก" }, { status: 400 });

  // รหัสพนักงาน: ใส่มาเองก็ใช้เลย · ไม่ใส่ = ต่อเลขจากคนในแผนกเดียวกัน (ของกลาง lib/employee-code — มีเทสต์)
  let code = (b.code ?? "").trim();
  if (!code) {
    // ไม่ได้ระบุแผนก → ไม่มีชุดรหัสให้อ้างอิง (ข้าม query ไปใช้ fallback เลย · .eq(col, null) ของ PostgREST ไม่แมตช์ค่าว่าง)
    if (deptId) {
      const { data: mates } = await admin.from("employees").select("employee_code").eq("department_id", deptId).limit(500);
      code = nextEmployeeCode((mates ?? []).map((m) => (m as { employee_code: string | null }).employee_code)) ?? "";
    }
    if (!code) {                                        // แผนกยังไม่มีใคร → ไล่เลขจากทั้งบริษัท
      const { count } = await admin.from("employees").select("id", { count: "exact", head: true });
      code = `EMP-${String((count ?? 0) + 1).padStart(4, "0")}`;
    }
  }
  // กันรหัสชนกัน (unique employee_code) — ขยับเลขจนกว่าจะว่าง
  for (let i = 0; i < 50; i++) {
    const { data: dup } = await admin.from("employees").select("id").eq("employee_code", code).maybeSingle();
    if (!dup) break;
    code = bumpCode(code);
  }

  const isSub = b.is_subcontract ?? /เหมา/.test(dept?.name ?? "");
  const { data, error } = await admin.from("employees").insert({
    employee_code: code,
    first_name: firstName, last_name: lastName,          // คอลัมน์บังคับ (NOT NULL)
    first_name_th: firstName, last_name_th: lastName,
    nickname, department_id: deptId, is_subcontract: isSub,
  }).select("id, employee_code, nickname, first_name_th, last_name_th, department_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const row = data as Record<string, unknown>;
  const th = [row.first_name_th, row.last_name_th].filter(Boolean).join(" ").trim();
  const nick = (row.nickname as string) || "";
  const assignee: Assignee = {
    id: String(row.id), name: [th, nick && `(${nick})`].filter(Boolean).join(" ") || code,
    nickname: nick || null, code: (row.employee_code as string) ?? null,
    department_id: (row.department_id as string) ?? null, photo: null,
  };
  await writeAudit(admin, { action: "create", entityType: "employees", entityId: assignee.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { from: "work-board", code, department: dept?.name ?? null, is_subcontract: isSub } });
  return NextResponse.json({ data: assignee, error: null });
}
