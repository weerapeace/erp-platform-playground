/**
 * "รอของ" — ของที่สั่งในใบสั่งซื้อของใบสำคัญรับนั้น แต่ร้านยังไม่ส่ง (pure · ใช้ทั้งหน้าเว็บและเซิร์ฟเวอร์)
 * ★ 2026-11-16 เจ้าของ: "บางทีในบิลยังไม่ส่ง" → แบบ B (ติ๊กในส่วน "ไม่อยู่ในบิล") + ข้อ 3 ป้าย "รอของ n รายการ" ที่หัวบิลและหน้ารายการใบสำคัญ
 *   นับ = บรรทัดใบสั่งซื้อใน PO ที่ใบนั้นอ้างถึง ที่ ยังไม่รับครบ · ไม่ได้ปิดยอด · PO ยังเปิด · ยังไม่อยู่ในใบสำคัญใบไหนเลย (ใบที่ยกเลิกไม่นับ)
 *   ตรงกับรายการ "ไม่อยู่ในบิล" ที่เลือก "รอรอบหน้า" ในหน้าใบ — กด "ปิดยอด" แล้วยืนยันใบ = บรรทัดถูกปิด หายจากตัวนับเอง
 *   (หน้าใบนับ "PO ที่สั่งวันเดียวกัน" ด้วย · หน้ารายการนับเฉพาะ PO ที่ใบอ้างถึง — ตัวเลขอาจน้อยกว่าเล็กน้อย)
 * ใช้: API /api/purchasing/vouchers (รายการ) → waiting_count · ทดสอบ lib/__tests__/voucher-waiting.test.ts
 */
export type WaitVoucherLine = { voucher_id: string; po_id: string | null };
export type WaitPoLine = { id: string; po_id: string; qty: number | string | null; qty_received: number | string | null; line_status: string | null; is_active: boolean | null };

/** สถานะบรรทัดใบสั่งซื้อที่จบแล้ว (เหมือน lib/seller-bill CLOSED_LINE_STATUS) */
export const CLOSED_PO_LINE_STATUS = ["received", "short_closed", "closed_short", "cancelled"];
/** สถานะใบสั่งซื้อที่ยังรอรับของ */
export const OPEN_PO_STATUS_FOR_WAIT = ["draft", "purchase", "partial"];

/** บรรทัดนี้ยังรอของไหม (ยังไม่รับครบ + ไม่ได้ปิด + ยังไม่อยู่ในใบสำคัญใบไหน) */
export function poLineWaiting(p: WaitPoLine, billedPoLineIds: Set<string>): boolean {
  if (p.is_active === false) return false;
  if (CLOSED_PO_LINE_STATUS.includes(String(p.line_status ?? ""))) return false;
  if (!(Number(p.qty ?? 0) - Number(p.qty_received ?? 0) > 0.0001)) return false;
  return !billedPoLineIds.has(p.id);
}

/** นับ "รอของ" ต่อใบ — openPoIds = PO ที่ยังเปิด (ไม่ส่ง = นับทุก PO ที่ส่งบรรทัดมา) · คืนเฉพาะใบที่มีของรอ */
export function countWaitingByVoucher(vLines: WaitVoucherLine[], poLines: WaitPoLine[], billedPoLineIds: Set<string>, openPoIds?: Set<string>): Map<string, number> {
  const posByVoucher = new Map<string, Set<string>>();
  for (const l of vLines) {
    if (!l.po_id) continue;
    if (!posByVoucher.has(l.voucher_id)) posByVoucher.set(l.voucher_id, new Set());
    posByVoucher.get(l.voucher_id)!.add(l.po_id);
  }
  const waitByPo = new Map<string, number>();
  for (const p of poLines) {
    if (openPoIds && !openPoIds.has(p.po_id)) continue;
    if (poLineWaiting(p, billedPoLineIds)) waitByPo.set(p.po_id, (waitByPo.get(p.po_id) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [vid, pos] of posByVoucher) {
    let n = 0;
    for (const po of pos) n += waitByPo.get(po) ?? 0;
    if (n > 0) out.set(vid, n);
  }
  return out;
}
