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
// ดึงทุกคอลัมน์ (เหมือนแอปเก่า) — field ใหม่ที่เพิ่มใน DB ก็ติดมาอัตโนมัติ
const SELECT = "*";

export type EmployeeRow = Record<string, unknown> & { id: string };

/** คอลัมน์ที่อนุญาตให้เขียน (กัน inject field แปลก ๆ + กัน system/FK/portal columns) */
const WRITABLE = new Set([
  // ตัวตน
  "employee_code", "title", "first_name", "last_name", "nickname",
  "first_name_th", "last_name_th", "first_name_en", "last_name_en",
  // ส่วนตัว
  "birth_date", "gender", "marital_status", "nationality",
  "national_id", "passport_no", "visa_no", "work_permit_id", "work_permit_id_expire_date",
  // ติดต่อ
  "phone", "email", "address", "emergency_contact_name", "emergency_contact_phone",
  // งาน/เงินเดือน
  "employment_status", "start_date", "resign_date", "payroll_register_base_salary",
  "scanner_employee_code", "payslip_language", "notes",
]);
/** คอลัมน์วันที่ที่ต้องแปลง '' → null */
const DATE_COLS = ["start_date", "resign_date", "birth_date", "work_permit_id_expire_date"];

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

type ContractInfo = { no: string; salary: number };

/** map พนักงาน → สัญญาปัจจุบัน (เลือก is_current ก่อน ไม่งั้นใบล่าสุด) */
async function contractMap(): Promise<Record<string, ContractInfo>> {
  const { data } = await supabaseAdmin()
    .from("employee_contracts")
    .select("employee_id, contract_no, base_salary, is_current, start_date")
    .order("start_date", { ascending: false });
  const m: Record<string, ContractInfo> = {};
  (data ?? []).forEach((c) => {
    const r = c as { employee_id: string; contract_no: string; base_salary: number; is_current: boolean };
    if (!r.employee_id) return;
    if (!m[r.employee_id] || r.is_current) m[r.employee_id] = { no: r.contract_no, salary: Number(r.base_salary) };
  });
  return m;
}

function decorate(row: Record<string, unknown>, dmap: Record<string, string>, cmap: Record<string, ContractInfo>): EmployeeRow {
  const first = String(row.first_name ?? "").trim();
  const last  = String(row.last_name ?? "").trim();
  const full  = [first, last].filter((x) => x && x !== "-").join(" ") || String(row.nickname ?? "");
  const deptId = row.department_id as string | null;
  const con = cmap[row.id as string];
  return {
    ...row,
    id: row.id as string,
    full_name:       full,
    department_name: deptId ? (dmap[deptId] ?? "") : "",
    current_contract_no:     con?.no ?? "",
    current_contract_salary: con?.salary ?? null,
    active:          row.employment_status === "active",
  };
}

export async function listEmployees(includeInactive: boolean): Promise<EmployeeRow[]> {
  let q = supabaseAdmin().from(TABLE).select(SELECT).order("employee_code", { ascending: true });
  if (!includeInactive) q = q.eq("employment_status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const [dmap, cmap] = await Promise.all([deptMap(), contractMap()]);
  return (data ?? []).map((r) => decorate(r as Record<string, unknown>, dmap, cmap));
}

export async function getEmployee(id: string): Promise<EmployeeRow | null> {
  const { data, error } = await supabaseAdmin().from(TABLE).select(SELECT).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const [dmap, cmap] = await Promise.all([deptMap(), contractMap()]);
  return decorate(data[0] as Record<string, unknown>, dmap, cmap);
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
  // ช่องว่าง → null (กัน '' ลง column ที่เป็น date)
  for (const k of DATE_COLS) {
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
