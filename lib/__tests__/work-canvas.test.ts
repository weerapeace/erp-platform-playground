import { describe, expect, it } from "vitest";
import { normalizePlanMeta, type PlanItem } from "@/lib/team-plan";
import { flowNodeLabel, flowPinsOf, withFlowPin } from "@/lib/team-plan-flow";
import {
  countKinds, matchWork, parseFlowViewPref, planToWork, sheetBox, sheetToWork, sortWork, statusBreakdown, taskBox, taskToWork, workSummary, ymdDue, WORK_BOXES,
} from "@/lib/work-canvas";

const NOW = new Date("2026-11-19T03:00:00Z"); // 10:00 เวลาไทย
const lbl = (s: string) => `#${s}`;
const plan = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: "p1", title: "งานแผน", note: null, status: "open", priority: "normal", due_at: null, assigned_to: "u1", assigned_name: "แนน",
  created_by: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", resolved_by: null, resolved_at: null,
  links: [], plan: { ...normalizePlanMeta(null, NOW), linked: [] }, ...over,
});

describe("สถานะ → กล่องเอง", () => {
  it("งาน Task: ตามกลุ่มสถานะ · ปิดแล้ว = ไม่มีกล่อง · ไม่รู้จัก = รอคิว", () => {
    expect(taskBox("backlog")).toBe("w_queue");
    expect(taskBox("revision")).toBe("w_doing");
    expect(taskBox("need_review")).toBe("w_review");
    expect(taskBox("scheduled")).toBe("w_publish");
    expect(taskBox("done")).toBeNull();
    expect(taskBox("cancelled")).toBeNull();
    expect(taskBox("state_x")).toBe("w_queue");
  });
  it("ใบงาน: สถานะในฐานข้อมูลจริง · ปิดตาม is_terminal · ไม่รู้จักแต่ยังเปิด = ออกแบบ", () => {
    expect(sheetBox("design")).toBe("d_design");
    expect(sheetBox("revising")).toBe("d_design");
    expect(sheetBox("quoted")).toBe("d_customer");
    expect(sheetBox("sent_customer")).toBe("d_customer");
    expect(sheetBox("approved")).toBe("d_approved");
    expect(sheetBox("sku_created")).toBeNull();
    expect(sheetBox("state_8")).toBeNull();
    expect(sheetBox("new_state")).toBe("d_design");
    expect(sheetBox("design", new Set(["design"]))).toBeNull();
  });
  it("กล่องทุกกล่องมีชื่อ · เกาะงานแผนกับกล่องแถบนี้ได้ (นับเป็นกล่องที่เกาะ)", () => {
    for (const [id, b] of Object.entries(WORK_BOXES)) { expect(b.label.length).toBeGreaterThan(0); expect(flowNodeLabel(id)).toBe(b.label); }
    const t = plan({ plan: { ...normalizePlanMeta(null, NOW), linked: withFlowPin([], "w_review") } });
    expect(flowPinsOf(t)).toEqual(["w_review"]);
    expect(flowPinsOf(plan({ plan: { ...normalizePlanMeta(null, NOW), linked: [{ kind: "flow_node", id: "nope", label: "x" }] } }))).toEqual([]);
  });
});

describe("กำหนดส่งแบบวันที่ล้วน (เวลาไทย)", () => {
  it("เกินเมื่อพ้นวันนั้นแล้ว · วันนี้ไม่นับเกิน", () => {
    expect(ymdDue("2026-11-17", NOW)).toEqual({ overdue: true, text: "เกินกำหนด 2 วัน" });
    expect(ymdDue("2026-11-19", NOW)).toEqual({ overdue: false, text: "วันนี้" });
    expect(ymdDue("2026-11-20", NOW)).toEqual({ overdue: false, text: "พรุ่งนี้" });
    expect(ymdDue("2026-12-07", NOW).text).toBe("7 ธ.ค.");
    expect(ymdDue(null, NOW)).toEqual({ overdue: false, text: "ไม่มีกำหนด" });
  });
});

describe("แปลงรูปเป็นงานรวม", () => {
  it("งาน Task: คนทำหลายคน (ไม่ซ้ำ) · รอตรวจ · ความคืบหน้า · ปิดแล้ว = null", () => {
    const w = taskToWork({ id: "t1", task_no: "T-1", title: "ทำรูป", status: "need_review", priority: "high", due_date: "2026-11-18",
      assignee_id: "u1", assignee_label: "แนน", assignees: [{ id: "u1", label: "แนน" }, { id: "u2", label: "ต้น" }], progress_percent: 40 }, lbl, NOW)!;
    expect(w.box).toBe("w_review");
    expect(w.assigned_ids.sort()).toEqual(["u1", "u2"]);
    expect(w.assigned_name).toBe("แนน, ต้น");
    expect(w.review).toBe(true);
    expect(w.overdue).toBe(true);
    expect(w.progress).toBe(40);
    expect(w.status_label).toBe("#need_review");
    expect(taskToWork({ id: "t2", title: "x", status: "done" }, lbl, NOW)).toBeNull();
  });
  it("ใบงาน: รหัสนำหน้าชื่อ · รออะไรอยู่ (พิมพ์เอง + เช็กลิสต์ ไม่ซ้ำ) · รอลูกค้า = รอคนอื่น", () => {
    const w = sheetToWork({ id: "s1", code: "DS-1", name: "กระเป๋า", status: "sent_customer", deadline: null,
      waiting_for: "ลูกค้าเลือกสี", waiting_items: { open: ["ลูกค้าเลือกสี", "รอผ้า"], done: 1 } }, lbl, undefined, NOW)!;
    expect(w.title).toBe("DS-1 กระเป๋า");
    expect(w.waiting).toEqual(["ลูกค้าเลือกสี", "รอผ้า"]);
    expect(w.review).toBe(true);
    expect(w.assigned_ids).toEqual([]);
    expect(sheetToWork({ id: "s2", name: "x", status: "cancelled" }, lbl, undefined, NOW)).toBeNull();
  });
  it("แผน: รอคนอื่น = รอตรวจ · เกินกำหนดตามเวลา", () => {
    const w = planToWork(plan({ due_at: "2026-11-18T11:00:00Z", plan: { ...normalizePlanMeta(null, NOW), waiting: { note: "ลูกค้า", since: "2026-11-10" } } }), "เกิน", NOW);
    expect(w.review).toBe(true);
    expect(w.overdue).toBe(true);
    expect(w.status_label).toBe("รอ: ลูกค้า");
  });
});

describe("ตัวกรอง · สรุป · กางสถานะ · เรียง", () => {
  const p = planToWork(plan({ assigned_to: "me" }), "", NOW);
  const t = taskToWork({ id: "t", title: "a", status: "in_progress", due_date: "2026-11-01", assignee_id: "x" }, lbl, NOW)!;
  const t2 = taskToWork({ id: "t2", title: "b", status: "in_progress", due_date: null }, lbl, NOW)!;
  const s = sheetToWork({ id: "s", name: "c", status: "quoted", waiting_items: { open: ["x"], done: 0 } }, lbl, undefined, NOW)!;
  it("ของฉัน / เกินกำหนด / รอตรวจ", () => {
    expect([p, t, s].filter((w) => matchWork(w, "me", "me")).map((w) => w.kind)).toEqual(["plan"]);
    expect([p, t, s].filter((w) => matchWork(w, "over", null)).map((w) => w.id)).toEqual(["t"]);
    expect([p, t, s].filter((w) => matchWork(w, "review", null)).map((w) => w.id)).toEqual(["s"]);
    expect(matchWork(p, "me", null)).toBe(false);
  });
  it("สรุป + นับแยกชนิด", () => {
    expect(workSummary([p, t, t2, s])).toEqual({ total: 4, byKind: { plan: 1, task: 2, sheet: 1 }, overdue: 1, review: 1, waitingSheets: 1 });
    expect(countKinds([p, t, s])).toEqual({ plan: 1, task: 1, sheet: 1, overdue: true });
  });
  it("กางสถานะย่อย (ไม่นับแผน) มากไปน้อย · เรียง เกินก่อน → มีกำหนด → ไม่มีกำหนด", () => {
    expect(statusBreakdown([p, t, t2, s])).toEqual([{ label: "#in_progress", n: 2, kind: "task" }, { label: "#quoted", n: 1, kind: "sheet" }]);
    expect(sortWork([t2, s, t]).map((w) => w.id)[0]).toBe("t");
  });
  it("ค่าที่จำไว้: ผิดรูป = ค่าตั้งต้น · ชนิดว่าง = ครบ 3", () => {
    expect(parseFlowViewPref(null)).toBeNull();
    expect(parseFlowViewPref({ view: "ov", filter: "bad", kinds: [] })).toEqual({ view: "ov", filter: "all", onlyPinned: false, kinds: ["plan", "task", "sheet"] });
    expect(parseFlowViewPref({ view: "work", filter: "review", onlyPinned: true, kinds: ["task", "zzz"] })).toEqual({ view: "work", filter: "review", onlyPinned: true, kinds: ["task"] });
  });
});
