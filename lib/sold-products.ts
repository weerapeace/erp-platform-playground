/**
 * ของกลาง — "สินค้าที่ขาย" (ใช้ทั้งบนจอและใบพิมพ์ ให้เรียง/รวมยอดเหมือนกันเป๊ะ)
 *
 * ใช้โดย: หน้า /sales/monthly (ตารางสินค้า) + lib/sales-monthly-print (ใบพิมพ์ A4)
 * รายงานอื่นที่อยากได้ "ตารางสินค้า รวม/แยกตามลูกค้า + ยอดรวมแยกหน่วย" เอาไปใช้ต่อได้เลย
 *
 * กติกาสำคัญ:
 *   - จำนวนรวม "แยกตามหน่วย" เสมอ (ห้ามบวกริบบิ้น 1,200 หลา กับกระเป๋า 240 ใบเป็นตัวเลขเดียว)
 *   - รวมสินค้าตัวเดียวกันด้วยคู่ รหัส+หน่วย (รหัสเดียวกันแต่หน่วยต่างกัน = คนละแถว ยอดจำนวนจะได้ไม่ปน)
 */

/** สินค้า 1 แถว ต่อ 1 ลูกค้า (API ส่งมาแบบนี้ แล้วค่อยรวม/แยกตามที่ผู้ใช้เลือก) */
export type SoldProduct = {
  customer: string;
  customer_code: string | null;
  sku: string | null;
  name: string;
  unit: string | null;
  qty: number;
  amt: number;            // ยอดหลังส่วนลด ก่อน VAT
  image: string | null;   // URL รูปปก (/api/r2-image?key=…) — ไม่มีรูป = null
};

export type ProductSortKey = "amt" | "qty" | "name" | "sku";
export type SortDir = "asc" | "desc";
export type ProductImageSize = "none" | "small" | "large";

/** ตัวเลือกตารางสินค้าที่ผู้ใช้ปรับได้ (จำรายคนผ่าน useReportOptions) */
export type ProductTableOptions = {
  grouped: boolean;              // true = แยกตามลูกค้า · false = รวมทุกลูกค้า
  sortKey: ProductSortKey;
  sortDir: SortDir;
  image: ProductImageSize;
  pct: boolean;                  // คอลัมน์ % ของยอด
  pageBreak: boolean;            // ใบพิมพ์: ขึ้นหน้าใหม่ทุกลูกค้า
};

export const DEFAULT_PRODUCT_OPTIONS: ProductTableOptions = {
  grouped: true, sortKey: "amt", sortDir: "desc", image: "small", pct: false, pageBreak: false,
};

export const PRODUCT_SORT_LABEL: Record<ProductSortKey, string> = {
  amt: "ยอดเงิน", qty: "จำนวน", name: "ชื่อสินค้า", sku: "รหัส",
};

/** ทิศเริ่มต้นเมื่อเปลี่ยนไปเรียงคอลัมน์ใหม่: ตัวเลข = มาก→น้อย · ตัวหนังสือ = ก→ฮ */
export const defaultSortDir = (k: ProductSortKey): SortDir => (k === "amt" || k === "qty" ? "desc" : "asc");

const keyOf = (p: Pick<SoldProduct, "sku" | "name" | "unit">) =>
  `${(p.sku ?? "").trim() || p.name}|${p.unit ?? ""}`;

/** รวมสินค้าจากทุกลูกค้าเป็นแถวเดียวต่อ รหัส+หน่วย (โหมด "รวมทุกลูกค้า") */
export function mergeProducts(list: SoldProduct[]): SoldProduct[] {
  const map = new Map<string, SoldProduct>();
  for (const p of list) {
    const k = keyOf(p);
    const e = map.get(k);
    if (e) { e.qty += p.qty; e.amt += p.amt; e.image ??= p.image; }
    else map.set(k, { ...p, customer: "", customer_code: null });
  }
  return [...map.values()];
}

/** เรียงสินค้า (ชื่อ/รหัสเรียงแบบภาษาไทย ตรงกับตารางกลาง MiniTable บนจอ · เท่ากันแล้วเรียงตามยอดเงินต่อ จะได้นิ่ง) */
export function sortProducts(list: SoldProduct[], key: ProductSortKey, dir: SortDir): SoldProduct[] {
  const mul = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    const d = key === "name" || key === "sku" ? (a[key] ?? "").localeCompare(b[key] ?? "", "th")
      : a[key] - b[key];
    return d * mul || b.amt - a.amt;
  });
}

export const sumAmt = (list: SoldProduct[]) => list.reduce((a, p) => a + p.amt, 0);

/** จำนวนรวมแยกตามหน่วย เรียงหน่วยที่มากสุดก่อน — [{ unit: "Units", qty: 5636 }, { unit: "หลา", qty: 2100 }] */
export function qtyByUnit(list: SoldProduct[]): { unit: string; qty: number }[] {
  const map = new Map<string, number>();
  for (const p of list) map.set(p.unit ?? "", (map.get(p.unit ?? "") ?? 0) + p.qty);
  return [...map.entries()].map(([unit, qty]) => ({ unit, qty })).sort((a, b) => b.qty - a.qty);
}

export const fmtQty = (qty: number, unit?: string | null) =>
  `${qty.toLocaleString("th-TH", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;

export type CustomerProductGroup = {
  customer: string;
  customer_code: string | null;
  rows: SoldProduct[];
  amt: number;
};

/** แยกสินค้าตามลูกค้า — ลูกค้ายอดมากสุดขึ้นก่อน (แถวในกลุ่มยังไม่เรียง ให้ sortProducts ต่อเอง) */
export function groupByCustomer(list: SoldProduct[]): CustomerProductGroup[] {
  const map = new Map<string, CustomerProductGroup>();
  for (const p of list) {
    const g = map.get(p.customer) ?? { customer: p.customer, customer_code: p.customer_code, rows: [], amt: 0 };
    map.set(p.customer, g);
    g.rows.push(p); g.amt += p.amt;
  }
  return [...map.values()].sort((a, b) => b.amt - a.amt);
}

/** รูปย่อขนาดพอดีงาน (r2-image ย่อให้ด้วย ?w=) — ใบพิมพ์ 40 รูปจะได้ไม่หนัก */
export function productThumb(url: string | null, px: number): string | null {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}w=${px}`;
}
