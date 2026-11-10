/**
 * สร้างสินค้าใหม่บน Lazada — ตัวประกอบข้อมูล (ของกลาง · pure · มีเทสต์ lib/__tests__/lazada-create-plan.test.ts)
 * --------------------------------------------------------------------------
 * ใช้ 2 ที่ — ต้องตรงกันเสมอ (ห้ามประกอบแยก · แบบเดียวกับ lib/line-create-payload ของ LINE):
 *   1) GET  /api/lazada/create-product?parent_sku_id=  → ตัวช่วยลงสินค้า ขั้น "ดูก่อนส่ง" (preview: ทุกช่อง + มาจากไหน + ที่ขาด)
 *   2) POST /api/lazada/create-product                  → ส่งขึ้น Lazada จริง (payload · รูปต้องฝากเข้า Lazada ก่อน — route ทำ)
 * ใช้ได้ทั้งหน้าเว็บและหลังบ้าน — ห้าม import lib/lazada (มีโค้ดเซ็นคำขอ)
 *
 * รูปแบบคำขอ (คู่มือ open.lazada.com "Create a product" + "Custom sales attributes" อ่าน 2026-11-10):
 *   payload JSON { Request: { Product: { PrimaryCategory, Images{Image[]}, variation{variation1..2}, Attributes{name, description, short_description, brand, ...},
 *                  Skus{ Sku[ { SellerSku, quantity, price, special_price?, package_weight/length/width/height, saleProp{...}, Images{Image[]} } ] } } } }
 *   - ตัวเลือก: ชื่อชั้นต้องเป็นช่องขายของหมวด (is_sale_prop เช่น color_family / size) หรือชั้นกำหนดเอง (customize, ชื่อ ≤ 15 ตัวอักษร)
 *     ≤ 2 ชั้น · ค่าละ ≤ 20 ตัวอักษร · ≤ 50 ค่า/ชั้น · ห้ามซ้ำกันทั้งชุด · รูปต่อตัวเลือกได้เฉพาะชั้นแรก และชั้นแรกต้องไม่ใช่ size
 *   - รูปสินค้า 1–8 · ต้องเป็นลิงก์ของ Lazada (4138) → route ฝาก /image/migrate ก่อน · รูปในรายละเอียดต้องเป็นของ Lazada → ตัดรูปนอกทิ้ง
 *   - น้ำหนัก (กก.) + กว้าง/ยาว/สูง (ซม.) บังคับทุก SKU · ทศนิยม ≤ 2 · ≤ 40 กก. · กว้าง+ยาว+สูง ≤ 300
 *   - ชื่อ ≤ 255 · รายละเอียด ≤ 25,000 (HTML ได้) · จุดเด่น = <ul><li>
 * ของเรา:
 *   ชื่อ = ร่าง → ชื่อสำหรับแพลตฟอร์ม → ชื่อสินค้า · หมวด = ร่าง ("{id} · ชื่อ") → หมวดกลางที่ผูก Lazada
 *   รายละเอียด = ร่าง → รายละเอียดสำหรับแพลตฟอร์ม → รายละเอียดสินค้า (ข้อความ → ย่อหน้า HTML)
 *   รูป = ร่าง extra.lazada_images (เลือกไว้) → ร่าง image_keys → ปกตัวสี + ปกตัวขาย · ref "r2:<key>" = รูปในระบบ · http = ลิงก์
 *   แบรนด์ = "No Brand" (ร้าน IG บน Lazada ใช้ No Brand ทุกรายการ · ใช้รหัสแบรนด์ของ Lazada = งานถัดไป)
 *   ราคา = ราคาเต็ม (fake_price) + ราคาลด (ราคาขาย) · ไม่มีราคาเต็ม = ราคาขายเป็นราคาปกติ · ตัวขายไม่มี → ใช้ของตัวสี
 *   สต๊อก = 0 (ไม่ส่งสต๊อกตอนสร้าง — ระบบสต๊อกกลาง/BigSeller ดูแล)
 *   ข้อมูลเฉพาะของหมวด = ร่าง extra.lazada_attrs · ชั้นตัวเลือก = ร่าง extra.lazada_variation (ไม่ตั้ง = ระบบเลือกให้)
 */
import { noteToHtml, isHtmlNote } from "@/lib/rich-note";
import { lazAttrEditable, lazNormAttr, linesToHighlights, type LazadaAttrDef } from "@/lib/lazada-listing-edit";

export const LAZADA_CREATE_MAX_IMAGES = 8;
export const LAZADA_NO_BRAND = "No Brand";
const NAME_MAX = 255;
const DESC_MAX = 25_000;
const OPT_MAX = 20;
const VAR_NAME_MAX = 15;
const OPTS_PER_VAR = 50;
const PKG_WEIGHT_MAX = 40;
const PKG_SUM_MAX = 300;
const LAZADA_IMG_HOST = /(^|\.)(slatic\.net|lazcdn\.com|alicdn\.com)$/i;

export type LazCreateSku = {
  id: string; code: string; color_th: string | null; color: string | null;
  list_price: number | null; fake_price: number | null; cover_image_r2_key: string | null;
  attribute_values: Record<string, unknown> | null; is_active: boolean; sale_ok?: boolean | null;
};
export type LazCreateParent = {
  id: string; code: string; name_th: string | null; name_platform: string | null;
  description: string | null; platform_description: string | null;
  weight_g: number | null; box: { l: number | null; w: number | null; h: number | null } | null;
};
export type LazCreateDraft = {
  title: string | null; description: string | null; category_path: string | null; image_keys: string[] | null;
  extra: Record<string, unknown> | null; platform_product_id: string | null;
} | null;

/** ชั้นตัวเลือกของเรา → ชั้นบน Lazada */
export type LazVariationDim = {
  /** ชั้นในระบบ: สี / ตัวเลือกที่ 2 / รหัส SKU (ไม่มีทั้งคู่) */
  key: "color" | "option" | "code";
  /** ชื่อชั้นในระบบ (โชว์คน) */
  label: string;
  /** ชื่อชั้นบน Lazada (ช่องขายของหมวด หรือชื่อกำหนดเอง) */
  lazName: string;
  customize: boolean;
  hasImage: boolean;
  values: string[];
  src: string;
};
export type LazCreateVariantRow = {
  sku_id: string; code: string;
  /** ค่าตัวเลือกบน Lazada */
  saleProp: Record<string, string>;
  price: number | null; special: number | null;
  fake: number | null; sale: number | null;
  image_ref: string | null;
};
export type LazCreateField<T> = { value: T; src: string };
export type LazCreatePreview = {
  parent_id: string; parent_code: string;
  name: LazCreateField<string>;
  category: { id: string | null; label: string | null; src: string };
  description: LazCreateField<string>;
  highlights: LazCreateField<string>;
  brand: LazCreateField<string>;
  images: { refs: string[]; src: string; custom: boolean };
  package: { weight: number | null; l: number | null; w: number | null; h: number | null; src: string };
  dims: LazVariationDim[];
  /** ช่องขายของหมวด (เลือกเป็นชื่อชั้นได้) */
  saleProps: { name: string; label: string }[];
  variants: LazCreateVariantRow[];
  attrs: { values: Record<string, string>; missingRequired: string[]; loaded: boolean };
  missing: string[];
  warnings: string[];
  on_shop: string | null;
  draft_extra: Record<string, unknown>;
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const pos = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const r2 = (k: string) => `r2:${k}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
export const lazCategoryIdOf = (path: unknown): string | null => {
  const s = str(path); if (!s) return null;
  if (s.includes(" · ")) return s.split(" · ")[0].trim() || null;
  const m = s.match(/^(\d+)\b/); return m ? m[1] : null;
};
/** รูปนี้อยู่บน Lazada แล้วไหม (ไม่ต้องฝากซ้ำ) */
export const isLazadaImage = (ref: string) => { try { return LAZADA_IMG_HOST.test(new URL(ref).hostname); } catch { return false; } };

/** รายละเอียด → HTML ที่ Lazada รับ (ข้อความ → ย่อหน้า · ตัดรูปนอก Lazada ทิ้ง) */
export function lazDescriptionHtml(raw: string): string {
  const html = isHtmlNote(raw) ? raw : noteToHtml(raw, { keepBlankLines: true, keepIndent: true, bullets: true });
  return html.replace(/<img\b[^>]*>/gi, (tag) => { const m = tag.match(/src\s*=\s*["']([^"']+)["']/i); return m && isLazadaImage(m[1]) ? tag : ""; });
}

const SIZE_NAME = /^(size|ไซส์|ไซซ์|ขนาด)/i;
const COLOR_NAME = /color/i;

/** ตัวสี (master) / ตัวขาย — กติกาเดียวกับ LINE (lib/line-create-payload) */
function splitSkus(rows: LazCreateSku[]) {
  const act = rows.filter((s) => s.is_active);
  const byCode = new Map(act.map((s) => [s.code, s]));
  const baseOf = (code: string): string | null => { const m = code.match(/^(.*\d)[A-Za-z]+$/); return m ? m[1] : null; };
  const masters = new Set<string>();
  for (const s of act) { const b = baseOf(s.code); if (b && byCode.has(b)) masters.add(b); }
  const masterOf = (code: string) => { const b = baseOf(code); return b ? byCode.get(b) ?? null : null; };
  const sellable = act.filter((s) => !masters.has(s.code) && s.sale_ok !== false);
  return { act, masters, sellable, masterOf };
}

/**
 * แผนสร้างสินค้า 1 ตัวบน Lazada — preview (โชว์คน) + payload (ส่ง Lazada · รูปยังเป็น ref ที่ route ต้องฝากก่อน)
 * attrDefs = ช่องของหมวด (ดึงสดจาก Lazada) · null = ดึงไม่ได้ → เตือน (ยังส่งได้ แต่ Lazada อาจปัดตก)
 */
export function planLazadaCreate(input: {
  parent: LazCreateParent; skus: LazCreateSku[]; draft: LazCreateDraft;
  mappedCategory: string | null; galleryKeys: string[]; attrDefs: LazadaAttrDef[] | null; onShop: string | null;
}): { preview: LazCreatePreview; payload: Record<string, unknown> } {
  const { parent: p, draft: d } = input;
  const extra = (d?.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>;
  const missing: string[] = []; const warnings: string[] = [];

  // ---------- ชื่อ ----------
  const dTitle = str(d?.title), namePf = str(p.name_platform), nameTh = str(p.name_th);
  const name = dTitle || namePf || nameTh;
  const nameSrc = !name ? "ยังไม่มีชื่อ" : dTitle && dTitle !== namePf && dTitle !== nameTh ? "แก้ไว้สำหรับ Lazada" : name === namePf ? "ชื่อสำหรับแพลตฟอร์ม" : "ชื่อสินค้า";
  if (!name) missing.push("ชื่อสินค้า");
  else if (name.length > NAME_MAX) missing.push(`ชื่อยาว ${name.length} ตัวอักษร (Lazada รับไม่เกิน ${NAME_MAX})`);

  // ---------- หมวด ----------
  const catPath = str(d?.category_path) || str(input.mappedCategory);
  const categoryId = lazCategoryIdOf(catPath);
  const catSrc = !catPath ? "ยังไม่ได้เลือก — ตั้งหมวดกลางของสินค้า หรือเลือกหมวด Lazada" : str(d?.category_path) ? "เลือกไว้สำหรับ Lazada" : "หมวดกลางของสินค้า → หมวด Lazada";
  if (!categoryId) missing.push("หมวด Lazada");

  // ---------- รายละเอียด + จุดเด่น ----------
  const dDesc = String(d?.description ?? ""), descPf = String(p.platform_description ?? ""), descMain = String(p.description ?? "");
  const descRaw = dDesc.trim() ? dDesc : descPf.trim() ? descPf : descMain;
  const descHtml = descRaw.trim() ? lazDescriptionHtml(descRaw) : "";
  const descSrc = !descRaw.trim() ? "ยังไม่มีรายละเอียด (ไม่บังคับ)" : dDesc.trim() && dDesc !== descPf && dDesc !== descMain ? "แก้ไว้สำหรับ Lazada" : descRaw === descPf ? "รายละเอียดสำหรับแพลตฟอร์ม" : "รายละเอียดสินค้า";
  if (descHtml.length > DESC_MAX) missing.push(`รายละเอียดยาวเกิน ${DESC_MAX.toLocaleString()} ตัวอักษร`);
  const hiLines = str(extra.lazada_highlights);
  const highlightsHtml = hiLines ? linesToHighlights(hiLines) : "";

  // ---------- ตัวขาย + ราคา ----------
  const { masters, sellable, masterOf, act } = splitSkus(input.skus);
  const owner = (s: LazCreateSku, f: "fake_price" | "list_price") => pos(s[f]) ?? pos(masterOf(s.code)?.[f]);
  if (!sellable.length) missing.push("SKU ที่เปิดขาย ≥ 1");

  // ---------- ชั้นตัวเลือก ----------
  const colorOf = (s: LazCreateSku) => str(s.color_th || s.color);
  const vo = (s: LazCreateSku) => { const av = s.attribute_values; const v = av && typeof av === "object" ? (av as Record<string, unknown>).variant_option : null; return v && typeof v === "object" ? v as Record<string, unknown> : null; };
  const optOf = (s: LazCreateSku) => str(vo(s)?.value);
  const optName = sellable.map((s) => str(vo(s)?.name)).find(Boolean) || "ตัวเลือก";
  const distinct = (fn: (s: LazCreateSku) => string) => [...new Set(sellable.map(fn).filter(Boolean))];
  const ourDims: { key: LazVariationDim["key"]; label: string; valOf: (s: LazCreateSku) => string }[] = [];
  if (sellable.length > 1) {
    if (distinct(colorOf).length) ourDims.push({ key: "color", label: "สี", valOf: colorOf });
    if (distinct(optOf).length) ourDims.push({ key: "option", label: optName, valOf: optOf });
    if (!ourDims.length) ourDims.push({ key: "code", label: "แบบ", valOf: (s) => s.code });
  }
  const saleProps = (input.attrDefs ?? []).filter((a) => a.is_sale_prop).map((a) => ({ name: a.name, label: a.label || a.name }));
  const chosen = (extra.lazada_variation && typeof extra.lazada_variation === "object" ? extra.lazada_variation : {}) as Record<string, { name?: unknown; customize?: unknown }>;
  const usedNames = new Set<string>();
  const pickStd = (want: RegExp) => saleProps.find((sp) => !usedNames.has(sp.name) && (want.test(sp.name) || want.test(sp.label)))?.name ?? null;
  const dims: LazVariationDim[] = ourDims.slice(0, 2).map((od) => {
    const c = chosen[od.key];
    let lazName = str(c?.name); let customize = c?.customize === true; let src = "ตั้งไว้สำหรับ Lazada";
    if (!lazName) {
      const std = od.key === "color" ? pickStd(COLOR_NAME) : SIZE_NAME.test(od.label) ? pickStd(/size/i) : null;
      if (std) { lazName = std; customize = false; src = "ช่องตัวเลือกของหมวด (ระบบเลือกให้)"; }
      else { lazName = od.label.slice(0, VAR_NAME_MAX); customize = true; src = saleProps.length ? "ชั้นกำหนดเอง (หมวดไม่มีช่องที่ตรง)" : "ชั้นกำหนดเอง"; }
    } else if (!customize && input.attrDefs && !saleProps.some((sp) => sp.name === lazName)) {
      warnings.push(`ชั้น "${lazName}" ไม่ใช่ช่องตัวเลือกของหมวดนี้ — ระบบใช้เป็นชั้นกำหนดเอง`); customize = true;
    }
    usedNames.add(lazName);
    if (customize && lazName.length > VAR_NAME_MAX) missing.push(`ชื่อชั้นตัวเลือก "${lazName}" ยาวเกิน ${VAR_NAME_MAX} ตัวอักษร`);
    const values = distinct(od.valOf);
    if (values.length > OPTS_PER_VAR) missing.push(`ชั้น "${od.label}" มี ${values.length} ค่า (Lazada รับไม่เกิน ${OPTS_PER_VAR})`);
    const long = values.filter((v) => v.length > OPT_MAX);
    if (long.length) missing.push(`ค่าตัวเลือกยาวเกิน ${OPT_MAX} ตัวอักษร ${long.length} ค่า เช่น "${long[0]}" — ย่อชื่อสี/ตัวเลือก`);
    return { key: od.key, label: od.label, lazName, customize, hasImage: false, values, src };
  });
  if (ourDims.length > 2) warnings.push("สินค้านี้มีตัวเลือกเกิน 2 ชั้น — Lazada รับ 2 ชั้นแรก");
  if (new Set(dims.map((x) => x.lazName)).size < dims.length) missing.push("ชื่อชั้นตัวเลือกซ้ำกัน");

  // ---------- รูปต่อตัวเลือก (ชั้นแรก · ไม่ใช่ size · ต้องครบทุกตัว) ----------
  const colorImg = new Map<string, string>();
  for (const s of act) { const c = colorOf(s); if (!c || colorImg.has(c)) continue; const k = masters.has(s.code) ? s.cover_image_r2_key : (s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null); if (k) colorImg.set(c, k); }
  const imgOfSku = (s: LazCreateSku): string | null => { const k = colorImg.get(colorOf(s)) ?? s.cover_image_r2_key ?? masterOf(s.code)?.cover_image_r2_key ?? null; return k ? r2(k) : null; };
  if (dims[0] && !/size/i.test(dims[0].lazName) && sellable.every((s) => imgOfSku(s))) dims[0].hasImage = true;

  // ---------- แถวตัวเลือก ----------
  const variants: LazCreateVariantRow[] = sellable.map((s) => {
    const fake = owner(s, "fake_price"), sale = owner(s, "list_price");
    const price = fake ?? sale; const special = fake && sale && sale < fake ? sale : null;
    const saleProp: Record<string, string> = {};
    dims.forEach((dm, i) => { saleProp[dm.lazName] = ourDims[i].valOf(s); });
    return { sku_id: s.id, code: s.code, saleProp, price, special, fake, sale, image_ref: imgOfSku(s) };
  });
  if (variants.length && variants.some((v) => !v.price)) missing.push(`ราคา (${variants.filter((v) => !v.price).length} ตัวเลือกยังไม่มีราคา)`);
  if (dims.length) {
    const combos = variants.map((v) => dims.map((dm) => v.saleProp[dm.lazName]).join("|"));
    if (new Set(combos).size < combos.length) missing.push("ตัวเลือกซ้ำกัน (สี/ตัวเลือกเหมือนกันมากกว่า 1 SKU) — เพิ่มชั้นที่ 2 หรือแก้ชื่อ");
  }
  const odd = variants.map((v) => v.code).filter((c) => /[^A-Za-z0-9._\- ]/.test(c));
  if (odd.length) warnings.push(`รหัส SKU มีเครื่องหมายพิเศษ ${odd.length} ตัว (เช่น ${odd[0]}) — Lazada อาจไม่รับ`);

  // ---------- รูปสินค้า ----------
  const picked = Array.isArray(extra.lazada_images) ? (extra.lazada_images as unknown[]).map(str).filter(Boolean) : [];
  const draftKeys = Array.isArray(d?.image_keys) ? (d!.image_keys as unknown[]).map(str).filter(Boolean).map(r2) : [];
  const autoRefs = [...new Set([...act.filter((s) => masters.has(s.code)).map((s) => s.cover_image_r2_key), ...sellable.map((s) => s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null), ...input.galleryKeys].filter(Boolean) as string[])].map(r2);
  const refs = [...new Set(picked.length ? picked : draftKeys.length ? draftKeys : autoRefs)].slice(0, LAZADA_CREATE_MAX_IMAGES);
  const imgSrc = picked.length ? "เลือกไว้สำหรับ Lazada" : draftKeys.length ? "รูปที่เลือกในร่าง" : "ปกตัวสี + ปก SKU + รูปสินค้า (อัตโนมัติ)";
  if (!refs.length) missing.push("รูปสินค้า ≥ 1");

  // ---------- พัสดุ ----------
  const wKg = pos(extra.lazada_weight) ?? (pos(p.weight_g) ? (p.weight_g as number) / 1000 : null);
  const weight = wKg != null ? round2(wKg) : null;
  const box = { l: pos(p.box?.l), w: pos(p.box?.w), h: pos(p.box?.h) };
  const pkgSrc = pos(extra.lazada_weight) ? "น้ำหนักแก้ไว้สำหรับ Lazada · กล่องจากสินค้า" : "น้ำหนัก + ขนาดกล่องของสินค้า";
  if (!weight) missing.push(pos(p.weight_g) ? "น้ำหนัก (น้อยเกินไป — เช็กว่ากรอกเป็นกรัม)" : "น้ำหนักพัสดุ");
  else if (weight > PKG_WEIGHT_MAX) missing.push(`น้ำหนัก ${weight} กก. เกิน ${PKG_WEIGHT_MAX} กก.`);
  if (!box.l || !box.w || !box.h) missing.push("ขนาดกล่องพัสดุ");
  else if (box.l + box.w + box.h > PKG_SUM_MAX) missing.push(`กล่อง กว้าง+ยาว+สูง เกิน ${PKG_SUM_MAX} ซม.`);

  // ---------- ข้อมูลเฉพาะของหมวด ----------
  const attrVals = (extra.lazada_attrs && typeof extra.lazada_attrs === "object" ? extra.lazada_attrs : {}) as Record<string, string>;
  const editable = (input.attrDefs ?? []).filter(lazAttrEditable);
  const attrOut: Record<string, string> = {};
  for (const def of editable) { const v = lazNormAttr(def, attrVals[def.name]); if (v) attrOut[def.name] = v; }
  const missingRequired = editable.filter((def) => def.required && !attrOut[def.name]).map((def) => def.label);
  if (missingRequired.length) missing.push(`ข้อมูลเฉพาะของหมวด ${missingRequired.length} ช่อง (${missingRequired.slice(0, 3).join(", ")}${missingRequired.length > 3 ? " …" : ""})`);
  if (!input.attrDefs && categoryId) warnings.push("ดึงช่องบังคับของหมวดจาก Lazada ไม่ได้ — ตรวจช่องข้อมูลเฉพาะไม่ได้");

  if (input.onShop || str(d?.platform_product_id)) warnings.push(`มีบน Lazada แล้ว (#${input.onShop ?? str(d?.platform_product_id)}) — ไม่สร้างซ้ำ`);

  // ---------- payload ----------
  const img = (list: string[]) => ({ Image: list });
  const variation: Record<string, unknown> = {};
  dims.forEach((dm, i) => { variation[`variation${i + 1}`] = { name: dm.lazName, hasImage: dm.hasImage, customize: dm.customize, options: { option: dm.values } }; });
  const skuPayload = variants.map((v) => ({
    SellerSku: v.code,
    quantity: "0",
    price: v.price != null ? String(v.price) : "",
    ...(v.special != null ? { special_price: String(v.special) } : {}),
    package_weight: weight != null ? String(weight) : "",
    package_length: box.l != null ? String(round2(box.l)) : "",
    package_width: box.w != null ? String(round2(box.w)) : "",
    package_height: box.h != null ? String(round2(box.h)) : "",
    ...(dims.length ? { saleProp: v.saleProp } : {}),
    ...(dims[0]?.hasImage && v.image_ref ? { Images: img([v.image_ref]) } : {}),
  }));
  const payload = {
    Request: {
      Product: {
        PrimaryCategory: categoryId ?? "",
        Images: img(refs),
        ...(dims.length ? { variation } : {}),
        Attributes: {
          name, description: descHtml, ...(highlightsHtml ? { short_description: highlightsHtml } : {}),
          brand: LAZADA_NO_BRAND, ...attrOut,
        },
        Skus: { Sku: skuPayload },
      },
    },
  };

  return {
    payload,
    preview: {
      parent_id: p.id, parent_code: p.code,
      name: { value: name, src: nameSrc },
      category: { id: categoryId, label: catPath || null, src: catSrc },
      description: { value: descHtml, src: descSrc },
      highlights: { value: hiLines, src: hiLines ? "เขียนไว้สำหรับ Lazada" : "ไม่มี (ไม่บังคับ)" },
      brand: { value: LAZADA_NO_BRAND, src: "ร้าน IG บน Lazada ใช้ No Brand" },
      images: { refs, src: imgSrc, custom: picked.length > 0 },
      package: { weight, ...box, src: pkgSrc },
      dims, saleProps, variants,
      attrs: { values: attrVals, missingRequired, loaded: !!input.attrDefs },
      missing, warnings,
      on_shop: input.onShop ?? (str(d?.platform_product_id) || null),
      draft_extra: extra,
    },
  };
}

/** รูปทั้งหมดที่ต้องฝากเข้า Lazada ก่อนส่ง (ref ที่ไม่ใช่ลิงก์ Lazada) — route ใช้ */
export function lazCreateImageRefs(payload: Record<string, unknown>): string[] {
  const prod = ((payload.Request as Record<string, unknown>)?.Product ?? {}) as Record<string, unknown>;
  const main = (((prod.Images as Record<string, unknown>)?.Image ?? []) as string[]);
  const skuImgs = ((((prod.Skus as Record<string, unknown>)?.Sku ?? []) as Record<string, unknown>[]).flatMap((s) => (((s.Images as Record<string, unknown>)?.Image ?? []) as string[])));
  return [...new Set([...main, ...skuImgs])].filter((r) => !isLazadaImage(r));
}
/** แทน ref ด้วยลิงก์ Lazada ที่ฝากแล้ว (ทุกจุดใน payload) */
export function lazCreateResolveImages(payload: Record<string, unknown>, migrated: Map<string, string>): Record<string, unknown> {
  const fix = (list: unknown) => (Array.isArray(list) ? list.map((r) => migrated.get(String(r)) ?? r) : list);
  const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const prod = (copy.Request as Record<string, unknown>).Product as Record<string, unknown>;
  if (prod.Images) (prod.Images as Record<string, unknown>).Image = fix((prod.Images as Record<string, unknown>).Image);
  for (const s of (((prod.Skus as Record<string, unknown>)?.Sku ?? []) as Record<string, unknown>[])) if (s.Images) (s.Images as Record<string, unknown>).Image = fix((s.Images as Record<string, unknown>).Image);
  return copy;
}
