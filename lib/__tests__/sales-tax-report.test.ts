import { describe, it, expect } from "vitest";
import {
  analyzeInvoiceSequence, branchLabel, splitTaxId, invoiceRow, creditNoteRow, sortSalesTaxRows, summarizeSalesTax, dropVoidedInvoices,
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
    expect(s.void_n).toBe(0);
  });
});

describe("เลขที่ยกเลิกถูกนำกลับมาใช้ (ระบบเลขเอกสารคืนเลข) — ผลต่อรายงานภาษีขาย", () => {
  const cust = { tax_id: "0105561095357", branch: "00000" };
  // เคสจริง ก.ย. 2569: 009 ถูกยกเลิก (14/09) แล้วใบใหม่ได้เลข 009 ซ้ำ (16/09)
  const cxl009 = invoiceRow({ id: "x", tax_invoice_no: "ISG2569-09-009", order_date: "2026-09-14", customer_name: "A", status: "cancelled", taxable: 20800, total_vat: 1456 }, cust);
  const live009 = invoiceRow({ id: "y", tax_invoice_no: "ISG2569-09-009", order_date: "2026-09-16", customer_name: "B", status: "confirmed", taxable: 45000, total_vat: 3150 }, cust);
  const live010 = invoiceRow({ id: "z", tax_invoice_no: "ISG2569-09-010", order_date: "2026-09-16", customer_name: "B", status: "confirmed", taxable: 1000, total_vat: 70 }, cust);
  // ใบยกเลิกที่เลขยังไม่ถูกใช้ซ้ำ → ต้องยังอยู่ (ยอด 0) เพื่ออธิบายเลขที่หาย
  const cxl011 = invoiceRow({ id: "w", tax_invoice_no: "ISG2569-09-011", order_date: "2026-09-20", customer_name: "C", status: "cancelled", taxable: 500, total_vat: 35 }, cust);

  it("ใบยกเลิกที่เลขถูกใบใหม่ใช้ซ้ำ → ตัดออก · ใบยกเลิกที่เลขยังว่าง → คงไว้", () => {
    const { rows, void_n } = dropVoidedInvoices([cxl009, live009, live010, cxl011]);
    expect(void_n).toBe(1);
    expect(rows.map(r => `${r.doc_no}:${r.status}`)).toEqual(["ISG2569-09-009:confirmed", "ISG2569-09-010:confirmed", "ISG2569-09-011:cancelled"]);
  });
  it("นับ 'ซ้ำ' เฉพาะใบที่ยังไม่ยกเลิก — เลขที่ใบยกเลิกใช้ร่วมกับใบใหม่ไม่ใช่ความผิด", () => {
    const all = ["ISG2569-09-009", "ISG2569-09-009", "ISG2569-09-010"];
    expect(analyzeInvoiceSequence(all).duplicates).toEqual(["ISG2569-09-009"]);                       // ไม่บอกว่าใบไหนยกเลิก → ซ้ำ
    expect(analyzeInvoiceSequence(all, ["ISG2569-09-009", "ISG2569-09-010"]).duplicates).toEqual([]);  // บอกแล้ว → ไม่ซ้ำ
    expect(analyzeInvoiceSequence(all, ["ISG2569-09-009", "ISG2569-09-009"]).duplicates).toEqual(["ISG2569-09-009"]); // ซ้ำจริงระหว่างใบที่ยังอยู่
  });
  it("สรุปนับ void_n แยกจาก cancelled_n", () => {
    const { rows, void_n } = dropVoidedInvoices([cxl009, live009, live010, cxl011]);
    const s = summarizeSalesTax(rows, { n: 0, total: 0 }, void_n);
    expect(s.invoice_n).toBe(2);
    expect(s.cancelled_n).toBe(1);
    expect(s.void_n).toBe(1);
    expect(s.invoice_taxable).toBe(46000);
  });
});
