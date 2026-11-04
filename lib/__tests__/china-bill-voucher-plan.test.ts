import { describe, it, expect } from "vitest";
import { latinNameOverlap } from "@/lib/china-bill-voucher";
import { billPlan, durationLabel, planSummary, type PlanBill } from "@/lib/china-bill-voucher-plan";

const b = (o: Partial<PlanBill & { id: string }> = {}): PlanBill & { id: string } => ({
  id: "b1", files: 0, po_links: [], is_shipping: false, supplier_id: "s1", voucher: null, amount_rmb: 100, open_pos: 5, similar: null, ...o,
});

describe("china-bill-voucher-plan", () => {
  it("กติกาเดียวกับตอนสร้าง: รูป → AI · PO ผูก → ใส่ PO · ไม่มี → ใบเปล่า/ข้าม", () => {
    expect(billPlan(b({ files: 2, po_links: [{ po_id: "p" }] }), false).kind).toBe("ai");
    expect(billPlan(b({ po_links: [{ po_id: "p" }] }), false).kind).toBe("po");
    expect(billPlan(b(), true).kind).toBe("blank");
    expect(billPlan(b(), false).kind).toBe("skip");
  });
  it("สร้างไม่ได้: ออกแล้ว / บิลค่าส่ง / ยังไม่ผูกร้าน", () => {
    expect(billPlan(b({ voucher: { id: "v" } }), true).kind).toBe("blocked");
    expect(billPlan(b({ is_shipping: true }), true).kind).toBe("blocked");
    expect(billPlan(b({ supplier_id: null }), true).kind).toBe("blocked");
  });
  it("AI แต่ร้านไม่มีใบค้าง = เตือน + บอกร้านชื่อคล้าย", () => {
    const p = billPlan(b({ files: 1, open_pos: 0, similar: { name: "LONG TAI HANG (ร้าน PU ใหม่)", open_pos: 3 } }), false);
    expect(p.kind).toBe("ai");
    expect(p.warn).toContain("ไม่มีใบสั่งซื้อค้าง");
    expect(p.warn).toContain("LONG TAI HANG (ร้าน PU ใหม่)");
    expect(billPlan(b({ files: 1, open_pos: 4 }), false).warn).toBeNull();
  });
  it("สรุปชุด: นับแต่ละแบบ ยอดที่จะสร้าง และเวลาโดยประมาณ", () => {
    const bills = [b({ id: "a", files: 2, amount_rmb: 1284 }), b({ id: "c", files: 1, amount_rmb: 256, open_pos: 0 }), b({ id: "d", amount_rmb: 15076 })];
    const s = planSummary(bills, () => false);
    expect(s).toMatchObject({ ai: 2, skip: 1, make: 2, files: 3, amount_make: 1540, amount_all: 16616 });
    expect(planSummary(bills, (id) => id === "d").make).toBe(3);
    expect(durationLabel(s.seconds)).toBe("ประมาณ 1 นาที");
    expect(durationLabel(0)).toBe("");
  });
});

describe("latinNameOverlap (ร้านชื่อคล้ายภาษาอังกฤษ)", () => {
  it("ชื่ออังกฤษชุดเดียวกัน = ใช่ · คำเดียว/ไม่มีอังกฤษ = ไม่นับ", () => {
    expect(latinNameOverlap("ร้านผ้า LONG TAI HANG", "LONG TAI HANG (ร้าน PU ใหม่)")).toBe(true);
    expect(latinNameOverlap("ร้านผ้า YIJUN FFB02", "YIJUN SPEACIAL MATERIALS")).toBe(false);
    expect(latinNameOverlap("ร้านซิป ISG", "ร้านหมุด")).toBe(false);
  });
});
