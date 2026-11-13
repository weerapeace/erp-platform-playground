/**
 * "คิดผ้าก่อนซื้อ" (ของกลาง · สูตรล้วน ไม่มีหน้าจอ) — หน้า /fabric-calc แท็บ "คิดผ้าก่อนซื้อ"
 *
 * เจ้าของสั่ง 2026-11-13: คำนวณผ้าก่อนซื้อว่าใช้เท่าไหร่ (ยังไม่มีใบสั่งผลิต) แบบละเอียด
 * ตัววางผ้าจริง = packFabric (lib/fabric-calc — ตัวเดียวกับใบสั่งผลิต/วางแผนตัดผ้า/ใบงานออกแบบ) ไฟล์นี้แค่เพิ่มเรื่อง "ซื้อ":
 *   - หักริมผ้า (หน้ากว้างใช้ได้จริง = หน้ากว้างเต็ม − ริม)
 *   - เผื่อหดตัว % (ขยายชิ้นตัดทั้งกว้างและยาวก่อนวาง)
 *   - เผื่อเสีย % (หัว-ท้ายม้วน/ตำหนิ) → ส่งให้ packFabric บวกเอง
 *   - หน่วยซื้อ หลา/เมตร (ผ้าผืน = ผืน) + ปัดขึ้น (ไม่ปัด / หน่วยเต็ม / ม้วนเต็ม)
 *   - ราคา → งบ · หักสต็อก → ต้องซื้อเพิ่ม
 *   - เทียบหลายหน้ากว้าง (ผ้าหน้าไหนถูกสุด)
 * เทสต์: lib/__tests__/fabric-buy.test.ts
 */
import { packFabric, YARD_CM, type FabricPiece, type FabricResult } from "./fabric-calc";

export type BuyPiece = {
  key: string;
  label: string;
  width_cm: number;
  length_cm: number;
  per_unit: number;      // ชิ้นต่อ 1 ใบ (ตัว)
  no_rotate?: boolean;   // ชิ้นนี้ห้ามหมุน (ตามลาย/เกรน)
};

export type BuyUnit = "yd" | "m";
export type BuyRound = "none" | "unit" | "roll";

export type BuyInput = {
  pieces: BuyPiece[];
  qty: number;                     // จำนวนผลิต (ใบ)
  face_width_cm: number;           // หน้ากว้างเต็ม
  trim_cm?: number;                // หักริม รวม 2 ข้าง
  form?: "roll" | "sheet";         // ม้วน / ผืน
  sheet_length_cm?: number | null; // ผ้าผืน: ความยาวต่อผืน
  allow_rotate?: boolean;          // ทางผ้า: หมุนชิ้นได้ไหม (ผ้าเรียบ = ได้)
  gap_cm?: number;                 // เว้นระหว่างชิ้น
  waste_pct?: number;              // เผื่อเสีย %
  shrink_pct?: number;             // ผ้าหดตัว %
  unit?: BuyUnit;                  // ซื้อเป็น หลา/เมตร (ผ้าม้วน)
  round?: BuyRound;                // ปัดขึ้น
  roll_length?: number | null;     // 1 ม้วนยาวกี่ "หน่วยซื้อ"
  price?: number | null;           // ราคาต่อหน่วยซื้อ (บาท)
  stock?: number | null;           // สต็อกคงเหลือ (หน่วยซื้อเดียวกัน)
};

export type BuyResult = {
  ok: boolean;
  error?: string;
  usable_width_cm: number;         // หน้ากว้างใช้ได้จริง
  unit_label: string;              // หลา / เมตร / ผืน
  total_pieces: number;
  used_length_cm: number;          // ความยาวที่วางจริง (ก่อนเผื่อเสีย)
  need: number;                    // ต้องใช้ (รวมเผื่อเสีย · ยังไม่ปัด) ในหน่วยซื้อ
  need_rounded: number;            // ต้องใช้ (ปัดแล้ว)
  rolls: number | null;            // ต้องใช้กี่ม้วน (ถ้ารู้ความยาวม้วน)
  per_unit: number;                // ใช้ต่อ 1 ใบ (หน่วยซื้อ)
  per_unit_cm: number;             // ใช้ต่อ 1 ใบ (ซม. ความยาวผ้า)
  efficiency_pct: number;          // ใช้ผ้าคุ้มกี่ % (ไม่รวมเผื่อเสีย)
  naive: number;                   // วิธีเดิม (พื้นที่ ÷ หน้ากว้าง) ไว้เทียบ
  stock: number;
  to_buy: number;                  // ต้องซื้อเพิ่ม (หักสต็อก · ปัดแล้ว)
  cost_total: number | null;       // ค่าผ้าทั้งหมดที่ใช้ (ไม่ปัด) = ต้นทุนผ้าของงานนี้
  cost_buy: number | null;         // งบซื้อเพิ่ม = to_buy × ราคา
  cost_per_unit: number | null;    // ค่าผ้าต่อ 1 ใบ
  layout: FabricResult | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 1e-6;

/** ปัดขึ้นตามโหมด — none = 2 ตำแหน่ง · unit = หน่วยเต็ม · roll = ม้วนเต็ม (ไม่รู้ความยาวม้วน = หน่วยเต็ม) */
export function roundBuy(v: number, round: BuyRound, rollLength?: number | null): number {
  if (v <= 0) return 0;
  if (round === "none") return r2(v);
  if (round === "roll" && rollLength && rollLength > 0) return Math.ceil(v / rollLength - EPS) * rollLength;
  return Math.ceil(v - EPS);
}

/** หน่วยของวัตถุดิบ (ชื่อหน่วยใน SKU) → หน่วยซื้อที่เทียบได้ · ไม่รู้จัก = null */
export function unitFromUomName(name: string | null | undefined): BuyUnit | null {
  const s = (name ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("หลา") || s === "yd" || s === "yard" || s === "yards") return "yd";
  if (s.includes("เมตร") || s === "ม." || s === "m" || s === "meter" || s === "metre") return "m";
  return null;
}

/** แปลงปริมาณความยาวผ้าระหว่างหลา ↔ เมตร */
export function convertLength(v: number, from: BuyUnit, to: BuyUnit): number {
  if (from === to) return v;
  return from === "yd" ? (v * YARD_CM) / 100 : (v * 100) / YARD_CM;
}

export function calcFabricBuy(i: BuyInput): BuyResult {
  const qty = Math.max(0, Math.floor(Number(i.qty) || 0));
  const face = Number(i.face_width_cm) || 0;
  const trim = Math.max(0, Number(i.trim_cm) || 0);
  const usable = face - trim;
  const sheet = i.form === "sheet";
  const sheetLen = sheet ? Number(i.sheet_length_cm) || 0 : 0;
  const unit: BuyUnit = i.unit === "m" ? "m" : "yd";
  const unitCm = unit === "m" ? 100 : YARD_CM;
  const unitLabel = sheet ? "ผืน" : unit === "m" ? "เมตร" : "หลา";
  const shrinkK = 1 + Math.max(0, Number(i.shrink_pct) || 0) / 100;
  const waste = Math.max(0, Number(i.waste_pct) || 0);
  const round: BuyRound = i.round ?? "unit";
  const rollLen = !sheet && Number(i.roll_length) > 0 ? Number(i.roll_length) : null;
  const price = Number(i.price) > 0 ? Number(i.price) : null;
  const stock = Math.max(0, Number(i.stock) || 0);

  const empty = (error: string): BuyResult => ({
    ok: false, error, usable_width_cm: usable, unit_label: unitLabel, total_pieces: 0, used_length_cm: 0,
    need: 0, need_rounded: 0, rolls: null, per_unit: 0, per_unit_cm: 0, efficiency_pct: 0, naive: 0,
    stock, to_buy: 0, cost_total: null, cost_buy: null, cost_per_unit: null, layout: null,
  });
  if (qty <= 0) return empty("ใส่จำนวนที่จะผลิตก่อน");
  if (face <= 0) return empty("ใส่หน้ากว้างผ้าก่อน");
  if (usable <= 0) return empty("หักริมมากกว่าหน้ากว้างผ้า");
  if (sheet && sheetLen <= 0) return empty("ผ้าผืน: ใส่ความยาวต่อผืนก่อน");

  // ชิ้นที่ต้องตัดทั้งหมด (ขยายตามหดตัว)
  const pieces: FabricPiece[] = i.pieces
    .filter((p) => Number(p.width_cm) > 0 && Number(p.length_cm) > 0 && Number(p.per_unit) > 0)
    .map((p) => ({
      key: p.key, label: p.label || `${p.width_cm}×${p.length_cm}`,
      width_cm: r2(Number(p.width_cm) * shrinkK), length_cm: r2(Number(p.length_cm) * shrinkK),
      qty: Math.round(Number(p.per_unit) * qty), noRotate: !!p.no_rotate,
    }));
  if (pieces.length === 0) return empty("ใส่ชิ้นตัด (กว้าง × ยาว × ชิ้นต่อใบ) อย่างน้อย 1 ชิ้น");

  const res = packFabric({
    pieces, faceWidthCm: usable, sheetLengthCm: sheet ? sheetLen : null,
    allowRotate: i.allow_rotate !== false, wastePercent: waste, gapCm: Math.max(0, Number(i.gap_cm) || 0),
  });
  if (!res.ok) return { ...empty(res.error ?? "วางชิ้นบนผ้าไม่ได้"), layout: res };

  const need = sheet ? (res.sheets ?? 0) : res.lengthWithWasteCm / unitCm;
  const needRounded = sheet ? Math.ceil(need - EPS) : roundBuy(need, round, rollLen);
  const toBuy = sheet ? Math.max(0, Math.ceil(need - stock - EPS)) : roundBuy(Math.max(0, need - stock), round, rollLen);
  const perUnitCm = res.lengthWithWasteCm / qty;
  const perUnit = need / qty;
  const naive = sheet ? 0 : (res.naiveYards * YARD_CM) / unitCm;

  return {
    ok: true,
    usable_width_cm: usable,
    unit_label: unitLabel,
    total_pieces: res.totalPieces,
    used_length_cm: res.usedLengthCm,
    need: r2(need),
    need_rounded: needRounded,
    rolls: rollLen ? Math.ceil(need / rollLen - EPS) : null,
    per_unit: perUnit,
    per_unit_cm: perUnitCm,
    efficiency_pct: r2(res.packEfficiencyPercent),
    naive: r2(naive),
    stock,
    to_buy: toBuy,
    cost_total: price != null ? r2(need * price) : null,
    cost_buy: price != null ? r2(toBuy * price) : null,
    cost_per_unit: price != null ? r2(perUnit * price) : null,
    layout: res,
  };
}

export type WidthOption = { face_width_cm: number; price?: number | null };
export type WidthCompareRow = { face_width_cm: number; price: number | null; result: BuyResult; best: boolean };

/**
 * เทียบหลายหน้ากว้าง (ผ้ารุ่นเดียวกัน หน้าต่างกัน ราคาต่างกัน) — ใช้ค่าตั้งอื่นเหมือนเดิมทุกอย่าง
 * best = ถูกสุด (ถ้ามีราคาครบทุกตัว) · ไม่มีราคา = ใช้ผ้าน้อยสุด (ความยาว)
 * ไม่หักสต็อก (สต็อกเป็นของผ้าตัวที่เลือกตัวเดียว)
 */
export function compareWidths(base: BuyInput, options: WidthOption[]): WidthCompareRow[] {
  const rows = options
    .filter((o) => Number(o.face_width_cm) > 0)
    .map((o) => {
      const price = Number(o.price) > 0 ? Number(o.price) : null;
      return { face_width_cm: Number(o.face_width_cm), price, result: calcFabricBuy({ ...base, face_width_cm: o.face_width_cm, price, stock: 0 }), best: false };
    });
  const ok = rows.filter((r) => r.result.ok);
  if (ok.length === 0) return rows;
  const allPriced = ok.every((r) => r.price != null);
  const score = (r: WidthCompareRow) => (allPriced ? (r.result.need_rounded * (r.price ?? 0)) : r.result.need);
  const min = Math.min(...ok.map(score));
  for (const r of ok) if (Math.abs(score(r) - min) < EPS) { r.best = true; break; }
  return rows;
}
