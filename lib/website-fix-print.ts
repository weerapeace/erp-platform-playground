/**
 * 🖨 เช็กลิสต์ "ต้องแก้" ของสินค้าบนเว็บ — เจ้าของเลือก 2026-11-10 จาก widget: "ทั้ง 2 แบบ เริ่มที่ B"
 *   เปิดจากปุ่ม "พิมพ์เช็กลิสต์" หน้า สินค้าบนเว็บ (components/website-listings-panel) = รุ่นตามตัวกรอง/ค้นหา/หมวดที่เลือกอยู่
 *   แบบ B (ค่าเริ่ม) groupBy "issue" = หัวข้อละเรื่องที่ต้องแก้ · ขึ้นหน้าใหม่ต่อเรื่อง → ฉีกแจกงานตามคน (รุ่นที่ติดหลายเรื่องโผล่หลายหัวข้อ)
 *   แบบ A groupBy "" = 1 แถวต่อรุ่น · เรื่องที่ต้องแก้แต่ละข้อมีช่อง ☐ ย่อย · แถม groupBy "category" = หัวข้อตามหมวด
 *   เรื่องที่ต้องแก้ = กฎกลาง lib/website-listing-health (ตัวเดียวกับป้ายส้มในหน้ารายการ) · ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print (ListPrintPanel)
 *   หน้าพิมพ์ app/print/website-fix · pure ไม่มี React
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  LIST_GROUP_ROW, defaultListPrintSettings, escapeHtml as esc, fitListColumns, listPrintCss, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import { WEB_FIX_GROUPS, webFixGroupOf, type WebFixGroupKey, type WebFixIssue, type WebFixRow } from "@/lib/website-fix-print-payload";

export * from "@/lib/website-fix-print-payload";
const GROUP_LABEL = new Map<string, string>(WEB_FIX_GROUPS.map((g) => [g.key, g.label]));

/** รายละเอียดสั้นของเรื่องนี้ (ชื่อสีที่เกี่ยว ฯลฯ) — คำอธิบายยาวของ "วัดช่อง" ไม่พิมพ์ */
export function webFixDetail(i: WebFixIssue, row: Pick<WebFixRow, "category">): string {
  switch (webFixGroupOf(i)) {
    case "swatch_missing":
    case "color_no_image":
      return i.detail ?? "";
    case "web_none":
    case "web_part": {
      const names = (i.detail ?? "").replace(/^ยังไม่มีรูปบนเว็บ:\s*/, "");
      return i.key === "color_no_web_image" && !i.label.startsWith("ยังไม่มีรูปบนเว็บเลย") ? `${i.label} · ขาด ${names}` : names;
    }
    case "no_category":
      return row.category ? `หมวด ERP: ${row.category}` : "";
    default:
      return "";
  }
}

/** คอลัมน์ที่พิมพ์ได้ — done / who = ช่องติ๊ก/ช่องเขียนมือ (ปิด/เปิดได้ในแผง) · issues = สิ่งที่ต้องแก้ (แบบ A) / รายละเอียด (แบบ B) */
export function webFixColumns(): ListPrintColumn[] {
  return [
    { key: "done", label: "เสร็จ", blank: "box", widthMm: 11, align: "center" },
    { key: "img", label: "รูป" },
    { key: "code", label: "รหัสรุ่น", mono: true, widthMm: 26, minMm: 18 },
    { key: "name", label: "ชื่อสินค้า" },
    { key: "issues", label: "สิ่งที่ต้องแก้", widthMm: 62, minMm: 34 },
    { key: "category", label: "หมวด", widthMm: 28, minMm: 18 },
    { key: "status", label: "บนเว็บ", widthMm: 16, minMm: 12 },
    { key: "who", label: "ผู้แก้", blank: "line", widthMm: 22 },
  ];
}
export const WEB_FIX_TITLE = "เช็กลิสต์สินค้าบนเว็บที่ต้องแก้";
export const WEB_FIX_PRINT_GROUPS = [
  { value: "issue", label: "เรื่องที่ต้องแก้ (แบบ B)" },
  { value: "", label: "ไม่จัดกลุ่ม — 1 แถวต่อรุ่น (แบบ A)" },
  { value: "category", label: "หมวด" },
];
export const WEB_FIX_PRINT_SORTS = [{ value: "", label: "รหัสรุ่น" }, { value: "name", label: "ชื่อสินค้า" }, { value: "count", label: "เรื่องที่ต้องแก้มากก่อน" }];
const ON_BY_DEFAULT = new Set(["done", "img", "code", "name", "issues", "who"]);
export const webFixDefaults = (): ListPrintSettings => defaultListPrintSettings(webFixColumns(), {
  orientation: "portrait", image: "s", groupBy: "issue", pageBreakPerGroup: true, signature: true,
  columns: webFixColumns().map((c) => ({ key: c.key, on: ON_BY_DEFAULT.has(c.key) })),
});
/** แบบสำเร็จรูป (เจ้าของเลือก: ทั้ง 2 แบบ เริ่มที่ B) */
export const WEB_FIX_PRESETS: ListPrintPreset[] = [
  { id: "web-fix-b", name: "แบบ B — แยกตามเรื่อง ขึ้นหน้าใหม่ต่อเรื่อง (ค่าเริ่ม)", settings: { orientation: "portrait", image: "s", groupBy: "issue", pageBreakPerGroup: true, density: "normal" } },
  { id: "web-fix-a", name: "แบบ A — 1 แถวต่อรุ่น ติ๊กทีละเรื่อง", settings: { orientation: "portrait", image: "s", groupBy: "", pageBreakPerGroup: false, density: "normal" } },
  { id: "web-fix-compact", name: "กระชับ ไม่มีรูป (ประหยัดกระดาษ)", settings: { orientation: "portrait", image: "none", density: "compact", fontPx: 10 } },
];

/** นับรุ่นต่อกลุ่มเรื่อง (เฉพาะกลุ่มที่เลือก) — หัวกระดาษ + ตัวเลือกในแผง */
export function webFixCounts(rows: WebFixRow[]): Map<WebFixGroupKey, number> {
  const out = new Map<WebFixGroupKey, number>();
  for (const r of rows) for (const g of new Set(r.issues.map(webFixGroupOf))) out.set(g, (out.get(g) ?? 0) + 1);
  return out;
}

/**
 * include = กลุ่มเรื่องที่จะพิมพ์ (ไม่ส่ง = ทุกเรื่อง) — รุ่นที่ไม่เหลือเรื่องในกลุ่มที่เลือก = ไม่พิมพ์
 * คืน html + groupCounts (ไว้ประมาณจำนวนหน้า)
 */
export function buildWebFixPrint(input: {
  rows: WebFixRow[]; settings: ListPrintSettings; printedAt: string; origin: string; shop: string; scope: string;
  include?: Set<WebFixGroupKey> | null; company?: { name: string; logo_key: string | null } | null;
}): { html: string; title: string; groupCounts: number[]; models: number } {
  const { settings: s, origin } = input;
  const title = s.title.trim() || WEB_FIX_TITLE;
  const inc = input.include ?? null;
  const rows = input.rows
    .map((r) => ({ ...r, issues: r.issues.filter((i) => !inc || inc.has(webFixGroupOf(i))) }))
    .filter((r) => r.issues.length > 0);
  const byIssue = s.groupBy === "issue";
  const cols = resolveListColumns(s, webFixColumns()).map((c) => (c.key === "issues" && byIssue ? { ...c, label: "รายละเอียด" } : c));
  // ไม่มีคอลัมน์สิ่งที่ต้องแก้ในแบบ A = ไม่รู้ว่าต้องแก้อะไร → เปิดให้เอง
  if (!byIssue && !cols.some((c) => c.key === "issues")) cols.push(webFixColumns().find((c) => c.key === "issues")!);

  const sortKey = (a: WebFixRow, b: WebFixRow) =>
    s.sortBy === "name" ? a.name.localeCompare(b.name, "th") || a.code.localeCompare(b.code)
    : s.sortBy === "count" ? b.issues.length - a.issues.length || a.code.localeCompare(b.code)
    : a.code.localeCompare(b.code);
  const sorted = [...rows].sort(sortKey);

  const img = (u: string | null) => (u ? `<img class="thumb" src="${esc(`${u.startsWith("/") ? origin : ""}${u}`)}" alt="" />` : `<span class="no-img">—</span>`);
  const base = (r: WebFixRow): Record<string, string> => ({
    img: img(r.image_url),
    code: `<b class="mono">${esc(r.code)}</b>`,
    name: esc(r.name),
    category: r.category ? esc(r.category) : `<span class="no-img">—</span>`,
    status: r.published ? "ขึ้นเว็บ" : "ซ่อนอยู่",
  });
  // แบบ A: ทุกเรื่องของรุ่นนี้ ข้อละบรรทัด + ช่องติ๊กย่อย
  const issueList = (r: WebFixRow) => r.issues
    .map((i) => { const d = webFixDetail(i, r); return `<div class="fx-i"><span class="fx-bx"></span>${esc(GROUP_LABEL.get(webFixGroupOf(i)) ?? i.label)}${d ? `<span class="sub"> — ${esc(d)}</span>` : ""}</div>`; })
    .join("");

  const blocks: Record<string, string>[][] = [];
  const counts: number[] = [];
  const pushBlock = (head: string | null, list: Record<string, string>[]) => {
    blocks.push(head ? [{ [LIST_GROUP_ROW]: head }, ...list] : list);
    counts.push(list.length + (head ? 1 : 0));
  };
  const handout = `<span class="fx-who">ผู้รับผิดชอบ ____________</span>`;
  if (byIssue) {
    for (const g of WEB_FIX_GROUPS) {
      const list = sorted.flatMap((r) => r.issues.filter((i) => webFixGroupOf(i) === g.key).slice(0, 1).map((i) => ({ ...base(r), issues: esc(webFixDetail(i, r)) || `<span class="no-img">—</span>` })));
      if (list.length) pushBlock(`${esc(g.label)} — ${list.length.toLocaleString("th-TH")} รุ่น ${handout}`, list);
    }
  } else if (s.groupBy === "category") {
    const cats = new Map<string, WebFixRow[]>();
    for (const r of sorted) { const k = r.category?.split(",")[0]?.trim() || "ยังไม่อยู่หมวดไหน"; (cats.get(k) ?? cats.set(k, []).get(k)!).push(r); }
    for (const [k, list] of [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")))
      pushBlock(`${esc(k)} — ${list.length.toLocaleString("th-TH")} รุ่น ${handout}`, list.map((r) => ({ ...base(r), issues: issueList(r) })));
  } else {
    pushBlock(null, sorted.map((r) => ({ ...base(r), issues: issueList(r) })));
  }

  const fitted = fitListColumns(cols, s);
  let body: string;
  if (!sorted.length) body = `<div class="wb-empty">ไม่มีรายการที่ต้องแก้ในเรื่องที่เลือก</div>`;
  else if (blocks.length > 1 && s.pageBreakPerGroup) body = blocks.map((b, i) => `<div class="${i ? "grp-break" : ""}">${renderListTable(fitted, b)}</div>`).join("");
  else body = renderListTable(fitted, blocks.flat());
  if (s.signature) body += signatureHtml(["ผู้แก้", "ผู้ตรวจ"]);

  const cnt = webFixCounts(rows);
  const summary = WEB_FIX_GROUPS.filter((g) => cnt.get(g.key)).map((g) => `<span class="fx-chip">${esc(g.label)} ${cnt.get(g.key)!.toLocaleString("th-TH")}</span>`).join("");
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const sub = `ร้าน ${input.shop} · ${input.scope} · ${sorted.length.toLocaleString("th-TH")} รุ่น`;
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(sub)}</div>${summary ? `<div class="fx-sum">${summary}</div>` : ""}</div>`
    + `<div class="wb-no">พิมพ์ ${esc(input.printedAt)}<br/>ผู้รับผิดชอบ ____________<br/>กำหนดเสร็จ ____________</div></div>`;
  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: WEB_FIX_CSS + listPrintCss(s),
  };
  return { html: buildReportHtml(tpl, { header, body }, `${title} ${input.printedAt.replace(/\//g, "-")}`), title, groupCounts: counts.length ? counts : [0], models: sorted.length };
}

const WEB_FIX_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; line-height: 1.8; }
.fx-sum { display: flex; flex-wrap: wrap; gap: 1.5mm; margin-top: 2mm; }
.fx-chip { border: 1px solid #cbd5e1; border-radius: 2mm; padding: 0.3mm 2mm; font-size: 9.5px; color: #334155; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t .mono { font-family: ui-monospace, monospace; }
.wb-t .sub { font-size: 0.85em; color: #64748b; font-weight: 400; }
.fx-i { white-space: normal; }
.fx-i + .fx-i { margin-top: 0.6mm; }
.fx-bx { display: inline-block; width: 2.6mm; height: 2.6mm; border: 1px solid #334155; border-radius: 0.5mm; margin-right: 1.2mm; vertical-align: -0.3mm; }
.fx-who { float: right; font-weight: 400; color: #475569; }
td.img, th.img { text-align: center; }
.thumb { object-fit: cover; border: 1px solid #e2e8f0; border-radius: 3px; display: block; margin: 0 auto; }
.no-img { color: #cbd5e1; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;
