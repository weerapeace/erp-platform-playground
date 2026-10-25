/**
 * 📸 ลงรูปเว็บทีละมาก — รวม "รูปใหม่" เข้ากับรูปเดิมของ 1 แถว store_listings (ฝั่ง API · pure ไม่แตะ DB)
 * ใช้ที่ /api/website/listings/images POST (อ่านแถวล่าสุดใน DB ก่อนแล้วค่อยรวม — ไม่ทับของที่คนอื่นเพิ่งแก้)
 *   ต่อท้าย = เดิม + ใหม่ (ไม่ซ้ำ · ตัดเพดาน 12/8) · แทนที่ = ใหม่ทั้งช่อง · Hero ช่องละ 1 รูป (ใหม่แทนเดิม)
 *   ช่องที่ไม่มีรูปใหม่ = ไม่แตะ · สีที่ไม่ใช่ของรุ่นนี้ (okSkuIds) = ไม่ลง
 * ผลลัพธ์ส่งต่อให้ listingPatchToRow (ตัวกรองช่องรูปชุดเดียวกับตัวตั้งค่าเว็บของสินค้า)
 */
import { LISTING_KEY_RE, MAX_SKU_IMAGES, toKeyList } from "@/lib/website-listing-patch";
import { normalizeHero, type HeroMedia, type ProductHero } from "@/lib/website-hero";
import { MAX_WEB_IMAGES, type HeroSlot, type MassImageItem, type MassMode } from "@/lib/website-image-match";

export interface ListingImageCols {
  web_images: unknown;
  web_sku_images: unknown;
  web_hero: unknown;
}
export interface MergedImages {
  patch: { webImages?: string[]; webSkuImages?: Record<string, string[]>; webHero?: ProductHero | null };
  /** จำนวนรูปใหม่ที่ลงจริงในแถวนี้ */
  files: number;
}

const keysOf = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && LISTING_KEY_RE.test(k)) : []).slice(0, max);
const media = (key: string): HeroMedia => ({ kind: "image", key, posterKey: null });

export function mergeListingImages(cur: ListingImageCols, it: MassImageItem, okSkuIds: Set<string>, mode: MassMode): MergedImages {
  const patch: MergedImages["patch"] = {};
  let files = 0;
  const gallery = keysOf(it.gallery, MAX_WEB_IMAGES);
  if (gallery.length) {
    const old = keysOf(cur.web_images, MAX_WEB_IMAGES);
    patch.webImages = [...new Set(mode === "replace" ? gallery : [...old, ...gallery])].slice(0, MAX_WEB_IMAGES);
    files += gallery.length;
  }
  const skuEntries = Object.entries(it.skus ?? {})
    .filter(([id]) => okSkuIds.has(id))
    .map(([id, v]) => [id, keysOf(v, MAX_SKU_IMAGES)] as const)
    .filter(([, keys]) => keys.length);
  if (skuEntries.length) {
    const old = (cur.web_sku_images && typeof cur.web_sku_images === "object" && !Array.isArray(cur.web_sku_images) ? cur.web_sku_images : {}) as Record<string, unknown>;
    const next: Record<string, string[]> = {};
    for (const [id, v] of Object.entries(old)) next[id] = toKeyList(v);
    for (const [id, keys] of skuEntries) {
      next[id] = [...new Set(mode === "replace" ? keys : [...(next[id] ?? []), ...keys])].slice(0, MAX_SKU_IMAGES);
      files += keys.length;
    }
    patch.webSkuImages = next;
  }
  const slotKeys = (v: unknown) => Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).filter(([s, k]) => (s === "desktop" || s === "mobile") && typeof k === "string" && LISTING_KEY_RE.test(k)) as [HeroSlot, string][];
  const heroSlots = slotKeys(it.hero);
  const skuHero = Object.entries(it.skuHero ?? {})
    .filter(([id]) => okSkuIds.has(id))
    .map(([id, v]) => [id, slotKeys(v)] as const)
    .filter(([, s]) => s.length);
  if (heroSlots.length || skuHero.length) {
    const h: ProductHero = normalizeHero(cur.web_hero) ?? { desktop: null, mobile: null };
    for (const [slot, key] of heroSlots) h[slot] = media(key);
    if (skuHero.length) {
      const sku = { ...(h.sku ?? {}) };
      for (const [id, slots] of skuHero) {
        const one = { ...(sku[id] ?? { desktop: null, mobile: null }) };
        for (const [slot, key] of slots) one[slot] = media(key);
        sku[id] = one;
      }
      h.sku = sku;
    }
    patch.webHero = h;
    files += heroSlots.length + skuHero.reduce((n, [, s]) => n + s.length, 0);
  }
  return { patch, files };
}
