import { describe, it, expect } from "vitest";
import { parseSkipped, earlierStagesToSkip, MO_SKIP_META, MO_SKIP_STAGES } from "../mo-skip";
import { checkMoTransition } from "../mo-workflow";
import { applyColumnOrder } from "../../components/mini-table/column-order";
import { moSteps, currentStep } from "../../app/master/work-board/mo-steps";

// ข้ามขั้นตอนใบสั่งผลิต (ป้าย skipped_stages) — กติกากลางที่ lib/mo-skip
describe("parseSkipped", () => {
  it("ค่าว่าง/เพี้ยน = ไม่มีขั้นที่ข้าม", () => {
    expect(parseSkipped(null)).toEqual({});
    expect(parseSkipped("x")).toEqual({});
    expect(parseSkipped([])).toEqual({});
  });
  it("อ่านเฉพาะคีย์ที่รู้จัก + เติมค่าที่ขาดเป็น null", () => {
    const s = parseSkipped({ buy: { by: "u1", at: "2026-11-02T00:00:00Z" }, foo: { by: "x" }, cut: "bad" });
    expect(Object.keys(s)).toEqual(["buy"]);
    expect(s.buy).toEqual({ by: "u1", by_name: null, at: "2026-11-02T00:00:00Z", reason: null });
  });
});

describe("earlierStagesToSkip", () => {
  it("ข้ามจ่ายงาน → ถามขั้นก่อนหน้าที่ยังไม่ครบ/ไม่ได้ข้าม", () => {
    const skipped = parseSkipped({ buy: { at: "x" } });
    expect(earlierStagesToSkip("dispatch", skipped, { prep: true })).toEqual(["cut"]);
  });
  it("ขั้นแรกไม่มีขั้นก่อนหน้า", () => {
    expect(earlierStagesToSkip("buy", {}, {})).toEqual([]);
  });
});

describe("MO_SKIP_META", () => {
  it("จ่ายงาน/รับคืน ต้องใส่เหตุผล · ซื้อของ/เตรียม/ตัด ไม่ต้อง", () => {
    expect(MO_SKIP_STAGES.filter((s) => MO_SKIP_META[s].needReason)).toEqual(["dispatch", "receive"]);
  });
});

describe("checkMoTransition — ข้ามรับคืนแล้ว", () => {
  const base = { status: "draft", qty: 50, dispatched: 0, received: 0, openWorkOrders: 0 };
  it("ข้ามรับคืน + ไม่มีใบจ่ายงานค้าง = ปิดได้ แม้ยังไม่ได้รับคืน", () => {
    expect(checkMoTransition("close", { ...base, receiveSkipped: true })).toBeNull();
  });
  it("ข้ามรับคืนแต่ยังมีใบจ่ายงานค้าง = ยังปิดไม่ได้", () => {
    expect(checkMoTransition("close", { ...base, dispatched: 50, openWorkOrders: 1, receiveSkipped: true })).toMatch(/ใบจ่ายงานค้าง/);
  });
});

describe("moSteps — ขั้นที่ข้าม = skip", () => {
  const m = { has_bom: true, prep_total: 4, prep_ready: 4, cut_total: 2, cut_ready: 0, qty: 10, dispatched: 0, remaining: 10 };
  it("ไม่มีป้าย = ค้างที่ตัด", () => {
    const rows = moSteps(m, { total: 3, buy: 0, requested: 0, ordered: 0, done: 3, linked: 0, eta: null, eta_unknown: 0 }, 0);
    expect(rows[currentStep(rows)].key).toBe("cut");
  });
  it("ข้ามตัด+จ่ายงาน+รับคืน = ครบหมด", () => {
    const skipped = parseSkipped({ cut: { at: "x" }, dispatch: { at: "x", by_name: "แอดมิน" }, receive: { at: "x" } });
    const rows = moSteps({ ...m, skipped_stages: skipped }, { total: 3, buy: 0, requested: 0, ordered: 0, done: 3, linked: 0, eta: null, eta_unknown: 0 }, 0);
    expect(rows.map((r) => r.state)).toEqual(["done", "done", "skip", "skip", "skip"]);
    expect(rows[3].sub).toContain("แอดมิน");
    expect(currentStep(rows)).toBe(-1);
  });
});

describe("applyColumnOrder — เรียงคอลัมน์", () => {
  const cols = [{ key: "img", locked: true }, { key: "a" }, { key: "b" }, { key: "c" }].map((c) => ({ header: c.key, cell: () => null, ...c }));
  it("ไม่มีลำดับ = เหมือนเดิม", () => {
    expect(applyColumnOrder(cols, []).map((c) => c.key)).toEqual(["img", "a", "b", "c"]);
  });
  it("เรียงตามที่ผู้ใช้จัด · คอลัมน์ล็อกอยู่ที่เดิม", () => {
    expect(applyColumnOrder(cols, ["c", "a", "b"]).map((c) => c.key)).toEqual(["img", "c", "a", "b"]);
  });
  it("คอลัมน์ใหม่ที่ยังไม่อยู่ในลำดับ แทรกถัดจากเพื่อนบ้านเดิม", () => {
    expect(applyColumnOrder(cols, ["b", "a"]).map((c) => c.key)).toEqual(["img", "b", "c", "a"]);
  });
});
