import { describe, expect, it } from "vitest";
import { parseSheetShips, planLineBills, planRefills, newUsage, sameCustomer, type BillLineFact } from "@/lib/so-bill-match";

const bill = (id: string, date: string, qty: number, links: BillLineFact["links"] = [], draft = false): BillLineFact =>
  ({ id, so_number: `ISG-${id}`, date, qty, draft, links });

describe("อ่านหมายเหตุชีต", () => {
  it("หลายครั้ง + ปี พ.ศ.", () => {
    expect(parseSheetShips("ชีต: ส่งแล้ว 16/9/2569 100 ใบ ส่งแล้ว 5/10/2569 100 ใบ · GG 8859554170149"))
      .toEqual([{ date: "2026-09-16", qty: 100 }, { date: "2026-10-05", qty: 100 }]);
  });
  it("ไม่บอกจำนวน = null · ไม่มีชีต = ว่าง · มีลูกน้ำ", () => {
    expect(parseSheetShips("ชีต: ส่งแล้ว 12/10/2569 · GG 1")).toEqual([{ date: "2026-10-12", qty: null }]);
    expect(parseSheetShips("GG 8859554142702")).toEqual([]);
    expect(parseSheetShips("ส่งแล้ว 5/10/2569 1,500 ใบ")).toEqual([{ date: "2026-10-05", qty: 1500 }]);
  });
});

describe("แผนผูกบิลต่อรายการ", () => {
  const target = { id: "mo212", mo_no: "MO-00212", from: "2026-08-15" };
  it("เคสกล้วย: บิลวันที่ตรงชีตผูกใบ มิ.ย. อยู่ → ย้ายมา + ใบ มิ.ย. ได้บิลว่างแทน", () => {
    const bills = [
      bill("715", "2026-07-15", 100), bill("819", "2026-08-19", 100),
      bill("916", "2026-09-16", 100, [{ mo_id: "mo40", mo_no: "MO-00040", qty: 100 }]),
      bill("1005", "2026-10-05", 100, [{ mo_id: "mo40", mo_no: "MO-00040", qty: 100 }]),
    ];
    const u = newUsage();
    const r = planLineBills({ ordered: 200, shipped: 0, lineMoIds: ["mo212"], target, sheet: parseSheetShips("ส่งแล้ว 16/9/2569 100 ใบ ส่งแล้ว 5/10/2569 100 ใบ"), bills, usage: u });
    expect(r.short).toBe(0);
    expect(r.items.map((i) => [i.kind, i.sale_line_id, i.qty, i.from?.mo_no])).toEqual([["move", "916", 100, "MO-00040"], ["move", "1005", 100, "MO-00040"]]);
    const refill = planRefills([{ mo_id: "mo40", mo_no: "MO-00040", from: "2026-06-17", lost: 200, bills }], u);
    expect(refill.map((i) => [i.sale_line_id, i.qty, i.to_mo_no])).toEqual([["715", 100, "MO-00040"], ["819", 100, "MO-00040"]]);
  });
  it("บิลว่างตรงชีต = ผูกเลย · บิลร่าง = รอยืนยัน · ที่ผูกใบนี้อยู่แล้วไม่นับซ้ำ", () => {
    const bills = [bill("a", "2026-11-05", 156, [], true), bill("b", "2026-09-16", 50), bill("c", "2026-09-16", 50, [{ mo_id: "mo212", mo_no: "MO-00212", qty: 50 }])];
    const r = planLineBills({ ordered: 256, shipped: 50, lineMoIds: ["mo212"], target, sheet: parseSheetShips("ส่งแล้ว 16/9/2569 100 ใบ ส่งแล้ว 5/11/2569 156 ใบ"), bills, usage: newUsage() });
    expect(r.items.map((i) => [i.kind, i.sale_line_id, i.qty])).toEqual([["free", "b", 50], ["draft", "a", 156]]);
    expect(r.short).toBe(0);
  });
  it("ไม่มีชีต → บิลว่างหลังวันเปิดใบ ใบเก่าก่อน · ไม่ย้ายของใบอื่น · ขาด = short", () => {
    const bills = [bill("old", "2026-08-01", 100), bill("x", "2026-09-01", 30, [{ mo_id: "other", mo_no: "MO-9", qty: 30 }]), bill("y", "2026-09-20", 40), bill("z", "2026-10-01", 40)];
    const r = planLineBills({ ordered: 100, shipped: 0, lineMoIds: ["mo212"], target, sheet: [], bills, usage: newUsage() });
    expect(r.items.map((i) => [i.sale_line_id, i.qty])).toEqual([["y", 40], ["z", 40]]);
    expect(r.short).toBe(20);
  });
  it("ใบของรายการอื่นในใบสั่งขายเดียวกัน (protect) ไม่ถูกย้าย · ส่งครบแล้ว = ไม่มีแผน", () => {
    const bills = [bill("s", "2026-09-16", 100, [{ mo_id: "sib", mo_no: "MO-SIB", qty: 100 }])];
    const r = planLineBills({ ordered: 100, shipped: 0, lineMoIds: ["mo212"], target, sheet: [{ date: "2026-09-16", qty: 100 }], bills, usage: newUsage(), protect: ["sib"] });
    expect(r.items).toEqual([]); expect(r.short).toBe(100);
    expect(planLineBills({ ordered: 100, shipped: 100, lineMoIds: [], target, sheet: [], bills, usage: newUsage() }).items).toEqual([]);
  });
  it("บิลเดียวไม่ถูกเสนอให้ 2 รายการ (usage ร่วมกัน)", () => {
    const bills = [bill("one", "2026-09-01", 100)];
    const u = newUsage();
    const a = planLineBills({ ordered: 100, shipped: 0, lineMoIds: ["m1"], target: { id: "m1", mo_no: "MO-1", from: "2026-08-01" }, sheet: [], bills, usage: u });
    const b = planLineBills({ ordered: 100, shipped: 0, lineMoIds: ["m2"], target: { id: "m2", mo_no: "MO-2", from: "2026-08-01" }, sheet: [], bills, usage: u });
    expect(a.items.length).toBe(1); expect(b.items.length).toBe(0); expect(b.short).toBe(100);
  });
});

describe("ลูกค้าเดียวกัน", () => {
  it("id ตรง หรือบริษัทเดียวกันคนละสาขา", () => {
    const hq = { id: "a", name: "บริษัท เซ็นทรัลทำ วิสาหกิจเพื่อสังคม จำกัด สำนักงานใหญ่ (สาขาที่ 00000)" };
    const br = { id: "b", name: "บริษัท เซ็นทรัลทำ วิสาหกิจเพื่อสังคม จำกัด สาขาคลังสินค้าเซ็นทรัลทำ (สาขาที่ 00005)" };
    expect(sameCustomer(hq, br)).toBe(true);
    expect(sameCustomer(hq, { id: "c", name: "บริษัท อื่น จำกัด" })).toBe(false);
    expect(sameCustomer({ id: "x", name: null }, { id: "x", name: "ใคร" })).toBe(true);
  });
});
