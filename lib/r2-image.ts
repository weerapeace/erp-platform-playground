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
  // รูปที่อยู่บน Google Drive (คีย์ drive:<fileId> — ไม่มีสำเนาใน R2) → ย่อผ่าน /api/drive/thumb
  if (key.startsWith("drive:")) return `/api/drive/thumb?id=${encodeURIComponent(key.slice(6))}&w=${Math.round(w && w > 0 ? w : 2000)}`;
  const base = `/api/r2-image?key=${encodeURIComponent(key)}`;
  return w && w > 0 ? `${base}&w=${Math.round(w)}` : base;
}

/** URL รูป avatar (ของกลาง): URL เต็ม (http) → คืนเลย · R2 key → proxy + ย่อ (?w=) */
export function avatarSrc(v: string | null | undefined, w?: number): string | null {
  if (!v) return null;
  return v.startsWith("http") ? v : r2ImageUrl(v, w);
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

/* ─────────────────────────────────────────────────────────────────────────
 * 🖼 "อ่านรูปกลับ" (วาดลง canvas แล้วอ่านจุดภาพ / ส่งออกเป็นไฟล์) — docs/image-worker.md
 * รูป /api/r2-image ที่เบราว์เซอร์โหลดมาแสดงถูกส่งต่อไปตัวเสิร์ฟรูป erp-img (คนละโดเมน)
 * → โค้ดเราเอง: new Image() แล้วใส่ img.crossOrigin = "anonymous" ก็พอ
 * → ไลบรารีที่โหลดรูปเอง (ใส่ crossOrigin ให้ไม่ได้ เช่น กระดานวาด): ใช้ fetchR2Blob → blob: URL
 * → ไลบรารีที่รองรับข้ามโดเมนเมื่อเห็นว่า URL เป็นโดเมนอื่น (เช่น html2canvas useCORS): ใช้ r2ReadableUrl
 * ───────────────────────────────────────────────────────────────────────── */

/** โดเมนตัวเสิร์ฟรูป erp-img ("" = ปิดอยู่ → รูปมาจากโดเมน ERP เอง ไม่ต้องทำอะไร) */
export const IMG_READ_BASE = (process.env.NEXT_PUBLIC_IMG_WORKER_URL ?? "").trim().replace(/\/+$/, "");

/** ส่วน path ของ URL รูป proxy ("/api/r2-image?...") — รับทั้งแบบย่อและแบบเต็มโดเมน ERP · ไม่ใช่รูป proxy = null */
export function r2ImagePath(url: string | null | undefined, origin: string = typeof window !== "undefined" ? window.location.origin : ""): string | null {
  if (!url) return null;
  if (url.startsWith("/api/r2-image?")) return url;
  if (origin && url.startsWith(`${origin}/api/r2-image?`)) return url.slice(origin.length);
  return null;
}

/** URL รูปที่ชี้ตรงไปตัวเสิร์ฟรูป (ตอบ Access-Control-Allow-Origin: *) — ไม่ใช่รูป proxy / ตัวเสิร์ฟรูปปิดอยู่ = คืนค่าเดิม */
export function r2ReadableUrl(url: string, origin?: string, base: string = IMG_READ_BASE): string {
  const path = r2ImagePath(url, origin);
  return path && base ? `${base}${path}` : url;
}

/** ดึงรูป proxy มาเป็นก้อนข้อมูล (ไม่ผ่าน Vercel ถ้าตัวเสิร์ฟรูปเปิดอยู่) — เอาไปทำ blob: URL ให้ไลบรารีที่ต้องอ่านรูปกลับ */
export async function fetchR2Blob(url: string): Promise<Blob> {
  const direct = r2ReadableUrl(url);
  if (direct !== url) {
    try {
      const r = await fetch(direct, { mode: "cors", credentials: "omit" });
      if (r.ok) return await r.blob();
    } catch { /* ตัวเสิร์ฟรูปล่ม → ลองผ่านแอป */ }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`โหลดรูปไม่ได้ (${r.status})`);
  return await r.blob();
}
