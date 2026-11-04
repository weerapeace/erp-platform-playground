import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Row } from "./fake-db";

// AI อ่านรูปบิล → 1 แถวตรง PO (P1) · ยอดรวมในบิลที่อ่านได้ ¥900
const chatJson = vi.fn(async () => ({ is_bill: true, seller_name: "义隆嘉豪五金", total_amount: 900, lines: [{ name_cn: "狗扣", spec_cn: "9mm 银色", name_th: "คอหมามาเวล 9 มม.", spec_th: "สีเงิน", qty: 200, unit_price: 4.5, amount: 900, candidate: "P1", confidence: 0.9 }] }));
vi.mock("@/lib/ai-caption", () => ({ chatJson: (...a: unknown[]) => chatJson(...(a as [])) }));
vi.mock("@/lib/file-ref-server", () => ({ readFileRef: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" })) }));

import { createVoucherFromChinaBill, listChinaBillsForVoucher } from "@/lib/china-bill-voucher";
import type { SupabaseClient } from "@supabase/supabase-js";

const P1 = "partner-b242";
let tables: Record<string, Row[]>;
const db = () => fakeDb(tables) as unknown as SupabaseClient;
const actor = { id: null, name: "test" };

beforeEach(() => {
  chatJson.mockClear();
  tables = {
    china_bills: [
      { id: "cb1", supplier_id: P1, amount_rmb: 1000, rate: 5.1, bill_date: "2026-11-03", status: "รอโอน", is_shipping: false, attachments: ["china-bills/x/a.jpg", "china-bills/x/b.jpg"], is_active: true },
      { id: "cb2", supplier_id: P1, amount_rmb: 900, rate: null, bill_date: "2026-11-03", status: "รอโอน", is_shipping: false, attachments: [], is_active: true },
      { id: "cb3", supplier_id: P1, amount_rmb: 50, rate: null, bill_date: "2026-11-03", status: "รอโอน", is_shipping: false, attachments: [], is_active: true },
      { id: "cb4", supplier_id: null, amount_rmb: 3000, status: "โอนแล้ว", is_shipping: true, attachments: [], is_active: true },
      { id: "cb5", supplier_id: P1, amount_rmb: 70, status: "ยกเลิก", is_shipping: false, attachments: [], is_active: true },
    ],
    china_bill_po_links: [{ id: "k1", bill_id: "cb2", po_id: "po1", is_active: true }],
    partners_v2: [{ id: P1, display_name: "ร้านอี้หลงเจียห่าว (B242)", is_active: true }],
    purchase_vouchers_v2: [],
    purchase_orders_v2: [{ id: "po1", po_no: "PO-2026-00284", order_date: "2026-11-03", currency: "RMB", seller_partner_id: P1, status: "draft", is_active: true }],
    purchase_order_lines_v2: [{ id: "l1", po_id: "po1", item_sku_id: "s1", item_name: "[A069-2/9MM#N] คอหมามาเวล 9 mm. สีเงิน", qty: 200, uom: "Units", price_est: 4.5, sort_order: 0, line_status: "draft" }],
    purchase_voucher_lines_v2: [],
    purchase_delivery_bills: [],
    skus_v2: [{ id: "s1", code: "A069-2/9MM#N", parent_skus_v2: null }],
    supplier_item_aliases: [],
    freight_carriers: [],
    daily_rates: [{ rate: 5.2, rate_date: "2026-11-01", is_active: true }],
    audit_logs: [],
  };
});

describe("ออกใบสำคัญจากบิลโอนเงินจีน", () => {
  it("มีรูปบิล → AI อ่าน (หลายหน้า) + จับคู่ PO ร้านนั้น · ร้าน/สกุล/วันที่/เรท จากบิลโอน · ผูก china_bill_id · ยอดไม่ตรง = เตือน", async () => {
    const r = await createVoucherFromChinaBill(db(), "cb1", { blankIfNone: false, actor });
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.mode).toBe("ai");
    expect(r.ok).toBe(1);
    expect(r.total_warn).toContain("≠ บิลโอน ¥1,000");
    const v = tables.purchase_vouchers_v2.find((x) => x.id === r.voucher_id)!;
    expect(v).toMatchObject({ seller_partner_id: P1, currency: "RMB", voucher_date: "2026-11-03", fx_rate: 5.1, china_bill_id: "cb1" });
    expect(String(v.note)).toContain("⚠ ยอดที่อ่านได้");
    const bill = tables.purchase_delivery_bills[0];
    expect(bill).toMatchObject({ voucher_id: r.voucher_id, kind: "seller", r2_key: "china-bills/x/a.jpg" });
    expect((bill.raw as Row).files).toEqual(["china-bills/x/a.jpg", "china-bills/x/b.jpg"]);
    expect(chatJson).toHaveBeenCalledTimes(1);
  });

  it("ไม่มีรูปแต่มี PO ผูก → ใส่บรรทัด PO นั้น (จำนวนที่ค้าง · ราคา PO) · ยอดตรงไม่เตือน", async () => {
    const r = await createVoucherFromChinaBill(db(), "cb2", { blankIfNone: false, actor });
    expect(r.status === "created" && r.mode).toBe("po");
    expect(r.status === "created" && r.total_warn).toBeNull();
    const lines = tables.purchase_voucher_lines_v2.filter((l) => r.status === "created" && l.voucher_id === r.voucher_id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ po_line_id: "l1", po_no: "PO-2026-00284", qty: 200, unit_price: 4.5, price_source: "po" });
    expect(chatJson).not.toHaveBeenCalled();
  });

  it("ไม่มีรูปและไม่มี PO → ข้าม (ไม่สร้างอะไร) หรือ ใบเปล่า ถ้าเลือก", async () => {
    const skip = await createVoucherFromChinaBill(db(), "cb3", { blankIfNone: false, actor });
    expect(skip.status).toBe("skipped");
    expect(tables.purchase_vouchers_v2).toHaveLength(0);
    const made = await createVoucherFromChinaBill(db(), "cb3", { blankIfNone: true, actor });
    expect(made.status === "created" && made.mode).toBe("blank");
  });

  it("ออกซ้ำไม่ได้ · บิลค่าส่ง / บิลยกเลิก ไม่ได้ · รายการไม่โชว์บิลยกเลิก และบอกใบที่ออกแล้ว", async () => {
    await createVoucherFromChinaBill(db(), "cb2", { blankIfNone: false, actor });
    await expect(createVoucherFromChinaBill(db(), "cb2", { blankIfNone: false, actor })).rejects.toThrow(/ออกใบสำคัญแล้ว/);
    await expect(createVoucherFromChinaBill(db(), "cb4", { blankIfNone: true, actor })).rejects.toThrow(/บิลค่าส่ง/);
    await expect(createVoucherFromChinaBill(db(), "cb5", { blankIfNone: true, actor })).rejects.toThrow(/ยกเลิก/);
    const list = await listChinaBillsForVoucher(db());
    expect(list.map((b) => b.id).sort()).toEqual(["cb1", "cb2", "cb3", "cb4"]);
    const cb2 = list.find((b) => b.id === "cb2")!;
    expect(cb2.voucher?.status).toBe("draft");
    expect(cb2.po_links[0].po_no).toBe("PO-2026-00284");
    expect(list.find((b) => b.id === "cb1")!.files).toBe(2);
  });
});
