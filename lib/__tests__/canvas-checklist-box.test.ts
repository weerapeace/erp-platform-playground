import { describe, expect, it } from "vitest";
import {
  boxPlacement, boxSig, CHECKLIST_ADD_KIND, CHECKLIST_BOX_KIND, CHECKLIST_ITEM_KIND, checklistBoxSkeleton, checklistSourceOf,
  findChecklistBoxes, isChecklistPartKind, linkBindingPatches, linkSkeleton, ownerFrame, parseSource, rowsFromRecordTasks,
  rowsFromSubtasks, selectedChecklistOwner, type ChecklistRow,
} from "@/components/canvas-cards/checklist-box";
import { boardPlanLinks } from "@/lib/team-plan-board";
import { TEAM_PLAN_CHECK } from "@/lib/team-plan";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";

type El = Record<string, unknown>;
const cd = (e: El) => e.customData as Record<string, unknown>;
/** การ์ดงานในแผนบนกระดาน (กรอบ + ข้อความ) */
const planCard = (gid = "g-plan"): El[] => [
  { id: "card-frame", type: "rectangle", x: 100, y: 50, width: 300, height: 80, groupIds: [gid], customData: { kind: "team_plan", id: "plan-1", title: "สั่งผ้า", _part: "card" } },
  { id: "card-stripe", type: "rectangle", x: 100, y: 50, width: 5, height: 80, groupIds: [gid], customData: { kind: "team_plan", id: "plan-1", _part: "stripe" } },
  { id: "card-title", type: "text", x: 180, y: 60, width: 100, height: 20, text: "สั่งผ้า", groupIds: [gid], customData: { kind: "team_plan", id: "plan-1", _part: "title" } },
];
const rows: ChecklistRow[] = [{ id: "t1", title: "หาผ้าสีครีม", done: true }, { id: "t2", title: "ส่งแบบ", done: false, who: "ฝน" }];
/** จำลองการวาง (insert ใส่ id ให้) */
const placed = (els: El[], prefix = "b"): El[] => els.map((e, i) => ({ ...e, id: `${prefix}-${i}` }));

describe("ที่มาของเช็กลิสต์", () => {
  it("งานในแผน / ใบงานออกแบบ = เช็กลิสต์กลาง · งาน = งานย่อย · ชนิดอื่น = ไม่มี", () => {
    expect(checklistSourceOf({ kind: "team_plan", id: "p1", title: "สั่งผ้า" })).toMatchObject({ type: "record", moduleKey: TEAM_PLAN_CHECK.moduleKey, recordType: TEAM_PLAN_CHECK.recordType, label: "สั่งผ้า" });
    expect(checklistSourceOf({ kind: "design_sheet", id: "d1", code: "DS-1", name: "กระเป๋า" })).toMatchObject({ type: "record", moduleKey: DESIGN_WAITING.moduleKey, label: "DS-1 กระเป๋า" });
    expect(checklistSourceOf({ kind: "task", id: "k1", task_no: "T-9", title: "ถ่ายรูป" })).toMatchObject({ type: "subtask", label: "T-9 ถ่ายรูป" });
    expect(checklistSourceOf({ kind: "sku", id: "s1" })).toBeNull();
    expect(checklistSourceOf({ kind: "team_plan" })).toBeNull();
  });
  it("ที่มาที่เก็บบนกระดาน: moduleKey มาจากทะเบียนเสมอ (แก้ค่าบนกระดานไม่ได้)", () => {
    expect(parseSource({ type: "record", ownerKind: "team_plan", ownerId: "p1", label: "x", moduleKey: "hack" })).toMatchObject({ moduleKey: TEAM_PLAN_CHECK.moduleKey, label: "x" });
    expect(parseSource({ ownerKind: "evil", ownerId: "1" })).toBeNull();
    expect(parseSource(null)).toBeNull();
  });
  it("แปลงรายการ: resolved = เสร็จ · งานย่อยยกเลิก = ไม่โชว์ · อนุมัติ/โพสต์ = เสร็จ", () => {
    expect(rowsFromRecordTasks([{ id: "a", title: "x", status: "resolved" }, { id: "b", title: "y", status: "open", assigned_name: "ฝน" }]))
      .toEqual([{ id: "a", title: "x", done: true, who: null }, { id: "b", title: "y", done: false, who: "ฝน" }]);
    expect(rowsFromSubtasks([{ id: "a", title: "x", status: "approved" }, { id: "b", title: "y", status: "canceled" }, { id: "c", title: "z", status: "todo" }]))
      .toEqual([{ id: "a", title: "x", done: true }, { id: "c", title: "z", done: false }]);
  });
});

describe("กล่องเช็กลิสต์", () => {
  const src = checklistSourceOf({ kind: "team_plan", id: "plan-1", title: "สั่งผ้า" })!;
  it("หัว = เสร็จกี่ข้อ · ข้อละ 1 แถว (ติ๊ก/ไม่ติ๊ก + คนรับผิดชอบ) · ปุ่มเพิ่มข้อเมื่อ canAdd", () => {
    const els = checklistBoxSkeleton(src, rows, { x: 460, y: 50 }, "g-plan", true);
    const frame = els.find((e) => cd(e)._frame)!;
    expect(frame).toMatchObject({ type: "rectangle", x: 460, y: 50 });
    expect(cd(frame)).toMatchObject({ kind: CHECKLIST_BOX_KIND, id: "team_plan:plan-1", owner_gid: "g-plan" });
    expect(els.find((e) => e.type === "text" && cd(e).kind === CHECKLIST_BOX_KIND)!.text).toMatch(/^เช็กลิสต์ 1\/2/);
    const items = els.filter((e) => e.type === "text" && cd(e).kind === CHECKLIST_ITEM_KIND).map((e) => e.text);
    expect(items).toEqual(["☑ หาผ้าสีครีม", "☐ ส่งแบบ · ฝน"]);
    expect(els.some((e) => cd(e).kind === CHECKLIST_ADD_KIND)).toBe(true);
    expect(checklistBoxSkeleton(src, rows, { x: 0, y: 0 }, "g", false).some((e) => cd(e).kind === CHECKLIST_ADD_KIND)).toBe(false);
    // ทุกชิ้นกลุ่มเดียวกัน (ลากไปพร้อมกัน)
    expect(new Set(els.map((e) => (e.groupIds as string[])[0])).size).toBe(1);
  });
  it("ไม่มีข้อ = บอกว่ายังไม่มีข้อ", () => {
    expect(checklistBoxSkeleton(src, [], { x: 0, y: 0 }, "g", false).some((e) => String(e.text ?? "").includes("ยังไม่มีข้อ"))).toBe(true);
  });
  it("ลายเซ็นเปลี่ยนเมื่อข้อ/สถานะเปลี่ยนเท่านั้น", () => {
    expect(boxSig(src, rows, true)).toBe(boxSig(src, rows.map((r) => ({ ...r })), true));
    expect(boxSig(src, rows, true)).not.toBe(boxSig(src, [rows[0], { ...rows[1], done: true }], true));
  });
  it("หาเจอบนกระดาน + การ์ดที่เลือก (เลือกการ์ด/เลือกกล่อง) + จุดวาง + กรอบการ์ด", () => {
    const card = planCard();
    expect(ownerFrame(card, "g-plan")!.id).toBe("card-frame");
    expect(boxPlacement(ownerFrame(card, "g-plan")!)).toEqual({ x: 460, y: 50 });
    // ยังไม่แตก
    expect(selectedChecklistOwner(card, new Set(["card-title"]))).toMatchObject({ gid: "g-plan", open: false, source: { ownerId: "plan-1" } });
    expect(selectedChecklistOwner(card, new Set())).toBeNull();
    const box = placed([...checklistBoxSkeleton(src, rows, { x: 460, y: 50 }, "g-plan", true), linkSkeleton("g-plan", card[0], { x: 460, y: 50 })]);
    const board = [...card, ...box];
    const found = findChecklistBoxes(board);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ ownerGid: "g-plan", source: { ownerKind: "team_plan", ownerId: "plan-1", label: "สั่งผ้า" } });
    expect(found[0].linkIds).toEqual([box[box.length - 1].id]);
    expect(found[0].sig).toBe(boxSig(src, rows, true));
    // แตกแล้ว: เลือกการ์ด หรือเลือกชิ้นในกล่อง = "พับ" ได้
    expect(selectedChecklistOwner(board, new Set(["card-frame"]))?.open).toBe(true);
    expect(selectedChecklistOwner(board, new Set([String(box[3].id)]))).toMatchObject({ gid: "g-plan", open: true });
    // ลบแล้วไม่นับ
    expect(findChecklistBoxes(board.map((e) => (cd(e)?.kind === CHECKLIST_BOX_KIND ? { ...e, isDeleted: true } : e))).every((b) => !b.frame)).toBe(true);
  });
  it("ชิ้นส่วนกล่องซ่อนจากรายการการ์ด", () => {
    expect(isChecklistPartKind(CHECKLIST_ITEM_KIND)).toBe(true);
    expect(isChecklistPartKind("team_plan")).toBe(false);
  });
});

describe("เส้นโยงการ์ด→กล่อง", () => {
  it("ผูกปลายเส้นกับกรอบการ์ดและกรอบกล่อง (ไม่ซ้ำเส้นเดิม)", () => {
    const card = { id: "c", boundElements: [{ id: "a", type: "arrow" }, { id: "other", type: "arrow" }] };
    const p = linkBindingPatches({ id: "a" }, card, { id: "box" });
    expect(p.get("a")).toMatchObject({ startBinding: { elementId: "c" }, endBinding: { elementId: "box" } });
    expect(p.get("c")!.boundElements).toEqual([{ id: "other", type: "arrow" }, { id: "a", type: "arrow" }]);
    expect(p.get("box")!.boundElements).toEqual([{ id: "a", type: "arrow" }]);
  });
  it("เส้นจากการ์ดงานไปกล่องเช็กลิสต์ ไม่ถูกนับเป็น 'ผูกงาน'", () => {
    const src = checklistSourceOf({ kind: "team_plan", id: "plan-1", title: "สั่งผ้า" })!;
    const card = planCard();
    const box = placed(checklistBoxSkeleton(src, rows, { x: 460, y: 50 }, "g-plan", false));
    const frame = box.find((e) => cd(e)._frame)!;
    const arrow = { id: "arr", type: "arrow", startBinding: { elementId: "card-frame" }, endBinding: { elementId: frame.id }, customData: { checklist_link: "g-plan" } };
    const links = boardPlanLinks([...card, ...box, arrow]);
    expect(links.onBoard.has("plan-1")).toBe(true);
    expect(links.links.get("plan-1") ?? []).toEqual([]);
  });
});
