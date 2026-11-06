/**
 * ตัวส่ง LINE กลาง (ของกลาง · server เท่านั้น) — ทุกจุดที่ "ส่งข้อความ LINE" (push) ต้องผ่านไฟล์นี้
 *
 * ทำไมต้องมี: เดิมแต่ละระบบ (บอร์ดผลิต / QC / จัดซื้อ / จีน / ครีเอทีฟ / รายงาน / ความปลอดภัย / ต่ออายุ)
 *   อ่านโทเคนบอท + เรียก api.line.me เองคนละที่ → เปลี่ยนบอท/เพิ่มบอท ต้องแก้ทีละไฟล์ และโควตาหมดก็เงียบไม่รู้ตัว
 *
 * มีให้:
 *   loadLineConfig(admin)      อ่าน china_app_settings.line_config (ก้อนเดียวทั้ง ERP)
 *   lineTokenFor(cfg, slot)    เลือกโทเคนบอทสำหรับกลุ่มปลายทาง ← จุดเดียวที่ต้องแก้ตอนรองรับ "หลายบอท"
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

/** โครงสร้าง line_config (ดูคำอธิบายเต็มที่ lib/line-registry) */
export type LineConfig = {
  token?: string;
  channel_secret?: string;
  group_id?: string;              // กลุ่มล่าสุดที่ webhook จับได้ (บางระบบใช้เป็นกลุ่มสำรอง)
  group_captured_at?: string;
  groups?: Record<string, string>;            // slot → groupId
  templates?: Record<string, string>;         // eventKey → แม่แบบข้อความ
  disabled_events?: Record<string, boolean>;  // eventKey → ปิดส่ง
  routing?: Record<string, string>;           // (แอปจีน) เหตุการณ์ → slot
} & Record<string, unknown>;

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
 * โทเคนบอทที่ใช้ส่งเข้ากลุ่มของ slot นี้
 * ตอนนี้มีบอทเดียว → ทุก slot ใช้โทเคนหลัก · เมื่อรองรับหลายบอท จะเลือกบอทตาม slot ที่ฟังก์ชันนี้ที่เดียว
 */
export function lineTokenFor(cfg: LineConfig, _slot?: string | null): string {
  return typeof cfg.token === "string" ? cfg.token.trim() : "";
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

/**
 * ส่งเข้ากลุ่ม/คนด้วยบอทที่ถูกต้อง
 * slot = กลุ่มปลายทางตามทะเบียน (production / qc / creative ...) — ใช้เลือกบอท · ส่งหาคนรายตัว ไม่ต้องใส่
 */
export async function linePush(cfg: LineConfig, opts: { to: string; slot?: string | null; messages: LineMessage[] }): Promise<LinePushResult> {
  return linePushRaw(lineTokenFor(cfg, opts.slot), opts.to, opts.messages);
}
