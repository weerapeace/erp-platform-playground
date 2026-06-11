"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import {
  DEFAULT_QUOTATION_TEMPLATE,
  REPORT_ENTITY_OPTIONS,
  buildDesignerDescription,
  buildTableHtml,
  fieldToken,
  getReportEntityDef,
  inferTemplateStatus,
  parseDesignerDescription,
  statusClass,
  statusLabel,
  type ReportTableColumnDef,
  type TemplateStatus,
} from "@/lib/report-designer";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

type EditorTarget = "header_html" | "body_html" | "footer_html" | "custom_css";

type DraftTemplate = ReportTemplateRow & {
  description_note?: string;
};

const TARGET_LABEL: Record<EditorTarget, string> = {
  header_html: "หัวเอกสาร",
  body_html: "เนื้อหา",
  footer_html: "ท้ายเอกสาร",
  custom_css: "CSS",
};

function emptyTemplate(actor?: string): Omit<ReportTemplateRow, "id" | "created_at" | "updated_at"> & { actor?: string } {
  const meta = { status: "draft" as TemplateStatus, version: 1, updated_by: actor ?? null };
  return {
    entity_type: "qt",
    template_key: `qt_custom_${Date.now()}`,
    label: "ใบเสนอราคา v1",
    description: buildDesignerDescription(meta, ""),
    paper_size: "A4",
    orientation: "portrait",
    header_html: DEFAULT_QUOTATION_TEMPLATE.header_html,
    body_html: DEFAULT_QUOTATION_TEMPLATE.body_html,
    footer_html: DEFAULT_QUOTATION_TEMPLATE.footer_html,
    custom_css: DEFAULT_QUOTATION_TEMPLATE.custom_css,
    is_default: false,
    active: false,
    actor,
  };
}

function normalizeDraft(row: ReportTemplateRow): DraftTemplate {
  const parsed = parseDesignerDescription(row.description);
  return {
    ...row,
    description: row.description,
    description_note: parsed.note,
  };
}

function preparePayload(draft: DraftTemplate, status: TemplateStatus, actor?: string) {
  const current = parseDesignerDescription(draft.description).meta;
  return {
    ...draft,
    description: buildDesignerDescription({
      ...current,
      status,
      version: Number(current.version || 1),
      updated_by: actor ?? current.updated_by ?? null,
    }, draft.description_note ?? ""),
    active: status === "published",
    is_default: status === "published",
    actor,
  };
}

export default function AdminReportTemplatesPage() {
  const canView = usePermission("reports.view");
  const canEdit = usePermission("admin.reports");
  const { user } = useAuth();

  const [items, setItems] = useState<ReportTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportTemplateRow | null>(null);
  const [target, setTarget] = useState<EditorTarget>("body_html");
  const [previewMax, setPreviewMax] = useState(false);   // ขยาย preview เต็มจอ
  const [tableKey, setTableKey] = useState("lines");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    "idx",
    "sku",
    "product_name",
    "image_html",
    "qty",
    "unit",
    "unit_price",
    "line_total",
  ]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const entityDef = getReportEntityDef(draft?.entity_type ?? "qt");
  const tableDef = entityDef.tables.find(table => table.key === tableKey) ?? entityDef.tables[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates");
      const json: ReportTemplatesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.data);
      setSelectedId(prev => prev ?? json.data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด template ไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  useEffect(() => {
    const current = items.find(item => item.id === selectedId);
    setDraft(current ? normalizeDraft(current) : null);
    setDirty(false);
  }, [items, selectedId]);

  useEffect(() => {
    if (!draft) return;
    const nextEntity = getReportEntityDef(draft.entity_type);
    const nextTable = nextEntity.tables[0];
    setTableKey(nextTable?.key ?? "lines");
    setSelectedColumns(nextTable?.columns.map(col => col.key) ?? []);
  }, [draft?.entity_type]);

  const previewHtml = useMemo(() => {
    if (!draft) return "";
    return buildReportHtml({
      paper_size: draft.paper_size,
      orientation: draft.orientation,
      header_html: draft.header_html,
      body_html: draft.body_html,
      footer_html: draft.footer_html,
      custom_css: draft.custom_css,
    }, entityDef.sampleData);
  }, [draft, entityDef.sampleData]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const update = (patch: Partial<DraftTemplate>) => {
    setDraft(prev => prev ? { ...prev, ...patch } : prev);
    setDirty(true);
  };

  const insertText = (text: string) => {
    if (!draft || !canEdit) return;
    const value = draft[target] ?? "";
    update({ [target]: `${value}${value.endsWith("\n") || value.length === 0 ? "" : "\n"}${text}` } as Partial<DraftTemplate>);
  };

  const saveAsStatus = async (status: TemplateStatus) => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preparePayload(draft, status, user?.name)),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(status === "published" ? "Publish แล้ว ใช้เป็น template จริง" : "บันทึกแล้ว");
      setDirty(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const createNew = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emptyTemplate(user?.name)),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("สร้าง template draft ใหม่แล้ว");
      await load();
      setSelectedId(json.data?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง template ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const duplicateVersion = async () => {
    if (!draft) return;
    const current = parseDesignerDescription(draft.description).meta;
    const nextVersion = Number(current.version || 1) + 1;
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          id: undefined,
          template_key: `${draft.template_key}_v${nextVersion}_${Date.now()}`,
          label: `${draft.label} v${nextVersion}`,
          description: buildDesignerDescription({
            status: "draft",
            version: nextVersion,
            base_template_id: draft.id,
            updated_by: user?.name ?? null,
          }, draft.description_note ?? ""),
          active: false,
          is_default: false,
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("คัดลอกเป็นเวอร์ชันใหม่แล้ว");
      await load();
      setSelectedId(json.data?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "คัดลอกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!draft) return;
    await saveAsStatus("archived");
  };

  const remove = async (row: ReportTemplateRow) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/report-templates?id=${row.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ template แล้ว");
      setSelectedId(items.find(item => item.id !== row.id)?.id ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]);
  };

  const moveColumn = (key: string, direction: -1 | 1) => {
    setSelectedColumns(prev => {
      const index = prev.indexOf(key);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const groupedFields = entityDef.fields.reduce<Record<string, typeof entityDef.fields>>((acc, field) => {
    acc[field.group] = acc[field.group] ?? [];
    acc[field.group].push(field);
    return acc;
  }, {});

  return (
    <PlaygroundShell>
      <div className="max-w-[1500px] mx-auto px-6 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Report Template Designer</h1>
            <p className="text-sm text-slate-500 mt-1">เลือก field, สร้างตารางรายการ, preview และ publish template ได้เอง</p>
            <a href="/admin/report-builder" className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 hover:text-blue-700">🎨 ลองตัวออกแบบแบบลากวาง (ใหม่) →</a>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button onClick={createNew} disabled={saving}
                className="h-9 px-4 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                + Draft ใหม่
              </button>
              <button onClick={() => saveAsStatus("draft")} disabled={!draft || saving}
                className="h-9 px-4 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                บันทึก Draft
              </button>
              <button onClick={() => saveAsStatus("published")} disabled={!draft || saving}
                className="h-9 px-4 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                Publish ใช้งานจริง
              </button>
            </div>
          )}
        </div>

        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-12 gap-4 items-start">
          <aside className="col-span-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Templates / Versions</p>
              <p className="text-xs text-slate-400 mt-0.5">Draft แก้ได้, Published คือใช้พิมพ์จริง</p>
            </div>
            <div className="max-h-[720px] overflow-auto">
              {loading ? (
                <div className="p-4 space-y-2">{[0, 1, 2].map(item => <div key={item} className="h-12 rounded bg-slate-100 animate-pulse" />)}</div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">ยังไม่มี template</div>
              ) : items.map(item => {
                const status = inferTemplateStatus(item);
                const meta = parseDesignerDescription(item.description).meta;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (dirty && !window.confirm("มีงานที่ยังไม่ได้บันทึก ต้องการเปลี่ยน template หรือไม่?")) return;
                      setSelectedId(item.id);
                    }}
                    className={`w-full border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${selectedId === item.id ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{getReportEntityDef(item.entity_type).label} · v{meta.version || 1}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(status)}`}>{statusLabel(status)}</span>
                    </div>
                    <code className="mt-1 block truncate text-[10px] text-slate-400">{item.template_key}</code>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="col-span-3 space-y-4">
            {draft ? (
              <>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="col-span-2 block">
                      <span className="text-xs font-medium text-slate-500">ชื่อ template</span>
                      <input value={draft.label} onChange={event => update({ label: event.target.value })} disabled={!canEdit}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">เอกสาร</span>
                      <select value={draft.entity_type} onChange={event => update({ entity_type: event.target.value })} disabled={!canEdit}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                        {REPORT_ENTITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">สถานะ</span>
                      <div className="mt-1 flex h-9 items-center rounded-lg border border-slate-200 px-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(inferTemplateStatus(draft))}`}>
                          {statusLabel(inferTemplateStatus(draft))}
                        </span>
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">กระดาษ</span>
                      <select value={draft.paper_size} onChange={event => update({ paper_size: event.target.value as ReportTemplateRow["paper_size"] })} disabled={!canEdit}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                        <option value="A4">A4</option>
                        <option value="A5">A5</option>
                        <option value="Letter">Letter</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">แนวกระดาษ</span>
                      <select value={draft.orientation} onChange={event => update({ orientation: event.target.value as ReportTemplateRow["orientation"] })} disabled={!canEdit}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                        <option value="portrait">แนวตั้ง</option>
                        <option value="landscape">แนวนอน</option>
                      </select>
                    </label>
                    <label className="col-span-2 block">
                      <span className="text-xs font-medium text-slate-500">หมายเหตุเวอร์ชัน</span>
                      <input value={draft.description_note ?? ""} onChange={event => update({ description_note: event.target.value })} disabled={!canEdit}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
                    </label>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">ใส่ข้อมูลลงเอกสาร</p>
                      <p className="text-xs text-slate-400">เลือกตำแหน่ง แล้วกด field ที่ต้องการ</p>
                    </div>
                    <select value={target} onChange={event => setTarget(event.target.value as EditorTarget)}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                      {Object.entries(TARGET_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(groupedFields).map(([group, fields]) => (
                      <div key={group}>
                        <p className="mb-1 text-[11px] font-semibold text-slate-400">{group}</p>
                        <div className="flex flex-wrap gap-2">
                          {fields.map(field => (
                            <button key={field.key} type="button" onClick={() => insertText(fieldToken(field.key))}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                              {field.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-700">ตารางรายการ / many2many</p>
                    <p className="text-xs text-slate-400">เลือก relation และ column ที่จะโชว์ในเอกสาร</p>
                  </div>
                  <select value={tableKey} onChange={event => setTableKey(event.target.value)}
                    className="mb-3 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                    {entityDef.tables.map(table => <option key={table.key} value={table.key}>{table.label}</option>)}
                  </select>
                  <div className="space-y-2">
                    {tableDef.columns.map((column: ReportTableColumnDef) => {
                      const checked = selectedColumns.includes(column.key);
                      return (
                        <div key={column.key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                          <input type="checkbox" checked={checked} onChange={() => toggleColumn(column.key)} />
                          <span className="min-w-0 flex-1 text-sm text-slate-700">{column.label}</span>
                          <span className="hidden text-xs text-slate-400 md:inline">{column.sample}</span>
                          <button type="button" onClick={() => moveColumn(column.key, -1)} className="h-7 w-7 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">↑</button>
                          <button type="button" onClick={() => moveColumn(column.key, 1)} className="h-7 w-7 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">↓</button>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => insertText(buildTableHtml(tableDef, selectedColumns))}
                    className="mt-3 h-9 w-full rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
                    + เพิ่มตารางนี้ใน {TARGET_LABEL[target]}
                  </button>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={duplicateVersion} disabled={saving || !canEdit}
                      className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      Duplicate เป็นเวอร์ชันใหม่
                    </button>
                    <button type="button" onClick={archive} disabled={saving || !canEdit}
                      className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      Archive
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(draft)} disabled={!canEdit}
                      className="h-8 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                      ลบ
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
                เลือก template หรือสร้าง Draft ใหม่
              </section>
            )}
          </main>

          <section className="col-span-6 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Preview</p>
                <p className="text-xs text-slate-400">ตัวอย่างจากข้อมูลจำลองของ {entityDef.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAdvancedOpen(prev => !prev)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
                  {advancedOpen ? "ซ่อนโค้ดละเอียด" : "โหมดละเอียด"}
                </button>
                <button type="button" onClick={() => setPreviewMax(true)} disabled={!draft} title="ขยายดูเต็มจอ"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50">⛶ ขยายเต็มจอ</button>
              </div>
            </div>

            {advancedOpen && draft && (
              <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white p-3">
                <CodeBlock label="Header" value={draft.header_html} onChange={value => update({ header_html: value })} rows={5} disabled={!canEdit} />
                <CodeBlock label="Body" value={draft.body_html} onChange={value => update({ body_html: value })} rows={5} disabled={!canEdit} />
                <CodeBlock label="Footer" value={draft.footer_html} onChange={value => update({ footer_html: value })} rows={4} disabled={!canEdit} />
                <CodeBlock label="CSS" value={draft.custom_css} onChange={value => update({ custom_css: value })} rows={4} disabled={!canEdit} />
              </div>
            )}

            <div className="h-[760px] overflow-auto p-4">
              {draft ? (
                <iframe srcDoc={previewHtml} title="Report template preview" className="h-full min-h-[720px] w-full rounded-lg border border-slate-200 bg-white shadow-sm" />
              ) : (
                <div className="py-20 text-center text-sm text-slate-400">ยังไม่มี preview</div>
              )}
            </div>
          </section>
        </div>

        {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-emerald-600 px-4 py-3 text-sm text-white shadow-lg">✓ {toast}</div>}
      </div>

      {/* Preview เต็มจอ — ดู A4 ขนาดจริง */}
      {previewMax && draft && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-800/60 p-4" onClick={() => setPreviewMax(false)}>
          <div className="mx-auto flex w-full max-w-[980px] flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-700">Preview · {draft.label}</p>
              <button type="button" onClick={() => setPreviewMax(false)} className="h-8 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">✕ ปิด</button>
            </div>
            <div className="flex flex-1 justify-center overflow-auto bg-slate-100 p-4">
              <iframe srcDoc={previewHtml} title="Report preview fullscreen"
                className="rounded border border-slate-200 bg-white shadow-lg"
                style={{ width: draft.orientation === "landscape" ? 1123 : 794, minWidth: draft.orientation === "landscape" ? 1123 : 794, height: draft.orientation === "landscape" ? 794 : 1123 }} />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="ลบ Template"
        message={`ลบ "${deleteTarget?.label}" ใช่ไหม?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) void remove(deleteTarget); }}
        variant="danger"
      />
    </PlaygroundShell>
  );
}

function CodeBlock({
  label,
  value,
  onChange,
  disabled,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
      />
    </label>
  );
}
