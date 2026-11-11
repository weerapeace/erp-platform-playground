/**
 * 💰 สูตรของ "บรรทัดตีราคา" ใบงานออกแบบ (ไม่มีหน้าจอ) — ย้ายออกจาก components/design-sheet-detail 2026-11-10
 *   เพื่อให้ฝั่งเซิร์ฟเวอร์ใช้สูตรเดียวกันได้ (ส่งชิ้นจากสตูดิโอแพทเทิร์นไปตีราคา · lib/pattern-costing)
 *
 *   isPieceGroup      — วัสดุชนิด "ชิ้นสำเร็จขนาดตายตัว" (ผ้าชิ้น / ลายพิมพ์ / ตัวเสริม): คิดพื้นที่ cm² × ราคาต่อ cm²
 *   recomputeCostLine — คิดปริมาณ + ยอดเงินของบรรทัดใหม่ (วาดรูปทรง + คิดจากพื้นที่จริง = ใช้พื้นที่จริง)
 *   costLineFromItem  — บรรทัดใหม่จากวัสดุตีราคา (ยังไม่มีขนาด)
 *   costItemPatch / withPrevItem / restorePrevItem — เปลี่ยนวัสดุของบรรทัดเดิม (+ จำวัสดุเดิมไว้เทียบ) · ย้ายจากหน้าคอม 2026-11-10 ให้มือถือใช้ร่วม
 *
 * ห้ามเขียนสูตรนี้ซ้ำที่อื่น — หน้าจอตีราคา (คอม + มือถือ) และ API ต้องได้เลขเดียวกัน · เทสต์ lib/__tests__/pattern-costing.test.ts
 */
import { calcCostQty } from "@/lib/design-sheets-meta";
import { lineShapeArea, type LineShape } from "@/lib/pattern-shape";
import type { CostLine, PrevItem } from "@/app/api/design-sheets/[id]/cost-lines/route";

/** ช่องของบรรทัดที่สูตรใช้ (บรรทัดจริงมีช่องมากกว่านี้ — ส่งทั้งก้อนมาได้) */
export type CostRowCalc = {
  group_code?: string | null; group_name: string | null; calc_method: string | null;
  width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; divisor: number | null;
  qty: number | null; unit_price: number | null; amount: number | null;
  shape?: LineShape | null;
};
/** ช่องของวัสดุตีราคาที่ใช้ตั้งบรรทัดใหม่ */
export type CostItemLike = {
  id: string; name: string; price_per_unit: number | null; uom: string | null; face_width_cm: number | null;
  width_cm: number | null; length_cm: number | null;
  group_name: string | null; group_code: string | null; calc_method: string | null; loss_percent: number | null; divisor: number | null; uom_default: string | null;
};

// ชนิด "ชิ้นสำเร็จขนาดตายตัว" — ตรวจจาก code (ตอนเลือกสด) หรือชื่อกลุ่ม (ตอนโหลดจาก DB) — ไม่แตะ material_groups ที่ BOM ใช้
const PIECE_CODES = new Set(["fabric_piece", "print", "reinforce"]);
const PIECE_NAMES = new Set(["ผ้า (ชิ้น)", "ลายพิมพ์", "ตัวเสริม"]);
export const isPieceGroup = (code?: string | null, name?: string | null) =>
  (!!code && PIECE_CODES.has(code)) || (!!name && PIECE_NAMES.has(name));

export const pieceArea = (r: { width_cm: number | null; length_cm: number | null }) =>
  (r.width_cm && r.length_cm) ? Math.round(r.width_cm * r.length_cm * 100) / 100 : null;

/** ราคาต่อ cm² ของวัสดุชนิดชิ้น = ราคาแผ่น ÷ พื้นที่แผ่น (กว้าง×ยาว) */
export function piecePricePerCm2(it: { price_per_unit: number | null; width_cm: number | null; length_cm: number | null }): number | null {
  const area = (it.width_cm && it.length_cm) ? it.width_cm * it.length_cm : null;
  if (!area || it.price_per_unit == null) return it.price_per_unit;   // ไม่มีขนาด → ใช้ราคาดิบ
  return Math.round((it.price_per_unit / area) * 1e6) / 1e6;
}

/** คิดปริมาณ+ยอดเงินใหม่ — ชิ้นสำเร็จ: ปริมาณ = พื้นที่ที่ใช้(กว้าง×ยาว) × จำนวนชิ้น, ราคา/หน่วย = ต่อ cm² */
export function recomputeCostLine<T extends CostRowCalc>(r: T): T {
  let qty: number | null;
  const shapeA = lineShapeArea(r.shape);                     // ✏️ วาดรูปทรง + เลือก "คิดจากพื้นที่จริง" → ใช้พื้นที่จริงแทน กว้าง×ยาว
  if (isPieceGroup(r.group_code, r.group_name)) {
    const a = shapeA ?? pieceArea(r);                        // พื้นที่ที่ใช้ต่อชิ้น (cm²)
    const k = 1 + (r.waste_percent || 0) / 100;              // เผื่อเสีย
    qty = a != null ? Math.round(a * k * (r.pieces ?? 1) * 10000) / 10000 : null;
  } else {
    qty = calcCostQty({ ...r, area_cm2: shapeA }) ?? r.qty;
  }
  const amount = qty != null && r.unit_price != null ? Math.round(qty * r.unit_price * 100) / 100 : null;
  return { ...r, qty, amount };
}

/** บรรทัดที่ "รวม = 0" ทั้งที่เริ่มกรอกแล้ว (มีวัสดุ/ตัวเลข) → เตือนสีแดง · บรรทัดว่างเปล่าที่เพิ่งเพิ่ม ไม่นับ (หน้าคอม + มือถือ) */
export const isZeroCostLine = (r: Pick<CostLine, "amount" | "item_id" | "item_name" | "qty" | "unit_price" | "width_cm"> & { item_sku_id?: string | null; group_code?: string | null }) => !(Number(r.amount) > 0)
  && !!(r.item_id || r.item_name || r.item_sku_id || r.group_code || Number(r.qty) > 0 || Number(r.unit_price) > 0 || Number(r.width_cm) > 0);

/** ช่องของบรรทัดตีราคาที่อาจต้องกรอก */
export type CostField = "width_cm" | "length_cm" | "face_width_cm" | "pieces" | "qty" | "unit_price";
/**
 * ช่องที่ "ต้องกรอก" แต่ยังว่าง → ตารางตีราคาทาพื้นแดงอ่อน (หน้าคอม + มือถือ · เจ้าของขอ 2026-11-11)
 *   นับเฉพาะบรรทัดที่เลือกวัสดุแล้ว (บรรทัดว่างที่เพิ่งเพิ่มไม่ทาแดงทั้งแถว) · เฉพาะช่องที่ขาดแล้วคิดยอดไม่ได้:
 *   ชิ้นสำเร็จ / พื้นที่÷100 = กว้าง ยาว · พื้นที่÷หน้ากว้าง = กว้าง ยาว หน้ากว้าง · ความยาว = ยาว · นับชิ้น = จำนวนชิ้น · อื่น ๆ = ปริมาณ
 *   + ราคา/หน่วย ทุกแบบ · วาดรูปทรงแบบ "คิดจากพื้นที่จริง" = ไม่ต้องกรอกกว้าง/ยาว (จำนวนชิ้นว่าง = คิดเป็น 1 จึงไม่บังคับ)
 */
export function missingCostFields(r: CostRowCalc & { item_id?: string | null; item_name?: string | null; item_sku_id?: string | null }): Set<CostField> {
  const out = new Set<CostField>();
  if (!(r.item_id || r.item_name || r.item_sku_id || r.group_code)) return out;
  const empty = (v: number | null | undefined) => !(Number(v) > 0);
  const piece = isPieceGroup(r.group_code, r.group_name);
  const m = r.calc_method;
  if (piece || m === "area_face" || m === "area_100") {
    if (lineShapeArea(r.shape) == null) {
      if (empty(r.width_cm)) out.add("width_cm");
      if (empty(r.length_cm)) out.add("length_cm");
    }
    if (!piece && m === "area_face" && empty(r.face_width_cm)) out.add("face_width_cm");
  } else if (m === "length") {
    if (empty(r.length_cm)) out.add("length_cm");
  } else if (m === "count") {
    if (empty(r.pieces)) out.add("pieces");
  } else if (empty(r.qty)) out.add("qty");
  if (empty(r.unit_price)) out.add("unit_price");
  return out;
}

/** "ถ้าสั่ง…" ใต้สรุปต้นทุน = ขั้นจำนวนที่ใช้เสนอราคาบ่อย (หน้าคอม + มือถือ) */
export const COST_QTY_TIERS = [100, 200, 500, 1000] as const;

/** patch ตอน "เลือกวัสดุ" ให้บรรทัดที่มีอยู่ — คงขนาด/จำนวนเดิม เปลี่ยนแค่วัสดุ/ชนิด/ราคา (หน้าคอม: ทีละแถว + bulk · มือถือ: แผ่นแก้บรรทัด) */
export function costItemPatch(it: CostItemLike, r: Pick<CostLine, "face_width_cm" | "pieces" | "uom">): Partial<CostLine> {
  const piece = isPieceGroup(it.group_code, it.group_name);
  return {
    item_id: it.id, item_name: it.name, group_name: it.group_name, group_code: it.group_code,
    price_basis: piece ? null : "manual", calc_method: it.calc_method,
    waste_percent: it.loss_percent, divisor: it.divisor, face_width_cm: it.face_width_cm ?? r.face_width_cm,
    pieces: piece ? (r.pieces ?? 1) : r.pieces,
    uom: piece ? "cm²" : (it.uom ?? it.uom_default ?? r.uom),
    unit_price: piece ? piecePricePerCm2(it) : it.price_per_unit,
  };
}

/** ตัวตนวัสดุของบรรทัด (ไว้เทียบว่า "เปลี่ยนวัสดุ" จริงไหม) */
export const rowMatKey = (r: { item_id?: string | null; item_sku_id?: string | null; group_code?: string | null }) =>
  r.item_id ? `i:${r.item_id}` : r.item_sku_id ? `s:${r.item_sku_id}` : r.group_code ? `g:${r.group_code}` : "";

/**
 * ข้อ B — ตอนเปลี่ยนวัสดุให้บรรทัดที่มีวัสดุอยู่แล้ว: จำ "วัสดุเดิม + ราคาเดิม" ไว้ใน prev_item (ถาวรจนกดรับทราบ/กลับของเดิม)
 * - ถ้าเคยจำไว้แล้ว ไม่ทับ (ของเดิมคือของเดิมตัวแรกเสมอ)   - ถ้าเลือกกลับมาเป็นวัสดุเดิม → ล้างทิ้ง (ไม่มีอะไรต่าง)
 */
export function withPrevItem(r: CostLine, patch: Partial<CostLine>): Partial<CostLine> {
  const before = rowMatKey(r); const after = rowMatKey({ ...r, ...patch });
  if (!before || before === after) return patch;
  if (r.prev_item) return rowMatKey(r.prev_item) === after ? { ...patch, prev_item: null } : patch;
  const prev: PrevItem = {
    item_id: r.item_id ?? null, item_sku_id: r.item_sku_id ?? null, item_sku_code: r.item_sku_code ?? null, item_name: r.item_name ?? null,
    group_name: r.group_name ?? null, group_code: r.group_code ?? null, price_basis: r.price_basis ?? null,
    unit_price: r.unit_price ?? null, uom: r.uom ?? null, calc_method: r.calc_method ?? null,
    waste_percent: r.waste_percent ?? null, divisor: r.divisor ?? null, face_width_cm: r.face_width_cm ?? null,
    amount: r.amount ?? null, changed_at: new Date().toISOString(),
  };
  return { ...patch, prev_item: prev };
}

/** กลับไปใช้วัสดุเดิม (↶) — คืนฟิลด์วัสดุ/ราคา คงขนาด/จำนวนที่กรอกไว้ */
export function restorePrevItem(p: PrevItem): Partial<CostLine> {
  return {
    item_id: p.item_id, item_sku_id: p.item_sku_id, item_sku_code: p.item_sku_code, item_name: p.item_name,
    group_name: p.group_name, group_code: p.group_code, price_basis: p.price_basis,
    unit_price: p.unit_price, uom: p.uom, calc_method: p.calc_method,
    waste_percent: p.waste_percent, divisor: p.divisor, face_width_cm: p.face_width_cm, prev_item: null,
  };
}

/** บรรทัดตีราคาใหม่จากวัสดุ — ชนิดชิ้น: ไม่เติมขนาด (ให้กรอก/วาดขนาดที่ตัดจริง) · ราคา/หน่วย = ต่อ cm² */
export function costLineFromItem(it: CostItemLike, idx: number) {
  const piece = isPieceGroup(it.group_code, it.group_name);
  return recomputeCostLine({
    item_id: it.id as string | null, item_name: it.name as string | null, group_name: it.group_name, group_code: it.group_code, calc_method: it.calc_method,
    width_cm: null as number | null, length_cm: null as number | null, pieces: (piece ? 1 : null) as number | null,
    face_width_cm: it.face_width_cm,
    waste_percent: it.loss_percent, divisor: it.divisor, qty: null as number | null,
    uom: piece ? "cm²" : (it.uom ?? it.uom_default),
    unit_price: piece ? piecePricePerCm2(it) : it.price_per_unit,
    amount: null as number | null, note: null as string | null, sort_order: idx + 1,
  });
}
