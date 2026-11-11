import { describe, expect, it } from "vitest";
import { cleanQuoteColors, colorQtyStatus, colorUnitPrice, paletteHex, percentsToQty, qtyToPercent, splitEvenly } from "@/lib/quote-colors";

// รอบเสนอราคาหลายสี (2026-11-11)
describe("cleanQuoteColors", () => {
  it("ตัดชื่อซ้ำ/ว่าง · สีจากจานถ้าไม่ส่ง hex · จำนวนติดลบ = ไม่ระบุ · delta 0 = null", () => {
    expect(cleanQuoteColors([
      { name: " แดง ", qty: 600, delta: 0 }, { name: "แดง", qty: 1 }, { name: "", qty: 5 },
      { name: "ฟ้าอมเขียว", hex: "#00aabb", qty: -3, delta: "3" },
    ])).toEqual([
      { name: "แดง", hex: "#E24B4A", qty: 600, delta: null },
      { name: "ฟ้าอมเขียว", hex: "#00AABB", qty: null, delta: 3 },
    ]);
  });
  it("ว่าง / ไม่ใช่ array = null (ไม่แยกสี)", () => {
    expect(cleanQuoteColors([])).toBeNull();
    expect(cleanQuoteColors(null)).toBeNull();
    expect(cleanQuoteColors({ name: "แดง" })).toBeNull();
    expect(paletteHex("สีที่ไม่มี")).toBeNull();
  });
});

describe("แบ่งจำนวน", () => {
  it("ครบ / ขาด / เกิน / ไม่ต้องเตือน", () => {
    expect(colorQtyStatus([{ qty: 600 }, { qty: 300 }, { qty: 100 }], 1000)).toEqual({ total: 1000, remaining: 0, state: "ok" });
    expect(colorQtyStatus([{ qty: 600 }, { qty: 200 }], 1000).state).toBe("under");
    expect(colorQtyStatus([{ qty: 600 }, { qty: 500 }], 1000)).toMatchObject({ remaining: -100, state: "over" });
    expect(colorQtyStatus([{ qty: 5 }], null).state).toBe("none");
    expect(colorQtyStatus(null, 1000).state).toBe("none");
  });
  it("แบ่งเท่ากัน เศษไปสีแรก", () => {
    expect(splitEvenly(3, 1000)).toEqual([334, 333, 333]);
    expect(splitEvenly(0, 1000)).toEqual([]);
  });
  it("% → ชิ้น รวมตรงขั้นจำนวน", () => {
    expect(percentsToQty([60, 30, 10], 1000)).toEqual([600, 300, 100]);
    expect(percentsToQty([33.3, 33.3, 33.4], 100)).toEqual([33, 33, 34]);
    expect(percentsToQty([50, 50], 999).reduce((a, b) => a + b, 0)).toBe(999);
    expect(percentsToQty([50, 20], 1000)).toEqual([500, 200]);   // รวม 70% = ได้ 700 ตามจริง
    expect(qtyToPercent(300, 1000)).toBe(30);
  });
  it("ราคาของสี = ราคาช่อง + delta", () => {
    expect(colorUnitPrice(45, { delta: 3 })).toBe(48);
    expect(colorUnitPrice(45, { delta: null })).toBe(45);
    expect(colorUnitPrice(null, { delta: 3 })).toBeNull();
  });
});
