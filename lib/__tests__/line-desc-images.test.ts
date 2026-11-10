import { describe, it, expect } from "vitest";
import { appendDescImages, countPresent, isLineCdnUrl } from "@/lib/line-desc-images";

const A = "https://obs-ect.line-scdn.net/r/ect/ect/aaa";
const B = "https://obs-ect.line-scdn.net/r/ect/ect/bbb";

describe("line-desc-images", () => {
  it("isLineCdnUrl: รับเฉพาะลิงก์เซิร์ฟเวอร์รูปของ LINE", () => {
    expect(isLineCdnUrl(A)).toBe(true);
    expect(isLineCdnUrl("https://erp-platform-playground.vercel.app/api/r2-image?key=x")).toBe(false);
    expect(isLineCdnUrl("http://obs-ect.line-scdn.net/x")).toBe(false);
  });

  it("appendDescImages: ต่อรูปท้ายรายละเอียด 1 รูป = 1 ย่อหน้า · ข้ามรูปซ้ำ/ที่มีอยู่แล้ว", () => {
    expect(appendDescImages("<p>ข้อความ</p>", [A, B])).toBe(`<p>ข้อความ</p><p><img src="${A}" alt=""></p><p><img src="${B}" alt=""></p>`);
    expect(appendDescImages(`<p>x</p><p><img src="${A}"></p>`, [A, B])).toBe(`<p>x</p><p><img src="${A}"></p><p><img src="${B}" alt=""></p>`);
    expect(appendDescImages("<p>x</p>", [])).toBe("<p>x</p>");
    expect(appendDescImages("<p>x</p>", [A, A])).toBe(`<p>x</p><p><img src="${A}" alt=""></p>`);
  });

  it("countPresent: นับรูปที่อยู่ในรายละเอียดจริง", () => {
    expect(countPresent(`<p><img src="${A}"></p>`, [A, B])).toBe(1);
    expect(countPresent("", [A])).toBe(0);
  });
});
