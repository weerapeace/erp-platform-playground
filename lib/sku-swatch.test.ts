import { describe, expect, it } from "vitest";
import { averageHex, boxBlur3, chipCode, cleanBoardCode, floodFitRect, normalizeAiChips, normalizeAiLabels, remapToCrop, rotateRect90, sortReadingOrder, splitRect } from "./sku-swatch";

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

describe("normalizeAiChips — บั๊กสเกล (2026-11-14)", () => {
  it("กรอบ % ที่ล้นขอบขวานิดหน่อย (x+w = 102) ต้องไม่ทำให้ทุกกรอบหด 10 เท่า", () => {
    const out = normalizeAiChips({ chips: [
      { x: 7, y: 17, w: 83, h: 48, name: "น้ำตาลทอง" },
      { x: 90, y: 70, w: 12, h: 10, label: "3005" },
    ] });
    expect(out.chips[0]).toMatchObject({ x: 7, y: 17, w: 83, h: 48 });
    expect(out.chips[1]).toMatchObject({ x: 90, y: 70, w: 10, h: 10 });
  });
});

describe("normalizeAiLabels", () => {
  it("รับเฉพาะเลขกรอบที่มีจริง · ซ้ำใช้ตัวแรก · เรียงตามเลข", () => {
    const out = normalizeAiLabels({ items: [
      { n: 2, label: "162", name: "ครีม" }, { n: 1, label: "", name: "น้ำตาลทอง" },
      { n: 2, label: "dup" }, { n: 9, label: "x" }, { n: "3", label: " 3005 ", name: "เทาฟ้า" },
    ] }, 3);
    expect(out).toEqual([
      { n: 1, label: null, name: "น้ำตาลทอง" },
      { n: 2, label: "162", name: "ครีม" },
      { n: 3, label: "3005", name: "เทาฟ้า" },
    ]);
    expect(normalizeAiLabels(null, 3)).toEqual([]);
  });
});

/** รูปจำลอง W×H สีพื้น bg แล้วระบายสี่เหลี่ยม */
function img(W: number, H: number, bg: number[], rects: { x: number; y: number; w: number; h: number; c: number[] }[]) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set([...bg, 255], i * 4);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) px.set([...r.c, 255], (y * W + x) * 4);
  return px;
}

describe("floodFitRect (คลิกที่สี = ตีกรอบให้)", () => {
  const W = 100, H = 100;
  it("คลิกกลางชิ้นแดง → กรอบพอดีชิ้น + สีแดง", () => {
    const px = img(W, H, [200, 200, 200], [{ x: 20, y: 30, w: 10, h: 20, c: [180, 20, 20] }, { x: 40, y: 30, w: 10, h: 20, c: [20, 20, 160] }]);
    const r = floodFitRect(px, W, H, 25, 40);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rect).toEqual({ x: 20, y: 30, w: 10, h: 20 }); expect(r.hex).toBe("#b41414"); }
  });
  it("เส้นรั่วบาง ๆ (สีเดียวกันลากออกไป) ไม่ทำให้กรอบยืด", () => {
    const px = img(W, H, [200, 200, 200], [{ x: 20, y: 30, w: 10, h: 20, c: [180, 20, 20] }, { x: 30, y: 40, w: 40, h: 1, c: [180, 20, 20] }]);
    const r = floodFitRect(px, W, H, 25, 40);
    expect(r.ok && r.rect).toEqual({ x: 20, y: 30, w: 10, h: 20 });
  });
  it("คลิกพื้นหลัง (กว้างเกิน) = too_big · นอกรูป = outside", () => {
    const px = img(W, H, [200, 200, 200], [{ x: 20, y: 30, w: 10, h: 20, c: [180, 20, 20] }]);
    expect(floodFitRect(px, W, H, 80, 80)).toEqual({ ok: false, reason: "too_big" });
    expect(floodFitRect(px, W, H, -1, 5)).toEqual({ ok: false, reason: "outside" });
  });
  it("ชิ้นที่มีลาย (สีแกว่งเล็กน้อย) ยังเกาะเป็นชิ้นเดียว หลังเบลอ", () => {
    const px = img(W, H, [230, 230, 230], [{ x: 10, y: 10, w: 30, h: 30, c: [120, 70, 30] }]);
    for (let y = 10; y < 40; y += 2) for (let x = 10; x < 40; x += 3) px.set([150, 95, 50, 255], (y * W + x) * 4);   // จุดลาย
    const r = floodFitRect(boxBlur3(px, W, H), W, H, 25, 25, { tol: 40 });
    expect(r.ok && r.rect.w).toBeGreaterThanOrEqual(28);
    expect(r.ok && r.rect.h).toBeGreaterThanOrEqual(28);
  });
  it("ขอบพื้นหลังรอบการ์ด (วงล้อม ไม่ถึง 30% ของรูป) = too_big ไม่ใช่ชิ้น", () => {
    // พื้นเทารอบนอก กว้าง 6px ทุกด้าน (~22% ของรูป) + การ์ดขาวข้างใน
    const px = img(W, H, [200, 200, 200], [{ x: 6, y: 6, w: 88, h: 88, c: [250, 250, 245] }, { x: 20, y: 20, w: 20, h: 20, c: [150, 80, 30] }]);
    expect(floodFitRect(px, W, H, 2, 50)).toEqual({ ok: false, reason: "too_big" });
  });
});
