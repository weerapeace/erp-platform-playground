import { describe, expect, it } from "vitest";
import { averageHex, chipCode, cleanBoardCode, normalizeAiChips, remapToCrop, rotateRect90, sortReadingOrder, splitRect } from "./sku-swatch";

describe("chipCode / cleanBoardCode", () => {
  it("เลขชิ้นอย่างน้อย 2 หลัก", () => {
    expect(chipCode("SW-0002", 1)).toBe("SW-0002-01");
    expect(chipCode("SW-0002", 12)).toBe("SW-0002-12");
    expect(chipCode("SW-0002", 120)).toBe("SW-0002-120");
  });
  it("รหัสแผ่นที่พิมพ์เอง: ตัวใหญ่ · ช่องว่างเป็นขีด · อักขระแปลก = ใช้ไม่ได้", () => {
    expect(cleanBoardCode(" xy canvas ")).toBe("XY-CANVAS");
    expect(cleanBoardCode("SW-0009")).toBe("SW-0009");
    expect(cleanBoardCode("ก")).toBeNull();
    expect(cleanBoardCode("A")).toBeNull();
    expect(cleanBoardCode("A/B")).toBeNull();
  });
});

describe("sortReadingOrder", () => {
  it("แถวบนก่อน แล้วซ้ายไปขวา แม้กรอบสูงต่ำเล็กน้อย", () => {
    const items = [
      { id: "b2", x: 30, y: 52, w: 8, h: 10 },
      { id: "a2", x: 30, y: 21, w: 8, h: 10 },
      { id: "a1", x: 10, y: 20, w: 8, h: 10 },
      { id: "b1", x: 10, y: 50, w: 8, h: 10 },
    ];
    expect(sortReadingOrder(items).map((i) => i.id)).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

describe("remapToCrop", () => {
  it("กรอบในกรอบครอป = เลื่อน/ขยายตาม · หลุดกรอบ = ตัดออก", () => {
    const { kept, dropped } = remapToCrop(
      [{ id: 1, x: 30, y: 30, w: 10, h: 10 }, { id: 2, x: 1, y: 1, w: 5, h: 5 }],
      { x: 20, y: 20, w: 50, h: 50 },
    );
    expect(dropped.map((d) => d.id)).toEqual([2]);
    expect(kept).toEqual([{ id: 1, x: 20, y: 20, w: 20, h: 20 }]);
  });
});

describe("rotateRect90", () => {
  it("หมุนตามเข็มแล้วทวนเข็ม = กลับที่เดิม", () => {
    const r = { x: 10, y: 20, w: 30, h: 5 };
    const cw = rotateRect90(r, "cw");
    expect(cw).toEqual({ x: 75, y: 10, w: 5, h: 30 });
    expect(rotateRect90(cw, "ccw")).toEqual(r);
  });
});

describe("splitRect", () => {
  it("แบ่ง 3×2 ได้ 6 ชิ้น เรียงแบบอ่านหนังสือ ไม่ล้นกรอบ", () => {
    const parts = splitRect({ x: 10, y: 10, w: 60, h: 20 }, 3, 2, 0);
    expect(parts).toHaveLength(6);
    expect(parts[0]).toEqual({ x: 10, y: 10, w: 20, h: 10 });
    expect(parts[2]).toEqual({ x: 50, y: 10, w: 20, h: 10 });
    expect(parts[3]).toEqual({ x: 10, y: 20, w: 20, h: 10 });
  });
});

describe("averageHex", () => {
  it("ตัดพิกเซลสุดโต่ง (เงา/แสงสะท้อน) แล้วเฉลี่ย", () => {
    const px = [
      ...Array(8).fill([200, 0, 0, 255]).flat(),
      0, 0, 0, 255,          // เงาดำ
      255, 255, 255, 255,    // แสงสะท้อน
    ];
    expect(averageHex(px, 0.1)).toBe("#c80000");
    expect(averageHex([0, 0, 0, 0])).toBeNull();
  });
});

describe("normalizeAiChips", () => {
  it("กรอบ % · ตัดกรอบเล็ก/ทั้งรูป/ซ้ำ · เรียงแบบอ่านหนังสือ", () => {
    const out = normalizeAiChips({
      header: " XIN YA CANVAS ",
      chips: [
        { x: 40, y: 10, w: 10, h: 10, label: "202", name: "แดง" },
        { x: 10, y: 10, w: 10, h: 10, label: "201", name: "ครีม", unsure: true },
        { x: 10.5, y: 10.5, w: 9, h: 9, label: "dup" },
        { x: 50, y: 50, w: 0.1, h: 0.1 },
        { x: 0, y: 0, w: 100, h: 100 },
        { x: "bad" },
      ],
    });
    expect(out.header).toBe("XIN YA CANVAS");
    expect(out.chips.map((c) => c.label)).toEqual(["201", "202"]);
    expect(out.chips[0].unsure).toBe(true);
  });
  it("รองรับ box สเกล 0–1000 และไม่ให้ล้นขอบ", () => {
    const out = normalizeAiChips({ chips: [{ box: [100, 200, 300, 400] }, { x: 950, y: 950, w: 200, h: 200 }] });
    expect(out.chips[0]).toMatchObject({ x: 10, y: 20, w: 20, h: 20 });
    expect(out.chips[1]).toMatchObject({ x: 95, y: 95, w: 5, h: 5 });
  });
  it("คำตอบเพี้ยน = ไม่มีชิ้น ไม่พัง", () => {
    expect(normalizeAiChips(null).chips).toEqual([]);
    expect(normalizeAiChips("x").chips).toEqual([]);
  });
});
