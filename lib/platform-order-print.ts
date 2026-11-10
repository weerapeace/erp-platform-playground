/**
 * 🖨 งานพิมพ์ของศูนย์ออเดอร์แพลตฟอร์ม (เฟส A3 · 2026-11-10) — pure ไม่มี React · มีเทสต์
 *
 *   ใบหยิบรวม (pick)  = รวมสินค้าทุกออเดอร์ที่เลือกเป็นรหัสละบรรทัด → หยิบทีเดียว · ตั้งค่าหน้าพิมพ์ด้วยของกลาง lib/list-print (ListPrintPanel)
 *   ใบแพ็ก (pack)      = ออเดอร์ละกล่อง 2 ใบ/แผ่น A4 · ช่องติ๊กต่อรายการ · บาร์โค้ดเลขออเดอร์ (หน้าเว็บสร้าง SVG ส่งมา)
 *   ใบปะหน้า (label)   = ของจริงต้องใช้ไฟล์ของ Shopee (มีเลขพัสดุ/บาร์โค้ดขนส่ง) — ดึงได้หลังเชื่อม Shopee (เฟส B)
 *                        ตอนนี้มีแค่ใบตัวอย่าง 100×150 มม. ลายน้ำ "จำลอง ห้ามใช้ส่งจริง" สำหรับโหมดทดลอง
 * หน้าพิมพ์: app/print/platform-orders
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  defaultListPrintSettings, escapeHtml as esc, fitListColumns, listPrintCss, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";

export type PrintOrderItem = { sku_code: string | null; name: string | null; variant?: string | null; qty: number };
export type PrintOrder = {
  id: string; order_no: string | null; customer_name: string | null; ordered_at: string | null; ship_by_at: string | null;
  carrier: string | null; tracking_no: string | null; note?: string | null; items: PrintOrderItem[];
  recipient?: { name: string; phone: string; address: string } | null;
};
export type PickRow = { key: string; sku: string; name: string; variant: string; qty: number; orders: string[] };

const dateTh = (iso: string | null | undefined) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }) : "";
};

/** รวมรายการทุกออเดอร์ → รหัส(+ตัวเลือก)ละบรรทัด · ไม่มีรหัส = ใช้ชื่อ */
export function pickRows(orders: PrintOrder[]): PickRow[] {
  const m = new Map<string, PickRow>();
  for (const o of orders) for (const it of o.items) {
    const sku = (it.sku_code ?? "").trim();
    const variant = (it.variant ?? "").trim();
    const name = (it.name ?? "").trim() || sku || "สินค้า";
    const key = `${sku || name}|${variant}`;
    const row = m.get(key) ?? { key, sku, name, variant, qty: 0, orders: [] };
    row.qty += Number(it.qty) || 0;
    const no = o.order_no ?? o.id;
    if (!row.orders.includes(no)) row.orders.push(no);
    m.set(key, row);
  }
  return [...m.values()];
}

export function pickColumns(): ListPrintColumn[] {
  return [
    { key: "done", label: "หยิบแล้ว", blank: "box", widthMm: 13, align: "center" },
    { key: "sku", label: "รหัส", mono: true, widthMm: 30, minMm: 20 },
    { key: "name", label: "สินค้า" },
    { key: "variant", label: "ตัวเลือก", widthMm: 28, minMm: 16 },
    { key: "qty", label: "จำนวน", widthMm: 16, align: "right" },
    { key: "orders", label: "ออเดอร์", widthMm: 46, minMm: 24 },
  ];
}
export const PICK_TITLE = "ใบหยิบสินค้ารวม (ออเดอร์ออนไลน์)";
export const PICK_SORTS = [{ value: "", label: "รหัสสินค้า" }, { value: "qty", label: "จำนวนมากก่อน" }, { value: "name", label: "ชื่อสินค้า" }];
export const PICK_GROUPS = [{ value: "", label: "ไม่จัดกลุ่ม" }];
export const pickDefaults = (): ListPrintSettings => defaultListPrintSettings(pickColumns(), {
  orientation: "portrait", image: "none", density: "normal", signature: true,
  columns: pickColumns().map((c) => ({ key: c.key, on: true })),
});
export const PICK_PRESETS: ListPrintPreset[] = [
  { id: "pick-normal", name: "ปกติ (ค่าเริ่ม)", settings: { orientation: "portrait", density: "normal" } },
  { id: "pick-big", name: "ตัวใหญ่ อ่านง่ายหน้าชั้นวาง", settings: { orientation: "portrait", density: "airy", fontPx: 14 } },
];

export function buildPickPrint(input: {
  orders: PrintOrder[]; settings: ListPrintSettings; printedAt: string; shop: string;
  company?: { name: string; logo_key: string | null } | null; origin?: string;
}): { html: string; title: string; groupCounts: number[]; lines: number; pieces: number } {
  const s = input.settings;
  const title = s.title.trim() || PICK_TITLE;
  const rows = pickRows(input.orders);
  const sorted = [...rows].sort((a, b) =>
    s.sortBy === "qty" ? b.qty - a.qty || a.sku.localeCompare(b.sku)
    : s.sortBy === "name" ? a.name.localeCompare(b.name, "th") || a.sku.localeCompare(b.sku)
    : (a.sku || a.name).localeCompare(b.sku || b.name));
  const cols = fitListColumns(resolveListColumns(s, pickColumns()), s);
  const pieces = rows.reduce((a, r) => a + r.qty, 0);
  const table = renderListTable(cols, sorted.map((r) => ({
    sku: r.sku ? `<b class="mono">${esc(r.sku)}</b>` : `<span class="no-img">—</span>`,
    name: esc(r.name), variant: esc(r.variant), qty: `<b class="pk-q">${r.qty.toLocaleString("th-TH")}</b>`,
    orders: `<span class="sub">${esc(r.orders.join(", "))}</span>`,
  })), { label: "รวม", cells: { qty: `<b class="pk-q">${pieces.toLocaleString("th-TH")}</b>` } });
  const body = (rows.length ? table : `<div class="wb-empty">ไม่มีรายการ</div>`) + (s.signature ? signatureHtml(["ผู้หยิบ", "ผู้ตรวจ"]) : "");
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key && input.origin ? `<img class="wb-logo" src="${esc(`${input.origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const sub = `${input.shop} · ${input.orders.length.toLocaleString("th-TH")} ออเดอร์ · ${rows.length.toLocaleString("th-TH")} รายการ · ${pieces.toLocaleString("th-TH")} ชิ้น`;
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(sub)}</div></div><div class="wb-no">พิมพ์ ${esc(input.printedAt)}</div></div>`;
  const tpl: ReportTemplate = { paper_size: s.paper, orientation: s.orientation, header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "", custom_css: PICK_CSS + listPrintCss(s) };
  return { html: buildReportHtml(tpl, { header, body }, `${title} ${input.printedAt.replace(/\//g, "-")}`), title, groupCounts: [rows.length + 1], lines: rows.length, pieces };
}

const PICK_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t .mono { font-family: ui-monospace, monospace; }
.wb-t .sub { font-size: 0.85em; color: #64748b; }
.pk-q { font-size: 1.15em; }
.no-img { color: #cbd5e1; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;

const PAGE_CSS = `*{box-sizing:border-box}body{margin:0;font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#111}`;

/** ใบแพ็ก: ออเดอร์ละใบ 2 ใบ/แผ่น A4 (มีเส้นตัด) · barcodes = SVG ต่อเลขออเดอร์ */
export function packSlipsHtml(orders: PrintOrder[], opts: { shop: string; barcodes?: Record<string, string>; title?: string }): string {
  const bc = opts.barcodes ?? {};
  const slip = (o: PrintOrder) => {
    const no = o.order_no ?? o.id;
    const pcs = o.items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
    return `<section class="slip">
      <div class="hd"><div><div class="t">ใบแพ็กสินค้า</div><div class="s">${esc(opts.shop)}</div></div><div class="bc">${bc[no] ?? ""}<div class="no">${esc(no)}</div></div></div>
      <div class="meta">ผู้ซื้อ <b>${esc(o.customer_name ?? "—")}</b>${o.ship_by_at ? ` · ส่งภายใน <b>${esc(dateTh(o.ship_by_at))}</b>` : ""}${o.tracking_no ? ` · พัสดุ ${esc(o.tracking_no)}` : ""}</div>
      <table><thead><tr><th style="width:9mm">✓</th><th style="width:30mm">รหัส</th><th>สินค้า</th><th style="width:16mm;text-align:right">จำนวน</th></tr></thead><tbody>
      ${o.items.map((i) => `<tr><td><span class="box"></span></td><td class="mono">${esc(i.sku_code ?? "")}</td><td>${esc(i.name ?? "")}${i.variant ? ` <span class="v">(${esc(i.variant)})</span>` : ""}</td><td style="text-align:right"><b>${Number(i.qty) || 0}</b></td></tr>`).join("")}
      </tbody></table>
      <div class="sum">รวม ${pcs} ชิ้น</div>
      ${o.note ? `<div class="note">หมายเหตุผู้ซื้อ: ${esc(o.note)}</div>` : ""}
      <div class="sign">ผู้แพ็ก ________________ &nbsp; วันที่ ____________</div>
    </section>`;
  };
  const pages: string[] = [];
  for (let i = 0; i < orders.length; i += 2) pages.push(`<div class="page">${orders.slice(i, i + 2).map(slip).join("")}</div>`);
  const css = `${PAGE_CSS}@page{size:A4;margin:8mm}.page{page-break-after:always;break-after:page;display:flex;flex-direction:column;gap:6mm}.page:last-child{page-break-after:auto;break-after:auto}
.slip{height:136mm;border:1.5px solid #111;border-radius:2mm;padding:4mm;display:flex;flex-direction:column;gap:2mm;overflow:hidden}
.slip+.slip{border-top-style:dashed}.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:4mm}.t{font-size:15pt;font-weight:700}.s{font-size:10pt;color:#555}
.bc{text-align:right}.bc svg{height:11mm;max-width:60mm}.no{font-family:monospace;font-size:11pt}.meta{font-size:10.5pt}
table{width:100%;border-collapse:collapse;font-size:11pt}th,td{border-bottom:1px solid #ccc;padding:1.3mm 1mm;text-align:left;vertical-align:top}th{font-size:9.5pt;color:#555}
.mono{font-family:monospace}.box{display:inline-block;width:4mm;height:4mm;border:1.5px solid #333}.v{color:#555}.sum{font-size:10pt;color:#444}.note{font-size:10pt;border:1px solid #999;padding:1.5mm;border-radius:1mm}
.sign{margin-top:auto;font-size:10pt;color:#444}`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(opts.title ?? "ใบแพ็กสินค้า")}</title><style>${css}</style></head><body>${pages.join("") || "<p>ไม่มีออเดอร์</p>"}</body></html>`;
}

/** ใบปะหน้าตัวอย่าง (โหมดทดลอง) 100×150 มม. — ลายน้ำชัด ห้ามใช้ส่งจริง */
export function demoLabelsHtml(orders: PrintOrder[], opts: { shop: string; barcodes?: Record<string, string> }): string {
  const bc = opts.barcodes ?? {};
  const label = (o: PrintOrder, i: number) => {
    const no = o.order_no ?? o.id;
    const trk = o.tracking_no ?? `TH24DEMO${String(i + 1).padStart(4, "0")}`;
    const r = o.recipient ?? { name: o.customer_name ?? "—", phone: "", address: "" };
    return `<section class="lb"><div class="wm">จำลอง · ห้ามใช้ส่งจริง</div>
      <div class="c">${esc(o.carrier ?? "SPX Express")}</div>
      <div class="tr">${esc(trk)}</div>
      <div class="to"><b>ผู้รับ</b> ${esc(r.name)}${r.phone ? ` · ${esc(r.phone)}` : ""}<br>${esc(r.address)}</div>
      <div class="from"><b>ผู้ส่ง</b> ${esc(opts.shop)}</div>
      <div class="ref">${bc[no] ?? ""}<div>ออเดอร์ ${esc(no)} · ${o.items.reduce((a, it) => a + (Number(it.qty) || 0), 0)} ชิ้น</div></div>
    </section>`;
  };
  const css = `${PAGE_CSS}@page{size:100mm 150mm;margin:0}
.lb{position:relative;width:100mm;height:150mm;padding:6mm;border:1px dashed #999;page-break-after:always;break-after:page;overflow:hidden;display:flex;flex-direction:column;gap:3mm}
.lb:last-child{page-break-after:auto;break-after:auto}
.wm{position:absolute;top:62mm;left:-12mm;right:-12mm;transform:rotate(-25deg);text-align:center;font-size:22px;font-weight:700;color:rgba(220,38,38,.38)}
.c{font-size:15px;font-weight:700}.tr{font-family:monospace;font-size:19px;letter-spacing:1px;border:2px solid #111;padding:2mm;text-align:center}
.to{font-size:13.5px;line-height:1.5;flex:1}.from{font-size:11px;color:#444;border-top:1px dashed #999;padding-top:2mm}
.ref{font-size:11px;color:#444}.ref svg{height:10mm;max-width:80mm;display:block}`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบปะหน้า (ตัวอย่าง)</title><style>${css}</style></head><body>${orders.map(label).join("") || "<p>ไม่มีออเดอร์</p>"}</body></html>`;
}
