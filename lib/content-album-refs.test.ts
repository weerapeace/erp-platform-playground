import { describe, it, expect } from "vitest";
import { cleanRefUrl, refProvider, youtubeId, refEmbedUrl } from "./content-album-refs";
import { albumReminder, wishStage } from "./content-album-status";

describe("content-album-refs · ลิงก์ Reference", () => {
  it("รับเฉพาะ http/https และตัดช่องว่าง", () => {
    expect(cleanRefUrl(" https://www.tiktok.com/@a/video/1234567890 ")).toBe("https://www.tiktok.com/@a/video/1234567890");
    expect(cleanRefUrl("javascript:alert(1)")).toBeNull();
    expect(cleanRefUrl("ไม่ใช่ลิงก์")).toBeNull();
  });
  it("รู้ว่าลิงก์มาจากไหน", () => {
    expect(refProvider("https://vt.tiktok.com/ZS123/")).toBe("tiktok");
    expect(refProvider("https://youtu.be/abc123XYZ")).toBe("youtube");
    expect(refProvider("https://m.youtube.com/shorts/abc123XYZ")).toBe("youtube");
    expect(refProvider("https://www.instagram.com/reel/Cx1/")).toBe("instagram");
    expect(refProvider("https://pin.it/abc")).toBe("pinterest");
    expect(refProvider("https://th.pinterest.com/pin/123456789/")).toBe("pinterest");
    expect(refProvider("https://fb.watch/xyz/")).toBe("facebook");
    expect(refProvider("https://example.com/a")).toBe("web");
  });
  it("เลขคลิป YouTube ทุกแบบลิงก์", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("ลิงก์ฝังเล่นในหน้า: YouTube/TikTok เต็ม ได้ · ลิงก์สั้น/Instagram ไม่ได้", () => {
    expect(refEmbedUrl("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(refEmbedUrl("https://www.tiktok.com/@a/video/7300000000000000000")?.src).toContain("tiktok.com/player/v1/7300000000000000000");
    expect(refEmbedUrl("https://vt.tiktok.com/ZS123/")).toBeNull();
    expect(refEmbedUrl("https://www.instagram.com/reel/Cx1/")).toBeNull();
  });
});

describe("content-album-status · รายการที่อยากได้", () => {
  it("ยังไม่มีคนถ่าย = รอหาคนถ่าย · มีแล้ว = นัดถ่ายแล้ว", () => {
    expect(wishStage({ assignee_ids: [] })).toBe("need_shooter");
    expect(wishStage({ assignee_ids: ["u1"] })).toBe("scheduled");
  });
  it("รายการที่อยากได้ไม่เตือน 'รอจัดการนาน' แต่ยังเตือนวันที่", () => {
    const base = { stage: "manage" as const, created_at: "2026-10-01T00:00:00Z", due_date: null, phase: "wish" as const };
    expect(albumReminder(base, "2026-11-04")).toBeNull();
    expect(albumReminder({ ...base, due_date: "2026-11-01" }, "2026-11-04")).toBe("overdue");
    expect(albumReminder({ ...base, phase: "album" }, "2026-11-04")).toBe("stale");
  });
});
