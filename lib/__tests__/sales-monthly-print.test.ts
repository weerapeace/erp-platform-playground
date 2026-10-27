import { describe, it, expect } from "vitest";
import { buildSalesMonthlyReportHtml } from "@/lib/sales-monthly-print";
import type { SalesMonthlyReport } from "@/app/api/sales/monthly-report/route";
import { DEFAULT_PRODUCT_OPTIONS, type ProductTableOptions } from "@/lib/sold-products";

// ข้อมูลตัวอย่างเลียนแบบของจริง (ลูกค้า/สินค้า/สถานะหลายแบบ รวมใบยกเลิก)
const CUSTOMERS = [
  ["บริษัท เซ็นทรัลเทรดดิ้ง จำกัด สาขาคลังสินค้าเซ็นทรัลค้าปลีก (สาขาที่ 00005)", "C-0001"],
  ["บริษัท ไอ.เอส.จี. อุตสาหกรรม จำกัด (สำนักงานใหญ่)", "C-0002"],
  ["บริษัท กู๊ดกู๊ดส์ รีเทล จำกัด", "C-0003"],
];
const PRODUCTS = [
  ["CTL047-01", "Good Goods กระเป๋าทรงถือ ผ้าขาวม้า สีฟ้า", "Units", 500],
  ["GTH38/1BK", "DEVY เข็มขัดหนังเม็ดริมบาง สีดำ พร้อมกล่องแบรนด์ ขนาด 1.5 นิ้ว", "Units", 340],
  ["CTL106-04", "Good Goods กระเป๋าผ้าขาวม้ากาฬสินธุ์ ใบใหญ่ แบบที่ 1", "Units", 18],
  ["CTL104-02", "พวงกุญแจผลไม้ - เชอร์รี่", "Units", 190],
];

const rows: SalesMonthlyReport["rows"] = Array.from({ length: 12 }, (_, i) => {
  const [name, code] = CUSTOMERS[i % CUSTOMERS.length];
  const items = PRODUCTS.slice(0, (i % 3) + 1).map(([sku, pname, unit, price]) => ({
    sku: sku as string, name: pname as string, qty: ((i % 4) + 1) * 50, unit: unit as string,
    unit_price: price as number, amount: ((i % 4) + 1) * 50 * (price as number),
  }));
  const taxable = items.reduce((a, it) => a + it.amount, 0);
  const status = i === 3 ? "draft" : i === 7 ? "cancelled" : "confirmed";
  return {
    id: `id-${i}`, so_number: `ISG2569-07-${String(i + 1).padStart(3, "0")}`,
    order_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
    customer_name: name, customer_code: code, sale_person_name: i % 5 === 0 ? "Gogo" : "Patty",
    status, taxable, vat: Math.round(taxable * 0.07), wht: 0,
    grand_total: Math.round(taxable * 1.07), lines: items.length, items, billed: i % 3 !== 0,
  };
});

const active = rows.filter(r => r.status !== "cancelled");
const sum = (f: (r: (typeof rows)[number]) => number) => active.reduce((a, r) => a + f(r), 0);

const REP: SalesMonthlyReport = {
  month: "2026-07",
  summary: {
    n: active.length, amt: sum(r => r.grand_total),
    confirmed_n: rows.filter(r => r.status === "confirmed").length,
    confirmed_amt: rows.filter(r => r.status === "confirmed").reduce((a, r) => a + r.grand_total, 0),
    draft_n: 1, draft_amt: rows.filter(r => r.status === "draft").reduce((a, r) => a + r.grand_total, 0),
    cancelled_n: 1, cancelled_amt: rows.filter(r => r.status === "cancelled").reduce((a, r) => a + r.grand_total, 0),
    taxable: sum(r => r.taxable), vat: sum(r => r.vat), wht: 0,
    avg: sum(r => r.grand_total) / active.length,
    billed_n: active.filter(r => r.billed).length, billed_amt: active.filter(r => r.billed).reduce((a, r) => a + r.grand_total, 0),
    unbilled_n: active.filter(r => !r.billed).length, unbilled_amt: active.filter(r => !r.billed).reduce((a, r) => a + r.grand_total, 0),
    customers: 3, skus: 4, qty: 4200,
  },
  prev: { month: "2026-06", n: 12, amt: 767185 },
  daily: Array.from({ length: 31 }, (_, i) => ({ d: i + 1, amt: 0, n: 0 })),
  by_customer: CUSTOMERS.map(([name, code], i) => ({ name, code, n: 4 - i, amt: 400000 - i * 120000 })),
  by_sales: [{ name: "Patty", n: 10, amt: 820000 }, { name: "Gogo", n: 2, amt: 73573 }],
  by_status: [{ status: "confirmed", n: 10, amt: 820000 }, { status: "draft", n: 1, amt: 90950 }, { status: "cancelled", n: 1, amt: 3531 }],
  top_products: PRODUCTS.map(([sku, name, unit, price]) => ({
    sku: sku as string, name: name as string, qty: 250, unit: unit as string, amt: 250 * (price as number),
  })),
  // สินค้าต่อลูกค้า — หน่วยปนกัน (Units / หลา) ไว้เช็กยอดรวมแยกหน่วย · CTL047-01 ซื้อ 2 ลูกค้า ไว้เช็กโหมดรวม
  products: [
    { customer: CUSTOMERS[0][0], customer_code: "C-0001", sku: "CTL047-01", name: "Good Goods กระเป๋าทรงถือ ผ้าขาวม้า สีฟ้า", unit: "Units", qty: 240, amt: 144000, image: "/api/r2-image?key=a.jpg" },
    { customer: CUSTOMERS[0][0], customer_code: "C-0001", sku: "CTL022/1", name: "ริบบิ้นผ้าฝ้าย 2.5 cm", unit: "หลา", qty: 1200, amt: 12000, image: null },
    { customer: CUSTOMERS[1][0], customer_code: "C-0002", sku: "GTH38/1BK", name: "DEVY เข็มขัดหนัง <ดำ>", unit: "Units", qty: 178, amt: 61410, image: null },
    { customer: CUSTOMERS[1][0], customer_code: "C-0002", sku: "CTL047-01", name: "Good Goods กระเป๋าทรงถือ ผ้าขาวม้า สีฟ้า", unit: "Units", qty: 10, amt: 6000, image: "/api/r2-image?key=a.jpg" },
  ],
  rows,
};

const ALL = { by_customer: true, by_sales: true, by_status: true, top_products: true, rows: true, items: true };
const AT = new Date("2026-08-11T11:10:00");

describe("รายงานยอดขายรายเดือน — ใบพิมพ์", () => {
  it("ใส่หัวเรื่อง เดือน และยอดรวมของเดือน", () => {
    const html = buildSalesMonthlyReportHtml(REP, ALL, AT);
    expect(html).toContain("รายงานสรุปยอดขายรายเดือน");
    expect(html).toContain("กรกฎาคม 2569");
    expect(html).toContain(Math.round(REP.summary.amt).toLocaleString("th-TH"));
  });

  it("ไม่มีโค้ดเทมเพลตหลงเหลือในใบพิมพ์ ({{…}})", () => {
    expect(buildSalesMonthlyReportHtml(REP, ALL, AT)).not.toContain("{{");
    expect(buildSalesMonthlyReportHtml(REP, { rows: true }, AT)).not.toContain("{{");
  });

  it("ปิดส่วนไหน ส่วนนั้นต้องหายจากใบพิมพ์", () => {
    const off = buildSalesMonthlyReportHtml(REP, { ...ALL, by_sales: false, top_products: false }, AT);
    expect(off).not.toContain("แยกตามพนักงานขาย");
    expect(off).not.toContain("สินค้าที่ขาย");
    expect(off).toContain("แยกตามลูกค้า");          // ส่วนที่ยังเปิดอยู่ต้องมี
  });

  it("รายการสินค้าในแต่ละใบ: โผล่เฉพาะตอนติ๊กเปิด", () => {
    const withItems = buildSalesMonthlyReportHtml(REP, ALL, AT);
    const noItems = buildSalesMonthlyReportHtml(REP, { ...ALL, items: false }, AT);
    expect(withItems).toContain("พร้อมรายการสินค้า");
    expect(withItems).toContain('<tr class="ln">');   // แถวสินค้าใต้ใบขายแต่ละใบ
    expect(noItems).not.toContain('<tr class="ln">');
    expect(noItems).not.toContain("พร้อมรายการสินค้า");
  });

  it("ใบยกเลิกต้องขีดฆ่ายอด และไม่ขึ้นว่า 'วางบิลแล้ว'", () => {
    const html = buildSalesMonthlyReportHtml(REP, ALL, AT);
    expect(html).toContain('<span class="cxl">');
  });

  it("เดือนที่ไม่มีใบขายเลย → ขึ้นข้อความว่าง ไม่ใช่ตารางเปล่า", () => {
    const empty: SalesMonthlyReport = { ...REP, rows: [], by_customer: [], by_sales: [], by_status: [], top_products: [], products: [] };
    const html = buildSalesMonthlyReportHtml(empty, ALL, AT);
    expect(html).toContain("เดือนนี้ยังไม่มีใบขาย");
    expect(html).not.toContain("สินค้าที่ขาย");
    expect(html).not.toContain("{{");
  });
});

describe("รายงานยอดขายรายเดือน — ตารางสินค้าที่ขาย", () => {
  const BASE = { ...DEFAULT_PRODUCT_OPTIONS, image: "none" as const };
  const prodHtml = (o: Partial<ProductTableOptions>) =>
    buildSalesMonthlyReportHtml(REP, { top_products: true }, AT, { ...BASE, ...o });

  it("แยกตามลูกค้า: มีหัวลูกค้า + ยอดรวมรายลูกค้า + รวมทุกลูกค้า", () => {
    const html = prodHtml({ grouped: true });
    expect(html).toContain("— แยกตามลูกค้า");
    expect(html).toContain(CUSTOMERS[0][0]);
    expect(html).toContain("รวมลูกค้านี้ · 2 รายการ");
    expect(html).toContain("รวมทุกลูกค้า · 4 รายการ");
    expect(html).toContain((144000 + 12000 + 61410 + 6000).toLocaleString("th-TH"));
    expect(html).not.toContain("{{");
  });

  it("รวมทุกลูกค้า: สินค้าตัวเดียวกันจากหลายลูกค้า รวมเป็นแถวเดียว", () => {
    const html = prodHtml({ grouped: false });
    expect(html).toContain("รวมทั้งหมด · 3 รายการ");
    expect(html).toContain("250 Units");                    // 240 + 10
    expect(html).not.toContain("รวมทุกลูกค้า");
  });

  it("จำนวนรวมแยกตามหน่วย — ไม่บวกหลากับ Units", () => {
    const html = prodHtml({ grouped: false });
    expect(html).toContain("<div>428 Units</div>");          // 240 + 178 + 10
    expect(html).toContain("<div>1,200 หลา</div>");
    expect(html).not.toContain("1,628");
  });

  it("เรียงตามชื่อ / ยอดเงิน ได้ลำดับต่างกัน", () => {
    const order = (html: string) => ["CTL047-01", "CTL022/1", "GTH38/1BK"].map(s => html.indexOf(`>${s}<`));
    const byAmt = order(prodHtml({ grouped: false, sortKey: "amt", sortDir: "desc" }));
    expect(byAmt[0]).toBeLessThan(byAmt[2]);                 // 150,000 ก่อน 61,410
    expect(byAmt[2]).toBeLessThan(byAmt[1]);                 // 61,410 ก่อน 12,000
    const byName = order(prodHtml({ grouped: false, sortKey: "name", sortDir: "asc" }));
    expect(byName[1]).toBeLessThan(byName[2]);               // ริบบิ้น ก่อน DEVY (เรียงแบบไทย: ไทยก่อนอังกฤษ)
    expect(byName[2]).toBeLessThan(byName[0]);               // DEVY ก่อน Good Goods
  });

  it("รูป: เปิดแล้วมี <img> ขนาดย่อ · ไม่มีรูปเป็นกรอบว่าง · ปิดแล้วไม่มีคอลัมน์รูป", () => {
    const on = prodHtml({ image: "small" });
    expect(on).toContain('src="/api/r2-image?key=a.jpg&amp;w=80"');
    expect(on).toContain('class="noimg"');
    expect(on).toContain("<th>รูป</th>");
    expect(prodHtml({ image: "none" })).not.toContain("<th>รูป</th>");
  });

  it("คอลัมน์ % เปิด/ปิดได้ · ชื่อสินค้าถูก escape", () => {
    expect(prodHtml({ pct: true })).toContain('<th class="r">%</th>');
    expect(prodHtml({ pct: false })).not.toContain('<th class="r">%</th>');
    expect(prodHtml({})).toContain("DEVY เข็มขัดหนัง &lt;ดำ&gt;");
  });

  it("ขึ้นหน้าใหม่ทุกลูกค้า: ใส่ตัวตัดหน้าตั้งแต่ลูกค้าที่ 2", () => {
    const html = prodHtml({ grouped: true, pageBreak: true });
    expect(html.match(/<div class="brk">/g)?.length).toBe(1);   // 2 ลูกค้า → ตัด 1 ครั้ง
    expect(prodHtml({ grouped: true, pageBreak: false })).not.toContain('<div class="brk">');
  });
});
