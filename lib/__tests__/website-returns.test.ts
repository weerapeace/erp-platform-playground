import { describe, it, expect } from "vitest";
import { cleanReturnInput, returnDeadline } from "../website-returns";
import { decideReturn, returnPageData, submitReturn } from "../website-returns-server";
import { fakeDb, type Row } from "./fake-db";

/** ↩️ ขอคืน/เปลี่ยนสินค้า (ชุด 4 · 2026-10-22) */
type Db = Parameters<typeof returnPageData>[0];
const SHOP = "shop-1";
const ORDER = "o-1";
const ITEM = "aaaaaaaa-0000-0000-0000-000000000001";

describe("📅 กำหนดวันขอคืน", () => {
  it("นับจากวันสำเร็จ · ยังไม่สำเร็จ (ส่งแล้ว) = วันสั่ง + 7 · ยังไม่ส่ง = ขอไม่ได้", () => {
    expect(returnDeadline({ status: "completed", created_at: "2026-10-01T00:00:00Z", completed_at: "2026-10-05T00:00:00Z" }, 14)?.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(returnDeadline({ status: "shipped", created_at: "2026-10-01T00:00:00Z" }, 14)?.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(returnDeadline({ status: "pending", created_at: "2026-10-01T00:00:00Z" }, 14)).toBeNull();
    expect(returnDeadline({ status: "cancelled", created_at: "2026-10-01T00:00:00Z" }, 14)).toBeNull();
  });
});

describe("📝 ตรวจคำขอ", () => {
  it("ต้องมีเหตุผล + อย่างน้อย 1 ชิ้น · อื่น ๆ ต้องเล่ารายละเอียด", () => {
    expect(cleanReturnInput({ kind: "exchange", reason: "size", items: [{ itemId: ITEM, qty: 1 }] })).toMatchObject({ ok: true, value: { kind: "exchange", reason: "size" } });
    expect(cleanReturnInput({ reason: "size", items: [] })).toMatchObject({ ok: false });
    expect(cleanReturnInput({ reason: "nope", items: [{ itemId: ITEM, qty: 1 }] })).toMatchObject({ ok: false });
    expect(cleanReturnInput({ reason: "other", detail: "", items: [{ itemId: ITEM, qty: 1 }] })).toMatchObject({ ok: false });
  });
});

function setup(o: { status?: string; completedAt?: string | null; enabled?: boolean; existing?: string } = {}) {
  const now = new Date();
  const tables: Record<string, Row[]> = {
    store_settings: [
      { shop_id: SHOP, key: "returns_enabled", value: o.enabled === false ? "0" : "1" },
      { shop_id: SHOP, key: "returns_days", value: "14" },
    ],
    store_orders: [{ id: ORDER, shop_id: SHOP, order_no: "LM-0001", customer_name: "อร", status: o.status ?? "completed", created_at: new Date(now.getTime() - 5 * 864e5).toISOString(), completed_at: o.completedAt === undefined ? new Date(now.getTime() - 2 * 864e5).toISOString() : o.completedAt }],
    store_order_items: [{ id: ITEM, order_id: ORDER, name: "กระเป๋า", variant_label: "ดำ", qty: 2 }],
    store_return_requests: o.existing ? [{ id: "r-old", order_id: ORDER, shop_id: SHOP, status: o.existing, kind: "return", created_at: now.toISOString(), staff_note: null }] : [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}
const input = { kind: "exchange" as const, reason: "size" as const, detail: "", items: [{ itemId: ITEM, qty: 5 }] };

describe("📮 ส่งคำขอ (submitReturn)", () => {
  it("ภายในกำหนด = บันทึก (จำนวนไม่เกินที่ซื้อ) + audit", async () => {
    const { db, tables } = setup();
    const r = await submitReturn(db, ORDER, input, [], "th");
    expect(r.ok).toBe(true);
    expect(tables.store_return_requests[0]).toMatchObject({ order_id: ORDER, kind: "exchange", reason: "size", items: [{ itemId: ITEM, name: "กระเป๋า", variant: "ดำ", qty: 2 }] });
    expect(tables.audit_logs?.length).toBe(1);
  });
  it("มีคำขอเปิดอยู่ / เลยกำหนด / ร้านปิด / ชิ้นไม่อยู่ในออเดอร์ = ไม่รับ", async () => {
    expect((await submitReturn(setup({ existing: "pending" }).db, ORDER, input, [], "th")).ok).toBe(false);
    expect((await submitReturn(setup({ completedAt: new Date(Date.now() - 20 * 864e5).toISOString() }).db, ORDER, input, [], "th")).ok).toBe(false);
    expect((await submitReturn(setup({ enabled: false }).db, ORDER, input, [], "th")).ok).toBe(false);
    expect((await submitReturn(setup().db, ORDER, { ...input, items: [{ itemId: "bbbbbbbb-0000-0000-0000-000000000009", qty: 1 }] }, [], "th")).ok).toBe(false);
    // ไม่อนุมัติไปแล้ว = ขอใหม่ได้
    expect((await submitReturn(setup({ existing: "rejected" }).db, ORDER, input, [], "th")).ok).toBe(true);
  });
});

describe("🛠 ร้านเปลี่ยนสถานะ (decideReturn)", () => {
  it("เดินตามลำดับที่อนุญาตเท่านั้น", async () => {
    const { db, tables } = setup({ existing: "pending" });
    expect(await decideReturn(db, "r-old", "closed", "", { id: null, name: "staff" })).toMatchObject({ ok: false, status: 409 });
    expect(await decideReturn(db, "r-old", "approved", "ส่งกลับที่ร้าน", { id: null, name: "staff" })).toEqual({ ok: true });
    expect(tables.store_return_requests[0]).toMatchObject({ status: "approved", staff_note: "ส่งกลับที่ร้าน", decided_by_name: "staff" });
    expect(await decideReturn(db, "r-old", "received", "", { id: null, name: "staff" })).toEqual({ ok: true });
    expect(await decideReturn(db, "r-old", "pending", "", { id: null, name: "staff" })).toMatchObject({ ok: false });
  });
});
