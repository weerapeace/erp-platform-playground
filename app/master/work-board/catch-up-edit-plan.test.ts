import { describe, it, expect } from "vitest";
import { ceInitial, ceBuild, ceRun, ymdTh, ceRestRecommend, type CeForm } from "./catch-up-edit-plan";
import { cuBuildSteps, cuFacts, cuReduceSnap, cuRun, cuUndo, cuDefaultTicks, cuStepParts, cuOutstanding, cuDaysSince, CU_NO_DATES, type CuInputs, type CuReduce } from "./catch-up";
import { shrinkWos, reduceQtyIssue, increaseQtyIssue, increaseIsBig } from "@/lib/mo-qty-reduce";
import type { CatchUpSnapshot, CatchUpWo, CatchUpSub } from "@/app/api/mo/catch-up/route";

const wo = (o: Partial<CatchUpWo>): CatchUpWo => ({ id: "w1", wo_no: "WO-1", qty: 20, received_qty: 0, qc_pulled_qty: 0, status: "dispatched",
  department_name: "โต๊ะแต๋ว", assignee_name: "โต๊ะแต๋ว", dispatch_date: null, created_at: "2026-10-20T00:00:00Z", labor_cost: 1000,
  assignee_type: "department", assignee_id: null, department_id: "d1", note: null, assignees: [], ...o });
const sub = (o: Partial<CatchUpSub>): CatchUpSub => ({ id: "s1", wo_id: "w1", wo_no: "WO-1", qty: 20, wage: 1000, submitted_at: "2026-10-29", craftsman_name: "โต๊ะแต๋ว", info_pending: false, created_at: "", ...o });
const snap = (o: { mo?: Partial<CatchUpSnapshot["mo"]>; wos?: CatchUpWo[]; subs?: CatchUpSub[]; qcItems?: CatchUpSnapshot["qcItems"] } = {}): CatchUpSnapshot => ({
  mo: { id: "m1", mo_no: "MO-1", product_sku: "PIX12-01", product_name: "ชื่อ", qty: 20, status: "draft", due_date: null, internal_due_date: null,
    has_bom: true, prep_total: 3, prep_ready: 0, cut_total: 2, cut_ready: 0, prep_done: false, cut_done: false, skipped: {}, bom_code: "BOM-1", note: null,
    prep_done_at: null, cut_done_at: null, sized: false, ...o.mo },
  progress: { total: 3, buy: 0, requested: 0, ordered: 0 }, materials: [],
  wos: o.wos ?? [wo({ received_qty: 20, status: "done" })], shelves: [], shelf: { good: 0, defect: 0, repairing: 0 }, shelfAt: [], rates: [], reasons: [],
  past: { mo: [], model: [] }, sales: { so: [], dn: [] }, subs: o.subs ?? [sub({})], qcItems: o.qcItems ?? [],
});
const ctx = { departments: [{ id: "d1", name: "โต๊ะแต๋ว" }, { id: "d2", name: "ช่างเหมา" }], people: [{ id: "p1", name: "พี่แอน" }, { id: "p2", name: "พี่หนิง" }], today: "2026-10-31" };
const edit = (s: CatchUpSnapshot, fn: (f: CeForm) => void) => { const f = ceInitial(s); fn(f); return ceBuild(s, f, ctx); };
const red = (qty: number, mode: CuReduce["mode"] = "split", pick = "ของไม่พอ", detail = ""): CuReduce => ({ qty, mode, pick, detail });

describe("lib/mo-qty-reduce", () => {
  it("ลดยอดค้างของใบจ่ายล่าสุดก่อน · ลดได้แค่ส่วนที่ยังไม่ส่งคืน · ใบที่ยังไม่คืนเลยแล้วลดหมด = ยกเลิก", () => {
    const wos = [
      { id: "a", wo_no: "WO-A", qty: 10, received_qty: 6, status: "partial_return", labor_cost: 500, created_at: "2026-10-01" },
      { id: "b", wo_no: "WO-B", qty: 10, received_qty: 0, status: "dispatched", labor_cost: 0, created_at: "2026-10-05" },
    ];
    const p = shrinkWos(wos, 7);
    expect(p.map((x) => [x.id, x.to, x.status_to, x.cancel])).toEqual([["b", 0, "cancelled", true], ["a", 7, "partial_return", false]]);
    expect(p[1].labor_to).toBe(350);   // ราคาต่อชิ้นเดิม ฿50 × 7
    expect(shrinkWos(wos, 6).find((x) => x.id === "a")?.status_to).toBe("done");
    expect(shrinkWos(wos, 25)).toEqual([]);
  });
  it("ห้ามลดต่ำกว่ายอดส่งคืน / ใบไซส์ / เท่าเดิม", () => {
    expect(reduceQtyIssue({ qty: 20, newQty: 15, received: 0 })).toBeNull();
    expect(reduceQtyIssue({ qty: 20, newQty: 10, received: 12 })).toMatch(/ส่งคืนแล้ว 12/);
    expect(reduceQtyIssue({ qty: 20, newQty: 20, received: 0 })).toMatch(/น้อยกว่า/);
    expect(reduceQtyIssue({ qty: 20, newQty: 15, received: 0, sized: true })).toMatch(/ไซส์/);
  });
});

describe("ทำได้ไม่ครบ ในโหมดอัปเดตงาน", () => {
  const base = snap({ wos: [], subs: [] });
  const inp = (o: Partial<CuInputs> = {}): CuInputs => ({ disp: [{ key: "a", deptId: "d1", qty: 15, date: null }], ret: [], qcGood: 0, qcBad: 0, shelfId: "", cancelReason: "", dates: CU_NO_DATES, ...o });
  it("ลดเป็น 15 แยกที่เหลือ → ขั้นลดจำนวนมาก่อน แล้วจ่าย 15 ได้ครบ (ไม่เตือนว่ายังเหลือ)", () => {
    const f = cuFacts(base);
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ reduce: red(15) }));
    expect(r.errors).toEqual([]);
    expect(r.steps[0]).toMatchObject({ kind: "reduce", from: 20, to: 15, reason: "ของไม่พอ", mode: "split" });
    expect(r.issues.some((x) => x.field === "disp" && /ยังเหลือ/.test(x.msg))).toBe(false);
  });
  it("ต้องมีเหตุผล · ค้างไว้ในใบนี้ = จดต่อท้ายหมายเหตุ ไม่ลดจำนวน", () => {
    const f = cuFacts(base);
    expect(cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ reduce: red(15, "drop", "อื่น ๆ", "") })).errors.join(" ")).toMatch(/เหตุผล/);
    const k = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ reduce: red(15, "keep", "ของไม่พอ", "ผ้าลายดอก"), teamNote: "เร่ง" }));
    expect(k.steps.map((s) => s.kind)).toEqual(["mark_ready", "dispatch", "note"]);
    expect(k.steps.at(-1)).toMatchObject({ text: "ทำได้ก่อน 15/20 ชิ้น เพราะ ของไม่พอ: ผ้าลายดอก — ที่เหลือค้างไว้ในใบนี้ · เร่ง" });
  });
  it("ปิดยอดขาด: ช่างคืน 15 จาก 20 → บอก received ไว้เสนอปุ่ม · ลดเหลือ 15 แล้วปิดได้", () => {
    const s = snap({ wos: [wo({ received_qty: 15, status: "partial_return" })], subs: [] });
    const f = cuFacts(s);
    const a = cuBuildSteps(f, "close", cuDefaultTicks(f, "close"), inp({ disp: [], ret: [] }), s.wos);
    expect(a.errors.join(" ")).toMatch(/ปิดยอดขาด/);
    expect(a.received).toBe(15);
    const b = cuBuildSteps(f, "close", { ...cuDefaultTicks(f, "close"), qc_in: false, ship: false }, inp({ disp: [], ret: [], reduce: red(15, "drop", "ช่างส่งคืนไม่ครบ") }), s.wos);
    expect(b.errors).toEqual([]);
    expect(b.steps.map((x) => x.kind)).toEqual(["reduce", "mark_ready", "close"]);
  });
  it("ภาพหลังลด: จำนวนใหม่ + ใบจ่ายลดยอดค้าง", () => {
    const s = snap({ wos: [wo({ received_qty: 5 })], subs: [] });
    const r = cuReduceSnap(s, red(12));
    expect([r.mo.qty, r.wos[0].qty, r.wos[0].status]).toEqual([12, 12, "partial_return"]);
    expect(cuReduceSnap(s, red(3))).toBe(s);   // ต่ำกว่ายอดคืน = ไม่ลด
  });
  it("cuRun ส่งลดจำนวนไป API แล้วย้อนได้", async () => {
    const calls: [string, unknown][] = [];
    const api = async (url: string, body: unknown) => { calls.push([url, body]); return url.endsWith("reduce-qty") && !(body as { revert?: string }).revert ? { data: { change_id: "c1", new_mo_no: "MO-9", wo_changes: [] } } : { id: "x" }; };
    const res = await cuRun([{ kind: "reduce", from: 20, to: 15, reason: "ของไม่พอ", mode: "split" }], { snap: base, disp: {}, shelfId: "", badReason: "" }, api);
    expect(res[0]).toMatchObject({ ok: true, undo: { kind: "reduce", changeId: "c1", newMo: "MO-9" } });
    await cuUndo(res, { snap: base, disp: {}, shelfId: "", badReason: "" }, api);
    expect(calls.at(-1)).toEqual(["/api/mo/m1/reduce-qty", { revert: "c1" }]);
  });
});

describe("ป๊อปแก้ไข (ceBuild)", () => {
  it("ไม่ได้แก้อะไร = บอกว่ายังไม่ได้แก้", () => {
    expect(edit(snap(), () => {}).errors).toEqual(["ยังไม่ได้แก้อะไร"]);
  });
  it("ติ๊กเตรียม/ตัดที่เคยข้าม + วันที่ · วันจ่ายที่ไม่ระบุ", () => {
    const r = edit(snap(), (f) => { f.prep = { done: true, date: "2026-10-20" }; f.cut = { done: true, date: null }; f.wos[0].date = "2026-10-21"; });
    expect(r.errors).toEqual([]);
    expect(r.ops.map((o) => o.kind)).toEqual(["wo", "ready", "ready"]);
    expect(r.ops[0]).toMatchObject({ patch: { dispatch_date: "2026-10-21" } });
    expect(r.ops[1]).toMatchObject({ part: "prep", ready: true, date: "2026-10-20" });
  });
  it("แก้เฉพาะใบจ่าย (ปิดแก้ตามให้): ลดต่ำกว่ายอดส่งคืนไม่ได้ จนกว่าจะแก้รอบส่งคืนเอง", () => {
    expect(edit(snap(), (f) => { f.wos[0].qty = 18; f.noCascade = ["w1"]; }).errors.join(" ")).toMatch(/ส่งคืนแล้ว 20/);
    const r = edit(snap(), (f) => { f.wos[0].qty = 18; f.subs[0].qty = 18; });
    expect(r.errors).toEqual([]);
    expect(r.ops.map((o) => o.kind)).toEqual(["sub", "wo"]);   // รอบส่งคืนก่อน แล้วค่อยใบจ่าย
    expect(r.ops[0]).toMatchObject({ patch: { qty: 18, wage: 900 } });   // ค่าแรงตามราคาต่อชิ้นเดิมของรอบ ฿50
    expect(r.ops[1]).toMatchObject({ patch: { qty: 18, labor_cost: 900 } });
  });
  it("แก้ตามให้ทั้งชุด: ใบจ่าย 20 → 15 (คืนแล้ว 20) → รอบส่งคืน 15 · ค่าแรง ฿750 · ลดจำนวนสั่ง แยกที่เหลือ 5", () => {
    const r = edit(snap(), (f) => { f.wos[0].qty = 15; });
    expect(r.errors).toEqual([]);
    expect(r.cascades).toMatchObject([{ woId: "w1", from: 20, to: 15, recvFrom: 20, rest: 5, subs: [{ id: "s1", from: 20, to: 15 }], qcBack: [] }]);
    expect(r.ops.map((o) => o.kind)).toEqual(["sub", "wo", "reduce"]);
    expect(r.ops[0]).toMatchObject({ patch: { qty: 15, wage: 750 } });
    expect(r.ops[1]).toMatchObject({ patch: { qty: 15, labor_cost: 750 } });
    expect(r.ops[2]).toMatchObject({ qty: 15, mode: "split", reason: "ของไม่พอ" });
    expect(r.reduceFromCascade).toBe(true);
  });
  it("แก้ตามให้: หลายรอบ = ลดจากรอบล่าสุดก่อน (เหลือ 0 = ลบรอบ) · ไม่ทำแล้ว / ค้างไว้ = จดหมายเหตุ", () => {
    const s = snap({ subs: [sub({ id: "s1", qty: 12, wage: 600, submitted_at: "2026-10-20" }), sub({ id: "s2", qty: 8, wage: 400, submitted_at: "2026-10-26" })] });
    const r = edit(s, (f) => { f.wos[0].qty = 10; f.rest = { mode: "drop", pick: "ลงจำนวนผิด", detail: "" }; });
    expect(r.errors).toEqual([]);
    expect(r.ops.map((o) => o.kind)).toEqual(["sub_del", "sub", "wo", "reduce"]);
    expect(r.ops[1]).toMatchObject({ id: "s1", patch: { qty: 10, wage: 500 } });
    expect(r.ops[3]).toMatchObject({ qty: 10, mode: "drop", reason: "ลงจำนวนผิด" });
    const k = edit(s, (f) => { f.wos[0].qty = 15; f.rest = { mode: "keep", pick: "ของไม่พอ", detail: "ผ้าหมด" }; });
    expect(k.ops.map((o) => o.kind)).toEqual(["sub", "wo", "note"]);
    expect(k.ops.at(-1)).toMatchObject({ note: expect.stringContaining("ทำได้ 15/20 ชิ้น เพราะ ของไม่พอ: ผ้าหมด — อีก 5 ชิ้นค้างไว้ในใบนี้") });
  });
  it("แก้ตามให้: ของขึ้นชั้น QC เกินยอดใหม่ → ย้อนกลับไปรอรับให้ (ทั้งก้อน ล่าสุดก่อน)", () => {
    const s = snap({ wos: [wo({ received_qty: 20, qc_pulled_qty: 20, status: "done" })], qcItems: [
      { id: "q1", wo_id: "w1", qty: 12, status: "good", shelf_name: "QC แล้ว", reason: null, created_at: "2026-10-28" },
      { id: "q2", wo_id: "w1", qty: 8, status: "good", shelf_name: "QC แล้ว", reason: null, created_at: "2026-10-29" }] });
    const r = edit(s, (f) => { f.wos[0].qty = 15; });
    expect(r.errors).toEqual([]);
    expect(r.cascades[0].qcBack.map((x) => x.id)).toEqual(["q2"]);   // เหลือบนชั้น 12 ≤ 15
    expect(r.ops.map((o) => o.kind)).toEqual(["qc_back", "sub", "wo", "reduce"]);
  });
  it("แก้ตามให้: ใส่ช่องลดจำนวนเองไว้แล้ว = ใช้ของที่ใส่ (ไม่ซ้อน) · เปลี่ยนใจพิมพ์กลับ 20 = ไม่มีอะไรค้าง", () => {
    const r = edit(snap(), (f) => { f.wos[0].qty = 15; f.reduce = { qty: 15, pick: "อื่น ๆ", detail: "ลูกค้าขอ", mode: "drop" }; });
    expect(r.ops.filter((o) => o.kind === "reduce")).toHaveLength(1);
    expect(r.ops.at(-1)).toMatchObject({ reason: "ลูกค้าขอ" });
    expect(r.reduceFromCascade).toBe(false);
    expect(edit(snap(), (f) => { f.wos[0].qty = 15; f.wos[0].qty = 20; }).errors).toEqual(["ยังไม่ได้แก้อะไร"]);
  });
  it("เปลี่ยนค่าแรง/ชิ้นของใบจ่าย → รอบส่งคืนคิดใหม่ (ติ๊กไว้ตั้งต้น) · พิมพ์ค่าแรงรอบเองไม่ทับ", () => {
    const r = edit(snap(), (f) => { f.wos[0].rate = 45; });
    expect(r.ops.map((o) => [o.kind, "patch" in o ? o.patch : null])).toEqual([["sub", { wage: 900 }], ["wo", { labor_cost: 900 }]]);
    expect(edit(snap(), (f) => { f.wos[0].rate = 45; f.subs[0].wage = 1000.5; }).ops[0]).toMatchObject({ patch: { wage: 1000.5 } });
    expect(edit(snap(), (f) => { f.wos[0].rate = 45; f.reRateSubs = false; }).issues.some((x) => x.field === "rerate")).toBe(true);
  });
  it("เปลี่ยนคนรับ → ส่งแบบเดียวกับตอนจ่าย + แก้ชื่อในรอบส่งคืนตาม", () => {
    const r = edit(snap(), (f) => { f.wos[0].crewIds = ["p1", "p2"]; });
    expect(r.ops[0]).toMatchObject({ kind: "wo", patch: { assignee_type: "craftsman", assignee_id: "p1", assignee_name: "พี่แอน, พี่หนิง", sync_subs_worker: true } });
  });
  it("ของอยู่ชั้น QC แล้ว → ลดยอดส่งคืนไม่ได้จนกว่าจะย้อนของกลับไปรอรับ", () => {
    const s = snap({ wos: [wo({ received_qty: 20, qc_pulled_qty: 20, status: "done" })], qcItems: [{ id: "q1", wo_id: "w1", qty: 20, status: "good", shelf_name: "ชั้น A", reason: null, created_at: "" }] });
    expect(edit(s, (f) => { f.subs[0].qty = 15; f.wos[0].qty = 15; }).errors.join(" ")).toMatch(/ชั้น QC แล้ว 20/);
    const r = edit(s, (f) => { f.subs[0].qty = 15; f.wos[0].qty = 15; f.qcBack = ["q1"]; });
    expect(r.errors).toEqual([]);
    expect(r.ops.map((o) => o.kind)).toEqual(["qc_back", "sub", "wo"]);
  });
  it("ยกเลิกใบจ่ายที่ช่างส่งคืนแล้ว ต้องลบรอบส่งคืนก่อน", () => {
    expect(edit(snap(), (f) => { f.wos[0].cancel = true; }).errors.join(" ")).toMatch(/ลบรอบส่งคืน/);
    expect(edit(snap(), (f) => { f.wos[0].cancel = true; f.subs[0].del = true; }).ops.map((o) => o.kind)).toEqual(["sub_del", "wo_cancel"]);
  });
  it("ลดจำนวนจากป๊อปแก้ไข = รายการสุดท้าย · ห้ามต่ำกว่ายอดส่งคืนหลังแก้", () => {
    const s = snap({ wos: [wo({ received_qty: 15, status: "partial_return" })], subs: [sub({ qty: 15, wage: 750 })] });
    const r = edit(s, (f) => { f.reduce = red(15, "drop", "ช่างส่งคืนไม่ครบ"); });
    expect(r.errors).toEqual([]);
    expect(r.ops.at(-1)).toMatchObject({ kind: "reduce", qty: 15, mode: "drop" });
    expect(r.ops.at(-1)?.label).toMatch(/ลดใบจ่าย WO-1 20 → 15/);
    expect(edit(s, (f) => { f.reduce = red(10, "drop", "x"); }).errors.join(" ")).toMatch(/ส่งคืนแล้ว 15/);
  });
  it("ceRun ติด via=cu_edit + label ทุกคำขอ และหยุดที่รายการแรกที่พัง", async () => {
    const calls: string[] = [];
    const r = edit(snap(), (f) => { f.subs[0].del = true; f.wos[0].cancel = true; });
    const res = await ceRun(r.ops, "m1", async (url, body, method) => {
      calls.push(`${method ?? "POST"} ${url}`);
      if (method === "DELETE" && url.includes("work-orders")) throw new Error("ไม่มีสิทธิ์");
      expect(body === null || (body as { via?: string }).via === "cu_edit").toBe(true);
      return {};
    });
    expect(calls[0]).toMatch(/^DELETE \/api\/mo\/submissions\?id=s1&via=cu_edit&label=/);
    expect(res.map((x) => x.ok)).toEqual([true, false]);
    expect(res[1].msg).toMatch(/ไม่มีสิทธิ์/);
  });
  it("วันที่ตามเวลาไทย", () => {
    expect(ymdTh("2026-10-30T20:00:00+00:00")).toBe("2026-10-31");
    expect(ymdTh(null)).toBeNull();
  });
});

describe("เพิ่มจำนวน (ทำได้มากกว่าสั่ง)", () => {
  const base = snap({ wos: [], subs: [] });
  const inp = (o: Partial<CuInputs> = {}): CuInputs => ({ disp: [{ key: "a", deptId: "d1", qty: 25, date: null }], ret: [], qcGood: 0, qcBad: 0, shelfId: "", cancelReason: "", dates: CU_NO_DATES, ...o });
  it("กติกากลาง: ต้องมากกว่าเดิม · ใบไซส์ไม่ได้ · เกิน 50% = เตือน", () => {
    expect(increaseQtyIssue({ qty: 20, newQty: 25 })).toBeNull();
    expect(increaseQtyIssue({ qty: 20, newQty: 20 })).toMatch(/มากกว่า 20/);
    expect(increaseQtyIssue({ qty: 20, newQty: 25, sized: true })).toMatch(/ไซส์/);
    expect([increaseIsBig(20, 30), increaseIsBig(20, 31)]).toEqual([false, true]);
  });
  it("เพิ่มในใบนี้ 20 → 25: ขั้นแรก = เพิ่มจำนวน แล้วจ่าย 25 ได้ (ไม่เกิน)", () => {
    const f = cuFacts(base);
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ reduce: red(25, "add", "ของพอทำเพิ่ม") }));
    expect(r.errors).toEqual([]);
    expect(r.steps[0]).toMatchObject({ kind: "reduce", from: 20, to: 25, mode: "add" });
    expect(r.steps.find((x) => x.kind === "dispatch")).toMatchObject({ qty: 25 });
    expect(cuReduceSnap(base, red(25, "add")).mo.qty).toBe(25);
  });
  it("แยกส่วนเกินเป็นใบใหม่: ใบนี้คง 20 (จ่ายในใบนี้ได้แค่ 20)", () => {
    const f = cuFacts(base);
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ reduce: red(25, "extra", "ลูกค้าสั่งเพิ่ม") }));
    expect(r.steps[0]).toMatchObject({ kind: "reduce", mode: "extra", to: 25 });
    expect(r.errors.join(" ")).toMatch(/เกิน/);
    expect(cuReduceSnap(base, red(25, "extra"))).toBe(base);
  });
  it("ช่องว่าง / เท่าเดิม = ไม่เปลี่ยน ไม่ขึ้นจุดต้องแก้ · โหมดไม่ตรงทิศ = ให้เลือกใหม่", () => {
    const f = cuFacts(base);
    const ok = inp({ disp: [{ key: "a", deptId: "d1", qty: 20, date: null }] });
    expect(cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), { ...ok, reduce: red(0) }).errors).toEqual([]);
    expect(cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), { ...ok, reduce: red(20) }).steps.some((x) => x.kind === "reduce")).toBe(false);
    expect(cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ reduce: red(25, "split") })).issues.some((x) => x.field === "reduce:mode")).toBe(true);
  });
  it("ป๊อปแก้ไข: ใบจ่ายเกินจำนวนสั่ง → ขึ้นข้อความ · ใส่เพิ่มในใบนี้แล้ว = ผ่าน (แก้ใบจ่ายก่อน แล้วค่อยเพิ่ม)", () => {
    const s = snap({ wos: [wo({ received_qty: 0, status: "dispatched" })], subs: [] });
    expect(edit(s, (f) => { f.wos[0].qty = 25; }).errors.join(" ")).toMatch(/เกินจำนวนสั่งผลิต 20/);
    const r = edit(s, (f) => { f.wos[0].qty = 25; f.reduce = red(25, "add", "ของพอทำเพิ่ม"); });
    expect(r.errors).toEqual([]);
    expect(r.ops.map((o) => o.kind)).toEqual(["wo", "reduce"]);
    expect(r.ops.at(-1)).toMatchObject({ qty: 25, mode: "add" });
  });
});

describe("แสดงผลแบบอ่านง่าย (cuStepParts)", () => {
  it("ตัวเลขเดิมขีดฆ่า ใหม่ตัวหนา เหตุผลเอียง + ป้าย", () => {
    const p = cuStepParts({ kind: "reduce", from: 20, to: 15, reason: "ของไม่พอ", mode: "drop" });
    expect(p.title).toBe("ลดจำนวน");
    expect(p.main.filter((x) => x.old).map((x) => x.t)).toEqual(["20"]);
    expect(p.main.filter((x) => x.b).map((x) => x.t)).toEqual(["15"]);
    expect(p.main.find((x) => x.it)?.t).toBe("ของไม่พอ");
    expect(p.chips).toEqual([{ t: "ไม่ทำแล้ว 5", tone: "bad" }]);
  });
  it("ส่งคืน: ชื่อคนขีดเส้นใต้ · ไม่มีค่าแรง = ป้ายเตือน · วันที่ว่าง = ไม่ระบุวัน", () => {
    const p = cuStepParts({ kind: "return", ref: "auto", qty: 15, date: null, wage: null }, () => "โต๊ะแต๋ว");
    expect(p.main.find((x) => x.who)?.t).toBe("โต๊ะแต๋ว");
    expect(p.chips[0]).toEqual({ t: "ยังไม่ลงค่าแรง", tone: "warn" });
    expect(p.date).toEqual({ t: "ไม่ระบุวัน", none: true });
    expect(cuStepParts({ kind: "reduce", from: 30, to: 35, reason: "x", mode: "add" }).title).toBe("เพิ่มจำนวน");
  });
  it("จ่ายงาน/ส่งคืน: ค่าแรง/ชิ้น × จำนวน = ยอดรวม (ตัวหนา)", () => {
    const d = cuStepParts({ kind: "dispatch", line: "a", qty: 40, date: null, rate: 25 }, () => "ช่างเหมา");
    expect(d.main.map((x) => x.t).join("")).toBe("40 ชิ้น → ช่างเหมา · ฿25/ชิ้น × 40 = ฿1,000");
    expect(d.main.at(-1)).toEqual({ t: "฿1,000", b: true });
    const r = cuStepParts({ kind: "return", ref: "auto", qty: 15, date: "2026-10-29", wage: 50 });
    expect(r.main.at(-1)).toEqual({ t: "฿750", b: true });
  });
});

describe("ค้างช่าง (จ่าย − คืน)", () => {
  it("รวมทุกใบจ่าย + ค้างมากี่วัน (วันจ่าย · ไม่ระบุ = วันสร้างใบ) · ใบยกเลิกไม่นับ", () => {
    const o = cuOutstanding([
      wo({ id: "a", qty: 69, received_qty: 30, status: "partial_return", dispatch_date: "2026-08-15" }),
      wo({ id: "b", qty: 10, received_qty: 10, status: "done" }),
      wo({ id: "c", qty: 5, received_qty: 0, status: "dispatched", dispatch_date: null, created_at: "2026-10-30T02:00:00Z" }),
      wo({ id: "d", qty: 9, received_qty: 0, status: "cancelled" }),
    ], "2026-10-31");
    expect(o.total).toBe(44);
    expect(o.days).toBe(77);
    expect(o.rows.find((x) => x.id === "b")?.days).toBeNull();
    expect(o.rows.find((x) => x.id === "c")?.days).toBe(1);
    expect(cuDaysSince(null)).toBeNull();
  });
  it("ป๊อปแก้ไข: แก้จำนวนใบจ่าย → บอกค้างช่างก่อน → หลังในรายการแก้", () => {
    const s = snap({ wos: [wo({ qty: 69, received_qty: 30, status: "partial_return", labor_cost: 3450 })], subs: [sub({ qty: 30, wage: null })] });
    const r = edit(s, (f) => { f.wos[0].qty = 75; f.reduce = red(75, "add", "ของพอทำเพิ่ม"); });
    expect(r.ops[0].label).toMatch(/จำนวน 69 → 75 · ค้างช่าง 39 → 45/);
  });
});

describe("จ่ายช่างคนอื่นต่อ / จ่ายเพิ่ม", () => {
  const s69 = () => snap({ mo: { qty: 69 }, wos: [wo({ qty: 69, received_qty: 30, status: "partial_return", labor_cost: 3450 })], subs: [sub({ qty: 30, wage: null })] });
  it("แนะนำตามเหตุผล", () => {
    expect([ceRestRecommend("ของไม่พอ"), ceRestRecommend("ลูกค้าลดจำนวน"), ceRestRecommend("ช่างส่งคืนไม่ครบ"), ceRestRecommend("ลงจำนวนผิด")]).toEqual(["split", "drop", "disp", "disp"]);
  });
  it("แก้ตามให้ 69 → 26 + จ่ายช่างคนอื่นต่อ 43 → ใบจ่ายใหม่ (จำนวนสั่งคง 69 · ไม่มีลดจำนวน) ลำดับหลังแก้ใบเดิม", () => {
    const r = edit(s69(), (f) => {
      f.wos[0].qty = 26; f.rest = { mode: "disp", pick: "ช่างส่งคืนไม่ครบ", detail: "" };
      f.newDisp = [{ key: "a", deptId: "d2", crewIds: ["p1"], qty: 43, rate: 50, date: "2026-10-31" }];
    });
    expect(r.errors).toEqual([]);
    expect(r.restDisp).toBe(true);
    expect(r.ops.map((o) => o.kind)).toEqual(["sub", "wo", "dispatch"]);
    expect(r.ops.at(-1)).toMatchObject({ payload: { qty: 43, department_id: "d2", assignee_name: "พี่แอน", labor_cost: 2150, dispatch_date: "2026-10-31", quiet: true, note: "จ่ายต่อจาก WO-1 (แก้ไขใบงาน)" } });
    expect(r.ops.at(-1)?.label).toContain("จ่ายใหม่ 43 ชิ้น → ช่างเหมา · พี่แอน · ฿50/ชิ้น × 43 = ฿2,150");
  });
  it("จ่ายไม่ครบ = เตือนว่ากลับไปรอจ่าย · จ่ายเกิน = ห้าม · ไม่ใส่แถว = ต้องแก้ · งานเหมาต้องเลือกคน", () => {
    const base = (rows: CeForm["newDisp"]) => edit(s69(), (f) => { f.wos[0].qty = 26; f.rest = { mode: "disp", pick: "ช่างส่งคืนไม่ครบ", detail: "" }; f.newDisp = rows; });
    expect(base([{ key: "a", deptId: "d1", crewIds: [], qty: 33, rate: 50, date: null }]).issues.some((x) => x.field === "nd" && /อีก 10 ชิ้น/.test(x.msg))).toBe(true);
    expect(base([{ key: "a", deptId: "d1", crewIds: [], qty: 50, rate: 50, date: null }]).errors.join(" ")).toMatch(/เกิน 7 ชิ้น — ใส่ได้ 43/);
    expect(base([]).errors.join(" ")).toMatch(/แถวจ่ายอย่างน้อย 1 แถว/);
    expect(base([{ key: "a", deptId: "d2", crewIds: [], qty: 43, rate: 50, date: null }]).errors.join(" ")).toMatch(/งานเหมาต้องเลือกคนรับ/);
  });
  it("+ จ่ายเพิ่ม ส่วนที่ยังไม่จ่าย (ไม่มีแก้ตามให้)", () => {
    const s = snap({ mo: { qty: 69 }, wos: [wo({ qty: 26, received_qty: 0 })], subs: [] });
    const r = edit(s, (f) => { f.newDisp = [{ key: "a", deptId: "d1", crewIds: [], qty: 43, rate: null, date: null }]; });
    expect(r.errors).toEqual([]);
    expect(r.dispRoom).toBe(43);
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]).toMatchObject({ kind: "dispatch", payload: { qty: 43, note: "จ่ายเพิ่ม (แก้ไขใบงาน)", assignee_type: "department", assignee_name: "โต๊ะแต๋ว" } });
    expect((r.ops[0] as { payload: Record<string, unknown> }).payload.labor_cost).toBeUndefined();
  });
});
