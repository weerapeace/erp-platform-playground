/**
 * ไอเดียงานออกแบบ (หน้า "ไอเดีย" ใน Design Dashboard · เจ้าของขอ 2026-11-12) — ค่ากลาง + ตัวทำความสะอาด
 * ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ (ไม่มี import ฝั่งเซิร์ฟเวอร์)
 *
 * ตาราง design_ideas (migration 202611121400) · API /api/design-ideas · server lib/design-ideas-server.ts
 * เริ่มทำงานจริง = POST /api/design-sheets { idea_id, detail: ideaDetailHtml(...) } → ได้เลข DS + รูปย้ายไปแกลเลอรีใบงาน
 * จากไลน์ (กลุ่ม "ส่งไอเดีย" slot design_idea · lib/design-idea-line.ts) = status inbox (รอคัด) → เพิ่มเป็นไอเดีย (open) / รวม (merged) / ไม่เอา (archived)
 * doc: docs/design-ideas.md
 */
import { linkHost, normalizeTaskLinks, type TaskLink } from "@/lib/record-tasks";

/** ชื่อเว็บของลิงก์ — ใช้ตัวกลางของเช็กลิสต์ (lib/record-tasks) */
export { linkHost };

export const IDEA_STATUSES = ["inbox", "open", "paused", "archived", "promoting", "promoted", "merged"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
/** สถานะที่คนตั้งเองได้ (promoting/promoted = ระบบตั้งตอนเริ่มงานจริง) */
export const IDEA_SETTABLE: readonly IdeaStatus[] = ["open", "paused", "archived"];
/** แก้ได้ (รวมรอคัดจากไลน์) — promoting/promoted/merged แก้ไม่ได้ */
export const IDEA_EDITABLE: readonly IdeaStatus[] = ["inbox", "open", "paused", "archived"];
/** รวมเข้าได้ (ปลายทาง) */
export const IDEA_MERGE_TARGET: readonly IdeaStatus[] = ["open", "paused"];
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
  /** ข้อความดิบจากไลน์ (รอคัด) */
  text_body: string | null;
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

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/** ข้อความจากไลน์ → ลิงก์ (ทุก URL) + ข้อ ๆ (แต่ละบรรทัดที่เหลือหลังตัดลิงก์ออก) */
export function ideaPartsFromText(text: string | null | undefined): { points: string[]; links: TaskLink[] } {
  const raw = String(text ?? "");
  const links = cleanIdeaLinks((raw.match(URL_RE) ?? []).map((u) => u.replace(/[),.;!?]+$/, "")));
  const points = cleanIdeaPoints(raw.split(/\r?\n/).map((l) => l.replace(URL_RE, "").replace(/^[\s•\-*·]+/, "").trim()));
  return { points, links };
}

/** ชื่อตั้งต้นของไอเดียจากไลน์ (ก่อน AI ตั้ง/คนแก้): ข้อแรก → ชื่อเว็บของลิงก์แรก → "ไอเดียจาก <คนส่ง>" */
export function ideaNameFromParts(points: string[], links: TaskLink[], sender: string | null | undefined): string {
  if (points[0]) return cleanIdeaName(points[0].slice(0, 60));
  if (links[0]) return cleanIdeaName(`ไอเดียจาก ${linkHost(links[0].url)}`);
  return cleanIdeaName(`ไอเดียจาก ${String(sender ?? "").trim() || "ไลน์"}`);
}

