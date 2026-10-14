import { describe, it, expect } from "vitest";
import { captionLimitCheck } from "../caption-template";

describe("captionLimitCheck", () => {
  it("X 280: นับตาม code point และบอกจำนวนที่เกิน", () => {
    const r = captionLimitCheck("x", "a".repeat(281));
    expect(r).toMatchObject({ chars: 281, max: 280, over: 1 });
  });
  it("อีโมจิ/ไทย นับเป็นตัวอักษร ไม่ใช่ไบต์", () => {
    expect(captionLimitCheck("x", "กระเป๋า ✨").chars).toBe(9);
  });
  it("IG นับแฮชแท็ก และเกิน 30 = hashtagsOver", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    const r = captionLimitCheck("instagram", `สวย\n${tags}`);
    expect(r.hashtagCount).toBe(31); expect(r.hashtagsOver).toBe(1); expect(r.over).toBe(0);
  });
  it("แพลตฟอร์มที่ไม่มีลิมิต = ไม่เตือน", () => {
    expect(captionLimitCheck("shopee", "x".repeat(99999))).toMatchObject({ max: null, over: 0 });
  });
});
