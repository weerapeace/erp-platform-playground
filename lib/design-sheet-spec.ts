/**
 * ใบงานออกแบบ — แท็บรายละเอียดงาน: สรุปวัตถุดิบ + รายการส่งต่อ (ตีราคา/BOM) + HTML ใบพิมพ์ (pure · ใช้ได้ทุกที่)
 *
 * ใช้ที่: spec-tab.tsx (สรุป + ส่งไปตีราคา/BOM) · /print/design-sheet/[id] โหมด "📐 รายละเอียดงาน"
 */
import { cropBackground, SPEC_COLOR_SOURCE_LABEL, type SpecColorCell, type SpecColorTable } from "@/lib/design-sheet-spec-colors";
import { swatchCss } from "@/lib/color-swatch";
import type { MarkupShape } from "@/lib/image-markup";

export type SpecPinLike = {
  no: number; x: number; y: number; part_name: string | null;
  sku_id: string | null; sku_code: string | null; sku_name: string | null; sku_image_key?: string | null;
  qty: number | null; uom: string | null; note: string | null;
};
export type SpecMaterialRow = {
  sku_id: string; code: string | null; name: string | null; imageKey: string | null;
  nos: number[];                          // เลขหมุดที่ใช้ SKU นี้
  qty: { uom: string; qty: number }[];    // จำนวนรวมแยกตามหน่วย
  noQty: boolean;                         // มีบางหมุดยังไม่ใส่จำนวน
};
/** 1 รายการที่ส่งไปตีราคา / สร้าง BOM (1 SKU × 1 หน่วย) */
export type SpecMaterialItem = { sku_id: string; sku_code: string | null; sku_name: string | null; qty: number | null; uom: string | null };

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** รวมหมุดที่ใช้ SKU เดียวกัน (ทุกรูป) → จำนวนรวมแยกตามหน่วย · missing = หมุดที่ยังไม่เลือก SKU */
export function summarizeSpecPins(pins: SpecPinLike[]): { rows: SpecMaterialRow[]; missing: number } {
  const m = new Map<string, SpecMaterialRow>();
  let missing = 0;
  for (const p of pins) {
    if (!p.sku_id) { missing++; continue; }
    const e = m.get(p.sku_id) ?? { sku_id: p.sku_id, code: p.sku_code, name: p.sku_name, imageKey: p.sku_image_key ?? null, nos: [], qty: [], noQty: false };
    e.nos.push(p.no);
    if (p.qty != null && Number.isFinite(p.qty)) {
      const u = (p.uom ?? "").trim();
      const hit = e.qty.find((q) => q.uom === u);
      if (hit) hit.qty = r4(hit.qty + p.qty); else e.qty.push({ uom: u, qty: r4(p.qty) });
    } else e.noQty = true;
    m.set(p.sku_id, e);
  }
  const rows = Array.from(m.values());
  for (const r of rows) r.nos.sort((a, b) => a - b);
  return { rows, missing };
}

/** สรุป → รายการส่งต่อ (SKU ที่ใช้หลายหน่วย = แยกรายการตามหน่วย · ไม่มีจำนวน = qty null) */
export function specMaterialItems(rows: SpecMaterialRow[]): SpecMaterialItem[] {
  const out: SpecMaterialItem[] = [];
  for (const r of rows) {
    if (!r.qty.length) { out.push({ sku_id: r.sku_id, sku_code: r.code, sku_name: r.name, qty: null, uom: null }); continue; }
    for (const q of r.qty) out.push({ sku_id: r.sku_id, sku_code: r.code, sku_name: r.name, qty: q.qty, uom: q.uom || null });
  }
  return out;
}

export const fmtSpecQty = (n: number) => r4(n).toLocaleString("th-TH");

// ───────────────────────── ใบพิมพ์ ─────────────────────────

export type SpecPrintPage = { title: string | null; image_url: string; image_w: number | null; image_h: number | null; shapes: MarkupShape[] };
export type SpecPrintData = { pages: (SpecPrintPage & { pins: SpecPinLike[] })[]; colors: SpecColorTable };

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const EXACT = "-webkit-print-color-adjust:exact;print-color-adjust:exact;";
const MAX_W = 180, MAX_H = 120;   // กล่องรูปบนกระดาษ A4 (มม.)

function shapeSvg(s: MarkupShape): string {
  const st = `fill="none" stroke="${esc(s.color)}" stroke-width="2" vector-effect="non-scaling-stroke"`;
  if (s.t === "rect") return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${st}/>`;
  if (s.t === "circle") return `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" ${st}/>`;
  if (s.t === "draw") return `<polyline points="${s.pts.map((p) => p.join(",")).join(" ")}" stroke-linecap="round" stroke-linejoin="round" ${st}/>`;
  return "";
}

/** รูป 1 หน้า + สิ่งที่วาด + หมุด (ขนาดกล่องเป็น มม. ตามสัดส่วนรูป → ตำแหน่งตรงกับบนจอ) */
function pageFigureHtml(p: SpecPrintData["pages"][number], abs: (u: string) => string): string {
  const aspect = p.image_w && p.image_h ? p.image_w / p.image_h : 4 / 3;
  const w = Math.min(MAX_W, MAX_H * aspect), h = w / aspect;
  const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">${p.shapes.map(shapeSvg).join("")}</svg>`;
  const texts = p.shapes.filter((s): s is Extract<MarkupShape, { t: "text" }> => s.t === "text").map((s) =>
    `<div style="position:absolute;left:${s.x}%;top:${s.y}%;font-size:${((s.size / 100) * w).toFixed(2)}mm;font-weight:700;line-height:1.15;white-space:pre;color:${esc(s.color)};text-shadow:0 0 2px #fff,0 0 2px #fff;">${esc(s.text)}</div>`).join("");
  const pins = p.pins.map((x) =>
    `<div style="position:absolute;left:${x.x}%;top:${x.y}%;transform:translate(-50%,-50%);width:5.5mm;height:5.5mm;border-radius:50%;background:${x.sku_id ? "#7c3aed" : "#f59e0b"};border:0.5mm solid #fff;color:#fff;font:700 8pt/5.5mm sans-serif;text-align:center;${EXACT}">${x.no}</div>`).join("");
  return `<div style="margin:2px 0 8px;break-inside:avoid;">
${p.title ? `<div style="font-size:11px;font-weight:600;color:#334155;margin-bottom:3px;">${esc(p.title)}</div>` : ""}
<div style="position:relative;width:${w.toFixed(1)}mm;height:${h.toFixed(1)}mm;border:1px solid #e2e8f0;border-radius:4px;overflow:visible;">
<img src="${esc(abs(p.image_url))}" style="display:block;width:100%;height:100%;object-fit:fill;border-radius:4px;" />${svg}${texts}${pins}</div></div>`;
}

function chipHtml(c: SpecColorCell | undefined, keyUrl: (key: string, w: number) => string): string {
  const box = `display:inline-block;width:7mm;height:7mm;border-radius:1.5mm;border:1px solid #cbd5e1;vertical-align:middle;${EXACT}`;
  if (!c) return `<span style="${box}border-style:dashed;"></span>`;
  let bg: string;
  if (c.crop && c.image_key) {
    const cb = cropBackground(keyUrl(c.image_key, 1200), c.crop);
    bg = `background-image:${cb.backgroundImage};background-size:${cb.backgroundSize};background-position:${cb.backgroundPosition};`;
  } else if (c.image_key) bg = `background:url("${keyUrl(c.image_key, 200)}") center / cover no-repeat;`;
  else if (c.colors.length > 1) bg = `background:${swatchCss({ colors: c.colors, imageKey: null }, (k) => k)};`;
  else bg = `background:${c.hex ?? c.colors[0] ?? "#e2e8f0"};`;
  return `<span style="${box}${bg.replace(/"/g, "'")}"></span>`;
}

const TH = "text-align:left;font-weight:600;color:#475569;padding:4px 6px;border-bottom:1px solid #cbd5e1;background:#f8fafc;";
const TD = "padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:middle;";

/** เนื้อกลางโหมด "📐 รายละเอียดงาน": รูป+หมุด → ตารางหมุด → สรุปวัตถุดิบ → ตารางสี */
export function buildSpecPrintHtml(spec: SpecPrintData, abs: (u: string) => string, keyUrl: (key: string, w: number) => string): string {
  const pins = spec.pages.flatMap((p) => p.pins);
  const figs = spec.pages.map((p) => pageFigureHtml(p, abs)).join("");

  const pinRows = pins.map((x) => `<tr>
<td style="${TD}width:8mm;text-align:center;font-weight:700;color:${x.sku_id ? "#6d28d9" : "#b45309"};">${x.no}</td>
<td style="${TD}">${esc(x.part_name || "—")}</td>
<td style="${TD}">${x.sku_id ? `<span style="font-family:monospace;color:#64748b;">${esc(x.sku_code)}</span> ${esc(x.sku_name)}` : `<span style="color:#b45309;">ยังไม่เลือก SKU</span>`}</td>
<td style="${TD}text-align:right;white-space:nowrap;">${x.qty != null ? `${fmtSpecQty(x.qty)} ${esc(x.uom ?? "")}` : "—"}</td>
<td style="${TD}color:#64748b;">${esc(x.note ?? "")}</td></tr>`).join("");
  const pinTable = pins.length ? `<div style="font-size:12px;font-weight:700;margin:6px 0 4px;">หมุดวัตถุดิบ</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr><th style="${TH}">#</th><th style="${TH}">ส่วนประกอบ</th><th style="${TH}">วัตถุดิบ (SKU)</th><th style="${TH}text-align:right;">จำนวน</th><th style="${TH}">หมายเหตุ</th></tr>${pinRows}</table>` : "";

  const sum = summarizeSpecPins(pins);
  const sumTable = sum.rows.length ? `<div style="font-size:12px;font-weight:700;margin:10px 0 4px;">สรุปวัตถุดิบ</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr><th style="${TH}">วัตถุดิบ</th><th style="${TH}">ใช้ที่หมุด</th><th style="${TH}text-align:right;">รวม</th></tr>${sum.rows.map((r) => `<tr>
<td style="${TD}"><span style="font-family:monospace;color:#64748b;">${esc(r.code)}</span> ${esc(r.name)}</td>
<td style="${TD}">${r.nos.map((n) => `#${n}`).join(" ")}</td>
<td style="${TD}text-align:right;white-space:nowrap;">${r.qty.map((q) => `${fmtSpecQty(q.qty)} ${esc(q.uom)}`.trim()).join(" + ") || "—"}${r.noQty && r.qty.length ? " *" : ""}</td></tr>`).join("")}</table>` : "";

  const { rows, colorways } = spec.colors;
  const colorTable = rows.length && colorways.length ? `<div style="font-size:12px;font-weight:700;margin:10px 0 4px;">ตารางสี</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;break-inside:avoid;"><tr><th style="${TH}">ส่วนประกอบ</th>${colorways.map((c, i) => `<th style="${TH}">${esc(c.name.trim() || `สีที่ ${i + 1}`)}</th>`).join("")}</tr>
${rows.map((r) => `<tr><td style="${TD}font-weight:600;">${esc(r.name || "—")}</td>${colorways.map((c) => {
    const cell = c.cells[r.key];
    return `<td style="${TD}">${chipHtml(cell, keyUrl)}${cell ? ` <span>${esc(cell.name || cell.hex || cell.sku_code || "")}</span><br><span style="font-size:9px;color:#94a3b8;margin-left:8.5mm;">${esc(SPEC_COLOR_SOURCE_LABEL[cell.source])}${cell.sku_code ? ` · ${esc(cell.sku_code)}` : ""}</span>` : ""}</td>`;
  }).join("")}</tr>`).join("")}</table>` : "";

  if (!figs && !colorTable) return `<div style="font-size:12px;color:#94a3b8;padding:8px;">— ยังไม่มีรายละเอียดงาน (เพิ่มได้ในแท็บ 📐 รายละเอียดงาน ของใบงาน) —</div>`;
  return `${figs}${pinTable}${sumTable}${colorTable}`;
}

/** เนื้อกลางใบพิมพ์โหมดรายละเอียดงาน (หัว/ท้ายใบ + CSS ยืมเทมเพลตหลัก เหมือนโหมดเน้น comment) */
export const DS_SPEC_BODY = `<table style="width:100%;font-size:12px;margin:10px 0;border-collapse:collapse;">
  <tr><td style="width:14%;color:#64748b;padding:3px 0;">ชื่องาน</td><td style="font-weight:600;">{{name}}</td><td style="width:14%;color:#64748b;">แบรนด์</td><td style="width:22%;">{{brand_name}}</td></tr>
  <tr><td style="color:#64748b;padding:3px 0;">วันที่สั่ง</td><td>{{order_date_th}}</td><td style="color:#64748b;">กำหนดเสร็จ</td><td>{{deadline_th}}</td></tr>
</table>
<div style="font-size:13px;font-weight:700;margin:2px 0 6px;">รายละเอียดงาน</div>
{{{spec_html}}}`;
