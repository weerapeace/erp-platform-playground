import { describe, it, expect } from "vitest";
import { DRIVE_CHUNK_BYTES, isDriveUploadUrl, chunkContentRange, nextOffsetFromRange } from "@/lib/drive-upload-relay";

describe("drive-upload-relay", () => {
  it("ขนาดชิ้นเป็นจำนวนเท่าของ 256KB และไม่เกินลิมิต body ~4.5MB", () => {
    expect(DRIVE_CHUNK_BYTES % (256 * 1024)).toBe(0);
    expect(DRIVE_CHUNK_BYTES).toBeLessThan(4.4 * 1024 * 1024);
  });

  it("isDriveUploadUrl: รับเฉพาะ resumable session ของ Google Drive", () => {
    expect(isDriveUploadUrl("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=ABC")).toBe(true);
    expect(isDriveUploadUrl("http://www.googleapis.com/upload/drive/v3/files?upload_id=ABC")).toBe(false);
    expect(isDriveUploadUrl("https://evil.com/upload/drive/v3/files?upload_id=ABC")).toBe(false);
    expect(isDriveUploadUrl("https://www.googleapis.com/drive/v3/files?upload_id=ABC")).toBe(false);
    expect(isDriveUploadUrl("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable")).toBe(false);
    expect(isDriveUploadUrl("not a url")).toBe(false);
  });

  it("chunkContentRange + nextOffsetFromRange", () => {
    expect(chunkContentRange(0, 100, 250)).toBe("bytes 0-99/250");
    expect(chunkContentRange(200, 50, 250)).toBe("bytes 200-249/250");
    expect(nextOffsetFromRange("bytes=0-3932159")).toBe(3932160);
    expect(nextOffsetFromRange(null)).toBe(0);
  });
});
