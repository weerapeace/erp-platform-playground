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

describe("checkVoucherMerge — รวมใบยืนยันแล้วได้ (★ 2026-11-21)", () => {
  const v = (id: string, date: string, extra: Record<string, unknown> = {}) => ({ id, pv_no: `PV${date}-00${id.length}`, status: "confirmed", voucher_date: date, seller_name: "ร้านผ้ากำมะหยี่", currency: "RMB",
    editing_at: null, editing_by: null, china_bill_id: null, shipping_bill_id: null, shipping_payment_status: "unpaid", ...extra });
  it("เคสจริง: 2 ใบยืนยันแล้ว ยังไม่จ่าย · ใบหนึ่งเปิดแก้โดยคนกดเอง = ผ่าน · ใบหลัก = เก่าสุด · บอกว่ามีใบยืนยันแล้ว", async () => {
    const { checkVoucherMerge } = await import("@/lib/voucher-merge-plan");
    const r = checkVoucherMerge([v("a", "2026-11-11", { editing_at: "x", editing_by: "narisara wannasoot" }), v("bb", "2026-11-03")], "narisara wannasoot");
    expect(r).toMatchObject({ ok: true, targetId: "bb", hasConfirmed: true });
  });
  it("กันไว้: คนอื่นกำลังแก้ · จ่ายแล้ว (บิลโอนจีน / บิลค่าส่ง / ติ๊กจ่ายค่าส่ง) · ยกเลิกแล้ว — บอกใบไหนติดอะไร", async () => {
    const { checkVoucherMerge } = await import("@/lib/voucher-merge-plan");
    const editing = checkVoucherMerge([v("a", "2026-11-11", { editing_at: "x", editing_by: "narisara wannasoot" }), v("bb", "2026-11-03")], "owner");
    expect(editing.ok).toBe(false);
    expect(editing.reason).toMatch("กำลังถูกแก้โดย narisara wannasoot");
    expect(checkVoucherMerge([v("a", "2026-11-11", { china_bill_id: "cb" }), v("bb", "2026-11-03")], "x").reason).toMatch("ผูกบิลโอนเงินจีนแล้ว");
    expect(checkVoucherMerge([v("a", "2026-11-11", { shipping_bill_id: "sb" }), v("bb", "2026-11-03")], "x").reason).toMatch("ผูกบิลค่าส่งแล้ว");
    expect(checkVoucherMerge([v("a", "2026-11-11", { shipping_payment_status: "paid" }), v("bb", "2026-11-03")], "x").reason).toMatch("จ่ายค่าส่งแล้ว");
    expect(checkVoucherMerge([v("a", "2026-11-11", { status: "cancelled" }), v("bb", "2026-11-03")], "x").blocks[0].why).toBe("ยกเลิกแล้ว");
  });
  it("ร่าง + ยืนยันแล้ว รวมกันได้ · ใบร่างผูกบิลโอนจีน (เคสเดิม) ไม่ถูกกัน · ต่างร้าน/ต่างสกุล = ไม่ได้", async () => {
    const { checkVoucherMerge } = await import("@/lib/voucher-merge-plan");
    expect(checkVoucherMerge([v("a", "2026-11-11", { status: "draft", china_bill_id: "cb" }), v("bb", "2026-11-03")], "x").ok).toBe(true);
    expect(checkVoucherMerge([v("a", "2026-11-11", { seller_name: "ร้านอื่น" }), v("bb", "2026-11-03")], "x").reason).toMatch("ร้านเดียวกัน");
    expect(checkVoucherMerge([v("a", "2026-11-11", { currency: "THB" }), v("bb", "2026-11-03")], "x").reason).toMatch("สกุลเงิน");
  });
});

describe("shipTogetherCandidates — ถามตอนยืนยัน (★ 2026-11-21 ข้อเสนอ 1)", () => {
  const me = { id: "me", pv_no: "PV2026-11-11-003", status: "draft", voucher_date: "2026-11-11", seller_name: "ร้านผ้ากำมะหยี่", seller_partner_id: "P", currency: "RMB", ship_total_thb: 0 };
  it("ร้านเดียวกัน · ร่าง/ยืนยันยังไม่จ่าย · ยังไม่มีค่าส่ง · ห่าง ≤ 14 วัน", async () => {
    const { shipTogetherCandidates } = await import("@/lib/voucher-merge-plan");
    const o = (id: string, extra: Record<string, unknown>) => ({ ...me, id, pv_no: id, ...extra });
    const got = shipTogetherCandidates(me, [
      o("ok-confirmed", { status: "confirmed", voucher_date: "2026-11-03" }),
      o("ok-draft", { voucher_date: "2026-11-20" }),
      o("far", { voucher_date: "2026-10-20" }),
      o("has-ship", { ship_total_thb: 120 }),
      o("paid", { status: "confirmed", china_bill_id: "cb" }),
      o("other-shop", { seller_partner_id: "Q" }),
      o("thb", { currency: "THB" }),
      o("cancelled", { status: "cancelled" }),
      me,
    ]);
    expect(got.map((x) => x.id)).toEqual(["ok-confirmed", "ok-draft"]);
  });
});
