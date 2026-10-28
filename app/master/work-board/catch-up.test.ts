import { describe, it, expect } from "vitest";
import { cuFacts, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuRows, cuTargetBlocked, cuAllocate, cuRun, type CuInputs } from "./catch-up";
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
const inp = (o: Partial<CuInputs> = {}): CuInputs => ({ dispatchQty: 100, returnQty: 100, qcGood: 100, qcBad: 0, shelfId: "s1", deptId: "d1", cancelReason: "", ...o });

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
    const f = cuFacts(snap({ mo: { cut_ready: 2 } }));
    const rows = cuRows(f, "dispatch", { prep: true });
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
    const ok = cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp());
    expect(ok.steps.map((s) => s.kind)).toEqual(["mark_ready", "dispatch", "return", "qc_in"]);
    expect(cuBuildSteps(f, "qc_in", cuDefaultTicks(f, "qc_in"), inp({ shelfId: "" })).errors).toContain("เลือกชั้นที่วางของดีก่อน");
  });
  it("ส่งคืนบางส่วนต้องใส่จำนวน และไม่เกินที่ค้างช่าง", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 100 })] }));
    const q = cuDefaultQty(f, "return_part");
    expect(q.returnQty).toBe(0);
    expect(cuBuildSteps(f, "return_part", cuDefaultTicks(f, "return_part"), inp({ returnQty: 0 })).errors[0]).toMatch(/1 ถึง 100/);
    expect(cuBuildSteps(f, "return_part", cuDefaultTicks(f, "return_part"), inp({ returnQty: 60 })).steps).toEqual([{ kind: "return", qty: 60 }]);
  });
  it("เคยจ่ายไปบางส่วน → จ่ายเพิ่ม 0 ได้", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 60 })] }));
    const r = cuBuildSteps(f, "return", cuDefaultTicks(f, "return"), inp({ dispatchQty: 0, returnQty: 60 }));
    expect(r.errors).toEqual([]);
    expect(r.steps).toEqual([{ kind: "return", qty: 60 }]);
  });
  it("ปิดใบต้องคืนครบทุกชิ้น", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 }, wos: [wo({ qty: 100 })] }));
    expect(cuBuildSteps(f, "close", { return: true, close: true }, inp({ returnQty: 50 })).errors[0]).toMatch(/ส่งคืนครบ/);
    const ok = cuBuildSteps(f, "close", { return: true, close: true }, inp({ returnQty: 100 }));
    expect(ok.steps.map((s) => s.kind)).toEqual(["return", "close"]);
    // ค่าตั้งต้นของปิดใบ = ผ่าน QC + ส่งออกด้วย (เอาติ๊กออกได้)
    expect(cuBuildSteps(f, "close", cuDefaultTicks(f, "close"), inp()).steps.map((s) => s.kind)).toEqual(["return", "qc_in", "ship", "close"]);
  });
  it("ยกเลิกได้เฉพาะใบที่ยังไม่จ่าย และต้องมีเหตุผล", () => {
    expect(cuTargetBlocked(cuFacts(snap({ wos: [wo({ qty: 10 })] })), "cancel")).toMatch(/ยกเลิกไม่ได้/);
    expect(cuBuildSteps(cuFacts(snap()), "cancel", {}, inp()).errors).toEqual(["ใส่เหตุผลที่ยกเลิกก่อน"]);
    expect(cuBuildSteps(cuFacts(snap()), "cancel", {}, inp({ cancelReason: "ลูกค้ายกเลิก" })).steps).toEqual([{ kind: "cancel", reason: "ลูกค้ายกเลิก" }]);
  });
  it("ขั้นที่เลือกบันทึกครบแล้ว → แจ้งว่าไม่มีอะไรต้องทำ", () => {
    const f = cuFacts(snap({ mo: { prep_ready: 4, cut_ready: 2 } }));
    expect(cuBuildSteps(f, "cut", cuDefaultTicks(f, "cut"), inp()).errors[0]).toMatch(/ครบแล้ว/);
  });
});

describe("ยังขาดของอยู่", () => {
  it("ติ๊กยังขาดของ → ไม่ติดป้ายของครบ · ติ๊กเตรียม/ตัดยกเว้นตัวที่ขาด", () => {
    const f = cuFacts(snap());
    const ticks = { ...cuDefaultTicks(f, "dispatch"), short: true };
    expect(cuRows(f, "dispatch", ticks).find((r) => r.stage === "have")?.state).toBe("short");
    const r = cuBuildSteps(f, "dispatch", ticks, inp({ missing: ["ZIP"] }));
    expect(r.errors).toEqual([]);
    expect(r.steps[0]).toEqual({ kind: "mark_ready", parts: ["prep", "cut"], except: ["ZIP"] });
    expect(r.steps.some((s) => s.kind === "skip_buy")).toBe(false);
  });
  it("ติ๊กยังขาดของแต่ไม่เลือกอะไร → เตือน", () => {
    const f = cuFacts(snap());
    expect(cuBuildSteps(f, "dispatch", { ...cuDefaultTicks(f, "dispatch"), short: true }, inp({ missing: [] })).errors[0]).toMatch(/ยังขาด/);
  });
  it("จ่ายก่อนเตรียม + ยังขาดของ → ไม่บันทึกอะไรเรื่องของ", () => {
    const f = cuFacts(snap());
    const r = cuBuildSteps(f, "dispatch", { have: true, prep: false, cut: false, dispatch: true, short: true }, inp({ missing: ["ZIP"] }));
    expect(r.steps.map((s) => s.kind)).toEqual(["dispatch"]);
  });
  it("ส่ง except ไปที่ mark-ready", async () => {
    const calls: { url: string; body: unknown }[] = [];
    await cuRun([{ kind: "mark_ready", parts: ["prep"], except: ["ZIP"] }], { snap: snap(), dept: null, who: {}, dispatchDate: null, shelfId: "", badReason: "" },
      async (url, body) => { calls.push({ url, body }); return {}; });
    expect(calls[0]).toEqual({ url: "/api/mo/m1/mark-ready", body: { ready: true, parts: ["prep"], except: ["ZIP"] } });
  });
});

describe("cuAllocate", () => {
  it("แบ่งตามลำดับ ไม่เกินเพดานแต่ละแถว", () => {
    expect(cuAllocate([{ id: "a", c: 30 }, { id: "b", c: 0 }, { id: "c", c: 50 }], 60, (r) => r.c)).toEqual([{ id: "a", qty: 30 }, { id: "c", qty: 30 }]);
  });
});

describe("cuRun", () => {
  it("จ่ายใหม่แล้วส่งคืนเข้าใบที่เพิ่งสร้าง · ทุกคำขอส่ง quiet", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const api = async (url: string, body: unknown) => { calls.push({ url, body: body as Record<string, unknown> }); return url.endsWith("work-orders") ? { id: "new", wo_no: "WO-9" } : {}; };
    const res = await cuRun([{ kind: "dispatch", qty: 100 }, { kind: "return", qty: 40 }], { snap: snap(), dept: { id: "d1", name: "โต๊ะแต๋ว" }, who: { assignee_type: "department", assignee_name: "โต๊ะแต๋ว" }, dispatchDate: null, shelfId: "", badReason: "" }, api);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(calls[0].body).toMatchObject({ qty: 100, dispatch_date: null, quiet: true, stage: "assemble" });
    expect(calls[1]).toMatchObject({ url: "/api/mo/submissions", body: { wo_id: "new", qty: 40, info_pending: true, quiet: true } });
  });
  it("ขั้นไหนพังหยุดตรงนั้น", async () => {
    const api = async (url: string) => { if (url.includes("mark-ready")) throw new Error("ไม่มีสิทธิ์"); return {}; };
    const res = await cuRun([{ kind: "skip_buy" }, { kind: "mark_ready", parts: ["prep"] }, { kind: "close" }], { snap: snap(), dept: null, who: {}, dispatchDate: null, shelfId: "", badReason: "" }, api);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(res[1].msg).toBe("ไม่มีสิทธิ์");
  });
});
