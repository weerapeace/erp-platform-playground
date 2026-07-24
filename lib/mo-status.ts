// ของกลาง: ตรรกะ "สถานะงานผลิต 9 ขั้น" ที่เดียว — ใช้ทั้ง Popup สถานะ + badge บนการ์ด
// กติกา: จ่าย/ส่ง ชนะเสมอ (แม้ของยังไม่ครบ) — ผู้เรียกไปเติม note เตือนเอง
export type MoStatusTone = "gray" | "rose" | "amber" | "green" | "indigo";

export type MoStatusInput = {
  prepDone: number; prepTotal: number;
  cutDone: number; cutTotal: number;
  qty: number; dispatched: number; received: number;
};

export type MoStatusResult = { code: number; label: string; short: string; tone: MoStatusTone };

export function computeMoStatus(i: MoStatusInput): MoStatusResult {
  const prepOk = i.prepTotal > 0 && i.prepDone >= i.prepTotal;
  const cutOk = i.cutTotal === 0 || i.cutDone >= i.cutTotal;
  const q = i.qty;
  if (q > 0 && i.received >= q)        return { code: 9, label: "ส่งครบแล้ว", short: "ส่งครบ", tone: "green" };
  if (i.received > 0)                  return { code: 8, label: "ส่งแล้วบางส่วน", short: "ส่งบางส่วน", tone: "amber" };
  if (q > 0 && i.dispatched >= q)      return { code: 6, label: "จ่ายครบแล้ว — กำลังผลิต", short: "กำลังผลิต", tone: "indigo" };
  if (i.dispatched > 0)               return { code: 7, label: "จ่ายบางส่วน — ยังจ่ายไม่ครบ", short: "จ่ายบางส่วน", tone: "indigo" };
  if (prepOk && cutOk)                return { code: 5, label: "พร้อมจ่าย", short: "พร้อมจ่าย", tone: "green" };
  if (i.cutDone > 0 && !prepOk)       return { code: 4, label: "ตัดแล้วแต่ของยังไม่ครบ", short: "ตัด·ของไม่ครบ", tone: "rose" };
  if (prepOk && i.cutDone === 0)      return { code: 3, label: "เตรียมครบ รอตัด", short: "รอตัด", tone: "amber" };
  if (i.prepDone > 0)                 return { code: 2, label: "ของไม่ครบ", short: "ของไม่ครบ", tone: "rose" };
  return { code: 1, label: "ยังไม่เริ่ม", short: "ยังไม่เริ่ม", tone: "gray" };
}

// สี badge ต่อ tone (ใช้บนการ์ด/ชิป)
export const MO_STATUS_TONE_CLASS: Record<MoStatusTone, string> = {
  gray: "bg-slate-100 text-slate-600 border-slate-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
};
