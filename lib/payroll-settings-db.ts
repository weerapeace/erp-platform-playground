/**
 * Payroll module — ตั้งค่าเงินเดือนรายคน (employee_payroll_settings) — ครบเหมือนแอปเก่า
 *
 * 1 แถว/พนักงาน — คุมการคำนวณ (ประกันสังคม/ภาษี/OT/รายชิ้น/เบี้ยขยัน/เบิกล่วงหน้า)
 * ใช้ใน Phase 3 (เครื่องคำนวณ) → ห้ามดึงมาไม่ครบ
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { nullifyEmpty } from "@/lib/payroll-coerce";

const TABLE = "employee_payroll_settings";
const SELECT = "*";

const WRITABLE = new Set([
  "payroll_group_id", "tax_calculation_method",
  "social_security_enabled", "withholding_tax_enabled", "overtime_enabled",
  "withholding_tax_company_paid",
  "piece_rate_enabled", "attendance_bonus_enabled", "advance_payment_allowed",
  "max_advance_amount", "default_mid_month_advance_amount",
  "social_security_employee_amount", "social_security_employer_amount", "withholding_tax_rate",
]);
const NUMERIC = [
  "max_advance_amount", "default_mid_month_advance_amount",
  "social_security_employee_amount", "social_security_employer_amount", "withholding_tax_rate",
];

export type SettingRow = Record<string, unknown> & { id: string };

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
async function codeToEmployeeId(code: string): Promise<string | null> {
  if (!code) return null;
  const { data } = await supabaseAdmin().from("employees").select("id").eq("employee_code", code).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

function decorate(row: Record<string, unknown>, em: Record<string, string>): SettingRow {
  return { ...row, id: row.id as string, employee_name: row.employee_id ? (em[row.employee_id as string] ?? "") : "", active: true };
}

function toColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) { if (WRITABLE.has(k)) out[k] = v; }
  for (const k of NUMERIC) { if (k in out) out[k] = Number(out[k]) || 0; }
  nullifyEmpty(out);   // '' → null สำหรับ uuid(_id)/date/timestamp
  return out;
}

export async function listSettings(_inc: boolean, employeeId?: string | null): Promise<SettingRow[]> {
  let q = supabaseAdmin().from(TABLE).select(SELECT);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const em = await empMap();
  const rows = (data ?? []).map((r) => decorate(r as Record<string, unknown>, em));
  rows.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
  return rows;
}

export async function getSettings(id: string): Promise<SettingRow | null> {
  const { data, error } = await supabaseAdmin().from(TABLE).select(SELECT).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const em = await empMap();
  return decorate(data[0] as Record<string, unknown>, em);
}

export async function createSettings(body: Record<string, unknown>): Promise<SettingRow> {
  const employeeId = body.employee_id ?? (body.employee_code ? await codeToEmployeeId(String(body.employee_code)) : null);
  if (!employeeId) throw new Error("ต้องระบุพนักงาน (employee_code) ที่มีอยู่จริง");
  const cols = toColumns(body);
  const insert = {
    employee_id: employeeId,
    tax_calculation_method: cols.tax_calculation_method ?? "manual",
    social_security_enabled: cols.social_security_enabled ?? true,
    withholding_tax_enabled: cols.withholding_tax_enabled ?? false,
    withholding_tax_company_paid: cols.withholding_tax_company_paid ?? false,
    overtime_enabled: cols.overtime_enabled ?? false,
    piece_rate_enabled: cols.piece_rate_enabled ?? false,
    attendance_bonus_enabled: cols.attendance_bonus_enabled ?? false,
    advance_payment_allowed: cols.advance_payment_allowed ?? false,
    max_advance_amount: cols.max_advance_amount ?? 0,
    default_mid_month_advance_amount: cols.default_mid_month_advance_amount ?? 0,
    social_security_employee_amount: cols.social_security_employee_amount ?? 0,
    social_security_employer_amount: cols.social_security_employer_amount ?? 0,
    withholding_tax_rate: cols.withholding_tax_rate ?? 0,
    ...cols,
  };
  const { data, error } = await supabaseAdmin().from(TABLE).insert(insert).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const em = await empMap();
  return decorate(data![0] as Record<string, unknown>, em);
}

export async function updateSettings(id: string, body: Record<string, unknown>): Promise<SettingRow | null> {
  const cols = toColumns(body);
  if (Object.keys(cols).length === 0) return getSettings(id);
  const { data, error } = await supabaseAdmin().from(TABLE).update(cols).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const em = await empMap();
  return decorate(data[0] as Record<string, unknown>, em);
}

/** ตั้งค่าเงินเดือนลบไม่ได้ (1 แถว/พนักงาน คุมการคำนวณ) */
export async function softDeleteSettings(_id: string): Promise<boolean> {
  throw new Error("ตั้งค่าเงินเดือนลบไม่ได้ — แก้ค่าแทน");
}
