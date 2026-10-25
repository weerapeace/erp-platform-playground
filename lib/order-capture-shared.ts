/**
 * ของกลาง (ใช้ได้ทั้งหน้าจอและ server) — ชนิดข้อมูล + ป้ายภาษาไทยของ "คำสั่งซื้อจากไลน์"
 * แยกจาก lib/order-capture (ฝั่ง server ที่แตะ R2/AI/DB) เพื่อให้หน้าจอ import ได้โดยไม่ลากโค้ด server ไปด้วย
 */

export type CaptureStatus = "collecting" | "processing" | "pending" | "confirmed" | "rejected";
export type CapturePlatform = "taobao" | "shopee" | "1688" | "lazada" | "tiktok" | "other";

export type CaptureItem = {
  /** ชื่อสินค้าตามรูป (ภาษาเดิม) */
  name: string;
  /** ชื่อแปลไทย (AI) — แก้ได้ */
  name_th: string;
  /** ตัวเลือก สี/ขนาด */
  option: string;
  qty: number;
  unit_price: number | null;
  line_total: number | null;
  /** จับคู่สินค้าในคลัง (SkuPicker) */
  sku_id?: string | null;
  sku_code?: string | null;
  sku_name?: string | null;
  /** ซื้อให้ใบสั่งผลิตไหน (เลือกจาก BOM ด้วย MoBomPicker) — จดไว้ที่บรรทัด PO ว่า "จากใบสั่งผลิต MO-…" */
  mo_no?: string | null;
  /** ตอนยืนยันแบบผูก PO เดิม: บรรทัด PO ที่ตรงกัน · "new" = เพิ่มเป็นบรรทัดใหม่ · ว่าง = ไม่ผูก */
  po_line_id?: string | null;
};

export type CaptureRow = {
  id: string;
  source: string;
  status: CaptureStatus;
  platform: CapturePlatform | null;
  shop_name: string | null;
  order_no: string | null;
  order_no_norm: string | null;
  order_date: string | null;
  currency: string | null;
  items: CaptureItem[];
  shipping_fee: number | null;
  discount: number | null;
  total_paid: number | null;
  tracking_no: string | null;
  note: string | null;
  image_keys: string[];
  ai_confidence: number | null;
  ai_unreadable: string[];
  ai_is_order: boolean | null;
  ai_notes: string | null;
  ai_error: string | null;
  ai_model: string | null;
  ai_read_at: string | null;
  dup_of: string | null;
  sender_line_user_id: string | null;
  sender_name: string | null;
  line_group_id: string | null;
  image_set_id: string | null;
  po_id: string | null;
  po_mode: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PoLineLite = { id: string; item_name: string; qty: number; price_est: number; item_sku_id: string | null; qty_received: number };
export type PoSuggestion = {
  id: string; po_no: string; seller_name: string; status: string; currency: string; order_date: string | null;
  grand_total: number; score: number; reasons: string[];
  lines: PoLineLite[];
  /** จับคู่รายการในรูป → บรรทัด PO (index ของ items → po_line_id) */
  mapping: (string | null)[];
};

export const PLATFORM_LABEL: Record<CapturePlatform, string> = {
  taobao: "Taobao", shopee: "Shopee", "1688": "1688", lazada: "Lazada", tiktok: "TikTok Shop", other: "อื่น ๆ",
};

export const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").trim().toUpperCase());
export const curSym = (c: unknown) => (isCNY(c) ? "¥" : "฿");

const FIELD_LABEL: Record<string, string> = {
  shop_name: "ชื่อร้าน", order_no: "เลขคำสั่งซื้อ", order_date: "วันที่", items: "รายการ", qty: "จำนวน",
  unit_price: "ราคา", line_total: "ยอดบรรทัด", shipping_fee: "ค่าส่ง", discount: "ส่วนลด", total_paid: "ยอดจ่าย",
  tracking_no: "เลขพัสดุ", currency: "สกุลเงิน", platform: "แพลตฟอร์ม",
};
/** ชื่อช่องที่ AI บอกว่าอ่านไม่ชัด → ภาษาไทย */
export const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k;

/** ป้ายสถานะ PO แบบภาษาคน (ใช้ในตัวเลือก "ผูก PO เดิม") */
export const PO_STATUS_LABEL: Record<string, string> = { draft: "ร่าง", purchase: "รอรับของ", partial: "รับบางส่วน" };
