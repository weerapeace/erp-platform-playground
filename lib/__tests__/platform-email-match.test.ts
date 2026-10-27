import { describe, expect, it } from "vitest";
import { itemKey, matchEmailItem, modelCodeFromTitle, variantColorWords, variantNumber, type SkuCandidate } from "@/lib/platform-email/match";

// ข้อมูลจริงใน skus_v2 (ตรวจ 2026-10-27)
const LYP14: SkuCandidate[] = [
  { id: "l1", code: "LYP14-01", color: "ดำ", color_platform_th: "ดำ (01)" },
  { id: "l2", code: "LYP14-02", color: "กรมท่า", color_platform_th: "กรมท่า (02)" },
  { id: "l3", code: "LYP14-03", color: "เบจ", color_platform_th: "เบจ (03)" },
];
const TTM061: SkuCandidate[] = [
  { id: "t4", code: "TTM061-04", color: "ดำ", color_platform_th: "ดำ (04)" },
  { id: "t5", code: "TTM061-05", color: "น้ำตาล", color_platform_th: "น้ำตาล (05)" },
  { id: "t51", code: "TTM061-05/1", color: "น้ำตาล(หนังเรียบรูขน)", color_platform_th: "น้ำตาล(หนังเรียบรูขน) (05/1)" },
  { id: "t6", code: "TTM061-06", color: "กรมท่า", color_platform_th: "กรมท่า (06)" },
];
const PHPB010: SkuCandidate[] = [{ id: "p1", code: "PHPB010-01", color: "พาสเทล", color_platform_th: "พาสเทล (01)" }];

describe("ตัวช่วยอ่านชื่อ/ตัวเลือก", () => {
  it("รหัสรุ่นท้ายชื่อ", () => {
    expect(modelCodeFromTitle("[ส่งด่วนฟรี] Louis Montini (NEVILLE) กระเป๋าสตางค์ผู้ชาย Men's Wallet TTM061")).toBe("TTM061");
    expect(modelCodeFromTitle("Louis Montini (Giaguaro) กระเป๋าทรง Baguette LYP14")).toBe("LYP14");
    expect(modelCodeFromTitle("กระเป๋าผ้า ไม่มีรหัส")).toBeNull();
  });
  it("เลขสีในวงเล็บ", () => {
    expect(variantNumber("Black (04)")).toBe("04");
    expect(variantNumber("น้ำตาล (05/1)")).toBe("05/1");
    expect(variantNumber("ดำ (Special)")).toBeNull();
  });
  it("คำสีอังกฤษแปลเป็นไทย", () => expect(variantColorWords("Black (04)")).toEqual(["black", "ดำ"]));
  it("กุญแจจำคู่ใช้รุ่น + ตัวเลือก", () => expect(itemKey("… Baguette LYP14", "ดำ (Special)")).toBe("m:LYP14|ดำ (special)"));
});

describe("matchEmailItem", () => {
  it("Black (04) → TTM061-04 ตรงเป๊ะ (exact)", () => {
    const m = matchEmailItem({ title: "Men's Wallet TTM061", variant: "Black (04)" }, TTM061);
    expect(m).toMatchObject({ confidence: "exact", sku_id: "t4", sku_code: "TTM061-04" });
  });
  it("เลขสีมีทับ (05/1)", () => {
    expect(matchEmailItem({ title: "Wallet TTM061", variant: "น้ำตาล(หนังเรียบรูขน) (05/1)" }, TTM061).sku_code).toBe("TTM061-05/1");
  });
  it("ดำ (Special) → เดา LYP14-01 ให้คนยืนยัน (ยังไม่ผูก)", () => {
    const m = matchEmailItem({ title: "Baguette LYP14", variant: "ดำ (Special)" }, LYP14);
    expect(m.confidence).toBe("guess");
    expect(m.sku_id).toBeNull();
    expect(m.suggest).toEqual({ id: "l1", code: "LYP14-01" });
  });
  it("รุ่นที่มี SKU เดียว (Lazada ไม่มีตัวเลือก) → ผูกเลย", () => {
    expect(matchEmailItem({ title: "Heart Charms Handmade PHPB010", variant: null }, PHPB010)).toMatchObject({ confidence: "single", sku_id: "p1" });
  });
  it("รุ่นมีตัวเดียวแต่สีในเมลไม่ตรง → ให้คนยืนยัน", () => {
    expect(matchEmailItem({ title: "PHPB010", variant: "Black" }, PHPB010).confidence).toBe("guess");
  });
  it("คนเคยยืนยันแล้ว → ใช้ที่จำไว้", () => {
    expect(matchEmailItem({ title: "LYP14", variant: "ดำ (Special)" }, LYP14, { id: "l1", code: "LYP14-01" }).confidence).toBe("rule");
  });
  it("ไม่มีรหัสใน ERP = none", () => {
    expect(matchEmailItem({ title: "สินค้าใหม่ ZZ999", variant: null }, []).confidence).toBe("none");
  });
  it("หลายสีและเดาไม่ได้ = none", () => {
    expect(matchEmailItem({ title: "LYP14", variant: "Special Edition" }, LYP14).confidence).toBe("none");
  });
  it("ข้าม SKU ที่ปิดใช้งาน", () => {
    const list = [{ ...PHPB010[0], is_active: false }, { id: "p2", code: "PHPB010-02", color: "พาสเทล" }];
    expect(matchEmailItem({ title: "PHPB010", variant: null }, list).sku_id).toBe("p2");
  });
});
