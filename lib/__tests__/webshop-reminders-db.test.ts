import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Row } from "./fake-db";

// ✉️ อีเมลจำลอง (ไม่ส่งจริง) — จดว่าส่งถึงใคร
const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { ok: true })),
  emailConfigured: () => true,
}));

import { runCartReminders, runWishlistAlerts, maybeRunWebshopReminders } from "@/lib/webshop-reminders-db";
import { normalizeSiteInfo } from "@/lib/website-site-info";
import { cartHash, cleanCartItems } from "@/lib/webshop-reminders";

type Admin = Parameters<typeof runCartReminders>[0];
const H = 3_600_000;
const shop = { id: "s1", name: "ร้าน A", slug: "a", field_map: null };
const member = (id: string, o: Row = {}): Row => ({ id, shop_id: "s1", name: `คน ${id}`, email: `${id}@x.com`, email_verified: true, marketing_opt_in: true, status: "active", ...o });
const items = cleanCartItems([{ code: "BG-01", name: "กระเป๋า", variant: "ดำ", qty: 1, price: 1290, slug: "bg-01" }]);

beforeEach(() => {
  sent.length = 0;
});

describe("runCartReminders", () => {
  it("เตือนเฉพาะสมาชิกที่ยินยอม + ค้างนานพอ · รอบสองไม่ส่งซ้ำ", async () => {
    const now = Date.now();
    const at = (h: number) => new Date(now - h * H).toISOString();
    const tables: Record<string, Row[]> = {
      store_member_carts: [
        { customer_id: "c1", shop_id: "s1", items, total: 1290, lang: "th", updated_at: at(10), reminded_hash: null },
        { customer_id: "c2", shop_id: "s1", items, total: 1290, lang: "th", updated_at: at(10), reminded_hash: null },
        { customer_id: "c3", shop_id: "s1", items, total: 1290, lang: "th", updated_at: at(1), reminded_hash: null },
      ],
      store_customers: [member("c1"), member("c2", { marketing_opt_in: false }), member("c3")],
      store_settings: [],
      shops: [{ id: "s1", name: "ร้าน A", slug: "a" }],
      audit_logs: [],
    };
    const sb = fakeDb(tables) as unknown as Admin;
    const info = normalizeSiteInfo([{ key: "cart_reminder_enabled", value: "1" }]);
    const r1 = await runCartReminders(sb, shop, info, "https://a.com", now);
    expect(r1).toEqual({ due: 2, sent: 1 });
    expect(sent).toEqual([{ to: "c1@x.com", subject: "ร้าน A: ของในตะกร้ายังรอคุณอยู่" }]);
    expect(tables.store_member_carts[0].reminded_hash).toBe(cartHash(items));
    expect(tables.audit_logs).toHaveLength(1);
    const r2 = await runCartReminders(sb, shop, info, "https://a.com", now);
    expect(r2.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("ร้านปิด = ไม่ทำอะไร", async () => {
    const sb = fakeDb({}) as unknown as Admin;
    expect(await runCartReminders(sb, shop, normalizeSiteInfo([]), null)).toEqual({ due: 0, sent: 0 });
  });
});

describe("runWishlistAlerts", () => {
  const parent = (id: string, code: string, price: number): Row => ({ id, code, name_th: `รุ่น ${code}`, name_en: "", sku_name: null, name_platform: null, introduction: "", description: "", platform_description: null, english_description: "", sale_price: price, final_price: null, fake_price: null, cover_image_r2_key: null, category_id: null });
  const listing = (pid: string, o: Row = {}): Row => ({ shop_id: "s1", parent_sku_id: pid, is_published: true, web_stock_status: null, ...o });

  it("ตั้งราคาอ้างอิงครั้งแรก · ลดถึง % = แจ้ง 1 ข้อความ · ราคาเดิมไม่แจ้งซ้ำ · ของหมดไม่แจ้ง", async () => {
    const tables: Record<string, Row[]> = {
      store_wishlists: [
        { id: "w1", shop_id: "s1", customer_id: "c1", parent_sku_id: "p1", price_at_add: 1000, alerted_price: null },
        { id: "w2", shop_id: "s1", customer_id: "c1", parent_sku_id: "p2", price_at_add: null, alerted_price: null },
        { id: "w3", shop_id: "s1", customer_id: "c1", parent_sku_id: "p3", price_at_add: 1000, alerted_price: null },
      ],
      store_listings: [listing("p1", { web_price: 800 }), listing("p2"), listing("p3", { web_price: 500, web_stock_status: "out" })],
      parent_skus_v2: [parent("p1", "BG-01", 1000), parent("p2", "BG-02", 700), parent("p3", "BG-03", 1000)],
      skus_v2: [],
      store_customers: [member("c1")],
      store_orders: [{ customer_id: "c1", lang: "en", created_at: "2026-10-01T00:00:00Z" }],
      store_settings: [],
      shops: [{ id: "s1", name: "ร้าน A", slug: "a" }],
      audit_logs: [],
    };
    const sb = fakeDb(tables) as unknown as Admin;
    const info = normalizeSiteInfo([{ key: "wishlist_alert_enabled", value: "1" }]);
    const r1 = await runWishlistAlerts(sb, shop, info, "https://a.com");
    expect(r1).toEqual({ drops: 1, sent: 1 });
    expect(sent[0]).toEqual({ to: "c1@x.com", subject: "ร้าน A: Items you liked are now cheaper" });
    expect(tables.store_wishlists.find((w) => w.id === "w1")?.alerted_price).toBe(800);
    expect(tables.store_wishlists.find((w) => w.id === "w2")?.price_at_add).toBe(700);
    expect(tables.store_wishlists.find((w) => w.id === "w3")?.alerted_price).toBeNull();
    const r2 = await runWishlistAlerts(sb, shop, info, "https://a.com");
    expect(r2).toEqual({ drops: 0, sent: 0 });
  });
});

describe("maybeRunWebshopReminders", () => {
  it("ร้านปิดทั้ง 2 อย่าง = ไม่เริ่มรอบ (ไม่จดเวลา)", async () => {
    const tables: Record<string, Row[]> = { store_settings: [], shops: [{ id: "s9", name: "B", slug: "b", status: "active" }] };
    await maybeRunWebshopReminders(fakeDb(tables) as unknown as Admin, "s9");
    expect(tables.store_settings).toHaveLength(0);
  });
  it("เปิดไว้ = เริ่มรอบ + จดเวลา · เรียกถี่ ๆ ในเครื่องเดียว = ข้าม", async () => {
    const tables: Record<string, Row[]> = { store_settings: [{ shop_id: "s8", key: "cart_reminder_enabled", value: "1" }], shops: [{ id: "s8", name: "C", slug: "c", status: "active", field_map: null }], shop_domains: [], store_member_carts: [] };
    const sb = fakeDb(tables) as unknown as Admin;
    await maybeRunWebshopReminders(sb, "s8");
    expect(tables.store_settings.find((r) => r.key === "reminders_last_run")).toBeTruthy();
    tables.store_settings = tables.store_settings.filter((r) => r.key !== "reminders_last_run");
    await maybeRunWebshopReminders(sb, "s8");
    expect(tables.store_settings.find((r) => r.key === "reminders_last_run")).toBeFalsy();
  });
});
