import { describe, it, expect } from "vitest";
import {
  normalizeContentSources,
  shippingAutoPreview,
  shippingSourceOf,
  upsertSource,
  sourceUsage,
  detailSourceValue,
  parseDetailSourceValue,
  SHIPPING_SOURCE_ID,
  SHIPPING_SOURCE_NAME,
  MAX_CONTENT_LINES,
} from "../website-content-sources";
import { normalizeTheme, normalizeDetailItems } from "../website-theme";

/** 📚 คลังแหล่งข้อมูล (ช่อง "เอาข้อมูลจาก" ของหัวข้อรายละเอียดสินค้า) */
describe("normalizeContentSources", () => {
  it("ตัดบรรทัดว่าง · แก้ id ซ้ำ · การจัดส่งชื่อคงที่ + กรอง hideAuto", () => {
    const out = normalizeContentSources([
      { id: "shipping", name: "แก้ชื่อไม่ได้", lines: [{ id: "a", text: " จัดส่งภายใน 1–2 วัน " }, { id: "b", text: "  " }], hideAuto: ["payment", "bogus"] },
      { id: "w1", name: "การรับประกัน", lines: [{ id: "x", text: "รับประกัน 6 เดือน" }, { id: "x", text: "เปลี่ยนซิปฟรี" }] },
      { id: "w1", name: "ซ้ำ", lines: [] },
      "ขยะ",
    ]);
    expect(out[0]).toEqual({ id: "shipping", name: SHIPPING_SOURCE_NAME, lines: [{ id: "a", text: "จัดส่งภายใน 1–2 วัน" }], hideAuto: ["payment"] });
    expect(out[1].lines.map((l) => l.id)).toEqual(["x", "x_"]);
    expect(out[1]).not.toHaveProperty("hideAuto");
    expect(out[2].id).toBe("w1_");
    expect(out).toHaveLength(3);
  });

  it("ไม่ใช่อาเรย์ = ว่าง · บรรทัดไม่เกินเพดาน", () => {
    expect(normalizeContentSources(null)).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `l${i}`, text: `บรรทัด ${i}` }));
    expect(normalizeContentSources([{ id: "s", name: "x", lines: many }])[0].lines).toHaveLength(MAX_CONTENT_LINES);
  });
});

describe("shippingAutoPreview", () => {
  it("ถ้อยคำ + รูปแบบราคาเหมือนเว็บร้าน", () => {
    const lines = shippingAutoPreview({ free_shipping_min: 1500, shipping_flat: 50, pay_cod: true, pay_promptpay: true, order_note: " จัดส่งภายใน 1–2 วันทำการ " });
    expect(lines).toEqual([
      { key: "shipping", text: "ส่งฟรีเมื่อสั่งครบ ฿1,500 · ต่ำกว่านั้นค่าส่ง ฿50" },
      { key: "payment", text: "ชำระเงิน: เก็บเงินปลายทาง · โอนพร้อมเพย์" },
      { key: "note", text: "จัดส่งภายใน 1–2 วันทำการ" },
    ]);
  });
  it("ไม่มีเงื่อนไข = ส่งฟรีทุกออเดอร์ · ไม่มีช่องทางจ่าย/หมายเหตุ = ข้อความว่าง", () => {
    const lines = shippingAutoPreview({ free_shipping_min: 0, shipping_flat: 0, pay_cod: false, pay_promptpay: false });
    expect(lines.map((l) => l.text)).toEqual(["ส่งฟรีทุกออเดอร์", "", ""]);
    expect(shippingAutoPreview({ free_shipping_min: 0, shipping_flat: 45.5, pay_cod: false, pay_promptpay: false })[0].text).toBe("ค่าส่ง ฿45.50 ต่อออเดอร์");
  });
});

describe("ตัวช่วย", () => {
  it("shippingSourceOf ยังไม่เคยแก้ = ค่าว่าง · upsertSource แทนที่/เพิ่ม", () => {
    const ship = shippingSourceOf([]);
    expect(ship).toMatchObject({ id: SHIPPING_SOURCE_ID, lines: [], hideAuto: [] });
    const a = upsertSource([], ship);
    expect(a).toHaveLength(1);
    expect(upsertSource(a, { ...ship, hideAuto: ["note"] })).toEqual([{ ...ship, hideAuto: ["note"] }]);
  });

  it("sourceUsage บอกหัวข้อที่ใช้ · ค่าในดรอปดาวน์ custom:<id> ไป-กลับ", () => {
    const items = [
      { label: "การจัดส่ง", source: "shipping" },
      { label: "ประกัน", source: "custom", sourceId: "w1" },
      { label: "ขนาด", source: "dimensions" },
    ];
    expect(sourceUsage(items, SHIPPING_SOURCE_ID)).toEqual(["การจัดส่ง"]);
    expect(sourceUsage(items, "w1")).toEqual(["ประกัน"]);
    expect(detailSourceValue(items[1])).toBe("custom:w1");
    expect(parseDetailSourceValue("custom:w1")).toEqual({ source: "custom", sourceId: "w1" });
    expect(parseDetailSourceValue("shipping")).toEqual({ source: "shipping", sourceId: undefined });
  });
});

describe("ธีม", () => {
  it("หัวข้อ custom เก็บ sourceId · แหล่งอื่นไม่มี", () => {
    const [a, b] = normalizeDetailItems([
      { id: "w", label: "การรับประกัน", source: "custom", sourceId: "w1<>" },
      { id: "s", label: "จัดส่ง", source: "shipping", sourceId: "w1" },
    ]);
    expect(a).toMatchObject({ source: "custom", sourceId: "w1" });
    expect(b).not.toHaveProperty("sourceId");
  });

  it("product.contentSources ผ่าน normalizeTheme + เก็บคำแปล text_en ของบรรทัด", () => {
    const t = normalizeTheme({ product: { contentSources: [{ id: "w1", name: "ประกัน", lines: [{ id: "a", text: "รับประกัน 6 เดือน", text_en: "6-month warranty" }] }] } });
    expect(t.product.contentSources[0].lines[0]).toMatchObject({ text: "รับประกัน 6 เดือน", text_en: "6-month warranty" });
    expect(normalizeTheme({}).product.contentSources).toEqual([]);
  });
});
