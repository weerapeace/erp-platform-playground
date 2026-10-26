import { describe, expect, it } from "vitest";
import { codeTokens, isHighConfidence, normCode, prepareCandidates, skuCodeForms, suggestMatches } from "./platform-match-suggest";

// รหัส/ชื่อจริงของ IG International (ตัวอย่างที่เจอใน Shopee ที่ยังไม่จับคู่)
const ERP = prepareCandidates([
  { id: "p-pin6", code: "PIN-6", name: "IG International อะไหล่หมุด 6 มม." },
  { id: "p-pin8", code: "PIN-8", name: "IG International อะไหล่หมุด 8 มม." },
  { id: "p-dh12", code: "DH12", name: "IG International อะไหล่คอหมาก้นตัวดี 12 มม." },
  { id: "p-dh12-dup", code: "DH12_DUP_19135", name: "IG International อะไหล่คอหมาก้นตัวดี 12 มม." },
  { id: "p-eq008", code: "IG-EQ008 (ที่ง้างโซ่)", name: "IG International ที่ง้างโซ่" },
  { id: "p-eq016", code: "IG-EQ-016", name: "IG International ดินสอเขียนผ้า" },
  { id: "p-ttn", code: "TTN", name: "TTN สีทาขอบหนัง" },
  { id: "p-ttn200", code: "TTN-200", name: "TTN สีทาขอบหนัง 200 มล." },
  { id: "p-lhp", code: "LHP", name: "IG International ที่เจาะรูหนัง" },
  { id: "p-pt", code: "PT", name: "IG International ตัวล็อค" },
  { id: "p-rng20", code: "RNG20", name: "IG International อะไหล่ห่วงวงกลม 20 มม." },
], { stripWords: ["IG International"] });
const opts = { stripWords: ["IG International"] };

describe("normCode / codeTokens", () => {
  it("ตัดขีด เว้นวรรค และคำไทยในวงเล็บ", () => {
    expect(normCode("IG-EQ008 (ที่ง้างโซ่)")).toBe("IGEQ008");
    expect(normCode("pin-6")).toBe("PIN6");
  });
  it("ดึงเฉพาะคำที่หน้าตาเหมือนรหัส (ไม่เอาตัวเลขล้วน)", () => {
    expect(codeTokens("IG International อะไหล่คอหมาก้นตัวดี ขนาด 12 มม. 1 ชิ้น DH12")).toEqual(["IG", "INTERNATIONAL", "DH12"]);
  });
  it("หน่วยตัวเล็ก (cm. ml) ไม่นับเป็นรหัส", () => {
    expect(codeTokens("คอหมาก้นกลม ขนาดวงใน 2 cm. 100 ml")).toEqual([]);
  });
});

describe("suggestMatches", () => {
  it("SKU ต่างแค่ขีด → 95 ขึ้นอันดับหนึ่ง", () => {
    const s = suggestMatches({ title: "IG International อะไหล่หมุด ขนาด 6 มม. 1 ชิ้น PIN6", sku_code: "PIN6" }, ERP, opts);
    expect(s[0]).toMatchObject({ parent_sku_id: "p-pin6", score: 95 });
    expect(isHighConfidence(s)).toBe(true);
  });
  it("ไม่มี SKU แต่ชื่อมีรหัสต่อท้าย → 90 · ไม่เสนอตัวซ้ำ _DUP_", () => {
    const s = suggestMatches({ title: "IG International อะไหล่คอหมาก้นตัวดี  ขนาด 12 มม. 1 ชิ้น DH12", sku_code: "" }, ERP, opts);
    expect(s[0]).toMatchObject({ parent_sku_id: "p-dh12", score: 90, reason: "รหัสท้ายชื่อสินค้าตรงกัน" });
    expect(s.some((x) => x.parent_sku_id === "p-dh12-dup")).toBe(false);
  });
  it("รหัสในระบบมีวงเล็บภาษาไทย ก็ยังจับได้", () => {
    const s = suggestMatches({ title: "IG International คีมบีบโซ่ คีมปากแหลม", sku_code: "IG-EQ008" }, ERP, opts);
    expect(s[0]).toMatchObject({ parent_sku_id: "p-eq008", score: 95 });
  });
  it("SKU ตรงเป๊ะ → 100", () => {
    expect(suggestMatches({ title: "ห่วง", sku_code: "rng20" }, ERP, opts)[0]).toMatchObject({ parent_sku_id: "p-rng20", score: 100 });
  });
  it("รหัสขึ้นต้นเหมือนกัน → 60 (ไม่ถือว่ามั่นใจสูง)", () => {
    const s = suggestMatches({ title: "IG International เครื่องเจาะรูหนัง 10 ขนาด LHP-SET", sku_code: "LHP-SET" }, ERP, opts);
    expect(s[0]).toMatchObject({ parent_sku_id: "p-lhp", score: 60 });
    expect(isHighConfidence(s)).toBe(false);
  });
  it("TTN32 เสนอกลุ่ม TTN หลายตัว แต่ไม่มีตัวไหนมั่นใจสูง", () => {
    const s = suggestMatches({ title: "TTN สีทาขอบหนัง กระเป๋า รองเท้า เข็มขัด หนังแท้ PU PVC TTN32", sku_code: "TTN32" }, ERP, opts);
    expect(s.map((x) => x.parent_sku_id)).toContain("p-ttn");
    expect(isHighConfidence(s)).toBe(false);
  });
  it("รหัสสั้น 2 ตัวอักษรในชื่อ ถูกหักคะแนน", () => {
    const s = suggestMatches({ title: "ตัวล็อคกระเป๋า แบบ PT ทองเหลือง", sku_code: "" }, ERP, { ...opts, useNames: false });
    expect(s[0]).toMatchObject({ parent_sku_id: "p-pt", score: 70 });   // รหัสท้ายชื่อ 90 − 20
    expect(s[0].reason).toContain("รหัสสั้น");
  });
  it("ไม่มีรหัส → ใช้ชื่อคล้าย (คะแนนไม่เกิน 55)", () => {
    const s = suggestMatches({ title: "IG International ดินสอเขียนผ้า STANDARD", sku_code: "" }, ERP, opts);
    expect(s[0].parent_sku_id).toBe("p-eq016");
    expect(s[0].score).toBeLessThanOrEqual(55);
  });
  it("SKU บนร้านเป็นรหัส SKU ลูก (ส่งมาเป็น extraHits) → ใช้คะแนนนั้น", () => {
    const s = suggestMatches({ title: "ห่วง", sku_code: "RNG20-GD" }, ERP, { ...opts, extraHits: [{ parent_sku_id: "p-rng20", score: 95, reason: "รหัส SKU ลูกตรงกัน" }] });
    expect(s[0]).toMatchObject({ parent_sku_id: "p-rng20", score: 95, reason: "รหัส SKU ลูกตรงกัน" });
  });
  it("skuCodeForms แตกรหัสเป็นรูปแบบที่ถามตาราง SKU ลูกได้", () => {
    expect(skuCodeForms("WK42-01D")).toEqual(["WK42-01D", "WK42-01", "WK42"]);
    expect(skuCodeForms("TPLN&TP")).toEqual(["TPLN", "TP"]);
  });
  it("คู่ที่สองรหัสตรงด้วย = กำกวม ไม่ให้ยืนยันทีเดียว", () => {
    const two = prepareCandidates([{ id: "a", code: "PIN-6", name: null }, { id: "b", code: "PIN6", name: null }]);
    expect(isHighConfidence(suggestMatches({ title: "", sku_code: "PIN6" }, two))).toBe(false);
  });
});
