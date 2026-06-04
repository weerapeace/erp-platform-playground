/**
 * Payroll module — ผูกสัญญาให้รายการเงินประจำ (bind contract → recurring) / Phase 3
 *
 * contract_id ในข้อมูลจริงเป็น null — ฟีเจอร์นี้ให้ผู้ใช้ "ผูกสัญญา" ให้แต่ละรายการได้
 * เลือกได้เฉพาะสัญญาของพนักงานคนเดียวกัน (validate) — เขียนเฉพาะ contract_id (ปลอดภัย)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ContractOption = { id: string; contract_no: string; status: string; wage_type: string };

/** รายชื่อสัญญาของพนักงานคนหนึ่ง (สำหรับ dropdown ผูกสัญญา) */
export async function listEmployeeContracts(employeeId: string): Promise<ContractOption[]> {
  if (!employeeId) return [];
  const { data, error } = await supabaseAdmin()
    .from("employee_contracts")
    .select("id, contract_no, status, wage_type")
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractOption[];
}

/** ผูก/ยกเลิกผูกสัญญาให้รายการเงินประจำ (contract_id = null = ยกเลิกผูก) */
export async function bindContract(recurringId: string, contractId: string | null): Promise<{ id: string; contract_id: string | null; contract_no: string | null }> {
  const admin = supabaseAdmin();
  const { data: rec, error: e1 } = await admin
    .from("employee_recurring_pay_items").select("id, employee_id").eq("id", recurringId).limit(1);
  if (e1) throw new Error(e1.message);
  if (!rec?.[0]) throw new Error("ไม่พบรายการเงินประจำ");
  const empId = (rec[0] as { employee_id: string }).employee_id;

  let contractNo: string | null = null;
  if (contractId) {
    const { data: con, error: e2 } = await admin
      .from("employee_contracts").select("id, employee_id, contract_no").eq("id", contractId).limit(1);
    if (e2) throw new Error(e2.message);
    if (!con?.[0]) throw new Error("ไม่พบสัญญา");
    if ((con[0] as { employee_id: string }).employee_id !== empId) {
      throw new Error("สัญญานี้ไม่ใช่ของพนักงานคนเดียวกัน — ผูกไม่ได้");
    }
    contractNo = (con[0] as { contract_no: string }).contract_no;
  }

  const { error } = await admin
    .from("employee_recurring_pay_items").update({ contract_id: contractId }).eq("id", recurringId);
  if (error) throw new Error(error.message);
  return { id: recurringId, contract_id: contractId, contract_no: contractNo };
}
