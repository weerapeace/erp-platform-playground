import { describe, it, expect } from "vitest";
import { autoMatchBoxes, boxWeightCheck } from "@/lib/delivery-bill-check";
import { nameMismatch } from "@/lib/seller-bill-match";

const P = (id: string, qty: number, is_product = true) => ({ id, label: id, qty, is_product });
const B = (id: string, boxes: { qty: number | null; voucher_line_ids?: string[] }[]) => ({ id, tracking_no: "EK", lines: boxes.map((b) => ({ qty: b.qty, voucher_line_ids: b.voucher_line_ids ?? [] })) });

describe("จับคู่กล่องให้เองเมื่อชัด (แบบ A)", () => {
  it("เคสจริง EK-05081026: ใบนี้มีกล่องเดียว → ทุกสินค้าในใบ (ไม่ต้องเลือก)", () => {
    const r = autoMatchBoxes([P("brooch1", 3), P("brooch2", 3), P("brooch3", 3), P("brooch4", 3)], [B("b", [{ qty: 12 }])]);
    expect(r.complete).toBe(true);
    expect(r.matches).toEqual([{ bill_id: "b", idx: 0, line_ids: ["brooch1", "brooch2", "brooch3", "brooch4"], all: true }]);
  });
  it("ค่ากล่อง/รายการที่ไม่ใช่สินค้า ไม่ถูกใส่กล่อง", () => {
    const r = autoMatchBoxes([P("p1", 5), P("fee", 1, false)], [B("b", [{ qty: 5 }])]);
    expect(r.matches[0].line_ids).toEqual(["p1"]);
  });
  it("หลายกล่อง: เดาจากจำนวน + กล่องว่างที่เหลือกล่องเดียวได้สินค้าที่เหลือทั้งหมด", () => {
    const r = autoMatchBoxes([P("a", 20), P("b", 6), P("c", 7)], [B("x", [{ qty: 20 }, { qty: 13 }])]);
    expect(r.complete).toBe(true);
    expect(r.matches).toEqual([{ bill_id: "x", idx: 0, line_ids: ["a"], all: false }, { bill_id: "x", idx: 1, line_ids: ["b", "c"], all: false }]);
  });
  it("เดาไม่ได้ (กล่องว่างหลายกล่อง จำนวนไม่ตรง) → ไม่จับคู่ ให้เลือกเอง", () => {
    const r = autoMatchBoxes([P("a", 3), P("b", 3)], [B("x", [{ qty: 5 }, { qty: 1 }])]);
    expect(r.matches).toEqual([]);
    expect(r.complete).toBe(false);
  });
  it("จับคู่ไว้แล้วทุกกล่อง = ไม่ทำอะไร", () => {
    const r = autoMatchBoxes([P("a", 3)], [B("x", [{ qty: 3, voucher_line_ids: ["a"] }])]);
    expect(r).toEqual({ matches: [], complete: true });
  });
});

describe("เช็กกลับ น้ำหนักสินค้า vs กล่อง (ข้อ 3)", () => {
  it("เคสจริง PV2026-09-15-004: 60 ชิ้น × 0.3 กก. = 18 กก. แต่กล่อง 0.3 กก. → ผิดปกติ", () => {
    const r = boxWeightCheck([{ weight_kg: 0.3, m3: 0.0003, voucher_line_ids: ["chain"] }], [{ id: "chain", qty: 60, kg_per_unit: 0.3, cbm_per_unit: 0.0003 }]);
    expect(r).toMatchObject({ ok: false, box_kg: 0.3, line_kg: 18 });
  });
  it("หารถูก (0.3 ÷ 60) = ปกติ", () => {
    expect(boxWeightCheck([{ weight_kg: 0.3, m3: 0.0003, voucher_line_ids: ["chain"] }], [{ id: "chain", qty: 60, kg_per_unit: 0.005, cbm_per_unit: 0.000005 }]).ok).toBe(true);
  });
  it("กล่องไม่มีน้ำหนัก/ยังไม่จับคู่ = ไม่เตือน", () => {
    expect(boxWeightCheck([{ weight_kg: null, m3: null, voucher_line_ids: ["a"] }], [{ id: "a", qty: 5, kg_per_unit: 1, cbm_per_unit: null }]).ok).toBe(true);
    expect(boxWeightCheck([{ weight_kg: 1, m3: 0.1, voucher_line_ids: [] }], [{ id: "a", qty: 5, kg_per_unit: 1, cbm_per_unit: null }]).ok).toBe(true);
  });
});

describe("บิลร้าน: ชื่อไม่เข้ากัน (ข้อ 1)", () => {
  it("เคสจริง: เข็มกลัดลายแมว ↔ เทปใส = ไม่เข้ากัน", () => {
    expect(nameMismatch("ป้ายเข็มกลัดลายน่ารักรูปแมว", "เทปใส 1.8 cm.")).toBe(true);
  });
  it("ชื่อเข้ากัน (ไม่เตือน)", () => {
    expect(nameMismatch("จี้เข็มกลัดรูปตัวอักษร (ลาย 2)", "[TB-0006-07] เข็มกลัดโลหะ - ตัวอักษร BETTER THINGS ARE COMING")).toBe(false);
    expect(nameMismatch("เข็มกลัดรูปรองน้ำ ดอกไม้จักรยาน", "[TB-0006-09] เข็มกลัดโลหะ - ดอกไม้ในการดน้ำ")).toBe(false);
    expect(nameMismatch("ซิปฟันกระดูก", "ซิป YKK ฟันกระดูก เบอร์ 5")).toBe(false);
  });
  it("ชื่ออังกฤษล้วน / ชื่อสั้น / ว่าง = ไม่เตือน (กันเตือนผิด)", () => {
    expect(nameMismatch("ซิปฟันกระดูก", "YKK zipper no.5")).toBe(false);
    expect(nameMismatch("ผ้า", "เทปใส")).toBe(false);
    expect(nameMismatch(null, "เทปใส 1.8 cm.")).toBe(false);
  });
});
