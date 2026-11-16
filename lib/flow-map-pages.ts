// ============================================================
// flow-map-pages — คำอธิบาย "หน้าจริง" ของกล่องในแผนผังการทำงาน (ป๊อปดูหน้าจริง components/flow-map/page-preview)
//
// 1) FLOW_PAGE_INFO[href] = ส่วนของหน้า (ทำอะไร · กดแล้วเกิดอะไร · ข้อมูลมาจากไหน) — ร่างโดย AI จากโค้ดหน้า แล้วคนแก้ต่อได้
// 2) FLOW_API_HUMAN[path] = แปลชื่อ API เป็นภาษาคน (หน้าโหลดข้อมูลจากไหน — ป๊อปจับจากตอนหน้าโหลดจริง แล้วมาแปลที่นี่)
// ข้อมูลอยู่ lib/flow-map-pages-data.ts · ตรรกะล้วน เทสต์ได้ (lib/__tests__/flow-map-pages.test.ts — กันชี้ API ที่ไม่มีจริง)
// ============================================================

import { FLOW_PAGE_DATA, FLOW_API_DATA } from "./flow-map-pages-data";

/** ส่วนหนึ่งของหน้า · match = ข้อความบนปุ่ม/หัวข้อที่เห็นบนจอ (ใช้จับตอนชี้เมาส์) · apis = path ใน FLOW_API_HUMAN ที่ส่วนนี้ใช้ */
export type FlowPagePart = { label: string; does: string; data?: string; match?: string[]; apis?: string[] };
export type FlowPageInfo = { summary: string; parts: FlowPagePart[] };
/** read = ตอนเปิดดู (GET) ดึงอะไร · write = ตอนกดบันทึก/ส่ง (POST/PATCH/PUT/DELETE) ทำอะไร */
export type FlowApiHuman = { read?: string; write?: string };

export const FLOW_PAGE_INFO: Record<string, FlowPageInfo> = FLOW_PAGE_DATA;
export const FLOW_API_HUMAN: Record<string, FlowApiHuman> = FLOW_API_DATA;

/** href ของกล่อง → key ในทะเบียน (ตัด query/hash) */
export const pageKey = (href: string): string => (href || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";

const DYN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Z]{1,6}-?\d[\w-]*)$/i;
/** URL ที่หน้าเรียกจริง → path มาตรฐาน: ตัดโดเมน/query · ส่วนที่เป็นรหัส (uuid/ตัวเลข/เลขเอกสาร) = [id] */
export function normalizeApiPath(url: string): string {
  let p = (url || "").replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  if (!p.startsWith("/")) p = `/${p}`;
  return p.split("/").map((seg, i) => (i > 1 && DYN.test(decodeURIComponent(seg)) ? "[id]" : seg)).join("/").replace(/\/+$/, "");
}

/** หา key ในทะเบียน: ตรงตัว → แบบ [id] → ตัดท้ายทีละท่อน (เช่น /api/x/[id]/lines → /api/x/[id]) */
export function apiKeyOf(url: string): string | null {
  const p = normalizeApiPath(url);
  if (FLOW_API_HUMAN[p]) return p;
  const segs = p.split("/");
  for (let n = segs.length - 1; n > 2; n--) {
    const k = segs.slice(0, n).join("/");
    if (FLOW_API_HUMAN[k]) return k;
  }
  return null;
}

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** 1 รายการที่หน้าเรียก → คำอธิบายภาษาคน (ไม่มีในทะเบียน = null · ยังโชว์ชื่อเทคนิคให้) */
export function apiHuman(url: string, method = "GET"): { key: string; path: string; write: boolean; th: string | null } {
  const path = normalizeApiPath(url), key = apiKeyOf(url), write = WRITE.has(method.toUpperCase());
  const h = key ? FLOW_API_HUMAN[key] : undefined;
  return { key: key ?? path, path, write, th: (write ? h?.write ?? h?.read : h?.read ?? h?.write) ?? null };
}

/** ตัวหนังสือบนปุ่ม/ช่องที่ชี้อยู่ → ส่วนในทะเบียนที่ตรง (ไม่สนช่องว่าง/ตัวพิมพ์ · มีคำ match อยู่ในข้อความ) */
export function partForText(info: FlowPageInfo | undefined, text: string): FlowPagePart | null {
  const s = (text || "").replace(/\s+/g, "").toLowerCase();
  if (!info || !s) return null;
  let best: { p: FlowPagePart; len: number } | null = null;
  for (const p of info.parts) for (const m of p.match ?? []) {
    const k = m.replace(/\s+/g, "").toLowerCase();
    if (k && s.includes(k) && (!best || k.length > best.len)) best = { p, len: k.length };
  }
  return best?.p ?? null;
}

/** ปุ่ม/ช่องที่ "บันทึก/ลบ/ส่ง" ข้อมูลจริง — หน้าตัวอย่างล็อกไว้ (กันเผลอแก้ของจริง) */
export const DANGER_TEXT = /บันทึก|ลบ|ยืนยัน|อนุมัติ|ปฏิเสธ|ยกเลิกใบ|ส่ง|สร้าง|นำเข้า|อัปโหลด|จ่าย|ปิดงาน|รับของ|รับเป็น|ย้าย|save|delete|remove|submit|confirm|approve|send|create|upload|import/i;
