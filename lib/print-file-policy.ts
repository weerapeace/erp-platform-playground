/**
 * 🖨 กฎกลาง: ไฟล์งานพิมพ์ (PDF / EPS / AI ที่ใช้สั่งพิมพ์) เก็บใน Google Drive เท่านั้น — ห้ามลง R2 (เจ้าของกำหนด 2026-10-27)
 *
 * ใช้กับ "หมวดงานพิมพ์" เท่านั้น:
 *   - คลังไฟล์ assets.source='print' (เพิ่มงานพิมพ์ / แทนที่ไฟล์บนการ์ด) → ไฟล์ใน R2 ได้แค่ "รูปตัวอย่าง" PNG/JPG/WebP
 *   - งานจัดเรียง: ส่งเข้าคลังงานพิมพ์ (รูปการ์ด) + คลัง PNG ลายต้นฉบับ (nesting-prints/) → ต้องเป็นรูปจริง
 * ไม่เกี่ยวกับ PDF อื่น (ใบเสนอราคา / ไฟล์แนบ / คลังไฟล์หมวดอื่น) — ยังเก็บ R2 ตามเดิม
 *
 * ตรวจทั้งชื่อ/ชนิดไฟล์ (หน้าเว็บ บอกผู้ใช้ทันที) และเนื้อไฟล์ (เซิร์ฟเวอร์ — กันเปลี่ยนนามสกุลหลบ)
 * ไม่มี import ฝั่งเซิร์ฟเวอร์ → ใช้ได้ทั้งหน้าเว็บและ API · คู่มือ: docs/print-files-drive-only.md
 */

export type ImageKind = "png" | "jpeg" | "webp";
type Msg = { th: string; en: string };

/** นามสกุลไฟล์สั่งพิมพ์ที่ต้องอยู่ Drive เท่านั้น */
export const PRINT_FILE_EXTS = ["pdf", "eps", "ai", "ps"] as const;
const PREVIEW_EXTS: Record<string, ImageKind> = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp" };
const PREVIEW_TYPES: Record<string, ImageKind> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };

export const PRINT_DRIVE_ONLY: Msg = {
  th: "ไฟล์งานพิมพ์ (PDF/EPS/AI) ต้องเก็บใน Google Drive เท่านั้น — ใส่ในช่อง \"ไฟล์พิมพ์\" (ขึ้น Drive) หรือส่งจากหน้าจัดเรียง · ช่องนี้รับเฉพาะรูปตัวอย่าง PNG/JPG/WebP",
  en: "Print files (PDF/EPS/AI) must be stored in Google Drive only — add them under \"Print files\" (goes to Drive) or send from the nesting page · this slot takes preview images only (PNG/JPG/WebP)",
};
export const PRINT_PREVIEW_ONLY: Msg = {
  th: "งานพิมพ์รับเฉพาะรูปตัวอย่าง PNG/JPG/WebP",
  en: "Print jobs accept preview images only (PNG/JPG/WebP)",
};

export const PRINT_SOURCE_PNG_ONLY: Msg = {
  th: "คลังลายต้นฉบับเก็บเฉพาะไฟล์ PNG — ไฟล์งานพิมพ์ (PDF/EPS) ต้องเก็บใน Google Drive",
  en: "The artwork library stores PNG files only — print files (PDF/EPS) must be stored in Google Drive",
};

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();

/** เป็นไฟล์สั่งพิมพ์ (PDF/EPS/AI) ไหม — ดูจากชื่อ/ชนิด */
export function isPrintFileName(name: string, type = ""): boolean {
  return (PRINT_FILE_EXTS as readonly string[]).includes(extOf(name)) || /pdf|postscript|illustrator/i.test(type);
}

/** ชนิดรูปจากเนื้อไฟล์ (ไบต์แรก ๆ) — ไม่ใช่รูปที่รับ = null */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

/** เนื้อไฟล์เป็น PDF/PostScript (EPS, AI รุ่นเก่า) ไหม */
function sniffPrintFile(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  return head === "%PDF" || head === "%!PS" || (bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6);   // EPS แบบมีรูปย่อ
}

/**
 * ไฟล์นี้ลงเป็นรูปตัวอย่างงานพิมพ์ใน R2 ได้ไหม — ได้ = null · ไม่ได้ = ข้อความบอกผู้ใช้
 * หน้าเว็บส่งแค่ชื่อ/ชนิด · เซิร์ฟเวอร์ส่ง bytes (ไบต์แรก ๆ พอ) มาด้วยเสมอ
 */
export function printPreviewProblem(name: string, type: string, bytes?: Uint8Array): Msg | null {
  if (isPrintFileName(name, type) || (bytes && sniffPrintFile(bytes))) return PRINT_DRIVE_ONLY;
  if (bytes) return sniffImage(bytes) ? null : PRINT_PREVIEW_ONLY;
  return PREVIEW_TYPES[type.toLowerCase()] || (!type && PREVIEW_EXTS[extOf(name)]) ? null : PRINT_PREVIEW_ONLY;
}

/** สำหรับคลัง PNG ลายต้นฉบับ (nesting-prints/) — ต้องเป็น PNG จริง */
export function isPngBytes(bytes: Uint8Array): boolean {
  return sniffImage(bytes) === "png";
}
