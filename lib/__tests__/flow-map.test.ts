import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FLOW_NODES, FLOW_EDGES, FLOW_VIEWS, FLOW_METRICS } from "@/lib/flow-map";
import { WORKFLOWS } from "@/lib/workflow-registry";

// แผนผังการทำงาน (/master/flow-map) ต้องไม่ตกยุค: ไฟล์ที่อ้างต้องมีจริง · กล่อง/เส้น/ผังต้องชี้กันถูก
const root = resolve(__dirname, "../..");

describe("ทะเบียนแผนผังการทำงาน", () => {
  it("ไฟล์ที่เส้นอ้างว่า “ทำจริง” มีอยู่ทุกไฟล์ (ย้าย/ลบไฟล์แล้วต้องแก้ lib/flow-map.ts)", () => {
    const missing = Object.entries(FLOW_EDGES).flatMap(([id, e]) => e.files.filter((f) => !existsSync(resolve(root, f))).map((f) => `${id}: ${f}`));
    expect(missing).toEqual([]);
  });

  it("เส้นทุกเส้นชี้กล่องที่มีอยู่ · workflow ชี้ทะเบียน workflow ที่มีอยู่", () => {
    const keys = new Set(WORKFLOWS.map((w) => w.key));
    const bad = Object.entries(FLOW_EDGES).filter(([, e]) => !FLOW_NODES[e.from] || !FLOW_NODES[e.to] || (e.workflow && !keys.has(e.workflow))).map(([id]) => id);
    expect(bad).toEqual([]);
  });

  it("ตัวเลขสดที่อ้างมีนิยาม", () => {
    const used = [...Object.values(FLOW_NODES), ...Object.values(FLOW_EDGES)].flatMap((x) => x.metrics ?? []);
    expect(used.filter((m) => !FLOW_METRICS[m])).toEqual([]);
  });

  it("ทุกผัง: เส้นที่วาดมีอยู่จริง และต้น/ปลายอยู่ในผังนั้น · ไม่มีกล่องทับตำแหน่งกัน", () => {
    for (const v of FLOW_VIEWS) {
      for (const [id, , , , , o] of v.edges) {
        const e = FLOW_EDGES[id];
        expect(e, `${v.key}: ไม่มีเส้น ${id}`).toBeTruthy();
        expect(v.pos[o?.a ?? e.from], `${v.key}/${id}: ต้นทาง`).toBeTruthy();
        expect(v.pos[o?.b ?? e.to], `${v.key}/${id}: ปลายทาง`).toBeTruthy();
      }
      for (const id of Object.keys(v.pos)) expect(FLOW_NODES[id], `${v.key}: ไม่มีกล่อง ${id}`).toBeTruthy();
      const spots = Object.values(v.pos).map((p) => p.join(","));
      expect(new Set(spots).size, `${v.key}: กล่องทับกัน`).toBe(spots.length);
    }
  });

  it("ภาพรวมมีครบ 4 ส่วน", () => {
    const ov = FLOW_VIEWS.find((v) => v.key === "ov")!;
    const areas = new Set(Object.keys(ov.pos).map((id) => FLOW_NODES[id].area));
    for (const a of ["buy", "make", "dispatch", "sell"] as const) expect(areas.has(a)).toBe(true);
  });
});
