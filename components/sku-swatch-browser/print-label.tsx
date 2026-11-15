"use client";

/**
 * พิมพ์ป้ายแผงผ้า + QR — หน้า /print/swatch-label?ids=<id,id>&size=big|small (app/print/swatch-label/page.tsx เรียกตัวนี้)
 *   ป้ายใหญ่ (A6 · 4 ป้าย/A4): ชื่อแผ่น · รหัส · QR · สเปก · ร้านหลัก · รายการชิ้น (สี + รหัส + ชื่อสี + เลขบนแผง)
 *   ป้ายเล็ก (70×40 มม. · 21 ป้าย/A4): QR + ชื่อ + รหัส + จำนวนชิ้น
 *   QR ชี้ /s/<รหัสแผ่น> เสมอ (กฎ lib/scan-code — สแกนแล้วเปิดแผ่นในหน้า SKU แท็บ Swatch) · บันทึกประวัติพิมพ์ usePrintLog("swatch_label")
 * ข้อมูลอ่านจาก /api/sku-swatches?id= (ของกลางแผงผ้า — ห้ามหน้าอื่นยิงเอง)
 */
import { useEffect, useMemo, useState } from "react";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { usePrintLog } from "@/components/report/use-print-log";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { scanQrDataUrl, scanUrl } from "@/lib/scan-code";
import { docFileName } from "@/lib/print-filename";
import type { SwatchDetail } from "@/app/api/sku-swatches/route";
import { swatchTitle } from "./viewer";

import type { SwatchLabelSize } from "@/lib/sku-swatch";
export { swatchLabelUrl, type SwatchLabelSize } from "@/lib/sku-swatch";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const num = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("th-TH", { maximumFractionDigits: 2 }));

function specLine(d: SwatchDetail): string {
  return [d.material, d.weight != null ? `${num(d.weight)} ${d.weight_unit ?? ""}`.trim() : "", d.width_cm != null ? `หน้ากว้าง ${num(d.width_cm)} ซม.` : "", d.supplier_model ? `รุ่น ${d.supplier_model}` : ""].filter(Boolean).join(" · ");
}

export function renderSwatchLabelsHtml(boards: SwatchDetail[], qr: Map<string, string>, size: SwatchLabelSize, title: string): string {
  const labels = boards.map((d) => {
    const q = qr.get(d.id) ?? "";
    const code = d.name?.trim() ? (d.code ?? "") : "";   // ไม่มีชื่อ = หัวป้ายเป็นรหัสอยู่แล้ว ไม่ต้องซ้ำ
    if (size === "small") {
      return `<div class="lb sm"><img class="qr" src="${q}" alt=""><div class="tx"><div class="nm">${esc(swatchTitle(d))}</div><div class="cd">${esc(code)}</div><div class="mt">${d.spots.length} ชิ้น${d.material ? ` · ${esc(d.material)}` : ""}</div></div></div>`;
    }
    const chips = d.spots.slice(0, 64).map((s) => `<div class="ch"><span class="sw" style="background:${esc(s.color_hex ?? "#fff")}"></span><b>-${esc((s.code ?? "").split("-").pop())}</b> ${esc(s.name ?? "")}${s.label ? ` <i>(${esc(s.label)})</i>` : ""}</div>`).join("");
    const more = d.spots.length > 64 ? `<div class="more">… อีก ${d.spots.length - 64} ชิ้น (สแกน QR ดูครบ)</div>` : "";
    const shop = d.main_supplier ? `<div class="mt">ร้าน: ${esc(d.main_supplier.name)}</div>` : "";
    const spec = specLine(d);
    return `<div class="lb bg"><div class="hd"><div class="tx"><div class="nm">${esc(swatchTitle(d))}</div><div class="cd">${esc(code)}</div>${spec ? `<div class="mt">${esc(spec)}</div>` : ""}${shop}<div class="mt">${d.spots.length} ชิ้น · ผูก SKU ${d.linked_count}</div></div><img class="qr" src="${q}" alt=""></div><div class="chips">${chips}${more}</div><div class="ft">สแกน QR = เปิดแผงนี้ในระบบ</div></div>`;
  }).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4;margin:8mm}
    *{box-sizing:border-box}
    body{margin:0;font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#0f172a}
    .grid{display:grid;gap:0}
    .grid.bg{grid-template-columns:repeat(2,97mm)}
    .grid.sm{grid-template-columns:repeat(3,64mm)}
    .lb{border:1px dashed #94a3b8;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
    .lb.bg{height:138mm;padding:4mm;display:flex;flex-direction:column}
    .lb.sm{height:38mm;padding:2.5mm;display:flex;gap:2.5mm;align-items:center}
    .hd{display:flex;gap:3mm;align-items:flex-start}
    .hd .tx{flex:1;min-width:0}
    .lb.bg .qr{width:28mm;height:28mm}
    .lb.sm .qr{width:30mm;height:30mm;flex:none}
    .lb.sm .tx{min-width:0}
    .nm{font-size:13pt;font-weight:700;line-height:1.2;word-break:break-word}
    .lb.sm .nm{font-size:10pt}
    .cd{font-family:ui-monospace,Menlo,monospace;font-size:10pt;color:#334155;margin-top:.5mm}
    .mt{font-size:8pt;color:#475569;margin-top:.6mm}
    .chips{margin-top:2.5mm;flex:1;display:grid;grid-template-columns:1fr 1fr;gap:.6mm 2mm;align-content:start;font-size:7.5pt;line-height:1.25;overflow:hidden}
    .ch{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ch b{font-family:ui-monospace,Menlo,monospace;font-weight:600}
    .ch i{color:#64748b;font-style:normal}
    .sw{display:inline-block;width:3mm;height:3mm;border:.2mm solid #64748b;vertical-align:-.4mm;margin-right:.8mm}
    .more{grid-column:1/-1;color:#64748b}
    .ft{font-size:7pt;color:#94a3b8;text-align:right;margin-top:1mm}
  </style></head><body><div class="grid ${size === "small" ? "sm" : "bg"}">${labels}</div></body></html>`;
}

export function SwatchLabelPrint({ ids, size, onBack }: { ids: string[]; size: SwatchLabelSize; onBack: () => void }) {
  const [boards, setBoards] = useState<SwatchDetail[] | null>(null);
  const [qr, setQr] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sz, setSz] = useState<SwatchLabelSize>(size);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!idsKey) { setError("ไม่ได้เลือกแผ่น"); setBoards([]); return; }
    let alive = true;
    (async () => {
      const list: SwatchDetail[] = [];
      for (const id of idsKey.split(",").slice(0, 60)) {
        try {
          const j = await apiFetch(`/api/sku-swatches?id=${encodeURIComponent(id)}`).then((r) => r.json());
          if (j.swatch) list.push(j.swatch as SwatchDetail);
        } catch { /* ข้ามแผ่นที่โหลดไม่ได้ */ }
      }
      const codes = new Map<string, string>();
      for (const d of list) { try { codes.set(d.id, await scanQrDataUrl(scanUrl(d.code || d.id), { width: 360 })); } catch { /* ป้ายยังพิมพ์ได้ไม่มี QR */ } }
      if (!alive) return;
      setQr(codes); setBoards(list);
      if (!list.length) setError("ไม่พบแผ่นที่เลือก");
    })();
    return () => { alive = false; };
  }, [idsKey]);

  const fileName = docFileName("ป้ายแผงผ้า", boards?.length === 1 ? boards[0].code ?? swatchTitle(boards[0]) : `${boards?.length ?? 0} แผ่น`);
  const html = useMemo(() => (boards?.length ? renderSwatchLabelsHtml(boards, qr, sz, fileName) : ""), [boards, qr, sz, fileName]);
  const logItems = useMemo(() => (boards ?? []).map((d) => ({ doc_id: d.id, doc_no: d.code })), [boards]);
  usePrintLog("swatch_label", logItems);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={onBack} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon name="print" /> ป้ายแผงผ้า {boards && <><b>{boards.length}</b> แผ่น</>}</span>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          <button type="button" onClick={() => setSz("big")} aria-pressed={sz === "big"} className={`h-9 px-3 ${sz === "big" ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600"}`}>ป้ายใหญ่ + รายการชิ้น</button>
          <button type="button" onClick={() => setSz("small")} aria-pressed={sz === "small"} className={`h-9 px-3 border-l border-slate-200 ${sz === "small" ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600"}`}>ป้ายเล็ก (QR)</button>
        </div>
        <div className="flex-1" />
        <PrintDocLinkButton html={html} fileName={fileName} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">พิมพ์ / บันทึก PDF</PrintDocLinkButton>
      </div>
      <div className="px-4 py-6">
        {error && !boards?.length ? <div className="py-20 text-center text-red-500">{error}</div>
          : boards === null ? <div className="py-20 text-center text-slate-400">กำลังเตรียมป้าย…</div>
          : <PrintFrame html={html} fileName={fileName} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}
