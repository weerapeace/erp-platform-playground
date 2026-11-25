import { describe, expect, it } from "vitest";
import { buildCustomers, customerKey, firstProductRepeat, maskedName, productPairs, rangeStats, segmentOf, type CustOrder } from "../marketing-customers-calc";

const o = (id: string, name: string, date: string, value = 100): CustOrder => ({ id, key: customerKey("shopee", "b", name), platform: "shopee", brand_id: "b", name, date, value });

describe("ลูกค้า", () => {
  const orders = [o("1", "Ann", "2026-10-20"), o("2", "ann ", "2026-11-05", 300), o("3", "ann", "2026-11-20"), o("4", "Bob", "2026-11-10"), o("5", "Cat", "2026-10-16"), o("6", "Cat", "2026-10-18")];
  const cs = buildCustomers(orders);
  it("รวมชื่อไม่สนตัวพิมพ์/ช่องว่าง + ระยะห่างครั้งที่ 2", () => {
    const ann = cs.find((c) => c.name === "Ann")!;
    expect(ann.orders).toBe(3);
    expect(ann.spend).toBe(500);
    expect(ann.secondGap).toBe(16);
  });
  it("กลุ่ม", () => {
    const seg = (n: string) => segmentOf(cs.find((c) => c.name === n)!, "2026-11-25");
    expect(seg("Ann")).toBe("champion");
    expect(seg("Bob")).toBe("new");
    expect(seg("Cat")).toBe("at_risk");
    expect(segmentOf({ visits: 1, last: "2026-09-01" }, "2026-11-25")).toBe("one_time");
    const split = buildCustomers([o("a", "Dan", "2026-11-20"), o("b", "Dan", "2026-11-20")])[0];
    expect(split).toMatchObject({ orders: 2, visits: 1, secondGap: null });
    expect(segmentOf(split, "2026-11-25")).toBe("new");
  });
  it("สถิติช่วง", () => {
    const s = rangeStats(orders, cs, "2026-11-01", "2026-11-30");
    expect(s).toMatchObject({ customers: 2, newCustomers: 1, returning: 1 });
    expect(s.returningShare).toBeCloseTo(400 / 500);
    expect(s.repeatRate).toBeCloseTo(2 / 3);
    expect(s.medianGap).toBe(16);
  });
  it("ซ่อนชื่อคงที่", () => {
    expect(maskedName("k")).toBe(maskedName("k"));
    expect(maskedName("k")).toMatch(/^ลูกค้า #\d{6}$/);
  });
});

describe("ซื้อคู่กัน", () => {
  it("นับออเดอร์ + ความมั่นใจ", () => {
    const items = [["1", "A"], ["1", "B"], ["2", "A"], ["2", "B"], ["3", "A"], ["3", "B"], ["3", "B"], ["4", "A"], ["5", "C"]].map(([order_id, product]) => ({ order_id, product }));
    const [p] = productPairs(items);
    expect(p).toMatchObject({ a: "A", b: "B", count: 3 });
    expect(p.confAB).toBeCloseTo(0.75);
    expect(p.confBA).toBe(1);
  });
});

describe("สินค้าชิ้นแรก → กลับมาซื้อ", () => {
  it("เฉพาะลูกค้าที่เก่าพอ + ขั้นต่ำจำนวนคน", () => {
    const cs = buildCustomers([o("1", "a", "2026-10-01"), o("2", "a", "2026-10-20"), o("3", "b", "2026-10-02"), o("4", "c", "2026-11-20")]);
    const fp = new Map(cs.map((c) => [c.key, ["P1"]]));
    expect(firstProductRepeat(cs, fp, "2026-11-25", { minCustomers: 1 })).toEqual([{ product: "P1", customers: 2, repeated: 1, rate: 0.5 }]);
  });
});
