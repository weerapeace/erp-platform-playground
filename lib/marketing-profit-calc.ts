/**
 * สูตรแท็บ "ค่าธรรมเนียม" + "กำไร" ของหน้าภาพรวมการตลาด (/marketing/dashboard) — pure + เทสต์ lib/__tests__/marketing-profit-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 2 · แบบ A 2 แท็บแยก + ข้อเสนอ 1 ดึงค่าธรรมเนียมย้อนหลัง · 2 ขายดีแต่ไม่มีต้นทุน · 4 เตือนค่าธรรมเนียมพุ่ง)
 * ค่าธรรมเนียมจริงต่อออเดอร์ = บรรทัดรายได้ที่ดึงจากร้าน (raw.shopee_income / raw.lazada_income · lib/shopee shopeeIncomeOf · lib/lazada-orders lazIncomeOf)
 *   → ไฟล์นี้แค่จัดหมวด + รวม · ไม่ดึงข้อมูลเอง
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export type FeeCat = "commission" | "service" | "transaction" | "shipping" | "ads" | "other";
export const FEE_CATS: { key: FeeCat; label: string }[] = [
  { key: "commission", label: "ค่าคอมมิชชั่น" },
  { key: "service", label: "ค่าบริการ/โปรแกรม" },
  { key: "transaction", label: "ค่าธุรกรรมชำระเงิน" },
  { key: "shipping", label: "ค่าส่งที่ร้านออก" },
  { key: "ads", label: "ค่าโฆษณา/แอฟฟิลิเอต" },
  { key: "other", label: "อื่น ๆ (ค่าปรับ ฯลฯ)" },
];

export type IncomeLine = { key: string; label?: string; amount: number };
export type OrderIncome = { escrow: number | null; lines: IncomeLine[]; rows?: number };

/**
 * บรรทัดรายได้ → หมวดค่าธรรมเนียม (null = ไม่ใช่ค่าธรรมเนียมแพลตฟอร์ม เช่น ราคาสินค้า · ส่วนลดของร้านเอง · คืนเงิน)
 * ค่าส่ง: รวมทั้ง "ค่าส่งที่ผู้ซื้อจ่าย" (+) และ "ค่าส่งที่ถูกหัก" (−) → ได้ค่าส่งสุทธิที่ร้านออกจริง
 */
export function feeCatOf(platform: string, key: string): FeeCat | null {
  if (platform === "shopee") {
    switch (key) {
      case "commission": return "commission";
      case "service": return "service";
      case "transaction": return "transaction";
      case "shipping": case "buyer_shipping": return "shipping";
      case "ams": return "ads";
      default: return null;
    }
  }
  if (platform === "lazada") {
    const k = key.toLowerCase();
    if (/^item price|subsidy|refund|reversal item price|voucher|promotional charge|lazcoin/.test(k)) return null;
    if (/commission/.test(k)) return "commission";
    if (/^payment fee/.test(k)) return "transaction";
    if (/shipping fee/.test(k) && !/free shipping/.test(k)) return "shipping";
    if (/free shipping|handling fee|fulfil|service/.test(k)) return "service";
    if (/sponsored|affiliate/.test(k)) return "ads";
    return "other";
  }
  return null;
}

const emptyCats = (): Record<FeeCat, number> => ({ commission: 0, service: 0, transaction: 0, shipping: 0, ads: 0, other: 0 });

/** ค่าธรรมเนียมของ 1 ออเดอร์ (บาท · บวก = ร้านเสีย) · หมวดที่รวมแล้วได้เงินคืน (เช่น ค่าส่งผู้ซื้อจ่ายเกิน) = 0 */
export function orderFees(platform: string, inc: OrderIncome): { byCat: Record<FeeCat, number>; total: number } {
  const raw = emptyCats();
  for (const l of inc.lines ?? []) {
    const c = feeCatOf(platform, l.key);
    if (c) raw[c] += Number(l.amount) || 0;
  }
  const byCat = emptyCats();
  let total = 0;
  for (const k of Object.keys(raw) as FeeCat[]) { const fee = Math.max(0, -raw[k]); byCat[k] = Math.round(fee * 100) / 100; total += byCat[k]; }
  return { byCat, total: Math.round(total * 100) / 100 };
}

/** ใช้ค่าธรรมเนียมของออเดอร์นี้ได้ไหม — Lazada ที่ยังไม่ตัดรอบ (ไม่มีรายการ) = ยังไม่รู้ */
export const incomeKnown = (inc: OrderIncome | null | undefined): inc is OrderIncome =>
  !!inc && Array.isArray(inc.lines) && (inc.rows == null || inc.rows > 0) && inc.lines.length > 0;

export type FeeOrderRow = { platform: string; value: number; income: OrderIncome | null | undefined };
export type FeePlatformSummary = {
  platform: string; orders: number; covered: number; sales: number; salesCovered: number;
  fee: number; byCat: Record<FeeCat, number>; net: number; pct: number | null; estFeeAll: number | null;
};

/**
 * สรุปค่าธรรมเนียมแยกช่องทาง — pct = ค่าธรรมเนียม ÷ ยอดของออเดอร์ที่รู้ค่าธรรมเนียมแล้ว
 * estFeeAll = ประมาณค่าธรรมเนียมของทุกออเดอร์ในช่วง (ยอดทั้งหมด × pct) · ใบที่รู้แล้วน้อยกว่า minCovered (20) = null (ตัวอย่างน้อย % เพี้ยน)
 */
export function feeSummary(rows: readonly FeeOrderRow[], opts: { minCovered?: number } = {}): FeePlatformSummary[] {
  const minCovered = opts.minCovered ?? 20;
  const m = new Map<string, FeePlatformSummary>();
  for (const r of rows) {
    const g = m.get(r.platform) ?? { platform: r.platform, orders: 0, covered: 0, sales: 0, salesCovered: 0, fee: 0, byCat: emptyCats(), net: 0, pct: null, estFeeAll: null };
    g.orders += 1; g.sales += r.value;
    if (incomeKnown(r.income)) {
      const f = orderFees(r.platform, r.income);
      g.covered += 1; g.salesCovered += r.value; g.fee += f.total; g.net += Number(r.income.escrow) || 0;
      for (const k of Object.keys(f.byCat) as FeeCat[]) g.byCat[k] += f.byCat[k];
    }
    m.set(r.platform, g);
  }
  return [...m.values()].map((g) => {
    const pct = g.salesCovered > 0 ? g.fee / g.salesCovered : null;
    return { ...g, pct, estFeeAll: pct == null || g.covered < minCovered ? null : Math.round(g.sales * pct) };
  }).sort((a, b) => b.sales - a.sales);
}

/** ช่องทางที่ค่าธรรมเนียมเกินเกณฑ์ (เฉพาะที่มีออเดอร์รู้ค่าธรรมเนียมพอ) — ใช้เตือนทุกเช้า */
export function feeSpikes(rows: readonly FeePlatformSummary[], opts: { maxPct?: number; minOrders?: number } = {}): { platform: string; pct: number; fee: number }[] {
  const maxPct = opts.maxPct ?? 0.15, minOrders = opts.minOrders ?? 20;
  return rows.filter((r) => r.covered >= minOrders && r.pct != null && r.pct > maxPct).map((r) => ({ platform: r.platform, pct: r.pct as number, fee: r.fee }));
}

export type ProfitInput = { key: string; parentId: string | null; parentName: string; code: string; name: string; sales: number; qty: number; fee: number; unitCost: number | null };
export type ProfitRow = ProfitInput & { cost: number | null; profit: number | null; margin: number | null };

/** กำไรต่อสินค้า = ยอด − ต้นทุน (จำนวน × ต้นทุนต่อชิ้น) − ค่าธรรมเนียมที่ปันส่วนแล้ว · ไม่มีต้นทุน = ไม่คิด (ไม่เดา) */
export function profitRows(rows: readonly ProfitInput[]): { rows: ProfitRow[]; sales: number; salesWithCost: number; coverage: number; profit: number; cost: number; fee: number; margin: number | null } {
  let sales = 0, salesWithCost = 0, profit = 0, cost = 0, fee = 0;
  const out = rows.map((r) => {
    sales += r.sales;
    if (r.unitCost == null || !(r.unitCost > 0)) return { ...r, cost: null, profit: null, margin: null };
    const c = r.qty * r.unitCost, p = r.sales - c - r.fee;
    salesWithCost += r.sales; profit += p; cost += c; fee += r.fee;
    return { ...r, cost: c, profit: p, margin: r.sales > 0 ? p / r.sales : null };
  });
  return { rows: out, sales, salesWithCost, coverage: sales > 0 ? salesWithCost / sales : 0, profit, cost, fee, margin: salesWithCost > 0 ? profit / salesWithCost : null };
}

/** ขายดีแต่ยังไม่มีต้นทุน — รวมตามรุ่น (parent) เรียงตามยอด */
export function missingCostByParent(rows: readonly ProfitRow[], limit = 30): { parentId: string | null; parentName: string; sales: number; qty: number; skus: number; codes: string[] }[] {
  const m = new Map<string, { parentId: string | null; parentName: string; sales: number; qty: number; skus: number; codes: string[] }>();
  for (const r of rows) {
    if (r.cost != null) continue;
    const k = r.parentId ?? `sku:${r.key}`;
    const g = m.get(k) ?? { parentId: r.parentId, parentName: r.parentName || r.name, sales: 0, qty: 0, skus: 0, codes: [] };
    g.sales += r.sales; g.qty += r.qty; g.skus += 1; if (g.codes.length < 5 && r.code) g.codes.push(r.code);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.sales - a.sales).slice(0, limit);
}
