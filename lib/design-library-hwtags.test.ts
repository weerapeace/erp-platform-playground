import { describe, expect, it } from "vitest";
import { HW_WORDS, looksFinished, suggestHwTag } from "./design-library-hwtags";

describe("เสนอแท็กอะไหล่จากชื่อ", () => {
  it("ตัวเจาะจงชนะตัวกว้าง (หัวซิป ก่อน ซิป · ตาไก่ ก่อน หมุด)", () => {
    expect(suggestHwTag("หัวซิปโลหะ #5 สีทอง")).toBe("หัวซิป");
    expect(suggestHwTag("ห่วง D 25mm ทองเหลือง")).toBe("ห่วง");
    expect(suggestHwTag("ก้ามปูสแตนเลส")).toBe("ตะขอ / ก้ามปู");
    expect(suggestHwTag("กระดุมแป๊กแม่เหล็ก")).toBe("กระดุมแป๊ก");
    expect(suggestHwTag("ตาไก่ทองเหลือง #8")).toBe("ตาไก่");
  });
  it("ชื่อที่ไม่ใช่อะไหล่ = null · ชื่อว่าง = null", () => {
    expect(suggestHwTag("ผ้าแคนวาส 12oz")).toBeNull();
    expect(suggestHwTag("")).toBeNull();
    expect(suggestHwTag(null)).toBeNull();
  });
  it("สินค้าสำเร็จรูปถูกกันออก · มีคำค้นครบ", () => {
    expect(looksFinished("กระเป๋าสะพายห่วงทอง")).toBe(true);
    expect(looksFinished("ห่วง D 25mm")).toBe(false);
    expect(HW_WORDS).toContain("ห่วง");
  });
});
