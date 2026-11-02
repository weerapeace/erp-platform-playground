import { describe, it, expect } from "vitest";
import { normalizeMedia, friendlyMetaError } from "@/lib/social-publish/rules";

const img = (k: string) => ({ key: k, type: "image" });
const vid = (k: string) => ({ key: k, type: "video" });

describe("normalizeMedia (กติกาเลือกสื่อของตัวยิงโพสต์)", () => {
  it("Story ใช้ไฟล์แรกชิ้นเดียว · ไม่มีไฟล์ = error", () => {
    expect(normalizeMedia("story", [img("a"), img("b")])).toEqual({ media: [img("a")] });
    expect("error" in normalizeMedia("story", [])).toBe(true);
  });
  it("รูปเดียว/อัลบั้ม ตัดวิดีโอออก", () => {
    expect(normalizeMedia("single", [vid("v"), img("a"), img("b")])).toEqual({ media: [img("a")] });
    expect(normalizeMedia("carousel", [img("a"), vid("v"), img("b")])).toEqual({ media: [img("a"), img("b")] });
  });
  it("วิดีโอ/Reels ต้องมีวิดีโอ · ใช้วิดีโอแรก", () => {
    expect(normalizeMedia("reels", [img("a"), vid("v1"), vid("v2")])).toEqual({ media: [vid("v1")] });
    expect("error" in normalizeMedia("video", [img("a")])).toBe(true);
  });
  it("รูปจาก Google Drive (drive:<id>) ไม่ถูกเดาเป็นวิดีโอ", () => {
    expect(normalizeMedia("", [img("drive:abc123def456")])).toEqual({ media: [img("drive:abc123def456")] });
  });
  it("ไม่มีสื่อเลย = error · ชนิดแปลก ๆ ถือเป็นรูป", () => {
    expect("error" in normalizeMedia("", [])).toBe(true);
    expect(normalizeMedia("", [{ key: "x", type: "weird" }])).toEqual({ media: [img("x")] });
  });
});

describe("friendlyMetaError", () => {
  it("สิทธิ์/โทเคน → บอกให้เชื่อมต่อใหม่", () => {
    expect(friendlyMetaError("instagram", "(#10) Application does not have permission for this action")).toContain("เชื่อมต่อใหม่");
  });
  it("บัญชีที่กดเชื่อมติดด่านตรวจสอบ (190/459) → บอกให้เข้า facebook.com แล้วเชื่อมใหม่", () => {
    const raw = "You cannot access the app till you log in to www.facebook.com and follow the instructions given.";
    expect(friendlyMetaError("facebook", raw, 190, 459)).toContain("ติดด่านตรวจสอบ");
    expect(friendlyMetaError("facebook", raw)).toContain("เชื่อมใหม่");   // ไม่มีรหัส ก็จับจากข้อความได้
  });
  it("token หมดอายุ (190 อื่น ๆ) → เชื่อมใหม่", () => {
    expect(friendlyMetaError("instagram", "Error validating access token", 190, 460)).toContain("หมดอายุ");
  });
  it("สัดส่วนรูป → บอกช่วงที่ IG รับ", () => {
    expect(friendlyMetaError("instagram", "The aspect ratio is not supported.")).toContain("4:5");
  });
  it("อื่น ๆ → ระบุแพลตฟอร์ม + ข้อความเดิม", () => {
    expect(friendlyMetaError("facebook", "Something odd")).toBe("Facebook ปฏิเสธ: Something odd");
  });
});
