import { describe, expect, it } from "vitest";
import { FLOW_THEME_KEYS, themePalette } from "@/lib/flowchart-themes";
import { FLOW_COLORS, FLOW_PALETTE, mergeFlowScenes, parseFlowScene, toFlowScene, type FlowScene } from "@/lib/flowchart";

describe("ชุดสีของกระดาน", () => {
  it("ครบ 6 ชุด · ทุกชุดมีครบ 7 สี · ชื่อสีคงเดิม", () => {
    expect(FLOW_THEME_KEYS.length).toBe(6);
    for (const k of FLOW_THEME_KEYS) {
      const p = themePalette(k);
      for (const c of FLOW_COLORS) { expect(p[c].stroke).toMatch(/^#[0-9a-f]{6}$/); expect(p[c].th).toBe(FLOW_PALETTE[c].th); }
    }
    expect(themePalette("ไม่มี")).toBe(FLOW_PALETTE);
    expect(themePalette("night").slate.fill).toBe("#1e293b");
  });
  it("บันทึก/โหลด/รวมงาน: ชุดสี + เส้น/ความเข้มของกรอบโซน", () => {
    const zone = { id: "z", type: "zone", position: { x: 0, y: 0 }, width: 400, height: 300, data: { label: "โซน", line: "solid", opacity: 140 } };
    const s = toFlowScene([zone], [], undefined, undefined, "pastel");
    expect(s.theme).toBe("pastel");
    expect(s.nodes[0].data).toMatchObject({ line: "solid", opacity: 100 });
    expect(parseFlowScene({ kind: "flowchart", nodes: [], edges: [], theme: "std" })!.theme).toBeUndefined();
    expect(parseFlowScene({ kind: "flowchart", nodes: [{ ...zone, type: "step", data: { label: "x", line: "solid" } }], edges: [] })!.nodes[0].data.line).toBeUndefined();
    const b: FlowScene = { kind: "flowchart", v: 1, nodes: [], edges: [] };
    expect(mergeFlowScenes(b, { ...b, theme: "night" }, { ...b, theme: "corp" }).theme).toBe("night");
    expect(mergeFlowScenes(b, b, { ...b, theme: "corp" }).theme).toBe("corp");
  });
});
