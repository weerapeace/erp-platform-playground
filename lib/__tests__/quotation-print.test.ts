import { describe, expect, it } from "vitest";

import { buildQuotationHtml, buildQuoteTemplateData, quoteLinePrintAmount } from "@/lib/quotation-print";

describe("quotation print", () => {
  const quote = {
    id: "q1",
    quote_number: "QT-202606-0003",
    status: "draft",
    customer_id: "c1",
    customer_name: "บริษัท ตัวอย่าง จำกัด",
    customer_code: "CUS-001",
    customer_address: "41/1 ถนนตัวอย่าง กรุงเทพฯ",
    customer_phone: "02-000-0000",
    sale_person_name: "Gogo",
    currency: "THB",
    grand_total: 310300,
    amount_due: 310300,
    quote_date: "2026-06-11",
    valid_until: null,
    converted_so_id: null,
    line_count: 1,
    created_at: "2026-06-11",
    updated_at: "2026-06-11",
    total_count: 1,
    exchange_rate: 1,
    header_discount_type: "amount" as const,
    header_discount_value: 0,
    shipping_fee: 0,
    vat_rate: 7,
    vat_included: false,
    wht_rate: 0,
    subtotal: 290000,
    total_line_discount: 0,
    total_header_discount: 0,
    total_shipping: 0,
    taxable: 290000,
    total_vat: 20300,
    total_wht: 0,
    sent_at: null,
    accepted_at: null,
    converted_at: null,
    reject_reason: null,
    note: "",
    lines: [
      {
        sku: "DS-2026-0002",
        product_name: "กระเป๋าใส่เหรียญ",
        qty: 5000,
        unit: "ชิ้น",
        unit_price: 58,
        net_amount: 290000,
        line_total: 310300,
        note: null,
      },
    ],
  };

  it("prints line amounts before VAT instead of the VAT-included total", () => {
    expect(quoteLinePrintAmount(quote.lines[0])).toBe(290000);

    const data = buildQuoteTemplateData(quote, "");

    expect(data.subtotal).toBe("290,000.00");
    expect(data.grand_total).toBe("310,300.00");
    expect((data.lines as Array<Record<string, unknown>>)[0].line_total).toBe("290,000.00");
  });

  it("leaves image and design-sheet codes blank when no real SKU or image exists", () => {
    const data = buildQuoteTemplateData(quote, "");
    const firstLine = (data.lines as Array<Record<string, unknown>>)[0];

    expect(firstLine.sku).toBe("");
    expect(firstLine.image_html).toBe("");

    const html = buildQuotationHtml(quote, "");

    expect(html).not.toContain("DS-2026-0002");
    expect(html).not.toContain("ไม่มีรูป");
  });

  it("keeps the signature area pushed to the bottom on short quotations", () => {
    const html = buildQuotationHtml(quote, "");

    expect(html).toContain("display: flex");
    expect(html).toContain("margin-top: auto");
  });

  it("applies report layout settings to the printable quotation", () => {
    const html = buildQuotationHtml(quote, "", {
      topMarginMm: 8,
      horizontalMarginMm: 10,
      bottomMarginMm: 8,
      fontSizePx: 10,
      rowHeightMm: 18,
      signatureGapMm: 10,
      signatureToBottom: true,
      showSku: false,
      showImage: false,
      showPhone: false,
      showResponsible: false,
      showNote: false,
    });

    expect(html).toContain("font-size: 10px");
    expect(html).toContain("padding: 8mm 10mm 8mm");
    expect(html).toContain("height: 18mm");
    expect(html).toContain("margin-top: auto");
    expect(html).not.toContain("02-000-0000");
    expect(html).not.toContain("photo-cell");
    expect(html).not.toContain("center code");
  });

  it("prints authorized signature and company stamp assets when enabled", () => {
    const html = buildQuotationHtml(quote, "", {
      showAuthorizedSignature: true,
      authorizedSignatureUrl: "/uploads/signature.png",
      authorizedSignatureWidthMm: 38,
      authorizedSignatureOffsetXMm: -2,
      authorizedSignatureOffsetYMm: -4,
      showCompanyStamp: true,
      companyStampUrl: "https://assets.example.com/stamp.png?x=<tag>",
      companyStampWidthMm: 30,
      companyStampOffsetXMm: 22,
      companyStampOffsetYMm: -8,
    });

    expect(html).toContain("signature-image");
    expect(html).toContain('src="/uploads/signature.png"');
    expect(html).toContain("width: 38mm");
    expect(html).toContain("stamp-image");
    expect(html).toContain("https://assets.example.com/stamp.png?x=&lt;tag&gt;");
    expect(html).toContain("width: 30mm");
    expect(html).toContain("translate(calc(-50% + 22mm), -8mm)");
  });
});
