import { describe, it, expect } from "vitest";
import { pickQuoteDocs, quotePullBlock, type QuoteForPull } from "@/lib/quote-pull";

const q = (o: Partial<QuoteForPull> = {}): QuoteForPull => ({ id: "q1", quote_number: "QT-001", status: "sent", converted_so_id: null, customer_id: "c1", ...o });

describe("ดึงใบเสนอราคาเข้าใบสั่งขาย — ใบไหนดึงได้", () => {
  it("ส่งแล้ว / ตอบรับแล้ว ดึงได้", () => {
    expect(quotePullBlock(q())).toBeNull();
    expect(quotePullBlock(q({ status: "accepted" }))).toBeNull();
  });
  it("ร่าง / ปฏิเสธ / ยกเลิก / หมดอายุ / แปลงแล้ว ดึงไม่ได้ และบอกสถานะเป็นภาษาคน", () => {
    expect(quotePullBlock(q({ status: "draft" }))).toContain("ร่าง");
    for (const s of ["rejected", "cancelled", "expired", "converted"]) expect(quotePullBlock(q({ status: s }))).not.toBeNull();
  });
  it("แปลงเป็นใบขายตรงไปแล้ว / อยู่ในใบสั่งขายอื่น ดึงไม่ได้", () => {
    expect(quotePullBlock(q({ converted_so_id: "x" }))).toContain("ใบขาย");
    expect(quotePullBlock(q(), { linkedOrderNo: "SO2569-11-001" })).toContain("SO2569-11-001");
  });
  it("ใบที่อยู่ในใบสั่งขายที่กำลังแก้อยู่แล้ว (แปลงแล้ว) บันทึกซ้ำได้", () => {
    expect(quotePullBlock(q({ status: "converted" }), { mine: true })).toBeNull();
  });
  it("ลูกค้าต้องตรงกับใบสั่งขาย", () => {
    expect(quotePullBlock(q(), { customerId: "c2" })).toContain("ลูกค้าคนอื่น");
    expect(quotePullBlock(q(), { customerId: "c1" })).toBeNull();
  });
});

describe("หน้าจอเลือกหลายใบเข้าใบสั่งขายเดียว", () => {
  const d = (id: string, customer_id: string | null, customer_name: string) => ({ id, no: id.toUpperCase(), customer_id, customer_name });
  it("ยังไม่เลือกลูกค้า → ยึดลูกค้าใบแรก ข้ามใบของลูกค้าอื่น", () => {
    const r = pickQuoteDocs([d("a", "c1", "ร้าน A"), d("b", "c2", "ร้าน B"), d("c", "c1", "ร้าน A")], {});
    expect(r.keep.map((x) => x.id)).toEqual(["a", "c"]);
    expect(r.skipped).toEqual(["B (ลูกค้าคนอื่น)"]);
  });
  it("เลือกลูกค้าในฟอร์มแล้ว → ใช้ลูกค้านั้น · ใบที่อยู่ในฟอร์มแล้วไม่ดึงซ้ำ", () => {
    const r = pickQuoteDocs([d("a", "c1", "ร้าน A"), d("b", "c2", "ร้าน B")], { customerId: "c2", have: ["b"] });
    expect(r.keep).toEqual([]);
    expect(r.skipped).toEqual(["A (ลูกค้าคนอื่น)", "B (อยู่ในใบนี้แล้ว)"]);
  });
  it("ลูกค้าไม่มีรหัส → เทียบชื่อ", () => {
    const r = pickQuoteDocs([d("a", null, "ร้าน A "), d("b", null, "ร้าน a")], { customerName: "ร้าน A" });
    expect(r.keep.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
