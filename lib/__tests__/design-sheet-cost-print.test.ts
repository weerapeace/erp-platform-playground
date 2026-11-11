import { describe, expect, it } from "vitest";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import type { CostPreset } from "@/lib/design-cost-presets";
import { defaultPrefs, docOption, normalizePrefs, renderDocTable, type DocPrintPrefs } from "@/lib/doc-print-prefs";
import { buildCostPrintData, costTableRows, extrasOf, templateSupportsCostSettings } from "@/lib/design-sheet-cost-print";

// ใบตีราคาต้นทุนแบบตั้งค่าได้ (2026-11-11) — ข้อมูลจริงจาก DS-2026-0088 (ทั่วไป)
const L = (p: Partial<CostLine>): CostLine => ({
  item_id: "kao", item_name: "ผ้าขาวม้า (นาหมื่นศรี)", group_name: "ผ้า (ชิ้น)", calc_method: "area_sheet",
  width_cm: 10, length_cm: 10, pieces: 2, face_width_cm: null, waste_percent: 15, divisor: null,
  qty: 227.792, uom: "cm²", unit_price: 0.009375, amount: 2.14, note: null, sort_order: 1, parent_code: null, ...p,
});
const lines: CostLine[] = [
  L({}), L({ width_cm: 7, length_cm: 7, qty: 109.503, amount: 1.03 }), L({ width_cm: 7, length_cm: 7, pieces: 1, qty: 55.545, amount: 0.52 }),
  L({ width_cm: 2, length_cm: 3, pieces: 1, qty: 6.9, amount: 0.06 }),
  L({ item_id: "ring", item_name: "ห่วง 1.5 cm.", group_name: "อะไหล่", calc_method: "count", width_cm: null, length_cm: null, pieces: 2, waste_percent: 0, qty: 2, uom: "ชิ้น", unit_price: 2, amount: 4 }),
  L({ item_id: "dog", item_name: "ห่วงกลมคอหมา 1 นิ้ว", group_name: "อะไหล่", calc_method: "count", width_cm: null, length_cm: null, pieces: 1, waste_percent: 0, qty: 1, uom: "pcs.", unit_price: 5, amount: 5 }),
];
const costExtra = { "": [
  { label: "ค่าแรงผลิต", amount: 0 },
  { kind: "labor_cut", label: "ค่าแรง (ตัด/ปลอก/วาด)", amount: 7.98, cut_by: "pieces" },
  { kind: "overhead", label: "ค่าโสหุ้ย (ส่ง/QC/Packing)", amount: 5.83, oh: { off: ["box"], dims: { w: 10.21, l: 9.7, t: 3, g: null }, ship: "carton" } },
  { label: "ต้นทุนอื่นๆ", amount: 0 },
] };
const preset = (p: Partial<CostPreset>): CostPreset => ({ id: p.kind ?? "x", kind: "oh_fixed", label: null, amount: 0, w_cm: null, l_cm: null, h_cm: null, max_kg: null, mode: null, sort_order: 0, ...p } as CostPreset);
const presets: CostPreset[] = [
  preset({ id: "pack", kind: "oh_fixed", label: "ค่าแพ็ค", amount: 1, sort_order: 0 }),
  preset({ id: "qc", kind: "oh_fixed", label: "ค่า QC", amount: 3, sort_order: 1 }),
];
const base = (prefs: DocPrintPrefs) => buildCostPrintData({
  sheet: { code: "DS-2026-0088", name: "กระเป๋าใส่เหรียญ", brand_name: "Good Goods", cost_extra: costExtra, order_qty: {} },
  lines, sel: "", sizeLabel: null, prefs, presets, cutRateOf: (id) => (id === "kao" ? 1.33 : null), tabLabel: (k) => k || "ทั่วไป",
  dateTh: () => "11 พ.ย. 2569",
});
const P = (options: Record<string, string | boolean>) => normalizePrefs("design_sheet_cost", { options });

describe("ตัวเลือกเอกสาร (DOC_OPTIONS ของกลาง)", () => {
  it("เก็บเฉพาะตัวเลือกที่รู้จัก + ค่าที่ถูกชนิด · ไม่ตั้ง = ค่าเริ่มต้น", () => {
    const p = normalizePrefs("design_sheet_cost", { options: { list_mode: "material", show_labor: false, bogus: 1, sum_by_type: "x", list_mode2: "a" } });
    expect(p.options).toEqual({ list_mode: "material", show_labor: false });
    expect(docOption("design_sheet_cost", p, "show_overhead")).toBe(true);
    expect(docOption("design_sheet_cost", defaultPrefs("design_sheet_cost"), "list_mode")).toBe("lines");
    expect(normalizePrefs("design_sheet_cost", { options: { list_mode: "weird" } }).options).toBeUndefined();
  });
  it("ตารางกลางวาดแถวหัวกลุ่มได้", () => {
    const html = renderDocTable("design_sheet_cost", defaultPrefs("design_sheet_cost"), [{ __group: "ผ้า", __sum: "3.75" }, { item_name: "ผ้า", amount_th: "3.75" }]);
    expect(html).toContain('<tr class="doc-grp"><td colspan="8">ผ้า<span class="doc-grp-sum">3.75</span></td></tr>');
  });
});

describe("costTableRows", () => {
  it("ทุกบรรทัด = หัวกลุ่มตามชนิด + ทุกบรรทัด", () => {
    const rows = costTableRows(lines, "lines");
    expect(rows.filter((r) => r.__group).map((r) => [r.__group, r.__sum])).toEqual([["ผ้า (ชิ้น)", "3.75"], ["อะไหล่", "9.00"]]);
    expect(rows.filter((r) => !r.__group)).toHaveLength(6);
  });
  it("รวมตามวัสดุ = ผ้าขาวม้า 4 บรรทัดเหลือแถวเดียว (6 ชิ้น · 3.75)", () => {
    const rows = costTableRows(lines, "material").filter((r) => !r.__group);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ item_name: "ผ้าขาวม้า (นาหมื่นศรี)", dims: "4 ชิ้นส่วน", pieces: "6", amount_th: "3.75", per_piece_th: "0.63" });
  });
  it("รวมตามชนิด = แถวละชนิด ไม่มีหัวกลุ่ม · หน่วยต่างกัน = ไม่รวมปริมาณ", () => {
    const rows = costTableRows(lines, "type");
    expect(rows.map((r) => [r.item_name, r.amount_th])).toEqual([["ผ้า (ชิ้น)", "3.75"], ["อะไหล่", "9.00"]]);
    expect(rows[1].qty).toBe("—");
    expect(costTableRows(lines, "none")).toEqual([]);
  });
});

describe("buildCostPrintData", () => {
  it("ค่าเริ่มต้น: สรุปครบ รวม 26.56 · ตาราง + ช่องเซ็น", () => {
    const d = base(defaultPrefs("design_sheet_cost"));
    expect(d.summary_total_th).toBe("26.56");
    expect(d.cost_summary_html).toContain("ต้นทุนสินค้า (รวมทั้งหมด)");
    expect(d.has_table).toBe(true);
    expect(d.opt_sign).toBe(true);
    expect(d.grand_total_th).toBe("26.56");   // ของเดิม (แม่แบบเก่า) ไม่เปลี่ยน
  });
  it("ซ่อนค่าแรง = ยอดรวมไม่นับค่าแรง + หัวข้อบอกว่าไม่รวม", () => {
    const d = base(P({ show_labor: false }));
    expect(d.summary_total_th).toBe("18.58");
    expect(d.cost_summary_html).toContain("ต้นทุนรวม (ไม่รวมค่าแรง)");
    expect(d.cost_summary_html).not.toContain("ค่าแรง (ตัด/ปลอก/วาด)");
  });
  it("รายละเอียดค่าแรงตัด = วัสดุ × ชิ้น × ราคาตัด (สูตรกลาง)", () => {
    const html = String(base(P({ labor_detail: true })).cost_summary_html);
    expect(html).toContain("ผ้าขาวม้า (นาหมื่นศรี)");
    expect(html).toContain("6 ชิ้น × 1.33");
    expect(html).toContain("7.98");
  });
  it("รายละเอียดโสหุ้ยรวมไม่ตรงยอดที่บันทึก (ราคากลางเปลี่ยน) = บอกหมายเหตุ", () => {
    const html = String(base(P({ overhead_detail: true })).cost_summary_html);
    expect(html).toContain("ค่าแพ็ค");
    expect(html).toContain("ค่า QC");
    expect(html).toContain("รายละเอียดคิดจากราคากลางวันนี้ รวม 4.00 · ยอดที่บันทึกไว้ 5.83");
  });
  it("ไม่โชว์ตาราง / ปิดช่องเซ็น", () => {
    const d = base(P({ list_mode: "none", show_sign: false }));
    expect(d.has_table).toBe(false);
    expect(d.lines_table).toBe("");
    expect(d.opt_sign).toBe(false);
  });
  it("ไซส์เดียว = ค่าใช้จ่ายของไซส์นั้น · array เก่า = ของ ทั่วไป", () => {
    expect(extrasOf([{ label: "ค่าแรง", amount: 5 }], "")).toHaveLength(1);
    expect(extrasOf([{ label: "ค่าแรง", amount: 5 }], "PU")).toHaveLength(0);
    expect(extrasOf({ "": [{ label: "a", amount: 1 }], PU: [{ label: "b", amount: 2 }] }, null)).toHaveLength(2);
  });
  it("แม่แบบรองรับแบบตั้งค่าได้ต่อเมื่อมีทั้ง 2 ช่อง", () => {
    expect(templateSupportsCostSettings({ body_html: "{{{cost_summary_html}}} {{{lines_table}}}" })).toBe(true);
    expect(templateSupportsCostSettings({ body_html: "{{{lines_table}}}" })).toBe(false);
  });
});
