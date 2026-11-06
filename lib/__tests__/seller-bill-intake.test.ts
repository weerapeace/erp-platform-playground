import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Row } from "./fake-db";

// AI จับคู่รายการจากข้อความ → ตอบให้แถว 0 = P1 (กลุ่มแรก)
const chatJson = vi.fn(async () => ({ picks: [{ i: 0, candidate: "P1", confidence: 0.9 }] }));
vi.mock("@/lib/paid-services-server", () => ({ aiChat: (_key: string, ...a: unknown[]) => chatJson(...(a as [])) }));   // ด่านกลาง AI (เดิม chatJson ใน ai-caption)
vi.mock("@/lib/file-ref-server", () => ({ readFileRef: vi.fn() }));

import { createVoucherFromSellerBill } from "@/lib/seller-bill-intake";
import { normalizeBillLine } from "@/lib/seller-bill-match";
import type { SupabaseClient } from "@supabase/supabase-js";

const P1 = "partner-b242";
let tables: Record<string, Row[]>;
const db = () => fakeDb(tables) as unknown as SupabaseClient;

beforeEach(() => {
  chatJson.mockClear();
  tables = {
    partners_v2: [{ id: P1, display_name: "ร้านอี้หลงเจียห่าว (B242)", company_name: null, phone: null, mobile: null, account_number: "6222021234560418", is_active: true }],
    purchase_vouchers_v2: [],
    purchase_orders_v2: [{ id: "po1", po_no: "PO-2026-00284", order_date: "2026-11-03", currency: "RMB", seller_partner_id: P1, status: "draft", is_active: true }],
    purchase_order_lines_v2: [{ id: "l1", po_id: "po1", item_sku_id: "s1", item_name: "[A069-2/9MM#N] คอหมามาเวล 9 mm. สีเงิน", qty: 300, qty_received: 0, uom: "Units", price_est: 4.5, sort_order: 0, line_status: "draft" }],
    purchase_voucher_lines_v2: [],
    purchase_delivery_bills: [],
    skus_v2: [{ id: "s1", code: "A069-2/9MM#N", parent_skus_v2: null }],
    supplier_item_aliases: [],
    freight_carriers: [],
    daily_rates: [{ rate: 5.2, rate_date: "2026-11-01", is_active: true }],
    audit_logs: [],
  };
});

describe("โยนรูปบิล → สร้างใบสำคัญจากบิลร้าน", () => {
  it("สร้างใบร่างของร้านที่ยืนยัน + บิลร้าน (หลายหน้า) + จับคู่รายการกับ PO ร้านนั้น + จำชื่อจีน/เบอร์ (ช่องว่าง) ไม่ทับบัญชีเดิม", async () => {
    const r = await createVoucherFromSellerBill(db(), {
      partner_id: P1, refs: ["sb:erp-files/supplier_bills/a.jpg", "sb:erp-files/supplier_bills/b.jpg"], currency: "CNY", bill_no: "20261102-018", bill_date: "2026-11-02",
      seller_text: "义隆嘉豪五金", seller_phone: "138 0000 6612", seller_account: "6222 9999 0000 1111", total_amount: 1350,
      lines: [normalizeBillLine({ name_cn: "狗扣", spec_cn: "9mm 银色", name_th: "คอหมา 9 มม.", spec_th: "สีเงิน", qty: 300, unit_price: 4.5, amount: 1350 })],
      remember_shop: true,
    }, { id: null, name: "test" });

    const v = tables.purchase_vouchers_v2.find((x) => x.id === r.voucher_id)!;
    expect(v).toMatchObject({ status: "draft", seller_partner_id: P1, seller_name: "ร้านอี้หลงเจียห่าว (B242)", currency: "RMB", voucher_date: "2026-11-02" });
    const bill = tables.purchase_delivery_bills[0];
    expect(bill).toMatchObject({ voucher_id: r.voucher_id, kind: "seller", r2_key: "sb:erp-files/supplier_bills/a.jpg", bill_no: "20261102-018", status: "parsed" });
    expect((bill.raw as Row).files).toEqual(["sb:erp-files/supplier_bills/a.jpg", "sb:erp-files/supplier_bills/b.jpg"]);
    const line = (bill.lines as Row[])[0];
    expect(line.match_key).toBe("po1|s:s1");
    expect(line.level).toBe("ok");
    expect(r.ok).toBe(1);
    expect(chatJson).toHaveBeenCalledTimes(1);   // จับคู่ด้วยข้อความ 1 ครั้ง (ไม่ส่งรูปซ้ำ)
    // จำร้าน: ชื่อจีน + เบอร์ (เดิมว่าง) · เลขบัญชีเดิมมีแล้วและไม่ตรง → ไม่ทับ
    const p = tables.partners_v2[0];
    expect(p.company_name).toBe("义隆嘉豪五金");
    expect(p.phone).toBe("138 0000 6612");
    expect(p.account_number).toBe("6222021234560418");
    expect(r.shop_filled).toEqual(["ชื่อจีน", "เบอร์"]);
  });

  it("ปิด จำร้าน = ไม่แตะทะเบียนร้าน · ร้านที่ไม่มีในทะเบียน = ไม่สร้างอะไรเลย", async () => {
    await createVoucherFromSellerBill(db(), { partner_id: P1, refs: ["sb:erp-files/supplier_bills/a.jpg"], seller_text: "义隆嘉豪五金", seller_phone: "13800006612", lines: [], remember_shop: false }, { id: null, name: null });
    expect(tables.partners_v2[0].company_name).toBeNull();
    const before = tables.purchase_vouchers_v2.length;
    await expect(createVoucherFromSellerBill(db(), { partner_id: "nope", refs: ["sb:x"], lines: [] }, { id: null, name: null })).rejects.toThrow(/ไม่พบร้าน/);
    expect(tables.purchase_vouchers_v2.length).toBe(before);
  });
});
