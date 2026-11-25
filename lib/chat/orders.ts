/**
 * ห้องแชทรวม — ออเดอร์ของลูกค้าในห้องนี้ (server เท่านั้น · อ่านจากศูนย์ออเดอร์กลาง platform_orders)
 *   1) ออเดอร์ที่ลูกค้า/ร้านแนบในแชท (attachment kind "order") — แม่นที่สุด
 *   2) Shopee: ชื่อผู้ใช้ในแชท = ชื่อผู้ซื้อในออเดอร์ที่ดึงผ่าน API (customer_name = buyer_username) → หาออเดอร์ล่าสุดของคนนี้ในร้านเดียวกัน
 *      (Lazada / TikTok ปิดบังชื่อผู้ซื้อในออเดอร์ → จับคู่ด้วยชื่อไม่ได้ ใช้แค่ข้อ 1)
 * ไม่แก้อะไรในออเดอร์ · ไม่โชว์ที่อยู่/เบอร์โทร
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { ChatAttachment, ChatChannel } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

export type ChatOrder = {
  id: string; order_no: string; status: string | null; platform_status: string | null;
  total: number | null; ordered_at: string | null; tracking_no: string | null;
  /** มาจากไหน: แนบในแชท / ชื่อผู้ซื้อตรงกัน */
  via: "message" | "buyer";
};

const PF_CODE: Partial<Record<ChatChannel, string>> = { shopee: "shopee", lazada: "lazada", tiktok: "tiktok" };
const COLS = "id, external_order_id, order_no, status, platform_status, total, ordered_at, tracking_no";
type Row = { id: string; external_order_id: string | null; order_no: string | null; status: string | null; platform_status: string | null; total: number | string | null; ordered_at: string | null; tracking_no: string | null };

const toOrder = (r: Row, via: ChatOrder["via"]): ChatOrder => ({
  id: r.id, order_no: r.order_no || r.external_order_id || "", status: r.status, platform_status: r.platform_status,
  total: r.total == null ? null : Number(r.total), ordered_at: r.ordered_at, tracking_no: r.tracking_no, via,
});

/** เลขออเดอร์ที่แนบในข้อความ (ไม่ซ้ำ · ใหม่สุดก่อน) */
export function orderNosInThread(lists: ChatAttachment[][]): string[] {
  const seen: string[] = [];
  for (const list of [...lists].reverse()) for (const a of list) {
    if (a.kind === "order" && a.order_no && !seen.includes(a.order_no)) seen.push(a.order_no);
  }
  return seen.slice(0, 10);
}

export async function ordersForConversation(admin: Admin, conv: { channel: ChatChannel; brand_id: string | null; customer_name: string | null }, lists: ChatAttachment[][]): Promise<ChatOrder[]> {
  const code = PF_CODE[conv.channel];
  if (!code) return [];
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", code).maybeSingle();
  const pfId = (pf as { id?: string } | null)?.id;
  if (!pfId) return [];

  const out = new Map<string, ChatOrder>();
  const nos = orderNosInThread(lists);
  if (nos.length) {
    const { data } = await admin.from("platform_orders").select(COLS).eq("platform_id", pfId).in("external_order_id", nos).limit(10);
    for (const r of (data ?? []) as Row[]) out.set(r.id, toOrder(r, "message"));
  }
  const buyer = conv.customer_name?.trim();
  // ชื่อที่ปิดบัง (มี *) จับคู่ไม่ได้
  if (conv.channel === "shopee" && buyer && !buyer.includes("*") && conv.brand_id) {
    const { data } = await admin.from("platform_orders").select(COLS).eq("platform_id", pfId).eq("brand_id", conv.brand_id)
      .eq("customer_name", buyer).order("ordered_at", { ascending: false, nullsFirst: false }).limit(5);
    for (const r of (data ?? []) as Row[]) if (!out.has(r.id)) out.set(r.id, toOrder(r, "buyer"));
  }
  return [...out.values()].sort((a, b) => Date.parse(b.ordered_at ?? "") - Date.parse(a.ordered_at ?? "") || 0).slice(0, 8);
}
