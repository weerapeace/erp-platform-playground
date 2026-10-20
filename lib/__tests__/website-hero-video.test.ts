import { describe, it, expect } from "vitest";
import { normalizeBlocks, newBlock } from "../website-blocks";

/** 🎬 แบนเนอร์หลัก: วิดีโอพื้นหลังอัปโหลด/เลือกจากคลังได้ (ช่องคลิปกลาง videoFile) · ลิงก์เดิมยังใช้ได้ */
describe("Hero วิดีโอพื้นหลัง", () => {
  it("บล็อกใหม่ = ยังไม่มีคลิป (null) · ลิงก์ว่าง", () => {
    const [b] = normalizeBlocks([newBlock("hero", 1)]);
    expect(b).toMatchObject({ videoFile: null, videoFileMobile: null, videoUrl: "" });
  });

  it("เก็บ key คลิปที่อัป/เลือกจากคลัง (คอม + มือถือ) · key แปลก ๆ = ทิ้ง", () => {
    const [b] = normalizeBlocks([{ id: "h", type: "hero", videoFile: "storefront-videos/2026-10/1-a.mp4", videoFileMobile: "storefront-videos/2026-10/2-b.mp4" }]);
    expect(b).toMatchObject({ videoFile: "storefront-videos/2026-10/1-a.mp4", videoFileMobile: "storefront-videos/2026-10/2-b.mp4" });
    const [bad] = normalizeBlocks([{ id: "h", type: "hero", videoFile: "javascript:alert(1)" }]);
    expect((bad as { videoFile: unknown }).videoFile).toBeNull();
  });

  it("บล็อกเก่าที่ใช้ลิงก์ = ยังอยู่ครบ (ไม่มีคลิปอัป)", () => {
    const [b] = normalizeBlocks([{ id: "h", type: "hero", videoUrl: "https://cdn.example.com/clip.mp4" }]);
    expect(b).toMatchObject({ videoUrl: "https://cdn.example.com/clip.mp4", videoFile: null });
  });
});
