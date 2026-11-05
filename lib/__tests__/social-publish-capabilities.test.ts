import { describe, it, expect } from "vitest";
import { postFormatOptions, capsOf, PLATFORM_CAPS } from "@/lib/social-publish/capabilities";

describe("postFormatOptions (ตัวเลือกรูปแบบโพสต์ — เดิมเขียนซ้ำ 2 ที่ ตอนนี้มาจากทะเบียนกลาง)", () => {
  it("ชื่อเต็ม = ตรงกับ POST_FORMATS เดิมของการ์ดแคปชั่น", () => {
    const o = postFormatOptions();
    expect(Object.keys(o).sort()).toEqual(["facebook", "instagram", "tiktok", "youtube"]);
    expect(o.instagram.map((x) => x.key)).toEqual(["single", "carousel", "reels", "story"]);
    expect(o.facebook.map((x) => x.key)).toEqual(["single", "carousel", "video", "reels", "story"]);
    expect(o.facebook.find((x) => x.key === "reels")?.th).toBe("Reels (วิดีโอแนวตั้ง)");
    expect(o.instagram.find((x) => x.key === "reels")?.th).toBe("Reels (วิดีโอ)");
    expect(o.tiktok.find((x) => x.key === "carousel")).toEqual({ key: "carousel", th: "โพสต์รูปภาพ", en: "Photo post" });
    expect(o.youtube.find((x) => x.key === "video")?.th).toBe("วิดีโอปกติ");
  });
  it("ชื่อสั้น = ตรงกับ FORMATS เดิมของค่าเริ่มต้นรายแบรนด์", () => {
    const o = postFormatOptions(true);
    expect(o.instagram.find((x) => x.key === "carousel")).toEqual({ key: "carousel", th: "อัลบั้ม", en: "Carousel" });
    expect(o.facebook.find((x) => x.key === "carousel")).toEqual({ key: "carousel", th: "อัลบั้ม", en: "Album" });
    expect(o.tiktok.find((x) => x.key === "carousel")).toEqual({ key: "carousel", th: "โพสต์รูป", en: "Photo" });
  });
  it("FB/IG = อัตโนมัติ · X = กดเองถาวร · ไม่รู้จัก = null", () => {
    expect(PLATFORM_CAPS.facebook.formats.every((x) => x.mode === "auto")).toBe(true);
    expect(PLATFORM_CAPS.instagram.formats.every((x) => x.mode === "auto")).toBe(true);
    expect(PLATFORM_CAPS.x.formats.every((x) => x.mode === "manual")).toBe(true);
    expect(capsOf("FACEBOOK")?.kind).toBe("social");
    expect(capsOf("nope")).toBeNull();
  });
});
