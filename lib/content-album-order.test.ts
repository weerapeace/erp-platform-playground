import { describe, expect, it } from "vitest";
import { applyFileOrder } from "./content-album-order";

const f = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("applyFileOrder", () => {
  it("ไม่มีลำดับ = คงเดิม (ใหม่ก่อน)", () => {
    expect(ids(applyFileOrder(f("c", "b", "a"), []))).toEqual(["c", "b", "a"]);
    expect(ids(applyFileOrder(f("c", "b", "a"), null))).toEqual(["c", "b", "a"]);
  });
  it("ตามลำดับที่จัด · ไฟล์ที่อัปทีหลัง (ไม่อยู่ในรายการ) ต่อท้าย", () => {
    expect(ids(applyFileOrder(f("d", "c", "b", "a"), ["a", "c", "b"]))).toEqual(["a", "c", "b", "d"]);
  });
  it("id ที่ไม่มีไฟล์แล้ว = ข้าม · id ซ้ำในรายการ = ใช้ตำแหน่งแรก", () => {
    expect(ids(applyFileOrder(f("b", "a"), ["x", "a", "b", "a"]))).toEqual(["a", "b"]);
  });
});
