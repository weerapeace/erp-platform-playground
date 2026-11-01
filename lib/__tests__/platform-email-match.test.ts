import { describe, expect, it } from "vitest";
import { itemKey, matchEmailItem, modelCodeFromTitle, modelsForItem, parseVariant, type SkuCandidate } from "@/lib/platform-email/match";

// ข้อมูลจริงใน skus_v2 (ตรวจ 2026-10-27 / 2026-11-01)
const sku = (code: string, color?: string): SkuCandidate => ({ id: code, code, color_platform_th: color ?? null });
const LYP14 = [sku("LYP14-01", "ดำ (01)"), sku("LYP14-02", "กรมท่า (02)"), sku("LYP14-03", "เบจ (03)")];
const TTM061 = [sku("TTM061-04", "ดำ (04)"), sku("TTM061-05", "น้ำตาล (05)"), sku("TTM061-05/1", "น้ำตาล(หนังเรียบรูขน) (05/1)"), sku("TTM061-06", "กรมท่า (06)")];
const PHPB010 = [sku("PHPB010-01", "พาสเทล (01)")];
const LYP02 = [sku("LYP02-01", "ดำ (01)"), sku("LYP02-02", "กรมท่า (02)"), sku("LYP02-04", "ดำ (Special) (04)")];
const LYP03 = [sku("LYP03-02", "กรมท่า-เบจ (02)"), sku("LYP03-05", "กรมท่า-เบจ (Special) (05)")];
const MGN237 = [sku("MGN237-01", "ดำ-น้ำตาลเข้ม (01)"), sku("MGN237-02", "น้ำตาลเข้ม (02)")];
const MGN369 = [sku("MGN369-01", "ดำ (01)"), sku("MGN369-02", "ดำ (02)")];
const MGN236 = [sku("MGN236-01/1", "ดำ-น้ำตาลเข้ม (01/1)"), sku("MGN236-02/1", "ดำ-เทา (02/1)"), sku("MGN236-06", "ดำ-น้ำตาล (06)")];
const MCT08 = [sku("MCT08-02", "เขียว-ดำ-ขาว (02)"), sku("MCT08-04", "ม่วง/เหลือง (04)")];
const MCT09 = [sku("MCT09-05", "ดำ (05)"), sku("MCT09-08", "เขียวขี้ม้า (08)")];
const MCT15 = [sku("MCT15-01", "ดำ (01)"), sku("MCT15-18", "กากี (18)")];
const MCT20 = [sku("MCT20-03", "ดำ-ขาว (03)"), sku("MCT20-11", "กรมท่า-ขาว (11)")];
const CVRS019 = [sku("CVRS019-01", "ม่วงอ่อน-เขียวมิ้นต์ (01)"), sku("CVRS019-03", "เหลือง-เทาอ่อน (03)")];
const MPU12 = [sku("MPU12-01", "ดำ (01)"), sku("MPU12-03", "กรมท่า (03)")];
const PIX04 = [sku("PIX04-04", "ชมพู (04)"), sku("PIX04-08", "พิงค์ลาเวนเดอร์ (08)")];
const MGN116 = [{ id: "MGN116", code: "MGN116", color: "ดำ" }];
const MGN167 = [{ id: "MGN167", code: "MGN167", color: "แทน" }];

describe("ตัวช่วยอ่านชื่อ/ตัวเลือก", () => {
  it("รหัสรุ่นท้ายชื่อ", () => {
    expect(modelCodeFromTitle("[ส่งด่วนฟรี] Louis Montini (NEVILLE) กระเป๋าสตางค์ผู้ชาย Men's Wallet TTM061")).toBe("TTM061");
    expect(modelCodeFromTitle("กระเป๋าผ้า ไม่มีรหัส")).toBeNull();
  });
  it("แยกตัวเลือกหลายรูปแบบ (ตัดไซซ์หลังจุลภาค)", () => {
    expect(parseVariant("Black (04)")).toMatchObject({ num: "04", strength: "strong", words: ["black"] });
    expect(parseVariant("ดำ | 01")).toMatchObject({ num: "01", strength: "strong", words: ["ดำ"] });
    expect(parseVariant("ดำ/น้ำตาล (01),L")).toMatchObject({ num: "01", words: ["ดำ", "น้ำตาล"] });
    expect(parseVariant("สีดำ-เทา | 236-02,S")).toMatchObject({ num: "02", words: ["ดำ", "เทา"] });
    expect(parseVariant("ดำ-เรียบ | 350-01/1,L").num).toBe("01/1");
    expect(parseVariant("Black#1,L")).toMatchObject({ num: "1", strength: "weak" });
    expect(parseVariant("ม่วงอ่อน-เทาอ่อน 01")).toMatchObject({ num: "01", strength: "weak" });
    expect(parseVariant("ดำ | 01 (1คู่)").num).toBe("01");
    expect(parseVariant("เขียวขี้ม้า MCT09-08,S")).toMatchObject({ fullCode: "MCT09-08", models: ["MCT09"], words: ["เขียวขี้ม้า"] });
    expect(parseVariant("สีดำ | MGN116,XL")).toMatchObject({ models: ["MGN116"], num: null });
    expect(parseVariant("ดำ (Special)")).toMatchObject({ num: null, words: ["ดำ"] });
  });
  it("รุ่นที่ต้องดึงมาเทียบ: รุ่นในตัวเลือกก่อนรุ่นในชื่อ", () => {
    expect(modelsForItem({ title: "Men's Belt MGN116, MGN119, MGN167", variant: "สีดำ | MGN116,XL" })).toEqual(["MGN116", "MGN167"]);
    expect(modelsForItem({ title: "เข็มขัดผ้าแคนวาส MCT08", variant: "เขียวขี้ม้า MCT09-08,S" })).toEqual(["MCT09", "MCT08"]);
  });
  it("กุญแจจำคู่ใช้รุ่น + ตัวเลือก", () => expect(itemKey("… Baguette LYP14", "ดำ (Special)")).toBe("m:LYP14|ดำ (special)"));
});

describe("matchEmailItem — ผูกเองได้", () => {
  const m = (title: string, variant: string | null, c: SkuCandidate[]) => matchEmailItem({ title, variant }, c);
  it("Black (04) → TTM061-04", () => expect(m("Men's Wallet TTM061", "Black (04)", TTM061)).toMatchObject({ confidence: "exact", sku_code: "TTM061-04" }));
  it("เลขสีมีทับ (05/1)", () => expect(m("Wallet TTM061", "น้ำตาล(หนังเรียบรูขน) (05/1)", TTM061).sku_code).toBe("TTM061-05/1"));
  it("ดำ | 01 → LYP02-01", () => expect(m("Giaguaro LYP02", "ดำ | 01", LYP02).sku_code).toBe("LYP02-01"));
  it("กรม/เบจ | 05 Special → LYP03-05", () => expect(m("Giaguaro LYP03", "กรม/เบจ | 05 Special", LYP03).sku_code).toBe("LYP03-05"));
  it("ดำ/น้ำตาล (01),L → MGN237-01 (ไม่สนไซซ์)", () => expect(m("Belt MGN237", "ดำ/น้ำตาล (01),L", MGN237).sku_code).toBe("MGN237-01"));
  it("Black#1,L → MGN369-01", () => expect(m("Automatic MGN369", "Black#1,L", MGN369).sku_code).toBe("MGN369-01"));
  it("| 236-02 → MGN236-02/1 (มีแต่แบบ /1)", () => expect(m("Reversible Belt MGN236", "สีดำ-เทา | 236-02,S", MGN236)).toMatchObject({ confidence: "exact", sku_code: "MGN236-02/1" }));
  it("รหัสเต็มในตัวเลือก MCT09-08 (ชื่อสินค้าเป็น MCT08)", () => expect(m("เข็มขัด MCT08", "เขียวขี้ม้า MCT09-08,S", [...MCT09, ...MCT08]).sku_code).toBe("MCT09-08"));
  it("รุ่นในตัวเลือก MGN116 มีตัวเดียว → ผูกเลย", () => expect(m("Men's Belt MGN116, MGN119, MGN167", "สีดำ | MGN116,XL", [...MGN116, ...MGN167])).toMatchObject({ confidence: "single", sku_code: "MGN116" }));
  it("Navy Blue (03),L → MPU12-03", () => expect(m("Nikita MPU12", "Navy Blue (03),L (33-37 นิ้ว)", MPU12).sku_code).toBe("MPU12-03"));
  it("Pink Lavender | 08 → PIX04-08 (ทับศัพท์)", () => expect(m("Pixie Dustie PIX04", "Pink Lavender | 08", PIX04).sku_code).toBe("PIX04-08"));
  it("รุ่นที่มี SKU เดียว (Lazada ไม่มีตัวเลือก)", () => expect(m("Heart Charms Handmade PHPB010", null, PHPB010)).toMatchObject({ confidence: "single", sku_id: "PHPB010-01" }));
  it("คนเคยยืนยันแล้ว → ใช้ที่จำไว้", () => expect(matchEmailItem({ title: "LYP14", variant: "ดำ (Special)" }, LYP14, { id: "x", code: "LYP14-01" }).confidence).toBe("rule"));
  it("ข้าม SKU ที่ปิดใช้งาน", () => {
    const list = [{ ...PHPB010[0], is_active: false }, sku("PHPB010-02", "พาสเทล")];
    expect(m("PHPB010", null, list).sku_id).toBe("PHPB010-02");
  });
});

describe("matchEmailItem — ข้อมูลขัดกัน ให้คนยืนยัน (ไม่ผูกเอง)", () => {
  const m = (title: string, variant: string | null, c: SkuCandidate[]) => matchEmailItem({ title, variant }, c);
  it("ดำ (Special) ไม่มีเลข → เดา LYP14-01", () => expect(m("Baguette LYP14", "ดำ (Special)", LYP14)).toMatchObject({ confidence: "guess", sku_id: null, suggest: { code: "LYP14-01" } }));
  it("ครีม | 18 แต่ ERP เลข 18 = กากี", () => expect(m("Canvas MCT15", "ครีม | 18,L: 37 – 41 นิ้ว", MCT15)).toMatchObject({ confidence: "guess", suggest: { code: "MCT15-18" } }));
  it("กรมท่า/ขาว #3 แต่ ERP เลข 03 = ดำ-ขาว (เลขแบบ # เชื่อได้น้อย)", () => expect(m("Americo MCT20", "กรมท่า/ขาว #3,S: 29 – 33 นิ้ว", MCT20).confidence).toBe("guess"));
  it("ม่วงอ่อน-เทาอ่อน 01 แต่ ERP เลข 01 = ม่วงอ่อน-เขียวมิ้นต์", () => expect(m("Color Up CVRS019", "ม่วงอ่อน-เทาอ่อน 01", CVRS019).confidence).toBe("guess"));
  it("รุ่นมีตัวเดียวแต่สีในเมลไม่ตรง", () => expect(m("PHPB010", "Black", PHPB010).confidence).toBe("guess"));
  it("ไม่มีรหัสใน ERP = none", () => expect(m("สินค้าใหม่ ZZ999", null, []).confidence).toBe("none"));
  it("หลายสีและเดาไม่ได้ = none", () => expect(m("LYP14", "Special Edition", LYP14).confidence).toBe("none"));
});
