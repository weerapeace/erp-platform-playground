/**
 * 🖨 ใบพิมพ์ "สรุปจับคู่ใบขาย → ใบงาน" (เจ้าของอนุมัติ 2026-11-02 จาก widget) — จากหน้าต่าง "อัปเดตงานจากใบขาย"
 *   ไว้ตรวจบนกระดาษก่อนกดผูก (แท็บยังไม่ผูก = เฉพาะบรรทัดที่ติ๊ก ตามใบงานที่เลือกอยู่) · แท็บผูกแล้ว = ตรวจย้อนหลัง
 *   จัดกลุ่มตามใบขาย (แถวหัวกลุ่มในตารางเดียว) · ช่องตรวจ ☐ + หมายเหตุ (ช่องเขียนมือของกลาง) · ช่องเซ็น ผู้จับคู่ / ผู้ตรวจ
 *   ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print (ListPrintPanel) · หน้าพิมพ์ app/print/sales-match · pure ไม่มี React
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  LIST_GROUP_ROW, defaultListPrintSettings, escapeHtml as esc, fitListColumns, listPrintCss, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import { MO_STAGE_LABEL, partnerNote, planLinks, salePartners, type LinkedLine, type MoStage, type UnlinkedLine } from "@/lib/mo-sales-unlinked";

export type SalesPrintKind = "open" | "linked";
/** exact = ตรงจำนวน (ระบบเสนอ) · suggest = ระบบเสนอแต่ไม่ครบ · pick = เลือกเอง · linked = ผูกแล้ว · none = ไม่มีใบงานให้ผูก */
export type SalesPrintMatch = "exact" | "suggest" | "pick" | "linked" | "none";
export type SalesPrintRow = {
  line_id: string; so_number: string; date: string; customer: string | null;
  sku: string; sku_name: string | null; image_url: string | null;
  sold: number; qty: number;
  /** none = ว่าง (ไม่มีใบงาน) */
  mo_no: string; mo_qty: number | null; opened: string | null; stage: MoStage | null;
  match: SalesPrintMatch; suggested: string | null; notes: string[];
  /** แท็บยังไม่ผูก: ติ๊กไว้ = จะผูก · ไม่ติ๊ก = ยังไม่ผูก (เจ้าของ 2026-11-02: "ต้องโชว์ทุกใบ") · แท็บผูกแล้ว = true เสมอ */
  ticked: boolean;
};
/** ส่งจากหน้าต่างไปหน้าพิมพ์ (localStorage) */
export type SalesPrintPayload = { kind: SalesPrintKind; rows: SalesPrintRow[]; at: number };
export const SALES_PRINT_STORE = "erp.salesPrint.";

const EPS = 0.0001;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const linkedText = (l: { so_number: string; qty: number }[]) => l.map((x) => `${x.so_number} (${fmt(x.qty)})`).join(", ");
export const thDateShort = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
};

/**
 * แท็บยังไม่ผูก: ทุกบรรทัดใบขาย (ติ๊ก = จะผูก · ไม่ติ๊ก = ใบที่เลือกไว้แต่ยังไม่ผูก · ไม่มีใบงาน = ว่าง)
 * จำนวนผูก = แผนผูกจริง planLinks ของที่ติ๊ก (ไม่เกินที่ใบงานผลิต) · ที่ไม่ติ๊กคิดแยกกัน (ไม่แย่งยอดของที่ติ๊ก)
 */
export function salesPrintRowsOpen(rows: UnlinkedLine[], picks: Map<string, string>, sel: Set<string>): SalesPrintRow[] {
  const has = (r: UnlinkedLine) => { const m = picks.get(r.id); return !!m && r.cands.some((c) => c.mo_no === m); };
  const chosen = rows.filter((r) => sel.has(r.id) && has(r));
  const ticked = new Set(chosen.map((r) => r.id));
  const qtyOf = new Map<string, number>();
  for (const p of [...planLinks(chosen, picks), ...planLinks(rows.filter((r) => !ticked.has(r.id) && has(r)), picks)])
    for (const x of p.parts) qtyOf.set(x.sale_line_id, x.qty);
  const partners = salePartners(rows, picks, qtyOf);
  const out: SalesPrintRow[] = [];
  for (const r of rows) {
    const base = { line_id: r.id, so_number: r.so_number, date: r.date, customer: r.customer, sku: r.sku, sku_name: r.sku_name ?? null, image_url: r.image_url ?? null, sold: r.qty };
    const mo = picks.get(r.id);
    const c = mo ? r.cands.find((x) => x.mo_no === mo) : undefined;
    if (!c) {
      const notes = [r.cands.length ? `ใบงานของสินค้านี้ผูกใบขายอื่นหมด (${r.cands.map((x) => x.mo_no).join(", ")})` : "ขายจากสต๊อก หรือใบงานปิดไปแล้ว"];
      if (r.left < r.qty - EPS) notes.push(`ผูกไปแล้ว ${fmt(r.qty - r.left)} เหลือ ${fmt(r.left)}`);
      out.push({ ...base, qty: 0, mo_no: "", mo_qty: null, opened: null, stage: null, match: "none", suggested: null, notes, ticked: false });
      continue;
    }
    const s = r.suggest.find((x) => x.mo_no === c.mo_no);
    const qty = qtyOf.get(r.id) ?? 0;
    const match: SalesPrintMatch = s ? (r.kind === "exact" ? "exact" : "suggest") : "pick";
    const notes: string[] = [];
    // ใบขายอื่นที่เลือกใบงานเดียวกัน: เลขใบ (วันที่ · จำนวน) — เจ้าของ 2026-11-02 · ไม่ติ๊ก = ยังไม่ผูกด้วย
    const pn = partnerNote(partners, c, r.id, qty, thDateShort, (id) => !ticked.has(id));
    if (pn) notes.push(pn.text);
    if (c.linked) notes.push(`ถอดของเดิม ${linkedText(c.linked)}`);
    if (qty < r.left - EPS) notes.push(`ผูกได้ ${fmt(qty)} จาก ${fmt(r.left)}`);
    if (r.unlinked?.length) notes.push(`เคยถอดผูกจาก ${r.unlinked.map((u) => u.mo_no).join(", ")}`);
    out.push({
      ...base, qty, mo_no: c.mo_no, mo_qty: c.qty, opened: c.opened, stage: c.stage,
      match, suggested: match === "pick" ? r.suggest[0]?.mo_no ?? null : null, notes, ticked: ticked.has(r.id),
    });
  }
  return out;
}

/** แท็บผูกแล้ว → แถวพิมพ์ */
export const salesPrintRowsLinked = (rows: LinkedLine[]): SalesPrintRow[] => rows.map((r) => ({
  line_id: r.id, so_number: r.so_number, date: r.date, customer: r.customer, sku: r.sku, sku_name: r.sku_name ?? null, image_url: r.image_url ?? null,
  sold: r.qty, qty: r.link_qty, mo_no: r.mo_no, mo_qty: r.mo_qty, opened: r.opened, stage: r.stage,
  match: "linked", suggested: null, notes: r.others.length ? [`ใบงานนี้ผูก ${linkedText(r.others)} ด้วย`] : [], ticked: true,
}));

/** คอลัมน์ที่พิมพ์ได้ (x_check / x_note = ช่องเขียนมือของกลาง เปิดไว้ตั้งต้น) · minMm = ย่อพอดีกระดาษได้ต่ำสุด (แนวตั้ง/A5) */
export function salesPrintColumns(kind: SalesPrintKind): ListPrintColumn[] {
  return [
    { key: "img", label: "รูป" },
    { key: "bill", label: "ใบขาย", mono: true, widthMm: 30 },
    { key: "sku", label: "สินค้า", widthMm: 46, minMm: 28 },
    { key: "sold", label: "ขาย", align: "right", widthMm: 16, minMm: 12 },
    { key: "mo", label: kind === "open" ? "ใบงานที่จะผูก" : "ใบงานที่ผูก", mono: true, widthMm: 30 },
    { key: "made", label: "ผลิต", align: "right", widthMm: 14, minMm: 12 },
    { key: "opened", label: "เปิด / สถานะ", widthMm: 22, minMm: 16 },
    { key: "match", label: "จับคู่", widthMm: 40, minMm: 24 },
  ];
}
export const SALES_PRINT_TITLE: Record<SalesPrintKind, string> = { open: "สรุปจับคู่ใบขาย → ใบงาน (ก่อนกดผูก)", linked: "ใบขายที่ผูกใบงานแล้ว" };
export const SALES_PRINT_GROUPS = [{ value: "bill", label: "ใบขาย (หัวกลุ่ม)" }, { value: "", label: "ไม่จัดกลุ่ม (มีคอลัมน์ใบขาย)" }];
export const SALES_PRINT_SORTS = [{ value: "", label: "ใบขายใหม่ก่อน" }, { value: "sku", label: "รหัสสินค้า" }, { value: "mo", label: "ใบงาน" }];
export const salesPrintDefaults = (kind: SalesPrintKind): ListPrintSettings => defaultListPrintSettings(salesPrintColumns(kind), {
  orientation: "landscape", image: "s", groupBy: "bill", signature: true,
  columns: [{ key: "x_check", on: true }, ...salesPrintColumns(kind).map((c) => ({ key: c.key, on: c.key !== "bill" })), { key: "x_note", on: true }],
});
/** แบบสำเร็จรูป */
export const SALES_PRINT_PRESETS: ListPrintPreset[] = [
  { id: "sales-check", name: "ตรวจก่อนผูก (ค่าเริ่ม)", settings: { orientation: "landscape", image: "s", groupBy: "bill", density: "normal" } },
  { id: "sales-compact", name: "กระชับ ไม่มีรูป (ประหยัดกระดาษ)", settings: { orientation: "portrait", image: "none", groupBy: "bill", density: "compact", fontPx: 10 } },
];

const MATCH_LABEL: Record<SalesPrintMatch, string> = { exact: "ตรงจำนวน", suggest: "ระบบเสนอ (ไม่ครบ)", pick: "เลือกเอง", linked: "ผูกแล้ว", none: "ไม่มีใบงาน" };

/** onlyTicked = แท็บยังไม่ผูก พิมพ์เฉพาะที่ติ๊ก (ค่าเริ่ม = ทุกบรรทัด ทุกใบขาย) */
export function buildSalesPrint(input: { kind: SalesPrintKind; rows: SalesPrintRow[]; settings: ListPrintSettings; printedAt: string; origin: string; company?: { name: string; logo_key: string | null } | null; onlyTicked?: boolean }): { html: string; title: string; groupCounts: number[] } {
  const { kind, settings: s, origin } = input;
  const title = s.title.trim() || SALES_PRINT_TITLE[kind];
  const cols = resolveListColumns(s, salesPrintColumns(kind));
  const grouped = s.groupBy === "bill";
  // ไม่จัดกลุ่ม = ต้องมีคอลัมน์ใบขาย (เปิดให้เองถ้าปิดไว้)
  if (!grouped && !cols.some((c) => c.key === "bill")) {
    const at = Math.max(0, cols.findIndex((c) => c.key === "sku"));
    cols.splice(at, 0, salesPrintColumns(kind).find((c) => c.key === "bill")!);
  }
  // จัดกลุ่ม = ใบขายใหม่ก่อนเสมอ แล้วเรียงในใบตามที่เลือก · ไม่จัดกลุ่ม = เรียงตามที่เลือกทั้งรายการ
  const key = (r: SalesPrintRow) => (s.sortBy === "sku" ? r.sku : s.sortBy === "mo" ? r.mo_no : "");
  const bill = (a: SalesPrintRow, b: SalesPrintRow) => b.date.localeCompare(a.date) || b.so_number.localeCompare(a.so_number);
  const rows = input.rows.filter((r) => !input.onlyTicked || r.ticked).sort((a, b) => (grouped
    ? bill(a, b) || key(a).localeCompare(key(b)) || a.sku.localeCompare(b.sku)
    : key(a).localeCompare(key(b)) || bill(a, b) || a.sku.localeCompare(b.sku)));
  const img = (u: string | null) => (u ? `<img class="thumb" src="${esc(`${u.startsWith("/") ? origin : ""}${u}`)}" alt="" />` : `<span class="no-img">—</span>`);
  const cell = (r: SalesPrintRow): Record<string, string> => ({
    img: img(r.image_url),
    bill: `${esc(r.so_number)}<div class="sub">${esc(thDateShort(r.date))}</div>`,
    sku: `<b class="mono">${esc(r.sku)}</b>${r.sku_name ? `<div class="sub">${esc(r.sku_name)}</div>` : ""}`,
    sold: `${fmt(r.sold)}${Math.abs(r.qty - r.sold) > EPS ? `<div class="sub">ผูก ${fmt(r.qty)}</div>` : ""}`,
    mo: r.mo_no ? esc(r.mo_no) : "—",
    made: r.mo_qty == null ? "—" : fmt(r.mo_qty),
    opened: r.opened ? `${esc(thDateShort(r.opened))}<div class="sub">${r.stage ? esc(MO_STAGE_LABEL[r.stage]) : ""}</div>` : "—",
    // ไม่ติ๊ก (แท็บยังไม่ผูก) = บอกชัดว่ายังไม่ผูก แล้วตามด้วยที่ระบบจับคู่ไว้ · ไม่มีใบงาน / เลือกเอง = ตัวหนา
    match: (kind === "open" && r.match !== "none" && !r.ticked ? `<b>ไม่ติ๊ก — ยังไม่ผูก</b><div class="sub">${esc(MATCH_LABEL[r.match])}</div>`
      : r.match === "pick" || r.match === "none" ? `<b>${MATCH_LABEL[r.match]}</b>` : esc(MATCH_LABEL[r.match]))
      + `${r.suggested ? `<div class="sub">ระบบเสนอ ${esc(r.suggested)}</div>` : ""}${r.notes.map((n) => `<div class="sub">${esc(n)}</div>`).join("")}`,
  });
  const out: Record<string, string>[] = [];
  const counts: number[] = [];
  if (grouped) {
    const bills = new Map<string, SalesPrintRow[]>();
    for (const r of rows) (bills.get(r.so_number) ?? bills.set(r.so_number, []).get(r.so_number)!).push(r);
    for (const list of bills.values()) {
      const h = list[0];
      out.push({ [LIST_GROUP_ROW]: `${esc(h.so_number)} · ${esc(thDateShort(h.date))}${h.customer ? ` · ${esc(h.customer)}` : ""}` });
      for (const r of list) out.push(cell(r));
      counts.push(list.length + 1);
    }
  } else { for (const r of rows) out.push(cell(r)); counts.push(rows.length); }

  const on = rows.filter((r) => r.ticked);
  const bills = new Set(rows.map((r) => r.so_number)).size, mos = new Set(on.map((r) => r.mo_no).filter(Boolean)).size;
  const by = (m: SalesPrintMatch) => on.filter((r) => r.match === m).length;
  const off = rows.filter((r) => !r.ticked && r.match !== "none").length, none = rows.filter((r) => r.match === "none").length;
  const sub = kind === "open"
    ? `${input.onlyTicked ? "เฉพาะที่ติ๊ก" : "ทุกบรรทัด"} ${fmt(rows.length)} บรรทัด · ${fmt(bills)} ใบขาย · ติ๊ก (จะผูก) ${fmt(on.length)} → ${fmt(mos)} ใบงาน · ตรงจำนวน ${fmt(by("exact"))} · ระบบเสนอไม่ครบ ${fmt(by("suggest"))} · เลือกเอง ${fmt(by("pick"))}`
      + (input.onlyTicked ? "" : ` · ไม่ติ๊ก ${fmt(off)} · ไม่มีใบงาน ${fmt(none)}`)
    : `ผูกแล้ว ${fmt(rows.length)} บรรทัด · ${fmt(bills)} ใบขาย · ${fmt(mos)} ใบงาน`;
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(sub)}</div></div>`
    + `<div class="wb-no">อัปเดตงานจากใบขาย<br/>พิมพ์ ${esc(input.printedAt)}</div></div>`;
  // กว้างรวมเกินกระดาษ (แนวตั้ง / A5) → ย่อทุกช่องตามสัดส่วนให้พอดี ไม่ให้ช่องขวาโดนตัด
  let body = rows.length ? renderListTable(fitListColumns(cols, s), out) : `<div class="wb-empty">ไม่มีรายการ</div>`;
  if (s.signature) body += signatureHtml(["ผู้จับคู่", "ผู้ตรวจ"]);
  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: SALES_PRINT_CSS + listPrintCss(s),
  };
  return { html: buildReportHtml(tpl, { header, body }, `${title} ${input.printedAt.replace(/\//g, "-")}`), title, groupCounts: counts.length ? counts : [0] };
}

const SALES_PRINT_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t td.r, .wb-t th.r { text-align: right; white-space: nowrap; }
.wb-t .mono { font-family: ui-monospace, monospace; }
.wb-t td.mono { color: #334155; }
.wb-t .sub { font-size: 0.85em; color: #64748b; font-weight: 400; font-family: inherit; }
td.img, th.img { text-align: center; }
.thumb { object-fit: cover; border: 1px solid #e2e8f0; border-radius: 3px; display: block; margin: 0 auto; }
.no-img { color: #cbd5e1; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;
