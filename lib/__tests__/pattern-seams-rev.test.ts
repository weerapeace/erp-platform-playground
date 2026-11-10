import { describe, expect, it } from "vitest";
import { cleanSeams } from "@/lib/pattern-seams";
import { cleanProjectPatch, cleanProjectPieces } from "@/lib/pattern-project";

describe("ทิศของตะเข็บ (rev)", () => {
  const side = (pid: string, from: number) => ({ pid, from, count: 1, n: 4 });
  it("cleanSeams เก็บ rev เฉพาะเมื่อเป็น true จริง · ค่าอื่น = ไม่มีช่องนี้", () => {
    const out = cleanSeams([
      { id: "s1", a: side("a", 0), b: side("b", 2), rev: true },
      { id: "s2", a: side("a", 1), b: side("b", 3), rev: "yes" },
      { id: "s3", a: side("a", 2), b: side("b", 0) },
    ], new Set(["a", "b"]));
    expect(out).toEqual([
      { id: "s1", a: side("a", 0), b: side("b", 2), rev: true },
      { id: "s2", a: side("a", 1), b: side("b", 3) },
      { id: "s3", a: side("a", 2), b: side("b", 0) },
    ]);
  });
  it("บันทึกแพทเทิร์น: rev ผ่านตัวตรวจฝั่งเซิร์ฟเวอร์", () => {
    const pieces = cleanProjectPieces([{ pid: "a", shape: { k: "rect", x: 0, y: 0, w: 10, h: 5 } }, { pid: "b", shape: { k: "rect", x: 20, y: 0, w: 10, h: 5 } }]);
    const { patch, error } = cleanProjectPatch({ pieces, seams: [{ id: "s1", a: side("a", 0), b: side("b", 0), rev: true }] }, []);
    expect(error).toBeNull();
    expect(patch.seams).toEqual([{ id: "s1", a: side("a", 0), b: side("b", 0), rev: true }]);
  });
});
