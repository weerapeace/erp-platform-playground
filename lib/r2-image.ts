/**
 * ของกลาง — URL รูปผ่าน proxy /api/r2-image + ขอ "ย่อขนาด" (?w=)
 *
 * ตัว proxy จะย่อรูปให้ (เป็น webp) เมื่อมี ?w= และคืน "รูปเดิม" ถ้าย่อไม่ได้
 * (เช่นรันบน Cloudflare ที่ไม่มี sharp) → ปลอดภัยทุกที่
 *
 * ทำไมต้องย่อ: การ์ด/thumbnail โชว์รูปเล็ก แต่ไฟล์จริงใหญ่ (0.5–2MB)
 * → โหลด + ถอดรหัสหนัก = หน้ากระตุก. ใส่ w ให้ใกล้ขนาดที่โชว์ (×DPR)
 * → ไฟล์เล็กลงหลายเท่า ลื่นขึ้น
 */

/** สร้าง URL รูปจาก R2 key (ใส่ w เพื่อขอรูปย่อ) */
export function r2ImageUrl(key: string | null | undefined, w?: number): string | null {
  if (!key) return null;
  const base = `/api/r2-image?key=${encodeURIComponent(key)}`;
  return w && w > 0 ? `${base}&w=${Math.round(w)}` : base;
}

/**
 * เติม &w= ให้ URL รูป proxy ที่ "ยังไม่ได้ระบุขนาด" — ใช้ในคอมโพเนนต์รูปกลาง
 * ถ้าไม่ใช่ URL ของ /api/r2-image หรือมี w อยู่แล้ว → คืนค่าเดิม (ไม่ยุ่ง)
 */
export function withImageWidth(url: string | null | undefined, w: number): string | null {
  if (!url) return url ?? null;
  if (!url.startsWith("/api/r2-image?")) return url;
  if (/[?&]w=/.test(url)) return url;
  return `${url}&w=${Math.round(w)}`;
}
