/**
 * ของกลาง — "สินค้าตัวนี้บนเว็บร้านนี้ ลูกค้าเห็นอะไร" (ฝั่งเซิร์ฟเวอร์ · ใช้ resolveProduct ตัวเดียวกับเว็บจริง)
 * คืน: ค่าอัตโนมัติ (ถ้าไม่กรอกทับ) · ค่าที่เห็นจริง (ชื่อ/ราคา/รูป/สี/รูปเปิด/ลิงก์) · หมวดที่ใช้จริง · สิ่งที่ต้องแก้
 * ใช้ร่วม: /api/website/listings (หน้า "สินค้าบนเว็บ") + /api/parent-web-listings (ตัวตั้งค่าเว็บของสินค้า)
 */
import { resolveProduct, type FieldMap, type ParentRow, type ChildSku, type ListingRow } from "@/lib/website-field-map";
import { swatchCss, type SwatchIndex } from "@/lib/color-swatch";
import { normalizeHero } from "@/lib/website-hero";
import { productPageUrl } from "@/lib/website-links";
import { listingIssues, type ListingIssue } from "@/lib/website-listing-health";

export type ListingAuto = {
  name: string;
  price: number;
  description: string;
  unit: string;
  category: string;
  images: string[];
  options: { label: string; items: { id: string; label: string }[] } | null;
};

export type ListingDisplay = {
  name: string;
  price: number;
  priceVaries: boolean;
  imageKey: string | null;
  imageCount: number;
  colors: { label: string; swatch: string | null; hasImage: boolean }[];
  hero: boolean;
  productUrl: string | null;
  /** 📐 ร้านเปิดเช็คขนาด แต่ยังไม่ได้วัดช่องใส่ของ (compartments = null) */
  compartmentsMissing: boolean;
};

export function computeListingDisplay(a: {
  fieldMap: FieldMap;
  parent: ParentRow;
  kids: ChildSku[];
  /** แถว store_listings (null = ยังไม่อยู่ในร้าน) */
  listing: Record<string, unknown> | null;
  categoryName: string | null;
  swatches: SwatchIndex;
  siteUrl: string | null;
  code: string;
  thumb?: (key: string) => string;
  /** 📐 ร้านนี้เปิด "เช็คขนาด" (SiteInfo fit_check_enabled) */
  fitCheck?: boolean;
  /** 🏷️ หมวดจากกฎแท็กของสินค้านี้ (lib/website-tag-categories-db loadTagCategoryResolver) */
  tagCategories?: string[];
}): { mapped: ListingAuto; display: ListingDisplay; categories: string[]; issues: ListingIssue[] } {
  const thumb = a.thumb ?? ((k: string) => `/api/r2-image?key=${encodeURIComponent(k)}&w=96`);
  const l = a.listing ?? {};
  const mapped = resolveProduct(a.fieldMap, a.parent, a.kids, null, a.categoryName, a.tagCategories) as unknown as ListingAuto;
  const eff = resolveProduct(a.fieldMap, a.parent, a.kids, l as ListingRow, a.categoryName, a.tagCategories);
  const display: ListingDisplay = {
    name: eff.name,
    price: eff.price,
    priceVaries:
      !(l.web_price != null && Number(l.web_price) > 0) &&
      (a.fieldMap.price.source === "sku_min" || a.fieldMap.price.source === "sku_max") &&
      new Set(a.kids.map((k) => Number(k.list_price)).filter((n) => n > 0)).size > 1,
    imageKey: eff.images[0] ?? null,
    imageCount: eff.images.length,
    colors: (eff.options?.items ?? []).map((it) => {
      const spec = it.swatch ? null : a.swatches.resolve(it.label);
      return { label: it.label, swatch: it.swatch || (spec ? swatchCss(spec, thumb) : null), hasImage: !!(it.image || it.images?.length) };
    }),
    hero: !!normalizeHero(l.web_hero),
    productUrl: productPageUrl(a.siteUrl, a.code),
    compartmentsMissing: !!a.fitCheck && (a.parent as { compartments?: unknown }).compartments == null,
  };
  // หมวดที่เว็บใช้จริง = ตัวเดียวกับเว็บ (จัดเอง → กฎแท็ก → กฎหมวด ERP → ค่าตั้งต้น)
  const categories = eff.categories;
  return { mapped, display, categories, issues: listingIssues({ price: display.price, imageCount: display.imageCount, categories, colors: display.colors, compartmentsMissing: display.compartmentsMissing }) };
}
