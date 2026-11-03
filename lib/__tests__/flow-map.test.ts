import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FLOW_NODES, FLOW_EDGES, FLOW_VIEWS, FLOW_METRICS, FLOW_JOURNEY, FLOW_ISSUE_APP } from "@/lib/flow-map";
import { flowGeometryProblems, isRecentEdge } from "@/lib/flow-map-layout";
import { buildFlowPrompt } from "@/lib/flow-map-prompt";
import { WORKFLOWS } from "@/lib/workflow-registry";

describe("แผนผังการทำงาน — การวาดและของเสริม", () => {
  it("ทุกผัง: เส้นไม่ทับกล่องอื่น · เลขบนเส้นไม่ซ้อนกัน/ไม่ชนกล่อง · ไม่หลุดขอบ", () => {
    expect(FLOW_VIEWS.flatMap(flowGeometryProblems)).toEqual([]);
  });
  it("แท็บออเดอร์ 1 ใบ อ้างกล่อง/เส้นที่มีอยู่จริง", () => {
    for (const s of FLOW_JOURNEY) {
      expect(FLOW_NODES[s.node], s.title).toBeTruthy();
      for (const id of s.edges) expect(FLOW_EDGES[id], `${s.title}: ${id}`).toBeTruthy();
    }
  });
  it("ป้าย “เพิ่งแก้”: วันที่รูปแบบ YYYY-MM-DD · หมดอายุตามจำนวนวัน", () => {
    for (const [id, e] of Object.entries(FLOW_EDGES)) if (e.changed) expect(e.changed.date, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isRecentEdge("X8", new Date("2026-11-03T10:00:00+07:00"))).toBe(true);
    expect(isRecentEdge("X8", new Date("2027-01-15T10:00:00+07:00"))).toBe(false);
    expect(isRecentEdge("P3", new Date("2026-11-03T10:00:00+07:00"))).toBe(false);
  });
  it("ทุกส่วนมีแอปปลายทางของรายงานปัญหา", () => {
    for (const n of Object.values(FLOW_NODES)) expect(FLOW_ISSUE_APP[n.area]).toBeTruthy();
  });
  it("prompt แนบข้อมูลของส่วนนั้น + สิ่งที่อยากแก้ + ข้อกำหนด", () => {
    const p = buildFlowPrompt([{ kind: "n", ref: "pay", text: "ดึงค่าเหมาเข้าเงินเดือนเอง" }, { kind: "e", ref: "S4", text: "ตั้งวันเริ่มนับ" }], { stock_fg: 5 });
    expect(p).toContain("CLAUDE.md");
    expect(p).toContain("เงินเดือน");
    expect(p).toContain("payroll_adjustments");
    expect(p).toContain("ดึงค่าเหมาเข้าเงินเดือนเอง");
    expect(p).toContain("ตั้งวันเริ่มนับ");
    expect(p).toContain("npm run where-used -- sales-order");
    expect(p).toContain("lib/flow-map.ts");
  });
});

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
