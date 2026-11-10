// ============================================================
// กติกา pure ของตัวเสิร์ฟรูป erp-img (ไม่แตะ R2/เน็ต — เทสต์ได้: workers/img/src/__tests__/rules.test.ts)
// ต้องตรงกับ /api/r2-image ของแอป (app/api/r2-image/route.ts) — ช่องที่รับ: key, w, q, sq, pad, meta, m
// ============================================================

/** ชื่อไฟล์ที่รับ: ตัวอักษร/ตัวเลข . _ / - เท่านั้น · ห้ามมีท่อน "." หรือ ".." (ทะลุ bucket) — เหมือน isSafeR2Key ในแอป */
const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
export function isSafeKey(key: string | null | undefined): key is string {
  return !!key && key.length <= 900 && SAFE_KEY.test(key) && !key.startsWith("/") && !key.split("/").some((s) => s === "." || s === "..");
}

/** ชุดรูปกลาง imgset/<uuid> — รูปปัจจุบันของชุดอยู่ในฐานข้อมูล → ส่งต่อให้แอปตัดสิน (lib/website-image-sets IMGSET_RE) */
export const IMGSET_RE = /^imgset\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VIDEO_TYPE: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
const EXT_TYPE: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  avif: "image/avif", heic: "image/heic", pdf: "application/pdf", ...VIDEO_TYPE,
};
/** ชนิดไฟล์: จาก metadata ใน R2 ก่อน · ไม่มี = เดาจากนามสกุล · ไม่รู้ = image/jpeg (เหมือนแอป) */
export function contentTypeOf(key: string, meta?: string | null): string {
  if (meta) return meta;
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? "image/jpeg";
}

/** ขอย่อ/แปลงรูปไหม (ตามกติกาแอป) — คืนพารามิเตอร์ที่ "ปรับให้เป็นแบบเดียว" แล้ว (กันรูปย่อซ้ำหลายชุดเพราะเขียนต่างกัน) */
export type Transform = { w: number; q: number; sq: boolean; pad34: boolean };
export function transformOf(sp: URLSearchParams): Transform | null {
  const w = Math.round(Number(sp.get("w") || 0));
  if (!(w > 0 && w <= 3200)) return null;
  const qRaw = Number(sp.get("q") || 0);
  const q = qRaw >= 50 && qRaw <= 92 ? Math.round(qRaw) : 75;
  const sq = sp.get("sq") === "1";
  const pad34 = !sq && sp.get("pad") === "34";
  return { w, q, sq, pad34 };
}

/** ชนิดที่แอปไม่ย่อ (ส่งตัวเต็ม): GIF (จะเหลือเฟรมเดียว) · SVG · ไม่ใช่รูป */
export function canTransform(contentType: string): boolean {
  return contentType.startsWith("image/") && contentType !== "image/svg+xml" && contentType !== "image/gif";
}

/** ที่เก็บรูปที่ย่อแล้วใน R2 — ผูก etag ของไฟล์ต้นฉบับ: ต้นฉบับเปลี่ยน = ชื่อใหม่ = ย่อใหม่เอง (ไม่ค้างรูปเก่า) */
export function variantKey(key: string, etag: string, t: Transform): string {
  const tag = String(etag).replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "0";
  return `_variants/${key}/${tag}/w${t.w}-q${t.q}${t.sq ? "-sq" : ""}${t.pad34 ? "-pad34" : ""}`;
}

/** query ที่ส่งไปให้แอปย่อ (เฉพาะช่องที่แอปรู้จัก) */
export function originQuery(key: string, t: Transform): string {
  const q = new URLSearchParams({ key, w: String(t.w), q: String(t.q) });
  if (t.sq) q.set("sq", "1");
  if (t.pad34) q.set("pad", "34");
  return q.toString();
}

/** ไฟล์ที่เบราว์เซอร์ "รันได้" ถ้าเปิดตรง ๆ → ห้ามรันสคริปต์ (เหมือนแอป) */
const ACTIVE_TYPE = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/x-javascript)\b/i;

/** หัวมาตรฐานของรูปที่ส่งออก: เบราว์เซอร์เก็บ 1 วัน · ใช้ข้ามโดเมนได้ (เว็บร้าน/canvas) · ห้ามเดาชนิด */
export function imageHeaders(contentType: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    ...(ACTIVE_TYPE.test(contentType) ? { "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" } : {}),
    ...extra,
  };
}
