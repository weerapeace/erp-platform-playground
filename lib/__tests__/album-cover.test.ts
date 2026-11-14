import { describe, it, expect } from "vitest";
import { albumCoverLayout } from "../album-cover";

describe("ปกอัลบั้ม แบบปรับตามจำนวนรูป", () => {
  it("0–3 รูป: ว่าง · เต็มปก · ซ้ายขวา · ใหญ่ 1 + เล็ก 2 (ไม่มีช่องว่าง ไม่มี +N)", () => {
    expect(albumCoverLayout(0)).toEqual({ kind: "empty", shown: 0, more: 0 });
    expect(albumCoverLayout(1)).toEqual({ kind: "one", shown: 1, more: 0 });
    expect(albumCoverLayout(2)).toEqual({ kind: "two", shown: 2, more: 0 });
    expect(albumCoverLayout(3)).toEqual({ kind: "big", shown: 3, small: 2, more: 0 });
  });
  it("4 รูปขึ้นไป: ใหญ่ 1 + เล็ก 3 · เกินขึ้น +N", () => {
    expect(albumCoverLayout(4)).toEqual({ kind: "big", shown: 4, small: 3, more: 0 });
    expect(albumCoverLayout(7)).toEqual({ kind: "big", shown: 4, small: 3, more: 3 });
    expect(albumCoverLayout(120).more).toBe(116);
  });
  it("ค่าแปลก (ติดลบ · ทศนิยม · NaN) = ปลอดภัย", () => {
    expect(albumCoverLayout(-2).kind).toBe("empty");
    expect(albumCoverLayout(2.9).kind).toBe("two");
    expect(albumCoverLayout(Number.NaN).kind).toBe("empty");
  });
});
