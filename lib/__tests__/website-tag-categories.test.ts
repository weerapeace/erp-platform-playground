import { describe, it, expect } from "vitest";
import { addCategories, cleanTagRules, hasManualCategories, tagRuleCategories } from "@/lib/website-tag-categories";
import { normalizeFieldMap, resolveProduct } from "@/lib/website-field-map";

const BAG = "11111111-1111-4111-8111-111111111111";
const BACKPACK = "22222222-2222-4222-8222-222222222222";
const WALLET = "33333333-3333-4333-8333-333333333333";
const BRAND = "44444444-4444-4444-8444-444444444444";
const depth = (id: string) => (id === BACKPACK ? 1 : 0);   // กระเป๋าเป้ = แท็กย่อยของ กระเป๋า

describe("cleanTagRules", () => {
  it("เก็บเฉพาะรหัสแท็กจริง + หมวดที่ร้านยังมี", () => {
    expect(cleanTagRules({ [BAG]: "bags", [BACKPACK]: "gone", "not-a-uuid": "bags", [WALLET]: 5 }, ["bags", "wallets"])).toEqual({ [BAG]: "bags" });
    expect(cleanTagRules(null, ["bags"])).toEqual({});
    expect(cleanTagRules(["x"], ["bags"])).toEqual({});
  });
});

describe("tagRuleCategories", () => {
  const rules = { [BAG]: "bags", [BACKPACK]: "bags-backpacks", [WALLET]: "wallets" };
  it("แท็กย่อยเป็นหมวดหลัก แม้กฎแท็กแม่อยู่ก่อน", () => {
    expect(tagRuleCategories(rules, [BAG, BACKPACK, BRAND], depth)).toEqual(["bags-backpacks", "bags"]);
  });
  it("ชั้นเดียวกัน = ตามลำดับกฎ · ไม่ซ้ำ · ไม่มีกฎ = ว่าง", () => {
    expect(tagRuleCategories(rules, [WALLET, BAG], depth)).toEqual(["bags", "wallets"]);
    expect(tagRuleCategories({ [BAG]: "bags", [WALLET]: "bags" }, [BAG, WALLET], depth)).toEqual(["bags"]);
    expect(tagRuleCategories(rules, [BRAND], depth)).toEqual([]);
  });
});

describe("addCategories (เพิ่มอย่างเดียว)", () => {
  it("ไม่ลบ/ไม่สลับของเดิม", () => {
    expect(addCategories(["wallets"], ["bags-backpacks", "bags"])).toEqual(["wallets", "bags-backpacks", "bags"]);
    expect(addCategories([], ["bags-backpacks", "bags"])).toEqual(["bags-backpacks", "bags"]);
    expect(addCategories(["bags"], ["bags"])).toBeNull();
    expect(addCategories(null, ["bags", "bags"])).toEqual(["bags"]);
  });
  it("จัดเองแล้วไหม", () => {
    expect(hasManualCategories({ web_categories: [] })).toBe(true);
    expect(hasManualCategories({ web_categories: null, web_category: "bags" })).toBe(true);
    expect(hasManualCategories({ web_categories: null, web_category: "" })).toBe(false);
    expect(hasManualCategories(null)).toBe(false);
  });
});

describe("resolveProduct + กฎแท็ก", () => {
  const map = normalizeFieldMap({
    categories: [{ key: "bags", label: "Bags" }, { key: "bags-backpacks", label: "Backpacks", parent: "bags" }, { key: "accessories", label: "Accessories" }],
    category: { default: "accessories", rules: { "กระเป๋า ERP": "bags" }, tagRules: { [BACKPACK]: "bags-backpacks", [BAG]: "bags", bad: "x" } },
  });
  const parent = { id: "p1", code: "BBP09", name_th: "กระเป๋า" } as never;
  it("normalize เก็บกฎแท็ก (ทิ้งของเสีย)", () => {
    expect(map.category.tagRules).toEqual({ [BACKPACK]: "bags-backpacks", [BAG]: "bags" });
  });
  it("ยังไม่จัดเอง → ใช้หมวดจากแท็ก (มาก่อนกฎหมวด ERP/ค่าเริ่มต้น)", () => {
    const r = resolveProduct(map, parent, [], { web_categories: null }, "กระเป๋า ERP", ["bags-backpacks", "bags"]);
    expect(r.categories).toEqual(["bags-backpacks", "bags"]);
    expect(r.category).toBe("bags-backpacks");
  });
  it("ไม่มีแท็กที่ตรง → กฎหมวด ERP → ค่าเริ่มต้น (เหมือนเดิม)", () => {
    expect(resolveProduct(map, parent, [], null, "กระเป๋า ERP", []).categories).toEqual(["bags"]);
    expect(resolveProduct(map, parent, [], null, null).categories).toEqual(["accessories"]);
  });
  it("จัดเองแล้ว (แม้ว่าง) → ไม่ใช้กฎแท็ก", () => {
    expect(resolveProduct(map, parent, [], { web_categories: [] }, null, ["bags"]).categories).toEqual([]);
    expect(resolveProduct(map, parent, [], { web_categories: ["accessories"] }, null, ["bags"]).categories).toEqual(["accessories"]);
    expect(resolveProduct(map, parent, [], { web_category: "accessories" }, null, ["bags"]).categories).toEqual(["accessories"]);
  });
});
