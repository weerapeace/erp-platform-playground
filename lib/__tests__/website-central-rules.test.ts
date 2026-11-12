import { describe, expect, it } from "vitest";
import { autoCategory, cleanCentralRules, cleanHiddenIds, normalizeFieldMap, resolveProduct, type ParentRow } from "@/lib/website-field-map";
import { renameKeyInFieldMap } from "@/lib/website-category-rename";

/** ร้านแบบ Louis (ย่อ) — หมวดหลัก + หมวดย่อย */
const RAW = {
  categories: [
    { key: "bags", label: "Bags" },
    { key: "bags-handbags", label: "กระเป๋าถือ", parent: "bags" },
    { key: "wallets", label: "Wallets" },
    { key: "gifts", label: "Gifts" },
  ],
  category: {
    default: "gifts",
    rules: { กระเป๋า: "bags" },
    centralRules: { "c-handbag": "bags-handbags", "c-gone": "no-such-cat", "": "bags" },
    hidden: ["p1", "p1", " p2 ", 3, ""],
  },
};

const parent = (o: Partial<ParentRow>): ParentRow =>
  ({ id: "p9", code: "LM09", name_th: "กระเป๋า", name_en: "", sku_name: null, name_platform: null, introduction: null, description: null, platform_description: null, english_description: "", sale_price: 100, final_price: null, fake_price: null, cover_image_r2_key: null, category_id: null, ...o }) as ParentRow;

describe("field_map.category.centralRules / hidden — ล้างค่าที่ใช้ไม่ได้", () => {
  it("normalize เก็บเฉพาะกฎที่ชี้หมวดที่ร้านยังมี + id ซ่อนไม่ซ้ำ", () => {
    const fm = normalizeFieldMap(RAW);
    expect(fm.category.centralRules).toEqual({ "c-handbag": "bags-handbags" });
    expect(fm.category.hidden).toEqual(["p1", "p2"]);
    // ร้านเก่าที่ยังไม่มีช่องนี้ = ว่าง (ไม่พัง)
    expect(normalizeFieldMap({}).category.centralRules).toEqual({});
    expect(normalizeFieldMap({}).category.hidden).toEqual([]);
  });
  it("ตัวล้างรับค่าเพี้ยนได้", () => {
    expect(cleanCentralRules(null, ["a"])).toEqual({});
    expect(cleanCentralRules(["a"], ["a"])).toEqual({});
    expect(cleanHiddenIds("x")).toEqual([]);
  });
});

describe("autoCategory — หมวดที่เว็บใส่ให้เมื่อยังไม่ได้จัดเอง", () => {
  const fm = normalizeFieldMap(RAW);
  it("หมวดกลาง → หมวด ERP → ค่าตั้งต้นร้าน", () => {
    expect(autoCategory(fm, "กระเป๋า", "c-handbag")).toEqual({ key: "bags-handbags", source: "central" });
    expect(autoCategory(fm, "กระเป๋า", "c-unmapped")).toEqual({ key: "bags", source: "erp" });
    expect(autoCategory(fm, "อื่น ๆ", null)).toEqual({ key: "gifts", source: "default" });
  });
  it("resolveProduct ใช้ลำดับเดียวกัน · จัดเองชนะเสมอ", () => {
    expect(resolveProduct(fm, parent({ platform_category_id: "c-handbag" }), [], null, "กระเป๋า").categories).toEqual(["bags-handbags"]);
    expect(resolveProduct(fm, parent({ platform_category_id: null }), [], null, "กระเป๋า").categories).toEqual(["bags"]);
    expect(resolveProduct(fm, parent({ platform_category_id: "c-handbag" }), [], { web_categories: ["wallets"] }, "กระเป๋า").categories).toEqual(["wallets"]);
    // ไม่มี platform_category_id ใน select (ที่เก่า) = เหมือนเดิม
    expect(resolveProduct(fm, parent({}), [], null, null).categories).toEqual(["gifts"]);
  });
});

describe("เปลี่ยนรหัสหมวด → กฎหมวดกลางเปลี่ยนตาม", () => {
  it("centralRules ที่ชี้รหัสเก่า → รหัสใหม่ · ร้านที่ไม่มีช่องนี้ไม่เพิ่มช่อง", () => {
    const out = renameKeyInFieldMap(RAW, [], "bags-handbags", "bags-top-handle") as { category: { centralRules: Record<string, string> } };
    expect(out.category.centralRules["c-handbag"]).toBe("bags-top-handle");
    const plain = renameKeyInFieldMap({ category: { rules: {} } }, [{ key: "a" }], "a", "b") as { category: Record<string, unknown> };
    expect("centralRules" in plain.category).toBe(false);
  });
});
