import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Row } from "./fake-db";

// AI/ไฟล์ไม่เกี่ยวกับ test นี้ (ทดสอบแค่ส่วนจับกลุ่ม PO + ใส่ลงใบ)
vi.mock("@/lib/ai-caption", () => ({ chatJson: vi.fn() }));
vi.mock("@/lib/file-ref-server", () => ({ readFileRef: vi.fn() }));

import { loadShopGroups, applySellerBill, loadVoucherLite } from "@/lib/seller-bill";
import { aliasKey, normalizeBillLine, type SellerBillLine } from "@/lib/seller-bill-match";
import type { SupabaseClient } from "@supabase/supabase-js";

const P1 = "partner-b242", P2 = "partner-other";
let tables: Record<string, Row[]>;
const db = () => fakeDb(tables) as unknown as SupabaseClient;
const L = (o: Partial<SellerBillLine>) => normalizeBillLine(o as Record<string, unknown>);

beforeEach(() => {
  tables = {
    purchase_vouchers_v2: [
      { id: "V", status: "draft", seller_name: "ร้านอี้หลงเจียห่าว (B242)", seller_partner_id: P1, currency: "RMB", fx_rate: 5.2, ship_method: "none" },
      { id: "V2", status: "draft", seller_partner_id: P1, currency: "RMB" },
      { id: "V3", status: "cancelled", seller_partner_id: P1, currency: "RMB" },
    ],
    purchase_orders_v2: [
      { id: "po1", po_no: "PO-2026-00284", order_date: "2026-11-03", currency: "RMB", seller_partner_id: P1, status: "draft", is_active: true },
      { id: "po2", po_no: "PO-2026-00282", order_date: "2026-11-02", currency: "YUAN", seller_partner_id: P1, status: "draft", is_active: true },
      { id: "po3", po_no: "PO-2026-00300", order_date: "2026-11-03", currency: "RMB", seller_partner_id: P2, status: "draft", is_active: true },
      { id: "po4", po_no: "PO-2026-00301", order_date: "2026-11-03", currency: "THB", seller_partner_id: P1, status: "draft", is_active: true },
    ],
    purchase_order_lines_v2: [
      { id: "l1a", po_id: "po1", item_sku_id: "s1", item_name: "[A069-2/9MM#N] คอหมามาเวล 9 mm. สีเงิน", qty: 20, uom: "Units", price_est: 4.5, sort_order: 0, line_status: "draft", note: "จากใบสั่งผลิต MO-1" },
      { id: "l1b", po_id: "po1", item_sku_id: "s1", item_name: "[A069-2/9MM#N] คอหมามาเวล 9 mm. สีเงิน", qty: 20, uom: "Units", price_est: 4.5, sort_order: 1, line_status: "draft", note: "จากใบสั่งผลิต MO-2" },
      { id: "l1c", po_id: "po1", item_sku_id: "s1", item_name: "[A069-2/9MM#N] คอหมามาเวล 9 mm. สีเงิน", qty: 30, uom: "Units", price_est: 4.5, sort_order: 2, line_status: "draft", note: "จากใบสั่งผลิต MO-3" },
      { id: "l2", po_id: "po2", item_sku_id: "s2", item_name: "[A006-6/20MM#N] คอหมาก้นสี่เหลี่ยม 2 cm. สีนิเกิ้ล", qty: 280, uom: "Units", price_est: 2.5, sort_order: 0, line_status: "draft" },
      { id: "l2x", po_id: "po2", item_sku_id: "s3", item_name: "ห่วง (รับครบแล้ว)", qty: 10, price_est: 1, sort_order: 1, line_status: "received" },
      { id: "l3", po_id: "po3", item_sku_id: "s1", item_name: "คอหมามาเวล 9 mm. สีเงิน", qty: 99, price_est: 4.5, sort_order: 0, line_status: "draft" },
      { id: "l4", po_id: "po4", item_sku_id: "s1", item_name: "คอหมามาเวล 9 mm. สีเงิน", qty: 99, price_est: 30, sort_order: 0, line_status: "draft" },
    ],
    purchase_voucher_lines_v2: [
      { id: "x1", voucher_id: "V2", po_line_id: "l1a", qty: 20, is_active: true },   // ออกใบสำคัญใบอื่นไปแล้ว
      { id: "x2", voucher_id: "V3", po_line_id: "l1b", qty: 20, is_active: true },   // ใบที่ยกเลิก — ไม่นับ
    ],
    skus_v2: [
      { id: "s1", code: "A069-2/9MM#N", parent_skus_v2: { weight_g: 5 } },
      { id: "s2", code: "A006-6/20MM#N", parent_skus_v2: null },
    ],
    supplier_item_aliases: [],
  };
});

describe("บิลร้านจีน — รายการ PO ที่จับคู่ได้ (ร้านนี้เท่านั้น)", () => {
  it("เฉพาะ PO ร้านเดียวกัน + สกุลหยวน (RMB/YUAN) · บรรทัดรับครบไม่นับ · ค้าง = สั่ง − ออกใบอื่นแล้ว (ใบยกเลิกไม่นับ)", async () => {
    const v = (await loadVoucherLite(db(), "V"))!;
    const gs = await loadShopGroups(db(), v);
    expect(gs.map((g) => g.po_no).sort()).toEqual(["PO-2026-00282", "PO-2026-00284"]);
    const g1 = gs.find((g) => g.po_no === "PO-2026-00284")!;
    expect(g1.lines).toHaveLength(3);
    expect(g1.remaining).toBe(50);
    expect(g1.lines.map((l) => l.remaining)).toEqual([0, 20, 30]);
    expect(g1.item_name).toBe("คอหมามาเวล 9 mm. สีเงิน");
    expect(g1.code).toBe("A069-2/9MM#N");
  });
});

describe("บิลร้านจีน — ใส่ลงใบสำคัญ", () => {
  it("แบ่งจำนวนลงใบสั่งผลิตเก่าก่อน + ราคา ¥ จากบิล + ค่าใช้จ่าย + จำคู่ · กดซ้ำไม่เพิ่มซ้ำ", async () => {
    const v = (await loadVoucherLite(db(), "V"))!;
    const gs = await loadShopGroups(db(), v);
    const g1 = gs.find((g) => g.po_no === "PO-2026-00284")!;
    const lines = [
      L({ name_cn: "狗扣", spec_cn: "9mm 银色", name_th: "คอหมา 9 มม.", qty: 45, unit_price: 4.6, match_key: g1.key, level: "ok", decision: "confirmed" }),
      L({ name_cn: "运费", qty: 1, unit_price: 25, is_fee: true, level: "fee", decision: "expense" }),
      L({ name_cn: "日字扣", qty: 10, unit_price: 1, level: "no", decision: "skip" }),
    ];
    const r = await applySellerBill(db(), v, lines, { remember: true, actorName: "test", previousIds: [] });
    expect(r.inserted).toBe(2);
    expect(r.expenses).toBe(1);
    expect(r.remembered).toBe(1);
    const mine = () => tables.purchase_voucher_lines_v2.filter((l) => l.voucher_id === "V" && l.is_active !== false);
    expect(mine().filter((l) => l.po_line_id).map((l) => [l.po_line_id, l.qty, l.unit_price, l.price_source])).toEqual([["l1b", 20, 4.6, "bill"], ["l1c", 25, 4.6, "bill"]]);
    expect(mine().find((l) => !l.po_line_id)?.unit_price).toBe(25);
    expect(mine().find((l) => l.po_line_id === "l1b")?.kg_per_unit).toBe(0.005);
    expect(tables.supplier_item_aliases[0]).toMatchObject({ supplier_partner_id: P1, alias_key: aliasKey("狗扣", "9mm 银色"), item_sku_id: "s1", times_used: 1 });

    // กดใส่ซ้ำ (แก้จำนวนเป็น 30) → รายการเดิมของบิลนี้ถูกแทน ไม่บวกซ้ำ
    const again = r.lines.map((l, i) => (i === 0 ? { ...l, qty: 30 } : l));
    const r2 = await applySellerBill(db(), v, again, { remember: true, actorName: "test", previousIds: r.lines.flatMap((l) => l.voucher_line_ids) });
    expect(r2.inserted + r2.updated).toBeGreaterThan(0);
    expect(mine().filter((l) => l.po_line_id).reduce((a, l) => a + Number(l.qty), 0)).toBe(30);
    expect(mine()).toHaveLength(3);   // l1b 20 + l1c 10 + ค่าใช้จ่าย 1 (ชุดเก่าถูกถอดออกทั้งหมด)
    expect(tables.supplier_item_aliases).toHaveLength(1);
    expect(tables.supplier_item_aliases[0].times_used).toBe(2);
  });

  it("บรรทัดที่มาจากใบรับในใบนี้แล้ว → ใส่ราคาอย่างเดียว ไม่เพิ่มรายการ", async () => {
    tables.purchase_voucher_lines_v2.push({ id: "gr1", voucher_id: "V", po_id: "po2", po_line_id: "l2", gr_line_id: "grl-1", qty: 270, unit_price: 2.5, price_source: "po", is_active: true });
    const v = (await loadVoucherLite(db(), "V"))!;
    const g2 = (await loadShopGroups(db(), v)).find((g) => g.po_no === "PO-2026-00282")!;
    expect(g2.in_voucher).toBe(true);
    const r = await applySellerBill(db(), v, [L({ name_cn: "方底狗扣", qty: 280, unit_price: 2.6, match_key: g2.key, decision: "confirmed" })], { remember: false, actorName: null, previousIds: [] });
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(1);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "gr1")).toMatchObject({ qty: 270, unit_price: 2.6, price_source: "bill" });
  });

  it("จับกับของนอก PO ร้านนี้ = ไม่ยอม (ไม่เขียนอะไรเลย)", async () => {
    const v = (await loadVoucherLite(db(), "V"))!;
    const before = tables.purchase_voucher_lines_v2.length;
    await expect(applySellerBill(db(), v, [L({ name_cn: "x", qty: 5, unit_price: 1, match_key: "po3|s:s1", decision: "confirmed" })], { remember: true, actorName: null, previousIds: [] }))
      .rejects.toThrow(/ไม่อยู่ในใบสั่งซื้อของร้านนี้/);
    expect(tables.purchase_voucher_lines_v2.length).toBe(before);
  });
});
