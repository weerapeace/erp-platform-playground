import { describe, expect, it } from "vitest";
import { cleanNestUsage, nestDiffLabel, nestDiffPct, setNestEntry } from "../nest-usage";

const t = (th: string) => th;

describe("cleanNestUsage", () => {
  it("เก็บค่าที่ถูก · ตัดค่าเพี้ยน · แท็บว่างหาย", () => {
    const m = cleanNestUsage({
      "": { a: { qty: "1,05", unit: "หลา", note: "  วางหน้า 150  ", by: "เอ", at: "2026-11-17T00:00:00Z" }, b: { qty: 0, unit: "หลา" }, c: { qty: -1 } },
      P1: { x: { qty: "abc" } },
      bad: [1, 2],
    });
    expect(m).toEqual({ "": { a: { qty: 1.05, unit: "หลา", note: "วางหน้า 150", by: "เอ", at: "2026-11-17T00:00:00Z" } } });
    expect(cleanNestUsage(null)).toEqual({});
    expect(cleanNestUsage([1])).toEqual({});
  });
});

describe("setNestEntry", () => {
  it("ตั้งค่า + ลบ (qty 0) · ไม่แก้ของเดิม", () => {
    const a = setNestEntry({}, "", "i1", { qty: 1.2, unit: "หลา" });
    expect(a).toEqual({ "": { i1: { qty: 1.2, unit: "หลา" } } });
    const b = setNestEntry(a, "", "i1", null);
    expect(b).toEqual({});
    expect(a[""].i1.qty).toBe(1.2);
  });
});

describe("nestDiffPct / label", () => {
  it("ประหยัด / มากกว่า / ไม่มีค่าประมาณ", () => {
    expect(nestDiffPct(1.05, 1.125)).toBe(-7);
    expect(nestDiffLabel(-7, t)).toBe("ประหยัด 7%");
    expect(nestDiffLabel(nestDiffPct(1.2, 1.125), t)).toBe("ใช้มากกว่า 7%");
    expect(nestDiffPct(1, null)).toBeNull();
    expect(nestDiffLabel(null, t)).toBe("");
    expect(nestDiffLabel(0, t)).toBe("เท่ากับที่ประมาณ");
  });
});
