import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Row } from "./fake-db";

// ✉️ อีเมล / 💬 LINE จำลอง (ไม่ส่งจริง) — จดว่าส่งถึงใคร
const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { ok: true })),
  emailConfigured: () => true,
}));
const lineSent: string[] = [];
vi.mock("@/lib/webshop-line", () => ({
  lineTextToMember: vi.fn(async (_sb: unknown, _shop: string, customerId: string) => (customerId === "mLine" ? (lineSent.push(customerId), true) : false)),
}));

import { runRestockAlerts } from "@/lib/webshop-reminders-db";
import { normalizeSiteInfo } from "@/lib/website-site-info";
import { restockAlertMessage, restockReady } from "@/lib/webshop-reminders";

type Admin = Parameters<typeof runRestockAlerts>[0];
const shop = { id: "s1", name: "ร้าน A", slug: "a", field_map: null };
const on = normalizeSiteInfo([{ key: "restock_auto_enabled", value: true }]);
const req = (id: string, o: Row): Row => ({ id, shop_id: "s1", parent_sku_id: null, drop_id: null, option_label: null, contact_type: "email", contact: `${id}@x.com`, name: null, customer_id: null, lang: "th", status: "pending", notified_at: null, notified_by: null, auto_channel: null, ...o });

beforeEach(() => {
  sent.length = 0;
  lineSent.length = 0;
});

describe("restockReady", () => {
  const inStock = new Set(["p1"]);
  const now = Date.now();
  const drops = new Map([
    ["dOpen", now - 1000],
    ["dSoon", now + 86_400_000],
  ]);
  it("สินค้า: มีของ = พร้อม · ยังหมด/ไม่มีในร้าน = ยัง", () => {
    expect(restockReady({ parent_sku_id: "p1", drop_id: null }, inStock, drops, now)).toBe(true);
    expect(restockReady({ parent_sku_id: "p2", drop_id: null }, inStock, drops, now)).toBe(false);
  });
  it("ชุด: ถึงเวลาเปิด = พร้อม · ยังไม่ถึง/ไม่พบชุด = ยัง", () => {
    expect(restockReady({ parent_sku_id: null, drop_id: "dOpen" }, inStock, drops, now)).toBe(true);
    expect(restockReady({ parent_sku_id: null, drop_id: "dSoon" }, inStock, drops, now)).toBe(false);
    expect(restockReady({ parent_sku_id: null, drop_id: "gone" }, inStock, drops, now)).toBe(false);
  });
});

describe("restockAlertMessage", () => {
  it("สินค้า (ไทย) — บอกชื่อ+สี · มีปุ่มสั่งซื้อ · บอกว่าส่งครั้งเดียว", () => {
    const m = restockAlertMessage({ lang: "th", shopName: "ร้าน A", customerName: "บี", kind: "product", itemName: "ROAR 2000s", option: "ดำ", url: "https://x.co/product/roar" });
    expect(m.subject).toBe("ร้าน A: ของกลับมาแล้ว");
    expect(m.line).toContain("ROAR 2000s (ดำ) ที่คุณรอ กลับมามีของแล้ว");
    expect(m.email.button).toEqual({ text: "สั่งซื้อเลย", href: "https://x.co/product/roar" });
    expect(m.text).toContain("ส่งครั้งเดียว");
  });
  it("ชุดเปิดขาย (อังกฤษ) — หัวข้อ/ปุ่มของชุด · ไม่มีลิงก์ = ไม่มีปุ่ม", () => {
    const m = restockAlertMessage({ lang: "en", shopName: "Shop", customerName: null, kind: "drop", itemName: "ROARs", option: null, url: null });
    expect(m.subject).toBe("Shop: ROARs is now open");
    expect(m.email.button).toBeUndefined();
    expect(m.line.startsWith("🔔 ROARs is now open · Shop")).toBe(true);
  });
});

describe("runRestockAlerts", () => {
  const tables = (): Record<string, Row[]> => {
    const now = Date.now();
    return {
      store_restock_requests: [
        req("r1", { parent_sku_id: "p1" }), // อีเมล · มีของแล้ว → ส่ง
        req("r2", { parent_sku_id: "p2" }), // อีเมล · ยังหมด → รอ
        req("r3", { parent_sku_id: "p1", contact_type: "phone", contact: "0812345678" }), // เบอร์ = ร้านติดต่อเอง
        req("r4", { drop_id: "dOpen", contact_type: "member", contact: "mMail", customer_id: "mMail" }), // สมาชิก ไม่มี LINE → อีเมลที่ยืนยันแล้ว
        req("r5", { drop_id: "dSoon" }), // ชุดยังไม่เปิด → รอ
        req("r6", { parent_sku_id: "p1", contact_type: "member", contact: "mLine", customer_id: "mLine", lang: "en" }), // สมาชิก LINE → LINE
        req("r7", { parent_sku_id: "p1", contact_type: "member", contact: "mNone", customer_id: "mNone" }), // สมาชิกไม่มีช่องทาง → คืนเป็นรอ
      ],
      store_listings: [
        { shop_id: "s1", parent_sku_id: "p1", is_published: true, web_stock_status: "in" },
        { shop_id: "s1", parent_sku_id: "p2", is_published: true, web_stock_status: "out" },
      ],
      store_new_drops: [
        { id: "dOpen", shop_id: "s1", title: "ROARs", title_en: "ROARs", start_at: new Date(now - 60_000).toISOString() },
        { id: "dSoon", shop_id: "s1", title: "ชุดหน้า", title_en: "Next", start_at: new Date(now + 86_400_000).toISOString() },
      ],
      store_customers: [
        { id: "mMail", name: "เมล", email: "mmail@x.com", email_verified: true, marketing_opt_in: false, status: "active" },
        { id: "mLine", name: "ไลน์", email: null, email_verified: false, marketing_opt_in: false, status: "active" },
        { id: "mNone", name: "ไม่มี", email: "none@x.com", email_verified: false, marketing_opt_in: false, status: "active" },
      ],
      parent_skus_v2: [],
      skus_v2: [],
      audit_logs: [],
    };
  };

  it("ปิดสวิตช์ = ไม่ทำอะไร", async () => {
    const t = tables();
    const r = await runRestockAlerts(fakeDb(t) as unknown as Admin, shop, normalizeSiteInfo([]), "https://x.co");
    expect(r).toEqual({ ready: 0, sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("ส่งเฉพาะที่ถึงเวลา + ส่งได้ · ไม่ต้องยินยอมรับข่าวสาร · เบอร์โทรไม่แตะ · รอบสองไม่ส่งซ้ำ", async () => {
    const t = tables();
    const sb = fakeDb(t) as unknown as Admin;
    const r = await runRestockAlerts(sb, shop, on, "https://x.co");
    expect(r).toEqual({ ready: 4, sent: 3 });
    expect(sent.map((s) => s.to).sort()).toEqual(["mmail@x.com", "r1@x.com"]);
    expect(sent.find((s) => s.to === "mmail@x.com")?.subject).toBe("ร้าน A: ชุด ROARs เปิดขายแล้ว");
    expect(lineSent).toEqual(["mLine"]);
    const st = Object.fromEntries(t.store_restock_requests.map((x) => [x.id, [x.status, x.auto_channel]]));
    expect(st).toMatchObject({ r1: ["notified", "email"], r2: ["pending", null], r3: ["pending", null], r4: ["notified", "email"], r5: ["pending", null], r6: ["notified", "line"], r7: ["pending", null] });
    expect(t.store_restock_requests.find((x) => x.id === "r7")?.notified_at).toBeNull();

    sent.length = 0;
    const again = await runRestockAlerts(sb, shop, on, "https://x.co");
    expect(again.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
