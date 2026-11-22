import { describe, expect, it } from "vitest";
import { addDays, effectiveLineDue, moDueTargets, parseDue, type DueLine, type DueMo } from "@/lib/so-due";

const L = (id: string, over: Partial<DueLine> = {}): DueLine => ({ id, sku: `SKU-${id}`, qty: 10, mo_id: null, due_date: null, ...over });
const M = (id: string, over: Partial<DueMo> = {}): DueMo => ({ id, mo_no: `MO-${id}`, product_sku: null, qty: 10, status: "confirmed", due_date: null, ...over });

describe("วันนัดส่งใบสั่งขาย (lib/so-due)", () => {
  it("อ่านค่าวันที่: ตั้ง / ล้าง / ไม่แตะ / ผิดรูป", () => {
    expect(parseDue("2026-12-01")).toBe("2026-12-01");
    expect(parseDue("2026-12-01T10:00:00Z")).toBe("2026-12-01");
    expect(parseDue(null)).toBeNull();
    expect(parseDue("")).toBeNull();
    expect(parseDue(undefined)).toBeUndefined();
    expect(() => parseDue("1/12/2026")).toThrow();
  });

  it("วันของรายการ = รายการ → หัวใบ · ปุ่มลัดนับวันปฏิทิน", () => {
    expect(effectiveLineDue("2026-12-05", "2026-12-01")).toBe("2026-12-05");
    expect(effectiveLineDue(null, "2026-12-01")).toBe("2026-12-01");
    expect(effectiveLineDue(null, null)).toBeNull();
    expect(addDays("2026-11-25", 7)).toBe("2026-12-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("ใบสั่งผลิตที่ต้องอัปเดต: ตามรายการ→หัวใบ · ข้ามใบเสร็จ/ยกเลิก · ข้ามวันเท่าเดิม · ไม่ล้างวัน", () => {
    const lines = [L("a", { mo_id: "1" }), L("b", { mo_id: "2", due_date: "2026-12-20" }), L("c", { mo_id: "3" }), L("d", { mo_id: "4" })];
    const mos = [M("1", { due_date: "2026-11-30" }), M("2"), M("3", { status: "done" }), M("4", { due_date: "2026-12-10" })];
    expect(moDueTargets(lines, mos, "2026-12-10")).toEqual([
      { mo_id: "1", mo_no: "MO-1", from: "2026-11-30", to: "2026-12-10" },
      { mo_id: "2", mo_no: "MO-2", from: null, to: "2026-12-20" },
    ]);
    expect(moDueTargets(lines, mos, null).map((x) => x.mo_id)).toEqual(["2"]);
  });

  it("แก้เฉพาะรายการ = แตะเฉพาะใบผลิตของรายการนั้น · จับคู่ด้วยรหัสสินค้าได้", () => {
    const lines = [L("a", { due_date: "2026-12-01" }), L("b", { due_date: "2026-12-01" })];
    const mos = [M("1", { product_sku: "SKU-a" }), M("2", { product_sku: "SKU-b" })];
    expect(moDueTargets(lines, mos, null, new Set(["b"])).map((x) => x.mo_id)).toEqual(["2"]);
  });
});
