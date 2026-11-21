/**
 * เทสต์ค่าตั้งต้นที่ทุกร้านต้องเหมือนกัน (lib/listing-defaults) — เจ้าของบอก 2026-11-21 LY22
 */
import { describe, it, expect } from "vitest";
import { listingColorName, listingDefaultImages } from "../listing-defaults";

describe("listing-defaults", () => {
  it("ชื่อสี: Color Platform [TH] ก่อน (\"ดำ (01)\" ไม่ถูกตัดเหลือ \"ดำ\")", () => {
    expect(listingColorName({ color_platform_th: "ดำ (01)", color_th: "ดำ", color: "Black" })).toBe("ดำ (01)");
    expect(listingColorName({ color_platform_th: null, color_th: "ดำ", color: "Black" })).toBe("ดำ");
    expect(listingColorName({ color: "Black" })).toBe("Black");
  });
  it("ชุดรูป: รูปในร่างก่อน แล้วรูปของสินค้าตามลำดับ · ไม่ซ้ำ · ต่างกันแค่จำนวนสูงสุด", () => {
    const pool = ["cover", "g1", "g2", "black", "white"];
    expect(listingDefaultImages(pool, [], 9)).toEqual(pool);
    expect(listingDefaultImages(pool, ["cover"], 9)).toEqual(pool);
    expect(listingDefaultImages(pool, [], 3)).toEqual(["cover", "g1", "g2"]);
    expect(listingDefaultImages(pool, ["x", "g1"], 4)).toEqual(["x", "g1", "cover", "g2"]);
  });
});
