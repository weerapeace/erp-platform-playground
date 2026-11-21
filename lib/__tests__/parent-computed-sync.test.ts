/**
 * เทสต์ส่วนคิด "เขียนช่องคำนวณของ Parent SKU ลงคอลัมน์" (lib/parent-computed-sync) — เจ้าของสั่งแก้ที่ต้นทาง 2026-11-21
 */
import { describe, it, expect } from "vitest";
import { SYNCED_PARENT_COMPUTES, canonText, planParentComputedSync, previewText } from "../parent-computed-sync";
import { TEXT_COMPUTES } from "../computed-text";

const cols = ["platform_description", "size_summary"];

describe("planParentComputedSync", () => {
  it("คอลัมน์เป็นข้อความเก่า → เขียนค่าที่คำนวณได้ · ตรงกันแล้ว = ไม่แตะ", () => {
    const plan = planParentComputedSync(
      [
        { id: "a", code: "LY22", platform_description: "ข้อความเก่า Larkspur #21", size_summary: "30 x 20 cm. (กว้าง x ยาว)" },
        { id: "b", code: "LY23", platform_description: "ตรงแล้ว", size_summary: "10 x 5 cm. (กว้าง x ยาว)" },
      ],
      {
        a: { platform_description: "Fleur De Juillet ใหม่", size_summary: "30 x 20 cm. (กว้าง x ยาว)" },
        b: { platform_description: "ตรงแล้ว", size_summary: "10 x 5 cm. (กว้าง x ยาว)" },
      },
      cols,
    );
    expect(plan.checked).toBe(2);
    expect(plan.changes).toEqual([{ id: "a", code: "LY22", fields: [{ column: "platform_description", old: "ข้อความเก่า Larkspur #21", new: "Fleur De Juillet ใหม่" }] }]);
    expect(plan.byField).toEqual({ platform_description: 1 });
  });

  it("สูตรได้ค่าว่าง → ไม่ลบข้อความเดิม (นับ keptBlank) · คอลัมน์ว่างเดิม + สูตรได้ค่า = เขียน", () => {
    const plan = planParentComputedSync(
      [{ id: "a", code: "X", platform_description: "ยังมีข้อความ", size_summary: null }],
      { a: { platform_description: "   ", size_summary: "12 x 8 cm. (กว้าง x ยาว)" } },
      cols,
    );
    expect(plan.keptBlank).toBe(1);
    expect(plan.changes[0].fields).toEqual([{ column: "size_summary", old: null, new: "12 x 8 cm. (กว้าง x ยาว)" }]);
  });

  it("ต่างแค่ \\r\\n กับ \\n = ไม่นับว่าเปลี่ยน · รุ่นที่คำนวณไม่ได้ = ข้าม ไม่นับ · คอลัมน์ที่ไม่ได้คำนวณ = ไม่แตะ", () => {
    const plan = planParentComputedSync(
      [{ id: "a", code: "A", platform_description: "บรรทัด 1\r\nบรรทัด 2" }, { id: "z", code: "Z", platform_description: "เก่า" }],
      { a: { platform_description: "บรรทัด 1\nบรรทัด 2" } },
      cols,
    );
    expect(plan.checked).toBe(1);
    expect(plan.changes).toEqual([]);
  });
});

describe("ลองดูจริง 2026-11-21", () => {
  it("สูตรขึ้นต้นด้วยช่องว่าง → ตัดก่อนเทียบ/เขียน (เนื้อเดียวกัน = ไม่แตะ) · ขนาด 0 x 0 = ว่าง ไม่ทับขนาดเดิม", () => {
    const plan = planParentComputedSync(
      [{ id: "a", code: "MGN187", platform_description: "Louis Montini เข็มขัด", size_summary: "30 x 4 cm. (กว้าง x ยาว)" }, { id: "b", code: "CTL120", platform_description: null, size_summary: null }],
      { a: { platform_description: "  Louis Montini เข็มขัด\n", size_summary: "0 x 0 cm. (กว้าง x ยาว)" }, b: { platform_description: "  \n\nรายละเอียดสินค้า", size_summary: "0 x 0 cm. (กว้าง x ยาว)" } },
      cols,
    );
    expect(plan.changes).toEqual([{ id: "b", code: "CTL120", fields: [{ column: "platform_description", old: null, new: "รายละเอียดสินค้า" }] }]);
    expect(plan.keptBlank).toBe(1);   // MGN187 ขนาดเดิมไม่ถูกทับด้วย 0 x 0
  });
});

describe("ของช่วย", () => {
  it("canonText / previewText", () => {
    expect(canonText(null)).toBeNull();
    expect(canonText("  \n ")).toBeNull();
    expect(canonText("a\r\nb")).toBe("a\nb");
    expect(canonText("  \n\nข้อความ  ")).toBe("ข้อความ");
    expect(previewText("a\n\nb   c")).toBe("a b c");
    expect(previewText("x".repeat(200), 10)).toBe(`${"x".repeat(10)}…`);
  });
  it("สูตรที่เขียนลงคอลัมน์ต้องมีอยู่จริงใน lib/computed-text", () => {
    for (const n of SYNCED_PARENT_COMPUTES) expect(TEXT_COMPUTES[n], n).toBeTruthy();
  });
});
