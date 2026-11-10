/**
 * 🧪 ออเดอร์ตัวอย่างสำหรับ "โหมดทดลอง" ของศูนย์ออเดอร์ — pure · ไม่แตะฐานข้อมูล · ไม่ส่งอะไรขึ้นร้าน
 *
 * ใช้ระหว่างรอ Shopee อนุมัติ (เจ้าของ 2026-11-10: "เตรียมระบบไว้เลย ได้แล้วจะได้เชื่อมเลย")
 *   - รูปข้อมูลล้อ Shopee v2.order.get_order_detail (order_sn · order_status · ship_by_date · item_list)
 *     และ v2.order.get_buyer_invoice_info (ผู้ขอใบกำกับ) — แปลงเป็นแถวเดียวกับที่ API ส่งจริง (PlatformOrderRow)
 *   - กำหนดส่งคิดจาก "ตอนนี้" ทุกครั้ง → การ์ด เลยกำหนด/ต้องส่งวันนี้ มีตัวอย่างให้เห็นเสมอ
 *   - id ขึ้นต้นด้วย DEMO_PREFIX → API รู้ว่าเป็นของจำลอง ตอบผลจำลองโดยไม่บันทึก
 * ใช้ที่: app/api/platform-orders (?demo=1) · app/api/platform-orders/invoice · app/print/platform-orders
 */
import type { PlatformOrderItemRow, PlatformOrderRow } from "@/lib/platform-order-status";
import { shopeeToInternal } from "@/lib/platform-order-status";
import type { TaxInvoiceRequest } from "@/lib/website-tax-invoice";
import type { ShipTo } from "@/lib/order-shipping";

export const DEMO_PREFIX = "demo-";
export const isDemoId = (id: string | null | undefined) => String(id ?? "").startsWith(DEMO_PREFIX);

export type DemoOrder = PlatformOrderRow & {
  items: PlatformOrderItemRow[];
  tax_invoice_request: TaxInvoiceRequest | null;
  recipient: { name: string; phone: string; address: string };
  note: string | null;
  /** shopee = ออเดอร์แบบ Shopee (ขนส่งของแพลตฟอร์ม) · null = ช่องทางของเรา (ส่งผ่าน SHIPPOP ได้) */
  platform_code: string | null;
  ship_to: ShipTo | null;
};

type Seed = {
  sn: string; status: string; shipInH: number | null; orderedAgoH: number; buyer: string; phone: string; address: string;
  items: [sku: string, name: string, variant: string | null, qty: number, price: number][];
  tracking?: string; invoice?: TaxInvoiceRequest; note?: string;
  /** ช่องทางของเรา (LINE แชต / โทร) + ที่อยู่แยกช่อง · ไม่มี = ออเดอร์แบบ Shopee */
  own?: { channel: string; shipTo: ShipTo; cod?: number };
};

// สินค้าตัวอย่าง = รหัสแบบเดียวกับร้าน IG (ตัวเลข/ชื่อสมมติ)
const SEEDS: Seed[] = [
  { sn: "251110ABCD01", status: "READY_TO_SHIP", shipInH: -3, orderedAgoH: 50, buyer: "ค***", phone: "(+66) 8*****21", address: "แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500",
    items: [["BCN25-BLK", "กระเป๋าสตางค์หนังแท้ BCN25", "ดำ", 1, 890]] },
  { sn: "251110ABCD02", status: "READY_TO_SHIP", shipInH: 5, orderedAgoH: 20, buyer: "ส***", phone: "(+66) 9*****44", address: "ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    items: [["BT01-BRN-34", "เข็มขัดหนังแท้ BT01", "น้ำตาล / 34", 2, 790]],
    invoice: { kind: "company", name: "บริษัท ตัวอย่าง จำกัด", taxId: "0105550123451", branch: "00000", address: "99 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500", email: "account@example.com" } },
  { sn: "251110ABCD03", status: "READY_TO_SHIP", shipInH: 30, orderedAgoH: 6, buyer: "ป***", phone: "(+66) 6*****09", address: "ต.หาดใหญ่ อ.หาดใหญ่ จ.สงขลา 90110",
    items: [["IG-EQ008", "ที่ง้างโซ่ IG-EQ008", null, 1, 290], ["LEA-OIL-001", "น้ำมันบำรุงหนัง 100ml", null, 2, 159]] },
  { sn: "251110ABCD04", status: "READY_TO_SHIP", shipInH: 52, orderedAgoH: 3, buyer: "ว***", phone: "(+66) 8*****77", address: "ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300",
    items: [["BCN25-BRN", "กระเป๋าสตางค์หนังแท้ BCN25", "น้ำตาล", 1, 890], ["BCN32", "กระเป๋าใส่บัตร BCN32", "ดำ", 1, 450]], note: "ขอกล่องของขวัญ" },
  { sn: "251110ABCD05", status: "IN_CANCEL", shipInH: 26, orderedAgoH: 10, buyer: "อ***", phone: "(+66) 9*****13", address: "ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540",
    items: [["BT01-BLK-36", "เข็มขัดหนังแท้ BT01", "ดำ / 36", 1, 790]] },
  { sn: "251110ABCD06", status: "UNPAID", shipInH: 70, orderedAgoH: 1, buyer: "ณ***", phone: "(+66) 8*****56", address: "ต.ในเมือง อ.เมือง จ.นครราชสีมา 30000",
    items: [["IG-PU001", "กระเป๋าพียู IG-PU001", null, 1, 350]] },
  { sn: "251109ABCD07", status: "PROCESSED", shipInH: 8, orderedAgoH: 30, buyer: "ธ***", phone: "(+66) 6*****88", address: "ต.ตลาดใหญ่ อ.เมือง จ.ภูเก็ต 83000",
    items: [["BCN32", "กระเป๋าใส่บัตร BCN32", "น้ำตาล", 3, 450]], tracking: "TH24DEMO0007" },
  { sn: "251108ABCD08", status: "SHIPPED", shipInH: -40, orderedAgoH: 70, buyer: "ร***", phone: "(+66) 9*****30", address: "ต.ท่าประดู่ อ.เมือง จ.ระยอง 21000",
    items: [["IG-EQ008", "ที่ง้างโซ่ IG-EQ008", null, 1, 290]], tracking: "TH24DEMO0008" },
  { sn: "251108ABCD09", status: "CANCELLED", shipInH: null, orderedAgoH: 80, buyer: "ก***", phone: "(+66) 8*****02", address: "ต.ในเมือง อ.เมือง จ.อุบลราชธานี 34000",
    items: [["BCN25-BLK", "กระเป๋าสตางค์หนังแท้ BCN25", "ดำ", 1, 890]] },
  // ช่องทางของเรา → ส่งผ่าน SHIPPOP (ลองกด จัดส่ง)
  { sn: "M261110-LINE", status: "READY_TO_SHIP", shipInH: null, orderedAgoH: 2, buyer: "คุณมานี (LINE)", phone: "081-111-2222", address: "12 ถ.ประชาอุทิศ แขวงสามเสนนอก เขตห้วยขวาง กรุงเทพมหานคร 10310",
    items: [["BT01-BLK-36", "เข็มขัดหนังแท้ BT01", "ดำ / 36", 1, 790]],
    own: { channel: "line_oa", shipTo: { name: "มานี มีสุข", phone: "0811112222", address: "12 ถ.ประชาอุทิศ", subdistrict: "สามเสนนอก", district: "ห้วยขวาง", province: "กรุงเทพมหานคร", postal: "10310" } } },
  { sn: "M261110-TEL1", status: "READY_TO_SHIP", shipInH: null, orderedAgoH: 1, buyer: "คุณวิชัย (โทร)", phone: "089-333-4444", address: "45/2 ม.3 ต.หนองปรือ อ.บางละมุง จ.ชลบุรี 20150",
    items: [["BCN32", "กระเป๋าใส่บัตร BCN32", "น้ำตาล", 2, 450]],
    own: { channel: "phone", cod: 900, shipTo: { name: "วิชัย ใจงาม", phone: "0893334444", address: "45/2 ม.3", subdistrict: "หนองปรือ", district: "บางละมุง", province: "ชลบุรี", postal: "20150" } } },
];

/** ออเดอร์ตัวอย่างทั้งหมด (คิดกำหนดส่งจาก now) */
export function demoOrders(now = Date.now()): DemoOrder[] {
  return SEEDS.map((s, i) => {
    const id = `${DEMO_PREFIX}${i + 1}`;
    const items: PlatformOrderItemRow[] = s.items.map(([sku, name, variant, qty, price], j) => ({
      id: `${id}-i${j + 1}`, sku_code: sku, matched_sku_id: null, name, qty, price, variant,
    }));
    const total = items.reduce((a, it) => a + (it.price ?? 0) * it.qty, 0);
    const iso = (h: number) => new Date(now + h * 3600_000).toISOString();
    return {
      id, platform_id: null, brand_id: null, external_order_id: s.sn, order_no: s.sn, customer_name: s.buyer,
      status: shopeeToInternal(s.status) ?? "new", total, currency: "THB",
      ordered_at: iso(-s.orderedAgoH), ship_by_at: s.shipInH == null ? null : iso(s.shipInH),
      tracking_no: s.tracking ?? null, carrier: s.tracking ? "SPX Express" : null,
      stock_deducted: false, source: "demo", invoice_so_id: null, tax_invoice_requested: !!s.invoice,
      item_count: items.length, created_at: iso(-s.orderedAgoH),
      items, tax_invoice_request: s.invoice ?? null,
      recipient: { name: s.buyer, phone: s.phone, address: s.address },
      note: s.note ?? null,
      platform_code: s.own ? null : "shopee", ship_to: s.own?.shipTo ?? null,
      channel: s.own?.channel ?? null, cod_amount: s.own?.cod ?? 0,
      platform_status: s.own ? null : s.status,
    };
  });
}

export function demoOrder(id: string, now = Date.now()): DemoOrder | null {
  return demoOrders(now).find((o) => o.id === id) ?? null;
}
