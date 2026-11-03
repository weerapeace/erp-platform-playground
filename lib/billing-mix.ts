/**
 * ใบวางบิลรวม "คนละลูกค้า / คนละสาขา" — ตรรกะกลาง ไม่แตะ DB
 * ใช้ร่วมกัน: หน้าใบวางบิล (/billing-notes) · ตัวเลือกใบกำกับ · เทสต์
 * กติกาเดียวกับ RPC erp_playground_billing_note_apply_mix (ฝั่ง DB เป็นด่านจริง ตัวนี้ไว้เตือนบนหน้าจอ)
 *
 *   0 = ลูกค้าเดียวกับลูกค้าหลัก
 *   1 = คนละสาขา บริษัทเดียวกัน (เลขผู้เสียภาษี 13 หลักตรงกัน) → เตือนเหลือง + ต้องมีเหตุผล
 *   2 = คนละบริษัท หรือตรวจไม่ได้ (ไม่มีเลขผู้เสียภาษี) → เตือนแดง + เหตุผล + ติ๊กยืนยัน
 */
import { branchLabel } from "@/lib/sales-tax-report";

export type BillingParty = {
  id: string;
  name: string;
  code?: string | null;
  tax_id?: string | null;
  tax_branch?: string | null;
};

export type MixRelation = 0 | 1 | 2;
export type MixLevel = "branch" | "company";

/** เหตุผลต้องยาวอย่างน้อยเท่านี้ (ตรงกับ DB) */
export const MIX_REASON_MIN = 5;

export const MIX_LEVEL_LABEL: Record<MixLevel, string> = {
  branch: "รวมหลายสาขา",
  company: "รวมคนละบริษัท",
};

/** เหตุผลสำเร็จรูป (กดแล้วเติมลงช่องเหตุผล) */
export const MIX_REASON_CHIPS: Record<MixLevel, string[]> = {
  branch: ["ลูกค้าขอรวมวางบิลที่สำนักงานใหญ่", "สาขาจ่ายเงินรวมกัน", "รอบวางบิลเดียวกัน"],
  company: ["บริษัทในเครือจ่ายแทน", "ลูกค้าขอรวมใบเดียว"],
};

/** เลขผู้เสียภาษีเหลือแต่ตัวเลข — ใช้ได้เมื่อครบ 13 หลัก */
export function normTaxId(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** ความสัมพันธ์ของลูกค้าในบรรทัด กับลูกค้าหลักของใบวางบิล */
export function relationTo(
  mainId: string | null | undefined,
  otherId: string | null | undefined,
  parties: ReadonlyMap<string, BillingParty>,
): MixRelation {
  if (!otherId || !mainId || otherId === mainId) return 0;
  const a = normTaxId(parties.get(mainId)?.tax_id);
  const b = normTaxId(parties.get(otherId)?.tax_id);
  return a.length === 13 && a === b ? 1 : 2;
}

/** ระดับของทั้งใบ = ความสัมพันธ์ที่ "ห่างที่สุด" */
export function mixLevelOf(relations: MixRelation[]): MixLevel | null {
  const max = Math.max(0, ...relations);
  return max === 1 ? "branch" : max === 2 ? "company" : null;
}

/** ป้ายลูกค้า/สาขาของบรรทัด — บริษัทเดียวกันโชว์สาขา ("สาขาคลังสินค้าเซ็นทรัลทำ (สาขา 00005)") · คนละบริษัทโชว์ชื่อ */
export function partyLabel(p: BillingParty | undefined, sameCompany: boolean): string {
  if (!p) return "";
  if (!sameCompany) return p.name;
  const raw = String(p.tax_branch ?? "").trim();
  const code = !raw || /^0+$/.test(raw) || /^\d{1,5}$/.test(raw) || /สำนักงานใหญ่|head\s*office/i.test(raw)
    ? branchLabel(raw) : "";
  const desc = (p.name.match(/(สาขา[^()]*[^()\s])\s*\(สาขาที่/) ?? [])[1] ?? "";
  if (desc && code) return `${desc} (${code})`;
  return code || desc || p.name;
}

/** ตรวจก่อนบันทึก — คืนข้อความผิดพลาด (ภาษาคน) หรือ null ถ้าผ่าน */
export function validateMix(level: MixLevel | null, reason: string, ack: boolean, alreadyCompany = false): string | null {
  if (!level) return null;
  if (reason.trim().length < MIX_REASON_MIN) return `ใส่เหตุผลที่รวมบิลก่อน (อย่างน้อย ${MIX_REASON_MIN} ตัวอักษร)`;
  if (level === "company" && !ack && !alreadyCompany) return "ติ๊กยืนยันว่าลูกค้าตกลงให้รวมบิลคนละบริษัทก่อน";
  return null;
}
