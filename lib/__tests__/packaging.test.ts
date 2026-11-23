import { describe, it, expect } from "vitest";
import { cleanSetItems, cleanPackFlags, cleanPackNote, categorySetMap, resolveParentPackaging, summarizePackaging, sumUsage, type PackagingSet } from "@/lib/packaging";

const A = "a9ebfcdd-94ed-48da-b1e3-f70c0b2b8ffe", B = "9b2d3b43-b0db-4bed-8187-73a888939191", C = "1b3496fd-c474-4b07-a770-f9f15898b764";
const CAT = "8a112a33-1cc0-4edc-8ace-7694ac9d8019";
const set = (id: string, items: [string, number][], cats: string[] = [], extra: Partial<PackagingSet> = {}): PackagingSet => ({ id, name: id, items: items.map(([sku_id, qty]) => ({ sku_id, qty })), category_ids: cats, sort: 0, is_active: true, ...extra });

describe("packaging sets", () => {
  it("ทำความสะอาดรายการ: uuid · รวมซ้ำ · จำนวน 1–99", () => {
    expect(cleanSetItems([{ sku_id: A, qty: 2 }, { sku_id: A, qty: 1 }, { sku_id: "x", qty: 1 }, { sku_id: B, qty: 0 }, { sku_id: C, qty: 500 }])).toEqual([{ sku_id: A, qty: 3 }, { sku_id: B, qty: 1 }, { sku_id: C, qty: 99 }]);
    expect(cleanSetItems([{ sku_id: A, qty: 1 }], new Set([B]))).toEqual([]);
    expect(cleanSetItems("nope")).toEqual([]);
  });

  it("ป้ายเตือน/โน้ต", () => {
    expect(cleanPackFlags([" แตกง่าย ", "แตกง่าย", "", null])).toEqual(["แตกง่าย"]);
    expect(cleanPackNote("   ")).toBeNull();
  });

  it("Set ของรุ่น: ตั้งเอง > หมวด · ตั้งเองแต่ Set อยู่ในถัง = ไม่มี · รวม SKU เสริม", () => {
    const wallet = set("wallet", [[A, 1], [B, 1]], [CAT]);
    const big = set("big", [[C, 1]]);
    const gone = set("gone", [[C, 1]], [], { is_active: false });
    const byId = new Map([wallet, big, gone].map((s) => [s.id, s]));
    const byCat = categorySetMap([wallet, big, gone]);
    expect(resolveParentPackaging({ pack_set_id: null, pack_extra: [], category_id: CAT }, byId, byCat)).toMatchObject({ source: "category", items: [{ sku_id: A, qty: 1 }, { sku_id: B, qty: 1 }] });
    expect(resolveParentPackaging({ pack_set_id: "big", pack_extra: [{ sku_id: A, qty: 2 }], category_id: CAT }, byId, byCat)).toMatchObject({ source: "own", items: [{ sku_id: C, qty: 1 }, { sku_id: A, qty: 2 }] });
    expect(resolveParentPackaging({ pack_set_id: "gone", pack_extra: [], category_id: CAT }, byId, byCat)).toMatchObject({ set: null, source: null, items: [] });
    expect(resolveParentPackaging({ pack_set_id: null, pack_extra: [{ sku_id: B, qty: 1 }], category_id: null }, byId, byCat)).toMatchObject({ set: null, items: [{ sku_id: B, qty: 1 }] });
  });

  it("หมวดเดียวกันอยู่ 2 Set = ใช้ Set ลำดับแรก", () => {
    const m = categorySetMap([set("b", [], [CAT], { sort: 2 }), set("a", [], [CAT], { sort: 1 })]);
    expect(m.get(CAT)?.id).toBe("a");
  });

  it("สรุปทั้งออเดอร์ = จำนวนต่อชิ้น × จำนวนสินค้า", () => {
    const out = summarizePackaging([{ qty: 2, packaging: [{ id: A, qty: 1 }, { id: B, qty: 2 }] }, { qty: 1, packaging: [{ id: B, qty: 1 }] }, { qty: 0, packaging: [{ id: C, qty: 1 }] }]);
    expect(out).toEqual([{ id: A, qty: 2 }, { id: B, qty: 5 }]);
  });

  it("รายงานการใช้รวมหลายใบ", () => {
    const out = sumUsage([{ packaging: [{ sku_id: A, code: "PK-BOX", name: "กล่อง", qty: 2 }] }, { packaging: [{ sku_id: A, code: "PK-BOX", name: "กล่อง", qty: 1 }, { sku_id: B, code: "PK-TAG", name: "Tag", qty: 5 }] }, { packaging: null }]);
    expect(out).toEqual([{ sku_id: B, code: "PK-TAG", name: "Tag", qty: 5 }, { sku_id: A, code: "PK-BOX", name: "กล่อง", qty: 3 }]);
  });
});
