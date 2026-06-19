/**
 * Payroll module — ผังพนักงาน (Board) Phase 1 — อ่านอย่างเดียว
 * GET /api/payroll/board
 * คืนพนักงาน (active) จัดกลุ่มตามแผนก + ข้อมูลการ์ด:
 *   สีตามประเภทสัญญา · หัวหน้า(⭐) · จำนวนรายการประจำ · จำนวนใบเตือน · เงินเดือนสัญญา
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ประเภทสัญญา → สี (ตรงที่เจ้าของกำหนด)
const COLOR: Record<string, string> = {
  permanent: "purple",        // ประจำ
  regular_external: "orange", // ประจำ (นอกระบบ)
  daily: "green",             // รายวัน
  contractor: "blue",         // ช่างเหมา
};
const TYPE_TH: Record<string, string> = {
  permanent: "ประจำ", regular_external: "ประจำ(นอกระบบ)", daily: "รายวัน", contractor: "ช่างเหมา",
};

type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const a = supabaseAdmin();
    const [empRes, conRes, deptRes, recRes, warnRes] = await Promise.all([
      a.from("employees").select("id, employee_code, first_name, last_name, nickname, department_id, supervisor_id, profile_photo_key, employment_status").eq("employment_status", "active"),
      a.from("employee_contracts").select("employee_id, contract_type, base_salary, payroll_register_base_salary").eq("is_current", true).eq("status", "active"),
      a.from("departments").select("id, name, display_order, status").neq("status", "inactive").order("display_order", { ascending: true }),
      a.from("employee_recurring_pay_items").select("employee_id").eq("status", "active"),
      a.from("employee_warnings").select("employee_id").eq("status", "active"),
    ]);

    const employees = (empRes.data ?? []) as Row[];
    const conBy = new Map<string, Row>(((conRes.data ?? []) as Row[]).map((c) => [String(c.employee_id), c]));
    const depts = (deptRes.data ?? []) as Row[];
    const deptName: Record<string, string> = {}; depts.forEach((d) => { deptName[String(d.id)] = String(d.name); });

    const recCount = new Map<string, number>();
    ((recRes.data ?? []) as Row[]).forEach((r) => recCount.set(String(r.employee_id), (recCount.get(String(r.employee_id)) ?? 0) + 1));
    const warnCount = new Map<string, number>();
    ((warnRes.data ?? []) as Row[]).forEach((r) => warnCount.set(String(r.employee_id), (warnCount.get(String(r.employee_id)) ?? 0) + 1));
    const supervisorIds = new Set(employees.map((e) => e.supervisor_id).filter(Boolean).map(String));

    const card = (e: Row) => {
      const id = String(e.id);
      const con = conBy.get(id);
      const ctype = String(con?.contract_type ?? "");
      const salary = money(con?.base_salary) || money(con?.payroll_register_base_salary);
      const full = [String(e.first_name ?? "").trim(), String(e.last_name ?? "").trim()].filter((x) => x && x !== "-").join(" ");
      return {
        id, employee_code: String(e.employee_code ?? ""),
        nickname: String(e.nickname ?? "") || full || String(e.employee_code ?? ""),
        full_name: full,
        contract_type: ctype, contract_type_th: (TYPE_TH[ctype] ?? ctype) || "—",
        color: COLOR[ctype] ?? "slate",
        base_salary: salary,
        is_supervisor: supervisorIds.has(id),
        recurring_count: recCount.get(id) ?? 0,
        warning_count: warnCount.get(id) ?? 0,
        photo_key: e.profile_photo_key ? String(e.profile_photo_key) : null,
      };
    };

    // จัดกลุ่มแผนก
    const byDept = new Map<string, ReturnType<typeof card>[]>();
    const noDept: ReturnType<typeof card>[] = [];
    for (const e of employees) {
      const c = card(e);
      const did = e.department_id ? String(e.department_id) : "";
      if (did && deptName[did]) { if (!byDept.has(did)) byDept.set(did, []); byDept.get(did)!.push(c); }
      else noDept.push(c);
    }

    // โชว์ทุกแผนกในระบบ (รวมแผนกที่ยังไม่มีคน) ตามลำดับ display_order
    const sections = depts
      .map((d) => {
        const emps = (byDept.get(String(d.id)) ?? []).sort((x, y) => x.employee_code.localeCompare(y.employee_code));
        return {
          department_id: String(d.id), department_name: String(d.name),
          headcount: emps.length,
          total_salary: Math.round(emps.reduce((t, e) => t + e.base_salary, 0) * 100) / 100,
          employees: emps,
        };
      });

    return NextResponse.json({
      sections,
      all_departments: depts.map((d) => ({ id: String(d.id), name: String(d.name) })),   // ทุกแผนก (รวมที่ว่าง) สำหรับลากวาง
      no_department: noDept.sort((x, y) => x.employee_code.localeCompare(y.employee_code)),
      total_employees: employees.length,
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
