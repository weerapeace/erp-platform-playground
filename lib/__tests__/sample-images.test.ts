import { describe, it, expect } from "vitest";
import { inferAlbumBrand, parseSampleMark, photosToMove, sampleAlbumMark, sampleAlbumName, sampleCounts, splitSampleFiles, thaiShortDate } from "../sample-images";

describe("ชื่ออัลบั้มตามแบรนด์ + วันที่ลง (เวลาไทย)", () => {
  it("วันไทย ปี พ.ศ. · ใช้เวลาไทยไม่ใช่ UTC", () => {
    expect(thaiShortDate(new Date("2026-11-13T05:00:00Z"))).toBe("13 พ.ย. 2569");
    // 13 พ.ย. 18:30 UTC = 14 พ.ย. 01:30 เวลาไทย → อัลบั้มวันที่ 14
    expect(sampleAlbumName(new Date("2026-11-13T18:30:00Z"))).toBe("SAMPLE 14 พ.ย. 2569");
    expect(sampleAlbumName(new Date("2026-11-13T16:59:00Z"), "Good Goods")).toBe("SAMPLE Good Goods 13 พ.ย. 2569");
    expect(sampleAlbumName(new Date("2026-11-13T05:00:00Z"), "  ")).toBe("SAMPLE 13 พ.ย. 2569");
  });
  it("ป้ายอัลบั้ม: ไม่มีแบรนด์ / มีแบรนด์ · อ่านกลับได้ · อัลบั้มอื่น = null", () => {
    expect(sampleAlbumMark(null)).toBe("sample-images");
    expect(sampleAlbumMark("b1")).toBe("sample-images:b1");
    expect(parseSampleMark("sample-images")).toEqual({ brandId: null });
    expect(parseSampleMark("sample-images:b1")).toEqual({ brandId: "b1" });
    expect(parseSampleMark("sample-images:")).toEqual({ brandId: null });
    expect(parseSampleMark("อัลบั้มทั่วไป")).toBeNull();
    expect(parseSampleMark(null)).toBeNull();
  });
});

describe("รูปในอัลบั้ม (ไม่มีระบบรอย้ายแล้ว)", () => {
  const sheet = (id: string, brand: string | null) => ({ id, code: id, name: id, brand_id: brand });
  it("นับรูป / ถังขยะ", () => {
    expect(sampleCounts([{ trashed: false }, { trashed: false }, { trashed: true }])).toEqual({ photos: 2, trash: 1 });
    expect(sampleCounts([])).toEqual({ photos: 0, trash: 0 });
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
