import { describe, expect, it } from "vitest";
import { cleanSpec, type Choice } from "./design-library";
import { calcSettingsFrom, cleanCost, DEFAULT_CALC, estimateCost, fabricAreas } from "./design-library-cost";

const ch = (code: string, name: string, source: string): Choice =>
  ({ id: code, list_key: "category", code, name, name_en: null, hex: null, config: { source }, sort_order: 0, is_active: true });
const CHOICES = [ch("body", "ตัวกระเป๋า", "swatch"), ch("lining", "ซับใน", "swatch"), ch("handle", "หูหิ้ว", "swatch"), ch("tape", "เทป", "swatch"), ch("hw", "อะไหล่", "sku"), ch("thread", "ด้าย", "color")];
const FAB = "11111111-1111-1111-1111-111111111111", HW = "22222222-2222-2222-2222-222222222222";

const spec = (extra: Record<string, unknown> = {}) => cleanSpec({
  size: { w: 30, h: 35, d: 12 }, handle: { count: 2, drop: 18, w: 3, gap: 12 },
  pins: [
    { id: "p1", x: 10, y: 10, cat: "body", note: "", pick: { kind: "sku", sku_id: FAB, code: "PU-1", name: "PU ดำ", image_key: null } },
    { id: "p2", x: 20, y: 20, cat: "body", note: "", pick: { kind: "sku", sku_id: FAB, code: "PU-1", name: "PU ดำ", image_key: null } },
    { id: "p3", x: 30, y: 30, cat: "hw", note: "", pick: { kind: "sku", sku_id: HW, code: "HW-9", name: "ห่วง", image_key: null } },
    { id: "p4", x: 40, y: 40, cat: "thread", note: "", pick: { kind: "color", code: "TH-1", name: "ด้ายดำ", hex: "#000000" } },
    { id: "p5", x: 50, y: 50, cat: "handle", note: "", pick: { kind: "same_as_body" } },
  ],
  pockets: { front: [{ id: "b1", x: 2, y: 2, w: 10, h: 10, type: "zip", note: "" }] },
  ...extra,
});

describe("ทุนประมาณ", () => {
  it("พื้นที่ผ้าจากแพทเทิร์น + ช่องหน้า 2 ชั้น", () => {
    const a = fabricAreas(spec());
    expect(a.body).toBeGreaterThan(30 * 35 * 2);            // หน้า+หลัง+ข้าง/ก้น
    expect(a.pocketsOuter).toBe(12 * 12 * 2);
    expect(a.handle).toBeGreaterThan(0);
    expect(a.clamped).toBe(false);
    expect(fabricAreas(spec({ size: { w: 80, h: 35, d: 12 } })).clamped).toBe(true);   // เกินขอบเขตแม่แบบทรง = ประมาณ
  });
  it("ผ้าตัวรวมจุดซ้ำ + รวมหู (ใช้ผ้าเดียวกับตัว) · ราคา SKU · ด้ายไม่มีราคา = ขาดราคา", () => {
    const e = estimateCost(spec(), CHOICES, { materials: { [FAB]: { code: "PU-1", name: "PU ดำ", uom: "หลา", face_width_cm: 140 } }, prices: { [FAB]: 120, [HW]: 8 } });
    expect(e.lines.map((l) => l.key)).toEqual(["area:body", "pin:p3", "pin:p4"]);
    const fab = e.lines[0];
    expect(fab.detail).toContain("รวมหู");
    expect(fab.detail).toContain("หน้า 140");
    expect(fab.qty).toBeGreaterThan(0);
    expect(fab.priceSource).toBe("sku");
    expect(fab.amount).toBeCloseTo(fab.qty * 120, 3);
    expect(e.lines[1].amount).toBe(8);
    expect(e.missing).toBe(1);
    expect(e.total).toBeCloseTo(e.materials, 2);
  });
  it("แก้จำนวน/ราคาเอง + ค่าแรง + ค่าอื่น", () => {
    const cost = cleanCost({ qty: { "pin:p3": 4 }, price: { "code:TH-1": 2.5 }, labor: 60, extras: [{ label: "ค่าขนส่ง", amount: 10 }, { label: "", amount: 0 }] });
    expect(cost.extras).toHaveLength(1);
    const e = estimateCost(spec(), CHOICES, { materials: {}, prices: { [HW]: 8 }, cost });
    expect(e.lines[1].qty).toBe(4);
    expect(e.lines[1].amount).toBe(32);
    expect(e.lines[2].priceSource).toBe("manual");
    expect(e.labor).toBe(60);
    expect(e.total).toBeCloseTo(e.materials + 70, 2);
  });
  it("ไม่มีสิทธิ์ดูราคา (prices ว่าง) ยังได้ปริมาณครบ", () => {
    const e = estimateCost(spec(), CHOICES, { materials: {}, prices: {} });
    expect(e.lines[0].qty).toBeGreaterThan(0);
    expect(e.materials).toBe(0);
  });
  it("หูมีผ้าของตัวเอง = แยกบรรทัด · เทปคิดตามรอบปาก", () => {
    const s = spec(); s.pins[4] = { ...s.pins[4], pick: { kind: "sku", sku_id: HW, code: "WEB-1", name: "สายแบน", image_key: null } };
    s.pins.push({ id: "p6", x: 1, y: 1, cat: "tape", note: "", pick: null });
    const e = estimateCost(s, CHOICES, { materials: {}, prices: {} });
    expect(e.lines.find((l) => l.key === "area:handle")).toBeTruthy();
    expect(e.lines[0].detail).not.toContain("รวมหู");
    expect(e.lines.find((l) => l.key === "pin:p6")?.detail).toContain("84 ซม.");
  });
  it("ค่าคิดผ้าจาก bom_calc_settings", () => {
    expect(calcSettingsFrom([{ material_type: "ผ้าซับใน", default_face_width_cm: 110, loss_percent: 15, uom: "หลา", cm_per_unit: 91.44 }]).lining.face).toBe(110);
    expect(calcSettingsFrom([]).outer).toEqual(DEFAULT_CALC.outer);
  });
});
