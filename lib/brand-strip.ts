// แถบสีแบรนด์ (ของกลาง) — กติกาสีของแถบซ้ายการ์ด ใช้ร่วมทุกบอร์ด (Design Dashboard + บอร์ดงาน /tasks)
// สีมาจาก brands.color (ตั้งที่ /master/brands) · สีอ่อนมาก (เช่นเหลือง) จะถูกทำให้เข้มขึ้นเอง ไม่งั้นเส้นบาง ๆ บนพื้นขาวมองไม่เห็น
// ตัววาดแถบ = components/brand-strip · docs/brand-strip.md

/** สีสำรองเมื่อแบรนด์ยังไม่ตั้งสี / ไม่ระบุแบรนด์ (เทา) */
export const BRAND_STRIP_FALLBACK = "#94a3b8";

/** ความสว่างที่ถือว่า "อ่อนเกินไป" สำหรับเส้นบนพื้นขาว (0 = ดำ · 1 = ขาว) */
const TOO_LIGHT = 0.6;
/** ทำให้เข้มขึ้นเท่าไร (คูณค่าสี) เมื่ออ่อนเกินไป */
const DARKEN = 0.7;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** ความสว่างแบบที่ตาคนเห็น (relative luminance ตาม WCAG) */
export function hexLuminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * สีที่ใช้วาดแถบ: สีแบรนด์ที่ถูกต้อง (#rrggbb) → ใช้ได้เลย (ถ้าอ่อนเกินไปจะเข้มขึ้นให้)
 * ไม่มีสี / รูปแบบผิด → ใช้ `fallback` (ค่าเริ่มต้น = เทา) · ส่ง fallback = null เพื่อ "ไม่วาดแถบ"
 */
export function brandStripColor(color: string | null | undefined, fallback: string | null = BRAND_STRIP_FALLBACK): string | null {
  if (!color || !HEX6.test(color)) return fallback;
  if (hexLuminance(color) < TOO_LIGHT) return color.toLowerCase();
  const dark = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * DARKEN).toString(16).padStart(2, "0"));
  return `#${dark.join("")}`;
}
