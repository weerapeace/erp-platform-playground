import { describe, expect, it } from "vitest";
import { buildSchedule, isLineCustomerPage, lineDueOf, orderStageOf, thaiToday, type CustomerOrder } from "@/lib/line-customer-view";
import { DEFAULT_COMPANY_LAYOUT, companyReplyText, liffPageLink, richMenuBody } from "@/lib/line-company";

const line = (over: Partial<CustomerOrder["lines"][number]>): CustomerOrder["lines"][number] => ({
  id: "l", product: "กระเป๋า", sku: "A1", qty: 10, unit: "ใบ", image_url: null, stage: 2, shipped: 0, ship: "none", due_date: "2026-11-30", due_approx: false, ...over,
});

describe("ไลน์บริษัท รอบ 4 — หน้าเล็กลูกค้า", () => {
  it("รู้จักแค่ 2 หน้า", () => {
    expect(isLineCustomerPage("orders")).toBe(true);
    expect(isLineCustomerPage("schedule")).toBe(true);
    expect(isLineCustomerPage("payslip")).toBe(false);
  });

  it("วันนัดส่ง: รายการ → หัวใบ → ใบสั่งผลิตช้าสุด (ประมาณ)", () => {
    expect(lineDueOf("2026-12-01", "2026-11-01", ["2026-10-01"])).toEqual({ due_date: "2026-12-01", due_approx: false });
    expect(lineDueOf(null, "2026-11-01T00:00:00", [])).toEqual({ due_date: "2026-11-01", due_approx: false });
    expect(lineDueOf(null, null, ["2026-10-05", null, "2026-10-20"])).toEqual({ due_date: "2026-10-20", due_approx: true });
    expect(lineDueOf(null, null, [null])).toEqual({ due_date: null, due_approx: false });
  });

  it("ขั้นทั้งใบ = รายการที่ช้าสุด", () => {
    expect(orderStageOf([{ stage: 4 }, { stage: 1 }, { stage: 3 }])).toBe(1);
    expect(orderStageOf([])).toBe(0);
  });

  it("ตารางส่งงาน: ข้ามที่ส่งแล้ว · ไม่มีวันนัดนับแยก · เลยนัดติดธง · เรียงตามวัน", () => {
    const o: CustomerOrder = { id: "o", order_no: "SO-1", customer_po_no: null, order_date: null, shipped: false, stage: 1, lines: [
      line({ id: "a", due_date: "2026-12-05", shipped: 4 }),
      line({ id: "b", due_date: "2026-11-01" }),
      line({ id: "c", stage: 4, ship: "full" }),
      line({ id: "d", due_date: null }),
    ] };
    const s = buildSchedule([o], "2026-11-22");
    expect(s.items.map((i) => i.key)).toEqual(["o:b", "o:a"]);
    expect(s.items[0].late).toBe(true);
    expect(s.items[1].qty_left).toBe(6);
    expect(s.no_date).toBe(1);
  });

  it("ไม่มีราคาในผลลัพธ์", () => {
    const s = buildSchedule([{ id: "o", order_no: "SO", customer_po_no: null, order_date: null, shipped: false, stage: 2, lines: [line({})] }], "2026-11-01");
    expect(JSON.stringify(s)).not.toMatch(/price|amount|total|cost/i);
  });

  it("วันนี้ตามเวลาไทย", () => {
    expect(thaiToday(new Date("2026-11-21T18:30:00Z"))).toBe("2026-11-22");
  });

  it("ปุ่มลูกค้า สถานะงาน/ตารางส่งงาน = เปิดหน้าเล็ก · เมนูเก่าตอบลิงก์", () => {
    const b = richMenuBody("customer", DEFAULT_COMPANY_LAYOUT, { liffId: "L" }) as { areas: { action: { type: string; uri?: string } }[] };
    expect(b.areas.filter((a) => a.action.type === "uri").map((a) => a.action.uri)).toEqual([liffPageLink("L", "orders"), liffPageLink("L", "schedule")]);
    expect(companyReplyText("customer", "orders", null, "L")).toContain("?me=orders");
  });
});
