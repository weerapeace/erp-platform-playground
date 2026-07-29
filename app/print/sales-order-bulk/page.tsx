"use client";

/**
 * พิมพ์ใบเสร็จ/ใบกำกับภาษีหลายใบทีเดียว — /print/sales-order-bulk?ids=id1,id2,...
 * โหลด SO แต่ละใบ → ต่อเป็นเอกสารเดียว (ขึ้นหน้าใหม่ทุกใบ) ด้วยแม่แบบใบกำกับภาษี (is_default)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtmlMulti } from "@/lib/template";
import { buildSoData, type SODetailExt } from "@/app/print/sales-order/[id]/page";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

function BulkInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [tpl,  setTpl]  = useState<ReportTemplateRow | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) { setError("ไม่ได้เลือก SO"); setData([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const tplRes = await apiFetch("/api/admin/report-templates?entity_type=so").then((r) => r.json());
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter((t) => t.active) ?? [];
        const template = tpls.find((t) => t.is_default) ?? tpls.find((t) => t.template_key !== "delivery-note") ?? tpls[0] ?? null;
        if (!template) throw new Error("ยังไม่มีแม่แบบใบกำกับภาษี");
        if (!cancelled) setTpl(template);
        const out: Record<string, unknown>[] = [];
        for (const id of ids) {
          const soRes = await apiFetch(`/api/sales-orders/${id}`).then((r) => r.json()).catch(() => ({ error: "load" }));
          if (soRes.error || !soRes.data) { setDone((d) => d + 1); continue; }
          out.push(buildSoData(soRes.data as SODetailExt));
          if (!cancelled) setDone((d) => d + 1);
        }
        if (!cancelled) setData(out);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    })();
    return () => { cancelled = true; };
  }, [ids]);

  const html = useMemo(() =>
    (data && data.length && tpl)
      ? buildReportHtmlMulti(
          { paper_size: tpl.paper_size, orientation: tpl.orientation, header_html: tpl.header_html, body_html: tpl.body_html, footer_html: tpl.footer_html, custom_css: tpl.custom_css },
          data,
        )
      : "",
  [data, tpl]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🧾 พิมพ์ใบกำกับภาษีรวม <b>{ids.length}</b> ใบ {data === null && `(กำลังโหลด ${done}/${ids.length})`}</span>
        <div className="flex-1" />
        <button onClick={() => printReportFrameOrWindow()} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : data === null ? <div className="py-20 text-center text-slate-400">กำลังโหลด {done}/{ids.length}…</div>
          : data.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีเอกสารให้พิมพ์</div>
          : <PrintFrame html={html} />}
      </div>
    </div>
  );
}

export default function BulkPrintSalesOrderPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><BulkInner /></Suspense>;
}
