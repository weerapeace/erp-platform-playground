import { describe, it, expect } from "vitest";
import { buildAlbumOptions, albumFullName, collapseList, ancestorIds } from "../album-options";

const ALBUMS = [
  { id: "d13", name: "SAMPLE GG 13", group: "SAMPLE · GG", parent_id: null },
  { id: "n1", name: "Goodgoods" },
  { id: "p12", name: "Product 012", group: "SAMPLE · GG", parent_id: "d13" },
  { id: "v1a", name: "Version 1", group: "SAMPLE · GG", parent_id: "p12" },
  { id: "p7", name: "Product 007", group: "SAMPLE · GG", parent_id: "d13" },
  { id: "v1b", name: "Version 1", group: "SAMPLE · GG", parent_id: "p7" },
  { id: "x", name: "Lost child", group: "SAMPLE · GG", parent_id: "missing" },
];

describe("buildAlbumOptions", () => {
  const opts = buildAlbumOptions(ALBUMS);
  it("อัลบั้มปกติก่อน แล้วต้นไม้ SAMPLE แม่ → ลูก", () => {
    expect(opts.map((o) => o.value)).toEqual(["n1", "d13", "p12", "v1a", "p7", "v1b", "x"]);
  });
  it("Version 1 ชื่อซ้ำ แต่เส้นทางแม่ต่างกัน", () => {
    const a = opts.find((o) => o.value === "v1a")!, b = opts.find((o) => o.value === "v1b")!;
    expect(a.sub).toBe("SAMPLE GG 13 › Product 012");
    expect(b.sub).toBe("SAMPLE GG 13 › Product 007");
    expect(albumFullName(a)).toBe("SAMPLE GG 13 › Product 012 › Version 1");
    expect(a.depth).toBe(2);
  });
  it("แม่หาย = ชั้นบนสุด · นับลูก", () => {
    expect(opts.find((o) => o.value === "x")!.depth).toBe(0);
    expect(opts.find((o) => o.value === "d13")!.children).toBe(2);
  });
  it("วนซ้ำกันเองไม่ค้าง", () => {
    const loop = buildAlbumOptions([{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }]);
    expect(loop.map((o) => o.value).sort()).toEqual(["a", "b"]);
  });
  it("ancestorIds", () => {
    expect(ancestorIds(opts, "v1a")).toEqual(["p12", "d13"]);
    expect(ancestorIds(opts, "n1")).toEqual([]);
  });
});

describe("collapseList", () => {
  it("เกิน 6 = โชว์ 6 + ซ่อนที่เหลือ", () => {
    expect(collapseList([1, 2, 3, 4, 5, 6, 7, 8], false)).toEqual({ shown: [1, 2, 3, 4, 5, 6], hidden: 2 });
  });
  it("ซ่อนแค่ 1 ตัว = โชว์หมด · กางอยู่ = โชว์หมด", () => {
    expect(collapseList([1, 2, 3, 4, 5, 6, 7], false).hidden).toBe(0);
    expect(collapseList([1, 2, 3, 4, 5, 6, 7, 8], true).hidden).toBe(0);
  });
});
