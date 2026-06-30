"use client";

// ============================================================
// CreateTaskModal (ของกลางในโมดูล) — Wizard สร้างงาน 3 สเต็ป
//   1) ข้อมูลงาน (+ เริ่มจาก Template)
//   2) งานย่อย (subtask) — เลือก/แก้รายตัว + ผู้รับผิดชอบ
//   3) สินค้า (SKU / Parent SKU)
// ใช้ที่: หน้า /tasks และ Campaign Canvas (ล็อกแคมเปญ) — props/ชื่อเดิม
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker, SkuPicker, ParentSkuPicker } from "@/components/pickers";
import type { UserPickerValue, SkuPickerValue, ParentSkuPickerValue } from "@/components/pickers";
import { MultiUserPicker } from "./multi-user-picker";
import { ImageInput } from "@/components/image-input";
import { useCreativeOptions } from "./use-options";
import { useT } from "@/components/i18n";
import {
  PRIORITY_META, priorityLabel, createTask, listCampaigns, listBrands, listTemplates,
  type CreativePriority, type Campaign, type BrandOption, type TaskTemplate, type SubtaskStepConfig, type TemplateContentItem,
} from "./data";

const priorityOptions = () => (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: priorityLabel(k) }));

function todayStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`); if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type FormState = {
  title: string; description: string; task_type: string;
  brand_id: string; campaign_id: string;
  assignee: UserPickerValue | null; reviewers: UserPickerValue[];
  priority: CreativePriority; order_date: string; due_date: string;
  products: SkuPickerValue[]; parents: ParentSkuPickerValue[]; platforms: string[]; drive_folder_url: string;
  cover_image_r2_key: string;
};
const EMPTY_FORM: FormState = {
  title: "", description: "", task_type: "photo_shoot", brand_id: "", campaign_id: "",
  assignee: null, reviewers: [], priority: "normal", order_date: "", due_date: "", products: [], parents: [], platforms: [], drive_folder_url: "", cover_image_r2_key: "",
};

// แถวงานย่อยในขั้นที่ 2
type SubRow = { include: boolean; title: string; description: string | null; required_before_next: boolean; assignees: { id: string; label: string }[]; type: string; config: SubtaskStepConfig };

export type CreatedTask = { id: string; task_no: string; title: string; subtasks: { title: string }[] };

// Step labels are rendered via t() inside the component
const STEPS_TH = ["แบรนด์", "ข้อมูลงาน", "งานย่อย", "สินค้า"];

export function CreateTaskModal({ open, onClose, onCreated, pushToast, lockedCampaignId, lockedCampaignLabel }: {
  open: boolean;
  onClose: () => void;
  onCreated: (res: CreatedTask) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  lockedCampaignId?: string;
  lockedCampaignLabel?: string;
}) {
  const t = useT();
  const { taskTypes, platforms } = useCreativeOptions();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tplId, setTplId] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [contentItems, setContentItems] = useState<TemplateContentItem[]>([]);   // คอนเทนต์พ่วงจากแม่แบบ
  const [tplDueOffset, setTplDueOffset] = useState<number | null>(null);   // กำหนดส่ง = วันที่สั่ง + X (จากแม่แบบ)
  const [step, setStep] = useState(1);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const STEPS = [t("แบรนด์/เทมเพลต","Brand/Template"), t("ข้อมูลงาน","Task info"), t("งานย่อย","Subtasks"), t("สินค้า","Products")];

  useEffect(() => {
    (async () => { try { const [b, c, tp] = await Promise.all([listBrands(), listCampaigns(), listTemplates()]); setBrands(b); setCampaigns(c); setTemplates(tp); } catch { /* ignore */ } })();
  }, []);
  useEffect(() => { if (open) { setForm({ ...EMPTY_FORM, campaign_id: lockedCampaignId ?? "", order_date: todayStr() }); setSubs([]); setContentItems([]); setTplDueOffset(null); setTplId(""); setStep(1); setFormErr(null); setDirty(false); } }, [open, lockedCampaignId]);

  const updateForm = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => updateForm({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });

  // เลือก template → เติมข้อมูลงาน + ดึงงานย่อยมาเป็นรายการให้เลือก/แก้
  const applyTemplate = (id: string) => {
    setTplId(id); setDirty(true);
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) { setSubs([]); setContentItems([]); setTplDueOffset(null); return; }
    const offset = tpl.due_offset_days ?? null;
    setTplDueOffset(offset);
    setForm((p) => ({
      ...p,
      task_type: tpl.task_type ?? p.task_type, priority: (tpl.default_priority as CreativePriority) ?? p.priority,
      platforms: tpl.platforms ?? [], brand_id: tpl.brand_id ?? p.brand_id,
      description: tpl.description ?? p.description,
      reviewers: (tpl.default_reviewers && tpl.default_reviewers.length) ? tpl.default_reviewers.map((r) => ({ id: r.id, name: r.label } as UserPickerValue)) : (tpl.default_reviewer_id ? [{ id: tpl.default_reviewer_id, name: tpl.default_reviewer_label ?? "" } as UserPickerValue] : p.reviewers),
      due_date: (offset != null && p.order_date) ? addDaysStr(p.order_date, offset) : p.due_date,
    }));
    setContentItems(Array.isArray(tpl.content_items) ? tpl.content_items : []);
    setSubs((tpl.steps ?? []).filter((s) => s.title?.trim()).map((s) => ({
      include: true, title: s.title, description: s.description ?? null, required_before_next: !!s.required_before_next,
      assignees: (s.assignee_ids ?? []).map((aid, i) => ({ id: aid, label: s.assignee_labels?.[i] ?? "ผู้ใช้" })),
      type: s.type ?? "custom", config: s.config ?? {},
    })));
  };

  const addBlankSub = () => { setSubs((p) => [...p, { include: true, title: "", description: null, required_before_next: false, assignees: [], type: "custom", config: {} }]); setDirty(true); };
  const addContentItem = () => { setContentItems((p) => [...p, { title: "", platforms: [] }]); setDirty(true); };
  const patchContentItem = (i: number, patch: Partial<TemplateContentItem>) => { setContentItems((p) => p.map((c, j) => j === i ? { ...c, ...patch } : c)); setDirty(true); };
  const removeContentItem = (i: number) => { setContentItems((p) => p.filter((_, j) => j !== i)); setDirty(true); };
  const patchSub = (i: number, p: Partial<SubRow>) => { setSubs((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...p } : r))); setDirty(true); };
  const removeSub = (i: number) => { setSubs((rows) => rows.filter((_, idx) => idx !== i)); setDirty(true); };

  const next = () => { if (step === 2 && !form.title.trim()) { setFormErr(t("กรุณากรอกชื่องาน","Please enter a task title")); return; } setFormErr(null); setStep((s) => Math.min(4, s + 1)); };
  const back = () => { setFormErr(null); setStep((s) => Math.max(1, s - 1)); };
  // วันที่สั่งเปลี่ยน → คำนวณกำหนดส่งใหม่ถ้าแม่แบบตั้ง +X วันไว้
  const setOrderDate = (v: string) => updateForm({ order_date: v, ...(tplDueOffset != null && v ? { due_date: addDaysStr(v, tplDueOffset) } : {}) });
  // เทมเพลตของแบรนด์ที่เลือก (+ เทมเพลตทั่วไปที่ไม่ผูกแบรนด์)
  const brandTemplates = templates.filter((tp) => form.brand_id ? (tp.brand_id === form.brand_id || !tp.brand_id) : !tp.brand_id);

  const save = async () => {
    if (!form.title.trim()) { setStep(2); setFormErr(t("กรุณากรอกชื่องาน","Please enter a task title")); return; }
    setSaving(true); setFormErr(null);
    const subtasks = subs.filter((s) => s.include && s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description, assignee_ids: s.assignees.map((a) => a.id), required_before_next: s.required_before_next, type: s.type, config: s.config }));
    try {
      const { id, task_no } = await createTask({
        title: form.title.trim(), description: form.description.trim() || null, task_type: form.task_type || null,
        brand_id: form.brand_id || null, campaign_id: (lockedCampaignId ?? form.campaign_id) || null,
        assignee_id: form.assignee?.id ?? null, reviewer_ids: form.reviewers.map((r) => r.id),
        priority: form.priority, start_date: form.order_date || null, due_date: form.due_date || null,
        sku_id: form.products[0]?.id ?? null, product_name: form.products[0]?.name ?? null, sku_ids: form.products.map((p) => p.id),
        parent_sku_id: form.parents[0]?.id ?? null, parent_sku_ids: form.parents.map((p) => p.id),
        platforms: form.platforms, drive_folder_url: form.drive_folder_url.trim() || null,
        cover_image_r2_key: form.cover_image_r2_key || null,
        subtasks,
        content_items: contentItems.filter((c) => c.title?.trim()),
      });
      setDirty(false);
      onCreated({ id, task_no, title: form.title.trim(), subtasks: subtasks.map((s) => ({ title: s.title })) });
      onClose();
    } catch (e) { setFormErr((e as Error).message); pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal
      open={open} onClose={onClose} title={t("สร้างงานใหม่ (Wizard)","Create Task (Wizard)")} size="lg" hasUnsavedChanges={dirty}
      footer={<>
        {step > 1 && <button onClick={back} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 mr-auto">← {t("ย้อนกลับ","Back")}</button>}
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก","Cancel")}</button>
        {step < 4
          ? <button onClick={next} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">{t("ถัดไป","Next")} →</button>
          : <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...","Saving...") : t("สร้างงาน","Create task")}</button>}
      </>}
    >
      {/* step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {STEPS.map((label, i) => { const n = i + 1; const active = n === step; const done = n < step; return (
          <div key={STEPS_TH[i]} className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-violet-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>{done ? "✓" : n}</span>
            <span className={`text-sm ${active ? "font-semibold text-slate-800" : "text-slate-400"}`}>{label}</span>
            {n < STEPS.length && <span className="text-slate-300">—</span>}
          </div>
        ); })}
      </div>

      {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
      {lockedCampaignId && step === 1 && <div className="mb-4 px-3 py-2 bg-violet-50/60 border border-violet-100 rounded-lg text-sm text-slate-600">📣 Campaign: <span className="font-medium text-slate-800">{lockedCampaignLabel || t("แคมเปญนี้","this campaign")}</span></div>}

      {/* STEP 1 — เลือกแบรนด์ + เทมเพลตของแบรนด์ */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">{t("เลือกแบรนด์","Choose a brand")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {brands.map((b) => { const on = form.brand_id === b.id; return (
                <button key={b.id} type="button" onClick={() => { updateForm({ brand_id: b.id }); applyTemplate(""); }}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left ${on ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                  <BrandIcon brand={b} /><span className="text-sm font-medium text-slate-700 truncate">{b.name}</span>
                </button>
              ); })}
              <button type="button" onClick={() => { updateForm({ brand_id: "" }); applyTemplate(""); }}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left ${!form.brand_id ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                <span className="h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">∅</span>
                <span className="text-sm font-medium text-slate-500">{t("ไม่ระบุแบรนด์","No brand")}</span>
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">{t("เลือกเทมเพลต","Choose a template")} <span className="text-xs font-normal text-slate-400">({t("ของแบรนด์นี้ + ทั่วไป","this brand + general")})</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => applyTemplate("")} className={`p-3 rounded-lg border text-left ${!tplId ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                <p className="text-sm font-medium text-slate-700">— {t("ไม่ใช้เทมเพลต","No template")} —</p>
                <p className="text-xs text-slate-400">{t("กรอกข้อมูลงานเอง","Fill task info manually")}</p>
              </button>
              {brandTemplates.map((tpl) => { const on = tplId === tpl.id; return (
                <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl.id)} className={`p-3 rounded-lg border text-left ${on ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                  <p className="text-sm font-medium text-slate-800">{tpl.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{(tpl.steps?.length ?? 0)} {t("ขั้นตอน","steps")}{(tpl.content_items?.length ?? 0) > 0 ? ` · 📱 ${tpl.content_items!.length}` : ""}{tpl.due_offset_days != null ? ` · ⏱ +${tpl.due_offset_days}${t("ว","d")}` : ""}</p>
                </button>
              ); })}
              {brandTemplates.length === 0 && <p className="text-xs text-slate-400 sm:col-span-2 py-2">{t("แบรนด์นี้ยังไม่มีเทมเพลต — กดถัดไปกรอกข้อมูลงานได้เลย","No templates for this brand — click Next to fill task info")}</p>}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — ข้อมูลงาน */}
      {step === 2 && (<>
        {contentItems.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-fuchsia-50/60 border border-fuchsia-100 rounded-lg px-3 py-2 text-sm text-fuchsia-700">
            📱 {t("แม่แบบนี้จะสร้างคอนเทนต์", "This template will create")} {contentItems.length} {t("ชิ้นพ่วงกับงาน (ดู/แก้ได้ที่แท็บคอนเทนต์ในงาน)", "content item(s) linked to the task (view/edit in the task's Content tab)")}
          </div>
        )}
        <ERPFormSection title={t("ข้อมูลงาน","Task info")} columns={2}>
          <ERPFormField label={t("ชื่องาน","Task title")} required span={2}><ERPInput value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder={t("เช่น ถ่ายรูปกระเป๋า Summer 8 สี","e.g. Summer bag photoshoot 8 colors")} /></ERPFormField>
          <ERPFormField label={t("ประเภทงาน","Task type")}><ERPSelect value={form.task_type} options={taskTypes} onChange={(e) => updateForm({ task_type: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("ความสำคัญ","Priority")}><ERPSelect value={form.priority} options={priorityOptions()} onChange={(e) => updateForm({ priority: e.target.value as CreativePriority })} /></ERPFormField>
          <ERPFormField label={t("แบรนด์","Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ","Not specified")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => updateForm({ brand_id: e.target.value })} /></ERPFormField>
          {!lockedCampaignId && <ERPFormField label="Campaign"><ERPSelect value={form.campaign_id} options={[{ value: "", label: `— ${t("ไม่ระบุ","Not specified")} —` }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => updateForm({ campaign_id: e.target.value })} /></ERPFormField>}
          <ERPFormField label={t("ผู้รับผิดชอบ","Assignee")}><UserPicker value={form.assignee} onChange={(v) => updateForm({ assignee: v })} disableCreate /></ERPFormField>
          <ERPFormField label={t("ผู้ตรวจ/อนุมัติ (เลือกได้หลายคน)","Reviewer / Approver (multiple)")}><MultiUserPicker value={form.reviewers} onChange={(v) => updateForm({ reviewers: v })} disableCreate /></ERPFormField>
          <ERPFormField label={t("วันที่สั่ง","Order date")}><ERPInput type="date" value={form.order_date} onChange={(e) => setOrderDate(e.target.value)} /></ERPFormField>
          <ERPFormField label={t("กำหนดส่ง","Due date")} hint={tplDueOffset != null ? t(`อัตโนมัติ = วันที่สั่ง + ${tplDueOffset} วัน (แก้เองได้)`, `auto = order date + ${tplDueOffset}d (editable)`) : undefined}><ERPInput type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("โฟลเดอร์ Drive (ลิงก์)","Drive folder (link)")} span={2}><ERPInput value={form.drive_folder_url} onChange={(e) => updateForm({ drive_folder_url: e.target.value })} placeholder="https://drive.google.com/..." /></ERPFormField>
          <ERPFormField label="Platform" span={2}>
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}
            </div>
          </ERPFormField>
          <ERPFormField label={t("รายละเอียด","Description")} span={2}><ERPTextarea value={form.description} rows={2} onChange={(e) => updateForm({ description: e.target.value })} placeholder={t("อธิบายงาน/บรีฟเพิ่มเติม","Describe the task or brief")} /></ERPFormField>
          <ERPFormField label={t("รูปปก (ไม่บังคับ — ถ้า Parent SKU มีรูป จะใช้รูปนั้นแทน)","Cover image (optional — Parent SKU image takes priority)")} span={2}>
            <ImageInput value={form.cover_image_r2_key || null} onChange={(k) => updateForm({ cover_image_r2_key: k ?? "" })} folder="creative-tasks" compact />
          </ERPFormField>
        </ERPFormSection>
      </>)}

      {/* STEP 3 — งานย่อย */}
      {step === 3 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">{t("งานย่อย","Subtasks")} {subs.length > 0 && <span className="text-slate-400">· {t("ติ๊กเลือกอันที่จะสร้าง / แก้ผู้รับผิดชอบได้","Check the ones to create / edit assignees")}</span>}</p>
            <button onClick={addBlankSub} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เพิ่มงานย่อย","Add subtask")}</button>
          </div>
          {subs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">{t("ยังไม่มีงานย่อย — เลือกเทมเพลตในขั้นแรก หรือกด ปุ่ม เพิ่มงานย่อย (ข้ามได้ถ้าไม่ต้องการ)","No subtasks yet — choose a Template in step 1, or click Add subtask (optional)")}</div>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {subs.map((row, i) => <SubRowEditor key={i} row={row} onChange={(p) => patchSub(i, p)} onRemove={() => removeSub(i)} />)}
            </div>
          )}

          {/* คอนเทนต์ social (สร้างพร้อมงาน) + ผู้รับผิดชอบต่อคอนเทนต์ */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-600">📱 {t("คอนเทนต์ social (สร้างพร้อมงาน)", "Social content (created with the task)")}</p>
              <button onClick={addContentItem} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เพิ่มคอนเทนต์", "Add content")}</button>
            </div>
            {contentItems.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400">{t("ยังไม่มีคอนเทนต์ (ข้ามได้ · มาเพิ่มทีหลังที่แท็บคอนเทนต์ได้)", "No content yet (optional · can add later in the Content tab)")}</div>
            ) : (
              <div className="space-y-2">
                {contentItems.map((c, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5 bg-violet-50/10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📱</span>
                      <input value={c.title} onChange={(e) => patchContentItem(i, { title: e.target.value })} placeholder={t("ชื่อคอนเทนต์ เช่น โพสต์เปิดตัว 7.7", "Content title")} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      <button onClick={() => removeContentItem(i)} className="text-slate-300 hover:text-red-500 text-sm px-1" title={t("ลบ", "Remove")}>✕</button>
                    </div>
                    <div className="pl-7 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ:", "Assignee:")}</span>
                      {c.assignee_id
                        ? <span className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{c.assignee_label || t("ผู้ใช้", "User")}<button onClick={() => patchContentItem(i, { assignee_id: null, assignee_label: null })} className="text-slate-400 hover:text-red-500">✕</button></span>
                        : <div className="w-56"><UserPicker value={null} onChange={(v) => { if (v) patchContentItem(i, { assignee_id: v.id, assignee_label: v.name }); }} disableCreate /></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4 — สินค้า */}
      {step === 4 && (
        <ERPFormSection title={t("สินค้าที่เกี่ยวข้อง (ใส่ได้หลายรายการ)","Related products (multi-select)")} columns={2}>
          <ERPFormField label={t("สินค้า","Product") + "/SKU"}>
            <SkuPicker value={null} onChange={(v) => { if (v && !form.products.some((p) => p.id === v.id)) updateForm({ products: [...form.products, v] }); }} />
            {form.products.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{form.products.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5"><span className="font-mono text-slate-500">{p.code}</span>{p.name}<button onClick={() => updateForm({ products: form.products.filter((x) => x.id !== p.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}</div>}
          </ERPFormField>
          <ERPFormField label={`Parent SKU (${t("ตระกูลสินค้า","product family")})`}>
            <ParentSkuPicker value={null} onChange={(v) => { if (v && !form.parents.some((p) => p.id === v.id)) updateForm({ parents: [...form.parents, v] }); }} />
            {form.parents.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{form.parents.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5"><span className="font-mono text-slate-500">{p.code}</span>{p.name}<button onClick={() => updateForm({ parents: form.parents.filter((x) => x.id !== p.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}</div>}
          </ERPFormField>
          <div className="col-span-2 text-xs text-slate-400">{t("ขั้นนี้ไม่บังคับ — เลือกได้หลายรายการ (เลือกแล้วเลือกต่อได้) กด สร้างงาน ได้เลยถ้าไม่ต้องผูกสินค้า","This step is optional — select as many as needed. Click Create task to skip linking products.")}</div>
        </ERPFormSection>
      )}
    </ERPModal>
  );
}

// ไอคอนแบรนด์ (รูปโลโก้ถ้ามี ไม่งั้นวงกลมตัวอักษร + สีแบรนด์)
function BrandIcon({ brand }: { brand: BrandOption }) {
  const src = brand.logo_url ? (brand.logo_url.startsWith("http") ? brand.logo_url : `/api/r2-image?key=${encodeURIComponent(brand.logo_url)}&w=64`) : null;
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className="h-8 w-8 rounded-md object-contain bg-white border border-slate-100 shrink-0" />;
  return <span className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ background: brand.color || "#94a3b8" }}>{brand.name.slice(0, 2).toUpperCase()}</span>;
}

// แถวงานย่อย (มี state ผู้รับผิดชอบของตัวเอง)
function SubRowEditor({ row, onChange, onRemove }: { row: SubRow; onChange: (p: Partial<SubRow>) => void; onRemove: () => void }) {
  const t = useT();
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const addAssignee = (v: UserPickerValue | null) => { if (v && !row.assignees.some((a) => a.id === v.id)) onChange({ assignees: [...row.assignees, { id: v.id, label: v.name }] }); setAdding(null); };
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${row.include ? "border-violet-200 bg-violet-50/20" : "border-slate-200 bg-slate-50/40 opacity-70"}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
        <input value={row.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={t("ชื่องานย่อย","Subtask title")} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
        <button onClick={onRemove} className="text-slate-300 hover:text-red-500 text-sm px-1" title={t("ลบแถว","Remove row")}>✕</button>
      </div>
      {row.include && (
        <div className="pl-6 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ:","Assignee:")}</span>
            {row.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => onChange({ assignees: row.assignees.filter((x) => x.id !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}
            {row.assignees.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่กำหนด","Not assigned")}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-56"><UserPicker value={adding} onChange={addAssignee} disableCreate /></div>
            <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={row.required_before_next} onChange={(e) => onChange({ required_before_next: e.target.checked })} />{t("ต้องเสร็จก่อนขั้นถัดไป","Must complete before next step")}</label>
          </div>
        </div>
      )}
    </div>
  );
}
