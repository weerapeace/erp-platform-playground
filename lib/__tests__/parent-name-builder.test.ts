import { describe, expect, it } from "vitest";
import { buildParentName, guessFamily, swapCodeInName } from "@/lib/parent-name-builder";

describe("buildParentName", () => {
  const p = { brand: "Louis Montini", collection: "Evelyn", type: "กระเป๋าใส่บัตรคล้องคอ", materials: ["หนังวัวแท้"], highlights: ["สลักชื่อฟรี"], code: "wk46" };
  it("ไทย = เว้นวรรค", () => {
    expect(buildParentName(p)).toBe("Louis Montini (Evelyn) กระเป๋าใส่บัตรคล้องคอ หนังวัวแท้ สลักชื่อฟรี WK46");
  });
  it("อังกฤษ = คั่นลูกน้ำ · วัสดุหลายอย่างต่อด้วย &", () => {
    expect(buildParentName({ brand: "Louis Montini", collection: "Evelyn", type: "Card holder", materials: ["canvas", "cowhide"], highlights: ["engraving"], code: "WK46" }, "en"))
      .toBe("Louis Montini (Evelyn) Card holder, canvas & cowhide, engraving WK46");
  });
  it("ข้ามชิ้นที่ว่าง · รหัสยังไม่มีเลข = ไม่ต่อท้าย", () => {
    expect(buildParentName({ brand: "Good Goods", type: "เข็มขัด", code: "CVB" })).toBe("Good Goods เข็มขัด");
    expect(buildParentName({})).toBe("");
  });
});

describe("swapCodeInName / guessFamily", () => {
  it("เปลี่ยนรหัสในชื่อ", () => {
    expect(swapCodeInName("Louis Montini (X) กระเป๋า CVB16", "CVB16", "cvb17")).toBe("Louis Montini (X) กระเป๋า CVB17");
    expect(swapCodeInName("Louis Montini กระเป๋า", "CVB16", "CVB17")).toBe("Louis Montini กระเป๋า CVB17");
    expect(swapCodeInName("ชื่อ CVB16", "CVB16", "CVB")).toBe("ชื่อ CVB16");
  });
  it("เดาหมวดสินค้า", () => {
    expect(guessFamily("กระเป๋าใส่บัตรเครดิต")).toBe("bag");
    expect(guessFamily("เข็มขัดผู้ชาย")).toBe("belt");
    expect(guessFamily("หัวเข็มขัด")).toBe("belt");
    expect(guessFamily("สร้อยคอ")).toBe("jewelry");
    expect(guessFamily("")).toBe("general");
  });
});
