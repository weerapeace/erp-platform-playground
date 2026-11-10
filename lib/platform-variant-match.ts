/**
 * ตัวเลือกบนร้าน ↔ SKU ในระบบ (ของกลาง · pure ใช้ได้ทั้งหน้าเว็บและหลังบ้าน)
 *
 * สินค้า 1 หน้าบนร้าน = Parent SKU 1 รุ่น (คนกดจับคู่ที่หน้าจับคู่)
 * ตัวเลือกในหน้านั้น (สี/ไซซ์) = SKU — ระบบจับเองด้วย "รหัส" ตอนส่งราคา/สต๊อก (ไม่ได้บันทึกคู่ไว้)
 *   1) รหัสตรงเป๊ะ (WK42-01D = WK42-01D)                         → exact
 *   2) ไม่เจอ → ตัดตัวอักษรท้ายเป็นรหัสสี (MGN402-03M → MGN402-03)  → base
 *   3) ไม่เจอทั้งคู่ → ส่งราคา/สต๊อกให้ตัวนี้ไม่ได้                    → none
 * ต้องตรงกับที่ /api/line-shopping/push-prices ทำจริง (เทียบแบบตัวพิมพ์ตรงกัน) — ฐานรหัสใช้ baseOfCode ตัวเดียวกัน
 */
import { baseOfCode } from "@/lib/product-listing-context";
import { linePrice } from "@/lib/platform-listing-builder";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** ตัวเลือก 1 ตัวบนร้าน (อ่านจาก raw ที่ดึงมาจากร้าน) */
export type ShopVariant = {
  key: string;                 // id ของตัวเลือกบนร้าน (ไม่มี = ลำดับ)
  sku: string | null;          // รหัสที่ร้านเก็บ (LINE: sku · Lazada: seller_sku)
  label: string;               // ชื่อตัวเลือกที่ลูกค้าเห็น เช่น "สี: ดำ (01)"
  price: number | null;
  sale_price: number | null;   // ราคาหลังลด (ต่ำกว่าราคาหลักเท่านั้น)
  stock: number | null;
  image: string | null;
};

/** อ่านตัวเลือกจาก raw — LINE (raw.line.variants) · Lazada (raw.lazada.skus) · ร้านอื่น/ไฟล์ export = [] */
export function shopVariantsOf(platformCode: string, raw: unknown): ShopVariant[] {
  const r = obj(raw) ?? {};
  if (platformCode === "line_shopping") {
    return arr(obj(r.line)?.variants).map(obj).filter((v): v is Obj => !!v).map((v, i) => {
      const opts = arr(v.options).map(obj).filter((o): o is Obj => !!o)
        .map((o) => [str(o.name), str(o.value)].filter(Boolean).join(": ")).filter(Boolean);
      const price = num(v.price); const sale = num(v.discountedPrice);
      return {
        key: str(v.id) ?? `#${i + 1}`, sku: str(v.sku), label: opts.join(" · ") || str(v.sku) || `ตัวเลือก ${i + 1}`,
        price, sale_price: sale != null && sale > 0 && (price == null || sale < price) ? sale : null,
        stock: num(v.availableNumber), image: str(v.imageUrl),
      };
    });
  }
  if (platformCode === "lazada") {
    return arr(obj(r.lazada)?.skus).map(obj).filter((v): v is Obj => !!v).map((v, i) => {
      const price = num(v.price); const sale = num(v.special_price);
      const sku = str(v.seller_sku) ?? str(v.SellerSku);
      return {
        // ชื่อตัวเลือก (สี/ไซซ์) มีเมื่อดึงหลัง 2026-11-10 (lazSkuLabel ใน lib/lazada) · ไม่มี = ใช้รหัส
        key: str(v.sku_id) ?? `#${i + 1}`, sku, label: str(v.label) ?? sku ?? `ตัวเลือก ${i + 1}`,
        price, sale_price: sale != null && sale > 0 && (price == null || sale < price) ? sale : null,
        stock: num(v.available) ?? num(v.quantity), image: null,
      };
    });
  }
  return [];
}

/** รหัสที่ต้องค้นใน skus_v2 = รหัสของตัวเลือก + รหัสสี (ฐาน) */
export function variantLookupCodes(skus: (string | null)[]): string[] {
  const out = new Set<string>();
  for (const s of skus) { if (!s) continue; out.add(s); const b = baseOfCode(s); if (b) out.add(b); }
  return [...out];
}

/**
 * ราคาที่ระบบจะส่งขึ้น LINE ให้ตัวเลือก 1 ตัว (กฎเดียวกับปุ่ม "ส่งราคา" — push-prices ใช้ตัวนี้)
 * ราคาเต็ม/ราคาขาย ของรหัสตัวเอง ไม่มี → ของรหัสสี (ฐาน) · แล้วคิดด้วย linePrice (ไม่มีราคาเต็ม = ใช้ราคาขาย)
 * null = ไม่รู้ราคา (ไม่มีรหัส / ไม่เจอ SKU / ไม่มีราคาทั้งคู่)
 */
export function expectedLinePrice(sku: string | null, fakeOf: Map<string, number>, saleOf: Map<string, number>): { price: number; discount: number } | null {
  if (!sku) return null;
  const pick = (m: Map<string, number>): number | null => {
    const own = m.get(sku); if (own != null) return own;
    const b = baseOfCode(sku); const mv = b ? m.get(b) : undefined;
    return mv ?? null;
  };
  return linePrice(pick(fakeOf), pick(saleOf));
}

/**
 * ราคาบนร้านเทียบกับที่ระบบจะส่ง (ต่างกัน ≥ 1 บาท)
 *   "pay"  = ราคาที่ลูกค้าจ่ายไม่ตรง (เงินจริงต่างกัน — สำคัญ)
 *   "full" = จ่ายตรง แต่ราคาเต็ม (ตัวขีดฆ่า) ไม่ตรง — ส่วนใหญ่เพราะในระบบยังไม่มีราคาเต็ม
 *   null   = ตรง / ไม่รู้ราคาในระบบ
 */
export type LinePriceDiff = "pay" | "full" | null;
export function linePriceDiff(shop: Pick<ShopVariant, "price" | "sale_price">, exp: { price: number; discount: number } | null): LinePriceDiff {
  if (!exp || shop.price == null) return null;
  const shopPay = shop.sale_price ?? shop.price;
  if (Math.abs(shopPay - (exp.price - exp.discount)) >= 1) return "pay";
  if (Math.abs(shop.price - exp.price) >= 1) return "full";
  return null;
}

export type VariantMatchKind = "exact" | "base" | "none" | "nosku";
export type SkuLite = { code: string; parent_sku_id: string | null; name?: string | null };

/** จับตัวเลือก 1 ตัวกับ SKU ในระบบ (ลำดับเดียวกับตอนส่งราคา: ตรงเป๊ะ → รหัสสี) */
export function matchVariantSku(sku: string | null, byCode: Map<string, SkuLite>): { kind: VariantMatchKind; erp: SkuLite | null } {
  if (!sku) return { kind: "nosku", erp: null };
  const own = byCode.get(sku);
  if (own) return { kind: "exact", erp: own };
  const b = baseOfCode(sku);
  const base = b ? byCode.get(b) : undefined;
  if (base) return { kind: "base", erp: base };
  return { kind: "none", erp: null };
}

export type VariantMatchRow = ShopVariant & {
  kind: VariantMatchKind;
  erp_code: string | null;
  erp_name: string | null;
  erp_parent_code: string | null;
  /** SKU ที่เจออยู่คนละรุ่นกับ Parent SKU ที่จับคู่ไว้ (ราคา/สต๊อกจะมาจากรุ่นอื่น — ควรตรวจ) */
  other_parent: boolean;
  /** ราคาที่ระบบจะส่ง (LINE เท่านั้น · null = ไม่รู้) — ราคาเต็ม + ราคาที่ลูกค้าจ่าย */
  erp_price: number | null;
  erp_pay: number | null;
  /** ราคาบนร้านเทียบที่ระบบจะส่ง: "pay" ราคาจ่ายไม่ตรง · "full" แค่ราคาเต็มไม่ตรง · null ตรง/ไม่รู้ */
  price_diff: LinePriceDiff;
};
export type VariantMatchCounts = { total: number; exact: number; base: number; none: number; nosku: number; other_parent: number; price_diff: number; full_diff: number };

/** จับทุกตัวเลือก + นับสรุป · matchedParentId = Parent SKU ที่จับคู่ไว้ (null = ยังไม่จับคู่ → ไม่เช็กคนละรุ่น) */
export function matchShopVariants(
  variants: ShopVariant[], byCode: Map<string, SkuLite>, matchedParentId: string | null, parentCodeOf: (id: string) => string | null,
  /** ราคาที่ระบบจะส่ง (LINE: expectedLinePrice) — ไม่ส่ง = ไม่เทียบราคา */
  priceOf?: (sku: string | null) => { price: number; discount: number } | null,
): { rows: VariantMatchRow[]; counts: VariantMatchCounts } {
  const counts: VariantMatchCounts = { total: variants.length, exact: 0, base: 0, none: 0, nosku: 0, other_parent: 0, price_diff: 0, full_diff: 0 };
  const rows = variants.map((v): VariantMatchRow => {
    const m = matchVariantSku(v.sku, byCode);
    counts[m.kind]++;
    const pid = m.erp?.parent_sku_id ?? null;
    const other = !!(matchedParentId && pid && pid !== matchedParentId);
    if (other) counts.other_parent++;
    const exp = priceOf ? priceOf(v.sku) : null;
    const diff = linePriceDiff(v, exp);
    if (diff === "pay") counts.price_diff++; else if (diff === "full") counts.full_diff++;
    return {
      ...v, kind: m.kind, erp_code: m.erp?.code ?? null, erp_name: m.erp?.name ?? null,
      erp_parent_code: pid ? parentCodeOf(pid) : null, other_parent: other,
      erp_price: exp?.price ?? null, erp_pay: exp ? exp.price - exp.discount : null, price_diff: diff,
    };
  });
  return { rows, counts };
}

/** คำตอบของ GET /api/platform-catalog?view=variants&listing_id= */
export type ListingVariantsResponse = {
  platform_code: string;
  matched_parent_code: string | null;
  /** ร้านนี้มีข้อมูลตัวเลือกไหม (Shopee ไฟล์ export = ไม่มี) */
  supported: boolean;
  /** มีข้อมูลจากร้านแล้วไหม (LINE ที่สร้างจากระบบแต่ยังไม่ได้ดึงกลับ = false) */
  fetched: boolean;
  rows: VariantMatchRow[];
  counts: VariantMatchCounts;
  error: string | null;
};
