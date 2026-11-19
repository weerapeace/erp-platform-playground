import { describe, expect, it } from "vitest";
import {
  buildCell, cellIssues, crossPriceDiff, emptyCell, listingDetails, matchPresence, missingShopCodes, presenceCounts, rowHasIssue,
  titleHasBrand, titleHasCode, titleLength, type CrossCell, type CrossRow,
} from "@/lib/platform-cross-shop";
import type { SkuLite } from "@/lib/platform-variant-match";

const sku = (code: string, parent: string): [string, SkuLite] => [code, { code, parent_sku_id: parent, name: null }];
const ctx = {
  byCode: new Map<string, SkuLite>([sku("MGN164-01", "P1"), sku("MGN164-02", "P1"), sku("MGN164-03", "P1")]),
  saleOf: new Map([["MGN164-01", 1250], ["MGN164-02", 1250], ["MGN164-03", 1250]]),
  fakeOf: new Map<string, number>(),
  ourCodes: ["MGN164-01", "MGN164-02", "MGN164-03"],
};
const row = (cells: Record<string, Partial<CrossCell>>, code = "MGN164"): CrossRow => ({
  id: "P1", code, name: "เข็มขัด", name_platform: null, cover_key: null,
  our: { sale: 1250, full: null, skus: 3, stock: null, desc_len: 0, weight_g: null, box: false },
  cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { ...emptyCell("selling"), ...v }])),
});

describe("buildCell", () => {
  it("ไม่มีรายการ / มีแต่ตัวที่ไม่อยู่บนร้านแล้ว = ยังไม่ลง", () => {
    expect(buildCell("lazada", [], ctx).st).toBe("none");
    expect(buildCell("lazada", [{ id: "a", title: "x", status: "removed", price: 1, raw: {} }], ctx).st).toBe("none");
  });
  it("Lazada: ราคาลดไม่ตรง + รหัสแปลก + ขาด 1 สี", () => {
    const raw = { lazada: { status: "active", primary_category: "10100763", skus: [
      { seller_sku: "MGN164-01", price: 1250, special_price: 1190, available: 5, status: "active" },
      { seller_sku: "MGN164-02", price: 1250, available: 0, status: "active" },
      { seller_sku: "OLD-9", price: 900, available: 1, status: "active" },
    ] } };
    const c = buildCell("lazada", [{ id: "L1", title: "Louis Montini MGN164", status: null, price: 1250, raw }], ctx);
    expect(c.lid).toBe("L1");
    expect(c.vars).toBe(3);
    expect(c.pay_diff).toBe(1);
    expect(c.priced).toBe(2);
    expect(c.v_unknown).toBe(1);
    expect(c.v_missing).toBe(1);
    expect(c.category).toBe(true);
    expect(c.images).toBeNull();
  });
  it("ลงซ้ำ 2 รายการ → ใช้ตัวที่ขายอยู่เป็นหน้าตา และนับจำนวน", () => {
    const off = { tiktok: { status: "SELLER_DEACTIVATED", skus: [{ seller_sku: "MGN164-01", price: 1250, stock: 0 }] } };
    const on = { tiktok: { status: "ACTIVATE", skus: [{ seller_sku: "MGN164-01", price: 1250, stock: 9 }] } };
    const c = buildCell("tiktok", [{ id: "T0", title: "a", status: null, price: null, raw: off }, { id: "T1", title: "b", status: null, price: null, raw: on }], ctx);
    expect(c.listings).toBe(2);
    expect(c.lid).toBe("T1");
  });
});

describe("crossPriceDiff", () => {
  it("TikTok เทียบได้แค่ราคาตั้ง → full", () => {
    expect(crossPriceDiff("tiktok", { price: 1790, sale_price: null }, { price: 1250, discount: 0 })).toBe("full");
    expect(crossPriceDiff("tiktok", { price: 1250, sale_price: null }, { price: 1250, discount: 0 })).toBeNull();
  });
  it("ร้านอื่นใช้กฎปุ่มส่งราคา", () => {
    expect(crossPriceDiff("line_shopping", { price: 1250, sale_price: 1190 }, { price: 1250, discount: 0 })).toBe("pay");
  });
});

describe("listingDetails", () => {
  it("Shopee: จำนวนรูป หมวด น้ำหนัก", () => {
    expect(listingDetails("shopee", { shopee: { image_count: 8, category_id: 100, weight: 0.3 } })).toEqual({ images: 8, category: true, weight: 0.3 });
  });
  it("LINE: รูปจาก imageUrls น้ำหนักจากตัวเลือกแรก", () => {
    expect(listingDetails("line_shopping", { line: { imageUrls: ["a", "b"], category: null, variants: [{ weight: 0.06 }] } })).toEqual({ images: 2, category: false, weight: 0.06 });
  });
  it("ร้านที่ไม่ส่งข้อมูล = null (ไม่รู้ ≠ ไม่มี)", () => {
    expect(listingDetails("lazada", { lazada: { skus: [] } })).toEqual({ images: null, category: null, weight: null });
  });
});

describe("ชื่อ", () => {
  it("รหัสรุ่น/แบรนด์ ไม่สนตัวพิมพ์ ขีด ช่องว่าง", () => {
    expect(titleHasCode("Louis Montini Boxset mpu gs01", "MPU-GS01")).toBe(true);
    expect(titleHasCode("Louis Montini Boxset", "MPU-GS01")).toBe(false);
    expect(titleHasBrand("LOUIS MONTINI เข็มขัด", "Louis Montini")).toBe(true);
    expect(titleHasBrand("เข็มขัด", "Louis Montini")).toBe(false);
  });
  it("Shopee นับตัวอักษรที่คนเห็น", () => {
    expect(titleLength("shopee", "กี่")).toBe(1);
    expect(titleLength("lazada", "กี่")).toBe(3);
  });
  it("ยาวเกินเพดานของร้าน", () => {
    const r = row({ line_shopping: { title: "Louis Montini MGN164 " + "ก".repeat(90) } });
    expect(cellIssues("title", r, "line_shopping", "Louis Montini").map((i) => i.text)[0]).toMatch(/^ยาวเกิน/);
  });
});

describe("ปัญหา + ตัวกรอง", () => {
  const shops = ["shopee", "lazada", "tiktok", "line_shopping"];
  const r = row({ shopee: { stock: 0 }, lazada: { st: "none" }, tiktok: { st: "maybe", stock: null }, line_shopping: { stock: 5, pay_diff: 1 } });
  it("ช่องที่ยังไม่ลง/อาจมีแล้ว ไม่ตรวจเรื่องอื่น", () => {
    expect(cellIssues("price", r, "lazada", "x")).toEqual([]);
    expect(cellIssues("status", r, "tiktok", "x")[0].text).toMatch(/อาจมีแล้ว/);
  });
  it("หมดที่ร้านนี้แต่ร้านอื่นยังมี", () => {
    expect(cellIssues("stock", r, "shopee", "x", shops)[0]).toEqual({ tone: "danger", text: "หมดที่ร้านนี้ (ร้านอื่นยังมี)" });
  });
  it("rowHasIssue นับเฉพาะ danger/warning", () => {
    expect(rowHasIssue("price", r, shops, "x")).toBe(true);
    const ok = row({ shopee: { full_diff: 2 } });
    expect(rowHasIssue("price", ok, ["shopee"], "x")).toBe(false);
  });
  it("ตัวกรองการลงร้าน + นับ", () => {
    expect(matchPresence(r, "missing", shops)).toBe(true);
    expect(matchPresence(r, "miss:lazada", shops)).toBe(true);
    expect(matchPresence(r, "miss:shopee", shops)).toBe(false);
    expect(matchPresence(r, "all", shops)).toBe(false);
    const none = row({ shopee: { st: "none" }, lazada: { st: "none" } });
    expect(matchPresence(none, "none", ["shopee", "lazada"])).toBe(true);
    const c = presenceCounts([r, none], ["shopee", "lazada"]);
    expect(c).toMatchObject({ "": 2, missing: 2, none: 1, all: 0, "miss:lazada": 2, "miss:shopee": 1 });
  });
  it("ร้านที่ขาด ไม่รวม 'อาจมีแล้ว' (ต้องไปจับคู่ก่อน)", () => {
    expect(missingShopCodes(r, shops)).toEqual(["lazada"]);
  });
});
