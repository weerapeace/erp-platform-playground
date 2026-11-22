import { describe, expect, it } from "vitest";
import { cleanTodos, makeFlowNode, nodeColor, openTodos, parseFlowScene, todoProgress, toggleTodo, TODO_MAX } from "@/lib/flowchart";

const t = (th: string) => th;

describe("กล่องรายการงาน", () => {
  it("ล้างข้อมูลดิบ: id ซ้ำ/ว่างตัดทิ้ง · by/at เก็บเฉพาะข้อที่ติ๊ก · ไม่เกิน 100 ข้อ", () => {
    const items = cleanTodos([
      { id: "a", text: "ต่อ API", done: true, by: "แอน", at: "2026-11-20T03:00:00.000Z" },
      { id: "a", text: "ซ้ำ" },
      { id: "", text: "ไม่มี id" },
      { id: "b", text: "ยังไม่ทำ", by: "แอบใส่", at: "2026-11-20T03:00:00.000Z" },
      { id: "c", text: "เวลาเพี้ยน", done: true, at: "ไม่ใช่วันที่" },
    ]);
    expect(items).toEqual([
      { id: "a", text: "ต่อ API", done: true, by: "แอน", at: "2026-11-20T03:00:00.000Z" },
      { id: "b", text: "ยังไม่ทำ" },
      { id: "c", text: "เวลาเพี้ยน", done: true },
    ]);
    expect(cleanTodos(Array.from({ length: 150 }, (_, i) => ({ id: `x${i}`, text: "ข้อ" }))).length).toBe(TODO_MAX);
    expect(cleanTodos("ไม่ใช่ array")).toEqual([]);
  });

  it("ติ๊ก = จำชื่อ+เวลา · เอาติ๊กออก = ลบชื่อ/เวลา", () => {
    const on = toggleTodo([{ id: "a", text: "ข้อ" }], "a", true, "สมชาย", "2026-11-20T00:00:00.000Z");
    expect(on[0]).toEqual({ id: "a", text: "ข้อ", done: true, by: "สมชาย", at: "2026-11-20T00:00:00.000Z" });
    expect(toggleTodo(on, "a", false, "สมชาย")[0]).toEqual({ id: "a", text: "ข้อ" });
  });

  it("ความคืบหน้า: ข้อว่างไม่นับ · ครบทุกข้อ = เขียว", () => {
    expect(todoProgress(undefined)).toEqual({ done: 0, total: 0, allDone: false });
    const items = [{ id: "a", text: "ข้อ", done: true }, { id: "b", text: "  " }];
    expect(todoProgress(items)).toEqual({ done: 1, total: 1, allDone: true });
    expect(nodeColor("todo", { label: "", items })).toBe("emerald");
    expect(nodeColor("todo", { label: "", items: [{ id: "a", text: "ข้อ" }] })).toBe("amber");
  });

  it("บันทึก/โหลดกลับ ข้อยังอยู่ · กล่องชนิดอื่นไม่เก็บ items", () => {
    const todo = makeFlowNode("todo", { x: 0, y: 0 }, t);
    expect(todo.data.label).toBe("สิ่งที่ต้องทำ");
    const s = parseFlowScene({ kind: "flowchart", nodes: [
      { ...todo, data: { label: "งานซื้อ", items: [{ id: "a", text: "ข้อแรก" }] } },
      { id: "s", type: "step", position: { x: 0, y: 0 }, width: 100, height: 40, data: { label: "x", items: [{ id: "a", text: "แอบ" }] } },
    ], edges: [] })!;
    expect(s.nodes[0].data.items).toEqual([{ id: "a", text: "ข้อแรก" }]);
    expect(s.nodes[1].data.items).toBeUndefined();
  });

  it("งานค้างทั้งผัง: เฉพาะข้อที่ยังไม่ติ๊ก เรียงกล่องบน→ล่าง", () => {
    const box = (id: string, y: number, label: string, items: { id: string; text: string; done?: boolean }[]) =>
      ({ id, type: "todo" as const, position: { x: 0, y }, data: { label, items } });
    const list = openTodos([
      box("low", 300, "ขาย", [{ id: "1", text: "ทำใบส่งของ" }]),
      box("top", 0, "ซื้อ\nรายละเอียด", [{ id: "1", text: "เสร็จแล้ว", done: true }, { id: "2", text: "ต่อ LINE" }, { id: "3", text: " " }]),
    ]);
    expect(list.map((x) => [x.nodeId, x.box, x.item.text])).toEqual([["top", "ซื้อ", "ต่อ LINE"], ["low", "ขาย", "ทำใบส่งของ"]]);
  });
});

import { DEFAULT_TODO_TAGS, cleanTodoTags, sortTodosByTag } from "@/lib/flowchart";
describe("ป้ายความด่วน + ลำดับ (2026-11-22)", () => {
  it("ติ๊กเสร็จ = ลงล่างสุด · เอาติ๊กออก = อยู่ก่อนข้อที่เสร็จ · ป้ายไม่หาย", () => {
    const items = [{ id: "a", text: "A", tag: "urgent" }, { id: "b", text: "B" }, { id: "c", text: "C", done: true }];
    const on = toggleTodo(items, "a", true, "x", "2026-11-22T00:00:00.000Z");
    expect(on.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(on[2].tag).toBe("urgent");
    expect(toggleTodo(on, "a", false, "x").map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
  it("เรียงตามความด่วน: ด่วน → ไม่ด่วน → ว่าง → ไม่ติดป้าย → เสร็จแล้ว", () => {
    const items = [{ id: "1", text: "x" }, { id: "2", text: "x", tag: "later" }, { id: "3", text: "x", tag: "urgent", done: true }, { id: "4", text: "x", tag: "urgent" }, { id: "5", text: "x", tag: "normal" }];
    expect(sortTodosByTag(items, DEFAULT_TODO_TAGS).map((i) => i.id)).toEqual(["4", "5", "2", "1", "3"]);
  });
  it("ป้ายตั้งเอง: key/ชื่อผิดทิ้ง · สีผิด = เทา · ว่าง = ค่าตั้งต้น", () => {
    expect(cleanTodoTags([{ key: "wait", label: " รอลูกค้า ", color: "amber" }, { key: "BAD KEY", label: "x" }, { key: "w2", label: "", color: "rose" }, { key: "w3", label: "y", color: "neon" }]))
      .toEqual([{ key: "wait", label: "รอลูกค้า", color: "amber" }, { key: "w3", label: "y", color: "slate" }]);
    expect(cleanTodoTags([])).toBeNull();
    const s = parseFlowScene({ kind: "flowchart", nodes: [], edges: [], todoTags: [{ key: "wait", label: "รอ", color: "cyan" }] })!;
    expect(s.todoTags).toEqual([{ key: "wait", label: "รอ", color: "cyan" }]);
  });
  it("งานค้างทั้งผัง: ด่วนขึ้นก่อน + แนบป้าย", () => {
    const list = openTodos([{ id: "n", type: "todo" as const, position: { x: 0, y: 0 }, data: { label: "G", items: [{ id: "1", text: "ไม่มีป้าย" }, { id: "2", text: "ด่วน", tag: "urgent" }] } }]);
    expect(list.map((x) => [x.item.text, x.tag?.label])).toEqual([["ด่วน", "ด่วน"], ["ไม่มีป้าย", undefined]]);
  });
});
