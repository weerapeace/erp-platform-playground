import { describe, it, expect } from "vitest";
import { cuFacts, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuRows, cuTargetBlocked, cuAllocate, cuRun, CU_NO_DATES, type CuInputs, type CuContext } from "./catch-up";
import type { CatchUpSnapshot, CatchUpWo } from "@/app/api/mo/catch-up/route";

const wo = (o: Partial<CatchUpWo>): CatchUpWo => ({ id: "w1", wo_no: "WO-1", qty: 0, received_qty: 0, qc_pulled_qty: 0, status: "dispatched",
  department_name: null, assignee_name: null, dispatch_date: null, created_at: "", ...o });
const snap = (o: { mo?: Partial<CatchUpSnapshot["mo"]>; progress?: CatchUpSnapshot["progress"]; wos?: CatchUpWo[]; good?: number } = {}): CatchUpSnapshot => ({
  mo: { id: "m1", mo_no: "MO-1", product_sku: "SKU", product_name: "ชื่อ", qty: 100, status: "draft", due_date: null, internal_due_date: null,
    has_bom: true, prep_total: 4, prep_ready: 0, cut_total: 2, cut_ready: 0, prep_done: false, cut_done: false, skipped: {}, ...o.mo },
  progress: o.progress === undefined ? { total: 4, buy: 2, requested: 0, ordered: 0 } : o.progress,
  materials: [{ sku: "FAB", name: "ผ้า", status: "have", ready: false }, { sku: "ZIP", name: "ซิป", status: "buy", ready: false }],
  wos: o.wos ?? [], shelves: [], shelf: { good: o.good ?? 0, defect: 0, repairing: 0 },
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
    expect(cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp({ shelfId: "" })).errors).toContain("เลือกชั้นที่วางของดีก่อน");
  });
  it("ส่งคืนบางส่วนต้องใส่จำนวน และไม่เกินที่ค้างช่าง", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 100 })] }));
    expect(cuDefaultQty(f, "return_part").returnQty).toBe(0);
    expect(cuBuildSteps(f, "return_part", cuDefaultTicks(f, "return_part"), inp({ rq: 0 })).errors[0]).toMatch(/ใส่จำนวน/);
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
    expect(over.errors.join(" ")).toMatch(/เกินที่เหลือ 100/);
    expect(over.errors.join(" ")).toMatch(/แถวจ่าย 2: เลือกโต๊ะ/);
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
