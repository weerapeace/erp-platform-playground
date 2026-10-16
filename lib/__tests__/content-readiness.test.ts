import { describe, it, expect } from "vitest";
import { platformReadiness, captionRequired } from "../content-readiness";

// โพสต์ตัวอย่างแบบ "Charms": 6 แพลตฟอร์ม มีรูปแนบ 3 รูป · Shopee/Lazada ไม่ได้เขียนแคปชั่น
const charms = {
  platforms: ["instagram", "facebook", "x", "shopee", "lazada", "tiktok"],
  captionPlatforms: ["instagram", "facebook", "x", "tiktok"],
  platformImages: {} as Record<string, string[]>,
  imageKeys: ["a.jpg", "b.jpg", "c.jpg"],
  postStatus: {} as Record<string, string>,
};
const capOff = { shopee: { use_caption: false }, lazada: { use_caption: false } };

describe("platformReadiness", () => {
  it("ไม่ได้ส่งตั้งค่า = ทุกแพลตฟอร์มต้องมีแคปชั่น (พฤติกรรมเดิม)", () => {
    const r = platformReadiness(charms);
    expect(r.find((p) => p.code === "shopee")).toMatchObject({ state: "missing", missing: ["caption"], captionOff: false });
  });
  it("แพลตฟอร์มที่ปิดแคปชั่น + มีรูป = พร้อมโพสต์ ไม่ถูกนับว่าขาด", () => {
    const r = platformReadiness(charms, capOff);
    expect(r.filter((p) => p.state === "missing")).toHaveLength(0);
    expect(r.find((p) => p.code === "lazada")).toMatchObject({ state: "ready", missing: [], captionOff: true });
  });
  it("ปิดแคปชั่นแต่ยังไม่มีรูป = ขาดแค่รูป", () => {
    const r = platformReadiness({ ...charms, imageKeys: [] }, capOff);
    expect(r.find((p) => p.code === "shopee")).toMatchObject({ state: "missing", missing: ["image"] });
    expect(r.find((p) => p.code === "x")).toMatchObject({ missing: ["image"] });
  });
  it("รูปที่เลือกต่อแพลตฟอร์มมาก่อนรูปแนบทั้งหมด", () => {
    const r = platformReadiness({ ...charms, imageKeys: [], platformImages: { shopee: ["banner.jpg"] } }, capOff);
    expect(r.find((p) => p.code === "shopee")).toMatchObject({ state: "ready", images: ["banner.jpg"] });
  });
  it("สถานะโพสต์มาก่อนความพร้อม", () => {
    const r = platformReadiness({ ...charms, imageKeys: [], postStatus: { x: "posted", shopee: "skip", tiktok: "scheduled" } });
    expect(r.find((p) => p.code === "x")?.state).toBe("posted");
    expect(r.find((p) => p.code === "shopee")?.state).toBe("skip");
    expect(r.find((p) => p.code === "tiktok")?.state).toBe("scheduled");
  });
  it("แพลตฟอร์มที่ลงเป็น Story ไม่ต้องมีแคปชั่น (แต่ยังต้องมีรูป)", () => {
    const r = platformReadiness({ ...charms, captionPlatforms: [], formats: { instagram: "story", facebook: "reels" } });
    expect(r.find((p) => p.code === "instagram")).toMatchObject({ state: "ready", captionOff: true, isStory: true });
    expect(r.find((p) => p.code === "facebook")).toMatchObject({ state: "missing", missing: ["caption"], isStory: false });
    const noImg = platformReadiness({ ...charms, imageKeys: [], formats: { instagram: "story" } });
    expect(noImg.find((p) => p.code === "instagram")).toMatchObject({ state: "missing", missing: ["image"] });
  });
  it("captionRequired: ไม่ได้ตั้ง = ต้องมี · use_caption=false = ไม่ต้อง", () => {
    expect(captionRequired(undefined, "x")).toBe(true);
    expect(captionRequired({ x: {} }, "x")).toBe(true);
    expect(captionRequired(capOff, "shopee")).toBe(false);
  });
});
