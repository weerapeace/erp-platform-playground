import { describe, it, expect } from "vitest";
import { englishKeysToThai, thaiKeysToEnglish, rankOptions, scoreText } from "@/lib/fuzzy-rank";

describe("แป้นพิมพ์ผิดภาษา", () => {
  it("ตำแหน่งปุ่มตรงทุกแถว (ไทยเกษมณี)", () => {
    expect(englishKeysToThai("l;ylfu")).toBe("สวัสดี");
    expect(thaiKeysToEnglish("ทหห")).toBe("mss");
    expect(englishKeysToThai("\\")).toBe("ฃ");
    expect(englishKeysToThai("'")).toBe("ง");
    expect(englishKeysToThai("/")).toBe("ฝ");
    expect(englishKeysToThai("?")).toBe("ฦ");
    expect(englishKeysToThai("Q")).toBe("๐");
    expect(englishKeysToThai("=")).toBe("ช");
    expect(englishKeysToThai("+")).toBe("๙");
    expect(englishKeysToThai(">")).toBe("ฬ");
    expect(thaiKeysToEnglish("ผ")).toBe("z");
    expect(thaiKeysToEnglish("ๅ")).toBe("1");
  });
});

describe("จัดอันดับ", () => {
  const opts = [
    { value: "1", label: "PIX BLACK" },
    { value: "2", label: "PIX-22" },
    { value: "3", label: "PIX" },
    { value: "4", label: "กระเป๋าผ้า" },
    { value: "5", label: "Bag", sub: "กระเป๋า" },
  ];
  it("ตรงเป๊ะขึ้นก่อน → ขึ้นต้น → มีคำ", () => {
    expect(rankOptions(opts, "pix").map((o) => o.value)).toEqual(["3", "2", "1"]);
  });
  it("ข้ามตัวคั่น + ตัวอักษรตามลำดับ", () => {
    expect(rankOptions(opts, "pix 22").map((o) => o.value)[0]).toBe("2");
    expect(rankOptions(opts, "pxbk").map((o) => o.value)).toEqual(["1"]);
  });
  it("ลืมสลับแป้น: พิมพ์ไทยแต่ตั้งใจอังกฤษ", () => {
    // "ร" = i · "x" ปุ่มเดียวกับ "ป" → "พรป" = "rix"? ใช้ "ยรป" = "pix"
    expect(rankOptions(opts, "ยรป").map((o) => o.value)[0]).toBe("3");
  });
  it("ค้นคำรอง (sub) ได้ · ไม่เจอ = ตัดออก", () => {
    expect(rankOptions(opts, "กระเป๋า").map((o) => o.value)).toEqual(["4", "5"]);
    expect(rankOptions(opts, "zzz")).toEqual([]);
    expect(scoreText("abc", "")).toBe(0);
  });
  it("คำค้นว่าง = ลำดับเดิม", () => {
    expect(rankOptions(opts, " ")).toBe(opts);
  });
});
