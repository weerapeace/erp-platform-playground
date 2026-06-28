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
  listRecurring, createRecurring, updateRecurring, deleteRecurring, runRecurringNow,
  listCampaigns, listBrands, listSubtaskTypes,
  type TaskTemplate, type RecurringRule, type Campaign, type BrandOption, type SubtaskType,
} from "../data";
import { useCreativeOptions, taskTypeLabel } from "../use-options";
import { BulletTextarea } from "@/components/bullet-textarea";
import { SubtaskTypePicker, type EditStep } from "./subtask-type-picker";
import { BrandPromptsTab } from "./brand-prompts";
import { useT } from "@/components/i18n";

const FREQ =[{ value: "daily", label: "รายวัน" }, { value: "weekly", label: "รายสัปดาห์" }, { value: "monthly", label: "รายเดือน" }];
const FREQ_LABEL = Object.fromEntries(FREQ.map((f) => [f.value, f.label]));
const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label }));
type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export default function TemplatesPage() {
  const t = useT();
  const [tab, setTab] = useState<"templates" | "recurring" | "prompts">("templates");
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
          <button onClick={() => setTab("prompts")} className={`h-8 px-3 rounded-md text-sm font-medium ${tab === "prompts" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>📝 {t("Prompt ต่อแบรนด์", "Brand prompts")}</button>
        </div>
      </div>

      <div className="px-8 py-6">
        {tab === "templates" ? <TemplatesTab pushToast={pushToast} /> : tab === "recurring" ? <RecurringTab pushToast={pushToast} /> : <BrandPromptsTab pushToast={pushToast} />}
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
  const [types, setTypes] = useState<SubtaskType[]>([]);   // registry ชนิดงานย่อย (no hardcode)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<TaskTemplate | null>(null);

  const load = useCallback(async () => { try { setItems(await listTemplates()); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast]);
  useEffect(() => { (async () => { setLoading(true); await load(); try { const [b, ty] = await Promise.all([listBrands(), listSubtaskTypes()]); setBrands(b); setTypes(ty); } catch { /* ignore */ } setLoading(false); })(); }, [load]);

  // map step (DB) → EditStep (UI) — legacy step (ไม่มี type) ถือเป็น custom
  const toEditStep = (s: TaskTemplate["steps"][number]): EditStep => ({
    type: s.type ?? "custom", title: s.title ?? "", description: s.description ?? "",
    required_before_next: !!s.required_before_next,
    assignees: (s.assignee_ids ?? []).map((id, k) => ({ id, label: s.assignee_labels?.[k] || id })),
    config: s.config ?? {},
  });
  const setFormD = (updater: (f: typeof EMPTY_TPL) => typeof EMPTY_TPL) => { setForm(updater); setDirty(true); };
  const setStepsD = (s: EditStep[]) => { setSteps(s); setDirty(true); };

  const openNew = () => { setEditId(null); setForm(EMPTY_TPL); setSteps([]); setDirty(false); setOpen(true); };
  const openEdit = (tpl: TaskTemplate) => { setEditId(tpl.id); setForm({ name: tpl.name, task_type: tpl.task_type ?? "photo_shoot", default_priority: tpl.default_priority, brand_id: tpl.brand_id ?? "", description: tpl.description ?? "", platforms: tpl.platforms ?? [] }); setSteps((Array.isArray(tpl.steps) ? tpl.steps : []).map(toEditStep)); setDirty(false); setOpen(true); };
  const togglePlat = (v: string) => setFormD((f) => ({ ...f, platforms: f.platforms.includes(v) ? f.platforms.filter((x) => x !== v) : [...f.platforms, v] }));

  // EditStep → body step (type-driven)
  const stepBody = (s: EditStep) => ({ type: s.type, title: s.title.trim(), description: s.description.trim() || null, required_before_next: s.required_before_next, assignee_ids: s.assignees.map((a) => a.id), config: s.config });

  const save = async () => {
    if (!form.name.trim()) { pushToast("error", t("กรุณาใส่ชื่อเทมเพลต", "Please enter a template name")); return; }
    setSaving(true);
    const body = { name: form.name.trim(), task_type: form.task_type || null, default_priority: form.default_priority, brand_id: form.brand_id || null, description: form.description.trim() || null, platforms: form.platforms, steps: steps.filter((s) => s.title.trim()).map(stepBody) };
    try { if (editId) await updateTemplate(editId, body); else await createTemplate(body); setOpen(false); setDirty(false); pushToast("success", t("บันทึกเทมเพลตแล้ว", "Template saved")); await load(); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };
  const onDelete = async () => { if (!delId) return; try { await deleteTemplate(delId.id); pushToast("info", t("ลบแล้ว", "Deleted")); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelId(null); } };
  const copyTemplate = async (tpl: TaskTemplate) => {
    try {
      await createTemplate({
        name: `${tpl.name} (${t("สำเนา", "Copy")})`, task_type: tpl.task_type ?? null, default_priority: tpl.default_priority,
        brand_id: tpl.brand_id ?? null, description: tpl.description ?? null, platforms: tpl.platforms ?? [],
        steps: (Array.isArray(tpl.steps) ? tpl.steps : []).map((s) => stepBody(toEditStep(s))),
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

      <ERPModal open={open} onClose={() => setOpen(false)} title={editId ? t("แก้ไขเทมเพลต", "Edit Template") : t("สร้างเทมเพลต", "Create Template")} size="xl" hasUnsavedChanges={dirty}
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
        </>}>
        <ERPFormSection title={t("ข้อมูลเทมเพลต", "Template Details")} columns={2}>
          <ERPFormField label={t("ชื่อเทมเพลต", "Template Name")} required span={2}><ERPInput value={form.name} onChange={(e) => setFormD((f) => ({ ...f, name: e.target.value }))} placeholder={t("เช่น ถ่ายรูปสินค้าใหม่", "e.g. New product photo shoot")} /></ERPFormField>
          <ERPFormField label={t("ประเภทงาน", "Task Type")}><ERPSelect value={form.task_type} options={taskTypes} onChange={(e) => setFormD((f) => ({ ...f, task_type: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ความสำคัญเริ่มต้น", "Default Priority")}><ERPSelect value={form.default_priority} options={PRIORITY_OPTIONS} onChange={(e) => setFormD((f) => ({ ...f, default_priority: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setFormD((f) => ({ ...f, brand_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แพลตฟอร์ม", "Platforms")}><div className="flex flex-wrap gap-1.5">{platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlat(p.value)} className={`px-2 py-0.5 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>)}</div></ERPFormField>
          <ERPFormField label={t("คำอธิบาย", "Description")} span={2}><ERPTextarea value={form.description} rows={2} onChange={(e) => setFormD((f) => ({ ...f, description: e.target.value }))} /></ERPFormField>
        </ERPFormSection>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <SubtaskTypePicker steps={steps} types={types} onChange={setStepsD} />
        </div>
      </ERPModal>

      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={onDelete} title={t("ลบเทมเพลต", "Delete Template")} message={<span>{t("ลบ", "Delete")} <span className="font-semibold">{delId?.name}</span> ?</span>} confirmText={t("ลบ", "Delete")} variant="danger" />
    </div>
  );
}

// ============================================================
// Recurring tab
// ============================================================
const EMPTY_REC = { name: "", template_id: "", frequency: "weekly", interval_n: "1", brand_id: "", campaign_id: "", start_date: "", end_date: "", description: "", task_type: "", priority: "normal", platforms: [] as string[], due_day: "" };
function RecurringTab({ pushToast }: { pushToast: (t: Toast["type"], m: string) => void }) {
  const t = useT();
  const { taskTypes, platforms: platformOpts } = useCreativeOptions();
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
  const [editId, setEditId] = useState<string | null>(null);   // null = สร้างใหม่

  const load = useCallback(async (run: boolean) => {
    try { const r = await listRecurring(run); setItems(r.data); if (run && r.generated > 0) pushToast("success", `${t("สร้างงานอัตโนมัติ", "Auto-created")} ${r.generated} ${t("งานที่ถึงรอบ", "tasks due this cycle")}`); }
    catch (e) { pushToast("error", (e as Error).message); }
  }, [pushToast]);
  useEffect(() => { (async () => { setLoading(true); await load(true); try { const [t, b, c] = await Promise.all([listTemplates(), listBrands(), listCampaigns()]); setTemplates(t); setBrands(b); setCampaigns(c); } catch { /* ignore */ } setLoading(false); })(); }, [load]);

  const openNew = () => { setEditId(null); setForm(EMPTY_REC); setAssignee(null); setOpen(true); };
  const openEdit = (r: RecurringRule) => {
    setEditId(r.id);
    setForm({ name: r.name, template_id: r.template_id || "", frequency: r.frequency, interval_n: String(r.interval_n ?? 1), brand_id: r.brand_id || "", campaign_id: r.campaign_id || "", start_date: r.start_date || "", end_date: r.end_date || "",
      description: r.description ?? "", task_type: r.task_type ?? "", priority: r.priority ?? "normal", platforms: r.platforms ?? [], due_day: r.due_day != null ? String(r.due_day) : "" });
    setAssignee(r.assignee_id ? ({ id: r.assignee_id, name: r.assignee_label ?? "" } as UserPickerValue) : null);
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) { pushToast("error", t("กรุณาใส่ชื่อกฎ", "Please enter a rule name")); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), template_id: form.template_id || null, frequency: form.frequency, interval_n: Number(form.interval_n) || 1, assignee_id: assignee?.id ?? null, brand_id: form.brand_id || null, campaign_id: form.campaign_id || null, start_date: form.start_date || null, end_date: form.end_date || null,
      description: form.description.trim() || null, task_type: form.task_type || null, priority: form.priority || null, platforms: form.platforms, due_day: form.due_day ? Number(form.due_day) : null };
    try {
      if (editId) { await updateRecurring(editId, payload); setOpen(false); pushToast("success", t("บันทึกกฎงานประจำแล้ว", "Recurring rule saved")); await load(false); }
      else { await createRecurring(payload); setOpen(false); pushToast("success", t("สร้างกฎงานประจำแล้ว", "Recurring rule created")); await load(true); }
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };
  // คัดลอกงานประจำ — สร้างกฎใหม่จากค่าเดิม (ชื่อ + " (สำเนา)")
  const copyRule = async (r: RecurringRule) => {
    try {
      await createRecurring({ name: `${r.name} (${t("สำเนา", "copy")})`, template_id: r.template_id, frequency: r.frequency, interval_n: r.interval_n, assignee_id: r.assignee_id, brand_id: r.brand_id, campaign_id: r.campaign_id, start_date: r.start_date, end_date: r.end_date,
        description: r.description ?? null, task_type: r.task_type ?? null, priority: r.priority ?? null, platforms: r.platforms ?? [], due_day: r.due_day ?? null });
      pushToast("success", t("คัดลอกงานประจำแล้ว", "Recurring rule copied")); await load(false);
    } catch (e) { pushToast("error", (e as Error).message); }
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
                <button onClick={() => openEdit(r)} title={t("แก้ไขกฎงานประจำ", "Edit recurring rule")} className="h-8 px-3 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">✎ {t("แก้ไข", "Edit")}</button>
                <button onClick={() => copyRule(r)} title={t("คัดลอกงานประจำ", "Copy recurring rule")} className="h-8 px-3 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">⧉ {t("คัดลอก", "Copy")}</button>
                <button onClick={() => setDelId(r)} className="text-xs text-slate-300 hover:text-red-500 shrink-0">{t("ลบ", "Delete")}</button>
              </div>
            ))}
          </div>
        )}

      <ERPModal open={open} onClose={() => setOpen(false)} title={editId ? t("แก้กฎงานประจำ", "Edit Recurring Rule") : t("สร้างงานประจำ", "Create Recurring Rule")} size="lg"
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : (editId ? t("บันทึก", "Save") : t("สร้าง", "Create"))}</button>
        </>}>
        <ERPFormSection title={t("กฎงานประจำ", "Recurring Rule")} columns={2}>
          <ERPFormField label={t("ชื่อกฎ/ชื่องาน", "Rule name / Task name")} required span={2}><ERPInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("เช่น ทำ Content Calendar รายสัปดาห์", "e.g. Weekly Content Calendar")} /></ERPFormField>
          <ERPFormField label={t("ใช้เทมเพลต", "Use Template")}><ERPSelect value={form.template_id} options={[{ value: "", label: `— ${t("ไม่ใช้", "None")} —` }, ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))]} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ผู้รับผิดชอบ", "Assignee")}><UserPicker value={assignee} onChange={setAssignee} disableCreate /></ERPFormField>
          <ERPFormField label={t("ความถี่", "Frequency")} hint={t("ตั้งว่าให้สร้างงานซ้ำแบบไหน: รายวัน / รายสัปดาห์ / รายเดือน", "How often to repeat: daily / weekly / monthly")}><ERPSelect value={form.frequency} options={FREQ} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ทุก ๆ (รอบ)", "Every (cycles)")} hint={t("เว้นกี่รอบถึงสร้างครั้งถัดไป เช่น 2 + รายสัปดาห์ = ทุก 2 สัปดาห์", "Gap between runs, e.g. 2 + weekly = every 2 weeks")}><ERPInput type="number" value={String(form.interval_n)} onChange={(e) => setForm((f) => ({ ...f, interval_n: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("แคมเปญ", "Campaign")}><ERPSelect value={form.campaign_id} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => setForm((f) => ({ ...f, campaign_id: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("เริ่ม", "Start")} hint={t("วันแรกที่เริ่มสร้างงานตามรอบ (ว่าง = วันนี้)", "First date to start generating tasks (blank = today)")}><ERPInput type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("สิ้นสุด (ถ้ามี)", "End (if any)")} hint={t("วันที่หยุดสร้างงาน — เว้นว่างได้ถ้าทำไปเรื่อยๆ", "Date to stop generating — leave blank to run forever")}><ERPInput type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></ERPFormField>
        </ERPFormSection>

        {/* section งาน — ค่าที่จะติดไปกับงานทุกใบที่ระบบสร้าง */}
        <ERPFormSection title={t("รายละเอียดงาน (ติดไปกับงานที่สร้าง)", "Task details (applied to generated tasks)")} columns={2}>
          <ERPFormField label={t("ประเภทงาน", "Task Type")}><ERPSelect value={form.task_type} options={[{ value: "", label: `— ${t("ไม่ระบุ", "None")} —` }, ...taskTypes]} onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("ความสำคัญ", "Priority")}><ERPSelect value={form.priority} options={PRIORITY_OPTIONS} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} /></ERPFormField>
          <ERPFormField label={t("กำหนดส่ง", "Due date")} hint={t("วันที่ของเดือนที่ให้เป็นกำหนดส่ง (1–31) · ว่าง = ใช้วันถึงรอบ", "Day of month for the due date (1–31) · blank = use run date")}><ERPInput type="number" value={form.due_day} placeholder={t("เช่น 25 = วันที่ 25 ของเดือน", "e.g. 25 = the 25th")} onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))} /></ERPFormField>
          <ERPFormField label="Platform">
            <div className="flex flex-wrap gap-1.5">
              {platformOpts.map((p) => { const on = form.platforms.includes(p.value); return <button key={p.value} type="button" onClick={() => setForm((f) => ({ ...f, platforms: on ? f.platforms.filter((x) => x !== p.value) : [...f.platforms, p.value] }))} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>; })}
              {platformOpts.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มีช่องทาง", "No platforms")}</span>}
            </div>
          </ERPFormField>
          <ERPFormField label={t("รายละเอียด", "Description")} span={2} hint={t("กด Enter เพื่อขึ้นหัวข้อย่อยถัดไป", "Press Enter to continue the bullet list")}>
            <BulletTextarea value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder={t("อธิบายงาน / สิ่งที่ต้องทำ (ทำหัวข้อย่อยได้)", "Describe the work / checklist (supports bullets)")} />
          </ERPFormField>
        </ERPFormSection>
        <p className="text-xs text-slate-400 mt-2">{t("เมื่อถึงรอบ ระบบจะสร้างงานจากเทมเพลต (พร้อมขั้นตอน) ให้ผู้รับผิดชอบอัตโนมัติเมื่อมีคนเปิดหน้านี้ หรือกด \"สร้างเดี๋ยวนี้\"", "When due, the system auto-creates tasks from the template (with subtasks) for the assignee when someone opens this page, or when \"Run Now\" is clicked.")}</p>
      </ERPModal>

      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={onDelete} title={t("ลบงานประจำ", "Delete Recurring Rule")} message={<span>{t("ลบกฎ", "Delete rule")} <span className="font-semibold">{delId?.name}</span> ? ({t("งานที่สร้างไปแล้วยังอยู่", "Tasks already created will remain")})</span>} confirmText={t("ลบ", "Delete")} variant="danger" />
    </div>
  );
}
