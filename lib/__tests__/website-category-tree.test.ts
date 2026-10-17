import { describe, expect, it } from "vitest";
import { categoryTree, cleanParents, flattenTree, reorderCategoryTree, withParentCategories, familyKeys, categoryPathLabel } from "@/lib/website-category-tree";

const C = (key: string, parent?: string) => ({ key, label: key.toUpperCase(), parent: parent ?? null });

describe("website-category-tree", () => {
  it("cleanParents: แม่ไม่มีจริง/ชี้ตัวเอง/ซ้อน 3 ชั้น → เป็นหมวดชั้นบน", () => {
    const out = cleanParents([C("a"), C("b", "a"), C("c", "b"), C("d", "zz"), C("e", "e")]);
    expect(out.map((c) => c.parent)).toEqual([null, "a", null, null, null]);
  });
  it("flattenTree: แม่ตามด้วยลูก ไม่หายสักตัว", () => {
    const out = flattenTree([C("b1", "b"), C("a"), C("b"), C("a1", "a")]);
    expect(out.map((c) => c.key)).toEqual(["a", "a1", "b", "b1"]);
    expect(categoryTree(out).map((r) => r.depth)).toEqual([0, 1, 0, 1]);
  });
  it("reorder: ลากหมวดชั้นบน = ย้ายทั้งกลุ่ม", () => {
    const cats = [C("a"), C("a1", "a"), C("b"), C("b1", "b")];
    expect(reorderCategoryTree(cats, 2, 0).map((c) => c.key)).toEqual(["b", "b1", "a", "a1"]);
    // วางบนลูกของกลุ่มอื่น = ไปตำแหน่งกลุ่มนั้น
    expect(reorderCategoryTree(cats, 0, 3).map((c) => c.key)).toEqual(["b", "b1", "a", "a1"]);
  });
  it("reorder: หมวดย่อยย้ายได้เฉพาะในแม่เดิม", () => {
    const cats = [C("a"), C("a1", "a"), C("a2", "a"), C("b"), C("b1", "b")];
    expect(reorderCategoryTree(cats, 2, 1).map((c) => c.key)).toEqual(["a", "a2", "a1", "b", "b1"]);
    expect(reorderCategoryTree(cats, 2, 0).map((c) => c.key)).toEqual(["a", "a2", "a1", "b", "b1"]);
    expect(reorderCategoryTree(cats, 2, 4)).toBe(cats); // ข้ามแม่ = ไม่ทำอะไร
  });
  it("withParentCategories: เติมหมวดแม่ต่อท้าย คงหมวดหลักเดิม", () => {
    const cats = [C("a"), C("a1", "a"), C("b")];
    expect(withParentCategories(cats, ["a1", "b"])).toEqual(["a1", "b", "a"]);
    expect(withParentCategories(cats, ["a", "a1"])).toEqual(["a", "a1"]);
    expect(familyKeys(cats, "a")).toEqual(["a", "a1"]);
    expect(categoryPathLabel(cats, "a1")).toBe("A › A1");
  });
});
