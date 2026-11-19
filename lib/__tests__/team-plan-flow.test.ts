import { describe, expect, it } from "vitest";
import { normalizePlanMeta, type PlanItem, cleanPlanLinked } from "@/lib/team-plan";
import { planLinkPatches } from "@/lib/team-plan-board";
import { flowPinsOf, flowSummary, initialOf, matchFlowFilter, pinsByNode, suggestFlowNode, withFlowPin, withoutFlowPin, FLOW_PIN_KIND, sortTray } from "@/lib/team-plan-flow";

const NOW = new Date("2026-11-19T03:00:00Z");
const item = (over: Partial<PlanItem> = {}, linked: { kind: string; id: string; label: string }[] = []): PlanItem => ({
  id: "p1", title: "งาน", note: null, status: "open", priority: "normal", due_at: null, assigned_to: "u1", assigned_name: "แนน",
  created_by: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", resolved_by: null, resolved_at: null,
  links: [], plan: { ...normalizePlanMeta(null, NOW), linked }, ...over,
});

describe("เดากล่องจากชื่องาน", () => {
  it("ชื่อกล่อง/คำที่ตั้งไว้ → กล่องที่ตรงสุด · เดาไม่ได้ = null", () => {
    expect(suggestFlowNode("ระบบ Zort - Bigseller ใน ERP")).toBe("so");
    expect(suggestFlowNode("ปรับหน้าใบวางบิลแยกบริษัท")).toBe("bn");
    expect(suggestFlowNode("Swatch Management")).toBe("ds");
    expect(suggestFlowNode("APP โอนเงิน Wechat")).toBe("paypo");
    expect(suggestFlowNode("ไปธนาคารพรุ่งนี้เช้า")).toBeNull();
    expect(suggestFlowNode("")).toBeNull();
  });
  it("งานค้างจริง (19 พ.ย.) — เดาได้ตามผังที่เปิด · เว็บไซต์ไม่มีกล่อง = ไม่เดา", () => {
    const OV = ["ds", "qt", "mo", "so", "pr", "mat", "wo", "po", "pay", "sub", "bill", "gr", "qc", "bn", "raw", "wip", "fg"];
    expect(suggestFlowNode("Program Nesting for Cutting", OV)).toBe("mo");
    expect(suggestFlowNode("Program Nesting for Cutting", ["mat", "prep", "fg", "mo", "wo"])).toBe("prep");
    expect(suggestFlowNode("APP โอนเงินจีน แบบผ่าน Wechat", OV)).toBe("po");
    expect(suggestFlowNode("APP โอนเงินจีน แบบผ่าน Wechat", ["mat", "line", "ready", "paypo", "pr", "po"])).toBe("paypo");
    expect(suggestFlowNode("Program Batch Files", OV)).toBe("ds");
    expect(suggestFlowNode("Program Sort Files", OV)).toBe("ds");
    expect(suggestFlowNode("Program: Louis Batch", OV)).toBe("ds");
    expect(suggestFlowNode("Websites Louis Montini", OV)).toBeNull();
    expect(suggestFlowNode("ซื้อ Domain Website ISGTrading", OV)).toBeNull();
  });
  it("จำกัดเฉพาะกล่องในผังที่เปิด", () => {
    expect(suggestFlowNode("ระบบ Zort", ["po", "pr"])).toBeNull();
  });
});

describe("เกาะ/เอาออก", () => {
  it("เกาะได้หลายกล่อง · ซ้ำไม่เพิ่ม · multi=false = ย้าย · เอาออกเฉพาะกล่องนั้น · ของผูกชนิดอื่นไม่หาย", () => {
    const other = { kind: "sku", id: "s1", label: "SKU" };
    let l = withFlowPin([other], "so");
    l = withFlowPin(l, "gr");
    expect(l.filter((r) => r.kind === FLOW_PIN_KIND).map((r) => r.id)).toEqual(["so", "gr"]);
    expect(withFlowPin(l, "so")).toBe(l);
    expect(withFlowPin(l, "po", false).map((r) => r.id)).toEqual(["s1", "po"]);
    expect(withoutFlowPin(l, "so").map((r) => r.id)).toEqual(["s1", "gr"]);
    expect(l.find((r) => r.id === "so")?.label).toBe("ใบสั่งขาย");
  });
  it("กล่องที่ไม่มีในทะเบียน = ไม่นับ · บันทึกผ่านตัวกรองกลางได้ (flow_node อยู่ในชนิดที่ผูกได้)", () => {
    expect(flowPinsOf(item({}, [{ kind: FLOW_PIN_KIND, id: "gone", label: "x" }, { kind: FLOW_PIN_KIND, id: "so", label: "y" }]))).toEqual(["so"]);
    expect(cleanPlanLinked([{ kind: FLOW_PIN_KIND, id: "so", label: "ใบสั่งขาย" }])).toHaveLength(1);
  });
  it("ซิงค์เส้นของกระดานวาด ไม่ลบการเกาะกล่องผัง", () => {
    const t = item({}, [{ kind: FLOW_PIN_KIND, id: "so", label: "ใบสั่งขาย" }]);
    expect(planLinkPatches([t], { onBoard: new Set(["p1"]), links: new Map() })).toEqual([]);
    const add = planLinkPatches([t], { onBoard: new Set(["p1"]), links: new Map([["p1", [{ kind: "sku", id: "s1", label: "SKU" }]]]) });
    expect(add[0].linked.map((r) => r.kind).sort()).toEqual(["flow_node", "sku"]);
  });
});

describe("ป้ายบนกล่อง + สรุป + ตัวกรอง", () => {
  const a = item({ id: "a", due_at: "2026-11-17T11:00:00Z" }, [{ kind: FLOW_PIN_KIND, id: "so", label: "" }]);
  const b = item({ id: "b", assigned_to: "u2", due_at: "2026-11-25T11:00:00Z" }, [{ kind: FLOW_PIN_KIND, id: "so", label: "" }, { kind: FLOW_PIN_KIND, id: "gr", label: "" }]);
  const c = item({ id: "c" });
  const d = item({ id: "d", status: "resolved" }, [{ kind: FLOW_PIN_KIND, id: "so", label: "" }]);
  it("กล่อง → งานที่ยังไม่เสร็จ (เสร็จแล้วไม่นับ) · กรองของฉัน/เกินกำหนด", () => {
    const all = pinsByNode([a, b, c, d], "all", "u1", NOW);
    expect(all.get("so")?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(all.get("gr")?.map((t) => t.id)).toEqual(["b"]);
    expect(pinsByNode([a, b], "me", "u1", NOW).get("gr")).toBeUndefined();
    expect(pinsByNode([a, b], "over", null, NOW).get("so")?.map((t) => t.id)).toEqual(["a"]);
    expect(matchFlowFilter(a, "me", null, NOW)).toBe(false);
  });
  it("สรุป: เกาะแล้ว/ทั้งหมด · เกินกำหนด · กล่องค้างมากสุด", () => {
    expect(flowSummary([a, b, c, d], NOW)).toEqual({ pinned: 2, total: 3, overdue: 1, topNode: "so", topCount: 1 });
  });
  it("ตัวย่อชื่อ + เรียงถาด", () => {
    expect(initialOf("gogo")).toBe("G");
    expect(initialOf(null)).toBe("?");
    const u = item({ id: "u", priority: "urgent" }), n = item({ id: "n", due_at: "2026-11-18T00:00:00Z" });
    expect(sortTray([u, n], "due").map((t) => t.id)).toEqual(["n", "u"]);
    expect(sortTray([n, u], "priority").map((t) => t.id)).toEqual(["u", "n"]);
  });
});
