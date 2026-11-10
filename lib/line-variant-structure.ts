/**
 * โครงตัวเลือกของสินค้าบน LINE (ของกลาง · pure) — เพิ่ม/ลบค่าตัวเลือก จากลิ้นชักสินค้าบนร้าน
 *
 * LINE: ตัวเลือก 1–2 ชั้น (เช่น สี × ไซส์) · raw.line.variantOptions = [{ name, values[] }] · variants[].options = [{ name, value }]
 *   เพิ่ม: POST /products/{id}/variants { variantOptions: {option1:{name,data:[{value}]}, option2?}, variants:[{onHandNumber, price, weight, sku, barcode?, options:[i1,i2]}] }
 *          options = index (เริ่ม 0) ชี้ค่าใน variantOptions — ส่งค่าเดิมทั้งหมด + ค่าใหม่ต่อท้าย (แบบเดียวกับตอนสร้างสินค้า)
 *   ลบ:   POST /products/{id}/delete-variant-option { name, value } → ลบ "ทุกตัวเลือกที่มีค่านี้" (ไม่ใช่ทีละตัว) — จึงต้องนับผลกระทบให้คนเห็นก่อน
 * สเปกจากสำเนา openapi.json ของ MyShop (github woraphol-j/lineshopping-api-mcp) — ยังไม่ทดสอบกับร้านจริง
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const norm = (s: string) => s.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

export type LineOptionStructure = {
  options: { name: string; values: string[] }[];
  variants: { id: string; sku: string | null; values: string[] }[];
};

/** raw.line → โครงตัวเลือก · null = ยังไม่ได้ดึงจาก LINE / ไม่มีชั้นตัวเลือก */
export function lineOptionStructure(line: unknown): LineOptionStructure | null {
  const l = obj(line);
  if (!l) return null;
  const options = arr(l.variantOptions).map(obj).filter((o): o is Obj => !!o)
    .map((o) => ({ name: str(o.name), values: arr(o.values).map(str).filter(Boolean) }))
    .filter((o) => o.name && o.values.length);
  if (!options.length) return null;
  const variants = arr(l.variants).map(obj).filter((v): v is Obj => !!v).map((v) => {
    const byName = new Map(arr(v.options).map(obj).filter((o): o is Obj => !!o).map((o) => [str(o.name), str(o.value)]));
    return { id: str(v.id), sku: str(v.sku) || null, values: options.map((o) => byName.get(o.name) ?? "") };
  }).filter((v) => v.id);
  return { options, variants };
}

/** ตัวเลือก (variant) ที่มีค่านี้ในชั้นนี้ */
export const variantsWithValue = (st: LineOptionStructure, optIdx: number, value: string) =>
  st.variants.filter((v) => norm(v.values[optIdx] ?? "") === norm(value));

/** ลบค่าตัวเลือก — ตรวจก่อนส่ง (ลบค่าเดียวที่เหลือ / ลบจนไม่เหลือตัวเลือก = ไม่ได้) */
export function planDeleteOptionValue(st: LineOptionStructure, optIdx: number, value: string): {
  error: string | null; name: string; value: string; affected: LineOptionStructure["variants"];
} {
  const opt = st.options[optIdx];
  if (!opt) return { error: "ไม่พบชั้นตัวเลือกนี้", name: "", value, affected: [] };
  const exact = opt.values.find((x) => norm(x) === norm(value));
  if (!exact) return { error: `ไม่พบ “${value}” ใน${opt.name}`, name: opt.name, value, affected: [] };
  const affected = variantsWithValue(st, optIdx, exact);
  if (opt.values.length <= 1) return { error: `ลบไม่ได้ — “${exact}” เป็นค่าเดียวของ${opt.name} (สินค้าจะไม่เหลือตัวเลือก)`, name: opt.name, value: exact, affected };
  if (affected.length >= st.variants.length) return { error: "ลบไม่ได้ — จะไม่เหลือตัวเลือกให้ขายเลย", name: opt.name, value: exact, affected };
  return { error: null, name: opt.name, value: exact, affected };
}

export type NewVariantRow = {
  /** ค่าของอีกชั้น (เฉพาะสินค้า 2 ชั้น) */
  otherValue: string | null;
  price: number | null;
  weight: number | null;
  sku: string;
  barcode: string | null;
};
export type AddVariantsPayload = {
  variantOptions: { option1: { name: string; data: { value: string }[] }; option2?: { name: string; data: { value: string }[] } };
  variants: { onHandNumber: number; price: number; weight: number; sku: string; barcode?: string; options: number[] }[];
};

/**
 * เพิ่มค่าใหม่ให้ชั้นตัวเลือก → ตัวเลือกใหม่ 1 ตัว (สินค้า 1 ชั้น) หรือ 1 ตัวต่อค่าของอีกชั้น (สินค้า 2 ชั้น)
 * สต๊อกตัวใหม่ = 0 เสมอ (สต๊อกไปทางระบบซิงค์สต๊อกกลาง) · ราคาส่วนลดตั้งทีหลังในโหมดราคา
 */
export function planAddOptionValue(st: LineOptionStructure, optIdx: number, newValue: string, rows: NewVariantRow[]): {
  errors: string[]; payload: AddVariantsPayload | null;
} {
  const errors: string[] = [];
  const opt = st.options[optIdx];
  if (!opt) return { errors: ["ไม่พบชั้นตัวเลือกนี้"], payload: null };
  const value = newValue.trim();
  if (!value) errors.push(`กรอกค่าใหม่ของ${opt.name}`);
  else if (opt.values.some((x) => norm(x) === norm(value))) errors.push(`“${value}” มีอยู่แล้วใน${opt.name}`);

  const otherIdx = st.options.length === 2 ? 1 - optIdx : -1;
  const other = otherIdx >= 0 ? st.options[otherIdx] : null;
  const need = other ? other.values.length : 1;
  if (rows.length !== need) errors.push(other ? `ต้องกรอกให้ครบทุก${other.name} (${need} แถว)` : "ต้องกรอก 1 แถว");

  const existingSkus = new Set(st.variants.map((v) => norm(v.sku ?? "")).filter(Boolean));
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const tag = other ? `${other.name} ${r.otherValue ?? `แถว ${i + 1}`}` : "ตัวเลือกใหม่";
    if (other && !other.values.includes(r.otherValue ?? "")) errors.push(`${tag}: ไม่พบค่านี้ใน${other.name}`);
    if (r.price == null || !(r.price > 0) || r.price >= 99999999) errors.push(`${tag}: ราคาต้องมากกว่า 0`);
    if (r.weight == null || r.weight < 0.01 || r.weight > 999.99) errors.push(`${tag}: น้ำหนักต้องอยู่ระหว่าง 0.01–999.99 กก.`);
    const sku = r.sku.trim();
    if (!sku) errors.push(`${tag}: กรอก SKU`);
    else if (existingSkus.has(norm(sku))) errors.push(`${tag}: SKU “${sku}” มีอยู่แล้วในสินค้านี้`);
    else if (seen.has(norm(sku))) errors.push(`${tag}: SKU “${sku}” ซ้ำกับแถวอื่น`);
    seen.add(norm(sku));
  });
  if (errors.length) return { errors, payload: null };

  const dataOf = (o: { values: string[] }, extra?: string) => [...o.values, ...(extra ? [extra] : [])].map((v) => ({ value: v }));
  const o1 = st.options[0]; const o2 = st.options[1];
  const newIndex = opt.values.length;   // ค่าใหม่ต่อท้าย
  const variantOptions: AddVariantsPayload["variantOptions"] = {
    option1: { name: o1.name, data: dataOf(o1, optIdx === 0 ? value : undefined) },
    ...(o2 ? { option2: { name: o2.name, data: dataOf(o2, optIdx === 1 ? value : undefined) } } : {}),
  };
  const variants = rows.map((r) => {
    const oi = other ? other.values.indexOf(r.otherValue ?? "") : -1;
    const options = !other ? [newIndex] : optIdx === 0 ? [newIndex, oi] : [oi, newIndex];
    return {
      onHandNumber: 0, price: round2(r.price as number), weight: round2(r.weight as number), sku: r.sku.trim(),
      ...(r.barcode && r.barcode.trim() ? { barcode: r.barcode.trim() } : {}), options,
    };
  });
  return { errors: [], payload: { variantOptions, variants } };
}
