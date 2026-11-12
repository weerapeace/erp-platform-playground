/**
 * ไอเดียจากกลุ่มไลน์ "ส่งไอเดีย" (slot design_idea · เจ้าของขอ 2026-11-12) — ฝั่งเซิร์ฟเวอร์
 *
 * ใครในกลุ่มก็ส่งรูป / ลิงก์ / ข้อความได้ → เก็บเป็นไอเดียสถานะ inbox (กล่อง "รอคัด" ในหน้าไอเดียของ Design Dashboard)
 *   - ของคนเดิมภายใน 5 นาที = ชุดเดียว (RPC design_idea_line_ingest · advisory lock · กันไลน์ส่งซ้ำ) · ขึ้นต้น "ไอเดียใหม่" = เปิดชุดใหม่
 *   - จบชุด (เงียบ 6 วิ แล้วชิ้นของเรายังเป็นชิ้นล่าสุด) → แตกข้อความเป็นลิงก์ + ข้อ ๆ · ตั้งชื่อ (ข้อแรก / ชื่อเว็บ / AI อ่านรูปแรกถ้ามีแต่รูป)
 *     → ตอบในกลุ่มครั้งเดียว (reply = ไม่กินโควตา) · ส่งเพิ่มภายหลัง = ตอบอัปเดตเมื่อจำนวนรูป+ลิงก์เพิ่ม
 *   - กันของปลอม: รูปต้องดึงจากไลน์ได้ · ข้อความต้องเป็นสมาชิกกลุ่มจริง (ถามชื่อจากไลน์ได้)
 * webhook กลาง = app/api/china-pay/line-webhook (งานที่ 4) · ของกลาง lib/line-intake · ค่ากลาง lib/design-ideas
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { aiChat } from "@/lib/paid-services-server";
import { imagesToDataUrls } from "@/lib/ai-caption";
import { appBaseUrl } from "@/lib/app-url";
import { fetchLineImage, isLineMessageId, lineMemberName, lineReply, putLineImage, type LineEvent } from "@/lib/line-intake";
import { cleanIdeaImageKeys, cleanIdeaName, ideaNameFromParts, ideaPartsFromText, IDEA_IMAGE_FOLDER } from "@/lib/design-ideas";

type Admin = ReturnType<typeof supabaseAdmin>;
type Rec = Record<string, unknown>;
type LineCfg = { token?: string; groups?: Record<string, string> } & Rec;

export const DESIGN_IDEA_SLOT = "design_idea";
const IDEA_WINDOW_SECONDS = 300;
const REPLY_QUIET_MS = 6000;
const TABLE = "design_ideas";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const ideasLink = () => `${appBaseUrl()}/master/design-dashboard?ideas=1`;

/** ขึ้นต้น "ไอเดียใหม่" = เปิดชุดใหม่ทันที (ตัดคำนำออกจากข้อความที่เก็บ) */
export function splitNewIdeaKeyword(text: string): { forceNew: boolean; text: string } {
  const m = /^\s*[#＃]?\s*(?:ไอเดียใหม่|new\s+idea\b)\s*[:：\-–—.,]?\s*/i.exec(text);
  return m ? { forceNew: true, text: text.slice(m[0].length).trim() } : { forceNew: false, text: text.trim() };
}

/** ข้อความ/รูปในกลุ่มส่งไอเดียเท่านั้น (สติกเกอร์/ไฟล์อื่นไม่รับ) */
export function pickIdeaEvents(cfg: LineCfg, events: LineEvent[]): LineEvent[] {
  const gid = str(cfg.groups?.[DESIGN_IDEA_SLOT]);
  if (!gid || !str(cfg.token)) return [];
  return events.filter((e) =>
    e.type === "message" && e.source?.groupId === gid && isLineMessageId(e.message?.id) &&
    (e.message?.type === "image" || (e.message?.type === "text" && !!str(e.message?.text))));
}

type Candidate = { id: string; msgId: string; replyToken: string | undefined };

/** รับจาก webhook (ใน after() — ตอบ 200 ให้ไลน์ไปแล้ว) */
export async function handleIdeaEvents(admin: Admin, cfg: LineCfg, events: LineEvent[]): Promise<void> {
  const token = str(cfg.token);
  const names = new Map<string, string | null>();
  const candidates = new Map<string, Candidate>();
  for (const ev of events) {
    try {
      const c = await ingestOne(admin, token, ev, names);
      if (c) candidates.set(c.id, c);
    } catch (e) { console.error("[design-idea-line] event", e); }
  }
  if (!candidates.size) return;
  await sleep(REPLY_QUIET_MS);
  for (const c of candidates.values()) {
    try { await finishBatch(admin, token, c); } catch (e) { console.error("[design-idea-line] finish", e); }
  }
}

async function ingestOne(admin: Admin, token: string, ev: LineEvent, names: Map<string, string | null>): Promise<Candidate | null> {
  const msgId = str(ev.message?.id);
  const groupId = str(ev.source?.groupId);
  const userId = str(ev.source?.userId) || null;
  const isText = ev.message?.type === "text";
  const kw = splitNewIdeaKeyword(isText ? str(ev.message?.text) : "");

  // ไลน์ส่งซ้ำ — เช็กก่อนดึงรูป (RPC กันซ้ำอีกชั้น)
  const { data: seen } = await admin.from(TABLE).select("id").filter("line_message_ids", "cs", JSON.stringify([msgId])).limit(1);
  if ((seen ?? []).length > 0) return null;

  let key: string | null = null;
  if (!isText) {
    const img = await fetchLineImage(token, msgId);
    if (!img) return null;   // ดึงไม่ได้ = ข้อความปลอม/หมดอายุ
    key = await putLineImage(IDEA_IMAGE_FOLDER, img.bytes, img.type);
  }
  const nameKey = userId ?? "";
  if (!names.has(nameKey)) names.set(nameKey, await lineMemberName(token, groupId, userId ?? undefined));
  const senderName = names.get(nameKey) ?? null;
  if (isText && !senderName) return null;   // ข้อความยืนยันกับไลน์ไม่ได้ = ต้องเป็นสมาชิกกลุ่มจริง

  const { data, error } = await admin.rpc("design_idea_line_ingest", {
    p_group: groupId, p_sender: userId, p_sender_name: senderName, p_message_id: msgId,
    p_text: kw.text.slice(0, 4000) || null, p_image_key: key, p_window_seconds: IDEA_WINDOW_SECONDS, p_force_new: kw.forceNew,
  });
  if (error) { console.error("[design-idea-line] ingest", error.message); return null; }
  const r = ((data ?? []) as Rec[])[0];
  if (!r || r.duplicate) return null;
  return { id: String(r.idea_id), msgId, replyToken: ev.replyToken };
}

/** AI ตั้งชื่อจากรูปแรก (เฉพาะชุดที่ไม่มีข้อความ/ลิงก์ให้ตั้งชื่อ) — ปิดบริการ/พลาด = ใช้ชื่อตั้งต้น */
async function aiNameFromImage(key: string): Promise<string | null> {
  try {
    const url = (await imagesToDataUrls([key]))[0];
    if (!url) return null;
    const raw = await aiChat("ai.design_idea",
      'ตั้งชื่อไอเดียสินค้าสั้น ๆ จากรูป ไม่เกิน 40 ตัวอักษร ภาษาไทย บอกว่าเป็นสินค้าอะไร (เช่น "กระเป๋าผ้าคาดอก") ตอบเป็น JSON {"name": string|null}',
      [{ type: "text", text: "ตั้งชื่อไอเดียจากรูปนี้" }, { type: "image_url", image_url: { url, detail: "low" } }], 80);
    const name = (raw as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() ? cleanIdeaName(name.slice(0, 60)) : null;
  } catch { return null; }
}

async function finishBatch(admin: Admin, token: string, c: Candidate): Promise<void> {
  const { data } = await admin.from(TABLE).select("id, status, name, text_body, image_keys, line_message_ids, sender_name, replied_at, replied_count").eq("id", c.id).maybeSingle();
  const row = data as Rec | null;
  if (!row || row.status !== "inbox") return;   // ทีมคัดไปแล้ว
  const ids = arr(row.line_message_ids);
  if (ids[ids.length - 1] !== c.msgId) return;   // มีชิ้นใหม่ตามมา → ตัวนั้นทำแทน

  const { points, links } = ideaPartsFromText(str(row.text_body));
  const keys = cleanIdeaImageKeys(row.image_keys);
  let name = ideaNameFromParts(points, links, str(row.sender_name));
  if (!points.length && !links.length && keys[0]) name = (await aiNameFromImage(keys[0])) ?? name;
  await admin.from(TABLE).update({ name, points, links, updated_at: new Date().toISOString() }).eq("id", c.id).eq("status", "inbox");

  // ตอบครั้งแรก · หรือมีรูป/ลิงก์เพิ่มจากตอนตอบครั้งก่อน
  const count = keys.length + links.length;
  const prev = row.replied_count == null ? null : Number(row.replied_count);
  if (row.replied_at && prev != null && count <= prev) return;
  const first = !row.replied_at;
  const who = str(row.sender_name) || "ไลน์";
  const lines = [
    first ? `💡 รับไอเดียแล้ว (${who})` : `💡 อัปเดตไอเดียแล้ว (${who})`,
    name,
    `รูป ${keys.length} · ลิงก์ ${links.length}${points.length ? ` · ข้อความ ${points.length} ข้อ` : ""} → รอคัดใน ERP`,
    `ส่งเพิ่มได้ภายใน ${Math.round(IDEA_WINDOW_SECONDS / 60)} นาที${first ? ` · ไอเดียอื่นต่อเลย พิมพ์ "ไอเดียใหม่" นำหน้า` : ""}`,
    `ดูในระบบ 👉 ${ideasLink()}`,
  ];
  await lineReply(token, c.replyToken, lines.join("\n"));
  await admin.from(TABLE).update({ replied_at: new Date().toISOString(), replied_count: count }).eq("id", c.id);
}
