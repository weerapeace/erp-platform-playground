import { describe, expect, it } from "vitest";
import { matchFileToCode, matchFilesToCodes } from "./filename-code-match";

const CODES = ["MGN194-01", "MGN194-02", "MGN194-01-L", "TTM127-03"];

describe("matchFileToCode", () => {
  it("ชื่อไฟล์ตรงรหัส", () => expect(matchFileToCode("MGN194-02.jpg", CODES)).toBe("MGN194-02"));
  it("ไม่สนตัวเล็ก/ใหญ่ + ตัวคั่นหลังรหัส", () => {
    expect(matchFileToCode("mgn194-02_1.JPG", CODES)).toBe("MGN194-02");
    expect(matchFileToCode("MGN194-02 (2).png", CODES)).toBe("MGN194-02");
    expect(matchFileToCode("MGN194-02-front.webp", CODES)).toBe("MGN194-02");
  });
  it("รหัสยาวกว่าได้ก่อน", () => expect(matchFileToCode("MGN194-01-L_2.jpg", CODES)).toBe("MGN194-01-L"));
  it("ต่อด้วยตัวเลข = ไม่ใช่รหัสนี้", () => expect(matchFileToCode("MGN194-010.jpg", CODES)).toBeNull());
  it("ไม่เจอ = null", () => expect(matchFileToCode("IMG_2045.jpg", CODES)).toBeNull());
  it("มี path นำหน้าก็ได้", () => expect(matchFileToCode("C:\\photos\\TTM127-03_1.jpg", CODES)).toBe("TTM127-03"));
});

describe("matchFilesToCodes", () => {
  it("คงลำดับไฟล์", () => {
    const r = matchFilesToCodes([{ name: "x.jpg" }, { name: "MGN194-01.jpg" }], CODES);
    expect(r.map((x) => x.code)).toEqual([null, "MGN194-01"]);
  });
});
