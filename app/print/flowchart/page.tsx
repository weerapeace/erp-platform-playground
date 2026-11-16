"use client";

/**
 * พิมพ์กระดาน flowchart กลาง (FlowchartBoard) เป็นกระดาษ / PDF — /print/flowchart?type=<entity_type>&id=<entity_id>&name=<ชื่อ>
 * 1 หน้า A4 แนวนอน · ย่อให้พอดีหน้า · วาดจาก lib/flowchart ชุดเดียวกับปุ่ม "บันทึกเป็นรูป" (components/flowchart-board/export-html)
 * สิทธิ์ = สิทธิ์ดูกระดานนั้น (server ตัดสินใน /api/canvas-sketch ตามชนิดกระดาน)
 * ของกลาง: ระบบพิมพ์ (buildReportHtmlMulti + PrintFrame) — สั่งพิมพ์แล้วเลือก "บันทึกเป็น PDF" ได้
 * ใช้โดย: ปุ่ม "พิมพ์ / PDF" บนแถบกระดาน (เช่น /master/storage-plan)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { LoadingState, ErrorState } from "@/components/state-views";
import { flowSceneToHtml } from "@/components/flowchart-board/export-html";
import { apiFetch } from "@/lib/api";
import { parseFlowScene, type FlowScene } from "@/lib/flowchart";
import { shortcutKey } from "@/lib/shortcut-key";
import { buildReportHtmlMulti, type ReportTemplate } from "@/lib/template";

/** พื้นที่วาดบน A4 แนวนอน (px ที่ 96 dpi · หักหัวกระดาษแล้ว) */
const AREA_W = 1040, AREA_H = 610;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "landscape",
  header_html: `<div class="hd"><div class="t1">{{title}}</div><div class="t2">พิมพ์ {{printed_at}}</div></div>`,
  body_html: `{{{body}}}`,
  footer_html: "",
  custom_css: `
.hd { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111827; padding-bottom:2mm; margin-bottom:3mm; }
.t1 { font-size:17px; font-weight:800; color:#111827; }
.t2 { font-size:10px; color:#6b7280; }
.fc-wrap { position:relative; overflow:hidden; margin:0 auto; }
.fc-empty { padding:20mm; text-align:center; color:#9ca3af; font-size:13px; }`,
};

/** กระดาน → html หน้าเดียว (ย่อให้พอดี ไม่ขยายเกิน 100%) */
function flowchartPrintBody(scene: FlowScene): string {
  if (!scene.nodes.length) return `<div class="fc-empty">กระดานยังว่าง</div>`;
  const { html, width, height } = flowSceneToHtml(scene);
  const k = Math.min(1, AREA_W / width, AREA_H / height);
  return `<div class="fc-wrap" style="width:${Math.ceil(width * k)}px;height:${Math.ceil(height * k)}px">`
    + `<div style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform:scale(${k});transform-origin:top left">${html}</div></div>`;
}

function FlowchartPrint() {
  const sp = useSearchParams();
  const type = sp.get("type") ?? "", id = sp.get("id") ?? "";
  const name = (sp.get("name") || "แผนผัง").slice(0, 80);
  const [scene, setScene] = useState<FlowScene | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!type || !id) { setErr("ลิงก์ไม่ครบ (ต้องมี type และ id)"); return; }
    let alive = true;
    apiFetch(`/api/canvas-sketch?entity_type=${encodeURIComponent(type)}&entity_id=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || j?.error) { setErr(j?.error || "โหลดแผนผังไม่สำเร็จ (อาจไม่มีสิทธิ์ดู)"); return; }
        const s = parseFlowScene(j?.data?.scene);
        if (!s) { setErr("กระดานนี้ไม่ใช่แผนผังแบบ flowchart"); return; }
        setScene(s);
      })
      .catch(() => { if (alive) setErr("โหลดแผนผังไม่สำเร็จ กรุณาลองใหม่"); });
    return () => { alive = false; };
  }, [type, id]);

  const html = useMemo(() => {
    if (!scene) return "";
    const printed = new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    return buildReportHtmlMulti(TEMPLATE, [{ title: name, printed_at: printed, body: flowchartPrintBody(scene) }], name);
  }, [scene, name]);

  useEffect(() => {
    if (!html) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") { e.preventDefault(); printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  if (err) return <div className="min-h-screen bg-slate-100 p-6"><ErrorState title="พิมพ์แผนผังไม่ได้" hint={err} /></div>;
  if (!scene) return <div className="min-h-screen bg-slate-100 p-6"><LoadingState className="text-sm" /></div>;
  return (
    <div className="min-h-screen bg-slate-100 py-4">
      <div className="mx-auto mb-3 flex max-w-[1180px] flex-wrap items-center gap-2 px-4">
        <div className="flex-1 text-sm text-slate-600">พิมพ์ “{name}” — A4 แนวนอน 1 หน้า · สั่งพิมพ์แล้วเลือก “บันทึกเป็น PDF” ได้</div>
        <button type="button" onClick={() => printReportHtmlInNewWindow(html)} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm text-white">พิมพ์ / บันทึก PDF</button>
      </div>
      <PrintFrame html={html} maxWidth={1180} />
    </div>
  );
}

export default function FlowchartPrintPage() {
  return <Suspense fallback={null}><FlowchartPrint /></Suspense>;
}
