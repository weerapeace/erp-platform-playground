import { describe, it, expect } from "vitest";
import { diffVoucherSnapshots, mergePriceSnapshots, voucherEditable } from "@/lib/voucher-revision";
import type { PriceSnapshot } from "@/lib/po-line-price";

const snap = (po: number | null, written: number | null, extra: Partial<PriceSnapshot> = {}): PriceSnapshot => ({
  item_name: "กล่อง 13x10", po_line_id: "pl1", po_price_before: po, sku_id: "s1", sku_before: null, supplier_item_id: null, partner_id: null, supplier_price_before: null,
  written: { po_price: written, rmb_cost: null, standard_price: null, supplier_price: written }, ...extra,
});

describe("voucher-revision", () => {
  it("แก้ได้: ร่าง / ยืนยันแล้วที่เปิดแก้ · ยืนยันเฉย ๆ / ยกเลิก = ไม่ได้", () => {
    expect(voucherEditable({ status: "draft" })).toBe(true);
    expect(voucherEditable({ status: "confirmed", editing_at: "2026-11-15T10:00:00Z" })).toBe(true);
    expect(voucherEditable({ status: "confirmed", editing_at: null })).toBe(false);
    expect(voucherEditable({ status: "cancelled", editing_at: "x" })).toBe(false);
    expect(voucherEditable(null)).toBe(false);
  });
  it("เทียบเวอร์ชัน: หัวใบ + ราคาบรรทัด + เพิ่ม/ลบรายการ · ไม่เปลี่ยน = ไม่โชว์", () => {
    const a = { header: { fx_rate: 5.2, grand_total_thb: 43628, note: null }, lines: [{ id: "1", item_name: "[A1] กล่อง 13x10", qty: 1000, unit_price: 1.8 }, { id: "2", item_name: "การ์ด", qty: 5, unit_price: 0.2 }] };
    const b = { header: { fx_rate: 5.18, grand_total_thb: 43108, note: "" }, lines: [{ id: "1", item_name: "[A1] กล่อง 13x10", qty: 1000, unit_price: 1.7 }, { id: "3", item_name: "ค่ากล่อง", qty: 1, unit_price: 20 }] };
    const d = diffVoucherSnapshots(a, b);
    expect(d).toContainEqual({ label: "เรท", before: "5.2", after: "5.18" });
    expect(d).toContainEqual({ label: "กล่อง 13x10 · ราคา", before: "1.8", after: "1.7" });
    expect(d.find((x) => x.label.startsWith("เพิ่มรายการ"))?.label).toBe("เพิ่มรายการ: ค่ากล่อง");
    expect(d.find((x) => x.label.startsWith("ลบรายการ"))?.before).toBe("5 × 0.2");
    expect(d.some((x) => x.label === "หมายเหตุ")).toBe(false);   // null กับ "" = เหมือนกัน
    expect(diffVoucherSnapshots(a, a)).toEqual([]);
  });
  it("รวมราคาก่อนเขียนทับ: ค่าเดิมจากตอนยืนยัน · ค่าที่เขียนจากการแก้ครั้งล่าสุด · รอบหลังไม่ได้เขียน = คงของเดิม", () => {
    const confirm = [snap(2.0, 1.8)];
    const edit = [snap(1.8, 1.7, { written: { po_price: 1.7, rmb_cost: null, standard_price: null, supplier_price: null } }), snap(null, 0.5, { po_line_id: "pl2", item_name: "ใหม่" })];
    const m = mergePriceSnapshots([confirm, edit]);
    expect(m).toHaveLength(2);
    expect(m[0].po_price_before).toBe(2.0);
    expect(m[0].written.po_price).toBe(1.7);
    expect(m[0].written.supplier_price).toBe(1.8);
    expect(m[1].po_line_id).toBe("pl2");
  });
});

describe("voucher-revision — เลขใบตามวันที่ (★ 2026-11-15 แบบ ก.)", () => {
  it("อ่านวันที่จากเลข · เลขไม่ตรงวันที่ใบ/เลขแบบเก่า = ควรเปลี่ยน", async () => {
    const { pvNoDate, pvNoNeedsRenumber } = await import("@/lib/voucher-revision");
    expect(pvNoDate("PV2026-10-05-001")).toBe("2026-10-05");
    expect(pvNoDate("PV-2026-00002")).toBeNull();
    expect(pvNoNeedsRenumber("PV2020-10-10-001", "2026-10-05")).toBe(true);
    expect(pvNoNeedsRenumber("PV2026-10-05-001", "2026-10-05")).toBe(false);
    expect(pvNoNeedsRenumber("PV-2026-00002", "2026-11-05")).toBe(true);
    expect(pvNoNeedsRenumber(null, "2026-11-05")).toBe(false);
  });
  it("เลขใบเปลี่ยน = ขึ้นในรายการสิ่งที่เปลี่ยน", () => {
    const d = diffVoucherSnapshots({ header: { pv_no: "PV2020-10-10-001" }, lines: [] }, { header: { pv_no: "PV2026-10-05-001" }, lines: [] });
    expect(d).toContainEqual({ label: "เลขใบ", before: "PV2020-10-10-001", after: "PV2026-10-05-001" });
  });
});
