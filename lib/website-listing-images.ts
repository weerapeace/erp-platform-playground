/**
 * 🌐 รูปทั้งหมดที่ลงเว็บของ 1 รุ่น 1 ร้าน (store_listings) — ไฟล์ pure ใช้ได้ทั้ง API และหน้าจอ
 *
 * แหล่งรูปในแถวเดียว: รูปบนเว็บ (web_images) · รูปรายสี (web_sku_images) · รูปเปิด Hero (web_hero รุ่น + รายสี) · แบนเนอร์ (web_banners)
 * ใช้ที่: คลังไฟล์ "ดูตามแบรนด์" โฟลเดอร์ 🌐 รูปบนเว็บ (app/api/assets/brand-tree) · บันทึก "ใช้อยู่ที่ไหน" (lib/store-listing-usage)
 * ⚠️ ตัวนับในฐานข้อมูล erp_store_listing_image_keys() (migration 202611011500) ต้องนับแบบเดียวกัน — แก้ที่นี่ แก้ที่นั่นด้วย
 */
import { normalizeHero, type HeroPair } from "@/lib/website-hero";
import { normalizeBanners } from "@/lib/website-banners";

/** gallery = รูปบนเว็บของรุ่น · sku = รูปของสีนั้น (รวม Hero รายสี) · hero = รูปเปิดของรุ่น · banner = แบนเนอร์หน้าสินค้า */
export type ListingImageFolder = "gallery" | "sku" | "hero" | "banner";

export interface ListingImageSlot {
  folder: ListingImageFolder;
  /** id SKU ลูก (folder "sku") */
  skuId: string | null;
  key: string;
  /** วิดีโอ Hero — นับเป็น "ใช้อยู่" (กันลบ) แต่ไม่โชว์ในโฟลเดอร์รูป */
  video: boolean;
}

export interface ListingImageRow {
  web_images?: unknown;
  web_sku_images?: unknown;
  web_hero?: unknown;
  web_banners?: unknown;
}

export const LISTING_IMAGE_SELECT = "web_images, web_sku_images, web_hero, web_banners";

const keyList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((k): k is string => typeof k === "string" && !!k.trim());

function heroSlots(p: HeroPair | null, folder: ListingImageFolder, skuId: string | null): ListingImageSlot[] {
  const out: ListingImageSlot[] = [];
  for (const m of [p?.desktop, p?.mobile]) {
    if (!m) continue;
    out.push({ folder, skuId, key: m.key, video: m.kind === "video" });
    if (m.posterKey) out.push({ folder, skuId, key: m.posterKey, video: false });
  }
  return out;
}

/** ทุกช่องรูปของแถว เรียงตามที่โชว์บนเว็บ (key ซ้ำในช่องเดียวกันตัดออก) */
export function listingImageSlots(row: ListingImageRow | null | undefined): ListingImageSlot[] {
  if (!row) return [];
  const out: ListingImageSlot[] = [];
  for (const key of keyList(row.web_images)) out.push({ folder: "gallery", skuId: null, key, video: false });
  const sku = row.web_sku_images && typeof row.web_sku_images === "object" && !Array.isArray(row.web_sku_images) ? (row.web_sku_images as Record<string, unknown>) : {};
  for (const [skuId, v] of Object.entries(sku)) for (const key of keyList(v)) out.push({ folder: "sku", skuId, key, video: false });
  const hero = normalizeHero(row.web_hero);
  out.push(...heroSlots(hero, "hero", null));
  for (const [skuId, p] of Object.entries(hero?.sku ?? {})) out.push(...heroSlots(p, "sku", skuId));
  for (const b of normalizeBanners(row.web_banners)) if (b.imageKey) out.push({ folder: "banner", skuId: null, key: b.imageKey, video: false });
  const seen = new Set<string>();
  return out.filter((s) => {
    const id = `${s.folder}|${s.skuId ?? ""}|${s.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** ชื่อโฟลเดอร์ (ไม่รวมสี) */
export const LISTING_FOLDER_LABEL: Record<Exclude<ListingImageFolder, "sku">, { th: string; en: string }> = {
  gallery: { th: "รูปบนเว็บ (รุ่น)", en: "Model web images" },
  hero: { th: "รูปเปิด (Hero)", en: "Hero" },
  banner: { th: "แบนเนอร์", en: "Banners" },
};
