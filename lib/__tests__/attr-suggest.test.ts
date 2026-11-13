import { describe, expect, it } from "vitest";
import { suggestAttrsFromText, suggestText } from "@/lib/attr-suggest";

const fields = [
  { id: "mat", name: "วัสดุ", multiple: true, options: [{ id: "1", name: "หนัง" }, { id: "2", name: "หนัง PU" }, { id: "3", name: "ไนลอน" }, { id: "4", name: "ยาง" }, { id: "5", name: "PVC" }] },
  { id: "cls", name: "ประเภทการปิด", multiple: false, options: [{ id: "a", name: "ซิป" }, { id: "b", name: "ปิดด้วยแม่เหล็ก" }] },
  { id: "dg", name: "Contains dangerous goods?", multiple: false, options: [{ id: "y", name: "Yes" }, { id: "n", name: "No" }] },
  { id: "ft", name: "คุณสมบัติ", multiple: true, options: [{ id: "w", name: "กันน้ำ" }, { id: "r", name: "RFID" }] },
];

describe("suggestAttrsFromText", () => {
  it("อ่านจากชื่อ + รายละเอียด (ตัดแท็ก HTML) → แนะนำวัสดุ/การปิด/คุณสมบัติ", () => {
    const text = suggestText("กระเป๋าสะพาย หนัง PU กันน้ำ", "<p>ช่องใส่ของมีซิป 2 ช่อง</p><p>ซิปแข็งแรง &nbsp;ไม่มี RFIDs</p>");
    const hits = suggestAttrsFromText(fields, text);
    expect(hits).toEqual([
      { fieldId: "mat", fieldName: "วัสดุ", values: [{ id: "2", name: "หนัง PU" }] },
      { fieldId: "cls", fieldName: "ประเภทการปิด", values: [{ id: "a", name: "ซิป" }] },
      { fieldId: "ft", fieldName: "คุณสมบัติ", values: [{ id: "w", name: "กันน้ำ" }] },
    ]);
  });
  it("คำสั้นโผล่แยกที่อื่นด้วย = แนะนำทั้งคู่ · คำกลาง ๆ (Yes/No) ไม่นับ · อังกฤษต้องเป็นคำเต็ม", () => {
    const hits = suggestAttrsFromText(fields, suggestText("หนัง PU ด้านนอก ด้านในหนังแท้ yes no pvc"));
    expect(hits.find((h) => h.fieldId === "mat")!.values.map((v) => v.name)).toEqual(["หนัง", "หนัง PU", "PVC"]);
    expect(hits.find((h) => h.fieldId === "dg")).toBeUndefined();
  });
  it("ข้ามช่องที่มีค่าแล้ว · ข้อความว่าง = ไม่มี", () => {
    expect(suggestAttrsFromText(fields, suggestText("ซิป หนัง"), { skip: (id) => id === "cls" }).map((h) => h.fieldId)).toEqual(["mat"]);
    expect(suggestAttrsFromText(fields, "")).toEqual([]);
  });
});
