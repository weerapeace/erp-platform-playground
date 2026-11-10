"use client";

/**
 * หน้าพิมพ์ใบวางบิล — พรีวิวซ้าย + แผงตั้งค่าการพิมพ์ขวา (ของกลาง DocPrintPanel)
 *   ปรับคอลัมน์ (กว้าง มม./ชื่อหัว/ลำดับ/เปิด-ปิด) · ลากขอบหัวคอลัมน์บนกระดาษ · ตัวอักษร/ระยะแถว/เส้น
 *   ไม่กดบันทึก = ใช้กับใบนี้ · "บันทึกเป็นค่าเริ่มต้น" = ทุกคน (ui_config doc_print_billing_note · สิทธิ์ so.edit)
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { attachColumnResize } from "@/components/report/list-print-frame";
import { DocPrintPanel, measureDocColumns, useDocPrintPrefs } from "@/components/doc-print-settings";
import { Icon } from "@/components/icon";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, buildReportHtmlMulti } from "@/lib/template";
import { buildBillingNoteData, type BillingNotePrintDoc } from "@/lib/billing-note-print";
import { defaultPrefs, DOC_COLUMNS, templateHasCopyLabel, withCopies, type DocPrintPrefs } from "@/lib/doc-print-prefs";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const ENTITY = "billing_note";
const FLEX_KEYS = new Set((DOC_COLUMNS[ENTITY] ?? []).filter((c) => c.flex).map((c) => c.key));
const halfMm = (mm: number) => Math.round(mm * 2) / 2;

export default function PrintBillingNotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc,       setDoc]       = useState<BillingNotePrintDoc | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const { prefs, setPrefs, saved, setSaved } = useDocPrintPrefs(ENTITY);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/billing-notes/${id}`).then(r => r.json()),
      apiFetch(`/api/admin/report-templates?entity_type=${ENTITY}`).then(r => r.json()),
    ])
      .then(([docRes, tplRes]) => {
        if (docRes.error) throw new Error(docRes.error);
        setDoc(docRes.data as BillingNotePrintDoc);
        setTemplates((tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  // พรีวิวหน่วง ~200ms — PrintFrame ใช้ srcDoc ทุกครั้งที่ html เปลี่ยน iframe โหลดใหม่ (ลากแถบเลื่อนแล้วไม่กระพริบรัว)
  const [viewPrefs, setViewPrefs] = useState<DocPrintPrefs | null>(null);
  useEffect(() => {
    if (!prefs) return;
    const t = setTimeout(() => setViewPrefs(prefs), viewPrefs ? 200 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- หน่วงตาม prefs อย่างเดียว
  }, [prefs]);

  const template = templates.find(t => t.id === prefs?.template_id)
    ?? templates.find(t => t.is_default) ?? templates[0] ?? null;
  const tableSupported = !!template && /\{\{\{\s*lines_table\s*\}\}\}/.test(
    `${template.header_html ?? ""}${template.body_html ?? ""}${template.footer_html ?? ""}`);
  const fileName = docFileName("ใบวางบิล", doc?.bill_number);

  const copySupported = templateHasCopyLabel(template);
  const html = useMemo(() => {
    if (!doc || !template) return "";
    const tpl = { paper_size: template.paper_size, orientation: template.orientation,
      header_html: template.header_html, body_html: template.body_html,
      footer_html: template.footer_html, custom_css: template.custom_css };
    // ต้นฉบับ + สำเนา (สวิตช์ในแผง) → 2 หน้า · ปิด = หน้าเดียว copy_label ว่าง (lib/doc-print-prefs withCopies)
    const p = viewPrefs ?? defaultPrefs(ENTITY);
    const pages = withCopies([buildBillingNoteData(doc, p)], p);
    return pages.length > 1 ? buildReportHtmlMulti(tpl, pages) : buildReportHtml(tpl, pages[0]);
  }, [doc, template, viewPrefs]);

  // ลากขอบหัวคอลัมน์บนพรีวิว → ตั้งความกว้าง (ตรึงคอลัมน์อื่นตามที่เห็น · "หมายเหตุ" ได้ที่เหลือเสมอ)
  const docRef = useRef<Document | null>(null);
  const onDocLoad = useCallback((d: Document) => {
    docRef.current = d;
    attachColumnResize(d, {
      table: ".doc-t",
      freeze: true,
      onResize: (key, mm, all) => setPrefs(p => {
        if (!p) return p;
        const widths = { ...(p.widths ?? {}) };
        for (const [k, v] of Object.entries(all ?? {})) if (!FLEX_KEYS.has(k)) widths[k] = halfMm(v);
        widths[key] = halfMm(mm);
        return { ...p, widths };
      }),
      onReset: (key) => setPrefs(p => {
        if (!p?.widths) return p;
        const widths = { ...p.widths };
        delete widths[key];
        return { ...p, widths: Object.keys(widths).length ? widths : undefined };
      }),
    });
  }, [setPrefs]);

  const autoFit = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const widths = measureDocColumns(d, ".doc-t");
    if (Object.keys(widths).length) setPrefs(p => (p ? { ...p, widths } : p));
  }, [setPrefs]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={fileName} />
      {!loading && doc && template && (
        <div className="no-print flex justify-end px-4 pt-3">
          <button type="button" onClick={() => setPanelOpen(v => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs ${panelOpen
              ? "border-blue-600 bg-blue-600 font-medium text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <Icon name="settings" /> ตั้งค่าการพิมพ์
          </button>
        </div>
      )}
      <div className="flex items-start gap-4 px-4 py-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
          ) : error || !doc ? (
            <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
          ) : !template ? (
            <div className="text-center py-20 text-amber-600">
              ⚠️ ยังไม่มี template สำหรับใบวางบิล — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
            </div>
          ) : (
            <PrintFrame html={html} fileName={fileName} fit onDocLoad={onDocLoad} />
          )}
        </div>
        {panelOpen && prefs && doc && template && (
          <aside className="no-print sticky top-16 w-80 shrink-0 max-h-[calc(100vh-5rem)] overflow-y-auto">
            <DocPrintPanel entityType={ENTITY} templates={templates} prefs={prefs} saved={saved}
              onChange={setPrefs} onSaved={setSaved} onAutoFit={autoFit} tableSupported={tableSupported} copySupported={copySupported} />
          </aside>
        )}
      </div>
    </div>
  );
}
