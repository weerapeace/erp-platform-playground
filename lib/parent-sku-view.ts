/**
 * Parent SKU แบบ "ดูอย่างเดียว" — ชนิดข้อมูลกลาง (ใช้ได้ทั้งหน้าจอ + API)
 *   ParentSkuCard = การ์ดเล็ก (รูปปก + รหัส + ชื่อ + จำนวน SKU ลูก + มี BOM ไหม)
 *   ParentSkuView = รูป · สเปค (ขนาด/วัสดุ/ซิป/ซับใน/สาย/ด้าย/โลโก้…) · BOM ต่อ SKU ลูก
 *     ⚠️ ไม่มีราคา/ต้นทุนใด ๆ โดยตั้งใจ (เซิร์ฟเวอร์ไม่ select คอลัมน์ราคาเลย) — ส่งให้ช่างผ่านตั๋วงานได้
 * ฝั่งเซิร์ฟเวอร์ = lib/parent-sku-view-server · หน้าจอ = components/parent-sku-view
 */
export type ParentSkuCard = {
  id: string; code: string; name: string; cover_url: string | null;
  sku_count: number; bom_count: number;
};

export type ParentSkuBomLine = {
  name: string; code: string | null; qty: number | null; uom: string | null;
  cut_width: number | null; cut_length: number | null; pieces: number | null;
  material_type: string | null; optional: boolean;
};

export type ParentSkuChild = {
  id: string; code: string; label: string;
  /** null = ยังไม่มีสูตร BOM */
  bom: { code: string; version: string | null; lines: ParentSkuBomLine[] } | null;
};

export type ParentSkuView = ParentSkuCard & {
  name_en: string | null;
  images: string[];
  /** [ป้าย, ค่า] เฉพาะช่องที่มีข้อมูล */
  specs: { th: string; en: string; value: string }[];
  children: ParentSkuChild[];
};
