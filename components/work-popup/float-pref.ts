/** ค่าตั้ง "ป๊อปเตือนงานแบบลอย" ต่อคน (ล้วน ๆ ไม่มี hook — ใช้ได้ทั้งหน้าจอและเทสต์) · hook อยู่ใน ./float */

import { parseCornerAnchor, type CornerAnchor } from "@/lib/use-corner-drag";

export type WorkPopupFloatPosition = "br" | "tr";
/** card = การ์ดลอย (กดข้างนอก = ซ่อน) · drawer = แถบข้างขวา เปิดค้างจนกด ✕ (กดข้างนอกไม่ปิด) */
export type WorkPopupFloatMode = "card" | "drawer";
/**
 * anchor = ตำแหน่งที่ผู้ใช้ลากไปวางเอง (มุม+ระยะ) · null = ใช้มุมสำเร็จรูป position
 * 2026-11-11 (เจ้าของสั่ง "ยิ่งกว้างยิ่งเตี้ย · แท็บเลื่อนได้ ตั้งค่าได้ เปิด-ปิด สลับที่ได้"):
 *   width = ความกว้างที่ลากขอบไว้ (px) · tabOrder = ลำดับแท็บที่จัดเอง · tabHidden = แท็บที่ปิดไว้ · hideImg = ไม่โชว์รูปในแท็บงาน
 *   (ไม่มีค่า = ค่าเริ่มต้น · เก็บเฉพาะที่ผู้ใช้ตั้ง)
 */
export type WorkPopupFloatPref = {
  enabled: boolean; minimized: boolean; position: WorkPopupFloatPosition; anchor?: CornerAnchor | null; mode?: WorkPopupFloatMode;
  width?: number; tabOrder?: string[]; tabHidden?: string[]; hideImg?: boolean;
};

export const WORK_POPUP_FLOAT_KEY = "work_popup_float";
/** ค่าเริ่ม = ซ่อน (เจ้าของขอ 2026-11-06 "default เป็นซ่อนให้หมด ถ้าจะโชว์ให้กดโชว์เอง") · คนที่เคยตั้งเองไว้แล้ว = ตามที่ตั้ง · เปิดที่เมนูโปรไฟล์ → 🔔 ป๊อปเตือนงาน */
export const WORK_POPUP_FLOAT_DEFAULT: WorkPopupFloatPref = { enabled: false, minimized: false, position: "br", anchor: null, mode: "card" };
/** มุมสำเร็จรูป (เลือกในเมนูโปรไฟล์) — ขวาบนเว้นแถบเมนูด้านบน */
export const WORK_POPUP_PRESET_ANCHOR: Record<WorkPopupFloatPosition, CornerAnchor> = {
  br: { h: "r", v: "b", x: 16, y: 16 },
  tr: { h: "r", v: "t", x: 16, y: 64 },
};
export const workPopupAnchor = (p: WorkPopupFloatPref): CornerAnchor => p.anchor ?? WORK_POPUP_PRESET_ANCHOR[p.position];
/** จอแคบกว่านี้ = หน้าต่างกลางจอแบบเดิม (ERP มีแถบเมนูล่าง ลอยแล้วบังงาน) */
export const FLOAT_MIN_WIDTH = 1280;
/** ข้อความบอกวิธีปิดถาวร — ปิดได้ที่เดียวคือเมนูโปรไฟล์ (✕ บนการ์ด = แค่ซ่อนเป็นปุ่มเล็ก) */
export const WORK_POPUP_HIDE_HINT = "ปิดป๊อปนี้ได้ที่ เมนูโปรไฟล์ (กดที่ชื่อคุณ) → 🔔 ป๊อปเตือนงาน";

// ── ความกว้าง: ยิ่งกว้าง แถวยิ่งเตี้ย (แคบ 3 บรรทัดต่องาน · กลาง 2 · กว้าง 1 บรรทัดแบบตาราง) ──
export const FLOAT_WIDTH_MIN = 360;
export const FLOAT_WIDTH_MAX = 960;
export const FLOAT_WIDTH_DEFAULT = 400;
/** ปุ่มสลับความกว้างสำเร็จรูป แคบ / กลาง / กว้าง */
export const FLOAT_WIDTH_PRESETS = [400, 520, 680] as const;
/** 1 = แคบ (3 บรรทัดต่องาน) · 2 = กลาง (2 บรรทัด) · 3 = กว้าง (1 บรรทัด + แท็บขึ้นไปอยู่แถวหัว) */
export type FloatLevel = 1 | 2 | 3;
export const floatLevel = (w: number): FloatLevel => (w < 460 ? 1 : w < 600 ? 2 : 3);
/** บีบความกว้างให้อยู่ในช่วง + ไม่เกินพื้นที่ที่เหลือบนจอ (room) */
export function clampFloatWidth(w: number, room = Infinity): number {
  const max = Math.max(FLOAT_WIDTH_MIN, Math.min(FLOAT_WIDTH_MAX, room));
  return Math.round(Math.min(max, Math.max(FLOAT_WIDTH_MIN, Number.isFinite(w) ? w : FLOAT_WIDTH_DEFAULT)));
}
/** ปุ่มสลับความกว้าง: ขนาดสำเร็จรูปถัดไปที่ใหญ่กว่าตอนนี้ · ใหญ่สุดแล้ว (หรือจอไม่พอ) = กลับไปแคบ */
export function nextWidthPreset(w: number, room = Infinity): number {
  const next = FLOAT_WIDTH_PRESETS.find((p) => p > w + 10 && p <= room);
  return next ?? FLOAT_WIDTH_PRESETS[0];
}

// ── แท็บในศูนย์แจ้งเตือน: ลำดับ + เปิด/ปิด ต่อคน ──
/** รายชื่อแท็บทั้งหมด (หน้าตั้งค่าในการ์ดใช้ — แท็บที่ตอนนี้ไม่มีเรื่องก็จัดลำดับ/ปิดไว้ก่อนได้)
 *  perm = ต้องมีสิทธิ์ข้อใดข้อหนึ่งถึงเห็นแท็บนี้ · เพิ่มแท็บใหม่ใน WorkPopupHost → เพิ่มที่นี่ด้วย (key ตรงกับ FloatTab.key) */
export const CENTER_TABS: { key: string; label: string; icon: string; perm?: string[] }[] = [
  { key: "work", label: "งาน", icon: "list" },
  { key: "tasks", label: "Task", icon: "inspect", perm: ["tasks.view"] },
  { key: "plan", label: "แผนงาน", icon: "calendar", perm: ["tasks.view"] },
  { key: "line", label: "LINE", icon: "chat", perm: ["products.view", "po.view"] },
  { key: "bell", label: "กระดิ่ง", icon: "notify" },
  { key: "watches", label: "ของฉัน", icon: "star" },
  { key: "gif", label: "GIF", icon: "gift" },
  { key: "deploy", label: "ขึ้นเว็บ", icon: "build", perm: ["admin.users"] },
];

/** เรียงแท็บตามที่ผู้ใช้จัด (key ที่ไม่อยู่ในลำดับ = ต่อท้ายตามลำดับเดิม) + ตัดแท็บที่ปิดไว้ */
export function orderTabs<T extends { key: string }>(tabs: T[], order: string[] = [], hidden: string[] = []): T[] {
  const pos = new Map(order.map((k, i) => [k, i]));
  return tabs
    .map((t, i) => ({ t, i, p: pos.has(t.key) ? pos.get(t.key)! : order.length + i }))
    .filter((x) => !hidden.includes(x.t.key))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.t);
}

const parseKeys = (raw: unknown): string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const keys = [...new Set(raw.filter((k): k is string => typeof k === "string" && /^[a-z0-9_.-]{1,40}$/.test(k)))].slice(0, 30);
  return keys.length ? keys : undefined;
};

export function parseWorkPopupFloatPref(raw: unknown): WorkPopupFloatPref | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<WorkPopupFloatPref>;
  const tabOrder = parseKeys(r.tabOrder), tabHidden = parseKeys(r.tabHidden);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : WORK_POPUP_FLOAT_DEFAULT.enabled,
    minimized: typeof r.minimized === "boolean" ? r.minimized : WORK_POPUP_FLOAT_DEFAULT.minimized,
    position: r.position === "tr" ? "tr" : "br",
    anchor: parseCornerAnchor(r.anchor),
    mode: r.mode === "drawer" ? "drawer" : "card",
    ...(typeof r.width === "number" && Number.isFinite(r.width) ? { width: clampFloatWidth(r.width) } : {}),
    ...(tabOrder ? { tabOrder } : {}),
    ...(tabHidden ? { tabHidden } : {}),
    ...(r.hideImg === true ? { hideImg: true } : {}),
  };
}
