/**
 * Payroll — ข้อมูลหน้าประวัติพนักงาน (รวมทุกอย่างในรีเควสเดียว)
 *
 * GET /api/payroll/employee-profile/<id>              → ข้อมูลพนักงาน + แผนก/หัวหน้า + รายการประจำ/ใบเตือน/สัญญา
 * GET /api/payroll/employee-profile/<id>?only=records → เอาเฉพาะ 3 ลิสต์ (ใช้ตอนเปิด drawer ในผัง — เบากว่า)
 *
 * ทำไมรวมเป็น route เดียว: หน้าโปรไฟล์เดิมต้องยิง 4-5 API ชนกัน ทำให้เปิดหน้าช้า
 * (ดู memory perf_contention_load_order) · route น้อยลงก็ช่วยเรื่องขนาด worker ด้วย
 *
 * แก้ไขข้อมูลยังใช้ endpoint เดิม (core/employees, recurring, master/warnings, core/contracts)
 */
import { NextRequest, NextResponse } from "next/server";
import { getEmployee } from "@/lib/payroll-employees-db";
import { getEmployeeRecords } from "@/lib/payroll-employee-records";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  try {
    const a = supabaseAdmin();
    const only = req.nextUrl.searchParams.get("only");

    if (only === "records") {
      return NextResponse.json({ records: await getEmployeeRecords(id), error: null });
    }

    // ตัวเลือกสำหรับช่อง "แผนก / ตำแหน่ง / หัวหน้า" — โหลดตอนกดแก้เท่านั้น (ไม่ถ่วงตอนเปิดหน้า)
    if (only === "options") {
      const [dep, pos, emp] = await Promise.all([
        a.from("departments").select("id, name").neq("status", "inactive").order("display_order"),
        a.from("positions").select("id, name").neq("status", "inactive").order("display_order"),
        a.from("employees").select("id, employee_code, first_name, last_name, nickname").eq("employment_status", "active").order("employee_code"),
      ]);
      return NextResponse.json({
        options: {
          departments: (dep.data ?? []).map((d) => ({ id: String(d.id), name: String(d.name) })),
          positions: (pos.data ?? []).map((p) => ({ id: String(p.id), name: String(p.name) })),
          employees: (emp.data ?? []).map((e) => {
            const r = e as Record<string, unknown>;
            const full = [String(r.first_name ?? "").trim(), String(r.last_name ?? "").trim()].filter((x) => x && x !== "-").join(" ");
            return { id: String(r.id), name: `${String(r.employee_code ?? "")} · ${String(r.nickname ?? "") || full || "—"}` };
          }),
        },
        error: null,
      });
    }
    const [employee, records, deptRes] = await Promise.all([
      getEmployee(id),
      getEmployeeRecords(id),
      // แผนกที่คนนี้เป็นหัวหน้า (อาจไม่ใช่แผนกตัวเอง) — ใช้โชว์ป้าย "หัวหน้าแผนก…"
      a.from("departments").select("id, name, manager_employee_id").eq("manager_employee_id", id),
    ]);
    if (!employee) return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });

    // แผนกของตัวเอง (เอา manager_employee_id มาเทียบ) + ชื่อหัวหน้าแผนก
    type Dept = { id: string; name: string; manager_employee_id: string | null };
    const deptId = employee.department_id ? String(employee.department_id) : "";
    let department: Dept | null = null;
    if (deptId) {
      const { data } = await a.from("departments").select("id, name, manager_employee_id").eq("id", deptId).maybeSingle();
      if (data) department = data as Dept;
    }

    const headsOf = ((deptRes.data ?? []) as { id: string; name: string }[]).map((d) => ({ id: String(d.id), name: String(d.name) }));

    return NextResponse.json({
      employee,
      department,
      heads_of: headsOf,                                  // แผนกที่คนนี้เป็นหัวหน้า
      is_department_head: headsOf.length > 0,
      records,
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
