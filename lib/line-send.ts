/**
 * ตัวส่ง LINE กลาง (ของกลาง · server เท่านั้น) — ทุกจุดที่ "ส่งข้อความ LINE" (push) ต้องผ่านไฟล์นี้
 *
 * ทำไมต้องมี: เดิมแต่ละระบบ (บอร์ดผลิต / QC / จัดซื้อ / จีน / ครีเอทีฟ / รายงาน / ความปลอดภัย / ต่ออายุ)
 *   อ่านโทเคนบอท + เรียก api.line.me เองคนละที่ → เปลี่ยนบอท/เพิ่มบอท ต้องแก้ทีละไฟล์ และโควตาหมดก็เงียบไม่รู้ตัว
 *
 * มีให้:
 *   loadLineConfig(admin)      อ่าน china_app_settings.line_config (ก้อนเดียวทั้ง ERP)
 *   lineTokenFor(cfg, slot)    เลือกโทเคนบอทสำหรับกลุ่มปลายทาง (ตาม slot_bot · ไม่ตั้ง = บอทหลัก)
 *   lineBot / lineBots / lineBotFor / lineConfigForBot   หลายบอท: บอทหลัก (ค่าระดับบนสุดเดิม) + บอทเสริม (cfg.bots)
 *   lineBotInfo / lineBotQuota / lineGroupMembers         อ่านจาก LINE (ไม่กินโควตา) ให้ศูนย์ LINE โชว์โควตา/จำนวนคน
 *   linePush(cfg, {to, slot, messages})   ส่งเข้ากลุ่ม/คน ด้วยบอทที่ถูกต้อง
 *   linePushRaw(token, to, messages)      ส่งด้วยโทเคนที่รู้อยู่แล้ว (เช่น LINE OA ของร้านเว็บ)
 *   lineText(text)             ข้อความล้วน (ตัดความยาวตามที่ LINE รับ)
 *   lineErrorText(status)      แปลรหัสผิดพลาดจาก LINE เป็นภาษาคน (429 = โควตาเดือนนี้หมด)
 *
 * โควตา: LINE นับ "ต่อผู้รับ" — ส่งเข้ากลุ่ม N คน = N โควตา (ตอบกลับ reply ฟรี ไม่นับ)
 * ตัวรับ webhook / ตอบกลับ (reply) / ดึงรูป ยังอยู่ที่ lib/line-intake (ไม่ใช่การส่ง push)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** บอทเสริม 1 ตัว (บัญชี LINE OA อีกบัญชี = โควตาฟรีแยกของตัวเอง) */
export type LineBotConfig = {
  label?: string;                 // ชื่อที่ตั้งเองในระบบ เช่น "บอทผลิต"
  token?: string;                 // Channel access token (ความลับ — ปิดก่อนส่งหน้าเว็บ ดู lib/settings-secrets)
  channel_secret?: string;        // ใช้ตรวจลายเซ็น webhook ของบอทนี้ (ความลับ)
  bot_name?: string;              // ชื่อบอทใน LINE (ถามจาก LINE ตอนเพิ่ม)
  basic_id?: string;              // @xxxx ของบอท
  group_id?: string;              // กลุ่มล่าสุดที่บอทตัวนี้เห็น (webhook ของบอทนี้จับให้)
  group_captured_at?: string;
  added_at?: string;
};

/** โครงสร้าง line_config (ดูคำอธิบายเต็มที่ lib/line-registry) — ระดับบนสุด = "บอทหลัก" ตัวเดิม */
export type LineConfig = {
  token?: string;
  channel_secret?: string;
  group_id?: string;              // กลุ่มล่าสุดที่บอทหลักเห็น (บางระบบใช้เป็นกลุ่มสำรอง)
  group_captured_at?: string;
  groups?: Record<string, string>;            // slot → groupId
  templates?: Record<string, string>;         // eventKey → แม่แบบข้อความ
  disabled_events?: Record<string, boolean>;  // eventKey → ปิดส่ง
  routing?: Record<string, string>;           // (แอปจีน) เหตุการณ์ → slot
  bots?: Record<string, LineBotConfig>;       // บอทเสริม: botKey → ค่าตั้ง
  slot_bot?: Record<string, string>;          // slot → botKey (ไม่ตั้ง = บอทหลัก)
} & Record<string, unknown>;

/** คีย์ของบอทหลัก (ค่าตั้งอยู่ระดับบนสุดของ line_config ตามเดิม) */
export const MAIN_BOT = "main";

/** มุมมองบอท 1 ตัวแบบเดียวกันทั้งบอทหลักและบอทเสริม */
export type LineBotView = {
  key: string; label: string; isMain: boolean;
  token: string; channel_secret: string;
  group_id: string; group_captured_at: string | null;
  bot_name: string; basic_id: string;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** บอทตาม key — ไม่มีบอทนี้ = null (บอทหลักมีเสมอ แม้ยังไม่ตั้งโทเคน) */
export function lineBot(cfg: LineConfig, key: string): LineBotView | null {
  if (key === MAIN_BOT) {
    return {
      key: MAIN_BOT, label: s(cfg.main_label) || "บอทหลัก", isMain: true,
      token: s(cfg.token), channel_secret: s(cfg.channel_secret),
      group_id: s(cfg.group_id), group_captured_at: s(cfg.group_captured_at) || null,
      bot_name: s(cfg.main_bot_name), basic_id: s(cfg.main_basic_id),
    };
  }
  const b = cfg.bots?.[key];
  if (!b || typeof b !== "object") return null;
  return {
    key, label: s(b.label) || key, isMain: false,
    token: s(b.token), channel_secret: s(b.channel_secret),
    group_id: s(b.group_id), group_captured_at: s(b.group_captured_at) || null,
    bot_name: s(b.bot_name), basic_id: s(b.basic_id),
  };
}

/** บอททุกตัว (บอทหลักก่อน) */
export function lineBots(cfg: LineConfig): LineBotView[] {
  return [MAIN_BOT, ...Object.keys(cfg.bots ?? {})].map((k) => lineBot(cfg, k)).filter((b): b is LineBotView => !!b);
}

/** บอทที่ดูแลกลุ่มของ slot นี้ — ไม่ได้เลือก / บอทถูกลบ / บอทยังไม่มีโทเคน = บอทหลัก (ไม่เงียบ) */
export function lineBotKeyFor(cfg: LineConfig, slot?: string | null): string {
  const key = slot ? s(cfg.slot_bot?.[slot]) : "";
  if (!key || key === MAIN_BOT) return MAIN_BOT;
  return lineBot(cfg, key)?.token ? key : MAIN_BOT;
}

export function lineBotFor(cfg: LineConfig, slot?: string | null): LineBotView {
  return lineBot(cfg, lineBotKeyFor(cfg, slot)) as LineBotView;
}

/** คีย์บอทเสริมที่ถูกรูปแบบ (ใช้ต่อท้าย URL webhook) */
export const isLineBotKey = (k: unknown): k is string => typeof k === "string" && /^[a-z0-9_]{2,24}$/.test(k) && k !== MAIN_BOT;

/**
 * ค่าตั้งในมุมของบอทตัวหนึ่ง — token / channel_secret / group_id เป็นของบอทนั้น (ที่เหลือเหมือนเดิม)
 * ใช้กับตัวรับ webhook: ระบบรับเข้า (lib/order-capture, lib/design-line-inbox) อ่าน cfg.token → ได้โทเคนบอทที่รับข้อความมาจริง
 */
export function lineConfigForBot(cfg: LineConfig, key: string): LineConfig {
  const b = lineBot(cfg, key);
  if (!b || b.isMain) return cfg;
  return { ...cfg, token: b.token, channel_secret: b.channel_secret, group_id: b.group_id, group_captured_at: b.group_captured_at ?? undefined };
}

export type LineMessage = Record<string, unknown>;

/** ผลการส่ง — error = ข้อความภาษาคน (โชว์ผู้ใช้ได้เลย) · detail = ข้อความดิบจาก LINE (ไว้ดู log) */
export type LinePushResult = { ok: boolean; status: number; error: string | null; detail?: string };

const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const MAX_TEXT = 4900;   // LINE รับข้อความละไม่เกิน 5,000 ตัวอักษร

/** อ่านค่าตั้ง LINE ทั้งก้อน — อ่านไม่ได้ = ก้อนว่าง (ผู้เรียกจะเห็นว่า "ยังไม่ได้ตั้งค่า") */
export async function loadLineConfig(admin: Admin): Promise<LineConfig> {
  const { data } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
  return ((data as { sval?: LineConfig } | null)?.sval ?? {}) as LineConfig;
}

/**
 * โทเคนบอทที่ใช้ส่งเข้ากลุ่มของ slot นี้ (ตาม slot_bot) · ไม่ระบุ slot (เช่น ส่งหาช่างรายคน) = บอทหลัก
 */
export function lineTokenFor(cfg: LineConfig, slot?: string | null): string {
  return lineBotFor(cfg, slot).token;
}

/** ข้อความล้วน 1 ก้อน (ตัดความยาวให้ LINE รับได้) */
export const lineText = (text: string): LineMessage => ({ type: "text", text: text.slice(0, MAX_TEXT) });

/** แปลรหัสจาก LINE เป็นภาษาคน */
export function lineErrorText(status: number): string {
  if (status === 429) return "โควตาข้อความ LINE เดือนนี้หมดแล้ว (แพ็กเกจฟรี 300 ข้อความ/เดือน นับตามจำนวนคนที่ได้รับ) — รอรีเซ็ตวันที่ 1 หรืออัปเกรดแพ็กเกจ LINE OA";
  if (status === 401 || status === 403) return "โทเคนบอท LINE ใช้ไม่ได้ — ตรวจที่ศูนย์ LINE ในหน้าตั้งค่า";
  if (status === 400 || status === 404) return "ส่งเข้ากลุ่ม LINE ไม่ได้ — บอทอาจไม่ได้อยู่ในกลุ่มนี้แล้ว หรือ group id ไม่ถูกต้อง";
  if (status === 0) return "ติดต่อ LINE ไม่ได้ กรุณาลองใหม่";
  return `ส่ง LINE ไม่สำเร็จ (รหัส ${status})`;
}

/** ส่งด้วยโทเคนที่รู้แล้ว — ไม่โยน error (คืนผลเสมอ) */
export async function linePushRaw(token: string, to: string, messages: LineMessage[], opts?: { timeoutMs?: number }): Promise<LinePushResult> {
  if (!token) return { ok: false, status: 0, error: "ยังไม่ได้ตั้งบอท LINE (ศูนย์ LINE ในหน้าตั้งค่า)" };
  if (!to) return { ok: false, status: 0, error: "ยังไม่ได้เลือกกลุ่มหรือผู้รับ LINE" };
  if (messages.length === 0) return { ok: false, status: 0, error: "ไม่มีข้อความจะส่ง" };
  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 15000),
    });
    if (res.ok) return { ok: true, status: res.status, error: null };
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    // โควตาหมด = ทุกระบบจะเงียบ → จดลง log ให้เห็นชัด (ค้นใน Vercel logs ด้วยคำว่า "[line-send]")
    if (res.status === 429) console.warn("[line-send] โควตา LINE หมด (429)", detail);
    else console.warn(`[line-send] LINE ตอบ ${res.status}`, detail);
    return { ok: false, status: res.status, error: lineErrorText(res.status), detail };
  } catch (e) {
    console.warn("[line-send] ติดต่อ LINE ไม่ได้", e instanceof Error ? e.message : e);
    return { ok: false, status: 0, error: lineErrorText(0) };
  }
}

// ---------------------------------------------------------------- อ่านข้อมูลจาก LINE (ไม่ส่งข้อความ · ไม่กินโควตา)

async function lineGet(token: string, path: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch { return null; }
}

/** ข้อมูลบอทจาก LINE — null = โทเคนใช้ไม่ได้ (ใช้ตรวจตอนเพิ่มบอท) */
export async function lineBotInfo(token: string): Promise<{ name: string; basic_id: string } | null> {
  const j = await lineGet(token, "info");
  return j ? { name: s(j.displayName), basic_id: s(j.basicId) } : null;
}

/** โควตาเดือนนี้ของบอท: limit = null คือไม่จำกัด (แพ็กเกจจ่ายตามจริง) · อ่านไม่ได้ = ok:false */
export async function lineBotQuota(token: string): Promise<{ ok: boolean; limit: number | null; used: number | null }> {
  const [q, c] = await Promise.all([lineGet(token, "message/quota"), lineGet(token, "message/quota/consumption")]);
  if (!q || !c) return { ok: false, limit: null, used: null };
  const limit = q.type === "limited" ? Number(q.value) || 0 : null;
  return { ok: true, limit, used: Number(c.totalUsage) || 0 };
}

/** จำนวนสมาชิกในกลุ่ม (ส่ง 1 ครั้ง = กินโควตาเท่าจำนวนนี้) — null = บอทไม่อยู่ในกลุ่ม/อ่านไม่ได้ */
export async function lineGroupMembers(token: string, groupId: string): Promise<number | null> {
  if (!groupId) return null;
  const j = await lineGet(token, `group/${encodeURIComponent(groupId)}/members/count`);
  return j ? Number(j.count) || 0 : null;
}

/**
 * ส่งเข้ากลุ่ม/คนด้วยบอทที่ถูกต้อง
 * slot = กลุ่มปลายทางตามทะเบียน (production / qc / creative ...) — ใช้เลือกบอท · ส่งหาคนรายตัว ไม่ต้องใส่
 */
export async function linePush(cfg: LineConfig, opts: { to: string; slot?: string | null; messages: LineMessage[] }): Promise<LinePushResult> {
  return linePushRaw(lineTokenFor(cfg, opts.slot), opts.to, opts.messages);
}
