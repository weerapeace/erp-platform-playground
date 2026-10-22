import { describe, it, expect } from "vitest";
import { normalizeFieldMap, resolveName, type ParentRow } from "../website-field-map";

/**
 * กฎชื่อบนเว็บ "ลบรหัสสินค้า" (2026-10-22) — ตัดรหัสแบบเดียวกันทุกตัว ไม่ใช่แค่รหัสของตัวเอง
 * เคสจริง Pixie Dustie: ชื่อใน ERP ติดรหัสของรุ่นอื่น (PIX13 ลงท้าย PIX14 · PIX01 ลงท้าย PIX04)
 */
const map = normalizeFieldMap({ name: { source: "name_th", removeCode: true, removeParens: true } });
const name = (code: string, name_th: string) => resolveName(map, { code, name_th } as unknown as ParentRow);

describe("กฎชื่อ: ลบรหัสสินค้า = ตัดรหัสแบบเดียวกันทุกตัว", () => {
  it("ชื่อติดรหัสของรุ่นอื่น → ตัดออกด้วย (เคสจริง Pixie Dustie)", () => {
    expect(name("PIX13", "Pixie Dustie (Pixie Dustie) กระเป๋าใส่มือถือ รุ่น Pixie Ribbon Bag PIX14")).toBe("Pixie Dustie กระเป๋าใส่มือถือ รุ่น Pixie Ribbon Bag");
    expect(name("PIX01", "Louis Montini (Pixie Dustie) กระเป๋าสะพายข้าง กระเป๋าใส PU Pixie Classic Bag Collection PIX04")).toBe("Louis Montini กระเป๋าสะพายข้าง กระเป๋าใส PU Pixie Classic Bag Collection");
    expect(name("PIX10-BELT", "Louis Montini (Pixie Dustie) กระเป๋าสะพายไหล่ รุ่น Pixie Heartie Bag PIX11")).toBe("Louis Montini กระเป๋าสะพายไหล่ รุ่น Pixie Heartie Bag");
    expect(name("PIX12", "Pixie Too Heart Bag PIX13 / PIX10-BELT")).toBe("Pixie Too Heart Bag");
    // เคสจริง Louis: รหัสหลายตัว/เชื่อมด้วย & · รหัสในช่อง code เป็นหลายตัวคั่นจุลภาค
    expect(name("MGN372, MGN164", "Louis Montini (CAMERON) เข็มขัดผู้ชายหนังวัวแท้ Men Belt MGN164&MGN372")).toBe("Louis Montini เข็มขัดผู้ชายหนังวัวแท้ Men Belt");
    expect(name("TML07, TML08, TML09", "กระเป๋าใส่ของ TML07 TML08 TML09")).toBe("กระเป๋าใส่ของ");
    expect(name("MCT08-09", "เข็มขัดผู้ชายเเฟชั่น MCT08")).toBe("เข็มขัดผู้ชายเเฟชั่น");
  });
  it("ไม่ใช่รหัส (มีช่องว่างคั่นตัวเลข / ตัวอักษรอื่นติด) = ไม่ตัด", () => {
    expect(name("ROAR02", "ROAR 2000s กระเป๋าถือเมทัลลิก Y2K ROAR02")).toBe("ROAR 2000s กระเป๋าถือเมทัลลิก Y2K");
    expect(name("ROAR02", "กระเป๋า ROAR01 ROAR02 รุ่นพิเศษ")).toBe("กระเป๋า รุ่นพิเศษ");
    expect(name("PIX05", "กระเป๋า PIXIE5 Shoulder Bag PIX06")).toBe("กระเป๋า PIXIE5 Shoulder Bag");
  });
  it("รหัสที่ไม่มีตัวอักษรนำหน้า = ตัดเฉพาะรหัสของตัวเอง (แบบเดิม) · ปิดกฎ = ไม่ตัด", () => {
    expect(name("12345", "กระเป๋า 12345 รุ่น 678")).toBe("กระเป๋า รุ่น 678");
    const off = normalizeFieldMap({ name: { source: "name_th" } });
    expect(resolveName(off, { code: "PIX13", name_th: "Bag PIX14" } as unknown as ParentRow)).toBe("Bag PIX14");
  });
});
