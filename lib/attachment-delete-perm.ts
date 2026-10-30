/**
 * 🗑 ใครลบไฟล์แนบได้ (ของกลาง — ตรงกับด่านใน DB: erp_playground_attachments_delete)
 * (ไฟล์ pure ห้ามใส่ "use client" — เทสต์ import ได้)
 *
 *   - ไฟล์แนบทั่วไป (ใบออกแบบ/คอมเมนต์ ฯลฯ)      = attachments.delete
 *   - รูปแกลเลอรีสินค้า (Parent SKU / SKU)          = attachments.delete หรือ products.images.delete ("ลบรูปสินค้า")
 * ใช้ซ่อนปุ่มลบให้คนที่ไม่มีสิทธิ์ (เดิมปุ่มขึ้นแต่กดแล้ว error) — ImageManager · แผงรูป SKU ลูก · จัดรูปหลายโฟลเดอร์
 */

export const PRODUCT_IMAGE_ENTITIES = ["parent_skus_v2", "skus_v2"] as const;

type DeletePerm = "attachments.delete" | "products.images.delete";

export function isProductImageEntity(entityType: string | null | undefined): boolean {
  return !!entityType && (PRODUCT_IMAGE_ENTITIES as readonly string[]).includes(entityType);
}

/** ลบไฟล์แนบของ entity นี้ได้ไหม · ไม่รู้ entity = ใช้กฎไฟล์แนบทั่วไป */
export function canDeleteAttachment(can: (perm: DeletePerm) => boolean, entityType?: string | null): boolean {
  return can("attachments.delete") || (isProductImageEntity(entityType) && can("products.images.delete"));
}
