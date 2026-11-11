import { describe, expect, it } from "vitest";
import { ZIP_EXTRA_DEFAULT, bindRuns, cleanTrims, hwCounts, openSlits, openTrims, planTrimsSend, pruneTrims, slitList, trimMarker, trimModeOf, trimRows, trimTotals, zipEdgeList } from "@/lib/pattern-trims";
import { cleanEdgeMeta, cleanFinishRange, finishPts, finishRange, pieceEdges, withFinishRange, type Seam } from "@/lib/pattern-seams";
import { projectEdgeRows } from "@/lib/pattern-project";
import type { ExistingCostLine } from "@/lib/pattern-costing";
import type { CostItemLike } from "@/lib/design-sheet-cost-row";
import { cleanProjectPieces, type ProjectPiece } from "@/lib/pattern-project";
import type { Shape } from "@/lib/pattern-shape";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
const piece = (pid: string, extra: Partial<ProjectPiece> = {}): ProjectPiece =>
  cleanProjectPieces([{ pid, name: `ชิ้น ${pid}`, count: 1, allow: 1, shape: R(30, 25), holes: [], notches: [], at: [0, 0], ...extra }])[0];
const slit = (id: string, len: number, name?: string) => ({ id, kind: "slit" as const, pts: [[5, 6], [5 + len, 6]] as [number, number][], ...(name ? { name } : {}) });

const ZIP: CostItemLike = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "ซิปไนลอน เบอร์ 5", price_per_unit: 18, uom: "หลา", face_width_cm: null, width_cm: null, length_cm: null, group_name: "ซิป", group_code: "zip", calc_method: "length", loss_percent: 10, divisor: 90, uom_default: "หลา" };
const RING: CostItemLike = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "ห่วงตัว D 2.5 ซม.", price_per_unit: 3.5, uom: "ชิ้น", face_width_cm: null, width_cm: null, length_cm: null, group_name: "อะไหล่", group_code: "accessory", calc_method: "count", loss_percent: 0, divisor: null, uom_default: "ชิ้น" };
const FABRIC: CostItemLike = { ...ZIP, id: "cccccccc-cccc-cccc-cccc-cccccccccccc", name: "ผ้าแคนวาส", group_name: "ผ้า", group_code: "fabric", calc_method: "area_face", face_width_cm: 150 };
const items = new Map([[ZIP.id, ZIP], [RING.id, RING], [FABRIC.id, FABRIC]]);
const zipMat = { id: ZIP.id, name: ZIP.name, mode: "length" as const }, ringMat = { id: RING.id, name: RING.name, mode: "count" as const };
const asExisting = (rows: ReturnType<typeof planTrimsSend>["inserts"], startId = 1): ExistingCostLine[] => rows.map((r, i) => ({ ...r, id: `row${startId + i}` }));

describe("ซิปและอะไหล่ของแพทเทิร์น (lib/pattern-trims)", () => {
  it("วิธีคิดของกลุ่มวัสดุ: ตามยาว / นับชิ้น ใช้เป็นอะไหล่ได้ · ผ้า หนัง ไม่ใช่", () => {
    expect([trimModeOf("length"), trimModeOf("count"), trimModeOf("area_face"), trimModeOf(null)]).toEqual(["length", "count", null, null]);
  });

  it("cleanTrims: ทิ้งแถวผิดรูปแบบ · ซ้ำ id · ผูกช่องเดียวกันซ้ำ · ช่องเจาะรับได้แต่วัสดุตามยาว", () => {
    const out = cleanTrims([
      { id: "t1", mat: zipMat, src: { pid: "a", line: "s1" } },                       // ไม่ใส่เผื่อปลาย → ค่าตั้งต้น
      { id: "t1", mat: ringMat, qty: 2 },                                               // id ซ้ำ
      { id: "t2", mat: zipMat, src: { pid: "a", line: "s1" }, extra: 5 },              // ช่องเดียวกันซ้ำ
      { id: "t3", mat: ringMat, src: { pid: "a", line: "s2" } },                       // ห่วงผูกกับช่องเจาะไม่ได้
      { id: "t4", mat: ringMat, qty: 4.4, name: "  ห่วงหู  " },
      { id: "t5", mat: zipMat, qty: 0, len: "45.26" },                                  // จำนวน < 1 → 1 · ยาวเป็นข้อความ
      { id: "t6", mat: { id: ZIP.id, name: ZIP.name, mode: "area_face" }, qty: 1 },    // วิธีคิดไม่ใช่อะไหล่
      { id: "bad id!", mat: ringMat, qty: 1 }, null, "x",
    ]);
    expect(out.map((t) => t.id)).toEqual(["t1", "t4", "t5"]);
    expect(out[0]).toMatchObject({ src: { pid: "a", line: "s1" }, extra: ZIP_EXTRA_DEFAULT });
    expect(out[1]).toMatchObject({ qty: 4, name: "ห่วงหู" });
    expect(out[2]).toMatchObject({ qty: 1, len: 45.3 });
    expect(cleanTrims("x")).toEqual([]);
  });

  it("ช่องเจาะของชิ้น → รายการช่อง (ยาวตามเส้น · จำนวนตามจำนวนตัดของชิ้น) · เส้นในชนิดอื่นไม่นับ", () => {
    const a = piece("a", { count: 2, inner: [slit("s1", 18, "ช่องซิปหน้า"), { id: "f1", kind: "fold", pts: [[0, 10], [30, 10]] }] });
    const b = piece("b", { name: "", inner: [slit("s2", 12.5)] });
    expect(slitList([a, b])).toEqual([
      { pid: "a", line: "s1", piece: "ชิ้น a", label: "ช่องซิปหน้า", len: 18, count: 2 },
      { pid: "b", line: "s2", piece: "ชิ้น 2", label: "ช่องซิป", len: 12.5, count: 1 },
    ]);
  });

  it("ซิปของช่องเจาะ: ยาว = ช่อง + เผื่อปลาย · จำนวน = จำนวนตัด · แก้ช่องยาวขึ้น ซิปยาวตาม", () => {
    const trims = cleanTrims([{ id: "t1", mat: zipMat, src: { pid: "a", line: "s1" }, extra: 2 }]);
    const [r] = trimRows(trims, [piece("a", { count: 2, inner: [slit("s1", 18)] })]);
    expect([r.each, r.qty, r.total, r.label]).toEqual([20, 2, 40, "ชิ้น a · ช่องซิป"]);
    const [r2] = trimRows(trims, [piece("a", { count: 2, inner: [slit("s1", 22)] })]);
    expect([r2.each, r2.total]).toEqual([24, 48]);
  });

  it("ช่องถูกลบ: แถวขึ้นว่าหาย ยอด 0 · บันทึก = ทิ้งแถวนั้น (แถวอื่นอยู่ครบ)", () => {
    const trims = cleanTrims([{ id: "t1", mat: zipMat, src: { pid: "a", line: "s1" } }, { id: "t2", mat: ringMat, qty: 2 }]);
    const pcs = [piece("a")];
    const rows = trimRows(trims, pcs);
    expect([rows[0].gone, rows[0].total, rows[1].total]).toEqual([true, 0, 2]);
    expect(pruneTrims(trims, pcs).map((t) => t.id)).toEqual(["t2"]);
    const ok = [piece("a", { inner: [slit("s1", 10)] })];
    expect(pruneTrims(trims, ok)).toBe(trims);                                          // ไม่มีอะไรทิ้ง = ตัวเดิม
  });

  it("ช่องที่ยังไม่เลือกซิป", () => {
    const pcs = [piece("a", { inner: [slit("s1", 18), slit("s2", 10)] })];
    const trims = cleanTrims([{ id: "t1", mat: zipMat, src: { pid: "a", line: "s2" } }]);
    expect(openSlits(trims, pcs).map((s) => s.line)).toEqual(["s1"]);
  });

  it("รวมต่อวัสดุ: ซิป 2 ช่อง + ซิปใส่เอง = บรรทัดเดียว · ห่วง 2 แถว = รวมจำนวน · แถวยังไม่ใส่ความยาวไม่นับ", () => {
    const pcs = [piece("a", { count: 2, inner: [slit("s1", 18)] }), piece("b", { inner: [slit("s2", 10)] })];
    const trims = cleanTrims([
      { id: "t1", mat: zipMat, src: { pid: "a", line: "s1" }, extra: 2 },   // 20 × 2 = 40
      { id: "t2", mat: zipMat, src: { pid: "b", line: "s2" }, extra: 0 },   // 10 × 1 = 10
      { id: "t3", mat: zipMat, qty: 1, len: 30 },                             // ซิปปากกระเป๋า 30
      { id: "t4", mat: zipMat, qty: 3 },                                      // ยังไม่ใส่ความยาว
      { id: "t5", mat: ringMat, qty: 2 }, { id: "t6", mat: ringMat, qty: 4, name: "ห่วงสายสะพาย" },
    ]);
    expect(trimTotals(trimRows(trims, pcs))).toEqual([
      { id: ZIP.id, name: ZIP.name, mode: "length", total: 80, parts: 4 },
      { id: RING.id, name: RING.name, mode: "count", total: 6, parts: 2 },
    ]);
  });

  it("ส่งครั้งแรก: 1 วัสดุ = 1 บรรทัด ไม่มีรูปทรง · ซิปคิดตามยาว (÷ตัวหาร × เผื่อเสีย) · ห่วงนับชิ้น · หมายเหตุมีป้ายแพทเทิร์น", () => {
    const pcs = [piece("a", { count: 2, inner: [slit("s1", 18)] })];
    const trims = cleanTrims([{ id: "t1", mat: zipMat, src: { pid: "a", line: "s1" }, extra: 2 }, { id: "t2", mat: ringMat, qty: 4 }]);
    const plan = planTrimsSend(trimRows(trims, pcs), [], "P-01", items, "PT-0007", 12);
    expect(plan.inserts).toHaveLength(2);
    const [z, r] = plan.inserts;
    expect([z.item_id, z.calc_method, z.length_cm, z.pieces, z.shape, z.parent_code, z.sort_order]).toEqual([ZIP.id, "length", 40, null, null, "P-01", 13]);
    expect(z.qty).toBeCloseTo((40 * 1.1) / 90, 4);
    expect(z.amount).toBeCloseTo(Math.round(z.qty! * 18 * 100) / 100, 2);
    expect([r.item_id, r.calc_method, r.pieces, r.qty, r.amount, r.sort_order]).toEqual([RING.id, "count", 4, 4, 14, 14]);
    expect(z.note).toContain(trimMarker("PT-0007"));
    expect(plan.lines.map((l) => [l.name, l.total, l.action])).toEqual([[ZIP.name, 40, "add"], [RING.name, 4, "add"]]);
    expect(plan.amount).toBeCloseTo((z.amount ?? 0) + 14, 2);
  });

  it("ส่งซ้ำ: อัปเดตความยาว/จำนวนของบรรทัดเดิม ไม่เพิ่มซ้ำ · ราคาที่แก้เองในตีราคายังอยู่ (ใช้คิดยอดใหม่)", () => {
    const trims = cleanTrims([{ id: "t1", mat: zipMat, src: { pid: "a", line: "s1" }, extra: 2 }, { id: "t2", mat: ringMat, qty: 4 }]);
    const first = planTrimsSend(trimRows(trims, [piece("a", { inner: [slit("s1", 18)] })]), [], null, items, "PT-0007", 0);
    const existing = asExisting(first.inserts).map((r) => (r.item_id === RING.id ? { ...r, unit_price: 5 } : r));
    const again = planTrimsSend(trimRows(trims, [piece("a", { inner: [slit("s1", 28)] })]), existing, null, items, "PT-0007", 2);
    expect(again.inserts).toHaveLength(0);
    expect(again.updates.map((u) => u.id)).toEqual(["row1", "row2"]);
    expect(again.updates[0].patch).toMatchObject({ length_cm: 30 });
    expect(again.updates[1].patch).toMatchObject({ pieces: 4, qty: 4, amount: 20 });   // 4 × ราคาที่แก้เป็น 5
    expect("note" in again.updates[0].patch).toBe(false);                               // หมายเหตุเดิมไม่ถูกเขียนทับ
    expect(again.stale).toBe(0);
  });

  it("บรรทัดที่ผู้ใช้เพิ่มเอง (ไม่มีป้าย) / ของแพทเทิร์นอื่น / อยู่คนละแท็บ = ไม่แตะ แม้วัสดุเดียวกัน", () => {
    const trims = cleanTrims([{ id: "t2", mat: ringMat, qty: 4 }]);
    const base = planTrimsSend(trimRows(trims, []), [], null, items, "PT-0007", 0).inserts[0];
    const existing: ExistingCostLine[] = [
      { ...base, id: "manual", note: "ห่วงที่ใส่เอง" },
      { ...base, id: "other", note: `${trimMarker("PT-00071")} ซิป/อะไหล่` },           // เลขที่ขึ้นต้นเหมือนกันแต่คนละใบ
      { ...base, id: "tab", parent_code: "P-02" },
    ];
    const plan = planTrimsSend(trimRows(trims, []), existing, null, items, "PT-0007", 3);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.stale).toBe(0);
  });

  it("เอาวัสดุออกจากรายการแล้วส่งซ้ำ: บรรทัดเดิมไม่ถูกลบ นับเป็น stale", () => {
    const first = planTrimsSend(trimRows(cleanTrims([{ id: "t1", mat: zipMat, qty: 1, len: 30 }, { id: "t2", mat: ringMat, qty: 4 }]), []), [], null, items, "PT-0007", 0);
    const plan = planTrimsSend(trimRows(cleanTrims([{ id: "t2", mat: ringMat, qty: 4 }]), []), asExisting(first.inserts), null, items, "PT-0007", 2);
    expect([plan.inserts.length, plan.updates.length, plan.stale]).toEqual([0, 1, 1]);
  });

  it("วัสดุที่ไม่อยู่ในรายการแล้ว: ส่งเป็นชื่อ ไม่มีราคา แต่มีความยาว/จำนวน · ส่งซ้ำจับคู่ด้วยชื่อ", () => {
    const gone = { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", name: "ล็อกแม่เหล็กรุ่นเก่า", mode: "count" as const };
    const trims = cleanTrims([{ id: "t1", mat: gone, qty: 2 }]);
    const plan = planTrimsSend(trimRows(trims, []), [], null, items, "PT-0007", 0);
    expect(plan.missingItems).toEqual([gone.name]);
    expect(plan.inserts[0]).toMatchObject({ item_id: null, item_name: gone.name, calc_method: "count", pieces: 2, qty: 2, amount: null });
    const again = planTrimsSend(trimRows(trims, []), asExisting(plan.inserts), null, items, "PT-0007", 1);
    expect([again.inserts.length, again.updates.length]).toEqual([0, 1]);
  });

  it("วิธีคิดของวัสดุเปลี่ยนไปแล้ว (เช่น ถูกย้ายไปกลุ่มผ้า) = ไม่ส่ง บอกชื่อ · แถวยอด 0 = ไม่ส่ง นับไว้เตือน", () => {
    const trims = cleanTrims([{ id: "t1", mat: { id: FABRIC.id, name: FABRIC.name, mode: "length" }, qty: 1, len: 50 }, { id: "t2", mat: zipMat, qty: 2 }]);
    const plan = planTrimsSend(trimRows(trims, []), [], null, items, "PT-0007", 0);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skipped).toEqual([FABRIC.name]);
    expect(plan.noQty).toBe(1);
  });
});

// ── ซิปตามขอบ + กุ๊น/หุ้มขอบ: ความยาวมาจากขอบของชิ้น (สี่เหลี่ยม 30×25: ขอบ 1,3 ยาว 30 · ขอบ 2,4 ยาว 25)
const tapeMat = { id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", name: "เทปกุ๊น 2 ซม.", mode: "length" as const };
const meta = (m: Record<number, { bind?: boolean; zip?: boolean }>) => [0, 1, 2, 3].map((i) => m[i] ?? {});
const whole = (pid: string, i: number) => ({ pid, from: i, count: 1, n: 4 });

describe("ซิปตามขอบ + กุ๊น คิดความยาวจากขอบ", () => {
  it("ขอบที่ติ๊กติดซิป → รายการขอบ (ยาวตามขอบ) · ขอบที่ไม่ได้ติ๊กไม่นับ", () => {
    const a = piece("a", { edgeMeta: meta({ 0: { zip: true }, 1: { bind: true } }) });
    expect(zipEdgeList([a, piece("b")])).toEqual([{ pid: "a", i: 0, piece: "ชิ้น a", label: "ขอบ 1", len: 30 }]);
  });

  it("ซิปตามขอบ: ยาว = ขอบ + เผื่อ (ตั้งต้น 0) · จำนวนใส่เอง ไม่คูณจำนวนตัด · ยืดขอบ ซิปยาวตาม · เลิกติ๊ก = แถวหายตอนบันทึก", () => {
    const trims = cleanTrims([{ id: "t1", mat: zipMat, edge: { pid: "a", i: 0 } }, { id: "t2", mat: zipMat, edge: { pid: "a", i: 0 }, qty: 2 }, { id: "t3", mat: ringMat, edge: { pid: "a", i: 2 } }]);
    expect(trims.map((t) => t.id)).toEqual(["t1"]);                                    // ขอบเดียวกันซ้ำ / ห่วงผูกขอบ = ทิ้ง
    expect(trims[0]).toMatchObject({ edge: { pid: "a", i: 0 }, extra: 0, qty: 1 });
    const on = piece("a", { count: 2, edgeMeta: meta({ 0: { zip: true } }) });
    const [r] = trimRows(trims, [on]);
    expect([r.each, r.qty, r.total, r.label]).toEqual([30, 1, 30, "ชิ้น a · ขอบ 1"]);
    const wide = piece("a", { shape: R(36, 25), edgeMeta: meta({ 0: { zip: true } }) });
    expect(trimRows(cleanTrims([{ id: "t1", mat: zipMat, edge: { pid: "a", i: 0 }, extra: 1.5, qty: 2 }]), [wide])[0]).toMatchObject({ each: 37.5, total: 75 });
    const off = piece("a");
    expect(trimRows(trims, [off])[0].gone).toBe(true);
    expect(pruneTrims(trims, [off])).toEqual([]);
    expect(pruneTrims(trims, [on])).toBe(trims);
  });

  it("กุ๊น: รวมขอบที่ติ๊กกุ้นขอบ × จำนวนตัด + ตะเข็บชนิดหุ้มขอบ (ครั้งเดียว) · ขอบที่อยู่ในตะเข็บหุ้มขอบแล้วไม่นับซ้ำ", () => {
    const a = piece("a", { count: 2, edgeMeta: meta({ 0: { bind: true }, 1: { bind: true } }) });   // 30 + 25 = 55 × 2 = 110
    const b = piece("b", { edgeMeta: meta({ 2: { bind: true } }) });                                // ขอบ 3 (30) อยู่ในตะเข็บหุ้มขอบ → ไม่นับซ้ำ
    const c = piece("c");
    const seams: Seam[] = [
      { id: "s1", a: whole("b", 2), b: whole("c", 0), kind: "bound" },                              // 30
      { id: "s2", a: whole("b", 1), b: whole("c", 1), kind: "turned" },                             // ไม่ใช่หุ้มขอบ
    ];
    expect(bindRuns([a, b, c], seams)).toEqual({ edges: 4, seams: 1, total: 140 });
    expect(bindRuns([a, b, c])).toEqual({ edges: 5, seams: 0, total: 140 });                        // ไม่มีตะเข็บ = นับขอบของ b
    expect(bindRuns([c])).toEqual({ edges: 0, seams: 0, total: 0 });
  });

  it("แถวกุ๊น: 1 แถวทั้งใบ + เผื่อเพิ่มรวม · มีได้แถวเดียว · ไม่มีขอบกุ๊นเหลือ = แถวหายตอนบันทึก · ส่งตีราคาเป็นบรรทัดตามยาว", () => {
    const trims = cleanTrims([{ id: "t1", mat: tapeMat, bind: true, extra: 10 }, { id: "t2", mat: tapeMat, bind: true }, { id: "t3", mat: ringMat, bind: true }]);
    expect(trims.map((t) => t.id)).toEqual(["t1"]);
    const a = piece("a", { count: 2, edgeMeta: meta({ 0: { bind: true } }) });                      // 30 × 2 = 60
    const [r] = trimRows(trims, [a]);
    expect([r.qty, r.total, r.label]).toEqual([2, 70, "กุ๊น / หุ้มขอบ"]);
    expect(trimRows(trims, [piece("a")])[0].gone).toBe(true);
    expect(pruneTrims(trims, [piece("a")])).toEqual([]);
    const plan = planTrimsSend(trimRows(trims, [a]), [], null, items, "PT-0007", 0);
    expect(plan.inserts[0]).toMatchObject({ item_id: null, item_name: tapeMat.name, calc_method: "length", length_cm: 70, shape: null });
  });

  it("ของที่ยังไม่เลือกวัสดุ: ช่องซิป + ขอบติดซิป + กุ๊น (นับเป็น 1) · เลือกครบ = 0", () => {
    const pcs = [piece("a", { inner: [slit("s1", 18)], edgeMeta: meta({ 0: { zip: true }, 1: { bind: true } }) })];
    const none = openTrims([], pcs);
    expect([none.slits.length, none.edges.length, !!none.bind, none.count]).toEqual([1, 1, true, 3]);
    const all = cleanTrims([{ id: "t1", mat: zipMat, src: { pid: "a", line: "s1" } }, { id: "t2", mat: zipMat, edge: { pid: "a", i: 0 } }, { id: "t3", mat: tapeMat, bind: true }]);
    expect(openTrims(all, pcs).count).toBe(0);
    expect(openTrims([], [piece("b")]).count).toBe(0);
  });
});

describe("อะไหล่ที่วางบนชิ้น → นับไปตีราคา", () => {
  const hw = (id: string, kind: string, x: number) => ({ id, kind: "hw" as const, hw: kind, pts: [[x, 5], [x + 1, 5]] as [number, number][] });
  it("เส้นในชนิดอะไหล่เก็บชนิดไว้ (ไม่รู้จัก = หมุดย้ำ) · นับตามชนิด × จำนวนตัดของชิ้น เรียงตามลำดับชนิด", () => {
    const a = piece("a", { count: 2, inner: [hw("h1", "rivet", 3), hw("h2", "rivet", 8), hw("h3", "ring", 12), hw("h4", "???", 16), slit("s1", 10)] as never });
    expect(a.inner!.filter((l) => l.kind === "hw").map((l) => l.hw)).toEqual(["rivet", "rivet", "ring", "rivet"]);
    expect(hwCounts([a, piece("b", { inner: [hw("h9", "magnet", 4)] as never })]).map((h) => [h.hw, h.count])).toEqual([["ring", 2], ["rivet", 6], ["magnet", 1]]);
    expect(hwCounts([piece("c")])).toEqual([]);
  });

  it("แถวอะไหล่บนชิ้น: 1 แถวต่อชนิด วัสดุนับชิ้นเท่านั้น · จำนวนตามกระดาน · ไม่มีอะไหล่ชนิดนั้นแล้ว = แถวหายตอนบันทึก · ส่งตีราคาเป็นบรรทัดนับชิ้น", () => {
    const trims = cleanTrims([{ id: "t1", mat: ringMat, hw: "rivet" }, { id: "t2", mat: ringMat, hw: "rivet" }, { id: "t3", mat: zipMat, hw: "ring" }, { id: "t4", mat: ringMat, hw: "nope" }]);
    expect(trims.map((t) => [t.id, t.hw])).toEqual([["t1", "rivet"], ["t4", undefined]]);        // ซ้ำชนิด / วัสดุตามยาว = ทิ้ง · ชนิดไม่รู้จัก = แถวใส่เองธรรมดา
    const a = piece("a", { count: 2, inner: [hw("h1", "rivet", 3), hw("h2", "rivet", 8)] as never });
    const [r] = trimRows(trims.slice(0, 1), [a]);
    expect([r.qty, r.total, r.label]).toEqual([4, 4, "หมุดย้ำ (วางบนชิ้น)"]);
    expect(trimRows(trims.slice(0, 1), [piece("a")])[0].gone).toBe(true);
    expect(pruneTrims(trims.slice(0, 1), [piece("a")])).toEqual([]);
    const plan = planTrimsSend(trimRows(trims.slice(0, 1), [a]), [], null, items, "PT-0007", 0);
    expect(plan.inserts[0]).toMatchObject({ item_id: RING.id, calc_method: "count", pieces: 4, qty: 4, amount: 14 });
    expect(openTrims([], [a]).hw.map((h) => h.hw)).toEqual(["rivet"]);
    expect(openTrims(trims.slice(0, 1), [a]).count).toBe(0);
  });
});

describe("ซิป / กุ๊น เฉพาะบางช่วงของขอบ", () => {
  it("ตรวจช่วง: อยู่ในขอบ · สลับลำดับได้ · ครอบทั้งขอบ / สั้นเกิน / ผิดรูปแบบ = ทั้งขอบ · ขอบสั้นลง = เลื่อนช่วงกลับเข้ามา คงความยาว", () => {
    expect(cleanFinishRange([5, 25], 30)).toEqual([5, 25]);
    expect(cleanFinishRange([25, 5], 30)).toEqual([5, 25]);
    expect(cleanFinishRange([0, 30], 30)).toBeNull();
    expect(cleanFinishRange([3, 3.2], 30)).toBeNull();
    expect(cleanFinishRange("x", 30)).toBeNull();
    expect(cleanFinishRange([28, 40], 30)).toEqual([18, 30]);      // ยาว 12 เลยปลาย → เลื่อนเข้ามา
    expect(cleanFinishRange([5, 25], 12)).toBeNull();              // ขอบเหลือ 12 ช่วงยาว 20 → ทั้งขอบ
    expect(finishRange({ zip: true, zipR: [5, 25] }, "zip", 30)).toEqual([5, 25]);
    expect(finishRange({ zip: true }, "zip", 30)).toEqual([0, 30]);
  });

  it("เก็บช่วงเฉพาะขอบที่ติ๊กอยู่ · ตั้งช่วงครอบทั้งขอบ = ล้างช่วง · จุดของเส้น = เฉพาะช่วง", () => {
    const shape = R(30, 25);
    const m = cleanEdgeMeta(shape, [{ zip: true, zipR: [5, 25] }, { bindR: [2, 8] }, { bind: true, bindR: [0, 10] }, {}])!;
    expect(m).toEqual([{ zip: true, zipR: [5, 25] }, {}, { bind: true, bindR: [0, 10] }, {}]);
    expect(withFinishRange(m[0], "zip", [0, 30], 30)).toEqual({ zip: true });
    expect(withFinishRange(m[0], "zip", [10, 14], 30)).toEqual({ zip: true, zipR: [10, 14] });
    expect(withFinishRange(m[0], "zip", null, 30)).toEqual({ zip: true });
    const e = pieceEdges(shape)[0], P = finishPts(e, m[0], "zip");
    expect(Math.hypot(P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1])).toBeCloseTo(20, 6);
    expect(finishPts(e, { zip: true }, "zip")).toBe(e.pts);
  });

  it("ซิปบางช่วง: ความยาวซิป = ช่วง (ไม่ใช่ทั้งขอบ) + เผื่อ · บอกความยาวขอบเต็มไว้ด้วย", () => {
    const a = piece("a", { edgeMeta: [{ zip: true, zipR: [5, 25] }, {}, {}, {}] });
    expect(zipEdgeList([a])).toEqual([{ pid: "a", i: 0, piece: "ชิ้น a", label: "ขอบ 1", len: 20, full: 30 }]);
    const [r] = trimRows(cleanTrims([{ id: "t1", mat: zipMat, edge: { pid: "a", i: 0 }, extra: 2 }]), [a]);
    expect([r.each, r.total]).toEqual([22, 22]);
  });

  it("กุ๊นบางช่วง: นับเฉพาะช่วง × จำนวนตัด · ใบพิมพ์บอกความยาวช่วง", () => {
    const a = piece("a", { count: 2, edgeMeta: [{ bind: true, bindR: [0, 10] }, { bind: true }, {}, {}] });   // 10 + 25 = 35 × 2
    expect(bindRuns([a])).toEqual({ edges: 4, seams: 0, total: 70 });
    const rows = projectEdgeRows([a]);
    expect(rows.map((r) => [r.edge, r.bind, r.bindLen ?? null])).toEqual([[1, true, 10], [2, true, null]]);
  });
});
