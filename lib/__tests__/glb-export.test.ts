/** Bag CAD รอบ G1: ไฟล์ GLB · ตรึง/หยุดนิ่งตัวจำลอง · ความละเอียดตาข่าย · ความจุลิตร */
import { describe, expect, it } from "vitest";
import { buildGlb, readGlbJson } from "@/lib/glb-export";
import { buildSimMesh, createBagSim, simCell } from "@/lib/pattern-sim";
import { assemble, bagVolumeLiters, type AssemblyOk } from "@/lib/pattern-assembly";
import { bagGeometry, bagTemplateLiters } from "@/lib/bag-templates";
import type { Shape } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
/** กระเป๋าทรงกล่องง่าย ๆ: หน้า/หลัง 30×20 + ชิ้นข้าง 70×10 */
function boxBag(): AssemblyOk {
  const pieces = [{ pid: "f", name: "หน้า", count: 1, shape: R(30, 20), holes: [] }, { pid: "b", name: "หลัง", count: 1, shape: R(30, 20), holes: [] }, { pid: "g", name: "ข้าง", count: 1, shape: R(70, 10), holes: [] }];
  const seams: Seam[] = [
    { id: "a", a: { pid: "f", from: 1, count: 3, n: 4 }, b: { pid: "g", from: 2, count: 1, n: 4 } },
    { id: "c", a: { pid: "b", from: 1, count: 3, n: 4 }, b: { pid: "g", from: 0, count: 1, n: 4 } },
  ];
  const A = assemble(pieces, seams, []);
  if (!A.ok) throw new Error("assemble failed");
  return A;
}

describe("ไฟล์ GLB", () => {
  it("หัวไฟล์ glTF 2 · ความยาวตรง · JSON มีตาข่าย/วัสดุ/ขอบเขต · หน่วยแปลงเป็นเมตร", () => {
    const buf = buildGlb([{ name: "ตัวหน้า", positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0]), indices: new Uint32Array([0, 1, 2]), color: [1, 0, 0, 0.5], doubleSided: true }], { scale: 0.01 });
    const dv = new DataView(buf);
    expect(dv.getUint32(0, true)).toBe(0x46546c67); expect(dv.getUint32(4, true)).toBe(2); expect(dv.getUint32(8, true)).toBe(buf.byteLength);
    expect(buf.byteLength % 4).toBe(0);
    const j = readGlbJson(buf) as { meshes: { name: string }[]; materials: { alphaMode?: string; doubleSided?: boolean }[]; accessors: { max?: number[]; count: number }[]; buffers: { byteLength: number }[] };
    expect(j.meshes[0].name).toBe("ตัวหน้า");
    expect(j.materials[0]).toMatchObject({ alphaMode: "BLEND", doubleSided: true });
    expect(j.accessors[0].max).toEqual([1, 1, 0]);
    expect(j.accessors[1].count).toBe(3);
    expect(j.buffers[0].byteLength % 4).toBe(0);
  });
  it("ตาข่ายว่าง/เสีย = ข้าม · ไม่ใช่ GLB = อ่านไม่ได้", () => {
    const j = readGlbJson(buildGlb([{ name: "x", positions: new Float32Array([0, 0]), color: [1, 1, 1, 1] }])) as { meshes: unknown[] };
    expect(j.meshes).toHaveLength(0);
    expect(readGlbJson(new ArrayBuffer(8))).toBeNull();
  });
});

describe("ตัวจำลองทิ้งตัว: ความละเอียด · ตรึง · หยุดนิ่ง", () => {
  it("ละเอียดขึ้น = จุดมากขึ้น", () => {
    const A = boxBag(), c = simCell(A);
    expect(buildSimMesh(A, c * 0.65).n).toBeGreaterThan(buildSimMesh(A, c * 1.6).n);
  });
  it("ตรึงปากกระเป๋า: วัสดุนิ่มแล้วความสูงยังคงที่ · ไม่ตรึง = ทรุด", () => {
    const A = boxBag();
    const free = createBagSim(buildSimMesh(A), { stiffness: 0.1, fill: 0 }); for (let i = 0; i < 400 && free.advance(4); i++);
    const hung = createBagSim(buildSimMesh(A), { stiffness: 0.1, fill: 0, pin: { top: true } }); for (let i = 0; i < 400 && hung.advance(4); i++);
    expect(hung.pinned()).toBeGreaterThan(0);
    expect(hung.height()).toBeCloseTo(A.height, 1);
    expect(free.height()).toBeLessThan(A.height - 0.5);
  });
  it("หยุดนิ่ง = ไม่ขยับต่อ · ปลดแล้วเดินต่อ", () => {
    const s = createBagSim(buildSimMesh(boxBag()), { stiffness: 0.1, fill: 0 });
    s.advance(5); s.setFrozen(true);
    const h = s.height(); expect(s.advance(50)).toBe(false); expect(s.height()).toBe(h); expect(s.frozen()).toBe(true);
    s.setFrozen(false); expect(s.advance(5)).toBe(true);
  });
});

describe("ความจุ (ลิตร)", () => {
  it("ทรงกล่อง 30×20 ลึก 10 ≈ 6 ลิตร · แม่แบบ Tote คิดจากคางหมู × หนา", () => {
    expect(bagVolumeLiters(boxBag())).toBeCloseTo(6, 0);
    const G = bagGeometry({ W: 30, flare: 0, H: 20, D: 10, r: 0 });
    expect(bagTemplateLiters(G)).toBeCloseTo(6, 1);
  });
});
