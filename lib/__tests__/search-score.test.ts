import { describe, it, expect } from "vitest";
import { tokenize, scoreRow, normText, ilikeOr } from "@/lib/search-score";

describe("search-score (ตัวจัดอันดับค้นหากลาง)", () => {
  it("tokenize แตกคำข้ามตัวคั่น + ตัดอักขระ PostgREST", () => {
    expect(tokenize("ZH-BT-NO.5#345")).toEqual(["zh", "bt", "no", "5", "345"]);
    expect(tokenize("  กระเป๋า  แดง ")).toEqual(["กระเป๋า", "แดง"]);
    expect(tokenize("a%b_(c)")).toEqual(["ab", "c"]);
  });

  it("normText ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/เลข/ไทย", () => {
    expect(normText("PO-2026/0001")).toBe("po20260001");
    expect(normText("ค่าส่ง (บาท)")).toBe("ค่าส่งบาท");
  });

  it("รหัสตรงเป๊ะขึ้นก่อน → ขึ้นต้น → มีคำ → ชื่อ", () => {
    const q = "ab-01"; const toks = tokenize(q);
    const exact  = scoreRow(q, toks, { code: "AB-01", texts: ["x"] });
    const prefix = scoreRow(q, toks, { code: "AB-011", texts: ["x"] });
    const inside = scoreRow(q, toks, { code: "ZAB-01", texts: ["x"] });
    const byName = scoreRow(q, toks, { code: "ZZ", texts: ["สินค้า AB-01 สีแดง"] });
    expect(exact).toBe(1_000_000);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(byName);
    expect(byName).toBeGreaterThan(0);
  });

  it("AND: ทุกคำต้องเจอ ไม่งั้น 0", () => {
    const q = "กระเป๋า แดง"; const toks = tokenize(q);
    expect(scoreRow(q, toks, { code: "K1", texts: ["กระเป๋าสะพาย สีแดง"] })).toBeGreaterThan(0);
    expect(scoreRow(q, toks, { code: "K2", texts: ["กระเป๋าสะพาย สีดำ"] })).toBe(0);
  });

  it("ilikeOr สร้างเงื่อนไข or ต่อ token", () => {
    expect(ilikeOr(["code", "name_th"], "abc")).toBe("code.ilike.%abc%,name_th.ilike.%abc%");
  });
});
