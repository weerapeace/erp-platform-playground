/**
 * กลุ่มพนักงาน — ไว้จัดกลุ่มชื่อในตัวเลือกคน (CrewPick) ตอนจ่ายงานบนบอร์ด · เจ้าของขอ 2026-11-05
 *   "ตรงนี้อยากให้จัดกลุ่มตามประเภทพนักงานได้ด้วยจะได้ดูง่าย (ไทย, พม่า, ช่างเหมา)"
 *
 * แยกจากข้อมูลที่มีอยู่แล้ว (ไม่ต้องเพิ่มช่องในฐานข้อมูล):
 *   ช่างเหมา = สัญญาจ้างปัจจุบันเป็นแบบเหมา (employee_contracts.contract_type = "contractor", is_current)
 *              หรือติ๊ก "ช่างเหมา" ในข้อมูลพนักงาน (employees.is_subcontract — ช่างที่เพิ่มจากบอร์ดโต๊ะเหมาติ๊กให้เอง)
 *   ไทย / พม่า = ช่อง "สัญชาติ" หน้าพนักงาน (เก็บเป็น TH / MM · พิมพ์เป็นคำไทย/อังกฤษก็อ่านได้)
 *   สัญชาติอื่น = กรอกไว้แต่ไม่ใช่ไทย/พม่า · ยังไม่ระบุ = ช่องสัญชาติว่าง (ไปใส่ที่หน้าพนักงาน)
 * ช่างเหมามาก่อนสัญชาติ (ช่างเหมาคนไทยอยู่กลุ่มช่างเหมา ไม่ซ้ำในกลุ่มไทย)
 * ไม่มี React — ใช้ทั้ง API (/api/mo/assignees) และหน้าจอ
 */

export type StaffGroup = "hire" | "th" | "mm" | "other" | "unk";

/** ลำดับ + ชื่อกลุ่มที่โชว์บนจอ (แก้ชื่อที่นี่ที่เดียว) */
export const STAFF_GROUPS: { key: StaffGroup; label: string; hint?: string }[] = [
  { key: "hire", label: "ช่างเหมา" },
  { key: "th", label: "ไทย" },
  { key: "mm", label: "พม่า" },
  { key: "other", label: "สัญชาติอื่น" },
  { key: "unk", label: "ยังไม่ระบุสัญชาติ", hint: "ใส่สัญชาติได้ที่หน้าพนักงาน" },
];

const TH_RE = /^(th|tha|thai|thailand|ไทย)$/i;
const MM_RE = /^(mm|mmr|my|myanmar|burma|burmese|พม่า|เมียนมา|เมียนมาร์)$/i;

/** ช่องสัญชาติ → ไทย / พม่า / อื่น / ยังไม่ระบุ */
export function nationalityGroup(nationality: string | null | undefined): "th" | "mm" | "other" | "unk" {
  const n = (nationality ?? "").trim().replace(/\.$/, "");
  if (!n) return "unk";
  if (TH_RE.test(n)) return "th";
  if (MM_RE.test(n)) return "mm";
  return "other";
}

/** กลุ่มของพนักงาน 1 คน */
export function staffGroupOf(e: { contractType?: string | null; isSubcontract?: boolean | null; nationality?: string | null }): StaffGroup {
  if ((e.contractType ?? "").trim().toLowerCase() === "contractor" || e.isSubcontract) return "hire";
  return nationalityGroup(e.nationality);
}
