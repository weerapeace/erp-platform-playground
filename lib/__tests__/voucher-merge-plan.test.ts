import { describe, it, expect } from "vitest";
import { mixedCurrencyShops, planVoucherGroups, type MergeGr } from "@/lib/voucher-merge-plan";

// ชุดจริง RB-2026-0001 (2 พ.ย. 2026): 5 ใบรับ 2 ร้าน
const grs: MergeGr[] = [
  { id: "6", gr_no: "GR-2026-00006", po_no: "PO-2026-00260", seller_name: "ร้าน PU LY", currency: "YUAN" },
  { id: "5", gr_no: "GR-2026-00005", po_no: "PO-2026-00257", seller_name: "ร้านด้ายเมืองจีน (HAO TI CHE THREAD)", currency: "YUAN" },
  { id: "4", gr_no: "GR-2026-00004", po_no: "PO-2026-00256", seller_name: "ร้านด้ายเมืองจีน (HAO TI CHE THREAD)", currency: "THB" },
  { id: "3", gr_no: "GR-2026-00003", po_no: "PO-2026-00186", seller_name: "ร้าน PU LY", currency: "YUAN" },
  { id: "2", gr_no: "GR-2026-00002", po_no: "PO-2026-00162", seller_name: "ร้าน PU LY", currency: "RMB" },
];

describe("voucher-merge-plan (แยก / รวม ใบสำคัญ)", () => {
  it("รวม = ร้านเดียว + สกุลเดียว (YUAN = RMB) → 3 ใบ", () => {
    const p = planVoucherGroups(grs, "merge");
    expect(p).toHaveLength(3);
    expect(p.find((g) => g.seller_name === "ร้าน PU LY")?.grs.map((g) => g.gr_no)).toEqual(["GR-2026-00006", "GR-2026-00003", "GR-2026-00002"]);
  });
  it("แยก = 1 ใบรับ 1 ใบสำคัญ → 5 ใบ", () => {
    expect(planVoucherGroups(grs, "split")).toHaveLength(5);
  });
  it("บอกร้านที่มีหลายสกุล (รวมไม่ได้)", () => {
    expect(mixedCurrencyShops(grs)).toEqual(["ร้านด้ายเมืองจีน (HAO TI CHE THREAD)"]);
  });
});
