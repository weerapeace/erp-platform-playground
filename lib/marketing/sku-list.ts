/**
 * SKU การตลาด — type + ตัวช่วยที่ใช้ร่วมกันระหว่างหน้า /marketing/skus กับ API
 * (ไฟล์ pure ห้ามใส่ "use client" — API route import ได้)
 *
 * แนวคิด: แสดง "ทุกรุ่น" (Parent SKU ที่เปิดใช้งาน) แยกแท็บตามแบรนด์ → ติดป้ายได้ 1 ป้ายต่อรุ่น + หมายเหตุ
 *   (ข้อมูลมาจาก view marketing_sku_overview · ค่าการตลาดเก็บใน marketing_skus สร้างแถวเมื่อติดป้าย/หมายเหตุ)
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

/** SKU ย่อย (สี/แบบ) ของรุ่น — "SKU ที่เหลือ" = เปิดในระบบ (is_active) และการตลาดไม่ได้ปิด (mk_off)
 *  mk_off = ทีมการตลาดปิดสีนี้เฉพาะหน้าการตลาด (สียังขาย/สั่งซื้อ/ผลิตได้ปกติ) */
export type MarketingSkuVariant = { id?: string; code: string; color: string | null; is_active: boolean; image_key: string | null; mk_off?: boolean };

export type MarketingSkuItem = {
  parent_sku_id: string;
  code: string;
  name: string;
  image_key: string | null;
  brand_id: string | null;
  label_id: string | null;
  note: string | null;
  /** SKU ย่อย (สี/แบบ) ทั้งหมด / ที่ยังเปิดใช้งาน */
  sku_total: number;
  sku_active: number;
  /** แก้ป้าย/หมายเหตุล่าสุด (null = ยังไม่เคยแก้) */
  updated_at: string | null;
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
  return { active: variants.filter((v) => v.is_active && !v.mk_off).length, total: variants.length };
}

export type MarketingSkuSort = "label" | "code" | "sku_low" | "updated";

/** เรียงรายการ (ใช้ร่วมตาราง/การ์ด): label = ตามลำดับป้าย (ไม่มีป้ายท้าย) แล้วรหัส */
export function sortMarketingSkus(rows: MarketingSkuItem[], sort: MarketingSkuSort, labelOrder: Map<string, number>): MarketingSkuItem[] {
  const byCode = (a: MarketingSkuItem, b: MarketingSkuItem) => a.code.localeCompare(b.code, "th", { numeric: true });
  const lo = (r: MarketingSkuItem) => (r.label_id ? labelOrder.get(r.label_id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
  const out = [...rows];
  if (sort === "code") return out.sort(byCode);
  if (sort === "sku_low") return out.sort((a, b) => a.sku_active - b.sku_active || a.sku_total - b.sku_total || byCode(a, b));
  if (sort === "updated") return out.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || byCode(a, b));
  return out.sort((a, b) => lo(a) - lo(b) || byCode(a, b));
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
