// ============================================================
// ของกลาง — สูตร "ใบสำคัญรับ (ใบซื้อ)" : ราคาสินค้า ¥/฿ + ค่าส่ง (คิว หรือ น้ำหนัก) เฉลี่ยลงรายการ
//
//   ราคา/หน่วย (บาท)   = ราคา/หน่วย (สกุลใบ) × เรท           (THB = ตรง ๆ)
//   ค่าสินค้าบรรทัด     = ราคา/หน่วย (บาท) × จำนวน
//   คิว/ชิ้น           = ยาว × กว้าง × สูง (ซม.) ÷ 1,000,000     (ดู lib/supplier-quote.ts สูตรเดียวกัน)
//   วิธีคิดของบรรทัด    = ที่ระบุเอง (จากใบส่งของ: BOX=คิว, CLOTH BLOCK=น้ำหนัก) → ไม่ระบุ = ตามค่าเริ่มต้นของใบ
//   ค่าส่งบรรทัด (ตามเรท) = ปริมาณของบรรทัด × เรทของวิธีนั้น   (คิว × ฿/คิว หรือ กก. × ฿/กก.)
//   ค่าส่งรวม          = Σ ค่าส่งบรรทัด   หรือ "ยอดจริงจากบิลขนส่ง" ที่กรอกทับ (เฉลี่ยตามสัดส่วนค่าส่งตามเรท)
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
  ship_method?: ShipMethod | null; // วิธีคิดเฉพาะบรรทัด (null = ตามใบ)
  /** ★ 2026-11-14 ส่วนลดบรรทัด (ยอดเงิน สกุลของใบ) — ใช้เมื่อไม่มี discount_pct */
  discount?: number | null;
  /** ส่วนลดเป็น % ของ จำนวน × ราคา (มีค่า = คิดจาก % แทนยอดเงิน) */
  discount_pct?: number | null;
};

/**
 * ส่วนลดของบรรทัดเป็นยอดเงิน (สกุลของใบ) — % มีค่า = จำนวน × ราคา × % ÷ 100 · ไม่งั้นใช้ยอดเงิน
 * ไม่ติดลบ · ไม่เกินค่าสินค้าของบรรทัด
 */
export function lineDiscount(unit: number | null | undefined, qty: number | null | undefined, discount?: number | null, pct?: number | null): number {
  const gross = n(unit) * n(qty);
  const d = n(pct) > 0 ? gross * n(pct) / 100 : n(discount);
  return r2(Math.min(Math.max(0, d), Math.max(0, gross)));
}

export type VoucherHeaderInput = {
  currency: string;                // THB | RMB | ...
  fx_rate: number | null;          // บาท ต่อ 1 หน่วยสกุลต่างประเทศ (THB ไม่ใช้)
  ship_method: ShipMethod;         // วิธีคิดเริ่มต้น (บรรทัดที่ไม่ระบุเอง)
  ship_rate_cube?: number | null;  // ฿/คิว
  ship_rate_kg?: number | null;    // ฿/กก.
  /** @deprecated เรทเดิมตัวเดียว (ใช้กับ ship_method) — ยังรับไว้ให้ข้อมูลเก่า */
  ship_rate?: number | null;
  ship_manual_total?: number | null; // กรอกยอดค่าส่งจริงทับ (null = คิดจากเรท)
  /** ★ 2026-11-15 ค่าส่งจากร้าน/ค่าส่งในจีน (运费) สกุลของใบ — รวมยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้นตามมูลค่า */
  seller_ship_foreign?: number | null;
  /** ★ 2026-11-15 ค่าธรรมเนียมจ่ายเงิน (支付手续费) เป็นบาท — รวมยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้นตามมูลค่า */
  pay_fee_thb?: number | null;
};

export type VoucherLineCalc = {
  unit_price_thb: number;          // ราคา/หน่วย บาท (ไม่รวมค่าส่ง)
  line_total_foreign: number;      // ค่าสินค้าบรรทัด สกุลใบ (หักส่วนลดแล้ว)
  discount_foreign: number;        // ส่วนลดของบรรทัด (ยอดเงิน สกุลใบ)
  line_total_thb: number;          // ค่าสินค้าบรรทัด บาท
  method: ShipMethod;              // วิธีคิดที่ใช้จริงกับบรรทัดนี้
  basis: number;                   // ปริมาณที่คิด (คิวรวม หรือ กก.รวม ของบรรทัด ตาม method)
  ship_by_rate_thb: number;        // ค่าส่งตามเรทของบรรทัดนี้ (ก่อนเฉลี่ยยอดจริง)
  ship_alloc_thb: number;          // ค่าส่งที่ใช้จริงของบรรทัดนี้ (บาท)
  extra_alloc_thb: number;         // ส่วนแบ่งค่าส่งในจีน + ค่าธรรมเนียมจ่ายเงิน (บาท) ตามมูลค่าบรรทัด
  landed_unit_thb: number;         // ต้นทุนถึงมือ/ชิ้น = (ค่าสินค้า + ค่าส่ง + ส่วนแบ่งค่าส่งในจีน/ค่าธรรมเนียม) ÷ จำนวน
  has_price: boolean;
};

export type VoucherTotals = {
  subtotal_foreign: number;        // ค่าสินค้ารวม สกุลใบ (หักส่วนลดแล้ว)
  discount_foreign: number;        // ส่วนลดรวม สกุลใบ
  discount_thb: number;            // ส่วนลดรวม บาท
  subtotal_thb: number;            // ค่าสินค้ารวม บาท
  total_cbm: number;               // คิวรวมทุกบรรทัด (ที่มีข้อมูล)
  total_kg: number;                // กก.รวมทุกบรรทัด (ที่มีข้อมูล)
  charged_cbm: number;             // คิวที่ถูกคิดค่าส่งจริง (บรรทัดที่คิดตามคิว)
  charged_kg: number;              // กก.ที่ถูกคิดค่าส่งจริง (บรรทัดที่คิดตามน้ำหนัก)
  ship_from_rate_thb: number;      // ค่าส่งรวมตามเรท (ไว้เทียบกับยอดจริง)
  ship_total_thb: number;          // ค่าส่งที่ใช้จริง (manual ถ้ากรอก)
  seller_ship_foreign: number;     // ค่าส่งในจีน สกุลใบ
  seller_ship_thb: number;         // ค่าส่งในจีน บาท
  pay_fee_thb: number;             // ค่าธรรมเนียมจ่ายเงิน บาท
  shop_total_thb: number;          // ยอดจ่ายร้าน = ค่าสินค้า + ค่าส่งในจีน + ค่าธรรมเนียม (เทียบกับยอดจ่ายจริงในบิล)
  grand_total_thb: number;         // ยอดจ่ายร้าน + ค่าส่งขนส่ง (โชว์แยกบรรทัดบนใบ)
  missing_price_count: number;     // บรรทัดที่ยังไม่มีราคา
  missing_basis_count: number;     // บรรทัดที่ต้องคิดค่าส่งแต่ไม่มีคิว/กก.
  missing_rate_count: number;      // บรรทัดที่มีปริมาณแต่ไม่มีเรทของวิธีนั้น
};

/** เรทที่ใช้แปลงเป็นบาท — THB = 1 · สกุลอื่นไม่มีเรท = 0 (ราคาบาทจะเป็น 0 ให้เห็นว่ายังไม่ครบ) */
export function effectiveFx(currency: string, fxRate: number | null | undefined): number {
  if (!isForeignCurrency(currency)) return 1;
  return n(fxRate) > 0 ? n(fxRate) : 0;
}

/** เรทของแต่ละวิธี — รองรับข้อมูลเก่าที่มี ship_rate ตัวเดียว */
export function shipRates(header: VoucherHeaderInput): { cube: number; weight: number } {
  const legacy = n(header.ship_rate);
  const cube = header.ship_rate_cube != null ? n(header.ship_rate_cube) : header.ship_method === "cube" ? legacy : 0;
  const weight = header.ship_rate_kg != null ? n(header.ship_rate_kg) : header.ship_method === "weight" ? legacy : 0;
  return { cube, weight };
}

export function computeVoucher(header: VoucherHeaderInput, lines: VoucherLineInput[]): { lines: VoucherLineCalc[]; totals: VoucherTotals } {
  const fx = effectiveFx(header.currency, header.fx_rate);
  const rates = shipRates(header);

  // 1) ค่าสินค้า + วิธีคิด + ปริมาณ + ค่าส่งตามเรท ต่อบรรทัด
  const base = lines.map((l) => {
    const qty = n(l.qty);
    const hasPrice = l.unit_price != null && n(l.unit_price) > 0;
    const unit = hasPrice ? n(l.unit_price) : 0;
    const unitThb = r4(unit * fx);
    const method: ShipMethod = l.ship_method && l.ship_method !== "none" ? l.ship_method : header.ship_method;
    const perUnit = method === "cube" ? n(l.cbm_per_unit) : method === "weight" ? n(l.kg_per_unit) : 0;
    const basis = r4(perUnit * qty);
    const rate = method === "cube" ? rates.cube : method === "weight" ? rates.weight : 0;
    const disc = hasPrice ? lineDiscount(unit, qty, l.discount, l.discount_pct) : 0;
    return { qty, hasPrice, unit, unitThb, disc, lineForeign: r2(unit * qty - disc), lineThb: r2(unitThb * qty - disc * fx), method, basis, rate, cost: r2(basis * rate) };
  });

  const totalCbm = r4(lines.reduce((a, l) => a + n(l.cbm_per_unit) * n(l.qty), 0));
  const totalKg = r4(lines.reduce((a, l) => a + n(l.kg_per_unit) * n(l.qty), 0));
  const chargedCbm = r4(base.filter((b) => b.method === "cube").reduce((a, b) => a + b.basis, 0));
  const chargedKg = r4(base.filter((b) => b.method === "weight").reduce((a, b) => a + b.basis, 0));
  const costSum = r2(base.reduce((a, b) => a + b.cost, 0));

  // 2) ค่าส่งรวม: ตามเรท หรือยอดจริงที่กรอกทับ
  const anyShip = base.some((b) => b.method !== "none");
  const manual = header.ship_manual_total;
  const hasManual = manual != null && Number.isFinite(Number(manual));
  const shipFromRate = anyShip ? costSum : 0;
  // ★ 2026-11-15 เจ้าของ: "อยากใส่ค่าส่งเองได้" — พิมพ์ยอดค่าส่งเอง = นับเสมอ แม้ใบตั้ง "ไม่คิดค่าส่ง" (เดิมไม่คิดค่าส่ง → ยอดที่พิมพ์หาย)
  const shipTotal = anyShip ? (hasManual ? r2(n(manual)) : shipFromRate) : (hasManual && n(manual) > 0 ? r2(n(manual)) : 0);

  // 3) เฉลี่ยยอดจริงตามสัดส่วน "ค่าส่งตามเรท" (เทียบคิวกับกก.ตรง ๆ ไม่ได้ จึงเทียบด้วยเงิน)
  //    ไม่มีเรท/ปริมาณเลย → เฉลี่ยตามจำนวนชิ้นของบรรทัดที่ต้องคิดค่าส่ง · เศษปัดลงบรรทัดสุดท้าย
  //    ใบตั้ง "ไม่คิดค่าส่ง" แต่พิมพ์ยอดเอง → ทุกบรรทัดรับค่าส่งตามจำนวนชิ้น
  const takesShip = (b: { method: ShipMethod; qty: number }) => (anyShip ? b.method !== "none" : b.qty > 0);
  const shipQtySum = base.filter(takesShip).reduce((a, b) => a + b.qty, 0);
  const allocs = base.map((b) => {
    if (shipTotal <= 0 || !takesShip(b)) return 0;
    if (!hasManual) return b.cost;
    if (costSum > 0) return r2(shipTotal * (b.cost / costSum));
    if (shipQtySum > 0) return r2(shipTotal * (b.qty / shipQtySum));
    return 0;
  });
  if (shipTotal > 0 && allocs.length > 0) {
    const diff = r2(shipTotal - allocs.reduce((a, v) => a + v, 0));
    if (diff !== 0) {
      let idx = -1;
      for (let i = allocs.length - 1; i >= 0; i--) { if (allocs[i] > 0 || (takesShip(base[i]) && base[i].qty > 0)) { idx = i; break; } }
      if (idx >= 0) allocs[idx] = r2(allocs[idx] + diff);
    }
  }

  // 4) ★ 2026-11-15 ค่าส่งในจีน + ค่าธรรมเนียมจ่ายเงิน → เฉลี่ยลงบรรทัดตามค่าสินค้า (บาท) · เศษปัดลงบรรทัดสุดท้ายที่มีค่าสินค้า
  const sellerShipForeign = r2(n(header.seller_ship_foreign));
  const sellerShipThb = r2(sellerShipForeign * fx);
  const payFeeThb = r2(n(header.pay_fee_thb));
  const extrasThb = r2(sellerShipThb + payFeeThb);
  const valueSum = base.reduce((a, b) => a + Math.max(0, b.lineThb), 0);
  const extras = base.map((b) => (extrasThb > 0 && valueSum > 0 && b.lineThb > 0 ? r2(extrasThb * (b.lineThb / valueSum)) : 0));
  if (extrasThb > 0 && valueSum > 0) {
    const diff = r2(extrasThb - extras.reduce((a, v) => a + v, 0));
    if (diff !== 0) { for (let i = extras.length - 1; i >= 0; i--) { if (base[i].lineThb > 0) { extras[i] = r2(extras[i] + diff); break; } } }
  }

  const outLines: VoucherLineCalc[] = base.map((b, i) => ({
    unit_price_thb: b.unitThb,
    line_total_foreign: b.lineForeign,
    discount_foreign: b.disc,
    line_total_thb: b.lineThb,
    method: b.method,
    basis: b.basis,
    ship_by_rate_thb: b.cost,
    ship_alloc_thb: allocs[i],
    extra_alloc_thb: extras[i],
    landed_unit_thb: b.qty > 0 ? (b.disc > 0 ? r4((b.lineThb + allocs[i] + extras[i]) / b.qty) : r4(b.unitThb + (allocs[i] + extras[i]) / b.qty)) : b.unitThb,
    has_price: b.hasPrice,
  }));

  const subtotalForeign = r2(base.reduce((a, b) => a + b.lineForeign, 0));
  const subtotalThb = r2(base.reduce((a, b) => a + b.lineThb, 0));
  const totals: VoucherTotals = {
    subtotal_foreign: subtotalForeign,
    subtotal_thb: subtotalThb,
    discount_foreign: r2(base.reduce((a, b) => a + b.disc, 0)),
    discount_thb: r2(base.reduce((a, b) => a + b.disc * fx, 0)),
    total_cbm: totalCbm,
    total_kg: totalKg,
    charged_cbm: chargedCbm,
    charged_kg: chargedKg,
    ship_from_rate_thb: shipFromRate,
    ship_total_thb: shipTotal,
    seller_ship_foreign: sellerShipForeign,
    seller_ship_thb: sellerShipThb,
    pay_fee_thb: payFeeThb,
    shop_total_thb: r2(subtotalThb + extrasThb),
    grand_total_thb: r2(subtotalThb + extrasThb + shipTotal),
    missing_price_count: base.filter((b) => !b.hasPrice).length,
    missing_basis_count: base.filter((b) => b.method !== "none" && b.basis <= 0).length,
    missing_rate_count: base.filter((b) => b.method !== "none" && b.basis > 0 && b.rate <= 0).length,
  };
  return { lines: outLines, totals };
}

export const fmtMoney = (v: number | null | undefined, digits = 2) =>
  (Number.isFinite(Number(v)) ? Number(v) : 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const curSymbol = (cur: string | null | undefined) => (isCNY(cur) ? "¥" : isForeignCurrency(cur) ? String(cur).toUpperCase() + " " : "฿");
export const SHIP_METHOD_LABEL: Record<ShipMethod, string> = { none: "ไม่คิดค่าส่ง", cube: "ตามคิว (M3)", weight: "ตามน้ำหนัก (kg)" };

/**
 * ★ 2026-11-14 เจ้าของ: "บางทีไม่รู้เรท แต่รู้ยอดบาท — อยากแก้ราคาบาท แล้วให้คำนวณเรทให้ใหม่เอง"
 * หาเรท (บาทต่อ 1 หน่วยสกุลใบ) ที่ทำให้ "ค่าสินค้า ฿" รวม = ยอดบาทที่พิมพ์ — คิดด้วยสูตรกลาง computeVoucher (ปัดราคาบาทต่อหน่วยเหมือนกัน)
 * เริ่มจาก บาท ÷ ยอดสกุลใบ แล้วค้นหาละเอียด (6 ตำแหน่ง) ให้ตรงทุกสตางค์ · ไม่มียอดสกุลใบ / ยอดบาท ≤ 0 = null
 */
export function fxForTargetThb(header: VoucherHeaderInput, lines: VoucherLineInput[], targetThb: number, of: "goods" | "shop" = "goods"): number | null {
  // of = "goods" → ค่าสินค้า ฿ · "shop" → ยอดจ่ายร้าน (ค่าสินค้า + ค่าส่งในจีน + ค่าธรรมเนียม) = ยอดจ่ายจริงในบิล (★ 2026-11-15)
  const fee = of === "shop" ? r2(n(header.pay_fee_thb)) : 0;
  const target = r2(n(targetThb) - fee);
  const t1 = computeVoucher({ ...header, fx_rate: 1 }, lines).totals;
  const foreign = of === "shop" ? r2(t1.subtotal_foreign + t1.seller_ship_foreign) : t1.subtotal_foreign;
  if (!(target > 0) || !(foreign > 0)) return null;
  const thbAt = (fx: number) => { const t = computeVoucher({ ...header, fx_rate: fx }, lines).totals; return of === "shop" ? r2(t.shop_total_thb - t.pay_fee_thb) : t.subtotal_thb; };
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  let best = r6(target / foreign);
  let bestDiff = Math.abs(thbAt(best) - target);
  if (bestDiff < 0.005) return best;
  // ค่าสินค้าบาทเพิ่มขึ้นตามเรท (ไม่ลด) → ค้นแบบแบ่งครึ่งรอบ ๆ ค่าเริ่มต้น
  let lo = best * 0.98, hi = best * 1.02;
  for (let i = 0; i < 60; i++) {
    const mid = r6((lo + hi) / 2);
    const v = thbAt(mid);
    const d = Math.abs(v - target);
    if (d < bestDiff) { best = mid; bestDiff = d; }
    if (d < 0.005) break;
    if (v < target) lo = mid; else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return best;
}
