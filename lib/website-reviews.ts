/**
 * ⭐ รีวิวสินค้าเว็บร้าน — กฎล้วน (ไม่แตะ DB · ใช้ได้ทั้งเซิร์ฟเวอร์และหน้าจอ · ทดสอบได้)
 * ตาราง store_reviews (migration 202610291300) · ฝั่ง DB: lib/website-reviews-server.ts · ลิงก์รีวิว: lib/review-token.ts
 *
 * กติกา:
 * - 1 รีวิว = 1 รุ่น (parent_code) · ซื้อจริง (ผูกออเดอร์ที่ส่งแล้ว/สำเร็จ) = verified · 1 ออเดอร์รีวิวรุ่นเดิมได้ครั้งเดียว
 * - ขึ้นเว็บเฉพาะ approved · อนุมัติอัตโนมัติได้เฉพาะ "ซื้อจริง + 4–5 ดาว" เมื่อร้านเปิด reviews_auto_approve
 * - แต้ม: สมาชิกที่ซื้อจริง ได้ครั้งเดียวต่อรีวิวเมื่ออนุมัติ (reviews_points + reviews_photo_points ถ้ามีรูป) · ร้านต้องเปิดระบบแต้ม
 */
export type ReviewStatus = "pending" | "approved" | "hidden";

export const REVIEW_STATUSES: { key: ReviewStatus; label: string; tone: string }[] = [
  { key: "pending", label: "รอตรวจ", tone: "bg-amber-100 text-amber-800" },
  { key: "approved", label: "ขึ้นเว็บแล้ว", tone: "bg-emerald-100 text-emerald-800" },
  { key: "hidden", label: "ซ่อนอยู่", tone: "bg-slate-200 text-slate-700" },
];

export const REVIEW_MAX_IMAGES = 4;
export const REVIEW_MAX_BYTES = 6 * 1024 * 1024;
export const REVIEW_BODY_MAX = 2000;
/** ออเดอร์สถานะนี้ถึงรีวิวได้ (ของถึงมือแล้ว/น่าจะถึง) */
export const REVIEWABLE_ORDER_STATUSES = ["shipped", "completed"] as const;

export interface RatingSummary {
  avg: number;
  count: number;
  /** จำนวนรีวิวแต่ละดาว [1★, 2★, 3★, 4★, 5★] */
  dist: [number, number, number, number, number];
}

export function summarize(ratings: number[]): RatingSummary {
  const dist: RatingSummary["dist"] = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  for (const r of ratings) {
    const n = Math.round(Number(r));
    if (n < 1 || n > 5) continue;
    dist[n - 1] += 1;
    sum += n;
    count += 1;
  }
  return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count, dist };
}

/** ชื่อที่โชว์บนเว็บ: ชื่อแรก + อักษรแรกของนามสกุล ("สมชาย ใจดี" → "สมชาย ใ.") · อีเมล/เบอร์ = ไม่โชว์ · ว่าง = "ลูกค้า" */
export function publicAuthor(name: string | null | undefined, lang: "th" | "en" = "th"): string {
  const s = String(name ?? "").trim().replace(/\s+/g, " ");
  const fallback = lang === "en" ? "Customer" : "ลูกค้า";
  if (!s || /@|\d{6,}/.test(s)) return fallback;
  const [first, second] = s.split(" ");
  return (second ? `${first} ${Array.from(second)[0]}.` : first).slice(0, 40);
}

export interface ReviewEntryInput {
  code: string;
  rating: number;
  body: string;
}

/** รับค่าจากหน้าเว็บอย่างปลอดภัย — ผิด = null (ข้ามบรรทัดนั้น) */
export function cleanEntry(raw: unknown): ReviewEntryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = String(r.code ?? "").trim().toUpperCase().slice(0, 80);
  const rating = Math.round(Number(r.rating));
  if (!code || !(rating >= 1 && rating <= 5)) return null;
  // ตัวอักษรควบคุม/แท็ก HTML ทิ้ง (เว็บโชว์เป็นข้อความล้วนอยู่แล้ว แต่ไม่เก็บขยะ)
  // eslint-disable-next-line no-control-regex
  const body = String(r.body ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/<[^>]*>/g, "").trim().slice(0, REVIEW_BODY_MAX);
  return { code, rating, body };
}

export function cleanAuthor(v: unknown): string {
  return String(v ?? "").replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " ").slice(0, 60);
}

interface ReviewSettings {
  reviews_auto_approve: boolean;
  reviews_points: number;
  reviews_photo_points: number;
  points_enabled: boolean;
}

export function autoApprove(info: Pick<ReviewSettings, "reviews_auto_approve">, verified: boolean, rating: number): boolean {
  return info.reviews_auto_approve && verified && rating >= 4;
}

/** แต้มที่รีวิวนี้ควรได้ (0 = ไม่ได้) — ต้องเป็นสมาชิก + ซื้อจริง */
export function reviewPoints(info: ReviewSettings, r: { customerId: string | null; verified: boolean; images: number }): number {
  if (!info.points_enabled || !r.customerId || !r.verified) return 0;
  const base = Math.max(0, Math.round(info.reviews_points || 0));
  const photo = r.images > 0 ? Math.max(0, Math.round(info.reviews_photo_points || 0)) : 0;
  return base + photo;
}

/** แถวที่ส่งให้เว็บร้าน (ไม่มีข้อมูลส่วนตัว: ไม่มีเลขออเดอร์/เบอร์/รหัสลูกค้า) */
export interface PublicReview {
  id: string;
  rating: number;
  body: string;
  author: string;
  /** r2 key */
  images: string[];
  verified: boolean;
  variant: string | null;
  reply: string | null;
  createdAt: string;
}
