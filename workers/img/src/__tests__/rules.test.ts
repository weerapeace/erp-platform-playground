import { describe, it, expect } from "vitest";
import { canTransform, contentTypeOf, IMGSET_RE, imageHeaders, isSafeKey, originQuery, transformOf, variantKey } from "../rules";

const sp = (q: string) => new URLSearchParams(q);

describe("isSafeKey", () => {
  it("รับชื่อไฟล์ปกติ", () => {
    expect(isSafeKey("parent_skus_v2/68a8/1794040871267-4clc9e.jpeg")).toBe(true);
    expect(isSafeKey("imgset/0b6c2d1e-1111-2222-3333-444455556666")).toBe(true);
  });
  it("ไม่รับ ทะลุโฟลเดอร์ / อักขระแปลก / ว่าง", () => {
    expect(isSafeKey("a/../b.jpg")).toBe(false);
    expect(isSafeKey("./a.jpg")).toBe(false);
    expect(isSafeKey("/abs.jpg")).toBe(false);
    expect(isSafeKey("a b.jpg")).toBe(false);
    expect(isSafeKey("")).toBe(false);
    expect(isSafeKey(null)).toBe(false);
  });
});

describe("transformOf (ต้องตรงกับแอป)", () => {
  it("ไม่มี w / w เกิน 3200 / w ติดลบ = ไม่ย่อ", () => {
    expect(transformOf(sp("key=a"))).toBeNull();
    expect(transformOf(sp("key=a&w=0"))).toBeNull();
    expect(transformOf(sp("key=a&w=4000"))).toBeNull();
    expect(transformOf(sp("key=a&w=-5"))).toBeNull();
  });
  it("q นอกช่วง 50–92 = 75 · ปัดเป็นจำนวนเต็ม", () => {
    expect(transformOf(sp("w=400"))).toEqual({ w: 400, q: 75, sq: false, pad34: false });
    expect(transformOf(sp("w=400&q=30"))?.q).toBe(75);
    expect(transformOf(sp("w=400&q=85.4"))?.q).toBe(85);
    expect(transformOf(sp("w=400.6"))?.w).toBe(401);
  });
  it("sq ชนะ pad", () => {
    expect(transformOf(sp("w=400&sq=1&pad=34"))).toEqual({ w: 400, q: 75, sq: true, pad34: false });
    expect(transformOf(sp("w=750&pad=34"))?.pad34).toBe(true);
  });
});

describe("ชนิดไฟล์ / ย่อได้ไหม", () => {
  it("metadata ก่อน แล้วค่อยนามสกุล", () => {
    expect(contentTypeOf("a.png", "image/webp")).toBe("image/webp");
    expect(contentTypeOf("a.PNG")).toBe("image/png");
    expect(contentTypeOf("clip.mp4")).toBe("video/mp4");
    expect(contentTypeOf("noext")).toBe("image/jpeg");
  });
  it("GIF/SVG/วิดีโอ ไม่ย่อ", () => {
    expect(canTransform("image/jpeg")).toBe(true);
    expect(canTransform("image/gif")).toBe(false);
    expect(canTransform("image/svg+xml")).toBe(false);
    expect(canTransform("video/mp4")).toBe(false);
  });
});

describe("ที่เก็บรูปย่อ", () => {
  const t = { w: 400, q: 75, sq: false, pad34: false };
  it("ผูก etag — ต้นฉบับเปลี่ยน = ชื่อใหม่", () => {
    expect(variantKey("p/a.jpg", "abc123", t)).toBe("_variants/p/a.jpg/abc123/w400-q75");
    expect(variantKey("p/a.jpg", "\"zz-9\"", { ...t, sq: true })).toBe("_variants/p/a.jpg/zz9/w400-q75-sq");
    expect(variantKey("p/a.jpg", "e1", t)).not.toBe(variantKey("p/a.jpg", "e2", t));
  });
  it("query ที่ส่งให้แอปย่อ", () => {
    expect(originQuery("p/a b.jpg", { ...t, pad34: true })).toBe("key=p%2Fa+b.jpg&w=400&q=75&pad=34");
  });
});

describe("หัวตอบกลับ / ชุดรูป", () => {
  it("ใช้ข้ามโดเมนได้ + SVG ห้ามรันสคริปต์", () => {
    const h = imageHeaders("image/jpeg");
    expect(h["Access-Control-Allow-Origin"]).toBe("*");
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(imageHeaders("image/svg+xml")["Content-Security-Policy"]).toContain("sandbox");
  });
  it("imgset", () => {
    expect(IMGSET_RE.test("imgset/0b6c2d1e-1111-2222-3333-444455556666")).toBe(true);
    expect(IMGSET_RE.test("imgset/abc")).toBe(false);
  });
});
