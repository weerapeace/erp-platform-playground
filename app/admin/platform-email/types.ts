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

export type { PendingQueue } from "@/lib/platform-email/match";
import type { PendingQueue } from "@/lib/platform-email/match";

/** แพลตฟอร์ม (สี/โลโก้ตั้งที่หน้าแพลตฟอร์ม erp_platforms) — ใช้กับ PlatformBadge */
export type PlatformInfo = { code: string; name: string; color: string | null; icon_key: string | null };

export type PendingGroup = {
  platform_code: string;
  item_key: string;
  title: string;
  variant: string | null;
  model_code: string | null;
  /** จำนวนรายการ / ชิ้น (รวมออเดอร์ยกเลิก) */
  items: number;
  qty: number;
  /** รายการที่อยู่ในออเดอร์ที่ยังไม่ยกเลิก (0 = มีแต่ออเดอร์ยกเลิก) */
  live_items: number;
  order_count: number;
  /** เลขออเดอร์ (≤20) */
  orders: { no: string; cancelled: boolean }[];
  queue: PendingQueue;
  suggest: { id: string; code: string } | null;
  reason: string | null;
  /** รหัสรุ่นที่ "นับเป็นรุ่น (ไม่แยกสี)" ได้ · null = ชื่อไม่มีรหัสรุ่น */
  model_level: string | null;
  candidates: { id: string; code: string; color: string | null; name: string | null }[];
};

/** การ์ดในคิว 💡/🎨 ทั้งหมดตามตัวกรอง (ทุกหน้า) — ใช้ "เลือกทั้งหมด" แล้วทำทีเดียว
 *  💡 ยืนยันตามที่เดา (suggest) · 🎨 นับเป็นรุ่น ไม่แยกสี (model_level) */
export type SelectRef = { platform_code: string; item_key: string; title: string; variant: string | null; qty: number; suggest: { id: string; code: string } | null; model_level: string | null };

export type PendingResponse = {
  groups: PendingGroup[];
  /** จำนวนการ์ดทั้งหมดตามตัวกรอง (ใช้แบ่งหน้า) */
  total: number;
  page: number;
  size: number;
  stats: {
    groups: number;
    qty: number;
    by_platform: Record<string, { groups: number; qty: number }>;
    by_queue: Record<PendingQueue, number>;
    /** การ์ดที่มีแต่ออเดอร์ยกเลิก */
    cancelled_only: number;
  };
  platforms: PlatformInfo[];
  select_all?: SelectRef[];
};

export const QUEUE_META: Record<PendingQueue, { icon: string; label: string; hint: string; chip: string }> = {
  guess: { icon: "💡", label: "ระบบเดาไว้ ให้ยืนยัน", hint: "ระบบมีตัวที่น่าจะใช่ แต่ข้อมูลในเมลขัดกันนิดหน่อย — ตรวจแล้วกดยืนยัน", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  multi: { icon: "🎨", label: "หลายสี เลือกจากเมลไม่ได้", hint: "รุ่นนี้มีหลายสี แต่เมลไม่บอกสี (Lazada ไม่บอกเลย) — เลือกสีเอง หรือ \"นับเป็นรุ่น (ไม่แยกสี)\" ถ้าไม่รู้สีจริง", chip: "border-violet-200 bg-violet-50 text-violet-800" },
  not_found: { icon: "❓", label: "ไม่พบรหัสใน ERP", hint: "รหัสในชื่อสินค้ายังไม่มีใน ERP หรือชื่อไม่มีรหัส (เช่น ชุดกิฟเซ็ท) — สร้าง SKU ใหม่ · ค้นหา SKU ที่รหัสเขียนต่างกัน · หรือข้ามไว้ก่อน", chip: "border-rose-200 bg-rose-50 text-rose-800" },
  skipped: { icon: "⏭", label: "ข้ามไว้ก่อน", hint: "การ์ดที่กดข้ามไว้ — ไม่นับในคิวหลัก · กด ↩ เอากลับมา เมื่อพร้อมทำ (มีเมลใหม่ของสินค้าเดียวกัน = กลับเข้าคิวเอง)", chip: "border-slate-200 bg-slate-100 text-slate-600" },
};

export type { RuleView } from "@/lib/platform-email/rules";

export const STATUS_META: Record<InboxRow["status"], { label: string; cls: string; hint: string }> = {
  done: { label: "อ่านแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "ระบบทำตามเมลเรียบร้อย" },
  attention: { label: "ต้องมีคนดู", cls: "bg-rose-50 text-rose-700 border-rose-200", hint: "เช่น ชื่อร้านไม่อยู่ในรายการ / ออเดอร์ตัดสต๊อกแล้วแต่ถูกยกเลิก" },
  unreadable: { label: "อ่านไม่ออก", cls: "bg-amber-50 text-amber-700 border-amber-200", hint: "ดูเหมือนเมลออเดอร์แต่หน้าตาไม่ตรงกับที่รู้จัก" },
  ignored: { label: "ข้าม", cls: "bg-slate-100 text-slate-500 border-slate-200", hint: "ไม่ใช่เมลออเดอร์ (โปรโมชัน ฯลฯ) หรือปิดเรื่องแล้ว" },
};

export const KIND_LABEL: Record<string, string> = {
  order_paid: "ชำระเงินแล้ว",
  order_cod: "เก็บเงินปลายทาง",
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
