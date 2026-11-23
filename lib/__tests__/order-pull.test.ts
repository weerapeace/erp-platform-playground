import { describe, expect, it } from "vitest";
import { alertDue, countPullStates, pullAlerts, shopPullHealth, type ShopPullInput } from "@/lib/order-pull-health";
import { lazFinanceRows, lazIncomeOf, lazMoney, lazOrderToPlatformOrder, lazTime } from "@/lib/lazada-orders";
import { lineOrderToPlatformOrder } from "@/lib/line-shopping-orders";
import { shopeeIncomeOf } from "@/lib/shopee";
import {
  checkTransition, countsAsSale, isShopManaged, lazadaOrderStatus, offKey, toggleOffCircle, paymentState, isUrgentCarrier, shortOrderDate, orderMoney, lazadaToInternal, lineShoppingStatus, needsAction,
  platformStatusLabel, shopManagedName, webshopStatus, webshopToInternal,
} from "@/lib/platform-order-status";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const base = (o: Partial<ShopPullInput>): ShopPullInput => ({ platform: "shopee", brand_id: "b1", mode: "api", run: { at: ago(5), ok: true, created: 2 }, token_expires_at: NOW + 60 * 86_400_000, ...o });

describe("สถานะการดึงออเดอร์ (shopPullHealth)", () => {
  it("รอบล่าสุดสำเร็จ = ปกติ", () => {
    const h = shopPullHealth(base({}), NOW);
    expect(h.state).toBe("ok");
    expect(h.headline).toContain("ใหม่ 2");
  });
  it("รอบล้ม = มีปัญหา + บอกเหตุผล", () => {
    const h = shopPullHealth(base({ run: { at: ago(5), ok: false, error: "token หมด", fails: 2 } }), NOW);
    expect(h.state).toBe("error");
    expect(h.headline).toContain("2 รอบติด");
  });
  it("เงียบเกิน 45 นาที = หยุดดึง", () => {
    expect(shopPullHealth(base({ run: { at: ago(80), ok: true } }), NOW).state).toBe("stale");
  });
  it("กุญแจเหลือ ≤ 7 วัน = กุญแจใกล้หมด · หมดแล้ว = มีปัญหา", () => {
    expect(shopPullHealth(base({ token_expires_at: NOW + 5 * 86_400_000 }), NOW).state).toBe("token");
    expect(shopPullHealth(base({ token_expires_at: NOW - 86_400_000 }), NOW).state).toBe("error");
  });
  it("มีแต่เมล = ต้องดู · ยังไม่ต่อ = off", () => {
    expect(shopPullHealth(base({ mode: "email", run: null }), NOW).state).toBe("slow");
    expect(shopPullHealth(base({ mode: "none", run: null }), NOW).state).toBe("off");
  });
  it("นับต่อสถานะ", () => {
    expect(countPullStates([{ state: "ok" }, { state: "ok" }, { state: "error" }])).toMatchObject({ ok: 2, error: 1, off: 0 });
  });
});

describe("กระดิ่งเตือน (pullAlerts / alertDue)", () => {
  it("ล้ม 3 รอบติด + กุญแจเหลือ 3 วัน = 2 เรื่อง · ล้มรอบเดียวยังไม่เตือน", () => {
    const a = pullAlerts([{ ...base({ run: { at: ago(5), ok: false, error: "x", fails: 3 }, token_expires_at: NOW + 3 * 86_400_000 }), label: "Shopee · LM" }], NOW);
    expect(a.map((x) => x.key.split(":")[0]).sort()).toEqual(["fail", "token"]);
    expect(pullAlerts([{ ...base({ run: { at: ago(5), ok: false, fails: 1 } }), label: "x" }], NOW)).toHaveLength(0);
  });
  it("ร้านที่ไม่ได้ดึงจาก API (เมล/ยังไม่ต่อ) ไม่เตือน", () => {
    expect(pullAlerts([{ ...base({ mode: "none", run: null }), label: "x" }], NOW)).toHaveLength(0);
  });
  it("เรื่องเดิมวันละครั้ง", () => {
    expect(alertDue(null, NOW)).toBe(true);
    expect(alertDue(ago(60), NOW)).toBe(false);
    expect(alertDue(ago(25 * 60), NOW)).toBe(true);
  });
});

describe("Lazada → ออเดอร์ในระบบ", () => {
  it("สถานะรวมจากรายชิ้น: ยังมีชิ้นต้องส่ง = ต้องส่ง · ยกเลิกทุกชิ้น = ยกเลิก", () => {
    expect(lazadaOrderStatus(["shipped", "pending"])).toBe("pending");
    expect(lazadaOrderStatus(["canceled", "delivered"])).toBe("delivered");
    expect(lazadaOrderStatus(["canceled", "canceled"])).toBe("canceled");
    expect(lazadaToInternal("pending")).toBe("new");
    expect(lazadaToInternal("ready_to_ship")).toBe("packed");
    expect(lazadaToInternal("delivered")).toBe("shipped");
    expect(lazadaToInternal("canceled")).toBe("cancelled");
    expect(lazadaToInternal("weird")).toBeNull();
  });
  it("เวลา/เงินแบบ Lazada", () => {
    expect(lazTime("2026-11-20 13:41:18 +0700")).toBe("2026-11-20T06:41:18.000Z");
    expect(lazTime("2026-11-20 13:41:18")).toBe("2026-11-20T06:41:18.000Z");
    expect(lazMoney("1,299.00")).toBe(1299);
    expect(lazMoney("")).toBeNull();
  });
  it("รวมรายการตามรหัสร้าน · ตัดที่อยู่ผู้รับ · ชิ้นยกเลิกไม่นับ", () => {
    const m = lazOrderToPlatformOrder(
      { order_id: 111, order_number: "111", statuses: ["pending"], price: "598.00", created_at: "2026-11-20 10:00:00 +0700", customer_first_name: "สมชาย", customer_last_name: "ใจดี", address_shipping: { phone: "0812345678" }, payment_method: "COD" },
      [
        { sku: "LM-1-BK", name: "กระเป๋า", item_price: "299.00", status: "pending", order_item_id: 1, tracking_code: "TH1", shipment_provider: "Flash", promised_shipping_time: "2026-11-22 23:59:59 +0700" },
        { sku: "LM-1-BK", name: "กระเป๋า", item_price: "299.00", status: "pending", order_item_id: 2 },
        { sku: "LM-2", name: "อื่น", item_price: "100.00", status: "canceled", order_item_id: 3 },
      ],
    );
    expect(m?.items).toHaveLength(1);
    expect(m?.items[0]).toMatchObject({ sku_code: "LM-1-BK", qty: 2, price: 299 });
    expect(m?.head).toMatchObject({ status: "new", platform_status: "pending", total: 598, cod_amount: 598, customer_name: "สมชาย", tracking_no: "TH1", carrier: "Flash" });
    expect(JSON.stringify(m?.head.raw)).not.toContain("0812345678");
    expect(m?.head.ship_by_at).toBe("2026-11-22T16:59:59.000Z");
  });
});

describe("LINE SHOPPING → ออเดอร์ในระบบ", () => {
  it("สถานะรวม", () => {
    expect(lineShoppingStatus({ orderStatus: "FINALIZED", paymentStatus: "PAID", shipmentStatus: "NO_SHIPMENT" })).toBe("LINE_TO_SHIP");
    expect(lineShoppingStatus({ orderStatus: "FINALIZED", paymentStatus: "PENDING" })).toBe("LINE_UNPAID");
    expect(lineShoppingStatus({ orderStatus: "FINALIZED", paymentStatus: "PAID", shipmentStatus: "SHIPPED_ALL" })).toBe("LINE_SHIPPED");
    expect(lineShoppingStatus({ orderStatus: "CANCELED" })).toBe("LINE_CANCELED");
  });
  it("อ่านได้หลายชื่อช่อง · ชื่อเก็บแค่ชื่อต้น", () => {
    const m = lineOrderToPlatformOrder({ orderNumber: "2611200001", orderStatus: "FINALIZED", paymentStatus: "PAID", totalPrice: 450, customerName: "Ann Lee", orderItems: [{ sku: "IG-1", name: "ผ้า", quantity: 3, price: 150 }], updatedAt: "2026-11-20T05:00:00Z" });
    expect(m?.external_order_id).toBe("2611200001");
    expect(m?.head).toMatchObject({ status: "new", platform_status: "LINE_TO_SHIP", total: 450, customer_name: "Ann" });
    expect(m?.items[0]).toMatchObject({ sku_code: "IG-1", qty: 3, price: 150 });
    expect(lineOrderToPlatformOrder({})).toBeNull();
  });
});

describe("ออเดอร์เว็บไซต์ + แหล่งที่สถานะตามร้าน", () => {
  it("เว็บ: ยังไม่จ่าย (ไม่ใช่เก็บปลายทาง) = ไม่นับงาน/ยอดขาย · เก็บปลายทาง = ต้องส่ง", () => {
    expect(webshopStatus({ status: "pending", payment_status: "unpaid", payment_method: "transfer" })).toBe("WEB_UNPAID");
    expect(webshopStatus({ status: "pending", payment_status: "unpaid", payment_method: "cod" })).toBe("WEB_PENDING");
    expect(webshopStatus({ status: "preparing", payment_status: "paid" })).toBe("WEB_PREPARING");
    expect(webshopToInternal("WEB_SHIPPED")).toBe("shipped");
    expect(needsAction({ status: "new", source: "webshop", platform_status: "WEB_UNPAID" })).toBe(false);
    expect(countsAsSale({ status: "new", platform_status: "WEB_VERIFYING" })).toBe(false);
    expect(countsAsSale({ status: "new", platform_status: "unpaid" })).toBe(false);   // Lazada ตัวพิมพ์เล็ก
    expect(needsAction({ status: "new", source: "lazada_api", platform_status: "pending" })).toBe(true);
  });
  it("lazada_api / line_shopping_api / webshop = ดูอย่างเดียว บอกที่จัดการถูก", () => {
    for (const s of ["lazada_api", "line_shopping_api", "webshop"]) expect(isShopManaged(s)).toBe(true);
    expect(shopManagedName("lazada_api")).toBe("Lazada");
    const r = checkTransition({ status: "new", source: "webshop" }, "confirmed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("หน้าเว็บไซต์");
    expect(platformStatusLabel("ready_to_ship")).toBe("พร้อมส่ง");
    expect(platformStatusLabel("LINE_TO_SHIP")).toBe("ที่ต้องจัดส่ง");
  });
});

describe("วงกลมแพลตฟอร์มในการ์ดแบรนด์ (toggleOffCircle)", () => {
  const B = "b1", all = ["sp", "lz", "tt"];
  it("คลิกธรรมดา = ปิด/เปิดวงเดียว", () => {
    const a = toggleOffCircle([], B, all, "lz", false);
    expect(a).toEqual([offKey(B, "lz")]);
    expect(toggleOffCircle(a, B, all, "lz", false)).toEqual([]);
  });
  it("Shift+คลิก = โชว์วงนั้นวงเดียว · Shift+คลิกซ้ำ = โชว์ทั้งหมด", () => {
    const solo = toggleOffCircle([], B, all, "sp", true);
    expect(solo.sort()).toEqual([offKey(B, "lz"), offKey(B, "tt")].sort());
    expect(toggleOffCircle(solo, B, all, "sp", true)).toEqual([]);
  });
  it("Shift+คลิกวงอื่นตอนโชว์วงเดียว = ย้ายไปโชว์วงนั้นแทน · ไม่แตะการ์ดอื่น", () => {
    const other = offKey("b2", "sp");
    const solo = toggleOffCircle([other], B, all, "sp", true);
    const moved = toggleOffCircle(solo, B, all, "tt", true);
    expect(moved.sort()).toEqual([other, offKey(B, "sp"), offKey(B, "lz")].sort());
  });
  it("การ์ดทุกแบรนด์ใช้ * · ออเดอร์ไม่ผูกแพลตฟอร์มใช้ phone", () => {
    expect(offKey(null, null)).toBe("*:phone");
  });
});

describe("ตาราง/หน้ารายละเอียดแบบ Zort", () => {
  it("สถานะชำระเงิน", () => {
    expect(paymentState({ status: "new", platform_status: "READY_TO_SHIP" })).toBe("paid");
    expect(paymentState({ status: "new", platform_status: "UNPAID" })).toBe("unpaid");
    expect(paymentState({ status: "new", platform_status: "unpaid" })).toBe("unpaid");
    expect(paymentState({ status: "new", cod_amount: 300 })).toBe("cod");
    expect(paymentState({ status: "shipped", cod_amount: 300 })).toBe("paid");
    expect(paymentState({ status: "cancelled" })).toBe("none");
    expect(paymentState({ status: "shipped", platform_status: "TO_RETURN" })).toBe("refund");
  });
  it("ส่งด่วนดูจากชื่อขนส่ง", () => {
    expect(isUrgentCarrier("Instant Delivery - ส่งทันที (แพ็ก 2 ชั่วโมง)")).toBe(true);
    expect(isUrgentCarrier("Same Day")).toBe(true);
    expect(isUrgentCarrier("SPX Express")).toBe(false);
    expect(isUrgentCarrier("Express Delivery (SPX)")).toBe(true);
    expect(isUrgentCarrier(null)).toBe(false);
  });
  it("วันที่แบบ วันนี้/เมื่อวาน (เวลาไทย)", () => {
    const now = Date.parse("2026-11-23T10:00:00Z");   // 17:00 ไทย
    expect(shortOrderDate("2026-11-23T09:49:00Z", now)).toBe("วันนี้ 16:49");
    expect(shortOrderDate("2026-11-22T02:10:00Z", now)).toBe("เมื่อวาน 09:10");
    expect(shortOrderDate("2026-11-20T07:05:00Z", now)).toBe("20/11 14:05");
    expect(shortOrderDate(null, now)).toBe("—");
  });
  it("รายได้จริง Shopee (escrow): หักค่าธรรมเนียม/ส่วนลดร้านเป็นลบ · ข้ามบรรทัดที่เป็น 0", () => {
    const inc = shopeeIncomeOf({ response: { order_income: { buyer_total_amount: 349, original_price: 466, seller_discount: 117, voucher_from_seller: 0, commission_fee: 25, service_fee: 12, seller_transaction_fee: 4, escrow_amount: 308, final_shipping_fee: 0 } } });
    expect(inc.buyer_paid).toBe(349);
    expect(inc.escrow).toBe(308);
    expect(inc.lines.map((l) => [l.key, l.amount])).toEqual([["original_price", 466], ["seller_discount", -117], ["commission", -25], ["service", -12], ["transaction", -4]]);
  });
});

describe("ยอดเงินแบบ Zort ของ Lazada / TikTok (orderMoney)", () => {
  it("Lazada: ราคา − คูปองร้าน = สุทธิร้าน · ผู้ซื้อจ่าย = ราคา − คูปองทั้งหมด + ค่าส่ง", () => {
    const m = orderMoney("lazada", { lazada: { price: "439.00", voucher: 256.96, voucher_seller: 109.75, voucher_platform: 147.21, shipping_fee: 0, payment_method: "PROMPTPAY" } }, 439);
    expect(m).toMatchObject({ original: 439, seller_discount: 109.75, platform_discount: 147.21, buyer_paid: 182.04, net: 329.25, method: "PROMPTPAY" });
  });
  it("TikTok: ราคาก่อนลด = sub_total + ส่วนลดร้าน + ส่วนลดแพลตฟอร์ม · สุทธิร้าน = sub_total + ส่วนลดแพลตฟอร์ม", () => {
    const m = orderMoney("tiktok", { tiktok: { is_cod: false, payment_method_name: "PayLater", delivery_option_name: "Next-day delivery", payment: { sub_total: 888.5, seller_discount: 300, platform_discount: 101.5, shipping_fee: 0, total_amount: 896.23 } } }, 896.23);
    expect(m).toMatchObject({ original: 1290, seller_discount: 300, platform_discount: 101.5, buyer_paid: 896.23, net: 990, method: "PayLater", delivery: "Next-day delivery" });
    expect(orderMoney("tiktok", { tiktok: { is_cod: true, payment: { sub_total: 690 } } }, 690).method).toBe("เก็บเงินปลายทาง");
  });
  it("ไม่มีข้อมูล = ไม่เดา", () => {
    expect(orderMoney("lazada", {}, 100)).toMatchObject({ original: null, net: 100 });
    expect(orderMoney(null, null, null).net).toBeNull();
  });
});

describe("ค่าธรรมเนียม Lazada ต่อออเดอร์ (lazIncomeOf / lazFinanceRows)", () => {
  const rows = [
    { order_no: "111", fee_name: "Item Price Credit", amount: "439.00", paid_status: "Not paid" },
    { order_no: "111", fee_name: "Commission", amount: "-21.95", paid_status: "Not paid" },
    { order_no: "111", fee_name: "Payment Fee", amount: "-9.17", paid_status: "Not paid" },
    { order_no: "111", fee_name: "Promotional Charges Vouchers", amount: "-109.75", paid_status: "Not paid" },
    { order_no: "999", fee_name: "Commission", amount: "-5", paid_status: "Not paid" },
  ];
  it("รวมเฉพาะออเดอร์นี้ · แปลชื่อไทย · เงินเข้าร้าน = ผลรวม · ยังไม่โอน", () => {
    const inc = lazIncomeOf(rows, "111");
    expect(inc.rows).toBe(4);
    expect(inc.escrow).toBe(298.13);
    expect(inc.paid).toBe(false);
    expect(inc.lines.map((l) => [l.label, l.amount])).toEqual([["ราคาสินค้า (Lazada โอนให้)", 439], ["ค่าธรรมเนียมชำระเงิน", -9.17], ["ค่าคอมมิชชั่น", -21.95], ["ค่าคูปอง/โปรของร้าน", -109.75]]);
  });
  it("ชื่อช่องแบบเอกสารเก่า + โอนแล้ว", () => {
    const inc = lazIncomeOf([{ "Order no": "5", "Transaction Type": "Commission", Amount: "-2.86", "Paid Status": "Yes" }, { "Order no": "5", "Transaction Type": "Item Price Credit", Amount: "28.00", "Paid Status": "Yes" }], "5");
    expect(inc).toMatchObject({ escrow: 25.14, paid: true, rows: 2 });
  });
  it("ยังไม่ตัดรอบ = ไม่มีรายการ", () => {
    expect(lazIncomeOf([], "111")).toMatchObject({ escrow: null, rows: 0, lines: [] });
  });
  it("อ่านแถวได้หลายรูปแบบคำตอบ", () => {
    expect(lazFinanceRows({ data: [{ a: 1 }] })).toHaveLength(1);
    expect(lazFinanceRows({ data: { transactions: [{ a: 1 }, { a: 2 }] } })).toHaveLength(2);
    expect(lazFinanceRows({ data: { TransactionDOs: { transactionDOs: [{ a: 1 }] } } })).toHaveLength(1);
    expect(lazFinanceRows({})).toHaveLength(0);
  });
});
