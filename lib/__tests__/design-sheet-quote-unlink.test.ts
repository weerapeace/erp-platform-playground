import { describe, it, expect } from "vitest";
import { quoteNameMismatch, quoteChainIds } from "@/lib/design-sheet-quotations";

describe("ใบเสนอราคาที่ผูกผิด — ป้ายชื่อไม่ตรงงาน", () => {
  it("เจอใบที่ผูกผิดจริง (ข้อมูลจากการย้ายระบบเก่า)", () => {
    expect(quoteNameMismatch("กระเป๋า Tote The 1", ["กระเป๋าใส่เหรียญ GG x Disney", "พวงกุญแจผ้าขาวม้า GG x Disney"])).toBe(true);
    expect(quoteNameMismatch("กระเป๋าถุงผ้า 2 ไซส์ (Spicy Disc)", ["กระดาษห่ออาหาร กันน้ำมัน ขนาด 54.4 x 39 cm."])).toBe(true);
    expect(quoteNameMismatch("กระเป๋า Tote Bag แม่ฟ้าหลวง", ["ป้าย PU Centara"])).toBe(true);
    expect(quoteNameMismatch("กระเป๋า CPN ผ้าแคนวาส", ["กระเป๋า Tote Bag แม่ฟ้าหลวง"])).toBe(true);
    expect(quoteNameMismatch("กระดาษ ไขจีโน่", ["กระเป๋าTote ทรง TRADER JOE ใบใหญ่"])).toBe(true);
  });
  it("ใบที่ถูกต้องไม่เตือน", () => {
    expect(quoteNameMismatch("กระเป๋า Tote The 1", ["กระเป๋า Tote The 1"])).toBe(false);
    expect(quoteNameMismatch("กระดาษ ไขจีโน่", ["กระดาษห่ออาหาร กันน้ำมัน ขนาด 54.4 x 39 cm."])).toBe(false);
    expect(quoteNameMismatch("พวงกุญแจช้าง ปัก", ["พวงกุญแจปักลายช้าง"])).toBe(false);
    expect(quoteNameMismatch("Tote Marc Jacob Size XS, S, M size ละ 1000 ใบ (Nestle)", ["กระเป๋า Tote Nestle"])).toBe(false);
    expect(quoteNameMismatch("กระเป๋า TRADER JOE ของคุณเต้ง (Spicy Disc)", ["กระเป๋าTote ทรง TRADER JOE ใบใหญ่"])).toBe(false);
    expect(quoteNameMismatch("กระเป๋าใส่เหรียญ GG x Disney", ["กระเป๋าใส่เหรียญ GG x Disney"])).toBe(false);
  });
  it("ไม่มีข้อมูลให้เทียบ = ไม่เตือน", () => {
    expect(quoteNameMismatch("", ["อะไรก็ได้"])).toBe(false);
    expect(quoteNameMismatch("กระเป๋า Tote", [])).toBe(false);
  });
});

describe("ใบทั้งสายที่เปิดแทนกัน", () => {
  const rows = [
    { quotation_id: "a", replaces_quotation_id: null },
    { quotation_id: "b", replaces_quotation_id: "a" },
    { quotation_id: "c", replaces_quotation_id: "b" },
    { quotation_id: "x", replaces_quotation_id: null },
  ];
  it("กดใบไหนในสายก็ได้ครบทั้งสาย", () => {
    expect(quoteChainIds(rows, "c").sort()).toEqual(["a", "b", "c"]);
    expect(quoteChainIds(rows, "a").sort()).toEqual(["a", "b", "c"]);
  });
  it("ใบเดี่ยว = แค่ใบเดียว · ไม่อยู่ในงาน = ว่าง", () => {
    expect(quoteChainIds(rows, "x")).toEqual(["x"]);
    expect(quoteChainIds(rows, "zz")).toEqual([]);
  });
});
