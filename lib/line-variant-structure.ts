/**
 * โครงตัวเลือกของสินค้าบน LINE (ของกลาง · pure) — เพิ่ม/ลบค่าตัวเลือก จากลิ้นชักสินค้าบนร้าน
 *
 * LINE: ตัวเลือก 1–2 ชั้น (เช่น สี × ไซส์) · raw.line.variantOptions = [{ name, values[] }] · variants[].options = [{ name, value }]
 *   เพิ่ม: POST /products/{id}/variants { variantOptions: {option1:{name,data:[{value}]}, option2?}, variants:[{onHandNumber, price, weight, sku, barcode?, options:[i1,i2]}] }
 *          options = index (เริ่ม 0) ชี้ค่าใน variantOptions — ส่งค่าเดิมทั้งหมด + ค่าใหม่ต่อท้าย (แบบเดียวกับตอนสร้างสินค้า)
 *   เปลี่ยนชื่อ: PATCH /products/{id} { variantOptions: { option1: { name, data: [{ currentValue, newValue }] }, option2? } } (planRenameOptionValues · 2026-11-25)
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

/** สต๊อกตั้งต้นที่ LINE รับ (onHandNumber > 0 และ < 99,999,999) */
export const LINE_STOCK_MIN = 1;
export const LINE_STOCK_MAX = 99_999_998;
export const LINE_OPT_VALUE_MAX = 50;

export type RenamePayload = { option1?: { name: string; data: { currentValue: string; newValue: string }[] }; option2?: { name: string; data: { currentValue: string; newValue: string }[] } };
/**
 * เปลี่ยนชื่อค่าตัวเลือก (ทำได้ทั้งตอนเปิดขาย — ไม่เพิ่ม/ลบตัวเลือก รหัส SKU เหมือนเดิม)
 * renames["ชั้น|ค่าเดิม"] = ชื่อใหม่ (ชั้น = 0/1) · ชื่อเดิม = ไม่ส่ง · ห้ามว่าง/ซ้ำในชั้นเดียวกัน
 */
export function planRenameOptionValues(st: LineOptionStructure, renames: Record<string, string>): { errors: string[]; payload: RenamePayload | null; changes: { option: string; before: string; after: string }[] } {
  const errors: string[] = []; const changes: { option: string; before: string; after: string }[] = [];
  const payload: RenamePayload = {};
  st.options.forEach((opt, idx) => {
    const data: { currentValue: string; newValue: string }[] = [];
    const after = opt.values.map((v) => { const n = renames[`${idx}|${v}`]; return n == null ? v : n.replace(/\s+/g, " ").trim(); });
    opt.values.forEach((v, i) => {
      if (after[i] === v) return;
      if (!after[i]) { errors.push(`${opt.name}: ชื่อใหม่ของ “${v}” ว่างไม่ได้`); return; }
      if (after[i].length > LINE_OPT_VALUE_MAX) errors.push(`${opt.name}: “${after[i].slice(0, 20)}…” ยาวเกิน ${LINE_OPT_VALUE_MAX} ตัวอักษร`);
      data.push({ currentValue: v, newValue: after[i] });
      changes.push({ option: opt.name, before: v, after: after[i] });
    });
    const dup = after.filter((x, i) => x && after.findIndex((y) => norm(y) === norm(x)) !== i);
    if (dup.length) errors.push(`${opt.name}: ชื่อซ้ำกัน (${[...new Set(dup)].slice(0, 3).join(", ")})`);
    if (data.length) payload[idx === 0 ? "option1" : "option2"] = { name: opt.name, data };
  });
  if (!changes.length && !errors.length) errors.push("ยังไม่ได้เปลี่ยนชื่อ");
  return { errors, payload: errors.length ? null : payload, changes };
}

export type NewVariantRow = {
  /** ค่าของอีกชั้น (เฉพาะสินค้า 2 ชั้น) */
  otherValue: string | null;
  price: number | null;
  weight: number | null;
  sku: string;
  barcode: string | null;
  /** สต๊อกตั้งต้น (LINE บังคับ > 0) — หลังบ้านแทนด้วยสต๊อกในระบบเมื่อรหัสตรงกับ SKU ในระบบ (2026-11-25) */
  stock?: number | null;
};
export type AddVariantsPayload = {
  variantOptions: { option1: { name: string; data: { value: string }[] }; option2?: { name: string; data: { value: string }[] } };
  variants: { onHandNumber: number; price: number; weight: number; sku: string; barcode?: string; options: number[] }[];
};

/**
 * เพิ่มค่าใหม่ให้ชั้นตัวเลือก → ตัวเลือกใหม่ 1 ตัว (สินค้า 1 ชั้น) หรือ 1 ตัวต่อค่าของอีกชั้น (สินค้า 2 ชั้น)
 * สต๊อกตัวใหม่ = row.stock (LINE บังคับ onHandNumber > 0 — เดิมส่ง 0 แล้ว LINE ไม่รับ · แก้ 2026-11-25) · ราคาส่วนลดตั้งทีหลังในโหมดราคา
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
    if (r.stock == null || !Number.isInteger(r.stock) || r.stock < LINE_STOCK_MIN || r.stock > LINE_STOCK_MAX) errors.push(r.stock != null && r.stock <= 0 ? `${tag}: สต๊อกเป็น 0 — LINE ต้องมีสต๊อกอย่างน้อย 1` : `${tag}: ใส่สต๊อก (จำนวนเต็ม ${LINE_STOCK_MIN}–${LINE_STOCK_MAX.toLocaleString()})`);
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
      onHandNumber: r.stock as number, price: round2(r.price as number), weight: round2(r.weight as number), sku: r.sku.trim(),
      ...(r.barcode && r.barcode.trim() ? { barcode: r.barcode.trim() } : {}), options,
    };
  });
  return { errors: [], payload: { variantOptions, variants } };
}
