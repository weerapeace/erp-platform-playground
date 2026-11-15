/**
 * ห้องแชทรวม — ตัวต่อ LINE ส่วนที่คุยกับ LINE จริง (server เท่านั้น)
 *   รับ: event แชท 1:1 จาก webhook กลาง (app/api/china-pay/line-webhook) → ดึงชื่อ/รูปลูกค้า + รูปที่ส่งมา (ลง R2 ทันที) → lib/chat/store
 *   ส่ง: โทเคนตอบกลับยังสด (≤50 วิ) = reply ฟรี · ไม่งั้น push ผ่านตัวส่งกลาง lib/line-send (นับโควตา · ด่านปิดบริการในศูนย์ AI/API)
 *   อ่านแล้ว: markAsRead ด้วยโทเคนจาก webhook (OA ต้องเปิดโหมดแชท)
 * ใช้ของกลาง: lib/line-intake (ดึงรูป/เก็บ R2) · lib/line-send (push/โควตา/คำแปลข้อผิดพลาด)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchLineImage, putLineImage } from "@/lib/line-intake";
import { lineBotQuota, lineErrorText, linePushRaw, lineText, type LineBotView, type LineMessage } from "@/lib/line-send";
import { lineCanReplyFree } from "./rules";
import { lineEventToInbound, type LineChatEvent } from "./line";
import { loadChatSettings } from "./settings";
import { ingestInbound, type ConvServerRow, type CustomerProfile } from "./store";
import type { ChatAttachment, ChatSendRequest, ChatSendResult } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
const API = "https://api.line.me/v2/bot";

async function lineJson(token: string, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${API}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  } catch { return { ok: false, status: 0, json: null }; }
}

/** ชื่อ/รูปโปรไฟล์ลูกค้า (ได้ทั้งเพื่อน และคนที่ทักมาแต่ยังไม่แอด · บล็อกแล้วได้ null) */
export async function lineProfile(token: string, userId: string): Promise<CustomerProfile | null> {
  const r = await lineJson(token, `profile/${encodeURIComponent(userId)}`);
  if (!r.ok || !r.json) return null;
  const name = String(r.json.displayName ?? "").trim().slice(0, 120) || null;
  const pic = String(r.json.pictureUrl ?? "").trim();
  return { name, avatar: pic.startsWith("https://") ? pic.slice(0, 500) : null };
}

/**
 * รับ event แชท 1:1 ของบอทนี้ (เรียกใน after() ของ webhook) — ทำงานเฉพาะเมื่อ:
 *   1) ลายเซ็นถูกต้อง (ต้องตั้ง Channel secret ของบอท) 2) ติ๊ก "รับแชทลูกค้า" ให้บอทนี้ในหน้าตั้งค่าแชท
 */
export async function ingestLineChatEvents(admin: Admin, bot: LineBotView, events: LineChatEvent[], signed: boolean): Promise<number> {
  if (!signed || !bot.token || events.length === 0) return 0;
  const settings = await loadChatSettings(admin);
  const conf = settings.line_bots[bot.key];
  if (!conf?.enabled) return 0;
  let saved = 0;
  for (const e of events) {   // ทีละ event ตามลำดับ (ข้อความในห้องเดียวกันไม่ชนกัน)
    const ev = lineEventToInbound(e, bot.key);
    if (!ev) continue;
    if (ev.mediaId) {
      const img = await fetchLineImage(bot.token, ev.mediaId);
      if (img) {
        try { ev.attachments = [{ kind: "image", key: await putLineImage("chat/line", img.bytes, img.type) }]; }
        catch { ev.text = "[รูปภาพ — เก็บรูปไม่สำเร็จ เปิดดูในแอป LINE OA]"; }
      } else ev.text = "[รูปภาพ — ดึงจาก LINE ไม่ได้ เปิดดูในแอป LINE OA]";
    }
    const r = await ingestInbound(admin, ev, { brandId: conf.brand_id, getProfile: () => lineProfile(bot.token, ev.externalConvId) })
      .catch((err) => { console.error("[chat/line] ingest", err instanceof Error ? err.message : err); return null; });
    if (r?.inserted) saved++;
  }
  return saved;
}

// ---------------------------------------------------------------- ส่ง

const isHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u) && u.length <= 1000;

/** URL รูปที่ LINE ดึงได้ (ผ่าน proxy รูปกลาง · LINE ไม่ส่งหัว Sec-Fetch-Dest จึงได้ไฟล์ต้นฉบับ) */
export const lineImageUrl = (origin: string, key: string) => `${origin}/api/r2-image?key=${encodeURIComponent(key)}`;

/** การ์ดสินค้า (Flex) — รูปใส่เฉพาะ JPEG/PNG (LINE ไม่รับ webp) · ปุ่มเปิดหน้าสินค้าถ้ามีลิงก์ */
export function lineProductFlex(p: Extract<ChatAttachment, { kind: "product" }>, origin: string): LineMessage {
  const price = p.price != null && Number.isFinite(p.price) && p.price > 0 ? `฿${Number(p.price).toLocaleString("th-TH", { maximumFractionDigits: 2 })}` : null;
  const img = p.image_key && /\.(jpe?g|png)$/i.test(p.image_key) ? lineImageUrl(origin, p.image_key) : null;
  const bubble: Record<string, unknown> = {
    type: "bubble",
    body: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        { type: "text", text: p.name.slice(0, 200) || p.code, weight: "bold", wrap: true, size: "md" },
        { type: "text", text: p.code.slice(0, 60) || "-", size: "xs", color: "#8c8c8c" },
        ...(price ? [{ type: "text", text: price, size: "lg", weight: "bold", color: "#06c755" }] : []),
      ],
    },
  };
  if (img) bubble.hero = { type: "image", url: img, size: "full", aspectRatio: "1:1", aspectMode: "cover" };
  if (isHttps(p.url)) bubble.footer = { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", color: "#06c755", action: { type: "uri", label: "ดูสินค้า", uri: p.url } }] };
  return { type: "flex", altText: `${p.name}${price ? ` ${price}` : ""}`.slice(0, 400) || "สินค้า", contents: bubble };
}

/** สร้างข้อความ LINE จากคำสั่งส่ง (สูงสุด 3 ก้อน: ข้อความ · รูป · การ์ดสินค้า) */
export function lineMessagesFor(req: ChatSendRequest, origin: string): LineMessage[] {
  const out: LineMessage[] = [];
  const text = (req.text ?? "").trim();
  if (text) out.push(lineText(text));
  if (req.imageKey) out.push({ type: "image", originalContentUrl: lineImageUrl(origin, req.imageKey), previewImageUrl: lineImageUrl(origin, req.imageKey) });
  if (req.product) out.push(lineProductFlex(req.product, origin));
  return out;
}

/**
 * ส่งถึงลูกค้า: ตอบฟรีด้วยโทเคนตอบกลับถ้ายังสด → ไม่งั้น push (นับโควตา) · โทเคนใช้ได้ครั้งเดียว → ล้างทิ้งทุกครั้งที่ลองใช้
 */
export async function sendLineChat(admin: Admin, conv: ConvServerRow, token: string, req: ChatSendRequest, origin: string): Promise<ChatSendResult> {
  const messages = lineMessagesFor(req, origin);
  if (messages.length === 0) return { ok: false, via: null, error: "ไม่มีข้อความจะส่ง" };
  if (!token) return { ok: false, via: null, error: "ยังไม่ได้ตั้งโทเคนของ OA นี้ (ศูนย์ LINE)" };

  if (conv.reply_token && lineCanReplyFree(conv.reply_token_at, true)) {
    await admin.from("chat_conversations").update({ reply_token: null, reply_token_at: null }).eq("id", conv.id);
    const r = await lineJson(token, "message/reply", { method: "POST", body: JSON.stringify({ replyToken: conv.reply_token, messages }) });
    if (r.ok) return { ok: true, via: "reply", error: null, externalId: sentId(r.json) };
    // โทเคนหมดอายุพอดี → ส่งแบบ push ต่อ (ด้านล่าง)
  }
  const p = await linePushRaw(token, conv.external_id, messages, { timeoutMs: 12000 });
  if (p.ok) return { ok: true, via: "push", error: null };
  return { ok: false, via: "push", error: p.status === 400 ? "ส่งไม่ได้ — ลูกค้าอาจบล็อก OA หรือยังไม่ได้เป็นเพื่อน (เกิน 7 วันหลังทักครั้งสุดท้าย)" : p.error ?? lineErrorText(p.status) };
}

const sentId = (j: Record<string, unknown> | null): string | null => {
  const arr = (j?.sentMessages ?? null) as { id?: string }[] | null;
  return Array.isArray(arr) && arr[0]?.id ? String(arr[0].id).slice(0, 40) : null;
};

/** ทำเครื่องหมาย "อ่านแล้ว" ฝั่งลูกค้า (ไม่สำเร็จก็ไม่เป็นไร) */
export async function lineMarkRead(token: string, readToken: string): Promise<boolean> {
  if (!token || !readToken) return false;
  const r = await lineJson(token, "chat/markAsRead", { method: "POST", body: JSON.stringify({ markAsReadToken: readToken }) });
  return r.ok;
}

// ---------------------------------------------------------------- อ่านอย่างเดียว (ไม่กินโควตา)

const quotaCache = new Map<string, { at: number; v: Awaited<ReturnType<typeof lineBotQuota>> }>();

/** โควตาเดือนนี้ของ OA (จำไว้ 60 วิ) */
export async function lineQuotaCached(token: string): Promise<{ ok: boolean; limit: number | null; used: number | null }> {
  if (!token) return { ok: false, limit: null, used: null };
  const hit = quotaCache.get(token);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const v = await lineBotQuota(token);
  quotaCache.set(token, { at: Date.now(), v });
  return v;
}

/** webhook ของ OA ตอนนี้ชี้ไปไหน (อ่านอย่างเดียว — ไม่เปลี่ยนอะไร) */
export async function lineWebhookEndpoint(token: string): Promise<{ ok: boolean; endpoint: string | null; active: boolean | null }> {
  const r = await lineJson(token, "channel/webhook/endpoint");
  if (!r.ok || !r.json) return { ok: false, endpoint: null, active: null };
  return { ok: true, endpoint: String(r.json.endpoint ?? "") || null, active: typeof r.json.active === "boolean" ? r.json.active : null };
}
