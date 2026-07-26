/**
 * ของกลาง — ดึง "ของที่ผูกกับพนักงาน 1 คน" ในทีเดียว (รายการประจำ / ใบเตือน / สัญญา)
 *
 * ทำไมต้องมี: เดิมแต่ละกล่องยิง API แยกกัน (ค่าประจำ 1 ครั้ง ใบเตือน 1 ครั้ง สัญญา 1 ครั้ง)
 * → เปิด drawer ทีนึงยิง 3 request ชนกัน (ดู memory perf_contention_load_order)
 * ที่นี่รวมเป็น query เดียวยิงขนานฝั่ง server แล้วส่งกลับก้อนเดียว
 *
 * อ่านอย่างเดียว — การเพิ่ม/แก้/ลบ ยังใช้ endpoint เดิมของแต่ละเรื่อง
 * (recurring → /api/payroll/recurring · warnings → /api/payroll/master/warnings · contracts → /api/payroll/core/contracts)
 * เพื่อให้ validate/audit ที่มีอยู่แล้วทำงานเหมือนเดิม
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

export type EmployeeRecords = {
  recurring: Record<string, unknown>[];
  warnings: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
};

const RECURRING_COLS = "id, employee_id, contract_id, item_name, item_type, amount_per_period, duration_type, target_total_amount, paid_or_deducted_amount, calculation_method, quantity_default, rate_default, status, start_date, end_date, note";
const WARNING_COLS = "id, employee_id, warning_date, title, detail, severity, status";
const CONTRACT_COLS = "id, employee_id, contract_no, contract_type, employment_type, wage_type, base_salary, daily_wage, hourly_wage, piece_rate_default, payroll_register_base_salary, payment_cycle, start_date, end_date, is_current, status, company_id";

/** ดึงรายการประจำ + ใบเตือน + สัญญา ของพนักงานคนเดียว (ยิงขนาน) */
export async function getEmployeeRecords(employeeId: string): Promise<EmployeeRecords> {
  const a = supabaseAdmin();
  const [rec, warn, con] = await Promise.all([
    a.from("employee_recurring_pay_items").select(RECURRING_COLS).eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(200),
    a.from("employee_warnings").select(WARNING_COLS).eq("employee_id", employeeId).order("warning_date", { ascending: false }).limit(200),
    a.from("employee_contracts").select(CONTRACT_COLS).eq("employee_id", employeeId).order("start_date", { ascending: false }).limit(100),
  ]);
  const err = rec.error ?? warn.error ?? con.error;
  if (err) throw new Error(err.message);
  return {
    recurring: (rec.data ?? []) as Record<string, unknown>[],
    warnings: (warn.data ?? []) as Record<string, unknown>[],
    contracts: (con.data ?? []) as Record<string, unknown>[],
  };
}
