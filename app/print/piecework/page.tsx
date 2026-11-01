"use client";

/**
 * พิมพ์ใบจ่ายงานเหมา — /print/piecework?batch=<id> (จ่ายชุดเดียวกัน) หรือ ?ids=a,b (เลือกเอง เช่น งานค้างของคนหนึ่ง)
 * 1 คน = 1 แผ่น · บันทึกประวัติพิมพ์ทุกแถว (usePrintLog "piecework")
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { usePrintLog } from "@/components/report/use-print-log";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { renderPieceworkSlipsHtml, pwGroupByPerson, type PwPrintRow } from "@/lib/piecework-print";
import { Icon } from "@/components/icon";

function PieceworkPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const batch = (sp.get("batch") ?? "").trim();
  const ids = (sp.get("ids") ?? "").trim();
  const [rows, setRows] = useState<PwPrintRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImages, setShowImages] = useState(true);

  useEffect(() => {
    if (!batch && !ids) { setError("ไม่ได้เลือกงานเหมาที่จะพิมพ์"); setRows([]); return; }
    let cancelled = false;
    apiFetch(`/api/mo/piecework/batch?${batch ? `batch=${encodeURIComponent(batch)}` : `ids=${encodeURIComponent(ids)}`}`)
      .then((r) => r.json())
      .then((j) => { if (cancelled) return; if (j.error) setError(j.error); setRows((j.data ?? []) as PwPrintRow[]); })
      .catch(() => { if (!cancelled) { setError("โหลดงานเหมาไม่สำเร็จ"); setRows([]); } });
    return () => { cancelled = true; };
  }, [batch, ids]);

  const people = useMemo(() => pwGroupByPerson(rows ?? []), [rows]);
  const fileName = docFileName("ใบจ่ายงานเหมา", people.length === 1 ? people[0].name : `${people.length} คน`);
  const html = useMemo(() => (rows && rows.length ? renderPieceworkSlipsHtml(rows, { title: fileName, batchLabel: batch ? batch.slice(0, 8) : null, showImages }) : ""), [rows, fileName, batch, showImages]);
  // 🖨 ประวัติการพิมพ์ — 1 แถวงานเหมา = 1 รายการ
  const logItems = useMemo(() => (rows ?? []).map((r) => ({ doc_id: r.id, doc_no: r.mo_no, qty: r.total_qty })), [rows]);
  usePrintLog("piecework", logItems);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon name="print" /> ใบจ่ายงานเหมา {rows && <><b>{people.length}</b> คน · {rows.length} รายการ</>}</span>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showImages} onChange={(e) => setShowImages(e.target.checked)} /> แสดงรูปสินค้า</label>
        <div className="flex-1" />
        <PrintDocLinkButton html={html} fileName={fileName}
          className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
          พิมพ์ / บันทึก PDF
        </PrintDocLinkButton>
      </div>
      <div className="px-4 py-6">
        {error && !rows?.length ? <div className="py-20 text-center text-red-500">{error}</div>
          : rows === null ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
          : rows.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีงานเหมาให้พิมพ์</div>
          : <PrintFrame html={html} fileName={fileName} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function PieceworkPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PieceworkPrintInner /></Suspense>;
}
