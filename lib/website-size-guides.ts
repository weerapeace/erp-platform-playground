/**
 * 📏 ตารางไซส์ (size guide) ของเว็บร้าน — ของกลาง (pure)
 *
 * เก็บต่อร้านที่ store_settings "size_guides" (JSON) · ตั้งที่ เว็บไซต์ → 📏 ตารางไซส์
 * 1 ตาราง = ใช้กับหลายหมวด (หมวดแม่ครอบหมวดย่อย · หมวดย่อยที่มีตารางของตัวเองชนะ)
 * ทับรายรุ่นได้: store_listings.web_size_guide = null (อัตโนมัติตามหมวด) | "none" (ไม่แสดง) | id ตาราง
 *
 * เว็บร้านใช้: ลิงก์ "📏 ตารางไซส์" (ป๊อปตาราง + วิธีวัด) · ช่วงใต้ปุ่มไซส์ (fitColumn) · ตัวช่วย "กรอกรอบเอว → แนะนำไซส์" (helper)
 * ค่าช่วงในคอลัมน์ fit พิมพ์แบบ "28–32" / "28-32" / "34" → ERP แยกเป็น min/max ให้ (parseFitRange) — กรอกครั้งเดียวใช้ทั้งโชว์และแนะนำ
 * 🌐 ช่องข้อความมีคู่ <key>_en (เว็บหน้า /en สลับให้เอง)
 */

export const SIZE_GUIDES_KEY = "size_guides";
export const MAX_GUIDES = 20;
export const MAX_COLUMNS = 6;
export const MAX_ROWS = 20;

export interface SizeGuideColumn {
  key: string;
  label: string;
  label_en?: string;
}
export interface SizeGuideRow {
  /** ชื่อไซส์ — ตรงกับปุ่มไซส์ (variant_option.value) เช่น S / M / L */
  size: string;
  /** ค่าแต่ละคอลัมน์ (column.key → ข้อความ) */
  cells: Record<string, string>;
}
export interface SizeGuide {
  id: string;
  name: string;
  name_en?: string;
  /** หมวดเว็บของร้านที่ใช้ตารางนี้ (หมวดแม่ = ครอบหมวดย่อย) */
  categories: string[];
  columns: SizeGuideColumn[];
  rows: SizeGuideRow[];
  /** คอลัมน์ที่โชว์ใต้ปุ่มไซส์ + ใช้กับตัวช่วยแนะนำไซส์ · null = ไม่โชว์ */
  fitColumn: string | null;
  /** ตัวช่วย "ไม่แน่ใจ? กรอกรอบเอว → แนะนำไซส์" */
  helper: boolean;
  /** สิ่งที่ให้ลูกค้ากรอก เช่น "รอบเอว" */
  helperLabel: string;
  helperLabel_en?: string;
  /** หน่วย เช่น "นิ้ว" */
  unit: string;
  unit_en?: string;
  /** วิธีวัด / หมายเหตุ (หลายบรรทัด) */
  note: string;
  note_en?: string;
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const keyOf = (v: unknown) => txt(v, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
const en = (o: Record<string, unknown>, k: string, max: number) => {
  const v = txt(o[`${k}_en`], max);
  return v ? { [`${k}_en`]: v } : {};
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ทำความสะอาดรายการตาราง (ค่าที่ไม่รู้จัก/เกินขนาด = ตัดทิ้ง) · รับได้ทั้ง JSON string (store_settings) และ array */
export function normalizeSizeGuides(raw: unknown): SizeGuide[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: SizeGuide[] = [];
  const ids = new Set<string>();
  for (const g of v) {
    if (!isObj(g) || out.length >= MAX_GUIDES) continue;
    let id = keyOf(g.id) || `g${out.length + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    const colKeys = new Set<string>();
    const columns: SizeGuideColumn[] = [];
    for (const c of Array.isArray(g.columns) ? g.columns : []) {
      if (!isObj(c) || columns.length >= MAX_COLUMNS) continue;
      const key = keyOf(c.key) || `c${columns.length + 1}`;
      if (colKeys.has(key)) continue;
      colKeys.add(key);
      columns.push({ key, label: txt(c.label, 40) || key, ...en(c, "label", 40) });
    }
    const rows: SizeGuideRow[] = [];
    for (const r of Array.isArray(g.rows) ? g.rows : []) {
      if (!isObj(r) || rows.length >= MAX_ROWS) continue;
      const size = txt(r.size, 20);
      if (!size || rows.some((x) => x.size.toLowerCase() === size.toLowerCase())) continue;
      const cellsRaw = isObj(r.cells) ? r.cells : {};
      const cells: Record<string, string> = {};
      for (const c of columns) {
        const val = txt(cellsRaw[c.key], 40);
        if (val) cells[c.key] = val;
      }
      rows.push({ size, cells });
    }
    const fit = keyOf(g.fitColumn);
    out.push({
      id,
      name: txt(g.name, 60) || "ตารางไซส์",
      ...en(g, "name", 60),
      categories: [...new Set((Array.isArray(g.categories) ? g.categories : []).map((k) => txt(k, 60)).filter(Boolean))].slice(0, 40),
      columns,
      rows,
      fitColumn: fit && colKeys.has(fit) ? fit : null,
      helper: g.helper === true,
      helperLabel: txt(g.helperLabel, 30),
      ...en(g, "helperLabel", 30),
      unit: txt(g.unit, 15),
      ...en(g, "unit", 15),
      note: txt(g.note, 1500),
      ...en(g, "note", 1500),
    });
  }
  return out;
}

/** "28–32" / "28-32" / "28 ถึง 32" / "34" → { min, max } · ไม่มีตัวเลข = null */
export function parseFitRange(cell: string | undefined | null): { min: number; max: number } | null {
  const nums = (String(cell ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const a = nums[0];
  const b = nums[nums.length - 1];
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** ตารางที่ใช้กับสินค้า: ทับรายรุ่น ("none" = ไม่แสดง · id) → ไม่งั้นตามหมวด (หมวดย่อยชนะหมวดแม่ · เท่ากัน = ตารางที่อยู่ก่อน) */
export function resolveSizeGuide(
  guides: SizeGuide[],
  productCategories: string[],
  catDefs: { key: string; parent?: string | null }[],
  override: unknown
): SizeGuide | null {
  const o = typeof override === "string" ? override.trim() : "";
  if (o === "none") return null;
  if (o) return guides.find((g) => g.id === o) ?? null;
  const parentOf = new Map(catDefs.map((c) => [c.key, c.parent || null]));
  const depth = (k: string) => (parentOf.get(k) ? 1 : 0);
  // หมวดของสินค้า + หมวดแม่ (สินค้าในหมวดย่อยใช้ตารางของหมวดแม่ได้)
  const cats = new Set(productCategories);
  for (const k of productCategories) {
    const p = parentOf.get(k);
    if (p) cats.add(p);
  }
  let best: SizeGuide | null = null;
  let bestDepth = -1;
  for (const g of guides) {
    for (const k of g.categories) {
      if (!cats.has(k)) continue;
      const d = depth(k);
      if (d > bestDepth) {
        best = g;
        bestDepth = d;
      }
    }
  }
  return best;
}

/** ค่าที่ส่งให้เว็บร้าน (products API) — แถวมี min/max จากคอลัมน์ fit ไว้ให้ตัวช่วยแนะนำไซส์ */
export function publicSizeGuide(g: SizeGuide) {
  return {
    ...g,
    rows: g.rows.map((r) => {
      const range = g.fitColumn ? parseFitRange(r.cells[g.fitColumn]) : null;
      return range ? { ...r, min: range.min, max: range.max } : r;
    }),
  };
}

/** แม่แบบเริ่มต้น — ⚠️ ค่าเป็นตัวอย่าง ต้องแก้ให้ตรงสินค้าจริงก่อนเลือกหมวด */
export const SIZE_GUIDE_TEMPLATES: { key: string; label: string; make: () => Omit<SizeGuide, "id"> }[] = [
  {
    key: "belt",
    label: "เข็มขัด (รอบเอว)",
    make: () => ({
      name: "ตารางไซส์เข็มขัด",
      name_en: "Belt size guide",
      categories: [],
      columns: [
        { key: "waist_in", label: "รอบเอว (นิ้ว)", label_en: "Waist (in)" },
        { key: "waist_cm", label: "รอบเอว (ซม.)", label_en: "Waist (cm)" },
      ],
      rows: [
        { size: "S", cells: { waist_in: "28–32", waist_cm: "71–81" } },
        { size: "M", cells: { waist_in: "32–36", waist_cm: "81–91" } },
        { size: "L", cells: { waist_in: "36–40", waist_cm: "91–102" } },
        { size: "XL", cells: { waist_in: "40–44", waist_cm: "102–112" } },
      ],
      fitColumn: "waist_in",
      helper: true,
      helperLabel: "รอบเอว",
      helperLabel_en: "Waist",
      unit: "นิ้ว",
      unit_en: "in",
      note: "วัดรอบเอวตรงตำแหน่งที่คาดเข็มขัดจริง (ทับกางเกงที่ใส่ประจำ) ให้สายวัดแนบพอดี ไม่รัด\nอยู่ระหว่าง 2 ไซส์ แนะนำเลือกไซส์ที่ใหญ่กว่า",
      note_en: "Measure around your waist where you actually wear the belt (over your usual trousers), snug but not tight.\nIf you are between two sizes, choose the larger one.",
    }),
  },
  {
    key: "blank",
    label: "ตารางว่าง",
    make: () => ({
      name: "ตารางไซส์ใหม่",
      categories: [],
      columns: [{ key: "c1", label: "ขนาด" }],
      rows: [{ size: "S", cells: {} }, { size: "M", cells: {} }, { size: "L", cells: {} }],
      fitColumn: null,
      helper: false,
      helperLabel: "",
      unit: "",
      note: "",
    }),
  },
];
