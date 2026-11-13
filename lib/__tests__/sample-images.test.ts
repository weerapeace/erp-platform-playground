import { describe, it, expect } from "vitest";
import { photosToMove, sampleAlbumName, sampleCounts, sampleStatusOf, splitSampleFiles, thaiShortDate } from "../sample-images";

describe("ชื่ออัลบั้มตามวันที่ลง (เวลาไทย)", () => {
  it("วันไทย ปี พ.ศ. · ใช้เวลาไทยไม่ใช่ UTC", () => {
    expect(thaiShortDate(new Date("2026-11-13T05:00:00Z"))).toBe("13 พ.ย. 2569");
    // 13 พ.ย. 18:30 UTC = 14 พ.ย. 01:30 เวลาไทย → อัลบั้มวันที่ 14
    expect(sampleAlbumName(new Date("2026-11-13T18:30:00Z"))).toBe("SAMPLE 14 พ.ย. 2569");
    // 13 พ.ย. 16:59 UTC = 23:59 เวลาไทย → ยังเป็นวันที่ 13
    expect(sampleAlbumName(new Date("2026-11-13T16:59:00Z"))).toBe("SAMPLE 13 พ.ย. 2569");
  });
});

describe("สถานะรูป", () => {
  const sheet = { id: "s1", code: "DS-0412", name: "Heart Bag" };
  it("ถังขยะ > ย้ายแล้ว > รอย้าย", () => {
    expect(sampleStatusOf("trashed", [sheet])).toBe("trash");
    expect(sampleStatusOf("active", [sheet])).toBe("moved");
    expect(sampleStatusOf("active", [])).toBe("wait");
    expect(sampleStatusOf(null, [])).toBe("wait");
  });
  it("นับตามสถานะ", () => {
    expect(sampleCounts([{ status: "wait" }, { status: "wait" }, { status: "moved" }, { status: "trash" }])).toEqual({ wait: 2, moved: 1, trash: 1 });
    expect(sampleCounts([])).toEqual({ wait: 0, moved: 0, trash: 0 });
  });
  it("ย้ายเข้าใบงาน: ข้ามรูปที่อยู่ในใบนั้นแล้ว · ใบอื่นยังย้ายได้ (1 รูปอยู่ได้หลายใบงาน)", () => {
    const photos = [
      { id: "a", moved_to: [] },
      { id: "b", moved_to: [sheet] },
      { id: "c", moved_to: [{ id: "s2", code: "DS-0408", name: "x" }] },
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
