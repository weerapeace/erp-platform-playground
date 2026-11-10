import { describe, expect, it } from "vitest";
import { planCostingSend, type ExistingCostLine } from "@/lib/pattern-costing";
import { costLineFromItem, recomputeCostLine, type CostItemLike } from "@/lib/design-sheet-cost-row";
import { cleanProjectPieces, projectPatternLines, NO_MATERIAL, type ProjectPiece } from "@/lib/pattern-project";
import { patternPieces } from "@/lib/pattern-sheet";
import type { Shape } from "@/lib/pattern-shape";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 5, y: 7, w, h });
const piece = (pid: string, w: number, h: number, extra: Partial<ProjectPiece> = {}): ProjectPiece =>
  cleanProjectPieces([{ pid, name: `ชิ้น ${pid}`, count: 2, allow: 1, shape: R(w, h), holes: [], notches: [], at: [5, 7], ...extra }])[0];
// วัสดุคิดแบบ พื้นที่ ÷ หน้ากว้าง ÷ ตัวหาร (ผ้า) และแบบชิ้นสำเร็จ (ราคาต่อ cm²)
const fabric: CostItemLike = { id: "11111111-1111-1111-1111-111111111111", name: "ผ้าแคนวาส", price_per_unit: 120, uom: "หลา", face_width_cm: 150, width_cm: null, length_cm: null, group_name: "ผ้า", group_code: "fabric", calc_method: "area_face", loss_percent: 10, divisor: 90, uom_default: "หลา" };
const sheetMat: CostItemLike = { id: "22222222-2222-2222-2222-222222222222", name: "แผ่นเสริม", price_per_unit: 100, uom: "แผ่น", face_width_cm: null, width_cm: 100, length_cm: 100, group_name: "ตัวเสริม", group_code: "reinforce", calc_method: null, loss_percent: 0, divisor: null, uom_default: null };
const items = new Map([[fabric.id, fabric], [sheetMat.id, sheetMat]]);
const asExisting = (rows: ReturnType<typeof planCostingSend>["inserts"], startId = 1): ExistingCostLine[] => rows.map((r, i) => ({ ...r, id: `row${startId + i}` }));

describe("ส่งชิ้นไปตีราคา (planCostingSend)", () => {
  it("ชิ้นที่เลือกวัสดุ: 1 ชิ้น × 1 วัสดุ = 1 บรรทัด · ขนาด = ขนาดตัดรวมเผื่อ · คิดปริมาณ/เงินด้วยสูตรของวัสดุ", () => {
    const p = piece("a", 30, 20, { mats: [{ id: fabric.id, name: fabric.name }, { id: sheetMat.id, name: sheetMat.name }] });
    const plan = planCostingSend([p], "box", [], null, items);
    expect(plan.inserts).toHaveLength(2);
    expect(plan.updates).toHaveLength(0);
    const [f, s] = plan.inserts;
    expect([f.width_cm, f.length_cm, f.pieces, f.item_id, f.calc_method]).toEqual([32, 22, 2, fabric.id, "area_face"]);
    expect(f.qty).toBeCloseTo((32 * 22 * 2 * 1.1) / 150 / 90, 4);       // พื้นที่ × เผื่อเสีย ÷ หน้ากว้าง ÷ ตัวหาร
    expect(f.amount).toBeCloseTo(Math.round(f.qty! * 120 * 100) / 100, 2);
    expect([s.uom, s.unit_price]).toEqual(["cm²", 0.01]);               // ชนิดชิ้น: ราคาแผ่น ÷ พื้นที่แผ่น
    expect(s.qty).toBeCloseTo(32 * 22 * 2, 4);
    expect(f.shape.pid).toBe("a");
    expect(f.shape.name).toBe("ชิ้น a");
    expect(f.shape.shape).toMatchObject({ k: "rect", x: 0, y: 0, w: 30, h: 20 });   // รูปเลื่อนมาเริ่มที่ 0,0
    expect(f.shape.at).toEqual([5, 7]);
    expect([f.sort_order, s.sort_order]).toEqual([1, 2]);
    expect(plan.amount).toBeCloseTo((f.amount ?? 0) + (s.amount ?? 0), 2);
  });
  it("ยังไม่เลือกวัสดุ → บรรทัดเปล่า ไม่มีราคา · นับเป็นชิ้นที่ยังไม่มีวัสดุ", () => {
    const plan = planCostingSend([piece("a", 10, 10)], "box", [], "PARENT-1", items);
    expect(plan.noMaterial).toBe(1);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({ item_id: null, item_name: null, unit_price: null, amount: null, parent_code: "PARENT-1", width_cm: 12, length_cm: 12 });
  });
  it("ส่งซ้ำ = อัปเดตบรรทัดเดิม ไม่เพิ่มซ้ำ · ราคาที่แก้ไว้ในตีราคาอยู่ต่อ · บรรทัดอื่นของใบงานไม่ถูกแตะ", () => {
    const p = piece("a", 30, 20, { mats: [{ id: fabric.id, name: fabric.name }] });
    const first = planCostingSend([p], "box", [], null, items);
    const other: ExistingCostLine = { ...first.inserts[0], id: "other", shape: null, item_id: "x", sort_order: 9 };
    const edited = asExisting(first.inserts).map((r) => ({ ...r, unit_price: 200 }));   // ผู้ใช้แก้ราคาในตีราคา
    const bigger = { ...p, shape: R(40, 20) };
    const again = planCostingSend([bigger], "box", [...edited, other], null, items);
    expect(again.inserts).toHaveLength(0);
    expect(again.updates).toHaveLength(1);
    expect(again.updates[0].id).toBe("row1");
    expect(again.updates[0].patch.width_cm).toBe(42);
    expect(again.updates[0].patch.amount).toBeCloseTo(Math.round(((42 * 22 * 2 * 1.1) / 150 / 90) * 200 * 100) / 100, 2);
    expect(again.updates[0].patch).not.toHaveProperty("unit_price");
    expect(again.stale).toBe(0);
  });
  it("ส่งคนละแท็บ = ไม่จับคู่กับบรรทัดของแท็บอื่น", () => {
    const p = piece("a", 30, 20, { mats: [{ id: fabric.id, name: fabric.name }] });
    const first = planCostingSend([p], "box", [], null, items);
    const plan = planCostingSend([p], "box", asExisting(first.inserts), "SIZE-L", items);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts[0].sort_order).toBe(2);
  });
  it("เคยส่งตอนยังไม่มีวัสดุ แล้วมาเลือกวัสดุในแอป → เติมวัสดุให้บรรทัดเปล่าเดิม ไม่เพิ่มบรรทัด", () => {
    const blank = planCostingSend([piece("a", 30, 20)], "box", [], null, items);
    const withMat = piece("a", 30, 20, { mats: [{ id: fabric.id, name: fabric.name }] });
    const plan = planCostingSend([withMat], "box", asExisting(blank.inserts), null, items);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates[0].patch).toMatchObject({ item_id: fabric.id, item_name: "ผ้าแคนวาส", unit_price: 120, calc_method: "area_face" });
    expect(plan.updates[0].patch.amount).toBeGreaterThan(0);
  });
  it("ยังไม่มีวัสดุในแอป แต่เลือกวัสดุในตีราคาไปแล้ว → ส่งซ้ำอัปเดตขนาดทุกบรรทัดของชิ้น ไม่เพิ่มบรรทัดเปล่า", () => {
    const blank = planCostingSend([piece("a", 30, 20)], "box", [], null, items);
    const picked = asExisting(blank.inserts).map((r) => ({ ...r, item_id: fabric.id, item_name: fabric.name, calc_method: "area_face", face_width_cm: 150, divisor: 90, unit_price: 120 }));
    const plan = planCostingSend([{ ...piece("a", 30, 20), count: 4 }], "box", picked, null, items);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].patch.pieces).toBe(4);
  });
  it("เอาวัสดุออกจากชิ้น → บรรทัดเดิมของวัสดุนั้นไม่ถูกลบ นับเป็นบรรทัดค้าง · วัสดุที่หายจากรายการ = ส่งเป็นชื่ออย่างเดียว", () => {
    const two = piece("a", 30, 20, { mats: [{ id: fabric.id, name: fabric.name }, { id: sheetMat.id, name: sheetMat.name }] });
    const first = planCostingSend([two], "box", [], null, items);
    const one = piece("a", 30, 20, { mats: [{ id: fabric.id, name: fabric.name }] });
    expect(planCostingSend([one], "box", asExisting(first.inserts), null, items).stale).toBe(1);
    const gone = piece("b", 10, 10, { mats: [{ id: "33333333-3333-3333-3333-333333333333", name: "วัสดุเก่า" }] });
    const plan = planCostingSend([gone], "box", [], null, items);
    expect(plan.missingItems).toEqual(["วัสดุเก่า"]);
    expect(plan.inserts[0]).toMatchObject({ item_id: null, item_name: "วัสดุเก่า", amount: null });
    const resend = planCostingSend([gone], "box", asExisting(plan.inserts), null, items);
    expect([resend.inserts.length, resend.updates.length]).toEqual([0, 1]);
  });
  it("รูปอ้างอิงที่เก็บไว้กับบรรทัดเดิมไม่หายตอนอัปเดต", () => {
    const p = piece("a", 30, 20);
    const first = planCostingSend([p], "box", [], null, items);
    const withRef = asExisting(first.inserts).map((r) => ({ ...r, shape: { ...(r.shape as object), refs: [{ url: "https://x/y.png", x: 0, y: 0, w: 20, ar: 1, op: 0.5 }] } }));
    const plan = planCostingSend([p], "box", withRef, null, items);
    expect((plan.updates[0].patch.shape as { refs?: unknown[] }).refs).toHaveLength(1);
  });
});

describe("สูตรบรรทัดตีราคา (ย้ายมาจากหน้าจอ ต้องได้เลขเดิม)", () => {
  it("costLineFromItem: ผ้า = ราคาต่อหน่วยของวัสดุ · ชนิดชิ้น = ราคาต่อ cm² + จำนวน 1", () => {
    expect(costLineFromItem(fabric, 3)).toMatchObject({ item_id: fabric.id, uom: "หลา", unit_price: 120, pieces: null, waste_percent: 10, sort_order: 4, qty: null, amount: null });
    expect(costLineFromItem(sheetMat, 0)).toMatchObject({ uom: "cm²", unit_price: 0.01, pieces: 1 });
  });
  it("recomputeCostLine: คิดจากพื้นที่จริงเมื่อวาดรูปทรงแบบ area · พิมพ์เอง (ไม่มีวิธีคิด) คงปริมาณเดิม", () => {
    const base = { group_name: "ผ้า", group_code: "fabric", calc_method: "area_100", width_cm: 10, length_cm: 10, pieces: 1, face_width_cm: null, waste_percent: 0, divisor: 100, qty: null, unit_price: 50, amount: null };
    expect(recomputeCostLine(base).qty).toBe(1);
    const circle = recomputeCostLine({ ...base, shape: { v: 1 as const, basis: "area" as const, shape: { k: "ellipse" as const, x: 0, y: 0, w: 10, h: 10 } } });
    expect(circle.qty).toBeCloseTo((Math.PI * 25) / 100, 2);
    expect(recomputeCostLine({ ...base, calc_method: null, qty: 7 })).toMatchObject({ qty: 7, amount: 350 });
  });
});

describe("วัสดุของชิ้นในแอป", () => {
  it("cleanProjectPieces เก็บวัสดุ (ตัดซ้ำ/ค่าว่าง) · หน้าพิมพ์: 1 ชิ้น × 1 วัสดุ = 1 บรรทัด จัดกลุ่มวางผ้าตามวัสดุ", () => {
    const [p] = cleanProjectPieces([{ pid: "a", name: "ตัวหน้า", count: 2, allow: 0, shape: R(10, 10), mats: [{ id: "m1", name: "หนัง", group: "หนัง PU" }, { id: "m1", name: "ซ้ำ" }, { id: "", name: "x" }, { id: "m2", name: "ซับใน" }] }]);
    expect(p.mats).toEqual([{ id: "m1", name: "หนัง", group: "หนัง PU" }, { id: "m2", name: "ซับใน" }]);
    const [q] = cleanProjectPieces([{ pid: "b", name: "ก้น", count: 1, allow: 0, shape: R(10, 5) }]);
    expect(q.mats).toBeUndefined();
    const out = patternPieces(projectPatternLines([p, q]));
    expect(out.map((x) => [x.name, x.material, x.group, x.count])).toEqual([
      ["หนัง · ตัวหน้า", "หนัง", "หนัง PU", 2], ["ซับใน · ตัวหน้า", "ซับใน", "ชิ้นแพทเทิร์น", 2], ["ก้น", NO_MATERIAL, "ชิ้นแพทเทิร์น", 1],
    ]);
  });
  it("บรรทัดตีราคาเดิม (ไม่ส่งช่อง material): วัสดุ = ชื่อวัสดุของบรรทัด → ชิ้นวัสดุเดียวกันอยู่กลุ่มเดียวกัน", () => {
    const out = patternPieces([
      { item_name: "ผ้า A", width_cm: 10, length_cm: 10, shape: { v: 1, basis: "box", name: "หน้า", shape: R(10, 10) } },
      { item_name: "ผ้า A", width_cm: 5, length_cm: 5 }, { width_cm: 5, length_cm: 5 },
    ]);
    expect(out.map((x) => x.material)).toEqual(["ผ้า A", "ผ้า A", "ไม่ระบุวัสดุ"]);
  });
});
