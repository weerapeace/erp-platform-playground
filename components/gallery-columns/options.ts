// ตัวเลือก "จำนวนการ์ดต่อแถว" (ไฟล์ล้วน ไม่มี React — เทสต์ import ได้) · ใช้ผ่าน components/gallery-columns
/** ตัวเลือกมาตรฐาน — สูงสุด 16 ใบต่อแถว (เจ้าของสั่ง 2026-11-17 · จอแคบลดเองอัตโนมัติ) */
export const GALLERY_COL_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 14, 16] as const;
/** ตัวเลือกทั้งหมดที่รองรับ — มี 2 ต่อแถว ไว้สำหรับการ์ดใหญ่ (เช่น การ์ดอัลบั้ม) */
export const GALLERY_COL_CHOICES = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16] as const;
export type GalleryCols = (typeof GALLERY_COL_CHOICES)[number];
