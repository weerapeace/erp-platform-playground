/**
 * 🏷 สูตรตั้ง Fake Price (ราคาเต็มขีดฆ่า) จากราคาขาย — ของกลาง (pure: ใช้ได้ทั้งหน้าจอและ API · ห้ามใส่ "use client")
 *
 *   วิธีคิด: คูณ (ราคาขาย × 2) · บวก (ราคาขาย + 500) · โชว์ส่วนลด (ให้ราคาขายดูเป็นลด 40% → ราคาขาย ÷ 0.6)
 *   แล้วปัด: ไม่ปัด · ปัดขึ้นหลักสิบ · ปัดขึ้นหลักร้อย · ลงท้าย 90 · ลงท้าย 99
 *
 * รายการสูตรเก็บที่ ui_config key `fake_price_formulas` ({ formulas: [...] }) — แก้/เพิ่มได้ในป๊อป "ใส่ Fake Price"
 * ใช้ที่: ตาราง SKU ลูก (components/relation-multi → components/fake-price-dialog)
 */

export const FAKE_PRICE_CONFIG_KEY = "fake_price_formulas";

export type FakePriceMode = "multiply" | "add" | "discount";
export type FakePriceRound = "none" | "ceil10" | "ceil100" | "end90" | "end99";
export type FakePriceFormula = { id: string; name: string; mode: FakePriceMode; value: number; round: FakePriceRound };

export const MODE_LABEL: Record<FakePriceMode, string> = { multiply: "คูณราคาขาย", add: "บวกเพิ่มจากราคาขาย", discount: "ให้ดูเป็นส่วนลด %" };
export const ROUND_LABEL: Record<FakePriceRound, string> = { none: "ไม่ปัด", ceil10: "ปัดขึ้นหลักสิบ", ceil100: "ปัดขึ้นหลักร้อย", end90: "ลงท้าย 90", end99: "ลงท้าย 99" };

/** สูตรตั้งต้น — จากข้อมูลจริง (Fake ส่วนใหญ่ ≈ 1.6–2 เท่าของราคาขาย ลงท้าย 90 เช่น 890 → 1,690 / 1,890) */
export const DEFAULT_FAKE_FORMULAS: FakePriceFormula[] = [
  { id: "x2-90", name: "×2 ลงท้าย 90", mode: "multiply", value: 2, round: "end90" },
  { id: "x17-90", name: "×1.7 ลงท้าย 90", mode: "multiply", value: 1.7, round: "end90" },
  { id: "off40-90", name: "โชว์ลด 40% ลงท้าย 90", mode: "discount", value: 40, round: "end90" },
];

const MODES = new Set<FakePriceMode>(["multiply", "add", "discount"]);
const ROUNDS = new Set<FakePriceRound>(["none", "ceil10", "ceil100", "end90", "end99"]);

/** สูตรนี้ใช้ได้ไหม (คืนข้อความเตือนภาษาคน · null = ใช้ได้) */
export function formulaProblem(f: Pick<FakePriceFormula, "name" | "mode" | "value">): string | null {
  if (!f.name.trim()) return "ตั้งชื่อสูตรก่อน";
  if (!Number.isFinite(f.value) || f.value <= 0) return "ใส่ตัวเลขมากกว่า 0";
  if (f.mode === "multiply" && f.value <= 1) return "ตัวคูณต้องมากกว่า 1 (ไม่งั้นราคาเต็มจะไม่สูงกว่าราคาขาย)";
  if (f.mode === "discount" && f.value >= 95) return "ส่วนลดต้องน้อยกว่า 95%";
  return null;
}

/** อ่านรายการสูตรจาก ui_config (ค่าเพี้ยน = ตัดทิ้ง · ไม่มีเลย = ใช้สูตรตั้งต้น) */
export function parseFormulas(raw: unknown): FakePriceFormula[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { formulas?: unknown }).formulas) ? (raw as { formulas: unknown[] }).formulas : null;
  if (!list) return DEFAULT_FAKE_FORMULAS;
  const out: FakePriceFormula[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const f: FakePriceFormula = {
      id: String(r.id ?? "").trim(),
      name: String(r.name ?? "").trim(),
      mode: MODES.has(r.mode as FakePriceMode) ? (r.mode as FakePriceMode) : "multiply",
      value: Number(r.value),
      round: ROUNDS.has(r.round as FakePriceRound) ? (r.round as FakePriceRound) : "none",
    };
    if (f.id && !formulaProblem(f) && !out.some((y) => y.id === f.id)) out.push(f);
  }
  return out;
}

/** ปัดราคา (ขึ้นเสมอ — ราคาเต็มไม่ควรต่ำกว่าที่คำนวณได้) */
export function roundFakePrice(v: number, round: FakePriceRound): number {
  const x = Math.round(v * 100) / 100;   // กันเศษทศนิยมลอย (เช่น 1.7×720 = 1223.9999)
  switch (round) {
    case "ceil10": return Math.ceil(x / 10) * 10;
    case "ceil100": return Math.ceil(x / 100) * 100;
    case "end90": return Math.max(90, Math.ceil((x - 90) / 100) * 100 + 90);
    case "end99": return Math.max(99, Math.ceil((x - 99) / 100) * 100 + 99);
    default: return Math.round(x);
  }
}

/** Fake Price จากราคาขาย · ไม่มีราคาขาย / ได้ไม่สูงกว่าราคาขาย = null (ไม่ใส่) */
export function computeFakePrice(sale: unknown, f: Pick<FakePriceFormula, "mode" | "value" | "round">): number | null {
  const s = Number(sale);
  if (!Number.isFinite(s) || s <= 0) return null;
  const raw = f.mode === "add" ? s + f.value : f.mode === "discount" ? s / (1 - f.value / 100) : s * f.value;
  if (!Number.isFinite(raw)) return null;
  const v = roundFakePrice(raw, f.round);
  return v > s ? v : null;
}

/** อธิบายสูตรเป็นภาษาคน เช่น "ราคาขาย × 2 แล้วปัดให้ลงท้าย 90" */
export function describeFormula(f: Pick<FakePriceFormula, "mode" | "value" | "round">): string {
  const base = f.mode === "add" ? `ราคาขาย + ${f.value.toLocaleString("th-TH")}` : f.mode === "discount" ? `ให้ราคาขายดูเป็นลด ${f.value}%` : `ราคาขาย × ${f.value}`;
  return f.round === "none" ? base : `${base} แล้ว${ROUND_LABEL[f.round]}`;
}

/** ส่วนลดที่ลูกค้าจะเห็น (%) — ใช้โชว์ในตัวอย่าง */
export const discountPercent = (sale: number, fake: number): number => (fake > sale && sale > 0 ? Math.round((1 - sale / fake) * 100) : 0);
