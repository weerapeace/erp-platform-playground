import { describe, it, expect } from "vitest";
import { normalizeBlocks, newBlock, validateBlocks } from "../website-blocks";

/** 🎬 Section วิดีโอแบบอัปโหลด: ใส่คลิปคอมหรือมือถืออย่างน้อย 1 คลิป (requiredOr) — เจ้าของใส่แค่คลิปมือถือแล้วโดนกันเผยแพร่ */
describe("Section วิดีโอ: คลิปคอม/มือถือ อย่างใดอย่างหนึ่ง", () => {
  const vid = (extra: Record<string, unknown>) => normalizeBlocks([{ id: "v", type: "video", source: "upload", ...extra }]);
  const noClip = (extra: Record<string, unknown>) => validateBlocks(vid(extra)).some((i) => i.level === "error" && i.message.includes("ยังไม่ได้อัปโหลดคลิป"));
  it("ไม่มีคลิปเลย = error", () => expect(noClip({})).toBe(true));
  it("มีแค่คลิปมือถือ = ผ่าน", () => expect(noClip({ fileMobile: "storefront-videos/2026-10/1-m.mp4" })).toBe(false));
  it("มีคลิปคอม = ผ่าน", () => expect(noClip({ file: "storefront-videos/2026-10/1-d.mp4" })).toBe(false));
});

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
