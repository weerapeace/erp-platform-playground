import { describe, expect, test } from "vitest";
import { attrAiPrompt, parseAttrAiResult, AI_ATTR_MAX_OPTIONS, type AiAttrField } from "@/lib/attr-ai-fill";

const FIELDS: AiAttrField[] = [
  { id: "1", name: "วัสดุ", required: true, multiple: false, customizable: false, options: [{ id: "11", name: "หนังวัว" }, { id: "12", name: "หนัง PU" }] },
  { id: "2", name: "สไตล์", multiple: true, customizable: false, options: [{ id: "21", name: "Casual" }, { id: "22", name: "Vintage" }, { id: "23", name: "Formal" }] },
  { id: "3", name: "ความยาว (ซม.)", multiple: false, customizable: true, numeric: true, options: [] },
  { id: "4", name: "ประเทศผู้ผลิต", multiple: false, customizable: true, options: [{ id: "41", name: "ไทย" }] },
];

describe("AI เติมช่องคุณลักษณะ (ของกลาง)", () => {
  test("คำสั่ง: ส่งเฉพาะข้อมูลที่ให้ · บอกช่องพิมพ์เอง/ตัวเลข · ตัดตัวเลือกยาวเกิน", () => {
    const many: AiAttrField = { id: "9", name: "สี", multiple: false, options: Array.from({ length: 300 }, (_, i) => ({ id: String(i), name: `สี${i}` })) };
    const p = attrAiPrompt({ platform: "Shopee", name: "เข็มขัดหนังวัว", description: "ยาว 110 ซม.", category: "100032 · เข็มขัด", fields: [...FIELDS, many] });
    expect(p.system).toContain("Shopee");
    expect(p.system).toContain("never guess");
    const u = JSON.parse(p.user);
    expect(u.product.name).toBe("เข็มขัดหนังวัว");
    expect(u.fields.find((f: { id: string }) => f.id === "3")).toMatchObject({ free_text: true, numeric: true });
    expect(u.fields.find((f: { id: string }) => f.id === "1")).toMatchObject({ free_text: false, options: ["หนังวัว", "หนัง PU"] });
    expect(u.fields.find((f: { id: string }) => f.id === "9").options).toHaveLength(AI_ATTR_MAX_OPTIONS);
  });
  test("คำตอบ → ตัวเลือกจริง · พิมพ์เองได้เฉพาะช่องที่อนุญาต · ตัวเลขต้องเป็นตัวเลข · ค่าเดียว/หลายค่า", () => {
    const hits = parseAttrAiResult({ fields: [
      { id: "1", values: ["หนังวัว", "หนัง PU"] },        // ค่าเดียว → เอาตัวแรก
      { id: "2", values: ["vintage", "Casual", "Boho"] },  // หลายค่า · ตัวพิมพ์เล็ก/ใหญ่ไม่สน · Boho ไม่อยู่ในรายการ = ตัด
      { id: "3", values: ["110 cm"] },                      // ตัวเลขไม่ใช่ล้วน = ตัด
      { id: "4", values: ["จีน"] },                          // พิมพ์เองได้
      { id: "999", values: ["x"] },                          // ช่องที่ไม่ได้ถาม = ตัด
    ] }, FIELDS);
    expect(hits).toEqual([
      { fieldId: "1", fieldName: "วัสดุ", values: [{ id: "11", name: "หนังวัว" }] },
      { fieldId: "2", fieldName: "สไตล์", values: [{ id: "22", name: "Vintage" }, { id: "21", name: "Casual" }] },
      { fieldId: "4", fieldName: "ประเทศผู้ผลิต", values: [{ id: "", name: "จีน" }] },
    ]);
    expect(parseAttrAiResult({ fields: [{ id: "3", value: "110" }] }, FIELDS)).toEqual([{ fieldId: "3", fieldName: "ความยาว (ซม.)", values: [{ id: "", name: "110" }] }]);
    expect(parseAttrAiResult(null, FIELDS)).toEqual([]);
    expect(parseAttrAiResult({ attributes: [{ field_id: "1", values: ["หนัง pu"] }] }, FIELDS)).toEqual([{ fieldId: "1", fieldName: "วัสดุ", values: [{ id: "12", name: "หนัง PU" }] }]);
  });
});
