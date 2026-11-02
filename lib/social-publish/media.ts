// ============================================================
// URL ไฟล์ที่ "แพลตฟอร์มโซเชียลดึงไปโพสต์" (ฝั่งเซิร์ฟเวอร์) — ของกลางของตัวยิงโพสต์ทุกแพลตฟอร์ม
// เซิร์ฟเวอร์ของ Meta/YouTube/... ต้องโหลดไฟล์ได้ตรง ๆ โดยไม่ต้องล็อกอิน
//  - วิดีโอใน R2      → /api/r2-image (stream ทั้งไฟล์)
//  - วิดีโอบน Drive    → /api/drive-video/<id> (stream ต่อจาก Drive ไม่ก็อปลง R2)
//  - รูป (R2 / Drive) → /api/post-image (แปลงเป็น JPEG ≤2048px — IG รับ JPEG เท่านั้น) · มี fit = เติมขอบ/ครอปให้พอดี (lib/social-publish/fit)
// คีย์ที่ขึ้นต้น drive: = ไฟล์ที่อยู่บน Google Drive (ไม่มีสำเนาในระบบ)
// ============================================================
import { baseUrl } from "@/app/api/meta/shared";
import { fitQuery, type FitSpec } from "./fit";

// fallback = รูปย่อใน R2 ของรูปเดียวกัน — ใช้เมื่อ key เป็นต้นฉบับบน Drive แล้วเปิด/แปลงไม่ได้ (เช่น HEIC)
export type PostMedia = { key: string; type: string; fit?: FitSpec | null; fallback?: string | null };

export const isDriveKey = (k: string): boolean => k.startsWith("drive:");

export function platformMediaUrl(m: PostMedia): string {
  if (m.type === "video") {
    return isDriveKey(m.key)
      ? `${baseUrl()}/api/drive-video/${encodeURIComponent(m.key.slice(6))}`
      : `${baseUrl()}/api/r2-image?key=${encodeURIComponent(m.key)}`;
  }
  return `${baseUrl()}/api/post-image?k=${encodeURIComponent(m.key)}${m.fit ? `&${fitQuery(m.fit)}` : ""}${m.fallback ? `&fb=${encodeURIComponent(m.fallback)}` : ""}`;
}
