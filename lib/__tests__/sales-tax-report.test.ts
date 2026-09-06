import { describe, it, expect } from "vitest";
import {
  analyzeInvoiceSequence, branchLabel, splitTaxId, invoiceRow, creditNoteRow, sortSalesTaxRows, summarizeSalesTax,
} from "@/lib/sales-tax-report";
import { monthRange, shiftMonth, monthLabelTh, thisMonth, isMonthKey } from "@/lib/month";

describe("lib/month — ของกลางเรื่องเดือน", () => {
  it("monthRange ใช้ Date.UTC → วันสุดท้ายของเดือนไม่หาย (กับดัก timezone ไทย)", () => {
    expect(monthRange("2026-08")).toEqual({ from: "2026-08-01", to: "2026-09-01" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
  it("shiftMonth ข้ามปีได้", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("monthLabelTh เป็น พ.ศ. โดยค่าเริ่มต้น", () => {
    expect(monthLabelTh("2026-08")).toBe("สิงหาคม 2569");
    expect(monthLabelTh("2026-08", { era: "ce" })).toBe("สิงหาคม 2026");
  });
  it("thisMonth ใช้เวลาเครื่อง ไม่ใช่ UTC", () => {
    expect(thisMonth(new Date(2026, 8, 1, 3, 0, 0))).toBe("2026-09");
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-09")).toBe(true);
  });
});

describe("analyzeInvoiceSequence — ตรวจเลขใบกำกับขาด/ซ้ำ", () => {
  it("หาเลขที่หายไประหว่างต่ำสุด-สูงสุด", () => {
    const r = analyzeInvoiceSequence(["ISG2569-08-001", "ISG2569-08-002", "ISG2569-08-005"]);
    expect(r.gaps).toEqual(["ISG2569-08-003", "ISG2569-08-004"]);
    expect(r.duplicates).toEqual([]);
  });
  it("จับเลขซ้ำ (เคสจริง ส.ค. 2569: 010 และ 013 อย่างละ 2 ใบ)", () => {
    const r = analyzeInvoiceSequence(["ISG2569-08-010", "ISG2569-08-010", "ISG2569-08-011", "ISG2569-08-013", "ISG2569-08-013"]);
    expect(r.duplicates).toEqual(["ISG2569-08-010", "ISG2569-08-013"]);
    expect(r.gaps).toEqual(["ISG2569-08-012"]);
  });
  it("คำนำหน้าต่างกันแยกชุดกัน · เลขที่ไม่ลงท้ายด้วยตัวเลขข้ามไป · ว่างเปล่าไม่พัง", () => {
    const r = analyzeInvoiceSequence(["ISG2569-08-001", "ISG2569-08-003", "LM-0001", "LM-0002", "ABC", ""]);
    expect(r.gaps).toEqual(["ISG2569-08-002"]);
    expect(analyzeInvoiceSequence([])).toEqual({ gaps: [], duplicates: [] });
  });
});

describe("branchLabel / splitTaxId", () => {
  it("แปลงช่องสาขาเป็นป้ายอ่านง่าย", () => {
    expect(branchLabel("00000")).toBe("สำนักงานใหญ่");
    expect(branchLabel("")).toBe("สำนักงานใหญ่");
    expect(branchLabel(null, false)).toBe("");
    expect(branchLabel("5")).toBe("สาขา 00005");
    expect(branchLabel("00005")).toBe("สาขา 00005");
    // ข้อมูลผิดช่อง (เลขผู้เสียภาษีอยู่ในช่องสาขา) — โชว์ตามจริงให้คนเห็น
    expect(branchLabel("0105555014413")).toBe("0105555014413");
  });
  it("แกะเลข 13 หลัก + สาขา จากข้อความที่ format แล้ว", () => {
    expect(splitTaxId("0105561095357 (สาขา 00005)")).toEqual({ tax_id: "0105561095357", branch: "00005" });
    expect(splitTaxId("0105561095357")).toEqual({ tax_id: "0105561095357", branch: "" });
    expect(splitTaxId("")).toEqual({ tax_id: "", branch: "" });
  });
});

describe("invoiceRow / creditNoteRow / summarizeSalesTax", () => {
  const cust = { tax_id: "0105561095357", branch: "00005" };
  const inv1 = invoiceRow({ id: "a", tax_invoice_no: "ISG2569-08-001", so_number: "ISG2569-08-001", order_date: "2026-08-05", customer_name: "ลูกค้า A", status: "confirmed", taxable: 12190, total_vat: 853.3 }, cust);
  const draft = invoiceRow({ id: "b", tax_invoice_no: "ISG2569-08-011", order_date: "2026-08-25", customer_name: "ลูกค้า B", status: "draft", taxable: 45000, total_vat: 3150 }, null);
  const cxl = invoiceRow({ id: "c", tax_invoice_no: "ISG2569-08-010", order_date: "2026-08-21", customer_name: "ลูกค้า C", status: "cancelled", taxable: 18000, total_vat: 1260 }, cust);
  const cn = creditNoteRow({ id: "d", cn_number: "CN-2026-08-001", status: "issued", ref_invoice_no: "ISG2569-07-023", cn_date: "2026-08-21", customer_name: "ลูกค้า A", customer_tax_id: "0105561095357 (สาขา 00005)", diff_amount: 340, vat_amount: 23.8 }, null);

  it("ใบยกเลิกยังอยู่ในรายงานแต่ยอดเป็น 0 + หมายเหตุบอกยอดเดิม", () => {
    expect(cxl.taxable).toBe(0); expect(cxl.vat).toBe(0);
    expect(cxl.remark).toContain("ยกเลิก");
    expect(cxl.remark).toContain("19,260.00");
  });
  it("ใบร่างติดธง · ลูกค้าไม่มีทะเบียน = ไม่มีเลขผู้เสียภาษี/สาขาว่าง", () => {
    expect(draft.draft).toBe(true);
    expect(draft.customer_tax_id).toBe("");
    expect(draft.customer_branch).toBe("");
    expect(inv1.customer_branch).toBe("สาขา 00005");
    expect(inv1.ref_no).toBeNull();   // เลข SO = เลขใบกำกับ → ไม่ต้องโชว์ซ้ำ
  });
  it("ใบลดหนี้ติดลบ + แกะเลขผู้เสียภาษีจากข้อความบนใบเมื่อไม่มีทะเบียน", () => {
    expect(cn.taxable).toBe(-340); expect(cn.vat).toBe(-23.8); expect(cn.total).toBe(-363.8);
    expect(cn.customer_tax_id).toBe("0105561095357");
    expect(cn.customer_branch).toBe("สาขา 00005");
    expect(cn.remark).toContain("ISG2569-07-023");
  });
  it("เรียง: ใบกำกับตามเลขที่ก่อน แล้วค่อยใบลดหนี้", () => {
    expect(sortSalesTaxRows([cn, draft, cxl, inv1]).map(r => r.doc_no))
      .toEqual(["ISG2569-08-001", "ISG2569-08-010", "ISG2569-08-011", "CN-2026-08-001"]);
  });
  it("สรุป: ไม่นับยกเลิก · นับร่างแต่แยกยอดให้เห็น · หักใบลดหนี้ · นับลูกค้าไม่มีเลขภาษี", () => {
    const s = summarizeSalesTax([inv1, draft, cxl, cn], { n: 1, total: 60000 });
    expect(s.invoice_n).toBe(2);
    expect(s.cancelled_n).toBe(1);
    expect(s.invoice_taxable).toBe(57190);
    expect(s.invoice_vat).toBe(4003.3);
    expect(s.draft_n).toBe(1); expect(s.draft_taxable).toBe(45000);
    expect(s.cn_n).toBe(1); expect(s.cn_taxable).toBe(340); expect(s.cn_vat).toBe(23.8);
    expect(s.net_taxable).toBe(56850);
    expect(s.net_vat).toBe(3979.5);
    expect(s.net_total).toBe(60829.5);
    expect(s.no_vat_n).toBe(1); expect(s.no_vat_total).toBe(60000);
    expect(s.missing_tax_id_n).toBe(1);
  });
});
