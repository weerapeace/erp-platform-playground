/**
 * Design sheet แบบ "ดูอย่างเดียว" — ชนิดข้อมูลกลาง (ใช้ได้ทั้งหน้าจอ + API)
 *   DesignSheetCard = การ์ดเล็ก (รูปปก + เลข + ชื่อ + สถานะ) — ใช้ในตั๋วงาน / ตัวเลือก DesignSheetPicker
 *   DesignSheetView = ข้อมูลที่จำเป็นสำหรับป๊อปดูอย่างเดียว (รูป · ชื่อ · รายละเอียด · comment ลูกค้า)
 *     ⚠️ ไม่มีราคา/ตีราคา/เสนอราคา โดยตั้งใจ — ส่งให้คนที่ไม่ควรเห็นต้นทุนได้ (เช่น ช่างผ่านตั๋วงาน)
 * ฝั่งเซิร์ฟเวอร์โหลดด้วย lib/design-sheet-view-server · หน้าจอ = components/design-sheet-view
 */
export type DesignSheetCard = {
  id: string; code: string; name: string; status: string;
  brand_name: string | null; cover_url: string | null;
};

export type DesignSheetView = DesignSheetCard & {
  /** HTML จากช่องรายละเอียดงาน (หน้าจอต้องผ่าน sanitizeRichHtml ก่อนแสดง) */
  detail_html: string;
  images: string[];
  /** ใหม่ → เก่า */
  comments: { id: string; date: string | null; body: string; images: string[] }[];
};
