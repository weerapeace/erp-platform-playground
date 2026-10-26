/**
 * 📸 ลงรูปเว็บทีละมาก — รวม "รูปใหม่" เข้ากับรูปเดิมของ 1 แถว store_listings (ฝั่ง API · pure ไม่แตะ DB)
 * ใช้ที่ /api/website/listings/images POST (อ่านแถวล่าสุดใน DB ก่อนแล้วค่อยรวม — ไม่ทับของที่คนอื่นเพิ่งแก้)
 *   ต่อท้าย = เดิม + ใหม่ (ไม่ซ้ำ · ตัดเพดาน 12/8) · แทนที่ = ใหม่ทั้งช่อง · Hero ช่องละ 1 ไฟล์ รูปหรือวิดีโอ (ใหม่แทนเดิม)
 *   ช่องที่ไม่มีรูปใหม่ = ไม่แตะ · สีที่ไม่ใช่ของรุ่นนี้ (okSkuIds) = ไม่ลง
 * ผลลัพธ์ส่งต่อให้ listingPatchToRow (ตัวกรองช่องรูปชุดเดียวกับตัวตั้งค่าเว็บของสินค้า)
 */
import { LISTING_KEY_RE, MAX_SKU_IMAGES, toKeyList } from "@/lib/website-listing-patch";
import { normalizeHero, type HeroMedia, type ProductHero } from "@/lib/website-hero";
import { MAX_WEB_IMAGES, type HeroPick, type HeroSlot, type MassImageItem, type MassMode } from "@/lib/website-image-match";

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
const media = (key: string, kind: "image" | "video"): HeroMedia => ({ kind, key, posterKey: null });

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
  // ช่อง Hero: "key" = รูป · { key, kind:"video" } = วิดีโอ (ลงทีละมากได้ทั้งคู่)
  const slotKeys = (v: unknown): [HeroSlot, string, "image" | "video"][] =>
    Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).flatMap(([s, raw]) => {
      if (s !== "desktop" && s !== "mobile") return [];
      const o = raw && typeof raw === "object" ? (raw as { key?: unknown; kind?: unknown }) : null;
      const key = o ? o.key : raw;
      if (typeof key !== "string" || !LISTING_KEY_RE.test(key)) return [];
      return [[s, key, o?.kind === "video" ? "video" : "image"]];
    });
  const heroSlots = slotKeys(it.hero);
  const skuHero = Object.entries(it.skuHero ?? {})
    .filter(([id]) => okSkuIds.has(id))
    .map(([id, v]) => [id, slotKeys(v)] as const)
    .filter(([, s]) => s.length);
  if (heroSlots.length || skuHero.length) {
    const h: ProductHero = normalizeHero(cur.web_hero) ?? { desktop: null, mobile: null };
    for (const [slot, key, kind] of heroSlots) h[slot] = media(key, kind);
    if (skuHero.length) {
      const sku = { ...(h.sku ?? {}) };
      for (const [id, slots] of skuHero) {
        const one = { ...(sku[id] ?? { desktop: null, mobile: null }) };
        for (const [slot, key, kind] of slots) one[slot] = media(key, kind);
        sku[id] = one;
      }
      h.sku = sku;
    }
    patch.webHero = h;
    files += heroSlots.length + skuHero.reduce((n, [, s]) => n + s.length, 0);
  }
  return { patch, files };
}

// ───────────── แท็บ 🖼 รูปภาพ (แก้ไขทีละมาก) — ตั้งค่า "ทั้งช่อง" ตามที่เห็นในตาราง ─────────────
/** ช่องที่ตั้งใหม่ (ส่งเฉพาะช่องที่เปลี่ยน) — ลำดับตามที่ลากเรียง · [] = ล้างช่อง (กลับไปใช้รูป ERP) · null = เอา Hero ออก */
export interface ImageSlotsSet {
  parentId: string;
  gallery?: string[];
  skus?: Record<string, string[]>;
  hero?: Partial<Record<HeroSlot, HeroPick | null>>;
  skuHero?: Record<string, Partial<Record<HeroSlot, HeroPick | null>>>;
}

const pickMedia = (v: HeroPick | null | undefined): HeroMedia | null | undefined => {
  if (v === null) return null;
  const o = v && typeof v === "object" ? v : null;
  const key = o ? o.key : v;
  if (typeof key !== "string" || !LISTING_KEY_RE.test(key)) return undefined; // ค่าไม่ถูกต้อง = ไม่แตะช่องนั้น
  return media(key, o?.kind === "video" ? "video" : "image");
};

/** ตั้งช่องรูปตามที่ส่งมา (แทนทั้งช่อง) — ช่องที่ไม่ได้ส่ง = ไม่แตะ · สีที่ไม่ใช่ของรุ่นนี้ = ไม่ลง · slots = จำนวนช่องที่เปลี่ยน */
export function applyImageSlots(cur: ListingImageCols, it: ImageSlotsSet, okSkuIds: Set<string>): { patch: MergedImages["patch"]; slots: number } {
  const patch: MergedImages["patch"] = {};
  let slots = 0;
  if (Array.isArray(it.gallery)) {
    patch.webImages = [...new Set(keysOf(it.gallery, MAX_WEB_IMAGES))];
    slots++;
  }
  const skuEntries = Object.entries(it.skus ?? {}).filter(([id, v]) => okSkuIds.has(id) && Array.isArray(v));
  if (skuEntries.length) {
    const old = (cur.web_sku_images && typeof cur.web_sku_images === "object" && !Array.isArray(cur.web_sku_images) ? cur.web_sku_images : {}) as Record<string, unknown>;
    const next: Record<string, string[]> = {};
    for (const [id, v] of Object.entries(old)) next[id] = toKeyList(v);
    for (const [id, v] of skuEntries) {
      const keys = [...new Set(keysOf(v, MAX_SKU_IMAGES))];
      if (keys.length) next[id] = keys;
      else delete next[id];
      slots++;
    }
    patch.webSkuImages = next;
  }
  const heroSets = Object.entries(it.hero ?? {}).filter(([s]) => s === "desktop" || s === "mobile") as [HeroSlot, HeroPick | null][];
  const skuHeroSets = Object.entries(it.skuHero ?? {}).filter(([id]) => okSkuIds.has(id));
  if (heroSets.length || skuHeroSets.length) {
    const h: ProductHero = normalizeHero(cur.web_hero) ?? { desktop: null, mobile: null };
    for (const [slot, v] of heroSets) {
      const m = pickMedia(v);
      if (m === undefined) continue;
      h[slot] = m;
      slots++;
    }
    if (skuHeroSets.length) {
      const sku = { ...(h.sku ?? {}) };
      for (const [id, raw] of skuHeroSets) {
        const one = { ...(sku[id] ?? { desktop: null, mobile: null }) };
        for (const [slot, v] of Object.entries(raw ?? {}).filter(([s]) => s === "desktop" || s === "mobile") as [HeroSlot, HeroPick | null][]) {
          const m = pickMedia(v);
          if (m === undefined) continue;
          one[slot] = m;
          slots++;
        }
        if (one.desktop || one.mobile) sku[id] = one;
        else delete sku[id];
      }
      h.sku = sku;
    }
    patch.webHero = h;
  }
  return { patch, slots };
}
