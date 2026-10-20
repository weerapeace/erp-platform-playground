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
/**
 * ลิงก์หน้าหมวด /c/<หมวด> · also = "ต้องอยู่ในหมวดนี้ด้วย" (เฉพาะสินค้าที่อยู่ทั้ง 2 หมวด) → /c/<หมวด>?also=<หมวด2>
 * เว็บร้านอ่าน ?also= ที่หน้า /c/<หมวด> (ShopView) — ต้องตรงกัน
 */
export const categoryHref = (key: string, also?: string | null) =>
  `/c/${encodeURIComponent(key)}${also && also !== key ? `?also=${encodeURIComponent(also)}` : ""}`;

/** หมวดที่ 2 ของลิงก์หมวด (?also=) — ไม่มี = "" */
export function categoryAlsoOf(href: string): string {
  const m = /^\/c\/[^?#]+\?(?:[^#]*&)?also=([^&#]+)/.exec(href);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

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
  { href: "/new/latest", label: "🆕 มาใหม่ — ชุดล่าสุด (เปลี่ยนเองเมื่อมีชุดใหม่)" },
  { href: "/new/soon", label: "🆕 มาใหม่ — ชุดที่กำลังจะเปิด" },
  { href: "/contact", label: "ติดต่อเรา" },
  { href: "/track", label: "ติดตามออเดอร์" },
];

/**
 * 🆕 ลิงก์หน้ามาใหม่ (เว็บร้าน app/new + app/new/[drop]) — ใช้ร่วม ตัวจัดเมนู (kind "new") + ตัวเลือก "กดแล้วไปที่"
 *   value: "" = /new (ทุกชุด) · "latest" = ชุดล่าสุดที่เปิดแล้ว · "soon" = ชุดที่กำลังจะเปิด · <id ชุด> = ชุดนั้น
 */
export const NEW_DROP_LINKS: { value: string; label: string }[] = [
  { value: "", label: "หน้ามาใหม่ทั้งหมด (ทุกชุด)" },
  { value: "latest", label: "⭐ ชุดล่าสุด (เปลี่ยนเองเมื่อมีชุดใหม่)" },
  { value: "soon", label: "⏳ ชุดที่กำลังจะเปิด (นับถอยหลัง)" },
];
export const newDropHref = (value: string) => (value ? `/new/${encodeURIComponent(value)}` : "/new");
