import { describe, it, expect } from "vitest";
import { buildPickPrint, demoLabelsHtml, packSlipsHtml, pickDefaults, pickRows, type PrintOrder } from "../platform-order-print";
import { demoOrders } from "../platform-order-demo";

/** 🖨 งานพิมพ์ศูนย์ออเดอร์ (เฟส A3 · 2026-11-10) */
const O = (id: string, items: PrintOrder["items"]): PrintOrder => ({ id, order_no: `SN${id}`, customer_name: "ค***", ordered_at: null, ship_by_at: null, carrier: null, tracking_no: null, items });

describe("🖨 ใบหยิบรวม / ใบแพ็ก / ใบปะหน้าตัวอย่าง", () => {
  it("รวมรหัสเดียวกันข้ามออเดอร์ · ตัวเลือกต่างกัน = คนละบรรทัด · จำออเดอร์ที่เกี่ยว", () => {
    const rows = pickRows([
      O("1", [{ sku_code: "BCN25", name: "กระเป๋า", variant: "ดำ", qty: 1 }, { sku_code: "BT01", name: "เข็มขัด", variant: null, qty: 2 }]),
      O("2", [{ sku_code: "BCN25", name: "กระเป๋า", variant: "ดำ", qty: 3 }, { sku_code: "BCN25", name: "กระเป๋า", variant: "น้ำตาล", qty: 1 }]),
      O("3", [{ sku_code: null, name: "ของแถม", qty: 1 }]),
    ]);
    const black = rows.find((r) => r.sku === "BCN25" && r.variant === "ดำ")!;
    expect(black.qty).toBe(4);
    expect(black.orders).toEqual(["SN1", "SN2"]);
    expect(rows.find((r) => r.variant === "น้ำตาล")!.qty).toBe(1);
    expect(rows.find((r) => r.name === "ของแถม")!.sku).toBe("");
    expect(rows).toHaveLength(4);
  });

  it("ใบหยิบรวม: ยอดรวมชิ้นถูก · escape ชื่อสินค้า (กันโค้ดแปลกในชื่อ)", () => {
    const r = buildPickPrint({ orders: [O("1", [{ sku_code: "X1", name: "<b>แปลก</b>", qty: 2 }]), O("2", [{ sku_code: "X1", name: "<b>แปลก</b>", qty: 1 }])], settings: pickDefaults(), printedAt: "10/11/2569", shop: "Shopee · IG" });
    expect(r.lines).toBe(1);
    expect(r.pieces).toBe(3);
    expect(r.html).toContain("&lt;b&gt;แปลก");
    expect(r.html).not.toContain("<b>แปลก</b>");
  });

  it("ใบแพ็ก 2 ใบ/แผ่น · ใบปะหน้าตัวอย่างมีลายน้ำห้ามใช้ส่งจริงทุกใบ", () => {
    const orders = demoOrders(Date.parse("2026-11-10T05:00:00Z")).slice(0, 3).map((o) => ({ ...o, items: o.items }));
    const pack = packSlipsHtml(orders, { shop: "IG" });
    expect(pack.match(/class="page"/g)?.length).toBe(2);
    expect(pack.match(/class="slip"/g)?.length).toBe(3);
    const lb = demoLabelsHtml(orders, { shop: "IG" });
    expect(lb.match(/ห้ามใช้ส่งจริง/g)?.length).toBe(3);
  });

  it("ออเดอร์ตัวอย่างมีครบทุกกรณีให้ลอง (เลยกำหนด/วันนี้/ขอใบกำกับ/ยังไม่จ่าย/ขอยกเลิก)", () => {
    const now = Date.parse("2026-11-10T05:00:00Z");
    const d = demoOrders(now);
    expect(d.every((o) => o.id.startsWith("demo-"))).toBe(true);
    expect(d.some((o) => o.ship_by_at && Date.parse(o.ship_by_at) < now)).toBe(true);
    expect(d.some((o) => o.tax_invoice_requested)).toBe(true);
    expect(d.some((o) => o.platform_status === "UNPAID")).toBe(true);
    expect(d.some((o) => o.platform_status === "IN_CANCEL")).toBe(true);
    expect(d.find((o) => o.platform_status === "PROCESSED")!.status).toBe("packed");
  });
});
