/**
 * 📤 ลงสินค้าบนแพลตฟอร์ม — ตัวเตรียมร่าง (ของกลาง · pure ใช้ได้ทั้งหน้าเว็บและหลังบ้าน)
 *
 * ข้อมูลสินค้าใน ERP (lib/product-listing-context) + กฎของร้าน (lib/platform-required-fields)
 *   → ร่างของร้านนั้น (ชื่อ · รายละเอียด · หมวด · รูป · แบรนด์ · กฎราคา) + ผลตรวจความครบ
 * ไม่ส่งอะไรไปที่ร้าน — การลงสินค้าจริงเป็นงานของตัวเชื่อมแต่ละร้าน (ยังไม่เปิดสำหรับ Lazada)
 *
 * ร่างเดิมที่มีอยู่: ค่าเริ่มต้น "เติมเฉพาะช่องที่ยังว่าง" (ไม่ทับที่คนแก้ไว้) · overwrite=true = ทับด้วยค่าจาก ERP
 */
import { requiredChecks, requiredSpec, type ReqCheck, type ReqCtx } from "@/lib/platform-required-fields";

export type ListingVariantLite = {
  code: string; color: string | null; option_value?: string | null;
  sale_price: number | null; fake_price: number | null;
  has_price: boolean; has_image: boolean; is_active?: boolean; sale_ok?: boolean;
};
export type ListingParentLite = {
  name_th?: unknown; name_platform?: unknown; description?: unknown; brand_name?: string | null;
  weight_kg?: number | null; box_width?: number | null; box_length?: number | null; box_height?: number | null;
};
export type DraftLite = {
  title?: string | null; description?: string | null; category_path?: string | null; image_keys?: string[] | null;
  status?: string | null; extra?: Record<string, unknown> | null; platform_product_id?: string | null;
};

export type PriceRule = { mode: "same" | "pct"; pct: number };
export const DEFAULT_PRICE_RULE: PriceRule = { mode: "same", pct: 0 };

/** กฎราคาจากค่าที่ส่งมา (กันค่าผิด) — บวกได้ 0–100% */
export function normalizePriceRule(v: unknown): PriceRule {
  const r = (v && typeof v === "object") ? v as Record<string, unknown> : {};
  const pct = Math.min(100, Math.max(0, Math.round(Number(r.pct) || 0)));
  return r.mode === "pct" && pct > 0 ? { mode: "pct", pct } : DEFAULT_PRICE_RULE;
}
/** ราคาบนร้าน = ราคาขาย ERP (+%) ปัดขึ้นเป็นบาทเต็ม */
export function platformPrice(price: number, rule: PriceRule): number {
  return rule.mode === "pct" ? Math.ceil(price * (1 + rule.pct / 100)) : price;
}

/** ตัวเลือกที่จะลงขาย = ใช้งานอยู่ + เปิดขาย (ตัวที่ปิด/ไม่ขาย ไม่ส่งขึ้นร้าน) */
export const sellableVariants = <T extends ListingVariantLite>(vs: T[]) => vs.filter((v) => v.is_active !== false && v.sale_ok !== false);

/** ชื่อตัวเลือกที่ลูกค้าเห็น = สี + ตัวเลือกชั้นที่ 2 (ไม่มีทั้งคู่ = รหัส) */
export const variantLabel = (v: Pick<ListingVariantLite, "code" | "color" | "option_value">) =>
  [v.color, v.option_value].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ") || v.code;

/** ชื่อตัวเลือกที่ซ้ำกัน (เช่น "ขาว" มีทั้งแท่งเดี่ยวและโหล) */
export function duplicateVariantLabels(vs: ListingVariantLite[]): string[] {
  const count = new Map<string, number>();
  for (const v of vs) { const k = variantLabel(v); count.set(k, (count.get(k) ?? 0) + 1); }
  return [...count.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
/** รหัสที่มีเครื่องหมายนอกจาก ตัวอักษร ตัวเลข . _ - (ต้องทดสอบกับร้าน) */
export const oddSkuCodes = (vs: ListingVariantLite[]) => vs.map((v) => v.code).filter((c) => /[^A-Za-z0-9._-]/.test(c));

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const boxComplete = (p: ListingParentLite) => [p.box_width, p.box_length, p.box_height].every((n) => n != null && Number(n) > 0);

/**
 * มีราคาไหม — LINE ส่ง "ราคาเต็ม" (fake_price) เป็นราคาหลัก จึงต้องมีราคาเต็ม (has_price เดิม)
 * ร้านอื่นใช้ราคาขาย (list_price) เป็นหลัก ราคาเต็มมีหรือไม่มีก็ได้
 */
const hasPriceFor = (platformCode: string, v: ListingVariantLite) =>
  platformCode === "line_shopping" ? v.has_price : ((v.sale_price ?? 0) > 0 || (v.fake_price ?? 0) > 0);

/** ค่าที่ตัวตรวจต้องใช้ — ตัวจัดการรายสินค้ากับหน้ารวมเรียกตัวเดียวกัน */
export function listingCtx(input: {
  platformCode: string;
  title: string; description: string; category: string; imageCount: number;
  variants: ListingVariantLite[]; parent: ListingParentLite; brand?: string | null;
}): ReqCtx {
  const vs = sellableVariants(input.variants);
  return {
    title: input.title, description: input.description, category: input.category,
    imagesToSend: input.imageCount, variantCount: vs.length,
    allHavePrice: vs.length > 0 && vs.every((v) => hasPriceFor(input.platformCode, v)),
    allHaveImage: vs.length > 0 && vs.every((v) => v.has_image),
    weightKg: input.parent.weight_kg ?? null,
    boxComplete: boxComplete(input.parent),
    brand: str(input.brand ?? input.parent.brand_name),
    duplicateVariants: duplicateVariantLabels(vs),
    oddSkuCodes: oddSkuCodes(vs),
  };
}

export type PreparedDraft = {
  fields: { title: string | null; description: string | null; category_path: string | null; image_keys: string[]; status: string; extra: Record<string, unknown> };
  checks: ReqCheck[];
  ready: boolean;
  blockers: string[];
  /** ช่องที่ระบบเติมรอบนี้ (ว่างเดิม หรือสั่งทับ) */
  filled: string[];
  priceRange: { min: number | null; max: number | null };
};

/**
 * เตรียมร่างของสินค้า 1 ตัว สำหรับร้าน 1 ร้าน
 * platformCategory = หมวดของร้าน "{id} · {ชื่อ}" ที่ได้จากหมวดกลาง ("" = ยังไม่จับคู่)
 */
export function prepareDraft(input: {
  platformCode: string;
  parent: ListingParentLite;
  variants: ListingVariantLite[];
  imageKeys: string[];
  platformCategory: string;
  existing?: DraftLite | null;
  rule?: PriceRule;
  overwrite?: boolean;
  preparedBy?: string | null;
  now?: string;
}): PreparedDraft {
  const spec = requiredSpec(input.platformCode);
  const ex = input.existing ?? null;
  const keep = (v: unknown) => !input.overwrite && !!ex && (Array.isArray(v) ? v.length > 0 : !!str(v));
  const filled: string[] = [];
  const pick = <T,>(name: string, current: T, fresh: T) => { if (keep(current)) return current; filled.push(name); return fresh; };

  const freshTitle = (str(input.parent.name_platform) || str(input.parent.name_th)).slice(0, spec.maxTitle ?? 1000) || null;
  const title = pick("ชื่อ", ex?.title ?? null, freshTitle);
  const description = pick("รายละเอียด", ex?.description ?? null, str(input.parent.description) || null);
  const category_path = pick("หมวด", ex?.category_path ?? null, str(input.platformCategory) || null);
  const image_keys = pick("รูป", ex?.image_keys ?? [], input.imageKeys.slice(0, spec.maxImages));

  const exExtra = (ex?.extra && typeof ex.extra === "object") ? { ...ex.extra } : {};
  const rule = input.rule ?? (exExtra.price_rule ? normalizePriceRule(exExtra.price_rule) : DEFAULT_PRICE_RULE);
  const brand = keep(exExtra.brand) ? str(exExtra.brand) : (str(input.parent.brand_name) || "");
  const extra: Record<string, unknown> = {
    ...exExtra,
    brand: brand || null,
    price_rule: rule,
    prepared: { at: input.now ?? new Date().toISOString(), by: input.preparedBy ?? null },
  };

  const checks = requiredChecks(input.platformCode, listingCtx({
    platformCode: input.platformCode,
    title: title ?? "", description: description ?? "", category: category_path ?? "",
    imageCount: (image_keys ?? []).length, variants: input.variants, parent: input.parent, brand,
  }));
  const blockers = checks.filter((c) => c.required && !c.ok).map((c) => c.label);

  const prices = sellableVariants(input.variants).map((v) => ((v.sale_price ?? 0) > 0 ? v.sale_price : v.fake_price))
    .filter((n): n is number => n != null && n > 0).map((n) => platformPrice(n, rule));
  return {
    fields: { title, description, category_path, image_keys: image_keys ?? [], status: str(ex?.status) || "draft", extra },
    checks, ready: blockers.length === 0, blockers, filled,
    priceRange: { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null },
  };
}
