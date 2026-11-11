/**
 * 🧾 ใบตีราคาต้นทุน (ใบงานออกแบบ) — สร้างข้อมูลลงแม่แบบ (ไม่มีหน้าจอ) · หน้าพิมพ์ app/print/design-sheet-cost
 *
 *   buildCostPrintData(input) → token ทั้งชุดให้แม่แบบ:
 *     ของเดิม: cost_groups · extras · groups (แม่แบบเก่าที่เขียนตารางเองยังพิมพ์ได้เหมือนเดิม)
 *     ของใหม่ (ตั้งค่าได้ · เจ้าของขอ 2026-11-11):
 *       cost_summary_html — กล่องสรุปต้นทุนตามตัวเลือก (แยกตามชนิด · ค่าแรง/โสหุ้ย/อื่น ๆ + รายละเอียด)
 *       lines_table       — ตารางวัตถุดิบตามคอลัมน์ที่ตั้ง (ของกลาง renderDocTable) · ทุกบรรทัด / รวมตามวัสดุ / รวมตามชนิด
 *       has_table · list_title · opt_sign (ช่องเซ็น)
 *   ตัวเลือก = DOC_OPTIONS.design_sheet_cost (lib/doc-print-prefs) · ค่ากลางของทุกคน (ui_config doc_print_design_sheet_cost)
 *   รายละเอียดค่าแรงตัด/โสหุ้ย คิดด้วยสูตรกลาง (lib/design-cost-presets) จากราคากลาง "ตอนพิมพ์"
 *     → ถ้ารวมไม่ตรงยอดที่บันทึกไว้ (ราคากลางเปลี่ยนทีหลัง) ใช้ยอดที่บันทึกเป็นยอดจริง + บอกหมายเหตุ
 * เทสต์ lib/__tests__/design-sheet-cost-print.test.ts
 */
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import { cleanExtra, extraKindOf, type SnapExtra } from "@/lib/design-sheet-cost-snapshot";
import { cutLaborRows, groupCutRows, overheadRows, presetsOf, type CostPreset } from "@/lib/design-cost-presets";
import { docOption, renderDocTable, type DocPrintPrefs } from "@/lib/doc-print-prefs";

export const COST_PRINT_ENTITY = "design_sheet_cost";
export type ListMode = "lines" | "material" | "type" | "none";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const baht = (n: number | null | undefined) =>
  n != null ? Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
const num = (n: number | null | undefined, dp = 0) => (n != null ? Number(n).toLocaleString("th-TH", { maximumFractionDigits: dp }) : "—");
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"'{}]/g, (c) => `&#${c.charCodeAt(0)};`);
const pkey = (s: string | null | undefined) => s ?? "";

/** ราคาต่อ 1 ชิ้นของวัสดุ = ยอดรวมบรรทัด ÷ จำนวนชิ้น */
export const perPiece = (l: Pick<CostLine, "amount" | "pieces">): number | null =>
  (l.amount != null && l.pieces != null && l.pieces > 0) ? r2(l.amount / l.pieces) : null;

/** ราคาวัสดุต่อ 1 หลา (หน่วยที่ซื้อจริง) — บรรทัดหลา = ราคา/หน่วยตรง ๆ · บรรทัด cm² = ราคา/cm² × หน้ากว้าง × divisor */
export const perYard = (l: Pick<CostLine, "unit_price" | "uom" | "divisor" | "face_width_cm">): number | null => {
  if (l.unit_price == null) return null;
  const uom = (l.uom ?? "").trim();
  if (uom === "cm²" || uom === "cm2") return l.face_width_cm ? r2(l.unit_price * l.face_width_cm * (l.divisor || 90)) : null;
  return uom.includes("หลา") ? r2(l.unit_price) : null;
};

/** cost_extra ของไซส์ที่เลือก → [{ parent, extra }] (array เก่า = ของ "ทั่วไป") · sel null = ทุกไซส์ */
export function extrasOf(rawCe: unknown, sel: string | null): { parent: string; extra: SnapExtra }[] {
  const out: { parent: string; extra: SnapExtra }[] = [];
  const push = (parent: string, arr: unknown) => { for (const c of Array.isArray(arr) ? arr : []) out.push({ parent, extra: cleanExtra(c) }); };
  if (Array.isArray(rawCe)) { if (sel === null || sel === "") push("", rawCe); return out; }
  if (rawCe && typeof rawCe === "object") {
    for (const [k, v] of Object.entries(rawCe as Record<string, unknown>)) if (sel === null || k === sel) push(k, v);
  }
  return out;
}

type Cat = "labor" | "overhead" | "other";
const catOf = (e: SnapExtra): Cat => { const k = extraKindOf(e); return k === "labor" || k === "labor_cut" ? "labor" : k === "overhead" ? "overhead" : "other"; };
type Detail = { label: string; note?: string; amount: number | null };

export type CostPrintInput = {
  sheet: { code?: unknown; name?: unknown; brand_name?: string | null; order_date?: string | null; deadline?: string | null; cost_extra?: unknown; order_qty?: unknown };
  /** บรรทัดของไซส์ที่เลือก (กรองแล้ว) */
  lines: CostLine[];
  /** ไซส์ที่เลือก · null = ทุกไซส์ */
  sel: string | null;
  sizeLabel: string | null;
  prefs: DocPrintPrefs;
  /** ราคากลาง (ค่าตัดกลาง / โสหุ้ย) — null = ยังโหลดไม่เสร็จ (ไม่โชว์รายละเอียด) */
  presets: CostPreset[] | null;
  /** ราคาค่าตัดต่อชิ้นของวัสดุ (design_price_items.cut_rate) */
  cutRateOf: (itemId: string) => number | null | undefined;
  tabLabel: (parent: string) => string;
  imagesHtml?: string;
  dateTh: (iso: string | null | undefined) => string;
};

/** รายละเอียดของค่าใช้จ่ายเพิ่ม 1 รายการ (สูตรเดียวกับแท็บตีราคา) */
function extraDetails(e: SnapExtra, parent: string, inp: CostPrintInput): Detail[] {
  const k = extraKindOf(e);
  const rows: Detail[] = [];
  if (k === "labor_cut" && e.cut_by === "pieces" && inp.presets) {
    const central = presetsOf(inp.presets, "cut_rate")[0]?.amount ?? null;
    const lines = inp.lines.filter((l) => pkey(l.parent_code) === parent).map((l, i) => ({ ...l, key: `${i}` }));
    for (const g of groupCutRows(cutLaborRows(lines, central, inp.cutRateOf)).filter((x) => x.amount > 0)) {
      rows.push({ label: g.name, note: g.rate != null ? `${num(g.pieces, 2)} ชิ้น × ${baht(g.rate)}` : `${num(g.pieces, 2)} ชิ้น`, amount: g.amount });
    }
  } else if (k === "overhead" && e.oh && inp.presets) {
    const oq = (inp.sheet.order_qty ?? {}) as Record<string, unknown>;
    const qty = e.split_qty ?? (Number(oq[parent]) > 0 ? Number(oq[parent]) : null);
    for (const r of overheadRows(e.oh, inp.presets, qty).filter((x) => x.on && x.amount > 0)) rows.push({ label: r.label, note: r.detail, amount: r2(r.amount) });
  } else if (e.mode === "split") {
    rows.push({ label: `${baht(e.total ?? 0)} ÷ ${e.split_qty ? num(e.split_qty) : "?"} ใบ`, amount: null });
  } else if (e.note) {
    rows.push({ label: e.note, amount: null });
  }
  // รวมไม่ตรงยอดที่บันทึกไว้ (ราคากลางเปลี่ยนหลังตีราคา) → บอกให้รู้ · ยอดจริง = ที่บันทึกไว้
  const sum = r2(rows.reduce((s, d) => s + (d.amount ?? 0), 0));
  if (rows.some((d) => d.amount != null) && Math.abs(sum - (e.amount || 0)) > 0.01) {
    rows.push({ label: `รายละเอียดคิดจากราคากลางวันนี้ รวม ${baht(sum)} · ยอดที่บันทึกไว้ ${baht(e.amount)}`, amount: null });
  }
  return rows;
}

const ROW = "display:flex;justify-content:space-between;font-size:12px;padding:1px 0;";
const SUB = "display:flex;justify-content:space-between;font-size:11px;padding:0 0 0 14px;color:#64748b;";

function summaryHtml(inp: CostPrintInput, groups: { label: string; amount: number }[], materialTotal: number): { html: string; grand: number } {
  const opt = (key: string) => docOption(COST_PRINT_ENTITY, inp.prefs, key);
  const multi = new Set(inp.lines.map((l) => pkey(l.parent_code))).size > 1 || (inp.sel === null && extrasOf(inp.sheet.cost_extra, null).some((x) => x.parent !== ""));
  const show: Record<Cat, boolean> = { labor: opt("show_labor") !== false, overhead: opt("show_overhead") !== false, other: opt("show_other") !== false };
  const detail: Record<Cat, boolean> = { labor: opt("labor_detail") === true, overhead: opt("overhead_detail") === true, other: false };
  const parts: string[] = [];
  if (opt("sum_by_type") !== false) for (const g of groups) parts.push(`<div style="${ROW}"><span style="color:#475569;">ต้นทุน (${esc(g.label)})</span><span>${baht(g.amount)} ฿</span></div>`);
  parts.push(`<div style="${ROW}font-weight:600;border-top:1px solid #e2e8f0;margin-top:4px;padding-top:4px;"><span>ต้นทุนวัสดุดิบรวม</span><span>${baht(materialTotal)} ฿</span></div>`);
  let grand = materialTotal;
  const hidden = new Set<string>();
  for (const { parent, extra } of extrasOf(inp.sheet.cost_extra, inp.sel)) {
    if (!(Number(extra.amount) || 0)) continue;
    const cat = catOf(extra);
    if (!show[cat]) { hidden.add(cat === "labor" ? "ค่าแรง" : cat === "overhead" ? "ค่าโสหุ้ย" : "ต้นทุนอื่น"); continue; }
    grand += Number(extra.amount) || 0;
    const label = `${extra.label || "ค่าใช้จ่าย"}${multi ? ` (${inp.tabLabel(parent)})` : ""}`;
    parts.push(`<div style="${ROW}color:#475569;"><span>${esc(label)}</span><span>${baht(extra.amount)} ฿</span></div>`);
    if (detail[cat]) for (const d of extraDetails(extra, parent, inp)) {
      parts.push(`<div style="${SUB}"><span>· ${esc(d.label)}${d.note ? ` <span style="color:#94a3b8;">${esc(d.note)}</span>` : ""}</span><span>${d.amount != null ? baht(d.amount) : ""}</span></div>`);
    }
  }
  grand = r2(grand);
  const title = hidden.size ? `ต้นทุนรวม (ไม่รวม${[...hidden].join(" ")})` : "ต้นทุนสินค้า (รวมทั้งหมด)";
  parts.push(`<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;border-top:2px solid #0f172a;margin-top:6px;padding-top:6px;color:#047857;"><span>${esc(title)}</span><span>${baht(grand)} ฿</span></div>`);
  return {
    html: `<div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;margin:10px 0;background:#f8fafc;"><div style="font-weight:700;font-size:13px;margin-bottom:6px;">สรุปต้นทุน</div>${parts.join("")}</div>`,
    grand,
  };
}

const lineRow = (l: CostLine) => ({
  item_name:     l.item_name ?? "",
  dims:          (l.width_cm != null && l.length_cm != null) ? `${num(l.width_cm, 2)}×${num(l.length_cm, 2)}` : "—",
  pieces:        l.pieces != null ? num(l.pieces, 2) : "—",
  waste:         l.waste_percent != null ? `${num(l.waste_percent, 2)}%` : "—",
  qty:           l.qty != null ? num(l.qty, 4) : "—",
  uom:           l.uom ?? "",
  unit_price_th: l.unit_price != null ? num(l.unit_price, 4) : "—",
  per_piece_th:  perPiece(l) != null ? baht(perPiece(l)) : "—",
  per_yard_th:   perYard(l) != null ? baht(perYard(l)) : "—",
  amount_th:     baht(l.amount),
  note:          l.note ?? "",
});
const same = <T,>(xs: T[]): T | undefined => (xs.every((x) => x === xs[0]) ? xs[0] : undefined);

/** แถวตารางตามแบบที่เลือก (มีแถวหัวกลุ่ม { __group, __sum } สำหรับแบบทุกบรรทัด / รวมตามวัสดุ) */
export function costTableRows(lines: CostLine[], mode: ListMode): Record<string, unknown>[] {
  if (mode === "none") return [];
  const byType = new Map<string, CostLine[]>();
  for (const l of lines) { const k = l.group_name || "ไม่ระบุชนิด"; byType.set(k, [...(byType.get(k) ?? []), l]); }
  const sumOf = (ls: CostLine[]) => r2(ls.reduce((s, l) => s + (l.amount || 0), 0));
  const merged = (name: string, ls: CostLine[]) => {
    const pcs = ls.reduce((s, l) => s + (Number(l.pieces) || 0), 0);
    const amount = sumOf(ls);
    const uom = same(ls.map((l) => l.uom ?? ""));
    const price = same(ls.map((l) => l.unit_price));
    const waste = same(ls.map((l) => l.waste_percent));
    return {
      item_name: name,
      dims: ls.length > 1 ? `${ls.length} ชิ้นส่วน` : lineRow(ls[0]).dims,
      pieces: pcs ? num(pcs, 2) : "—",
      waste: waste != null ? `${num(waste, 2)}%` : "—",
      qty: uom !== undefined ? num(ls.reduce((s, l) => s + (Number(l.qty) || 0), 0), 4) : "—",
      uom: uom ?? "",
      unit_price_th: price != null ? num(price, 4) : "—",
      per_piece_th: pcs ? baht(amount / pcs) : "—",
      per_yard_th: price != null && perYard(ls[0]) != null ? baht(perYard(ls[0])) : "—",
      amount_th: baht(amount),
      note: ls.length === 1 ? (ls[0].note ?? "") : "",
    };
  };
  if (mode === "type") return [...byType.entries()].map(([type, ls]) => merged(type, ls));
  const out: Record<string, unknown>[] = [];
  for (const [type, ls] of byType) {
    out.push({ __group: type, __sum: baht(sumOf(ls)) });
    if (mode === "lines") { for (const l of ls) out.push(lineRow(l)); continue; }
    const byMat = new Map<string, CostLine[]>();
    for (const l of ls) { const k = l.item_id ?? l.item_sku_id ?? l.item_name ?? "—"; byMat.set(k, [...(byMat.get(k) ?? []), l]); }
    for (const ms of byMat.values()) out.push(merged(ms[0].item_name ?? "—", ms));
  }
  return out;
}

const LIST_TITLE: Record<ListMode, string> = {
  lines: "รายการวัตถุดิบ (แยกตามชนิด)", material: "รายการวัตถุดิบ (รวมตามวัสดุ)", type: "สรุปตามชนิดวัสดุ", none: "",
};

export function buildCostPrintData(inp: CostPrintInput): Record<string, unknown> {
  const { sheet, lines } = inp;
  const mode = (docOption(COST_PRINT_ENTITY, inp.prefs, "list_mode") as ListMode | undefined) ?? "lines";

  // จัดกลุ่มตามชนิด (ของเดิม — แม่แบบเก่าใช้ cost_groups / groups)
  const gmap = new Map<string, CostLine[]>();
  for (const l of lines) { const k = l.group_name || "ไม่ระบุชนิด"; gmap.set(k, [...(gmap.get(k) ?? []), l]); }
  const groupTotals = [...gmap.entries()].map(([label, ls]) => ({ label, amount: r2(ls.reduce((s, l) => s + (l.amount || 0), 0)), ls }));
  const materialTotal = r2(lines.reduce((s, l) => s + (l.amount || 0), 0));
  const allExtras = extrasOf(sheet.cost_extra, inp.sel).map((x) => x.extra);
  const legacyExtras = allExtras.filter((c) => (Number(c.amount) || 0) !== 0).map((c) => ({ label: c.label || "ค่าใช้จ่าย", amount_th: baht(c.amount) }));
  const legacyGrand = materialTotal + allExtras.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const summary = summaryHtml(inp, groupTotals, materialTotal);
  const rows = costTableRows(lines, mode);
  const imagesHtml = inp.imagesHtml ?? "";
  return {
    code:              sheet.code ?? "",
    name:              `${sheet.name ?? ""}${inp.sizeLabel ? ` — ${inp.sizeLabel}` : ""}`,
    brand_name:        sheet.brand_name ?? "—",
    order_date_th:     inp.dateTh(sheet.order_date),
    deadline_th:       inp.dateTh(sheet.deadline),
    print_date_th:     inp.dateTh(new Date().toISOString()),
    // ── ของเดิม (แม่แบบที่เขียนตารางเอง) ──
    cost_groups:       groupTotals.map((g) => ({ label: g.label, subtotal_th: baht(g.amount) })),
    material_total_th: baht(materialTotal),
    extras:            legacyExtras,
    has_extras:        legacyExtras.length > 0,
    grand_total_th:    baht(legacyGrand),
    groups:            groupTotals.map((g) => ({ group_name: g.label, subtotal_th: baht(g.amount), lines: g.ls.map(lineRow) })),
    no_lines:          lines.length === 0,
    // ── ของใหม่ (ตั้งค่าได้) ──
    cost_summary_html: summary.html,
    summary_total_th:  baht(summary.grand),
    lines_table:       rows.length ? renderDocTable(COST_PRINT_ENTITY, inp.prefs, rows) : "",
    has_table:         mode !== "none" && lines.length > 0,
    list_title:        LIST_TITLE[mode],
    opt_sign:          docOption(COST_PRINT_ENTITY, inp.prefs, "show_sign") !== false,
    images_html:       imagesHtml,
    has_images:        imagesHtml !== "",
  };
}

/** แม่แบบนี้รองรับใบแบบตั้งค่าได้ไหม (มี {{{lines_table}}} และ {{{cost_summary_html}}}) */
export function templateSupportsCostSettings(tpl: { header_html?: string | null; body_html?: string | null; footer_html?: string | null } | null | undefined): boolean {
  if (!tpl) return false;
  const s = `${tpl.header_html ?? ""}${tpl.body_html ?? ""}${tpl.footer_html ?? ""}`;
  return /\{\{\{\s*lines_table\s*\}\}\}/.test(s) && /\{\{\{\s*cost_summary_html\s*\}\}\}/.test(s);
}
