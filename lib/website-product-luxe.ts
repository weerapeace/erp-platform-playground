/**
 * 🏛 ค่าปรับหน้าตาของหน้าสินค้า Style จากเว็บแบรนด์หรู (stack / columns / story) — theme.product.luxe
 * มิเรอร์ที่เว็บร้าน src/lib/product-luxe.ts (แก้คู่กัน) · ตัววาด src/components/shop/ProductLuxe.tsx
 * ค่าเริ่ม = หน้าตาที่ขึ้นเว็บรอบแรก (2026-10-21) · "auto" = ตามแบบของ Style นั้น
 * ข้อความ (craft.eyebrow / craft.title / trust.items[].text) แปลอังกฤษได้ผ่านกฎ <key>_en ของธีม (THEME_TEXT_KEYS)
 */

export type LuxeGap = "auto" | "none" | "sm" | "md" | "lg";
export type LuxeMediaHeight = "auto" | "screen" | "tall" | "ratio";
export type LuxeHeroHeight = "screen" | "tall" | "md";
export type LuxeHeroPos = "bottom-left" | "bottom-center" | "center" | "top-left";
export type LuxeCraftBg = "ink" | "brand" | "brandDeep" | "surface" | "page" | "custom";

export interface LuxeTrustItem {
  id: string;
  /** "i:<ไอคอนเส้น>" · "img:<รูป>" · อีโมจิ/สัญลักษณ์ (ค่าเดิม) — รูปแบบเดียวกับชุดไอคอนกลาง (ERP lib/website-icons ↔ เว็บร้าน site-icons) */
  icon: string;
  text: string;
}

export interface ProductLuxe {
  /** ชุดรูป (ภาพเรียงลง / 3 คอลัมน์): 1 = ทีละรูป · 2 = รูปแรกใหญ่ แล้ว 2 รูปต่อแถว (แบบ Loewe/Celine) */
  gridCols: 1 | 2;
  /** % ความกว้างฝั่งรูป — ภาพเรียงลง: คอลัมน์รูปทั้งหมด (45–70) · 3 คอลัมน์: คอลัมน์กลาง (36–56) · 0 = ตามแบบ */
  mediaWidth: number;
  /** ช่องห่างระหว่างรูป */
  gap: LuxeGap;
  /** ความสูงรูปแต่ละรูป: เต็มจอ / 80% ของจอ / ตามสัดส่วน 4:5 */
  mediaHeight: LuxeMediaHeight;
  /** 🎬 รูปเต็มจอ (ภาพเต็มจอ + เรื่องราว) */
  heroHeight: LuxeHeroHeight;
  heroPos: LuxeHeroPos;
  heroText: "light" | "dark";
  /** ความมืดทับรูปตรงข้อความ (%) */
  heroShade: number;
  /** 🧵 แถบงานคราฟต์ */
  craft: { show: boolean; bg: LuxeCraftBg; hex: string; side: "left" | "right"; eyebrow: string; title: string };
  /** ✔ แถวความมั่นใจใต้ปุ่มซื้อ (ค่าเริ่มปิด — ร้านต้องใส่ข้อความที่จริงของร้านเอง) */
  trust: { show: boolean; items: LuxeTrustItem[] };
}

export const LUXE_TRUST_MAX = 4;

export const DEFAULT_PRODUCT_LUXE: ProductLuxe = {
  gridCols: 1,
  mediaWidth: 0,
  gap: "auto",
  mediaHeight: "auto",
  heroHeight: "screen",
  heroPos: "bottom-left",
  heroText: "light",
  heroShade: 40,
  craft: { show: true, bg: "ink", hex: "", side: "left", eyebrow: "", title: "" },
  trust: {
    show: false,
    items: [
      { id: "t1", icon: "i:truck", text: "ส่งฟรีทั่วประเทศ" },
      { id: "t2", icon: "i:arrow-back-up", text: "เปลี่ยน/คืนได้ใน 14 วัน" },
      { id: "t3", icon: "i:badge-check", text: "หนังแท้ 100%" },
      { id: "t4", icon: "i:map-pin", text: "ผลิตในไทย" },
    ],
  },
};

/** ช่วงที่ปรับได้ของ % ฝั่งรูป ต่อ Style */
export const LUXE_MEDIA_WIDTH: Record<"stack" | "columns", { min: number; max: number; auto: number }> = {
  stack: { min: 45, max: 70, auto: 59 },
  columns: { min: 36, max: 56, auto: 48 },
};

/** ตัวเลือก (ป้ายภาษาคน) — แท็บหน้าสินค้าในตั้งค่าดีไซน์ */
export const LUXE_CHOICES = {
  gridCols: [
    { value: 1, label: "ทีละรูป เรียงลงมา" },
    { value: 2, label: "รูปแรกใหญ่ แล้ว 2 รูปต่อแถว (แบบ Loewe / Celine)" },
  ] as { value: 1 | 2; label: string }[],
  gap: [
    { value: "auto", label: "ตามแบบ (ภาพเรียงลง = ติดกัน · 3 คอลัมน์ = ห่างนิด)" },
    { value: "none", label: "ติดกัน" },
    { value: "sm", label: "ห่างนิด" },
    { value: "md", label: "ห่างปกติ" },
    { value: "lg", label: "ห่างมาก" },
  ] as { value: LuxeGap; label: string }[],
  mediaHeight: [
    { value: "auto", label: "ตามแบบ (ภาพเรียงลง = เต็มจอ · 3 คอลัมน์ = 4:5)" },
    { value: "screen", label: "เต็มความสูงจอ" },
    { value: "tall", label: "80% ของจอ" },
    { value: "ratio", label: "ตามสัดส่วน 4:5" },
  ] as { value: LuxeMediaHeight; label: string }[],
  heroHeight: [
    { value: "screen", label: "เต็มจอ" },
    { value: "tall", label: "80% ของจอ" },
    { value: "md", label: "60% ของจอ" },
  ] as { value: LuxeHeroHeight; label: string }[],
  heroPos: [
    { value: "bottom-left", label: "ซ้ายล่าง" },
    { value: "bottom-center", label: "กลางล่าง" },
    { value: "center", label: "กลางรูป" },
    { value: "top-left", label: "ซ้ายบน" },
  ] as { value: LuxeHeroPos; label: string }[],
  heroText: [
    { value: "light", label: "ขาว (รูปโทนเข้ม/กลาง)" },
    { value: "dark", label: "เข้ม (รูปโทนสว่าง)" },
  ] as { value: "light" | "dark"; label: string }[],
  craftBg: [
    { value: "ink", label: "สีตัวอักษรหลัก (เข้ม)" },
    { value: "brand", label: "สีแบรนด์" },
    { value: "brandDeep", label: "สีแบรนด์เข้ม" },
    { value: "surface", label: "สีพื้นการ์ด (สว่าง)" },
    { value: "page", label: "สีพื้นเว็บ (สว่าง)" },
    { value: "custom", label: "สีเอง…" },
  ] as { value: LuxeCraftBg; label: string }[],
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const pick = <T extends string>(v: unknown, ok: readonly T[], fb: T): T => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : fb);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
/** ไอคอน — กฎเดียวกับ cleanSiteIcon (ไฟล์นี้ห้าม import): i:<key> / img:<r2 key> เก็บเต็ม · อีโมจิ ≤ 8 ตัว (ค่าเดิมโชว์เหมือนเดิม) */
const iconOf = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^i:[a-z0-9-]{1,40}$/.test(s)) return s;
  if (s.startsWith("img:")) return /^[\w\-./%()]{1,200}$/.test(s.slice(4)) ? s : "";
  return s.startsWith("i:") ? "" : s.slice(0, 8);
};

export function normalizeProductLuxe(raw: unknown): ProductLuxe {
  const d = DEFAULT_PRODUCT_LUXE;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (r.craft && typeof r.craft === "object" ? r.craft : {}) as Record<string, unknown>;
  const tr = (r.trust && typeof r.trust === "object" ? r.trust : {}) as Record<string, unknown>;
  const mw = Math.round(Number(r.mediaWidth));
  const shade = Math.round(Number(r.heroShade));
  const items = Array.isArray(tr.items)
    ? (tr.items as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .slice(0, LUXE_TRUST_MAX)
        .map((x, i) => ({ id: str(x.id, 40) || `t${i + 1}`, icon: iconOf(x.icon), text: str(x.text, 60) }))
    : d.trust.items.map((x) => ({ ...x }));
  return {
    gridCols: Number(r.gridCols) === 2 ? 2 : 1,
    // 0 = ตามแบบ · ช่วงจริงจำกัดที่ตัววาดตาม Style (LUXE_MEDIA_WIDTH)
    mediaWidth: Number.isFinite(mw) && mw >= 30 && mw <= 75 ? mw : 0,
    gap: pick(r.gap, ["auto", "none", "sm", "md", "lg"] as const, d.gap),
    mediaHeight: pick(r.mediaHeight, ["auto", "screen", "tall", "ratio"] as const, d.mediaHeight),
    heroHeight: pick(r.heroHeight, ["screen", "tall", "md"] as const, d.heroHeight),
    heroPos: pick(r.heroPos, ["bottom-left", "bottom-center", "center", "top-left"] as const, d.heroPos),
    heroText: pick(r.heroText, ["light", "dark"] as const, d.heroText),
    heroShade: Number.isFinite(shade) ? Math.max(0, Math.min(80, shade)) : d.heroShade,
    craft: {
      show: c.show !== false,
      bg: pick(c.bg, ["ink", "brand", "brandDeep", "surface", "page", "custom"] as const, d.craft.bg),
      hex: typeof c.hex === "string" && HEX6.test(c.hex.trim()) ? c.hex.trim().toLowerCase() : "",
      side: c.side === "right" ? "right" : "left",
      eyebrow: str(c.eyebrow, 60),
      title: str(c.title, 120),
    },
    trust: { show: tr.show === true, items },
  };
}
