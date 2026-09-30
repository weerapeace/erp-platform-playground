/**
 * Payroll — กฎกลาง "ใครอยู่ในงวดนี้บ้าง" (pure ไม่แตะ DB)
 *
 * ปัญหาเดิม: ทุกจุดกรองด้วย `is_current=true AND status=active` + พนักงาน `employment_status=active`
 *   = "คนที่ *ตอนนี้* ยังทำงานอยู่" ไม่ใช่ "คนที่ทำงานอยู่ *ในช่วงงวด*"
 *   → พนักงานลาออกกลางเดือน (สัญญาเป็น ended / พนักงานเป็น resigned) หายจากงวดทั้งคน
 *     ทั้งที่ทำงานถึงวันลาออก → เงินเดือนงวดนั้นเป็น 0 (เจอจริงกับ ISG-131 C-Two ลาออก 15/09)
 *
 * กฎใหม่: สัญญา "ซ้อนกับช่วงงวด" = อยู่ในงวด
 *   - เริ่มสัญญา <= วันสิ้นงวด และ (ไม่มีวันสิ้นสุด หรือ สิ้นสุด >= วันเริ่มงวด)
 *   - นับสถานะ active / ended · ไม่นับ cancelled
 *   - พนักงาน "ลาออก" อยู่ในงวดที่วันลาออก >= วันเริ่มงวด
 *   - คนเดียวมีหลายสัญญาซ้อนงวดเดียว → เอาฉบับ is_current ก่อน ไม่งั้นฉบับที่เริ่มล่าสุด
 *     (ข้อจำกัด: คำนวณได้ 1 สัญญา/คน/งวด — ต่อสัญญากลางเดือนจะคิดตามฉบับที่เลือก)
 *   ช่วงวันที่นับจริงให้ effectiveRange (งวด ∩ สัญญา) ตัดให้เองอยู่แล้ว
 *
 * ห้าม import server-only (supabase-admin) ในไฟล์นี้ — ตัวโหลดจาก DB อยู่ payroll-period-contracts-db.ts
 */
type Row = Record<string, unknown>;

export const isISODate = (v: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").slice(0, 10));
const d10 = (v: unknown) => String(v ?? "").slice(0, 10);

/** สถานะสัญญาที่นับเข้างวดได้ (ยกเลิก = ไม่นับ) */
export const PERIOD_CONTRACT_STATUSES: readonly string[] = ["active", "ended"];

export function contractOverlapsPeriod(contract: Row, period: Row): boolean {
  if (!PERIOD_CONTRACT_STATUSES.includes(String(contract.status ?? "active"))) return false;
  const ps = d10(period.start_date), pe = d10(period.end_date);
  const cs = d10(contract.start_date), ce = d10(contract.end_date);
  if (isISODate(cs) && isISODate(pe) && cs > pe) return false;   // เริ่มหลังงวดจบ
  if (isISODate(ce) && isISODate(ps) && ce < ps) return false;   // จบก่อนงวดเริ่ม
  return true;
}

/** เลือก 1 สัญญาต่อคนสำหรับงวดนี้ (null = ไม่มีสัญญาที่ซ้อนงวด) */
export function pickContractForPeriod(contracts: Row[], period: Row): Row | null {
  const hits = contracts.filter((c) => contractOverlapsPeriod(c, period));
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const ac = a.is_current === true ? 1 : 0, bc = b.is_current === true ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return d10(b.start_date).localeCompare(d10(a.start_date));
  });
  return hits[0];
}

/** จัดกลุ่มสัญญาเป็น map employee_id → สัญญาที่ใช้ในงวด */
export function contractMapForPeriod(contracts: Row[], period: Row): Map<string, Row> {
  const byEmp = new Map<string, Row[]>();
  for (const c of contracts) {
    const id = String(c.employee_id ?? "");
    if (!id) continue;
    const list = byEmp.get(id) ?? [];
    list.push(c);
    byEmp.set(id, list);
  }
  const out = new Map<string, Row>();
  for (const [id, list] of byEmp) {
    const pick = pickContractForPeriod(list, period);
    if (pick) out.set(id, pick);
  }
  return out;
}

/** พนักงานคนนี้ยังอยู่ในงวดไหม (ลาออกก่อนงวดเริ่ม = ไม่อยู่) */
export function employeeInPeriod(employee: Row, period: Row): boolean {
  const rd = d10(employee.resign_date), ps = d10(period.start_date);
  if (String(employee.employment_status ?? "active") !== "active" && isISODate(rd) && isISODate(ps) && rd < ps) return false;
  return true;
}

/** ถ้าวันลาออกของพนักงานมาก่อนวันสิ้นสุดสัญญา ให้ตัดสัญญาที่วันลาออก (นับวันไม่เกินวันที่ทำจริง) */
export function capContractByResignDate(contract: Row, employee: Row): Row {
  const rd = d10(employee.resign_date), ce = d10(contract.end_date);
  if (String(employee.employment_status ?? "active") === "active" || !isISODate(rd)) return contract;
  if (!isISODate(ce) || rd < ce) return { ...contract, end_date: rd };
  return contract;
}
