/**
 * ย้ายพนักงานเข้า/ออก "โต๊ะ" (แผนก) จากบอร์ดจ่ายงาน — /api/mo/dept-staff
 *   POST { employee_id, department_id | null }
 *
 * ทำไมมี endpoint แยกจากของ payroll (/api/payroll/board/move):
 *   ตัวนั้นล็อกด้วยสิทธิ์ payroll (คนคุมเงินเดือน) — หัวหน้าที่จัดโต๊ะบนบอร์ดไม่มีสิทธิ์นั้น
 *   ตัวนี้ใช้สิทธิ์เดียวกับการแก้ข้อมูลผลิต (products.edit) แต่ **เขียนประวัติย้ายแผนก + audit เหมือนกันทุกอย่าง**
 *   → ไม่ว่าใครย้าย ก็ตามรอยได้ว่าใครย้ายใคร เมื่อไหร่ จากโต๊ะไหนไปโต๊ะไหน
 *
 * ⚠️ นี่คือการเปลี่ยน "แผนกของพนักงาน" จริง (ตาราง employees) — มีผลกับหน้าอื่นที่จัดกลุ่มตามแผนกด้วย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const employee_id = String(body.employee_id ?? "").trim();
  const department_id = body.department_id ? String(body.department_id) : null;
  if (!employee_id) return NextResponse.json({ error: "ต้องระบุพนักงาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: emp, error: readErr } = await admin.from("employees").select("department_id").eq("id", employee_id).single();
  if (readErr || !emp) return NextResponse.json({ error: "ไม่พบพนักงานคนนี้" }, { status: 404 });
  const fromId = emp.department_id ? String(emp.department_id) : null;
  if (fromId === department_id) return NextResponse.json({ data: { unchanged: true }, error: null });

  const ids = [fromId, department_id].filter((x): x is string => !!x);
  const { data: deps } = ids.length ? await admin.from("departments").select("id, name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const nameOf = (id: string | null) => (id ? ((deps ?? []).find((d) => String(d.id) === id)?.name ?? null) : null);

  const { error } = await admin.from("employees").update({ department_id }).eq("id", employee_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ประวัติย้ายแผนก (ตารางเดียวกับที่หน้า payroll ใช้ → ดูประวัติที่เดิมได้)
  await admin.from("employee_dept_history").insert({
    employee_id, from_department_id: fromId, from_department_name: nameOf(fromId),
    to_department_id: department_id, to_department_name: nameOf(department_id),
    moved_by: user?.id ?? null, moved_by_name: user?.email ?? null,
  }).then(() => {}, () => {});

  await writeAudit(admin, {
    action: "move_dept", entityType: "employees", entityId: employee_id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { from: fromId, to: department_id, from_name: nameOf(fromId), to_name: nameOf(department_id), source: "work-board" },
  });
  return NextResponse.json({ data: { from: fromId, to: department_id }, error: null });
}
