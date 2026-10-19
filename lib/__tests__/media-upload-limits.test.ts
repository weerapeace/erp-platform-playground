import { describe, it, expect } from "vitest";
import { uploadMaxBytes, fileMb, BIG_UPLOAD_EXT, BIG_UPLOAD_FOLDERS, SMALL_UPLOAD_BYTES, sniffMediaType, resolveMediaType, typeFromName } from "../media-upload-limits";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p).map((c) => c.charCodeAt(0)) : p)));

/** ชนิดไฟล์จากหัวไฟล์ — เจ้าของอัป MP4 24 MB แล้วระบบนึกว่าเป็นรูป (เบราว์เซอร์ไม่บอกชนิด) ตัดที่ 4 MB */
describe("sniffMediaType / resolveMediaType", () => {
  it("MP4 (ftyp isom/mp42) = video/mp4 แม้เบราว์เซอร์ไม่บอกชนิด", () => {
    const mp4 = bytes([0, 0, 0, 0x20], "ftypisom", [0, 0, 2, 0]);
    expect(sniffMediaType(mp4)).toBe("video/mp4");
    expect(resolveMediaType("", sniffMediaType(mp4), "hero.mp4")).toBe("video/mp4");
    expect(resolveMediaType("application/octet-stream", sniffMediaType(mp4), "x")).toBe("video/mp4");
    expect(sniffMediaType(bytes([0, 0, 0, 0x18], "ftypmp42", [0, 0, 0, 0]))).toBe("video/mp4");
  });
  it("ftyp ตระกูลอื่น: QuickTime · HEIC/AVIF = รูป · M4A = เสียง", () => {
    expect(sniffMediaType(bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 0, 0]))).toBe("video/quicktime");
    expect(sniffMediaType(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0]))).toBe("image/heic");
    expect(sniffMediaType(bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0]))).toBe("image/avif");
    expect(sniffMediaType(bytes([0, 0, 0, 0x20], "ftypM4A ", [0, 0, 0, 0]))).toBe("audio/mp4");
  });
  it("WebM · JPG · PNG · WebP · GIF", () => {
    expect(sniffMediaType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe("video/webm");
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMediaType(bytes([0x89], "PNG", [0x0d, 0x0a]))).toBe("image/png");
    expect(sniffMediaType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMediaType(bytes("GIF89a"))).toBe("image/gif");
  });
  it("หัวไฟล์ไม่รู้จัก = ชนิดจากเบราว์เซอร์ → นามสกุล", () => {
    expect(sniffMediaType(bytes([1, 2, 3, 4]))).toBe("");
    expect(resolveMediaType("image/png", "", "a.png")).toBe("image/png");
    expect(resolveMediaType("", "", "clip.MP4")).toBe("video/mp4");
    expect(typeFromName("photo.JPEG")).toBe("image/jpeg");
    expect(typeFromName("noext")).toBe("");
  });
});

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
