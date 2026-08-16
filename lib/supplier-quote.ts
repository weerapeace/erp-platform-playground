// ============================================================
// ของกลาง — สูตร "ตีราคาสินค้าสั่งจากร้าน" (Supplier quote)
//   ต้นทุนถึงมือ = ราคาสินค้า(บาท) + ค่าส่งเฉลี่ยต่อชิ้น (ปริมาตรกล่อง × เรตขนส่ง)
//   ใช้ทั้งหน้าจอตีราคา · สรุปยอด · (อนาคต) ใบพิมพ์ภายใน — แก้สูตรที่นี่ที่เดียว
// ============================================================

export type ShipMode = "truck" | "ship";
export type PriceUnit = "pcs" | "pack";
export type SplitType = "pct" | "amt";
/** คนที่แบ่งกำไร — % ของกำไร หรือจำนวนเงินคงที่ */
export type ProfitSplit = { name: string; type: SplitType; value: number; on?: boolean };

export type SupplierLine = {
  id?: string;
  key?: string;                  // key ฝั่งหน้าจอ (ยังไม่บันทึก)
  parent_code?: string | null;
  item_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  source_url?: string | null;
  price: number | null;          // ราคาจากร้าน (ตาม currency + price_unit)
  currency: string;              // CNY | THB
  fx_rate: number | null;        // เรตที่ใช้จริง (null = ใช้เรตกลาง)
  price_unit: PriceUnit;
  pack_qty: number | null;       // ชิ้นต่อแพ็ค (เมื่อ price_unit = pack)
  qty: number | null;            // จำนวนที่สั่ง (ชิ้น)
  offer_price: number | null;    // ราคาที่จะเสนอ (ต่อชิ้น)
  box_w_cm: number | null; box_l_cm: number | null; box_h_cm: number | null;
  ship_mode: ShipMode;
  ship_rate: number | null;      // บาท/คิว (null = เรตกลางตามโหมด)
  freight_total?: number | null; // snapshot (คำนวณใหม่ทุกครั้งที่เปิด)
  note?: string | null;
  split_json?: ProfitSplit[];    // แบ่งกำไรเฉพาะบรรทัดนี้
  sort_order?: number;
};

export type FreightRates = { truck: number; ship: number };
export const DEFAULT_FREIGHT: FreightRates = { truck: 7000, ship: 3500 };
export const DEFAULT_FX = 5.2;
/** 1 คิว (ลูกบาศก์เมตร) = 1,000,000 ลูกบาศก์เซนติเมตร */
export const CM3_PER_CBM = 1_000_000;

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type LineCalc = {
  pricePerPcSrc: number;   // ราคาต่อชิ้นในสกุลต้นทาง (หารแพ็คแล้ว)
  priceBaht: number;       // ราคาต่อชิ้นเป็นบาท
  cubeCm3: number;         // ปริมาตรกล่อง 1 ชิ้น (ซม.³)
  cbmPerPc: number;        // คิวต่อชิ้น
  cbmTotal: number;        // คิวตามจำนวนที่สั่ง
  rate: number;            // เรตขนส่งที่ใช้ (บาท/คิว)
  freightTotal: number;    // ค่าส่งทั้งรายการ
  freightPerPc: number;    // ค่าส่งเฉลี่ยต่อชิ้น
  costPerPc: number;       // ราคา + ค่าส่ง (ต้นทุนถึงมือต่อชิ้น)
  costTotal: number;       // ต้นทุนถึงมือรวม
  saleTotal: number;       // รวมทั้งหมด = จำนวน × ราคาที่เสนอ
  profitPerPc: number;     // กำไรต่อชิ้น
  profitTotal: number;     // รวมกำไร
  splitTotal: number;      // แบ่งออกไปเฉพาะบรรทัดนี้
  profitNet: number;       // กำไรหลังแบ่งของบรรทัดนี้
};

/** คำนวณ 1 บรรทัด (fx/rates = ค่ากลาง ใช้เมื่อบรรทัดไม่ได้ตั้งเอง) */
export function calcSupplierLine(l: SupplierLine, fx: number = DEFAULT_FX, rates: FreightRates = DEFAULT_FREIGHT): LineCalc {
  const qty = Math.max(0, n(l.qty));
  const packQty = l.price_unit === "pack" ? Math.max(1, n(l.pack_qty) || 1) : 1;
  const pricePerPcSrc = n(l.price) / packQty;
  const useFx = l.currency === "CNY" ? (n(l.fx_rate) > 0 ? n(l.fx_rate) : fx) : 1;
  const priceBaht = pricePerPcSrc * useFx;

  const cubeCm3 = n(l.box_w_cm) * n(l.box_l_cm) * n(l.box_h_cm);
  const cbmPerPc = cubeCm3 / CM3_PER_CBM;
  const cbmTotal = cbmPerPc * qty;
  const rate = n(l.ship_rate) > 0 ? n(l.ship_rate) : (l.ship_mode === "truck" ? rates.truck : rates.ship);
  const freightTotal = cbmTotal * rate;
  const freightPerPc = qty > 0 ? freightTotal / qty : 0;

  const costPerPc = priceBaht + freightPerPc;
  const offer = n(l.offer_price);
  const profitPerPc = offer - costPerPc;
  const profitTotal = profitPerPc * qty;
  const splitTotal = splitAmount(l.split_json ?? [], profitTotal);

  return {
    pricePerPcSrc, priceBaht, cubeCm3, cbmPerPc, cbmTotal, rate,
    freightTotal, freightPerPc, costPerPc, costTotal: costPerPc * qty,
    saleTotal: offer * qty, profitPerPc, profitTotal,
    splitTotal, profitNet: profitTotal - splitTotal,
  };
}

/** ยอดแบ่งรวม จากรายการคนที่ติ๊กไว้ (% คิดจากกำไรฐานที่ส่งมา) */
export function splitAmount(splits: ProfitSplit[], profitBase: number): number {
  return (splits ?? []).filter((s) => s?.on !== false)
    .reduce((sum, s) => sum + (s.type === "pct" ? profitBase * n(s.value) / 100 : n(s.value)), 0);
}

export type SupplierTotals = {
  lines: number; qty: number; cbm: number;
  freight: number; cost: number; sale: number;
  profit: number;            // กำไรรวมก่อนแบ่ง
  splitLine: number;         // แบ่งรายบรรทัดรวม
  profitAfterLine: number;   // กำไรหลังหักแบ่งรายบรรทัด (ฐานของการแบ่งทั้งใบ)
};

/** รวมทั้งชุด (ของแท็บ Parent ที่กำลังดู) */
export function sumSupplierLines(lines: SupplierLine[], fx: number, rates: FreightRates): SupplierTotals {
  const t: SupplierTotals = { lines: lines.length, qty: 0, cbm: 0, freight: 0, cost: 0, sale: 0, profit: 0, splitLine: 0, profitAfterLine: 0 };
  for (const l of lines) {
    const c = calcSupplierLine(l, fx, rates);
    t.qty += Math.max(0, n(l.qty));
    t.cbm += c.cbmTotal; t.freight += c.freightTotal;
    t.cost += c.costTotal; t.sale += c.saleTotal;
    t.profit += c.profitTotal; t.splitLine += c.splitTotal;
  }
  t.profitAfterLine = t.profit - t.splitLine;
  return t;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
export const fmtBaht = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (v: number, d = 0) => (Number.isFinite(v) ? v : 0).toLocaleString("th-TH", { maximumFractionDigits: d });

/** บรรทัดว่าง 1 บรรทัด (ค่าเริ่มต้นตามที่ใช้จริง: ซื้อจีน = หยวน + ส่งเรือ) */
export function emptySupplierLine(parentCode: string | null, sortOrder = 0): SupplierLine {
  return {
    key: `n${Date.now()}_${Math.round(Math.random() * 1e6)}`,
    parent_code: parentCode, item_name: null, supplier_id: null, supplier_name: null, source_url: null,
    price: null, currency: "CNY", fx_rate: null, price_unit: "pcs", pack_qty: null,
    qty: null, offer_price: null,
    box_w_cm: null, box_l_cm: null, box_h_cm: null,
    ship_mode: "ship", ship_rate: null, note: null, split_json: [], sort_order: sortOrder,
  };
}
