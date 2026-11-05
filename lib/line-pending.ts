/**
 * 💬 รายการจากไลน์ที่ยังรอคนจัดการ (ของกลาง — แท็บ LINE ในศูนย์แจ้งเตือน · GET /api/line/pending)
 * รวมกล่องรับจากกลุ่มไลน์ที่มีอยู่แล้ว (ไม่ทำขั้นตอนซ้ำ — ปุ่มพาไปหน้าเดิม):
 *   🎨 งานออกแบบจากไลน์  design_sheet_line_inbox (lib/design-line-inbox · ดูได้ products.view) → เปิดฟอร์มสร้างใบงานที่กรอกให้แล้ว
 *   🛒 คำสั่งซื้อจากไลน์ purchase_order_captures (lib/order-capture · ดูได้ po.view)        → เปิดป๊อปยืนยันผูก PO
 * ไม่มีสิทธิ์ส่วนไหน = ไม่ส่งส่วนนั้นมาเลย (undefined) · กล่องใหม่ในอนาคตเพิ่มเป็นส่วนใหม่ที่นี่ที่เดียว
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { listInbox } from "@/lib/design-line-inbox";
import { CAPTURE_COLUMNS, CAPTURE_TABLE, normalizeRow } from "@/lib/order-capture";
import { PLATFORM_LABEL, curSym } from "@/lib/order-capture-shared";
import { r2ImageUrl } from "@/lib/r2-image";

type Admin = ReturnType<typeof supabaseAdmin>;

export type LinePendingKind = "design" | "order";
export type LinePendingItem = {
  id: string; kind: LinePendingKind;
  title: string;
  /** บรรทัดรอง เช่น แบรนด์ / ยอดเงิน */
  sub: string | null;
  image: string | null;
  images: number;
  sender: string | null;
  at: string;
  /** ต้องระวัง เช่น เลขซ้ำ / AI อ่านไม่ได้ */
  warn: string | null;
  /** หน้าที่จัดการรายการนี้ (เปิดรายการนั้นให้เลย) */
  href: string;
};
export type LinePendingSection = { count: number; items: LinePendingItem[]; view_all: string };
export type LinePendingPayload = { design?: LinePendingSection; order?: LinePendingSection };

const MAX_ITEMS = 10;
const firstLine = (s: string | null | undefined) => (s ?? "").split(/\r?\n/).map((x) => x.trim()).find(Boolean)?.slice(0, 60) ?? "";
const money = (n: number | null, c: unknown) => (n === null || n === undefined ? null : `${curSym(c)}${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);

export async function designPending(admin: Admin): Promise<LinePendingSection> {
  const { items, counts } = await listInbox(admin, "pending");
  return {
    count: counts.pending,
    view_all: "/master/design-dashboard?inbox=1",
    items: items.slice(0, MAX_ITEMS).map((it) => ({
      id: it.id, kind: "design",
      title: it.name || firstLine(it.text) || "งานจากไลน์ (ยังไม่มีชื่อ)",
      sub: it.brand_name, image: it.images[0] ?? null, images: it.images.length,
      sender: it.sender_name, at: it.last_message_at || it.created_at,
      warn: it.ai_error ? "AI อ่านไม่ได้ ต้องตรวจเอง" : it.dups.length ? "อาจซ้ำกับงานที่มีแล้ว" : null,
      href: `/master/design-dashboard?inbox=1&convert=${encodeURIComponent(it.id)}`,
    })),
  };
}

export async function orderPending(admin: Admin): Promise<LinePendingSection> {
  const [{ data }, { count }] = await Promise.all([
    admin.from(CAPTURE_TABLE).select(CAPTURE_COLUMNS).in("status", ["pending", "processing"]).order("created_at", { ascending: false }).limit(MAX_ITEMS),
    admin.from(CAPTURE_TABLE).select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
  ]);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRow);
  return {
    count: count ?? rows.length,
    view_all: "/purchasing/line-orders",
    items: rows.map((r) => ({
      id: r.id, kind: "order",
      title: `${r.platform ? `${PLATFORM_LABEL[r.platform]} · ` : ""}${r.shop_name || "ยังไม่รู้ร้าน"}`,
      sub: [`${r.items.length} รายการ`, money(r.total_paid, r.currency)].filter(Boolean).join(" · "),
      image: r2ImageUrl(r.image_keys[0], 160), images: r.image_keys.length,
      sender: r.sender_name, at: r.created_at,
      warn: r.status === "processing" ? "AI กำลังอ่าน…" : r.dup_of ? "เลขคำสั่งซื้อซ้ำ" : r.ai_is_order === false ? "ไม่ใช่คำสั่งซื้อ?" : r.ai_error ? "ต้องตรวจเอง" : null,
      href: `/purchasing/line-orders?open=${encodeURIComponent(r.id)}`,
    })),
  };
}
