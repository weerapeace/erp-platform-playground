import { describe, it, expect } from "vitest";
import { groupSummary, sanitizeGroup } from "../website-product-groups";

/** 📦 กลุ่มสินค้าของร้าน (2026-10-28) — ใช้ซ้ำได้ทุกโปร */
describe("กลุ่มสินค้า: ตั้งค่าจาก ERP", () => {
  it("เลือกเอง: ต้องมีอย่างน้อย 1 รุ่น · รหัสเป็นตัวใหญ่ไม่ซ้ำ", () => {
    expect(sanitizeGroup({ name: "ของขวัญ", mode: "manual", codes: [] })).toMatchObject({ ok: false });
    const ok = sanitizeGroup({ name: " ของขวัญ ", mode: "manual", codes: ["pix19", "PIX19", "pix30"] });
    expect(ok.ok && [ok.group.name, ok.group.codes, ok.group.match]).toEqual(["ของขวัญ", ["PIX19", "PIX30"], {}]);
  });

  it("อัตโนมัติ: ต้องมีเงื่อนไข · ราคาต่ำสุด ≤ สูงสุด · มาใหม่ ≤ 365 วัน · ค่าว่างไม่เก็บ", () => {
    expect(sanitizeGroup({ name: "x", mode: "smart", match: {} })).toMatchObject({ ok: false });
    expect(sanitizeGroup({ name: "x", mode: "smart", match: { priceMin: 2000, priceMax: 1000 } })).toMatchObject({ ok: false });
    expect(sanitizeGroup({ name: "x", mode: "smart", match: { newDays: 400 } })).toMatchObject({ ok: false });
    const ok = sanitizeGroup({ name: "กระเป๋าราคากลาง", mode: "smart", codes: ["A"], match: { categories: ["bags"], priceMin: "800", priceMax: "", newDays: "", codePrefixes: "pix, lm" } });
    expect(ok.ok && [ok.group.codes, ok.group.match]).toEqual([[], { categories: ["bags"], codePrefixes: ["PIX", "LM"], priceMin: 800 }]);
  });

  it("สรุปภาษาคน", () => {
    expect(groupSummary({ mode: "manual", codes: ["A", "B"], match: {} })).toBe("เลือกเอง 2 รุ่น");
    expect(groupSummary({ mode: "smart", codes: [], match: { categories: ["bags"], priceMin: 800, priceMax: 1500, newDays: 30 } }, (c) => (c === "bags" ? "กระเป๋า" : c))).toBe("หมวด กระเป๋า · ราคา ฿800–1,500 · มาใหม่ 30 วัน");
  });
});
