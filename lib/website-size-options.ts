/**
 * 📐 ของกลาง — ตัวเลือกชุดที่ 2 บนเว็บร้าน (ไซส์ / แบบพิมพ์ / ขนาดรู …)
 *
 * ข้อมูลจริง = SKU ลูกที่มี `attribute_values.variant_option = { code, name, value }`
 * (สร้างจากปุ่ม "＋ เพิ่มแบบ/ไซส์" ในตาราง SKU ลูกของ Parent SKU · 1 สี × 1 ไซส์ = 1 SKU)
 * SKU ที่ไม่มี variant_option = ตัวหลักของสีนั้น (มีรูป) — ถ้าสีนั้นมี SKU ไซส์ ลูกค้าต้องเลือกไซส์ก่อนสั่ง
 *
 * ใช้ร่วม:
 *   - lib/website-field-map.ts resolveOptions2  → products API ส่ง options2 { label, items[{id,label,colors}], free }
 *   - lib/website-orders.ts pickSku             → ออเดอร์ต้องเป็นคู่ สี×ไซส์ ที่มีจริงและไม่ได้ปิดไว้
 *   - /api/parent-web-listings + ตาราง สี×ไซส์   → แท็บ 🛍 เปิด/ปิดแต่ละคู่ (store_listings.web_variant_off)
 */

/** ช่องของ SKU ที่ไฟล์นี้ใช้ (ตรงกับ ChildSku ใน website-field-map) */
export interface SizeKid {
  id: string;
  code: string | null;
  color: string | null;
  attribute_values?: Record<string, unknown> | null;
}

const clean = (v: unknown) => String(v ?? "").trim();

/** variant_option ของ SKU (ไม่มี = SKU ตัวหลักของสี) */
export function variantOf(k: SizeKid): { name: string; value: string; code: string } | null {
  const vo = (k.attribute_values as { variant_option?: { name?: unknown; value?: unknown; code?: unknown } } | null)?.variant_option;
  const value = clean(vo?.value);
  return value ? { name: clean(vo?.name), value, code: clean(vo?.code) } : null;
}

export const variantValue = (k: SizeKid): string => variantOf(k)?.value ?? "";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * สีของ SKU สำหรับจัดกลุ่ม — ตัด "/L" หรือ " / L" ท้ายชื่อสีที่ข้อมูลเก่าพิมพ์ไซส์ติดมา
 * (เช่น "Brown/Smooth Leather/L" → "Brown/Smooth Leather") ไม่งั้นจุดสีบนเว็บจะงอกซ้ำตามจำนวนไซส์
 */
export function baseColor(k: SizeKid): string {
  const c = clean(k.color);
  const v = variantValue(k);
  if (!c || !v) return c;
  return c.replace(new RegExp(`\\s*/\\s*${escapeRe(v)}$`, "i"), "").trim() || c;
}

/** ลำดับไซส์มาตรฐาน (ตัวพิมพ์ใหญ่ ไม่มีช่องว่าง) */
const SIZE_ORDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "FREE", "FREESIZE", "F"];
const SIZE_RANK = new Map(SIZE_ORDER.map((s, i) => [s, i]));

/**
 * เรียงชื่อไซส์: ไซส์มาตรฐาน S < M < L < XL ก่อน → ตัวเลข (28, 30, 2.7 mm.) เรียงค่าน้อยไปมาก → ที่เหลือตามลำดับเดิม
 * (เดิมเรียงตามรหัส SKU → ได้ L, M, S)
 */
export function sortSizeLabels(labels: string[]): string[] {
  const keyOf = (s: string, i: number): [number, number] => {
    const rank = SIZE_RANK.get(s.toUpperCase().replace(/[\s_-]+/g, ""));
    if (rank != null) return [0, rank];
    const n = parseFloat(s.replace(",", "."));
    if (Number.isFinite(n)) return [1, n];
    return [2, i];
  };
  return labels
    .map((s, i) => ({ s, k: keyOf(s, i), i }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
    .map((x) => x.s);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** store_listings.web_variant_off = id ของ SKU ไซส์ที่ปิดไว้บนเว็บร้านนี้ (array ของ uuid · ว่าง/null = เปิดทุกคู่) */
export function cleanVariantOff(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && UUID_RE.test(x.trim())).map((x) => x.trim().toLowerCase()))].slice(0, 1000);
}

export interface SizeCell {
  skuId: string;
  code: string;
  /** ปิดไว้บนเว็บร้านนี้ */
  off: boolean;
}

export interface SizeGridColor {
  /** ชื่อสี (ตัด "/L" ท้ายแล้ว) — ตรงกับ label ของตัวเลือกชุดที่ 1 */
  label: string;
  /** สีนี้ไม่มี SKU ไซส์เลย = ขายแบบไม่ต้องเลือกไซส์ */
  free: boolean;
  /** ไซส์ → SKU (ไม่มี = คู่นี้ไม่มีใน ERP) */
  cells: Record<string, SizeCell>;
}

export interface SizeGrid {
  /** ชื่อชุดที่ติดมากับ SKU (variant_option.name) เช่น "ไซส์" · ว่าง = ไม่ได้ตั้ง */
  name: string;
  /** ไซส์ทั้งหมด เรียงแล้ว */
  sizes: string[];
  colors: SizeGridColor[];
}

/**
 * ตาราง สี × ไซส์ จาก SKU ลูก — kids ต้องเรียงตามลำดับสีมาแล้ว (sortKids)
 * ไม่มี SKU ไซส์สักตัว = null (สินค้ามีตัวเลือกชั้นเดียว)
 */
export function buildSizeGrid(kids: SizeKid[], off: Set<string> = new Set()): SizeGrid | null {
  if (!kids.some((k) => variantOf(k))) return null;
  let name = "";
  const order: string[] = [];
  const byColor = new Map<string, SizeGridColor>();
  const sizesSeen: string[] = [];
  for (const k of kids) {
    const color = baseColor(k);
    const vo = variantOf(k);
    // SKU ที่ไม่มีทั้งชื่อสีและไซส์ (ข้อมูลค้าง เช่น WK42-05..07) = ไม่ต้องมีแถวในตาราง
    if (!color && !vo) continue;
    let row = byColor.get(color);
    if (!row) {
      row = { label: color, free: true, cells: {} };
      byColor.set(color, row);
      order.push(color);
    }
    if (!vo) continue;
    if (!name && vo.name) name = vo.name;
    row.free = false;
    if (!sizesSeen.includes(vo.value)) sizesSeen.push(vo.value);
    // คู่ซ้ำ (สี+ไซส์เดียวกันหลาย SKU) = ใช้ตัวแรก
    if (!row.cells[vo.value]) row.cells[vo.value] = { skuId: k.id, code: clean(k.code), off: off.has(k.id.toLowerCase()) };
  }
  return { name, sizes: sortSizeLabels(sizesSeen), colors: order.map((c) => byColor.get(c)!) };
}

/** คู่ สี×ไซส์ ที่ขายบนเว็บได้ (มี SKU + ไม่ได้ปิด) */
export const cellOpen = (row: SizeGridColor | undefined, size: string): SizeCell | null => {
  const c = row?.cells[size];
  return c && !c.off ? c : null;
};

/** สีที่มีไซส์แต่ปิดไว้ครบทุกไซส์ → ไม่ต้องโชว์สีนี้บนเว็บ */
export const colorAllOff = (row: SizeGridColor): boolean => !row.free && !Object.values(row.cells).some((c) => !c.off);
