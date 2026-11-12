/**
 * ไอเดียงานออกแบบ (หน้า "ไอเดีย" ใน Design Dashboard · เจ้าของขอ 2026-11-12) — ค่ากลาง + ตัวทำความสะอาด
 * ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ (ไม่มี import ฝั่งเซิร์ฟเวอร์)
 *
 * ตาราง design_ideas (migration 202611121400) · API /api/design-ideas · server lib/design-ideas-server.ts
 * เริ่มทำงานจริง = POST /api/design-sheets { idea_id, detail: ideaDetailHtml(...) } → ได้เลข DS + รูปย้ายไปแกลเลอรีใบงาน
 * doc: docs/design-ideas.md
 */
import { normalizeTaskLinks, type TaskLink } from "@/lib/record-tasks";

export const IDEA_STATUSES = ["open", "paused", "archived", "promoting", "promoted"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
/** สถานะที่คนตั้งเองได้ (promoting/promoted = ระบบตั้งตอนเริ่มงานจริง) */
export const IDEA_SETTABLE: readonly IdeaStatus[] = ["open", "paused", "archived"];
/** เริ่มทำงานจริงได้เฉพาะไอเดียที่ยังเปิด/พักไว้ (เก็บแล้วต้องกู้คืนก่อน) */
export const IDEA_PROMOTABLE: readonly IdeaStatus[] = ["open", "paused"];

export const MAX_IDEA_NAME = 200;
export const MAX_IDEA_POINTS = 30;
export const MAX_IDEA_POINT_LEN = 300;
export const MAX_IDEA_IMAGES = 20;
/** โฟลเดอร์ R2 ของรูปไอเดียที่อัปจากหน้าจอ (ImageAttachKeys) */
export const IDEA_IMAGE_FOLDER = "design-ideas";

export type DesignIdea = {
  id: string;
  name: string;
  brand_id: string | null;
  brand_name: string | null;
  brand_color: string | null;
  points: string[];
  links: TaskLink[];
  image_keys: string[];
  status: IdeaStatus;
  source: "manual" | "line";
  sender_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  promoted_sheet_id: string | null;
};

export const isIdeaStatus = (v: unknown): v is IdeaStatus => typeof v === "string" && (IDEA_STATUSES as readonly string[]).includes(v);

export function cleanIdeaName(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_IDEA_NAME);
}

/** รายละเอียดเป็นข้อ ๆ — ตัดช่องว่าง/ข้อว่าง · ≤30 ข้อ · ข้อละ ≤300 ตัวอักษร */
export function cleanIdeaPoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_IDEA_POINT_LEN)).filter(Boolean).slice(0, MAX_IDEA_POINTS);
}

/** Reference — ใช้กติกาเดียวกับลิงก์ในเช็กลิสต์ (http/https เท่านั้น · ไม่ซ้ำ · ≤10) */
export function cleanIdeaLinks(raw: unknown): TaskLink[] {
  return normalizeTaskLinks(raw);
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,299}$/;
/** R2 key ของรูป — รูปแบบปลอดภัยเท่านั้น (ไม่มี .. / ไม่ขึ้นต้นด้วย /) · ไม่ซ้ำ · ≤20 รูป */
export function cleanIdeaImageKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const k = x.trim();
    if (!SAFE_KEY.test(k) || k.includes("..") || out.includes(k)) continue;
    out.push(k);
    if (out.length >= MAX_IDEA_IMAGES) break;
  }
  return out;
}

export const ideaImageUrl = (key: string, w?: number) => `/api/r2-image?key=${encodeURIComponent(key)}${w ? `&w=${w}` : ""}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** รายละเอียดใบงานตอนเริ่มทำงานจริง (HTML แบบเดียวกับช่องรายละเอียดของใบงาน) = ข้อ ๆ + หัวข้อ Reference + ลิงก์ */
export function ideaDetailHtml(points: string[], links: TaskLink[]): string {
  const parts: string[] = [];
  if (points.length) parts.push(`<ul>${points.map((p) => `<li><p>${esc(p)}</p></li>`).join("")}</ul>`);
  if (links.length) {
    parts.push("<p><strong>Reference</strong></p>");
    parts.push(`<ul>${links.map((l) => `<li><p><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a></p></li>`).join("")}</ul>`);
  }
  return parts.join("");
}

/** ชื่อเว็บสั้น ๆ ของลิงก์ (ใช้บนชิป) */
export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
