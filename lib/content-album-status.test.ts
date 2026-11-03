import { describe, it, expect } from "vitest";
import { albumStatus, albumReminder, bangkokToday, type AlbumPostInput, type AlbumStatusInput } from "./content-album-status";

describe("content-album-status · เตือนอัลบั้ม", () => {
  const a = (over: Partial<{ stage: "manage" | "caption" | "ready" | "posted" | "closed"; created_at: string; due_date: string | null }> = {}) =>
    ({ stage: "caption" as const, created_at: "2026-11-01T08:00:00Z", due_date: null, ...over });
  it("เลยวันที่ต้องลง", () => { expect(albumReminder(a({ due_date: "2026-11-02" }), "2026-11-03")).toBe("overdue"); });
  it("ต้องลงพรุ่งนี้ (ข้ามเดือนได้)", () => { expect(albumReminder(a({ due_date: "2026-12-01" }), "2026-11-30")).toBe("due_soon"); });
  it("รอจัดการครบ 3 วัน", () => {
    expect(albumReminder(a({ stage: "manage" }), "2026-11-04")).toBe("stale");
    expect(albumReminder(a({ stage: "manage" }), "2026-11-03")).toBeNull();
  });
  it("ลงแล้ว/ปิดแล้ว ไม่เตือน", () => {
    expect(albumReminder(a({ stage: "posted", due_date: "2026-11-01" }), "2026-11-03")).toBeNull();
    expect(albumReminder(a({ stage: "closed", due_date: "2026-11-01" }), "2026-11-03")).toBeNull();
  });
  it("วันนี้เวลาไทย: 18:00 UTC = วันถัดไปของไทย", () => { expect(bangkokToday(Date.parse("2026-11-03T18:00:00Z"))).toBe("2026-11-04"); });
});

const post = (over: Partial<AlbumPostInput> = {}): AlbumPostInput => ({
  platforms: ["facebook"], captionPlatforms: ["facebook"], platformImages: {}, imageKeys: ["k1"], postStatus: {},
  status: "draft", isActive: true, ...over,
});
const album = (over: Partial<AlbumStatusInput> = {}): AlbumStatusInput => ({
  plannedPlatforms: [], captionDraft: null, fileCount: 5, closed: false, posts: [], ...over,
});

describe("content-album-status · สถานะอัลบั้มคิดจากโพสต์", () => {
  it("ยังไม่มีไฟล์ = รอจัดการ", () => {
    expect(albumStatus(album({ fileCount: 0, plannedPlatforms: ["facebook"], captionDraft: "x" })).stage).toBe("manage");
  });
  it("มีไฟล์แต่ยังไม่เลือกแพลตฟอร์ม = รอจัดการ", () => {
    expect(albumStatus(album()).stage).toBe("manage");
  });
  it("เลือกแพลตฟอร์มแล้ว ไม่มีแคปชั่นร่าง = รอหา Caption", () => {
    const r = albumStatus(album({ plannedPlatforms: ["facebook", "instagram"] }));
    expect(r.stage).toBe("caption");
    expect(r.platforms.map((p) => p.state)).toEqual(["caption", "caption"]);
  });
  it("มีแคปชั่นร่าง = รอลง Social", () => {
    expect(albumStatus(album({ plannedPlatforms: ["facebook"], captionDraft: "สวัสดี" })).stage).toBe("ready");
  });
  it("แพลตฟอร์มที่ตั้งไม่ใช้แคปชั่น ไม่ต้องมีแคปชั่นร่าง", () => {
    expect(albumStatus(album({ plannedPlatforms: ["shopee"] }), { shopee: { use_caption: false } }).stage).toBe("ready");
  });
  it("โพสต์ลงครบทุกแพลตฟอร์ม = ลงแล้ว", () => {
    const r = albumStatus(album({ posts: [post({ platforms: ["facebook", "instagram"], captionPlatforms: ["facebook", "instagram"], postStatus: { facebook: "posted", instagram: "posted" } })] }));
    expect(r.stage).toBe("posted");
  });
  it("ลง FB แล้วแต่ IG ยังขาดแคปชั่น = รอหา Caption และชิป FB = ลงแล้ว", () => {
    const r = albumStatus(album({ posts: [post({ platforms: ["facebook", "instagram"], captionPlatforms: ["facebook"], postStatus: { facebook: "posted" } })] }));
    expect(r.stage).toBe("caption");
    expect(r.platforms.find((p) => p.code === "facebook")?.state).toBe("posted");
    expect(r.platforms.find((p) => p.code === "instagram")?.state).toBe("caption");
  });
  it("ตั้งเวลาแล้ว = ยังรอลง", () => {
    const r = albumStatus(album({ posts: [post({ postStatus: { facebook: "scheduled" } })] }));
    expect(r.stage).toBe("ready");
    expect(r.platforms[0].state).toBe("scheduled");
  });
  it("โพสต์ที่ยกเลิกไม่นับ", () => {
    const r = albumStatus(album({ plannedPlatforms: ["facebook"], captionDraft: "x", posts: [post({ status: "cancelled", postStatus: { facebook: "posted" } })] }));
    expect(r.stage).toBe("ready");
  });
  it("แพลตฟอร์มที่ตั้งข้าม ไม่ถ่วงสถานะ", () => {
    const r = albumStatus(album({ plannedPlatforms: ["facebook"], posts: [post({ platforms: ["facebook", "tiktok"], postStatus: { facebook: "posted", tiktok: "skip" } })] }));
    expect(r.stage).toBe("posted");
    expect(r.platforms.map((p) => p.code)).toEqual(["facebook"]);
  });
  it("โพสต์ไม่มีรูป = รอจัดการ", () => {
    expect(albumStatus(album({ posts: [post({ imageKeys: [] })] })).stage).toBe("manage");
  });
  it("ปิดอัลบั้มเอง = ปิดแล้ว", () => {
    expect(albumStatus(album({ closed: true, plannedPlatforms: ["facebook"] })).stage).toBe("closed");
  });
});
