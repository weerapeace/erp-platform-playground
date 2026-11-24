import { describe, expect, it } from "vitest";
import { feeCatOf, feeSpikes, feeSummary, incomeKnown, missingCostByParent, orderFees, profitRows } from "../marketing-profit-calc";

const shopeeSample = {
  escrow: 218, lines: [
    { key: "original_price", amount: 490 }, { key: "seller_discount", amount: -200 }, { key: "shopee_discount", amount: 44 },
    { key: "buyer_shipping", amount: 29 }, { key: "commission", amount: -56 }, { key: "service", amount: -34 }, { key: "transaction", amount: -10 },
  ],
};

describe("ค่าธรรมเนียมต่อออเดอร์", () => {
  it("Shopee: นับแค่ค่าธรรมเนียมแพลตฟอร์ม ไม่นับส่วนลดร้าน · ค่าส่งผู้ซื้อจ่ายเกิน = 0", () => {
    const f = orderFees("shopee", shopeeSample);
    expect(f.total).toBe(100);
    expect(f.byCat).toMatchObject({ commission: 56, service: 34, transaction: 10, shipping: 0 });
  });
  it("Lazada: จัดหมวดจากชื่อรายการ · ค่าส่งสุทธิ", () => {
    expect(feeCatOf("lazada", "Item Price Credit")).toBeNull();
    expect(feeCatOf("lazada", "Promotional Charges Vouchers")).toBeNull();
    expect(feeCatOf("lazada", "Reversal Commission")).toBe("commission");
    expect(feeCatOf("lazada", "Free Shipping Max Fee")).toBe("service");
    const f = orderFees("lazada", { escrow: 300, rows: 4, lines: [
      { key: "Item Price Credit", amount: 400 }, { key: "Commission", amount: -40 }, { key: "Payment Fee", amount: -8 },
      { key: "Shipping Fee (Paid By Customer)", amount: 30 }, { key: "Shipping Fee (Charged by Lazada)", amount: -45 },
    ] });
    expect(f.byCat).toMatchObject({ commission: 40, transaction: 8, shipping: 15 });
    expect(f.total).toBe(63);
  });
  it("Lazada ยังไม่ตัดรอบ = ยังไม่รู้", () => {
    expect(incomeKnown({ escrow: null, rows: 0, lines: [] })).toBe(false);
    expect(incomeKnown(null)).toBe(false);
    expect(incomeKnown(shopeeSample)).toBe(true);
  });
});

describe("สรุปแยกช่องทาง + เตือนพุ่ง", () => {
  it("% คิดจากใบที่รู้แล้ว แล้วประมาณทั้งช่วง", () => {
    const [s] = feeSummary([
      { platform: "shopee", value: 500, income: shopeeSample },
      { platform: "shopee", value: 500, income: null },
    ], { minCovered: 1 });
    expect(s.covered).toBe(1);
    expect(s.pct).toBeCloseTo(0.2);
    expect(s.estFeeAll).toBe(200);
    expect(s.net).toBe(218);
    expect(feeSummary([{ platform: "shopee", value: 500, income: shopeeSample }])[0].estFeeAll).toBeNull();
  });
  it("เตือนเมื่อเกินเกณฑ์และมีใบพอ", () => {
    const rows = [
      { platform: "shopee", orders: 30, covered: 25, sales: 1, salesCovered: 1, fee: 1, byCat: {} as never, net: 0, pct: 0.18, estFeeAll: 0 },
      { platform: "lazada", orders: 30, covered: 5, sales: 1, salesCovered: 1, fee: 1, byCat: {} as never, net: 0, pct: 0.3, estFeeAll: 0 },
    ];
    expect(feeSpikes(rows).map((x) => x.platform)).toEqual(["shopee"]);
  });
});

describe("กำไรต่อสินค้า", () => {
  it("ไม่มีต้นทุน = ไม่คิดกำไร · ความครอบคลุมตามยอด", () => {
    const r = profitRows([
      { key: "a", parentId: "p1", parentName: "รุ่น A", code: "A1", name: "A1", sales: 1000, qty: 10, fee: 100, unitCost: 40 },
      { key: "b", parentId: "p2", parentName: "รุ่น B", code: "B1", name: "B1", sales: 3000, qty: 10, fee: 300, unitCost: null },
      { key: "c", parentId: "p2", parentName: "รุ่น B", code: "B2", name: "B2", sales: 1000, qty: 5, fee: 100, unitCost: 0 },
    ]);
    expect(r.rows[0].profit).toBe(500);
    expect(r.rows[1].profit).toBeNull();
    expect(r.coverage).toBeCloseTo(0.2);
    expect(r.margin).toBeCloseTo(0.5);
    const miss = missingCostByParent(r.rows);
    expect(miss).toHaveLength(1);
    expect(miss[0]).toMatchObject({ parentId: "p2", sales: 4000, skus: 2 });
  });
});
