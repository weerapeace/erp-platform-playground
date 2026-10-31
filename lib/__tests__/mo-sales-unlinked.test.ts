import { describe, expect, it } from "vitest";

import type { SaleLine, SalesLinkRow } from "@/lib/mo-sales-match";
import { buildUnlinked, planLinks, type UnlinkedMo } from "@/lib/mo-sales-unlinked";

// ข้อมูลจริงจาก DB (2026-10-31) — ใบขายเซ็นทรัลทำ ที่ยังไม่ผูกใบงาน
const mo = (mo_no: string, sku: string, qty: number, created: string, stage: UnlinkedMo["stage"] = "wait"): UnlinkedMo =>
  ({ id: `id-${mo_no}`, mo_no, sku, qty, created_at: `${created}T03:00:00Z`, stage });
const line = (id: string, so: string, date: string, sku: string, qty: number): SaleLine =>
  ({ id, sale_id: `s-${so}`, so_number: so, date, customer: "เซ็นทรัลทำ", sku, qty });

const MOS = [
  mo("MO-2026-00276", "CTL113-01", 200, "2026-08-29"),
  mo("MO-2026-00218", "CTL075-03", 200, "2026-08-15", "work"),   // ผูกใบขายไว้แล้ว
  mo("MO-2026-00354", "CTL075-03", 500, "2026-09-17"),
  mo("MO-2026-00429", "CTL075-03", 100, "2026-10-17"),
  mo("MO-2026-00360", "CTL106-03", 2500, "2026-09-17"),
  mo("MO-2026-00406", "CTL106-03", 1500, "2026-10-10"),
];
const LINES = [
  line("l1", "ISG2569-10-029", "2026-10-30", "CTL113-01", 200),
  line("old", "ISG2569-08-001", "2026-08-20", "CTL075-03", 200),
  line("l2", "ISG2569-10-022", "2026-10-22", "CTL075-03", 250),
  line("l3", "ISG2569-10-028", "2026-10-28", "CTL075-03", 250),
  line("l4", "ISG2569-10-021", "2026-10-22", "CTL106-03", 1000),
  line("l5", "ISG2569-09-099", "2026-09-01", "PIX12-03", 5),
];
const LINKS: SalesLinkRow[] = [{ mo_id: "id-MO-2026-00218", sale_line_id: "old", qty: 200 }];
const { rows, stats } = buildUnlinked(MOS, LINES, LINKS);
const row = (id: string) => rows.find((r) => r.id === id)!;

describe("อัปเดตงานจากใบขาย — มองจากใบขาย", () => {
  it("บรรทัดที่ผูกครบแล้วไม่ขึ้น · เรียงใบขายใหม่ก่อน", () => {
    expect(rows.map((r) => r.id)).toEqual(["l1", "l3", "l2", "l4", "l5"]);
  });

  it("ตรงจำนวน: CTL113-01 ขาย 200 ↔ MO-00276 ผลิต 200", () => {
    expect(row("l1")).toMatchObject({ kind: "exact", suggest: [{ mo_no: "MO-2026-00276", qty: 200, mo_full: true }] });
  });

  it("2 ใบขายเติมใบงานเดียวให้ครบ: 10-022 (250) + 10-028 (250) = MO-00354 (500)", () => {
    expect(row("l2")).toMatchObject({ kind: "exact", suggest: [{ mo_no: "MO-2026-00354", qty: 250, mo_full: true }] });
    expect(row("l3").suggest[0]).toMatchObject({ mo_no: "MO-2026-00354", qty: 250, mo_full: true });
  });

  it("ใบที่ผูกใบขายไว้แล้วไม่อยู่ในตัวเลือก (API ผูกไม่รับ) · เลือกใบอื่นได้", () => {
    expect(row("l3").cands.map((c) => c.mo_no)).toEqual(["MO-2026-00354", "MO-2026-00429"]);
  });

  it("ขายน้อยกว่าที่ผลิต = ต้องเลือก: 1,000 จาก MO-00360 ที่ผลิต 2,500", () => {
    expect(row("l4")).toMatchObject({ kind: "part", suggest: [{ mo_no: "MO-2026-00360", qty: 1000, mo_qty: 2500, mo_full: false }] });
  });

  it("ไม่มีใบงานให้ผูก (ขายจากสต๊อก) · สรุปตัวเลข", () => {
    expect(row("l5")).toMatchObject({ kind: "none", cands: [] });
    expect(stats).toEqual({ lines: 5, bills: 5, exact: 3, part: 1, none: 1, mos_waiting: 3 });
  });

  it("แผนผูก: รวมทุกบรรทัดของใบงานเดียวเป็นครั้งเดียว · ไม่เกินที่ใบงานผลิต", () => {
    const pick = new Map([["l2", "MO-2026-00354"], ["l3", "MO-2026-00354"], ["l1", "MO-2026-00276"]]);
    expect(planLinks(rows, pick)).toEqual([
      { mo_no: "MO-2026-00276", parts: [{ sale_line_id: "l1", qty: 200 }] },
      { mo_no: "MO-2026-00354", parts: [{ sale_line_id: "l3", qty: 250 }, { sale_line_id: "l2", qty: 250 }] },
    ]);
    // เลือกใบเล็กแทน (MO-00429 ผลิต 100) → ผูกได้แค่ 100
    expect(planLinks(rows, new Map([["l3", "MO-2026-00429"]]))).toEqual([{ mo_no: "MO-2026-00429", parts: [{ sale_line_id: "l3", qty: 100 }] }]);
  });
});
