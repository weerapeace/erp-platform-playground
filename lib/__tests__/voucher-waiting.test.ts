import { describe, it, expect } from "vitest";
import { countWaitingByVoucher, poLineWaiting, type WaitPoLine } from "@/lib/voucher-waiting";

const pl = (id: string, po: string, o: Partial<WaitPoLine> = {}): WaitPoLine => ({ id, po_id: po, qty: 10, qty_received: 0, line_status: null, is_active: true, ...o });

describe("voucher-waiting — ป้าย รอของ (★ 2026-11-16)", () => {
  it("บรรทัดรอของ = ยังไม่รับครบ · ไม่ได้ปิด · ยังไม่อยู่ในใบสำคัญใบไหน", () => {
    const billed = new Set(["inV"]);
    expect(poLineWaiting(pl("a", "P"), billed)).toBe(true);
    expect(poLineWaiting(pl("inV", "P"), billed)).toBe(false);                       // อยู่ในใบสำคัญแล้ว
    expect(poLineWaiting(pl("b", "P", { qty_received: 10 }), billed)).toBe(false);   // รับครบ
    expect(poLineWaiting(pl("c", "P", { line_status: "closed_short" }), billed)).toBe(false);   // ปิดยอดแล้ว
    expect(poLineWaiting(pl("d", "P", { is_active: false }), billed)).toBe(false);
    expect(poLineWaiting(pl("e", "P", { qty: "5", qty_received: "4" }), billed)).toBe(true);    // รับบางส่วน = ยังรอ
  });
  it("นับต่อใบจาก PO ที่ใบอ้างถึง · PO ที่ปิดแล้วไม่นับ · ใบที่ไม่มีของรอ = ไม่อยู่ในผล", () => {
    const vLines = [{ voucher_id: "V1", po_id: "P1" }, { voucher_id: "V1", po_id: "P1" }, { voucher_id: "V1", po_id: "P2" }, { voucher_id: "V2", po_id: "P3" }, { voucher_id: "V3", po_id: null }];
    const poLines = [pl("x1", "P1"), pl("x2", "P1"), pl("x3", "P1"), pl("y1", "P2"), pl("z1", "P3", { qty_received: 10 })];
    const billed = new Set(["x1"]);
    const m = countWaitingByVoucher(vLines, poLines, billed, new Set(["P1", "P2", "P3"]));
    expect(m.get("V1")).toBe(3);            // x2 x3 (P1) + y1 (P2)
    expect(m.has("V2")).toBe(false);        // รับครบแล้ว
    expect(m.has("V3")).toBe(false);
    expect(countWaitingByVoucher(vLines, poLines, billed, new Set(["P1"])).get("V1")).toBe(2);   // P2 ปิดแล้ว
  });
});
