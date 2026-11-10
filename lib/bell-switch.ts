/**
 * สวิตช์เปิด/ปิด "กระดิ่งที่โค้ดส่งตรง" (ของกลาง · ฝั่ง server) — กระดิ่งที่ไม่ได้ส่งผ่านกฎ erp_notification_rules
 *   เช่น ใบขอซื้อใหม่ → ผู้อนุมัติ · ผลคำขอ → ผู้ขอ · งานครีเอทีฟ → ผู้รับงาน (ส่งถึง "คนที่เกี่ยวข้องกับเอกสาร" เปลี่ยนคนรับไม่ได้ แต่ปิดได้)
 *
 * ทำไมไม่ใช้ตารางกฎ: กฎ = มีคนรับ/แม่แบบข้อความ · เรื่องพวกนี้คนรับมาจากเอกสาร ถ้าสร้างกฎปลอมจะสับสนในหน้าตั้งกฎ
 *   → เก็บเป็นก้อนเดียวแบบเดียวกับสวิตช์ LINE (line_config.disabled_events): china_app_settings skey BELL_SWITCH_KEY
 *   sval = { "<event_type>": true } = ปิด · ไม่มีคีย์ = เปิด (ค่าเริ่ม) · ไม่มีตาราง/คอลัมน์ใหม่
 *
 * ใช้:
 *   ส่งทีละเรื่อง  → if (await bellAllowed(admin, "material_request.result")) { …ส่ง… }
 *   ส่งเป็นชุดแถว → const rows = await dropDisabledBells(admin, notifRows)
 * อ่านไม่สำเร็จ = ส่งตามปกติ (fail-open — แจ้งเตือนสำคัญกว่าการปิด) · จำค่า 15 วินาทีต่อเครื่อง
 * สวิตช์ในหน้าจอ: แผงกระดิ่งบนกล่อง / ป๊อปแก้การแจ้งเตือน ในแผนผัง (/master/flow-map) → POST /api/admin/bell-switches
 * เรื่องไหนปิดได้ = ทะเบียน lib/flow-map-notify.ts (NOTIFY_BELL_SWITCH_EVENTS) · เทสต์บังคับไฟล์ที่ส่งเรื่องนั้นต้องเรียกไฟล์นี้
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** client ฝั่ง server (supabaseAdmin) — ใช้ชนิดกว้างเพราะบางไฟล์ส่ง SupabaseClient ธรรมดามา (เช่น คิวโพสต์โซเชียล) */
type Admin = SupabaseClient;

export const BELL_SWITCH_KEY = "bell_disabled_events";
/** ปิดไม่ได้เด็ดขาด (ความปลอดภัย / ปุ่มทดสอบ) — มีค่าค้างในก้อนก็ไม่สน */
export const BELL_SWITCH_LOCKED: ReadonlySet<string> = new Set(["security.new_device", "push.test", "flow_map.notify_test"]);

/** ทำความสะอาดก้อนที่อ่านจาก DB — เก็บเฉพาะคีย์ที่ปิด (true) และไม่ใช่เรื่องล็อก */
export function cleanBellOff(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v === true && k && !BELL_SWITCH_LOCKED.has(k)) out[k] = true;
  return out;
}

let cache: { at: number; off: Record<string, boolean> } | null = null;
const TTL_MS = 15_000;

/** event_type ที่ปิดอยู่ทั้งหมด (จำ 15 วิ) */
export async function bellOffEvents(admin: Admin): Promise<Record<string, boolean>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.off;
  const { data, error } = await admin.from("china_app_settings").select("sval").eq("skey", BELL_SWITCH_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  const off = cleanBellOff((data as { sval?: unknown } | null)?.sval);
  cache = { at: Date.now(), off };
  return off;
}

/** ล้างค่าที่จำไว้ (หลังบันทึกสวิตช์ในเครื่องเดียวกัน) */
export function clearBellSwitchCache(): void { cache = null; }

/** ส่งกระดิ่งเรื่องนี้ได้ไหม — อ่านไม่สำเร็จ = ได้ */
export async function bellAllowed(admin: Admin, eventType: string): Promise<boolean> {
  if (BELL_SWITCH_LOCKED.has(eventType)) return true;
  try { return !(await bellOffEvents(admin))[eventType]; } catch { return true; }
}

/** ตัดแถวกระดิ่งของเรื่องที่ปิดออกก่อน insert ลง erp_notifications */
export async function dropDisabledBells<T extends { event_type?: unknown }>(admin: Admin, rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  let off: Record<string, boolean>;
  try { off = await bellOffEvents(admin); } catch { return rows; }
  return rows.filter((r) => !off[String(r.event_type ?? "")]);
}
