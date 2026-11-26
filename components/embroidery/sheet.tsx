"use client";
/**
 * 🧵 ใบสั่งปัก (ข้อเสนอ 2) — /print/embroidery/<id>
 *   รูปฝีเข็ม + ขนาดจริง + ลำดับสีด้าย (รหัสด้าย/จำนวนฝี) + จำนวนฝีรวม/เปลี่ยนด้าย/เวลา + หมายเหตุ + สินค้าที่ผูก — แนบไปกับไฟล์ .DST
 *   ใช้ PrintFrame / PrintDocLinkButton กลาง · บันทึกประวัติพิมพ์ usePrintLog("emb_sheet")
 */
import { useEffect, useMemo, useState } from "react";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { usePrintLog } from "@/components/report/use-print-log";
import { Icon } from "@/components/icon";
import { docFileName } from "@/lib/print-filename";
import { buildPlan, cleanSettings, dstFileName, STITCH_TYPES, type EmbPlan } from "@/lib/embroidery";
import { API, api, downloadDst, fmtNum, thaiDate, type Design } from "./shared";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** วาดฝีเข็มลงแคนวาสนอกจอ → รูป PNG (พื้นขาว) */
function planImage(plan: EmbPlan, px = 1400): string {
  const cv = document.createElement("canvas");
  const r = plan.height / Math.max(plan.width, 0.01);
  cv.width = px; cv.height = Math.max(200, Math.round(px * Math.min(r, 1.4)));
  const g = cv.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
  const pad = 30, k = Math.min((cv.width - pad * 2) / plan.width, (cv.height - pad * 2) / plan.height);
  const ox = cv.width / 2, oy = cv.height / 2;
  g.lineWidth = Math.max(1, 0.35 * k); g.lineCap = "round";
  let ci = 0, px0 = 0, py0 = 0;
  g.strokeStyle = plan.colors[0]?.color ?? "#000"; g.beginPath();
  for (const c of plan.cmds) {
    const x = ox + c.x * k, y = oy + c.y * k;
    if (c.t === "stitch") { g.moveTo(px0, py0); g.lineTo(x, y); }
    else if (c.t === "color") { g.stroke(); ci++; g.strokeStyle = plan.colors[ci]?.color ?? "#000"; g.beginPath(); }
    px0 = x; py0 = y;
  }
  g.stroke();
  return cv.toDataURL("image/png");
}

export function renderSheetHtml(d: Design, plan: EmbPlan, img: string, fileName: string): string {
  const typeCount = (color: string) => {
    const by = new Map<string, number>();
    for (const p of plan.pieces) if (p.color === color && p.type !== "skip") by.set(p.type, (by.get(p.type) ?? 0) + 1);
    return [...by].map(([t, n]) => `${STITCH_TYPES.find((x) => x.key === t)?.th ?? t} ${n}`).join(", ");
  };
  const rows = plan.colors.map((c, i) => `<tr><td class="c">${i + 1}</td><td><span class="sw" style="background:${c.color}"></span> ${esc(c.color)}</td><td>${esc(c.thread || "—")}</td><td>${esc(typeCount(c.color))}</td><td class="r">${fmtNum(c.stitches)}</td></tr>`).join("");
  const warns = plan.pieces.filter((p) => p.warn);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileName)}</title><style>
  @page{size:A4;margin:12mm} body{font-family:Sarabun,"Noto Sans Thai",sans-serif;color:#111;margin:0;background:#f1f5f9}
  .doc{width:186mm;margin:0 auto;background:#fff;padding:8mm;box-sizing:border-box} @media print{body{background:#fff}.doc{padding:0}}
  h1{font-size:18pt;margin:0} .muted{color:#64748b;font-size:9.5pt} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:4mm 0}
  .box{border:1px solid #e2e8f0;border-radius:2mm;padding:2mm 3mm} .box b{display:block;font-size:13pt}
  img{width:100%;max-height:120mm;object-fit:contain;border:1px solid #e2e8f0;border-radius:2mm}
  table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:3mm} th,td{border-bottom:1px solid #e2e8f0;padding:1.5mm 2mm;text-align:left} th{background:#f8fafc}
  .r{text-align:right}.c{text-align:center;width:8mm} .sw{display:inline-block;width:4mm;height:4mm;border:1px solid #0002;vertical-align:-0.6mm;border-radius:1mm}
  .warn{margin-top:3mm;font-size:9pt;color:#92400e;border:1px solid #fde68a;background:#fffbeb;border-radius:2mm;padding:2mm 3mm}
  </style></head><body><div class="doc">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:4mm">
    <div><h1>ใบสั่งปัก ${esc(d.code)}</h1><div style="font-size:12pt;margin-top:1mm">${esc(d.name)}</div></div>
    <div class="muted" style="text-align:right">ไฟล์เครื่องปัก: <b>${esc(dstFileName(d.code, d.name))}</b><br>พิมพ์ ${esc(thaiDate(new Date().toISOString()))}</div>
  </div>
  ${d.parent ? `<div class="muted" style="margin-top:1mm">สินค้า: ${esc(d.parent.code)} ${esc(d.parent.name)}</div>` : ""}
  <div class="grid">
    <div class="box"><span class="muted">ขนาดจริง (กว้าง × สูง)</span><b>${(plan.width / 10).toFixed(1)} × ${(plan.height / 10).toFixed(1)} ซม.</b></div>
    <div class="box"><span class="muted">จำนวนฝีเข็ม</span><b>${fmtNum(plan.stitches)}</b></div>
    <div class="box"><span class="muted">สีด้าย / เปลี่ยนด้าย</span><b>${plan.colors.length} / ${plan.colorChanges}</b></div>
    <div class="box"><span class="muted">เวลาปักโดยประมาณ</span><b>~${Math.max(1, Math.round(plan.minutes))} นาที</b></div>
  </div>
  ${img ? `<img src="${img}" alt="ตัวอย่างฝีเข็ม">` : ""}
  <table><thead><tr><th class="c">ลำดับ</th><th>สี</th><th>รหัสด้าย</th><th>ชนิดฝีเข็ม (ชิ้น)</th><th class="r">ฝีเข็ม</th></tr></thead><tbody>${rows}</tbody></table>
  ${d.note ? `<div class="box" style="margin-top:3mm"><span class="muted">หมายเหตุ</span><div>${esc(d.note).replace(/\n/g, "<br>")}</div></div>` : ""}
  ${warns.length ? `<div class="warn">ส่วนที่อาจปักไม่ชัด ${warns.length} จุด: ${warns.slice(0, 8).map((w) => esc(`${w.name} (${w.warn})`)).join(" · ")}</div>` : ""}
  <p class="muted" style="margin-top:4mm">ไฟล์แปลงอัตโนมัติจากลายเวกเตอร์ (ยังไม่มีฝีรองพื้น) — รบกวนปักทดสอบ 1 ชิ้นก่อนผลิตจริง · ไฟล์ .DST ไม่เก็บสี ใช้ลำดับสีตามตารางนี้</p>
  </div></body></html>`;
}

export function EmbroiderySheet({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Design | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<Design>(`${API}/${id}`).then((x) => { if (alive) setD(x); }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [id]);
  const plan = useMemo(() => (d ? buildPlan(d.pieces, cleanSettings(d.settings, d.pieces)) : null), [d]);
  const fileName = d ? docFileName("ใบสั่งปัก", d.code) : "ใบสั่งปัก";
  const html = useMemo(() => (d && plan ? renderSheetHtml(d, plan, planImage(plan), fileName) : ""), [d, plan, fileName]);
  const logItems = useMemo(() => (d ? [{ doc_id: d.id, doc_no: d.code }] : []), [d]);
  usePrintLog("emb_sheet", logItems);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 md:px-6">
        <button onClick={onBack} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon name="print" /> ใบสั่งปัก {d && <b>{d.code}</b>}</span>
        <div className="flex-1" />
        {d && plan && (
          <button type="button" onClick={() => downloadDst(plan, d.code, d.name)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="download" /> .DST
          </button>
        )}
        <PrintDocLinkButton html={html} fileName={fileName} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">พิมพ์ / บันทึก PDF</PrintDocLinkButton>
      </div>
      <div className="px-2 py-6 md:px-4">
        {err ? <div className="py-20 text-center text-red-500">{err}</div>
          : !html ? <div className="py-20 text-center text-slate-400">กำลังเตรียมใบสั่งปัก…</div>
          : <PrintFrame html={html} fileName={fileName} fit onPrint={() => printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}
