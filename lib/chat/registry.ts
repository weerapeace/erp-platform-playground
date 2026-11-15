/**
 * ห้องแชทรวม — ทะเบียนตัวต่อช่องทาง (server เท่านั้น)
 *   ทุกช่องทางทำตามแบบ ChatChannelAdapter เดียวกัน: ส่ง · ทำเครื่องหมายอ่านแล้ว · โควตา
 *   เพิ่มช่องทางใหม่ (Lazada / Shopee / TikTok / Meta) = เขียนไฟล์ตัวต่อ 1 ไฟล์ + เพิ่ม 1 บรรทัดใน CHAT_ADAPTERS
 *   ฝั่งรับ: webhook ของช่องทางนั้นเรียก lib/chat/store ingestInbound · ช่องทางที่ต้องดึงเอง → cron + recordWorkerRun (lib/ai-office)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { lineBot, loadLineConfig } from "@/lib/line-send";
import { lineMarkRead, lineQuotaCached, sendLineChat } from "./line-server";
import type { ConvServerRow } from "./store";
import type { ChatChannel, ChatSendRequest, ChatSendResult } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

export type ChatQuota = { limit: number | null; used: number | null };

export type ChatChannelAdapter = {
  /** ส่งถึงลูกค้า · origin = โดเมนเว็บ (สร้างลิงก์รูปให้แพลตฟอร์มดึง) */
  send(admin: Admin, conv: ConvServerRow, req: ChatSendRequest, ctx: { origin: string }): Promise<ChatSendResult>;
  /** ทำเครื่องหมายอ่านแล้วฝั่งลูกค้า (ถ้าช่องทางรองรับ) */
  markRead?(admin: Admin, conv: ConvServerRow): Promise<void>;
  /** โควตาข้อความ (ถ้าช่องทางมี — LINE) */
  quota?(admin: Admin, conv: ConvServerRow): Promise<ChatQuota | null>;
  /** ส่งรูป/การ์ดสินค้าได้ไหม */
  supports: { image: boolean; product: boolean };
};

/** โทเคนของบอท LINE ที่รับห้องนี้ (account_ref = คีย์บอท) */
async function lineToken(admin: Admin, conv: ConvServerRow): Promise<string> {
  return lineBot(await loadLineConfig(admin), conv.account_ref)?.token ?? "";
}

const lineAdapter: ChatChannelAdapter = {
  supports: { image: true, product: true },
  async send(admin, conv, req, ctx) { return sendLineChat(admin, conv, await lineToken(admin, conv), req, ctx.origin); },
  async markRead(admin, conv) {
    if (!conv.read_token) return;
    await lineMarkRead(await lineToken(admin, conv), conv.read_token);
    await admin.from("chat_conversations").update({ read_token: null }).eq("id", conv.id);   // โทเคนนี้ใช้แล้ว
  },
  async quota(admin, conv) {
    const q = await lineQuotaCached(await lineToken(admin, conv));
    return q.ok ? { limit: q.limit, used: q.used } : null;
  },
};

/** ช่องทางที่ต่อแล้ว — ช่องทางที่ไม่มีในนี้ = ยังส่งจาก ERP ไม่ได้ */
export const CHAT_ADAPTERS: Partial<Record<ChatChannel, ChatChannelAdapter>> = {
  line: lineAdapter,
};

export const chatAdapter = (ch: ChatChannel): ChatChannelAdapter | null => CHAT_ADAPTERS[ch] ?? null;
