/**
 * 💸 สูตรกลางของแอปโอนเงินจีน — ใช้ร่วมกันระหว่างหน้าแอป (app/app/china-pay) กับหน้าพิมพ์ (lib/china-bills-print)
 *   ชั้นเรท R1–R4 (นับเป็นหยวน) · สถานะบิล 3 ระดับ (ยอดสลิปเทียบยอดบิล) · ชื่อ/ประเภทบิล
 *   ย้ายออกมาจาก page.tsx เมื่อ 2026-11-03 (ตอนทำใบพิมพ์สรุปบิล) — แก้สูตรที่นี่ที่เดียว ทั้งสองหน้าทำตาม · pure ไม่มี React
 */

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };

// เรทตามชั้นยอด — กรอกแค่ R1, R2-R4 = R1 ลบส่วนต่างคงที่
// ★ บันไดชั้นเรทนับเป็น "หยวน (¥)" ไม่ใช่บาท (ยืนยันกับร้านรับโอน 2026-08-24)
//   เดิมโค้ดเอา "ยอดบาท" ไปเทียบบันได → โอนเกิน ฿5,000 (≈¥1,000) ก็ได้ R2 ทันที R1 แทบไม่เคยถูกใช้
export const RATE_OFFSET = { r2: 0.035, r3: 0.075, r4: 0.08 };
export const RATE_TABLE = [
  { tier: "R1", label: "¥1 – 5,000", off: 0 }, { tier: "R2", label: "¥5,001 – 99,999", off: RATE_OFFSET.r2 },
  { tier: "R3", label: "¥100,000 – 399,999", off: RATE_OFFSET.r3 }, { tier: "R4", label: "¥400,000 ขึ้นไป", off: RATE_OFFSET.r4 },
];
export const TIER_NAMES = ["R1", "R2", "R3", "R4"];
export const TIER_MIN = [0, 5001, 100000, 400000];                                    // ¥ ขั้นต่ำของแต่ละชั้น
export const TIER_OFF = [0, RATE_OFFSET.r2, RATE_OFFSET.r3, RATE_OFFSET.r4];

// รู้ "จำนวนหยวน" อยู่แล้ว → บอกชั้น/เรทได้ตรง ๆ
export function tierIdxForRmb(rmb: number): number {
  if (rmb <= 5000) return 0;
  if (rmb <= 99999) return 1;
  if (rmb <= 399999) return 2;
  return 3;
}
export function rateForRmb(rmb: number, r1: number): number {
  if (!r1) return 0;
  const off = TIER_OFF[tierIdxForRmb(rmb)];
  return off ? +(r1 - off).toFixed(4) : r1;
}

// รู้แค่ "จำนวนบาทที่โอน" → หาว่าซื้อหยวนได้เท่าไร (เรทขึ้นกับจำนวนหยวน = วนกันเอง)
// วิธีตัด: ไล่จากชั้นสูงลงต่ำ ชั้นไหน "ใช้เรทชั้นนั้นแล้วซื้อหยวนได้ถึงขั้นต่ำของชั้นจริง" = ใช้ชั้นนั้น
export function buyRmbWithThb(thb: number, r1: number): { tierIdx: number; rate: number; rmb: number } {
  if (!r1 || thb <= 0) return { tierIdx: 0, rate: r1 || 0, rmb: 0 };
  for (let i = TIER_MIN.length - 1; i >= 1; i--) {
    const rate = +(r1 - TIER_OFF[i]).toFixed(4);
    const rmb = rate > 0 ? thb / rate : 0;
    if (rmb >= TIER_MIN[i]) return { tierIdx: i, rate, rmb };
  }
  return { tierIdx: 0, rate: r1, rmb: thb / r1 };
}

// ---- สถานะบิลจีน 3 ระดับ (ยอดที่จ่ายแล้วเทียบยอดบิล) ----
// ยอดที่จ่ายแล้ว = มากสุดของ (ยอดที่ตัดโอนจากหน้า "โอนเข้าจีน" = paid_rmb) กับ (ยอดสลิปจ่ายร้านที่แนบ)
//   ★ 2026-11-03 เดิมดูแค่สลิป → บิลที่ตัดโอนแล้ว (status โอนแล้ว) แต่ยังไม่แนบสลิปขึ้น "รอโอน" ในแท็บบิลจีนทั้งหมด
//     ขณะที่ Dashboard นับจาก status (6 บิล vs 16 บิล) · ข้อมูลจริงไม่มีบิลไหนแนบสลิปเลย ทุกใบจ่ายผ่านหน้าโอนเข้าจีน
//     ใช้ "มากสุด" ไม่ใช่ "รวม" เพราะสลิปจ่ายร้านมักเป็นหลักฐานของเงินก้อนเดียวกับที่ตัดโอน (บวกกัน = นับซ้ำ)
export type Slip = { key: string; amount_rmb: number; at?: string };
export const billSlips = (b: Record<string, unknown>): Slip[] =>
  Array.isArray(b.slips) ? (b.slips as Record<string, unknown>[]).map((s) => ({ key: String(s.key ?? ""), amount_rmb: num(s.amount_rmb), at: s.at ? String(s.at) : undefined })) : [];
export const billTotalRmb = (b: Record<string, unknown>) => num(b.amount_rmb) + num(b.fee_rmb);
export const slipSumRmb = (b: Record<string, unknown>) => billSlips(b).reduce((a, s) => a + s.amount_rmb, 0);
export const billPaidRmb = (b: Record<string, unknown>) => Math.max(slipSumRmb(b), num(b.paid_rmb));
/** ยอดที่ยังต้องจ่าย (¥) */
export const billRemainRmb = (b: Record<string, unknown>) => Math.max(0, billTotalRmb(b) - billPaidRmb(b));
// บิลแบบบาท (ค่าส่ง/VAT) — ยอดเป็น ฿ ตรง ไม่ใช้เรท ไม่มีสลิป ¥
export const isThbBill = (b: Record<string, unknown>): boolean => !!b.is_shipping || !!b.vat_type;
export const billTypeLabel = (b: Record<string, unknown>): string =>
  b.is_shipping ? "ค่าส่ง" : b.vat_type ? `VAT ${String(b.vat_type)}` : "";
// ชื่อที่โชว์ในรายการ: ประเภท (ค่าส่ง/VAT) หรือชื่อร้าน
export const billDisplayName = (b: Record<string, unknown>): string =>
  billTypeLabel(b) || String(b.supplier_label ?? b.supplier_id ?? "—");
// คืนสถานะ: ยกเลิก / รอโอน / โอนแล้วบางส่วน / โอนครบแล้ว
export function billStatus3(b: Record<string, unknown>): string {
  if (String(b.status ?? "") === "ยกเลิก") return "ยกเลิก";
  if (String(b.status ?? "") === "โอนแล้ว") return "โอนครบแล้ว";   // หน้าโอนเข้าจีนตั้งให้เมื่อตัดครบ (หรือคนตั้งเองในตาราง)
  if (isThbBill(b)) return "รอโอน";
  const total = billTotalRmb(b), paid = billPaidRmb(b);
  if (total > 0 && paid >= total - 0.001) return "โอนครบแล้ว";
  if (paid > 0) return "โอนแล้วบางส่วน";
  return "รอโอน";
}
/** บิลที่สลิปจ่ายร้านยังไม่ครบยอด → ตัวเลือกของปุ่มแนบสลิป (AI จับคู่ / เลือกบิลเอง) · ไม่สนว่าตัดโอนแล้วหรือยัง (สลิป = หลักฐานจ่ายร้าน) */
export const billNeedsSlip = (b: Record<string, unknown>): boolean =>
  !isThbBill(b) && String(b.status ?? "") !== "ยกเลิก" && slipSumRmb(b) < billTotalRmb(b) - 0.001;

// ---- ตัวกรองหน้า "บิลจีนทั้งหมด" (ค้างโอน = รอโอน + บางส่วน) ----
export const ALL_FILTERS = ["ค้างโอน", "ทั้งหมด", "รอโอน", "โอนแล้วบางส่วน", "โอนครบแล้ว", "ยกเลิก"] as const;
export function billInFilter(b: Record<string, unknown>, filter: string): boolean {
  if (filter === "ทั้งหมด") return true;
  const s = billStatus3(b);
  if (filter === "ค้างโอน") return s === "รอโอน" || s === "โอนแล้วบางส่วน";
  return s === filter;
}
