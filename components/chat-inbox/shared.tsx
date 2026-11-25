"use client";
/**
 * ห้องแชทรวม — ชิ้นเล็กที่ใช้ร่วมกันในหน้า /chat และแท็บแชทในศูนย์แจ้งเตือน
 * ของกลางที่ใช้: PlatformIcon (ไอคอนช่องทาง) · lib/chat/rules (ชื่อช่องทาง)
 */
import { PlatformIcon } from "@/components/platform-icon";
import { CHAT_CHANNEL_INFO } from "@/lib/chat/rules";
import type { ChatChannel, ChatConversation, ChatMessage, ShopChatState, ShopChatStatus } from "@/lib/chat/types";
import type { ChatOrder } from "@/lib/chat/orders";

/** ไอคอนช่องทาง (LINE / Lazada / Shopee …) */
export function ChannelIcon({ channel, size = 14 }: { channel: ChatChannel; size?: number }) {
  const info = CHAT_CHANNEL_INFO[channel];
  return <span title={info?.label ?? channel} className="inline-flex"><PlatformIcon code={info?.platformCode ?? channel} size={size} /></span>;
}

/** รูปลูกค้า (ไม่มีรูป = ตัวอักษรแรกของชื่อ) */
export function CustomerAvatar({ name, src, size = 36 }: { name: string | null; src: string | null; size?: number }) {
  const letter = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
      className="shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600"
      style={{ width: size, height: size, fontSize: size * 0.42 }}>{letter}</span>
  );
}

/** เวลาสั้น: วันนี้ = 14:05 · เมื่อวาน · ปีนี้ = 12 พ.ย. · อื่น ๆ = 12/11/25 */
export function timeShort(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "เมื่อวาน";
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** ชื่อลูกค้าที่โชว์ */
export const customerLabel = (c: Pick<ChatConversation, "customer_name">) => c.customer_name?.trim() || "ลูกค้า (ยังไม่รู้ชื่อ)";

/** ข้อมูลห้องเต็มจาก GET /api/chat/conversations/[id] */
export type ChatDetail = {
  conversation: ChatConversation;
  messages: ChatMessage[];
  has_more: boolean;
  send: {
    can_send: boolean;
    supports: { image: boolean; product: boolean };
    hint?: string | null;
    free_seconds: number | null;
    counts_quota: boolean;
    quota: { limit: number | null; used: number | null } | null;
    blocked: boolean;
  };
  products: { sku_id: string; code: string; name: string; on_hand: number | null }[];
  orders?: ChatOrder[];
};

/** ป้ายสถานะการรับแชทของร้าน (ภาษาคน + สี) */
export const SHOP_STATE_VIEW: Record<ShopChatState, { label: string; cls: string }> = {
  ready: { label: "รับแชทอยู่", cls: "bg-emerald-50 text-emerald-800" },
  off: { label: "ยังไม่เปิดรับ", cls: "bg-slate-100 text-slate-600" },
  no_permission: { label: "รอสิทธิ์แชท", cls: "bg-amber-50 text-amber-800" },
  not_connected: { label: "ยังไม่เชื่อมร้าน", cls: "bg-slate-100 text-slate-600" },
  expired: { label: "สิทธิ์ร้านหมดอายุ", cls: "bg-rose-50 text-rose-700" },
  error: { label: "ดึงแชทติดปัญหา", cls: "bg-rose-50 text-rose-700" },
};

/** ชื่อร้านที่โชว์: ช่องทาง + แบรนด์ (+ ชื่อร้านบนแพลตฟอร์ม) */
export const shopLabel = (s: Pick<ShopChatStatus, "channel" | "brand_name" | "shop_name">) =>
  `${CHAT_CHANNEL_INFO[s.channel].label} · ${s.brand_name ?? s.shop_name ?? "ร้าน"}`;

/** ป้ายสถานะร้าน 1 ร้าน (แถบบนรายการห้อง + หน้าตั้งค่า) */
export function ShopStateBadge({ s, onClick }: { s: ShopChatStatus; onClick?: () => void }) {
  const v = SHOP_STATE_VIEW[s.state];
  const body = (
    <>
      <ChannelIcon channel={s.channel} size={12} />
      <span className="truncate">{s.brand_name ?? s.shop_name ?? "ร้าน"}</span>
      <span className="opacity-80">· {v.label}</span>
    </>
  );
  const cls = `inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${v.cls}`;
  return onClick
    ? <button type="button" onClick={onClick} title={s.note ?? v.label} className={`${cls} hover:opacity-80`}>{body}</button>
    : <span title={s.note ?? v.label} className={cls}>{body}</span>;
}
