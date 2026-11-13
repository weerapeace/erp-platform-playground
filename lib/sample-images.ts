// ============================================================
// sample-images — ตรรกะล้วนของหน้า "SAMPLE Images" (ลงรูปตัวอย่างที่รอเอาไปใส่ใบงานใน Design Dashboard)
//
// รูปเก็บในคลังไฟล์กลาง (assets · source "sample") · อัลบั้ม = asset_collections ที่ description = SAMPLE_ALBUM_MARK
//   (ไม่สร้างตารางใหม่ · อัลบั้มโผล่ในคลังไฟล์กลางด้วย) · 1 วัน = 1 อัลบั้ม ชื่อตามวันที่ลง (เวลาไทย)
// สถานะรูป (คิดสด ไม่เก็บ): ถังขยะ = assets.status trashed · ย้ายแล้ว = มีใบงานที่แนบรูปนี้อยู่ (erp_playground_attachments
//   entity design_sheet · file_path = r2_key) · นอกนั้น = รอย้าย
// เทสต์: lib/__tests__/sample-images.test.ts
// ============================================================

/** ป้ายใน asset_collections.description ที่บอกว่าอัลบั้มนี้เป็นอัลบั้ม SAMPLE */
export const SAMPLE_ALBUM_MARK = "sample-images";
/** source ของรูปที่ลงจากหน้านี้ (รูปที่เคยมีในคลังแล้ว = ใช้แถวเดิม source เดิม) */
export const SAMPLE_SOURCE = "sample";
/** ย่อด้านยาวไม่เกินเท่านี้ (เจ้าของเลือก 2026-11-13) · แปลงเป็น JPEG ทุกไฟล์ */
export const SAMPLE_MAX_PX = 2400;
/** ไฟล์ที่เบราว์เซอร์แปลงเป็น JPEG ไม่ได้ (RAW จากกล้อง/ไฟล์งาน) */
export const SAMPLE_UNSUPPORTED_EXT = ["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "psd", "ai", "tif", "tiff"];

export type SampleStatus = "wait" | "moved" | "trash";
export type SampleSheetRef = { id: string; code: string; name: string };
export type SamplePhoto = {
  id: string; r2_key: string; file_name: string;
  width: number | null; height: number | null; created_at: string;
  status: SampleStatus;
  /** ใบงานที่รูปนี้อยู่ (ย้ายได้หลายใบ) */
  moved_to: SampleSheetRef[];
};
export type SampleAlbum = { id: string; name: string; created_at: string; counts: Record<SampleStatus, number> };

/** วันที่แบบไทย (เวลาไทย) เช่น "13 พ.ย. 2569" */
export function thaiShortDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** ชื่ออัลบั้มของวันนั้น เช่น "SAMPLE 13 พ.ย. 2569" — ใช้หาอัลบั้มเดิมของวันเดียวกัน (โยนหลายรอบในวันเดียว = อัลบั้มเดียว) */
export function sampleAlbumName(d: Date): string {
  return `SAMPLE ${thaiShortDate(d)}`;
}

/** สถานะรูป: ถังขยะ > ย้ายแล้ว > รอย้าย */
export function sampleStatusOf(assetStatus: string | null | undefined, movedTo: readonly unknown[]): SampleStatus {
  if (assetStatus === "trashed") return "trash";
  return movedTo.length ? "moved" : "wait";
}

export function sampleCounts(photos: readonly Pick<SamplePhoto, "status">[]): Record<SampleStatus, number> {
  const c: Record<SampleStatus, number> = { wait: 0, moved: 0, trash: 0 };
  for (const p of photos) c[p.status]++;
  return c;
}

/** รูปที่เลือกไว้ ที่ยังไม่อยู่ในใบงานนี้ (ย้ายซ้ำใบเดิม = ข้าม กันแนบรูปเดียวกันสองครั้ง) */
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
