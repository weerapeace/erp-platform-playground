import { describe, expect, it } from "vitest";
import { applyLinks, cleanPieceLink, linkTargets, linkedShape, shapesClose } from "@/lib/pattern-link";
import { cleanProjectPieces } from "@/lib/pattern-project";
import { moveShape, shapeBox, type Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
// รูปไม่สมมาตร: สี่เหลี่ยมคางหมูเอียงขวา
const trap: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 14, y: 8 }, { x: 0, y: 8 }] };

describe("ชิ้นคู่ผูกกัน", () => {
  it("cleanPieceLink รับเฉพาะรหัสชิ้นที่ถูกรูปแบบ", () => {
    expect(cleanPieceLink({ to: "pc1", mirror: "x" })).toEqual({ to: "pc1", mirror: "x" });
    expect(cleanPieceLink({ to: "pc1", mirror: "y" })).toEqual({ to: "pc1" });
    expect(cleanPieceLink({ to: "ไม่ ถูก" })).toBeNull();
    expect(cleanPieceLink(null)).toBeNull();
  });
  it("linkedShape: รูปของต้นแบบย้ายมาที่ตำแหน่งของชิ้นตาม · กลับซ้ายขวาได้", () => {
    expect(linkedShape(R(5, 5, 30, 20), { to: "m" }, { x: 50, y: 40 })).toEqual(R(50, 40, 30, 20));
    const m = linkedShape(trap, { to: "m", mirror: "x" }, { x: 20, y: 0 });
    expect(shapeBox(m)).toMatchObject({ x: 20, y: 0, w: 14, h: 8 });
    expect(m.k === "path" && m.nodes.map((n) => [n.x, n.y]).sort((a, b) => a[1] - b[1] || a[0] - b[0])).toEqual([[24, 0], [34, 0], [20, 8], [34, 8]]);   // ด้านเอียงย้ายมาอยู่ซ้าย
  });
  it("applyLinks: ไม่มีอะไรต้องเปลี่ยน = คืนรายการเดิมตัวเดิม (ไม่วนอัปเดต)", () => {
    const a = [{ pid: "m", shape: R(0, 0, 30, 20) }, { pid: "f", shape: R(0, 40, 30, 20), link: { to: "m" } }];
    expect(applyLinks(a)).toBe(a);
    const none = [{ pid: "m", shape: R(0, 0, 30, 20) }];
    expect(applyLinks(none)).toBe(none);
  });
  it("แก้ต้นแบบ → ชิ้นตามเปลี่ยนรูปตาม โดยมุมซ้ายบนอยู่ที่เดิม · ของอื่นของชิ้นตามไม่ถูกแตะ", () => {
    const a = [{ pid: "m", shape: R(0, 0, 36, 24), name: "ตัวหน้า" }, { pid: "f", shape: R(3, 40, 30, 20), link: { to: "m" }, name: "ซับใน", inner: ["ช่องใส่ของ"] }];
    const out = applyLinks(a);
    expect(out[0]).toBe(a[0]);
    expect(out[1]).toMatchObject({ shape: R(3, 40, 36, 24), name: "ซับใน", inner: ["ช่องใส่ของ"], link: { to: "m" } });
    expect(applyLinks(out)).toBe(out);                                          // รอบสองไม่เปลี่ยนอะไรแล้ว
    // ย้ายต้นแบบเฉย ๆ ชิ้นตามไม่ขยับ
    const moved = [{ ...out[0], shape: moveShape(out[0].shape, 100, 7) }, out[1]];
    expect(applyLinks(moved)).toBe(moved);
  });
  it("ต้นแบบหาย / ผูกกับตัวเอง / ผูกเป็นทอด = เลิกผูกชิ้นนั้น รูปคงเดิม", () => {
    const out = applyLinks([
      { pid: "a", shape: R(0, 0, 10, 10), link: { to: "gone" } },
      { pid: "b", shape: R(0, 0, 11, 11), link: { to: "b" } },
      { pid: "m", shape: R(0, 0, 30, 20) },
      { pid: "f", shape: R(0, 40, 30, 20), link: { to: "m" } },
      { pid: "g", shape: R(0, 80, 12, 12), link: { to: "f" } },
    ]);
    expect(out.map((p) => [p.pid, "link" in p ? p.link?.to : null])).toEqual([["a", null], ["b", null], ["m", null], ["f", "m"], ["g", null]]);
    expect(out[4].shape).toEqual(R(0, 80, 12, 12));
  });
  it("linkTargets: ไม่ให้ผูกกับตัวเอง / ชิ้นตาม · ชิ้นที่เป็นต้นแบบอยู่แล้ว เป็นชิ้นตามไม่ได้", () => {
    const ps = [{ pid: "m", shape: R(0, 0, 1, 1) }, { pid: "f", shape: R(0, 0, 1, 1), link: { to: "m" } }, { pid: "x", shape: R(0, 0, 1, 1) }];
    expect(linkTargets(ps, "x").map((p) => p.pid)).toEqual(["m"]);
    expect(linkTargets(ps, "m")).toEqual([]);
  });
  it("shapesClose ทนเศษทศนิยม แต่จับความต่างจริงได้", () => {
    expect(shapesClose(R(0, 0, 10, 10), R(1e-9, 0, 10, 10))).toBe(true);
    expect(shapesClose(R(0, 0, 10, 10), R(0, 0, 10.01, 10))).toBe(false);
    expect(shapesClose(R(0, 0, 10, 10), trap)).toBe(false);
  });
  it("บันทึกแพทเทิร์น: เก็บการผูกที่ใช้ได้ · ผูกกับชิ้นที่ไม่มี / ผูกเป็นทอด = ทิ้งการผูก", () => {
    const out = cleanProjectPieces([
      { pid: "m", shape: R(0, 0, 30, 20) },
      { pid: "f", shape: R(0, 40, 30, 20), link: { to: "m", mirror: "x" } },
      { pid: "g", shape: R(0, 80, 30, 20), link: { to: "f" } },
      { pid: "h", shape: R(0, 120, 30, 20), link: { to: "nope" } },
    ]);
    expect(out.map((p) => p.link ?? null)).toEqual([null, { to: "m", mirror: "x" }, null, null]);
  });
});
