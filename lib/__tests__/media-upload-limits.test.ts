import { describe, it, expect } from "vitest";
import { uploadMaxBytes, fileMb, BIG_UPLOAD_EXT, BIG_UPLOAD_FOLDERS, SMALL_UPLOAD_BYTES } from "../media-upload-limits";

/** ⬆ เพดานไฟล์อัปโหลดรูป/วิดีโอ (ไฟล์ใหญ่ส่งตรงเข้า R2) */
describe("uploadMaxBytes", () => {
  it("วิดีโอ 200 MB · รูป JPG/PNG/WebP 20 MB", () => {
    expect(uploadMaxBytes("video/mp4")).toBe(200 * 1024 * 1024);
    expect(uploadMaxBytes("video/webm")).toBe(200 * 1024 * 1024);
    expect(uploadMaxBytes("image/jpeg")).toBe(20 * 1024 * 1024);
    expect(uploadMaxBytes("image/webp")).toBe(20 * 1024 * 1024);
  });
  it("ชนิดที่ส่งตรงเข้า R2 ไม่ได้ (GIF/PDF) = 4 MB ตามทางเดิม", () => {
    expect(uploadMaxBytes("image/gif")).toBe(SMALL_UPLOAD_BYTES);
    expect(uploadMaxBytes("application/pdf")).toBe(SMALL_UPLOAD_BYTES);
  });
});

describe("ชนิด/โฟลเดอร์", () => {
  it("นามสกุลตามชนิด · โฟลเดอร์ Hero/ชุดมาใหม่/วิดีโอ อยู่ในรายการ", () => {
    expect(BIG_UPLOAD_EXT["video/mp4"]).toBe("mp4");
    expect(BIG_UPLOAD_EXT["image/jpeg"]).toBe("jpg");
    expect(BIG_UPLOAD_FOLDERS).toEqual(expect.arrayContaining(["storefront-hero", "storefront-drops", "storefront-videos"]));
  });
  it("fileMb อ่านง่าย", () => {
    expect(fileMb(4.4 * 1024 * 1024)).toBe("4.4 MB");
    expect(fileMb(10 * 1024 * 1024)).toBe("10 MB");
  });
});
