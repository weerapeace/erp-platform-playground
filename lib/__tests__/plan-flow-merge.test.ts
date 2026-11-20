import { describe, expect, it } from "vitest";
import type { FlowScene } from "@/lib/flowchart";
import { allBoxId, mergeOldScenes, sectionX, splitAllId, PLAN_SECTION_W } from "@/lib/plan-flow-merge";

const node = (id: string, x: number, y: number, w = 100, h = 40) => ({ id, type: "step" as const, position: { x, y }, width: w, height: h, data: { label: id, color: "slate" as const } });
const scene = (nodes: FlowScene["nodes"], edges: FlowScene["edges"] = [], pins?: FlowScene["pins"]): FlowScene => ({ kind: "flowchart", v: 1, nodes, edges, ...(pins ? { pins } : {}) });
const edge = (id: string, source: string, target: string) => ({ id, source, target, sourceHandle: null, targetHandle: null, label: "" });

describe("ผังทั้งระบบ: id กล่อง", () => {
  it("ส่วน:กล่อง ไป-กลับ", () => {
    expect(allBoxId("make", "mo")).toBe("make:mo");
    expect(splitAllId("make:mo")).toEqual({ key: "make", id: "mo" });
    expect(splitAllId("mo")).toBeNull();
  });
});

describe("ย้ายของที่วาดในแท็บเดิม", () => {
  it("ว่างทุกแท็บ = ไม่มีอะไร", () => {
    const m = mergeOldScenes({});
    expect(m.nodes).toEqual([]);
    expect(m.pins).toBeUndefined();
  });
  it("เลื่อนตามส่วน · เส้นเข้ากล่องระบบเปลี่ยนเป็นของส่วนนั้น · ตำแหน่งที่ย้ายไว้ย้ายตาม", () => {
    const m = mergeOldScenes({ make: scene([node("a", 100, -200)], [edge("e1", "a", "sys:mo")], { "sys:ds": { x: 10, y: 20 } }) });
    expect(m.nodes[0].position).toEqual({ x: sectionX(1) + 100, y: -200 });
    expect(m.edges[0]).toMatchObject({ source: "a", target: "sys:make:mo" });
    expect(m.pins).toEqual({ "sys:make:ds": { x: sectionX(1) + 10, y: 20 } });
  });
  it("กล่องที่ล้นนอกส่วน → ยกไปไว้เหนือส่วน ไม่ทับส่วนข้าง ๆ", () => {
    const m = mergeOldScenes({ make: scene([node("in", 200, -100), node("out", -900, 50), node("out2", -700, 0)]) });
    const out = m.nodes.find((n) => n.id === "out")!, out2 = m.nodes.find((n) => n.id === "out2")!, inn = m.nodes.find((n) => n.id === "in")!;
    expect(inn.position).toEqual({ x: sectionX(1) + 200, y: -100 });
    expect(out.position.x).toBe(sectionX(1));                    // ชิดซ้ายของส่วน
    expect(out2.position.x - out.position.x).toBe(200);           // ระยะในกลุ่มเท่าเดิม
    expect(out.position.y + out.height).toBeLessThanOrEqual(-140); // เหนือกล่องในส่วน 40px
    for (const n of [out, out2]) expect(n.position.x + n.width).toBeLessThanOrEqual(sectionX(1) + PLAN_SECTION_W);
  });
  it("id ชนกันข้ามแท็บ = เปลี่ยนชื่อ ไม่หาย", () => {
    const m = mergeOldScenes({ buy: scene([node("x", 0, 0)]), sell: scene([node("x", 0, 0), node("y", 200, 0)], [edge("e", "x", "y")]) });
    expect(m.nodes.map((n) => n.id)).toEqual(["x", "x_sell", "y"]);
    expect(m.edges[0]).toMatchObject({ source: "x_sell", target: "y" });
  });
});
