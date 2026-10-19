/**
 * ⬆ เพดาน/ชนิดไฟล์ของการอัปโหลดรูป/วิดีโอ (pure · ใช้ได้ทั้งหน้าจอและ API)
 *   หน้าจอ: lib/media-upload.ts · API: /api/website/video-upload (ลิงก์ส่งไฟล์ใหญ่ตรงเข้า R2)
 */

/** ไฟล์ขนาดนี้ลงไปส่งผ่าน ERP ได้เลย (เพดาน request ของ Vercel ~4.5 MB) */
export const SMALL_UPLOAD_BYTES = 4 * 1024 * 1024;
/** เพดานไฟล์ใหญ่ที่ส่งตรงเข้า R2 (คลิปยาวกว่านี้ใช้ลิงก์ YouTube/Vimeo) */
export const BIG_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const BIG_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/** ชนิดที่ส่งตรงเข้า R2 ได้ → นามสกุลไฟล์ (GIF/PDF ไม่อยู่ในนี้ = ใช้ทางเดิม ≤ 4 MB) */
export const BIG_UPLOAD_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** โฟลเดอร์ใน R2 ที่ลิงก์ส่งไฟล์ใหญ่ใช้ได้ (ไม่อยู่ในนี้ = storefront-videos / storefront-images) */
export const BIG_UPLOAD_FOLDERS = ["storefront-videos", "storefront-hero", "storefront-drops", "storefront-images"];

/** เพดานขนาดของไฟล์ชนิดนี้ */
export function uploadMaxBytes(type: string): number {
  if (!BIG_UPLOAD_EXT[type]) return SMALL_UPLOAD_BYTES;
  return type.startsWith("video/") ? BIG_VIDEO_MAX_BYTES : BIG_IMAGE_MAX_BYTES;
}

export const fileMb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

const EXT_TYPE: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
};

/** เดาชนิดจากนามสกุล ("" = ไม่รู้จัก) — ใช้เมื่อเบราว์เซอร์ไม่บอกชนิดไฟล์ */
export function typeFromName(name: string): string {
  const ext = /\.([a-z0-9]+)\s*$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? "";
}

/**
 * ชนิดจริงจาก "หัวไฟล์" (16 ไบต์แรก) — "" = ไม่รู้
 * เหตุผล: บางเครื่องเบราว์เซอร์ส่งไฟล์ MP4 มาโดยไม่บอกชนิด (type ว่าง) → ระบบเคยนึกว่าเป็นรูป ตัดที่ 4 MB
 */
export function sniffMediaType(b: Uint8Array): string {
  const s = (i: number, n: number) => String.fromCharCode(...Array.from(b.subarray(i, i + n)));
  if (b.length >= 12 && s(4, 4) === "ftyp") {
    // MP4 ตระกูลเดียวกันใช้หัว ftyp — แยกด้วย brand: รูป HEIC/AVIF · เสียง M4A · QuickTime
    const brand = s(8, 4);
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) return "image/heic";
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "M4A ") return "audio/mp4";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && s(1, 3) === "PNG") return "image/png";
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
  if (s(0, 4) === "GIF8") return "image/gif";
  return "";
}

/** ชนิดที่ใช้จริง: หัวไฟล์ > ชนิดที่เบราว์เซอร์บอก > นามสกุล */
export function resolveMediaType(browserType: string, sniffed: string, name: string): string {
  if (sniffed) return sniffed;
  if (browserType && browserType !== "application/octet-stream") return browserType;
  return typeFromName(name) || browserType;
}
