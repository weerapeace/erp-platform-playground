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

describe("checkDraftMerge — รวมใบร่างเป็นใบเดียว (★ 2026-11-15)", () => {
  const d = (id: string, date: string, extra: Record<string, unknown> = {}) => ({ id, pv_no: `PV${date}-001`, status: "draft", voucher_date: date, seller_name: "ร้าน PU HRH", currency: "RMB", editing_at: null, ...extra });
  it("ร่าง ร้านเดียว สกุลเดียว = รวมได้ · ใบหลัก = ใบวันที่เก่าสุด", async () => {
    const { checkDraftMerge } = await import("@/lib/voucher-merge-plan");
    const r = checkDraftMerge([d("c", "2026-10-26"), d("a", "2026-09-29"), d("b", "2026-10-16", { currency: "CNY" })]);
    expect(r.ok).toBe(true);
    expect(r.targetId).toBe("a");
  });
  it("ไม่ผ่าน: เลือกใบเดียว / มีใบยืนยันแล้ว / ต่างร้าน / ต่างสกุล", async () => {
    const { checkDraftMerge } = await import("@/lib/voucher-merge-plan");
    expect(checkDraftMerge([d("a", "2026-09-29")]).reason).toMatch("อย่างน้อย 2");
    expect(checkDraftMerge([d("a", "2026-09-29"), d("b", "2026-10-16", { status: "confirmed" })]).reason).toMatch("เฉพาะใบร่าง");
    expect(checkDraftMerge([d("a", "2026-09-29"), d("b", "2026-10-16", { status: "draft", editing_at: "x" })]).ok).toBe(false);
    expect(checkDraftMerge([d("a", "2026-09-29"), d("b", "2026-10-16", { seller_name: "ร้านอื่น" })]).reason).toMatch("ร้านเดียวกัน");
    expect(checkDraftMerge([d("a", "2026-09-29"), d("b", "2026-10-16", { currency: "THB" })]).reason).toMatch("สกุลเงิน");
  });
});
