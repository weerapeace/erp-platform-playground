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
import { nullifyEmpty } from "@/lib/payroll-coerce";

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
  // ตำแหน่ง/สังกัด (relation picker → เก็บ FK id ตรง)
  "position_id", "cost_center_id",
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

/** map id → name สำหรับตาราง lookup ทั่วไป (positions / cost_centers) */
async function idNameMap(table: string): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from(table).select("id, name");
  const m: Record<string, string> = {};
  (data ?? []).forEach((d) => { m[(d as { id: string }).id] = (d as { name: string }).name; });
  return m;
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

type BankInfo = { bank: string; branch: string; account_no: string; account_name: string };
/** map พนักงาน → บัญชีธนาคารหลัก (is_primary ก่อน ไม่งั้นใบแรก) */
async function bankMap(): Promise<Record<string, BankInfo>> {
  const { data } = await supabaseAdmin()
    .from("employee_bank_accounts")
    .select("employee_id, bank_name, bank_branch, account_no, account_name, is_primary");
  const m: Record<string, BankInfo> = {};
  (data ?? []).forEach((b) => {
    const r = b as { employee_id: string; bank_name: string; bank_branch: string | null; account_no: string; account_name: string; is_primary: boolean };
    if (!r.employee_id) return;
    if (!m[r.employee_id] || r.is_primary) {
      m[r.employee_id] = { bank: r.bank_name, branch: r.bank_branch ?? "", account_no: r.account_no, account_name: r.account_name };
    }
  });
  return m;
}

/** map พนักงาน id → "รหัส · ชื่อ" (สำหรับ supervisor) */
async function selfMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from("employees").select("id, employee_code, first_name, last_name, nickname");
  const m: Record<string, string> = {};
  (data ?? []).forEach((e) => {
    const r = e as { id: string; employee_code: string; first_name: string; last_name: string; nickname: string | null };
    const nm = [r.first_name, r.last_name].filter((x) => x && x !== "-").join(" ") || r.nickname || r.employee_code;
    m[r.id] = `${r.employee_code} · ${nm}`;
  });
  return m;
}

function decorate(row: Record<string, unknown>, dmap: Record<string, string>, cmap: Record<string, ContractInfo>, smap: Record<string, string> = {}, bmap: Record<string, BankInfo> = {}, pmap: Record<string, string> = {}, ccmap: Record<string, string> = {}): EmployeeRow {
  const first = String(row.first_name ?? "").trim();
  const last  = String(row.last_name ?? "").trim();
  const full  = [first, last].filter((x) => x && x !== "-").join(" ") || String(row.nickname ?? "");
  const deptId = row.department_id as string | null;
  const con = cmap[row.id as string];
  const bank = bmap[row.id as string];
  return {
    ...row,
    id: row.id as string,
    full_name:       full,
    department_name: deptId ? (dmap[deptId] ?? "") : "",
    supervisor_name: row.supervisor_id ? (smap[row.supervisor_id as string] ?? "") : "",
    position_name:    row.position_id ? (pmap[row.position_id as string] ?? "") : "",
    cost_center_name: row.cost_center_id ? (ccmap[row.cost_center_id as string] ?? "") : "",
    current_contract_no:     con?.no ?? "",
    current_contract_salary: con?.salary ?? null,
    bank_name:         bank?.bank ?? "",
    bank_branch:       bank?.branch ?? "",
    bank_account_no:   bank?.account_no ?? "",
    bank_account_name: bank?.account_name ?? "",
    active:          row.employment_status === "active",
  };
}

export async function listEmployees(includeInactive: boolean): Promise<EmployeeRow[]> {
  let q = supabaseAdmin().from(TABLE).select(SELECT).order("employee_code", { ascending: true });
  if (!includeInactive) q = q.eq("employment_status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const [dmap, cmap, smap, bmap, pmap, ccmap] = await Promise.all([deptMap(), contractMap(), selfMap(), bankMap(), idNameMap("positions"), idNameMap("cost_centers")]);
  return (data ?? []).map((r) => decorate(r as Record<string, unknown>, dmap, cmap, smap, bmap, pmap, ccmap));
}

export async function getEmployee(id: string): Promise<EmployeeRow | null> {
  const { data, error } = await supabaseAdmin().from(TABLE).select(SELECT).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const [dmap, cmap, smap, bmap, pmap, ccmap] = await Promise.all([deptMap(), contractMap(), selfMap(), bankMap(), idNameMap("positions"), idNameMap("cost_centers")]);
  return decorate(data[0] as Record<string, unknown>, dmap, cmap, smap, bmap, pmap, ccmap);
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
  // ช่องว่าง → null สำหรับ uuid(_id)/date/timestamp ทั้งหมด (กัน error type uuid/date: "")
  nullifyEmpty(out);
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
  return decorate(data![0] as unknown as Record<string, unknown>, dmap, {});
}

export async function updateEmployee(id: string, body: Record<string, unknown>): Promise<EmployeeRow | null> {
  const cols = await toColumns(body);
  if (Object.keys(cols).length === 0) return getEmployee(id);
  const { data, error } = await supabaseAdmin().from(TABLE).update(cols).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const dmap = await deptMap();
  return decorate(data[0] as unknown as Record<string, unknown>, dmap, {});
}

/** soft delete เท่านั้น — เปลี่ยนสถานะเป็น inactive (กันลบข้อมูลจริง) */
export async function softDeleteEmployee(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from(TABLE).update({ employment_status: "inactive" }).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
