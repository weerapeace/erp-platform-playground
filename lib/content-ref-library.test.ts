import { describe, it, expect } from "vitest";
import { normalizeTags, refDedupeKey, libraryTags, filterLibrary, rankForPicker, MAX_LIBRARY_TAGS, type LibraryRef } from "./content-ref-library";

const item = (p: Partial<LibraryRef>): LibraryRef => ({
  id: p.id ?? "x", kind: p.kind ?? "text", r2_key: null, url: null, provider: null, title: null, thumb_url: null,
  body: "โน้ต", note: null, tags: [], brand_id: null, brand: null, used_count: 0, created_by: null,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...p,
});

describe("content-ref-library · แท็ก", () => {
  it("ตัด # ช่องว่าง และไม่ซ้ำ (ไม่สนตัวพิมพ์)", () => {
    expect(normalizeTags(" #สตรีท, Reel ,reel,, แสง  เย็น ")).toEqual(["สตรีท", "Reel", "แสง เย็น"]);
    expect(normalizeTags(["a", "#a", " b "])).toEqual(["a", "b"]);
  });
  it("จำกัดจำนวนและความยาว", () => {
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_LIBRARY_TAGS);
    expect(normalizeTags("ก".repeat(80))[0]).toHaveLength(30);
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe("content-ref-library · กันเก็บซ้ำ", () => {
  it("ลิงก์เดียวกันแม้ต่าง www / # / ท้าย /", () => {
    expect(refDedupeKey({ kind: "link", url: "https://www.tiktok.com/@a/video/1/#x" })).toBe(refDedupeKey({ kind: "link", url: "https://tiktok.com/@a/video/1" }));
    expect(refDedupeKey({ kind: "link", url: "https://youtube.com/watch?v=1" })).not.toBe(refDedupeKey({ kind: "link", url: "https://youtube.com/watch?v=2" }));
  });
  it("รูป = key เดียวกัน · ข้อความ = ไม่สนช่องว่าง/ตัวพิมพ์", () => {
    expect(refDedupeKey({ kind: "image", r2_key: "content-refs/a.jpg" })).toBe("image:content-refs/a.jpg");
    expect(refDedupeKey({ kind: "text", body: "  มุมต่ำ   แสงเย็น " })).toBe(refDedupeKey({ kind: "text", body: "มุมต่ำ แสงเย็น" }));
    expect(refDedupeKey({ kind: "text", body: "  " })).toBeNull();
    expect(refDedupeKey({ kind: "link", url: "ไม่ใช่ลิงก์" })).toBeNull();
  });
});

describe("content-ref-library · กรอง/เรียง", () => {
  const items = [
    item({ id: "a", tags: ["สตรีท"], brand_id: "B1", used_count: 1, created_at: "2026-11-03T00:00:00Z" }),
    item({ id: "b", tags: ["สตรีท", "Reel"], brand_id: null, used_count: 5 }),
    item({ id: "c", tags: ["พาสเทล"], brand_id: "B2", used_count: 9, title: "พื้นหลังชมพู" }),
    item({ id: "d", tags: [], brand_id: "B1", used_count: 1, created_at: "2026-11-04T00:00:00Z" }),
  ];
  it("แท็กเรียงตามที่ใช้บ่อย", () => {
    const tags = libraryTags(items);
    expect(tags[0]).toEqual({ tag: "สตรีท", count: 2 });
    expect(tags.map((x) => x.tag).sort()).toEqual(["Reel", "พาสเทล", "สตรีท"].sort());
  });
  it("เลือกแบรนด์ = แบรนด์นั้น + ชิ้นที่ใช้ได้ทุกแบรนด์ · ค้นในชื่อ/แท็ก", () => {
    expect(filterLibrary(items, { brandId: "B1" }).map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(filterLibrary(items, { tag: "reel" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterLibrary(items, { q: "ชมพู" }).map((x) => x.id)).toEqual(["c"]);
    expect(filterLibrary(items, { q: "พาสเทล" }).map((x) => x.id)).toEqual(["c"]);
  });
  it("ป๊อปหยิบ: แบรนด์เดียวกันก่อน → ทุกแบรนด์ → แบรนด์อื่น · ใช้บ่อย/ใหม่ก่อน", () => {
    expect(rankForPicker(items, "B1").map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
    expect(rankForPicker(items, null).map((x) => x.id)).toEqual(["b", "c", "d", "a"]);
  });
});
