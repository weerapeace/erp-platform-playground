import { describe, it, expect } from "vitest";
import { TEXT_COMPUTES } from "@/lib/computed-text";
import { buildDescription, cleanDescBlocks, DEFAULT_DESC_BLOCKS, descRuleTrue, descTokensIn, descWhenTrue, fillDescText, sizeLineOf, type DescRule } from "@/lib/desc-blocks";

const ROW = {
  code: "ROR01", name_th: "กระเป๋า ROAR", brand_name: "Louis Montini",
  introduction: "เตรียมพบกับคอลเลคชั่น ROAR 2000s", introduction_en: "Meet the ROAR 2000s collection",
  description: "- วัสดุ: Metallic polyurethane\n- ด้านใน 1 ช่องหลัก", english_description: "- Material: Metallic PU",
  size_length_cm: 24, size_height_cm: 15, size_thickness_cm: 8, weight_g: 450, show_weight: true,
  size_description: "วัดจากด้านนอก", how_to_size: "วัดกว้างสุด", special_description: "ของแถม: พวงกุญแจ", warranty: "1 ปี",
};
const legacyTh = (r: Record<string, unknown>) => TEXT_COMPUTES.platform_description.fn(r);
const legacyEn = (r: Record<string, unknown>) => TEXT_COMPUTES.platform_description_en.fn(r);

describe("คำอธิบายเป็นบล็อก (Platform Description)", () => {
  it("ยังไม่ตั้งค่า = สูตรเดิมทุกตัวอักษร", () => {
    expect(TEXT_COMPUTES.platform_description.fn(ROW, null)).toBe(legacyTh(ROW));
    expect(TEXT_COMPUTES.platform_description.fn(ROW, {})).toBe(legacyTh(ROW));
  });
  it("บล็อกตั้งต้น = ข้อความเดียวกับสูตรเดิม (ต่างแค่เว้นวรรค 2 ช่องหน้าบทนำ) ทั้งไทยและอังกฤษ", () => {
    const cfg = { blocks: DEFAULT_DESC_BLOCKS };
    expect(buildDescription(ROW, cfg, "th")).toBe(legacyTh(ROW).replace(/^ {2}/, ""));
    expect(buildDescription(ROW, cfg, "en")).toBe(legacyEn(ROW).replace(/^ {2}/, ""));
    // ไม่มีรับประกัน/แบรนด์/ขนาด ก็ยังตรง
    const bare = { ...ROW, warranty: "ไม่มีรับประกัน", brand_name: "", size_length_cm: 0, size_height_cm: 0, custom_size: "", show_weight: false, size_description: "", how_to_size: "", special_description: "" };
    expect(buildDescription(bare, cfg, "th")).toBe(legacyTh(bare).replace(/^ {2}/, ""));
    expect(buildDescription(bare, cfg, "en")).toBe(legacyEn(bare).replace(/^ {2}/, ""));
  });
  it("ตั้งค่าแล้ว: ปิดบล็อก · สลับลำดับ · แก้ข้อความ · เพิ่มข้อความเอง", () => {
    const cfg = { desc_blocks: { blocks: [
      { key: "text", id: "t1", on: true, gap: "blank", text: "🔥 {แบรนด์} ของแท้ รหัส {รหัส}", text_en: "Authentic {แบรนด์}" },
      { key: "details", on: true, gap: "blank", text: "สเปก" },
      { key: "intro", on: true, gap: "blank" },
      { key: "ordering", on: false, gap: "blank" },
      { key: "warranty", on: true, gap: "line", text: "รับประกัน {รับประกัน} เต็ม" },
    ] } };
    expect(TEXT_COMPUTES.platform_description.fn(ROW, cfg)).toBe(
      "🔥 Louis Montini ของแท้ รหัส ROR01\n\nสเปก\n- วัสดุ: Metallic polyurethane\n- ด้านใน 1 ช่องหลัก\n\nเตรียมพบกับคอลเลคชั่น ROAR 2000s\nรับประกัน 1 ปี เต็ม");
    expect(TEXT_COMPUTES.platform_description_en.fn(ROW, cfg)).toBe(
      "Authentic Louis Montini\n\nProduct details\n- Material: Metallic PU\n\nMeet the ROAR 2000s collection\n**Warranty: 1 year(s)**");
  });
  it("ล้างค่า: บล็อกระบบซ้ำทิ้ง · ข้อความพิมพ์เองว่างทิ้ง · ว่าง = ค่าตั้งต้น", () => {
    const c = cleanDescBlocks({ blocks: [{ key: "intro" }, { key: "intro" }, { key: "text", text: " " }, { key: "x" }] });
    expect(c.blocks.map((b) => b.key)).toEqual(["intro"]);
    expect(cleanDescBlocks(null).blocks.length).toBe(DEFAULT_DESC_BLOCKS.length);
  });
  it("แทรกได้ทุกฟิลด์ {คีย์} — relation โชว์ชื่อ · ตัวเลข/ใช่-ไม่ใช่/วันที่/รายการ อ่านได้ · {คำไทยอื่น} คงไว้", () => {
    const r = { ...ROW, collection_id: "uuid-1", collection_label: "ROAR", sale_price: 1290, is_active: true, created_at: "2026-10-20T03:00:00+00:00", highlights: ["กันน้ำ", { label: "เบา" }] };
    expect(fillDescText("{collection_id} · {sale_price} บาท · {is_active} · {created_at} · {highlights} · {ไม่ใช่ฟิลด์} · {nope}", r, "th"))
      .toBe("ROAR · 1,290 บาท · ใช่ · 20/10/2026 · กันน้ำ, เบา · {ไม่ใช่ฟิลด์} ·");
    expect(fillDescText("{is_active}", r, "en")).toBe("Yes");
  });
  it("ถ้า… : เงื่อนไขทุกแบบ + ทุกข้อ/ข้อใดข้อหนึ่ง", () => {
    const r = { ...ROW, weight_g: 0, show_weight: false, sale_price: 1290, collection_id: "c1", collection_label: "ROAR" };
    const t = (field: string, op: DescRule["op"], value?: string) => descRuleTrue({ field, op, value }, r);
    expect([t("brand_name", "filled"), t("weight_g", "filled"), t("weight_g", "empty"), t("special_description", "filled")]).toEqual([true, false, true, true]);
    expect([t("brand_name", "eq", "louis montini"), t("collection_id", "eq", "ROAR"), t("collection_id", "eq", "c1"), t("warranty", "neq", "1 ปี")]).toEqual([true, true, true, false]);
    expect([t("name_th", "contains", "roar"), t("name_th", "not_contains", "ROAR")]).toEqual([true, false]);
    expect([t("sale_price", "gt", "1000"), t("sale_price", "lt", "1000"), t("sale_price", "gt", "")]).toEqual([true, false, false]);
    expect([t("show_weight", "true"), t("show_weight", "false")]).toEqual([false, true]);
    const any = { match: "any" as const, rules: [{ field: "weight_g", op: "filled" as const }, { field: "brand_name", op: "filled" as const }] };
    expect(descWhenTrue(any, r)).toBe(true);
    expect(descWhenTrue({ ...any, match: "all" }, r)).toBe(false);
    expect(descWhenTrue(undefined, r)).toBe(true);
  });
  it("บล็อกมีเงื่อนไข: ไม่ตรง = ข้าม หรือใช้ข้อความแทน · ล้างค่าเงื่อนไขเสียทิ้ง", () => {
    const cfg = { blocks: [
      { key: "intro", on: true, gap: "blank", when: { match: "all", rules: [{ field: "brand_name", op: "eq", value: "Pixiedustie" }] } },
      { key: "text", id: "t1", on: true, gap: "blank", text: "ส่งฟรี {brand_name}", else_text: "ค่าส่งตามจริง", when: { match: "all", rules: [{ field: "sale_price", op: "gt", value: "1000" }] } },
      { key: "notes", on: true, gap: "line", when: { rules: [{ field: "bad key!", op: "filled" }, { field: "code", op: "weird" }] } },
    ] };
    expect(buildDescription({ ...ROW, sale_price: 500 }, cfg, "th")).toBe("ค่าส่งตามจริง\nNotes:");
    expect(buildDescription({ ...ROW, sale_price: 1500 }, cfg, "th")).toBe("ส่งฟรี Louis Montini\nNotes:");
    expect(buildDescription({ ...ROW, sale_price: 500 }, cfg, "en")).toBe("Notes:");   // ข้อความแทนอังกฤษว่าง = ข้าม
    const c = cleanDescBlocks(cfg);
    expect(c.blocks.find((b) => b.key === "notes")?.when).toBeUndefined();
    expect(c.blocks.find((b) => b.key === "intro")?.else_text).toBeUndefined();
    expect(descTokensIn("ผ่าน {แบรนด์} {sale_price} {sale_price} {ไทย}")).toEqual(["แบรนด์", "sale_price"]);
  });
  it("ตัวแทน + บรรทัดขนาด", () => {
    expect(fillDescText("ผ่าน {แบรนด์} Official", { brand_name: "" }, "th")).toBe("ผ่าน Official");
    expect(sizeLineOf({ size_length_cm: 0, size_height_cm: 0, custom_size: "ฟรีไซส์" }, "th")).toBe("- ขนาดสินค้า: ฟรีไซส์");
  });
});
