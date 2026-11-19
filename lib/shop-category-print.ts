/**
 * 🖨 เช็กลิสต์ "หมวดในร้าน" ไปกดในหลังร้าน (ข้อเสนอ 4 ที่เจ้าของเลือก 2026-11-19) — pure ไม่มี React
 *   เปิดจากปุ่ม "พิมพ์เช็กลิสต์" ในแท็บหมวดในร้าน → app/print/shop-categories?brand=&platform=
 *   ข้อ = lib/shop-category-plan shopCategoryChecklist (ตัวเดียวกับหน้าจอ) · 1 หัวข้อต่อข้อ · แถว = สินค้าที่ต้องใส่/เอาออก (ติ๊กทีละตัว)
 *   ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print (ListPrintPanel) · แบบเดียวกับ lib/website-fix-print
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  LIST_GROUP_ROW, defaultListPrintSettings, escapeHtml as esc, fitListColumns, listPrintCss, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import type { ShopCatProduct, ShopCatStep } from "@/lib/shop-category-plan";

export const SHOP_CAT_PRINT_TITLE = "เช็กลิสต์หมวดในร้าน";
export const SHOP_CAT_PRINT_GROUPS = [{ value: "step", label: "ข้อที่ต้องทำ" }];
export const SHOP_CAT_PRINT_SORTS = [{ value: "", label: "ตามลำดับในหมวด" }, { value: "code", label: "รหัสสินค้า" }];

export function shopCatPrintColumns(): ListPrintColumn[] {
  return [
    { key: "done", label: "เสร็จ", blank: "box", widthMm: 11, align: "center" },
    { key: "img", label: "รูป" },
    { key: "code", label: "รหัสสินค้า", mono: true, widthMm: 28, minMm: 18 },
    { key: "name", label: "ชื่อสินค้า" },
    { key: "note", label: "หมายเหตุ", blank: "line", widthMm: 30 },
  ];
}
const ON_BY_DEFAULT = new Set(["done", "img", "code", "name"]);
export const shopCatPrintDefaults = (): ListPrintSettings => defaultListPrintSettings(shopCatPrintColumns(), {
  orientation: "portrait", image: "s", groupBy: "step", pageBreakPerGroup: false, signature: true,
  columns: shopCatPrintColumns().map((c) => ({ key: c.key, on: ON_BY_DEFAULT.has(c.key) })),
});
export const SHOP_CAT_PRINT_PRESETS: ListPrintPreset[] = [
  { id: "shop-cat-default", name: "มีรูป ติ๊กทีละสินค้า (ค่าเริ่ม)", settings: { orientation: "portrait", image: "s", density: "normal" } },
  { id: "shop-cat-compact", name: "กระชับ ไม่มีรูป (ประหยัดกระดาษ)", settings: { orientation: "portrait", image: "none", density: "compact", fontPx: 10 } },
];

export function buildShopCatPrint(input: {
  steps: ShopCatStep[]; productByCode: Map<string, ShopCatProduct>; settings: ListPrintSettings;
  shopLabel: string; printedAt: string; origin: string; company?: { name: string; logo_key: string | null } | null;
}): { html: string; title: string; groupCounts: number[] } {
  const { settings: s, origin } = input;
  const title = s.title.trim() || SHOP_CAT_PRINT_TITLE;
  const cols = resolveListColumns(s, shopCatPrintColumns());
  const img = (key: string | null) => (key ? `<img class="thumb" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(key)}&w=160`)}" alt="" />` : `<span class="no-img">—</span>`);
  const blocks: Record<string, string>[][] = [];
  const counts: number[] = [];
  input.steps.forEach((st, n) => {
    const codes = s.sortBy === "code" ? [...st.codes].sort() : st.codes;
    const rows = codes.length
      ? codes.map((code) => { const p = input.productByCode.get(code); return { img: img(p?.cover ?? null), code: `<b class="mono">${esc(code)}</b>`, name: esc(p?.name ?? "") }; })
      : [{ img: "", code: "", name: `<span class="sub">ทำตามหัวข้อด้านบน</span>` }];
    blocks.push([{ [LIST_GROUP_ROW]: `${n + 1}. ${esc(st.title)}` }, ...rows]);
    counts.push(rows.length + 1);
  });
  const fitted = fitListColumns(cols, s);
  let body = input.steps.length ? renderListTable(fitted, blocks.flat()) : `<div class="wb-empty">ตรงกับแผนแล้ว ไม่มีอะไรต้องไปกดในหลังร้าน</div>`;
  if (s.signature) body += signatureHtml(["ผู้ทำ", "ผู้ตรวจ"]);
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(`ร้าน ${input.shopLabel} · ${input.steps.length.toLocaleString("th-TH")} ข้อ · ติ๊กในแอปเมื่อทำเสร็จ`)}</div></div>`
    + `<div class="wb-no">พิมพ์ ${esc(input.printedAt)}<br/>ผู้รับผิดชอบ ____________</div></div>`;
  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: SHOP_CAT_CSS + listPrintCss(s),
  };
  return { html: buildReportHtml(tpl, { header, body }, `${title} ${input.printedAt.replace(/\//g, "-")}`), title, groupCounts: counts.length ? counts : [0] };
}

const SHOP_CAT_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; line-height: 1.8; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t .mono { font-family: ui-monospace, monospace; }
.wb-t .sub { font-size: 0.9em; color: #64748b; }
td.img, th.img { text-align: center; }
.thumb { object-fit: cover; border: 1px solid #e2e8f0; border-radius: 3px; display: block; margin: 0 auto; }
.no-img { color: #cbd5e1; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;
