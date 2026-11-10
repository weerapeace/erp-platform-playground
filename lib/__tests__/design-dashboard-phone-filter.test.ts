import { describe, expect, it } from "vitest";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { buildStatusMeta } from "@/lib/design-sheets-meta";
import { passPhoneFilter } from "@/components/design-dashboard/dashboard-helpers";

// ตัวเลขสรุปบน Design Dashboard มือถือ + หน้า "วันนี้" ใช้กฎชุดเดียวกัน (2026-11-10)
const meta = buildStatusMeta([
  { state_key: "design", label: "ออกแบบ", is_terminal: false, color: null, sort_order: 1 },
  { state_key: "sku_created", label: "ตั้ง SKU แล้ว", is_terminal: true, color: null, sort_order: 2 },
  { state_key: "cancelled", label: "ยกเลิก", is_terminal: true, color: null, sort_order: 3 },
] as unknown as Parameters<typeof buildStatusMeta>[0]);
const ymd = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sheet = (p: Partial<DesignSheetListItem>): DesignSheetListItem => ({ id: "x", code: "DS-1", name: "งาน", status: "design", deadline: null, quote_latest: null, ...p } as DesignSheetListItem);

describe("passPhoneFilter", () => {
  it("เกินกำหนด = เลยวันส่ง (งานยังไม่ปิด)", () => {
    expect(passPhoneFilter(sheet({ deadline: ymd(-1) }), "overdue", meta)).toBe(true);
    expect(passPhoneFilter(sheet({ deadline: ymd(0) }), "overdue", meta)).toBe(false);
    expect(passPhoneFilter(sheet({ deadline: ymd(-5), status: "cancelled" }), "overdue", meta)).toBe(false);   // ยกเลิก = ปิดแล้ว ไม่นับ
  });
  it("ส่งใน 2 วัน = วันนี้ถึงอีก 2 วัน · 3–7 วัน แยกกลุ่ม", () => {
    expect(passPhoneFilter(sheet({ deadline: ymd(0) }), "due2", meta)).toBe(true);
    expect(passPhoneFilter(sheet({ deadline: ymd(2) }), "due2", meta)).toBe(true);
    expect(passPhoneFilter(sheet({ deadline: ymd(3) }), "due2", meta)).toBe(false);
    expect(passPhoneFilter(sheet({ deadline: ymd(3) }), "soon7", meta)).toBe(true);
    expect(passPhoneFilter(sheet({ deadline: ymd(8) }), "soon7", meta)).toBe(false);
  });
  it("รอลูกค้าตอบราคา = เสนอราคาครั้งล่าสุดยัง pending", () => {
    expect(passPhoneFilter(sheet({ quote_latest: { no: 1, date: null, status: "pending", cells: [] } }), "await_quote", meta)).toBe(true);
    expect(passPhoneFilter(sheet({ quote_latest: { no: 1, date: null, status: "passed", cells: [] } }), "await_quote", meta)).toBe(false);
    expect(passPhoneFilter(sheet({ quote_latest: { no: 1, date: null, status: "pending", cells: [] }, status: "sku_created" }), "await_quote", meta)).toBe(false);
  });
  it("ยังไม่ตั้งวันส่ง = ไม่มี deadline (งานยังไม่ปิด)", () => {
    expect(passPhoneFilter(sheet({}), "nodl", meta)).toBe(true);
    expect(passPhoneFilter(sheet({ deadline: ymd(1) }), "nodl", meta)).toBe(false);
    expect(passPhoneFilter(sheet({ status: "sku_created" }), "nodl", meta)).toBe(false);
  });
});
