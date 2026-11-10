/**
 * ของกลาง — "สินค้าตัวนี้บนเว็บร้านนี้ ลูกค้าเห็นอะไร" (ฝั่งเซิร์ฟเวอร์ · ใช้ resolveProduct ตัวเดียวกับเว็บจริง)
 * คืน: ค่าอัตโนมัติ (ถ้าไม่กรอกทับ) · ค่าที่เห็นจริง (ชื่อ/ราคา/รูป/สี/รูปเปิด/ลิงก์) · หมวดที่ใช้จริง · สิ่งที่ต้องแก้
 * ใช้ร่วม: /api/website/listings (หน้า "สินค้าบนเว็บ") + /api/parent-web-listings (ตัวตั้งค่าเว็บของสินค้า)
 */
import { colorImageSources, resolveProduct, type ColorImageSource, type FieldMap, type ParentRow, type ChildSku, type ListingRow } from "@/lib/website-field-map";
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
  /** img = รูปของสีนี้บนเว็บมาจากไหน · skuId = SKU ตัวแทนของสี (เปิดหน้าแก้ไปที่แถวสีนั้น) · กรอกตัวเลือกทับเอง = ไม่มีทั้งคู่ */
  colors: { label: string; swatch: string | null; hasImage: boolean; img?: ColorImageSource; skuId?: string; noColor?: boolean }[];
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
  // 🖼 ที่มาของรูปรายสี — เฉพาะตัวเลือกที่มาจากสีของ SKU (กรอกตัวเลือกทับเอง = รูปมากับตัวเลือก ไม่ต้องเช็ก)
  const customOptions = !!(l.web_options as { items?: unknown[] } | null)?.items?.length;
  const sources = customOptions ? null : colorImageSources(a.kids, l.web_sku_images);
  const display: ListingDisplay = {
    name: eff.name,
    price: eff.price,
    // 💰 ราคาตาม SKU ที่เลือกไม่เท่ากัน (ตัวเดียวกับเว็บ) · price = ราคาต่ำสุด
    priceVaries: eff.priceVaries,
    imageKey: eff.images[0] ?? null,
    imageCount: eff.images.length,
    colors: (eff.options?.items ?? []).map((it) => {
      const spec = it.swatch ? null : a.swatches.resolve(it.label);
      const src = sources?.get(it.label);
      // 📏 ไซส์ล้วน (ตั้งในทะเบียนสี เช่น "10 รู") = ไม่ต้องมีจุดสี → ไม่เตือน "สียังไม่ผูกทะเบียนสี"
      const noColor = !it.swatch && !spec && a.swatches.isSizeOnly(it.label);
      return { label: it.label, swatch: it.swatch || (spec ? swatchCss(spec, thumb) : null), hasImage: !!(it.image || it.images?.length), ...(src ? { img: src.img, skuId: src.skuId } : {}), ...(noColor ? { noColor } : {}) };
    }),
    hero: !!normalizeHero(l.web_hero),
    productUrl: productPageUrl(a.siteUrl, a.code),
    compartmentsMissing: !!a.fitCheck && (a.parent as { compartments?: unknown }).compartments == null,
  };
  // หมวดที่เว็บใช้จริง = ตัวเดียวกับเว็บ (จัดเอง → กฎแท็ก → กฎหมวด ERP → ค่าตั้งต้น)
  const categories = eff.categories;
  return { mapped, display, categories, issues: listingIssues({ price: display.price, imageCount: display.imageCount, categories, colors: display.colors, compartmentsMissing: display.compartmentsMissing }) };
}
