/**
 * 🔔 ทะเบียนแหล่งแจ้งเตือน (ของกลาง · ล้วน ๆ ไม่มี React — ใช้ได้ทั้งจอ เซิร์ฟเวอร์ และเทสต์)
 *
 * เพิ่มเรื่องแจ้งเตือนใหม่ = เพิ่ม 1 รายการที่นี่ → โผล่เอง 3 ที่:
 *   1) หน้าตั้งค่า "การแจ้งเตือน" (หน้าต่างตัว Pet · components/notify-settings) — มีป้าย "ใหม่" 14 วันแรก
 *   2) ศูนย์แจ้งเตือน (WorkPopupHost) — แท็บ/รายการ + นับบนตัว Pet + ตัว Pet เด้งบอก
 *   3) เด้งที่เครื่อง (lib/push-server) — ผ่านประเภทของ lib/push-categories (ช่อง push)
 * เรื่องจากกระดิ่ง (erp_notifications) ดึงจาก PUSH_CATEGORIES อัตโนมัติ — เพิ่มประเภทกระดิ่งที่นั่นที่เดียวก็ขึ้นที่นี่ด้วย
 *
 * ค่าตั้งต่อคน: user_ui_prefs
 *   notify_prefs = { set: { "<source>:<center|bounce>": boolean }, quiet: { on, from, to } } — เก็บเฉพาะที่ต่างจากค่าเริ่มต้น
 *   push_prefs   = { off: [ประเภท] } (ของเดิม — ช่อง "เด้งที่เครื่อง" อ่าน/เขียนที่นี่ ค่าที่ตั้งไว้แล้วไม่หาย)
 */
import { PUSH_CATEGORIES, pushCategoryOf } from "@/lib/push-categories";

export type NotifyChannel = "center" | "bounce" | "push";
export type NotifySource = {
  key: string;
  group: "center" | "bell";
  label: string;
  hint?: string;
  /** ชื่อไอคอนกลาง (<Icon name>) หรืออีโมจิ (<Icon value>) */
  icon: string;
  /** ต้องมีสิทธิ์นี้ถึงเห็นเรื่องนี้ (ไม่ใส่ = ทุกคน) */
  permission?: string;
  /** ประเภทเด้งที่เครื่อง (key ของ PUSH_CATEGORIES) · ไม่มี = เรื่องนี้เด้งที่เครื่องไม่ได้ */
  push?: string;
  /** ปิดไม่ได้ (เช่น ความปลอดภัย) */
  locked?: boolean;
  /** ค่าเริ่มต้น (ไม่ใส่ = เปิด) */
  defaults?: Partial<Record<"center" | "bounce", boolean>>;
  /** วันที่เพิ่มเรื่องนี้ (YYYY-MM-DD) → ป้าย "ใหม่" 14 วัน */
  added?: string;
};

/** เรื่องในศูนย์แจ้งเตือน (มีหน้าจอของตัวเองใน WorkPopupHost) */
const CENTER_SOURCES: NotifySource[] = [
  { key: "work", group: "center", label: "ป๊อปเตือนงาน", hint: "งานค้างตามรายงานอัตโนมัติ", icon: "list", push: "work_popup" },
  { key: "line_design", group: "center", label: "LINE: งานออกแบบ", hint: "ส่งเข้ากลุ่มไลน์ รอเปิดใบงาน", icon: "design", permission: "products.view", added: "2026-11-05" },
  { key: "line_order", group: "center", label: "LINE: คำสั่งซื้อ", hint: "แคปคำสั่งซื้อจากไลน์ รอผูก PO", icon: "cart", permission: "po.view", defaults: { bounce: false }, added: "2026-11-05" },
  { key: "gif", group: "center", label: "GIF จากเพื่อน", hint: "เพื่อนส่ง GIF มาสะกิด", icon: "gift" },
  { key: "watches", group: "center", label: "การเตือนของฉัน", hint: "เงื่อนไขที่คุณตั้งเอง (แท็บ การเตือนของฉัน)", icon: "star", added: "2026-11-06" },
];

/** ตัว Pet เด้งบอกเรื่องกระดิ่งแค่บางประเภทโดยเริ่มต้น (ที่เหลือ = แค่นับตัวเลข ไม่รบกวน) */
const BELL_BOUNCE_DEFAULT = new Set(["task_due", "security"]);

const BELL_SOURCES: NotifySource[] = PUSH_CATEGORIES.filter((c) => c.key !== "work_popup").map((c) => ({
  key: `bell.${c.key}`, group: "bell", label: c.label, hint: c.hint, icon: c.icon, push: c.key,
  locked: c.key === "security",
  defaults: BELL_BOUNCE_DEFAULT.has(c.key) ? undefined : { bounce: false },
}));

export const NOTIFY_SOURCES: NotifySource[] = [...CENTER_SOURCES, ...BELL_SOURCES];
export const notifySource = (key: string) => NOTIFY_SOURCES.find((s) => s.key === key);
/** เรื่องกระดิ่งประเภทไหน → key ในทะเบียน · ป๊อปเตือนงาน (report.*) = "work" (มีแท็บงานแล้ว — แท็บกระดิ่งไม่โชว์ซ้ำ) */
export const bellSourceOf = (eventType: string) => {
  const c = pushCategoryOf(eventType);
  return c === "work_popup" ? "work" : `bell.${c}`;
};

// ── ค่าตั้งต่อคน ──
export type QuietHours = { on: boolean; from: string; to: string };
export type NotifyPrefs = { set: Record<string, boolean>; quiet: QuietHours };
export const NOTIFY_PREFS_KEY = "notify_prefs";
export const QUIET_DEFAULT: QuietHours = { on: false, from: "18:00", to: "08:00" };
export const NOTIFY_PREFS_DEFAULT: NotifyPrefs = { set: {}, quiet: QUIET_DEFAULT };

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  const r = raw && typeof raw === "object" ? (raw as { set?: unknown; quiet?: unknown }) : {};
  const set: Record<string, boolean> = {};
  if (r.set && typeof r.set === "object") {
    for (const [k, v] of Object.entries(r.set as Record<string, unknown>)) {
      const [src, ch] = k.split(":");
      if (typeof v === "boolean" && (ch === "center" || ch === "bounce") && notifySource(src)) set[k] = v;
    }
  }
  const q = r.quiet && typeof r.quiet === "object" ? (r.quiet as Partial<QuietHours>) : {};
  return {
    set,
    quiet: {
      on: q.on === true,
      from: typeof q.from === "string" && HM.test(q.from) ? q.from : QUIET_DEFAULT.from,
      to: typeof q.to === "string" && HM.test(q.to) ? q.to : QUIET_DEFAULT.to,
    },
  };
}

/** เรื่องนี้เปิดช่องนี้อยู่ไหม (center / bounce) — ล็อกไว้ = เปิดเสมอ */
export function notifyOn(prefs: NotifyPrefs, key: string, channel: "center" | "bounce"): boolean {
  const s = notifySource(key);
  if (!s) return true;   // เรื่องที่ยังไม่ลงทะเบียน = ไม่ซ่อน (ไม่หายเงียบ)
  if (s.locked) return true;
  const v = prefs.set[`${key}:${channel}`];
  return typeof v === "boolean" ? v : s.defaults?.[channel] ?? true;
}

/** ตั้งค่าใหม่ — เท่ากับค่าเริ่มต้น = ลบออก (เก็บเฉพาะที่ต่าง) */
export function withNotifySetting(prefs: NotifyPrefs, key: string, channel: "center" | "bounce", on: boolean): NotifyPrefs {
  const s = notifySource(key);
  const def = s?.defaults?.[channel] ?? true;
  const set = { ...prefs.set };
  if (on === def) delete set[`${key}:${channel}`]; else set[`${key}:${channel}`] = on;
  return { ...prefs, set };
}

/** เวลาไทยตอนนี้ HH:MM */
export function bangkokHM(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(11, 16);
}

/** อยู่ในช่วงห้ามรบกวนไหม (ช่วงข้ามเที่ยงคืนได้ เช่น 18:00–08:00) */
export function inQuietHours(q: QuietHours, hm = bangkokHM()): boolean {
  if (!q.on || q.from === q.to) return false;
  return q.from < q.to ? hm >= q.from && hm < q.to : hm >= q.from || hm < q.to;
}

/** ป้าย "ใหม่" (14 วันหลังเพิ่มเรื่อง) */
export function isNewSource(s: NotifySource, now = Date.now()): boolean {
  if (!s.added) return false;
  const t = Date.parse(`${s.added}T00:00:00+07:00`);
  return Number.isFinite(t) && now - t < 14 * 86400_000 && now >= t;
}
