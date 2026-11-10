/**
 * "ลงร้านอื่นจากรายการนี้" — แปลงรายการบนร้านต้นทาง (LINE / Lazada / Shopee) เป็นหน้าตาเดียวกัน (ของกลาง · pure · มีเทสต์)
 * --------------------------------------------------------------------------
 * ใช้คู่กับ lib/listing-copy-map (กฎจับคู่ช่อง) · ตัวโหลดจากฐานข้อมูล/ดึงสด = app/api/platform-listing/copy/load.ts
 * แต่ละร้านให้ข้อมูลไม่เท่ากัน (เช็กข้อมูลจริง 2026-11-10):
 *   LINE    = raw.line เก็บครบ (ชื่อ · รายละเอียด HTML · รูป ≤7 · แบรนด์ · หมวด · ตัวเลือก+ราคาเต็ม/ลด · น้ำหนัก)
 *   Lazada  = สำเนาย่อในระบบไม่มีรูป/รายละเอียด → ดึงสด /product/item/get (lazadaListingView) · ดึงไม่ได้ = ใช้สำเนาย่อ (ชื่อ+ราคา)
 *   Shopee  = จากไฟล์ export มีแค่ชื่อ + รายละเอียด (ข้อความ)
 * สต๊อกไม่ดึงมาเลย (ไม่คัดลอกสต๊อกข้ามร้าน — ระบบสต๊อกกลางดูแล)
 * ห้าม import "@/..." ที่มีโค้ดฝั่งเซิร์ฟเวอร์ (ใช้ในเทสต์ได้)
 */
import type { LazadaListingView } from "@/lib/lazada-listing-edit";

export type CopySourceVariant = {
  /** รหัส SKU บนร้าน (ใช้จับกับ SKU ในระบบ) */
  sku: string | null;
  /** ชื่อตัวเลือกที่ลูกค้าเห็น เช่น "สี: สีทอง" */
  label: string;
  /** ราคาเต็ม (มีเมื่อร้านมีราคาลด) */
  full: number | null;
  /** ราคาที่ลูกค้าจ่าย */
  sale: number | null;
  image: string | null;
  weightKg: number | null;
};

export type CopySource = {
  listingId: string;
  platformCode: string;
  platformName: string;
  externalId: string | null;
  title: string;
  /** รายละเอียดเป็นข้อความล้วน (แปลงจาก HTML แล้ว · จุดเด่นอยู่บนสุด) */
  descriptionText: string;
  /** ลิงก์รูปของร้าน (รูปแรก = ปก) */
  images: string[];
  /** แบรนด์บนร้าน (null = ไม่มี / No Brand) */
  brand: string | null;
  categoryLabel: string | null;
  weightKg: number | null;
  variants: CopySourceVariant[];
  /** ข้อมูลสดจากร้าน (false = ใช้สำเนาในระบบ อาจไม่ครบ) */
  live: boolean;
  /** เหตุผลที่ข้อมูลไม่ครบ (เช่น ดึงสดจาก Lazada ไม่ได้) */
  warning: string | null;
};

/** ชื่อร้านต้นทางที่โชว์ในตัวช่วยลงสินค้า (ก่อนโหลดจากฐานข้อมูล) */
const SOURCE_NAME: Record<string, string> = { lazada: "Lazada", shopee: "Shopee", tiktok: "TikTok", line_shopping: "LINE SHOPPING", website: "เว็บไซต์" };
export const copySourceName = (code: string | null | undefined): string => SOURCE_NAME[String(code ?? "")] ?? String(code ?? "");
/** เฟส 1: ร้านที่ใช้เป็นต้นแบบได้ (ปลายทาง LINE) */
export const COPY_SOURCE_PLATFORMS = ["lazada", "shopee"] as const;
export const isCopySourcePlatform = (code: string | null | undefined): boolean => (COPY_SOURCE_PLATFORMS as readonly string[]).includes(String(code ?? ""));

export type CopySourceMeta = { listingId: string; platformCode: string; platformName: string; externalId: string | null; title: string | null };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const pos = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

const NO_BRAND = /^(no\s*brand|nobrand|ไม่มีแบรนด์|ไม่ระบุ(แบรนด์)?|oem|generic|-)$/i;
/** แบรนด์ที่ใช้ได้จริง (No Brand / ว่าง = null) */
export const usableBrand = (v: unknown): string | null => { const s = str(v); return s && !NO_BRAND.test(s) ? s : null; };

const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#39": "'" };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
  .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (m, k) => ENT[String(k).toLowerCase()] ?? m);

/**
 * HTML ของร้าน → ข้อความล้วน (1 ย่อหน้า = 1 บรรทัด · ย่อหน้าว่างของร้าน = บรรทัดว่าง · รายการเป็น "• ")
 * เอาออก: รูป (<img> — LINE ไม่รับลิงก์รูปนอกในรายละเอียด) · สคริปต์/สไตล์ · แท็กทั้งหมด · บรรทัดที่มีแต่ขีด (เช่น "- -")
 * ข้อความล้วน = รูปแบบเดียวกับรายละเอียดในระบบ → แต่ละร้านแปลงต่อเอง (LINE: noteToHtml)
 * บทเรียน IG-PROP001 (2026-11-10): เดิมแปลงทุก </p> เป็นบรรทัดว่าง → บน LINE มีบรรทัดว่างแทรกทุกบรรทัด
 */
const BLOCK = "\u0001";   // ขอบย่อหน้า (หลายตัวติดกัน = ขึ้นบรรทัดใหม่ครั้งเดียว)
const BLANK = "\u0002";   // ย่อหน้าว่างของร้าน = บรรทัดว่าง
export function copyTextFromHtml(html: string | null | undefined): string {
  const src = String(html ?? "");
  if (!src.trim()) return "";
  if (!/<[a-z!/]/i.test(src)) return src.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const text = src
    .replace(/<(script|style|iframe|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<(p|div)[^>]*>(?:\s|&nbsp;| |<br\s*\/?>|<\/?(?:span|b|strong|i|em|u)[^>]*>)*<\/\1>/gi, `${BLOCK}${BLANK}${BLOCK}`)
    .replace(/<li[^>]*>/gi, `${BLOCK}• `)
    .replace(/<\/li>/gi, BLOCK)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|tr|table|section|article|blockquote|ul|ol)[^>]*>/gi, BLOCK)
    .replace(/<[^>]+>/g, "")
    .replace(new RegExp(`${BLOCK}+`, "g"), "\n")
    .replace(new RegExp(BLANK, "g"), "");
  return decode(text)
    .replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => !/^[-–—•*·]+(\s+[-–—•*·]+)*$/.test(l))   // บรรทัดที่มีแต่ขีด/จุด (เช่น "- -") = ขยะ
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(• [^\n]*)\n\n(?=• )/g, "$1\n")   // รายการติดกันไม่เว้นบรรทัด
    .trim();
}

/** จุดเด่น (Lazada short_description) + รายละเอียด → ข้อความเดียว */
function joinDescription(highlightsHtml: string, descHtml: string): string {
  const hi = copyTextFromHtml(highlightsHtml);
  const body = copyTextFromHtml(descHtml);
  return [hi, body].filter(Boolean).join("\n\n");
}

const uniq = (xs: string[]) => [...new Set(xs.map(str).filter(Boolean))];

/** Lazada (ข้อมูลสด lazadaListingView) */
export function sourceFromLazadaView(view: LazadaListingView, meta: CopySourceMeta): CopySource {
  const variants: CopySourceVariant[] = view.skus.map((s) => {
    const price = pos(s.price); const sp = pos(s.specialPrice);
    const hasSale = sp != null && price != null && sp < price;
    return { sku: str(s.sellerSku) || null, label: s.label, full: hasSale ? price : null, sale: hasSale ? sp : price, image: s.images[0] ?? null, weightKg: pos(s.weight) };
  });
  return {
    ...metaPart(meta),
    title: str(view.name) || str(meta.title),
    descriptionText: joinDescription(view.shortDescription, view.description),
    images: uniq(view.images),
    brand: usableBrand(view.brand),
    categoryLabel: view.categoryId ? `Lazada ${view.categoryId}` : null,
    weightKg: variants.map((v) => v.weightKg).find((w) => w != null) ?? null,
    variants, live: true, warning: null,
  };
}

/** Lazada (สำเนาย่อในระบบ raw.lazada — ใช้เมื่อดึงสดไม่ได้: มีแค่ชื่อ + ราคา + ชื่อตัวเลือก) */
export function sourceFromLazadaSlim(raw: unknown, meta: CopySourceMeta, warning: string): CopySource {
  const r = obj(obj(raw)?.lazada) ?? {};
  const skus = Array.isArray(r.skus) ? r.skus.map(obj).filter((s): s is Obj => !!s) : [];
  const variants: CopySourceVariant[] = skus.map((s) => {
    const price = pos(s.price); const sp = pos(s.special_price);
    const hasSale = sp != null && price != null && sp < price;
    return { sku: str(s.seller_sku) || null, label: str(s.label) || str(s.seller_sku), full: hasSale ? price : null, sale: hasSale ? sp : price, image: null, weightKg: null };
  });
  return {
    ...metaPart(meta), title: str(meta.title), descriptionText: "", images: [], brand: usableBrand(r.brand),
    categoryLabel: r.primary_category ? `Lazada ${str(r.primary_category)}` : null, weightKg: null, variants, live: false, warning,
  };
}

/** LINE SHOPPING (raw.line ที่เก็บไว้ตอนดึงร้าน) */
export function sourceFromLineRaw(raw: unknown, meta: CopySourceMeta): CopySource {
  const l = obj(obj(raw)?.line) ?? {};
  const vs = Array.isArray(l.variants) ? l.variants.map(obj).filter((v): v is Obj => !!v) : [];
  const variants: CopySourceVariant[] = vs.map((v) => {
    const price = pos(v.price); const paid = pos(v.discountedPrice);
    const hasSale = paid != null && price != null && paid < price;
    const opts = Array.isArray(v.options) ? v.options.map(obj).filter((o): o is Obj => !!o).map((o) => [str(o.name), str(o.value)].filter(Boolean).join(": ")).filter(Boolean) : [];
    return { sku: str(v.sku) || null, label: opts.join(" · ") || str(v.sku), full: hasSale ? price : null, sale: hasSale ? paid : price, image: str(v.imageUrl) || null, weightKg: pos(v.weight) };
  });
  const cat = obj(l.category);
  return {
    ...metaPart(meta),
    title: str(l.name) || str(meta.title),
    descriptionText: copyTextFromHtml(String(l.description ?? "")),
    images: uniq(Array.isArray(l.imageUrls) ? l.imageUrls.map(str) : []),
    brand: usableBrand(l.brand),
    categoryLabel: cat ? [str(cat.id), str(cat.nameTh)].filter(Boolean).join(" · ") || null : null,
    weightKg: variants.map((v) => v.weightKg).find((w) => w != null) ?? null,
    variants, live: false, warning: null,
  };
}

/** Shopee (ไฟล์ export raw.basic_info — มีแค่ชื่อ/รายละเอียด) */
export function sourceFromShopeeRaw(raw: unknown, meta: CopySourceMeta): CopySource {
  const b = obj(obj(raw)?.basic_info) ?? {};
  return {
    ...metaPart(meta),
    title: str(b.et_title_product_name) || str(meta.title),
    descriptionText: copyTextFromHtml(str(b.et_title_product_description)),
    images: [], brand: null, categoryLabel: null, weightKg: null, variants: [], live: false,
    warning: "ไฟล์จาก Shopee มีแค่ชื่อกับรายละเอียด — รูป ราคา และตัวเลือกใช้ข้อมูลในระบบ",
  };
}

function metaPart(m: CopySourceMeta) {
  return { listingId: m.listingId, platformCode: m.platformCode, platformName: m.platformName, externalId: m.externalId };
}
