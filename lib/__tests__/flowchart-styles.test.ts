import { describe, expect, it } from "vitest";
import { FLOW_STYLE_KEYS, FLOW_STYLE_EDGE, FLOW_STYLE_META, effectiveStyle, flowStyleBoxCss, flowStyleLook } from "@/lib/flowchart-styles";
import { FLOW_PALETTE, mergeFlowScenes, parseFlowScene, toFlowScene, type FlowScene } from "@/lib/flowchart";

const base = FLOW_PALETTE.slate;

describe("สไตล์กล่อง", () => {
  it("ครบ 6 แบบ มีชื่อ + เส้นเชื่อม", () => {
    expect(FLOW_STYLE_KEYS).toEqual(["normal", "minimal", "comic", "luxury", "punk", "y2k"]);
    for (const k of FLOW_STYLE_KEYS) { expect(FLOW_STYLE_META[k].th).toBeTruthy(); expect(FLOW_STYLE_EDGE[k].width).toBeGreaterThan(0); }
  });
  it("ของกล่อง → ของกระดาน → ปกติ", () => {
    expect(effectiveStyle("comic", "y2k")).toBe("comic");
    expect(effectiveStyle(undefined, "y2k")).toBe("y2k");
    expect(effectiveStyle("แปลก", "แปลก")).toBe("normal");
    expect(effectiveStyle("normal", "punk")).toBe("normal");
  });
  it("สีที่ตั้งเองชนะสีของสไตล์ · กล่องตัวหนังสือเยอะใช้พื้นอ่อน", () => {
    const l = flowStyleLook("luxury", base, { fill: "#ff0000" });
    expect([l.fill, l.stroke]).toEqual(["#ff0000", "#d4af37"]);
    expect(flowStyleLook("luxury", base, {}, true).fill).toBe("#fffdf5");
    expect(flowStyleLook("normal", base)).toMatchObject({ fill: base.fill, stroke: base.stroke, sw: 2 });
  });
  it("CSS: punk = ขอบลายเทป · กล่องเริ่ม/จบคงทรงแคปซูล", () => {
    expect(flowStyleBoxCss(flowStyleLook("punk", base), "10px")["border-image"]).toContain("repeating-linear-gradient");
    expect(flowStyleBoxCss(flowStyleLook("comic", base), "999px")["border-radius"]).toBe("999px");
    expect(flowStyleBoxCss(flowStyleLook("comic", base), "10px")["box-shadow"]).toBe("4px 4px 0 #111111");
  });
  it("บันทึก/โหลด/รวมงาน: สไตล์กระดาน + สไตล์กล่อง", () => {
    const node = { id: "a", type: "step", position: { x: 0, y: 0 }, width: 100, height: 40, data: { label: "x", style: "comic" } };
    const s = toFlowScene([node], [], undefined, "y2k");
    expect(s.style).toBe("y2k");
    expect(s.nodes[0].data.style).toBe("comic");
    expect(parseFlowScene({ kind: "flowchart", nodes: [], edges: [], style: "normal" })!.style).toBeUndefined();
    const b: FlowScene = { kind: "flowchart", v: 1, nodes: [], edges: [] };
    expect(mergeFlowScenes(b, { ...b, style: "punk" }, { ...b, style: "y2k" }).style).toBe("punk");
    expect(mergeFlowScenes(b, b, { ...b, style: "y2k" }).style).toBe("y2k");
  });
});
