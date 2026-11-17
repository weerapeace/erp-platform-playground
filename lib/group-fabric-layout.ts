/**
 * 🧵 "วางบนผ้า" ของกลุ่มบรรทัดตีราคา (ไม่มีหน้าจอ) — เจ้าของขอ 2026-11-17
 *   หัวกลุ่มตารางตีราคาเดิมบอก "ใช้ต่อใบ ≈" จากพื้นที่ (lib/cost-usage) → ตัวนี้จำลองวางชิ้นจริงบนหน้าผ้า
 *   ด้วยตัววางชิ้นกลาง packFabric (lib/fabric-calc — ตัวเดียวกับเครื่องคิดเลขผ้า) แล้วบอก ต่อใบ + รวมทั้งล็อต N ใบ
 *   • ผ้าม้วน (มีหน้ากว้างในบรรทัด) → หลา · หารด้วยตัวหารของบรรทัด (ตั้งต้น 90 ซม. เท่ากับตารางตีราคา) เทียบกับ "≈" ได้ตรง
 *   • ผ้าผืน/แผ่น (ทะเบียนวัสดุมีขนาดผืน กว้าง×ยาว) → ผืน · 1 ผืนได้กี่ใบ
 *   วางทีละ 1 ใบเศษเยอะเกินจริง → คิดทั้งล็อตแล้วหารต่อใบ (จำนวนสั่งของแท็บ · ไม่มี = 100 ใบ)
 * ใช้ที่: components/design-sheet-detail/group-fabric-layout.tsx · เทส lib/__tests__/group-fabric-layout.test.ts
 */
import { packFabric, type FabricResult } from "@/lib/fabric-calc";

export type LayoutLine = {
  key: string;
  width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm?: number | null; waste_percent?: number | null; divisor?: number | null;
};
export type GroupLayout = {
  mode: "roll" | "sheet";
  faceWidthCm: number; sheetLengthCm: number | null; wastePercent: number;
  qty: number;
  /** ต่อใบ (หลา หรือ ผืน) รวมเผื่อเสียแล้ว */
  perUnit: number;
  /** รวมทั้งล็อต qty ใบ (หลา หรือ ผืนที่ต้องสั่ง) */
  total: number;
  /** ผ้าผืน: 1 ผืนได้กี่ใบ */
  unitsPerSheet: number | null;
  /** วางได้คุ้มกี่ % (ไม่รวมเผื่อเสีย) */
  efficiency: number;
  result: FabricResult;
};

export const DEFAULT_LAYOUT_QTY = 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** บรรทัดที่วางได้ = มีกว้าง ยาว จำนวนชิ้น · ไม่มีเลย / หาหน้ากว้างไม่ได้ = null */
export function groupFabricLayout(lines: LayoutLine[], opts: { qty?: number | null; sheet?: { width_cm: number | null; length_cm: number | null } | null; gapCm?: number }): GroupLayout | null {
  const ok = lines.filter((l) => num(l.width_cm) > 0 && num(l.length_cm) > 0 && num(l.pieces) > 0);
  if (!ok.length) return null;
  const qty = Math.max(1, Math.round(num(opts.qty) || DEFAULT_LAYOUT_QTY));
  const sw = num(opts.sheet?.width_cm), sl = num(opts.sheet?.length_cm);
  const face = ok.map((l) => num(l.face_width_cm)).find((v) => v > 0) ?? 0;
  const mode: "roll" | "sheet" | null = sw > 0 && sl > 0 ? "sheet" : face > 0 ? "roll" : null;
  if (!mode) return null;
  const faceWidthCm = mode === "sheet" ? sw : face;
  const wastePercent = Math.max(0, ok.map((l) => num(l.waste_percent)).find((v) => v > 0) ?? 0);
  const div = ok.map((l) => num(l.divisor)).find((v) => v > 0) ?? 90;
  const result = packFabric({
    pieces: ok.map((l) => ({ key: l.key, label: `${num(l.width_cm)}×${num(l.length_cm)}`, width_cm: num(l.width_cm), length_cm: num(l.length_cm), qty: Math.round(num(l.pieces)) * qty })),
    faceWidthCm, sheetLengthCm: mode === "sheet" ? sl : null, allowRotate: true, wastePercent, gapCm: opts.gapCm ?? 0.5,
  });
  if (!result.ok) return null;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  if (mode === "roll") {
    const total = result.lengthWithWasteCm / div;
    return { mode, faceWidthCm, sheetLengthCm: null, wastePercent, qty, perUnit: r3(total / qty), total: Math.round(total * 100) / 100, unitsPerSheet: null, efficiency: Math.round(result.packEfficiencyPercent), result };
  }
  const used = result.sheetsUsed ?? 0;
  return {
    mode, faceWidthCm, sheetLengthCm: sl, wastePercent, qty,
    perUnit: r3((used * (1 + wastePercent / 100)) / qty),
    total: result.sheets ?? Math.ceil(used * (1 + wastePercent / 100)),
    unitsPerSheet: used > 0 ? Math.floor(qty / used) : null,
    efficiency: Math.round(result.packEfficiencyPercent), result,
  };
}
