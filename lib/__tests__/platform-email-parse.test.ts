import { describe, expect, it } from "vitest";
import { htmlToLines, isReadable, parseMoney, parsePlatformDate, parsePlatformEmail } from "@/lib/platform-email/parse";

// จำลองจากเมลจริงที่เจ้าของส่งมา 2026-10-27 (ร้าน Louis Montini) — ป้าย/ค่าอยู่คนละช่องตาราง แบบเมลจริง
const row = (label: string, value: string) => `<tr><td>${label}</td><td>${value}</td></tr>`;

const SHOPEE_PAID_HTML = `<html><head><style>.x{color:red}</style></head><body>
<div><img alt="Shopee"></div>
<p>เรียน คุณ louismontini_officialshop,</p>
<p>คำสั่งซื้อหมายเลข <a href="#">#261027QF4YCJA8</a> ได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว. กรุณาจัดส่งสินค้าไปยังผู้ซื้อ eingsirikanya ลูกค้าควรได้รับสินค้าภายในวันที่02 พ.ย. 2026.</p>
<h3>รายละเอียดคำสั่งซื้อ</h3>
<table>${row("หมายเลขคำสั่งซื้อ:", '<a href="#">#261027QF4YCJA8</a>')}${row("วันที่สั่งซื้อ:", "27 ต.ค. 2026 20:22:27")}</table>
<div><img alt=""></div>
<p>1. Louis Montini (Giaguaro) กระเป๋าสะพายไหล่ผู้หญิง กระเป๋าผ้าแจ็คการ์ดเสริมโฟมทรง Baguette LYP14</p>
<table>${row("ตัวเลือกสินค้า:", "ดำ (Special)")}${row("จำนวน:", "1")}${row("ราคา:", "&#3647;329")}</table>
<table>${row("ยอดรวมค่าสินค้า:", "฿329")}${row("ค่าจัดส่งสินค้า:", "฿28")}${row("ยอดที่ต้องชำระทั้งหมด:", "฿357")}</table>
<p>เมื่อผู้ซื้อ eingsirikanya กดยืนยันหลังจากได้รับสินค้าแล้ว เราจะโอนเงินค่าสินค้าให้แก่คุณ</p>
</body></html>`;

const SHOPEE_CANCEL_HTML = `<div>
<p>เรียน คุณ louismontini_officialshop,</p>
<p>คำสั่งซื้อหมายเลข <span>#261027PT75K0HA</span> ถูกยกเลิกโดยร้าน weerawan1212 เมื่อวันที่ 27 Oct 2026 17:23:06</p>
<p>แจ้งเพื่อทราบเกี่ยวกับการยกเลิกคำสั่งซื้อ และยกเลิกการจัดส่งสินค้า</p>
<h4>รายละเอียดคำสั่งซื้อ</h4>
<table>${row('"หมายเลขคำสั่งซื้อ:', "#261027PT75K0HA")}${row("วันที่สั่งซื้อ:", "27/10/2026 14:07:53")}</table>
<p>1. [ส่งด่วนฟรี] Louis Montini (NEVILLE) กระเป๋าสตางค์หนังแท้ กระเป๋าสตางค์ผู้ชาย Men's Wallet TTM061</p>
<table>${row("ตัวเลือกสินค้า:", "Black (04)")}${row("จำนวน:", "1")}${row("ราคา:", "฿726")}</table>
<table>${row("ยอดรวมค่าสินค้า:", "฿0")}${row("ค่าจัดส่งสินค้า:", "฿0")}${row("ยอดที่ต้องชำระทั้งหมด:", "฿0")}</table>
<p>ขอบคุณที่เลือกใช้ Shopee<br>บริษัท ช้อปปี้ ประเทศไทย จำกัด</p></div>`;

const SHOPEE_RETURN_HTML = `<div><p>เรียนคุณ Louis Montini &amp; Pixie Dustie,</p>
<p>kasamjansuk ได้ยื่นคำขอคืนเงิน/คืนสินค้าหมายเลข <a href="#">2610270PUQN7BJ5</a> โดยให้เหตุผลว่า ฉันต้องการคืนสินค้าในสภาพสมบูรณ์.</p>
<h4>ขั้นตอนต่อไป</h4><p>กรุณารอให้ kasamjansuk ส่งสินค้าคืนมายังที่อยู่ในการคืนสินค้าของคุณ</p>
<p>ขอบพระคุณ,<br>Shopee Team</p></div>`;

const LAZADA_NEW_HTML = `<div><h2>New Order just arrived!</h2>
<p><b>Dear Louis Montini!</b></p><p>You received a new order in Seller Center</p>
<p>Below you can find more details to the new order:</p>
<p><b>Order Number:</b> 1125516432504630<br><b>Order Item List:</b> Louis Montini (Heart Charms) ที่ห้อยโทรศัพท์มือถือ หัวใจพาสเทลมีโบว์ Handmade PHPB010</p>
<p>Please follow this link https://sellercenter.lazada.co.th/apps/order/detail?tradeOrderId=1125516432504630 to manage your order.</p>
<p>Best regards,<br>Lazada Team</p><hr>
<p>สวัสดีร้าน <b>Louis Montini!</b></p><p>คุณได้รับคำสั่งซื้อใหม่ใน Seller Center</p>
<p><b>หมายเลขคำสั่งซื้อ:</b> 1125516432504630<br><b>รายการคำสั่งซื้อ:</b> Louis Montini (Heart Charms) ที่ห้อยโทรศัพท์มือถือ หัวใจพาสเทลมีโบว์ Handmade PHPB010</p></div>`;

const SHOPEE = "Shopee <info@mail.shopee.co.th>";
const LAZADA = "Lazada Seller Center <noreply@lazada.co.th>";

describe("htmlToLines", () => {
  it("ตัดสไตล์ แยกช่องตารางเป็นบรรทัด และถอดรหัส entity", () => {
    const lines = htmlToLines(SHOPEE_PAID_HTML);
    expect(lines).not.toContain(".x{color:red}");
    expect(lines).toContain("หมายเลขคำสั่งซื้อ:");
    expect(lines).toContain("฿329");
    expect(lines.some((l) => l.startsWith("1. Louis Montini (Giaguaro)"))).toBe(true);
  });
});

describe("parsePlatformDate (เวลาไทย → ISO)", () => {
  it("เดือนไทยย่อ", () => expect(parsePlatformDate("27 ต.ค. 2026 20:22:27")).toBe("2026-10-27T13:22:27.000Z"));
  it("วัน/เดือน/ปี", () => expect(parsePlatformDate("27/10/2026 14:07:53")).toBe("2026-10-27T07:07:53.000Z"));
  it("เดือนอังกฤษ", () => expect(parsePlatformDate("27 Oct 2026 17:23:06")).toBe("2026-10-27T10:23:06.000Z"));
  it("ปี พ.ศ. + ตีหนึ่งยังเป็นวันเดียวกันในไทย", () => expect(parsePlatformDate("1 พ.ย. 2569 01:00")).toBe("2026-10-31T18:00:00.000Z"));
  it("อ่านไม่ได้ = null", () => expect(parsePlatformDate("ไม่มีวันที่")).toBeNull());
});

describe("parseMoney", () => {
  it("ตัด ฿ และจุลภาค", () => expect(parseMoney("฿1,234.50")).toBe(1234.5));
  it("ว่าง = null", () => expect(parseMoney("")).toBeNull());
});

describe("Shopee — ยืนยันการชำระเงิน", () => {
  const p = parsePlatformEmail({ from: SHOPEE, subject: "คำสั่งซื้อ #261027QF4YCJA8 ชำระเงินแล้ว", html: SHOPEE_PAID_HTML });
  it("อ่านหัวเมลครบ", () => {
    expect(p.platform).toBe("shopee");
    expect(p.kind).toBe("order_paid");
    expect(p.order_no).toBe("261027QF4YCJA8");
    expect(p.shop_name).toBe("louismontini_officialshop");
    expect(p.ordered_at).toBe("2026-10-27T13:22:27.000Z");
    expect([p.subtotal, p.shipping, p.total]).toEqual([329, 28, 357]);
  });
  it("อ่านรายการสินค้า", () => {
    expect(p.items).toEqual([{
      title: "Louis Montini (Giaguaro) กระเป๋าสะพายไหล่ผู้หญิง กระเป๋าผ้าแจ็คการ์ดเสริมโฟมทรง Baguette LYP14",
      variant: "ดำ (Special)", qty: 1, qty_known: true, price: 329,
    }]);
    expect(p.problems).toEqual([]);
    expect(isReadable(p)).toBe(true);
  });
  it("อ่านแบบข้อความล้วน (ป้าย: ค่า บรรทัดเดียวกัน) ได้ผลเหมือนกัน", () => {
    const text = [
      "เรียน คุณ louismontini_officialshop,",
      "คำสั่งซื้อหมายเลข #261027QF4YCJA8 ได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว.",
      "รายละเอียดคำสั่งซื้อ", "หมายเลขคำสั่งซื้อ: #261027QF4YCJA8", "วันที่สั่งซื้อ: 27 ต.ค. 2026 20:22:27",
      "1. Louis Montini (Giaguaro) Baguette LYP14", "ตัวเลือกสินค้า: ดำ (Special)", "จำนวน: 1", "ราคา: ฿329",
      "ยอดรวมค่าสินค้า: ฿329", "ค่าจัดส่งสินค้า: ฿28", "ยอดที่ต้องชำระทั้งหมด: ฿357",
    ].join("\n");
    const t = parsePlatformEmail({ from: SHOPEE, text });
    expect(t.order_no).toBe("261027QF4YCJA8");
    expect(t.items).toEqual([{ title: "Louis Montini (Giaguaro) Baguette LYP14", variant: "ดำ (Special)", qty: 1, qty_known: true, price: 329 }]);
  });
  it("หลายรายการ + ราคาในเมลเป็นราคารวมบรรทัด → แปลงเป็นต่อชิ้น", () => {
    const text = [
      "เรียน คุณ louismontini_officialshop,", "คำสั่งซื้อหมายเลข #261027AAAAAAAA ได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว.",
      "หมายเลขคำสั่งซื้อ: #261027AAAAAAAA",
      "1. กระเป๋า A TTM061", "ตัวเลือกสินค้า: Black (04)", "จำนวน: 2", "ราคา: ฿1,000",
      "2. กระเป๋า B LYP14", "ตัวเลือกสินค้า: กรมท่า (02)", "จำนวน: 1", "ราคา: ฿329",
      "ยอดรวมค่าสินค้า: ฿1,329",
    ].join("\n");
    const t = parsePlatformEmail({ from: SHOPEE, text });
    expect(t.items.map((i) => [i.qty, i.price])).toEqual([[2, 500], [1, 329]]);
  });
});

describe("Shopee — ยกเลิก", () => {
  const p = parsePlatformEmail({ from: SHOPEE, subject: "คำสั่งซื้อถูกยกเลิก", html: SHOPEE_CANCEL_HTML });
  it("รู้ว่าเป็นเมลยกเลิก + เลขออเดอร์ (มี \" นำหน้าป้าย)", () => {
    expect(p.kind).toBe("order_cancelled");
    expect(p.order_no).toBe("261027PT75K0HA");
    expect(p.ordered_at).toBe("2026-10-27T07:07:53.000Z");
    expect(p.items[0]).toMatchObject({ variant: "Black (04)", qty: 1, price: 726 });
    expect(p.total).toBe(0);
  });
});

describe("Shopee — คำขอคืนเงิน/คืนสินค้า", () => {
  const p = parsePlatformEmail({ from: SHOPEE, subject: "คำขอคืนเงิน/คืนสินค้า", html: SHOPEE_RETURN_HTML });
  it("เก็บเลขคำขอ (15 ตัว) แต่ไม่ถือเป็นเลขออเดอร์", () => {
    expect(p.kind).toBe("return_requested");
    expect(p.ref_no).toBe("2610270PUQN7BJ5");
    expect(p.order_no).toBeNull();
    expect(p.shop_name).toBe("Louis Montini & Pixie Dustie");
    expect(isReadable(p)).toBe(true);
  });
});

describe("Lazada — New Order", () => {
  const p = parsePlatformEmail({ from: LAZADA, subject: "New Order just arrived!", html: LAZADA_NEW_HTML });
  it("ได้เลขออเดอร์ + สินค้า 1 รายการ (อ่านครั้งเดียว ไม่ซ้ำกับส่วนภาษาไทย)", () => {
    expect(p.platform).toBe("lazada");
    expect(p.kind).toBe("order_new");
    expect(p.order_no).toBe("1125516432504630");
    expect(p.shop_name).toBe("Louis Montini");
    expect(p.items).toEqual([{ title: "Louis Montini (Heart Charms) ที่ห้อยโทรศัพท์มือถือ หัวใจพาสเทลมีโบว์ Handmade PHPB010", variant: null, qty: 1, qty_known: false, price: null }]);
    expect(p.problems.join(" ")).toContain("ไม่บอกจำนวน");
  });
  it("หลายสินค้าคั่นด้วยจุลภาค (ทุกท่อนลงท้ายด้วยรหัส) → แยกรายการ", () => {
    const t = parsePlatformEmail({ from: LAZADA, text: "New Order just arrived!\nOrder Number: 123456789012\nOrder Item List: กระเป๋า A TTM061, พวงกุญแจ B PHPB010" });
    expect(t.items.map((i) => i.title)).toEqual(["กระเป๋า A TTM061", "พวงกุญแจ B PHPB010"]);
  });
});

describe("เมลอื่น", () => {
  it("โปรโมชันของ Shopee = other (ระบบข้าม)", () => {
    const p = parsePlatformEmail({ from: SHOPEE, subject: "แคมเปญ 11.11 มาแล้ว!", text: "เรียน คุณ louismontini_officialshop,\nเข้าร่วมแคมเปญ 11.11 ได้แล้ววันนี้" });
    expect(p.kind).toBe("other");
    expect(isReadable(p)).toBe(true);
  });
  it("ไม่ใช่ Shopee/Lazada = platform null", () => {
    expect(parsePlatformEmail({ from: "news@example.com", text: "สวัสดี" }).platform).toBeNull();
  });
  it("เมลชำระเงินที่หาเลขออเดอร์ไม่เจอ = อ่านไม่ออก", () => {
    const p = parsePlatformEmail({ from: SHOPEE, text: "เรียน คุณ shop,\nคำสั่งซื้อได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว" });
    expect(p.kind).toBe("order_paid");
    expect(isReadable(p)).toBe(false);
    expect(p.problems).toContain("หาเลขออเดอร์ในเมลไม่เจอ");
  });
});
