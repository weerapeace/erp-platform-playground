/**
 * คัดลอกใบเสนอราคา → หัวใบ + บรรทัด สำหรับสร้างใบร่างใหม่ (pure)
 * ใช้ร่วม: ปุ่ม "คัดลอก" หน้า /quotations (app/api/quotations/[id]/copy) · "ไม่ผ่าน · เปิดใบใหม่แทน" จากใบงานออกแบบ
 *
 * ไม่ก๊อป: เลขที่ใบ · สถานะ (ใบใหม่เป็นร่างเสมอ) · ประวัติส่ง/ตอบรับ
 * วันที่: ใบใหม่ = วันนี้ · ยืนราคาถึง = เลื่อนตามช่วงเดิมของใบต้นทาง (ไม่มี = +30 วัน)
 */
import type { QuoteDetail } from "@/app/api/quotations/route";

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function quoteCopyPayload(q: QuoteDetail, today: Date = new Date()) {
  const days = q.quote_date && q.valid_until
    ? Math.max(1, Math.round((new Date(q.valid_until).getTime() - new Date(q.quote_date).getTime()) / DAY))
    : 30;
  const header = {
    customer_id: q.customer_id ?? null,
    customer_name: q.customer_name ?? null,
    customer_code: q.customer_code ?? null,
    sale_person_name: q.sale_person_name ?? null,
    currency: q.currency ?? "THB",
    exchange_rate: q.exchange_rate ?? 1,
    header_discount_type: q.header_discount_type ?? "percent",
    header_discount_value: q.header_discount_value ?? 0,
    shipping_fee: q.shipping_fee ?? 0,
    vat_rate: q.vat_rate ?? 7,
    vat_included: q.vat_included ?? false,
    wht_rate: q.wht_rate ?? 0,
    quote_date: iso(today),
    valid_until: iso(new Date(today.getTime() + days * DAY)),
    note: q.note ?? null,
  };
  const lines = (q.lines ?? []).map((l) => ({
    product_id: l.product_id ?? null, sku: l.sku ?? null, product_name: l.product_name,
    qty: l.qty, unit: l.unit, unit_price: l.unit_price,
    discount_type: l.discount_type ?? "percent", discount_value: l.discount_value ?? 0,
    tax_code: l.tax_code ?? null, note: l.note ?? null,
    image_key: l.image_key ?? null,      // รูปที่แนบไว้ติดไปด้วย
  }));
  return { header, lines };
}
