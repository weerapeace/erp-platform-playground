/**
 * กฎตรวจ "ยอดที่แยกต้องรวมได้เท่ากับยอดจ่ายรวม" ของใบจ่ายเงินกู้
 * --------------------------------------------------------------------------
 * แยกไฟล์ไว้เพราะใช้ 2 ที่: หน้า /loan-payments และแผงรายการจ่ายในหน้าสัญญา
 * (ไฟล์ page.tsx ของ Next.js ห้าม export อย่างอื่นนอกจากตัวหน้า)
 *
 * เป็นกฎเดียวกับที่ฐานข้อมูลบังคับ — บอกตั้งแต่บนจอ จะได้ไม่เสียเที่ยว
 */
export function paymentSplitCheck(d: Record<string, unknown>): { ok: boolean; message?: string } {
  const n = (k: string) => { const v = Number(d[k]); return isFinite(v) ? v : 0; };
  const total = n("total_paid");
  const split = Math.round((n("principal_amount") + n("interest_amount") + n("penalty_amount")
                          + n("fee_amount") + n("other_amount")) * 100) / 100;
  if (total <= 0) return { ok: false, message: "ยังไม่ได้ใส่ยอดจ่าย" };
  if (split === 0) return { ok: true, message: "ไม่ได้แยกยอด — ระบบจะตัดดอกเบี้ยก่อนแล้วเงินต้นให้เอง" };
  const diff = Math.round((total - split) * 100) / 100;
  if (Math.abs(diff) <= 0.01) return { ok: true, message: "ยอดที่แยกตรงกับยอดจ่ายรวม" };
  return {
    ok: false,
    message: diff > 0
      ? `ยอดที่แยกรวม ${split.toLocaleString("th-TH")} ยังขาดอีก ${diff.toLocaleString("th-TH")} จากยอดจ่าย ${total.toLocaleString("th-TH")}`
      : `ยอดที่แยกรวม ${split.toLocaleString("th-TH")} เกินยอดจ่าย ${total.toLocaleString("th-TH")} อยู่ ${(-diff).toLocaleString("th-TH")}`,
  };
}
