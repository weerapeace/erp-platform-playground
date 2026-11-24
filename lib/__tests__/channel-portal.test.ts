import { describe, expect, it } from "vitest";
import {
  PORTAL_LINKS, PORTAL_PINS_MAX, buildPortalTodos, daysLeft, menuRowFor, movePin, parsePins, portalConnState,
  portalLinkByKey, portalLinkVisible, shopHref, togglePin,
  type PortalMenuRow, type PortalShop, type PortalTotals,
} from "@/lib/channel-portal";

const row = (p: Partial<PortalMenuRow> & { href: string }): PortalMenuRow => ({ id: p.href, permission_key: null, parent_id: null, audience: null, app_overrides: null, ...p });
const shop = (p: Partial<PortalShop>): PortalShop => ({
  key: "x", platform: "shopee", brand_id: "b1", brand_name: "B", shop_name: null, conn: "connected", token_expires_at: null, token_days_left: null,
  pull: null, listings: 0, unmatched: 0, dupes: 0, listings_updated_at: null, today_orders: 0, today_sales: 0, to_ship: 0, ...p,
});
const totals = (p: Partial<PortalTotals> = {}): PortalTotals => ({ today_orders: 0, today_sales: 0, today_paid: 0, to_ship: 0, unmatched: 0, dupes: 0, price_low: 0, ...p });

describe("ทะเบียนทางลัด", () => {
  it("key ไม่ซ้ำ · ทุกลิงก์เป็นหน้าในระบบ", () => {
    const keys = PORTAL_LINKS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of PORTAL_LINKS) expect(l.href.startsWith("/")).toBe(true);
  });
});

describe("menuRowFor", () => {
  const rows = [row({ href: "/master/platform-catalog" }), row({ href: "/master/platform-catalog?view=shop", id: "shop" })];
  it("ลิงก์ตรงกันทุกตัวอักษรก่อน", () => expect(menuRowFor({ href: "/master/platform-catalog?view=shop" }, rows)?.id).toBe("shop"));
  it("ไม่มีตัวตรง = ใช้เมนูของหน้าเดียวกันที่ไม่มี ?", () => expect(menuRowFor({ href: "/master/platform-catalog?view=cross" }, rows)?.href).toBe("/master/platform-catalog"));
  it("ไม่เป็นเมนู = null", () => expect(menuRowFor({ href: "/brand-hub" }, rows)).toBeNull());
});

describe("portalLinkVisible (แบบ B)", () => {
  const cross = portalLinkByKey("cross")!;
  const staff = { id: "u1", role: "staff" };
  const yes = () => true;
  it("ไม่มีสิทธิ์ของหน้า = ไม่เห็น", () => expect(portalLinkVisible(cross, [], staff, () => false)).toBe(false));
  it("มีสิทธิ์ + ไม่เป็นเมนู = เห็น", () => expect(portalLinkVisible(cross, [], staff, yes)).toBe(true));
  it("แอดมินซ่อนเมนูจากตำแหน่งนี้ = ไม่เห็น", () => {
    const rows = [row({ href: "/master/platform-catalog", audience: { roles: ["manager"] } })];
    expect(portalLinkVisible(cross, rows, staff, yes)).toBe(false);
    expect(portalLinkVisible(cross, rows, { id: "u2", role: "manager" }, yes)).toBe(true);
  });
  it("ซ่อนรายคน = ไม่เห็นเฉพาะคนนั้น", () => {
    const rows = [row({ href: "/master/platform-catalog", audience: { hide_users: ["u1"] } })];
    expect(portalLinkVisible(cross, rows, staff, yes)).toBe(false);
    expect(portalLinkVisible(cross, rows, { id: "u3", role: "staff" }, yes)).toBe(true);
  });
  it("ซ่อนในแอปช่องทางขาย = ไม่เห็นทุกคน (รวมแอดมิน)", () => {
    const rows = [row({ href: "/master/platform-catalog", app_overrides: { marketplace: { place: "hidden" } } })];
    expect(portalLinkVisible(cross, rows, { id: "a", role: "admin" }, yes)).toBe(false);
  });
  it("ยังไม่รู้ผู้ใช้ = เห็น (กันจอว่างตอนโหลด)", () => expect(portalLinkVisible(cross, [], null, () => false)).toBe(true));
});

describe("หมุดของฉัน", () => {
  it("parsePins ตัดค่าผิด/ซ้ำ/ไม่มีจริง", () => {
    expect(parsePins(["cross", "cross", "nope", 3, "orders"])).toEqual(["cross", "orders"]);
    expect(parsePins("x")).toBeNull();
  });
  it("togglePin เพิ่ม/เอาออก · ไม่เกินเพดาน", () => {
    expect(togglePin(["cross"], "orders")).toEqual(["cross", "orders"]);
    expect(togglePin(["cross", "orders"], "cross")).toEqual(["orders"]);
    const full = PORTAL_LINKS.slice(0, PORTAL_PINS_MAX).map((l) => l.key);
    expect(togglePin(full, PORTAL_LINKS[PORTAL_PINS_MAX].key)).toEqual(full);
  });
  it("movePin สลับ · ออกนอกขอบ = เหมือนเดิม", () => {
    expect(movePin(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(movePin(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});

describe("สถานะการ์ดร้าน", () => {
  it("daysLeft ปัดขึ้น", () => {
    const now = Date.UTC(2026, 10, 24);
    expect(daysLeft(now + 16 * 86_400_000 - 1000, now)).toBe(16);
    expect(daysLeft(null, now)).toBeNull();
  });
  it("portalConnState", () => {
    expect(portalConnState("api", 100, 0)).toBe("connected");
    expect(portalConnState("api", 16, 0)).toBe("expiring");
    expect(portalConnState("api", 0, 0)).toBe("expired");
    expect(portalConnState("none", null, 276)).toBe("file");
    expect(portalConnState("none", null, 0)).toBe("none");
    expect(portalConnState("direct", null, 0)).toBe("direct");
  });
  it("shopHref: ยังไม่เชื่อม → หน้าเชื่อมร้าน · เชื่อมแล้ว → หน้าร้าน", () => {
    expect(shopHref({ platform: "tiktok", brand_id: "b1", conn: "none" })).toBe("/admin/platform-accounts?brand=b1");
    expect(shopHref({ platform: "lazada", brand_id: "b1", conn: "expiring" })).toBe("/master/platform-catalog?brand=b1&platform=lazada&view=shop");
    expect(shopHref({ platform: "website", brand_id: null, conn: "direct" })).toBe("/website");
  });
});

describe("งานที่ต้องทำ", () => {
  it("เฉพาะที่มีงาน · ไม่รู้ตัวเลข (ไม่มีสิทธิ์) = ไม่โชว์", () => {
    const t = buildPortalTodos(totals({ to_ship: 60, unmatched: null, dupes: 0, price_low: 2 }), [shop({ conn: "expiring" }), shop({ conn: "file" })]);
    expect(t.map((x) => x.key)).toEqual(["to_ship", "reconnect", "price_low", "stale"]);
    expect(t.find((x) => x.key === "reconnect")?.count).toBe(1);
  });
});
