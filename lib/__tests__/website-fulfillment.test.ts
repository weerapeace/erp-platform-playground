import { describe, expect, it } from "vitest";
import { fulfillmentPrintHtml, isReadyToPack, parseTrackingPaste, type PackOrder } from "@/lib/website-fulfillment";

const base: PackOrder = {
  id: "o1", orderNo: "LM-256910-00012", status: "pending", paymentMethod: "promptpay", paymentStatus: "paid",
  customerName: "สมหญิง", customerPhone: "0812345678",
  ship: { addressLine: "99/9 ถ.สีลม", subdistrict: "สีลม", district: "บางรัก", province: "กรุงเทพมหานคร", postal: "10500" },
  items: [{ name: "กระเป๋า <b>", variantLabel: "ดำ", qty: 2, lineTotal: 2180 }], grandTotal: 2230, createdAt: "2026-10-20T05:00:00Z",
  shippingMethod: { label: "ส่งธรรมดา", box: "B" },
};

describe("isReadyToPack", () => {
  it("จ่ายแล้ว/เก็บปลายทาง + ยังไม่ส่ง = พร้อมแพ็ก", () => {
    expect(isReadyToPack(base)).toBe(true);
    expect(isReadyToPack({ ...base, paymentMethod: "cod", paymentStatus: "unpaid" })).toBe(true);
    expect(isReadyToPack({ ...base, status: "preparing" })).toBe(true);
  });
  it("ยังไม่จ่าย/รอตรวจ/ส่งแล้ว/ยกเลิก = ไม่พร้อม", () => {
    expect(isReadyToPack({ ...base, paymentStatus: "unpaid" })).toBe(false);
    expect(isReadyToPack({ ...base, paymentStatus: "verifying" })).toBe(false);
    expect(isReadyToPack({ ...base, status: "shipped" })).toBe(false);
    expect(isReadyToPack({ ...base, status: "cancelled" })).toBe(false);
  });
});

describe("parseTrackingPaste", () => {
  const orders = [
    { id: "o1", orderNo: "LM-256910-00012", tracking: null },
    { id: "o2", orderNo: "LM-256910-00013", tracking: { number: "OLD123456789" } },
  ];
  it("จับคู่ได้ทุกลำดับคอลัมน์ + ตัวคั่นหลายแบบ + คอลัมน์อื่นปน", () => {
    const r = parseTrackingPaste("LM-256910-00012\tTH12345678901\nKEX987654321, lm-256910-00013, 2 ชิ้น", orders);
    expect(r).toEqual([
      { ok: true, line: 1, orderNo: "LM-256910-00012", orderId: "o1", trackingNo: "TH12345678901", replaces: null },
      { ok: true, line: 2, orderNo: "LM-256910-00013", orderId: "o2", trackingNo: "KEX987654321", replaces: "OLD123456789" },
    ]);
  });
  it("บอกเหตุผลบรรทัดที่ใช้ไม่ได้", () => {
    const r = parseTrackingPaste("XX-1 TH123456789\nLM-256910-00012 12\nLM-256910-00012 TH99999999\nLM-256910-00012 TH88888888", orders);
    expect(r.map((x) => (x.ok ? "ok" : x.reason))).toEqual([
      "ไม่พบเลขออเดอร์ของร้านในบรรทัดนี้",
      "ไม่พบเลขพัสดุ (ตัวอักษร/ตัวเลข 8 ตัวขึ้นไป)",
      "ok",
      "เลขออเดอร์ซ้ำกับบรรทัดก่อนหน้า",
    ]);
  });
});

describe("fulfillmentPrintHtml", () => {
  const sender = { name: "Louis", phone: "02-000-0000", address: "สาทร" };
  it("ใบปะหน้า + ใบแพ็ก: escape ข้อความ · COD ตัวใหญ่เฉพาะเก็บปลายทาง", () => {
    const h = fulfillmentPrintHtml([base, { ...base, id: "o2", orderNo: "X-2", paymentMethod: "cod", paymentStatus: "unpaid" }], sender, "both");
    expect(h).toContain("กระเป๋า &lt;b&gt;");
    expect(h).toContain("10500");
    expect(h).toContain("กล่อง <b>B</b>");
    expect((h.match(/class="cod"/g) ?? []).length).toBe(1);
    expect((h.match(/class="page"/g) ?? []).length).toBe(2);
  });
  it("ใบปะหน้าอย่างเดียว = 4 ใบต่อแผ่น", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ ...base, id: `o${i}`, orderNo: `N-${i}` }));
    const h = fulfillmentPrintHtml(five, sender, "labels");
    expect((h.match(/class="page grid"/g) ?? []).length).toBe(2);
    expect(h).not.toContain("ใบแพ็กสินค้า");
  });
});
