import { describe, expect, it } from "vitest";
import { SwatchIndex, looksLikeSize, normalizeSwatchInput, rowToSwatchEntry, splitOptionSizes, type SwatchEntry } from "./color-swatch";
import { listingIssues } from "./website-listing-health";

const e = (th: string, en: string, kind: SwatchEntry["kind"], colors: string[] = [], imageKey: string | null = null): SwatchEntry => ({ th, en, kind, colors, imageKey });
const ENTRIES = [
  e("ดำ", "Black", "solid", ["#1A1A1A"]),
  e("แดง", "Red", "solid", ["#C62828"]),
  e("แทน", "Tan", "solid", ["#C19A6B"]),
  e("รุ้ง", "Rainbow", "image", [], "sw/rainbow.png"),
  e("M (20.5 cm.)", "M (20.5 cm.)", "none"),
  e("10 รู", "10 holes", "none"),
];
const idx = new SwatchIndex(ENTRIES);

describe("ชนิด ไซส์ (ไม่มีสี)", () => {
  it("บันทึกได้โดยไม่ต้องมีสี + อ่านกลับจากตาราง", () => {
    expect(normalizeSwatchInput({ kind: "none", colors: ["#123456"] })).toEqual({ ok: true, kind: "none", colors: [], imageKey: null });
    expect(rowToSwatchEntry({ th: "M", en: "M", swatch_kind: "none", swatch_colors: null, swatch_image_key: null }).kind).toBe("none");
  });

  it("ชื่อผสมที่มีไซส์ = จุดสีจากส่วนที่เป็นสีเท่านั้น", () => {
    expect(idx.resolve("ดำ (01),M (20.5 cm.)")).toEqual({ colors: ["#1A1A1A"], imageKey: null });
    expect(idx.resolve("แดง-ดำ (04),M (20.5 cm.)")).toEqual({ colors: ["#C62828", "#1A1A1A"], imageKey: null });
    // เหลือสีเดียวเป็นรูปลาย = ใช้รูปได้
    expect(idx.resolve("รุ้ง,M (20.5 cm.)")).toEqual({ colors: [], imageKey: "sw/rainbow.png" });
    expect(idx.missingParts("ดำ (01),M (20.5 cm.)")).toEqual([]);
    expect(idx.missingParts("กะปิ (07),M (20.5 cm.)")).toEqual(["กะปิ (07)"]);
  });

  it("ไซส์ล้วน = ไม่มีจุดสี แต่ไม่นับว่าขาด", () => {
    expect(idx.resolve("10 รู")).toBeNull();
    expect(idx.isSizeOnly("10 รู")).toBe(true);
    expect(idx.isSizeOnly("ดำ (01),M (20.5 cm.)")).toBe(false);
  });

  it("ตัดไซส์ออกจากชื่อ คงตัวคั่นเดิม", () => {
    expect(idx.stripSizes("ดำ (01),M (20.5 cm.)")).toEqual({ label: "ดำ (01)", sizes: ["M (20.5 cm.)"] });
    expect(idx.stripSizes("แดง-ดำ (04),M (20.5 cm.)").label).toBe("แดง-ดำ (04)");
    expect(idx.stripSizes("M (20.5 cm.), แดง - ดำ").label).toBe("แดง - ดำ");
    expect(idx.stripSizes("Black,M (20.5 cm.)").label).toBe("Black");
    expect(idx.stripSizes("10 รู")).toEqual({ label: "10 รู", sizes: [] });
    expect(idx.stripSizes("แดง-ดำ")).toEqual({ label: "แดง-ดำ", sizes: [] });
  });
});

describe("splitOptionSizes (หน้าเว็บโชว์แค่สี + บรรทัดไซส์)", () => {
  it("ทั้งรุ่นไซส์เดียว → ตัดออก + ส่งไซส์", () => {
    expect(splitOptionSizes(["ดำ (01),M (20.5 cm.)", "แทน (02),M (20.5 cm.)", "แดง"], idx)).toEqual({ labels: ["ดำ (01)", "แทน (02)", "แดง"], size: "M (20.5 cm.)" });
  });
  it("ไม่มีไซส์ / ไซส์ล้วน (10 รู) = ไม่แตะ", () => {
    expect(splitOptionSizes(["ดำ", "แดง"], idx)).toBeNull();
    expect(splitOptionSizes(["2 รู", "10 รู"], idx)).toBeNull();
  });
  it("หลายไซส์ / ตัดแล้วชื่อซ้ำ / ไซส์ขึ้นต้นด้วยตัวเลข = ไม่แตะ", () => {
    const more = new SwatchIndex([...ENTRIES, e("L (22 cm.)", "L (22 cm.)", "none"), e("20 mm.", "20 mm.", "none")]);
    expect(splitOptionSizes(["ดำ,M (20.5 cm.)", "แดง,L (22 cm.)"], more)).toBeNull();
    expect(splitOptionSizes(["ดำ,M (20.5 cm.)", "ดำ"], more)).toBeNull();
    expect(splitOptionSizes(["ดำ,20 mm.", "แดง,20 mm."], more)).toBeNull();
  });
});

describe("looksLikeSize (แนะนำเท่านั้น)", () => {
  it.each(["M (20.5 cm.)", "M (20.5 cm)", "XL", "Free size", "4 mm.", "15.5x11.5 cm", "10 รู", "A4 21*30 cm", "2.5 cm."])("%s = ไซส์", (n) => expect(looksLikeSize(n)).toBe(true));
  it.each(["ดำ", "Noir", "Baby Heart", "My Favorite", "ทอง 25x10 มม.", "Mint"])("%s = ไม่ใช่", (n) => expect(looksLikeSize(n)).toBe(false));
});

describe("ป้ายเตือนหน้ารายการ", () => {
  it("ไซส์ล้วน (noColor) ไม่เตือนว่าสียังไม่ผูกทะเบียนสี", () => {
    const issues = listingIssues({ price: 100, imageCount: 1, categories: ["x"], colors: [
      { label: "10 รู", swatch: null, hasImage: true, noColor: true },
      { label: "Noir", swatch: null, hasImage: true },
    ] });
    expect(issues.find((i) => i.key === "swatch_missing")?.names).toEqual(["Noir"]);
  });
});

describe("2026-11-11: เลขท้ายไม่มีวงเล็บ + วัสดุไม่ถูกตัดออกจากชื่อบนเว็บ", () => {
  const idx2 = new SwatchIndex([...ENTRIES, e("ครีม", "Cream", "solid", ["#EFE6D2"]), e("ซาเฟียโน่", "Saffiano", "none")]);
  it("ครีม 02 → หาเจอเป็น ครีม · 10 รู ไม่โดนตัด", () => {
    expect(idx2.find("ครีม 02")?.th).toBe("ครีม");
    expect(idx2.find("10 รู")?.th).toBe("10 รู");
  });
  it("ดำ/ซาเฟียโน่ = จุดสีดำ แต่ชื่อบนเว็บคงวัสดุไว้", () => {
    expect(idx2.resolve("ดำ/ซาเฟียโน่")).toEqual({ colors: ["#1A1A1A"], imageKey: null });
    expect(splitOptionSizes(["ดำ/ซาเฟียโน่", "แดง/ซาเฟียโน่"], idx2)).toBeNull();
  });
});
