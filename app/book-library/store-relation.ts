import type { RelationConfig } from "@/lib/relation";

/**
 * ช่อง "ร้านที่ซื้อ" ของคลังหนังสือ — เลือกจากทะเบียนร้าน (ตาราง book_stores)
 * allow_create = มีปุ่ม "+ สร้างใหม่" ในดรอปดาวน์ (ไม่ต้องออกจากหน้าไปเพิ่มร้านก่อน)
 * หน้าจัดการร้าน (แก้/ลบ/ค้นหา) = /m/book_stores (ตารางกลางจากทะเบียนโมดูล)
 *
 * ตรงกับที่ลงทะเบียนไว้ในทะเบียนฟิลด์ (erp_module_fields.store_id.relation_config)
 * — แก้ที่ไหนต้องแก้ให้ตรงกันทั้งสองที่
 */
export const STORE_RELATION: RelationConfig = {
  target_module_key:  "book_stores",
  target_table:       "book_stores",
  target_label_field: "name",
  allow_create:       true,
};
