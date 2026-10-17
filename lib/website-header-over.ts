/**
 * 🪟 Header โปร่งใสตอนอยู่บนสุด — ตั้งรายประเภทหน้า (ERP ธีม → แท็บ Header · เว็บร้าน Navbar)
 *
 * แต่ละประเภทหน้า: เปิด/ปิด + สีตัวหนังสือตอนโปร่งใส (ขาว = บนรูปมืด · เข้ม = บนรูปสว่าง/พื้นหน้าเว็บ)
 * เว็บร้าน: หน้าที่ขึ้นต้นด้วยรูปเต็มจอ (data-hdr-under) → หัวลอยทับรูป · หน้าอื่น → ไม่มีพื้นแต่ไม่ทับเนื้อหา
 * เลื่อนลง → พื้นสีปกติ (ติดบนสุดถ้าตั้ง "ตรึงแถบเมนู")
 * ค่าเก่า header.overHero (หน้าแรกอย่างเดียว) = ค่าเริ่มของแถว "หน้าแรก" · ยังเขียน overHero = แถวหน้าแรก ให้เว็บรุ่นเก่าอ่านได้
 * ⚠️ pure — mirror ไปเว็บร้าน src/lib/header-over.ts (คัดลอกตั้งแต่บรรทัด export แรก)
 */

export type OverPageKind = "home" | "product" | "listing" | "new" | "custom" | "other";
export type OverText = "light" | "dark";
export interface OverRule {
  on: boolean;
  text: OverText;
}
export type OverPages = Record<OverPageKind, OverRule>;

/** ประเภทหน้า (ลำดับ = แถวในตาราง ERP) */
export const OVER_PAGE_KINDS: { key: OverPageKind; label: string; hint: string }[] = [
  { key: "home", label: "หน้าแรก", hint: "/" },
  { key: "product", label: "หน้าสินค้า", hint: "ทับรูปเมื่อเป็นแบบโชว์เคส + รูปชิดบน (ไม่มีชื่อ/breadcrumb ด้านบน)" },
  { key: "listing", label: "หน้ารวมสินค้า / หมวด / คอลเลกชัน", hint: "/shop · /c/… · /collection/… (คอลเลกชันที่มีแบนเนอร์ = ทับรูป)" },
  { key: "new", label: "หน้ามาใหม่", hint: "/new" },
  { key: "custom", label: "หน้าที่สร้างเอง", hint: "หน้าจากแท็บ 📄 หน้าเว็บ" },
  { key: "other", label: "หน้าอื่น ๆ", hint: "ตะกร้า · ชำระเงิน · ติดตามพัสดุ · บัญชี · ติดต่อ ฯลฯ" },
];

export const OVER_TEXT_LABEL: Record<OverText, string> = { light: "⚪ ขาว", dark: "⚫ เข้ม" };

/** สีตัวหนังสือเริ่มต้น: หน้าแรก/หน้าที่สร้างเอง มักเริ่มด้วยแบนเนอร์มืด = ขาว · ที่เหลือ = เข้ม */
const DEFAULT_TEXT: Record<OverPageKind, OverText> = { home: "light", product: "dark", listing: "dark", new: "dark", custom: "light", other: "dark" };

export function defaultOverPages(overHero = false): OverPages {
  const out = {} as OverPages;
  for (const { key } of OVER_PAGE_KINDS) out[key] = { on: key === "home" && overHero, text: DEFAULT_TEXT[key] };
  return out;
}

/** ค่าดิบจาก theme.header.overPages → ครบทุกประเภท · ไม่มีค่า = ตาม overHero เดิม (หน้าแรกอย่างเดียว) */
export function normalizeOverPages(raw: unknown, overHero = false): OverPages {
  const out = defaultOverPages(overHero);
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const { key } of OVER_PAGE_KINDS) {
    const v = r[key];
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    out[key] = { on: o.on === true, text: o.text === "light" || o.text === "dark" ? o.text : out[key].text };
  }
  return out;
}

/** หน้าที่เว็บร้านมีเอง (ไม่ใช่หน้าที่สร้างเอง) — ส่วนแรกของ path */
const BUILTIN_OTHER = new Set(["about", "account", "belt-builder", "canvas-edit", "cart", "checkout", "contact", "gallery", "materials", "oem", "privacy", "quote", "track"]);

/** path (ตัด /en ออกแล้ว) → ประเภทหน้า */
export function overPageKind(pathname: string): OverPageKind {
  const seg = (pathname || "/").split(/[?#]/)[0].split("/").filter(Boolean);
  if (!seg.length) return "home";
  const s = seg[0].toLowerCase();
  if (s === "product") return "product";
  if (s === "shop" || s === "c" || s === "collection") return "listing";
  if (s === "new") return "new";
  if (BUILTIN_OTHER.has(s) || seg.length > 1) return "other";
  return "custom";
}
