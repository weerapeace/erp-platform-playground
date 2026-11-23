import { describe, expect, it } from "vitest";
import { cleanTemplates, dueOfDoc, foldOpenDocs, overLimit, suspectSupplier, todayTH, topUsedTerms } from "@/lib/partner-insights";

describe("partner-insights — สรุปต่อคู่ค้า", () => {
  it("วันครบกำหนด: วันในใบชนะ · ไม่มีค่อยคิดจากเครดิต · ไม่มีทั้งคู่ = null", () => {
    expect(dueOfDoc({ date: "2026-11-03", dueDate: "2026-11-10", amount: 1 }, "days:45")).toBe("2026-11-10");
    expect(dueOfDoc({ date: "2026-11-03", amount: 1 }, "days:45")).toBe("2026-12-18");
    expect(dueOfDoc({ date: "2026-11-03", amount: 1 }, null)).toBeNull();
    expect(dueOfDoc({ date: "2026-11-03", amount: 1 }, "ขยะ")).toBeNull();
  });

  it("รวมใบค้าง: ข้ามยอด 0 · นับเลยกำหนด · ครบกำหนดใกล้สุด", () => {
    const f = foldOpenDocs([
      { date: "2026-10-01", amount: 1000 },          // 30 วัน → 31 ต.ค. เลยกำหนด
      { date: "2026-11-15", amount: 500.555 },       // → 15 ธ.ค.
      { date: "2026-11-01", amount: 0 },             // จ่ายครบแล้ว ไม่นับ
    ], "days:30", "2026-11-22");
    expect(f).toEqual({ openDocs: 2, openAmount: 1500.56, nextDue: "2026-10-31", overdueDocs: 1, overdueAmount: 1000 });
  });

  it("ป้ายน่าสงสัย: ลูกค้าอย่างเดียว + มีสินค้า/ใบสั่งซื้อ", () => {
    expect(suspectSupplier({ is_customer: true, is_supplier: false }, { items: 141, pos: 6 })).toBe(true);
    expect(suspectSupplier({ is_customer: true, is_supplier: true }, { items: 3, pos: 0 })).toBe(false);
    expect(suspectSupplier({ is_customer: true }, { items: 0, pos: 0 })).toBe(false);
  });

  it("เกินวงเงิน: ว่าง/0 = ไม่จำกัด", () => {
    expect(overLimit(61200, 50000)).toBe(true);
    expect(overLimit(100, null)).toBe(false);
    expect(overLimit(100, 0)).toBe(false);
  });

  it("วันนี้เวลาไทย: 20:00 UTC = วันถัดไปในไทย", () => {
    expect(todayTH(new Date("2026-11-22T20:00:00Z"))).toBe("2026-11-23");
  });

  it("เทมเพลต: ตัดค่าที่อ่านไม่ออก/ซ้ำ · เก็บชื่อเรียก", () => {
    expect(cleanTemplates([{ term: "days:30", label: "30 วัน" }, "eom", { term: "days:30" }, { term: "xx" }, 5]))
      .toEqual([{ term: "days:30", label: "30 วัน" }, { term: "eom" }]);
    expect(cleanTemplates(null)).toEqual([]);
    expect(topUsedTerms(["eom", "days:30", "eom", null, "bad"], 2)).toEqual(["eom", "days:30"]);
  });
});

import { normCur, poReceiveState, priceChangePct, priceHistoryBySku, sumByCurrency } from "@/lib/partner-insights";

describe("partner-insights — หน้ารายละเอียดคู่ค้า", () => {
  const L = (po_id: string, sku: string | null, qty: number, rec: number, price: number, currency = "RMB") => ({ po_id, item_sku_id: sku, qty, qty_received: rec, price_est: price, currency });
  it("สถานะรับของ", () => {
    expect(poReceiveState([L("a", "s", 10, 0, 1)])).toBe("none");
    expect(poReceiveState([L("a", "s", 10, 4, 1), L("a", "t", 5, 5, 1)])).toBe("partial");
    expect(poReceiveState([L("a", "s", 10, 10, 1)])).toBe("full");
    expect(poReceiveState([])).toBeNull();
  });
  const pos = [
    { id: "a", po_no: "PO-1", order_date: "2026-03-01", status: "purchase", currency: "YUAN", grand_total: 100 },
    { id: "b", po_no: "PO-2", order_date: "2026-10-01", status: "draft", currency: "RMB", grand_total: 50 },
    { id: "c", po_no: "PO-3", order_date: "2025-12-01", status: "purchase", currency: "THB", grand_total: 900 },
    { id: "d", po_no: "PO-4", order_date: "2026-11-01", status: "cancelled", currency: "THB", grand_total: 5 },
  ];
  it("ยอดแยกสกุล: หยวนรวมกัน · ไม่นับยกเลิก · กรองปี", () => {
    expect(normCur("CNY")).toBe("RMB");
    expect(sumByCurrency(pos, "2026-01-01")).toEqual({ RMB: 150 });
    expect(sumByCurrency(pos)).toEqual({ RMB: 150, THB: 900 });
  });
  it("ประวัติราคา: ใหม่สุดก่อน · ข้ามใบยกเลิก/ราคา 0 · % เปลี่ยน", () => {
    const h = priceHistoryBySku([L("a", "s", 1, 0, 2), L("b", "s", 1, 0, 2.5), L("d", "s", 1, 0, 9), L("b", "t", 1, 0, 0)], pos);
    expect(h.get("s")!.map((p) => p.price)).toEqual([2.5, 2]);
    expect(h.has("t")).toBe(false);
    expect(priceChangePct(h.get("s")!)).toBe(25);
  });
});
