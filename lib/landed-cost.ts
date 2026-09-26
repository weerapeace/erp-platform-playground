// ============================================================
// ของกลาง — สูตร "ใบสำคัญรับ (ใบซื้อ)" : ราคาสินค้า ¥/฿ + ค่าส่ง (คิว หรือ น้ำหนัก) เฉลี่ยลงรายการ
//
//   ราคา/หน่วย (บาท)   = ราคา/หน่วย (สกุลใบ) × เรท           (THB = ตรง ๆ)
//   ค่าสินค้าบรรทัด     = ราคา/หน่วย (บาท) × จำนวน
//   คิว/ชิ้น           = ยาว × กว้าง × สูง (ซม.) ÷ 1,000,000     (ดู lib/supplier-quote.ts สูตรเดียวกัน)
//   ค่าส่งรวม          = ปริมาณรวม (คิว หรือ กก.) × เรทขนส่ง   หรือ "ยอดจริงจากบิลขนส่ง" ที่กรอกทับ
//   ค่าส่งของบรรทัด     = ค่าส่งรวม × (ปริมาณของบรรทัด ÷ ปริมาณรวม)   ← เฉลี่ยตามสัดส่วน
//   ต้นทุนถึงมือ/ชิ้น   = ราคา/หน่วย (บาท) + ค่าส่งของบรรทัด ÷ จำนวน
//
// เจ้าของสั่ง (2026-09-26): "ค่าส่งโชว์แยกให้ดู ไม่รวมในราคาสินค้า" → ราคาที่เขียนกลับ SKU/ราคาต่อร้าน
// = ราคาสินค้าอย่างเดียว · ต้นทุนถึงมือเป็นตัวเลขประกอบบนใบ
// ============================================================

export type ShipMethod = "none" | "cube" | "weight";

export const CM3_PER_CBM = 1_000_000;
export const isForeignCurrency = (cur: string | null | undefined): boolean => {
  const c = String(cur ?? "THB").toUpperCase();
  return c !== "" && c !== "THB";
};
export const isCNY = (cur: string | null | undefined): boolean => ["RMB", "YUAN", "CNY"].includes(String(cur ?? "").toUpperCase());

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v: number) => Math.round((Number(v) || 0) * 10000) / 10000;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** คิว (CBM) ต่อชิ้น จากขนาดเป็นเซนติเมตร — ค่าว่าง/0 ตัวใดตัวหนึ่ง = ไม่รู้ (null) */
export function cbmFromCm(lengthCm: unknown, widthCm: unknown, heightCm: unknown): number | null {
  const l = n(lengthCm), w = n(widthCm), h = n(heightCm);
  if (l <= 0 || w <= 0 || h <= 0) return null;
  return Math.round(((l * w * h) / CM3_PER_CBM) * 1_000_000) / 1_000_000;   // 6 ตำแหน่ง (ชิ้นเล็กคิวน้อยมาก)
}

export type VoucherLineInput = {
  qty: number;
  unit_price: number | null;       // ราคา/หน่วย ตามสกุลของใบ (null = ยังไม่มีราคา)
  cbm_per_unit?: number | null;
  kg_per_unit?: number | null;
};

export type VoucherHeaderInput = {
  currency: string;                // THB | RMB | ...
  fx_rate: number | null;          // บาท ต่อ 1 หน่วยสกุลต่างประเทศ (THB ไม่ใช้)
  ship_method: ShipMethod;
  ship_rate: number | null;        // ฿/คิว (cube) หรือ ฿/กก. (weight)
  ship_manual_total?: number | null; // กรอกยอดค่าส่งจริงทับ (null = คิดจากเรท)
};

export type VoucherLineCalc = {
  unit_price_thb: number;          // ราคา/หน่วย บาท (ไม่รวมค่าส่ง)
  line_total_foreign: number;      // ค่าสินค้าบรรทัด สกุลใบ
  line_total_thb: number;          // ค่าสินค้าบรรทัด บาท
  basis: number;                   // ปริมาณที่ใช้เฉลี่ย (คิวรวม หรือ กก.รวม ของบรรทัด)
  ship_alloc_thb: number;          // ค่าส่งที่เฉลี่ยมาบรรทัดนี้ (บาท)
  landed_unit_thb: number;         // ต้นทุนถึงมือ/ชิ้น = ราคาบาท + ค่าส่ง/ชิ้น
  has_price: boolean;
};

export type VoucherTotals = {
  subtotal_foreign: number;        // ค่าสินค้ารวม สกุลใบ
  subtotal_thb: number;            // ค่าสินค้ารวม บาท
  total_cbm: number;
  total_kg: number;
  ship_from_rate_thb: number;      // ค่าส่งที่คิดจากเรท (ไว้เทียบกับยอดจริง)
  ship_total_thb: number;          // ค่าส่งที่ใช้จริง (manual ถ้ากรอก)
  grand_total_thb: number;         // ค่าสินค้า + ค่าส่ง (โชว์แยกบรรทัดบนใบ)
  missing_price_count: number;     // บรรทัดที่ยังไม่มีราคา
  missing_basis_count: number;     // บรรทัดที่ไม่มีคิว/กก. (เฉลี่ยค่าส่งไม่ได้)
};

/** เรทที่ใช้แปลงเป็นบาท — THB = 1 · สกุลอื่นไม่มีเรท = 0 (ราคาบาทจะเป็น 0 ให้เห็นว่ายังไม่ครบ) */
export function effectiveFx(currency: string, fxRate: number | null | undefined): number {
  if (!isForeignCurrency(currency)) return 1;
  return n(fxRate) > 0 ? n(fxRate) : 0;
}

export function computeVoucher(header: VoucherHeaderInput, lines: VoucherLineInput[]): { lines: VoucherLineCalc[]; totals: VoucherTotals } {
  const fx = effectiveFx(header.currency, header.fx_rate);
  const method = header.ship_method;

  // 1) ค่าสินค้า + ปริมาณต่อบรรทัด
  const base = lines.map((l) => {
    const qty = n(l.qty);
    const hasPrice = l.unit_price != null && n(l.unit_price) > 0;
    const unit = hasPrice ? n(l.unit_price) : 0;
    const unitThb = r4(unit * fx);
    const perUnit = method === "cube" ? n(l.cbm_per_unit) : method === "weight" ? n(l.kg_per_unit) : 0;
    return { qty, hasPrice, unit, unitThb, lineForeign: r2(unit * qty), lineThb: r2(unitThb * qty), basis: r4(perUnit * qty) };
  });

  const totalCbm = r4(lines.reduce((a, l) => a + n(l.cbm_per_unit) * n(l.qty), 0));
  const totalKg = r4(lines.reduce((a, l) => a + n(l.kg_per_unit) * n(l.qty), 0));
  const basisSum = base.reduce((a, b) => a + b.basis, 0);

  // 2) ค่าส่งรวม: จากเรท หรือยอดจริงที่กรอกทับ
  const shipFromRate = method === "none" ? 0 : r2(basisSum * n(header.ship_rate));
  const manual = header.ship_manual_total;
  const shipTotal = method === "none" ? 0 : (manual != null && Number.isFinite(Number(manual)) ? r2(n(manual)) : shipFromRate);

  // 3) เฉลี่ยค่าส่งตามสัดส่วนปริมาณ — ไม่มีปริมาณเลย (basisSum=0) → เฉลี่ยตามจำนวนชิ้นแทน · เศษปัดลงบรรทัดสุดท้าย
  const qtySum = base.reduce((a, b) => a + b.qty, 0);
  const allocs = base.map((b) => {
    if (shipTotal <= 0) return 0;
    if (basisSum > 0) return r2(shipTotal * (b.basis / basisSum));
    if (qtySum > 0) return r2(shipTotal * (b.qty / qtySum));
    return 0;
  });
  if (shipTotal > 0 && allocs.length > 0) {
    const diff = r2(shipTotal - allocs.reduce((a, v) => a + v, 0));
    if (diff !== 0) {
      // ใส่เศษให้บรรทัดสุดท้ายที่ได้รับการเฉลี่ย (มี basis หรือ qty)
      let idx = allocs.length - 1;
      for (let i = allocs.length - 1; i >= 0; i--) { if (allocs[i] > 0 || base[i].qty > 0) { idx = i; break; } }
      allocs[idx] = r2(allocs[idx] + diff);
    }
  }

  const outLines: VoucherLineCalc[] = base.map((b, i) => ({
    unit_price_thb: b.unitThb,
    line_total_foreign: b.lineForeign,
    line_total_thb: b.lineThb,
    basis: b.basis,
    ship_alloc_thb: allocs[i],
    landed_unit_thb: b.qty > 0 ? r4(b.unitThb + allocs[i] / b.qty) : b.unitThb,
    has_price: b.hasPrice,
  }));

  const subtotalForeign = r2(base.reduce((a, b) => a + b.lineForeign, 0));
  const subtotalThb = r2(base.reduce((a, b) => a + b.lineThb, 0));
  const totals: VoucherTotals = {
    subtotal_foreign: subtotalForeign,
    subtotal_thb: subtotalThb,
    total_cbm: totalCbm,
    total_kg: totalKg,
    ship_from_rate_thb: shipFromRate,
    ship_total_thb: shipTotal,
    grand_total_thb: r2(subtotalThb + shipTotal),
    missing_price_count: base.filter((b) => !b.hasPrice).length,
    missing_basis_count: method === "none" ? 0 : base.filter((b) => b.basis <= 0).length,
  };
  return { lines: outLines, totals };
}

export const fmtMoney = (v: number | null | undefined, digits = 2) =>
  (Number.isFinite(Number(v)) ? Number(v) : 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const curSymbol = (cur: string | null | undefined) => (isCNY(cur) ? "¥" : isForeignCurrency(cur) ? String(cur).toUpperCase() + " " : "฿");
