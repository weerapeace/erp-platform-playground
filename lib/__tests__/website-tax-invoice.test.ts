import { describe, it, expect } from "vitest";
import { branchLabel, cleanTaxInvoice, thaiTaxIdValid, vatSplit } from "../website-tax-invoice";
import { taxInvoiceHtml, type TaxInvoiceDoc } from "../website-tax-invoice-print";
import { createStorefrontOrder, validateOrderInput } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/** 🧾 ใบกำกับภาษีเต็มรูปของออเดอร์เว็บ (ชุด 4 · 2026-10-22) */
const CO_ID = "0105550123451"; // นิติบุคคล (หลักตรวจสอบถูก)
const PERSON_ID = "1101700123456";

describe("🧾 กฎใบกำกับ", () => {
  it("เลข 13 หลัก + หลักตรวจสอบ", () => {
    expect(thaiTaxIdValid(CO_ID)).toBe(true);
    expect(thaiTaxIdValid("0-1055-50123-45-1")).toBe(true);
    expect(thaiTaxIdValid("0105550123452")).toBe(false);
    expect(thaiTaxIdValid("12345")).toBe(false);
  });
  it("ล้างข้อมูล: นิติบุคคลไม่ใส่สาขา = สำนักงานใหญ่ · บุคคล = ไม่มีสาขา · ผิด = บอกเหตุผล · ไม่ขอ = null", () => {
    expect(cleanTaxInvoice({ kind: "company", name: " บริษัท ตัวอย่าง จำกัด ", taxId: "0-1055-50123-45-1", address: "99/9 ถ.สุขุมวิท กรุงเทพฯ 10110" })).toEqual({
      ok: true,
      value: { kind: "company", name: "บริษัท ตัวอย่าง จำกัด", taxId: CO_ID, branch: "00000", address: "99/9 ถ.สุขุมวิท กรุงเทพฯ 10110" },
    });
    expect(cleanTaxInvoice({ kind: "company", name: "ABC", taxId: CO_ID, branch: "12", address: "1234567890 ที่อยู่" })).toMatchObject({ ok: true, value: { branch: "00012" } });
    expect(cleanTaxInvoice({ kind: "person", name: "สมชาย", taxId: PERSON_ID, branch: "5", address: "1234567890 ที่อยู่" })).toMatchObject({ ok: true, value: { branch: "" } });
    expect(cleanTaxInvoice({ kind: "person", name: "สมชาย", taxId: "1101700123450", address: "1234567890 ที่อยู่" })).toMatchObject({ ok: false });
    expect(cleanTaxInvoice(null)).toEqual({ ok: true, value: null });
    expect(branchLabel({ kind: "company", branch: "00000" })).toBe("สำนักงานใหญ่");
    expect(branchLabel({ kind: "company", branch: "00012" })).toBe("สาขาที่ 00012");
  });
  it("แยก VAT 7% จากยอดรวม (base + vat = ยอดรวมเสมอ)", () => {
    expect(vatSplit(1070)).toEqual({ base: 1000, vat: 70, total: 1070 });
    const s = vatSplit(999.99);
    expect(s.base + s.vat).toBeCloseTo(999.99, 2);
  });
});

describe("🖨 หน้าตาใบกำกับ", () => {
  const doc: TaxInvoiceDoc = {
    no: "LM-TI2610-00001",
    issuedAt: "2026-10-22T03:00:00Z",
    orderNo: "LM2610-00001",
    company: { name: "บริษัท หลุยส์ จำกัด", nameEn: "", address: "1 ถ.ทดสอบ", phone: "02-000-0000", taxId: "0-1055-50123-45-1", vatRegistered: true },
    customer: { kind: "company", name: "บริษัท <ลูกค้า> จำกัด", taxId: CO_ID, branch: "00000", address: "99/9 กรุงเทพฯ" },
    lines: [{ name: "กระเป๋า", variant: "ดำ", qty: 1, unitPrice: 1000, lineTotal: 1000 }],
    extras: [{ label: "ค่าจัดส่ง", amount: 70 }, { label: "ห่อ", amount: 0 }],
    discount: 0,
    total: 1070,
  };
  it("หัวเรื่อง · ต้นฉบับ+สำเนา · VAT · ตัวหนังสือ · กันโค้ดแปลกในชื่อ", () => {
    const html = taxInvoiceHtml(doc);
    expect(html).toContain("ใบกำกับภาษี / ใบเสร็จรับเงิน");
    expect(html).toContain("ต้นฉบับ");
    expect(html).toContain("สำเนา");
    expect(html).toContain("1,000.00");
    expect(html).toContain("70.00");
    expect(html).toContain("&lt;ลูกค้า&gt;");
    expect(html).not.toContain("<ลูกค้า>");
    expect(html).not.toContain(">ห่อ<");
    expect(html).toContain("0-1055-50123-45-1");
  });
  it("บริษัทไม่จด VAT = ใบเสร็จรับเงิน ไม่แยกภาษี", () => {
    const html = taxInvoiceHtml({ ...doc, company: { ...doc.company, vatRegistered: false } });
    expect(html).toContain("ใบเสร็จรับเงิน");
    expect(html).not.toContain("ภาษีมูลค่าเพิ่ม 7%");
  });
});

describe("🛒 สั่งซื้อพร้อมขอใบกำกับ", () => {
  type Db = Parameters<typeof createStorefrontOrder>[0];
  const SHOP = { id: "shop-1", slug: "louis", field_map: null };
  const P = "11111111-2222-3333-4444-555555555555";
  const setup = (enabled: boolean) => {
    const tables: Record<string, Row[]> = {
      store_settings: Object.entries({ shipping_flat: "0", free_shipping_min: "0", pay_cod: "1", pay_promptpay: "1", promptpay_number: "0812345678", tax_invoice_enabled: enabled ? "1" : "0" }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
      store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋า", web_price: 1070, web_stock_status: "in" }],
      parent_skus_v2: [{ id: P, code: "BAG01", name: "กระเป๋า", category_id: null }],
      skus_v2: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", parent_sku_id: P, code: "BAG01-01", color: "ดำ", list_price: 1070, is_active: true, attribute_values: null }],
      store_orders: [],
      store_order_items: [],
    };
    return { tables, db: fakeDb(tables) as unknown as Db };
  };
  const body = { items: [{ productId: P, qty: 1 }], customer: { name: "สมหญิง", phone: "0812345678" }, ship: { addressLine: "99/9 ถ.สุขุมวิท" }, paymentMethod: "cod", taxInvoice: { kind: "company", name: "บริษัท ตัวอย่าง จำกัด", taxId: CO_ID, address: "99/9 ถ.สุขุมวิท กรุงเทพฯ 10110" } };
  it("เลขผิด = ไม่รับออเดอร์ บอกเหตุผล", () => {
    expect(validateOrderInput({ ...body, taxInvoice: { ...body.taxInvoice, taxId: "0105550123452" } })).toMatchObject({ ok: false, error: expect.stringContaining("เลขประจำตัวผู้เสียภาษี") });
  });
  it("ร้านเปิด = เก็บคำขอกับออเดอร์ · ร้านปิด = ไม่เก็บ (ออเดอร์ผ่าน)", async () => {
    const on = setup(true);
    expect((await createStorefrontOrder(on.db, SHOP, body)).ok).toBe(true);
    expect(on.tables.store_orders[0].tax_invoice).toMatchObject({ kind: "company", taxId: CO_ID, branch: "00000" });
    const off = setup(false);
    expect((await createStorefrontOrder(off.db, SHOP, body)).ok).toBe(true);
    expect(off.tables.store_orders[0].tax_invoice).toBeUndefined();
  });
});
