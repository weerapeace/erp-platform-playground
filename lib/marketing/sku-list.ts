/**
 * SKU การตลาด — type + ตัวช่วยที่ใช้ร่วมกันระหว่างหน้า /marketing/skus กับ API
 * (ไฟล์ pure ห้ามใส่ "use client" — API route import ได้)
 *
 * แนวคิด: ทีมการตลาดเลือก "รุ่น" (Parent SKU) ที่จะทำตลาด → แยกดูตามแบรนด์ → ติดป้ายได้ 1 ป้ายต่อรุ่น
 */

export type MarketingSkuLabel = {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  usage_count?: number;
};

export type MarketingBrand = { id: string; name: string; color: string | null };

/** SKU ย่อย (สี/แบบ) ของรุ่น — ใช้นับ "SKU ที่เหลือ" (ยังเปิดขาย = is_active) */
export type MarketingSkuVariant = { code: string; color: string | null; is_active: boolean; image_key: string | null };

export type MarketingSkuItem = {
  id: string;
  parent_sku_id: string;
  code: string;
  name: string;
  image_key: string | null;
  brand_id: string | null;
  label_id: string | null;
  note: string | null;
  is_active: boolean;
  variants: MarketingSkuVariant[];
  created_at: string;
  updated_at: string;
};

export type MarketingSkuListData = {
  items: MarketingSkuItem[];
  labels: MarketingSkuLabel[];
  brands: MarketingBrand[];
};

/** คีย์แท็บพิเศษ */
export const BRAND_ALL = "__all";
export const BRAND_NONE = "__none";
export const LABEL_ALL = "__all";
export const LABEL_NONE = "__none";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** รับ list id จาก body/query → เฉพาะ uuid ไม่ซ้ำ (จำกัดจำนวนกันยิงก้อนใหญ่) */
export function cleanIds(raw: unknown, max = 500): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return [...new Set(arr.map((x) => String(x).trim()).filter(isUuid))].slice(0, max);
}

/** สีป้าย: รับเฉพาะ #rgb / #rrggbb ไม่งั้นใช้สีเทา */
export function cleanColor(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s : "#64748b";
}

/** สรุปจำนวน SKU ย่อย: ยังเปิดขาย / ทั้งหมด */
export function variantSummary(variants: MarketingSkuVariant[]): { active: number; total: number } {
  return { active: variants.filter((v) => v.is_active).length, total: variants.length };
}

/** นับจำนวนตามแบรนด์ / ป้าย (ใช้ทำตัวเลขบนแท็บ/ชิป) */
export function countBy<T>(rows: T[], key: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
