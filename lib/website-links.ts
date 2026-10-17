/**
 * ของกลาง — ลิงก์ไปหน้าต่าง ๆ บนเว็บร้าน (ใช้ร่วม: API สินค้าสาธารณะ + ตัวเลือก "กดแล้วไปที่")
 * ⚠️ รูปแบบ URL ต้องตรงกับ route ของเว็บร้าน: /product/<slug> · /c/<key> (หน้าหมวด · ลิงก์เก่า /shop?cat= ยังใช้ได้) · /<หน้าที่สร้างเอง> · #s-<blockId>
 */

/** slug ของหน้าสินค้า จากรหัสรุ่น (parent code) */
export const productSlug = (code: string): string =>
  code.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || code;

export const productHref = (code: string) => `/product/${productSlug(code)}`;

/** โดเมนร้าน (shop_domains.domain) → https://… · ว่าง = null */
export const siteUrlFromDomain = (domain: string | null | undefined): string | null => {
  const d = (domain ?? "").trim().replace(/\/+$/, "");
  return d ? (/^https?:\/\//.test(d) ? d : `https://${d}`) : null;
};
/** ลิงก์เต็มหน้าสินค้าบนเว็บร้าน (ร้านยังไม่มีโดเมน = null) */
export const productPageUrl = (siteUrl: string | null, code: string): string | null =>
  siteUrl && code ? `${siteUrl}${productHref(code)}` : null;
export const categoryHref = (key: string) => `/c/${encodeURIComponent(key)}`;

/** ลิงก์นี้เป็นหน้าหมวดไหม → รหัสหมวด (รู้จักทั้ง /c/<key> แบบใหม่ และ /shop?cat=<key> แบบเก่า) · ไม่ใช่ = null */
export function categoryKeyOf(href: string): string | null {
  const m = /^\/c\/([^/?#]+)/.exec(href) ?? /^\/shop\?cat=([^&#]+)/.exec(href);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
/** เลื่อนไปยัง Section ในหน้าเดียวกัน (เว็บร้านใส่ id="s-<blockId>" ให้ทุก Section) */
export const sectionHref = (blockId: string) => `#s-${blockId}`;

/** หน้าหลักที่เว็บร้านทุกร้านมี */
export const BASE_PAGES: { href: string; label: string }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/shop", label: "สินค้าทั้งหมด" },
  { href: "/new", label: "🆕 มาใหม่ (ชุดมาใหม่ · แท็บ 🆕 มาใหม่)" },
  { href: "/contact", label: "ติดต่อเรา" },
  { href: "/track", label: "ติดตามออเดอร์" },
];
