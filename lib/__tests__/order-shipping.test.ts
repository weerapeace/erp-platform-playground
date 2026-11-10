import { describe, it, expect } from "vitest";
import {
  bookItemOf, canShipViaShippop, cleanShipTo, manualOrderNo, nextSimStatus, orderStatusFromShipping, parcelWeight, senderOfProfile,
  type ShippingProfile,
} from "../order-shipping";

/** 🚚 ขนส่งในศูนย์ออเดอร์ ขั้น 1 (2026-11-10) */
const ADDR = { name: "สมชาย ใจดี", phone: "081-234-5678", address: "99/1 ถ.สีลม", subdistrict: "สีลม", district: "บางรัก", province: "กรุงเทพมหานคร", postal: "10500" };
const PROFILE: ShippingProfile = { brand_id: "b", sender_name: "IG International", sender_phone: "0812345678", sender_address: "1 ถ.ทดสอบ", sender_subdistrict: "ในเมือง", sender_district: "เมือง", sender_province: "ขอนแก่น", sender_postal: "40000", default_box: "20x30x10", default_weight_g: 500, default_courier: "FLE" };

describe("🚚 ส่งผ่าน SHIPPOP ได้ไหม", () => {
  it("ช่องทางของเรา (LINE/โทร) ส่งได้ · แพลตฟอร์ม/เมล/ส่งแล้ว/จองแล้ว ไม่ได้", () => {
    expect(canShipViaShippop({ source: "manual", platform_code: "line_oa", status: "new" }).ok).toBe(true);
    expect(canShipViaShippop({ source: "manual", platform_code: null, status: "new" }).ok).toBe(true);
    const lz = canShipViaShippop({ source: "api", platform_code: "lazada", status: "new" });
    expect(lz.ok).toBe(false);
    expect(lz.ok ? "" : lz.reason).toContain("Lazada");
    expect(canShipViaShippop({ source: "import", platform_code: "shopee", status: "new" }).ok).toBe(false);
    expect(canShipViaShippop({ source: "api", platform_code: "tiktok", status: "new" }).ok).toBe(false);
    expect(canShipViaShippop({ source: "email", platform_code: "line_oa", status: "new" }).ok).toBe(false);
    expect(canShipViaShippop({ source: "manual", platform_code: "line_oa", status: "shipped" }).ok).toBe(false);
    expect(canShipViaShippop({ source: "manual", platform_code: "line_oa", status: "packed", shipping: { status: "booking" } }).ok).toBe(false);
    // ยกเลิกการจองแล้ว = จองใหม่ได้
    expect(canShipViaShippop({ source: "manual", platform_code: "line_oa", status: "packed", shipping: { status: "cancel" } }).ok).toBe(true);
  });
});

describe("🏠 ที่อยู่ + จุดส่งของ", () => {
  it("ที่อยู่ผู้รับครบ = ผ่าน · เบอร์ตัดขีด · ขาดรหัสไปรษณีย์ = บอกชัด", () => {
    const r = cleanShipTo(ADDR);
    expect(r.ok && r.value.phone).toBe("0812345678");
    const bad = cleanShipTo({ ...ADDR, postal: "105" });
    expect(bad.ok ? "" : bad.error).toContain("รหัสไปรษณีย์");
    expect(cleanShipTo({ ...ADDR, phone: "12" }).ok).toBe(false);
    expect(cleanShipTo(null).ok).toBe(false);
  });
  it("จุดส่งของไม่ครบ/ไม่มี = บอกช่องที่ขาด", () => {
    expect(senderOfProfile(PROFILE).ok).toBe(true);
    expect(senderOfProfile(null).ok).toBe(false);
    const r = senderOfProfile({ ...PROFILE, sender_postal: "", sender_phone: "" });
    expect(r.ok ? "" : r.error).toContain("รหัสไปรษณีย์");
  });
});

describe("⚖️ น้ำหนัก + รายการจอง", () => {
  it("ใช้น้ำหนักสินค้า × จำนวน · ไม่มีน้ำหนัก = ค่าตั้งต้น + นับว่าขาดกี่รายการ", () => {
    expect(parcelWeight([{ qty: 2, weight_g: 300 }, { qty: 1, weight_g: null }], 500)).toEqual({ grams: 1100, missing: 1 });
    expect(parcelWeight([], 500)).toEqual({ grams: 500, missing: 0 });
  });
  it("รายการจอง: เก็บปลายทางปัดเป็นบาท · กล่องจากค่าตั้ง · ที่อยู่ไม่ครบ = ไม่จอง", () => {
    const s = senderOfProfile(PROFILE);
    if (!s.ok) throw new Error("profile");
    const r = bookItemOf({ id: "o1", order_no: "M261110-AAAA", ship_to: ADDR, cod_amount: 890.4 }, s.from, { courierCode: "FLE", grams: 700, box: "25x35x15" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.codAmount).toBe(890);
      expect(r.item.parcel).toMatchObject({ weight: 700, width: 25, length: 35, height: 15 });
      expect(r.item.to.postcode).toBe("10500");
    }
    expect(bookItemOf({ id: "o2", order_no: "X", ship_to: null, cod_amount: 0 }, s.from, { courierCode: "FLE", grams: 500, box: "" }).ok).toBe(false);
  });
});

describe("🔁 สถานะ + เลขออเดอร์", () => {
  it("จองแล้ว = แพ็กแล้ว · ขนส่งรับ/ส่งถึง = ส่งแล้ว · อื่น ๆ ไม่เปลี่ยนเอง", () => {
    expect(orderStatusFromShipping("booking")).toBe("packed");
    expect(orderStatusFromShipping("shipping")).toBe("shipped");
    expect(orderStatusFromShipping("complete")).toBe("shipped");
    expect(orderStatusFromShipping("return")).toBeNull();
    expect(nextSimStatus("booking")).toBe("shipping");
    expect(nextSimStatus("complete")).toBeNull();
  });
  it("เลขออเดอร์สร้างเองตามวันที่ไทย", () => {
    const no = manualOrderNo(Date.parse("2026-11-10T18:00:00Z"), () => 0);   // 01:00 ของ 11 พ.ย. เวลาไทย
    expect(no).toBe("M261111-2222");
  });
});

describe("ช่องทางสร้างออเดอร์เอง", () => {
  it("ทุกช่องทางที่เปิด (ยกเว้นโทร = ไม่ผูกแพลตฟอร์ม) ต้องมีรหัสใน erp_platforms", async () => {
    const m = await import("../order-shipping");
    const DB_PLATFORM_CODES = ["facebook", "instagram", "lazada", "line_oa", "line_shopping", "pinterest", "shopee", "tiktok", "website", "x", "youtube"]; // ณ 2026-11-10
    for (const c of m.OPEN_MANUAL_CHANNELS) if (c.code !== "phone") expect(DB_PLATFORM_CODES).toContain(c.code);
    expect(m.isOpenManualChannel("phone")).toBe(true);
    expect(m.isOpenManualChannel("shopee")).toBe(false);
    expect(m.isManualChannel("phone")).toBe(true);
    expect(m.manualChannelLabel("phone")).toBe("โทร / หน้าร้าน");
  });
});
