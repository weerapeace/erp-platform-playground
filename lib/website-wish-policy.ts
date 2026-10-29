/**
 * 📜 นโยบายจัดส่ง & คืนสินค้า + ♡ รายการโปรด — ค่าที่ตั้งในแท็บดีไซน์ → หน้าสินค้า (theme.product.policy / theme.product.wish) · pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/wish-policy.ts — แก้ที่นี่แล้วคัดลอก (คงหัวไฟล์ฝั่งนั้นไว้)
 * ค่าเริ่มต้น = หน้าตาเดิมทุกอย่าง (ไม่มีบรรทัดคืนสินค้า · ไม่มีลิงก์นโยบาย · หัวใจเฉพาะสมาชิก กรอบสี่เหลี่ยมข้างปุ่ม)
 */

/* ───────── 📜 นโยบาย ───────── */
/** เปิดหน้านโยบายแบบ: แผงเลื่อนจากขวา · ป๊อปกลางจอ · ไปหน้าเต็ม */
export type PolicyOpen = "drawer" | "modal" | "page";
export interface ProductPolicy {
  /** บรรทัด "เปลี่ยน/คืนได้ภายใน N วัน" ต่อท้ายการจัดส่ง (N = ข้อมูลร้าน › การคืนสินค้า) — ใช้ทั้งหัวข้อในรายละเอียดและข้อความใต้ปุ่ม */
  returnsLine: boolean;
  /** ลิงก์ "อ่านนโยบาย…" ท้ายหัวข้อการจัดส่งในรายละเอียดสินค้า */
  link: boolean;
  /** slug หน้านโยบายการจัดส่ง/คืนสินค้า · ว่าง = หาเอง (POLICY_SLUGS.shipping) */
  page: string;
  open: PolicyOpen;
  /** ข้อความลิงก์ · ว่าง = POLICY_TEXT.link */
  linkText: string;
  /** ลิงก์เดียวกันท้ายลิ้นชักตะกร้า */
  cart: boolean;
}
export const DEFAULT_POLICY: ProductPolicy = { returnsLine: false, link: false, page: "", open: "drawer", linkText: "", cart: false };

export type PolicyKind = "shipping" | "terms" | "privacy";
/** slug ที่ใช้หาเองเมื่อไม่ได้เลือกหน้า (เรียงตามที่ลองก่อน) — ชุดศูนย์ช่วยเหลือของ ERP สร้าง shipping-returns / terms / privacy */
export const POLICY_SLUGS: Record<PolicyKind, string[]> = {
  shipping: ["shipping-returns", "returns", "shipping", "shipping-and-returns", "return-policy"],
  terms: ["terms", "terms-of-service", "terms-and-conditions"],
  privacy: ["privacy", "privacy-policy"],
};
export const POLICY_TEXT = {
  link: { th: "อ่านนโยบายการจัดส่งและคืนสินค้า", en: "Read our shipping and returns policy" },
  returns: { th: "เปลี่ยน/คืนได้ภายใน {n} วันหลังได้รับสินค้า", en: "Exchanges and returns within {n} days of delivery" },
  shipping: { th: "การจัดส่งและคืนสินค้า", en: "Shipping and returns" },
  terms: { th: "ข้อกำหนดการสั่งซื้อ", en: "Terms of sale" },
  privacy: { th: "ความเป็นส่วนตัว", en: "Privacy" },
} as const;

/** บรรทัดคืนสินค้า (0 / ไม่ได้ตั้ง = ไม่มีบรรทัด) */
export function returnsLineText(days: number, lang: "th" | "en"): string {
  const n = Math.round(Number(days) || 0);
  return n > 0 ? POLICY_TEXT.returns[lang].replace("{n}", String(n)) : "";
}

/* ───────── ♡ รายการโปรด ───────── */
/** members = เฉพาะสมาชิก (เดิม · ร้านไม่เปิดสมาชิก = ไม่มีหัวใจ) · guest = ทุกคน ไม่ต้องสมัคร (เก็บในเครื่อง · สมาชิกล็อกอิน = เก็บในบัญชี) · off = ปิดหัวใจทั้งเว็บ */
export type WishMode = "members" | "guest" | "off";
/** หน้าสินค้า: ข้างปุ่มใส่ตะกร้า (เดิม) · ข้อความใต้ปุ่ม · มุมรูปสินค้า */
export type WishPos = "button" | "below" | "image";
/** หัวใจข้างปุ่ม: กรอบสี่เหลี่ยม (เดิม) · ไอคอนเปล่า · ปุ่มไอคอน + คำ */
export type WishStyle = "outline" | "icon" | "text";
/** การ์ดสินค้า: โชว์ตอนชี้ (เดิม · จอสัมผัสโชว์ตลอด) · โชว์ตลอด · ไม่โชว์ */
export type WishCard = "hover" | "always" | "off";
export interface ProductWish {
  mode: WishMode;
  pos: WishPos;
  style: WishStyle;
  /** มือถือ: หัวใจในแถบใส่ตะกร้าลอยล่างจอ (เดิม = มี) */
  mobileBar: boolean;
  card: WishCard;
}
export const DEFAULT_WISH: ProductWish = { mode: "members", pos: "button", style: "outline", mobileBar: true, card: "hover" };

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const slug = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "").slice(0, 80) : "");

export function normalizePolicy(raw: unknown): ProductPolicy {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_POLICY;
  return {
    returnsLine: bool(r.returnsLine, d.returnsLine),
    link: bool(r.link, d.link),
    page: slug(r.page),
    open: pick(r.open, ["drawer", "modal", "page"] as const, d.open),
    linkText: typeof r.linkText === "string" ? r.linkText.trim().slice(0, 80) : "",
    cart: bool(r.cart, d.cart),
  };
}

export function normalizeWish(raw: unknown): ProductWish {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_WISH;
  return {
    mode: pick(r.mode, ["members", "guest", "off"] as const, d.mode),
    pos: pick(r.pos, ["button", "below", "image"] as const, d.pos),
    style: pick(r.style, ["outline", "icon", "text"] as const, d.style),
    mobileBar: bool(r.mobileBar, d.mobileBar),
    card: pick(r.card, ["hover", "always", "off"] as const, d.card),
  };
}

/** หัวใจเปิดอยู่ไหม — members ต้องให้ร้านเปิดระบบสมาชิก · guest เปิดเสมอ · off ปิด */
export const wishEnabled = (w: ProductWish, memberOn: boolean): boolean => (w.mode === "guest" ? true : w.mode === "members" ? memberOn : false);
