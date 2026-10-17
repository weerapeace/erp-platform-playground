/**
 * ของกลาง — แปลง "ค่าที่แก้" ของสินค้าบนเว็บ (1 รุ่น · 1 ร้าน) เป็นแถว store_listings ที่ปลอดภัย
 * ใช้ร่วม 2 API ที่บันทึกสินค้าบนเว็บ (ต้องรับฟิลด์ชุดเดียวกัน ไม่งั้นแก้ที่หนึ่งได้ อีกที่หนึ่งไม่ได้):
 *   - /api/parent-web-listings  (ตัวตั้งค่าเว็บของสินค้า: แท็บ 🛍 ใน Parent SKU + drawer หน้า "สินค้าบนเว็บ")
 *   - /api/website/listings      (หน้า "สินค้าบนเว็บ": สวิตช์ขึ้นเว็บ/แนะนำ · ลากเรียง)
 * ส่งมาเฉพาะช่องที่จะเปลี่ยน — ช่องที่ไม่ส่ง = ไม่แตะ · ค่าว่าง = กลับไปใช้ค่าอัตโนมัติ (null)
 */
import { cleanCategoryKey } from "@/lib/website-field-map";
import { cleanDetailOverrides, type DetailOverride } from "@/lib/website-detail-overrides";
import { normalizePersonalize, type PersonalizeConfig } from "@/lib/website-personalize";
import { normalizeBanners } from "@/lib/website-banners";
import { normalizeCardColors, isEmptyCardColors } from "@/lib/website-card-colors";
import { normalizeHero } from "@/lib/website-hero";

export const LISTING_KEY_RE = /^[\w\-./%()]+$/; // r2 object key ที่ยอมรับ
export const MAX_SKU_IMAGES = 8;
export const STOCK_STATUS = new Set(["in", "low", "preorder", "out"]);

export type ListingPatch = {
  isPublished?: boolean;
  featured?: boolean;
  sortOrder?: number;
  webName?: string;
  webPrice?: number | null;
  webDescription?: string;
  webImages?: string[];
  webSkuImages?: Record<string, string | string[]>;
  webUnit?: string;
  webCategory?: string;
  /** null = กลับไปใช้หมวดแบบเดิม · array = จัดเอง */
  webCategories?: string[] | null;
  webBadge?: string;
  webStockStatus?: string;
  webSwatch?: string;
  webOptions?: unknown;
  webDetails?: Record<string, DetailOverride>;
  webPersonalize?: PersonalizeConfig | null;
  webBanners?: unknown;
  webCardColors?: unknown;
  webHero?: unknown;
};

/** รูปเว็บรายสี: รับได้ทั้งค่าเก่า (string เดี่ยว) และค่าใหม่ (string[]) → คืนเป็น string[] เสมอ */
export const toKeyList = (v: unknown): string[] => {
  const arr = typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
  return [...new Set(arr.filter((k): k is string => typeof k === "string" && LISTING_KEY_RE.test(k)))].slice(0, MAX_SKU_IMAGES);
};

/** รายการรหัสหมวด (ไม่ซ้ำ · ≤ 20) — null = กลับไปใช้หมวดแบบเดิม */
export const cleanCategoryList = (v: unknown): string[] | null => (Array.isArray(v) ? [...new Set(v.map(cleanCategoryKey).filter(Boolean))].slice(0, 20) : null);

const text = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim() || null;

/** ค่าที่แก้ → คอลัมน์ store_listings (เฉพาะที่ส่งมา) */
export function listingPatchToRow(p: ListingPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.isPublished !== undefined) row.is_published = !!p.isPublished;
  if (p.featured !== undefined) row.featured = !!p.featured;
  if (p.sortOrder !== undefined) row.sort_order = Number(p.sortOrder) || 0;
  if (p.webName !== undefined) row.web_name = text(p.webName, 200);
  if (p.webPrice !== undefined) row.web_price = p.webPrice == null ? null : Number(p.webPrice) > 0 ? Number(p.webPrice) : null;
  if (p.webDescription !== undefined) row.web_description = text(p.webDescription, 3000);
  if (p.webUnit !== undefined) row.web_unit = text(p.webUnit, 40);
  if (p.webCategory !== undefined) row.web_category = text(p.webCategory, 60);
  if (p.webCategories !== undefined) row.web_categories = cleanCategoryList(p.webCategories);
  if (p.webBadge !== undefined) row.web_badge = text(p.webBadge, 40);
  if (p.webSwatch !== undefined) row.web_swatch = text(p.webSwatch, 300);
  if (p.webStockStatus !== undefined) {
    const s = String(p.webStockStatus ?? "").trim();
    row.web_stock_status = STOCK_STATUS.has(s) ? s : null;
  }
  if (p.webImages !== undefined) {
    const keys = (Array.isArray(p.webImages) ? p.webImages : []).filter((k) => typeof k === "string" && LISTING_KEY_RE.test(k)).slice(0, 12);
    row.web_images = keys.length ? keys : null;
  }
  if (p.webSkuImages !== undefined) {
    const clean: Record<string, string[]> = {};
    for (const [skuId, v] of Object.entries(p.webSkuImages ?? {}).slice(0, 60)) {
      if (!/^[0-9a-f-]{36}$/i.test(skuId)) continue;
      const keys = toKeyList(v);
      if (keys.length) clean[skuId] = keys;
    }
    row.web_sku_images = Object.keys(clean).length ? clean : null;
  }
  if (p.webOptions !== undefined) {
    // รูปแบบ: { label: string, items: [{ id, label, swatch? }] } — ไม่มีตัวเลือก = ใช้สีจาก SKU อัตโนมัติ
    const o = p.webOptions as { label?: unknown; items?: unknown } | null;
    if (!o || !Array.isArray(o.items) || !o.items.length) row.web_options = null;
    else {
      const items = (o.items as Record<string, unknown>[])
        .slice(0, 24)
        .map((it) => ({ id: text(it.id, 40) ?? "", label: text(it.label, 80) ?? "", swatch: text(it.swatch, 80) }))
        .filter((it) => it.id && it.label);
      row.web_options = items.length ? { label: text(o.label, 60) ?? "ตัวเลือก", items } : null;
    }
  }
  if (p.webDetails !== undefined) {
    const clean = cleanDetailOverrides(p.webDetails);
    row.web_details = Object.keys(clean).length ? clean : null;
  }
  if (p.webPersonalize !== undefined) row.web_personalize = p.webPersonalize ? normalizePersonalize(p.webPersonalize) : null;
  if (p.webBanners !== undefined) {
    const banners = normalizeBanners(p.webBanners);
    row.web_banners = banners.length ? banners : null;
  }
  if (p.webCardColors !== undefined) {
    const cc = normalizeCardColors(p.webCardColors);
    row.web_card_colors = isEmptyCardColors(cc) ? null : cc;
  }
  if (p.webHero !== undefined) row.web_hero = normalizeHero(p.webHero);
  return row;
}
