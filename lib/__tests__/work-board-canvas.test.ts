import { describe, it, expect } from "vitest";
import { deskFrames, deskOfPlanCards, diffDeskMoves, type CanvasEl } from "../work-board-canvas";

const DEPTS = [
  { id: "d1", name: "โต๊ะขาล" },
  { id: "d2", name: "โต๊ะแต๋ว" },
];

// กระดานจำลอง: กรอบ f1=โต๊ะขาล (มี customData) · f2 ชื่อ "โต๊ะแต๋ว" เฉย ๆ · f9 กรอบที่ผู้ใช้วาดเอง
const els: CanvasEl[] = [
  { id: "f1", type: "frame", name: "โต๊ะขาล", customData: { kind: "wb_desk", id: "d1" } },
  { id: "f2", type: "frame", name: "โต๊ะแต๋ว" },
  { id: "f8", type: "frame", name: "🆕 ยังไม่ระบุโต๊ะ", customData: { kind: "wb_desk", id: "" } },
  { id: "f9", type: "frame", name: "โน้ตของหัวหน้า" },
  { id: "r1", type: "rectangle", frameId: "f1", customData: { kind: "wb_plan", id: "l1" } },
  { id: "t1", type: "text", frameId: "f1", customData: { kind: "wb_plan", id: "l1" } },
  { id: "r2", type: "rectangle", frameId: "f2", customData: { kind: "wb_plan", id: "l2" } },
  { id: "r3", type: "rectangle", frameId: null, customData: { kind: "wb_plan", id: "l3" } },   // ลอยนอกกรอบ
  { id: "r4", type: "rectangle", frameId: "f9", customData: { kind: "wb_plan", id: "l4" } },   // อยู่ในกรอบที่ไม่ใช่โต๊ะ
  { id: "r5", type: "rectangle", frameId: "f8", customData: { kind: "wb_plan", id: "l5" } },   // กองยังไม่ระบุโต๊ะ
  { id: "r6", type: "rectangle", frameId: "f2", customData: { kind: "wb_real", id: "w1" } },   // ของจริง ไม่เกี่ยว
];

describe("deskFrames", () => {
  it("อ่านโต๊ะจาก customData ก่อน แล้วค่อย fallback ชื่อกรอบ", () => {
    const m = deskFrames(els, DEPTS);
    expect(m.get("f1")).toBe("d1");
    expect(m.get("f2")).toBe("d2");     // ไม่มี customData → เทียบชื่อ
    expect(m.get("f8")).toBeNull();     // กรอบ "ยังไม่ระบุโต๊ะ"
    expect(m.has("f9")).toBe(false);    // กรอบที่ผู้ใช้วาดเอง ไม่ใช่โต๊ะ
  });
});

describe("deskOfPlanCards", () => {
  const m = deskOfPlanCards(els, DEPTS);
  it("นับเฉพาะการ์ดแผนที่อยู่ในกรอบโต๊ะที่รู้จัก", () => {
    expect(m.get("l1")).toBe("d1");
    expect(m.get("l2")).toBe("d2");
    expect(m.get("l5")).toBeNull();
  });
  it("การ์ดที่ลอยนอกกรอบ / อยู่ในกรอบที่ไม่ใช่โต๊ะ = ไม่นับ (กันเผลอล้างโต๊ะออกจากแผน)", () => {
    expect(m.has("l3")).toBe(false);
    expect(m.has("l4")).toBe(false);
  });
  it("ไม่ยุ่งกับการ์ดของจริง", () => {
    expect(m.has("w1")).toBe(false);
  });
});

describe("diffDeskMoves", () => {
  it("ใบที่เพิ่งเห็นครั้งแรก ไม่ถือว่าย้าย", () => {
    const now = new Map<string, string | null>([["l1", "d1"]]);
    expect(diffDeskMoves(now, new Map())).toEqual([]);
  });
  it("อยู่โต๊ะเดิม ไม่ต้องบันทึก", () => {
    const now = new Map<string, string | null>([["l1", "d1"]]);
    expect(diffDeskMoves(now, new Map([["l1", "d1"]]))).toEqual([]);
  });
  it("ย้ายโต๊ะ → คืนรายการที่ต้องเขียนกลับเข้าแผน", () => {
    const now = new Map<string, string | null>([["l1", "d2"], ["l2", "d2"]]);
    const seen = new Map<string, string | null>([["l1", "d1"], ["l2", "d2"]]);
    expect(diffDeskMoves(now, seen)).toEqual([{ lineId: "l1", deptId: "d2" }]);
  });
  it("ลากเข้ากอง 'ยังไม่ระบุโต๊ะ' = เอาโต๊ะออก", () => {
    const now = new Map<string, string | null>([["l1", null]]);
    const seen = new Map<string, string | null>([["l1", "d1"]]);
    expect(diffDeskMoves(now, seen)).toEqual([{ lineId: "l1", deptId: null }]);
  });
});
