import { describe, it, expect } from "vitest";
import { ImageOpenError, groupFailures, imageOpenMessage, imageOpenProblem, uploadErrorText } from "@/lib/image-open-error";
import { sniffMediaType } from "@/lib/media-upload-limits";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("เปิดรูปไม่ได้ → บอกสาเหตุ", () => {
  it("ไฟล์ว่าง / อ่านไม่ได้ (เช่น Google Drive ยังไม่โหลด)", () => {
    expect(imageOpenProblem(0, "")).toBe("empty");
    expect(imageOpenProblem(1234, null)).toBe("unreadable");
    expect(imageOpenMessage("unreadable")).toContain("Google Drive");
  });

  it("ดูชนิดจริงจากหัวไฟล์ — HEIC / TIFF / PSD / PDF / วิดีโอ / ไม่รู้จัก / ไฟล์เสีย", () => {
    expect(imageOpenProblem(10, "image/heic")).toBe("heic_failed");
    expect(imageOpenProblem(10, "image/avif")).toBe("avif");
    expect(imageOpenProblem(10, "image/tiff")).toBe("tiff");
    expect(imageOpenProblem(10, "image/vnd.adobe.photoshop")).toBe("psd");
    expect(imageOpenProblem(10, "application/pdf")).toBe("pdf");
    expect(imageOpenProblem(10, "video/mp4")).toBe("video");
    expect(imageOpenProblem(10, "")).toBe("unknown_format");
    expect(imageOpenProblem(10, "image/jpeg")).toBe("corrupt");
  });

  it("ข้อความจาก error: Error = ข้อความของมัน · อย่างอื่น (เช่น Event ตอนรูปเปิดไม่ขึ้น) = ข้อความกว้าง", () => {
    expect(uploadErrorText(new ImageOpenError("tiff"))).toBe(imageOpenMessage("tiff"));
    expect(uploadErrorText({ type: "error" })).toBe("อัปโหลดไม่สำเร็จ");
    expect(uploadErrorText("ไฟล์ใหญ่เกิน")).toBe("ไฟล์ใหญ่เกิน");
  });

  it("จัดกลุ่มไฟล์ที่พลาดตามสาเหตุ (คงลำดับ)", () => {
    const g = groupFailures([
      { name: "01/1.jpg", why: "A" }, { name: "01/2.jpg", why: "B" }, { name: "06/1.jpg", why: "A" },
    ]);
    expect(g.map((x) => [x.why, x.items.map((i) => i.name)])).toEqual([["A", ["01/1.jpg", "06/1.jpg"]], ["B", ["01/2.jpg"]]]);
  });
});

describe("หัวไฟล์ชนิดใหม่", () => {
  it("รู้จัก HEIC หลายแบบ + TIFF / PSD / PDF / BMP · JPG ยังเป็น JPG", () => {
    expect(sniffMediaType(bytes([0, 0, 0, 24], "ftypheis", [0, 0, 0, 0]))).toBe("image/heic");
    expect(sniffMediaType(bytes("II*", [0], "........"))).toBe("image/tiff");
    expect(sniffMediaType(bytes("MM", [0], "*........"))).toBe("image/tiff");
    expect(sniffMediaType(bytes("8BPS", [0, 1, 0, 0, 0, 0, 0, 0]))).toBe("image/vnd.adobe.photoshop");
    expect(sniffMediaType(bytes("%PDF-1.7......."))).toBe("application/pdf");
    expect(sniffMediaType(bytes("BM", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/bmp");
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"))).toBe("image/jpeg");
    expect(sniffMediaType(bytes("hello world!...."))).toBe("");
  });
});
