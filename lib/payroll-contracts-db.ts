/**
 * Payroll module — Contracts data layer (ของจริง / Phase 2)
 *
 * ต่อตาราง `employee_contracts` จริง (78 สัญญา) ผ่าน service-role
 * map employee_id → ชื่อพนักงาน, company_id → ชื่อบริษัท
 *
 * soft delete = status → cancelled (กันลบสัญญาจริงที่มีเงินเดือนผูก)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLE = "employee_contracts";
// ดึงทุกคอลัมน์ (เหมือนแอปเก่า)
const SELECT = "*";

const WRITABLE = new Set([
  "contract_no", "contract_type", "employment_type", "wage_type",
  "base_salary", "daily_wage", "hourly_wage", "piece_rate_default", "payment_cycle",
  "start_date", "end_date", "is_current", "status", "payroll_register_base_salary",
  "work_schedule_id", "overtime_policy_id", "leave_policy_id",
  "include_pnd3_export", "include_payroll_register_export", "attendance_scan_exempt",
]);
const NUMERIC = ["base_salary", "daily_wage", "hourly_wage", "piece_rate_default", "payroll_register_base_salary"];

export type ContractRow = Record<string, unknown> & { id: string };

async function empMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from("employees").select("id, employee_code, first_name, last_name, nickname");
  const m: Record<string, string> = {};
  (data ?? []).forEach((e) => {
    const r = e as { id: string; employee_code: string; first_name: string; last_name: string; nickname: string | null };
    const nm = [r.first_name, r.last_name].filter((x) => x && x !== "-").join(" ") || r.nickname || r.employee_code;
    m[r.id] = `${r.employee_code} · ${nm}`;
  });
  return m;
}
async function companyMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from("companies").select("id, name");
  const m: Record<string, string> = {};
  (data ?? []).forEach((c) => { m[(c as { id: string }).id] = (c as { name: string }).name; });
  return m;
}
async function nameToCompanyId(name: string): Promise<string | null> {
  if (!name) return null;
  const { data } = await supabaseAdmin().from("companies").select("id").eq("name", name).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}
async function codeToEmployeeId(code: string): Promise<string | null> {
  if (!code) return null;
  const { data } = await supabaseAdmin().from("employees").select("id").eq("employee_code", code).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

function decorate(row: Record<string, unknown>, em: Record<string, string>, cm: Record<string, string>): ContractRow {
  return {
    ...row,
    id: row.id as string,
    employee_name: row.employee_id ? (em[row.employee_id as string] ?? "") : "",
    company_name:  row.company_id ? (cm[row.company_id as string] ?? "") : "",
    active:        row.status === "active",
  };
}

export async function listContracts(includeInactive: boolean, employeeId?: string | null): Promise<ContractRow[]> {
  let q = supabaseAdmin().from(TABLE).select(SELECT).order("contract_no", { ascending: true });
  if (!includeInactive) q = q.eq("status", "active");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const [em, cm] = await Promise.all([empMap(), companyMap()]);
  return (data ?? []).map((r) => decorate(r as Record<string, unknown>, em, cm));
}

export async function getContract(id: string): Promise<ContractRow | null> {
  const { data, error } = await supabaseAdmin().from(TABLE).select(SELECT).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const [em, cm] = await Promise.all([empMap(), companyMap()]);
  return decorate(data[0] as Record<string, unknown>, em, cm);
}

async function toColumns(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) { if (WRITABLE.has(k)) out[k] = v; }
  for (const k of NUMERIC) { if (k in out) out[k] = Number(out[k]) || 0; }
  if ("active" in body && !("status" in out)) {
    out.status = body.active === true || body.active === "true" ? "active" : "cancelled";
  }
  if ("company_name" in body) out.company_id = await nameToCompanyId(String(body.company_name ?? ""));
  for (const k of ["end_date"]) { if (out[k] === "") out[k] = null; }
  return out;
}

export async function createContract(body: Record<string, unknown>): Promise<ContractRow> {
  const employeeId = body.employee_id ?? (body.employee_code ? await codeToEmployeeId(String(body.employee_code)) : null);
  if (!employeeId) throw new Error("ต้องระบุพนักงาน (employee_code) ที่มีอยู่จริง");
  const cols = await toColumns(body);
  const insert = {
    employee_id:   employeeId,
    contract_no:   cols.contract_no ?? `CON-${Date.now()}`,
    wage_type:     cols.wage_type ?? "monthly",
    payment_cycle: cols.payment_cycle ?? "monthly",
    base_salary:   cols.base_salary ?? 0,
    daily_wage:    cols.daily_wage ?? 0,
    hourly_wage:   cols.hourly_wage ?? 0,
    payroll_register_base_salary: cols.payroll_register_base_salary ?? 0,
    start_date:    cols.start_date ?? new Date().toISOString().slice(0, 10),
    status:        cols.status ?? "active",
    ...cols,
  };
  const { data, error } = await supabaseAdmin().from(TABLE).insert(insert).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const [em, cm] = await Promise.all([empMap(), companyMap()]);
  return decorate(data![0] as Record<string, unknown>, em, cm);
}

export async function updateContract(id: string, body: Record<string, unknown>): Promise<ContractRow | null> {
  const cols = await toColumns(body);
  if (Object.keys(cols).length === 0) return getContract(id);
  const { data, error } = await supabaseAdmin().from(TABLE).update(cols).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const [em, cm] = await Promise.all([empMap(), companyMap()]);
  return decorate(data[0] as Record<string, unknown>, em, cm);
}

export async function softDeleteContract(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from(TABLE).update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
