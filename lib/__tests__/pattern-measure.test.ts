import { describe, expect, it } from "vitest";
import { cleanLineShape, cleanRefImage, openPathLength, outlineDistance, flattenShape, type PNode } from "@/lib/pattern-shape";

const close = (a: number, b: number, eps = 0.02) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("ไม้บรรทัด", () => {
  it("วัดตรง/โค้ง: เส้นเปิดหลายจุด = ผลรวมช่วง · ครึ่งวงกลม (หูจับ) ≈ πr", () => {
    expect(openPathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
    const k = 0.5522847498 * 5;
    const half: PNode[] = [{ x: -5, y: 0, ox: 0, oy: -k }, { x: 0, y: -5, ix: -k, iy: 0, ox: k, oy: 0 }, { x: 5, y: 0, ix: 0, iy: -k }];
    close(openPathLength(half), Math.PI * 5, 0.05);
  });
  it("วัดตามขอบชิ้น: สี่เหลี่ยม 10×20 จากกลางขอบบนไปกลางขอบล่าง = 25 ทั้งสองทาง · มุมติดกัน = ทางสั้น", () => {
    const P = flattenShape({ k: "rect", x: 0, y: 0, w: 10, h: 20 });
    const a = outlineDistance(P, [5, 0], [5, 20]);
    close(a.short, 30); close(a.long, 30); close(a.total, 60);
    const b = outlineDistance(P, [0, 0], [10, 0]);
    close(b.short, 10); close(b.long, 50);
    expect(b.path[0]).toEqual([0, 0]);
    expect(b.path[b.path.length - 1]).toEqual([10, 0]);
  });
});

describe("รูปอ้างอิง / ตำแหน่งบนกระดาน", () => {
  it("cleanRefImage รับเฉพาะรูปในระบบ/https · ตัดค่าเพี้ยน", () => {
    expect(cleanRefImage({ url: "/api/r2-image?key=a%2Fb.jpg", x: 1, y: 2, w: 30, ar: 1.2, op: 0.4, label: "รูปหน้า" }))
      .toEqual({ url: "/api/r2-image?key=a%2Fb.jpg", x: 1, y: 2, w: 30, ar: 1.2, op: 0.4, label: "รูปหน้า" });
    expect(cleanRefImage({ url: "javascript:alert(1)", x: 0, y: 0, w: 10, ar: 1 })).toBeNull();
    expect(cleanRefImage({ url: "data:image/png;base64,AAA", x: 0, y: 0, w: 10, ar: 1 })).toBeNull();
    expect(cleanRefImage({ url: "https://x.com/a.png", x: 0, y: 0, w: 0, ar: 1 })).toBeNull();
    expect(cleanRefImage({ url: "https://x.com/a.png", x: 0, y: 0, w: 10, ar: 1, op: 9 })!.op).toBe(0.5);
  });
  it("cleanLineShape เก็บตำแหน่งบนกระดาน + รูปอ้างอิง (ไม่เกิน 4)", () => {
    const ref = { url: "/api/r2-image?key=x", x: 0, y: 0, w: 20, ar: 1, op: 0.5 };
    const ls = cleanLineShape({ shape: { k: "rect", x: 0, y: 0, w: 5, h: 5 }, at: [12.3456, -4], refs: [ref, ref, ref, ref, ref, { url: "bad" }] })!;
    expect(ls.at).toEqual([12.346, -4]);
    expect(ls.refs).toHaveLength(4);
    expect(cleanLineShape({ shape: { k: "rect", x: 0, y: 0, w: 5, h: 5 }, at: ["a", 1] })!.at).toBeUndefined();
  });
});
