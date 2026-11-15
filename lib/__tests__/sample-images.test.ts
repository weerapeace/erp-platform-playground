import { describe, it, expect } from "vitest";
import { browseAlbums, albumMatches, photoMatches, sortAlbums, sortPhotos, isAlbumSort, isPhotoSort, SAMPLE_TAB_ALL, SAMPLE_TAB_NONE, albumCardLabel, albumFullName, brandPhotoTotals, inBrandTab, albumPath, albumPreviewKeys, canMoveAlbum, descendantIds, inferAlbumBrand, isDayAlbum, looksLikeDayAlbumName, parentOf, parseSampleMark, rollupAlbum, photosToMove, sampleAlbumMark, sampleAlbumName, sampleCounts, splitSampleFiles, thaiShortDate } from "../sample-images";

describe("อัลบั้มของวัน vs อัลบั้มที่ตั้งชื่อเอง (ชั้นบนสุด)", () => {
  it("ชั้นบนสุด + ชื่อแบบ SAMPLE <แบรนด์> <วันที่> = อัลบั้มของวัน · ชื่ออื่น/อัลบั้มย่อย = ไม่ใช่", () => {
    const day = sampleAlbumName(new Date("2026-11-15T05:00:00Z"), "Good Goods");
    expect(isDayAlbum({ name: day, parent_id: null })).toBe(true);
    expect(isDayAlbum({ name: sampleAlbumName(new Date("2026-11-15T05:00:00Z")), parentId: null })).toBe(true);
    expect(isDayAlbum({ name: "2026-11-15-002", parent_id: null })).toBe(false);      // Louis Batch "อัลบั้มใหม่"
    expect(isDayAlbum({ name: day, parent_id: "p1" })).toBe(false);                    // อัลบั้มของวันที่ถูกย้ายเข้าไปในอัลบั้มอื่น
    expect(isDayAlbum({ name: "SAMPLE ทดลอง", parent_id: null })).toBe(false);
    expect(looksLikeDayAlbumName("  SAMPLE Louis Montini 1 ม.ค. 2570 ")).toBe(true);
    expect(looksLikeDayAlbumName("")).toBe(false);
  });
});

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

describe("หน้าตาร่วม (หน้า SAMPLE + แท็บ SAMPLE ในตัวเลือกไฟล์กลาง)", () => {
  const day = { name: sampleAlbumName(new Date("2026-11-15T05:00:00Z"), "Good Goods"), created_at: "2026-11-15T05:00:00Z", parent_id: null };
  const named = { name: "กระเป๋าใส ลายหมี", created_at: "2026-11-15T05:00:00Z", parent_id: null };
  const sub = { ...day, parent_id: "p1" };
  it("ชื่อการ์ด: อัลบั้มของวัน = วันที่ · ตั้งชื่อเอง/อัลบั้มย่อย = ชื่อจริง", () => {
    expect(albumCardLabel(day)).toBe("15 พ.ย. 2569");
    expect(albumCardLabel(named)).toBe("กระเป๋าใส ลายหมี");
    expect(albumCardLabel(sub)).toBe(day.name);
  });
  it("ชื่อเต็ม: อัลบั้มของวัน = แบรนด์ · วันที่ (ไม่มีแบรนด์ = วันที่อย่างเดียว)", () => {
    expect(albumFullName(day, "Good Goods")).toBe("Good Goods · 15 พ.ย. 2569");
    expect(albumFullName(day, null)).toBe("15 พ.ย. 2569");
    expect(albumFullName(named, "Good Goods")).toBe("กระเป๋าใส ลายหมี");
  });
  it("แท็บแบรนด์: ทุกแบรนด์ / ไม่ระบุแบรนด์ / แบรนด์นั้น", () => {
    expect(inBrandTab({ brand_id: "b1" }, SAMPLE_TAB_ALL)).toBe(true);
    expect(inBrandTab({ brand_id: null }, SAMPLE_TAB_NONE)).toBe(true);
    expect(inBrandTab({ brand_id: "b1" }, SAMPLE_TAB_NONE)).toBe(false);
    expect(inBrandTab({ brand_id: "b1" }, "b1")).toBe(true);
    expect(inBrandTab({ brand_id: "b2" }, "b1")).toBe(false);
  });
  it("ตัวเลขบนแถบแบรนด์ = รวมรูปทุกอัลบั้มของแบรนด์ · ไม่ระบุแบรนด์ = none", () => {
    const c = (photos: number) => ({ photos, trash: 0, sent: 0 });
    const m = brandPhotoTotals([{ brand_id: "b1", counts: c(3) }, { brand_id: "b1", counts: c(2) }, { brand_id: null, counts: c(4) }]);
    expect(m.get("b1")).toBe(5);
    expect(m.get(SAMPLE_TAB_NONE)).toBe(4);
    expect(m.get("b2")).toBeUndefined();
  });
});

describe("ค้นหา + เรียง (หน้า SAMPLE + แท็บในตัวเลือกไฟล์กลาง)", () => {
  const al = (name: string, created_at: string, photos: number, parent_id: string | null = null) => ({ name, created_at, parent_id, deep: { photos, sent: 0, sub_count: 0 } });
  const A = al("SAMPLE Good Goods 15 พ.ย. 2569", "2026-11-15T03:00:00Z", 8);
  const B = al("2026-11-15-002", "2026-11-15T09:00:00Z", 3);
  const C = al("SAMPLE Good Goods 13 พ.ย. 2569", "2026-11-13T03:00:00Z", 2);
  const D = al("กระเป๋าใส ลายหมี", "2026-11-14T03:00:00Z", 8, "p1");
  it("เรียงอัลบั้ม: ล่าสุด · เก่าสุด · ชื่อบนการ์ด · รูปมากสุด (เท่ากัน = ล่าสุดก่อน)", () => {
    expect(sortAlbums([A, B, C], "newest").map((x) => x.name)).toEqual([B.name, A.name, C.name]);
    expect(sortAlbums([A, B, C], "oldest").map((x) => x.name)).toEqual([C.name, A.name, B.name]);
    expect(sortAlbums([A, D, C], "most").map((x) => x.name)).toEqual([A.name, D.name, C.name]);
    expect(sortAlbums([D, B], "name").map((x) => x.name)).toEqual([B.name, D.name]);   // ตัวเลขก่อนไทย
  });
  it("เรียงรูป: ลำดับที่ลง (ค่าเดิม) · ใหม่สุดก่อน · ชื่อไฟล์แบบตัวเลข (9 ก่อน 10)", () => {
    const p = (file_name: string, created_at: string) => ({ file_name, created_at });
    const xs = [p("IMG_10.jpg", "2026-11-15T01:00:00Z"), p("IMG_9.jpg", "2026-11-15T02:00:00Z"), p("IMG_2.jpg", "2026-11-15T03:00:00Z")];
    expect(sortPhotos(xs, "oldest").map((x) => x.file_name)).toEqual(["IMG_10.jpg", "IMG_9.jpg", "IMG_2.jpg"]);
    expect(sortPhotos(xs, "newest").map((x) => x.file_name)).toEqual(["IMG_2.jpg", "IMG_9.jpg", "IMG_10.jpg"]);
    expect(sortPhotos(xs, "name").map((x) => x.file_name)).toEqual(["IMG_2.jpg", "IMG_9.jpg", "IMG_10.jpg"]);
  });
  it("ค้นอัลบั้ม: ชื่อจริง · วันที่บนการ์ด · ชื่อแบรนด์ · ข้ามตัวคั่นได้ · ทุกคำต้องเจอ", () => {
    expect(albumMatches(A, "")).toBe(true);
    expect(albumMatches(A, "  -  ")).toBe(true);
    expect(albumMatches(A, "15 พ.ย.")).toBe(true);
    expect(albumMatches(C, "15 พ.ย.")).toBe(false);
    expect(albumMatches(B, "11-15")).toBe(true);
    expect(albumMatches(B, "2026 002")).toBe(true);
    expect(albumMatches(D, "ลายหมี")).toBe(true);
    expect(albumMatches(D, "good", "Good Goods")).toBe(true);
    expect(albumMatches(D, "good")).toBe(false);
    expect(albumMatches(A, "good หมี")).toBe(false);
  });
  it("ค้นรูป: ชื่อไฟล์ · เลขใบงานที่ส่งเข้าไป", () => {
    const ph = { file_name: "3M2A9868.jpg", moved_to: [{ id: "s1", code: "DS-2026-0008", name: "กระเป๋าสาน", brand_id: null }] };
    expect(photoMatches(ph, "9868")).toBe(true);
    expect(photoMatches(ph, "DS-2026-0008")).toBe(true);
    expect(photoMatches(ph, "0008")).toBe(true);
    expect(photoMatches(ph, "สาน")).toBe(true);
    expect(photoMatches(ph, "9999")).toBe(false);
  });
  it("ตรวจค่าที่จำไว้", () => {
    expect(isAlbumSort("most")).toBe(true);
    expect(isAlbumSort("x")).toBe(false);
    expect(isPhotoSort("name")).toBe(true);
    expect(isPhotoSort("most")).toBe(false);
  });
});

describe("การ์ดหน้าแฟ้ม (ไม่ค้น = ชั้นบนสุด · ค้น = ทุกชั้นที่ตรง)", () => {
  const mk = (id: string, name: string, created_at: string, brand_id: string | null, parent_id: string | null = null, photos = 1) =>
    ({ id, name, created_at, brand_id, parent_id, suggested_brand_id: null, counts: { photos, trash: 0, sent: 0 }, deep: { photos, sent: 0, sub_count: 0 }, preview_keys: [] });
  const albums = [
    mk("a1", "SAMPLE Good Goods 15 พ.ย. 2569", "2026-11-15T03:00:00Z", "gg"),
    mk("s1", "กระเป๋าใส ลายหมี", "2026-11-15T05:00:00Z", "gg", "a1"),
    mk("a2", "SAMPLE Findig 14 พ.ย. 2569", "2026-11-14T03:00:00Z", "fd"),
  ];
  const bn = (id: string | null) => (id === "gg" ? "Good Goods" : id === "fd" ? "Findig" : null);
  it("ไม่ค้น: เฉพาะชั้นบนสุดของแท็บ เรียงล่าสุดก่อน", () => {
    expect(browseAlbums(albums, "all", "", "newest", bn).map((x) => x.album.id)).toEqual(["a1", "a2"]);
    expect(browseAlbums(albums, "fd", "", "newest", bn).map((x) => x.album.id)).toEqual(["a2"]);
  });
  it("ค้น: เจออัลบั้มย่อยด้วย + บอกว่าอยู่ในอัลบั้มไหน · ยังกรองตามแท็บแบรนด์", () => {
    expect(browseAlbums(albums, "all", "หมี", "newest", bn)).toEqual([{ album: albums[1], inside: "Good Goods · 15 พ.ย. 2569" }]);
    expect(browseAlbums(albums, "fd", "หมี", "newest", bn)).toEqual([]);
    expect(browseAlbums(albums, "all", "good", "oldest", bn).map((x) => x.album.id)).toEqual(["a1", "s1"]);
  });
});
