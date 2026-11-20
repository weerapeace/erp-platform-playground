import { describe, expect, it } from "vitest";
import { HW_WORDS } from "@/lib/design-library-hwtags";
import { HARDWARE_WORDS, MATERIAL_RULES, codePrefix, looksFinishedProduct, matchTagByName, normName, suggestMaterial, CATEGORY_TAG_ALIASES } from "@/lib/tag-suggest-rules";

const tagOf = (code: string, name: string) => suggestMaterial(code, name)?.rule.tag ?? null;

describe("ระบบช่วยเดาแท็ก — ชนิดวัตถุดิบ (ตัวอย่างจากข้อมูลจริง 2026-11-15)", () => {
  it("รหัสนำหน้าชัด ๆ ชนะ แม้ชื่อเป็นแค่รหัส", () => {
    expect(tagOf("LEA.K-SAF-005", "LEA.K-SAF-005")).toBe("หนัง");
    expect(tagOf("THREAD-60#764", "THREAD-60#764")).toBe("ด้าย");
    expect(tagOf("ZH-NL-NO.5-G+P", "หัวซิปไนล่อน#5 พร้อมหางสีทอง YKK")).toBe("ซิป");
    expect(suggestMaterial("ZIP-N-NO.5#A604", "ซิปไนล่อน#5")?.reason).toBe("รหัสขึ้นต้น ZIP");
  });
  it("คำในชื่อ", () => {
    expect(tagOf("M638-12-2903", "พียูหนังเทียม M638#12-2903 สีม่วง")).toBe("PU");
    expect(tagOf("B08247/25MM#46", "หัวเข็มขัดหัวเข็ม 2.5 cm. สีทองด้าน")).toBe("อะไหล่");
    expect(tagOf("TAIL/33MM#11", "กิ้ปหนีบขนาด 3.3 cm. สีโครเมียม")).toBe("อะไหล่");
    expect(tagOf("BT004/12MM#N", "ก้นกระเป๋าขาฉีก 1.2 cm. สีนิเกิ้ล")).toBe("อะไหล่");
    expect(tagOf("G5*33*6.5/33MM#GUN", "สี่เหลี่ยม 3.3 cm. สูง 2 cm. สีรมดำ")).toBe("อะไหล่");
    expect(tagOf("FAB-X", "ผ้าลายสี่เหลี่ยม 3 สี")).toBe("ผ้า");
    expect(tagOf("RAW00004-A165", "กุ้น 6 หุน (เมืองจีน) สีเขียวมิ้นท์")).toBe("สาย/เทป");
    expect(suggestMaterial("SP003", "ฟองน้ำ 6 มิล")?.reason).toBe("เจอคำ “ฟองน้ำ”");
  });
  it("กับดักคำ: หนังยาง / ผ้าใบด้ายขาว / กรรไกรตัดด้าย / ถุงห่อด้าย", () => {
    expect(tagOf("PP-006", "หนังยาง")).toBeNull();
    expect(tagOf("CNV38-005", "ผ้าใบ 1.5 นิ้ว สีเทา-ด้ายขาว")).toBe("ผ้า");
    expect(tagOf("EQ-029", "กรรไกรตัดด้าย")).toBe("อุปกรณ์");
    expect(tagOf("ETC00002/11*23", "ถุงห่อด้าย ขนาด 11*23 cm.")).toBe("บรรจุภัณฑ์");
    expect(tagOf("IG-PACK-OR-001", "กล่อง IG สีส้ม ใส่ด้าย 4 หลอด")).toBe("บรรจุภัณฑ์");
  });
  it("สินค้าสำเร็จรูปไม่เดาเป็นวัตถุดิบ · ชื่อว่าง/ไม่ตรง = null", () => {
    expect(looksFinishedProduct("กระเป๋าเป้ โชว์ตุ๊กตา สีฟ้า")).toBe(true);
    expect(looksFinishedProduct("JACOB เข็มขัดริมบางเย็บเดี่ยวหนังฟองโก้")).toBe(true);
    expect(looksFinishedProduct("ก้นกระเป๋า 0.8 cm.")).toBe(false);
    expect(looksFinishedProduct("หัวเข็มขัดออโต้ 35 mm.")).toBe(false);
    expect(tagOf("ELLE-012", "เข็มขัดหนังวัวรูขน 1.2 นิ้ว หัวออโต้")).toBeNull();
    expect(tagOf("WHB24-09", "WHB24-09")).toBeNull();
    expect(tagOf("", "")).toBeNull();
  });
  it("กลุ่มที่ต้องสร้างแท็กก่อน = conf new · กลุ่มยอมรับทั้งกลุ่ม = high", () => {
    const conf = Object.fromEntries(MATERIAL_RULES.map((r) => [r.key, r.conf]));
    expect(conf).toMatchObject({ zip: "high", leather: "high", pu: "high", hardware: "high", fabric: "check", tape: "check", thread: "new", packaging: "new" });
    expect(new Set(MATERIAL_RULES.map((r) => r.key)).size).toBe(MATERIAL_RULES.length);
  });
  it("คำอะไหล่รวมของ Design Library ครบ (แก้ที่เดียว) และไม่มีหัวซิป", () => {
    for (const w of HW_WORDS) expect(HARDWARE_WORDS).toContain(w);
    expect(HARDWARE_WORDS).not.toContain("หัวซิป");
  });
});

describe("ระบบช่วยเดาแท็ก — ก๊อปจากแบรนด์/หมวด", () => {
  const tags = [{ name: "Louis Montini" }, { name: "IG International" }, { name: "จิวเวลรี" }, { name: "กระเป๋าสตางค์" }];
  it("จับชื่อแบบไม่สนตัวพิมพ์/ช่องว่าง/พินทุ", () => {
    expect(codePrefix("ZIP-N-NO.5#A604")).toBe("ZIP");
    expect(codePrefix("52196")).toBe("");
    expect(normName("ฺBrands ")).toBe("brands");
    expect(matchTagByName("louis  montini", tags)?.name).toBe("Louis Montini");
    expect(matchTagByName("Pixie Dustie", tags)).toBeNull();
    expect(matchTagByName("", tags)).toBeNull();
  });
  it("หมวดที่สะกดต่าง (Jelwery → จิวเวลรี)", () => {
    expect(matchTagByName("Jelwery", tags, CATEGORY_TAG_ALIASES)?.name).toBe("จิวเวลรี");
    expect(matchTagByName("กระเป๋าสตางค์", tags, CATEGORY_TAG_ALIASES)?.name).toBe("กระเป๋าสตางค์");
  });
});

// 2026-11-20: เดาแท็กตอนสร้าง SKU / Parent
import { suggestTagsForNewItem } from "@/lib/tag-suggest-rules";
describe("suggestTagsForNewItem", () => {
  const groups = [
    { id: "gb", name: "ฺBrands", parent_group_id: null },
    { id: "gc", name: "หมวดหมู่สินค้า", parent_group_id: null },
    { id: "gm", name: "วัตถุดิบ", parent_group_id: null, single_select: true },
  ];
  const T = [
    { id: "lm", name: "Louis Montini", group_id: "gb" },
    { id: "bag", name: "กระเป๋า", group_id: "gc" },
    { id: "belt", name: "เข็มขัด", group_id: "gc" },
    { id: "zip", name: "ซิป", group_id: "gm" },
    { id: "lea", name: "หนัง", group_id: "gm" },
    { id: "can", name: "ผ้าแคนวาส", group_id: "gm" },
  ];
  const ids = (xs: { tagId: string }[]) => xs.map((x) => x.tagId).sort();

  it("สินค้าสำเร็จ: แบรนด์+หมวดจากชื่อ ไม่เดาวัตถุดิบ", () => {
    const r = suggestTagsForNewItem({ name: "Louis Montini กระเป๋าหนังแท้ ซิปไนล่อน" }, T, groups);
    expect(ids(r)).toEqual(["bag", "lm"]);
  });
  it("แบรนด์/หมวดที่เลือกไว้ + แท็กของ Parent = แน่นอน", () => {
    const r = suggestTagsForNewItem({ name: "x", brandName: "Louis Montini", categoryName: "เข็มขัด", parentTagIds: ["bag"] }, T, groups);
    expect(r.every((x) => x.conf === "sure")).toBe(true);
    expect(ids(r)).toEqual(["bag", "belt", "lm"]);
  });
  it("วัตถุดิบ: เดาผ่านกฎรหัส/ชื่อ + แท็กชื่อตรง", () => {
    expect(ids(suggestTagsForNewItem({ code: "ZIP-N-5", name: "ซิปไนล่อน #5" }, T, groups))).toEqual(["zip"]);
    expect(ids(suggestTagsForNewItem({ name: "ผ้าแคนวาส สีดำ" }, T, groups))).toEqual(["can"]);
  });
  it("ไม่มีอะไรตรง = ว่าง", () => {
    expect(suggestTagsForNewItem({ name: "" }, T, groups)).toEqual([]);
  });
});
