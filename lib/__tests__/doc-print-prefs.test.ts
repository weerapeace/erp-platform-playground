import { describe, expect, it } from "vitest";
import {
  columnTokens, defaultPrefs, docColumnsOrdered, docPrintPerms, docWidthUsedMm, normalizePrefs, renderDocTable, templateHasCopyLabel, withCopies,
} from "@/lib/doc-print-prefs";
import { renderTemplate } from "@/lib/template";

const E = "billing_note";
const row = { idx: 1, so_number: "ISG2569-11-002", bill_date: "03-พ.ย.-69", due_date: "03-ธ.ค.-69",
  amount: "30,000.00", vat_amount: "2,100.00", total_amount: "32,100.00", note: "สาขา <5>" };

describe("doc-print-prefs — ค่าเดิมไม่เปลี่ยน (ใบกำกับภาษีใช้อยู่)", () => {
  it("so: เปิด/ปิดคอลัมน์ + token แม่แบบเหมือนเดิม และไม่มีช่องใหม่โผล่", () => {
    const p = normalizePrefs("so", { template_id: "t1", columns: { unit: true, product_name: false } });
    expect(p).toEqual({ ...defaultPrefs("so"), template_id: "t1", columns: { ...defaultPrefs("so").columns, unit: true } });
    expect(columnTokens("so", p).col_unit).toBe("1");
  });
});

describe("doc-print-prefs — ตารางปรับได้ (ใบวางบิล)", () => {
  it("ลำดับ: คงที่บันทึก · คอลัมน์ที่ไม่มีในค่าที่บันทึกแทรกตรงตำแหน่งเดิมของมัน (ไม่ไปกองท้าย)", () => {
    const p = normalizePrefs(E, { order: ["so_number", "idx", "bogus", "note"] });
    // วันที่บิล (เดิมอยู่ต่อจากเลขที่บิล) → แทรกต่อจากเลขที่บิล · ที่เหลือเรียงตามค่าเริ่มต้นต่อกันไป
    expect(p.order).toEqual(["so_number", "bill_date", "due_date", "amount", "vat_amount", "total_amount", "idx", "note"]);
  });
  it("ความกว้าง: บีบเข้าช่วง 6–150 มม. · คอลัมน์ 'ที่เหลือ' (หมายเหตุ) ไม่เก็บ", () => {
    const p = normalizePrefs(E, { widths: { so_number: 2, amount: 999, note: 40, idx: "x" } });
    expect(p.widths).toEqual({ so_number: 6, amount: 150 });
  });
  it("สิทธิ์ค่ากลาง: ใบวางบิล = so.view / so.edit · key อื่นไม่มีสิทธิ์เฉพาะ", () => {
    expect(docPrintPerms("doc_print_billing_note")).toEqual({ view: "so.view", edit: "so.edit" });
    expect(docPrintPerms("doc_print_so")).toBeNull();
    expect(docPrintPerms("wo_print_columns")).toBeNull();
  });
  it("ชื่อหัว/ซ่อนคอลัมน์/ลำดับ ไปถึงตาราง + กัน HTML และ {{ }}", () => {
    const p = normalizePrefs(E, {
      columns: { due_date: false }, labels: { total_amount: "รวมเงิน", note: "{{x}}" }, order: ["so_number", "idx"],
    });
    const html = renderDocTable(E, p, [row]);
    expect(html).toContain(">รวมเงิน</th>");
    expect(html).not.toContain("วันที่ครบกำหนด");
    expect(html.indexOf('data-col="so_number"')).toBeLessThan(html.indexOf('data-col="idx"'));
    expect(html).toContain("สาขา &#60;5&#62;");
    expect(html).not.toContain("{{x}}");
  });
  it("ตั้งความกว้าง = ตาราง fixed + col เป็น มม. · ยังไม่ตั้ง = อัตโนมัติ (ไม่ตัดบรรทัดเลขที่/วันที่)", () => {
    expect(renderDocTable(E, defaultPrefs(E), [row])).not.toContain("doc-t fixed");
    const p = normalizePrefs(E, { widths: { so_number: 32 } });
    const html = renderDocTable(E, p, [row], { filler: true });
    expect(html).toContain('class="bn-lines doc-t fixed"');
    expect(html).toContain('<col data-col="so_number" style="width:32mm">');
    expect(html).toContain('<col data-col="note" data-flex="1">');
    expect(html).toContain('<tr class="filler">');
    expect(docWidthUsedMm(E, p)).toBe(32);
  });
  it("ตัวอักษร/เส้น เป็นหน่วย pt/มม. และ specificity สูงกว่า CSS แม่แบบ", () => {
    const p = normalizePrefs(E, { style: { font_pt: 12, border: "h", border_mm: 0.1, row_pad_mm: 1 } });
    const html = renderDocTable(E, p, [row]);
    expect(html).toContain(".doc-t.doc-t th,.doc-t.doc-t td{font-size:12pt;}");
    expect(html).toContain("border-bottom:0.1mm solid");
    expect(html).not.toMatch(/border[^;]*px/);
  });
  it("แม่แบบจริงวาง {{{lines_table}}} แล้วได้ตารางครบ (ผ่านตัวเรนเดอร์แม่แบบ)", () => {
    const out = renderTemplate("<main>{{{lines_table}}}</main>", { lines_table: renderDocTable(E, defaultPrefs(E), [row]) });
    expect(out).toContain("<table class=\"bn-lines doc-t\"");
    expect(out).toContain(">ISG2569-11-002</td>");
    expect(docColumnsOrdered(E, defaultPrefs(E)).filter((c) => c.shown)).toHaveLength(8);
  });
});

describe("ต้นฉบับ / สำเนา (withCopies)", () => {
  it("ปิด = หน้าเดียวต่อใบ ช่องคำว่าง", () => {
    expect(withCopies([{ n: "A" }, { n: "B" }], {})).toEqual([{ n: "A", copy_label: "" }, { n: "B", copy_label: "" }]);
    expect(withCopies([{ n: "A" }], null)).toEqual([{ n: "A", copy_label: "" }]);
  });
  it("เปิด = เรียงทีละใบ ต้นฉบับแล้วสำเนา", () => {
    expect(withCopies([{ n: "A" }, { n: "B" }], { copies: true }).map((d) => `${d.n}:${d.copy_label}`))
      .toEqual(["A:ต้นฉบับ", "A:สำเนา", "B:ต้นฉบับ", "B:สำเนา"]);
  });
  it("จำค่าเปิดไว้ได้ (normalizePrefs) · ค่าแปลก ๆ ไม่นับ", () => {
    expect(normalizePrefs("billing_note", { copies: true }).copies).toBe(true);
    expect(normalizePrefs("billing_note", { copies: "yes" }).copies).toBeUndefined();
  });
  it("หาช่อง {{copy_label}} ในแม่แบบ", () => {
    expect(templateHasCopyLabel({ header_html: '<div class="bn-copy">{{copy_label}}</div>' })).toBe(true);
    expect(templateHasCopyLabel({ header_html: "{{{ copy_label }}}" })).toBe(true);
    expect(templateHasCopyLabel({ header_html: "<div>ใบวางบิล</div>" })).toBe(false);
    expect(templateHasCopyLabel(null)).toBe(false);
  });
});
