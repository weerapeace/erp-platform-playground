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
  match?: boolean;       // ต้องตรงลาย (ใช้กับ repeat_cm) → ความยาวปัดขึ้นเป็นรอบลาย + ห้ามหมุน
  total?: number;        // จำนวนชิ้นทั้งงาน (ถ้าใส่ = ใช้แทน per_unit × qty — โหมดทั้งตระกูลที่แต่ละสีจำนวนไม่เท่ากัน)
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
  repeat_cm?: number;              // ลายซ้ำ (ซม. ตามความยาวผ้า) — ชิ้นที่ match ต้องยาวเป็นจำนวนเท่าของรอบลาย
  unit?: BuyUnit;                 // ซื้อเป็น หลา/เมตร (ผ้าม้วน)
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

  // ชิ้นที่ต้องตัดทั้งหมด (ขยายตามหดตัว · ชิ้นตรงลาย = ยาวปัดขึ้นเป็นรอบลาย + ห้ามหมุน)
  const repeat = Math.max(0, Number(i.repeat_cm) || 0);
  const pieces: FabricPiece[] = i.pieces
    .filter((p) => Number(p.width_cm) > 0 && Number(p.length_cm) > 0 && (Number(p.total) > 0 || Number(p.per_unit) > 0))
    .map((p) => {
      const matched = repeat > 0 && !!p.match;
      const len = Number(p.length_cm) * shrinkK;
      return {
        key: p.key, label: p.label || `${p.width_cm}×${p.length_cm}`,
        width_cm: r2(Number(p.width_cm) * shrinkK),
        length_cm: matched ? Math.ceil(len / repeat - EPS) * repeat : r2(len),
        qty: Math.round(Number(p.total) > 0 ? Number(p.total) : Number(p.per_unit) * qty),
        noRotate: !!p.no_rotate || matched,
      };
    });
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

// ── ทั้งตระกูล แบ่งตามสี (เฟส 2) ──────────────────────────────────────────────
/** บรรทัดชิ้นตัด 1 บรรทัดของสูตร (BOM) ของสีหนึ่ง */
export type FamilyLine = { component_sku: string; component_name: string | null; label: string; width_cm: number; length_cm: number; per_unit: number; no_rotate?: boolean };
/** สี (SKU ลูก) 1 ตัว: จำนวนที่จะผลิต + ชิ้นตัดจากสูตรของสีนั้น */
export type FamilyColor = { sku: string; color: string | null; qty: number; lines: FamilyLine[] };
/** ผ้า 1 ตัวหลังรวมทุกสี — qty = จำนวนใบที่ใช้ผ้านี้ · pieces มี total (ชิ้นทั้งงาน) */
export type FamilyFabric = { sku: string; name: string | null; qty: number; colors: string[]; pieces: BuyPiece[] };

/**
 * รวมชิ้นตัดของทุกสีตามผ้า — ผ้าตัวเดียวกันที่หลายสีใช้ (ซับใน/เทป) รวมยอดเป็นแถวเดียว · ผ้าคนละสีแยกแถว
 * ชิ้นขนาด+ชื่อ+ห้ามหมุนเหมือนกัน รวมจำนวน · สีที่จำนวน 0 หรือไม่มีบรรทัด = ข้าม
 */
export function mergeFamilyFabrics(colors: FamilyColor[]): FamilyFabric[] {
  const out = new Map<string, FamilyFabric & { _p: Map<string, BuyPiece> }>();
  for (const c of colors) {
    const q = Math.max(0, Math.floor(Number(c.qty) || 0));
    if (q <= 0) continue;
    const used = new Set<string>();
    for (const l of c.lines) {
      if (!(l.width_cm > 0 && l.length_cm > 0 && l.per_unit > 0)) continue;
      const sku = l.component_sku || "(ไม่ระบุรหัส)";
      const f = out.get(sku) ?? out.set(sku, { sku, name: l.component_name, qty: 0, colors: [], pieces: [], _p: new Map() }).get(sku)!;
      if (!used.has(sku)) { used.add(sku); f.qty += q; f.colors.push(c.color || c.sku); }
      const k = `${l.label}|${l.width_cm}|${l.length_cm}|${l.no_rotate ? 1 : 0}`;
      const p = f._p.get(k) ?? f._p.set(k, { key: `${sku}:${f._p.size}`, label: l.label, width_cm: l.width_cm, length_cm: l.length_cm, per_unit: 0, no_rotate: !!l.no_rotate, total: 0 }).get(k)!;
      p.total = (p.total ?? 0) + l.per_unit * q;
    }
  }
  return [...out.values()].map(({ _p, ...f }) => ({
    ...f,
    pieces: [..._p.values()].map((p) => ({ ...p, per_unit: f.qty > 0 ? Math.round(((p.total ?? 0) / f.qty) * 10000) / 10000 : 0 })),
  })).sort((a, b) => b.qty - a.qty || a.sku.localeCompare(b.sku));
}

/** ชิ้นตัดจากผังของใบสั่งผลิตเก่า (บล็อก = ชิ้นทั้งใบ) → ชิ้นต่อ 1 ใบ (หารจำนวนในใบ · ชิ้นขนาดเดียวกันรวมกัน) */
export function piecesFromMoBlocks(blocks: { label: string; width_cm: number; length_cm: number; total_pieces: number; no_rotate?: boolean }[], moQty: number): Omit<BuyPiece, "key">[] {
  const q = Number(moQty) || 0;
  if (q <= 0) return [];
  const m = new Map<string, Omit<BuyPiece, "key">>();
  for (const b of blocks) {
    if (!(b.width_cm > 0 && b.length_cm > 0 && b.total_pieces > 0)) continue;
    const k = `${b.width_cm}|${b.length_cm}|${b.no_rotate ? 1 : 0}`;
    const p = m.get(k) ?? m.set(k, { label: b.label || `${b.width_cm}×${b.length_cm}`, width_cm: b.width_cm, length_cm: b.length_cm, per_unit: 0, no_rotate: !!b.no_rotate }).get(k)!;
    p.per_unit += b.total_pieces;
  }
  return [...m.values()].map((p) => ({ ...p, per_unit: Math.round((p.per_unit / q) * 10000) / 10000 }));
}
