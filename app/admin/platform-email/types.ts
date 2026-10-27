// ชนิดข้อมูลที่หน้า /admin/platform-email ใช้ร่วมกันทุกแท็บ (ตรงกับที่ /api/platform-email/* ส่งมา)

export type ShopRule = { platform: string | null; match: string; brand_id: string | null };

export type EmailSettingsView = {
  enabled: boolean;
  interval_min: number;
  backfill_days: number;
  search_query: string | null;
  default_query: string;
  shops: ShopRule[];
  has_key: boolean;
  key_last4: string | null;
  last_ping_at: string | null;
  last_received_at: string | null;
  updated_at: string | null;
};

export type EmailCounts = { done: number; ignored: number; unreadable: number; attention: number; pending_items: number; email_orders: number };

export type SettingsResponse = {
  settings: EmailSettingsView;
  endpoint: string;
  counts: EmailCounts;
  brands: { id: string; name: string }[];
  can_admin: boolean;
};

export type InboxRow = {
  id: string;
  message_id: string;
  received_at: string | null;
  from_addr: string | null;
  subject: string | null;
  platform_code: string | null;
  kind: string | null;
  external_order_id: string | null;
  ref_no: string | null;
  shop_name: string | null;
  status: "done" | "ignored" | "unreadable" | "attention";
  note: string | null;
  order_id: string | null;
};

export type PendingGroup = {
  platform_code: string;
  item_key: string;
  title: string;
  variant: string | null;
  model_code: string | null;
  items: number;
  qty: number;
  orders: string[];
  suggest: { id: string; code: string } | null;
  reason: string | null;
  candidates: { id: string; code: string; color: string | null; name: string | null }[];
};

export const STATUS_META: Record<InboxRow["status"], { label: string; cls: string; hint: string }> = {
  done: { label: "อ่านแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "ระบบทำตามเมลเรียบร้อย" },
  attention: { label: "ต้องมีคนดู", cls: "bg-rose-50 text-rose-700 border-rose-200", hint: "เช่น ชื่อร้านไม่อยู่ในรายการ / ออเดอร์ตัดสต๊อกแล้วแต่ถูกยกเลิก" },
  unreadable: { label: "อ่านไม่ออก", cls: "bg-amber-50 text-amber-700 border-amber-200", hint: "ดูเหมือนเมลออเดอร์แต่หน้าตาไม่ตรงกับที่รู้จัก" },
  ignored: { label: "ข้าม", cls: "bg-slate-100 text-slate-500 border-slate-200", hint: "ไม่ใช่เมลออเดอร์ (โปรโมชัน ฯลฯ) หรือปิดเรื่องแล้ว" },
};

export const KIND_LABEL: Record<string, string> = {
  order_paid: "ชำระเงินแล้ว",
  order_new: "ออเดอร์ใหม่",
  order_cancelled: "ยกเลิก",
  return_requested: "ขอคืนเงิน/คืนสินค้า",
  other: "อื่น ๆ",
};

export const PLATFORM_LABEL: Record<string, string> = { shopee: "Shopee", lazada: "Lazada" };

export const fmtDateTime = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" })
  : "—";

/** "5 นาทีที่แล้ว" — ใช้บอกสถานะการเชื่อมต่อ */
export function ago(iso: string | null): string {
  if (!iso) return "ยังไม่เคย";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}
