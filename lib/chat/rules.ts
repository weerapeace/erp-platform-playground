/**
 * ห้องแชทรวม — กติกาล้วน (ไม่มี I/O · ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์ · เทสต์ lib/__tests__/chat-rules.test.ts)
 *   - ข้อมูลช่องทาง (ชื่อ · ไอคอน · ความยาวข้อความ · ช่วงเวลาตอบ) — ตัวเลขจากคู่มือทางการ ดู docs/chat-inbox.md
 *   - LINE ตอบฟรีได้ไหม (โทเคนตอบกลับใช้ได้ 1 นาที ครั้งเดียว → เผื่อ 10 วิ)
 *   - ข้อความเข้า/ออก → ห้องเปลี่ยนเป็นอะไร · ต้องแจ้งเตือนไหม (แจ้ง 1 ครั้งต่อรอบที่ลูกค้ารอ ไม่ใช่ทุกข้อความ)
 *   - ตัวกรองรายการห้อง · ค่าตั้ง · ข้อความสำเร็จรูป (ใช้ตัวแทนค่าตัวแปรกลาง renderCaption)
 */
import { renderCaption, type CaptionVars } from "@/lib/caption-template";
import { CHAT_CHANNELS, type ChatAttachment, type ChatChannel, type ChatQuickReply, type ChatSettings, type ChatStatus } from "./types";

export type ChatChannelInfo = {
  label: string;
  /** code ที่ PlatformIcon / platformColor รู้จัก */
  platformCode: string;
  /** ความยาวข้อความสูงสุดที่ช่องทางรับ */
  maxText: number;
  /** ตอบได้ภายในกี่ ms หลังลูกค้าทักล่าสุด (null = ไม่จำกัด) */
  replyWindowMs: number | null;
};

const HOUR = 3600_000;

export const CHAT_CHANNEL_INFO: Record<ChatChannel, ChatChannelInfo> = {
  line: { label: "LINE", platformCode: "line_oa", maxText: 5000, replyWindowMs: null },
  lazada: { label: "Lazada", platformCode: "lazada", maxText: 2000, replyWindowMs: null },
  shopee: { label: "Shopee", platformCode: "shopee", maxText: 2000, replyWindowMs: null },
  tiktok: { label: "TikTok Shop", platformCode: "tiktok", maxText: 2000, replyWindowMs: 7 * 24 * HOUR },
  facebook: { label: "Facebook", platformCode: "facebook", maxText: 2000, replyWindowMs: 24 * HOUR },
  instagram: { label: "Instagram", platformCode: "instagram", maxText: 1000, replyWindowMs: 24 * HOUR },
};

export const isChatChannel = (v: unknown): v is ChatChannel => typeof v === "string" && (CHAT_CHANNELS as readonly string[]).includes(v);

// ---------------------------------------------------------------- LINE: ตอบฟรี vs push

/** โทเคนตอบกลับของ LINE ใช้ได้ 1 นาทีหลังได้รับ (ครั้งเดียว) — เผื่อเวลาส่ง 10 วินาที */
export const LINE_REPLY_TOKEN_MS = 50_000;

/** ตอบฟรีได้ไหม = มีโทเคนที่ยังไม่ใช้ และได้มาไม่เกิน 50 วินาที */
export function lineCanReplyFree(tokenAt: string | null | undefined, hasToken: boolean, now = Date.now()): boolean {
  if (!hasToken || !tokenAt) return false;
  const t = Date.parse(tokenAt);
  return Number.isFinite(t) && now - t >= 0 && now - t < LINE_REPLY_TOKEN_MS;
}

/** เหลือกี่วินาทีที่ยังตอบฟรีได้ (0 = หมดแล้ว) */
export function lineFreeSecondsLeft(tokenAt: string | null | undefined, hasToken: boolean, now = Date.now()): number {
  if (!lineCanReplyFree(tokenAt, hasToken, now)) return 0;
  return Math.max(0, Math.ceil((LINE_REPLY_TOKEN_MS - (now - Date.parse(String(tokenAt)))) / 1000));
}

// ---------------------------------------------------------------- ช่วงเวลาตอบ

export type ReplyWindow = { state: "none" | "open" | "closing" | "closed"; minutesLeft: number | null };

/** ช่วงเวลาที่ยังตอบได้ (ป้ายเตือนในหน้าแชท) — closing = เหลือไม่ถึง 2 ชม. */
export function replyWindowState(replyUntil: string | null | undefined, now = Date.now()): ReplyWindow {
  if (!replyUntil) return { state: "none", minutesLeft: null };
  const t = Date.parse(replyUntil);
  if (!Number.isFinite(t)) return { state: "none", minutesLeft: null };
  const left = Math.floor((t - now) / 60_000);
  if (left <= 0) return { state: "closed", minutesLeft: 0 };
  return { state: left < 120 ? "closing" : "open", minutesLeft: left };
}

/** ตอบได้ถึงเมื่อไหร่ หลังลูกค้าทักเวลา at (null = ไม่จำกัด) */
export function replyUntilFor(channel: ChatChannel, at: string): string | null {
  const w = CHAT_CHANNEL_INFO[channel].replyWindowMs;
  const t = Date.parse(at);
  return w && Number.isFinite(t) ? new Date(t + w).toISOString() : null;
}

// ---------------------------------------------------------------- ข้อความ

/** ข้อความย่อในรายการห้อง */
export function chatPreview(text: string | null | undefined, attachments: ChatAttachment[] = []): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t) return t.slice(0, 80);
  const a = attachments[0];
  if (!a) return "";
  switch (a.kind) {
    case "image": return "[รูปภาพ]";
    case "product": return `[สินค้า] ${a.name}`.slice(0, 80);
    case "sticker": return "[สติกเกอร์]";
    case "video": return "[วิดีโอ]";
    case "audio": return "[ข้อความเสียง]";
    case "file": return `[ไฟล์] ${a.label ?? ""}`.trim().slice(0, 80);
    case "location": return `[ตำแหน่ง] ${a.label ?? ""}`.trim().slice(0, 80);
  }
}

/** ข้อความยาวเกินที่ช่องทางรับไหม — คืนข้อความเตือนภาษาคน หรือ null */
export function chatTextError(channel: ChatChannel, text: string): string | null {
  const max = CHAT_CHANNEL_INFO[channel].maxText;
  const n = [...text].length;
  return n > max ? `ข้อความยาวเกิน ${max.toLocaleString("th-TH")} ตัวอักษร (ตอนนี้ ${n.toLocaleString("th-TH")}) — ${CHAT_CHANNEL_INFO[channel].label} ไม่รับ` : null;
}

/** รูปสติกเกอร์ LINE (CDN สาธารณะของ LINE) */
export function lineStickerUrl(stickerId: string | null | undefined): string | null {
  return stickerId && /^\d{1,20}$/.test(stickerId) ? `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png` : null;
}

// ---------------------------------------------------------------- สถานะห้องเมื่อมีข้อความเข้า/ออก

export type ConvState = {
  status: ChatStatus;
  last_message_at: string | null;
  last_direction: "in" | "out" | null;
  waiting_since: string | null;
  unread_count: number;
};

export type ConvPatch = Partial<ConvState> & { last_preview?: string; reply_until?: string | null };

/**
 * ลูกค้าส่งข้อความมา → ห้องเปลี่ยนอย่างไร + ต้องแจ้งเตือนไหม
 * - แจ้งเตือนเฉพาะ "เริ่มรอ" (ก่อนหน้านี้ตอบแล้ว / ห้องใหม่ / ห้องที่จบไปแล้ว) — ลูกค้าส่งรัว ๆ ไม่เด้งซ้ำ
 * - ข้อความเก่าที่มาช้า (LINE ส่งซ้ำ/สลับลำดับ) ไม่ทับข้อความล่าสุด และไม่ทำให้ห้องที่ตอบแล้วกลับเป็น "รอ"
 */
export function inboundPatch(prev: ConvState | null, at: string, preview: string, channel: ChatChannel): { patch: ConvPatch; notify: boolean } {
  const newer = !prev?.last_message_at || Date.parse(at) >= Date.parse(prev.last_message_at);
  const unread = (prev?.unread_count ?? 0) + 1;
  if (!newer) return { patch: { unread_count: unread }, notify: false };
  const wasWaiting = !!prev?.waiting_since && prev.status === "open";
  return {
    patch: {
      status: "open",
      last_message_at: at,
      last_preview: preview,
      last_direction: "in",
      waiting_since: wasWaiting ? prev!.waiting_since : at,
      unread_count: unread,
      reply_until: replyUntilFor(channel, at),
    },
    notify: !wasWaiting,
  };
}

/** เราส่งข้อความสำเร็จ → ห้องเป็น "ตอบแล้ว" */
export function outboundPatch(at: string, preview: string): ConvPatch {
  return { last_message_at: at, last_preview: preview, last_direction: "out", waiting_since: null, unread_count: 0 };
}

/** ห้องนี้ยังไม่มีใครตอบไหม */
export const isUnanswered = (c: { status: ChatStatus; waiting_since: string | null }) => c.status === "open" && !!c.waiting_since;

/** ป้าย "รอมานานเท่าไหร่" */
export function waitingText(since: string | null | undefined, now = Date.now()): string {
  if (!since) return "";
  const m = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  if (m < 1) return "เพิ่งทัก";
  if (m < 60) return `รอ ${m} นาที`;
  const h = Math.floor(m / 60);
  if (h < 24) return `รอ ${h} ชม.`;
  return `รอ ${Math.floor(h / 24)} วัน`;
}

// ---------------------------------------------------------------- ตัวกรองรายการห้อง

export type ChatListFilter = {
  channel: ChatChannel | null;
  brand: string | null;
  status: ChatStatus | "all";
  unanswered: boolean;
  mine: boolean;
  q: string;
  limit: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export function parseChatFilter(sp: URLSearchParams): ChatListFilter {
  const ch = sp.get("channel");
  const st = sp.get("status");
  const brand = sp.get("brand");
  const limit = Number(sp.get("limit"));
  return {
    channel: isChatChannel(ch) ? ch : null,
    brand: isUuid(brand) ? brand : null,
    status: st === "done" || st === "all" ? st : "open",
    unanswered: sp.get("unanswered") === "1",
    mine: sp.get("mine") === "1",
    // ตัดอักขระที่มีความหมายพิเศษในตัวกรอง PostgREST (, ( ) * %) ออก
    q: (sp.get("q") ?? "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60),
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(100, Math.floor(limit)) : 60,
  };
}

// ---------------------------------------------------------------- ค่าตั้ง + ข้อความสำเร็จรูป

export const CHAT_SETTINGS_KEY = "chat_settings";
export const EMPTY_CHAT_SETTINGS: ChatSettings = { line_bots: {}, quick_replies: [] };
const BOT_KEY_RE = /^[a-z0-9_]{2,24}$/;

/** ทำความสะอาดค่าตั้งที่อ่าน/รับมา (ค่าแปลกตัดทิ้ง) */
export function cleanChatSettings(raw: unknown): ChatSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const line_bots: ChatSettings["line_bots"] = {};
  const lb = (r.line_bots && typeof r.line_bots === "object" ? r.line_bots : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(lb)) {
    if (!BOT_KEY_RE.test(k) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    line_bots[k] = { enabled: o.enabled === true, brand_id: isUuid(o.brand_id) ? o.brand_id : null };
  }
  const quick_replies: ChatQuickReply[] = [];
  const seen = new Set<string>();
  for (const [i, v] of (Array.isArray(r.quick_replies) ? r.quick_replies : []).slice(0, 200).entries()) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const label = String(o.label ?? "").trim().slice(0, 40);
    const body = String(o.body ?? "").trim().slice(0, 1000);
    if (!label || !body) continue;
    let id = /^[A-Za-z0-9_-]{1,40}$/.test(String(o.id ?? "")) ? String(o.id) : `qr${i + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    quick_replies.push({ id, label, body, brand_id: isUuid(o.brand_id) ? o.brand_id : null });
  }
  return { line_bots, quick_replies };
}

/** ข้อความสำเร็จรูปที่ใช้กับแบรนด์นี้ได้ (ของแบรนด์ก่อน แล้วค่ากลาง) */
export function quickRepliesFor(list: ChatQuickReply[], brandId: string | null | undefined): ChatQuickReply[] {
  const own = brandId ? list.filter((q) => q.brand_id === brandId) : [];
  return [...own, ...list.filter((q) => !q.brand_id)];
}

/** ตัวแปรเพิ่มของแชท (นอกจากตัวแปรแคปชั่นกลาง {product} {sku} {price} {link} …) */
export const CHAT_VARS = [{ key: "customer", label: "ชื่อลูกค้า" }] as const;

/** ประกอบข้อความสำเร็จรูป — {customer} = ชื่อลูกค้า (ไม่มี = "คุณลูกค้า") แล้วส่งต่อให้ตัวแทนค่ากลาง renderCaption */
export function renderQuickReply(body: string, vars: CaptionVars & { customer?: string | null } = {}): string {
  const { customer, ...rest } = vars;
  return renderCaption(body.replace(/\{customer\}/g, (customer ?? "").trim() || "คุณลูกค้า"), rest);
}
