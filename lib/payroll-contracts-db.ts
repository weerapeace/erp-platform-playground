/**
 * Payroll module — Contracts data layer (ของจริง / Phase 2)
 *
 * ต่อตาราง `employee_contracts` จริง (78 สัญญา) ผ่าน service-role
 * map employee_id → ชื่อพนักงาน, company_id → ชื่อบริษัท
 *
 * soft delete = status → cancelled (กันลบสัญญาจริงที่มีเงินเดือนผูก)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { nullifyEmpty } from "@/lib/payroll-coerce";
import {
  applyContractLifecycle,
  closeEmployeesWithoutActiveCurrentContract,
  resignEmployeesWithoutActiveCurrentContract,
  syncEndedCurrentContracts,
} from "@/lib/payroll-contract-lifecycle";

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
async function wtpMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from("work_time_profiles").select("id, profile_name");
  const m: Record<string, string> = {};
  (data ?? []).forEach((p) => { m[(p as { id: string }).id] = (p as { profile_name: string }).profile_name; });
  return m;
}

async function maps() {
  const [em, cm, wm] = await Promise.all([empMap(), companyMap(), wtpMap()]);
  return { em, cm, wm };
}

function decorate(row: Record<string, unknown>, em: Record<string, string>, cm: Record<string, string>, wm: Record<string, string> = {}): ContractRow {
  const lifecycleRow = applyContractLifecycle(row);
  return {
    ...lifecycleRow,
    id: lifecycleRow.id as string,
    employee_name: lifecycleRow.employee_id ? (em[lifecycleRow.employee_id as string] ?? "") : "",
    company_name:  lifecycleRow.company_id ? (cm[lifecycleRow.company_id as string] ?? "") : "",
    work_time_profile_name: lifecycleRow.work_time_profile_id ? (wm[lifecycleRow.work_time_profile_id as string] ?? "") : "",
    active:        lifecycleRow.status === "active",
  };
}

export async function listContracts(includeInactive: boolean, employeeId?: string | null): Promise<ContractRow[]> {
  const admin = supabaseAdmin();
  await syncEndedCurrentContracts(admin, employeeId ? [employeeId] : undefined);
  let q = admin.from(TABLE).select(SELECT).order("contract_no", { ascending: true });
  if (!includeInactive) q = q.eq("status", "active");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const { em, cm, wm } = await maps();
  return (data ?? []).map((r) => decorate(r as Record<string, unknown>, em, cm, wm));
}

export async function getContract(id: string): Promise<ContractRow | null> {
  const admin = supabaseAdmin();
  await syncEndedCurrentContracts(admin);
  const { data, error } = await admin.from(TABLE).select(SELECT).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const { em, cm, wm } = await maps();
  return decorate(data[0] as Record<string, unknown>, em, cm, wm);
}

async function toColumns(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) { if (WRITABLE.has(k)) out[k] = v; }
  for (const k of NUMERIC) { if (k in out) out[k] = Number(out[k]) || 0; }
  if ("active" in body && !("status" in out)) {
    out.status = body.active === true || body.active === "true" ? "active" : "cancelled";
  }
  if ("company_name" in body) out.company_id = await nameToCompanyId(String(body.company_name ?? ""));
  nullifyEmpty(out);   // '' → null สำหรับ uuid(_id)/date/timestamp ทั้งหมด
  return applyContractLifecycle(out);
}

// เลขที่สัญญารันอัตโนมัติ: CON-{ปี}-{ลำดับ 4 หลัก} เช่น CON-2026-0001 (นับต่อจากเลขล่าสุดของปีนั้น)
async function nextContractNo(admin: ReturnType<typeof supabaseAdmin>, year: number): Promise<string> {
  const prefix = `CON-${year}-`;
  const { data } = await admin
    .from(TABLE)
    .select("contract_no")
    .like("contract_no", `${prefix}%`)
    .order("contract_no", { ascending: false })
    .limit(1);
  let n = 0;
  const last = (data?.[0] as { contract_no?: string } | undefined)?.contract_no;
  if (last) {
    const m = last.match(/-(\d+)$/);
    if (m) n = parseInt(m[1], 10);
  }
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

export async function createContract(body: Record<string, unknown>): Promise<ContractRow> {
  const employeeId = body.employee_id ?? (body.employee_code ? await codeToEmployeeId(String(body.employee_code)) : null);
  if (!employeeId) throw new Error("ต้องระบุพนักงาน (employee_code) ที่มีอยู่จริง");
  const cols = await toColumns(body);
  const admin = supabaseAdmin();

  const providedNo = String(cols.contract_no ?? "").trim();
  const yearStr = String(cols.start_date ?? "").slice(0, 4);
  const year = /^\d{4}$/.test(yearStr) ? Number(yearStr) : new Date().getFullYear();

  const baseInsert: Record<string, unknown> = {
    employee_id:   employeeId,
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

  // ลองบันทึก พร้อม retry ถ้าเลขซ้ำ (กรณีออกเลขอัตโนมัติแล้วชนกัน)
  let contractNo = providedNo || (await nextContractNo(admin, year));
  let data: Record<string, unknown>[] | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const insertWithLifecycle = applyContractLifecycle({ ...baseInsert, contract_no: contractNo });
    const res = await admin.from(TABLE).insert(insertWithLifecycle).select(SELECT).limit(1);
    if (!res.error) { data = res.data as Record<string, unknown>[]; break; }
    // เลขซ้ำ + ออกเลขอัตโนมัติ → ขยับเลขแล้วลองใหม่
    if (res.error.code === "23505" && !providedNo && attempt < 3) {
      contractNo = await nextContractNo(admin, year);
      continue;
    }
    throw new Error(res.error.message);
  }
  if (!data) throw new Error("บันทึกสัญญาไม่สำเร็จ");
  const mergedFinal: Record<string, unknown> = { ...baseInsert, contract_no: contractNo };
  const insertWithLifecycle = applyContractLifecycle(mergedFinal);
  await syncEndedCurrentContracts(admin, [String(employeeId)]);
  if (insertWithLifecycle.status === "ended") {
    await resignEmployeesWithoutActiveCurrentContract(admin, { [String(employeeId)]: String(insertWithLifecycle.end_date ?? "") });
  }
  const { em, cm, wm } = await maps();
  return decorate(data![0] as Record<string, unknown>, em, cm, wm);
}

export async function updateContract(id: string, body: Record<string, unknown>): Promise<ContractRow | null> {
  const cols = await toColumns(body);
  if (Object.keys(cols).length === 0) return getContract(id);
  const admin = supabaseAdmin();
  const { data: existing, error: existingError } = await admin.from(TABLE).select("employee_id, end_date, status, is_current").eq("id", id).limit(1);
  if (existingError) throw new Error(existingError.message);
  const previous = existing?.[0] as Record<string, unknown> | undefined;
  const merged = { ...previous, ...cols };
  const update = applyContractLifecycle(merged);
  const { data, error } = await admin.from(TABLE).update(update).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const employeeId = String((data[0] as Record<string, unknown>).employee_id ?? "");
  if (employeeId) await syncEndedCurrentContracts(admin, [employeeId]);
  const endedCurrentContract = employeeId && previous?.is_current === true && update.status === "ended";
  if (endedCurrentContract) {
    await resignEmployeesWithoutActiveCurrentContract(admin, { [employeeId]: String(update.end_date ?? previous?.end_date ?? "") });
  } else if (employeeId && previous?.is_current === true && update.status !== "active") {
    await closeEmployeesWithoutActiveCurrentContract(admin, [employeeId]);
  }
  if (employeeId && previous?.is_current === true && update.is_current === false && update.status !== "ended") {
    await closeEmployeesWithoutActiveCurrentContract(admin, [employeeId]);
  }
  const { em, cm, wm } = await maps();
  return decorate(data[0] as Record<string, unknown>, em, cm, wm);
}

export async function softDeleteContract(id: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: existing, error: existingError } = await admin.from(TABLE).select("employee_id, is_current").eq("id", id).limit(1);
  if (existingError) throw new Error(existingError.message);
  const { error } = await admin.from(TABLE).update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(error.message);
  const employeeId = String((existing?.[0] as Record<string, unknown> | undefined)?.employee_id ?? "");
  if (employeeId) await syncEndedCurrentContracts(admin, [employeeId]);
  if (employeeId && (existing?.[0] as Record<string, unknown> | undefined)?.is_current === true) {
    await closeEmployeesWithoutActiveCurrentContract(admin, [employeeId]);
  }
  return true;
}
