/**
 * เทมเพลตบรีฟ (ของกลาง ใช้ได้ทั้งจอและ API — ห้าม import ของฝั่งเซิร์ฟเวอร์)
 * เลือกเทมเพลต = ต่อท้ายโน้ตของโพสต์ + รวม Ref (รูป/ลิงก์ตัวเดิม ไม่อัปซ้ำ · รวมไม่เกิน 6 · ตัดซ้ำ)
 * เก็บที่ erp_creative_brief_templates · ใช้ร่วมทุกแบรนด์ (brand_id ว่าง) หรือติดแบรนด์ (แบรนด์ของโพสต์ขึ้นก่อน)
 */
import { noteToHtml, isEmptyNote } from "@/lib/rich-note";
import { normalizeTaskLinks } from "@/lib/record-tasks";

export type BriefRef = { url: string; label?: string };
export type BriefTemplate = {
  id: string; name: string; tags: string[]; brief: string | null;
  ref_image_keys: string[]; ref_links: BriefRef[]; brand_id: string | null;
  sort_order: number; is_active: boolean; updated_at?: string;
};
export type BriefState = { html: string; images: string[]; links: BriefRef[] };

export const MAX_BRIEF_TEMPLATE_REFS = 6;
const MAX_NAME = 120, MAX_TAGS = 10, MAX_TAG = 40, MAX_BRIEF = 20000, MAX_KEYS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ต่อท้ายบรีฟด้วยเทมเพลต — โน้ตว่าง = ใส่ของเทมเพลตเลย · Ref เติมรูปก่อนแล้วลิงก์ จนเต็ม max (skipped = ที่ไม่ได้ใส่เพราะเต็ม) */
export function appendBriefTemplate(cur: BriefState, tpl: Pick<BriefTemplate, "brief" | "ref_image_keys" | "ref_links">, max = MAX_BRIEF_TEMPLATE_REFS): BriefState & { skipped: number } {
  const add = noteToHtml(tpl.brief);
  const html = isEmptyNote(add) ? cur.html : isEmptyNote(cur.html) ? add : `${cur.html}${add}`;
  const images = [...cur.images];
  const links = [...cur.links];
  let room = Math.max(0, max - images.length - links.length);
  let skipped = 0;
  for (const k of tpl.ref_image_keys ?? []) {
    if (!k || images.includes(k)) continue;
    if (room > 0) { images.push(k); room--; } else skipped++;
  }
  for (const l of tpl.ref_links ?? []) {
    if (!l?.url || links.some((x) => x.url === l.url)) continue;
    if (room > 0) { links.push(l); room--; } else skipped++;
  }
  return { html, images, links, skipped };
}

/** เรียง: แบรนด์ของโพสต์ → ใช้ได้ทุกแบรนด์ → แบรนด์อื่น · ในกลุ่มตาม sort_order แล้วชื่อ */
export function sortBriefTemplates<T extends Pick<BriefTemplate, "brand_id" | "sort_order" | "name">>(list: T[], brandId: string | null | undefined): T[] {
  const rank = (t: T) => (brandId && t.brand_id === brandId ? 0 : !t.brand_id ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th"));
}

/** ค้นหาจากชื่อ + ป้าย (ไม่สนตัวพิมพ์ · ทุกคำต้องเจอ) */
export function matchBriefTemplate(t: Pick<BriefTemplate, "name" | "tags">, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${t.name} ${(t.tags ?? []).join(" ")}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** ป้ายจากช่องพิมพ์ "Video, Editorial, Warm" */
export function parseTags(s: string): string[] {
  return cleanTags(s.split(/[,，]/));
}
function cleanTags(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const x of raw) {
    const v = typeof x === "string" ? x.trim().slice(0, MAX_TAG) : "";
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** ตรวจ + ทำความสะอาดก่อนบันทึก (API) · partial = PATCH (ตรวจเฉพาะช่องที่ส่งมา) */
export function cleanBriefTemplateInput(body: Record<string, unknown>, partial = false): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {};
  if (!partial || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "ใส่ชื่อเทมเพลตก่อน" };
    if (name.length > MAX_NAME) return { error: `ชื่อเทมเพลตยาวเกินไป (ไม่เกิน ${MAX_NAME} ตัวอักษร)` };
    row.name = name;
  }
  if ("tags" in body) row.tags = Array.isArray(body.tags) ? cleanTags(body.tags) : [];
  if ("brief" in body) {
    const b = typeof body.brief === "string" ? body.brief : "";
    if (b.length > MAX_BRIEF) return { error: "โน้ตของเทมเพลตยาวเกินไป" };
    row.brief = isEmptyNote(b) ? null : b;
  }
  if ("ref_image_keys" in body) {
    const keys = body.ref_image_keys;
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string" || !k || k.length > 500)) return { error: "รูป Ref ไม่ถูกต้อง" };
    if (keys.length > MAX_KEYS) return { error: `รูป Ref ได้สูงสุด ${MAX_KEYS} รูป` };
    row.ref_image_keys = [...new Set(keys as string[])];
  }
  if ("ref_links" in body) row.ref_links = normalizeTaskLinks(body.ref_links);
  if ("brand_id" in body) {
    const v = body.brand_id;
    if (v != null && v !== "" && (typeof v !== "string" || !UUID.test(v))) return { error: "แบรนด์ไม่ถูกต้อง" };
    row.brand_id = v || null;
  }
  if ("is_active" in body) row.is_active = body.is_active !== false;
  if ("sort_order" in body) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n)) return { error: "ลำดับไม่ถูกต้อง" };
    row.sort_order = n;
  }
  return { row };
}
