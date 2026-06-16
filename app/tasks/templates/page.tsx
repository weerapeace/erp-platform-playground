"use client";

// ============================================================
// Creative Templates + Recurring — แม่แบบงาน + งานประจำสร้างซ้ำ
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, UserPicker
// ข้อมูลจาก /api/creative-templates + /api/creative-recurring
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import {
  PRIORITY_META,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listRecurring, createRecurring, deleteRecurring, runRecurringNow,
  listCampaigns, listBrands,
  type TaskTemplate, type RecurringRule, type Campaign, type BrandOption,
} from "../data";
import { useCreativeOptions, taskTypeLabel } from "../use-options";
import { useT } from "@/components/i18n";

const FREQ =[{ value: "daily", label: "รายวัน" }, { value: "weekly", label: "รายสัปดาห์" }, { value: "monthly", label: "รายเดือน" }];
const FREQ_LABEL = Object.fromEntries(FREQ.map((f) => [f.value, f.label]));
const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label }));
type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export default function TemplatesPage() {
  const t = useT();
  const [tab, setTab] = useState<"templates" | "recurring">("templates");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <StandaloneShell title={t("เทมเพลต & งานประจำ", "Templates & Recurring")} icon="🔁" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("เทมเพลต & งานประจำ", "Templates & Recurring")}</h1>
            <p className="text-slate-500 mt-1">{t("แม่แบบงาน (พร้อมขั้นตอน) + กฎสร้างงานซ้ำอัตโนมัติตามรอบ", "Task templates (with subtasks) + rules for auto-creating recurring tasks")}</p>
          </div>
          <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">← {t("งาน", "Tasks")}</a>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mt-4">
          <button onClick={() => setTab("templates")} className={`h-8 px-3 rounded-md text-sm font-medium ${tab === "templates" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>📋 {t("เทมเพลต", "Templates")}</button>
          <button onClick={() => setTab("recurring")} className={`h-8 px-3 rounded-md text-sm font-medium ${tab === "recurring" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>🔁 {t("งานประจำ", "Recurring")}</button>
        </div>
      </div>

      <div className="px-8 py-6">
        {tab === "templates" ? <TemplatesTab pushToast={pushToast} /> : <RecurringTab pushToast={pushToast} />}
      </div>

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

// ============================================================
// Templates tab
// ============================================================
const EMPTY_TPL = { name: "", task_type: "photo_shoot", default_priority: "normal", brand_id: "", description: "", platforms: [] as string[] };
type EditStep = { title: string; description: string; required_before_next: boolean; assignees: { id: string; label: string }[] };

// ตัวแก้ 1 ขั้นตอน — ชื่อ + รายละเอียด + ผู้รับผิดชอบหลายคน
function StepEditor({ step, index, onChange, onRemove }: { step: EditStep; index: number; onChange: (p: Partial<EditStep>) => void; onRemove: () => void }) {
  const t = useT();
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const ids = step.assignees.map((a) => a.id);
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-5">{index + 1}.</span>
        <ERPInput value={step.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={t("ชื่อขั้นตอน", "Step name")} />
        <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap"><input type="checkbox" checked={step.required_before_next} onChange={(e) => onChange({ required_before_next: e.target.checked })} />{t("ต้องเสร็จก่อน", "Must complete first")}</label>
        <button onClick={onRemove} className="text-slate-400 hover:text-red-500">✕</button>
      </div>
      <ERPInput value={step.description} onChange={(e) => onChange({ description: e.target.value })} placeholder={t("รายละเอียดขั้นตอน (ไม่บังคับ)", "Step description (optional)")} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ:", "Assignees:")}</span>
        {step.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => onChange({ assignees: step.assignees.filter((x) => x.id !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        <div className="w-44"><UserPicker value={adding} onChange={(v) => { if (v && !ids.includes(v.id)) onChange({ assignees: [...step.assignees, { id: v.id, label: v.name }] }); setAdding(null); }} disableCreate /></div>
      </div>
    </div>
  );
}

function TemplatesTab({ pushToast }: { pushToast: (t: Toast["type"], m: string) => void }) {
  const t = useT();
  const { taskTypes, platforms } = useCreativeOptions();
  const [items, setItems] = useState<TaskTemplate[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_TPL);
  const [steps, setSteps] = useState<EditStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<TaskTemplate | null>(null);

  const load = useCallback(async () => { try { setItems(await listTemplates()); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast]);
  useEffect(() => { (async () => { setLoading(true); await load(); try { setBrands(await listBrands()); } catch { /* ignore */ } setLoading(false); })(); }, [load]);

  const openNew = () => { setEditId(null); setForm(EMPTY_TPL); setSteps([]); setOpen(true); };
  const openEdit = (t: TaskTemplate) => { setEditId(t.id); setForm({ name: t.name, task_type: t.task_type ?? "photo_shoot", default_priority: t.default_priority, brand_id: t.brand_id ?? "", description: t.description ?? "", platforms: t.platforms ?? [] }); setSteps((Array.isArray(t.steps) ? t.steps : []).map((s) => ({ title: s.title ?? "", description: s.description ?? "", required_before_next: !!s.required_before_next, assignees: (s.assignee_ids ?? []).map((id, k) => ({ id, label: s.assignee_labels?.[k] || id })) }))); setOpen(true); };
  const togglePlat = (v: string) => setForm((f) => ({ ...f, platforms: f.platforms.includes(v) ? f.platforms.filter((x) => x !== v) : [...f.platforms, v] }));

  const save = async () => {
    if (!form.name.trim()) { pushToast("error", t("กรุณาใส่ชื่อเทมเพลต", "Please enter a template name")); return; }
    setSaving(true);
    const body = { name: form.name.trim(), task_type: form.task_type || null, default_priority: form.default_priority, brand_id: form.brand_id || null, description: form.description.trim() || null, platforms: form.platforms, steps: steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description.trim() || null, required_before_next: s.required_before_next, assignee_ids: s.assignees.map((a) => a.id) })) };
    try { if (editId) await updateTemplate(editId, body); else await createTemplate(body); setOpen(false); pushToast("success", t("บันทึกเทมเพลตแล้ว", "Template saved")); await load(); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };
  const onDelete = async () => { if (!delId) return; try { await deleteTemplate(delId.id); pushToast("info", t("ลบแล้ว", "Deleted")); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelId(null); } };
  const copyTemplate = async (tpl: TaskTemplate) => {
    try {
      await createTemplate({
        name: `${tpl.name} (${t("สำเนา", "Copy")})`, task_type: tpl.task_type ?? null, default_priority: tpl.default_priority,
        brand_id: tpl.brand_id ?? null, description: tpl.description ?? null, platforms: tpl.platforms ?? [],
        steps: (Array.isArray(tpl.steps) ? tpl.steps : []).map((s) => ({ title: s.title, description: s.description ?? null, required_before_next: !!s.required_before_next, assignee_ids: s.assignee_ids ?? [] })),
      });
      pushToast("success", t("ทำสำเนาเทมเพลตแล้ว", "Template duplicated")); await load();
    } catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">{t("แม่แบบงานพร้อมขั้นตอน (subtask) — ใช้สร้างงานหรือผูกกับงานประจำ", "Task templates with subtasks — use to create tasks or link to recurring rules")}</p>
        <button onClick={openNew} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างเทมเพลต", "Create Template")}</button>
      </div>
      {loading ? <div className="py-16 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        : items.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">{t("ยังไม่มีเทมเพลต", "No templates yet")}</div>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((tpl) => (
              <div key={tpl.id} onClick={() => openEdit(tpl)} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">{tpl.task_type ? taskTypeLabel(tpl.task_type) : t("งานทั่วไป", "General task")}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); copyTemplate(tpl); }} className="text-xs text-slate-400 hover:text-violet-600">⧉ {t("สำเนา", "Copy")}</button>
                    <button onClick={(e) => { e.stopPropagation(); setDelId(tpl); }} className="text-xs text-slate-300 hover:text-red-500">{t("ลบ", "Delete")}</button>
                  </div>
                </div>
                <p className="font-semibold text-slate-800">{tpl.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(tpl.steps?.length ?? 0)} {t("ขั้นตอน", "steps")} · {(tpl.platforms?.length ?? 0)} {t("แพลตฟอร์ม", "platforms")}</p>
              </div>
            ))}
          </div>
        )}

      <ERPModal open={open} onClose={() => setOpen(false)} title={editId ? t("แก้ไขเทมเพลต", "Edit Template") : t("สร้างเทมเพลต", "Create Template")} size="lg"
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
        </>}>
        <ERPFormSection title={t("ข้อมูลเทมเพลต", "Template Details")} columns={2}>
          <ERPFormField label={t("ชื่อเทมเพลต", "Template Name")} required span={2}><ERPInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("เช่น ถ่ายรูปสินค้าใหม่", "e.g. New product photo shoot")} /></ERPFormField>
          <ERPFormField label={t("ประเภทงาน", "Task Type")}><ERPSelect value={form.task_type} options={taskTypes} onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ความสำคัญเริ่มต้น", "Default Priority")}><ERPSelect value={form.default_priority} options={PRIORITY_OPTIONS} onChange={(e) => setForm((f) => ({ ...f, default_priority: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แพลตฟอร์ม", "Platforms")}><div className="flex flex-wrap gap-1.5">{platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlat(p.value)} className={`px-2 py-0.5 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>)}</div></ERPFormField>
          <ERPFormField label={t("คำอธิบาย", "Description")} span={2}><ERPTextarea value={form.description} rows={2} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></ERPFormField>
        </ERPFormSection>
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">{t("ขั้นตอน (subtask)", "Steps (subtasks)")}</p>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <StepEditor key={i} step={s} index={i} onChange={(patch) => setSteps((ss) => ss.map((x, j) => j === i ? { ...x, ...patch } : x))} onRemove={() => setSteps((ss) => ss.filter((_, j) => j !== i))} />
            ))}
            <button onClick={() => setSteps((ss) => [...ss, { title: "", description: "", required_before_next: false, assignees: [] }])} className="text-sm text-violet-700 hover:underline">＋ {t("เพิ่มขั้นตอน", "Add step")}</button>
          </div>
        </div>
      </ERPModal>

      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={onDelete} title={t("ลบเทมเพลต", "Delete Template")} message={<span>{t("ลบ", "Delete")} <span className="font-semibold">{delId?.name}</span> ?</span>} confirmText={t("ลบ", "Delete")} variant="danger" />
    </div>
  );
}

// ============================================================
// Recurring tab
// ============================================================
const EMPTY_REC = { name: "", template_id: "", frequency: "weekly", interval_n: "1", brand_id: "", campaign_id: "", start_date: "", end_date: "" };
function RecurringTab({ pushToast }: { pushToast: (t: Toast["type"], m: string) => void }) {
  const t = useT();
  const [items, setItems] = useState<RecurringRule[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_REC);
  const [assignee, setAssignee] = useState<UserPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<RecurringRule | null>(null);

  const load = useCallback(async (run: boolean) => {
    try { const r = await listRecurring(run); setItems(r.data); if (run && r.generated > 0) pushToast("success", `${t("สร้างงานอัตโนมัติ", "Auto-created")} ${r.generated} ${t("งานที่ถึงรอบ", "tasks due this cycle")}`); }
    catch (e) { pushToast("error", (e as Error).message); }
  }, [pushToast]);
  useEffect(() => { (async () => { setLoading(true); await load(true); try { const [t, b, c] = await Promise.all([listTemplates(), listBrands(), listCampaigns()]); setTemplates(t); setBrands(b); setCampaigns(c); } catch { /* ignore */ } setLoading(false); })(); }, [load]);

  const openNew = () => { setForm(EMPTY_REC); setAssignee(null); setOpen(true); };
  const save = async () => {
    if (!form.name.trim()) { pushToast("error", t("กรุณาใส่ชื่อกฎ", "Please enter a rule name")); return; }
    setSaving(true);
    try {
      await createRecurring({ name: form.name.trim(), template_id: form.template_id || null, frequency: form.frequency, interval_n: Number(form.interval_n) || 1, assignee_id: assignee?.id ?? null, brand_id: form.brand_id || null, campaign_id: form.campaign_id || null, start_date: form.start_date || null, end_date: form.end_date || null });
      setOpen(false); pushToast("success", t("สร้างกฎงานประจำแล้ว", "Recurring rule created")); await load(true);
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };
  const runNow = async (r: RecurringRule) => { try { const n = await runRecurringNow(r.id); pushToast("success", n > 0 ? `${t("สร้าง", "Created")} ${n} ${t("งานแล้ว", "tasks")}` : t("ไม่มีงานใหม่", "No new tasks")); await load(false); } catch (e) { pushToast("error", (e as Error).message); } };
  const onDelete = async () => { if (!delId) return; try { await deleteRecurring(delId.id); pushToast("info", t("ลบแล้ว", "Deleted")); await load(false); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelId(null); } };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">{t("กฎสร้างงานซ้ำ — เปิดหน้านี้จะสร้างงานที่ถึงรอบให้อัตโนมัติ", "Recurring rules — opening this page auto-creates tasks that are due")}</p>
        <button onClick={openNew} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างงานประจำ", "Create Recurring Rule")}</button>
      </div>
      {loading ? <div className="py-16 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        : items.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">{t("ยังไม่มีงานประจำ", "No recurring rules yet")}</div>
        : (
          <div className="space-y-3">
            {items.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{r.name}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                    <span className="text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">{FREQ_LABEL[r.frequency] ?? r.frequency}{r.interval_n > 1 ? ` ×${r.interval_n}` : ""}</span>
                    {r.template_label && <span>· {t("แม่แบบ", "Template")}: {r.template_label}</span>}
                    {r.assignee_label && <span>· 👤 {r.assignee_label}</span>}
                    {r.next_run && <span>· {t("รอบถัดไป", "Next run")}: {r.next_run}</span>}
                    {r.end_date && <span>· {t("สิ้นสุด", "Ends")}: {r.end_date}</span>}
                  </div>
                </div>
                <button onClick={() => runNow(r)} className="h-8 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">▶ {t("สร้างเดี๋ยวนี้", "Run Now")}</button>
                <button onClick={() => setDelId(r)} className="text-xs text-slate-300 hover:text-red-500 shrink-0">{t("ลบ", "Delete")}</button>
              </div>
            ))}
          </div>
        )}

      <ERPModal open={open} onClose={() => setOpen(false)} title={t("สร้างงานประจำ", "Create Recurring Rule")} size="lg"
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("สร้าง", "Create")}</button>
        </>}>
        <ERPFormSection title={t("กฎงานประจำ", "Recurring Rule")} columns={2}>
          <ERPFormField label={t("ชื่อกฎ/ชื่องาน", "Rule name / Task name")} required span={2}><ERPInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("เช่น ทำ Content Calendar รายสัปดาห์", "e.g. Weekly Content Calendar")} /></ERPFormField>
          <ERPFormField label={t("ใช้เทมเพลต", "Use Template")}><ERPSelect value={form.template_id} options={[{ value: "", label: `— ${t("ไม่ใช้", "None")} —` }, ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))]} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ผู้รับผิดชอบ", "Assignee")}><UserPicker value={assignee} onChange={setAssignee} disableCreate /></ERPFormField>
          <ERPFormField label={t("ความถี่", "Frequency")}><ERPSelect value={form.frequency} options={FREQ} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ทุก ๆ (รอบ)", "Every (cycles)")}><ERPInput type="number" value={String(form.interval_n)} onChange={(e) => setForm((f) => ({ ...f, interval_n: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แคมเปญ", "Campaign")}><ERPSelect value={form.campaign_id} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => setForm((f) => ({ ...f, campaign_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("เริ่ม", "Start")}><ERPInput type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("สิ้นสุด (ถ้ามี)", "End (if any)")}><ERPInput type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></ERPFormField>
        </ERPFormSection>
        <p className="text-xs text-slate-400 mt-2">{t("เมื่อถึงรอบ ระบบจะสร้างงานจากเทมเพลต (พร้อมขั้นตอน) ให้ผู้รับผิดชอบอัตโนมัติเมื่อมีคนเปิดหน้านี้ หรือกด \"สร้างเดี๋ยวนี้\"", "When due, the system auto-creates tasks from the template (with subtasks) for the assignee when someone opens this page, or when \"Run Now\" is clicked.")}</p>
      </ERPModal>

      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={onDelete} title={t("ลบงานประจำ", "Delete Recurring Rule")} message={<span>{t("ลบกฎ", "Delete rule")} <span className="font-semibold">{delId?.name}</span> ? ({t("งานที่สร้างไปแล้วยังอยู่", "Tasks already created will remain")})</span>} confirmText={t("ลบ", "Delete")} variant="danger" />
    </div>
  );
}
