/**
 * แบนเนอร์หน้าสินค้า (หลายรูป) — ไฟล์ pure (ไม่มี "use client") ใช้ได้ทั้ง API และ UI
 *
 * เก็บที่ store_listings.web_banners (jsonb array) ต่อรุ่นต่อร้าน · ว่าง = ใช้แบนเนอร์กลางของธีม (⚙️ แบนเนอร์)
 * แต่ละแบนเนอร์: รูป · ครึ่งจอ/เต็มจอ · ตำแหน่งข้อความ · หัวข้อ/ข้อความ (เลือกแหล่ง) · ฟิลด์ Parent SKU ที่จะโชว์ · ค่ามือถือแยก
 * ฝั่งเว็บร้าน: src/lib/site-config.ts (ProductBanner) + components/shop/ProductShowcase.tsx (.pd-banner)
 */
import type { BannerTitleSource, BannerTextSource } from "@/lib/website-theme";

export type BannerLayout = "half" | "full";
/** half: left/right (ข้อความอยู่ฝั่งไหน) · full: over-left/over-center/over-right (ทับรูป) / below (ใต้รูป) */
export type BannerTextPos = "left" | "right" | "over-left" | "over-center" | "over-right" | "below";

export interface ProductBanner {
  id: string;
  /** r2 key (null = ยังไม่เลือกรูป → เว็บไม่โชว์แบนเนอร์นี้) */
  imageKey: string | null;
  layout: BannerLayout;
  textPos: BannerTextPos;
  titleSource: BannerTitleSource;
  titleText: string;
  textSource: BannerTextSource;
  text: string;
  /** ฟิลด์ Parent SKU ที่โชว์เป็นตาราง (key จากทะเบียนฟิลด์) */
  fields: string[];
  /** ค่ามือถือ (null = ตามคอม) */
  mobile: { layout: BannerLayout | null; textPos: BannerTextPos | null };
}

export const BANNER_LAYOUTS: { value: BannerLayout; label: string; hint: string }[] = [
  { value: "half", label: "ครึ่งจอ (รูป + ข้อความคนละฝั่ง)", hint: "มือถือเรียงรูปบน ข้อความล่าง" },
  { value: "full", label: "เต็มจอ (รูปกว้างเต็ม)", hint: "ข้อความทับรูป หรือใต้รูป" },
];
export const BANNER_TEXT_POS: { value: BannerTextPos; label: string; layout: BannerLayout }[] = [
  { value: "left", label: "ข้อความซ้าย · รูปขวา", layout: "half" },
  { value: "right", label: "รูปซ้าย · ข้อความขวา", layout: "half" },
  { value: "over-left", label: "ทับรูป ชิดซ้าย", layout: "full" },
  { value: "over-center", label: "ทับรูป กึ่งกลาง", layout: "full" },
  { value: "over-right", label: "ทับรูป ชิดขวา", layout: "full" },
  { value: "below", label: "ใต้รูป", layout: "full" },
];
export const textPosFor = (layout: BannerLayout) => BANNER_TEXT_POS.filter((p) => p.layout === layout);
/** ตำแหน่งข้อความที่ใช้ได้กับ layout นั้น (เปลี่ยน layout แล้วตำแหน่งเดิมใช้ไม่ได้ → ตัวแรกของกลุ่ม) */
export const fixTextPos = (layout: BannerLayout, pos: BannerTextPos): BannerTextPos => (textPosFor(layout).some((p) => p.value === pos) ? pos : textPosFor(layout)[0].value);

const KEY_RE = /^[\w\-./%()]+$/;
const TITLE_SOURCES = ["subtitle", "category", "name", "text", "none"] as const;
const TEXT_SOURCES = ["description", "introduction", "english_description", "text", "none"] as const;
const LAYOUTS = ["half", "full"] as const;
const POSES = BANNER_TEXT_POS.map((p) => p.value);

export const newBanner = (imageKey: string | null = null): ProductBanner => ({
  id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  imageKey,
  layout: "half",
  textPos: "left",
  titleSource: "subtitle",
  titleText: "",
  textSource: "description",
  text: "",
  fields: [],
  mobile: { layout: null, textPos: null },
});

export function normalizeBanners(raw: unknown): ProductBanner[] {
  if (!Array.isArray(raw)) return [];
  const one = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  const out: ProductBanner[] = [];
  raw.forEach((x, i) => {
    if (!x || typeof x !== "object") return;
    const r = x as Record<string, unknown>;
    const m = (r.mobile && typeof r.mobile === "object" ? r.mobile : {}) as Record<string, unknown>;
    const layout = one(r.layout, LAYOUTS, "half");
    const mLayout = typeof m.layout === "string" ? one(m.layout, LAYOUTS, layout) : null;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : `b${i}`,
      imageKey: typeof r.imageKey === "string" && KEY_RE.test(r.imageKey) ? r.imageKey : null,
      layout,
      textPos: fixTextPos(layout, one(r.textPos, POSES, "left")),
      titleSource: one(r.titleSource, TITLE_SOURCES, "subtitle"),
      titleText: typeof r.titleText === "string" ? r.titleText.trim().slice(0, 120) : "",
      textSource: one(r.textSource, TEXT_SOURCES, "description"),
      text: typeof r.text === "string" ? r.text.slice(0, 2000) : "",
      fields: (Array.isArray(r.fields) ? r.fields : []).filter((f): f is string => typeof f === "string" && /^[a-z0-9_]+$/.test(f)).slice(0, 12),
      mobile: { layout: mLayout, textPos: typeof m.textPos === "string" ? fixTextPos(mLayout ?? layout, one(m.textPos, POSES, "left")) : null },
    });
  });
  return out.slice(0, 8);
}
