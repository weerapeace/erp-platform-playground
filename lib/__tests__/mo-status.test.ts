import { describe, it, expect } from "vitest";
import { moProgress, computeMoStatus, remainingToDispatch } from "@/lib/mo-status";
import { bucketOf } from "@/lib/mo-backlog";
import { checkMoTransition } from "@/lib/mo-workflow";

const SKIP = { by: null, by_name: "แอดมิน", at: "2026-11-02", reason: null };
const base = { prepDone: 0, prepTotal: 0, cutDone: 0, cutTotal: 0 };

describe("คำถามกลาง 3 ข้อของใบสั่งผลิต (moProgress)", () => {
  it("ยังไม่จ่าย", () => {
    expect(moProgress({ qty: 10, dispatched: 0, received: 0 })).toEqual({ started: false, dispatchedAll: false, submittedAll: false, remaining: 10 });
  });
  it("จ่ายบางส่วน", () => {
    expect(moProgress({ qty: 10, dispatched: 4, received: 0 })).toMatchObject({ started: true, dispatchedAll: false, submittedAll: false, remaining: 6 });
  });
  it("จ่ายครบ ยังไม่ส่ง", () => {
    expect(moProgress({ qty: 10, dispatched: 10, received: 3 })).toMatchObject({ started: true, dispatchedAll: true, submittedAll: false, remaining: 0 });
  });
  it("ส่งครบ = เข้า QC", () => {
    expect(moProgress({ qty: 10, dispatched: 10, received: 10 }).submittedAll).toBe(true);
  });
  it("เศษทศนิยมจากการบวกยอดหลายใบ ถือว่าครบ", () => {
    expect(moProgress({ qty: 0.3, dispatched: 0.1 + 0.2, received: 0.1 + 0.2 - 0.00001 }).submittedAll).toBe(true);
  });
  it("จำนวนสั่ง 0 ไม่นับว่าส่งครบ", () => {
    expect(moProgress({ qty: 0, dispatched: 0, received: 0 }).submittedAll).toBe(false);
  });
  it("ข้ามขั้นรับคืน = ส่งครบ (แม้ยังไม่มีการส่งจริง)", () => {
    expect(moProgress({ qty: 10, dispatched: 10, received: 0, skipped: { receive: SKIP } })).toMatchObject({ submittedAll: true, dispatchedAll: true });
  });
  it("ข้ามขั้นจ่ายงาน = จ่ายแล้ว + จ่ายครบ (ไม่มีใบจ่ายงาน)", () => {
    expect(moProgress({ qty: 10, dispatched: 0, received: 0, skipped: { dispatch: SKIP } })).toEqual({ started: true, dispatchedAll: true, submittedAll: false, remaining: 0 });
  });
});

describe("ทุกที่ตอบตรงกัน เมื่อแอดมินข้ามขั้นรับคืน", () => {
  const facts = { qty: 10, dispatched: 10, received: 2, skipped: { receive: SKIP } };
  it("ป้ายสถานะ 9 ขั้น", () => {
    expect(computeMoStatus({ ...base, ...facts })).toMatchObject({ code: 9, short: "ข้ามรับคืน" });
  });
  it("หน้าใบค้าง = กลุ่ม A (ปิดได้)", () => {
    expect(bucketOf({ ...facts, age_days: 5 })).toBe("A");
  });
  it("ปุ่มปิดงาน = ปิดได้", () => {
    expect(checkMoTransition("close", { status: "draft", qty: 10, dispatched: 10, received: 2, openWorkOrders: 0, receiveSkipped: true })).toBeNull();
  });
  it("ไม่ข้ามขั้น → ยังปิดไม่ได้ และป้ายเป็นส่งบางส่วน", () => {
    expect(checkMoTransition("close", { status: "draft", qty: 10, dispatched: 10, received: 2, openWorkOrders: 0 })).toMatch(/ยังส่งคืนไม่ครบ/);
    expect(computeMoStatus({ ...base, qty: 10, dispatched: 10, received: 2 }).code).toBe(8);
  });
});

describe("ป้ายสถานะเดิมไม่เปลี่ยน (ไม่มีป้ายข้ามขั้น)", () => {
  it.each([
    [{ qty: 10, dispatched: 10, received: 10 }, 9],
    [{ qty: 10, dispatched: 10, received: 5 }, 8],
    [{ qty: 10, dispatched: 10, received: 0 }, 6],
    [{ qty: 10, dispatched: 3, received: 0 }, 7],
  ])("%o → ขั้น %i", (f, code) => {
    expect(computeMoStatus({ ...base, ...f }).code).toBe(code);
  });
  it("ข้ามขั้นจ่ายงาน → ขั้น 6 ป้ายบอกว่าข้าม", () => {
    expect(computeMoStatus({ ...base, qty: 10, dispatched: 0, received: 0, skipped: { dispatch: SKIP } })).toMatchObject({ code: 6, short: "ข้ามจ่าย" });
  });
});

describe("บอร์ดจ่ายงาน: ยังต้องจ่ายอีกกี่ชิ้น (remainingToDispatch) — ขายแล้ว = ทำเสร็จแล้ว", () => {
  it("ยังไม่ขาย = จำนวน − จ่ายแล้ว", () => {
    expect(remainingToDispatch(400, 0)).toBe(400);
    expect(remainingToDispatch(400, 150, 0)).toBe(250);
  });
  it("ขายไปมากกว่าที่จ่าย → หักตามที่ขาย", () => {
    expect(remainingToDispatch(400, 0, 200)).toBe(200);       // CTL104-05
    expect(remainingToDispatch(220, 130, 210)).toBe(10);
  });
  it("ขายน้อยกว่าที่จ่าย → หักตามที่จ่าย", () => {
    expect(remainingToDispatch(300, 200, 50)).toBe(100);
  });
  it("ขายครบ / ขายเกิน / เศษทศนิยม = 0", () => {
    expect(remainingToDispatch(380, 140, 380)).toBe(0);       // CTL008XS-01-1
    expect(remainingToDispatch(100, 0, 120)).toBe(0);
    expect(remainingToDispatch(10, 9.99995, 0)).toBe(0);
  });
});
