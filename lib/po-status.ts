/**
 * ของกลาง: สถานะใบสั่งซื้อ (purchase_orders_v2.status) — ค่าที่ใช้ร่วมกันทุก API จัดซื้อ
 * เจ้าของสั่ง 2026-11-04 (แผนภาพ flow ขั้น 1): ออกใบสั่งซื้อ = สั่งกับร้านแล้ว → สถานะ "สั่งแล้ว" (purchase) ทันที
 *   เดิมออกใบเป็น "ร่าง" ค้าง → แดชบอร์ด/รายงานรายเดือน/ปฏิทิน ไม่นับใบร่าง จึงมองไม่เห็นใบที่สั่งจริง
 *   ใบร่างที่เหลือ (เช่น ใบเก่า) กด "สั่งกับร้านแล้ว" ในป๊อปใบสั่งซื้อ → PATCH /api/purchasing/po-edit { header.status: "purchase" }
 * เส้นทาง: draft (ร่าง) → purchase (สั่งแล้ว) → partial (รับบางส่วน) → received (รับครบ) · cancelled (ยกเลิก)
 *   confirmed = ค่าที่หน้ารับของตั้งเมื่อบันทึกแต่ยังไม่ได้ของ (ความหมายเดียวกับสั่งแล้ว)
 * ก่อนแก้: npm run where-used -- purchasing
 */
export const PO_DRAFT = "draft";
/** สถานะตอนออกใบสั่งซื้อใหม่ (หน้าสั่งซื้อ · เปิด PO เอง · คำสั่งซื้อจากไลน์) */
export const PO_NEW_STATUS = "purchase";
/** สั่งกับร้านแล้ว ยังไม่ได้ของ */
export const PO_ORDERED_STATUSES = ["purchase", "confirmed"] as const;
/** รอของเข้า (ปฏิทินของเข้า) */
export const PO_INCOMING_STATUSES = ["purchase", "confirmed", "partial"] as const;

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", purchase: "สั่งแล้ว", confirmed: "สั่งแล้ว", partial: "รับบางส่วน", received: "รับครบแล้ว", cancelled: "ยกเลิก",
};

/** กด "สั่งกับร้านแล้ว" ได้เฉพาะใบร่าง */
export const canMarkOrdered = (status: string | null | undefined) => String(status ?? "") === PO_DRAFT;
