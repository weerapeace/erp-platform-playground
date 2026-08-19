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

// ---- snap เข้าช่อง + สรุปค่าแรงต่อโต๊ะ ----
import { layoutDesks, slotPos, frameHeight, CARD_W, FRAME_W } from "../work-board-canvas";

const card = (id: string, kind: string, frameId: string, x: number, y: number, qty: number, labor: number): CanvasEl[] => ([
  { id: `${id}-r`, type: "rectangle", frameId, groupIds: [`g-${id}`], x, y, width: CARD_W, height: 88, customData: { kind, id, qty, labor } },
  { id: `${id}-t`, type: "text", frameId, groupIds: [`g-${id}`], x: x + 74, y: y + 12, customData: { kind, id, qty, labor } },
]);

describe("layoutDesks", () => {
  const frame: CanvasEl = { id: "f1", type: "frame", name: "โต๊ะขาล", x: 100, y: 200, width: FRAME_W, height: 500, customData: { kind: "wb_desk", id: "d1" } };
  const s0 = slotPos(100, 200, 0), s1 = slotPos(100, 200, 1);

  it("การ์ดที่โยนเข้ามามั่ว ๆ ถูกจัดเข้าช่อง (snap) ตามลำดับบน→ล่าง ซ้าย→ขวา", () => {
    const els = [frame, ...card("a", "wb_plan", "f1", 137, 411, 10, 100), ...card("b", "wb_plan", "f1", 900, 260, 5, 50)];
    const { moves } = layoutDesks(els, DEPTS);
    const byId = new Map(moves.map((m) => [m.id, m]));
    // b อยู่สูงกว่า → ได้ช่องแรก · a ได้ช่องสอง
    expect(byId.get("b-r")).toMatchObject({ x: s0.x, y: s0.y });
    expect(byId.get("a-r")).toMatchObject({ x: s1.x, y: s1.y });
  });

  it("ขยับทั้งใบ (ทุก element ในกลุ่มเลื่อนเท่ากัน) ไม่ใช่แค่กรอบการ์ด", () => {
    const els = [frame, ...card("a", "wb_plan", "f1", 137, 411, 10, 100)];
    const { moves } = layoutDesks(els, DEPTS);
    const r = moves.find((m) => m.id === "a-r")!, t = moves.find((m) => m.id === "a-t")!;
    expect(t.x - r.x).toBe(74);
    expect(t.y - r.y).toBe(12);
  });

  it("การ์ดที่อยู่ตรงช่องอยู่แล้ว ไม่ต้องขยับ (กันบันทึกวนไม่จบ)", () => {
    const els = [frame, ...card("a", "wb_plan", "f1", s0.x, s0.y, 10, 100)];
    expect(layoutDesks(els, DEPTS).moves).toEqual([]);
  });

  it("สรุปจำนวน/ค่าแรงแยกแผนกับของจริง + ความสูงกรอบพอดีจำนวนการ์ด", () => {
    const els = [frame, ...card("a", "wb_plan", "f1", s0.x, s0.y, 10, 100), ...card("w", "wb_real", "f1", s1.x, s1.y, 4, 40)];
    const f = layoutDesks(els, DEPTS).frames.find((x) => x.id === "f1")!;
    expect(f).toMatchObject({ deptId: "d1", cards: 2, planQty: 10, planLabor: 100, realQty: 4, realLabor: 40 });
    expect(f.height).toBe(frameHeight(2));
  });

  it("กรอบสูงพอดีอยู่แล้ว = ไม่ส่ง height มาแก้ (กันบันทึกวนไม่จบ)", () => {
    const fitted = { ...frame, height: frameHeight(1) };
    const els = [fitted, ...card("a", "wb_plan", "f1", s0.x, s0.y, 10, 100)];
    expect(layoutDesks(els, DEPTS).frames[0].height).toBeUndefined();
  });

  it("หัวกรอบมียอดต่อท้ายแล้ว ยังจับคู่โต๊ะได้จากชื่อ (กรอบที่ผู้ใช้วาดเอง)", () => {
    const drawn: CanvasEl = { id: "f9", type: "frame", name: "โต๊ะแต๋ว · แผน 10 ชิ้น ฿100", x: 0, y: 0, width: FRAME_W, height: 300 };
    const els = [drawn, ...card("a", "wb_plan", "f9", 5, 5, 10, 100)];
    const f = layoutDesks(els, DEPTS).frames.find((x) => x.id === "f9")!;
    expect(f.deptId).toBe("d2");
    expect(f.stampDesk).toBe(true);   // ควรประทับ customData ให้ถาวร
  });
});

describe("layoutDesks — โยนการ์ดเข้ากรอบ (adopt)", () => {
  const f1: CanvasEl = { id: "f1", type: "frame", name: "โต๊ะขาล", x: 0, y: 0, width: FRAME_W, height: frameHeight(1), customData: { kind: "wb_desk", id: "d1" } };
  const f2: CanvasEl = { id: "f2", type: "frame", name: "โต๊ะแต๋ว", x: 2000, y: 0, width: FRAME_W, height: frameHeight(1), customData: { kind: "wb_desk", id: "d2" } };

  it("การ์ดที่จุดกึ่งกลางตกอยู่ในกรอบ ถูกผูกเข้ากรอบให้เอง แม้ Excalidraw ยังไม่ผูก (การ์ดล้นขอบ)", () => {
    // วางคร่อมขอบล่างกรอบ f1 แต่จุดกึ่งกลางยังอยู่ในกรอบ · frameId ยังว่าง
    const cy = frameHeight(1) - 50;
    const els = [f1, f2, ...card("a", "wb_plan", "", 20, cy, 10, 100)];
    const { adopts, moves, planDesk } = layoutDesks(els, DEPTS);
    expect(adopts.map((x) => x.frameId)).toEqual(["f1", "f1"]);      // ทั้งกรอบการ์ดและข้อความ
    expect(planDesk.get("a")).toBe("d1");                            // เขียนกลับเข้าแผนว่าอยู่โต๊ะขาล
    expect(moves.find((m) => m.id === "a-r")).toMatchObject(slotPos(0, 0, 0));   // แล้วจัดเข้าช่องด้วย
  });

  it("การ์ดที่ลอยนอกกรอบทุกใบ = ไม่ผูก ไม่ขยับ ไม่แตะแผน", () => {
    const els = [f1, f2, ...card("a", "wb_plan", "", 1200, 900, 10, 100)];
    const { adopts, moves, planDesk } = layoutDesks(els, DEPTS);
    expect(adopts).toEqual([]);
    expect(moves).toEqual([]);
    expect(planDesk.has("a")).toBe(false);
  });

  it("การ์ดที่ Excalidraw ผูกกรอบให้แล้ว ไม่ต้องผูกซ้ำ", () => {
    const els = [f1, ...card("a", "wb_plan", "f1", slotPos(0, 0, 0).x, slotPos(0, 0, 0).y, 10, 100)];
    expect(layoutDesks(els, DEPTS).adopts).toEqual([]);
  });

  it("ลากข้ามไปกรอบอีกโต๊ะ (Excalidraw ผูกให้แล้ว) → planDesk บอกโต๊ะใหม่", () => {
    const els = [f1, f2, ...card("a", "wb_plan", "f2", 2020, 60, 10, 100)];
    expect(layoutDesks(els, DEPTS).planDesk.get("a")).toBe("d2");
  });
});
