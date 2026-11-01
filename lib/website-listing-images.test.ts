import { describe, expect, it } from "vitest";
import { listingImageSlots } from "./website-listing-images";

const SKU = "11111111-2222-3333-4444-555555555555";

describe("listingImageSlots", () => {
  it("ว่าง / null = ไม่มีรูป", () => {
    expect(listingImageSlots(null)).toEqual([]);
    expect(listingImageSlots({})).toEqual([]);
  });

  it("รวม 4 แหล่ง เรียงตามที่โชว์ · ค่าเก่าแบบ string เดี่ยวยังอ่านได้", () => {
    const s = listingImageSlots({
      web_images: ["g1.jpg", "g2.jpg"],
      web_sku_images: { [SKU]: ["s1.jpg", "s2.jpg"], "22222222-2222-3333-4444-555555555555": "old.jpg" },
      web_hero: { desktop: { kind: "image", key: "h-d.jpg" }, mobile: { kind: "video", key: "h-m.mp4", posterKey: "h-p.jpg" }, sku: { [SKU]: { desktop: { kind: "image", key: "hs.jpg" } } } },
      web_banners: [{ id: "b1", imageKey: "b1.jpg" }, { id: "b2", imageKey: null }],
    });
    expect(s.map((x) => `${x.folder}:${x.key}${x.video ? "(v)" : ""}`)).toEqual([
      "gallery:g1.jpg", "gallery:g2.jpg", "sku:s1.jpg", "sku:s2.jpg", "sku:old.jpg",
      "hero:h-d.jpg", "hero:h-m.mp4(v)", "hero:h-p.jpg", "sku:hs.jpg", "banner:b1.jpg",
    ]);
    expect(s.find((x) => x.key === "hs.jpg")?.skuId).toBe(SKU);
  });

  it("key ซ้ำในช่องเดียวกันตัดออก แต่ต่างช่องเก็บไว้", () => {
    const s = listingImageSlots({ web_images: ["a.jpg", "a.jpg", ""], web_sku_images: { [SKU]: ["a.jpg"] } });
    expect(s.map((x) => `${x.folder}:${x.key}`)).toEqual(["gallery:a.jpg", "sku:a.jpg"]);
  });
});
