import { describe, expect, it } from "vitest";
import { buildCopyRows, defaultCopySelection, isEmptyCopyValue, isSameCopyValue } from "@/lib/copy-record-diff";

describe("copy-record-diff", () => {
  it("ค่าว่างหลายแบบ", () => {
    for (const v of [null, undefined, "", "  ", "-", "—", [], {}, "<p></p>", "<p>&nbsp;</p>"]) expect(isEmptyCopyValue(v)).toBe(true);
    for (const v of [0, false, "a", ["x"], { a: 1 }, "<p>ก</p>"]) expect(isEmptyCopyValue(v)).toBe(false);
  });

  it("เทียบเท่ากัน: ตัวเลขกับข้อความตัวเลข · ช่องว่างหัวท้าย · ลำดับคีย์ object", () => {
    expect(isSameCopyValue(9, "9")).toBe(true);
    expect(isSameCopyValue(" ซองใส่บัตร ", "ซองใส่บัตร")).toBe(true);
    expect(isSameCopyValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(isSameCopyValue(null, "")).toBe(true);
    expect(isSameCopyValue(11.5, 12)).toBe(false);
  });

  it("แบ่งสถานะ + นับช่องที่จะทับ + ค่าเริ่มต้นติ๊กเฉพาะที่ต่าง", () => {
    const rows = buildCopyRows(
      ["name_platform", "introduction", "description", "width", "note"],
      { name_platform: "ชื่อเดิม", introduction: "", description: "เหมือนกัน", width: 9, note: "มีค่า" },
      { name_platform: "ชื่อใหม่", introduction: "ข้อความ", description: "เหมือนกัน", width: "9", note: "" },
    );
    expect(rows).toEqual([
      { key: "name_platform", status: "change", overwrite: true },
      { key: "introduction", status: "change", overwrite: false },
      { key: "description", status: "same", overwrite: false },
      { key: "width", status: "same", overwrite: false },
      { key: "note", status: "empty_source", overwrite: false },
    ]);
    expect(defaultCopySelection(rows)).toEqual(["name_platform", "introduction"]);
  });
});
