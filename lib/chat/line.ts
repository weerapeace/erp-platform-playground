/**
 * ห้องแชทรวม — ตัวต่อ LINE ส่วน "กติกาล้วน" (ไม่มี I/O · เทสต์ lib/__tests__/chat-line.test.ts)
 *   เลือก event แชท 1:1 จาก webhook กลาง (กลุ่ม/ห้องเป็นของระบบเดิม ไม่ยุ่ง) → แปลงเป็นข้อความกลาง ChatInbound
 *   ส่วนที่คุยกับ LINE จริง (ดึงชื่อ/รูป · ส่ง · อ่านแล้ว) อยู่ที่ lib/chat/line-server.ts
 */
import type { LineEvent } from "@/lib/line-intake";
import type { ChatAttachment, ChatInbound } from "./types";

/** event จาก LINE ที่ห้องแชทใช้ (เพิ่มจาก LineEvent กลาง) */
export type LineChatEvent = Omit<LineEvent, "message"> & {
  webhookEventId?: string;
  message?: {
    id?: string; type?: string; text?: string;
    stickerId?: string; packageId?: string;
    fileName?: string; duration?: number;
    title?: string; address?: string;
    markAsReadToken?: string;
  };
};

const LINE_USER_RE = /^U[0-9a-f]{32}$/;
export const isLineUserId = (v: unknown): v is string => typeof v === "string" && LINE_USER_RE.test(v);

/** event แชท 1:1 จากลูกค้า (ข้อความ · เพิ่มเพื่อน · บล็อก) — กลุ่ม/ห้องไม่เอา */
export function pickLineChatEvents(events: LineEvent[]): LineChatEvent[] {
  return (events as LineChatEvent[]).filter((e) =>
    e?.source?.type === "user" && isLineUserId(e.source.userId) &&
    (e.type === "message" || e.type === "follow" || e.type === "unfollow"));
}

const iso = (ts: number | undefined) => new Date(Number.isFinite(ts) ? Number(ts) : Date.now()).toISOString();
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "") || null;

/**
 * event 1 ตัว → ข้อความกลาง · accountRef = คีย์บอทที่รับ
 * รูป → mediaId (ให้ฝั่งเซิร์ฟเวอร์ดึงลง R2 ทันที — LINE ลบไฟล์ทีหลัง) · คืน null = ไม่ใช่ event ที่ใช้
 */
export function lineEventToInbound(e: LineChatEvent, accountRef: string): ChatInbound | null {
  const userId = e.source?.userId;
  if (!isLineUserId(userId)) return null;
  const base = { channel: "line" as const, accountRef, externalConvId: userId, sentAt: iso(e.timestamp) };

  if (e.type === "follow" || e.type === "unfollow") {
    const id = clip(e.webhookEventId, 64) ?? `${e.type}-${e.timestamp ?? Date.now()}`;
    return {
      ...base, kind: e.type, externalMessageId: `ev:${id}`,
      text: e.type === "follow" ? "ลูกค้าเพิ่มเพื่อน OA" : "ลูกค้าบล็อก OA (ส่งข้อความหาไม่ได้จนกว่าจะเลิกบล็อก)",
      attachments: [], replyToken: e.type === "follow" ? e.replyToken ?? null : null,
    };
  }
  if (e.type !== "message" || !e.message) return null;
  const m = e.message;
  const mid = clip(m.id, 30);
  if (!mid || !/^\d+$/.test(mid)) return null;

  let text: string | null = null;
  let attachments: ChatAttachment[] = [];
  let mediaId: string | null = null;
  switch (m.type) {
    case "text": text = typeof m.text === "string" ? m.text.slice(0, 5000) : null; break;
    case "image": mediaId = mid; break;
    case "sticker": attachments = [{ kind: "sticker", package_id: clip(m.packageId, 20), sticker_id: clip(m.stickerId, 20) }]; break;
    case "video": attachments = [{ kind: "video", label: null }]; break;
    case "audio": attachments = [{ kind: "audio", label: null }]; break;
    case "file": attachments = [{ kind: "file", label: clip(m.fileName, 120) }]; break;
    case "location": attachments = [{ kind: "location", label: clip(m.title, 120) ?? clip(m.address, 160) }]; break;
    default: text = "[ข้อความชนิดที่ยังแสดงไม่ได้ — เปิดดูในแอป LINE OA]";
  }
  return {
    ...base, kind: "message", externalMessageId: mid, text, attachments, mediaId,
    replyToken: e.replyToken ?? null,
    readToken: clip(m.markAsReadToken, 300),
  };
}
