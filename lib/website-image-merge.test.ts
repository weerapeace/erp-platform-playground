import { describe, expect, it } from "vitest";
import { mergeListingImages } from "./website-image-merge";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const OTHER = "99999999-9999-9999-9999-999999999999";
const ok = new Set([S1, S2]);
const cur = {
  web_images: ["g1", "g2"],
  web_sku_images: { [S1]: ["a1"], [S2]: "b1" }, // ค่าเก่าแบบ string เดี่ยวก็ต้องอ่านได้
  web_hero: { desktop: { kind: "video", key: "old.mp4", posterKey: "p.jpg" }, mobile: null },
};

describe("mergeListingImages", () => {
  it("ต่อท้าย: เดิม + ใหม่ ไม่ซ้ำ · ช่องอื่นไม่แตะ", () => {
    const { patch, files } = mergeListingImages(cur, { parentId: "p", gallery: ["g2", "n1"], skus: { [S1]: ["n2"] } }, ok, "append");
    expect(patch.webImages).toEqual(["g1", "g2", "n1"]);
    expect(patch.webSkuImages).toEqual({ [S1]: ["a1", "n2"], [S2]: ["b1"] });
    expect(patch.webHero).toBeUndefined();
    expect(files).toBe(3);
  });
  it("แทนที่: เฉพาะช่องที่มีรูปใหม่", () => {
    const { patch } = mergeListingImages(cur, { parentId: "p", skus: { [S2]: ["n1", "n2"] } }, ok, "replace");
    expect(patch.webImages).toBeUndefined();
    expect(patch.webSkuImages).toEqual({ [S1]: ["a1"], [S2]: ["n1", "n2"] });
  });
  it("เพดาน 12 / 8", () => {
    const many = Array.from({ length: 15 }, (_, i) => `k${i}`);
    const { patch } = mergeListingImages(cur, { parentId: "p", gallery: many, skus: { [S1]: many } }, ok, "append");
    expect(patch.webImages).toHaveLength(12);
    expect(patch.webImages?.slice(0, 2)).toEqual(["g1", "g2"]);
    expect(patch.webSkuImages?.[S1]).toHaveLength(8);
  });
  it("Hero: ใหม่แทนช่องนั้น · ช่องอื่น/สีอื่นคงเดิม", () => {
    const { patch, files } = mergeListingImages(cur, { parentId: "p", hero: { mobile: "hm" }, skuHero: { [S1]: { desktop: "sh" } } }, ok, "append");
    expect(patch.webHero?.desktop).toEqual({ kind: "video", key: "old.mp4", posterKey: "p.jpg" });
    expect(patch.webHero?.mobile).toEqual({ kind: "image", key: "hm", posterKey: null });
    expect(patch.webHero?.sku?.[S1]).toEqual({ desktop: { kind: "image", key: "sh", posterKey: null }, mobile: null });
    expect(files).toBe(2);
  });
  it("Hero วิดีโอ", () => {
    const { patch } = mergeListingImages(cur, { parentId: "p", hero: { desktop: { key: "new.mp4", kind: "video" } }, skuHero: { [S2]: { mobile: { key: "m.mp4", kind: "video" } } } }, ok, "append");
    expect(patch.webHero?.desktop).toEqual({ kind: "video", key: "new.mp4", posterKey: null });
    expect(patch.webHero?.sku?.[S2]?.mobile).toEqual({ kind: "video", key: "m.mp4", posterKey: null });
  });
  it("สี/คีย์ที่ไม่ถูกต้อง = ไม่ลง", () => {
    const { patch, files } = mergeListingImages(cur, { parentId: "p", skus: { [OTHER]: ["x"] }, skuHero: { [OTHER]: { desktop: "y" } }, gallery: ["bad key with space"], hero: { desktop: "<x>" } }, ok, "append");
    expect(files).toBe(0);
    expect(patch).toEqual({});
  });
  it("แถวว่าง (ยังไม่เคยตั้งอะไร)", () => {
    const { patch } = mergeListingImages({ web_images: null, web_sku_images: null, web_hero: null }, { parentId: "p", gallery: ["n1"], hero: { desktop: "h" } }, ok, "append");
    expect(patch.webImages).toEqual(["n1"]);
    expect(patch.webHero).toEqual({ desktop: { kind: "image", key: "h", posterKey: null }, mobile: null });
  });
});
