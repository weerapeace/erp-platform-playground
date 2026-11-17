// ============================================================
// sample-images — ตรรกะล้วนของหน้า "SAMPLE Images" (อัลบั้มรูปตัวอย่าง ประจำแบรนด์ · ส่งรูปเข้าใบงานใน Design Dashboard ได้)
//
// รูปเก็บในคลังไฟล์กลาง (assets · source "sample" · brand_id = แบรนด์ของอัลบั้ม)
// อัลบั้ม = asset_collections ที่ description = "sample-images" (ยังไม่ระบุแบรนด์) หรือ "sample-images:<brand_id>"
//   (ไม่สร้างตารางใหม่ · อัลบั้มโผล่ในคลังไฟล์กลางด้วย) · 1 แบรนด์ 1 วัน = 1 อัลบั้ม ชื่อ "SAMPLE <แบรนด์> <วันที่ไทย>"
// ไม่มีระบบ "รอย้าย" แล้ว (เจ้าของสั่ง 2026-11-13 "ไม่ต้องทำเป็นรอ") — รูปอยู่ในอัลบั้มตลอด · ส่งเข้าใบงานแล้วมีป้ายบอกใบงาน
// เทสต์: lib/__tests__/sample-images.test.ts
// ============================================================

import { scoreRow, tokenize } from "@/lib/search-score";

/** ป้ายใน asset_collections.description ที่บอกว่าอัลบั้มนี้เป็นอัลบั้ม SAMPLE (+ ":<brand_id>" = ของแบรนด์นั้น) */
export const SAMPLE_ALBUM_MARK = "sample-images";
/** source ของรูปที่ลงจากหน้านี้ (รูปที่เคยมีในคลังแล้ว = ใช้แถวเดิม source เดิม) */
export const SAMPLE_SOURCE = "sample";
/** ย่อด้านยาวไม่เกินเท่านี้ (เจ้าของเลือก 2026-11-13) · แปลงเป็น JPEG ทุกไฟล์ */
export const SAMPLE_MAX_PX = 2400;
/** ไฟล์ที่เบราว์เซอร์แปลงเป็น JPEG ไม่ได้ (RAW จากกล้อง/ไฟล์งาน) */
export const SAMPLE_UNSUPPORTED_EXT = ["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "psd", "ai", "tif", "tiff"];

export type SampleSheetRef = { id: string; code: string; name: string; brand_id: string | null };
export type SamplePhoto = {
  id: string; r2_key: string; file_name: string;
  width: number | null; height: number | null; created_at: string;
  trashed: boolean;
  /** ใบงานที่รูปนี้ถูกส่งเข้าไปแล้ว (ส่งได้หลายใบ) */
  moved_to: SampleSheetRef[];
  /** ลำดับแบบ "จัดเอง" ในอัลบั้มนี้ (asset_collection_map.sort_order · ไม่มี = ยังไม่จัด → ต่อท้ายตามลำดับที่ลง) */
  sort_order?: number | null;
};
export type SampleBrand = { id: string; name: string; color: string | null; logo_url: string | null };
export type SampleAlbum = {
  id: string; name: string; created_at: string;
  brand_id: string | null;
  /** อัลบั้มที่ยังไม่ระบุแบรนด์ แต่รูปถูกส่งเข้าใบงานของแบรนด์เดียวกันหมด → แบรนด์นั้น (ไว้แนะนำตอนย้ายอัลบั้มเข้าแบรนด์) */
  suggested_brand_id: string | null;
  /** อัลบั้มแม่ (อัลบั้มในอัลบั้ม) · null = ชั้นบนสุด (อัลบั้มของวัน) */
  parent_id: string | null;
  /** รูปของอัลบั้มนี้เอง: photos = ไม่อยู่ถังขยะ · sent = ในนั้นที่ส่งเข้าใบงานแล้ว · trash = ในถังขยะ */
  counts: { photos: number; trash: number; sent: number };
  /** รวมอัลบั้มย่อยทุกชั้น (โชว์บนการ์ด) + จำนวนอัลบั้มย่อยชั้นถัดไป */
  deep: { photos: number; sent: number; sub_count: number };
  /** r2_key รูปบนปกการ์ด (รวมอัลบั้มย่อย · รูปแรก ๆ ที่ไม่อยู่ถังขยะ สูงสุด 4) — components/album-cover */
  preview_keys: string[];
  /** โน้ตของอัลบั้ม (2026-11-16) */
  note?: string | null;
  /** ชื่อที่โชว์ของอัลบั้มของวัน — ชื่อจริงยังเป็น "SAMPLE <แบรนด์> <วันที่>" (ใช้หาอัลบั้มของวันนี้ตอนลงรูป) · ว่าง = โชว์วันที่ */
  display_name?: string | null;
  /** ลำดับแบบ "จัดเอง" ในอัลบั้มแม่ (asset_collections.sort_order) */
  sort_order?: number | null;
  /** เชื่อมสินค้า (2026-11-17): รหัส Parent SKU · รหัส SKU ลูก (ว่าง = ทั้งรุ่น) */
  parent_sku_codes?: string[];
  sku_codes?: string[];
};

/** ป้ายสินค้าที่เชื่อม เช่น "GG-BAG24 · 2 SKU" · ไม่เชื่อม = null */
export function productLinkLabel(a: Pick<SampleAlbum, "parent_sku_codes" | "sku_codes">): string | null {
  const p = a.parent_sku_codes ?? [];
  if (!p.length) return null;
  const n = (a.sku_codes ?? []).length;
  return `${p.join(", ")}${n ? ` · ${n} SKU` : ""}`;
}

/** ยาวสุดของโน้ตอัลบั้ม */
export const SAMPLE_NOTE_MAX = 2000;

/** ชื่ออัลบั้มย่อยสำเร็จรูป "Product 001" — นับต่อจากเลขสูงสุดของแบรนด์เดียวกัน (ทุกวัน · ทุกชั้น) กันเลขซ้ำข้ามอัลบั้ม (เจ้าของเลือก 2026-11-16) */
export function nextProductName(albums: readonly Pick<SampleAlbum, "name" | "brand_id">[], brandId: string | null): string {
  let max = 0;
  for (const a of albums) {
    if ((a.brand_id ?? null) !== (brandId ?? null)) continue;
    const m = /^product\s*#?\s*(\d+)$/i.exec(a.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Product ${String(max + 1).padStart(3, "0")}`;
}

/** ลำดับแบบจัดเอง: มีเลขก่อน (น้อย → มาก) · ไม่มีเลข = ต่อท้าย · เท่ากัน = fallback */
const byManual = (a: { sort_order?: number | null }, b: { sort_order?: number | null }) => {
  const x = a.sort_order ?? null, y = b.sort_order ?? null;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
};

/** ย้ายของในรายการ: เอา ids (ตามลำดับเดิมในรายการ) ไปวางก่อน/หลัง target → รายการ id ใหม่ทั้งชุด · target อยู่ใน ids = ไม่เปลี่ยน */
export function reorderIds(list: readonly string[], ids: readonly string[], target: string, place: "before" | "after"): string[] {
  const moving = list.filter((x) => ids.includes(x));
  if (!moving.length || ids.includes(target) || !list.includes(target)) return [...list];
  const rest = list.filter((x) => !ids.includes(x));
  const at = rest.indexOf(target) + (place === "after" ? 1 : 0);
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** ป้ายของอัลบั้ม: "sample-images" · มีแบรนด์ "sample-images:<brand>" · อัลบั้มย่อย ต่อท้าย "|in:<parent>"
 *  (อัลบั้มในอัลบั้ม เจ้าของสั่ง 2026-11-14 — จดอัลบั้มแม่ในป้ายเดิม ไม่แก้ฐานข้อมูล) */
export const sampleAlbumMark = (brandId: string | null | undefined, parentId?: string | null): string =>
  `${brandId ? `${SAMPLE_ALBUM_MARK}:${brandId}` : SAMPLE_ALBUM_MARK}${parentId ? `|in:${parentId}` : ""}`;

/** ชื่อแบบอัลบั้มของวัน ("SAMPLE [แบรนด์] 15 พ.ย. 2569" = sampleAlbumName) */
export const looksLikeDayAlbumName = (name: string | null | undefined): boolean => /^SAMPLE\s.*\d{4}$/.test(String(name ?? "").trim());

/** อัลบั้มของวัน = ชั้นบนสุด + ชื่อแบบ sampleAlbumName → การ์ดโชว์เป็นวันที่ · ชื่อล็อก (เปลี่ยน/ลบไม่ได้)
 *  อัลบั้มชั้นบนสุดอื่น (Louis Batch สร้างให้ "อัลบั้มใหม่" · อัลบั้มย่อยที่ย้ายขึ้นมา — เจ้าของสั่ง 2026-11-15) = ใช้ชื่อจริง เปลี่ยนชื่อ/ลบตอนว่างได้ */
export function isDayAlbum(a: { name: string; parent_id?: string | null; parentId?: string | null }): boolean {
  return !(a.parent_id ?? a.parentId ?? null) && looksLikeDayAlbumName(a.name);
}

/** อ่านป้ายอัลบั้ม → ไม่ใช่อัลบั้ม SAMPLE = null */
export function parseSampleMark(desc: string | null | undefined): { brandId: string | null; parentId: string | null } | null {
  if (typeof desc !== "string") return null;
  const [head, ...rest] = desc.split("|in:");
  const parentId = rest.join("|in:").trim() || null;
  if (head === SAMPLE_ALBUM_MARK) return { brandId: null, parentId };
  if (head.startsWith(`${SAMPLE_ALBUM_MARK}:`)) return { brandId: head.slice(SAMPLE_ALBUM_MARK.length + 1).trim() || null, parentId };
  return null;
}

// ── อัลบั้มในอัลบั้ม (ต้นไม้) ──
type TreeNode = { id: string; parent_id: string | null };

/** อัลบั้มแม่จริง (แม่หาย/ไม่อยู่ในรายการ = ถือเป็นอัลบั้มชั้นบนสุด) */
export function parentOf<T extends TreeNode>(albums: readonly T[], id: string): string | null {
  const a = albums.find((x) => x.id === id);
  return a?.parent_id && albums.some((x) => x.id === a.parent_id) ? a.parent_id : null;
}

/** เส้นทางจากชั้นบนสุดถึงอัลบั้มนี้ (รวมตัวเอง) · กันวนซ้ำ */
export function albumPath<T extends TreeNode>(albums: readonly T[], id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = albums.some((x) => x.id === id) ? id : null;
  while (cur && !seen.has(cur)) { seen.add(cur); out.unshift(cur); cur = parentOf(albums, cur); }
  return out;
}

/** อัลบั้มย่อยทุกชั้นของอัลบั้มนี้ (ไม่รวมตัวเอง) */
export function descendantIds<T extends TreeNode>(albums: readonly T[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const a of albums) if (a.parent_id === cur && a.id !== id && !out.includes(a.id)) { out.push(a.id); stack.push(a.id); }
  }
  return out;
}

/** ย้ายอัลบั้มเข้าอัลบั้มนี้ได้ไหม (ห้ามเข้าตัวเอง/อัลบั้มลูกของตัวเอง · null = ขึ้นไปชั้นบนสุด) */
export function canMoveAlbum<T extends TreeNode>(albums: readonly T[], id: string, toParent: string | null): boolean {
  if (!albums.some((a) => a.id === id)) return false;
  if (toParent === null) return true;
  if (toParent === id || !albums.some((a) => a.id === toParent)) return false;
  return !descendantIds(albums, id).includes(toParent);
}

/** รวมจำนวนรูป/ส่งแล้ว/รูปปก ของอัลบั้มนี้ + อัลบั้มย่อยทุกชั้น (ไว้โชว์บนการ์ด) */
export function rollupAlbum(
  albums: readonly TreeNode[],
  photosByAlbum: ReadonlyMap<string, readonly Pick<SamplePhoto, "trashed" | "moved_to" | "r2_key" | "created_at">[]>,
  id: string,
): { photos: number; sent: number; preview_keys: string[]; sub_count: number } {
  const ids = [id, ...descendantIds(albums, id)];
  const all = ids.flatMap((x) => [...(photosByAlbum.get(x) ?? [])]);
  const c = sampleCounts(all);
  return { photos: c.photos, sent: c.sent, preview_keys: albumPreviewKeys(all), sub_count: albums.filter((a) => a.parent_id === id).length };
}

/** วันที่แบบไทย (เวลาไทย) เช่น "13 พ.ย. 2569" */
export function thaiShortDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** ชื่ออัลบั้ม เช่น "SAMPLE Good Goods 13 พ.ย. 2569" (ไม่ระบุแบรนด์ = "SAMPLE 13 พ.ย. 2569") — ใช้หาอัลบั้มเดิมของแบรนด์+วันเดียวกัน */
export function sampleAlbumName(d: Date, brandName?: string | null): string {
  const b = (brandName ?? "").trim();
  return `SAMPLE ${b ? `${b} ` : ""}${thaiShortDate(d)}`;
}

export function sampleCounts(photos: readonly Pick<SamplePhoto, "trashed" | "moved_to">[]): { photos: number; trash: number; sent: number } {
  let trash = 0, sent = 0;
  for (const p of photos) { if (p.trashed) trash++; else if (p.moved_to.length) sent++; }
  return { photos: photos.length - trash, trash, sent };
}

/** รูปบนปกอัลบั้ม: รูปที่ไม่อยู่ถังขยะ ตามลำดับที่จัดเอง (รูปแรก = ปก) แล้วตามเวลาลง (เก่าก่อน = รูปแรกของการถ่าย) สูงสุด max รูป */
export function albumPreviewKeys(photos: readonly (Pick<SamplePhoto, "trashed" | "r2_key" | "created_at"> & { sort_order?: number | null })[], max = 4): string[] {
  return photos.filter((p) => !p.trashed && p.r2_key).sort((a, b) => byManual(a, b) || a.created_at.localeCompare(b.created_at)).slice(0, max).map((p) => p.r2_key);
}

/** แบรนด์ที่ควรเป็นของอัลบั้มที่ยังไม่ระบุแบรนด์: รูปที่ส่งเข้าใบงานแล้วไปอยู่ใบงานแบรนด์เดียวกันหมด → แบรนด์นั้น · ไม่มี/หลายแบรนด์ = null */
export function inferAlbumBrand(photos: readonly Pick<SamplePhoto, "trashed" | "moved_to">[]): string | null {
  const ids = new Set<string>();
  for (const p of photos) if (!p.trashed) for (const s of p.moved_to) if (s.brand_id) ids.add(s.brand_id);
  return ids.size === 1 ? [...ids][0] : null;
}

/** รูปที่เลือกไว้ ที่ยังไม่อยู่ในใบงานนี้ (ส่งซ้ำใบเดิม = ข้าม กันแนบรูปเดียวกันสองครั้ง) */
export function photosToMove(photos: readonly Pick<SamplePhoto, "id" | "moved_to">[], ids: Iterable<string>, sheetId: string): string[] {
  const want = new Set(ids);
  return photos.filter((p) => want.has(p.id) && !p.moved_to.some((s) => s.id === sheetId)).map((p) => p.id);
}

// ── หน้าตาที่ใช้ร่วมกัน: หน้า SAMPLE Images + แท็บ SAMPLE Images ในตัวเลือกไฟล์กลาง (components/sample-images/parts) ──

/** แท็บแบรนด์: "all" = ทุกแบรนด์ · "none" = ไม่ระบุแบรนด์ · อื่น ๆ = id แบรนด์ */
export const SAMPLE_TAB_ALL = "all";
export const SAMPLE_TAB_NONE = "none";

/** อัลบั้มนี้อยู่ในแท็บแบรนด์นี้ไหม */
export function inBrandTab(a: Pick<SampleAlbum, "brand_id">, tab: string): boolean {
  return tab === SAMPLE_TAB_ALL || (tab === SAMPLE_TAB_NONE ? !a.brand_id : a.brand_id === tab);
}

type Labelled = Pick<SampleAlbum, "name" | "created_at" | "parent_id"> & { display_name?: string | null };

/** ชื่อบนการ์ดหน้าแฟ้ม: อัลบั้มของวัน = ชื่อที่โชว์ (ถ้าตั้งไว้) ไม่งั้นวันที่ ("13 พ.ย. 2569") · ตั้งชื่อเอง = ชื่อจริง */
export function albumCardLabel(a: Labelled): string {
  return isDayAlbum(a) ? (a.display_name?.trim() || thaiShortDate(new Date(a.created_at))) : a.name;
}

/** ชื่อเต็ม (เส้นทาง/ข้อความแจ้ง): อัลบั้มของวัน = "แบรนด์ · ชื่อที่โชว์/วันที่" · ตั้งชื่อเอง = ชื่อจริง */
export function albumFullName(a: Labelled, brandName?: string | null): string {
  return isDayAlbum(a) ? `${brandName ? `${brandName} · ` : ""}${albumCardLabel(a)}` : a.name;
}

/** จำนวนรูปรวมต่อแบรนด์ (ตัวเลขบนแถบแบรนด์ · นับทุกชั้น) — ไม่ระบุแบรนด์ = key "none" */
export function brandPhotoTotals(albums: readonly Pick<SampleAlbum, "brand_id" | "counts">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of albums) { const k = a.brand_id ?? SAMPLE_TAB_NONE; m.set(k, (m.get(k) ?? 0) + a.counts.photos); }
  return m;
}

// ── ค้นหา + เรียง (เจ้าของสั่ง 2026-11-15 "ขอ search, sort ด้วย") — ใช้ทั้งหน้า SAMPLE และแท็บในตัวเลือกไฟล์กลาง ──
// ค้นด้วยตัวจับคู่กลาง lib/search-score (แตกคำ · ทุกคำต้องเจอ · ข้ามตัวคั่นได้) แล้วเรียงตามที่เลือก

export type SampleAlbumSort = "manual" | "newest" | "oldest" | "name" | "most";
export const SAMPLE_ALBUM_SORTS: { key: SampleAlbumSort; th: string; en: string }[] = [
  { key: "manual", th: "จัดเอง (ลากสลับ)", en: "Custom (drag)" },
  { key: "newest", th: "ล่าสุดก่อน", en: "Newest first" },
  { key: "oldest", th: "เก่าสุดก่อน", en: "Oldest first" },
  { key: "name", th: "ชื่อ ก–ฮ / A–Z", en: "Name A–Z" },
  { key: "most", th: "รูปมากสุดก่อน", en: "Most photos" },
];
export type SamplePhotoSort = "manual" | "oldest" | "newest" | "name";
export const SAMPLE_PHOTO_SORTS: { key: SamplePhotoSort; th: string; en: string }[] = [
  { key: "manual", th: "จัดเอง (ลากสลับ · รูปแรก = ปก)", en: "Custom (drag · first = cover)" },
  { key: "oldest", th: "ตามลำดับที่ลง (เก่า → ใหม่)", en: "Order added (old → new)" },
  { key: "newest", th: "ใหม่สุดก่อน", en: "Newest first" },
  { key: "name", th: "ชื่อไฟล์", en: "File name" },
];
export const isAlbumSort = (v: unknown): v is SampleAlbumSort => SAMPLE_ALBUM_SORTS.some((s) => s.key === v);
export const isPhotoSort = (v: unknown): v is SamplePhotoSort => SAMPLE_PHOTO_SORTS.some((s) => s.key === v);

const byText = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true, sensitivity: "base" });
const newestFirst = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);

/** เรียงอัลบั้ม: ล่าสุด/เก่าสุด (วันที่สร้าง) · ชื่อบนการ์ด · รูปมากสุด (รวมอัลบั้มย่อย) — เท่ากันเรียงล่าสุดก่อน */
export function sortAlbums<T extends Pick<SampleAlbum, "name" | "created_at" | "parent_id" | "deep"> & { sort_order?: number | null; display_name?: string | null }>(albums: readonly T[], sort: SampleAlbumSort): T[] {
  const out = [...albums];
  // จัดเอง: ตามเลขที่จัด · เท่ากัน/ยังไม่จัด → อัลบั้มย่อย = ตามลำดับที่สร้าง (Product 001, 002, 003 เรียงต่อกัน) · หน้าแฟ้มชั้นบนสุด = ล่าสุดก่อนเหมือนเดิม
  if (sort === "manual") return out.sort((a, b) => byManual(a, b) || (a.parent_id || b.parent_id ? a.created_at.localeCompare(b.created_at) : newestFirst(a, b)));
  if (sort === "oldest") return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (sort === "name") return out.sort((a, b) => byText(albumCardLabel(a), albumCardLabel(b)) || newestFirst(a, b));
  if (sort === "most") return out.sort((a, b) => b.deep.photos - a.deep.photos || newestFirst(a, b));
  return out.sort(newestFirst);
}

/** เรียงรูป: ตามลำดับที่ลง (ค่าเดิม — รูปแรกของการถ่ายก่อน) · ใหม่สุดก่อน · ชื่อไฟล์ (3M2A9 ก่อน 3M2A10) */
export function sortPhotos<T extends Pick<SamplePhoto, "created_at" | "file_name"> & { sort_order?: number | null }>(photos: readonly T[], sort: SamplePhotoSort): T[] {
  const out = [...photos];
  if (sort === "manual") return out.sort((a, b) => byManual(a, b) || a.created_at.localeCompare(b.created_at) || a.file_name.localeCompare(b.file_name));
  if (sort === "newest") return out.sort((a, b) => newestFirst(a, b) || byText(a.file_name, b.file_name));
  if (sort === "name") return out.sort((a, b) => byText(a.file_name, b.file_name) || a.created_at.localeCompare(b.created_at));
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.file_name.localeCompare(b.file_name));
}

/** อัลบั้มตรงคำค้นไหม — ค้นจากชื่อจริง ("SAMPLE Good Goods 15 พ.ย. 2569" / "2026-11-15-002") · ชื่อบนการ์ด · ชื่อแบรนด์
 *  · วันที่สร้างอัลบั้มแบบไทย (เวลาไทย) — ค้น "15 พ.ย." เจอทุกอัลบั้มของวันนั้น รวมอัลบั้มที่ตั้งชื่อเอง (เจ้าของสั่ง 2026-11-15) · คำค้นว่าง = ตรงทุกอัน */
export function albumMatches(a: Labelled & { note?: string | null; parent_sku_codes?: string[]; sku_codes?: string[] }, query: string, brandName?: string | null): boolean {
  const q = query.trim(), toks = tokenize(q);
  if (!toks.length) return true;   // ว่าง / มีแต่เครื่องหมาย = ไม่กรอง
  // ค้นด้วยรหัส Parent SKU / SKU ลูกที่เชื่อมได้ด้วย (ข้อเสนอ 3 · 2026-11-17)
  return scoreRow(q, toks, { texts: [a.name, albumCardLabel(a), thaiShortDate(new Date(a.created_at)), brandName, a.note, ...(a.parent_sku_codes ?? []), ...(a.sku_codes ?? [])] }) > 0;
}

/** รูปตรงคำค้นไหม — ชื่อไฟล์ · เลข/ชื่อใบงานที่รูปถูกส่งเข้าไป (DS-2026-0008) · คำค้นว่าง = ตรงทุกรูป */
export function photoMatches(p: Pick<SamplePhoto, "file_name" | "moved_to">, query: string): boolean {
  const q = query.trim(), toks = tokenize(q);
  if (!toks.length) return true;   // ว่าง / มีแต่เครื่องหมาย = ไม่กรอง
  return scoreRow(q, toks, { texts: [p.file_name, ...p.moved_to.flatMap((s) => [s.code, s.name])] }) > 0;
}

/** การ์ดหน้าแฟ้ม: ไม่ค้น = อัลบั้มชั้นบนสุดของแท็บแบรนด์ · ค้น = อัลบั้มทุกชั้นที่ตรง + บอกว่าอยู่ในอัลบั้มไหน (inside) — เรียงตามที่เลือก */
export function browseAlbums<T extends SampleAlbum>(
  albums: readonly T[], tab: string, query: string, sort: SampleAlbumSort, brandName: (id: string | null) => string | null | undefined,
): { album: T; inside: string | null }[] {
  const q = query.trim();
  const tree = albums.map((a) => ({ id: a.id, parent_id: a.parent_id }));
  const pool = albums.filter((a) => inBrandTab(a, tab) && (q ? albumMatches(a, q, brandName(a.brand_id)) : !a.parent_id));
  return sortAlbums(pool, sort).map((a) => {
    if (!q || !a.parent_id) return { album: a, inside: null };
    const names = albumPath(tree, a.id).slice(0, -1).map((id) => albums.find((x) => x.id === id)).filter((x): x is T => !!x).map((x) => albumFullName(x, brandName(x.brand_id)));
    return { album: a, inside: names.join(" › ") || null };
  });
}

/** แยกไฟล์ที่ลากมา: รูปที่ลงได้ · ไฟล์ที่แปลงไม่ได้ (RAW/ไฟล์งาน) · ไม่ใช่รูป */
export function splitSampleFiles<F extends { name: string; type: string }>(files: readonly F[]): { ok: F[]; unsupported: F[]; notImage: F[] } {
  const ok: F[] = [], unsupported: F[] = [], notImage: F[] = [];
  for (const f of files) {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (SAMPLE_UNSUPPORTED_EXT.includes(ext)) unsupported.push(f);
    else if (f.type.startsWith("image/") || ext === "heic" || ext === "heif") ok.push(f);
    else notImage.push(f);
  }
  return { ok, unsupported, notImage };
}
