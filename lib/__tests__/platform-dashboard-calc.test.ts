import { describe, expect, it } from "vitest";
import {
  bkkHour, bkkYmd, hourlyBuckets, itemValueByOrder, lowStockSelling, monthToDate, orderValue, readSalesTarget, shiftYmd, topProducts, writeSalesTarget,
} from "@/lib/platform-dashboard-calc";

describe("platform-dashboard-calc", () => {
  it("วัน/ชั่วโมงไทย (UTC+7) + เลื่อนวัน", () => {
    expect(bkkYmd("2026-11-21T17:30:00Z")).toBe("2026-11-22");   // 00:30 เวลาไทย
    expect(bkkHour("2026-11-21T17:30:00Z")).toBe(0);
    expect(shiftYmd("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("เดือนนี้ถึงวันนี้ + เดือนก่อนช่วงเดียวกัน (เดือนก่อนสั้นกว่า = ถึงสิ้นเดือน · ข้ามปี)", () => {
    expect(monthToDate("2026-11-22")).toEqual({ ym: "2026-11", from: "2026-11-01", to: "2026-11-22", prevFrom: "2026-10-01", prevTo: "2026-10-22" });
    expect(monthToDate("2026-03-31").prevTo).toBe("2026-02-28");
    expect(monthToDate("2027-01-15")).toMatchObject({ prevFrom: "2026-12-01", prevTo: "2026-12-15" });
  });

  it("ยอดแบบหน้าร้าน = Σ จำนวน×ราคา · ไม่มีรายการสินค้า = ใช้ยอดลูกค้าจ่าย", () => {
    const m = itemValueByOrder([
      { order_id: "o1", matched_sku_id: "s1", sku_code: "A", name: "A", qty: 2, price: 100 },
      { order_id: "o1", matched_sku_id: "s2", sku_code: "B", name: "B", qty: 1, price: 50 },
    ]);
    expect(orderValue({ id: "o1", total: 199 }, m)).toBe(250);   // ลูกค้าจ่าย 199 หลังโค้ด Shopee
    expect(orderValue({ id: "o2", total: 300 }, m)).toBe(300);
  });

  it("ขายดี: ได้อันดับต้นทั้งตามชิ้นและตามยอด", () => {
    const items = [
      { order_id: "o1", matched_sku_id: "cheap", sku_code: "C", name: "ถูก", qty: 10, price: 10 },
      { order_id: "o2", matched_sku_id: "dear", sku_code: "D", name: "แพง", qty: 1, price: 1000 },
      { order_id: "o3", matched_sku_id: "mid", sku_code: "M", name: "กลาง", qty: 2, price: 100 },
    ];
    const top = topProducts(items, 1);
    expect(top.map((t) => t.key).sort()).toEqual(["cheap", "dear"]);
  });

  it("สต๊อกใกล้หมด เฉพาะที่ขายได้: พร้อมขายน้อย หรือ พอขายอีกไม่กี่วัน · เรียงตัวที่ใกล้หมดก่อน", () => {
    const sold = new Map([["a", 30], ["b", 3], ["c", 60], ["d", 0]]);
    const avail = new Map([["a", 20], ["b", 1], ["c", 10], ["d", 0]]);
    const r = lowStockSelling(sold, avail);
    expect(r.map((x) => x.skuId)).toEqual(["c", "b"]);          // c พอขาย 5 วัน · b เหลือ 1 (พอ 10 วัน) · a พอขาย 20 วัน · d ไม่ได้ขาย
    expect(r.find((x) => x.skuId === "c")?.coverDays).toBe(5);
  });

  it("ยอดตามชั่วโมงของวันเดียว", () => {
    const os = [{ id: "1", ordered_at: "2026-11-22T02:10:00Z" }, { id: "2", ordered_at: "2026-11-22T02:50:00Z" }, { id: "3", ordered_at: "2026-11-21T02:10:00Z" }];
    const h = hourlyBuckets(os, "2026-11-22", () => 100);
    expect(h[9]).toBe(200);   // 09:xx เวลาไทย
    expect(h.reduce((a, b) => a + b, 0)).toBe(200);
  });

  it("เป้ายอดขาย: ตั้ง/อ่าน/ลบ ต่อเดือน × แบรนด์ (ไม่แก้ตัวเดิม)", () => {
    const v0 = { "2026-11|*": 500000 };
    expect(readSalesTarget(v0, "2026-11", null)).toBe(500000);
    expect(readSalesTarget(v0, "2026-11", "b1")).toBeNull();
    const v1 = writeSalesTarget(v0, "2026-11", "b1", 120000.4);
    expect(v1).toEqual({ "2026-11|*": 500000, "2026-11|b1": 120000 });
    expect(v0).toEqual({ "2026-11|*": 500000 });
    expect(writeSalesTarget(v1, "2026-11", null, null)).toEqual({ "2026-11|b1": 120000 });
  });
});
