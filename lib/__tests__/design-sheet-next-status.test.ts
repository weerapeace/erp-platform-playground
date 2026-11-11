import { describe, expect, it } from "vitest";
import { buildStatusMeta, nextOpenStatus, type WfStatusRow } from "@/lib/design-sheets-meta";

// สถานะจริงใน DB (erp_workflow_states · design_sheet · ตรวจ 2026-11-11) เรียงตาม sort_order
const ROWS: WfStatusRow[] = [
  { state_key: "design", label: "ออกแบบ", color: "slate", is_terminal: false },
  { state_key: "revising", label: "กำลังทำตัวอย่าง/แก้ไขตาม Comment", color: "amber", is_terminal: false },
  { state_key: "quoted", label: "รอส่งลูกค้า", color: "blue", is_terminal: false, customer_only: true },
  { state_key: "sent_customer", label: "ส่งลูกค้าดู", color: "violet", is_terminal: false, customer_only: true },
  { state_key: "approved", label: "อนุมัติ", color: "emerald", is_terminal: false, customer_only: true },
  { state_key: "sku_created", label: "ตั้ง SKU แล้ว", color: "emerald", is_terminal: true },
  { state_key: "cancelled", label: "ยกเลิก", color: "rose", is_terminal: true },
  { state_key: "state_8", label: "ทำตัวอย่างใบเดียว", color: "slate", is_terminal: true },
];
const meta = buildStatusMeta(ROWS);
const next = (own: boolean, cur: string | null) => nextOpenStatus(meta, own, cur)?.[0] ?? null;

describe("nextOpenStatus — ปุ่ม ส่งต่อ บนมือถือ", () => {
  it("งานลูกค้า: เดินตามลำดับ workflow", () => {
    expect(next(false, "design")).toBe("revising");
    expect(next(false, "revising")).toBe("quoted");
    expect(next(false, "quoted")).toBe("sent_customer");
    expect(next(false, "sent_customer")).toBe("approved");
  });
  it("แบรนด์เรา: ข้ามสถานะเฉพาะงานลูกค้า", () => {
    expect(next(true, "design")).toBe("revising");
  });
  it("ไม่แนะนำสถานะปิดงานเด็ดขาด (ตั้ง SKU / ยกเลิก / ทำตัวอย่างใบเดียว)", () => {
    expect(next(false, "approved")).toBeNull();
    expect(next(true, "revising")).toBeNull();
    for (const k of ["sku_created", "cancelled", "state_8"]) expect(next(false, k)).toBeNull();
  });
  it("สถานะไม่รู้จัก / ไม่มีสถานะ = ไม่แนะนำ", () => {
    expect(next(false, "unknown_key")).toBeNull();
    expect(next(false, null)).toBeNull();
  });
});
