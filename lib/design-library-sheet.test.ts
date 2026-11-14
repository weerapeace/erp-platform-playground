import { describe, expect, it } from "vitest";
import { cleanSpec, type Choice } from "./design-library";
import { estimateCost } from "./design-library-cost";
import { chosenRenders } from "./design-library";
import { colorKeyPrefix, costGroupOf, productReadiness, mergeColorTables, recipeColorTable, recipeCostRows, recipePagePins, sheetDetailHtml, specPageTitle, type RenderRow } from "./design-library-sheet";
import { cleanSpecColors } from "./design-sheet-spec-colors";
import { recomputeCostLine } from "./design-sheet-cost-row";

const ch = (list_key: Choice["list_key"], code: string, name: string, config: Record<string, unknown> = {}, hex: string | null = null): Choice =>
  ({ id: `${list_key}-${code}`, list_key, code, name, name_en: null, hex, config, sort_order: 0, is_active: true });
const CHOICES = [ch("category", "body", "ตัวกระเป๋า", { source: "swatch" }), ch("category", "handle", "หูหิ้ว / สาย", { source: "swatch" }), ch("category", "hw", "อะไหล่", { hw: true, source: "sku" }),
  ch("category", "thread", "ด้ายเย็บ", { source: "color" }), ch("category", "logo", "โลโก้", { source: "logo", cost_group: "โลโก้/ป้าย" }), ch("hw_color", "GD", "ทอง", {}, "#d4af37"), ch("hw_color", "SV", "เงิน", {}, "#c0c0c0")];
const FAB = "11111111-1111-1111-1111-111111111111", FAB2 = "33333333-3333-3333-3333-333333333333", HW = "22222222-2222-2222-2222-222222222222";
const sw = (sku: string, code: string) => ({ kind: "swatch", swatch_id: "44444444-4444-4444-4444-444444444444", swatch_name: "แผง A", image_key: "sw/a.jpg", image_w: 100, image_h: 100, x: 10, y: 20, w: 30, h: 40, sku_id: sku, code, name: `ผ้า ${code}` });

const spec = () => cleanSpec({
  size: { w: 30, h: 35, d: 12 }, handle: { count: 2, drop: 18, w: 3, gap: 12 }, hw_color: "GD",
  pins: [
    { id: "p1", x: 10, y: 10, cat: "body", note: "", pick: sw(FAB, "PU-1") },
    { id: "p2", x: 20, y: 20, cat: "body", note: "ด้านหลัง", pick: sw(FAB, "PU-1") },
    { id: "p3", x: 30, y: 30, cat: "hw", note: "", pick: { kind: "sku", sku_id: HW, code: "HW-9", name: "ห่วง", image_key: "hw.jpg" } },
    { id: "p4", x: 40, y: 40, cat: "thread", note: "", pick: { kind: "color", code: "TH-1", name: "ด้ายดำ", hex: "#000000" } },
    { id: "p5", x: 50, y: 50, cat: "handle", note: "", pick: { kind: "same_as_body" } },
  ],
  colorways: [{ id: "cwred", name: "แดง", hw_color: "SV", picks: { p1: sw(FAB2, "PU-RED") } }],
});
const MATS = { [FAB]: { code: "PU-1", name: "PU", uom: "หลา", face_width_cm: 140 }, [FAB2]: { code: "PU-RED", name: "PU แดง", uom: "m", face_width_cm: 150 } };

describe("ตารางสีใบงาน", () => {
  it("แถว = จุด (หมวดซ้ำมีเลข) + สีอะไหล่ · คอลัมน์ = สีหลัก + ชุดสี · ใช้ผ้าตัว = โชว์ผ้าตัวของชุดสีนั้น", () => {
    const t = recipeColorTable(spec(), CHOICES);
    expect(t.rows.map((r) => r.name)).toEqual(["ตัวกระเป๋า 1", "ตัวกระเป๋า 2", "อะไหล่", "ด้ายเย็บ", "หูหิ้ว / สาย", "สีอะไหล่ทั้งใบ"]);
    expect(t.colorways.map((c) => c.name)).toEqual(["สีหลัก", "แดง"]);
    const [main, red] = t.colorways;
    expect(main.cells["p-p1"].source).toBe("swatch");
    expect(main.cells["p-p1"].crop).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(main.cells["p-p3"].sku_code).toBe("HW-9");
    expect(main.cells["p-p4"]).toMatchObject({ source: "dict", hex: "#000000" });
    expect(main.cells["hw-color"].name).toBe("ทอง");
    expect(red.cells["p-p1"].sku_code).toBe("PU-RED");
    expect(red.cells["p-p5"].sku_code).toBe("PU-RED");       // หูใช้ผ้าตัว → ผ้าแดง
    expect(main.cells["p-p5"].sku_code).toBe("PU-1");
    expect(red.cells["hw-color"].name).toBe("เงิน");
    expect(cleanSpecColors(t)).toEqual(t);                    // ผ่านตัวทำความสะอาดของใบงานไม่เสีย
  });
  it("จุดที่ยังไม่เลือกหมวด/วัสดุ = ไม่มีแถวว่าง (เจอในสูตรจริง TOTE-001)", () => {
    const s = cleanSpec({ ...spec(), hw_color: null, colorways: [], pins: [...spec().pins.slice(0, 1), { id: "px", x: 1, y: 1, cat: "", note: "", pick: null }] });
    const t = recipeColorTable(s, CHOICES);
    expect(t.rows.map((r) => r.name)).toEqual(["ตัวกระเป๋า"]);
    expect(recipeColorTable(cleanSpec({ ...s, pins: [s.pins[1]] }), CHOICES)).toEqual({ rows: [], colorways: [] });
  });
  it("รวมเข้าตารางเดิม: แถวชื่อตรงใช้ร่วม · ส่งซ้ำแทนคอลัมน์เดิม (จำด้วยรหัส แม้เปลี่ยนชื่อ) · ของเดิมไม่หาย · ชื่อชนเท่านั้นที่ต่อท้ายสูตร", () => {
    const existing = cleanSpecColors({ rows: [{ key: "r1", name: "อะไหล่" }, { key: "r2", name: "ซับใน" }], colorways: [{ key: "c1", name: "แดง", cells: { r2: { source: "pick", name: "ครีม" } } }] });
    const inc = recipeColorTable(spec(), CHOICES);
    const pre = colorKeyPrefix("abcdef12-3456-7890-abcd-ef1234567890");
    expect(pre).toBe("dlabcdef12-");
    const once = mergeColorTables(existing, inc, "TOTE-01 สูตร #3", pre);
    expect(once.rows.filter((r) => r.name === "อะไหล่")).toHaveLength(1);
    expect(once.rows.find((r) => r.name === "ซับใน")).toBeTruthy();
    expect(once.colorways.map((c) => c.name)).toEqual(["แดง", "สีหลัก", "แดง · TOTE-01 สูตร #3"]);
    expect(once.colorways[1].key).toBe("dlabcdef12-main");
    expect(once.colorways[1].cells.r1.sku_code).toBe("HW-9");  // แถว "อะไหล่" เดิม
    once.colorways[1].name = "เขียวใบตอง";                       // ผู้ใช้เปลี่ยนชื่อในใบงาน
    const twice = mergeColorTables(once, inc, "TOTE-01 สูตร #3", pre);
    expect(twice.colorways).toHaveLength(3);
    expect(twice.colorways[1].name).toBe("เขียวใบตอง");
    expect(twice.rows).toHaveLength(once.rows.length);
    expect(twice.colorways[0].cells.r2.name).toBe("ครีม");
    expect(mergeColorTables({ rows: [], colorways: [] }, inc, "x", pre).colorways.map((c) => c.name)).toEqual(["สีหลัก", "แดง"]);   // ใบใหม่ = ชื่อสะอาด
  });
});

describe("หน้ารายละเอียดงาน + ตีราคา", () => {
  const est = estimateCost(spec(), CHOICES, { materials: MATS, prices: { [FAB]: 120 }, cost: { qty: { "pin:p4": 2 }, price: {}, labor: 0, extras: [] } });
  it("หมุด: ตำแหน่งเดิม · SKU · จำนวน · จุดซ้ำ/ใช้ผ้าตัว = โน้ตรวมที่ไหน", () => {
    const pins = recipePagePins(spec(), CHOICES, est.lines);
    expect(pins).toHaveLength(5);
    expect(pins[0]).toMatchObject({ x: 10, y: 10, part_name: "ตัวกระเป๋า", sku_id: FAB, sku_code: "PU-1", uom: "หลา" });
    expect(pins[0].qty).toBeGreaterThan(0);
    expect(pins[1].qty).toBeNull();
    expect(pins[1].note).toContain("รวมจำนวนในจุดที่ 1");
    expect(pins[1].note).toContain("ด้านหลัง");
    expect(pins[3]).toMatchObject({ sku_id: null, qty: 2 });
    expect(pins[3].note).toContain("TH-1 ด้ายดำ");
    expect(pins[4].note).toContain("รวมจำนวนในผ้าตัวกระเป๋า");
  });
  it("บรรทัดตีราคา: ผ้า = area_face ที่ใบงานคิดได้เลขเดียวกัน · แก้จำนวนเอง = ตายตัว · ชนิดวัสดุตามชื่อใบงาน", () => {
    const rows = recipeCostRows(est.lines, CHOICES, "TOTE-01 สูตร #3");
    const fab = rows[0];
    expect(fab).toMatchObject({ calc_method: "area_face", group_name: "ผ้า", width_cm: 140, face_width_cm: 140, divisor: 91.44, item_sku_code: "PU-1", unit_price: 120 });
    expect(fab.qty).toBeCloseTo(est.lines[0].qty, 2);
    expect(recomputeCostLine({ ...fab, shape: null }).amount).toBe(fab.amount);   // หน้าใบงานคิดซ้ำได้ยอดเดิม
    const hw = rows.find((r) => r.item_sku_code === "HW-9")!;
    expect(hw).toMatchObject({ calc_method: "count", pieces: 1, group_name: "อะไหล่", unit_price: null });
    const th = rows.find((r) => r.item_name === "ด้ายดำ")!;
    expect(th).toMatchObject({ calc_method: null, qty: 2, group_name: null });
    expect(th.note).toContain("จาก Design Library TOTE-01 สูตร #3");
  });
  it("ผ้าขายเป็นเมตร (ชุดสีแดง) = หาร 100 · ชนิดวัสดุตั้งทับได้จากหมวด", () => {
    const red = estimateCost({ ...spec(), pins: spec().pins.map((p) => (p.id === "p1" ? { ...p, pick: sw(FAB2, "PU-RED") as never } : p)) }, CHOICES, { materials: MATS, prices: {} });
    const r = recipeCostRows(red.lines, CHOICES, "x")[0];
    expect(r).toMatchObject({ divisor: 100, uom: "m", width_cm: 150 });
    expect(costGroupOf(CHOICES, "logo")).toBe("โลโก้/ป้าย");
    expect(costGroupOf(CHOICES, "thread")).toBeNull();
  });
});

describe("อื่น ๆ", () => {
  it("รอบ 6: รูปที่ใช้ = ติดดาวต่อชุดสี (ใหม่ก่อน) · ไม่มีดาว = รูปล่าสุด · สีหลักก่อน", () => {
    const r = (id: string, day: number, colorway_id: string | null, is_starred = false): RenderRow => ({ id, view_key: "other", version: 1, image_key: `${id}.png`, colorway_id, created_at: `2026-11-1${day}`, is_starred });
    const rows = [r("a", 1, null, true), r("b", 3, null), r("c", 2, null, true), r("d", 1, "cwred"), r("e", 4, "cwred")];
    expect(chosenRenders(rows).map((x) => x.id)).toEqual(["c", "a", "e"]);
    expect(chosenRenders(rows, "cwred").map((x) => x.id)).toEqual(["e"]);
    expect(chosenRenders(rows, null).map((x) => x.id)).toEqual(["c", "a"]);
    expect(chosenRenders([], null)).toEqual([]);
  });
  it("ชื่อหน้า + รายละเอียดใบใหม่ (escape)", () => {
    expect(specPageTitle("TOTE-01", 3, "แดง")).toBe("Design Library · TOTE-01 สูตร #3 · แดง");
    const h = sheetDetailHtml({ recipeId: "abc", tag: "TOTE-01 สูตร #3", templateName: "<b>โท้ท</b>", size: { w: 30, h: 35, d: 12, strap: 0 }, colorways: ["สีหลัก", "แดง"], note: null });
    expect(h).toContain("/master/design-library/recipe/abc");
    expect(h).toContain("&lt;b&gt;");
    expect(h).toContain("สีหลัก · แดง");
  });
});

describe("เปลี่ยนเป็นสินค้าจริง", () => {
  it("ความพร้อม: จำนวนสี = จำนวน SKU · วัสดุผูกรหัส · ใช้ผ้าตัวไม่นับว่าขาดรหัส · ด้ายสี = ขาดรหัส", () => {
    const r = productReadiness(spec(), CHOICES);
    expect(r.colorNames).toEqual(["สีหลัก", "แดง"]);
    expect(r.materials).toBe(5);
    expect(r.withCode).toBe(3);
    expect(r.noCode).toEqual(["ด้ายเย็บ"]);
  });
});
