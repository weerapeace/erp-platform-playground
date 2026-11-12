/**
 * สร้างสินค้าใหม่บน TikTok Shop (เฟส D) — ตัวประกอบข้อมูล (ของกลาง · pure · เทสต์ lib/__tests__/tiktok-create-plan.test.ts)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก (2026-11-12): **ลงเป็นฉบับร่าง** (save_mode=AS_DRAFT) — ไม่ขึ้นขาย · ไม่ส่งสต๊อก (TikTok บังคับสต๊อก ≥ 1 ตอนลงขาย ขัดกฎ BigSeller)
 *   → สินค้าไปอยู่ "ฉบับร่าง" ใน Seller Center · เจ้าของตรวจ/กรอกช่องที่เหลือ/ใส่สต๊อก แล้วกดเผยแพร่เอง
 * ใช้ 2 ที่ — ต้องตรงกันเสมอ (แบบเดียวกับ lib/lazada-create-plan):
 *   1) GET  /api/tiktok-shop/create-product?parent_sku_id=  → ตัวช่วยลงสินค้า "ดูก่อนส่ง"
 *   2) POST /api/tiktok-shop/create-product                  → สร้างฉบับร่างบน TikTok (รูปต้องฝากก่อน — route ทำ)
 * ห้าม import lib/tiktok-shop (มีโค้ดเซ็นคำขอ) — หน้าเว็บ import ไฟล์นี้
 *
 * เอกสาร Create Product 202309 (อ่าน 2026-11-12): title ไทย 25–255 · description HTML ≤ 10,000 (รูปต้องเป็นลิงก์ TikTok + width/height)
 *   category_id = หมวดปลายสุด (category_version v2 สำหรับ SEA) · main_images[{uri}] 1–9 · package_weight บังคับ (กก. ทศนิยม ≤ 3)
 *   package_dimensions ไทยไม่บังคับ (จำนวนเต็ม ซม.) · skus[{ seller_sku (ไม่มีช่องว่าง ≤ 50), price{amount,currency}, sales_attributes[{name ≤ 20, value_name ≤ 50}] }]
 *   sales_attributes ข้ามได้ถ้ามี SKU เดียว · ≤ 3 ชั้น · ทุก SKU ชั้นเหมือนกัน · ห้ามซ้ำ · ราคาไทย 30–260,000
 * ของเรา:
 *   ชื่อ = ร่าง → ชื่อสำหรับแพลตฟอร์ม → ชื่อสินค้า · หมวด = ร่าง ("{id} · ชื่อ") → หมวดกลางที่ผูก TikTok
 *   รายละเอียด = ร่าง → รายละเอียดสำหรับแพลตฟอร์ม → รายละเอียดสินค้า (ข้อความ → ย่อหน้า) · ตัดรูปที่ไม่ใช่ของ TikTok (เพิ่มทีหลังในลิ้นชักได้)
 *   รูป = ร่าง extra.tiktok_images → ร่าง image_keys → ปกตัวสี + ปก SKU + รูปสินค้า ("r2:<key>" = รูปในระบบ)
 *   ราคา = ราคาเต็ม (fake_price) ไม่มี → ราคาขาย (กติกาเดียวกับ LINE) — ส่วนลดทำด้วยโปรโมชันของ TikTok · ตัวขายไม่มี → ของตัวสี
 *   แบรนด์ = แบรนด์ในระบบที่ร้านมีสิทธิ์ใช้บน TikTok (ค้นตามชื่อ) ไม่เจอ = ไม่ใส่ (ตั้งใน Seller Center ได้)
 *   น้ำหนัก = ร่าง extra.tiktok_weight → น้ำหนักสินค้า (กรัม ÷ 1000) · กล่อง = ขนาดกล่องของสินค้า (ปัดขึ้นเป็นจำนวนเต็ม · ไม่มีก็ได้)
 *   ช่องบังคับของหมวด = แสดงให้รู้ · ฉบับร่างยังไม่บังคับ — กรอกต่อใน Seller Center ก่อนเผยแพร่
 */
import { noteToHtml, isHtmlNote } from "@/lib/rich-note";
import { splitSkus } from "@/lib/lazada-create-plan";
import { isTiktokImageUrl, TTS_DESC_MAX, TTS_MAX_IMAGES, TTS_PRICE_MAX, TTS_PRICE_MIN, TTS_TITLE_MAX, TTS_TITLE_MIN, ttsTitleLength } from "@/lib/tiktok-listing-edit";

const ATTR_NAME_MAX = 20;
const ATTR_VALUE_MAX = 50;
const SELLER_SKU_MAX = 50;

export type TtsCreateSku = {
  id: string; code: string; color_th: string | null; color: string | null;
  list_price: number | null; fake_price: number | null; cover_image_r2_key: string | null;
  attribute_values: Record<string, unknown> | null; is_active: boolean; sale_ok?: boolean | null;
};
export type TtsCreateParent = {
  id: string; code: string; name_th: string | null; name_platform: string | null;
  description: string | null; platform_description: string | null;
  weight_g: number | null; box: { l: number | null; w: number | null; h: number | null } | null;
};
export type TtsCreateDraft = {
  title: string | null; description: string | null; category_path: string | null; image_keys: string[] | null;
  extra: Record<string, unknown> | null; platform_product_id: string | null;
} | null;
/** ช่องของหมวดจาก Get Attributes (ย่อ) */
export type TtsAttrDef = { id: string; name: string; type: "SALES_PROPERTY" | "PRODUCT_PROPERTY" | string; required: boolean };

export type TtsCreateDim = { key: "color" | "option" | "code"; label: string; name: string; values: string[] };
export type TtsCreateVariantRow = {
  sku_id: string; code: string;
  attrs: Record<string, string>;
  price: number | null; fake: number | null; sale: number | null;
  image_ref: string | null;
};
export type TtsCreateField<T> = { value: T; src: string };
export type TtsCreatePreview = {
  parent_id: string; parent_code: string;
  name: TtsCreateField<string>;
  category: { id: string | null; label: string | null; src: string };
  description: TtsCreateField<string>;
  brand: { id: string | null; name: string | null; src: string };
  images: { refs: string[]; src: string; custom: boolean };
  package: { weight: number | null; l: number | null; w: number | null; h: number | null; src: string };
  dims: TtsCreateDim[];
  variants: TtsCreateVariantRow[];
  /** ช่องบังคับของหมวด (ฉบับร่างยังไม่บังคับ — ต้องกรอกใน Seller Center ก่อนเผยแพร่) · loaded=false = ดึงไม่ได้/ยังไม่เลือกหมวด */
  attrs: { required: string[]; loaded: boolean };
  missing: string[];
  warnings: string[];
  on_shop: string | null;
  draft_extra: Record<string, unknown>;
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const pos = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const r2 = (k: string) => `r2:${k}`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** "{id} · ชื่อ" / "{id}" → id หมวด */
export const ttsCategoryIdOf = (path: unknown): string | null => {
  const s = str(path); if (!s) return null;
  if (s.includes(" · ")) return s.split(" · ")[0].trim() || null;
  const m = s.match(/^(\d+)\b/); return m ? m[1] : null;
};

/** รายละเอียด → HTML ที่ TikTok รับ (ข้อความ → ย่อหน้า · ตัดรูปที่ไม่ใช่ของ TikTok) · cut = จำนวนรูปที่ตัด */
export function ttsCreateDescriptionHtml(raw: string): { html: string; cut: number } {
  const html = isHtmlNote(raw) ? raw : noteToHtml(raw, { keepBlankLines: true, keepIndent: true, bullets: true });
  let cut = 0;
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (m && isTiktokImageUrl(m[1].replace(/&amp;/g, "&")) && /\swidth\s*=/.test(tag) && /\sheight\s*=/.test(tag)) return tag;
    cut++; return "";
  });
  return { html: out, cut };
}

/** ช่องจาก Get Attributes → แบบย่อ */
export function ttsAttrDefsOf(raw: Record<string, unknown>[]): TtsAttrDef[] {
  return raw.map((a) => ({ id: str(a.id), name: str(a.name), type: str(a.type), required: a.is_requried === true || a.is_required === true })).filter((a) => a.id && a.name);
}

/**
 * แผนสร้างฉบับร่าง 1 ตัวบน TikTok — preview (โชว์คน) + payload (ส่ง TikTok · main_images ยังเป็น ref ที่ route ต้องฝากก่อน)
 * attrDefs = ช่องของหมวด (null = ดึงไม่ได้/ยังไม่เลือกหมวด) · brand = แบรนด์บน TikTok ที่หาเจอ (null = ไม่ใส่)
 */
export function planTiktokCreate(input: {
  parent: TtsCreateParent; skus: TtsCreateSku[]; draft: TtsCreateDraft;
  mappedCategory: string | null; galleryKeys: string[]; attrDefs: TtsAttrDef[] | null;
  brand: { id: string; name: string } | null; brandNote?: string | null; onShop: string | null;
}): { preview: TtsCreatePreview; payload: Record<string, unknown> } {
  const { parent: p, draft: d } = input;
  const extra = (d?.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>;
  const missing: string[] = []; const warnings: string[] = [];

  // ---------- ชื่อ ----------
  const dTitle = str(d?.title), namePf = str(p.name_platform), nameTh = str(p.name_th);
  const name = (dTitle || namePf || nameTh).replace(/\s+/g, " ");
  const nameSrc = !name ? "ยังไม่มีชื่อ" : dTitle && dTitle !== namePf && dTitle !== nameTh ? "แก้ไว้สำหรับ TikTok" : name === namePf ? "ชื่อสำหรับแพลตฟอร์ม" : "ชื่อสินค้า";
  const nLen = ttsTitleLength(name);
  if (!name) missing.push("ชื่อสินค้า");
  else if (nLen < TTS_TITLE_MIN) missing.push(`ชื่อสั้นไป ${nLen} ตัวอักษร (TikTok ไทยต้อง ${TTS_TITLE_MIN}–${TTS_TITLE_MAX})`);
  else if (nLen > TTS_TITLE_MAX) missing.push(`ชื่อยาว ${nLen} ตัวอักษร (TikTok รับไม่เกิน ${TTS_TITLE_MAX})`);

  // ---------- หมวด ----------
  const catPath = str(d?.category_path) || str(input.mappedCategory);
  const categoryId = ttsCategoryIdOf(catPath);
  const catSrc = !catPath ? "ยังไม่ได้เลือก — ตั้งหมวดกลางของสินค้า หรือเลือกหมวด TikTok" : str(d?.category_path) ? "เลือกไว้สำหรับ TikTok" : "หมวดกลางของสินค้า → หมวด TikTok";
  if (!categoryId) missing.push("หมวด TikTok");

  // ---------- รายละเอียด ----------
  const dDesc = String(d?.description ?? ""), descPf = String(p.platform_description ?? ""), descMain = String(p.description ?? "");
  const descRaw = dDesc.trim() ? dDesc : descPf.trim() ? descPf : descMain;
  const desc = descRaw.trim() ? ttsCreateDescriptionHtml(descRaw) : { html: "", cut: 0 };
  const descSrc = !descRaw.trim() ? "ยังไม่มีรายละเอียด" : dDesc.trim() && dDesc !== descPf && dDesc !== descMain ? "แก้ไว้สำหรับ TikTok" : descRaw === descPf ? "รายละเอียดสำหรับแพลตฟอร์ม" : "รายละเอียดสินค้า";
  if (!desc.html.replace(/<[^>]+>/g, "").trim()) missing.push("รายละเอียดสินค้า");
  if (desc.html.length > TTS_DESC_MAX) missing.push(`รายละเอียดยาวเกิน ${TTS_DESC_MAX.toLocaleString()} ตัวอักษร (รวมโค้ดจัดรูปแบบ)`);
  if (desc.cut) warnings.push(`รูปในรายละเอียด ${desc.cut} รูปไม่ได้ส่ง (TikTok รับเฉพาะรูปที่ฝากกับ TikTok) — เพิ่มทีหลังได้ในลิ้นชักสินค้าบนร้าน`);

  // ---------- ตัวขาย + ราคา ----------
  const { masters, sellable, masterOf, act } = splitSkus(input.skus);
  const owner = (s: TtsCreateSku, f: "fake_price" | "list_price") => pos(s[f]) ?? pos(masterOf(s.code)?.[f]);
  if (!sellable.length) missing.push("SKU ที่เปิดขาย ≥ 1");

  // ---------- ชั้นตัวเลือก (ชื่อกำหนดเอง ≤ 20 · ค่า ≤ 50 · ≤ 3 ชั้น) ----------
  const colorOf = (s: TtsCreateSku) => str(s.color_th || s.color);
  const vo = (s: TtsCreateSku) => { const av = s.attribute_values; const v = av && typeof av === "object" ? (av as Record<string, unknown>).variant_option : null; return v && typeof v === "object" ? v as Record<string, unknown> : null; };
  const optOf = (s: TtsCreateSku) => str(vo(s)?.value);
  const optName = sellable.map((s) => str(vo(s)?.name)).find(Boolean) || "ตัวเลือก";
  const distinct = (fn: (s: TtsCreateSku) => string) => [...new Set(sellable.map(fn).filter(Boolean))];
  const ourDims: { key: TtsCreateDim["key"]; label: string; valOf: (s: TtsCreateSku) => string }[] = [];
  if (sellable.length > 1) {
    if (distinct(colorOf).length) ourDims.push({ key: "color", label: "สี", valOf: colorOf });
    if (distinct(optOf).length) ourDims.push({ key: "option", label: optName, valOf: optOf });
    if (!ourDims.length) ourDims.push({ key: "code", label: "แบบ", valOf: (s) => s.code });
  }
  const dims: TtsCreateDim[] = ourDims.slice(0, 3).map((od) => ({ key: od.key, label: od.label, name: od.label.slice(0, ATTR_NAME_MAX), values: distinct(od.valOf) }));
  for (const [i, dm] of dims.entries()) {
    const empties = sellable.filter((s) => !ourDims[i].valOf(s)).length;
    if (empties) missing.push(`${empties} SKU ไม่มีค่า "${dm.label}" — TikTok ต้องให้ทุกตัวเลือกมีชั้นเหมือนกัน`);
    const long = dm.values.filter((v) => v.length > ATTR_VALUE_MAX);
    if (long.length) missing.push(`ค่าตัวเลือกยาวเกิน ${ATTR_VALUE_MAX} ตัวอักษร ${long.length} ค่า เช่น "${long[0].slice(0, 30)}…"`);
  }

  // ---------- แถวตัวเลือก ----------
  const colorImg = new Map<string, string>();
  for (const s of act) { const c = colorOf(s); if (!c || colorImg.has(c)) continue; const k = masters.has(s.code) ? s.cover_image_r2_key : (s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null); if (k) colorImg.set(c, k); }
  const imgOfSku = (s: TtsCreateSku): string | null => { const k = colorImg.get(colorOf(s)) ?? s.cover_image_r2_key ?? masterOf(s.code)?.cover_image_r2_key ?? null; return k ? r2(k) : null; };
  const variants: TtsCreateVariantRow[] = sellable.map((s) => {
    const fake = owner(s, "fake_price"), sale = owner(s, "list_price");
    const attrs: Record<string, string> = {};
    dims.forEach((dm, i) => { attrs[dm.name] = ourDims[i].valOf(s); });
    return { sku_id: s.id, code: s.code, attrs, price: fake ?? sale, fake, sale, image_ref: imgOfSku(s) };
  });
  const noPrice = variants.filter((v) => !v.price).length;
  if (noPrice) missing.push(`ราคา (${noPrice} ตัวเลือกยังไม่มีราคา)`);
  const outRange = variants.filter((v) => v.price && (v.price < TTS_PRICE_MIN || v.price > TTS_PRICE_MAX));
  if (outRange.length) missing.push(`ราคาต้องอยู่ระหว่าง ${TTS_PRICE_MIN}–${TTS_PRICE_MAX.toLocaleString()} บาท (${outRange.length} ตัวเลือกไม่อยู่ในช่วง เช่น ${outRange[0].code} ${outRange[0].price}฿)`);
  if (dims.length) {
    const combos = variants.map((v) => dims.map((dm) => v.attrs[dm.name]).join("|"));
    if (new Set(combos).size < combos.length) missing.push("ตัวเลือกซ้ำกัน (สี/ตัวเลือกเหมือนกันมากกว่า 1 SKU) — แก้ชื่อสีหรือเพิ่มตัวเลือก");
  }
  const badSku = variants.filter((v) => /\s/.test(v.code) || v.code.length > SELLER_SKU_MAX);
  if (badSku.length) missing.push(`รหัส SKU มีช่องว่างหรือยาวเกิน ${SELLER_SKU_MAX} ตัว ${badSku.length} ตัว (เช่น "${badSku[0].code}")`);
  if (variants.some((v) => v.fake && v.sale && v.sale < v.fake)) warnings.push("ราคาบน TikTok = ราคาเต็มในระบบ — ส่วนลดให้ตั้งโปรโมชันใน Seller Center (ราคาขายในระบบไม่ได้ส่ง)");

  // ---------- รูปสินค้า ----------
  const picked = Array.isArray(extra.tiktok_images) ? (extra.tiktok_images as unknown[]).map(str).filter(Boolean) : [];
  const draftKeys = Array.isArray(d?.image_keys) ? (d!.image_keys as unknown[]).map(str).filter(Boolean).map(r2) : [];
  const autoRefs = [...new Set([...act.filter((s) => masters.has(s.code)).map((s) => s.cover_image_r2_key), ...sellable.map((s) => s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null), ...input.galleryKeys].filter(Boolean) as string[])].map(r2);
  const refs = [...new Set(picked.length ? picked : draftKeys.length ? draftKeys : autoRefs)].slice(0, TTS_MAX_IMAGES);
  const imgSrc = picked.length ? "เลือกไว้สำหรับ TikTok" : draftKeys.length ? "รูปที่เลือกในร่าง" : "ปกตัวสี + ปก SKU + รูปสินค้า (อัตโนมัติ)";
  if (!refs.length) missing.push("รูปสินค้า ≥ 1");
  else if (refs.length < 5) warnings.push(`มีรูป ${refs.length} รูป — TikTok แนะนำอย่างน้อย 5 รูป`);

  // ---------- พัสดุ ----------
  const wKg = pos(extra.tiktok_weight) ?? (pos(p.weight_g) ? (p.weight_g as number) / 1000 : null);
  const weight = wKg != null ? round3(wKg) : null;
  const ceil = (v: unknown) => { const n = pos(v); return n ? Math.ceil(n) : null; };
  const box = { l: ceil(p.box?.l), w: ceil(p.box?.w), h: ceil(p.box?.h) };
  const hasBox = !!(box.l && box.w && box.h);
  const pkgSrc = pos(extra.tiktok_weight) ? "น้ำหนักแก้ไว้สำหรับ TikTok · กล่องจากสินค้า" : "น้ำหนัก + ขนาดกล่องของสินค้า";
  if (!weight) missing.push(pos(p.weight_g) ? "น้ำหนัก (น้อยเกินไป — เช็กว่ากรอกเป็นกรัม)" : "น้ำหนักพัสดุ");
  else if (weight > 30) warnings.push(`น้ำหนัก ${weight} กก. — ตรวจว่ากรอกเป็นกรัมในระบบ (ไม่ใช่กิโลกรัม)`);
  if (!hasBox) warnings.push("ยังไม่มีขนาดกล่อง (TikTok ไทยไม่บังคับ แต่ใช้คิดค่าส่ง) — ตั้งที่หน้าสินค้า");

  // ---------- แบรนด์ + ช่องของหมวด ----------
  const brandSrc = input.brand ? "แบรนด์ในระบบ (ร้านมีสิทธิ์ใช้บน TikTok)" : (input.brandNote || "ไม่ใส่แบรนด์ — ตั้งใน Seller Center ได้");
  const required = (input.attrDefs ?? []).filter((a) => a.type === "PRODUCT_PROPERTY" && a.required).map((a) => a.name);
  if (required.length) warnings.push(`หมวดนี้มีช่องบังคับ ${required.length} ช่อง (${required.slice(0, 3).join(", ")}${required.length > 3 ? " …" : ""}) — ฉบับร่างยังไม่ต้องกรอก แต่ต้องกรอกใน Seller Center ก่อนกดเผยแพร่`);
  if (!input.attrDefs && categoryId) warnings.push("ดึงช่องของหมวดจาก TikTok ไม่ได้ — ตรวจช่องบังคับใน Seller Center");

  if (input.onShop || str(d?.platform_product_id)) warnings.push(`มีบน TikTok แล้ว (#${input.onShop ?? str(d?.platform_product_id)}) — ไม่สร้างซ้ำ`);

  // ---------- payload (ฉบับร่าง · ไม่มีสต๊อก) ----------
  const payload: Record<string, unknown> = {
    save_mode: "AS_DRAFT",
    title: name,
    description: desc.html,
    category_id: categoryId ?? "",
    category_version: "v2",
    main_images: refs,
    ...(input.brand ? { brand_id: input.brand.id } : {}),
    package_weight: { value: weight != null ? String(weight) : "", unit: "KILOGRAM" },
    ...(hasBox ? { package_dimensions: { length: String(box.l), width: String(box.w), height: String(box.h), unit: "CENTIMETER" } } : {}),
    skus: variants.map((v) => ({
      seller_sku: v.code,
      price: { amount: v.price != null ? v.price.toFixed(2) : "", currency: "THB" },
      ...(dims.length ? { sales_attributes: dims.map((dm) => ({ name: dm.name, value_name: v.attrs[dm.name] })) } : {}),
    })),
  };

  return {
    payload,
    preview: {
      parent_id: p.id, parent_code: p.code,
      name: { value: name, src: nameSrc },
      category: { id: categoryId, label: catPath || null, src: catSrc },
      description: { value: desc.html, src: descSrc },
      brand: { id: input.brand?.id ?? null, name: input.brand?.name ?? null, src: brandSrc },
      images: { refs, src: imgSrc, custom: picked.length > 0 },
      package: { weight, ...box, src: pkgSrc },
      dims, variants,
      attrs: { required, loaded: !!input.attrDefs },
      missing, warnings,
      on_shop: input.onShop ?? (str(d?.platform_product_id) || null),
      draft_extra: extra,
    },
  };
}

/** รูปที่ต้องฝากกับ TikTok ก่อนส่ง (main_images ที่ยังเป็น ref) */
export const ttsCreateImageRefs = (payload: Record<string, unknown>): string[] =>
  (Array.isArray(payload.main_images) ? payload.main_images as unknown[] : []).map(str).filter(Boolean);
/** แทน ref ด้วย uri ที่ฝากแล้ว → main_images[{ uri }] */
export function ttsCreateResolveImages(payload: Record<string, unknown>, uriOf: Map<string, string>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  copy.main_images = ttsCreateImageRefs(payload).map((r) => ({ uri: uriOf.get(r) ?? r }));
  return copy;
}
