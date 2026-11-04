/** ของใช้ร่วมของ /api/content-albums/* (แยกจาก route.ts — route ต้อง export แค่ handler) */
import { normalizeCaptionDrafts } from "@/lib/content-album-captions";
import { POST_TYPES } from "@/lib/creative-tasks";
import { cleanRefUrl, refProvider } from "@/lib/content-album-refs";

// ประเภท Content ที่อยากได้ = ชุดเดียวกับประเภทโพสต์ (lib/creative-tasks POST_TYPES)
const CONTENT_TYPE_KEYS = new Set(POST_TYPES.map((t) => t.value));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const uuidList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter(isUuid))] : []);
export const codeList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter((s) => /^[a-z0-9_-]{1,40}$/i.test(s)))] : [];

const clipText = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;

/**
 * ตรวจเนื้อ Reference 1 ชิ้น (ใช้ร่วม: Reference ของรายการ /[id]/refs + คลัง Reference กลาง /api/content-refs)
 *   { kind: "image", r2_key } (ต้องเป็นรูปที่อัปผ่านตัวอัปกลาง โฟลเดอร์ content-refs — กันชี้ไฟล์คนอื่น)
 *   { kind: "link", url, title?, thumb_url? } · { kind: "text", body } · + note? ("ชอบตรงไหน")
 */
export function cleanRefInput(body: Record<string, unknown>): { row: Record<string, unknown> } | { error: string } {
  const kind = String(body.kind ?? "");
  const row: Record<string, unknown> = { kind, note: clipText(body.note, 500) };
  if (kind === "image") {
    const key = typeof body.r2_key === "string" && /^content-refs\/[\w./-]+$/.test(body.r2_key) && !body.r2_key.includes("..") ? body.r2_key : null;
    if (!key) return { error: "รูปไม่ถูกต้อง" };
    row.r2_key = key;
  } else if (kind === "link") {
    const url = cleanRefUrl(String(body.url ?? ""));
    if (!url) return { error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" };
    row.url = url; row.provider = refProvider(url); row.title = clipText(body.title, 300);
    row.thumb_url = cleanRefUrl(String(body.thumb_url ?? ""));
  } else if (kind === "text") {
    const text = clipText(body.body, 2000);
    if (!text) return { error: "พิมพ์ข้อความก่อน" };
    row.body = text;
  } else {
    return { error: "ชนิด Reference ไม่ถูกต้อง" };
  }
  return { row };
}

/**
 * ตรวจ + ทำความสะอาดช่องของอัลบั้ม (ใช้ทั้งสร้างและแก้) — คืน { patch } หรือ { error } เป็นภาษาคน
 * ส่งมาเฉพาะช่องที่จะเปลี่ยน · ช่องที่ไม่ส่ง = ไม่แตะ
 */
export function cleanAlbumFields(body: Record<string, unknown>): { album: Record<string, unknown>; collection: Record<string, unknown> } | { error: string } {
  const album: Record<string, unknown> = {};
  const collection: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "ต้องมีชื่ออัลบั้ม" };
    if (name.length > 120) return { error: "ชื่ออัลบั้มยาวเกิน 120 ตัวอักษร" };
    collection.name = name;
  }
  if (body.description !== undefined) collection.description = String(body.description ?? "").trim() || null;
  if (body.brand_id !== undefined) {
    if (body.brand_id && !isUuid(body.brand_id)) return { error: "แบรนด์ไม่ถูกต้อง" };
    album.brand_id = body.brand_id || null;
  }
  if (body.assignee_ids !== undefined) album.assignee_ids = uuidList(body.assignee_ids);
  if (body.due_date !== undefined) {
    const d = String(body.due_date ?? "").trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "วันที่ต้องลงไม่ถูกต้อง" };
    album.due_date = d || null;
  }
  if (body.planned_platforms !== undefined) album.planned_platforms = codeList(body.planned_platforms);
  if (body.caption_draft !== undefined) album.caption_draft = String(body.caption_draft ?? "").trim() || null;
  if (body.caption_drafts !== undefined) album.caption_drafts = normalizeCaptionDrafts(body.caption_drafts);
  if (body.picked_asset_ids !== undefined) album.picked_asset_ids = uuidList(body.picked_asset_ids);
  if (body.file_order !== undefined) album.file_order = uuidList(body.file_order).slice(0, 2000);
  if (body.parent_sku_codes !== undefined) {
    album.parent_sku_codes = Array.isArray(body.parent_sku_codes) ? [...new Set(body.parent_sku_codes.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 50) : [];
  }
  if (body.cover_asset_id !== undefined) {
    if (body.cover_asset_id && !isUuid(body.cover_asset_id)) return { error: "รูปปกไม่ถูกต้อง" };
    collection.cover_asset_id = body.cover_asset_id || null;
  }
  if (body.closed !== undefined) album.closed_at = body.closed ? new Date().toISOString() : null;
  // รายการที่อยากได้ → อัลบั้ม (ถ่ายแล้ว) · ย้อนกลับเป็นรายการที่อยากได้ได้ถ้ายังไม่มีไฟล์ (ตรวจที่ route)
  if (body.phase !== undefined) {
    if (body.phase !== "wish" && body.phase !== "album") return { error: "ขั้นไม่ถูกต้อง" };
    album.phase = body.phase;
  }
  if (body.content_types !== undefined) album.content_types = codeList(body.content_types).filter((k) => CONTENT_TYPE_KEYS.has(k));
  return { album, collection };
}
