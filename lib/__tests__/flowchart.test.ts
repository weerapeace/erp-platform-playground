import { describe, it, expect } from "vitest";
import {
  parseFlowScene, toFlowScene, autoEdgeLabel, mergeFlowScenes, cloneFlowSceneAt, handlePoint, flowSceneBounds,
  splitFlowLabel, makeFlowNode, nodeColor, snap, type FlowScene, type FlowSceneNode, type FlowSceneEdge,
} from "../flowchart";

const th = (a: string) => a;
const N = (id: string, x = 0, label = id): FlowSceneNode => ({ id, type: "step", position: { x, y: 0 }, width: 160, height: 60, data: { label } });
const E = (id: string, s: string, t: string, label = ""): FlowSceneEdge => ({ id, source: s, target: t, sourceHandle: "r", targetHandle: "l", label });
const S = (nodes: FlowSceneNode[], edges: FlowSceneEdge[] = []): FlowScene => ({ kind: "flowchart", v: 1, nodes, edges });
const ids = (s: FlowScene) => s.nodes.map((n) => n.id).sort();

describe("parseFlowScene", () => {
  it("ไม่ใช่ flowchart (เช่นกระดาน Excalidraw) = null", () => {
    expect(parseFlowScene({ elements: [], files: {} })).toBeNull();
    expect(parseFlowScene(null)).toBeNull();
    expect(parseFlowScene("x")).toBeNull();
  });
  it("ตัดกล่องชนิดแปลก/id ซ้ำ + เส้นที่ปลายหาย · เติมขนาดตั้งต้น", () => {
    const s = parseFlowScene({
      kind: "flowchart",
      nodes: [
        { id: "a", type: "step", position: { x: 1, y: 2 }, data: { label: "A", color: "violet" } },
        { id: "a", type: "step", position: { x: 9, y: 9 }, data: { label: "dup" } },
        { id: "b", type: "hacker", position: { x: 0, y: 0 }, data: {} },
        { id: "c", type: "question", position: {}, data: { label: "C", color: "neon" } },
      ],
      edges: [
        { id: "e1", source: "a", target: "c", sourceHandle: "r", targetHandle: "zz", label: "ใช่" },
        { id: "e2", source: "a", target: "b" },
      ],
    })!;
    expect(s.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(s.nodes[0].width).toBe(170);            // ขนาดตั้งต้นของ step
    expect(s.nodes[1].data.color).toBeUndefined(); // สีที่ไม่รู้จัก ตัดทิ้ง
    expect(s.edges).toHaveLength(1);
    expect(s.edges[0].targetHandle).toBeNull();     // handle แปลก → null
  });
});

describe("toFlowScene", () => {
  it("ตัดค่าระหว่างใช้งาน (selected/measured) + ปัดตำแหน่ง", () => {
    const s = toFlowScene(
      [{ id: "a", type: "step", position: { x: 10.4, y: 20.6 }, measured: { width: 150, height: 50 }, data: { label: "A" }, selected: true } as never],
      [{ id: "e", source: "a", target: "a", label: "x", selected: true } as never],
    );
    expect(s.nodes[0]).toEqual({ id: "a", type: "step", position: { x: 10, y: 21 }, width: 150, height: 50, data: { label: "A" } });
    expect(JSON.stringify(s)).not.toContain("selected");
  });
});

describe("autoEdgeLabel", () => {
  it("กล่องคำถาม: ใช่ → ไม่ใช่ → ว่าง · กล่องอื่น = ว่าง", () => {
    expect(autoEdgeLabel("question", [], th)).toBe("ใช่");
    expect(autoEdgeLabel("question", ["ใช่"], th)).toBe("ไม่ใช่");
    expect(autoEdgeLabel("question", ["ไม่ใช่"], th)).toBe("ใช่");
    expect(autoEdgeLabel("question", ["ใช่", "ไม่ใช่"], th)).toBe("");
    expect(autoEdgeLabel("step", [], th)).toBe("");
  });
});

describe("mergeFlowScenes (มีคนบันทึกแทรก)", () => {
  const base = S([N("a"), N("b")], [E("e1", "a", "b")]);
  it("เขาเพิ่ม + เราเพิ่ม → ได้ทั้งคู่", () => {
    const m = mergeFlowScenes(base, S([...base.nodes, N("mine")], base.edges), S([...base.nodes, N("theirs")], base.edges));
    expect(ids(m)).toEqual(["a", "b", "mine", "theirs"]);
  });
  it("เราไม่ได้แตะ แต่เขาแก้ → เอาของเขา · เราแก้ → เอาของเรา", () => {
    const theirs = S([N("a", 0, "A-theirs"), N("b", 0, "B-theirs")], base.edges);
    const mine = S([N("a"), N("b", 0, "B-mine")], base.edges);
    const m = mergeFlowScenes(base, mine, theirs);
    expect(m.nodes.find((n) => n.id === "a")!.data.label).toBe("A-theirs");
    expect(m.nodes.find((n) => n.id === "b")!.data.label).toBe("B-mine");
  });
  it("เขาลบ (เราไม่ได้แก้) → ลบตาม และเส้นที่ต่อหายด้วย", () => {
    const m = mergeFlowScenes(base, base, S([N("a")]));
    expect(ids(m)).toEqual(["a"]);
    expect(m.edges).toHaveLength(0);
  });
  it("เราลบ → ไม่กลับมา แม้เขายังมีอยู่", () => {
    const m = mergeFlowScenes(base, S([N("a")]), base);
    expect(ids(m)).toEqual(["a"]);
  });
  it("เขาลบ แต่เราเพิ่งแก้กล่องนั้น → เก็บของเรา", () => {
    const m = mergeFlowScenes(base, S([N("a"), N("b", 40)], base.edges), S([N("a")]));
    expect(ids(m)).toEqual(["a", "b"]);
  });
});

describe("cloneFlowSceneAt (วางแม่แบบเพิ่ม)", () => {
  it("id ใหม่ทั้งหมด · เส้นชี้ id ใหม่ · วางทางขวาของของเดิม", () => {
    const tpl = S([N("a", 0), N("b", 200)], [E("e", "a", "b")]);
    const existing = S([N("x", 500)]);
    const c = cloneFlowSceneAt(tpl, existing);
    expect(c.nodes.map((n) => n.id)).not.toContain("a");
    expect(c.edges[0].source).toBe(c.nodes[0].id);
    expect(c.edges[0].target).toBe(c.nodes[1].id);
    expect(Math.min(...c.nodes.map((n) => n.position.x))).toBeGreaterThanOrEqual(500 + 160);
  });
  it("กระดานว่าง → ไม่เลื่อน", () => {
    const c = cloneFlowSceneAt(S([N("a", 40)]), S([]));
    expect(c.nodes[0].position.x).toBe(40);
  });
});

describe("เรขาคณิต / ตัวช่วย", () => {
  it("handlePoint 4 ด้าน", () => {
    const n = { position: { x: 100, y: 50 }, width: 200, height: 80 };
    expect(handlePoint(n, "t")).toEqual({ x: 200, y: 50, side: "t" });
    expect(handlePoint(n, "r")).toEqual({ x: 300, y: 90, side: "r" });
    expect(handlePoint(n, "b")).toEqual({ x: 200, y: 130, side: "b" });
    expect(handlePoint(n, "l")).toEqual({ x: 100, y: 90, side: "l" });
    expect(handlePoint(n, null).side).toBe("r");
  });
  it("flowSceneBounds ครอบทุกกล่อง + ขอบ", () => {
    expect(flowSceneBounds(S([N("a", 0), N("b", 300)]), 40)).toEqual({ x: -40, y: -40, w: 460 + 80, h: 60 + 80 });
  });
  it("splitFlowLabel: บรรทัดแรก = หัว", () => {
    expect(splitFlowLabel("R2\nรูปสินค้า\nรูปเว็บ")).toEqual({ title: "R2", sub: "รูปสินค้า\nรูปเว็บ" });
    expect(splitFlowLabel("")).toEqual({ title: "", sub: "" });
  });
  it("makeFlowNode ชิดตาราง + สีตั้งต้นตามชนิด", () => {
    const n = makeFlowNode("question", { x: 103, y: 57 }, th);
    expect(n.position.x % 20).toBe(0);
    expect(n.position.y % 20).toBe(0);
    expect(nodeColor(n.type, n.data)).toBe("amber");
    expect(snap(29)).toBe(20);
  });
});
