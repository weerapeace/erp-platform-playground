/**
 * ↩️ ขอคืน/เปลี่ยนสินค้า (เว็บร้าน · ชุด 4) — กฎกลาง: ขอได้ถึงเมื่อไร · เหตุผล · สถานะ · ตรวจข้อมูลที่ลูกค้าส่ง
 *
 * ลูกค้าเปิดหน้าตามออเดอร์ (เลขออเดอร์ + เบอร์) → ปุ่ม "ขอคืน/เปลี่ยนสินค้า" (ลิงก์มีลายเซ็น /returns?t=) → เลือกชิ้น + เหตุผล + รูป
 * ร้านดู/ตอบที่ ERP › เว็บไซต์ › ↩️ คืน/เปลี่ยน — ระบบไม่คืนเงิน/ไม่ตัดสต็อกเอง (ร้านทำต่อเองตามขั้นตอนปกติ)
 * ตั้งค่า: ข้อมูลร้าน › ↩️ (เปิด · กี่วันหลังได้รับของ · เงื่อนไขที่ลูกค้าเห็น)
 */

export const RETURN_REASONS = [
  { key: "size", label: "ไซส์/ขนาดไม่พอดี", en: "Wrong size / fit" },
  { key: "defect", label: "สินค้าชำรุด/เสียหาย", en: "Damaged or defective" },
  { key: "wrong_item", label: "ได้รับสินค้าผิด", en: "Received the wrong item" },
  { key: "not_as_described", label: "ไม่ตรงกับรูป/รายละเอียด", en: "Not as described" },
  { key: "changed_mind", label: "เปลี่ยนใจ", en: "Changed my mind" },
  { key: "other", label: "อื่น ๆ", en: "Other" },
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number]["key"];

export const RETURN_STATUSES = [
  { key: "pending", label: "รอร้านตรวจ", en: "Waiting for the shop", tone: "bg-amber-50 text-amber-700" },
  { key: "approved", label: "อนุมัติ — ส่งสินค้ากลับ", en: "Approved — please send the item back", tone: "bg-sky-50 text-sky-700" },
  { key: "received", label: "ร้านได้รับสินค้าคืนแล้ว", en: "Item received by the shop", tone: "bg-violet-50 text-violet-700" },
  { key: "closed", label: "เสร็จสิ้น", en: "Completed", tone: "bg-emerald-50 text-emerald-700" },
  { key: "rejected", label: "ไม่อนุมัติ", en: "Not approved", tone: "bg-rose-50 text-rose-700" },
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number]["key"];
/** คำขอที่ยังเปิดอยู่ (ขอซ้ำไม่ได้จนกว่าจะปิด/ไม่อนุมัติ) */
export const OPEN_RETURN_STATUSES: ReturnStatus[] = ["pending", "approved", "received"];
/** ร้านเปลี่ยนสถานะได้จากไหนไปไหน */
export const RETURN_MOVES: Record<ReturnStatus, ReturnStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["received", "closed", "rejected"],
  received: ["closed"],
  closed: [],
  rejected: [],
};

export const RETURN_MAX_IMAGES = 3;
const DAY = 864e5;

/**
 * วันสุดท้ายที่ขอได้: นับจากวันที่ร้านตั้งออเดอร์เป็น "สำเร็จ" (ได้รับของ) · ยังไม่ตั้ง (ส่งแล้ว) = ประมาณวันสั่ง + 7 วันขนส่ง
 * สถานะอื่น (ยังไม่ส่ง/ยกเลิก) = ขอไม่ได้ (null)
 */
export function returnDeadline(o: { status: string; created_at: string; completed_at?: string | null }, days: number): Date | null {
  if (o.status !== "shipped" && o.status !== "completed") return null;
  const base = o.completed_at ? new Date(o.completed_at).getTime() : new Date(o.created_at).getTime() + 7 * DAY;
  return new Date(base + Math.max(1, Math.min(90, Math.round(days) || 14)) * DAY);
}

export interface ReturnInput {
  kind: "return" | "exchange";
  reason: ReturnReason;
  detail: string;
  /** [{ itemId (store_order_items.id), qty }] */
  items: { itemId: string; qty: number }[];
}

/** ข้อมูลจากหน้าเว็บ → ใช้ได้ / ข้อความผิด · ชิ้น/จำนวนตรวจกับออเดอร์จริงอีกครั้งตอนบันทึก */
export function cleanReturnInput(raw: unknown): { ok: true; value: ReturnInput } | { ok: false; error: string; errorEn: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = o.kind === "exchange" ? "exchange" : "return";
  const reason = RETURN_REASONS.find((r) => r.key === o.reason)?.key;
  if (!reason) return { ok: false, error: "เลือกเหตุผล", errorEn: "Please choose a reason" };
  const detail = String(o.detail ?? "").replace(/\r/g, "").trim().slice(0, 1000);
  if (reason === "other" && detail.length < 5) return { ok: false, error: "เล่ารายละเอียดเพิ่มอีกนิด", errorEn: "Please tell us a bit more" };
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((x) => ({ itemId: String((x as { itemId?: unknown })?.itemId ?? ""), qty: Math.floor(Number((x as { qty?: unknown })?.qty) || 0) }))
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x.itemId) && x.qty > 0)
    .slice(0, 50);
  if (!items.length) return { ok: false, error: "เลือกสินค้าที่ต้องการคืน/เปลี่ยนอย่างน้อย 1 ชิ้น", errorEn: "Choose at least one item" };
  return { ok: true, value: { kind, reason, detail, items } };
}

export const returnStatusLabel = (k: string) => RETURN_STATUSES.find((s) => s.key === k)?.label ?? k;
export const returnReasonLabel = (k: string) => RETURN_REASONS.find((s) => s.key === k)?.label ?? k;
