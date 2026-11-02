import { describe, expect, it } from "vitest";

import type { SaleLine, SalesLinkRow } from "@/lib/mo-sales-match";
import { buildUnlinked, type UnlinkedMo } from "@/lib/mo-sales-unlinked";
import { buildSalesPrint, salesPrintDefaults, salesPrintRowsLinked, salesPrintRowsOpen } from "@/lib/mo-sales-print";
import { renderListTable, LIST_GROUP_ROW } from "@/lib/list-print";

// ข้อมูลแบบเดียวกับเทสต์ mo-sales-unlinked (ใบขายเซ็นทรัลทำ)
const mo = (mo_no: string, sku: string, qty: number, created: string, stage: UnlinkedMo["stage"] = "wait"): UnlinkedMo =>
  ({ id: `id-${mo_no}`, mo_no, sku, qty, created_at: `${created}T03:00:00Z`, stage });
const line = (id: string, so: string, date: string, sku: string, qty: number): SaleLine =>
  ({ id, sale_id: `s-${so}`, so_number: so, date, customer: "เซ็นทรัลทำ", sku, qty });
const MOS = [
  mo("MO-2026-00276", "CTL113-01", 200, "2026-08-29"),
  mo("MO-2026-00218", "CTL075-03", 200, "2026-08-15", "ship"),
  mo("MO-2026-00354", "CTL075-03", 500, "2026-09-17"),
  mo("MO-2026-00429", "CTL075-03", 100, "2026-10-17"),
  mo("MO-2026-00360", "CTL106-03", 2500, "2026-09-17"),
];
const LINES = [
  line("l1", "ISG2569-10-029", "2026-10-30", "CTL113-01", 200),
  line("old", "ISG2569-08-001", "2026-08-20", "CTL075-03", 200),
  line("l2", "ISG2569-10-022", "2026-10-22", "CTL075-03", 250),
  line("l3", "ISG2569-10-028", "2026-10-28", "CTL075-03", 250),
  line("l4", "ISG2569-10-021", "2026-10-22", "CTL106-03", 1000),
];
const LINKS: SalesLinkRow[] = [{ mo_id: "id-MO-2026-00218", sale_line_id: "old", qty: 200 }];
const { rows, linked } = buildUnlinked(MOS, LINES, LINKS);

describe("ใบพิมพ์สรุปจับคู่ใบขาย → ใบงาน", () => {
  // l1 ตามระบบ (ตรงจำนวน) · l2 ตามระบบ (รวมกับ 10-028) · l3 เลือกเองเป็นใบเล็ก 00429 · l4 ระบบเสนอแต่ไม่ครบ · l5 ไม่ติ๊ก
  const picks = new Map([["l1", "MO-2026-00276"], ["l2", "MO-2026-00354"], ["l3", "MO-2026-00429"], ["l4", "MO-2026-00360"]]);
  const sel = new Set(["l1", "l2", "l3", "l4"]);
  const pr = salesPrintRowsOpen(rows, picks, sel);
  const by = (id: string) => pr.find((r) => r.line_id === id)!;

  it("เฉพาะบรรทัดที่ติ๊ก · จับคู่ตามที่เลือกอยู่ · บอกว่าระบบเสนอใบไหนเมื่อเลือกเอง", () => {
    expect(pr).toHaveLength(4);
    expect(by("l1")).toMatchObject({ mo_no: "MO-2026-00276", match: "exact", qty: 200, suggested: null });
    expect(by("l2")).toMatchObject({ match: "exact", notes: ["รวมกับใบขายอื่นครบ 500"] });
    expect(by("l3")).toMatchObject({ mo_no: "MO-2026-00429", match: "pick", suggested: "MO-2026-00354", qty: 100, notes: ["ผูกได้ 100 จาก 250"] });
    expect(by("l4")).toMatchObject({ match: "suggest", qty: 1000, notes: ["ใบงานได้ใบขายแค่ 1,000/2,500"] });
  });

  it("เลือกใบที่ผูกใบขายอื่นอยู่ = หมายเหตุถอดของเดิม", () => {
    const x = salesPrintRowsOpen(rows, new Map([["l3", "MO-2026-00218"]]), new Set(["l3"]));
    expect(x[0]).toMatchObject({ match: "pick", stage: "ship", notes: ["ถอดของเดิม ISG2569-08-001 (200)", "ผูกได้ 200 จาก 250"] });
  });

  it("แท็บผูกแล้ว", () => {
    expect(salesPrintRowsLinked(linked)).toEqual([expect.objectContaining({ so_number: "ISG2569-08-001", mo_no: "MO-2026-00218", qty: 200, match: "linked", notes: [] })]);
  });

  it("HTML: จัดกลุ่มตามใบขาย (ใหม่ก่อน) ในตารางเดียว · ช่องตรวจ/หมายเหตุ · ช่องเซ็น · สรุปหัวใบ", () => {
    const out = buildSalesPrint({ kind: "open", rows: pr, settings: salesPrintDefaults("open"), printedAt: "02/11/2569", origin: "https://x" });
    const html = out.html;
    expect(html.match(/<table class="wb-t/g)).toHaveLength(1);
    expect(html.match(/class="grp-row"/g)).toHaveLength(4);
    expect(html.indexOf("ISG2569-10-029")).toBeLessThan(html.indexOf("ISG2569-10-028"));
    expect(html).toContain("ตรวจแล้ว");
    expect(html).toContain("หมายเหตุ");
    expect(html).toContain("ผู้จับคู่");
    expect(html).toContain("ที่ติ๊กไว้ 4 บรรทัด · 4 ใบขาย · 4 ใบงาน · ตรงจำนวน 2 · ระบบเสนอไม่ครบ 1 · เลือกเอง 1");
    expect(html).toContain("<b>เลือกเอง</b>");
    expect(out.groupCounts).toEqual([2, 2, 2, 2]);
  });

  it("ไม่จัดกลุ่ม = เพิ่มคอลัมน์ใบขายให้เอง", () => {
    const html = buildSalesPrint({ kind: "open", rows: pr, settings: { ...salesPrintDefaults("open"), groupBy: "" }, printedAt: "x", origin: "" }).html;
    expect(html).not.toContain('class="grp-row"');
    expect(html).toContain('data-col="bill"');
  });
});

describe("ตารางกลาง: แถวหัวกลุ่ม", () => {
  it("แถวที่มี LIST_GROUP_ROW กินทุกคอลัมน์ · แถวอื่นเหมือนเดิม", () => {
    const html = renderListTable([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ [LIST_GROUP_ROW]: "หัว" }, { a: "1", b: "2" }]);
    expect(html).toContain('<tr class="grp-row"><td colspan="2">หัว</td></tr>');
    expect(html).toContain("<tr><td>1</td><td>2</td></tr>");
  });
});
