import { describe, expect, it } from "vitest";
import { FLOW_SHAPES, flowShapeOf, flowShapeSvg, isShapeKey, pushRecentShape } from "@/lib/flowchart-shapes";
import { makeFlowNode, parseFlowScene, reshapeNode, isFontName } from "@/lib/flowchart";

const t = (th: string) => th;

describe("รูปทรง flowchart", () => {
  it("ทะเบียน: key ไม่ซ้ำ · มีชื่อ/ความหมายครบ · path อยู่ใน 100x60", () => {
    expect(new Set(FLOW_SHAPES.map((s) => s.key)).size).toBe(FLOW_SHAPES.length);
    for (const s of FLOW_SHAPES) {
      expect(s.th && s.en && s.meanTh && s.meanEn).toBeTruthy();
      for (const d of [...s.fill, ...(s.line ?? [])]) for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) expect(n).toBeLessThanOrEqual(100);
    }
    expect(flowShapeOf("ไม่มี").key).toBe("io");
    expect(flowShapeSvg("doc", 170, 80, "#fff", "#000")).toContain('viewBox="0 0 100 60"');
  });

  it("กล่องใหม่ใช้ขนาด/ชื่อของรูปทรง · โหลดกลับ shape ผิด = ค่าตั้งต้น", () => {
    const n = makeFlowNode("shape", { x: 0, y: 0 }, t, { shape: "conn" });
    expect([n.width, n.height, n.data.shape, n.data.label]).toEqual([72, 72, "conn", "จุดเชื่อม"]);
    const s = parseFlowScene({ kind: "flowchart", nodes: [{ ...n, data: { label: "x", shape: "แปลก" } }, { ...n, id: "b", type: "step", data: { label: "y", shape: "doc" } }], edges: [] })!;
    expect(s.nodes[0].data.shape).toBe("io");
    expect(s.nodes[1].data.shape).toBeUndefined();
  });

  it("เปลี่ยนรูปทรง: ข้อความ/สีเดิม · ไปกลับกล่องพื้นฐานได้ · กล่องชนิดอื่นเปลี่ยนไม่ได้", () => {
    const r = reshapeNode("step", { label: "ใบสั่งซื้อ", color: "blue" }, "doc")!;
    expect(r).toEqual({ type: "shape", data: { label: "ใบสั่งซื้อ", color: "blue", shape: "doc" } });
    expect(reshapeNode("shape", r.data, "question")).toEqual({ type: "question", data: { label: "ใบสั่งซื้อ", color: "blue" } });
    expect(reshapeNode("todo", { label: "x" }, "doc")).toBeNull();
    expect(reshapeNode("step", { label: "x" }, "ไม่มี")).toBeNull();
  });

  it("ใช้ล่าสุด: ล่าสุดขึ้นหน้า ไม่ซ้ำ ≤ 4 · ฟอนต์ต้องเป็นชื่อปลอดภัย", () => {
    expect(pushRecentShape(["doc", "io", "x"], "io")).toEqual(["io", "doc"]);
    expect(pushRecentShape(["a", "doc", "io", "sub", "prep", "delay"], "merge")).toEqual(["merge", "doc", "io", "sub"]);
    expect(isShapeKey("delay")).toBe(true);
    expect(isFontName("Noto Sans Thai")).toBe(true);
    expect(isFontName("x;}body{")).toBe(false);
  });
});
