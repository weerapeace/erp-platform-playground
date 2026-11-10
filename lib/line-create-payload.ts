/**
 * ประกอบข้อมูล "สร้างสินค้าใหม่บน LINE SHOPPING" (ของกลาง · ฝั่งเซิร์ฟเวอร์)
 * --------------------------------------------------------------------------
 * ใช้ 2 ที่ — ต้องตรงกันเสมอ (ห้ามประกอบแยก):
 *   1) POST /api/line-shopping/create-product  → ส่งขึ้น LINE จริง (payload)
 *   2) GET  /api/line-shopping/create-product?parent_sku_id= → ตัวช่วยลงสินค้า ขั้น "ดูและแก้" (preview)
 *      preview = สิ่งที่จะส่งทุกช่อง + "มาจากไหน" + ช่องที่ขาด → เจ้าของขอ 2026-11-10 "ต้องบอกว่ารายละเอียดจะดึงอะไรไปบ้าง แก้ได้ด้วย"
 *
 * กติกา (ย้ายมาจาก create-product เดิม ไม่เปลี่ยนพฤติกรรม ยกเว้นข้อที่บอก):
 *   ชื่อ = ร่าง → ชื่อสำหรับแพลตฟอร์ม → ชื่อสินค้า · หมวด = ร่าง (category_path "{id} · ชื่อ")
 *   รายละเอียด = ร่าง → รายละเอียดสำหรับแพลตฟอร์ม → รายละเอียดสินค้า · แบรนด์ = ร่าง extra.brand → แบรนด์ของสินค้า
 *   น้ำหนัก(kg) = ร่าง extra.weight → weight_g ÷ 1000 (≤ 2 ตำแหน่ง)
 *   รูป ≤ 7: [ใหม่] ร่าง extra.line_images (ตัวช่วยลงสินค้าเลือกไว้ = ใช้ตามนั้นเป๊ะ) → ไม่มี = ร่าง image_keys หรือปกตัวสี+ปกตัวขาย + รูปในรายละเอียด
 *   โครง 3 ชั้น: ส่งเฉพาะ "ตัวขาย" · ตัวขายไม่มีราคา/รูป → ใช้ของ "ตัวสี" (รหัสฐาน เช่น WK42-01 ของ WK42-01D)
 *   ราคา = กฎกลาง linePrice(ราคาเต็ม, ราคาขาย) · สต๊อก = พร้อมขาย (มี − จอง) รวมทุกคลัง
 *   ตัวเลือก: สี = มิติหลัก (+รูปต่อสี) · ตัวเลือกที่ 2 = attribute_values.variant_option · ไม่มีเลย = ใช้รหัส SKU (ลงแบบมีตัวเลือกเสมอ)
 *   ไม่ส่งตอนสร้าง: บาร์โค้ด (กันชนข้ามตัวเลือก) · ขนาดกล่อง
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { linePrice } from "@/lib/platform-listing-builder";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { noteToHtml, type NoteHtmlOptions } from "@/lib/rich-note";

/** รายละเอียดในระบบเป็นข้อความธรรมดา แต่ LINE เก็บเป็น HTML ย่อหน้า (920/934 รายการบนร้าน) → แปลงก่อนส่ง
 *  เก็บบรรทัดว่าง + ย่อหน้าเยื้อง · ขีด "- " คงเป็นข้อความ (ไม่แปลงเป็น <ul> — ยังไม่รู้ว่า LINE รับไหม) · เป็น HTML อยู่แล้ว = ใช้ตามนั้น */
export const LINE_DESC_HTML: NoteHtmlOptions = { keepBlankLines: true, keepIndent: true, bullets: false };

type Admin = ReturnType<typeof supabaseAdmin>;
type SkuRow = { id: string; code: string; color_th: string | null; color: string | null; list_price: number | null; fake_price: number | null; cover_image_r2_key: string | null; attribute_values: Record<string, unknown> | null };

export const LINE_CREATE_MAX_IMAGES = 7;
/** ช่องที่ LINE รับแต่ไม่ส่งตอนสร้าง (บอกผู้ใช้ให้รู้ — ตั้งทีหลังในลิ้นชักสินค้า) */
export const LINE_CREATE_NOT_SENT = ["บาร์โค้ด", "ขนาดกล่อง"];

export type LineCreateVariantRow = {
  sku_id: string; code: string;
  /** ค่าตัวเลือก ตามลำดับ option_names */
  options: string[];
  /** ราคาเต็ม / ราคาขาย ในระบบ + SKU ที่เป็นเจ้าของราคานั้น (ตัวขายเอง หรือตัวสีที่สืบทอดมา) — แก้ราคาต้องแก้ที่ตัวนี้ */
  fake: number | null; fake_sku_id: string | null; fake_sku_code: string | null;
  sale: number | null; sale_sku_id: string | null; sale_sku_code: string | null;
  /** ที่จะส่งขึ้น LINE (linePrice) */
  price: number; discount: number;
  stock: number;
  image_key: string | null;
};
export type LineCreateField<T> = { value: T; src: string };
export type LineCreatePreview = {
  parent_id: string; parent_code: string; platform_id: string; brand_id: string | null;
  name: LineCreateField<string>;
  category: { id: string | null; label: string | null; src: string };
  description: LineCreateField<string>;
  brand: LineCreateField<string>;
  weight: { kg: number; src: string };
  images: { keys: string[]; src: string; custom: boolean };
  option_names: string[];
  variants: LineCreateVariantRow[];
  /** ส่วนลดระดับสินค้าที่ส่งตอนสร้าง (ใช้ได้เมื่อทุกตัวเลือกลดเท่ากัน) */
  top_discount: number;
  /** ข้อมูลที่ขาด → ลงไม่ได้ */
  missing: string[];
  /** ด่านอื่นที่ทำให้ลงไม่ได้ (ไม่มีแบรนด์ / ไม่มี API Key / มีบนร้านแล้ว) */
  blockers: string[];
  /** มีบน LINE แล้ว (รหัสสินค้า) */
  on_shop: string | null;
  /** ฟิลด์เสริมของร่างทั้งก้อน — ฝั่งหน้าเว็บต้องส่งกลับทั้งก้อนตอนแก้ (PATCH /api/product-platforms set extra ทั้งก้อน) */
  draft_extra: Record<string, unknown>;
  not_sent: string[];
};
export type LineCreateBuild =
  | { ok: false; status: number; error: string }
  | { ok: true; preview: LineCreatePreview; payload: Record<string, unknown>; credential: string | null; draftProductId: string | null };

const baseUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
export const lineCategoryIdOf = (path: unknown): string | null => {
  const s = String(path ?? "").trim(); if (!s) return null;
  if (s.includes(" · ")) return s.split(" · ")[0].trim() || null;
  const m = s.match(/^(\d+)\b/); return m ? m[1] : null;
};
const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export async function buildLineCreate(admin: Admin, parentSkuId: string): Promise<LineCreateBuild> {
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return { ok: false, status: 400, error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" };

  const [{ data: parent }, { data: draft }, { data: skus }, { data: onShop }] = await Promise.all([
    admin.from("parent_skus_v2").select("id, code, name_th, name_platform, description, platform_description, brand_id, weight_g, platform_category_id").eq("id", parentSkuId).maybeSingle(),
    admin.from("platform_listing_drafts").select("title, description, category_path, extra, image_keys, description_image_keys, platform_product_id").eq("parent_sku_id", parentSkuId).eq("platform_id", platform_id).maybeSingle(),
    admin.from("skus_v2").select("id, code, color_th, color, list_price, fake_price, cover_image_r2_key, attribute_values").eq("parent_sku_id", parentSkuId).eq("is_active", true).order("code"),
    // 🛡️ กันซ้ำ (บทเรียน JEAN08 ถูกสร้างซ้ำ 6 รายการ ก.ค. 2026): มีรายการบน LINE ที่จับคู่สินค้านี้อยู่แล้ว · ไม่นับตัวที่ร้านลบไปแล้ว
    admin.from("platform_catalog_listings").select("external_product_id").eq("platform_id", platform_id).eq("matched_parent_sku_id", parentSkuId).or(LIVE_LISTING_OR).limit(1),
  ]);
  if (!parent) return { ok: false, status: 400, error: "ไม่พบสินค้า" };
  const p = parent as Record<string, unknown>;
  const d = (draft ?? {}) as Record<string, unknown>;
  const extra = (d.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>;
  const brand_id = (p.brand_id as string) ?? null;

  const [brandRes, credRes, mapRes] = await Promise.all([
    brand_id ? admin.from("brands").select("name").eq("id", brand_id).maybeSingle() : Promise.resolve({ data: null }),
    brand_id ? admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle() : Promise.resolve({ data: null }),
    p.platform_category_id ? admin.from("platform_category_mappings").select("platform_category_path").eq("central_category_id", p.platform_category_id as string).eq("platform_id", platform_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const brandName = str((brandRes.data as { name?: string } | null)?.name);
  const credential = ((credRes.data as { api_key?: string } | null)?.api_key) || null;
  const mappedPath = str((mapRes.data as { platform_category_path?: string } | null)?.platform_category_path);

  // ---------- ชื่อ / หมวด / รายละเอียด / แบรนด์ / น้ำหนัก (+ มาจากไหน) ----------
  const namePf = str(p.name_platform), nameTh = str(p.name_th), dTitle = str(d.title);
  const name = dTitle || namePf || nameTh;
  const nameSrc = !name ? "ยังไม่มีชื่อ" : dTitle && dTitle !== namePf && dTitle !== nameTh ? "แก้ไว้สำหรับ LINE" : (dTitle ? dTitle : name) === namePf ? "ชื่อสำหรับแพลตฟอร์ม" : "ชื่อสินค้า";

  const catPath = str(d.category_path);
  const categoryId = lineCategoryIdOf(catPath);
  const catSrc = !catPath
    ? (!p.platform_category_id ? "สินค้ายังไม่มีหมวดกลาง" : mappedPath ? "หมวดกลางผูกหมวด LINE แล้ว (ยังไม่ได้ดึงเข้าร่าง)" : "หมวดกลางของสินค้านี้ยังไม่ได้ผูกหมวด LINE")
    : catPath === mappedPath ? "หมวดกลางของสินค้า → หมวด LINE" : "เลือกไว้สำหรับ LINE";

  const descPf = String(p.platform_description ?? ""), descMain = String(p.description ?? ""), dDesc = String(d.description ?? "");
  const descRaw = dDesc || descPf || descMain;
  const descText = noteToHtml(descRaw, LINE_DESC_HTML);
  const descSrc = !descRaw.trim() ? "ยังไม่มีรายละเอียด" : dDesc && dDesc !== descPf && dDesc !== descMain ? "แก้ไว้สำหรับ LINE" : descRaw === descPf ? "รายละเอียดสำหรับแพลตฟอร์ม" : "รายละเอียดสินค้า";

  const brandVal = str(extra.brand) || brandName;
  const brandSrc = !brandVal ? "ยังไม่มีแบรนด์" : str(extra.brand) && str(extra.brand) !== brandName ? "แก้ไว้สำหรับ LINE" : "แบรนด์ของสินค้า";

  const weightRaw = extra.weight ? Number(extra.weight) : (p.weight_g != null ? Number(p.weight_g) / 1000 : 0);
  const weightKg = Number.isFinite(weightRaw) ? Math.round(weightRaw * 100) / 100 : 0;   // LINE: น้ำหนัก ≤ 2 ตำแหน่งทศนิยม
  const wg = p.weight_g != null ? Number(p.weight_g) : 0;
  const weightSrc = extra.weight ? "แก้ไว้สำหรับ LINE"
    : wg > 0 && weightKg <= 0 ? `น้ำหนักสินค้า ${wg.toLocaleString()} กรัม — น้อยเกินไป ไม่ส่ง (เช็กว่ากรอกเป็นกรัมหรือยัง)`
    : wg > 0 ? `น้ำหนักสินค้า (${wg.toLocaleString()} กรัม)` : "ยังไม่มีน้ำหนัก (ไม่ส่ง)";

  // ---------- โครง 3 ชั้น: ตัวสี (master) / ตัวขาย (sellable) ----------
  const skuRows = (skus ?? []) as SkuRow[];
  const baseOf = (code: string): string | null => { const m = code.match(/^(.*\d)[A-Za-z]+$/); return m ? m[1] : null; };
  const byCode = new Map(skuRows.map((s) => [s.code, s]));
  const masterCodes = new Set<string>();
  for (const s of skuRows) { const b = baseOf(s.code); if (b && byCode.has(b)) masterCodes.add(b); }
  const sellable = skuRows.filter((s) => !masterCodes.has(s.code));
  const masterOf = (code: string) => { const b = baseOf(code); return b ? byCode.get(b) ?? null : null; };

  // สต๊อกจริงต่อ SKU (พร้อมขาย = on_hand − reserved, รวมทุกคลัง) — เฉพาะตัวขาย
  const stockOf = new Map<string, number>();
  const skuIds = sellable.map((s) => s.id);
  if (skuIds.length) {
    const { data: bal } = await admin.from("erp_playground_stock_balances").select("product_id, qty_on_hand, qty_reserved").in("product_id", skuIds);
    for (const b of ((bal ?? []) as Record<string, unknown>[])) {
      const avail = (Number(b.qty_on_hand) || 0) - (Number(b.qty_reserved) || 0);
      stockOf.set(String(b.product_id), (stockOf.get(String(b.product_id)) ?? 0) + Math.max(0, avail));
    }
  }

  // ราคา: ตัวขายไม่มี → ดึงจากตัวสี (จำว่ามาจาก SKU ไหน — แก้ราคาต้องแก้ที่ตัวนั้น)
  const priceOwner = (s: SkuRow, field: "fake_price" | "list_price"): SkuRow | null => num(s[field]) ? s : (num(masterOf(s.code)?.[field]) ? masterOf(s.code) : null);
  const fakeOf = (s: SkuRow) => num(priceOwner(s, "fake_price")?.fake_price);
  const saleOf = (s: SkuRow) => num(priceOwner(s, "list_price")?.list_price);
  const lpOf = (s: SkuRow) => linePrice(fakeOf(s), saleOf(s));

  // มิติตัวเลือก (LINE รองรับ option1 + option2)
  const colorOf = (s: SkuRow) => (s.color_th || s.color || "").trim();
  const voOf = (s: SkuRow) => { const av = s.attribute_values; const vo = (av && typeof av === "object") ? (av as Record<string, unknown>).variant_option : null; return (vo && typeof vo === "object") ? vo as Record<string, unknown> : null; };
  const opt2Of = (s: SkuRow) => { const vo = voOf(s); return vo ? String(vo.value ?? "").trim() : ""; };
  const opt2Name = (() => { for (const s of sellable) { const vo = voOf(s); const n = vo ? String(vo.name ?? "").trim() : ""; if (n) return n; } return "ตัวเลือก"; })();
  // รูปต่อสี (imageUrl ใส่ได้เฉพาะ option1 = สี): ปก "ตัวสี" ก่อน แล้ว fallback ตัวขาย · LINE ต้อง 1:1 → r2-image แบบ square
  const sqImg = (k: string) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}&w=800&sq=1&fmt=jpg`;
  const colorImg = new Map<string, string>();
  for (const s of skuRows) { const c = colorOf(s); if (!c || colorImg.has(c)) continue; const key = masterCodes.has(s.code) ? s.cover_image_r2_key : (s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null); if (key) colorImg.set(c, key); }
  const distinctVals = (fn: (s: SkuRow) => string) => { const out: string[] = []; const seen = new Set<string>(); for (const s of sellable) { const v = fn(s); if (v && !seen.has(v)) { seen.add(v); out.push(v); } } return out; };
  const dims: { name: string; vals: string[]; valOf: (s: SkuRow) => string; img: boolean }[] = [];
  { const cv = distinctVals(colorOf); if (cv.length) dims.push({ name: "สี", vals: cv, valOf: colorOf, img: true }); }
  { const ov = distinctVals(opt2Of); if (ov.length) dims.push({ name: opt2Name, vals: ov, valOf: opt2Of, img: false }); }
  // เจ้าของต้องการ "ลงเป็นสินค้ามีตัวเลือกเสมอ แม้ SKU เดียว" → ไม่มีสี/ตัวเลือกเลย ใช้รหัส SKU เป็นค่าตัวเลือก
  if (!dims.length && sellable.length >= 1) dims.push({ name: "แบบ", vals: sellable.map((s) => s.code), valOf: (s) => s.code, img: false });
  const opt1 = dims[0]; const opt2 = dims[1];
  // ส่วนลด: create รับ instantDiscount ระดับบนสุดเท่านั้น → ค่าร่วมถ้าทุกตัวเท่ากัน ไม่งั้น 0 (ส่งส่วนลดต่อ SKU ทีหลังด้วยปุ่มส่งราคา)
  const discs = sellable.map((s) => lpOf(s)?.discount ?? 0);
  const topDiscount = discs.length && discs.every((x) => x === discs[0]) ? discs[0] : 0;
  const variants = sellable.map((s) => {
    const base: Record<string, unknown> = { sku: s.code, price: lpOf(s)?.price ?? 0, onHandNumber: stockOf.get(s.id) ?? 0 };
    if (weightKg > 0) base.weight = weightKg;
    if (opt1) { const i1 = Math.max(0, opt1.vals.indexOf(opt1.valOf(s))); base.options = opt2 ? [i1, Math.max(0, opt2.vals.indexOf(opt2.valOf(s)))] : [i1]; }
    return base;
  });
  const variantRows: LineCreateVariantRow[] = sellable.map((s) => {
    const fo = priceOwner(s, "fake_price"), so = priceOwner(s, "list_price");
    const lp = lpOf(s);
    return {
      sku_id: s.id, code: s.code, options: dims.map((dm) => dm.valOf(s)),
      fake: fo ? num(fo.fake_price) : null, fake_sku_id: (fo ?? s).id, fake_sku_code: (fo ?? s).code,
      sale: so ? num(so.list_price) : null, sale_sku_id: (so ?? s).id, sale_sku_code: (so ?? s).code,
      price: lp?.price ?? 0, discount: lp?.discount ?? 0, stock: stockOf.get(s.id) ?? 0,
      image_key: colorImg.get(colorOf(s)) ?? s.cover_image_r2_key ?? masterOf(s.code)?.cover_image_r2_key ?? null,
    };
  });

  // ---------- รูป ----------
  const lineImages = Array.isArray(extra.line_images) ? (extra.line_images as unknown[]).map(str).filter(Boolean) : [];
  const imageKeys = Array.isArray(d.image_keys) ? (d.image_keys as string[]).filter(Boolean) : [];
  const descImgKeys = Array.isArray(d.description_image_keys) ? (d.description_image_keys as string[]).filter(Boolean) : [];
  let galleryKeys: string[]; let imgSrc: string;
  if (lineImages.length) { galleryKeys = [...new Set(lineImages)].slice(0, LINE_CREATE_MAX_IMAGES); imgSrc = "เลือกไว้สำหรับ LINE"; }
  else {
    const autoKeys = imageKeys.length ? imageKeys : [...new Set([
      ...skuRows.filter((s) => masterCodes.has(s.code)).map((s) => s.cover_image_r2_key),
      ...sellable.map((s) => s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null),
    ].filter(Boolean) as string[])];
    // รูปในรายละเอียด: LINE ไม่รับ <img> ลิงก์ภายนอกในช่องรายละเอียด → รวมเข้าแกลเลอรีแทน (รูปหลักก่อน)
    galleryKeys = [...new Set([...autoKeys, ...descImgKeys])].slice(0, LINE_CREATE_MAX_IMAGES);
    imgSrc = `${imageKeys.length ? "รูปที่เลือกในร่าง" : "ปกตัวสี + ปก SKU (อัตโนมัติ)"}${descImgKeys.length ? " + รูปในรายละเอียด" : ""}`;
  }
  const imageUrls = galleryKeys.map((k) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}`);

  // ---------- ตรวจครบ ----------
  const missing: string[] = [];
  if (!name) missing.push("ชื่อ");
  if (!categoryId) missing.push("หมวด LINE");
  if (imageUrls.length === 0) missing.push("รูปสินค้า ≥ 1");
  if (variants.length === 0 || variants.every((v) => !v.price)) missing.push("ราคา SKU");
  const exOnShop = ((onShop ?? []) as { external_product_id: string | null }[])[0];
  const draftProductId = str(d.platform_product_id) || null;
  const blockers: string[] = [];
  if (draftProductId || exOnShop) blockers.push(`มีบน LINE แล้ว (#${exOnShop?.external_product_id ?? draftProductId ?? "?"}) — ไม่สร้างซ้ำ`);
  if (!brand_id) blockers.push("สินค้ายังไม่มีแบรนด์ (คีย์ LINE ผูกกับแบรนด์)");
  else if (!credential) blockers.push("แบรนด์นี้ยังไม่ได้ใส่ API Key ของ LINE");

  const payload: Record<string, unknown> = {
    name, code: str(p.code), categoryId: Number(categoryId), description: descText,
    brand: brandVal, imageUrls, variants, instantDiscount: topDiscount,
    ...(opt1 ? { variantOptions: {
      option1: { name: opt1.name, data: opt1.vals.map((v) => ({ value: v, ...(opt1.img && colorImg.get(v) ? { imageUrl: sqImg(colorImg.get(v)!) } : {}) })) },
      ...(opt2 ? { option2: { name: opt2.name, data: opt2.vals.map((v) => ({ value: v })) } } : {}),
    } } : {}),
  };

  return {
    ok: true, credential, draftProductId, payload,
    preview: {
      parent_id: parentSkuId, parent_code: str(p.code), platform_id, brand_id,
      name: { value: name, src: nameSrc },
      category: { id: categoryId, label: catPath || null, src: catSrc },
      description: { value: descText, src: descSrc },
      brand: { value: brandVal, src: brandSrc },
      weight: { kg: weightKg, src: weightSrc },
      images: { keys: galleryKeys, src: imgSrc, custom: lineImages.length > 0 },
      option_names: dims.map((dm) => dm.name),
      variants: variantRows,
      top_discount: topDiscount,
      missing, blockers,
      on_shop: exOnShop?.external_product_id ?? draftProductId,
      draft_extra: extra,
      not_sent: LINE_CREATE_NOT_SENT,
    },
  };
}
