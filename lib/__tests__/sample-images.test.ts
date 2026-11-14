import { describe, it, expect } from "vitest";
import { albumPath, albumPreviewKeys, canMoveAlbum, descendantIds, inferAlbumBrand, parentOf, parseSampleMark, rollupAlbum, photosToMove, sampleAlbumMark, sampleAlbumName, sampleCounts, splitSampleFiles, thaiShortDate } from "../sample-images";

describe("ชื่ออัลบั้มตามแบรนด์ + วันที่ลง (เวลาไทย)", () => {
  it("วันไทย ปี พ.ศ. · ใช้เวลาไทยไม่ใช่ UTC", () => {
    expect(thaiShortDate(new Date("2026-11-13T05:00:00Z"))).toBe("13 พ.ย. 2569");
    // 13 พ.ย. 18:30 UTC = 14 พ.ย. 01:30 เวลาไทย → อัลบั้มวันที่ 14
    expect(sampleAlbumName(new Date("2026-11-13T18:30:00Z"))).toBe("SAMPLE 14 พ.ย. 2569");
    expect(sampleAlbumName(new Date("2026-11-13T16:59:00Z"), "Good Goods")).toBe("SAMPLE Good Goods 13 พ.ย. 2569");
    expect(sampleAlbumName(new Date("2026-11-13T05:00:00Z"), "  ")).toBe("SAMPLE 13 พ.ย. 2569");
  });
  it("ป้ายอัลบั้ม: ไม่มีแบรนด์ / มีแบรนด์ / อัลบั้มย่อย · อ่านกลับได้ · อัลบั้มอื่น = null", () => {
    expect(sampleAlbumMark(null)).toBe("sample-images");
    expect(sampleAlbumMark("b1")).toBe("sample-images:b1");
    expect(sampleAlbumMark("b1", "p1")).toBe("sample-images:b1|in:p1");
    expect(sampleAlbumMark(null, "p1")).toBe("sample-images|in:p1");
    expect(parseSampleMark("sample-images")).toEqual({ brandId: null, parentId: null });
    expect(parseSampleMark("sample-images:b1")).toEqual({ brandId: "b1", parentId: null });
    expect(parseSampleMark("sample-images:b1|in:p1")).toEqual({ brandId: "b1", parentId: "p1" });
    expect(parseSampleMark("sample-images|in:p1")).toEqual({ brandId: null, parentId: "p1" });
    expect(parseSampleMark("sample-images:")).toEqual({ brandId: null, parentId: null });
    expect(parseSampleMark("อัลบั้มทั่วไป")).toBeNull();
    expect(parseSampleMark(null)).toBeNull();
  });
});

describe("อัลบั้มในอัลบั้ม", () => {
  //  top ─ a ─ a1
  //      └ b
  //  lost → แม่ไม่อยู่ในรายการ = ชั้นบนสุด
  const T = [
    { id: "top", parent_id: null }, { id: "a", parent_id: "top" }, { id: "a1", parent_id: "a" },
    { id: "b", parent_id: "top" }, { id: "lost", parent_id: "gone" },
  ];
  it("เส้นทาง / แม่ / ลูกทุกชั้น", () => {
    expect(albumPath(T, "a1")).toEqual(["top", "a", "a1"]);
    expect(albumPath(T, "lost")).toEqual(["lost"]);
    expect(albumPath(T, "nope")).toEqual([]);
    expect(parentOf(T, "lost")).toBeNull();
    expect(descendantIds(T, "top").sort()).toEqual(["a", "a1", "b"]);
    expect(descendantIds(T, "a1")).toEqual([]);
  });
  it("กันวนซ้ำ: ย้ายเข้าตัวเอง/ลูกตัวเองไม่ได้ · ขึ้นชั้นบนสุดได้เสมอ", () => {
    expect(canMoveAlbum(T, "a", "b")).toBe(true);
    expect(canMoveAlbum(T, "a", "a1")).toBe(false);
    expect(canMoveAlbum(T, "a", "a")).toBe(false);
    expect(canMoveAlbum(T, "a", null)).toBe(true);
    expect(canMoveAlbum(T, "a", "gone")).toBe(false);
    const loop = [{ id: "x", parent_id: "y" }, { id: "y", parent_id: "x" }];
    expect(albumPath(loop, "x").length).toBeLessThanOrEqual(2);   // ข้อมูลวน = ไม่ค้าง
  });
  it("รวมรูปทุกชั้นบนการ์ด (ไม่นับถังขยะ) + จำนวนอัลบั้มย่อยชั้นถัดไป", () => {
    const ph = (k: string, at: string, sent = false, trashed = false) => ({ r2_key: k, created_at: at, trashed, moved_to: sent ? [{ id: "s", code: "s", name: "s", brand_id: null }] : [] });
    const by = new Map([["top", [ph("t1", "1")]], ["a", [ph("a1k", "2", true)]], ["a1", [ph("deep", "0"), ph("bin", "3", false, true)]]]);
    expect(rollupAlbum(T, by, "top")).toEqual({ photos: 3, sent: 1, preview_keys: ["deep", "t1", "a1k"], sub_count: 2 });
    expect(rollupAlbum(T, by, "b")).toEqual({ photos: 0, sent: 0, preview_keys: [], sub_count: 0 });
  });
});

describe("รูปในอัลบั้ม (ไม่มีระบบรอย้ายแล้ว)", () => {
  const sheet = (id: string, brand: string | null) => ({ id, code: id, name: id, brand_id: brand });
  it("นับรูป / ส่งเข้าใบงานแล้ว / ถังขยะ (รูปในถังไม่นับว่าส่งแล้ว)", () => {
    expect(sampleCounts([{ trashed: false, moved_to: [sheet("s1", "gg")] }, { trashed: false, moved_to: [] }, { trashed: true, moved_to: [sheet("s1", "gg")] }])).toEqual({ photos: 2, trash: 1, sent: 1 });
    expect(sampleCounts([])).toEqual({ photos: 0, trash: 0, sent: 0 });
  });
  it("รูปบนปก: ไม่เอารูปในถัง · เรียงเวลาลง · สูงสุด 4", () => {
    const p = (k: string, at: string, trashed = false) => ({ r2_key: k, created_at: at, trashed });
    expect(albumPreviewKeys([p("c", "3"), p("a", "1"), p("x", "0", true), p("b", "2"), p("d", "4"), p("e", "5")])).toEqual(["a", "b", "c", "d"]);
    expect(albumPreviewKeys([p("a", "1")], 4)).toEqual(["a"]);
    expect(albumPreviewKeys([])).toEqual([]);
  });
  it("แนะนำแบรนด์ของอัลบั้มเก่า: ส่งเข้าใบงานแบรนด์เดียวกันหมด = แบรนด์นั้น · หลายแบรนด์/ยังไม่ส่ง = null · ไม่นับรูปในถังขยะ", () => {
    expect(inferAlbumBrand([{ trashed: false, moved_to: [sheet("s1", "gg")] }, { trashed: false, moved_to: [] }])).toBe("gg");
    expect(inferAlbumBrand([{ trashed: false, moved_to: [sheet("s1", "gg")] }, { trashed: false, moved_to: [sheet("s2", "lm")] }])).toBeNull();
    expect(inferAlbumBrand([{ trashed: true, moved_to: [sheet("s2", "lm")] }, { trashed: false, moved_to: [sheet("s1", "gg")] }])).toBe("gg");
    expect(inferAlbumBrand([{ trashed: false, moved_to: [sheet("s1", null)] }])).toBeNull();
    expect(inferAlbumBrand([])).toBeNull();
  });
  it("ส่งเข้าใบงาน: ข้ามรูปที่อยู่ในใบนั้นแล้ว · ใบอื่นยังส่งได้ (1 รูปอยู่ได้หลายใบงาน)", () => {
    const photos = [
      { id: "a", moved_to: [] },
      { id: "b", moved_to: [sheet("s1", "gg")] },
      { id: "c", moved_to: [sheet("s2", "gg")] },
    ];
    expect(photosToMove(photos, ["a", "b", "c"], "s1")).toEqual(["a", "c"]);
    expect(photosToMove(photos, ["b"], "s2")).toEqual(["b"]);
    expect(photosToMove(photos, [], "s1")).toEqual([]);
  });
});

describe("แยกไฟล์ที่ลากมา", () => {
  it("รูปทั่วไป + HEIC (บางเครื่องไม่บอกชนิด) ลงได้ · RAW/ไฟล์งานแปลงไม่ได้ · อื่น ๆ ไม่ใช่รูป", () => {
    const f = (name: string, type = "") => ({ name, type });
    const r = splitSampleFiles([f("a.jpg", "image/jpeg"), f("b.PNG", "image/png"), f("c.heic"), f("d.CR2"), f("e.psd", "image/vnd.adobe.photoshop"), f("f.pdf", "application/pdf"), f("g.webp", "image/webp")]);
    expect(r.ok.map((x) => x.name)).toEqual(["a.jpg", "b.PNG", "c.heic", "g.webp"]);
    expect(r.unsupported.map((x) => x.name)).toEqual(["d.CR2", "e.psd"]);
    expect(r.notImage.map((x) => x.name)).toEqual(["f.pdf"]);
  });
});
