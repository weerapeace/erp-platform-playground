import { describe, expect, it } from "vitest";
import { lazConnHealth, lazProductToCatalogItem } from "./lazada";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28);

describe("lazConnHealth", () => {
  it("ยังไม่เชื่อม = none", () => {
    expect(lazConnHealth(null, NOW).state).toBe("none");
    expect(lazConnHealth({ stage: "disconnected" }, NOW).state).toBe("none");
  });
  it("ตัวต่ออายุหมดแล้ว = expired (เคสจริง IG: หมด 5 ส.ค.)", () => {
    const h = lazConnHealth({ stage: "connected", refresh_expires_at: 1785912852122, expires_at: 1783925652122 }, NOW);
    expect(h).toMatchObject({ state: "expired", days_left: 0 });
  });
  it("เหลือ ≤ 7 วัน = expiring · มากกว่านั้น = connected", () => {
    expect(lazConnHealth({ stage: "connected", refresh_expires_at: NOW + 5 * DAY }, NOW)).toMatchObject({ state: "expiring", days_left: 5 });
    expect(lazConnHealth({ stage: "connected", refresh_expires_at: NOW + 20 * DAY }, NOW)).toMatchObject({ state: "connected", days_left: 20 });
  });
  it("ไม่รู้วันหมดของตัวต่ออายุ → ดูจากกุญแจหลัก", () => {
    expect(lazConnHealth({ stage: "connected", expires_at: NOW + DAY }, NOW).state).toBe("connected");
    expect(lazConnHealth({ stage: "connected", expires_at: NOW - DAY }, NOW).state).toBe("expired");
  });
});

describe("lazProductToCatalogItem", () => {
  const sample = {
    item_id: 3456789012, primary_category: 13478, status: "Active", created_time: "1719900000000",
    attributes: { name: "IG International อะไหล่หมุด ขนาด 6 มม. 1 ชิ้น PIN6", brand: "No Brand", description: "<p>ยาวมาก</p>" },
    skus: [
      { SellerSku: "PIN-6-GD", SkuId: 111, ShopSku: "3456789012_TH-111", price: 25, special_price: 19, quantity: 40, Available: 38, Status: "active", Images: ["https://x/1.jpg"] },
      { SellerSku: "PIN-6-SV", SkuId: 112, price: "20", quantity: "0", Status: "inactive" },
      { SellerSku: "PIN-6-GD", SkuId: 113, price: 0 },
    ],
  };
  it("แปลงเป็นรายการมาตรฐาน (ราคาปกติต่ำสุด · รหัสไม่ซ้ำ · สถานะตัวเล็ก)", () => {
    const it0 = lazProductToCatalogItem(sample)!;
    expect(it0).toMatchObject({ external_product_id: "3456789012", title: sample.attributes.name, skus: ["PIN-6-GD", "PIN-6-SV"], price: 20, status: "active" });
  });
  it("เก็บสต๊อก/ราคาลดต่อ SKU ใน raw แต่ไม่เก็บ HTML รายละเอียด/รูป", () => {
    const raw = lazProductToCatalogItem(sample)!.raw.lazada as Record<string, unknown>;
    expect((raw.skus as Record<string, unknown>[])[0]).toMatchObject({ seller_sku: "PIN-6-GD", sku_id: "111", special_price: 19, available: 38 });
    expect(JSON.stringify(raw)).not.toContain("ยาวมาก");
    expect(JSON.stringify(raw)).not.toContain("1.jpg");
  });
  it("ไม่มี item_id = ข้าม", () => expect(lazProductToCatalogItem({ attributes: { name: "x" } })).toBeNull());
});
