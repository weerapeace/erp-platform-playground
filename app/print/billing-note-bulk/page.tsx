"use client";
/**
 * พิมพ์ใบวางบิลหลายใบทีเดียว — /print/billing-note-bulk?ids=id1,id2,...
 *   ใช้หลังสร้างทีเดียวหลายใบ (แยกตามลูกค้า) · ต่อเป็นเอกสารเดียว ขึ้นหน้าใหม่ทุกใบ
 *
 * ⭐ ใช้แบบฟอร์ม + ค่าตั้งการพิมพ์ (คอลัมน์/ความกว้าง/ตัวอักษร) ชุดเดียวกับพิมพ์ทีละใบเสมอ
 *    (useDocPrintPrefs("billing_note") → buildBillingNoteData) — ปรับที่หน้าพิมพ์ทีละใบแล้วกดบันทึกเป็นค่าเริ่มต้น
 * ⭐⭐ สั่งพิมพ์ต้องใช้ printReportHtmlInNewWindow / PrintDocLinkButton (iframe พรีวิวไหลข้ามหน้ากระดาษไม่ได้)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { useDocPrintPrefs } from "@/components/doc-print-settings";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtmlMulti } from "@/lib/template";
import { buildBillingNoteData, type BillingNotePrintDoc } from "@/lib/billing-note-print";
import { withCopies } from "@/lib/doc-print-prefs";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

function BulkInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);
  const [docs, setDocs] = useState<BillingNotePrintDoc[] | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([]);
  const { prefs } = useDocPrintPrefs("billing_note");
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) { setError("ไม่ได้เลือกใบวางบิล"); setDocs([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const tplRes = await apiFetch("/api/admin/report-templates?entity_type=billing_note").then((r) => r.json());
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter((t) => t.active) ?? [];
        if (tpls.length === 0) throw new Error("ยังไม่มีแม่แบบใบวางบิล");
        if (!cancelled) setTemplates(tpls);
        const out: BillingNotePrintDoc[] = [];
        for (const id of ids) {
          const res = await apiFetch(`/api/billing-notes/${id}`).then((r) => r.json()).catch(() => ({ error: "load" }));
          if (!res.error && res.data) out.push(res.data as BillingNotePrintDoc);
          if (!cancelled) setDone((d) => d + 1);
        }
        if (!cancelled) setDocs(out);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    })();
    return () => { cancelled = true; };
  }, [ids]);

  // แม่แบบ: ตัวที่ตั้งไว้ > ตัวตั้งต้น > ตัวแรก (กติกาเดียวกับพิมพ์ทีละใบ)
  const tpl = useMemo(
    () => templates.find((t) => t.id === prefs?.template_id) ?? templates.find((t) => t.is_default) ?? templates[0] ?? null,
    [templates, prefs?.template_id],
  );
  const fileName = docFileName("ใบวางบิลรวม", `${ids.length} ใบ`);

  const html = useMemo(() =>
    (docs && docs.length && tpl && prefs)
      ? buildReportHtmlMulti(
          { paper_size: tpl.paper_size, orientation: tpl.orientation, header_html: tpl.header_html, body_html: tpl.body_html, footer_html: tpl.footer_html, custom_css: tpl.custom_css },
          // ต้นฉบับ + สำเนา → เรียงทีละใบ (ต้นฉบับ A · สำเนา A · ต้นฉบับ B …)
          withCopies(docs.map((d) => buildBillingNoteData(d, prefs)), prefs),
          fileName,
        )
      : "",
  [docs, tpl, prefs, fileName]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">พิมพ์ใบวางบิลรวม <b>{ids.length}</b> ใบ {docs === null && `(กำลังโหลด ${done}/${ids.length})`}</span>
        <span className="text-[11px] text-slate-400">ใช้ค่าตั้งการพิมพ์ที่บันทึกไว้ (ปรับได้ที่หน้าพิมพ์ทีละใบ)</span>
        <div className="flex-1" />
        <PrintDocLinkButton html={html} fileName={fileName}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
          <Icon name="print" /> พิมพ์ / บันทึก PDF
        </PrintDocLinkButton>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : docs === null ? <div className="py-20 text-center text-slate-400">กำลังโหลด {done}/{ids.length}…</div>
          : docs.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีเอกสารให้พิมพ์</div>
          : <PrintFrame html={html} fileName={fileName} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function BulkPrintBillingNotePage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><BulkInner /></Suspense>;
}
