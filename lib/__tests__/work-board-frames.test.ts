import { describe, expect, it } from "vitest";
import {
  COL_W, DONE_OPACITY, FRAME_GAP, FRAME_W, GAP, MIN_H, PAD, WORK_FRAME_KIND, doneCards, fadePatches, frameName, planPlacement, readWorkBoard, skelSize,
} from "@/lib/work-board-frames";

const frame = (id: string, wk: string, x: number, y: number, h = 400) => ({ id, type: "frame", x, y, width: FRAME_W, height: h, name: wk, customData: { kind: WORK_FRAME_KIND, wk } });
const card = (gid: string, kind: string, id: string, x: number, y: number, w = 300, h = 100, extra: Record<string, unknown> = {}) => [
  { id: `${gid}-r`, type: "rectangle", x, y, width: w, height: h, groupIds: [gid], customData: { kind, id }, ...extra },
  { id: `${gid}-t`, type: "text", x: x + 10, y: y + 10, width: w - 20, height: 20, groupIds: [gid], customData: { kind, id }, ...extra },
];
const newId = (wk: string) => `f-${wk}`;

describe("อ่านกระดาน", () => {
  it("กรอบหมวด + การ์ด 3 ชนิด (กลุ่มเดียวกัน = การ์ดเดียว) · ข้ามของที่ลบแล้ว/ชนิดอื่น", () => {
    const b = readWorkBoard([
      frame("F1", "task", 0, 0),
      ...card("g1", "task", "t1", 20, 20),
      ...card("g2", "design_sheet", "s1", 400, 20),
      ...card("g3", "team_plan", "p1", 800, 20),
      ...card("g4", "sku", "x", 0, 0),
      { id: "dead", type: "frame", x: 0, y: 0, width: 10, height: 10, isDeleted: true, customData: { kind: WORK_FRAME_KIND, wk: "plan" } },
    ]);
    expect([...b.frames.keys()]).toEqual(["task"]);
    expect(b.cards.map((c) => c.key).sort()).toEqual(["plan:p1", "sheet:s1", "task:t1"]);
    expect(b.cards.find((c) => c.id === "t1")!.elIds).toEqual(["g1-r", "g1-t"]);
  });
});

describe("จัดงานลงกรอบ", () => {
  it("กระดานว่าง + ensureAll = สร้าง 3 กรอบเรียงกัน · การ์ดเข้าแถว 4 ใบ แล้วขึ้นแถวใหม่", () => {
    const reqs = Array.from({ length: 5 }, (_, i) => ({ wk: "task" as const, key: `task:${i}`, w: 260, h: 120 }));
    const p = planPlacement(readWorkBoard([]), reqs, { ensureAll: true, newId });
    expect(p.newFrames.map((f) => [f.wk, f.x, f.y])).toEqual([["plan", 0, 0], ["task", FRAME_W + FRAME_GAP, 0], ["sheet", 2 * (FRAME_W + FRAME_GAP), 0]]);
    const fx = FRAME_W + FRAME_GAP;
    expect(p.at.get("task:0")).toEqual({ x: fx + PAD, y: PAD, frameId: "f-task" });
    expect(p.at.get("task:3")!.x).toBe(fx + PAD + 3 * (COL_W + GAP));
    expect(p.at.get("task:4")).toEqual({ x: fx + PAD, y: PAD + 120 + GAP, frameId: "f-task" });
    expect(p.newFrames[1].h).toBe(PAD + 120 + GAP + 120 + PAD);
    expect(p.newFrames[0].h).toBe(MIN_H);
    expect(p.grow).toEqual([]);
  });
  it("มีกรอบแล้ว: ต่อใต้การ์ดล่างสุดในกรอบ (ไม่ขยับการ์ดเดิม) · กรอบสูงขึ้น · หมวดที่ขาดวางขวาของกรอบเดิม", () => {
    const b = readWorkBoard([frame("F1", "plan", 100, 50, 300), ...card("g1", "team_plan", "p1", 130, 80, 300, 200)]);
    const p = planPlacement(b, [{ wk: "plan", key: "plan:p2", w: 300, h: 150 }, { wk: "sheet", key: "sheet:s1", w: 240, h: 100 }], { newId });
    expect(p.at.get("plan:p2")).toEqual({ x: 100 + PAD, y: 280 + GAP, frameId: "F1" });
    expect(p.grow).toEqual([{ id: "F1", h: 280 + GAP + 150 + PAD - 50 }]);
    expect(p.newFrames.map((f) => [f.wk, f.x, f.y])).toEqual([["sheet", 100 + FRAME_W + FRAME_GAP, 50]]);
  });
  it("มีของอื่นบนกระดาน ไม่มีกรอบ = กรอบแรกวางขวาของทุกอย่าง", () => {
    const p = planPlacement(readWorkBoard([...card("g", "sku", "x", -500, 200, 300, 100)]), [{ wk: "plan", key: "plan:a", w: 300, h: 100 }], { newId });
    expect(p.newFrames.map((f) => [f.wk, f.x, f.y])).toEqual([["plan", -200 + FRAME_GAP, 200]]);
  });
  it("ขนาดการ์ดจาก skeleton", () => {
    expect(skelSize([{ x: 0, y: 0, width: 240, height: 90 }, { x: 10, y: 80, width: 220, height: 40 }, { type: "text", x: 14, y: 14 }])).toEqual({ w: 240, h: 120 });
  });
  it("ชื่อกรอบมีตัวเลขสด · ไม่มีเกิน = ไม่ขึ้นคำว่าเกิน", () => {
    expect(frameName("task", { total: 31, overdue: 8 })).toBe("งาน Task · ค้าง 31 · เกิน 8");
    expect(frameName("plan", { total: 4, overdue: 0 })).toBe("แผนทีม · ค้าง 4");
    expect(frameName("sheet")).toBe("ใบงานออกแบบ");
  });
});

describe("งานที่ปิดแล้ว", () => {
  const els = [...card("g1", "task", "t1", 0, 0), ...card("g2", "task", "t2", 400, 0, 300, 100, { opacity: DONE_OPACITY }), ...card("g3", "design_sheet", "s1", 800, 0), ...card("g4", "task", "t9", 0, 300, 300, 100, { opacity: DONE_OPACITY })];
  const board = readWorkBoard(els);
  const state = (wk: string, id: string) => (id === "t1" || id === "s1" ? "done" : id === "t2" ? "open" : "unknown") as "open" | "done" | "unknown";
  it("ปิด = จาง · กลับมาค้าง = ชัด · ไม่รู้สถานะ = ไม่ยุ่ง", () => {
    const p = fadePatches(els, board, state);
    expect(p.get("g1-r")).toEqual({ opacity: DONE_OPACITY });
    expect(p.get("g2-t")).toEqual({ opacity: 100 });
    expect(p.has("g4-r")).toBe(false);
  });
  it("เก็บการ์ดที่เสร็จ — ข้ามใบที่ผูกกับงานแผนที่ยังไม่เสร็จ", () => {
    const r = doneCards(board, state, new Set(["design_sheet:s1"]));
    expect(r.take.map((c) => c.key)).toEqual(["task:t1"]);
    expect(r.skipped).toBe(1);
  });
});
