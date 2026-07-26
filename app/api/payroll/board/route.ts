/**
 * Payroll module — ผังพนักงาน (Board) — อ่านอย่างเดียว
 * GET /api/payroll/board
 * คืนพนักงาน (active) จัดกลุ่มตามแผนก + ข้อมูลการ์ด:
 *   ประเภทสัญญา/สถานะ/ตำแหน่ง (ไว้ระบายสีตามที่ตั้งค่า) · หัวหน้า(⭐) · รายการประจำ · ใบเตือน · เงินเดือนสัญญา · รูป
 *
 * สีไม่ได้ fix ในโค้ดแล้ว — หน้าจอเอา config จาก /api/payroll/board/config ไประบายเอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TYPE_TH: Record<string, string> = {
  permanent: "ประจำ", regular_external: "ประจำ(นอกระบบ)", daily: "รายวัน", contractor: "ช่างเหมา", hourly: "รายชั่วโมง",
};

type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const a = supabaseAdmin();
    const [empRes, conRes, deptRes, recRes, warnRes, posRes] = await Promise.all([
      a.from("employees").select("id, employee_code, first_name, last_name, nickname, department_id, position_id, supervisor_id, profile_photo_key, employment_status").eq("employment_status", "active"),
      a.from("employee_contracts").select("employee_id, contract_type, base_salary, payroll_register_base_salary, status, end_date").eq("is_current", true),
      a.from("departments").select("id, name, display_order, status, manager_employee_id").neq("status", "inactive").order("display_order", { ascending: true }),
      a.from("employee_recurring_pay_items").select("employee_id").eq("status", "active"),
      a.from("employee_warnings").select("employee_id").eq("status", "active"),
      a.from("positions").select("id, name"),
    ]);

    const employees = (empRes.data ?? []) as Row[];
    const conBy = new Map<string, Row>(((conRes.data ?? []) as Row[]).map((c) => [String(c.employee_id), c]));
    const depts = (deptRes.data ?? []) as Row[];
    const deptName: Record<string, string> = {}; depts.forEach((d) => { deptName[String(d.id)] = String(d.name); });
    const posName: Record<string, string> = {}; ((posRes.data ?? []) as Row[]).forEach((p) => { posName[String(p.id)] = String(p.name); });
    // หัวหน้าประจำแผนก (⭐ ดาวใหญ่) — 1 คนต่อแผนก
    const deptHead = new Map<string, string>();   // employee_id → ชื่อแผนกที่เป็นหัวหน้า
    depts.forEach((d) => { if (d.manager_employee_id) deptHead.set(String(d.manager_employee_id), String(d.name)); });

    const recCount = new Map<string, number>();
    ((recRes.data ?? []) as Row[]).forEach((r) => recCount.set(String(r.employee_id), (recCount.get(String(r.employee_id)) ?? 0) + 1));
    const warnCount = new Map<string, number>();
    ((warnRes.data ?? []) as Row[]).forEach((r) => warnCount.set(String(r.employee_id), (warnCount.get(String(r.employee_id)) ?? 0) + 1));
    const supervisorIds = new Set(employees.map((e) => e.supervisor_id).filter(Boolean).map(String));
    // ชื่อไว้โชว์ว่า "หัวหน้าของคนนี้คือใคร"
    const nameById = new Map<string, string>();
    employees.forEach((e) => {
      const full = [String(e.first_name ?? "").trim(), String(e.last_name ?? "").trim()].filter((x) => x && x !== "-").join(" ");
      nameById.set(String(e.id), String(e.nickname ?? "") || full || String(e.employee_code ?? ""));
    });

    const card = (e: Row) => {
      const id = String(e.id);
      const con = conBy.get(id);
      const ctype = String(con?.contract_type ?? "");
      const salary = money(con?.base_salary) || money(con?.payroll_register_base_salary);
      const full = [String(e.first_name ?? "").trim(), String(e.last_name ?? "").trim()].filter((x) => x && x !== "-").join(" ");
      const supId = e.supervisor_id ? String(e.supervisor_id) : null;
      return {
        id, employee_code: String(e.employee_code ?? ""),
        nickname: String(e.nickname ?? "") || full || String(e.employee_code ?? ""),
        full_name: full,
        contract_type: ctype, contract_type_th: (TYPE_TH[ctype] ?? ctype) || "—",
        // หมวดสำหรับ "ระบายสีตาม …" (หน้าจอเลือกได้ว่าจะใช้อันไหน)
        employment_status: String(e.employment_status ?? ""),
        department_id: e.department_id ? String(e.department_id) : "",
        position_id: e.position_id ? String(e.position_id) : "",
        position_name: e.position_id ? (posName[String(e.position_id)] ?? "") : "",
        base_salary: salary,
        is_supervisor: supervisorIds.has(id),              // มีลูกน้องชี้มาหา
        head_of_department: deptHead.get(id) ?? null,      // เป็นหัวหน้าประจำแผนกไหน
        supervisor_id: supId,
        supervisor_name: supId ? (nameById.get(supId) ?? "") : "",
        recurring_count: recCount.get(id) ?? 0,
        warning_count: warnCount.get(id) ?? 0,
        photo_key: e.profile_photo_key ? String(e.profile_photo_key) : null,
      };
    };

    // จัดกลุ่มแผนก — ข้ามคน "หมดสัญญา" (สัญญาปัจจุบันสิ้นสุด/ยกเลิก หรือเลยวันหมดอายุแล้ว)
    const today = new Date().toISOString().slice(0, 10);
    const byDept = new Map<string, ReturnType<typeof card>[]>();
    const noDept: ReturnType<typeof card>[] = [];
    for (const e of employees) {
      const con = conBy.get(String(e.id));
      if (con && (con.status === "ended" || con.status === "cancelled" || (con.end_date && String(con.end_date) < today))) continue;
      const c = card(e);
      const did = e.department_id ? String(e.department_id) : "";
      if (did && deptName[did]) { if (!byDept.has(did)) byDept.set(did, []); byDept.get(did)!.push(c); }
      else noDept.push(c);
    }

    // โชว์ทุกแผนกในระบบ (รวมแผนกที่ยังไม่มีคน) ตามลำดับ display_order
    const sections = depts
      .map((d) => {
        const emps = (byDept.get(String(d.id)) ?? []).sort((x, y) => x.employee_code.localeCompare(y.employee_code));
        const mgrId = d.manager_employee_id ? String(d.manager_employee_id) : null;
        return {
          department_id: String(d.id), department_name: String(d.name),
          manager_employee_id: mgrId,
          manager_name: mgrId ? (nameById.get(mgrId) ?? "") : "",
          headcount: emps.length,
          total_salary: Math.round(emps.reduce((t, e) => t + e.base_salary, 0) * 100) / 100,
          employees: emps,
        };
      });

    return NextResponse.json({
      sections,
      all_departments: depts.map((d) => ({ id: String(d.id), name: String(d.name), manager_employee_id: d.manager_employee_id ? String(d.manager_employee_id) : null })),   // ทุกแผนก (รวมที่ว่าง) สำหรับลากวาง
      all_positions: ((posRes.data ?? []) as Row[]).map((p) => ({ id: String(p.id), name: String(p.name) })),   // ไว้ตั้งสี "ตามตำแหน่ง"
      no_department: noDept.sort((x, y) => x.employee_code.localeCompare(y.employee_code)),
      total_employees: sections.reduce((t, s) => t + s.headcount, 0) + noDept.length,   // นับเฉพาะที่โชว์ (ไม่รวมคนหมดสัญญา)
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
