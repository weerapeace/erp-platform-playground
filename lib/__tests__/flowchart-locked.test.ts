import { describe, it, expect } from "vitest";
import { EMPTY_FLOW_SCENE, cleanPins, isSysId, mergeFlowScenes, parseFlowScene, sysId, toFlowScene, unSysId, type FlowScene } from "../flowchart";
import { boxAt, elbowBetween, livePins, lockedLinePath, searchBoxes, staleEdges, type LockedBox, type LockedLine } from "../flowchart-locked";
import { planRuleCheck } from "../storage-policy";
import { FLOW_VIEWS, FLOW_NODES } from "../flow-map";
import { fmBox, layoutFlowView } from "../flow-map-layout";

const A: LockedBox = { id: "pr", x: 20, y: 40, w: 130, h: 44, label: "ใบขอซื้อ" };
const B: LockedBox = { id: "po", x: 20, y: 116, w: 130, h: 44, label: "ใบสั่งซื้อ" };
const boxes = new Map([A, B].map((b) => [b.id, b]));
const line: LockedLine = { id: "E1", source: "pr", target: "po", d: "M85 84V116", feeds: ["M0 0H5"], badge: { x: 85, y: 100 }, color: "#16a34a", text: "1" };

describe("flowchart — กล่องของระบบ (sys:) + ตำแหน่งที่ย้าย (pins)", () => {
  it("id ชั้นล็อก", () => {
    expect(isSysId("sys:pr")).toBe(true);
    expect(isSysId("sys:")).toBe(false);
    expect(isSysId("n-abc")).toBe(false);
    expect(unSysId(sysId("po"))).toBe("po");
  });

  it("cleanPins เก็บเฉพาะ key sys: ที่ตัวเลขถูก + ปัดเป็นจำนวนเต็ม", () => {
    expect(cleanPins({ "sys:pr": { x: 10.6, y: 20 }, "n-1": { x: 1, y: 1 }, "sys:bad": { x: "1", y: 2 }, "sys:inf": { x: Infinity, y: 0 } })).toEqual({ "sys:pr": { x: 11, y: 20 } });
    expect(cleanPins(null)).toEqual({});
    expect(cleanPins([1, 2])).toEqual({});
  });

  it("parseFlowScene: เส้นที่วาดเองต่อเข้ากล่องระบบได้ · ปลายมั่ว (ไม่ใช่กล่องและไม่ใช่ sys:) ยังถูกตัด", () => {
    const s = parseFlowScene({
      kind: "flowchart",
      nodes: [{ id: "n1", type: "step", position: { x: 0, y: 0 }, data: { label: "เช็กผ้า" } }],
      edges: [
        { id: "e1", source: "sys:pr", target: "n1", label: "" },
        { id: "e2", source: "n1", target: "ghost", label: "" },
      ],
      pins: { "sys:pr": { x: 100, y: 200 } },
    })!;
    expect(s.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(s.pins).toEqual({ "sys:pr": { x: 100, y: 200 } });
  });

  it("กระดานที่ไม่มี pins ลายเซ็นเหมือนเดิม (ไม่เพิ่มช่องว่าง)", () => {
    const s = parseFlowScene({ kind: "flowchart", nodes: [], edges: [], pins: {} })!;
    expect("pins" in s).toBe(false);
    expect(toFlowScene([], [], {})).toEqual(EMPTY_FLOW_SCENE);
  });

  it("toFlowScene ใส่ pins + กล่องที่เก็บผูกกฎ (rule) ผ่านการตรวจ", () => {
    const s = toFlowScene(
      [{ id: "s1", type: "storage", position: { x: 0, y: 0 }, width: 200, height: 90, data: { label: "R2", place: "r2", rule: "product_images" } },
        { id: "s2", type: "storage", position: { x: 0, y: 0 }, width: 200, height: 90, data: { label: "x", rule: "DROP TABLE" } }],
      [], { "sys:po": { x: 5, y: 6 } });
    expect(s.nodes[0].data.rule).toBe("product_images");
    expect(s.nodes[1].data.rule).toBeUndefined();
    expect(s.pins).toEqual({ "sys:po": { x: 5, y: 6 } });
  });

  it("รวมงาน 3 ทาง: ตำแหน่งกล่องระบบรวมทีละกล่อง + เส้นที่ต่อกล่องระบบไม่หาย", () => {
    const base: FlowScene = { ...EMPTY_FLOW_SCENE, pins: { "sys:pr": { x: 0, y: 0 } } };
    const mine: FlowScene = { ...EMPTY_FLOW_SCENE, pins: { "sys:pr": { x: 50, y: 50 } } };   // เราย้าย pr
    const theirs: FlowScene = {
      ...EMPTY_FLOW_SCENE,
      nodes: [{ id: "n1", type: "step", position: { x: 0, y: 0 }, width: 100, height: 40, data: { label: "a" } }],
      edges: [{ id: "e1", source: "sys:po", target: "n1", sourceHandle: null, targetHandle: null, label: "" }],
      pins: { "sys:pr": { x: 0, y: 0 }, "sys:po": { x: 9, y: 9 } },   // อีกคนย้าย po + ต่อเส้นเข้ากล่องระบบ
    };
    const m = mergeFlowScenes(base, mine, theirs);
    expect(m.pins).toEqual({ "sys:pr": { x: 50, y: 50 }, "sys:po": { x: 9, y: 9 } });
    expect(m.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("รวมงาน: เรากดคืนตำแหน่งเดิม (ลบ pin) ชนะ ถ้าอีกฝั่งไม่ได้แตะกล่องนั้น", () => {
    const base: FlowScene = { ...EMPTY_FLOW_SCENE, pins: { "sys:pr": { x: 1, y: 1 } } };
    const m = mergeFlowScenes(base, EMPTY_FLOW_SCENE, base);
    expect(m.pins).toBeUndefined();
  });
});

describe("flowchart-locked — เส้นทาง/เส้นค้าง/ค้นหา", () => {
  it("กล่องไม่ถูกย้าย = ใช้เส้นทางของผังเดิมทั้งเส้น + เส้นรวมสาย + วงเลข", () => {
    expect(lockedLinePath(line, boxes, {})).toEqual({ d: "M85 84V116", feeds: ["M0 0H5"], badge: { x: 85, y: 100 } });
  });

  it("ย้ายกล่องปลายหนึ่ง = เส้นหักมุมใหม่ วงเลขย้ายไปกลางเส้น ตัดเส้นรวมสาย", () => {
    const pins = { "sys:po": { x: 300, y: 40 } };
    const r = lockedLinePath(line, boxes, pins)!;
    expect(r.d.startsWith("M150 62")).toBe(true);   // ออกขอบขวาของ pr
    expect(r.d.endsWith("H300")).toBe(true);        // เข้าขอบซ้ายของ po ที่ย้ายแล้ว
    expect(r.feeds).toEqual([]);
    expect(r.badge).toEqual({ x: 225, y: 62 });
    expect(boxAt(B, pins)).toMatchObject({ x: 300, y: 40 });
  });

  it("กล่องอยู่บน-ล่าง = ออกขอบล่างเข้าขอบบน", () => {
    const e = elbowBetween(A, { ...B, y: 300 });
    expect(e.d).toBe("M85 84V192H85V300");
  });

  it("ปลายเส้นหาไม่เจอ = ไม่วาด", () => {
    expect(lockedLinePath({ ...line, target: "zz" }, boxes, {})).toBeNull();
  });

  it("เส้นค้าง = เส้นที่วาดเองต่อกับกล่องระบบที่ไม่มีแล้ว", () => {
    const edges = [
      { id: "e1", source: "sys:pr", target: "n1" },
      { id: "e2", source: "n1", target: "sys:gone" },
      { id: "e3", source: "n1", target: "n2" },
    ];
    expect(staleEdges(edges, ["pr", "po"])).toEqual(["e2"]);
  });

  it("livePins ตัดตำแหน่งของกล่องที่ไม่มีแล้ว", () => {
    expect(livePins({ "sys:pr": { x: 1, y: 1 }, "sys:gone": { x: 2, y: 2 } }, ["pr"])).toEqual({ "sys:pr": { x: 1, y: 1 } });
  });

  it("ค้นหากล่อง: ทุกคำต้องเจอ · ขึ้นต้นด้วยคำค้นมาก่อน · ไม่สนตัวพิมพ์", () => {
    const items = [{ id: "a", label: "ใบสั่งซื้อ PO" }, { id: "b", label: "ใบขอซื้อ" }, { id: "c", label: "ซื้อของ" }];
    expect(searchBoxes(items, "ซื้อ").map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(searchBoxes(items, "ใบ po").map((x) => x.id)).toEqual(["a"]);
    expect(searchBoxes(items, "  ")).toEqual([]);
  });
});

describe("แผนผังการทำงาน → ชั้นล็อก (ข้อมูลจริงจากทะเบียน)", () => {
  it("ทุกเส้นในทุกผัง มีกล่องต้น/ปลายอยู่ในผังนั้น (ไม่งั้นเส้นของระบบจะหายจากกระดาน)", () => {
    for (const v of FLOW_VIEWS) {
      const map = new Map(Object.entries(v.pos).map(([id, p]) => { const b = fmBox(p); return [id, { id, x: b.x, y: b.y, w: b.w, h: b.h, label: FLOW_NODES[id].label }]; }));
      for (const d of layoutFlowView(v)) {
        const r = lockedLinePath({ id: d.id, source: d.a, target: d.b, d: d.d, color: "#000" }, map, {});
        expect(r, `${v.key}/${d.id}`).not.toBeNull();
        expect(r!.d).toBe(d.d);
      }
    }
  });
});

describe("planRuleCheck — กล่องที่เก็บในแผน เทียบกับกฎที่เก็บจริง", () => {
  const rule = { rule_key: "supplier_bills", provider: "supabase" as const, label: "บิลซัพพลายเออร์" };
  it("หากฎไม่เจอ = เตือน", () => {
    expect(planRuleCheck("supabase", null).tone).toBe("warn");
  });
  it("แผนบอกที่เก็บของระบบตัวอื่น = เตือน พร้อมบอกทั้งสองฝั่ง", () => {
    const r = planRuleCheck("r2", rule, { supplier_bills: "rule" });
    expect(r.tone).toBe("warn");
    expect(r.th).toContain("R2");
    expect(r.th).toContain("Supabase");
  });
  it("แผนบอกที่เก็บนอกระบบ (เช่น NAS) = เตือน", () => {
    expect(planRuleCheck("nas", rule, { supplier_bills: "rule" }).tone).toBe("warn");
  });
  it("กฎตั้งไว้แต่ช่องอัปยังส่งที่อื่น = เตือน", () => {
    const r = planRuleCheck("supabase", rule, { supplier_bills: "r2" });
    expect(r.tone).toBe("warn");
    expect(r.th).toContain("ช่องอัป");
  });
  it("ตรงกัน / ยังไม่ได้เลือกไอคอน = ตรงกฎ", () => {
    expect(planRuleCheck("supabase", rule, { supplier_bills: "rule" }).tone).toBe("ok");
    expect(planRuleCheck(undefined, rule, {}).tone).toBe("ok");
  });
});
