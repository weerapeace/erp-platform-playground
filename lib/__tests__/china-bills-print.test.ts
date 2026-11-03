import { describe, expect, it } from "vitest";
import { applyListPrintPreset, cleanListPrintSettings } from "@/lib/list-print";
import { billInFilter, billStatus3, rateForRmb } from "@/lib/china-pay";
import {
  CB_PRINT_COLUMNS, buildChinaBillsPrint, cbBillsFromApi, cbPrintColumnsFor, cbPrintDefaults, cbPrintOpts, cbPrintPresets, cbPrintTitle,
  type CbBank, type CbPrintBill,
} from "@/lib/china-bills-print";

// ข้อมูลรูปแบบเดียวกับ /api/master-v2/china-bills (ยอดจริงจากระบบ 2026-11-03)
const API_ROWS: Record<string, unknown>[] = [
  { id: "b1", supplier_id: "s1", supplier_label: "ร้านริบบิ้น", amount_rmb: 15066, fee_rmb: 10, rate: null, transfer_date: "2026-11-03", bill_date: "2026-11-03", status: "รอโอน", slips: [] },
  { id: "b2", supplier_id: "s2", supplier_label: "ร้านอี้หลงเจียห่าว (B242)", amount_rmb: 22498, fee_rmb: 10, rate: null, transfer_date: "2026-11-03", status: "รอโอน", slips: [] },
  { id: "b3", supplier_id: "s3", supplier_label: "K.ติง", amount_rmb: 41503, fee_rmb: 30, rate: 0, transfer_date: "2026-11-03", status: "รอโอน", slips: [] },
  { id: "b4", supplier_id: "s1", supplier_label: "ร้านริบบิ้น", amount_rmb: 10148, fee_rmb: 10, rate: 5.145, transfer_date: "2026-09-22", status: "โอนแล้ว", slips: [{ key: "k", amount_rmb: 4000 }] },
  { id: "b5", is_shipping: true, amount_thb: 1200, status: "รอโอน", transfer_date: "2026-10-01" },
  { id: "b6", supplier_id: "s2", supplier_label: "ร้านอี้หลงเจียห่าว (B242)", amount_rmb: 500, fee_rmb: 3, status: "ยกเลิก", transfer_date: "2026-10-02" },
];
const BILLS = cbBillsFromApi(API_ROWS);
const build = (bills: CbPrintBill[], patch: Record<string, unknown> = {}, r1 = 5.2, banks?: Map<string, CbBank>) => {
  const base = cbPrintDefaults();
  const s = cleanListPrintSettings({ ...base, ...patch, opts: { ...base.opts, ...((patch.opts as object) ?? {}) } }, CB_PRINT_COLUMNS, base);
  return buildChinaBillsPrint({ bills, settings: s, rate: { r1, label: "เรทล่าสุด 28 ก.ย. 69" }, scopeText: "ตัวกรอง: ค้างโอน", defaultTitle: cbPrintTitle("ค้างโอน"), banks, printedAt: "03/11/2569 14:20", printedBy: "Patty", origin: "https://x" });
};
const three = BILLS.slice(0, 3);

describe("china bills print", () => {
  it("maps api rows with the same status rules as the app list", () => {
    expect(BILLS.map((b) => b.status)).toEqual(API_ROWS.map(billStatus3));
    expect(BILLS[3].status).toBe("โอนแล้วบางส่วน");
    expect(BILLS[3].paid).toBe(4000);
    expect(BILLS[4]).toMatchObject({ thb: true, name: "ค่าส่ง", amountThb: 1200 });
    expect(API_ROWS.filter((r) => billInFilter(r, "ค้างโอน")).map((r) => r.id)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  });

  it("default = fee + rate on: totals include fee, unrated bills estimated with tier from their combined yuan", () => {
    const r = build(three);
    // ¥79,117 → ชั้น R2 = 5.2 − 0.035
    expect(rateForRmb(79117, 5.2)).toBe(5.165);
    expect(r.html).toContain("¥79,117");
    expect(r.html).toContain("~5.165");
    expect(r.html).toContain("ชั้น R2 = 5.2 − 0.035");
    expect(r.html).toContain("~฿408,639.31");   // 79,117 × 5.165
    expect(r.html).toContain("ค่าโอน ¥");
    expect(r.count).toBe(3);
  });

  it("fee off = no fee/total columns and every amount excludes the fee (owner's choice)", () => {
    const r = build(three, { opts: { fee: false } });
    expect(r.html).not.toContain("ค่าโอน ¥");
    expect(r.html).not.toContain("¥79,117");
    expect(r.html).toContain("¥79,067");
    expect(r.html).toContain("ยอดไม่รวมค่าโอน");
    // ฿ ก็ไม่รวมค่าโอน: 79,067 × 5.165
    expect(r.html).toContain("~฿408,381.06");
  });

  it("rate off = no rate/baht columns and no calculation box", () => {
    const r = build(three, { opts: { rate: false } });
    expect(r.html).not.toContain("เงินบาท");
    expect(r.html).not.toContain("cb-rate\"");
    expect(r.html).not.toContain("~5.165");
  });

  it("uses the bill's own rate when it has one, and shows ‘รอเรท’ when no base rate is known", () => {
    const withOwn = build([BILLS[3]]);
    expect(withOwn.html).toContain("฿52,262.91");   // 10,158 × 5.145
    expect(withOwn.html).toContain(">5.145<");
    expect(withOwn.html).not.toContain("~");
    const noBase = build(three, {}, 0);
    expect(noBase.html).toContain("รอเรท");
  });

  it("baht bills keep their baht amount; cancelled bills are struck through and not counted", () => {
    const r = build(BILLS);
    expect(r.html).toContain("ค่าส่ง/VAT 1 บิล");
    expect(r.html).toContain("฿1,200");
    expect(r.html).toContain("ไม่นับยกเลิก 1");
    expect(r.html).toContain("<s>");
    expect(r.html).toContain("รวม 5 บิล");
  });

  it("bank switch prints the shop account under the shop name", () => {
    const banks = new Map<string, CbBank>([["s1", { bank: "ICBC", account: "6222 0001", name: "ZHANG" }]]);
    const r = build(three, { opts: { bank: true } }, 5.2, banks);
    expect(r.html).toContain("ICBC · 6222 0001 · ZHANG");
    expect(r.html).toContain("ยังไม่มีเลขบัญชี");
  });

  it("columns follow the switches, presets carry the switches, and text is escaped", () => {
    expect(cbPrintColumnsFor({ rate: false, fee: false, bank: false }).map((c) => c.key)).not.toContain("fee");
    expect(cbPrintColumnsFor({ rate: false, fee: false, bank: false }).map((c) => c.key)).not.toContain("thb");
    const base = cbPrintDefaults();
    const plain = applyListPrintPreset(base, cbPrintPresets().find((p) => p.id === "cb-plain")!, CB_PRINT_COLUMNS);
    expect(cbPrintOpts(plain)).toEqual({ rate: false, fee: false, bank: false });
    const evil = cbBillsFromApi([{ id: "x", supplier_label: "<b>ร้าน</b>", amount_rmb: 1, status: "รอโอน" }]);
    expect(build(evil).html).toContain("&lt;b&gt;ร้าน");
    expect(build([]).html).toContain("ไม่มีบิลตามที่เลือก");
  });

  it("groups by shop with a subtotal per group", () => {
    const r = build(BILLS.slice(0, 4), { groupBy: "shop" });
    expect(r.groupCounts.length).toBe(3);
    expect(r.html).toContain("grp-row");
  });
});
