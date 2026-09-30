/**
 * Payroll — โหลด "สัญญาที่อยู่ในงวด" จาก DB (ของกลาง ใช้แทน query is_current/active ที่กระจายทุกจุด)
 * กฎการเลือกอยู่ที่ lib/payroll-period-contracts.ts (pure มีเทสต์)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PERIOD_CONTRACT_STATUSES, contractMapForPeriod } from "@/lib/payroll-period-contracts";

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * map employee_id → สัญญาที่ใช้คิดงวดนี้
 * @param opts.companyId   กรองบริษัทของงวด (ถ้างวดผูกบริษัท)
 * @param opts.employeeIds จำกัดเฉพาะคนเหล่านี้ (เช่น สลิปที่บันทึกแล้ว) — [] = ไม่โหลดเลย
 * @param opts.select      คอลัมน์ (default *) — ต้องมี employee_id, status, is_current, start_date, end_date เสมอ
 */
export async function loadPeriodContractMap(
  admin: Admin,
  period: Row,
  opts: { companyId?: string | null; employeeIds?: string[]; select?: string } = {},
): Promise<Map<string, Row>> {
  if (opts.employeeIds && opts.employeeIds.length === 0) return new Map();
  const ps = String(period.start_date ?? "").slice(0, 10);
  const pe = String(period.end_date ?? "").slice(0, 10);
  let q = admin.from("employee_contracts").select(opts.select ?? "*").in("status", [...PERIOD_CONTRACT_STATUSES]);
  if (ISO.test(pe)) q = q.lte("start_date", pe);
  if (ISO.test(ps)) q = q.or(`end_date.is.null,end_date.gte.${ps}`);
  if (opts.companyId) q = q.eq("company_id", opts.companyId);
  if (opts.employeeIds) q = q.in("employee_id", opts.employeeIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return contractMapForPeriod((data ?? []) as unknown as Row[], period);
}
