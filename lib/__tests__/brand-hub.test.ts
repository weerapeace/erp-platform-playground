import { describe, expect, it } from "vitest";
import { HUB_CHANNELS, buildHubTodos, hubConnState, parentSkusOfBrandHref, type HubCounts } from "@/lib/brand-hub";

const NOW = Date.UTC(2026, 10, 12);
const on = { has_key: true, stage: "connected", refresh_expires_at: NOW + 86_400_000 };

describe("hubConnState — สถานะการเชื่อมช่องทาง", () => {
  it("มีกุญแจ + ยังไม่หมดอายุ = เชื่อมแล้ว", () => {
    expect(hubConnState("lazada", on, 0, NOW)).toBe("connected");
    expect(hubConnState("line_shopping", { has_key: true, stage: null, refresh_expires_at: null }, 933, NOW)).toBe("connected");   // LINE ไม่มี stage
  });
  it("กุญแจต่ออายุหมดแล้ว = หมดอายุ (Lazada IG เคยหลุด 5 ส.ค. แต่หน้าเดิมขึ้นเชื่อมแล้วหลอก)", () => {
    expect(hubConnState("lazada", { ...on, refresh_expires_at: NOW - 1 }, 100, NOW)).toBe("expired");
  });
  it("ไม่มีแถว / ตัดการเชื่อม = ยังไม่เชื่อม · Shopee ที่มีสินค้าจากไฟล์ = นำเข้าไฟล์", () => {
    expect(hubConnState("tiktok", null, 0, NOW)).toBe("none");
    expect(hubConnState("tiktok", { has_key: true, stage: "disconnected", refresh_expires_at: null }, 0, NOW)).toBe("none");
    expect(hubConnState("shopee", null, 276, NOW)).toBe("file");
    expect(hubConnState("shopee", null, 0, NOW)).toBe("none");
  });
  it("Facebook เก็บแบบ stage connected (กุญแจอยู่ในแถว)", () => {
    expect(hubConnState("facebook", { has_key: true, stage: "connected", refresh_expires_at: null }, 0, NOW)).toBe("connected");
  });
  it("ช่องทางบนหน้าแบรนด์ไม่มีเว็บร้าน (ระบบเราเอง ไม่ต้องเชื่อม)", () => {
    expect(HUB_CHANNELS.map((c) => c.code)).not.toContain("website");
  });
});

describe("buildHubTodos — การ์ดงานที่ต้องทำ", () => {
  const zero: HubCounts = { orders_to_ship: 0, unmatched: 0, not_listed: 0, gone: 0, no_cover: 0, no_category: 0, no_weight: 0, no_box: 0, sku_no_image: 0 };
  it("โชว์เฉพาะที่มีงาน · ออเดอร์มาก่อน · ลิงก์ส่งแบรนด์ไปกรอง", () => {
    const t = buildHubTodos("b-1", { ...zero, unmatched: 27, orders_to_ship: 7 });
    expect(t.map((x) => x.key)).toEqual(["orders_to_ship", "unmatched"]);
    expect(t[0].href).toBe("/master/platform-orders?brand=b-1");
    expect(t[1].href).toBe("/master/platform-catalog?brand=b-1");
  });
  it("ไม่มีงานเลย = ไม่มีการ์ด", () => {
    expect(buildHubTodos("b-1", zero)).toEqual([]);
  });
  it("การ์ดหน้าร้าน/ออเดอร์มีสิทธิ์กำกับ · การ์ดข้อมูลสินค้า (น้ำหนัก/กล่อง/รูปตัวเลือก) ใช้สิทธิ์เดียวกับเมนูสินค้า (ใครเข้าแอปได้ก็เห็น)", () => {
    const t = buildHubTodos("b", { orders_to_ship: 1, unmatched: 1, not_listed: 1, gone: 1, no_cover: 1, no_category: 1, no_weight: 1, no_box: 1, sku_no_image: 1 });
    expect(t).toHaveLength(9);
    const open = t.filter((x) => x.perm == null).map((x) => x.key).sort();
    expect(open).toEqual(["no_box", "no_weight", "sku_no_image"]);
  });
  it("ขาดน้ำหนัก/กล่อง → ตาราง Parent SKU กรองแบรนด์ (ตัวกรองแบบตารางกลาง ?flt=)", () => {
    const t = buildHubTodos("b-1", { ...zero, no_weight: 157, no_box: 175 });
    const href = t.find((x) => x.key === "no_weight")!.href;
    expect(href).toBe(parentSkusOfBrandHref("b-1"));
    expect(JSON.parse(new URL(href, "http://x").searchParams.get("flt")!)).toEqual({ brand_id: { type: "text", value: "b-1" } });
  });
});
