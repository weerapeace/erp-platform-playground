"use client";
/**
 * ✂️ ใบตัดผ้าลาย — /print/fabric-lay/<planId>
 *   1 หน้า = กระเป๋า 1 ใบ: ภาพสรุปตัวเดียวกับปุ่ม JPEG (summary-image) + ช่องเซ็นผู้ตัด/ผู้ตรวจ
 *   บันทึกประวัติพิมพ์ (usePrintLog "fabric_lay" · doc_id = แผน)
 */
import { useEffect, useMemo, useState } from "react";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { usePrintLog } from "@/components/report/use-print-log";
import { Icon } from "@/components/icon";
import { docFileName } from "@/lib/print-filename";
import { placeAll } from "@/lib/fabric-lay";
import { renderBagSummary } from "./summary-image";
import { API, api, bagImgUrl, imgUrl, type PlanFull } from "./shared";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function FabricLayPrintSheet({ id, onBack }: { id: string; onBack: () => void }) {
  const [plan, setPlan] = useState<PlanFull | null>(null);
  const [pages, setPages] = useState<{ label: string; url: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await api<PlanFull>(`${API}/plans/${id}`);
        if (!alive) return;
        setPlan(p);
        const f = p.fabric;
        if (!f?.image_key || !f.width_cm || !f.height_cm) throw new Error("ผ้าของแผนนี้ยังไม่ตั้งสเกล");
        const pats = Object.fromEntries((p.patterns ?? []).map((x) => [x.id, x]));
        const placed = placeAll(p.items ?? [], p.bags ?? [], pats, true);
        const out: { label: string; url: string }[] = [];
        for (const b of p.bags ?? []) {
          const pt = pats[b.pattern_id];
          const cv = await renderBagSummary({
            fabricUrl: imgUrl(f.image_key) ?? "", W: Number(f.width_cm), H: Number(f.height_cm), fabricName: f.name, planName: p.name, placed,
            bag: { key: b.key, label: b.label, color: b.color, name: pt?.name ?? "", image: bagImgUrl(pt?.bag_image, 900), note: pt?.note ?? null, pieces: pt?.pieces ?? [] },
          });
          out.push({ label: b.label, url: cv.toDataURL("image/jpeg", 0.85) });
        }
        if (alive) setPages(out);
      } catch (e) { if (alive) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setPages([]); } }
    })();
    return () => { alive = false; };
  }, [id]);

  const fileName = docFileName("ใบตัดผ้าลาย", plan ? `${plan.code} ${plan.name}` : id);
  const html = useMemo(() => {
    if (!plan || !pages?.length) return "";
    const date = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    const body = pages.map((pg) => `<section class="pg"><header><div class="t">ใบตัดผ้าลาย · ${esc(pg.label)}</div><div class="m">${esc(plan.code)} · พิมพ์ ${esc(date)}</div></header>
      <img src="${pg.url}" alt="">
      <div class="sign"><div>ผู้ตัด ........................................<br><span>วันที่ ......../......../........</span></div><div>ผู้ตรวจ ........................................</div></div></section>`).join("");
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(fileName)}</title><style>
      @page{size:A4;margin:8mm}body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;margin:0;color:#0f172a}
      .pg{page-break-after:always}.pg:last-child{page-break-after:auto}
      header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #0f172a;margin-bottom:4px}.t{font-size:16px;font-weight:700}.m{font-size:10px;color:#64748b}
      img{width:100%;max-height:255mm;object-fit:contain;display:block}
      .sign{display:flex;justify-content:space-between;margin-top:6px;font-size:11px}.sign span{font-size:9.5px;color:#64748b}
    </style></head><body>${body}</body></html>`;
  }, [plan, pages, fileName]);
  usePrintLog("fabric_lay", plan ? [{ doc_id: plan.id, doc_no: plan.code, qty: plan.bags?.length ?? null }] : []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button type="button" onClick={onBack} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon name="printer" /> ใบตัดผ้าลาย {plan && <><b>{plan.code}</b> · {plan.bags?.length ?? 0} ใบ</>}</span>
        <div className="flex-1" />
        {html && <PrintDocLinkButton html={html} fileName={fileName} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">พิมพ์ / บันทึก PDF</PrintDocLinkButton>}
      </div>
      <div className="px-4 py-6">
        {err ? <div className="py-20 text-center text-red-500">{err}</div>
          : pages === null ? <div className="py-20 text-center text-slate-400">กำลังสร้างใบตัดผ้า…</div>
          : !pages.length ? <div className="py-20 text-center text-slate-400">แผนนี้ยังไม่มีกระเป๋า</div>
          : <PrintFrame html={html} fileName={fileName} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}
