/**
 * ของกลาง — ใบรับชำระจากลูกค้า (Customer Receipts)
 *
 * ตอบคำถาม "ลูกค้าจ่ายมาแล้วเท่าไหร่ ยังค้างอีกเท่าไหร่"
 * ใช้โดย: หน้า /receipts · หน้า /cashflow (เงินเข้าจริง) · ใบวางบิล · ใบขาย
 *
 * คำนวณล้วน ๆ ไม่แตะฐานข้อมูล — ห้ามเขียนสูตรยอดค้างรับซ้ำในหน้า UI
 */

export type ReceiptStatus = "draft" | "confirmed" | "cancelled";
export type ReceiptMethod = "transfer" | "cash" | "cheque" | "card" | "other";

export const RECEIPT_STATUS: Record<ReceiptStatus, { label: string; color: string; badge: string }> = {
  draft:     { label: "ร่าง",       color: "#888780", badge: "bg-slate-100 text-slate-600" },
  confirmed: { label: "รับเงินแล้ว", color: "#1D9E75", badge: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "ยกเลิก",     color: "#DC2626", badge: "bg-red-100 text-red-600" },
};

export const RECEIPT_METHOD: Record<ReceiptMethod, { label: string; icon: string }> = {
  transfer: { label: "โอนเงิน",     icon: "🏦" },
  cash:     { label: "เงินสด",      icon: "💵" },
  cheque:   { label: "เช็ค",        icon: "📝" },
  card:     { label: "บัตรเครดิต",  icon: "💳" },
  other:    { label: "อื่น ๆ",      icon: "•" },
};

export const receiptStatusLabel = (s: string | null | undefined) =>
  RECEIPT_STATUS[(s ?? "") as ReceiptStatus]?.label ?? s ?? "—";
export const receiptStatusBadge = (s: string | null | undefined) =>
  RECEIPT_STATUS[(s ?? "") as ReceiptStatus]?.badge ?? "bg-slate-100 text-slate-600";
export const receiptMethodLabel = (m: string | null | undefined) =>
  RECEIPT_METHOD[(m ?? "") as ReceiptMethod]?.label ?? m ?? "—";
export const receiptMethodIcon = (m: string | null | undefined) =>
  RECEIPT_METHOD[(m ?? "") as ReceiptMethod]?.icon ?? "•";

/** สถานะที่ถือว่า "รับเงินจริงแล้ว" — ใช้ตอนคิดยอดค้างรับและเงินเข้าในกระแสเงินสด */
export const RECEIPT_PAID_STATUSES: ReceiptStatus[] = ["confirmed"];
export const isReceiptPaid = (s: string | null | undefined) =>
  RECEIPT_PAID_STATUSES.includes((s ?? "") as ReceiptStatus);

// ============================================================
// ยอดค้างรับ
// ============================================================

export type ReceiptAllocation = { so_id?: string | null; billing_note_id?: string | null; amount: number };

/**
 * รวมยอดที่รับชำระไปแล้ว แยกตามใบขาย / ใบวางบิล
 * (รับเฉพาะบรรทัดของใบที่ "รับเงินแล้ว" — ผู้เรียกกรองสถานะมาก่อน)
 */
export function sumAllocations(lines: ReceiptAllocation[]): { bySo: Map<string, number>; byBn: Map<string, number> } {
  const bySo = new Map<string, number>();
  const byBn = new Map<string, number>();
  for (const l of lines) {
    const amt = Number(l.amount ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (l.so_id) bySo.set(l.so_id, (bySo.get(l.so_id) ?? 0) + amt);
    if (l.billing_note_id) byBn.set(l.billing_note_id, (byBn.get(l.billing_note_id) ?? 0) + amt);
  }
  return { bySo, byBn };
}

/** ยอดค้างรับของเอกสาร 1 ใบ — ไม่ติดลบ และปัดเศษสตางค์ให้เรียบร้อย */
export function outstanding(grandTotal: number, paid: number): number {
  const left = Math.round((Number(grandTotal ?? 0) - Number(paid ?? 0)) * 100) / 100;
  return left > 0 ? left : 0;
}

/** ใบนี้ถือว่าปิดยอดแล้วหรือยัง (เผื่อเศษสตางค์ 1 สตางค์) */
export const isFullyPaid = (grandTotal: number, paid: number): boolean =>
  Number(paid ?? 0) >= Number(grandTotal ?? 0) - 0.005;

/**
 * ยอดที่ลูกค้า "ชำระหนี้" จริงในใบรับชำระ 1 ใบ
 * = เงินที่เข้าบัญชี + ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้
 * (ค่าธรรมเนียมธนาคารเป็นต้นทุนของเรา ไม่ได้ลดหนี้ลูกค้า)
 */
export const settledAmount = (amount: number, whtAmount: number): number =>
  Math.round((Number(amount ?? 0) + Number(whtAmount ?? 0)) * 100) / 100;

/** เงินที่เข้าบัญชีจริงจากใบรับชำระ 1 ใบ (หักค่าธรรมเนียมธนาคารแล้ว) — ใช้ในกระแสเงินสด */
export const cashReceived = (amount: number, feeAmount: number): number =>
  Math.round((Number(amount ?? 0) - Number(feeAmount ?? 0)) * 100) / 100;

/**
 * ตรวจว่าการกระจายยอดลงเอกสารถูกต้องไหม — คืนข้อความไทยถ้าผิด, null ถ้าผ่าน
 * กติกา: ยอดที่กระจายรวมกัน ต้องเท่ากับยอดที่ลูกค้าชำระ (เงินเข้า + หัก ณ ที่จ่าย)
 */
export function validateAllocation(
  amount: number, whtAmount: number, lines: { amount: number }[],
): string | null {
  const settled = settledAmount(amount, whtAmount);
  if (settled <= 0) return "ยอดรับชำระต้องมากกว่า 0";
  const allocated = Math.round(lines.reduce((s, l) => s + Number(l.amount ?? 0), 0) * 100) / 100;
  if (allocated <= 0) return "ต้องเลือกอย่างน้อย 1 ใบที่จะตัดยอด";
  if (Math.abs(allocated - settled) > 0.01) {
    const diff = Math.round((settled - allocated) * 100) / 100;
    return diff > 0
      ? `ยังกระจายยอดไม่ครบอีก ${diff.toLocaleString("th-TH")} บาท`
      : `กระจายยอดเกินไป ${Math.abs(diff).toLocaleString("th-TH")} บาท`;
  }
  return null;
}
