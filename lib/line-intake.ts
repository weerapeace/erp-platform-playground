/**
 * ของกลาง — "รับของเข้าระบบจากกลุ่มไลน์" (server เท่านั้น)
 *
 * ใช้ร่วมกันทุกงานที่ให้คนส่งข้อความ/รูปในกลุ่มไลน์แล้วเข้า ERP:
 *   - คำสั่งซื้อจากไลน์ (lib/order-capture · slot purchase_capture)
 *   - งานออกแบบจากไลน์ (lib/design-line-inbox · slot design_intake)
 *
 * มีให้: ชนิด event ของไลน์ · ดึงรูปจากไลน์ (= ยืนยันว่าข้อความมีจริง) · เก็บรูปลง R2 · ชื่อคนส่งในกลุ่ม
 *        · ตอบกลับ (reply = ฟรี ไม่นับโควตา 300/เดือน) · รายการกลุ่มที่บอทอยู่ ให้หน้าตั้งค่ากด "ใช้กลุ่มนี้"
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject } from "@/lib/r2";
import { LINE_SLOTS } from "@/lib/line-registry";
import { lineBotFor, loadLineConfig } from "@/lib/line-send";

type Admin = ReturnType<typeof supabaseAdmin>;
type Rec = Record<string, unknown>;

const str = (v: unknown) => String(v ?? "").trim();

export type LineEvent = {
  type?: string;
  replyToken?: string;
  timestamp?: number;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string; imageSet?: { id?: string; index?: number; total?: number } };
};

/** id ข้อความไลน์ที่ถูกรูปแบบ (ตัวเลขล้วน) — กันค่าแปลก ๆ ไปต่อ URL */
export const isLineMessageId = (id: unknown) => /^\d{5,30}$/.test(str(id));

/** ตอบกลับในแชท (ข้อความเดียว) — ตอบไม่ได้ก็ไม่เป็นไร ข้อมูลอยู่ใน ERP แล้ว */
export async function lineReply(token: string, replyToken: string | undefined, text: string): Promise<void> {
  if (!replyToken) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
  } catch { /* ตอบไม่ได้ก็ไม่เป็นไร — ข้อมูลอยู่ใน ERP แล้ว */ }
}

/** ชื่อที่โชว์ในไลน์ของคนส่งในกลุ่ม */
export async function lineMemberName(token: string, groupId: string, userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const r = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = (await r.json()) as { displayName?: string };
    return str(j.displayName) || null;
  } catch { return null; }
}

/** ดึงไฟล์รูปจากไลน์ — ทำหน้าที่ยืนยันด้วยว่าข้อความมีอยู่จริง (id ปลอม = ไลน์ตอบ 404) */
export async function fetchLineImage(token: string, messageId: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const r = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 15 * 1024 * 1024) return null;
    return { bytes: buf, type };
  } catch { return null; }
}

export const LINE_IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** อัปรูปขึ้น R2 ใต้โฟลเดอร์ที่กำหนด — ชื่อไฟล์สุ่ม เดาไม่ได้ · คืน key */
export async function putLineImage(folder: string, bytes: Uint8Array, type: string): Promise<string> {
  const ym = new Date().toISOString().slice(0, 7);
  const key = `${folder}/${ym}/${crypto.randomUUID()}.${LINE_IMAGE_EXT[type] ?? "jpg"}`;
  await r2PutObject(key, bytes, type);
  return key;
}

/** ลายนิ้วมือไฟล์ (sha256 hex) — ใช้จับ "รูปเดิมส่งซ้ำ" */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- ตั้งกลุ่มไลน์ (หน้าแอดมิน)

export type KnownLineGroup = {
  id: string; name: string | null; members: number | null;
  /** บอทยังอยู่ในกลุ่มไหม (ถามไลน์ไม่ได้ = ออกจากกลุ่มแล้ว/ไม่ใช่กลุ่ม) */
  reachable: boolean;
  /** ตอนนี้กลุ่มนี้ใช้กับระบบไหนอยู่ (ป้ายไทย) */
  uses: string[];
  /** กลุ่มนี้คุยเรื่องอื่นเยอะ — ถ้าใช้เป็นกลุ่มรับเข้า ของในกลุ่มจะหลุดเข้าระบบ (หน้าตั้งค่าขึ้นเตือน) */
  busy_images: boolean;
  is_current: boolean; is_captured: boolean;
};

/**
 * กลุ่มไลน์ที่ระบบรู้จัก = กลุ่มของทุกระบบใน line_config.groups + กลุ่มล่าสุดที่บอทเห็น
 * ถามชื่อ/จำนวนคนจากไลน์ (อ่านอย่างเดียว ไม่ส่งข้อความ) ให้แอดมินกด "ใช้กลุ่มนี้" ได้ทันที
 * busySlots = กลุ่มของ slot เหล่านี้ถือว่า "คุยเรื่องอื่นเยอะ" · "any" = กลุ่มที่ใช้กับระบบอื่นอยู่แล้วทุกกลุ่ม
 */
export async function loadLineGroupSetup(admin: Admin, slot: string, busySlots: string[] | "any") {
  const cfg = await loadLineConfig(admin);
  // ใช้บอทที่ดูแล slot นี้ (หลายบอท) — ถามชื่อกลุ่ม/กลุ่มล่าสุดด้วยบอทตัวนั้น · "ถามไม่ได้" = บอทนี้ไม่ได้อยู่ในกลุ่ม
  const bot = lineBotFor(cfg, slot);
  const token = bot.token;
  const current = str(cfg.groups?.[slot]);
  const captured = bot.group_id;

  const slotsOf = new Map<string, string[]>();
  for (const [s, gid] of Object.entries((cfg.groups ?? {}) as Rec)) {
    const g = str(gid); if (!g || s === slot) continue;
    slotsOf.set(g, [...(slotsOf.get(g) ?? []), s]);
  }
  for (const g of [current, captured]) if (g && !slotsOf.has(g)) slotsOf.set(g, []);
  const lineGet = async (path: string): Promise<Rec | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`https://api.line.me/v2/bot/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.ok ? ((await res.json()) as Rec) : null;
    } catch { return null; }
  };
  const groups: KnownLineGroup[] = await Promise.all([...slotsOf.entries()].map(async ([gid, slots]) => {
    const [sum, cnt] = await Promise.all([lineGet(`group/${encodeURIComponent(gid)}/summary`), lineGet(`group/${encodeURIComponent(gid)}/members/count`)]);
    return {
      id: gid,
      name: sum ? str(sum.groupName) || null : null,
      members: cnt ? Number(cnt.count) || null : null,
      reachable: !!sum,
      uses: slots.map((s) => (LINE_SLOTS as Record<string, { label: string }>)[s]?.label ?? s),
      busy_images: busySlots === "any" ? slots.length > 0 : slots.some((s) => busySlots.includes(s)),
      is_current: gid === current,
      is_captured: gid === captured,
    };
  }));
  // กลุ่มที่ใช้อยู่ก่อน → กลุ่มที่ใช้กับระบบอื่น (ไม่ใช่กลุ่มรูปเยอะ) → กลุ่มอื่น → กลุ่มรูปเยอะไว้ท้าย
  const rank = (g: KnownLineGroup) => (g.is_current ? 0 : g.busy_images ? 3 : g.uses.length ? 1 : 2);
  groups.sort((x, y) => rank(x) - rank(y));
  return {
    has_token: !!token,
    has_secret: !!((bot.isMain && process.env.LINE_CHANNEL_SECRET) || bot.channel_secret),
    current, current_name: groups.find((g) => g.is_current)?.name ?? null,
    captured, captured_at: bot.group_captured_at,
    bot: { key: bot.key, label: bot.label },
    groups,
  };
}
