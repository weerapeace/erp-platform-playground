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
