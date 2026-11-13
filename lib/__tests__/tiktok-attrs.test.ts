import { describe, expect, test } from "vitest";
import {
  ttsAttrFieldsOf, ttsCategoryRulesOf, ttsAttrStateOf, ttsAttrDef, ttsAttrToText, ttsAttrFromText, ttsAttrDisplay, ttsAttrPayload, sameAttrState,
  planTiktokAttrs, planTiktokCod, planTiktokSizeChart, kgToUnit, unitToKg,
} from "@/lib/tiktok-attrs";

// รูปตามเอกสาร Get Attributes 202309 (is_requried สะกดตามเอกสาร)
const raw = [
  { id: "100107", name: "ประเภทของกระเป๋า", type: "PRODUCT_PROPERTY", is_requried: true, values: [{ id: "1", name: "กระเป๋าถือ" }, { id: "2", name: "กระเป๋าสะพาย" }] },
  { id: "100198", name: "วัสดุ", type: "PRODUCT_PROPERTY", is_requried: false, is_customizable: true, is_multiple_selection: true, values: [{ id: "11", name: "หนังวัว" }, { id: "12", name: "ไนล่อน" }] },
  { id: "100000", name: "สี", type: "SALES_PROPERTY", is_requried: true, values: [] },
  { id: "100300", name: "น้ำหนักสุทธิ", type: "PRODUCT_PROPERTY", value_data_format: "POSITIVE_INT_OR_DECIMAL", values: [] },
];
const fields = ttsAttrFieldsOf(raw);

describe("คุณลักษณะของหมวด TikTok", () => {
  test("อ่านช่องจาก Get Attributes — เฉพาะช่องสินค้า · บังคับขึ้นก่อน", () => {
    expect(fields.map((f) => f.id)).toEqual(["100107", "100198", "100300"]);
    expect(fields[0]).toMatchObject({ required: true, multiple: false, customizable: false });
    expect(fields[1]).toMatchObject({ multiple: true, customizable: true });
    expect(fields[2]).toMatchObject({ numeric: true, options: [] });
  });
  test("แปลงเป็นช่องกรอกกลาง (LazadaAttrField)", () => {
    expect(ttsAttrDef(fields[0])).toMatchObject({ name: "100107", label: "ประเภทของกระเป๋า", required: true, input_type: "singleSelect", choices: [{ en: "1", name: "กระเป๋าถือ" }, { en: "2", name: "กระเป๋าสะพาย" }] });
    expect(ttsAttrDef(fields[1]).input_type).toBe("multiEnumInput");
    expect(ttsAttrDef(fields[2]).input_type).toBe("numeric");
  });
  test("ข้อความในช่องกรอก ↔ ค่า (id / ชื่อในรายการ / ค่ากำหนดเอง)", () => {
    expect(ttsAttrFromText(fields[0], "1")).toEqual([{ id: "1", name: "กระเป๋าถือ" }]);
    expect(ttsAttrFromText(fields[1], "11, ไนล่อน, ผ้าแคนวาส")).toEqual([{ id: "11", name: "หนังวัว" }, { id: "12", name: "ไนล่อน" }, { name: "ผ้าแคนวาส" }]);
    expect(ttsAttrFromText(fields[0], "")).toEqual([]);
    expect(ttsAttrToText([{ id: "11", name: "หนังวัว" }, { name: "ผ้าแคนวาส" }])).toBe("11,ผ้าแคนวาส");
    expect(ttsAttrDisplay(fields[1], [{ id: "11" }, { name: "ผ้าแคนวาส" }])).toBe("หนังวัว, ผ้าแคนวาส");
  });
  test("ค่าจาก Get Product + payload ส่งทั้งชุด (id มาก่อน name)", () => {
    const st = ttsAttrStateOf([{ id: "100107", name: "ประเภท", values: [{ id: "1", name: "กระเป๋าถือ" }] }, { id: "999", values: [] }]);
    expect(st).toEqual({ "100107": [{ id: "1", name: "กระเป๋าถือ" }] });
    expect(ttsAttrPayload({ ...st, "100198": [{ name: "ผ้าแคนวาส" }] })).toEqual([{ id: "100107", values: [{ id: "1" }] }, { id: "100198", values: [{ name: "ผ้าแคนวาส" }] }]);
    expect(sameAttrState({ a: [{ id: "1", name: "x" }] }, { a: [{ id: "1" }] })).toBe(true);
  });
  test("แผน: แก้ = ส่งทั้งชุด + บอกก่อน→หลัง · ช่องบังคับว่าง = error (แก้ของขาย) / เตือน (ร่าง)", () => {
    const base = { "100107": [{ id: "1", name: "กระเป๋าถือ" }] };
    const p = planTiktokAttrs(fields, base, { ...base, "100198": [{ id: "11" }] });
    expect(p.changed).toBe(true);
    expect(p.changes).toEqual([{ label: "วัสดุ", before: "(ว่าง)", after: "หนังวัว" }]);
    expect(p.payload).toHaveLength(2);
    expect(p.errors).toEqual([]);
    const cleared = planTiktokAttrs(fields, base, {});
    expect(cleared.errors.join(" ")).toContain("ช่องบังคับ");
    expect(planTiktokAttrs(fields, {}, {}, { strictRequired: false }).warnings.join(" ")).toContain("ฉบับร่าง");
    expect(planTiktokAttrs(fields, base, base).changed).toBe(false);
  });
  test("ช่องที่ห้ามพิมพ์เอง = error ถ้าค่าไม่อยู่ในรายการ · เลือกค่าเดียวเกิน = error", () => {
    expect(planTiktokAttrs(fields, {}, { "100107": [{ name: "กระเป๋าคาดอก" }] }).errors.join(" ")).toContain("ต้องเลือกจากรายการ");
    expect(planTiktokAttrs(fields, {}, { "100107": [{ id: "1" }, { id: "2" }] }).errors.join(" ")).toContain("ค่าเดียว");
  });
});

describe("กติกาหมวด · COD · ตารางขนาด · หน่วยน้ำหนัก", () => {
  test("อ่านกติกาของหมวด", () => {
    expect(ttsCategoryRulesOf({ cod: { is_supported: true }, size_chart: { is_supported: false, is_required: false } })).toEqual({ codSupported: true, sizeChartSupported: false, sizeChartRequired: false });
    expect(ttsCategoryRulesOf({})).toEqual({ codSupported: null, sizeChartSupported: null, sizeChartRequired: null });
  });
  test("COD: เปลี่ยนไหม · หมวดไม่รองรับ = error เมื่อเปิด", () => {
    expect(planTiktokCod(false, true, true)).toMatchObject({ changed: true, errors: [], change: { before: "ปิด", after: "เปิด" } });
    expect(planTiktokCod(false, true, false).errors[0]).toContain("ไม่รองรับ");
    expect(planTiktokCod(true, true, null).changed).toBe(false);
    expect(planTiktokCod(null, null, null).changed).toBe(false);
  });
  test("ตารางขนาด: รูปใหม่ = เปลี่ยน · ลบไม่ได้ · หมวดไม่รองรับ = error", () => {
    expect(planTiktokSizeChart(null, "r2:sz.jpg", null)).toMatchObject({ changed: true, errors: [], change: { label: "ตารางขนาด", before: "ไม่มี", after: "รูปใหม่" } });
    expect(planTiktokSizeChart("tts:tos/1", "tts:tos/1", null).changed).toBe(false);
    expect(planTiktokSizeChart("tts:tos/1", null, null).errors[0]).toContain("ลบตารางขนาดไม่ได้");
    expect(planTiktokSizeChart(null, "r2:x", { codSupported: null, sizeChartSupported: false, sizeChartRequired: null }).errors[0]).toContain("ไม่รองรับ");
  });
  test("หน่วยน้ำหนัก กรัม ↔ กิโลกรัม (เก็บเป็นกิโลกรัม)", () => {
    expect(kgToUnit(0.35, "g")).toBe(350);
    expect(unitToKg(350, "g")).toBe(0.35);
    expect(kgToUnit(0.35, "kg")).toBe(0.35);
    expect(unitToKg(null, "g")).toBeNull();
  });
});
