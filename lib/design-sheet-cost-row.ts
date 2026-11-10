/**
 * 💰 สูตรของ "บรรทัดตีราคา" ใบงานออกแบบ (ไม่มีหน้าจอ) — ย้ายออกจาก components/design-sheet-detail 2026-11-10
 *   เพื่อให้ฝั่งเซิร์ฟเวอร์ใช้สูตรเดียวกันได้ (ส่งชิ้นจากสตูดิโอแพทเทิร์นไปตีราคา · lib/pattern-costing)
 *
 *   isPieceGroup      — วัสดุชนิด "ชิ้นสำเร็จขนาดตายตัว" (ผ้าชิ้น / ลายพิมพ์ / ตัวเสริม): คิดพื้นที่ cm² × ราคาต่อ cm²
 *   recomputeCostLine — คิดปริมาณ + ยอดเงินของบรรทัดใหม่ (วาดรูปทรง + คิดจากพื้นที่จริง = ใช้พื้นที่จริง)
 *   costLineFromItem  — บรรทัดใหม่จากวัสดุตีราคา (ยังไม่มีขนาด)
 *
 * ห้ามเขียนสูตรนี้ซ้ำที่อื่น — หน้าจอตีราคาและ API ต้องได้เลขเดียวกัน · เทสต์ lib/__tests__/pattern-costing.test.ts
 */
import { calcCostQty } from "@/lib/design-sheets-meta";
import { lineShapeArea, type LineShape } from "@/lib/pattern-shape";

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
