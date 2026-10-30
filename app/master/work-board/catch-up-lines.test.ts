import { describe, it, expect } from "vitest";
import { cuCentralRate, cuRateFor, cuRetSources, cuRateOfRef, cuRetEffective, cuAutoReturns, cuBomCandidate, type CuDispRow } from "./catch-up-lines";
import { cuFacts, cuBuildSteps, cuDefaultTicks, CU_NO_DATES } from "./catch-up";
import type { CatchUpSnapshot, CatchUpWo } from "@/app/api/mo/catch-up/route";

const wo = (o: Partial<CatchUpWo>): CatchUpWo => ({ id: "w1", wo_no: "WO-1", qty: 0, received_qty: 0, qc_pulled_qty: 0, status: "dispatched",
  department_name: null, assignee_name: null, dispatch_date: null, created_at: "", labor_cost: 0, ...o });
const snap = (o: { wos?: CatchUpWo[]; rates?: CatchUpSnapshot["rates"] } = {}): CatchUpSnapshot => ({
  mo: { id: "m1", mo_no: "MO-1", product_sku: "SKU", product_name: "ชื่อ", qty: 20, status: "draft", due_date: null, internal_due_date: null,
    has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, prep_done: false, cut_done: false, skipped: {}, bom_code: "BOM-1", note: null },
  progress: null, materials: [], wos: o.wos ?? [], shelves: [{ id: "s1", name: "งานรอตรวจ", kind: "normal" }], shelf: { good: 0, defect: 0, repairing: 0 },
  shelfAt: [], rates: o.rates ?? [], reasons: [], past: { mo: [], model: [] }, sales: { so: [], dn: [] },
});
const row = (o: Partial<CuDispRow>): CuDispRow => ({ key: "a", deptId: "d1", crewIds: [], qty: 0, date: null, ...o });
const h = { nickOf: (x: string | null | undefined) => x ?? "", newWho: (r: CuDispRow) => r.crewIds.join(", "), deskName: () => "โต๊ะแต๋ว" };

describe("ค่าแรงจากสูตร (BOM)", () => {
  const s = snap({ rates: [{ craftsman_id: null, rate: 50 }, { craftsman_id: "c9", rate: 60 }] });
  it("ราคากลาง · เลือกช่างคนเดียวที่มีเรตเฉพาะ = เรตคนนั้น · หลายคน = ราคากลาง", () => {
    expect(cuCentralRate(s)).toBe(50);
    expect(cuRateFor(s, ["c9"])).toBe(60);
    expect(cuRateFor(s, ["c9", "c1"])).toBe(50);
    expect(cuRateFor(snap(), [])).toBeNull();
  });
});

describe("ที่มาของรอบส่งคืน", () => {
  it("ใบเดิมที่ยังค้างช่าง + แถวจ่ายใหม่ (หลายช่าง = หลายที่มา) · ค่าแรง/ชิ้นตามใบจ่าย", () => {
    const s = snap({ wos: [wo({ id: "w1", wo_no: "WO-1", qty: 10, received_qty: 4, labor_cost: 500, assignee_name: "ลม" }), wo({ id: "w2", qty: 5, received_qty: 5, status: "done" })] });
    const src = cuRetSources(s, [row({ key: "a", crewIds: ["แมว", "บูรณ์"], qty: 6, rate: 45 }), row({ key: "b", crewIds: [], qty: 4 })], true, h);
    expect(src.map((x) => [x.ref, x.cap, x.rate])).toEqual([["w1", 6, 50], ["new:a", 6, 45], ["new:b", 4, null]]);
    expect(src[1].short).toBe("แมว, บูรณ์ · โต๊ะแต๋ว");
    expect(src[2].short).toBe("ทั้งโต๊ะ · โต๊ะแต๋ว");
  });
  it("ไม่ได้จ่ายรอบนี้ = ไม่นับแถวจ่ายใหม่", () => {
    expect(cuRetSources(snap(), [row({ qty: 10 })], false, h)).toEqual([]);
  });
  it("แบ่งอัตโนมัติใช้ค่าแรงได้เมื่อทุกที่มาราคาเดียวกัน", () => {
    const same = [{ ref: "a", cap: 1, rate: 50, short: "", label: "" }, { ref: "b", cap: 1, rate: 50, short: "", label: "" }];
    expect(cuRateOfRef(same, "auto")).toBe(50);
    expect(cuRateOfRef([...same, { ref: "c", cap: 1, rate: 40, short: "", label: "" }], "auto")).toBeNull();
    expect(cuRateOfRef(same, "b")).toBe(50);
  });
});

describe("ส่งคืนตามยอดจ่ายอัตโนมัติ", () => {
  const src = [{ ref: "new:a", cap: 12, rate: 50, short: "", label: "" }, { ref: "new:b", cap: 8, rate: null, short: "", label: "" }];
  it("1 รอบต่อ 1 ช่างที่จ่าย · เก็บวันที่ที่ใส่ไว้ · ไม่เปลี่ยน = คืนตัวเดิม (ไม่วนอัปเดต)", () => {
    const a = cuAutoReturns(src, []);
    expect(a.map((x) => [x.ref, x.qty])).toEqual([["new:a", 12], ["new:b", 8]]);
    const dated = a.map((x, i) => (i === 0 ? { ...x, date: "2026-10-28" } : x));
    expect(cuAutoReturns(src, dated)).toBe(dated);
    expect(cuAutoReturns([{ ...src[0], cap: 10 }, src[1]], dated)[0]).toMatchObject({ qty: 10, date: "2026-10-28" });
  });
  it("ค่าแรงตอนส่งคืน: ไม่ได้พิมพ์ = ตามใบจ่าย · ยังไม่เลือกที่มา = ช่างที่จ่ายตามลำดับรอบ", () => {
    const eff = cuRetEffective([{ key: "r1", ref: "", qty: 12, date: null }, { key: "r2", ref: "new:b", qty: 8, date: null, wage: 30 }], src);
    expect(eff.map((x) => [x.ref, x.wage])).toEqual([["new:a", 50], ["new:b", 30]]);
  });
});

describe("ค่าแรงที่พิมพ์เอง → เสนอเข้า BOM", () => {
  it("แถวจ่ายที่แก้เองมาก่อน · ไม่ได้แก้ = ค่าแรงที่ใส่ตอนส่งคืน · ไม่มี = null", () => {
    expect(cuBomCandidate([row({ rate: 50 }), row({ key: "b", rate: 55, rateSet: true })], true, [], false)).toBe(55);
    expect(cuBomCandidate([row({ rate: 50 })], true, [{ key: "r", ref: "", qty: 1, date: null, wage: 48 }], true)).toBe(48);
    expect(cuBomCandidate([row({ rate: 50, rateSet: true })], false, [], false)).toBeNull();
  });
});

describe("ตารางเป็นชุด = กติกาเดียวกับป๊อปทีละใบ", () => {
  it("จ่าย 2 แถว (หลายช่าง) แล้วส่งคืนครบตามยอดจ่ายอัตโนมัติ → ใบจ่าย 2 ใบ + ส่งคืน 2 รอบ ค่าแรงตามใบจ่าย", () => {
    const s = snap({ rates: [{ craftsman_id: null, rate: 50 }] });
    const f = cuFacts(s);
    const disp = [row({ key: "a", crewIds: ["c1", "c2"], qty: 12, rate: 50 }), row({ key: "b", crewIds: ["c3"], qty: 8, rate: 50 })];
    const src = cuRetSources(s, disp, true, h);
    const ret = cuRetEffective(cuAutoReturns(src, []), src);
    const { steps, errors } = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), {
      disp: disp.map((x) => ({ ...x, deskName: "โต๊ะแต๋ว", crewCount: x.crewIds.length })), ret,
      qcGood: 0, qcBad: 0, shelfId: "", cancelReason: "", dates: CU_NO_DATES, centralRate: 50,
    }, s.wos);
    expect(errors).toEqual([]);
    expect(steps.filter((x) => x.kind === "dispatch").map((x) => x.kind === "dispatch" && x.qty)).toEqual([12, 8]);
    expect(steps.filter((x) => x.kind === "return").map((x) => x.kind === "return" && [x.ref, x.qty, x.wage])).toEqual([["new:a", 12, 50], ["new:b", 8, 50]]);
  });
});
