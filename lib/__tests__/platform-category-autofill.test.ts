import { describe, expect, it } from "vitest";
import { isJunkCategory, leafOf, prepareOptions, suggestFor } from "@/lib/platform-category-autofill";

// ตัวอย่างจากหมวดจริง (TikTok TH / เว็บ Louis Montini / Pixiedustie · 2026-11-20)
const tiktok = prepareOptions([
  "601445 · กระเป๋าและกระเป๋าเดินทาง > กระเป๋าผู้หญิง > กระเป๋าถือ",
  "1 · กระเป๋าและกระเป๋าเดินทาง > กระเป๋าผู้หญิง > กระเป๋าสตางค์",
  "2 · เครื่องประดับแฟชั่น > อุปกรณ์เสริมสำหรับเสื้อผ้า > เข็มขัด",
  "3 · สินค้ามือสอง > เครื่องประดับแฟชั่น > เข็มขัด",
  "605281 · เครื่องประดับแฟชั่น > อุปกรณ์เสริมสำหรับเสื้อผ้า > คลิปติดปกเสื้อและเข็มกลัด",
  "4 · ความงามและการดูแลส่วนบุคคล > เครื่องใช้ไฟฟ้าสำหรับดูแลส่วนบุคคล > อุปกรณ์เสริม",
  "5 · Test Product2222.fe > การทดสอบ wxj 1",
].map((v) => ({ value: v, label: v.replace(/^\d+ · /, "") })));
const louis = prepareOptions(["Belts", "เข็มขัดผู้หญิง", "กระเป๋าถือ", "กระเป๋าใส่บัตร", "กระเป๋าเป้", "เข็มขัดลำลอง"].map((x) => ({ value: x, label: x })));
const pixie = prepareOptions(["HANDBAGS", "Card Holders", "WALLETS", "ITA BAGS"].map((x) => ({ value: x, label: x })));

describe("platform-category-autofill", () => {
  it("leafOf ตัดรหัสและเอาใบสุด", () => {
    expect(leafOf("13433 · กระเป๋าและกระเป๋าเดินทาง > กระเป๋าผู้หญิง > กระเป๋าถือ")).toBe("กระเป๋าถือ");
    expect(leafOf("HANDBAGS")).toBe("HANDBAGS");
  });

  it("ข้อ 4: หมวดทดสอบขยะไม่ถูกเสนอ", () => {
    expect(isJunkCategory("Test Product2222.fe > การทดสอบ wxj 1")).toBe(true);
    expect(tiktok.some((p) => p.opt.label.includes("Test"))).toBe(false);
  });

  it("ชื่อหมวดกลางตรง → มั่นใจสูง ทั้งร้านไทยและร้านอังกฤษ", () => {
    const s = suggestFor("กระเป๋าถือ Handbags", [], tiktok)!;
    expect(s.confidence).toBe("high");
    expect(s.candidates[0].value).toContain("601445");
    expect(suggestFor("กระเป๋าถือ Handbags", [], pixie)!.candidates[0].value).toBe("HANDBAGS");
    expect(suggestFor("กระเป๋าถือ Handbags", [], louis)!.candidates[0].value).toBe("กระเป๋าถือ");
  });

  it("ข้อ 3: มีตัวเลือกสำรองไม่เกิน 3 · เข็มขัดมือสองถูกดันลงล่าง", () => {
    const s = suggestFor("เข็มขัด Belts", [], tiktok)!;
    expect(s.candidates.length).toBeLessThanOrEqual(3);
    expect(s.candidates[0].label).toBe("เครื่องประดับแฟชั่น > อุปกรณ์เสริมสำหรับเสื้อผ้า > เข็มขัด");
  });

  it("ข้อ 1: ใช้หมวดที่ร้านอื่นจับไว้ช่วยเดา", () => {
    const s = suggestFor("เข็มกลัด", ["12793 · เครื่องประดับแฟชั่น > เครื่องประดับ > เข็มกลัดและหมุด"], tiktok)!;
    expect(s.candidates[0].value).toContain("605281");
    const card = suggestFor("กระเป๋าใส่บัตรเครดิต", ["13481 · กระเป๋าและกระเป๋าเดินทาง > กระเป๋าผู้หญิง > กระเป๋าใส่นามบัตร"], pixie)!;
    expect(card.candidates[0].value).toBe("Card Holders");
  });

  it("หมวดอะไหล่ไม่ไปได้ Belts จากคำพ้อง · ใบกลาง ๆ 'อุปกรณ์เสริม' ไม่ขึ้นมั่นใจสูง", () => {
    const l = suggestFor("อะไหล่โลหะกระเป๋าและเข็มขัด", [], louis);
    expect(l?.candidates[0]?.value).not.toBe("Belts");
    const t = suggestFor("อะไหล่โลหะกระเป๋าและเข็มขัด", ["66 · แฟชั่น > อุปกรณ์เสริม"], tiktok);
    expect(t?.confidence ?? "check").toBe("check");
  });

  it("ร้านที่ไม่มีหมวดใกล้เคียง → เดาไม่ได้ (null)", () => {
    expect(suggestFor("พร็อพถ่ายภาพ", [], pixie)).toBeNull();
  });
});
