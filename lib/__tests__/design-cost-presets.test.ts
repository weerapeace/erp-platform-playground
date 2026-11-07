import { describe, expect, it } from "vitest";
import {
  cleanOverheadCfg, cleanPreset, cutLaborRows, cutLaborSummary, groupCutRows, overheadRows, overheadTotal, parcelPrice, parentOfCode, pickBag, pickBox, piecesPerCarton, presetProblem,
  DEFAULT_OH, type CostPreset, type PresetKind,
} from "@/lib/design-cost-presets";
import { cleanExtra, extraKindOf } from "@/lib/design-sheet-cost-snapshot";

let seq = 0;
const P = (kind: PresetKind, x: Partial<CostPreset>): CostPreset => ({
  id: `p${++seq}`, kind, label: null, amount: 0, w_cm: null, l_cm: null, h_cm: null, max_kg: null, mode: null, sort_order: 0, ...x,
});
const bags = [P("bag", { w_cm: 25, l_cm: 35, amount: 1.2 }), P("bag", { w_cm: 40, l_cm: 50, amount: 2.2 }), P("bag", { w_cm: 30, l_cm: 40, amount: 1.5 })];
const boxes = [P("box", { w_cm: 30, l_cm: 25, h_cm: 5, amount: 8 }), P("box", { w_cm: 45, l_cm: 40, h_cm: 8, amount: 14 })];
const carton = P("carton", { w_cm: 60, l_cm: 40, h_cm: 40, amount: 150 });
const tiers = [P("parcel", { max_kg: 2, amount: 50 }), P("parcel", { max_kg: 1, amount: 35 }), P("parcel", { max_kg: 5, amount: 80 })];

describe("pickBag", () => {
  it("เลือกถุงใบเล็กสุดที่ใส่ได้ (กว้าง+หนา+2 × ยาว+หนา+2 · หมุนถุงได้)", () => {
    const r = pickBag({ w: 25, l: 33, t: 2, g: null }, bags)!;
    expect(r.needW).toBe(29);
    expect(r.needL).toBe(37);
    expect(r.bag?.w_cm).toBe(30);   // 25×35 เล็กไป → 30×40
  });
  it("ไม่มีถุงที่ใส่ได้ = bag null (หน้าจอเตือน) · ไม่มีขนาด = null", () => {
    expect(pickBag({ w: 60, l: 60, t: 1, g: null }, bags)?.bag).toBeNull();
    expect(pickBag({ w: null, l: 30, t: 1, g: null }, bags)).toBeNull();
  });
});

describe("pickBox / piecesPerCarton / parcelPrice", () => {
  it("กล่องเล็กสุดที่ใส่ได้ ไม่ว่าวางทิศไหน", () => {
    expect(pickBox({ w: 24, l: 29, t: 4, g: null }, boxes)?.amount).toBe(8);
    expect(pickBox({ w: 42, l: 36, t: 3, g: null }, boxes)?.amount).toBe(14);
    expect(pickBox({ w: 50, l: 50, t: 3, g: null }, boxes)).toBeNull();
  });
  it("ใส่ลังได้กี่ชิ้น — เลือกทิศที่ได้มากสุด", () => {
    // 42×36×3 ในลัง 60×40×40: วาง 3 ด้านสูง → 1×1×13 = 13 · หรือ ตั้ง 42 สูง 36 กว้าง 3 → floor(60/3)×floor(40/36)×floor(40/42)=0 … ได้มากสุด 13
    expect(piecesPerCarton({ w: 42, l: 36, t: 3, g: null }, carton)).toBe(13);
    expect(piecesPerCarton({ w: 70, l: 70, t: 3, g: null }, carton)).toBe(0);
  });
  it("ขนส่งรายชิ้น: น้ำหนักที่คิด = มากกว่าระหว่างจริงกับขนาด÷5000 → ขั้นแรกที่ไม่เกิน", () => {
    const p = parcelPrice({ w: 42, l: 36, t: 3, g: 500 }, tiers)!;
    expect(p.volKg).toBeCloseTo(0.907, 3);
    expect(p.chargeKg).toBeCloseTo(0.907, 3);
    expect(p.tier?.amount).toBe(35);
    expect(parcelPrice({ w: 42, l: 36, t: 3, g: 1500 }, tiers)?.tier?.amount).toBe(50);
    expect(parcelPrice({ w: null, l: null, t: null, g: null }, tiers)).toBeNull();
  });
});

describe("overheadRows", () => {
  const presets = [P("oh_fixed", { label: "QC", amount: 1 }), P("oh_fixed", { label: "แพ็ก", amount: 2 }), ...bags, ...boxes, carton, ...tiers];
  it("รวมเฉพาะรายการที่เปิด · กล่องปิดไว้ก่อน (ค่าตั้งต้น)", () => {
    const dims = { w: 30, l: 26, t: 2, g: 300 };
    const rows = overheadRows({ ...DEFAULT_OH, dims }, presets);
    expect(rows.map((r) => r.key.startsWith("fx:") ? "fx" : r.key)).toEqual(["fx", "fx", "bag", "box", "ship"]);
    expect(rows.find((r) => r.key === "box")?.on).toBe(false);
    expect(rows.find((r) => r.key === "bag")?.amount).toBe(1.5);   // ต้องการ 34×30 → ถุง 30×40 (หมุน)
    const n = piecesPerCarton(dims, carton);
    // QC 1 + แพ็ก 2 + ถุง 1.5 + ส่ง 150/n
    expect(overheadTotal(rows)).toBeCloseTo(1 + 2 + 1.5 + Math.round((150 / n) * 100) / 100, 2);
    expect(overheadRows({ ...DEFAULT_OH, dims: { w: 42, l: 36, t: 3, g: 500 } }, presets).find((r) => r.key === "bag")?.warn).toBe(true);   // ถุงใหญ่สุด 40×50 ไม่พอ 47×41
  });
  it("ไม่มีขนาด = เตือน ยอด 0 · ค่าส่งแบบรายชิ้นใช้ขั้นราคา", () => {
    const none = overheadRows(DEFAULT_OH, presets);
    expect(none.find((r) => r.key === "bag")?.warn).toBe(true);
    const parcel = overheadRows({ dims: { w: 42, l: 36, t: 3, g: 500 }, off: [], ship: "parcel" }, presets);
    expect(parcel.find((r) => r.key === "ship")?.amount).toBe(35);
    expect(overheadRows({ dims: { w: 42, l: 36, t: 3, g: 500 }, off: [], ship: "none" }, presets).some((r) => r.key === "ship")).toBe(false);
  });
});

describe("cleanPreset / cleanOverheadCfg / ชนิดค่าใช้จ่าย", () => {
  it("ล้างช่องที่ไม่ใช้กับหมวด + ตรวจช่องที่ต้องกรอก", () => {
    const bag = cleanPreset({ kind: "bag", w_cm: "30", l_cm: 40, h_cm: 9, amount: "1.5", max_kg: 3 });
    expect(bag).toMatchObject({ kind: "bag", w_cm: 30, l_cm: 40, h_cm: null, max_kg: null, amount: 1.5 });
    expect(presetProblem(cleanPreset({ kind: "other", amount: 5 }))).toBe("ใส่ชื่อรายการก่อน");
    expect(presetProblem(cleanPreset({ kind: "box", w_cm: 10, l_cm: 10 }))).toBe("ใส่ความสูงก่อน");
    expect(cleanPreset({ kind: "other", label: "ค่าบล็อก", mode: "split", amount: -3 })).toMatchObject({ mode: "split", amount: 0 });
  });
  it("ตั้งค่าโสหุ้ย: ค่าแปลก ๆ ถูกตัดทิ้ง", () => {
    expect(cleanOverheadCfg({ dims: { w: "42", l: -1, t: 3 }, off: ["bag", "bag", 5], ship: "x" })).toEqual({ dims: { w: 42, l: null, t: 3, g: null }, off: ["bag", "5"], ship: "carton" });
    expect(cleanOverheadCfg(null)).toBeNull();
  });
  it("extraKindOf: ใบเก่าดูจากชื่อ · cleanExtra เก็บ kind/note/oh", () => {
    expect(extraKindOf({ label: "ค่าแรงผลิต" })).toBe("labor");
    expect(extraKindOf({ label: "ค่าโสหุ้ย (ส่ง/QC/Packing)" })).toBe("overhead");
    expect(extraKindOf({ label: "ค่าปัก" })).toBeNull();
    const e = cleanExtra({ label: "ค่าโสหุ้ย", amount: 9, kind: "overhead", note: " อ้างอิง ", oh: { dims: { w: 10, l: 10 }, off: [], ship: "parcel" } });
    expect(e).toMatchObject({ kind: "overhead", note: "อ้างอิง", oh: { ship: "parcel" } });
    expect(cleanExtra({ label: "x", amount: 1 })).toEqual({ label: "x", amount: 1 });   // ใบเก่าหน้าตาเหมือนเดิม
  });
  it("parentOfCode", () => {
    expect(parentOfCode("BOM-CTL044-01")).toBe("CTL044");
    expect(parentOfCode("CTL112-03")).toBe("CTL112");
  });
});

describe("ค่าแรงตัดตามจำนวนชิ้น (cutLaborRows)", () => {
  const lines = [
    { key: "a", item_id: "pu", item_name: "PU", group_name: "PU", calc_method: "area_face", pieces: 1 },
    { key: "b", item_id: "lin", item_name: "ผ้าซับใน", group_name: "ผ้า", calc_method: "area_face", pieces: 2 },
    { key: "c", item_id: "zip", item_name: "หัวซิป", group_name: "อะไหล่", calc_method: "count", pieces: 1 },
    { key: "d", item_id: "tape", item_name: "กุ้น", group_name: "สาย/เทป", calc_method: "length", pieces: null },
    { key: "e", item_id: "lin", item_name: "ผ้าซับใน", group_name: "ผ้า", calc_method: "area_face", pieces: 2, cut_rate: 0.9 },
    { key: "f", item_id: null, item_name: "", group_name: null, calc_method: null, pieces: 3 },   // บรรทัดว่าง ไม่นับ
  ];
  const mat = (id: string) => ({ pu: 1, lin: 0.3 } as Record<string, number>)[id] ?? null;
  it("อะไหล่ไม่นับอัตโนมัติ · ราคา: บรรทัด → วัสดุ → กลาง · ไม่ใส่ชิ้น = 1", () => {
    const rows = cutLaborRows(lines, 0.5, mat);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c", "d", "e"]);
    expect(rows.find((r) => r.key === "c")).toMatchObject({ on: false, auto: true, amount: 0 });
    expect(rows.find((r) => r.key === "a")).toMatchObject({ rate: 1, source: "material", amount: 1 });
    expect(rows.find((r) => r.key === "d")).toMatchObject({ pieces: 1, rate: 0.5, source: "central" });
    expect(rows.find((r) => r.key === "e")).toMatchObject({ rate: 0.9, source: "line", amount: 1.8 });
    const s = cutLaborSummary(rows);
    expect(s.pieces).toBe(6);                       // 1 + 2 + 1 + 2
    expect(s.total).toBeCloseTo(1 + 0.6 + 0.5 + 1.8, 2);
    expect(s.byMaterial).toEqual([{ name: "PU", pieces: 1 }, { name: "ผ้าซับใน", pieces: 4 }, { name: "กุ้น", pieces: 1 }]);
  });
  it("ติ๊กเอง: นับอะไหล่ได้ / ไม่นับผ้าได้ · ไม่มีราคากลาง = เตือน", () => {
    const rows = cutLaborRows([{ ...lines[2], cut_skip: false }, { ...lines[1], cut_skip: true }, { key: "x", item_id: "none", item_name: "ผ้าใหม่", group_name: "ผ้า", calc_method: "area_face", pieces: 1 }], null, mat);
    expect(rows[0]).toMatchObject({ on: true, auto: false, source: "none", rate: 0 });
    expect(rows[1]).toMatchObject({ on: false, auto: false });
    expect(cutLaborSummary(rows).missingRate).toBe(2);
  });
  it("cleanExtra เก็บ cut_by", () => {
    expect(cleanExtra({ label: "ค่าแรง (ตัด/ปลอก/วาด)", amount: 4, cut_by: "pieces" })).toMatchObject({ cut_by: "pieces" });
    expect(cleanExtra({ label: "x", amount: 1, cut_by: "อื่น" })).toEqual({ label: "x", amount: 1 });
  });
});

describe("groupCutRows — วัสดุเดียวกันหลายบรรทัด = แถวเดียว", () => {
  it("รวมชิ้น/ยอด · สถานะติ๊กบางส่วน · หลายราคา", () => {
    const rows = cutLaborRows([
      { key: "1", item_id: "kw", item_name: "ผ้าขาวม้า", group_name: "ผ้า (ชิ้น)", calc_method: "area_face", pieces: 2, cut_rate: 1 },
      { key: "2", item_id: "kw", item_name: "ผ้าขาวม้า", group_name: "ผ้า (ชิ้น)", calc_method: "area_face", pieces: 1 },
      { key: "3", item_id: "kw", item_name: "ผ้าขาวม้า", group_name: "ผ้า (ชิ้น)", calc_method: "area_face", pieces: 2, cut_skip: true },
      { key: "4", item_id: "lin", item_name: "ผ้าซับใน", group_name: "ผ้า", calc_method: "area_face", pieces: 1 },
    ], 0.5, () => null);
    const g = groupCutRows(rows);
    expect(g.map((x) => x.name)).toEqual(["ผ้าขาวม้า", "ผ้าซับใน"]);
    expect(g[0]).toMatchObject({ lines: 3, lineKeys: ["1", "2", "3"], pieces: 3, amount: 2.5, on: "some", rate: null, source: "mixed", auto: false });
    expect(g[1]).toMatchObject({ lines: 1, pieces: 1, rate: 0.5, source: "central", on: "all", auto: true });
  });
});
