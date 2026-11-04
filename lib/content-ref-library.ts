/**
 * คลัง Reference กลาง (หน้า Contents) — ของกลาง pure ใช้ได้ทั้งหน้าจอ / API / test
 *   เก็บ Reference ดี ๆ ไว้ที่เดียว → หยิบใส่รายการที่อยากได้ / อัลบั้มได้เลย (ก๊อปแถว + library_id · ไฟล์รูปตัวเดิม)
 *   ตาราง content_ref_library · API /api/content-refs · หยิบใส่ = POST /api/content-albums/[id]/refs { library_ids }
 */
import { cleanRefUrl, type RefKind } from "@/lib/content-album-refs";

export const MAX_LIBRARY_TAGS = 12;
const MAX_TAG_LEN = 30;

/** Reference 1 ชิ้นในคลัง */
export type LibraryRef = {
  id: string; kind: RefKind;
  r2_key: string | null; url: string | null; provider: string | null; title: string | null; thumb_url: string | null;
  body: string | null; note: string | null;
  tags: string[];
  brand_id: string | null;                       // ว่าง = ใช้ได้ทุกแบรนด์
  brand: { id: string; name: string; color: string | null } | null;
  used_count: number;                            // ถูกหยิบไปใช้กี่รายการ
  created_by: string | null; created_at: string; updated_at: string;
};

/** แท็ก: ตัด # / ช่องว่างเกิน · ไม่ซ้ำ (ไม่สนตัวพิมพ์เล็กใหญ่) · ≤12 แท็ก ≤30 ตัวอักษร · รับ "a, b" หรือ ["a","b"] */
export function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map((x) => String(x ?? "")) : String(input ?? "").split(/[,\n，、]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const tag = r.replace(/\s+/g, " ").trim().replace(/^#+\s*/, "").slice(0, MAX_TAG_LEN).trim();
    const k = tag.toLowerCase();
    if (!tag || seen.has(k)) continue;
    seen.add(k); out.push(tag);
    if (out.length >= MAX_LIBRARY_TAGS) break;
  }
  return out;
}

/** กุญแจกันเก็บซ้ำ: รูปเดียวกัน / ลิงก์เดียวกัน (ตัด # และ / ท้าย) / ข้อความเดียวกัน */
export function refDedupeKey(r: { kind: string; r2_key?: string | null; url?: string | null; body?: string | null }): string | null {
  if (r.kind === "image") return r.r2_key ? `image:${r.r2_key}` : null;
  if (r.kind === "link") {
    const u = cleanRefUrl(r.url);
    if (!u) return null;
    try { const x = new URL(u); x.hash = ""; return `link:${x.host.replace(/^www\.|^m\./, "").toLowerCase()}${x.pathname.replace(/\/+$/, "")}${x.search}`; }
    catch { return `link:${u}`; }
  }
  if (r.kind === "text") { const b = (r.body ?? "").replace(/\s+/g, " ").trim().toLowerCase(); return b ? `text:${b}` : null; }
  return null;
}

/** แท็กทั้งหมดในคลัง เรียงตามที่ใช้บ่อย → ชื่อ */
export function libraryTags(items: { tags: string[] }[]): { tag: string; count: number }[] {
  const m = new Map<string, { tag: string; count: number }>();
  for (const it of items) for (const tag of it.tags) {
    const k = tag.toLowerCase();
    const cur = m.get(k);
    if (cur) cur.count++; else m.set(k, { tag, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "th"));
}

export type LibraryFilter = { q?: string; tag?: string | null; kind?: RefKind | "all"; brandId?: string | null };

/** กรอง: คำค้น (ชื่อ/ข้อความ/คำอธิบาย/แท็ก/ลิงก์/แบรนด์) · แท็ก · ชนิด · แบรนด์ (เลือกแบรนด์ = แบรนด์นั้น + ชิ้นที่ใช้ได้ทุกแบรนด์) */
export function filterLibrary<T extends LibraryRef>(items: T[], f: LibraryFilter): T[] {
  const q = (f.q ?? "").trim().toLowerCase();
  const tag = (f.tag ?? "").toLowerCase();
  return items.filter((it) =>
    (!f.kind || f.kind === "all" || it.kind === f.kind) &&
    (!tag || it.tags.some((x) => x.toLowerCase() === tag)) &&
    (!f.brandId || !it.brand_id || it.brand_id === f.brandId) &&
    (!q || [it.title, it.body, it.note, it.url, it.brand?.name, ...it.tags].some((s) => (s ?? "").toLowerCase().includes(q))));
}

/** ลำดับในป๊อปหยิบ: แบรนด์เดียวกันก่อน → ใช้ได้ทุกแบรนด์ → แบรนด์อื่น · ในกลุ่มเดียวกัน ใช้บ่อยก่อน → ใหม่ก่อน */
export function rankForPicker<T extends LibraryRef>(items: T[], brandId: string | null | undefined): T[] {
  const tier = (it: T) => (brandId && it.brand_id === brandId ? 0 : !it.brand_id ? 1 : 2);
  return [...items].sort((a, b) => tier(a) - tier(b) || b.used_count - a.used_count || b.created_at.localeCompare(a.created_at));
}
