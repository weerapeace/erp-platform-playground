import { describe, expect, it } from "vitest";
import {
  brandMarkupSummary, budgetCheck, costShareOfPrice, markupPctOf, markupTable, marginPctOf, median, multiplierOf, priceFromCost, roundQuotePrice, withVat, exVat,
  type BrandQuoteRef,
} from "@/lib/quote-pricing";

describe("multiplierOf", () => {
  it("บวกจากต้นทุน 100% = ×2 · กำไรจากราคาขาย 50% = ×2 · margin ≥100% / ติดลบ = ใช้ไม่ได้", () => {
    expect(multiplierOf("markup", 100)).toBe(2);
    expect(multiplierOf("markup", 25)).toBe(1.25);
    expect(multiplierOf("margin", 50)).toBe(2);
    expect(multiplierOf("margin", 100)).toBeNull();
    expect(multiplierOf("markup", -5)).toBeNull();
  });
});

describe("roundQuotePrice", () => {
  it("ปัดขึ้นเสมอ ไม่ทำให้กำไรต่ำกว่าที่เลือก", () => {
    expect(roundQuotePrice(141.3, "end9")).toBe(149);
    expect(roundQuotePrice(149, "end9")).toBe(149);
    expect(roundQuotePrice(150, "end9")).toBe(159);
    expect(roundQuotePrice(141.3, "ceil5")).toBe(145);
    expect(roundQuotePrice(140, "ceil5")).toBe(140);
    expect(roundQuotePrice(141.3, "ceil10")).toBe(150);
    expect(roundQuotePrice(82.97 * 1.1, "none")).toBe(91.27);
  });
});

describe("markupTable", () => {
  it("ต้นทุน 100: บวก 25/50/75/100/150/200% = 125/150/175/200/250/300", () => {
    const rows = markupTable(100, "markup");
    expect(rows.map((r) => r.price)).toEqual([125, 150, 175, 200, 250, 300]);
    expect(rows[3]).toMatchObject({ pct: 100, profit: 100, markupPct: 100, marginPct: 50 });
  });
  it("โหมดกำไรจากราคาขาย: 150% / 200% ใช้ไม่ได้ ไม่โชว์ · ต้นทุนยังไม่มี = ตารางว่าง", () => {
    const rows = markupTable(100, "margin");
    expect(rows.map((r) => r.pct)).toEqual([25, 50, 75]);
    expect(rows[1].price).toBe(200);
    expect(markupTable(0, "markup")).toEqual([]);
  });
});

describe("priceFromCost / % / VAT", () => {
  it("คิดราคาจากต้นทุนแต่ละช่อง + แปลงกลับเป็น %", () => {
    expect(priceFromCost(82.97, 2, "end9")).toBe(169);
    expect(priceFromCost(0, 2)).toBeNull();
    expect(markupPctOf(100, 150)).toBe(50);
    expect(marginPctOf(100, 200)).toBe(50);
    expect(withVat(100)).toBe(107);
    expect(exVat(107)).toBe(100);
    expect(costShareOfPrice(100, 400)).toBe(25);
  });
  it("ย้อนจากงบลูกค้า 180 (รวม VAT) ตัวคูณ ×2", () => {
    const b = budgetCheck(180, 100, 2, true)!;
    expect(b.budgetExVat).toBe(168.22);
    expect(b.maxCost).toBe(84.11);
    expect(b.profit).toBe(68.22);
    expect(budgetCheck(0, 100, 2)).toBeNull();
  });
});

describe("brandMarkupSummary", () => {
  const R = (cost: number, offered: number, status: string): BrandQuoteRef => ({ sheet_id: "s", sheet_code: null, sheet_name: null, parent_code: null, qty: null, cost, offered, status, quote_date: null });
  it("แนะนำจากรอบที่ผ่าน (กลาง ๆ) · ยังไม่มีรอบผ่าน = ใช้ทุกรอบ · ไม่มีข้อมูล = null", () => {
    const s = brandMarkupSummary([R(100, 150, "passed"), R(100, 200, "passed"), R(100, 300, "passed"), R(100, 400, "pending")]);
    expect(s.suggestPct).toBe(100);
    expect(s.basis).toBe("passed");
    expect(s.byStatus.pending).toEqual({ n: 1, median: 300 });
    expect(brandMarkupSummary([R(100, 150, "pending"), R(100, 250, "failed")])).toMatchObject({ suggestPct: 100, basis: "all" });
    expect(brandMarkupSummary([])).toMatchObject({ suggestPct: null, basis: null });
    expect(median([3, 1, 2, 4])).toBe(2.5);
  });
});

describe("ปัดราคาเลขสวย (0/5/9)", () => {
  it("ปัดขึ้นเป็นเลขลงท้าย 0 / 5 / 9 · ตรงอยู่แล้วไม่เปลี่ยน", async () => {
    const { roundQuotePrice, priceFromCost } = await import("@/lib/quote-pricing");
    expect(roundQuotePrice(56.34, "nice")).toBe(59);
    expect(roundQuotePrice(61, "nice")).toBe(65);
    expect(roundQuotePrice(70, "nice")).toBe(70);
    expect(roundQuotePrice(65.01, "nice")).toBe(69);
    expect(roundQuotePrice(99.2, "nice")).toBe(100);
    expect(priceFromCost(37.56, 1.5, "nice")).toBe(59);
  });
});

describe("ลดราคาตามจำนวน", () => {
  it("discountFor ใช้ขั้นที่ไม่เกินจำนวน · niceNear ปัดเลขสวยที่ใกล้สุด", async () => {
    const { discountFor, niceNear, DEFAULT_QTY_DISC } = await import("@/lib/quote-pricing");
    expect(discountFor(50, DEFAULT_QTY_DISC)).toBe(0);
    expect(discountFor(300, DEFAULT_QTY_DISC)).toBe(5);
    expect(discountFor(450, DEFAULT_QTY_DISC)).toBe(5);
    expect(discountFor(5000, DEFAULT_QTY_DISC)).toBe(15);
    expect(niceNear(65.55)).toBe(65);
    expect(niceNear(62.1)).toBe(60);
    expect(niceNear(58.65)).toBe(59);
    expect(niceNear(67)).toBe(65);
    expect(niceNear(67.5)).toBe(69);
  });
  it("tierPrice: ขั้นแรกบวกกำไรปกติ · ขั้นถัดไปลด % จากราคาตั้งต้นแล้วปัดสวย", async () => {
    const { tierPrice, DEFAULT_QTY_DISC } = await import("@/lib/quote-pricing");
    const cost = () => 37.56;
    expect(tierPrice(cost, 100, 1.75, "nice", DEFAULT_QTY_DISC)).toBe(69);    // 65.73 → 69
    expect(tierPrice(cost, 300, 1.75, "nice", DEFAULT_QTY_DISC)).toBe(65);    // 69 × 0.95 = 65.55 → 65
    expect(tierPrice(cost, 500, 1.75, "nice", DEFAULT_QTY_DISC)).toBe(60);    // 62.1 → 60
    expect(tierPrice(cost, 1000, 1.75, "nice", DEFAULT_QTY_DISC)).toBe(59);   // 58.65 → 59
    expect(tierPrice(cost, 300, 1.75, "none", DEFAULT_QTY_DISC)).toBe(62.44); // 65.73 × 0.95 = 62.4435
    expect(tierPrice(cost, 300, 1.75, "nice", [])).toBe(69);                  // ไม่มีขั้นลด = เหมือนเดิม
    expect(tierPrice(() => 0, 300, 1.75, "nice", DEFAULT_QTY_DISC)).toBeNull();
  });
});

describe("quoteQtyMode", () => {
  it("ดูแบบจากขั้นจำนวน", async () => {
    const { quoteQtyMode } = await import("../quote-pricing");
    expect(quoteQtyMode([null])).toBe("none");
    expect(quoteQtyMode([500])).toBe("single");
    expect(quoteQtyMode([100, 200, 500])).toBe("set");
    expect(quoteQtyMode([100, null])).toBe("set");
    expect(quoteQtyMode([])).toBe("set");
  });
});

describe("สรุปยอดรวมรอบเสนอราคา", () => {
  it("แบ่งสี = รวมจำนวนสี + ราคาสีละ ± delta", async () => {
    const { quoteCellTotal } = await import("../quote-pricing");
    const t = quoteCellTotal({ parent_code: "PU", qty: null, price: 41.02, offered_price: 100, colors: [{ qty: 500, delta: null }, { qty: 500, delta: -20 }] });
    expect(t).toEqual({ size: "PU", unit: 100, qty: 1000, sale: 90000, cost: 41020 });
  });
  it("ไม่มีสี = จำนวนของช่อง · ไม่มีจำนวน = นับไม่ได้", async () => {
    const { quoteCellTotal } = await import("../quote-pricing");
    expect(quoteCellTotal({ parent_code: "A", qty: 200, price: 10, offered_price: 15 })).toMatchObject({ qty: 200, sale: 3000, cost: 2000 });
    expect(quoteCellTotal({ parent_code: "A", qty: null, price: 10, offered_price: 15 })).toMatchObject({ qty: null, sale: null, cost: null });
  });
  it("รวมหลายไซส์ · ไซส์ไม่มีจำนวนอยู่ใน missing · ขาดตีราคา = ไม่รู้ต้นทุน", async () => {
    const { sumQuoteLines } = await import("../quote-pricing");
    const r = sumQuoteLines([
      { size: "A", unit: 60, qty: 7600, sale: 456000, cost: 203680 },
      { size: "B", unit: 100, qty: null, sale: null, cost: null },
    ]);
    expect(r).toMatchObject({ qty: 7600, sale: 456000, cost: 203680, profit: 252320, missing: ["B"] });
    expect(sumQuoteLines([{ size: "A", unit: 60, qty: 10, sale: 600, cost: null }])).toMatchObject({ sale: 600, cost: null, profit: null, pct: null });
  });
});
