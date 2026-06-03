/**
 * Payroll module — Employees data layer (ของจริง / Phase 1)
 *
 * ต่อตาราง `employees` จริงใน Supabase (cyivhke...) — 78 คน
 * ใช้ service-role (supabaseAdmin) bypass RLS เหมือน data layer กลาง master-v2
 * แล้ว map FK department_id → ชื่อแผนก + คำนวณ full_name / active ให้ frontend
 *
 * ความปลอดภัย:
 *   - permission gate ที่หน้า (employees.view/create/edit) + CF Access (เหมือน master-v2)
 *   - ลบถาวรไม่ได้ — soft delete = เปลี่ยน employment_status เป็น inactive (กันข้อมูลจริงหาย)
 *   - ทุก mutation เขียน audit log กลาง (writeAudit → audit_logs)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLE = "employees";
const SELECT =
  "id, employee_code, first_name, last_name, nickname, department_id, position_id, " +
  "employment_status, start_date, resign_date, phone, email, national_id, " +
  "payroll_register_base_salary, scanner_employee_code, line_display_name, line_user_id, " +
  "notes, created_at, updated_at";

export type EmployeeRow = Record<string, unknown> & { id: string };

/** คอลัมน์ที่อนุญาตให้เขียน (กัน inject field แปลก ๆ) */
const WRITABLE = new Set([
  "employee_code", "first_name", "last_name", "nickname",
  "employment_status", "start_date", "resign_date", "phone", "email",
  "national_id", "payroll_register_base_salary", "scanner_employee_code", "notes",
]);

async function deptMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from("departments").select("id, name");
  const m: Record<string, string> = {};
  (data ?? []).forEach((d) => { m[(d as { id: string }).id] = (d as { name: string }).name; });
  return m;
}

async function nameToDeptId(name: string): Promise<string | null> {
  if (!name) return null;
  const { data } = await supabaseAdmin().from("departments").select("id").eq("name", name).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

function decorate(row: Record<string, unknown>, dmap: Record<string, string>): EmployeeRow {
  const first = String(row.first_name ?? "").trim();
  const last  = String(row.last_name ?? "").trim();
  const full  = [first, last].filter((x) => x && x !== "-").join(" ") || String(row.nickname ?? "");
  const deptId = row.department_id as string | null;
  return {
    ...row,
    id: row.id as string,
    full_name:       full,
    department_name: deptId ? (dmap[deptId] ?? "") : "",
    active:          row.employment_status === "active",
  };
}

export async function listEmployees(includeInactive: boolean): Promise<EmployeeRow[]> {
  let q = supabaseAdmin().from(TABLE).select(SELECT).order("employee_code", { ascending: true });
  if (!includeInactive) q = q.eq("employment_status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const dmap = await deptMap();
  return (data ?? []).map((r) => decorate(r as Record<string, unknown>, dmap));
}

export async function getEmployee(id: string): Promise<EmployeeRow | null> {
  const { data, error } = await supabaseAdmin().from(TABLE).select(SELECT).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const dmap = await deptMap();
  return decorate(data[0] as Record<string, unknown>, dmap);
}

/** แปลง body จาก frontend → คอลัมน์จริง (รวม mapping พิเศษ) */
async function toColumns(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (WRITABLE.has(k)) out[k] = v;
  }
  // เงินเดือน → number
  if ("payroll_register_base_salary" in out) {
    out.payroll_register_base_salary = Number(out.payroll_register_base_salary) || 0;
  }
  // active (ของกลาง soft-delete) → employment_status
  if ("active" in body && !("employment_status" in out)) {
    out.employment_status = body.active === true || body.active === "true" ? "active" : "inactive";
  }
  // department_name (select) → department_id (FK)
  if ("department_name" in body) {
    out.department_id = await nameToDeptId(String(body.department_name ?? ""));
  }
  // ช่องว่าง → null (กัน '' ลง column ที่เป็น date/uuid)
  for (const k of ["start_date", "resign_date"]) {
    if (out[k] === "") out[k] = null;
  }
  return out;
}

export async function createEmployee(body: Record<string, unknown>): Promise<EmployeeRow> {
  const cols = await toColumns(body);
  // NOT NULL defaults
  const insert = {
    employee_code:  cols.employee_code ?? `EMP-${Date.now().toString().slice(-6)}`,
    first_name:     cols.first_name ?? "",
    last_name:      cols.last_name ?? "-",
    employment_status: cols.employment_status ?? "active",
    payslip_language:  "th",
    payroll_register_base_salary: cols.payroll_register_base_salary ?? 0,
    ...cols,
  };
  const { data, error } = await supabaseAdmin().from(TABLE).insert(insert).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const dmap = await deptMap();
  return decorate(data![0] as Record<string, unknown>, dmap);
}

export async function updateEmployee(id: string, body: Record<string, unknown>): Promise<EmployeeRow | null> {
  const cols = await toColumns(body);
  if (Object.keys(cols).length === 0) return getEmployee(id);
  const { data, error } = await supabaseAdmin().from(TABLE).update(cols).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const dmap = await deptMap();
  return decorate(data[0] as Record<string, unknown>, dmap);
}

/** soft delete เท่านั้น — เปลี่ยนสถานะเป็น inactive (กันลบข้อมูลจริง) */
export async function softDeleteEmployee(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from(TABLE).update({ employment_status: "inactive" }).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
