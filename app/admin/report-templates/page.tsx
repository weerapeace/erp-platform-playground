"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

// ---- Sample data for each entity_type ----

const SAMPLE_DATA: Record<string, Record<string, unknown>> = {
  pr: {
    pr_number:      "PR-2026-00042",
    title:          "ของใช้สำนักงาน เดือน พ.ค.",
    requester_name: "สมชาย ใจดี",
    department:     "จัดซื้อ",
    status_label:   "อนุมัติแล้ว",
    created_at_th:  "30 พ.ค. 2026",
    approver_name:  "วรเปรซ แอดมิน",
    note:           "ส่งก่อนสิ้นเดือน",
    total_amount:   "12,540.00",
    lines: [
      { sku: "SKU-001", product_name: "กระดาษ A4 80gsm", qty: 5,  unit: "รีม",  unit_price: "120.00", line_total: "600.00" },
      { sku: "SKU-002", product_name: "ปากกาลูกลื่น",      qty: 12, unit: "กล่อง", unit_price: "85.00",  line_total: "1,020.00" },
      { sku: "SKU-003", product_name: "หมึกพิมพ์ HP 680",   qty: 4,  unit: "ชิ้น",  unit_price: "780.00", line_total: "3,120.00" },
    ],
  },
};

const ENTITY_LABELS: Record<string, string> = {
  pr: "🛒 ใบขอซื้อ", po: "📦 ใบสั่งซื้อ", invoice: "💰 ใบแจ้งหนี้", qc: "🔍 QC",
};

// ============================================================
// Page
// ============================================================

export default function AdminReportTemplatesPage() {
  const canView = usePermission("reports.view");
  const canEdit = usePermission("admin.reports");
  const { user } = useAuth();

  const [items,   setItems]   = useState<ReportTemplateRow[]>([]);
  const [selected,setSelected]= useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // form state
  const [draft, setDraft] = useState<ReportTemplateRow | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ReportTemplateRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates");
      const json: ReportTemplatesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.data);
      if (!selected && json.data.length > 0) setSelected(json.data[0].id);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // sync draft when selected changes
  useEffect(() => {
    const item = items.find(x => x.id === selected);
    setDraft(item ? { ...item } : null);
    setDirty(false);
  }, [items, selected]);

  // preview rendering
  const previewHtml = useMemo(() => {
    if (!draft) return "";
    const data = SAMPLE_DATA[draft.entity_type] ?? {};
    return buildReportHtml(
      {
        paper_size:  draft.paper_size,
        orientation: draft.orientation,
        header_html: draft.header_html,
        body_html:   draft.body_html,
        footer_html: draft.footer_html,
        custom_css:  draft.custom_css,
      },
      data,
    );
  }, [draft]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const update = (patch: Partial<ReportTemplateRow>) => {
    setDraft(d => d ? { ...d, ...patch } : d); setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึก template แล้ว");
      setDirty(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const remove = async (t: ReportTemplateRow) => {
    try {
      const res = await apiFetch(`/api/admin/report-templates?id=${t.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ template แล้ว");
      if (selected === t.id) setSelected(items.find(x => x.id !== t.id)?.id ?? null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  const createNew = async () => {
    const newRow = {
      entity_type: "pr", template_key: `custom_${Date.now()}`, label: "Template ใหม่",
      description: null, paper_size: "A4", orientation: "portrait",
      header_html: "<h1>Header</h1>", body_html: "<p>Body</p>", footer_html: "<p>Footer</p>",
      custom_css: "", is_default: false, active: true, actor: user?.name,
    };
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("สร้าง template ใหม่");
      await load();
      setSelected(json.data?.id ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ"); }
  };

  return (
    <PlaygroundShell>
      <div className="max-w-[1400px] mx-auto px-6 py-4 h-screen flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Report Templates</h1>
            <p className="text-sm text-slate-500 mt-0.5">แก้ template + preview สดด้วย sample data</p>
          </div>
          {canEdit && (
            <button onClick={createNew}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + Template ใหม่
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
          {/* Left list */}
          <aside className="col-span-2 bg-white border border-slate-200 rounded-xl overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2">{[0,1,2].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : items.map(t => (
              <button key={t.id} onClick={() => {
                if (dirty && !confirm("มีข้อมูลยังไม่บันทึก ต้องการทิ้งหรือไม่?")) return;
                setSelected(t.id);
              }} className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                selected === t.id ? "bg-blue-50" : ""
              }`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{ENTITY_LABELS[t.entity_type]?.split(" ")[0] ?? "📄"}</span>
                  <span className="text-xs font-medium text-slate-800 truncate flex-1">{t.label}</span>
                  {t.is_default && <span className="text-amber-500 text-xs">★</span>}
                </div>
                <code className="text-[10px] text-slate-400">{t.template_key}</code>
                {!t.active && <span className="text-[10px] text-red-500 ml-1">ปิดอยู่</span>}
              </button>
            ))}
          </aside>

          {/* Editor */}
          <section className="col-span-5 bg-white border border-slate-200 rounded-xl flex flex-col min-h-0">
            {draft ? (
              <>
                {/* Header */}
                <div className="p-3 border-b border-slate-100 grid grid-cols-2 gap-2">
                  <input value={draft.label} onChange={e => update({ label: e.target.value })} disabled={!canEdit}
                    className="h-8 px-2.5 text-sm border border-slate-200 rounded col-span-2 disabled:bg-slate-50" />
                  <select value={draft.entity_type} onChange={e => update({ entity_type: e.target.value })} disabled={!canEdit}
                    className="h-8 px-2 text-xs border border-slate-200 rounded bg-white">
                    <option value="pr">PR</option><option value="po">PO</option>
                    <option value="invoice">Invoice</option><option value="qc">QC</option>
                  </select>
                  <code className="h-8 px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded font-mono">{draft.template_key}</code>
                  <select value={draft.paper_size} onChange={e => update({ paper_size: e.target.value as ReportTemplateRow["paper_size"] })} disabled={!canEdit}
                    className="h-8 px-2 text-xs border border-slate-200 rounded bg-white">
                    <option>A4</option><option>A5</option><option>Letter</option>
                  </select>
                  <select value={draft.orientation} onChange={e => update({ orientation: e.target.value as ReportTemplateRow["orientation"] })} disabled={!canEdit}
                    className="h-8 px-2 text-xs border border-slate-200 rounded bg-white">
                    <option value="portrait">📄 ตั้ง</option><option value="landscape">📃 นอน</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs col-span-2">
                    <input type="checkbox" checked={draft.is_default} onChange={e => update({ is_default: e.target.checked })} disabled={!canEdit} />
                    Default ·
                    <input type="checkbox" checked={draft.active} onChange={e => update({ active: e.target.checked })} disabled={!canEdit} />
                    เปิดใช้งาน
                  </label>
                </div>

                {/* HTML editors — vertical split */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <CodeBlock label="Header HTML" value={draft.header_html} onChange={v => update({ header_html: v })} disabled={!canEdit} rows={4} />
                  <CodeBlock label="Body HTML"   value={draft.body_html}   onChange={v => update({ body_html: v })}   disabled={!canEdit} rows={10} />
                  <CodeBlock label="Footer HTML" value={draft.footer_html} onChange={v => update({ footer_html: v })} disabled={!canEdit} rows={3} />
                  <CodeBlock label="Custom CSS"  value={draft.custom_css}  onChange={v => update({ custom_css: v })}  disabled={!canEdit} rows={6} />
                </div>

                {/* Footer actions */}
                <div className="p-2.5 border-t border-slate-100 flex items-center gap-2">
                  {canEdit && (
                    <button onClick={save} disabled={!dirty || saving}
                      className="h-8 px-4 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "กำลังบันทึก..." : dirty ? "บันทึก" : "บันทึกแล้ว ✓"}
                    </button>
                  )}
                  <div className="flex-1" />
                  {canEdit && (
                    <button onClick={() => setDeleteTarget(draft)}
                      className="h-8 px-3 text-xs text-red-600 hover:bg-red-50 rounded">ลบ</button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">เลือก template ทางซ้าย</div>
            )}
          </section>

          {/* Preview */}
          <section className="col-span-5 bg-slate-100 border border-slate-200 rounded-xl flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">👁 Preview (sample data)</span>
              <span className="text-[10px] text-slate-400">{draft?.paper_size} · {draft?.orientation}</span>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {draft ? (
                <iframe srcDoc={previewHtml} className="w-full h-full bg-white border border-slate-200 shadow-sm rounded"
                  style={{ minHeight: 600 }} />
              ) : (
                <div className="text-center text-sm text-slate-400 py-12">เลือก template เพื่อดู preview</div>
              )}
            </div>
          </section>
        </div>

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ Template" message={`ลบ "${deleteTarget?.label}" ใช่ไหม?`}
        confirmText="ลบ" cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget); }} variant="danger" />
    </PlaygroundShell>
  );
}

// ---- Code block textarea ----
function CodeBlock({ label, value, onChange, disabled, rows = 6 }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <textarea value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        rows={rows} spellCheck={false}
        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
      />
    </div>
  );
}
