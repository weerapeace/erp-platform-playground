import { describe, expect, it } from "vitest";
import { boardPlanLinks, planLinkPatches, progressBar, refLabel } from "@/lib/team-plan-board";
import { cleanPlanLinked, linkedHref, normalizePlanMeta, sameLinked } from "@/lib/team-plan";


// การ์ด = กลุ่ม element ที่มี customData เดียวกัน (กรอบ + ข้อความ) · เส้น = arrow ที่หัว/ท้ายเกาะ element
const card = (elId: string, kind: string, id: string, extra: Record<string, unknown> = {}) => [
  { id: `${elId}-rect`, type: "rectangle", customData: { kind, id, ...extra } },
  { id: `${elId}-text`, type: "text", customData: { kind, id, ...extra } },
];
const arrow = (from: string, to: string, extra: Record<string, unknown> = {}) => ({ id: `a-${from}-${to}`, type: "arrow", startBinding: { elementId: from }, endBinding: { elementId: to }, ...extra });

describe("team-plan-board · อ่านเส้นบนกระดาน", () => {
  it("เส้นจากการ์ดงาน → ใบงาน/SKU = ผูก (เกาะกรอบหรือข้อความก็ได้ · หัวท้ายสลับได้)", () => {
    const els = [
      ...card("p1", "team_plan", "plan-1"),
      ...card("ds", "design_sheet", "ds-9", { code: "DS-2026-0069", name: "กระเป๋า CPN" }),
      ...card("sku", "sku", "sku-3", { code: "WK-01", name: "WK-01" }),
      arrow("p1-rect", "ds-text"),
      arrow("sku-rect", "p1-text"),
    ];
    const r = boardPlanLinks(els);
    expect([...r.onBoard]).toEqual(["plan-1"]);
    expect(r.links.get("plan-1")).toEqual([
      { kind: "design_sheet", id: "ds-9", label: "DS-2026-0069 กระเป๋า CPN" },
      { kind: "sku", id: "sku-3", label: "WK-01" },
    ]);
  });

  it("ไม่ผูก: เส้นที่ปลายลอย · งาน↔งาน · ชนิดที่ไม่รู้จัก · เส้น/การ์ดที่ลบแล้ว · ผูกซ้ำ = นับครั้งเดียว", () => {
    const els = [
      ...card("p1", "team_plan", "plan-1"),
      ...card("p2", "team_plan", "plan-2"),
      ...card("x", "wb_plan", "w-1"),
      ...card("ds", "design_sheet", "ds-9", { code: "DS-1" }),
      { id: "gone", type: "rectangle", isDeleted: true, customData: { kind: "sku", id: "sku-dead" } },
      { id: "free", type: "arrow", startBinding: { elementId: "p1-rect" }, endBinding: null },
      arrow("p1-rect", "p2-rect"),
      arrow("p1-rect", "x-rect"),
      arrow("p1-rect", "gone"),
      arrow("p1-rect", "ds-rect", { isDeleted: true }),
      { ...arrow("p2-rect", "ds-rect"), id: "a1" },
      { ...arrow("ds-text", "p2-text"), id: "a2" },
    ];
    const r = boardPlanLinks(els);
    expect(r.links.get("plan-1")).toBeUndefined();
    expect(r.links.get("plan-2")).toEqual([{ kind: "design_sheet", id: "ds-9", label: "DS-1" }]);
  });

  it("planLinkPatches: เฉพาะงานที่อยู่บนกระดานและรายการเปลี่ยน · การ์ดไม่มีเส้น = เลิกผูก · งานนอกกระดานไม่แตะ", () => {
    const board = boardPlanLinks([...card("p1", "team_plan", "plan-1"), ...card("p3", "team_plan", "plan-3"), ...card("t", "task", "tk-1", { task_no: "T-7", title: "ถ่ายรูป" }), arrow("p1-rect", "t-rect")]);
    const items = [
      { id: "plan-1", plan: { linked: [] } },
      { id: "plan-2", plan: { linked: [{ kind: "sku", id: "s", label: "S" }] } },   // ไม่อยู่บนกระดาน
      { id: "plan-3", plan: { linked: [{ kind: "sku", id: "s", label: "S" }] } },   // อยู่บนกระดาน ไม่มีเส้นแล้ว
    ];
    expect(planLinkPatches(items, board)).toEqual([
      { id: "plan-1", linked: [{ kind: "task", id: "tk-1", label: "T-7 ถ่ายรูป" }] },
      { id: "plan-3", linked: [] },
    ]);
    // บันทึกแล้ว (ตรงกัน) = ไม่ต้องยิงซ้ำ
    expect(planLinkPatches([{ id: "plan-1", plan: { linked: [{ kind: "task", id: "tk-1", label: "T-7 ถ่ายรูป" }] } }], board)).toEqual([]);
  });

  it("refLabel / progressBar", () => {
    expect(refLabel("folder", { path: "Z:\\งานออกแบบ" })).toBe("Z:\\งานออกแบบ");
    expect(refLabel("table", {})).toBe("ตารางคำนวณ");
    expect(refLabel("content", { content_no: "CT-12", title: "โพสต์ลดราคา" })).toBe("CT-12 โพสต์ลดราคา");
    expect(progressBar(2, 4)).toBe("■■■■■□□□□□");
    expect(progressBar(0, 0)).toBe("");
    expect(progressBar(5, 4)).toBe("■■■■■■■■■■");
  });
});

describe("team-plan · รายการผูก (metadata.plan.linked)", () => {
  it("cleanPlanLinked: ชนิดต้องรู้จัก · id ไม่ว่าง · ไม่ซ้ำ · หน้าใน ERP ต้องเป็นลิงก์ในเว็บ · ชื่อว่าง = ชื่อชนิด", () => {
    expect(cleanPlanLinked([
      { kind: "sku", id: "a", label: "  WK  01 " },
      { kind: "sku", id: "a", label: "ซ้ำ" },
      { kind: "hack", id: "x" },
      { kind: "design_sheet", id: "" },
      { kind: "erp_page", id: "https://evil.example" },
      { kind: "erp_page", id: "/tasks/plan", label: "แผนงาน" },
      { kind: "constructor", id: "y" },
      { kind: "trend", id: "t1" },
      "junk",
    ])).toEqual([
      { kind: "sku", id: "a", label: "WK 01" },
      { kind: "erp_page", id: "/tasks/plan", label: "แผนงาน" },
      { kind: "trend", id: "t1", label: "เทรนด์" },
    ]);
    expect(cleanPlanLinked("x")).toEqual([]);
    expect(normalizePlanMeta({ linked: [{ kind: "sku", id: "a", label: "A" }] }).linked).toEqual([{ kind: "sku", id: "a", label: "A" }]);
  });

  it("linkedHref ตรงกับลิงก์ของปุ่ม 'ใส่แผนงาน' (ใช้ค้นย้อนกลับ ?linked=)", () => {
    expect(linkedHref({ kind: "design_sheet", id: "abc" })).toBe("/master/design-dashboard?open=abc");
    expect(linkedHref({ kind: "sku", id: "abc" })).toBe("/master/skus?open=abc");
    expect(linkedHref({ kind: "content", id: "abc" })).toBe("/tasks/content-calendar?content=abc");
    expect(linkedHref({ kind: "table", id: "abc" })).toBeNull();
    expect(linkedHref({ kind: "toString", id: "abc" })).toBeNull();
  });

  it("sameLinked ไม่สนลำดับ", () => {
    const a = { kind: "sku", id: "1", label: "A" }, b = { kind: "task", id: "2", label: "B" };
    expect(sameLinked([a, b], [b, a])).toBe(true);
    expect(sameLinked([a], [{ ...a, label: "ชื่อใหม่" }])).toBe(false);
    expect(sameLinked([a], [])).toBe(false);
  });
});
