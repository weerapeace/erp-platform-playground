// ============================================================
// sample-images — ตรรกะล้วนของหน้า "SAMPLE Images" (อัลบั้มรูปตัวอย่าง ประจำแบรนด์ · ส่งรูปเข้าใบงานใน Design Dashboard ได้)
//
// รูปเก็บในคลังไฟล์กลาง (assets · source "sample" · brand_id = แบรนด์ของอัลบั้ม)
// อัลบั้ม = asset_collections ที่ description = "sample-images" (ยังไม่ระบุแบรนด์) หรือ "sample-images:<brand_id>"
//   (ไม่สร้างตารางใหม่ · อัลบั้มโผล่ในคลังไฟล์กลางด้วย) · 1 แบรนด์ 1 วัน = 1 อัลบั้ม ชื่อ "SAMPLE <แบรนด์> <วันที่ไทย>"
// ไม่มีระบบ "รอย้าย" แล้ว (เจ้าของสั่ง 2026-11-13 "ไม่ต้องทำเป็นรอ") — รูปอยู่ในอัลบั้มตลอด · ส่งเข้าใบงานแล้วมีป้ายบอกใบงาน
// เทสต์: lib/__tests__/sample-images.test.ts
// ============================================================

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
};
export type SampleBrand = { id: string; name: string; color: string | null; logo_url: string | null };
export type SampleAlbum = {
  id: string; name: string; created_at: string;
  brand_id: string | null;
  /** อัลบั้มที่ยังไม่ระบุแบรนด์ แต่รูปถูกส่งเข้าใบงานของแบรนด์เดียวกันหมด → แบรนด์นั้น (ไว้แนะนำตอนย้ายอัลบั้มเข้าแบรนด์) */
  suggested_brand_id: string | null;
  /** photos = รูปที่ไม่อยู่ถังขยะ · sent = ในนั้นที่ส่งเข้าใบงานแล้ว · trash = ในถังขยะ */
  counts: { photos: number; trash: number; sent: number };
  /** r2_key รูปบนปกการ์ด (รูปแรก ๆ ที่ไม่อยู่ถังขยะ สูงสุด 4) — components/album-cover */
  preview_keys: string[];
};

/** ป้ายของอัลบั้ม: ไม่มีแบรนด์ = "sample-images" · มีแบรนด์ = "sample-images:<id>" */
export const sampleAlbumMark = (brandId: string | null | undefined): string => (brandId ? `${SAMPLE_ALBUM_MARK}:${brandId}` : SAMPLE_ALBUM_MARK);

/** อ่านป้ายอัลบั้ม → ไม่ใช่อัลบั้ม SAMPLE = null */
export function parseSampleMark(desc: string | null | undefined): { brandId: string | null } | null {
  if (desc === SAMPLE_ALBUM_MARK) return { brandId: null };
  if (typeof desc === "string" && desc.startsWith(`${SAMPLE_ALBUM_MARK}:`)) {
    const id = desc.slice(SAMPLE_ALBUM_MARK.length + 1).trim();
    return id ? { brandId: id } : { brandId: null };
  }
  return null;
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

/** รูปบนปกอัลบั้ม: รูปที่ไม่อยู่ถังขยะ เรียงตามเวลาลง (เก่าก่อน = รูปแรกของการถ่าย) สูงสุด max รูป */
export function albumPreviewKeys(photos: readonly Pick<SamplePhoto, "trashed" | "r2_key" | "created_at">[], max = 4): string[] {
  return photos.filter((p) => !p.trashed && p.r2_key).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, max).map((p) => p.r2_key);
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
