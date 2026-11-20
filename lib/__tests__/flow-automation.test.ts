import { describe, expect, it } from "vitest";
import { AUTO_ACTIONS, AUTO_TRIGGERS, AUTO_ACTS_MAX, autoComplete, autoPickLabel, cleanAuto, listAutos } from "@/lib/flow-automation";
import { WORKFLOWS } from "@/lib/workflow-registry";
import { makeFlowNode, parseFlowScene } from "@/lib/flowchart";

const t = (th: string) => th;

describe("ทะเบียนกล่องอัตโนมัติ", () => {
  it("key ไม่ซ้ำ · wf อ้าง workflow ที่มีจริง", () => {
    for (const list of [AUTO_TRIGGERS, AUTO_ACTIONS]) expect(new Set(list.map((r) => r.key)).size).toBe(list.length);
    const wf = new Set(WORKFLOWS.map((w) => w.key));
    for (const r of AUTO_TRIGGERS) if (r.wf) expect(wf.has(r.wf), r.key).toBe(true);
  });
});

describe("กฎอัตโนมัติ", () => {
  it("ล้างข้อมูลดิบ: key ไม่รู้จักทิ้ง (ถ้ามีข้อความเก็บข้อความไว้) · สถานะผิด = แผน · ให้ ≤ 8", () => {
    const a = cleanAuto({
      when: { key: "mo_done", text: "  ฝ่ายผลิต " }, cond: "  ", status: "เพี้ยน",
      acts: [{ key: "notify_line" }, { key: "ไม่มี", text: "โทรหาลูกค้า" }, { key: "ไม่มี" }, ...Array.from({ length: 10 }, () => ({ key: "notify_app" }))],
    });
    expect(a.when).toEqual({ key: "mo_done", text: "ฝ่ายผลิต" });
    expect(a.cond).toBeUndefined();
    expect(a.status).toBe("plan");
    expect(a.acts.slice(0, 2)).toEqual([{ key: "notify_line" }, { text: "โทรหาลูกค้า" }]);
    expect(a.acts.length).toBe(AUTO_ACTS_MAX);
    expect(cleanAuto(null)).toEqual({ acts: [], status: "plan" });
  });

  it("ชื่อที่โชว์ = ชื่อจากทะเบียน + รายละเอียด · ครบ = มีทั้ง เมื่อ และ ให้", () => {
    expect(autoPickLabel({ key: "notify_line", text: "ฝ่ายขาย" }, "act", t)).toBe("แจ้ง LINE · ฝ่ายขาย");
    expect(autoPickLabel({ text: "พิมพ์เอง" }, "when", t)).toBe("พิมพ์เอง");
    expect(autoComplete({ when: { key: "mo_done" }, acts: [], status: "plan" })).toBe(false);
    expect(autoComplete({ when: { key: "mo_done" }, acts: [{ key: "notify_line" }], status: "plan" })).toBe(true);
  });

  it("บันทึก/โหลดกลับผ่านกระดาน · กล่องใหม่ตั้งต้นเป็นแผน", () => {
    const n = makeFlowNode("auto", { x: 0, y: 0 }, t);
    expect(n.data.auto).toEqual({ acts: [], status: "plan" });
    const s = parseFlowScene({ kind: "flowchart", nodes: [{ ...n, data: { label: "แจ้งขาย", auto: { when: { key: "mo_done" }, acts: [{ key: "notify_line" }], status: "live" } } }], edges: [] })!;
    expect(s.nodes[0].data.auto).toEqual({ when: { key: "mo_done" }, acts: [{ key: "notify_line" }], status: "live" });
  });

  it("รายการ อัตโนมัติ N: ใช้งานอยู่ขึ้นก่อน · ปิดไว้ท้ายสุด", () => {
    const box = (id: string, y: number, status: "plan" | "live" | "off", label = id) => ({ id, type: "auto", position: { x: 0, y }, data: { label, auto: { acts: [], status } } });
    const l = listAutos([box("p", 0, "plan"), box("o", 0, "off"), box("l", 500, "live", "แจ้งขาย\nรายละเอียด"), { id: "x", type: "step", position: { x: 0, y: 0 }, data: { label: "x" } }]);
    expect(l.map((x) => [x.nodeId, x.title])).toEqual([["l", "แจ้งขาย"], ["p", "p"], ["o", "o"]]);
  });
});
