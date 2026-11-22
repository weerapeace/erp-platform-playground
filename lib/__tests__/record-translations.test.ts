import { describe, expect, it } from "vitest";
import { flattenTranslations, foldTranslationPatch, hasI18nKeys, i18nKey, parseI18nKey } from "@/lib/record-translations";
import { computedTextValue } from "@/lib/computed-text";

describe("record-translations", () => {
  it("ชื่อช่องเสมือน ไป-กลับ", () => {
    expect(i18nKey("ja", "name_th")).toBe("i18n_ja_name_th");
    expect(parseI18nKey("i18n_ja_name_th")).toEqual({ lang: "ja", field: "name_th" });
    expect(parseI18nKey("name_en")).toBeNull();
    expect(parseI18nKey("i18n_jap_x")).toBeNull();
  });

  it("แตก translations เป็นช่องเสมือน ไม่แก้แถวเดิม", () => {
    const row = { id: "1", translations: { ja: { description: "牛革", n: 1 } } };
    const out = flattenTranslations(row);
    expect(out).toMatchObject({ i18n_ja_description: "牛革" });
    expect("i18n_ja_n" in out).toBe(false);
    expect("i18n_ja_description" in row).toBe(false);
    expect(flattenTranslations({ id: "2" })).toEqual({ id: "2" });
  });

  it("รวมกลับเข้า translations เดิม — คงภาษา/ช่องอื่น · ว่าง = ลบ", () => {
    const before = { ja: { name_th: "財布", description: "旧" }, ko: { name_th: "지갑" } };
    const out = foldTranslationPatch({ code: "WL46", i18n_ja_description: "新", i18n_ja_name_th: "" }, before);
    expect(out).toEqual({ code: "WL46", translations: { ja: { description: "新" }, ko: { name_th: "지갑" } } });
    expect(before.ja.name_th).toBe("財布");   // ของเดิมไม่ถูกแก้
  });

  it("ไม่มีช่องคำแปล = patch เดิม · ภาษาที่ว่างหมดถูกตัด", () => {
    const p = { name_th: "x" };
    expect(foldTranslationPatch(p, null)).toBe(p);
    expect(hasI18nKeys(p)).toBe(false);
    expect(foldTranslationPatch({ i18n_ja_name_th: null }, { ja: { name_th: "a" } })).toEqual({ translations: {} });
  });
});

describe("ช่องคำนวณภาษาญี่ปุ่น (lib/computed-text)", () => {
  it("ยังไม่มีชื่อ/คำอธิบายญี่ปุ่น = ว่าง (ไม่เอาไทยมาปน)", () => {
    const row = { code: "WL46", name_th: "กระเป๋าสตางค์", brand_label: "Louis Montini", introduction: "ไทย" };
    expect(computedTextValue("name_platform_code_ja", row, null)).toBe("");
    expect(computedTextValue("platform_description_ja", row, null)).toBe("");
  });
  it("มีคำแปลแล้ว = ประกอบจากช่องญี่ปุ่น", () => {
    const row = { code: "WL46", i18n_ja_name_th: "本革財布", i18n_ja_introduction: "かわいい", i18n_ja_description: "- 牛革100%", size_length_cm: 14, size_height_cm: 10, size_thickness_cm: 3, brand_label: "Louis Montini" };
    expect(computedTextValue("name_platform_code_ja", row, null)).toBe("本革財布 WL46");
    const d = computedTextValue("platform_description_ja", row, null) ?? "";
    expect(d).toContain("かわいい");
    expect(d).toContain("サイズ: 14 x 10 x 3 cm");
    expect(d).toContain("Louis Montini Official");
  });
});
