import { describe, it, expect } from "vitest";
import { groupMaterials, planStockUse, haveItems } from "@/lib/mo-group-materials";
import type { MoMaterialStatus, MoMaterialStatusResult } from "@/app/api/mo/material-status/route";

const mat = (code: string, required: number, status: MoMaterialStatus["status"] = "buy", extra: Partial<MoMaterialStatus> = {}): MoMaterialStatus => ({
  summary_id: `${code}-${Math.random()}`, code, name: code, image: null, type: null, uom: "Units",
  qty_per: 1, required, on_hand: 0, to_purchase_stored: null, is_ready: false,
  want: required, requested: 0, remaining: status === "buy" ? required : 0, received: 0,
  status, links: [], stock: null, ...extra,
});
const mo = (mo_no: string, items: MoMaterialStatus[]): MoMaterialStatusResult => ({ mo_no, mo_qty: 1, items });

// รุ่นตัวอย่าง: 3 ใบ 2 สี · ห่วงใช้ทุกใบ · หนังดำเฉพาะสี -01 · หนังน้ำเงินเฉพาะ -02
const variant: Record<string, string> = { A: "CTL047-01", B: "CTL047-01", C: "CTL047-02" };
const due: Record<string, string> = { A: "2026-12-10", B: "2026-11-20", C: "2026-11-30" };
const results = [
  mo("A", [mat("RING", 120), mat("PU-BLACK", 10)]),
  mo("B", [mat("RING", 80), mat("PU-BLACK", 6, "have")]),
  mo("C", [mat("RING", 100, "requested"), mat("PU-NAVY", 8)]),
];
const rows = groupMaterials(results, (n) => variant[n], (n) => due[n]);
const byCode = (c: string) => rows.find((r) => r.code === c)!;

describe("รวมวัตถุดิบทั้งรุ่น", () => {
  it("วัตถุดิบเดียวกันหลายใบ = การ์ดเดียว ยอดรวม", () => {
    const ring = byCode("RING");
    expect(ring.mos).toHaveLength(3);
    expect(ring.required).toBe(300);
    expect(ring.remaining).toBe(200);           // นับเฉพาะใบที่ยังต้องซื้อ (C ขอแล้ว)
    expect(ring.counts).toMatchObject({ buy: 2, requested: 1 });
  });
  it("ใช้ทุกสี = ใช้ร่วม · ใช้สีเดียว = เฉพาะสี", () => {
    expect(byCode("RING").shared).toBe(true);
    expect(byCode("PU-BLACK")).toMatchObject({ shared: false, variants: ["CTL047-01"] });
    expect(byCode("PU-NAVY")).toMatchObject({ shared: false, variants: ["CTL047-02"] });
  });
  it("สถานะการ์ด = ใบที่ยังแย่สุด", () => {
    expect(byCode("PU-BLACK").status).toBe("buy");
    expect(groupMaterials([mo("B", [mat("X", 1, "have")]), mo("C", [mat("X", 1, "ordered")])], (n) => variant[n]).at(0)?.status).toBe("ordered");
  });
  it("ใบที่ต้องซื้อเรียงใกล้กำหนดก่อน", () => {
    expect(byCode("RING").buy.map((m) => m.mo_no)).toEqual(["B", "A"]);
  });
  it("ปิดสีที่ไม่เลือก → ไม่นับ และวัตถุดิบเหลือสีเดียวไม่ถือว่าใช้ร่วม", () => {
    const only01 = groupMaterials(results, (n) => variant[n], (n) => due[n], new Set(["CTL047-01"]));
    expect(only01.find((r) => r.code === "PU-NAVY")).toBeUndefined();
    expect(only01.find((r) => r.code === "RING")).toMatchObject({ required: 200, shared: false });
  });
  it("ต้องซื้อขึ้นก่อน แล้วใช้ร่วมก่อนเฉพาะสี", () => {
    expect(rows.map((r) => r.code)).toEqual(["RING", "PU-BLACK", "PU-NAVY"]);
  });
});

describe("นับครั้งเดียว แบ่งให้ใบใกล้กำหนดก่อน", () => {
  it("ของไม่พอ → ใบแรกได้ครบ ใบถัดไปได้บางส่วน", () => {
    expect(planStockUse(byCode("RING"), 150)).toEqual([
      { summary_id: expect.any(String), mo_no: "B", qty: 80, full: true },
      { summary_id: expect.any(String), mo_no: "A", qty: 70, full: false },
    ]);
  });
  it("ของเกิน → แบ่งแค่ที่ขาด", () => {
    expect(planStockUse(byCode("RING"), 999).reduce((n, x) => n + x.qty, 0)).toBe(200);
  });
  it("นับได้ 0 → ไม่แบ่ง", () => {
    expect(planStockUse(byCode("RING"), 0)).toEqual([]);
  });
});

describe("มีของแล้วทุกใบ", () => {
  it("เฉพาะใบที่ยังต้องซื้อ · มีอยู่ = ที่ต้องใช้ · เก็บค่าเดิมไว้ยกเลิก", () => {
    const { items, undo } = haveItems([byCode("RING")]);
    expect(items.map((i) => i.on_hand_qty)).toEqual([80, 120]);
    expect(undo.every((u) => u.on_hand_qty === 0)).toBe(true);
  });
});
