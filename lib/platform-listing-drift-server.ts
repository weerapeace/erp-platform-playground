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
  compareAll, driftIssues, listSig, plainText, type DriftItem, type DriftKey, type ShopValues, type ShopVariant, type SysSync, type SystemValues,
} from "@/lib/platform-listing-drift";
import { buildLineCreate } from "@/lib/line-create-payload";
import { loadLazadaCreate } from "@/app/api/lazada/create-product/load";
import { loadTiktokCreate } from "@/app/api/tiktok-shop/create-product/load";
import { loadShopeeCreate } from "@/app/api/shopee/create-product/load";
import { loadShopeeListingLive } from "@/app/api/shopee/shared";
import { loadLazListingLive } from "@/app/api/lazada/shared";
import { loadTtsListingLive, ttsViewWithReview } from "@/app/api/tiktok-shop/shared";
import { planShopeeEdit, planShopeeImages, planShopeePrices, shopeePriceRowsFromView, type ShopeeListingView } from "@/lib/shopee-listing-edit";
import { foreignDescImages, lazadaEditStateFromView, lazadaListingView, lazadaPriceRowsFromView, planLazadaEdit, planLazadaPrices, type LazadaListingView } from "@/lib/lazada-listing-edit";
import { planTiktokDescription, planTiktokMedia, planTiktokPrices, tiktokMediaBase, tiktokPriceBlock, tiktokPriceRowsFromView, type TiktokListingView } from "@/lib/tiktok-listing-edit";
import { planTiktokSkuEdit, tiktokOptNameKey, tiktokOptionGroups, tiktokSkuFormOf, tiktokSkuSignature } from "@/lib/tiktok-sku-edit";
import { lineGetProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";
import { lineEditStateFromRaw, planLineEdit, type LineEditState } from "@/lib/line-listing-edit";

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
};
export type DriftFail = { ok: false; error: string; status: number };

type Ctx = {
  code: string; listingId: string; parentId: string | null;
  sys: SystemValues; shop: ShopValues; sync: SysSync | null;
  /** รายละเอียดฝั่งระบบมาจาก "ร่างของร้านที่แก้ไว้" → note เตือน · block = ร่างมีข้อความของสินค้าอื่น ห้ามส่ง */
  descGuard: { note: string | null; block: string | null };
  /** เหตุผลที่ส่งเรื่องนี้ไม่ได้ (null = ส่งได้) */
  cannot: (key: DriftKey) => string | null;
  /** ประกอบคำสั่งของเรื่องที่เลือก (ตามลำดับที่ร้านต้องการ) */
  build: (keys: DriftKey[]) => DriftCall[];
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
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.keys.map((k) => `r2:${k}`), variants: p.variants.map((v) => ({ code: v.code, values: v.options, price: v.price || null, pay: v.price ? v.price - (v.discount || 0) : null })) } };
  }
  if (code === "shopee") {
    const r = await loadShopeeCreate(admin, parentId, userId);
    if (!r.ok) return { ok: false, error: r.error };
    const p = r.preview;
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.refs, variants: p.variants.map((v) => ({ code: v.code, values: vals(v.attrs), price: v.price })) } };
  }
  if (code === "lazada") {
    const r = await loadLazadaCreate(admin, parentId, userId);
    if (!r.ok) return { ok: false, error: r.error };
    const p = r.preview;
    // ราคาลด: เทียบ/ส่งเฉพาะเมื่อระบบมีราคาลด (ล้างราคาลดบน Lazada ผ่านระบบไม่ได้)
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.refs, variants: p.variants.map((v) => ({ code: v.code, values: vals(v.saleProp), price: v.price, ...(v.special != null && v.price != null && v.special < v.price ? { special: v.special } : {}) })) } };
  }
  if (code === "tiktok") {
    const r = await loadTiktokCreate(admin, parentId, userId);
    if (!r.ok) return { ok: false, error: r.error };
    const p = r.preview;
    return { ok: true, descSrc: p.description.src, sys: { description: p.description.value, imageRefs: p.images.refs, variants: p.variants.map((v) => ({ code: v.code, values: vals(v.attrs), price: v.price })) } };
  }
  return { ok: false, error: "ร้านนี้ยังตรวจไม่ได้" };
}

// ───────── ฝั่งร้าน + กฎส่ง ต่อร้าน ─────────
const sysOf = (sys: SystemValues, code: string | null) => (code ? sys.variants.find((v) => v.code.trim().toUpperCase() === code.trim().toUpperCase()) : sys.variants.length === 1 ? sys.variants[0] : undefined);

function shopeeCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, v: ShopeeListingView): Ctx {
  const variants: ShopVariant[] = v.hasModel ? v.models.map((m) => ({ code: m.sku, label: m.label ?? "", price: m.originalPrice ?? m.price })) : [{ code: null, label: "", price: v.originalPrice ?? v.price }];
  const shop: ShopValues = { description: v.description, imageCount: v.imageIds.length, imageSig: listSig(v.imageIds), variants, imageUrls: v.images };
  const imgPlan = () => planShopeeImages(v, base.sys.imageRefs);
  const descPlan = () => planShopeeEdit(v, { description: base.sys.description });
  const priceRows = shopeePriceRowsFromView(v);
  const priceEdit = () => priceRows.map((r) => {
    const m = v.hasModel ? v.models.find((x) => x.modelId === r.modelId) : null;
    const s = sysOf(base.sys, m ? m.sku : null);
    return s?.price != null ? { ...r, price: Math.round(s.price) } : r;
  });
  const pricePlan = () => planShopeePrices(v, priceEdit());
  return {
    ...base, shop,
    cannot: (k) => k === "images" ? errs(imgPlan().errors)
      : k === "description" ? (!v.descriptionEditable ? "Shopee: สินค้านี้ใช้รายละเอียดแบบมีรูป — แก้ใน Seller Centre" : errs(descPlan().errors))
      : k === "options" ? OPT_CANNOT.shopee
      : errs(pricePlan().errors),
    build: (keys) => {
      const calls: DriftCall[] = [];
      if (keys.includes("price")) {
        const plan = pricePlan();
        if (plan.changes.length) calls.push({ url: "/api/shopee/listing-prices", label: "ราคา", body: { listing_id: base.listingId, before: priceRows.map((b) => ({ model_id: b.modelId, price: b.price })), prices: plan.changes.map((c) => ({ model_id: c.modelId, label: c.label, price: c.after })) } });
      }
      const body: Record<string, unknown> = { listing_id: base.listingId };
      if (keys.includes("description")) { const p = descPlan(); if (p.body.description != null) { body.before = { name: v.name, description: v.description }; body.edit = { name: null, description: p.body.description }; } }
      if (keys.includes("images")) { const p = imgPlan(); if (p.changed) body.images = { before_ids: v.imageIds, refs: p.refs }; }
      if (body.edit || body.images) calls.push({ url: "/api/shopee/listing-edit", label: [body.edit ? "รายละเอียด" : "", body.images ? "รูป" : ""].filter(Boolean).join(" + "), body });
      return calls;
    },
  };
}

function lazadaCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, v: LazadaListingView): Ctx {
  const shop: ShopValues = {
    description: v.description, imageCount: v.images.length, imageSig: listSig(v.images), imageUrls: v.images,
    variants: v.skus.map((s) => ({ code: s.sellerSku, label: s.label, price: s.price, ...(base.sys.variants.some((x) => x.special !== undefined) ? { special: s.specialPrice } : {}) })),
  };
  const before = lazadaEditStateFromView(v);
  const after = (keys: DriftKey[]) => ({ ...before, ...(keys.includes("images") ? { images: base.sys.imageRefs } : {}), ...(keys.includes("description") ? { description: base.sys.description } : {}) });
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
    cannot: (k) => k === "images" ? errs(planLazadaEdit(before, after(["images"])).errors)
      : k === "description" ? (foreignDescImages(base.sys.description).length ? "Lazada: รายละเอียดในระบบมีรูปที่ยังไม่ได้ฝากกับ Lazada — แก้ในลิ้นชักสินค้าบนร้าน" : errs(planLazadaEdit(before, after(["description"])).errors))
      : k === "options" ? OPT_CANNOT.lazada
      : errs(pricePlan().errors),
    build: (keys) => {
      const calls: DriftCall[] = [];
      const ek = keys.filter((k) => k === "images" || k === "description");
      if (ek.length && Object.keys(planLazadaEdit(before, after(ek)).fields).length) calls.push({ url: "/api/lazada/listing-edit", label: ek.map((k) => (k === "images" ? "รูป" : "รายละเอียด")).join(" + "), body: { listing_id: base.listingId, before, edit: after(ek) } });
      if (keys.includes("price") && pricePlan().changes.length) calls.push({ url: "/api/lazada/listing-prices", label: "ราคา", body: { listing_id: base.listingId, before: priceBase, edit: priceEdit() } });
      return calls;
    },
  };
}

function tiktokCtx(base: Omit<Ctx, "shop" | "cannot" | "build">, v: TiktokListingView): Ctx {
  const media = tiktokMediaBase(v);
  const baseUris = media.images.map((i) => i.uri);
  const baseDesc = v.pendingDescription ?? v.description;
  const shop: ShopValues = {
    description: baseDesc, imageCount: baseUris.length, imageSig: listSig(baseUris), imageUrls: media.images.map((i) => i.url),
    variants: v.skus.map((s) => ({ code: s.sellerSku, label: s.label, values: s.attrs.map((a) => a.valueName ?? "").filter(Boolean), price: s.price })),
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
  const skuPlan = () => planTiktokSkuEdit(groups, { ...form0, names: optForm().names }, { status: v.status, hasDraft: v.hasDraft });
  const priceBase = tiktokPriceRowsFromView(v);
  const priceEdit = () => priceBase.map((r) => { const s = sysOf(base.sys, r.sellerSku); return s?.price != null ? { ...r, price: s.price } : r; });
  const pricePlan = () => planTiktokPrices(priceBase, priceEdit());
  return {
    ...base, shop,
    cannot: (k) => k === "images" ? errs(mediaPlan().errors)
      : k === "description" ? errs(descPlan().errors)
      : k === "options" ? (groups.length ? errs(skuPlan().errors) : "สินค้านี้บน TikTok ไม่มีตัวเลือก")
      : (tiktokPriceBlock(v) ?? errs(pricePlan().errors)),
    build: (keys) => {
      const calls: DriftCall[] = [];
      if (keys.includes("price") && pricePlan().changes.length) calls.push({ url: "/api/tiktok-shop/listing-prices", label: "ราคา", body: { listing_id: base.listingId, before: priceBase, edit: priceEdit() } });
      const body: Record<string, unknown> = { listing_id: base.listingId };
      const labels: string[] = [];
      if (keys.includes("description")) { const p = descPlan(); if (p.changed) { body.before_description = baseDesc; body.description = p.html; labels.push("รายละเอียด"); } }
      if (keys.includes("images")) { const p = mediaPlan(); if (p.imagesChanged) { body.media = { before_uris: baseUris, before_pkg: media.pkg, images: p.images, pkg: media.pkg }; labels.push("รูป"); } }
      if (keys.includes("options") && groups.length) { const p = skuPlan(); if (p.namesChanged) { body.skus = { before_sig: tiktokSkuSignature(v.skus), primary: form0.primary, images: form0.images, names: optForm().names }; labels.push("ชื่อตัวเลือก"); } }
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
  const shop: ShopValues = {
    description: state.description, imageCount: state.images.length, imageSig: listSig(state.images), imageUrls: state.images,
    variants: state.variants.map((x) => ({ code: x.sku, label: x.label, values: valuesOf(x.id), price: x.price, pay: x.pay })),
  };
  const merged = (keys: DriftKey[]): LineEditState => ({
    ...state,
    ...(keys.includes("images") ? { images: base.sys.imageRefs } : {}),
    ...(keys.includes("description") ? { description: base.sys.description } : {}),
    ...(keys.includes("price") ? { variants: state.variants.map((x) => { const s = sysOf(base.sys, x.sku); return s?.price != null ? { ...x, price: s.price, pay: s.pay ?? s.price } : x; }) } : {}),
  });
  return {
    ...base, shop,
    cannot: (k) => (k === "options" ? OPT_CANNOT.line_shopping : errs(planLineEdit(state, merged([k])).errors)),
    build: (keys) => {
      const ek = keys.filter((k) => k !== "options");
      const plan = planLineEdit(state, merged(ek));
      if (!Object.keys(plan.fields).length && !plan.prices) return [];
      return [{ url: "/api/line-shopping/listing-edit", label: ek.map((k) => (k === "images" ? "รูป" : k === "description" ? "รายละเอียด" : "ราคา")).join(" + "), body: { listing_id: base.listingId, edit: merged(ek) } }];
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
  const descGuard = await descriptionGuard(admin, code, row.matched_parent_sku_id, row.platform_id, sysR.descSrc);
  const base = { code, listingId, parentId: row.matched_parent_sku_id, sys: sysR.sys, sync, descGuard };

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
    return { ok: true, row, ctx: lazadaCtx(base, v) };
  }
  if (code === "tiktok") {
    const r = await loadTtsListingLive(admin, listingId, userId);
    if (!r.ok) return r;
    const v = await ttsViewWithReview(r.accessToken, r.cipher, r.detail);
    if (!v) return { ok: false, error: "อ่านสินค้าจาก TikTok ไม่ได้", status: 502 };
    return { ok: true, row, ctx: tiktokCtx(base, v) };
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

function itemsOf(ctx: Ctx): DriftItem[] {
  return compareAll(ctx.sys, ctx.shop, ctx.sync).map((raw) => {
    // รายละเอียดจากร่างที่แก้ไว้ → เตือน (ไม่ติ๊กไว้ให้) · ร่างมีข้อความของสินค้าอื่น → ห้ามส่ง
    const it = raw.key === "description" && ctx.descGuard.note ? { ...raw, note: [ctx.descGuard.note, raw.note].filter(Boolean).join(" · ") } : raw;
    if (it.key === "description" && ctx.descGuard.block && (it.state === "diff" || it.state === "unknown")) return { ...it, sendable: false, cannot: ctx.descGuard.block };
    if (it.state !== "diff" && it.state !== "unknown") return { ...it, sendable: false, cannot: null };
    if (it.key === "images" && it.state === "unknown" && !ctx.sys.imageRefs.length) return { ...it, sendable: false, cannot: null };
    if (it.state === "unknown" && it.key !== "images") return { ...it, sendable: false, cannot: null };
    let cannot: string | null;
    try { cannot = ctx.cannot(it.key); } catch (e) { cannot = (e as Error).message || "ตรวจไม่ได้"; }
    return { ...it, sendable: !cannot, cannot };
  });
}

async function saveCheck(admin: Admin, c: { listing_id: string; parent_sku_id: string | null; platform_code: string; items: DriftItem[] | null; issues: DriftKey[]; error: string | null }) {
  // รูป/ข้อความเต็มใช้แค่ตอนเปิดหน้าเทียบ (ตรวจสด) — ไม่จดลงตาราง กันตารางบวม
  const items = c.items?.map(({ media: _m, text: _t, ...rest }) => rest) ?? null;
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
    if (!it || (it.state !== "diff" && !(k === "images" && it.state === "unknown"))) { skipped.push({ key: k, reason: "ตรงกับระบบแล้ว" }); return false; }
    if (!it.sendable) { skipped.push({ key: k, reason: it.cannot ?? "ส่งไม่ได้" }); return false; }
    return true;
  });
  return { ok: true, calls: ok.length ? r.ctx.build(ok) : [], skipped, items };
}

/** หลังส่งสำเร็จ: จำชุดรูปที่ส่งจากระบบ (ไว้เทียบรอบหน้า) แล้วตรวจใหม่ */
export async function markDriftSent(admin: Admin, listingId: string, keys: DriftKey[], userId: string | null): Promise<DriftCheck | DriftFail> {
  if (keys.includes("images")) {
    const r = await loadCtx(admin, listingId, userId);
    if (r.ok) {
      const sync: SysSync = { ...(r.ctx.sync ?? {}), images_sys: listSig(r.ctx.sys.imageRefs), images_shop: r.ctx.shop.imageSig, images_at: new Date().toISOString() };
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

