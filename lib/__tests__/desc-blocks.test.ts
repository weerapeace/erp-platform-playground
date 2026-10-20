import { describe, it, expect } from "vitest";
import { TEXT_COMPUTES } from "@/lib/computed-text";
import { buildDescription, cleanDescBlocks, DEFAULT_DESC_BLOCKS, fillDescText, sizeLineOf } from "@/lib/desc-blocks";

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
  it("ตัวแทน + บรรทัดขนาด", () => {
    expect(fillDescText("ผ่าน {แบรนด์} Official", { brand_name: "" }, "th")).toBe("ผ่าน Official");
    expect(sizeLineOf({ size_length_cm: 0, size_height_cm: 0, custom_size: "ฟรีไซส์" }, "th")).toBe("- ขนาดสินค้า: ฟรีไซส์");
  });
});
