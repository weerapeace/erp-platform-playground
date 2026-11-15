import { describe, expect, it } from "vitest";
import { createMissingOf, readinessText } from "@/lib/platform-create-readiness";

describe("platform-create-readiness", () => {
  it("นับแบบตัวช่วยลงสินค้า: ข้อมูลที่ขาด + ด่านอื่น ไม่นับ 'มีบน … แล้ว' · ไม่ซ้ำ", () => {
    expect(createMissingOf(["หมวดหมู่", "รูปสินค้า"], ["มีบน Shopee แล้ว (#1)", "แบรนด์นี้ยังเชื่อม Shopee ไม่ได้", "หมวดหมู่"]))
      .toEqual(["หมวดหมู่", "รูปสินค้า", "แบรนด์นี้ยังเชื่อม Shopee ไม่ได้"]);
    expect(createMissingOf(null, undefined)).toEqual([]);
  });

  it("ป้าย: พร้อมลง / ขาด N (ตัดที่ 3 ข้อ) / มีบนร้านแล้ว / ตรวจไม่สำเร็จ", () => {
    expect(readinessText({ missing: [], error: null, on_shop: null })).toEqual({ tone: "ok", text: "พร้อมลง" });
    expect(readinessText({ missing: ["a", "b"], error: null, on_shop: null }).text).toBe("ขาด 2: a · b");
    expect(readinessText({ missing: ["a", "b", "c", "d"], error: null, on_shop: null }).text).toBe("ขาด 4: a · b · c …");
    expect(readinessText({ missing: ["a"], error: null, on_shop: "99" }).tone).toBe("shop");
    expect(readinessText({ missing: [], error: "ช้า", on_shop: null }).tone).toBe("error");
  });
});
