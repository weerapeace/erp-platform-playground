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
import { ImageInput } from "@/components/image-input";
import { useCreativeOptions } from "./use-options";
import { useT } from "@/components/i18n";
import {
  PRIORITY_META, createTask, listCampaigns, listBrands, listTemplates,
  type CreativePriority, type Campaign, type BrandOption, type TaskTemplate, type SubtaskStepConfig,
} from "./data";

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: PRIORITY_META[k].label }));

type FormState = {
  title: string; description: string; task_type: string;
  brand_id: string; campaign_id: string;
  assignee: UserPickerValue | null; reviewer: UserPickerValue | null;
  priority: CreativePriority; due_date: string;
  products: SkuPickerValue[]; parents: ParentSkuPickerValue[]; platforms: string[]; drive_folder_url: string;
  cover_image_r2_key: string;
};
const EMPTY_FORM: FormState = {
  title: "", description: "", task_type: "photo_shoot", brand_id: "", campaign_id: "",
  assignee: null, reviewer: null, priority: "normal", due_date: "", products: [], parents: [], platforms: [], drive_folder_url: "", cover_image_r2_key: "",
};

// แถวงานย่อยในขั้นที่ 2
type SubRow = { include: boolean; title: string; description: string | null; required_before_next: boolean; assignees: { id: string; label: string }[]; type: string; config: SubtaskStepConfig };

export type CreatedTask = { id: string; task_no: string; title: string; subtasks: { title: string }[] };

// Step labels are rendered via t() inside the component
const STEPS_TH = ["ข้อมูลงาน", "งานย่อย", "สินค้า"];

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
  const [step, setStep] = useState(1);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const STEPS = [t("ข้อมูลงาน","Task info"), t("งานย่อย","Subtasks"), t("สินค้า","Products")];

  useEffect(() => {
    (async () => { try { const [b, c, tp] = await Promise.all([listBrands(), listCampaigns(), listTemplates()]); setBrands(b); setCampaigns(c); setTemplates(tp); } catch { /* ignore */ } })();
  }, []);
  useEffect(() => { if (open) { setForm({ ...EMPTY_FORM, campaign_id: lockedCampaignId ?? "" }); setSubs([]); setTplId(""); setStep(1); setFormErr(null); setDirty(false); } }, [open, lockedCampaignId]);

  const updateForm = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => updateForm({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });

  // เลือก template → เติมข้อมูลงาน + ดึงงานย่อยมาเป็นรายการให้เลือก/แก้
  const applyTemplate = (id: string) => {
    setTplId(id); setDirty(true);
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) { setSubs([]); return; }
    setForm((p) => ({ ...p, task_type: tpl.task_type ?? p.task_type, priority: (tpl.default_priority as CreativePriority) ?? p.priority, platforms: tpl.platforms ?? [], brand_id: tpl.brand_id ?? p.brand_id }));
    setSubs((tpl.steps ?? []).filter((s) => s.title?.trim()).map((s) => ({
      include: true, title: s.title, description: s.description ?? null, required_before_next: !!s.required_before_next,
      assignees: (s.assignee_ids ?? []).map((aid, i) => ({ id: aid, label: s.assignee_labels?.[i] ?? "ผู้ใช้" })),
      type: s.type ?? "custom", config: s.config ?? {},
    })));
  };

  const addBlankSub = () => { setSubs((p) => [...p, { include: true, title: "", description: null, required_before_next: false, assignees: [], type: "custom", config: {} }]); setDirty(true); };
  const patchSub = (i: number, p: Partial<SubRow>) => { setSubs((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...p } : r))); setDirty(true); };
  const removeSub = (i: number) => { setSubs((rows) => rows.filter((_, idx) => idx !== i)); setDirty(true); };

  const next = () => { if (step === 1 && !form.title.trim()) { setFormErr(t("กรุณากรอกชื่องาน","Please enter a task title")); return; } setFormErr(null); setStep((s) => Math.min(3, s + 1)); };
  const back = () => { setFormErr(null); setStep((s) => Math.max(1, s - 1)); };

  const save = async () => {
    if (!form.title.trim()) { setStep(1); setFormErr(t("กรุณากรอกชื่องาน","Please enter a task title")); return; }
    setSaving(true); setFormErr(null);
    const subtasks = subs.filter((s) => s.include && s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description, assignee_ids: s.assignees.map((a) => a.id), required_before_next: s.required_before_next, type: s.type, config: s.config }));
    try {
      const { id, task_no } = await createTask({
        title: form.title.trim(), description: form.description.trim() || null, task_type: form.task_type || null,
        brand_id: form.brand_id || null, campaign_id: (lockedCampaignId ?? form.campaign_id) || null,
        assignee_id: form.assignee?.id ?? null, reviewer_id: form.reviewer?.id ?? null,
        priority: form.priority, due_date: form.due_date || null,
        sku_id: form.products[0]?.id ?? null, product_name: form.products[0]?.name ?? null, sku_ids: form.products.map((p) => p.id),
        parent_sku_id: form.parents[0]?.id ?? null, parent_sku_ids: form.parents.map((p) => p.id),
        platforms: form.platforms, drive_folder_url: form.drive_folder_url.trim() || null,
        cover_image_r2_key: form.cover_image_r2_key || null,
        subtasks,
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
        {step < 3
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

      {/* STEP 1 — ข้อมูลงาน */}
      {step === 1 && (<>
        {templates.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-violet-50/60 border border-violet-100 rounded-lg px-3 py-2">
            <span className="text-sm text-slate-600 shrink-0">🔁 {t("เริ่มจากเทมเพลต:","Start from Template:")}</span>
            <select value={tplId} onChange={(e) => applyTemplate(e.target.value)} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
              <option value="">— {t("ไม่ใช้เทมเพลต","No Template")} —</option>
              {templates.map((tmpl) => <option key={tmpl.id} value={tmpl.id}>{tmpl.name} ({tmpl.steps?.length ?? 0} {t("ขั้นตอน","steps")})</option>)}
            </select>
          </div>
        )}
        <ERPFormSection title={t("ข้อมูลงาน","Task info")} columns={2}>
          <ERPFormField label={t("ชื่องาน","Task title")} required span={2}><ERPInput value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder={t("เช่น ถ่ายรูปกระเป๋า Summer 8 สี","e.g. Summer bag photoshoot 8 colors")} /></ERPFormField>
          <ERPFormField label={t("ประเภทงาน","Task type")}><ERPSelect value={form.task_type} options={taskTypes} onChange={(e) => updateForm({ task_type: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("ความสำคัญ","Priority")}><ERPSelect value={form.priority} options={PRIORITY_OPTIONS} onChange={(e) => updateForm({ priority: e.target.value as CreativePriority })} /></ERPFormField>
          <ERPFormField label={t("แบรนด์","Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ","Not specified")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => updateForm({ brand_id: e.target.value })} /></ERPFormField>
          {!lockedCampaignId && <ERPFormField label="Campaign"><ERPSelect value={form.campaign_id} options={[{ value: "", label: `— ${t("ไม่ระบุ","Not specified")} —` }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => updateForm({ campaign_id: e.target.value })} /></ERPFormField>}
          <ERPFormField label={t("ผู้รับผิดชอบ","Assignee")}><UserPicker value={form.assignee} onChange={(v) => updateForm({ assignee: v })} disableCreate /></ERPFormField>
          <ERPFormField label={t("ผู้ตรวจ/อนุมัติ","Reviewer / Approver")}><UserPicker value={form.reviewer} onChange={(v) => updateForm({ reviewer: v })} disableCreate /></ERPFormField>
          <ERPFormField label={t("กำหนดส่ง","Due date")}><ERPInput type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("โฟลเดอร์ Drive (ลิงก์)","Drive folder (link)")}><ERPInput value={form.drive_folder_url} onChange={(e) => updateForm({ drive_folder_url: e.target.value })} placeholder="https://drive.google.com/..." /></ERPFormField>
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

      {/* STEP 2 — งานย่อย */}
      {step === 2 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">{t("งานย่อย","Subtasks")} {subs.length > 0 && <span className="text-slate-400">· {t("ติ๊กเลือกอันที่จะสร้าง / แก้ผู้รับผิดชอบได้","Check the ones to create / edit assignees")}</span>}</p>
            <button onClick={addBlankSub} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เพิ่มงานย่อย","Add subtask")}</button>
          </div>
          {subs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">{t("ยังไม่มีงานย่อย — เลือกเทมเพลตในขั้นแรก หรือกด ปุ่ม เพิ่มงานย่อย (ข้ามได้ถ้าไม่ต้องการ)","No subtasks yet — choose a Template in step 1, or click Add subtask (optional)")}</div>
          ) : (
            <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
              {subs.map((row, i) => <SubRowEditor key={i} row={row} onChange={(p) => patchSub(i, p)} onRemove={() => removeSub(i)} />)}
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — สินค้า */}
      {step === 3 && (
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
