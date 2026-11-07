"use client";

/**
 * Report Builder (ลากวาง) — หน้าเดิม คงไว้ให้ลิงก์เก่าใช้ได้
 * ตัวออกแบบย้ายเป็นของกลาง components/pdfme-designer และมีในหน้า /admin/report-templates แล้ว (เลือกแม่แบบลากวาง / + ใหม่ → ลากวาง)
 * เก็บเทมเพลต JSON ของ pdfme ใน erp_report_templates (body_html) · เอกสาร: ใบสั่งงานผลิต (wo) · หน้าพิมพ์ /print/work-order
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { PdfmeDesigner, PdfmeFieldHint, isPdfmeJson, openPdfmeSample } from "@/components/pdfme-designer";
import type { ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const ENTITY = "wo";
const TEMPLATE_KEY = "wo_pdfme";

export default function ReportBuilderPage() {
  const canView = usePermission("reports.view");
  const canEdit = usePermission("admin.reports");
  const toast = useToast();

  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<string | null>(null);
  const jsonRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("ใบสั่งงานผลิต v1");
  const [rowId, setRowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/admin/report-templates?entity_type=${ENTITY}`);
        const j = (await res.json()) as ReportTemplatesResponse;
        const row = (j.data ?? []).find((t) => t.template_key === TEMPLATE_KEY && isPdfmeJson(t.body_html))
          ?? (j.data ?? []).find((t) => isPdfmeJson(t.body_html));
        if (row) { setInitial(row.body_html); jsonRef.current = row.body_html; setRowId(row.id); if (row.label) setLabel(row.label); }
      } catch { /* เริ่มจากกระดาษเปล่า */ }
      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async () => {
    if (!jsonRef.current) { toast.error("ยังไม่ได้วางอะไรบนกระดาษ"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rowId ?? undefined, entity_type: ENTITY, template_key: TEMPLATE_KEY, label,
          paper_size: "A4", orientation: "portrait",
          header_html: "", body_html: jsonRef.current, footer_html: "", custom_css: "",
          is_default: true, active: true, description: "pdfme",
        }),
      });
      const j = (await res.json()) as { data?: { id?: string }; error?: string | null };
      if (j.error) throw new Error(j.error);
      if (j.data?.id) setRowId(j.data.id);
      toast.success("บันทึกเทมเพลตแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [rowId, label, toast]);

  const downloadSample = useCallback(async () => {
    if (!jsonRef.current) return;
    try { await openPdfmeSample(jsonRef.current); }
    catch (e) { toast.error(e instanceof Error ? e.message : "สร้าง PDF ตัวอย่างไม่สำเร็จ"); }
  }, [toast]);

  if (!canView) return <AccessDenied />;

  return (
    <PlaygroundShell>
      <div className="max-w-[1400px] mx-auto px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">ตัวออกแบบรายงาน (ลากวาง)</h1>
            <p className="text-sm text-slate-500 mt-0.5">ตอนนี้ใช้ในหน้า <a href="/admin/report-templates" className="text-blue-600 hover:underline">แม่แบบเอกสาร</a> ได้แล้ว · เอกสาร: ใบสั่งงานผลิต</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadSample} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">PDF ตัวอย่าง</button>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ชื่อเทมเพลต" className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {canEdit && <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึกเทมเพลต"}</button>}
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50" style={{ height: "calc(100vh - 210px)", minHeight: 480 }}>
          {loaded && <PdfmeDesigner value={initial} onChange={(j) => { jsonRef.current = j; }} />}
        </div>
        <PdfmeFieldHint />
      </div>
    </PlaygroundShell>
  );
}
