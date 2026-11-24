/**
 * "ร้านที่ลงขายแล้ว ตรงกับระบบไหม" — ฝั่งเซิร์ฟเวอร์ (ของกลาง) · กติกาเทียบ = lib/platform-listing-drift (pure)
 * ใช้: /api/platform-catalog/drift (แท็บแพลตฟอร์มของ Parent SKU · หน้าเทียบก่อนส่ง · เช็กข้ามร้าน) + cron /api/cron/platform-drift
 *
 * ⚠️ ไม่มีตัวประกอบ/ตัวยิงร้านตัวที่ 2:
 *   ค่าฝั่งระบบ = ตัวประกอบข้อมูลของตัวช่วยลงสินค้า (buildLineCreate · load ของ /api/<ร้าน>/create-product)
 *   ค่าฝั่งร้าน = ตัวดึงสดของลิ้นชักสินค้าบนร้าน (loadShopeeListingLive · loadLazListingLive · loadTtsListingLive · lineGetProduct)
 *   การส่ง = "คำสั่ง" (calls) ไปยัง API แก้สินค้าบนร้านที่มีอยู่แล้ว (listing-edit / listing-prices ของแต่ละร้าน) — หน้าเว็บเป็นคนยิง
 *     route เดิมตรวจซ้ำเอง: มีคนแก้บนร้านระหว่างนั้น = 409 ไม่ทับ · สิทธิ์ products.platforms.publish · ลงประวัติ
 *   วางแผน/ตรวจค่าด้วยกฎของร้าน (planShopeeImages · planLazadaEdit · planTiktokMedia · planLineEdit · …) ตัวเดียวกับลิ้นชัก
 * ไม่แตะสต๊อก (BigSeller ยังซิงค์อยู่)
 * ผลตรวจล่าสุดจดใน platform_listing_drift (แท็บ/เช็กข้ามร้านอ่าน) · ชุดรูปที่ส่งจากระบบจำใน raw.sys_sync (ไว้เทียบรูปรอบหน้า)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGoneStatus } from "@/lib/platform-listing-health";
import {
  attrValSig, compareAll, coreValue, descImages, driftIssues, listSig, looksHtml, plainText, shopVariantImageSig, sysVariantImageSig,
  type AttrValues, type DriftItem, type DriftKey, type ShopValues, type ShopVariant, type SysSync, type SystemValues,
} from "@/lib/platform-listing-drift";
import { auditDiff, writeAudit } from "@/lib/audit";
import { buildLineCreate } from "@/lib/line-create-payload";
import { loadLazadaCreate } from "@/app/api/lazada/create-product/load";
import { loadTiktokCreate } from "@/app/api/tiktok-shop/create-product/load";
import { loadShopeeCreate } from "@/app/api/shopee/create-product/load";
import { loadShopeeListingLive } from "@/app/api/shopee/shared";
import { loadLazListingLive } from "@/app/api/lazada/shared";
import { loadTtsListingLive, ttsViewWithReview } from "@/app/api/tiktok-shop/shared";
import { planShopeeAttrs, planShopeeEdit, planShopeeImages, planShopeeOptionEdit, planShopeeOptionImages, planShopeePrices, shopeePriceRowsFromView, type ShopeeListingView } from "@/lib/shopee-listing-edit";
import { sysOptionName, sysVariantOfOption } from "@/lib/listing-option-sync";
import {
  foreignDescImages, lazadaEditStateFromView, lazadaListingView, lazadaPriceRowsFromView, lazadaSkuMediaFromView, lazMigrateImageXml, planLazadaEdit, planLazadaPrices, planLazadaSkuMedia,
  type LazadaEditState, type LazadaListingView,
} from "@/lib/lazada-listing-edit";
import { lazErrorText, lazMigrateImage, type LazGateway } from "@/lib/lazada";
import { ttsErrorText, ttsUploadImage } from "@/lib/tiktok-shop";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { planTiktokDescription, planTiktokMedia, planTiktokPrices, planTiktokTitle, tiktokDescImageSrc, tiktokMediaBase, tiktokPriceBlock, tiktokPriceRowsFromView, type TiktokListingView } from "@/lib/tiktok-listing-edit";
import { planTiktokSkuEdit, tiktokOptNameKey, tiktokOptionGroups, tiktokSkuFormOf, tiktokSkuSignature } from "@/lib/tiktok-sku-edit";
import { lineGetProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";
import { lineEditStateFromRaw, planLineEdit, type LineEditState } from "@/lib/line-listing-edit";
import { pickListingTitle } from "@/lib/listing-title";
import { loadFieldHistoryValues } from "@/lib/field-history";
import { loadSkuStock } from "@/lib/sku-stock";
import type { SysVariantView } from "@/lib/listing-option-sync";

type Admin = SupabaseClient;
/** ร้านที่ตรวจ/ส่งได้ (เว็บเราใช้ข้อมูลจากระบบอยู่แล้ว ไม่ต้องตรวจ) */
export const DRIFT_PLATFORMS = ["shopee", "lazada", "tiktok", "line_shopping"] as const;
export const isDriftPlatform = (code: string | null | undefined): boolean => (DRIFT_PLATFORMS as readonly string[]).includes(String(code ?? ""));

/** คำสั่งที่หน้าเว็บต้องยิง (ตามลำดับ) — ไปยัง API แก้สินค้าบนร้านที่มีอยู่แล้ว */
export type DriftCall = { url: string; body: Record<string, unknown>; label: string };
export type DriftCheck = {
  ok: true; listing_id: string; platform_code: string; parent_sku_id: string | null;
  items: DriftItem[]; issues: DriftKey[]; checked_at: string;
  /** ไว้เปิดหน้าให้เช็กหลังส่ง (ของกลาง push-open) — รหัสสินค้าบนร้าน · รหัสร้าน · สถานะบนร้าน */
  external_product_id?: string | null; shop_ref?: string | null; listing_status?: string | null;
  /** ค่าฝั่งระบบเต็ม ๆ (เฉพาะตอนตรวจสด · ไม่จดลงตาราง) — ลิ้นชักโหมด "เช็กกับระบบ" ใช้เติมฟอร์มเมื่อกด "ใช้ตามระบบ" (2026-11-23) */
  sys?: DriftSysView;
};
export type DriftSysView = {
  title: string | null; description: string; imageRefs: string[]; descImageRefs: string[];
  /** ราคาต่อรหัส SKU (ราคาเต็มที่ระบบจะส่ง) */ prices: { code: string; price: number | null }[];
  attrs: AttrValues | null; attrNames: Record<string, string> | null;
  /** สีในระบบ (รหัส · ค่าตัวเลือก · รูป) — เติมชื่อ/รูปตัวเลือกตามระบบในลิ้นชัก (2026-11-24) */
  variants: { code: string; values: string[]; image: string | null }[];
};
/** "ให้ระบบใช้ค่านี้" — เรื่องที่เขียนลงร่างของร้านได้ (ร่าง = ค่าฝั่งระบบของร้านนี้ ไม่แตะ Parent SKU ที่ใช้ทุกร้าน) */
export const ADOPT_KEYS: readonly DriftKey[] = ["title", "description", "attrs"];
export const ADOPT_CANNOT: Partial<Record<DriftKey, string>> = {
  images: "รูปบนร้านไม่ได้อยู่ในคลังรูปของระบบ — ให้ระบบใช้ตามไม่ได้",
  desc_images: "รูปบนร้านไม่ได้อยู่ในคลังรูปของระบบ — ให้ระบบใช้ตามไม่ได้",
  variant_images: "รูปบนร้านไม่ได้อยู่ในคลังรูปของระบบ — ให้ระบบใช้ตามไม่ได้",
  price: "ราคามาจากกติการาคาของระบบ — แก้ที่ราคาสินค้า/กติการาคาแทน",
  options: "ชื่อตัวเลือกมาจาก SKU ในระบบ — แก้ที่ SKU แทน",
};
export type DriftFail = { ok: false; error: string; status: number };

type Ctx = {
  code: string; listingId: string; parentId: string | null;
  sys: SystemValues; shop: ShopValues; sync: SysSync | null;
  /** รายละเอียดฝั่งระบบมาจาก "ร่างของร้านที่แก้ไว้" → note เตือน · block = ร่างมีข้อความของสินค้าอื่น ห้ามส่ง */
  descGuard: { note: string | null; block: string | null };
  /** ชื่อเวอร์ชันเก่าของสินค้า — ชื่อบนร้านตรงกับค่าเหล่านี้ = ร้านเก็บชื่อเก่า (ติ๊กส่งไว้ให้) · ไม่ตรง = ร้านตั้งชื่อเอง (เตือน ไม่ติ๊กให้) */
  titleHistory: string[];
  /** เหตุผลที่ส่งเรื่องนี้ไม่ได้ (null = ส่งได้) */
  cannot: (key: DriftKey) => string | null;
  /** ประกอบคำสั่งของเรื่องที่เลือก (ตามลำดับที่ร้านต้องการ) · รูปในรายละเอียดของ TikTok/Lazada ฝากกับร้านตอนนี้ (ยังไม่แก้สินค้า) */
  build: (keys: DriftKey[]) => Promise<DriftCall[]>;
};

const errs = (xs: string[] | undefined) => (xs?.length ? xs.join(" · ") : null);
const OPT_CANNOT: Record<string, string> = {
  shopee: "Shopee: ระบบยังแก้ชื่อตัวเลือกให้ไม่ได้ — แก้ใน Seller Centre",
  lazada: "Lazada: ระบบยังแก้ชื่อตัวเลือกให้ไม่ได้ — แก้ใน Seller Center",
  line_shopping: "LINE: ระบบยังแก้ชื่อตัวเลือกให้ไม่ได้ — แก้ในหลังร้าน LINE",
};

// ───────── ค่าฝั่งระบบ (ตัวประกอบข้อมูลของตัวช่วยลงสินค้า) ─────────
const vals = (r: Record<string, string> | undefined | null) => Object.values(r ?? {}).map((x) => String(x ?? ""));
async function systemValues(admin: Admin, code: string, parentId: string, userId: string | null): Promise<{ ok: true; sys: SystemValues; descSrc: string } | { ok: false; error: string }> {
  if (code === "line_shopping") {
    const b = await buildLineCreate(admin, parentId);
    if (!b.ok) return { ok: false, error: b.error };
    const p = b.preview;
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.keys.map((k) => `r2:${k}`), variants: p.variants.map((v) => ({ code: v.code, values: v.options, price: v.price || null, pay: v.price ? v.price - (v.discount || 0) : null, image: v.image_key ? `r2:${v.image_key}` : null })) } };
  }
  if (code === "shopee") {
    const r = await loadShopeeCreate(admin, parentId, userId);
    if (!r.ok) return { ok: false, error: r.error };
    const p = r.preview;
    // ข้อมูลจำเพาะ (2026-11-23): ค่าที่ตัวช่วยลงสินค้าจะส่ง (ร่าง + ค่าเริ่มต้นของร้าน + ข้อมูลสินค้า) · ดึงช่องของหมวดไม่ได้ = ไม่เทียบเรื่องนี้
    const attrs = p.attrs.loaded ? Object.fromEntries(Object.entries(p.attrs.values).filter(([, v]) => v.length)) : undefined;
    return { ok: true, descSrc: p.description.src, sys: {
      description: p.description.value, imageRefs: p.images.refs, variants: p.variants.map((v) => ({ code: v.code, values: vals(v.attrs), price: v.price, image: v.image_ref })),
      ...(attrs ? { attrs, attrNames: Object.fromEntries(p.attrs.fields.map((f) => [f.id, f.name])) } : {}),
    } };
  }
  if (code === "lazada") {
    const r = await loadLazadaCreate(admin, parentId, userId);
    if (!r.ok) return { ok: false, error: r.error };
    const p = r.preview;
    // ราคาลด: เทียบ/ส่งเฉพาะเมื่อระบบมีราคาลด (ล้างราคาลดบน Lazada ผ่านระบบไม่ได้)
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.refs, variants: p.variants.map((v) => ({ code: v.code, values: vals(v.saleProp), price: v.price, image: v.image_refs?.[0] ?? v.image_ref, ...(v.special != null && v.price != null && v.special < v.price ? { special: v.special } : {}) })) } };
  }
  if (code === "tiktok") {
    const r = await loadTiktokCreate(admin, parentId, userId);
    if (!r.ok) return { ok: false, error: r.error };
    const p = r.preview;
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.refs, variants: p.variants.map((v) => ({ code: v.code, values: vals(v.attrs), price: v.price, image: v.image_ref })) } };
  }
  return { ok: false, error: "ร้านนี้ยังตรวจไม่ได้" };
}

// ───────── ฝั่งร้าน + กฎส่ง ต่อร้าน ─────────
const sysOf = (sys: SystemValues, code: string | null) => (code ? sys.variants.find((v) => v.code.trim().toUpperCase() === code.trim().toUpperCase()) : sys.variants.length === 1 ? sys.variants[0] : undefined);

function shopeeCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, v: ShopeeListingView): Ctx {
  const variants: ShopVariant[] = v.hasModel ? v.models.map((m) => ({ code: m.sku, label: m.label ?? "", price: m.originalPrice ?? m.price, image: m.image })) : [{ code: null, label: "", price: v.originalPrice ?? v.price }];
  // รูปในรายละเอียด (extended description) — ตัวอ่านสดของ Shopee ส่งมาให้แล้ว (descriptionImages)
  const descImgs = v.descriptionImages ?? [];
  const shop: ShopValues = { title: v.name, description: v.description, imageCount: v.imageIds.length, imageSig: listSig(v.imageIds), variants, imageUrls: v.images, descImageUrls: descImgs.map((x) => x.url ?? x.id), attrs: v.attrs };
  // ข้อมูลจำเพาะ: ส่งเฉพาะช่องที่ระบบมีค่าและไม่ตรง (ตัวส่งรวมกับของเดิมบนร้านให้ — ช่องอื่นคงเดิม)
  const attrWant = (): AttrValues => Object.fromEntries(Object.entries(base.sys.attrs ?? {}).filter(([id, vals]) => vals.length && attrValSig(vals) !== attrValSig(v.attrs[id])));
  const attrPlan = () => planShopeeAttrs(v, attrWant(), Object.entries(base.sys.attrNames ?? {}).map(([id, name]) => ({ id, name, required: false })));
  const imgPlan = () => planShopeeImages(v, base.sys.imageRefs);
  const descPlan = () => planShopeeEdit(v, { description: base.sys.description });
  const titlePlan = () => planShopeeEdit(v, { name: base.sys.title ?? "" });
  // รูปตัวเลือก: ชื่อตัวเลือกชั้นแรกบนร้าน (เช่น "ดำ (01)") ↔ รูปของสีนั้นในระบบ (ตัวเตรียมข้อมูลกลาง) · route /api/shopee/listing-edit option_images (a20fd610)
  const tier0 = v.optionTiers?.[0] ?? null;
  const optWant = (): Record<string, string> => {
    const want: Record<string, string> = {};
    const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    for (const o of tier0?.options ?? []) {
      const sv = base.sys.variants.find((x) => x.image && x.values[0] && (key(x.values[0]) === key(o.name) || key(coreValue(x.values[0])) === key(coreValue(o.name))));
      if (sv?.image) want[o.name] = sv.image;
    }
    return want;
  };
  const optPlan = () => planShopeeOptionImages(v, optWant());
  // ชื่อตัวเลือก (2026-11-24): ตัวเลือกบนร้าน ↔ สีในระบบ (จับจากรหัส) → ชื่อตามระบบ · ส่งรวมกับรูปตัวเลือกในคำสั่งเดียว
  const optNamesWant = (): Record<number, string> => {
    const out: Record<number, string> = {};
    (tier0?.options ?? []).forEach((o, i) => { const n = sysOptionName(sysVariantOfOption(v.models, i, base.sys.variants)); if (n && n !== o.name) out[i] = n; });
    return out;
  };
  const optImgsByIndex = (): Record<number, string> => {
    const w = optWant(); const out: Record<number, string> = {};
    (tier0?.options ?? []).forEach((o, i) => { if (w[o.name]) out[i] = w[o.name]; });
    return out;
  };
  const optNamePlan = () => planShopeeOptionEdit(v, { names: optNamesWant() });
  const priceRows = shopeePriceRowsFromView(v);
  const priceEdit = () => priceRows.map((r) => {
    const m = v.hasModel ? v.models.find((x) => x.modelId === r.modelId) : null;
    const s = sysOf(base.sys, m ? m.sku : null);
    return s?.price != null ? { ...r, price: Math.round(s.price) } : r;
  });
  const pricePlan = () => planShopeePrices(v, priceEdit());
  return {
    ...base, shop,
    cannot: (k) => k === "title" ? errs(titlePlan().errors)
      : k === "images" ? errs(imgPlan().errors)
      : k === "description" ? (!v.descriptionEditable ? "Shopee: สินค้านี้ใช้รายละเอียดแบบมีรูป — แก้ใน Seller Centre" : errs(descPlan().errors))
      : k === "options" ? (!optNamePlan().changed ? "ชื่อสีที่มีบนร้านตรงระบบแล้ว — ที่ต่างคือสีที่ยังไม่อยู่บนร้าน (เพิ่มได้ในลิ้นชัก แท็บตัวเลือก & ราคา)" : errs(optNamePlan().errors))
      : k === "desc_images" ? null
      : k === "variant_images" ? errs(optPlan().errors)
      : k === "attrs" ? errs(attrPlan().errors)
      : errs(pricePlan().errors),
    build: async (keys) => {
      const calls: DriftCall[] = [];
      if (keys.includes("price")) {
        const plan = pricePlan();
        if (plan.changes.length) calls.push({ url: "/api/shopee/listing-prices", label: "ราคา", body: { listing_id: base.listingId, before: priceRows.map((b) => ({ model_id: b.modelId, price: b.price })), prices: plan.changes.map((c) => ({ model_id: c.modelId, label: c.label, price: c.after })) } });
      }
      const body: Record<string, unknown> = { listing_id: base.listingId };
      // ชื่อ + รายละเอียด ไปด้วยกันในคำสั่งเดียว (route ตรวจชนกันจากค่า before ชุดเดียว)
      const textKeys = keys.filter((k) => k === "title" || k === "description");
      if (textKeys.length) {
        const p = planShopeeEdit(v, { ...(keys.includes("title") ? { name: base.sys.title ?? "" } : {}), ...(keys.includes("description") ? { description: base.sys.description } : {}) });
        // 🐛 2026-11-23: รายละเอียดแบบมีรูป (extended) ไม่มี p.body.description (ไปอยู่ description_info) → เดิมส่ง null = ข้อความไม่ถูกแก้ · ส่งข้อความระบบตรง ๆ
        const descChanged = p.changes.some((c) => c.label === "รายละเอียด");
        if (p.body.item_name != null || descChanged) { body.before = { name: v.name, description: v.description }; body.edit = { name: p.body.item_name ?? null, description: descChanged ? base.sys.description : null }; }
      }
      if (keys.includes("images")) { const p = imgPlan(); if (p.changed) body.images = { before_ids: v.imageIds, refs: p.refs }; }
      // รูปในรายละเอียด: route ฝากรูป (scene desc · คงสัดส่วน) แล้วแทนทั้งชุด · ข้อความคงเดิมถ้าไม่ได้ติ๊ก "รายละเอียด"
      if (keys.includes("desc_images") && base.sys.descImageRefs?.length) body.desc_images = { before_ids: descImgs.map((x) => x.id), refs: base.sys.descImageRefs };
      // ข้อมูลจำเพาะ (2026-11-23) — route ส่ง attribute_list ทั้งชุดไปกับ update_item ครั้งเดียวกัน
      if (keys.includes("attrs") && attrPlan().changed) body.attributes = { before: v.attrs, values: attrWant(), fields: Object.entries(base.sys.attrNames ?? {}).map(([id, name]) => ({ id, name, required: false })) };
      const edit = body.edit as { name: string | null; description: string | null } | undefined;
      if (edit || body.images || body.desc_images || body.attributes) calls.push({ url: "/api/shopee/listing-edit", label: [edit?.name ? "ชื่อ" : "", edit?.description ? "รายละเอียด" : "", body.images ? "รูป" : "", body.desc_images ? "รูปในรายละเอียด" : "", body.attributes ? "ข้อมูลจำเพาะ" : ""].filter(Boolean).join(" + "), body });
      // ชื่อ + รูปตัวเลือก: คำสั่งแยก (update_tier_variation + model_list) · ชื่อกับรูปไปด้วยกันครั้งเดียว · route เช็กตัวเลือกเดิม/ราคาหลังส่ง
      const names = keys.includes("options") ? optNamesWant() : {};
      const images = keys.includes("variant_images") ? optImgsByIndex() : {};
      if (tier0 && (Object.keys(names).length || Object.keys(images).length) && planShopeeOptionEdit(v, { names, images }).changed) {
        calls.push({ url: "/api/shopee/listing-edit", label: [Object.keys(names).length ? "ชื่อตัวเลือก" : "", Object.keys(images).length ? "รูปตัวเลือก" : ""].filter(Boolean).join(" + "), body: {
          listing_id: base.listingId,
          options: { before: { names: tier0.options.map((o) => o.name), image_ids: tier0.options.map((o) => o.imageId ?? ""), model_ids: v.models.map((m) => m.modelId) }, names, images, add: [] },
        } });
      }
      return calls;
    },
  };
}

function lazadaCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, v: LazadaListingView, live: { gateway: LazGateway; accessToken: string }): Ctx {
  const shop: ShopValues = {
    title: v.name, description: v.description, imageCount: v.images.length, imageSig: listSig(v.images), imageUrls: v.images, descImageUrls: descImages(v.description),
    variants: v.skus.map((s) => ({ code: s.sellerSku, label: s.label, price: s.price, image: s.images[0] ?? null, ...(base.sys.variants.some((x) => x.special !== undefined) ? { special: s.specialPrice } : {}) })),
  };
  // รูปตัวเลือก: ระบบแก้ได้ "รูปแรก" ของแต่ละ SKU (รูปที่เหลือคงเดิม) — ตัวแก้เดิมของลิ้นชัก (planLazadaSkuMedia)
  const skuBefore = lazadaSkuMediaFromView(v);
  const skuAfter = skuBefore.map((r) => { const s = sysOf(base.sys, r.sellerSku); return s?.image ? { ...r, images: [s.image, ...r.images.slice(1)] } : r; });
  const skuPlan = () => planLazadaSkuMedia(skuBefore, skuAfter, v.imageVariation);
  const before = lazadaEditStateFromView(v);
  const after = (keys: DriftKey[]) => ({
    ...before,
    ...(keys.includes("title") && base.sys.title ? { name: base.sys.title } : {}),
    ...(keys.includes("images") ? { images: base.sys.imageRefs } : {}),
    ...(keys.includes("description") ? { description: base.sys.description } : {}),
  });
  const priceBase = lazadaPriceRowsFromView(v);
  const priceEdit = () => priceBase.map((r) => {
    const s = sysOf(base.sys, r.sellerSku);
    if (!s || s.price == null) return r;
    // ราคาลด: เปลี่ยนได้เฉพาะตัวที่มีช่วงวันอยู่แล้ว (ตั้งราคาลดใหม่ต้องกำหนดวันในลิ้นชัก)
    const special = s.special != null && r.from && r.to ? s.special : r.special;
    return { ...r, price: s.price, special };
  });
  const pricePlan = () => planLazadaPrices(priceBase, priceEdit());
  return {
    ...base, shop,
    cannot: (k) => k === "title" ? errs(planLazadaEdit(before, after(["title"])).errors)
      : k === "images" ? errs(planLazadaEdit(before, after(["images"])).errors)
      : k === "description" ? (foreignDescImages(base.sys.description).length ? "Lazada: รายละเอียดในระบบมีรูปที่ยังไม่ได้ฝากกับ Lazada — แก้ในลิ้นชักสินค้าบนร้าน" : errs(planLazadaEdit(before, after(["description"])).errors))
      : k === "options" ? OPT_CANNOT.lazada
      : k === "variant_images" ? errs(skuPlan().errors)
      : k === "desc_images" ? null
      : errs(pricePlan().errors),
    build: async (keys) => {
      const calls: DriftCall[] = [];
      const ek = keys.filter((k) => k === "title" || k === "images" || k === "description");
      const edit: LazadaEditState = after(ek);
      // รูปในรายละเอียด: ฝากรูปกับ Lazada ก่อน (/image/migrate · ยังไม่แก้สินค้า) แล้วต่อท้ายรายละเอียดแทนรูปเดิม
      if (keys.includes("desc_images") && base.sys.descImageRefs?.length) {
        const urls: string[] = [];
        for (const ref of base.sys.descImageRefs) {
          const key = ref.startsWith("r2:") ? ref.slice(3) : null;
          if (!key) { urls.push(ref); continue; }
          try { urls.push(await lazMigrateImage(live.gateway, live.accessToken, lazMigrateImageXml(`${publicImageUrl(key)}&w=1500`))); }
          catch (e) { throw new Error(`ฝากรูปในรายละเอียดกับ Lazada ไม่สำเร็จ (${urls.length + 1}/${base.sys.descImageRefs.length}): ${lazErrorText(e)} — ยังไม่ได้แก้อะไรบนร้าน`); }
        }
        edit.description = withDescImages(edit.description, urls);
      }
      const vi = keys.includes("variant_images");
      const textChanged = Object.keys(planLazadaEdit(before, edit).fields).length > 0;
      const labels = [...ek.map((k) => (k === "title" ? "ชื่อ" : k === "images" ? "รูป" : "รายละเอียด")), ...(keys.includes("desc_images") ? ["รูปในรายละเอียด"] : []), ...(vi ? ["รูปตัวเลือก"] : [])];
      if (textChanged || vi) calls.push({ url: "/api/lazada/listing-edit", label: labels.join(" + "), body: { listing_id: base.listingId, before, edit, ...(vi ? { sku_before: skuBefore, sku_edit: skuAfter } : {}) } });
      if (keys.includes("price") && pricePlan().changes.length) calls.push({ url: "/api/lazada/listing-prices", label: "ราคา", body: { listing_id: base.listingId, before: priceBase, edit: priceEdit() } });
      return calls;
    },
  };
}

/** รูปจากคลังรูปในระบบ → ฝากกับ TikTok เป็นรูปในรายละเอียด (DESCRIPTION_IMAGE) → ลิงก์ TikTok พร้อมขนาด (ตัวเดียวกับปุ่มแทรกรูปในลิ้นชัก) */
async function ttsDescImageFromRef(accessToken: string, ref: string): Promise<string> {
  const key = ref.startsWith("r2:") ? ref.slice(3) : null;
  if (!key) return ref;
  const res = await fetch(`${publicImageUrl(key)}&w=1500`, { cache: "no-store" });
  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !ct.startsWith("image/")) throw new Error(`โหลดรูปไม่ได้ (HTTP ${res.status})`);
  const bytes = await res.arrayBuffer();
  const name = `${key.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "image"}.${ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg"}`;
  let r;
  try { r = await ttsUploadImage(accessToken, bytes, name, ct, "DESCRIPTION_IMAGE"); }
  catch (e) { throw new Error(ttsErrorText(e)); }
  if (!r.url) throw new Error("TikTok ไม่ส่งลิงก์รูปกลับมา");
  return tiktokDescImageSrc(r.url, r.width, r.height);
}
/** รายละเอียด (HTML/ข้อความ) → เอารูปเดิมออก แล้วต่อรูปชุดใหม่ท้ายรายละเอียด */
function withDescImages(desc: string, srcs: string[]): string {
  const html = looksHtml(desc) ? desc : desc.split(/\n/).map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") || "<br>"}</p>`).join("");
  const stripped = html.replace(/<img\b[^>]*>/gi, "").replace(/<p>\s*<\/p>/gi, "");
  return `${stripped}${srcs.map((s) => `<p><img src="${s}" /></p>`).join("")}`;
}

function tiktokCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, v: TiktokListingView, live: { accessToken: string }): Ctx {
  const media = tiktokMediaBase(v);
  const baseUris = media.images.map((i) => i.uri);
  const baseDesc = v.pendingDescription ?? v.description;
  const baseTitle = v.pendingTitle ?? v.title;
  const titlePlan = () => planTiktokTitle(baseTitle, base.sys.title ?? "");
  const shop: ShopValues = {
    title: baseTitle, description: baseDesc, imageCount: baseUris.length, imageSig: listSig(baseUris), imageUrls: media.images.map((i) => i.url), descImageUrls: descImages(baseDesc),
    variants: v.skus.map((s) => ({ code: s.sellerSku, label: s.label, values: s.attrs.map((a) => a.valueName ?? "").filter(Boolean), price: s.price, image: s.attrs.find((a) => a.img)?.img?.url ?? null })),
  };
  const mediaPlan = () => planTiktokMedia(baseUris, media.pkg, base.sys.imageRefs, media.pkg);
  const descPlan = () => planTiktokDescription(baseDesc, base.sys.description);
  // ชื่อตัวเลือก: ค่าตัวเลือกในระบบตามลำดับชั้น ↔ attrs ของ SKU ที่รหัสตรงกัน
  const groups = tiktokOptionGroups(v.skus);
  const form0 = tiktokSkuFormOf(groups);
  const optForm = (): { names: Record<string, string>; conflict: string | null } => {
    const names = { ...form0.names }, set = new Map<string, string>();
    for (const s of v.skus) {
      const sv = sysOf(base.sys, s.sellerSku);
      if (!sv) continue;
      s.attrs.forEach((a, i) => {
        const want = sv.values[i]?.trim();
        if (!want) return;
        const g = groups.find((x) => (a.id ? x.id === a.id : x.name === (a.name ?? "").trim()));
        const val = g?.values.find((x) => x.skuIds.includes(s.skuId));
        if (!g || !val) return;
        const k = tiktokOptNameKey(g.key, val.key);
        const prev = set.get(k);
        if (prev && prev !== want) return;
        set.set(k, want); names[k] = want;
      });
    }
    for (const [k, w] of set) if (names[k] !== w) return { names, conflict: k };
    return { names, conflict: null };
  };
  // รูปตัวเลือก: ชั้นหลัก (สี) ต้องมีรูปครบทุกค่า (กฎ TikTok) — ค่าละ 1 รูปจากรูปตัวเลือกในระบบของ SKU ที่รหัสตรงกัน
  const primary = groups.find((g) => g.key === form0.primary) ?? null;
  const vimg = (): { images: Record<string, string | null>; missing: string[] } => {
    const images = { ...form0.images }, missing: string[] = [];
    for (const val of primary?.values ?? []) {
      const sku = v.skus.find((s) => val.skuIds.includes(s.skuId));
      const ref = sku ? sysOf(base.sys, sku.sellerSku)?.image ?? null : null;
      if (ref) images[val.key] = ref; else missing.push(val.name);
    }
    return { images, missing };
  };
  const skuForm = (keys: DriftKey[]) => ({ ...form0, names: keys.includes("options") ? optForm().names : form0.names, images: keys.includes("variant_images") ? vimg().images : form0.images });
  const skuPlan = (keys: DriftKey[] = ["options"]) => planTiktokSkuEdit(groups, skuForm(keys), { status: v.status, hasDraft: v.hasDraft });
  const priceBase = tiktokPriceRowsFromView(v);
  const priceEdit = () => priceBase.map((r) => { const s = sysOf(base.sys, r.sellerSku); return s?.price != null ? { ...r, price: s.price } : r; });
  const pricePlan = () => planTiktokPrices(priceBase, priceEdit());
  return {
    ...base, shop,
    cannot: (k) => k === "title" ? errs(titlePlan().errors)
      : k === "images" ? errs(mediaPlan().errors)
      : k === "description" ? errs(descPlan().errors)
      : k === "options" ? (groups.length ? errs(skuPlan(["options"]).errors) : "สินค้านี้บน TikTok ไม่มีตัวเลือก")
      : k === "variant_images" ? (!primary ? "สินค้านี้บน TikTok ไม่มีตัวเลือก" : vimg().missing.length ? `TikTok ต้องมีรูปครบทุก${primary.name} — ระบบยังไม่มีรูปของ ${vimg().missing.join(", ")}` : errs(skuPlan(["variant_images"]).errors))
      : k === "desc_images" ? null
      : (tiktokPriceBlock(v) ?? errs(pricePlan().errors)),
    build: async (keys) => {
      const calls: DriftCall[] = [];
      if (keys.includes("price") && pricePlan().changes.length) calls.push({ url: "/api/tiktok-shop/listing-prices", label: "ราคา", body: { listing_id: base.listingId, before: priceBase, edit: priceEdit() } });
      const body: Record<string, unknown> = { listing_id: base.listingId };
      const labels: string[] = [];
      if (keys.includes("title")) { const p = titlePlan(); if (p.changed) { body.before_title = baseTitle; body.title = p.title; labels.push("ชื่อ"); } }
      // รายละเอียด (+ รูปในรายละเอียด: ฝากกับ TikTok แบบ DESCRIPTION_IMAGE ก่อน แล้วต่อท้ายแทนรูปเดิม · ยังไม่แก้สินค้า)
      let descHtml = keys.includes("description") ? base.sys.description : null;
      if (keys.includes("desc_images") && base.sys.descImageRefs?.length) {
        const srcs: string[] = [];
        for (const ref of base.sys.descImageRefs) {
          try { srcs.push(await ttsDescImageFromRef(live.accessToken, ref)); }
          catch (e) { throw new Error(`ฝากรูปในรายละเอียดกับ TikTok ไม่สำเร็จ (${srcs.length + 1}/${base.sys.descImageRefs.length}): ${(e as Error).message} — ยังไม่ได้แก้อะไรบนร้าน`); }
        }
        descHtml = withDescImages(descHtml ?? baseDesc, srcs);
        labels.push("รูปในรายละเอียด");
      }
      if (descHtml != null) {
        const p = planTiktokDescription(baseDesc, descHtml);
        if (p.errors.length) throw new Error(`รายละเอียด TikTok ไม่ผ่าน: ${p.errors.join(" · ")}`);
        if (p.changed) { body.before_description = baseDesc; body.description = p.html; if (keys.includes("description")) labels.push("รายละเอียด"); }
      }
      if (keys.includes("images")) { const p = mediaPlan(); if (p.imagesChanged) { body.media = { before_uris: baseUris, before_pkg: media.pkg, images: p.images, pkg: media.pkg }; labels.push("รูป"); } }
      const sk = keys.filter((k) => k === "options" || k === "variant_images");
      if (sk.length && groups.length) {
        const p = skuPlan(sk);
        if (p.namesChanged || p.imagesChanged) { const f = skuForm(sk); body.skus = { before_sig: tiktokSkuSignature(v.skus), primary: f.primary, images: f.images, names: f.names }; if (p.namesChanged) labels.push("ชื่อตัวเลือก"); if (p.imagesChanged) labels.push("รูปตัวเลือก"); }
      }
      if (labels.length) calls.push({ url: "/api/tiktok-shop/listing-edit", label: labels.join(" + "), body });
      return calls;
    },
  };
}

function lineCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, state: LineEditState, rawLine: Record<string, unknown> | null): Ctx {
  const rawVars = Array.isArray(rawLine?.variants) ? rawLine!.variants as Record<string, unknown>[] : [];
  const valuesOf = (id: string) => {
    const rv = rawVars.find((x) => String(x.id ?? "") === id);
    return (Array.isArray(rv?.options) ? rv!.options as Record<string, unknown>[] : []).map((o) => String(o.value ?? "").trim()).filter(Boolean);
  };
  const shopDescImgs = descImages(state.description);
  const shop: ShopValues = {
    title: state.name, description: state.description, imageCount: state.images.length, imageSig: listSig(state.images), imageUrls: state.images, descImageUrls: shopDescImgs,
    variants: state.variants.map((x) => ({ code: x.sku, label: x.label, values: valuesOf(x.id), price: x.price, pay: x.pay, image: x.imageUrl })),
  };
  const merged = (keys: DriftKey[]): LineEditState => {
    const vi = keys.includes("variant_images"), pr = keys.includes("price");
    return {
      ...state,
      ...(keys.includes("title") && base.sys.title ? { name: base.sys.title } : {}),
      ...(keys.includes("images") ? { images: base.sys.imageRefs } : {}),
      ...(keys.includes("description") ? { description: base.sys.description } : {}),
      ...(vi || pr ? {
        variants: state.variants.map((x) => {
          const s = sysOf(base.sys, x.sku); if (!s) return x;
          return { ...x, ...(pr && s.price != null ? { price: s.price, pay: s.pay ?? s.price } : {}), ...(vi && s.image ? { imageUrl: s.image } : {}) };
        }),
      } : {}),
    };
  };
  const displayOn = rawLine?.isDisplay !== false;
  return {
    ...base, shop,
    cannot: (k) => k === "options" ? OPT_CANNOT.line_shopping
      // LINE ใส่รูปในรายละเอียดได้ผ่านแกลเลอรีชั่วคราว → เฉพาะสินค้าที่ปิดขาย (route /api/line-shopping/desc-images)
      : k === "desc_images" ? (displayOn ? "LINE: ใส่รูปในรายละเอียดได้เฉพาะสินค้าที่ปิดขาย (กฎของ LINE) — ปิดขายชั่วคราวในลิ้นชักสินค้าบนร้านก่อนแล้วค่อยส่ง" : null)
      : errs(planLineEdit(state, merged([k])).errors),
    build: async (keys) => {
      const calls: DriftCall[] = [];
      const ek = keys.filter((k) => k !== "options" && k !== "desc_images");
      const plan = planLineEdit(state, merged(ek));
      if (Object.keys(plan.fields).length || plan.prices || plan.variantDetails) {
        calls.push({ url: "/api/line-shopping/listing-edit", label: ek.map((k) => (k === "title" ? "ชื่อ" : k === "images" ? "รูป" : k === "description" ? "รายละเอียด" : k === "variant_images" ? "รูปตัวเลือก" : "ราคา")).join(" + "), body: { listing_id: base.listingId, edit: merged(ek) } });
      }
      if (keys.includes("desc_images") && base.sys.descImageRefs?.length) {
        // LINE ต่อรูปท้ายรายละเอียดได้อย่างเดียว (ลบรูปเดิมไม่ได้) → มีรูปเดิมอยู่ ต้องเขียนรายละเอียดใหม่ (ติ๊ก "รายละเอียด") ไปด้วย
        if (shopDescImgs.length && !keys.includes("description")) throw new Error(`LINE ต่อรูปท้ายรายละเอียดได้อย่างเดียว ลบรูปเดิม ${shopDescImgs.length} รูปไม่ได้ — ติ๊ก "รายละเอียด" ด้วย เพื่อเขียนรายละเอียดใหม่ก่อนต่อรูป`);
        calls.push({ url: "/api/line-shopping/desc-images", label: "รูปในรายละเอียด", body: { listing_id: base.listingId, image_keys: base.sys.descImageRefs.map((r) => (r.startsWith("r2:") ? r.slice(3) : r)).slice(0, 15) } });
      }
      return calls;
    },
  };
}

// ───────── ประกอบทั้งหมด ─────────
type ListingRowLite = { id: string; platform_id: string; external_product_id: string | null; brand_id: string | null; matched_parent_sku_id: string | null; status: string | null; raw: Record<string, unknown> | null };

async function loadCtx(admin: Admin, listingId: string, userId: string | null): Promise<{ ok: true; ctx: Ctx; row: ListingRowLite } | DriftFail> {
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, external_product_id, brand_id, matched_parent_sku_id, status, raw").eq("id", listingId).maybeSingle();
  const row = l as ListingRowLite | null;
  if (!row) return { ok: false, error: "ไม่พบสินค้านี้บนร้าน (อาจถูกลบไปแล้ว)", status: 404 };
  if (isGoneStatus(row.status)) return { ok: false, error: "สินค้านี้ไม่อยู่บนร้านแล้ว", status: 400 };
  if (!row.matched_parent_sku_id) return { ok: false, error: "ยังไม่ได้จับคู่กับสินค้าในระบบ — จับคู่ก่อนถึงจะเทียบได้", status: 400 };
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  const code = String((pf as { code?: string } | null)?.code ?? "");
  if (!isDriftPlatform(code)) return { ok: false, error: "ร้านนี้ไม่ต้องตรวจ (เว็บของเราใช้ข้อมูลจากระบบอยู่แล้ว)", status: 400 };
  const sysR = await systemValues(admin, code, row.matched_parent_sku_id, userId);
  if (!sysR.ok) return { ok: false, error: `อ่านข้อมูลสินค้าในระบบไม่ได้: ${sysR.error}`, status: 400 };
  const sync = (row.raw?.sys_sync && typeof row.raw.sys_sync === "object" ? row.raw.sys_sync : null) as SysSync | null;
  const [descGuard, title, descRefs] = await Promise.all([
    descriptionGuard(admin, code, row.matched_parent_sku_id, row.platform_id, sysR.descSrc),
    systemTitle(admin, code, row.matched_parent_sku_id, row.platform_id),
    loadDescImageRefs(admin, row.matched_parent_sku_id),
  ]);
  sysR.sys.title = title.text;
  sysR.sys.descImageRefs = descRefs;
  const base = { code, listingId, parentId: row.matched_parent_sku_id, sys: sysR.sys, sync, descGuard, titleHistory: title.history };

  if (code === "shopee") {
    const r = await loadShopeeListingLive(admin, listingId, userId);
    if (!r.ok) return r;
    return { ok: true, row, ctx: shopeeCtx(base, r.view) };
  }
  if (code === "lazada") {
    const r = await loadLazListingLive(admin, listingId, userId);
    if (!r.ok) return r;
    const v = lazadaListingView(r.item);
    if (!v) return { ok: false, error: "อ่านสินค้าจาก Lazada ไม่ได้", status: 502 };
    return { ok: true, row, ctx: lazadaCtx(base, v, { gateway: r.gateway, accessToken: r.accessToken }) };
  }
  if (code === "tiktok") {
    const r = await loadTtsListingLive(admin, listingId, userId);
    if (!r.ok) return r;
    const v = await ttsViewWithReview(r.accessToken, r.cipher, r.detail);
    if (!v) return { ok: false, error: "อ่านสินค้าจาก TikTok ไม่ได้", status: 502 };
    return { ok: true, row, ctx: tiktokCtx(base, v, { accessToken: r.accessToken }) };
  }
  // LINE — ไม่มีตัวดึงสดในลิ้นชัก: ดึงจาก LINE แล้วอัปเดตสำเนาในระบบ (route แก้สินค้า LINE ใช้สำเนานี้เป็น "ก่อนแก้")
  const pid = String(row.external_product_id ?? "").trim();
  if (!pid) return { ok: false, error: "รายการนี้ไม่มีรหัสสินค้าบน LINE", status: 400 };
  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return { ok: false, error: key.error ?? "ยังไม่ได้ใส่ API Key ของ LINE", status: 400 };
  const fresh = await lineGetProduct(key.apiKey, pid);
  if (!fresh.ok || !fresh.row) return { ok: false, error: `ดึงสินค้าจาก LINE ไม่ได้: ${fresh.error ?? "ไม่ทราบสาเหตุ"}`, status: 502 };
  await admin.from("platform_catalog_listings").update({ raw: { ...(row.raw ?? {}), line: fresh.row }, updated_at: new Date().toISOString() }).eq("id", listingId);
  row.raw = { ...(row.raw ?? {}), line: fresh.row };
  const state = lineEditStateFromRaw(fresh.row);
  if (!state) return { ok: false, error: "อ่านสินค้าจาก LINE ไม่ได้", status: 502 };
  return { ok: true, row, ctx: lineCtx(base, state, fresh.row as Record<string, unknown>) };
}

/**
 * รายละเอียดฝั่งระบบมาจากร่างของร้านที่ "แก้ไว้" (ตัวเตรียมข้อมูลถือว่าร่างชนะ Platform Description) → ต้องเตือน
 * 🐛 2026-11-21 LY22: ร่าง Lazada/Shopee เตรียมไว้ตอนข้อความสินค้ายังเป็นของ LY21 (คัดลอกมา) → หลังแก้สินค้า ร่างค้างข้อความเก่า
 *    แต่ถูกนับเป็น "แก้เอง" → หน้าเทียบจะส่งข้อความ LY21 ทับ LY22 · ร่างมีข้อความขึ้นต้นเหมือนสินค้าอื่น = ห้ามส่ง (ไม่แตะร่าง ให้คนแก้)
 */
async function descriptionGuard(admin: Admin, code: string, parentId: string, platformId: string, descSrc: string): Promise<Ctx["descGuard"]> {
  if (!/^แก้ไว้สำหรับ/.test(descSrc)) return { note: null, block: null };
  const shop = ({ shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE" } as Record<string, string>)[code] ?? code;
  const note = `ตรวจก่อนส่ง: รายละเอียดฝั่งระบบมาจากร่าง ${shop} ที่แก้ไว้ ไม่ใช่ Platform Description ล่าสุดของสินค้า (แก้ได้ที่ปุ่ม "ร่างในระบบ")`;
  try {
    const { data: d } = await admin.from("platform_listing_drafts").select("description").eq("parent_sku_id", parentId).eq("platform_id", platformId).maybeSingle();
    const head = plainText((d as { description?: string | null } | null)?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`);
    if (head.length < 40) return { note, block: null };
    const [a, b] = await Promise.all([
      admin.from("parent_skus_v2").select("code").neq("id", parentId).ilike("platform_description", `${head}%`).limit(5),
      admin.from("parent_skus_v2").select("code").neq("id", parentId).ilike("description", `${head}%`).limit(5),
    ]);
    const others = [...new Set([...(a.data ?? []), ...(b.data ?? [])].map((r) => String((r as { code?: string }).code ?? "")).filter(Boolean))];
    if (!others.length) return { note, block: null };
    return { note, block: `ห้ามส่ง: ร่าง ${shop} ของสินค้านี้มีรายละเอียดขึ้นต้นเหมือนสินค้าอื่น (${others.slice(0, 4).join(", ")}${others.length > 4 ? " …" : ""}) — น่าจะคัดลอกมาผิดรุ่น แก้ร่างที่ปุ่ม "ร่างในระบบ" ก่อน` };
  } catch { return { note, block: null }; }
}

/**
 * ชื่อที่ควรอยู่บนร้าน = ตัวเลือกชื่อกลาง (lib/listing-title): ร่างที่คนแก้เอง → ชื่อสำหรับแพลตฟอร์ม → ชื่อสินค้า
 * ร่างที่เก็บชื่อเวอร์ชันเก่าไว้ (สำเนาตอนเตรียม) = ใช้ชื่อล่าสุด — 🐛 2026-11-21 LY22 ร่าง Shopee/Lazada เก็บชื่อเก่า เช็กเลยบอก "ตรง"
 */
async function systemTitle(admin: Admin, code: string, parentId: string, platformId: string): Promise<{ text: string; history: string[] }> {
  const shop = ({ shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE" } as Record<string, string>)[code] ?? code;
  const [{ data: p }, { data: d }, hTh, hPf] = await Promise.all([
    admin.from("parent_skus_v2").select("name_th, name_platform").eq("id", parentId).maybeSingle(),
    admin.from("platform_listing_drafts").select("title").eq("parent_sku_id", parentId).eq("platform_id", platformId).maybeSingle(),
    loadFieldHistoryValues(admin as Parameters<typeof loadFieldHistoryValues>[0], "parent_skus_v2", parentId, "name_th"),
    loadFieldHistoryValues(admin as Parameters<typeof loadFieldHistoryValues>[0], "parent_skus_v2", parentId, "name_platform"),
  ]);
  const pr = (p ?? {}) as { name_th?: string | null; name_platform?: string | null };
  const history = [...hTh, ...hPf];
  return { text: pickListingTitle((d as { title?: string | null } | null)?.title ?? null, { name_th: pr.name_th ?? null, name_platform: pr.name_platform ?? null, name_history: history }, shop).text, history };
}
const normTitle = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

/** เรื่องรูป (เทียบที่อยู่รูปตรง ๆ ไม่ได้) = "บอกไม่ได้" ก็ติ๊กส่งครั้งแรกได้ แล้วระบบจำชุดที่ส่งไว้เทียบรอบหน้า */
const FIRST_SEND_KEYS: DriftKey[] = ["images", "desc_images", "variant_images"];

/** รูปในรายละเอียดของ Parent SKU ("รูป Description" — asset_usages module parent_sku_description → assets.r2_key · ลำดับตามที่จัด) */
async function loadDescImageRefs(admin: Admin, parentId: string): Promise<string[]> {
  try {
    const { data: us } = await admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku_description").eq("record_id", parentId).order("sort_order", { ascending: true });
    const ids = ((us ?? []) as { asset_id: string }[]).map((u) => u.asset_id).filter(Boolean);
    if (!ids.length) return [];
    const { data: as } = await admin.from("assets").select("id, r2_key").in("id", ids);
    const keyOf = new Map(((as ?? []) as { id: string; r2_key: string | null }[]).map((a) => [a.id, String(a.r2_key ?? "").trim()]));
    return [...new Set(ids.map((id) => keyOf.get(id) ?? "").filter(Boolean))].map((k) => `r2:${k}`);
  } catch { return []; }
}

function itemsOf(ctx: Ctx): DriftItem[] {
  return compareAll(ctx.sys, ctx.shop, ctx.sync).map((raw) => {
    // รายละเอียดจากร่างที่แก้ไว้ → เตือน (ไม่ติ๊กไว้ให้) · ร่างมีข้อความของสินค้าอื่น → ห้ามส่ง
    let it = raw.key === "description" && ctx.descGuard.note ? { ...raw, note: [ctx.descGuard.note, raw.note].filter(Boolean).join(" · ") } : raw;
    // ชื่อ: ร้านเก็บชื่อเวอร์ชันเก่าของสินค้า = ติ๊กส่งไว้ให้ · ร้านตั้งชื่อเอง (มักเพิ่มคำค้น) = เตือนก่อนส่ง ไม่ติ๊กให้
    if (it.key === "title" && it.state === "diff") {
      const stale = ctx.titleHistory.map(normTitle).includes(normTitle(ctx.shop.title));
      it = { ...it, note: stale ? "ชื่อบนร้านเป็นชื่อเวอร์ชันเก่าของสินค้า" : "ตรวจก่อนส่ง: ชื่อบนร้านตั้งต่างจากระบบ (อาจเพิ่มคำค้นไว้) — ส่งแล้วจะทับชื่อบนร้าน" };
    }
    if (it.key === "description" && ctx.descGuard.block && (it.state === "diff" || it.state === "unknown")) return { ...it, sendable: false, cannot: ctx.descGuard.block };
    if (it.state !== "diff" && it.state !== "unknown") return { ...it, sendable: false, cannot: null };
    if (it.key === "images" && it.state === "unknown" && !ctx.sys.imageRefs.length) return { ...it, sendable: false, cannot: null };
    if (it.key === "desc_images" && it.state === "unknown" && !ctx.sys.descImageRefs?.length) return { ...it, sendable: false, cannot: null };
    if (it.key === "variant_images" && it.state === "unknown" && !ctx.sys.variants.some((x) => x.image)) return { ...it, sendable: false, cannot: null };
    if (it.state === "unknown" && !FIRST_SEND_KEYS.includes(it.key)) return { ...it, sendable: false, cannot: null };
    if (it.key === "attrs" && ctx.code !== "shopee") return { ...it, sendable: false, cannot: "ยังส่งข้อมูลจำเพาะของร้านนี้จากระบบไม่ได้ — แก้ในลิ้นชักสินค้าบนร้าน" };
    let cannot: string | null;
    try { cannot = ctx.cannot(it.key); } catch (e) { cannot = (e as Error).message || "ตรวจไม่ได้"; }
    return { ...it, sendable: !cannot, cannot };
  });
}

async function saveCheck(admin: Admin, c: { listing_id: string; parent_sku_id: string | null; platform_code: string; items: DriftItem[] | null; issues: DriftKey[]; error: string | null }) {
  // รูป/ข้อความเต็มใช้แค่ตอนเปิดหน้าเทียบ (ตรวจสด) — ไม่จดลงตาราง กันตารางบวม
  const items = c.items?.map(({ media: _m, text: _t, table: _tb, ...rest }) => rest) ?? null;
  await admin.from("platform_listing_drift").upsert({ ...c, items, checked_at: new Date().toISOString() }, { onConflict: "listing_id" });
}

/** ตรวจ 1 รายการบนร้าน (ดึงสดทั้ง 2 ฝั่ง) + จดผล · ไม่ throw */
export async function checkListingDrift(admin: Admin, listingId: string, userId: string | null): Promise<DriftCheck | DriftFail> {
  try {
    const r = await loadCtx(admin, listingId, userId);
    if (!r.ok) {
      if (r.status !== 404) {
        const { data } = await admin.from("platform_catalog_listings").select("matched_parent_sku_id, platform_id").eq("id", listingId).maybeSingle();
        const { data: pf } = data ? await admin.from("erp_platforms").select("code").eq("id", (data as { platform_id: string }).platform_id).maybeSingle() : { data: null };
        const code = String((pf as { code?: string } | null)?.code ?? "");
        if (isDriftPlatform(code)) await saveCheck(admin, { listing_id: listingId, parent_sku_id: (data as { matched_parent_sku_id: string | null } | null)?.matched_parent_sku_id ?? null, platform_code: code, items: null, issues: [], error: r.error });
      }
      return r;
    }
    const items = itemsOf(r.ctx);
    const issues = driftIssues(items);
    await saveCheck(admin, { listing_id: listingId, parent_sku_id: r.ctx.parentId, platform_code: r.ctx.code, items, issues, error: null });
    const { data: acct } = r.row.brand_id ? await admin.from("platform_accounts").select("external_shop_id").eq("brand_id", r.row.brand_id).eq("platform_id", r.row.platform_id).maybeSingle() : { data: null };
    return {
      ok: true, listing_id: listingId, platform_code: r.ctx.code, parent_sku_id: r.ctx.parentId, items, issues, checked_at: new Date().toISOString(),
      external_product_id: r.row.external_product_id, shop_ref: (acct as { external_shop_id?: string | null } | null)?.external_shop_id ?? null, listing_status: r.row.status,
      sys: sysViewOf(r.ctx.sys),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "ตรวจไม่สำเร็จ", status: 500 };
  }
}

/** ประกอบคำสั่งส่งของเรื่องที่เลือก (ดึงสดใหม่ทุกครั้ง) — เรื่องที่ส่งไม่ได้ถูกตัดออก + บอกเหตุผล */
export async function buildDriftCalls(admin: Admin, listingId: string, keys: DriftKey[], userId: string | null): Promise<{ ok: true; calls: DriftCall[]; skipped: { key: DriftKey; reason: string }[]; items: DriftItem[] } | DriftFail> {
  const r = await loadCtx(admin, listingId, userId);
  if (!r.ok) return r;
  const items = itemsOf(r.ctx);
  const skipped: { key: DriftKey; reason: string }[] = [];
  const ok = keys.filter((k) => {
    const it = items.find((i) => i.key === k);
    if (!it || (it.state !== "diff" && !(FIRST_SEND_KEYS.includes(k) && it.state === "unknown"))) { skipped.push({ key: k, reason: "ตรงกับระบบแล้ว" }); return false; }
    if (!it.sendable) { skipped.push({ key: k, reason: it.cannot ?? "ส่งไม่ได้" }); return false; }
    return true;
  });
  try { return { ok: true, calls: ok.length ? await r.ctx.build(ok) : [], skipped, items }; }
  catch (e) { return { ok: false, error: (e as Error).message || "ประกอบคำสั่งไม่สำเร็จ", status: 400 }; }
}

/** ค่าฝั่งระบบสำหรับเติมฟอร์มลิ้นชัก (ไม่จดลงตาราง) */
function sysViewOf(sys: SystemValues): DriftSysView {
  return {
    title: sys.title ?? null, description: sys.description, imageRefs: sys.imageRefs, descImageRefs: sys.descImageRefs ?? [],
    prices: sys.variants.map((v) => ({ code: v.code, price: v.price })), attrs: sys.attrs ?? null, attrNames: sys.attrNames ?? null,
    variants: sys.variants.map((v) => ({ code: v.code, values: v.values, image: v.image ?? null })),
  };
}

/**
 * สีในระบบของสินค้าที่จับคู่ (แท็บตัวเลือกในลิ้นชัก · 2026-11-24) — ตัวประกอบข้อมูลเดียวกับตัวช่วยลงสินค้าของร้านนั้น
 * + สต๊อกในระบบ (TikTok/LINE ต้องใส่สต๊อกตอนเพิ่มสี) + เปิดใช้ไหม · ไม่ดึงร้าน ไม่จดอะไร
 */
export async function listingSysVariants(admin: Admin, listingId: string, userId: string | null): Promise<{ ok: true; platform_code: string; variants: SysVariantView[] } | DriftFail> {
  const { data: l } = await admin.from("platform_catalog_listings").select("platform_id, matched_parent_sku_id, status").eq("id", listingId).maybeSingle();
  const row = l as { platform_id: string; matched_parent_sku_id: string | null; status: string | null } | null;
  if (!row) return { ok: false, error: "ไม่พบสินค้านี้บนร้าน", status: 404 };
  if (!row.matched_parent_sku_id) return { ok: false, error: "ยังไม่ได้จับคู่กับสินค้าในระบบ", status: 400 };
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  const code = String((pf as { code?: string } | null)?.code ?? "");
  if (!isDriftPlatform(code)) return { ok: false, error: "ร้านนี้ไม่รองรับ", status: 400 };
  const [sysR, skuR] = await Promise.all([
    systemValues(admin, code, row.matched_parent_sku_id, userId),
    admin.from("skus_v2").select("id, code, is_active").eq("parent_sku_id", row.matched_parent_sku_id),
  ]);
  if (!sysR.ok) return { ok: false, error: `อ่านข้อมูลสินค้าในระบบไม่ได้: ${sysR.error}`, status: 400 };
  const skus = (skuR.data ?? []) as { id: string; code: string; is_active: boolean | null }[];
  const byCode = new Map(skus.map((s) => [s.code.trim().toUpperCase(), s]));
  const stock = await loadSkuStock(admin, skus.map((s) => s.id)).catch(() => new Map<string, { onHand: number; reserved: number }>());
  const variants: SysVariantView[] = sysR.sys.variants.map((v) => {
    const s = byCode.get(v.code.trim().toUpperCase());
    const st = s ? stock.get(s.id) : undefined;
    return { code: v.code, values: v.values, price: v.price ?? null, image: v.image ?? null, stock: st ? Math.max(0, st.onHand - st.reserved) : null, active: s ? s.is_active !== false : true };
  });
  return { ok: true, platform_code: code, variants };
}

// ───────── "ให้ระบบใช้ค่านี้" (เจ้าของเลือก 2026-11-23 ข้อ 1): ค่าบนร้าน → ร่างของร้านนี้ (ไม่แตะ Parent SKU ที่ใช้ทุกร้าน) ─────────
type DraftCols = { title: string | null; description: string | null; extra: Record<string, unknown> | null };
/** ช่องในร่างของแต่ละเรื่อง — attrs เฉพาะ Shopee (extra.shopee_attrs · ตัวช่วยลงสินค้าอ่านค่านี้) */
const ADOPT_EXTRA: Partial<Record<string, string>> = { shopee: "shopee_attrs" };
export type AdoptResult = { ok: true; before: unknown; after: unknown; label: string; check: DriftCheck | DriftFail } | DriftFail;

async function writeDraftField(admin: Admin, parentId: string, platformId: string, code: string, key: DriftKey, value: unknown, userId: string | null, meta: Record<string, unknown>): Promise<{ before: unknown } | { error: string }> {
  const { data } = await admin.from("platform_listing_drafts").select("title, description, extra").eq("parent_sku_id", parentId).eq("platform_id", platformId).maybeSingle();
  const d = (data ?? { title: null, description: null, extra: null }) as DraftCols;
  const extraKey = ADOPT_EXTRA[code];
  let before: unknown; const patch: Record<string, unknown> = {};
  if (key === "title") { before = d.title; patch.title = value; }
  else if (key === "description") { before = d.description; patch.description = value; }
  else if (key === "attrs" && extraKey) {
    before = d.extra?.[extraKey] ?? null;
    const extra = { ...(d.extra ?? {}) }; if (value == null) delete extra[extraKey]; else extra[extraKey] = value;
    patch.extra = extra;
  } else return { error: ADOPT_CANNOT[key] ?? "เรื่องนี้ให้ระบบใช้ตามร้านไม่ได้" };
  const { error } = await admin.from("platform_listing_drafts").upsert({ parent_sku_id: parentId, platform_id: platformId, ...patch, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "parent_sku_id,platform_id" });
  if (error) return { error: error.message };
  const field = key === "attrs" ? `extra.${extraKey}` : key;
  await writeAudit(admin, {
    action: "update", entityType: "platform_listing_draft", entityId: null, actorId: userId, actorName: null,
    metadata: { parent_sku_id: parentId, platform_id: platformId, source: "drift_adopt", key, changes: auditDiff({ [field]: before ?? null }, { [field]: value ?? null }), ...meta },
  });
  return { before };
}

/** เขียนค่าบนร้านตอนนี้ลงร่างของร้านนี้ แล้วตรวจใหม่ · คืน before ไว้ย้อนกลับ */
export async function adoptShopValue(admin: Admin, listingId: string, key: DriftKey, userId: string | null): Promise<AdoptResult> {
  if (!ADOPT_KEYS.includes(key)) return { ok: false, error: ADOPT_CANNOT[key] ?? "เรื่องนี้ให้ระบบใช้ตามร้านไม่ได้", status: 400 };
  const r = await loadCtx(admin, listingId, userId);
  if (!r.ok) return r;
  const c = r.ctx;
  if (key === "attrs" && !ADOPT_EXTRA[c.code]) return { ok: false, error: "ร้านนี้ยังให้ระบบใช้ข้อมูลจำเพาะตามร้านไม่ได้", status: 400 };
  const value = key === "title" ? (c.shop.title ?? "").trim() : key === "description" ? c.shop.description : { ...(c.shop.attrs ?? {}) };
  if (key !== "attrs" && !String(value).trim()) return { ok: false, error: "ค่าบนร้านว่าง — ไม่บันทึกทับ", status: 400 };
  const w = await writeDraftField(admin, c.parentId!, r.row.platform_id, c.code, key, value, userId, { listing_id: listingId, direction: "shop_to_draft" });
  if ("error" in w) return { ok: false, error: w.error, status: 400 };
  return { ok: true, before: w.before, after: value, label: key === "attrs" ? "ข้อมูลจำเพาะ" : key === "title" ? "ชื่อสินค้า" : "รายละเอียด", check: await checkListingDrift(admin, listingId, userId) };
}

/** ย้อน "ให้ระบบใช้ค่านี้" — คืนค่าเดิมในร่าง (null = ลบค่าที่ร่างเคยไม่มี) */
export async function undoAdopt(admin: Admin, listingId: string, key: DriftKey, before: unknown, userId: string | null): Promise<{ ok: true; check: DriftCheck | DriftFail } | DriftFail> {
  if (!ADOPT_KEYS.includes(key)) return { ok: false, error: "ย้อนเรื่องนี้ไม่ได้", status: 400 };
  const { data: l } = await admin.from("platform_catalog_listings").select("platform_id, matched_parent_sku_id").eq("id", listingId).maybeSingle();
  const row = l as { platform_id: string; matched_parent_sku_id: string | null } | null;
  if (!row?.matched_parent_sku_id) return { ok: false, error: "ไม่พบสินค้าที่จับคู่ไว้", status: 404 };
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  const code = String((pf as { code?: string } | null)?.code ?? "");
  const w = await writeDraftField(admin, row.matched_parent_sku_id, row.platform_id, code, key, before ?? null, userId, { listing_id: listingId, direction: "undo_adopt" });
  if ("error" in w) return { ok: false, error: w.error, status: 400 };
  return { ok: true, check: await checkListingDrift(admin, listingId, userId) };
}

/** หลังส่งสำเร็จ: จำชุดรูปที่ส่งจากระบบ (ไว้เทียบรอบหน้า) แล้วตรวจใหม่ */
export async function markDriftSent(admin: Admin, listingId: string, keys: DriftKey[], userId: string | null): Promise<DriftCheck | DriftFail> {
  if (keys.some((k) => FIRST_SEND_KEYS.includes(k))) {
    const r = await loadCtx(admin, listingId, userId);
    if (r.ok) {
      const c = r.ctx;
      const sync: SysSync = {
        ...(c.sync ?? {}),
        ...(keys.includes("images") ? { images_sys: listSig(c.sys.imageRefs), images_shop: c.shop.imageSig, images_at: new Date().toISOString() } : {}),
        ...(keys.includes("desc_images") ? { desc_images_sys: listSig(c.sys.descImageRefs ?? []), desc_images_shop: listSig(c.shop.descImageUrls ?? descImages(c.shop.description)) } : {}),
        ...(keys.includes("variant_images") ? { vimg_sys: sysVariantImageSig(c.sys), vimg_shop: shopVariantImageSig(c.shop) } : {}),
      };
      const { data } = await admin.from("platform_catalog_listings").select("raw").eq("id", listingId).maybeSingle();
      const raw = ((data as { raw?: Record<string, unknown> | null } | null)?.raw ?? {}) as Record<string, unknown>;
      await admin.from("platform_catalog_listings").update({ raw: { ...raw, sys_sync: sync } }).eq("id", listingId);
    }
  }
  return checkListingDrift(admin, listingId, userId);
}

/** รายการบนร้านที่จับคู่สินค้านี้ (ยังอยู่บนร้าน · ร้านที่ตรวจได้) */
export async function driftListingsOfParent(admin: Admin, parentId: string): Promise<{ id: string; platform_code: string }[]> {
  const [{ data: ls }, { data: pfs }] = await Promise.all([
    admin.from("platform_catalog_listings").select("id, platform_id, status").eq("matched_parent_sku_id", parentId).limit(100),
    admin.from("erp_platforms").select("id, code"),
  ]);
  const codeOf = new Map(((pfs ?? []) as { id: string; code: string }[]).map((p) => [p.id, p.code]));
  return ((ls ?? []) as { id: string; platform_id: string; status: string | null }[])
    .filter((l) => !isGoneStatus(l.status) && isDriftPlatform(codeOf.get(l.platform_id)))
    .map((l) => ({ id: l.id, platform_code: codeOf.get(l.platform_id)! }));
}

export type StoredDrift = { listing_id: string; parent_sku_id: string | null; platform_code: string; issues: DriftKey[]; items: DriftItem[] | null; error: string | null; checked_at: string };
/** ผลตรวจที่จดไว้ ของหลายสินค้า (ชุดละ 300) · อ่านไม่ได้ = ว่าง */
export async function loadStoredDrift(admin: Admin, parentIds: string[], opts: { items?: boolean } = {}): Promise<StoredDrift[]> {
  const out: StoredDrift[] = [];
  const cols = opts.items ? "listing_id, parent_sku_id, platform_code, issues, items, error, checked_at" : "listing_id, parent_sku_id, platform_code, issues, error, checked_at";
  for (let i = 0; i < parentIds.length; i += 300) {
    const { data, error } = await admin.from("platform_listing_drift").select(cols).in("parent_sku_id", parentIds.slice(i, i + 300));
    if (error) { console.warn("[drift] load", error.message); continue; }
    out.push(...((data ?? []) as unknown as StoredDrift[]).map((r) => ({ ...r, items: r.items ?? null })));
  }
  return out;
}

