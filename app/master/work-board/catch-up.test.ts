import { describe, it, expect } from "vitest";
import { cuFacts, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuRows, cuTargetBlocked, cuAllocate, cuRun, cuUndo, cuIrreversible, CU_NO_DATES, cuFactsDiff, cuWhen, cuLocate, cuLocateSnap, type CuInputs, type CuContext } from "./catch-up";
import type { CatchUpSnapshot, CatchUpWo } from "@/app/api/mo/catch-up/route";

const wo = (o: Partial<CatchUpWo>): CatchUpWo => ({ id: "w1", wo_no: "WO-1", qty: 0, received_qty: 0, qc_pulled_qty: 0, status: "dispatched",
  department_name: null, assignee_name: null, dispatch_date: null, created_at: "", labor_cost: 0, ...o });
const snap = (o: { mo?: Partial<CatchUpSnapshot["mo"]>; progress?: CatchUpSnapshot["progress"]; wos?: CatchUpWo[]; good?: number } = {}): CatchUpSnapshot => ({
  mo: { id: "m1", mo_no: "MO-1", product_sku: "SKU", product_name: "ชื่อ", qty: 100, status: "draft", due_date: null, internal_due_date: null,
    has_bom: true, prep_total: 4, prep_ready: 0, cut_total: 2, cut_ready: 0, prep_done: false, cut_done: false, skipped: {}, bom_code: "BOM-1", note: null, ...o.mo },
  progress: o.progress === undefined ? { total: 4, buy: 2, requested: 0, ordered: 0 } : o.progress,
  materials: [{ sku: "FAB", name: "ผ้า", status: "have", ready: false }, { sku: "ZIP", name: "ซิป", status: "buy", ready: false }],
  wos: o.wos ?? [], shelves: [], shelf: { good: o.good ?? 0, defect: 0, repairing: 0 }, shelfAt: [], rates: [], reasons: [], past: { mo: [], model: [] }, sales: { so: [], dn: [] },
});
/** ค่าตั้งต้น = จ่าย 1 แถว 100 ชิ้น โต๊ะ d1 · ส่งคืน 1 รอบ 100 ชิ้น (อัตโนมัติ) */
const inp = (o: Partial<CuInputs> & { dq?: number; rq?: number } = {}): CuInputs => {
  const { dq = 100, rq = 100, ...rest } = o;
  return { disp: [{ key: "a", deptId: "d1", qty: dq, date: null }], ret: [{ key: "r", ref: "auto", qty: rq, date: null }],
    qcGood: 100, qcBad: 0, shelfId: "s1", cancelReason: "", dates: CU_NO_DATES, ...rest };
};
const ctx = (s = snap()): CuContext => ({ snap: s, disp: {
  a: { dept: { id: "d1", name: "โต๊ะแต๋ว" }, who: { assignee_type: "craftsman", assignee_name: "ลม" } },
  b: { dept: { id: "d2", name: "ช่างเหมา" }, who: { assignee_type: "craftsman", assignee_name: "แพง" } },
}, shelfId: "s1", badReason: "" });

describe("cuFacts", () => {
  it("ของครบ = ติ๊กเตรียมครบ / ไม่มีอะไรต้องซื้อ / มีป้ายข้าม", () => {
    expect(cuFacts(snap()).buyDone).toBe(false);
    expect(cuFacts(snap({ mo: { prep_ready: 4 } })).buyDone).toBe(true);
    expect(cuFacts(snap({ progress: { total: 4, buy: 0, requested: 0, ordered: 0 } })).buyDone).toBe(true);
    expect(cuFacts(snap({ mo: { skipped: { buy: { by: null, by_name: null, at: "", reason: null } } } })).buyDone).toBe(true);
  });
  it("รวมยอดจ่าย/คืน/ดึงเข้า QC จากทุกใบจ่ายงาน", () => {
    const f = cuFacts(snap({ wos: [wo({ qty: 60, received_qty: 60, qc_pulled_qty: 20 }), wo({ id: "w2", qty: 40, received_qty: 10 })] }));
    expect([f.dispatched, f.received, f.qcPulled]).toEqual([100, 70, 20]);
  });
});

describe("ติ๊กอัตโนมัติ", () => {
  it("เลือกจ่ายงานแล้ว → ติ๊ก ของครบ เตรียม ตัด จ่าย", () => {
    expect(cuDefaultTicks(cuFacts(snap()), "dispatch")).toEqual({ have: true, prep: true, cut: true, dispatch: true });
  });
  it("ขั้นที่มีในระบบแล้วไม่ติ๊กซ้ำ · ติ๊กเตรียม = ของครบในตัว", () => {
    const rows = cuRows(cuFacts(snap({ mo: { cut_ready: 2 } })), "dispatch", { prep: true });
    expect(rows.find((r) => r.stage === "cut")?.state).toBe("done");
    expect(rows.find((r) => r.stage === "have")?.state).toBe("implied");
    expect(rows.find((r) => r.stage === "dispatch")?.state).toBe("need");
  });
});

describe("cuBuildSteps", () => {
  it("จ่ายไปก่อนตัด: เอาติ๊กเตรียม/ตัดออก → ติดป้ายของครบ + สร้างใบจ่าย", () => {
    const { steps, errors } = cuBuildSteps(cuFacts(snap()), "dispatch", { have: true, prep: false, cut: false, dispatch: true }, inp());
    expect(errors).toEqual([]);
    expect(steps.map((s) => s.kind)).toEqual(["skip_buy", "dispatch"]);
  });
  it("QC รับเข้าชั้น → ติ๊ก/จ่าย/คืน/รับเข้า ครบ และต้องเลือกชั้น", () => {
    const f = cuFacts(snap());
    expect(cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp()).steps.map((s) => s.kind)).toEqual(["mark_ready", "dispatch", "return", "qc_in"]);
    expect(cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp({ shelfId: "" })).errors.join(" ")).toMatch(/เลือกชั้นที่วางของดี/);
  });
  it("ส่งคืนบางส่วนต้องใส่จำนวน และไม่เกินที่ค้างช่าง", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 100 })] }));
    expect(cuDefaultQty(f, "return_part").returnQty).toBe(0);
    expect(cuBuildSteps(f, "return_part", cuDefaultTicks(f, "return_part"), inp({ rq: 0 })).errors[0]).toMatch(/มากกว่า 0/);
    expect(cuBuildSteps(f, "return_part", cuDefaultTicks(f, "return_part"), inp({ rq: 120 })).errors[0]).toMatch(/เกินที่ค้างช่าง 100/);
    expect(cuBuildSteps(f, "return_part", cuDefaultTicks(f, "return_part"), inp({ rq: 60 })).steps).toEqual([{ kind: "return", ref: "auto", qty: 60, date: null }]);
  });
  it("เคยจ่ายไปบางส่วน → จ่ายเพิ่ม 0 ได้", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 60 })] }));
    const r = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ dq: 0, rq: 60 }), [wo({ qty: 60 })]);
    expect(r.errors).toEqual([]);
    expect(r.steps.map((s) => s.kind)).toEqual(["return"]);
  });
  it("ปิดใบต้องคืนครบทุกชิ้น · ค่าตั้งต้นผ่าน QC + ส่งออก", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 100 })] }));
    expect(cuBuildSteps(f, "close", { return: true, close: true }, inp({ rq: 50 }), [wo({ qty: 100 })]).errors[0]).toMatch(/ส่งคืนครบ/);
    expect(cuBuildSteps(f, "close", { return: true, close: true }, inp(), [wo({ qty: 100 })]).steps.map((s) => s.kind)).toEqual(["return", "close"]);
    expect(cuBuildSteps(f, "close", cuDefaultTicks(f, "close"), inp(), [wo({ qty: 100 })]).steps.map((s) => s.kind)).toEqual(["return", "qc_in", "ship", "close"]);
  });
  it("ยกเลิกได้เฉพาะใบที่ยังไม่จ่าย และต้องมีเหตุผล", () => {
    expect(cuTargetBlocked(cuFacts(snap({ wos: [wo({ qty: 10 })] })), "cancel")).toMatch(/ยกเลิกไม่ได้/);
    expect(cuBuildSteps(cuFacts(snap()), "cancel", {}, inp()).errors).toEqual(["ใส่เหตุผลที่ยกเลิกก่อน"]);
    expect(cuBuildSteps(cuFacts(snap()), "cancel", {}, inp({ cancelReason: "ลูกค้ายกเลิก" })).steps).toEqual([{ kind: "cancel", reason: "ลูกค้ายกเลิก", date: null }]);
  });
  it("ขั้นที่เลือกบันทึกครบแล้ว → แจ้งว่าไม่มีอะไรต้องทำ", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
    expect(cuBuildSteps(f, "cut", cuDefaultTicks(f, "cut"), inp()).errors[0]).toMatch(/ครบแล้ว/);
  });
});

describe("แยกแถว + วันที่", () => {
  const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
  it("จ่ายหลายช่าง = หลายใบจ่าย แต่ละใบมีวันที่ของตัวเอง", () => {
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ disp: [{ key: "a", deptId: "d1", qty: 60, date: "2026-10-01" }, { key: "b", deptId: "d2", qty: 40, date: null }] }));
    expect(r.errors).toEqual([]);
    expect(r.steps).toEqual([{ kind: "dispatch", line: "a", qty: 60, date: "2026-10-01" }, { kind: "dispatch", line: "b", qty: 40, date: null }]);
  });
  it("จ่ายรวมเกิน / แถวไม่มีโต๊ะ → เตือน", () => {
    const over = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ disp: [{ key: "a", deptId: "d1", qty: 80, date: null }, { key: "b", deptId: "", qty: 40, date: null }] }));
    // จ่ายเกิน = กรอบแดงที่ช่องจำนวนของแถวที่ทำให้เกิน (แถว 2) ไม่ใช่แค่ข้อความรวม
    expect(over.issues.find((x) => x.field === "disp:b:qty")?.msg).toBe("เกิน 20 ชิ้น — ใส่ได้ 20");
    expect(over.issues.some((x) => x.field === "disp:a:qty")).toBe(false);
    expect(over.errors.join(" ")).toMatch(/แถวจ่าย 2: เลือกโต๊ะ/);
    // ส่งคืนเกิน = เหมือนกัน (รอบที่ทำให้เกิน)
    const rr = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ ret: [{ key: "r1", ref: "auto", qty: 70, date: null }, { key: "r2", ref: "auto", qty: 50, date: null }] }));
    expect(rr.issues.find((x) => x.field === "ret:r2:qty")?.msg).toBe("เกิน 20 ชิ้น — ใส่ได้ 30");
  });
  it("ส่งคืนหลายรอบ ระบุใบได้ · เกินยอดของใบนั้น = เตือน", () => {
    const disp = [{ key: "a", deptId: "d1", qty: 60, date: null }, { key: "b", deptId: "d2", qty: 40, date: null }];
    const ok = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ disp, ret: [{ key: "r1", ref: "new:a", qty: 60, date: "2026-10-05" }, { key: "r2", ref: "new:b", qty: 40, date: "2026-10-09" }] }));
    expect(ok.errors).toEqual([]);
    expect(ok.steps.filter((s) => s.kind === "return")).toEqual([{ kind: "return", ref: "new:a", qty: 60, date: "2026-10-05" }, { kind: "return", ref: "new:b", qty: 40, date: "2026-10-09" }]);
    const bad = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ disp, ret: [{ key: "r1", ref: "new:b", qty: 50, date: null }, { key: "r2", ref: "auto", qty: 50, date: null }] }));
    expect(bad.errors[0]).toMatch(/รอบส่งคืน 1: ใบนั้นค้างช่างแค่ 40/);
  });
  it("วันที่ของทุกขั้นไปถึง API", async () => {
    const dates = { ...CU_NO_DATES, ready: "2026-09-20", qc: "2026-10-10", ship: "2026-10-11", close: "2026-10-12" };
    const s0 = snap();
    const f0 = cuFacts(s0);
    const { steps, errors } = cuBuildSteps(f0, "close", cuDefaultTicks(f0, "close"), inp({ dates, disp: [{ key: "a", deptId: "d1", qty: 100, date: "2026-09-25" }],
      ret: [{ key: "r1", ref: "new:a", qty: 70, date: "2026-10-01" }, { key: "r2", ref: "new:a", qty: 30, date: "2026-10-08" }] }));
    expect(errors).toEqual([]);
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const api = async (url: string, body: unknown) => {
      calls.push({ url, body: body as Record<string, unknown> });
      if (url === "/api/mo/work-orders") return { id: "new1", wo_no: "WO-9" };
      if (url === "/api/qc-warehouse/items" && (body as { action: string }).action === "receive") return { items: [{ id: "it1", status: "good", qty: 100 }] };
      return {};
    };
    const res = await cuRun(steps, ctx(s0), api);
    expect(res.every((r) => r.ok)).toBe(true);
    const by = (u: string) => calls.filter((c) => c.url.includes(u)).map((c) => c.body);
    expect(by("mark-ready")[0]).toMatchObject({ done_date: "2026-09-20" });
    expect(by("work-orders")[0]).toMatchObject({ dispatch_date: "2026-09-25", quiet: true, assignee_name: "ลม" });
    expect(by("submissions")).toEqual([
      { wo_id: "new1", qty: 70, wage: null, info_pending: true, quiet: true, submitted_at: "2026-10-01" },
      { wo_id: "new1", qty: 30, wage: null, info_pending: true, quiet: true, submitted_at: "2026-10-08" },
    ]);
    expect(by("qc-warehouse")[0]).toMatchObject({ action: "receive", date: "2026-10-10" });
    expect(by("qc-warehouse")[1]).toMatchObject({ action: "ship", item_id: "it1", date: "2026-10-11" });
    expect(by("bulk-status")[0]).toMatchObject({ action: "close", date: "2026-10-12", source: "catch_up" });
  });
});

describe("เตือนรายช่อง (กฎเดียวกับป๊อปปกติ)", () => {
  const f = cuFacts(snap());
  const warns = (r: ReturnType<typeof cuBuildSteps>) => r.issues.filter((x) => x.level === "warn").map((x) => x.msg).join(" | ");
  it("ช่องที่ผิดบอกตำแหน่ง (field) ไว้ทำกรอบแดง", () => {
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ disp: [{ key: "a", deptId: "", qty: 10, date: null }] }));
    expect(r.issues.find((x) => x.level === "error")).toMatchObject({ field: "disp:a:dept", msg: "เลือกโต๊ะก่อน" });
  });
  it("โต๊ะเหมาต้องเลือกช่าง", () => {
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({ disp: [{ key: "a", deptId: "d2", deskName: "ช่างเหมา", crewCount: 0, qty: 100, date: null }] }));
    expect(r.issues.find((x) => x.field === "disp:a:crew")?.msg).toMatch(/งานเหมา/);
  });
  it("จ่ายก่อนตัด = เตือนยังไม่พร้อม · จ่ายไม่ครบ = เตือน (บันทึกได้)", () => {
    const r = cuBuildSteps(f, "dispatch", { have: true, prep: true, cut: false, dispatch: true }, inp({ dq: 60 }));
    expect(r.errors).toEqual([]);
    expect(warns(r)).toMatch(/ยังไม่ได้ติ๊กตัด/);
    expect(warns(r)).toMatch(/ยังเหลือ 40 ชิ้นที่ยังไม่จ่าย/);
  });
  it("วันที่ส่งคืนก่อนวันจ่าย / อยู่ในอนาคต = เตือน", () => {
    const r = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ today: "2026-10-28",
      disp: [{ key: "a", deptId: "d1", qty: 100, date: "2026-10-10" }], ret: [{ key: "r", ref: "new:a", qty: 60, date: "2026-10-05" }, { key: "s", ref: "new:a", qty: 40, date: "2026-11-02" }] }));
    expect(r.errors).toEqual([]);
    expect(r.issues.find((x) => x.field === "ret:r:date")?.msg).toMatch(/ก่อนวันที่จ่าย/);
    expect(r.issues.find((x) => x.field === "ret:s:date")?.msg).toMatch(/อนาคต/);
  });
  it("ค่าแรง/ชิ้นสูงกว่าราคากลางเกิน 2 เท่า = เตือน · ของเสียต้องเลือกสาเหตุ", () => {
    const r = cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp({ centralRate: 20, ret: [{ key: "r", ref: "auto", qty: 100, date: null, wage: 2000 }], qcGood: 95, qcBad: 5 }));
    expect(r.issues.find((x) => x.field === "ret:r:wage")?.level).toBe("warn");
    expect(r.issues.find((x) => x.field === "qc:reason")).toMatchObject({ level: "error", msg: "เลือกสาเหตุของเสีย" });
    expect(cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp({ qcGood: 95, qcBad: 5, badReason: "เย็บเบี้ยว" })).errors).toEqual([]);
  });
  it("ค่าแรงไปถึง API: จ่าย = ต่อชิ้น×จำนวน · ส่งคืนมีค่าแรง+วัน = ไม่ติดป้ายค้าง", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const api = async (url: string, body: unknown) => { calls.push({ url, body: body as Record<string, unknown> }); return url.endsWith("work-orders") ? { id: "new1", wo_no: "WO-1" } : {}; };
    await cuRun([{ kind: "dispatch", line: "a", qty: 10, date: null, rate: 25 }, { kind: "return", ref: "new:a", qty: 10, date: "2026-10-20", wage: 25 }], ctx(), api);
    expect(calls[0].body).toMatchObject({ labor_cost: 250 });
    expect(calls[1].body).toMatchObject({ wage: 250, info_pending: false, submitted_at: "2026-10-20" });
  });
});

describe("ยังขาดของอยู่", () => {
  it("ติ๊กยังขาดของ → ไม่ติดป้ายของครบ · ติ๊กเตรียม/ตัดยกเว้นตัวที่ขาด", () => {
    const f = cuFacts(snap());
    const ticks = { ...cuDefaultTicks(f, "dispatch"), short: true };
    expect(cuRows(f, "dispatch", ticks).find((r) => r.stage === "have")?.state).toBe("short");
    const r = cuBuildSteps(f, "dispatch", ticks, inp({ missing: ["ZIP"] }));
    expect(r.errors).toEqual([]);
    expect(r.steps[0]).toEqual({ kind: "mark_ready", parts: ["prep", "cut"], except: ["ZIP"], date: null });
    expect(r.steps.some((s) => s.kind === "skip_buy")).toBe(false);
  });
  it("ติ๊กยังขาดของแต่ไม่เลือกอะไร → เตือน", () => {
    const f = cuFacts(snap());
    expect(cuBuildSteps(f, "dispatch", { ...cuDefaultTicks(f, "dispatch"), short: true }, inp({ missing: [] })).errors[0]).toMatch(/ยังขาด/);
  });
  it("จ่ายก่อนเตรียม + ยังขาดของ → ไม่บันทึกอะไรเรื่องของ", () => {
    const r = cuBuildSteps(cuFacts(snap()), "dispatch", { have: true, prep: false, cut: false, dispatch: true, short: true }, inp({ missing: ["ZIP"] }));
    expect(r.steps.map((s) => s.kind)).toEqual(["dispatch"]);
  });
});

describe("ข้อมูลเพิ่มเติม + ค่าแรงกลับ BOM", () => {
  const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
  it("ปัญหา/หมายเหตุ/ค่าแรงเข้า BOM ต่อท้ายขั้นสถานะ · แถวปัญหาว่างไม่นับ", () => {
    const r = cuBuildSteps(f, "dispatch", cuDefaultTicks(f, "dispatch"), inp({
      problems: [{ key: "p1", text: "ผ้าไม่ตรงสี", severity: "medium", qty: 2, model: true }, { key: "p2", text: " ", severity: "low", qty: null, model: false }],
      teamNote: "ลูกค้าขอเลื่อน", bomRate: 25,
    }));
    expect(r.errors).toEqual([]);
    expect(r.steps.map((s) => s.kind)).toEqual(["dispatch", "problem", "note", "bom_rate"]);
  });
  it("ใบที่บันทึกครบแล้วยังเพิ่มปัญหาอย่างเดียวได้", () => {
    const done = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
    const r = cuBuildSteps(done, "cut", cuDefaultTicks(done, "cut"), inp({ problems: [{ key: "p", text: "ตัดเบี้ยว", severity: "high", qty: null, model: false }] }));
    expect(r.errors).toEqual([]);
    expect(r.steps.map((s) => s.kind)).toEqual(["problem"]);
  });
  it("QC รับไม่หมด = เตือนยังเหลือในคิว", () => {
    const r = cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp({ qcGood: 16, qcBad: 2, badReason: "เย็บเบี้ยว", rq: 20, disp: [{ key: "a", deptId: "d1", qty: 20, date: null }] }));
    expect(r.issues.find((x) => x.field === "qc:good" && x.level === "warn")?.msg).toMatch(/ยังเหลือรอ QC 2 ชิ้น/);
  });
  it("ส่งไป API: ปัญหา + ปัญหาของรุ่น · หมายเหตุต่อท้าย · ค่าแรงเข้า BOM ราคากลาง · หมายเหตุถึงช่างติดใบจ่าย", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const api = async (url: string, body: unknown) => { calls.push({ url, body: body as Record<string, unknown> }); return url.endsWith("work-orders") ? { id: "w9", wo_no: "WO-9" } : {}; };
    const s0 = snap({ mo: { note: "เดิม" } });
    await cuRun([
      { kind: "dispatch", line: "a", qty: 5, date: null, note: "ใช้ด้ายเข้ม" },
      { kind: "problem", text: "ผ้าไม่ตรงสี", severity: "medium", qty: 2, model: true },
      { kind: "note", text: "ลูกค้าขอเลื่อน" },
      { kind: "bom_rate", rate: 25 },
    ], ctx(s0), api);
    expect(calls[0].body).toMatchObject({ note: "ใช้ด้ายเข้ม · อัปเดตย้อนหลัง" });
    expect(calls[1]).toMatchObject({ url: "/api/mo/issues", body: { mo_no: "MO-1", defect_type: "ผ้าไม่ตรงสี", severity: "medium", qty: 2 } });
    expect(calls[2]).toMatchObject({ url: "/api/parent-sku-issues", body: { sku: "SKU", problem_text: "ผ้าไม่ตรงสี" } });
    expect(calls[3].url).toBe("/api/mo/m1");
    expect(String(calls[3].body.note)).toMatch(/^เดิม\n\[อัปเดตงาน .+\] ลูกค้าขอเลื่อน$/);
    expect(calls[4]).toMatchObject({ url: "/api/bom/labor-rates", body: { bom_code: "BOM-1", craftsman_id: null, craftsman_name: "ราคากลาง", rate: 25 } });
  });
});

describe("ย้อนการอัปเดต + ปลายทางส่งออก", () => {
  it("แถวจ่ายยังไม่เลือกโต๊ะ → ส่งคืนจากแถวนั้นไม่เตือนซ้อนว่าค้างช่าง 0", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
    const r = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ disp: [{ key: "a", deptId: "", qty: 100, date: null }], ret: [{ key: "r", ref: "new:a", qty: 100, date: null }] }));
    expect(r.errors).toEqual(["จ่ายงาน: เลือกโต๊ะก่อน"]);
  });
  const fakeApi = (calls: { url: string; body: unknown; method?: string }[]) => async (url: string, body: unknown, method?: string) => {
    calls.push({ url, body, method });
    if (url === "/api/mo/work-orders") return { id: "w1", wo_no: "WO-1" };
    if (url === "/api/mo/submissions") return { id: `s${calls.length}` };
    if (url === "/api/qc-warehouse/items" && (body as { action: string }).action === "receive") return { items: [{ id: "it1", status: "good", qty: 8 }, { id: "it2", status: "defect", qty: 2 }] };
    if (url === "/api/mo/issues") return { id: "iss1" };
    if (url === "/api/parent-sku-issues") return { id: "pi1", duplicated: true };
    if (url === "/api/bom/labor-rates") return { id: "br1" };
    return {};
  };
  it("ย้อนจากหลังไปหน้า: QC คืนคิว → ลบส่งคืน → ยกเลิกใบจ่าย → คืนติ๊กเฉพาะตัวที่เพิ่งติ๊ก · ไม่ลบปัญหาของรุ่นที่มีอยู่ก่อน", async () => {
    const calls: { url: string; body: unknown; method?: string }[] = [];
    const s0 = snap({ mo: { prep_ready: 1, cut_ready: 0 } });
    s0.materials = [{ sku: "FAB", name: "ผ้า", status: "have", ready: true }, { sku: "ZIP", name: "ซิป", status: "buy", ready: false }];
    s0.rates = [{ craftsman_id: null, rate: 20 }];
    const res = await cuRun([
      { kind: "mark_ready", parts: ["prep", "cut"], date: null },
      { kind: "dispatch", line: "a", qty: 10, date: null },
      { kind: "return", ref: "new:a", qty: 10, date: null },
      { kind: "qc_in", good: 8, bad: 2, date: null },
      { kind: "problem", text: "ผ้าไม่ตรงสี", severity: "medium", qty: null, model: true },
      { kind: "bom_rate", rate: 30 },
    ], { ...ctx(s0), badReason: "เย็บเบี้ยว" }, fakeApi(calls));
    expect(res.every((r) => r.ok)).toBe(true);
    expect(cuIrreversible(res)).toBeUndefined();
    const undoCalls: { url: string; body: unknown; method?: string }[] = [];
    const out = await cuUndo(res, ctx(s0), fakeApi(undoCalls));
    expect(out.every((x) => x.ok)).toBe(true);
    expect(undoCalls.map((c) => `${c.method ?? "POST"} ${c.url}`)).toEqual([
      "DELETE /api/bom/labor-rates?id=br1", "POST /api/bom/labor-rates",
      "DELETE /api/mo/issues?id=iss1",
      "POST /api/qc-warehouse/items", "POST /api/qc-warehouse/items",
      "DELETE /api/mo/submissions?id=s3",
      "DELETE /api/mo/work-orders/w1",
      "PATCH /api/mo/m1/mark-ready", "PATCH /api/mo/m1/mark-ready",
    ]);
    expect(undoCalls[1].body).toMatchObject({ rate: 20 });   // คืนราคากลางเดิม
    expect(undoCalls[3].body).toEqual({ action: "return_queue", item_id: "it1" });
    expect(undoCalls[7].body).toEqual({ ready: false, parts: ["prep"], only: ["ZIP"] });   // FAB ติ๊กไว้ก่อนแล้ว ไม่คืน
    expect(undoCalls[8].body).toEqual({ ready: false, parts: ["cut"] });
  });
  it("ส่งออก/ปิดใบสำเร็จแล้ว = ย้อนไม่ได้ทั้งชุด · ส่งออกไปคลังที่เลือก", async () => {
    const calls: { url: string; body: unknown; method?: string }[] = [];
    const res = await cuRun([
      { kind: "qc_in", good: 8, bad: 0, date: null },
      { kind: "ship", qty: 8, date: null, mode: "sales_wh", wh: "โกดังขายหลัก" },
    ], ctx(snap({ wos: [wo({ qty: 10, received_qty: 10 })] })), fakeApi(calls));
    expect(calls[1].body).toMatchObject({ action: "ship", item_id: "it1", mode: "sales_wh", wh: "โกดังขายหลัก" });
    expect(cuIrreversible(res)?.why).toMatch(/ส่งออก/);
    const out = await cuUndo(res, ctx(), fakeApi([]));
    expect(out).toEqual([{ ok: false, msg: expect.stringMatching(/ย้อนจากที่นี่ไม่ได้/) }]);
  });
  it("ตัดไว้บางส่วนก่อนหน้า = ย้อนติ๊กตัดไม่ได้ (บอกให้ย้อนเอง)", async () => {
    const s0 = snap({ mo: { cut_ready: 1 } });
    const res = await cuRun([{ kind: "mark_ready", parts: ["cut"], date: null }], ctx(s0), fakeApi([]));
    const out = await cuUndo(res, ctx(s0), fakeApi([]));
    expect(out[0]).toMatchObject({ ok: false, msg: expect.stringMatching(/ตัดไว้บางส่วน/) });
  });
});

describe("cuAllocate", () => {
  it("แบ่งตามลำดับ ไม่เกินเพดานแต่ละแถว", () => {
    expect(cuAllocate([{ id: "a", c: 30 }, { id: "b", c: 0 }, { id: "c", c: 50 }], 60, (r) => r.c)).toEqual([{ id: "a", qty: 30 }, { id: "c", qty: 30 }]);
  });
});

describe("cuRun", () => {
  it("ส่งคืนอัตโนมัติเข้าใบที่เพิ่งสร้าง · stage ตามโต๊ะ", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const api = async (url: string, body: unknown) => { calls.push({ url, body: body as Record<string, unknown> }); return url.endsWith("work-orders") ? { id: "new", wo_no: "WO-9" } : {}; };
    const res = await cuRun([{ kind: "dispatch", line: "a", qty: 100, date: null }, { kind: "return", ref: "auto", qty: 40, date: null }], ctx(), api);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(calls[0].body).toMatchObject({ qty: 100, dispatch_date: null, quiet: true, stage: "assemble" });
    expect(calls[1]).toMatchObject({ url: "/api/mo/submissions", body: { wo_id: "new", qty: 40, info_pending: true, quiet: true } });
    expect(calls[1].body.submitted_at).toBeUndefined();
  });
  it("ขั้นไหนพังหยุดตรงนั้น", async () => {
    const api = async (url: string) => { if (url.includes("mark-ready")) throw new Error("ไม่มีสิทธิ์"); return {}; };
    const res = await cuRun([{ kind: "skip_buy", date: null }, { kind: "mark_ready", parts: ["prep"], date: null }, { kind: "close", date: null }], ctx(), api);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(res[1].msg).toBe("ไม่มีสิทธิ์");
  });
});

describe("คำขออัปเดตงาน (พนักงานส่ง → หัวหน้ายืนยัน)", () => {
  it("ใบไม่เปลี่ยนหลังส่งคำขอ = ไม่มีอะไรเตือน · เปลี่ยน = บอกทีละเรื่อง", () => {
    const before = cuFacts(snap({ wos: [wo({ qty: 10, received_qty: 0 })] }));
    expect(cuFactsDiff(before, before)).toEqual([]);
    const now = cuFacts(snap({ mo: { status: "done" }, wos: [wo({ qty: 10, received_qty: 10 }), wo({ id: "w2", qty: 5, received_qty: 0 })] }));
    const d = cuFactsDiff(before, now);
    expect(d).toContain("จ่ายงาน 10 → 15 ชิ้น");
    expect(d).toContain("ช่างส่งคืน 0 → 10 ชิ้น");
    expect(d.some((x) => x.startsWith("สถานะใบ"))).toBe(true);
  });
  it("เวลาส่งคำขอแบบอ่านง่าย (เวลาไทย ไม่ขึ้นกับเครื่อง)", () => {
    const now = new Date("2026-10-29T05:00:00Z");   // 12:00 เวลาไทย
    expect(cuWhen("2026-10-29T04:59:40Z", now)).toBe("เมื่อสักครู่");
    expect(cuWhen("2026-10-29T04:45:00Z", now)).toBe("15 นาทีที่แล้ว");
    expect(cuWhen("2026-10-29T02:00:00Z", now)).toBe("3 ชม.ที่แล้ว");
    expect(cuWhen("2026-10-28T22:30:00Z", now)).toBe("วันนี้ 05:30");
    expect(cuWhen("2026-10-28T07:05:00Z", now)).toBe("เมื่อวาน 14:05");
    expect(cuWhen("2026-10-26T16:59:00Z", now)).toBe("26 ต.ค. 23:59");
    expect(cuWhen("ไม่ใช่วันที่", now)).toBe("");
  });
});

describe("ตอนนี้ของอยู่ไหน", () => {
  const base = { qty: 20, status: "draft", dispatched: 0, received: 0, qcPulled: 0, shelfAt: [] as { name: string; qty: number; status: string }[] };
  it("ยังไม่จ่าย = รอจ่าย (อยู่บนบอร์ด)", () => {
    expect(cuLocate(base)).toMatchObject({ key: "pend", onBoard: true, parts: [{ key: "pend", qty: 20 }] });
  });
  it("ช่างส่งคืนครบ ยังไม่รับเข้า QC = รอ QC รับเข้า (เคส PIX12-01)", () => {
    expect(cuLocate({ ...base, dispatched: 20, received: 20 })).toMatchObject({ key: "qc", label: "รอ QC รับเข้า", parts: [{ key: "qc", qty: 20 }] });
  });
  it("รับเข้า QC แล้ว = อยู่โกดัง QC ชั้นไหน (ไม่อยู่บนบอร์ดแล้ว)", () => {
    const w = cuLocate({ ...base, dispatched: 20, received: 20, qcPulled: 20, shelfAt: [{ name: "งานรอตรวจ", qty: 18, status: "good" }, { name: "ชั้นของเสีย", qty: 2, status: "defect" }] });
    expect(w).toMatchObject({ key: "shelf", onBoard: false });
    expect(w.parts.map((p) => p.label)).toEqual(["โกดัง QC · งานรอตรวจ", "ของเสีย · ชั้นของเสีย"]);
  });
  it("ใบเดียวอยู่หลายขั้น: รอจ่าย + อยู่กับช่าง + รอ QC", () => {
    expect(cuLocate({ ...base, dispatched: 15, received: 8, qcPulled: 3 }).parts.map((p) => [p.key, p.qty])).toEqual([["pend", 5], ["wip", 7], ["qc", 5]]);
  });
  it("ส่งออกครบแล้ว = รอปิดใบ · ปิดแล้ว/ยกเลิก", () => {
    expect(cuLocate({ ...base, dispatched: 20, received: 20, qcPulled: 20 }).key).toBe("close_wait");
    expect(cuLocate({ ...base, status: "done" }).key).toBe("closed");
    expect(cuLocate({ ...base, status: "cancelled" }).key).toBe("cancelled");
  });
  it("จากข้อมูลตั้งต้นของป๊อป", () => {
    expect(cuLocateSnap(snap({ mo: { qty: 10 }, wos: [wo({ qty: 10, received_qty: 10 })] })).key).toBe("qc");
  });
});

describe("แบ่งส่งออกตามใบขาย (ขายออกบางส่วน)", () => {
  const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
  const ship = (o: Partial<CuInputs>) => cuBuildSteps(f, "ship", cuDefaultTicks(f, "ship"), inp({ shipMode: "sell", ...o }));
  it("ขาย 50 · ที่เหลือเข้าคลังขาย = ส่งออก 2 ขั้น", () => {
    const r = ship({ shipSell: 50, shipRest: "sales_wh", shipWh: "คลังหลัก" });
    expect(r.errors).toEqual([]);
    expect(r.steps.filter((s) => s.kind === "ship")).toEqual([
      { kind: "ship", qty: 50, date: null, mode: "sell", wh: null },
      { kind: "ship", qty: 50, date: null, mode: "sales_wh", wh: "คลังหลัก" },
    ]);
  });
  it("ขาย 50 · ที่เหลือค้างชั้น QC = ส่งออกขั้นเดียว + เตือน", () => {
    const r = ship({ shipSell: 50, shipRest: "keep" });
    expect(r.steps.filter((s) => s.kind === "ship").map((s) => s.kind === "ship" && s.qty)).toEqual([50]);
    expect(r.issues.some((x) => x.level === "warn" && x.msg.includes("ค้างบนชั้น QC"))).toBe(true);
  });
  it("ขายเท่าของดี = ส่งออกทั้งหมดขั้นเดียว · ขายเกินของดี = ห้าม", () => {
    expect(ship({ shipSell: 100 }).steps.filter((s) => s.kind === "ship")).toHaveLength(1);
    expect(ship({ shipSell: 120 }).errors.join(" ")).toMatch(/มากกว่าของดี/);
  });
  it("cuRun แบ่งชิ้นงาน: ขาย 6 จากชิ้น 8 (ส่งบางส่วน) แล้วที่เหลือ 2 เข้าคลัง", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const api = async (url: string, body: unknown) => {
      calls.push({ url, body: body as Record<string, unknown> });
      if (url === "/api/qc-warehouse/items" && (body as { action: string }).action === "receive") return { items: [{ id: "it1", status: "good", qty: 8 }] };
      return {};
    };
    const res = await cuRun([{ kind: "qc_in", good: 8, bad: 0, date: null }, { kind: "ship", qty: 6, date: null, mode: "sell", wh: null }, { kind: "ship", qty: 2, date: null, mode: "sales_wh", wh: "คลังหลัก" }], ctx(snap({ wos: [wo({ id: "w1", qty: 8, received_qty: 8 })] })), api);
    expect(res.every((r) => r.ok)).toBe(true);
    const ships = calls.filter((c) => c.body.action === "ship").map((c) => c.body);
    expect(ships).toEqual([
      { action: "ship", item_id: "it1", qty: 6, mode: "sell", wh: null },
      { action: "ship", item_id: "it1", mode: "sales_wh", wh: "คลังหลัก" },
    ]);
  });
});
