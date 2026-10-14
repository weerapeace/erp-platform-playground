/**
 * ของกลาง — ลิงก์ไปหน้าต่าง ๆ บนเว็บร้าน (ใช้ร่วม: API สินค้าสาธารณะ + ตัวเลือก "กดแล้วไปที่")
 * ⚠️ รูปแบบ URL ต้องตรงกับ route ของเว็บร้าน: /product/<slug> · /shop?cat=<key> · /<หน้าที่สร้างเอง> · #s-<blockId>
 */

/** slug ของหน้าสินค้า จากรหัสรุ่น (parent code) */
export const productSlug = (code: string): string =>
  code.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || code;

export const productHref = (code: string) => `/product/${productSlug(code)}`;
export const categoryHref = (key: string) => `/shop?cat=${encodeURIComponent(key)}`;
/** เลื่อนไปยัง Section ในหน้าเดียวกัน (เว็บร้านใส่ id="s-<blockId>" ให้ทุก Section) */
export const sectionHref = (blockId: string) => `#s-${blockId}`;

/** หน้าหลักที่เว็บร้านทุกร้านมี */
export const BASE_PAGES: { href: string; label: string }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/shop", label: "สินค้าทั้งหมด" },
  { href: "/contact", label: "ติดต่อเรา" },
  { href: "/track", label: "ติดตามออเดอร์" },
];
