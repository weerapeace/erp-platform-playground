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
import { useCreativeOptions } from "./use-options";
import {
  PRIORITY_META, createTask, listCampaigns, listBrands, listTemplates,
  type CreativePriority, type Campaign, type BrandOption, type TaskTemplate,
} from "./data";

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: PRIORITY_META[k].label }));

type FormState = {
  title: string; description: string; task_type: string;
  brand_id: string; campaign_id: string;
  assignee: UserPickerValue | null; reviewer: UserPickerValue | null;
  priority: CreativePriority; due_date: string;
  product: SkuPickerValue | null; parent: ParentSkuPickerValue | null; platforms: string[]; drive_folder_url: string;
};
const EMPTY_FORM: FormState = {
  title: "", description: "", task_type: "photo_shoot", brand_id: "", campaign_id: "",
  assignee: null, reviewer: null, priority: "normal", due_date: "", product: null, parent: null, platforms: [], drive_folder_url: "",
};

// แถวงานย่อยในขั้นที่ 2
type SubRow = { include: boolean; title: string; description: string | null; required_before_next: boolean; assignees: { id: string; label: string }[] };

export type CreatedTask = { id: string; task_no: string; title: string; subtasks: { title: string }[] };

const STEPS = ["ข้อมูลงาน", "งานย่อย", "สินค้า"];

export function CreateTaskModal({ open, onClose, onCreated, pushToast, lockedCampaignId, lockedCampaignLabel }: {
  open: boolean;
  onClose: () => void;
  onCreated: (res: CreatedTask) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  lockedCampaignId?: string;
  lockedCampaignLabel?: string;
}) {
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

  useEffect(() => {
    (async () => { try { const [b, c, tp] = await Promise.all([listBrands(), listCampaigns(), listTemplates()]); setBrands(b); setCampaigns(c); setTemplates(tp); } catch { /* ignore */ } })();
  }, []);
  useEffect(() => { if (open) { setForm({ ...EMPTY_FORM, campaign_id: lockedCampaignId ?? "" }); setSubs([]); setTplId(""); setStep(1); setFormErr(null); setDirty(false); } }, [open, lockedCampaignId]);

  const updateForm = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => updateForm({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });

  // เลือก template → เติมข้อมูลงาน + ดึงงานย่อยมาเป็นรายการให้เลือก/แก้
  const applyTemplate = (id: string) => {
    setTplId(id); setDirty(true);
    const t = templates.find((x) => x.id === id);
    if (!t) { setSubs([]); return; }
    setForm((p) => ({ ...p, task_type: t.task_type ?? p.task_type, priority: (t.default_priority as CreativePriority) ?? p.priority, platforms: t.platforms ?? [], brand_id: t.brand_id ?? p.brand_id }));
    setSubs((t.steps ?? []).filter((s) => s.title?.trim()).map((s) => ({
      include: true, title: s.title, description: s.description ?? null, required_before_next: !!s.required_before_next,
      assignees: (s.assignee_ids ?? []).map((aid, i) => ({ id: aid, label: s.assignee_labels?.[i] ?? "ผู้ใช้" })),
    })));
  };

  const addBlankSub = () => { setSubs((p) => [...p, { include: true, title: "", description: null, required_before_next: false, assignees: [] }]); setDirty(true); };
  const patchSub = (i: number, p: Partial<SubRow>) => { setSubs((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...p } : r))); setDirty(true); };
  const removeSub = (i: number) => { setSubs((rows) => rows.filter((_, idx) => idx !== i)); setDirty(true); };

  const next = () => { if (step === 1 && !form.title.trim()) { setFormErr("กรุณากรอกชื่องาน"); return; } setFormErr(null); setStep((s) => Math.min(3, s + 1)); };
  const back = () => { setFormErr(null); setStep((s) => Math.max(1, s - 1)); };

  const save = async () => {
    if (!form.title.trim()) { setStep(1); setFormErr("กรุณากรอกชื่องาน"); return; }
    setSaving(true); setFormErr(null);
    const subtasks = subs.filter((s) => s.include && s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description, assignee_ids: s.assignees.map((a) => a.id), required_before_next: s.required_before_next }));
    try {
      const { id, task_no } = await createTask({
        title: form.title.trim(), description: form.description.trim() || null, task_type: form.task_type || null,
        brand_id: form.brand_id || null, campaign_id: (lockedCampaignId ?? form.campaign_id) || null,
        assignee_id: form.assignee?.id ?? null, reviewer_id: form.reviewer?.id ?? null,
        priority: form.priority, due_date: form.due_date || null,
        sku_id: form.product?.id ?? null, product_name: form.product?.name ?? null,
        parent_sku_id: form.parent?.id ?? null,
        platforms: form.platforms, drive_folder_url: form.drive_folder_url.trim() || null,
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
      open={open} onClose={onClose} title="สร้างงานใหม่ (Wizard)" size="lg" hasUnsavedChanges={dirty}
      footer={<>
        {step > 1 && <button onClick={back} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 mr-auto">← ย้อนกลับ</button>}
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        {step < 3
          ? <button onClick={next} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">ถัดไป →</button>
          : <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "สร้างงาน"}</button>}
      </>}
    >
      {/* step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {STEPS.map((label, i) => { const n = i + 1; const active = n === step; const done = n < step; return (
          <div key={label} className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-violet-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>{done ? "✓" : n}</span>
            <span className={`text-sm ${active ? "font-semibold text-slate-800" : "text-slate-400"}`}>{label}</span>
            {n < STEPS.length && <span className="text-slate-300">—</span>}
          </div>
        ); })}
      </div>

      {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
      {lockedCampaignId && step === 1 && <div className="mb-4 px-3 py-2 bg-violet-50/60 border border-violet-100 rounded-lg text-sm text-slate-600">📣 แคมเปญ: <span className="font-medium text-slate-800">{lockedCampaignLabel || "แคมเปญนี้"}</span></div>}

      {/* STEP 1 — ข้อมูลงาน */}
      {step === 1 && (<>
        {templates.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-violet-50/60 border border-violet-100 rounded-lg px-3 py-2">
            <span className="text-sm text-slate-600 shrink-0">🔁 เริ่มจากเทมเพลต:</span>
            <select value={tplId} onChange={(e) => applyTemplate(e.target.value)} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
              <option value="">— ไม่ใช้เทมเพลต —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.steps?.length ?? 0} ขั้นตอน)</option>)}
            </select>
          </div>
        )}
        <ERPFormSection title="ข้อมูลงาน" columns={2}>
          <ERPFormField label="ชื่องาน" required span={2}><ERPInput value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="เช่น ถ่ายรูปกระเป๋า Summer 8 สี" /></ERPFormField>
          <ERPFormField label="ประเภทงาน"><ERPSelect value={form.task_type} options={taskTypes} onChange={(e) => updateForm({ task_type: e.target.value })} /></ERPFormField>
          <ERPFormField label="ความสำคัญ"><ERPSelect value={form.priority} options={PRIORITY_OPTIONS} onChange={(e) => updateForm({ priority: e.target.value as CreativePriority })} /></ERPFormField>
          <ERPFormField label="แบรนด์"><ERPSelect value={form.brand_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => updateForm({ brand_id: e.target.value })} /></ERPFormField>
          {!lockedCampaignId && <ERPFormField label="แคมเปญ"><ERPSelect value={form.campaign_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => updateForm({ campaign_id: e.target.value })} /></ERPFormField>}
          <ERPFormField label="ผู้รับผิดชอบ"><UserPicker value={form.assignee} onChange={(v) => updateForm({ assignee: v })} disableCreate /></ERPFormField>
          <ERPFormField label="ผู้ตรวจ/อนุมัติ"><UserPicker value={form.reviewer} onChange={(v) => updateForm({ reviewer: v })} disableCreate /></ERPFormField>
          <ERPFormField label="กำหนดส่ง"><ERPInput type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })} /></ERPFormField>
          <ERPFormField label="โฟลเดอร์ Drive (ลิงก์)"><ERPInput value={form.drive_folder_url} onChange={(e) => updateForm({ drive_folder_url: e.target.value })} placeholder="https://drive.google.com/..." /></ERPFormField>
          <ERPFormField label="แพลตฟอร์ม" span={2}>
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}
            </div>
          </ERPFormField>
          <ERPFormField label="รายละเอียด" span={2}><ERPTextarea value={form.description} rows={2} onChange={(e) => updateForm({ description: e.target.value })} placeholder="อธิบายงาน/บรีฟเพิ่มเติม" /></ERPFormField>
        </ERPFormSection>
      </>)}

      {/* STEP 2 — งานย่อย */}
      {step === 2 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">งานย่อย {subs.length > 0 && <span className="text-slate-400">· ติ๊กเลือกอันที่จะสร้าง / แก้ผู้รับผิดชอบได้</span>}</p>
            <button onClick={addBlankSub} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ เพิ่มงานย่อย</button>
          </div>
          {subs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">ยังไม่มีงานย่อย — เลือกเทมเพลตในขั้นแรก หรือกด “เพิ่มงานย่อย” (ข้ามได้ถ้าไม่ต้องการ)</div>
          ) : (
            <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
              {subs.map((row, i) => <SubRowEditor key={i} row={row} onChange={(p) => patchSub(i, p)} onRemove={() => removeSub(i)} />)}
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — สินค้า */}
      {step === 3 && (
        <ERPFormSection title="สินค้าที่เกี่ยวข้อง (ถ้ามี)" columns={2}>
          <ERPFormField label="สินค้า/SKU"><SkuPicker value={form.product} onChange={(v) => updateForm({ product: v })} /></ERPFormField>
          <ERPFormField label="Parent SKU (ตระกูลสินค้า)"><ParentSkuPicker value={form.parent} onChange={(v) => updateForm({ parent: v })} /></ERPFormField>
          <div className="col-span-2 text-xs text-slate-400">ขั้นนี้ไม่บังคับ — กด “สร้างงาน” ได้เลยถ้าไม่ต้องผูกสินค้า</div>
        </ERPFormSection>
      )}
    </ERPModal>
  );
}

// แถวงานย่อย (มี state ผู้รับผิดชอบของตัวเอง)
function SubRowEditor({ row, onChange, onRemove }: { row: SubRow; onChange: (p: Partial<SubRow>) => void; onRemove: () => void }) {
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const addAssignee = (v: UserPickerValue | null) => { if (v && !row.assignees.some((a) => a.id === v.id)) onChange({ assignees: [...row.assignees, { id: v.id, label: v.name }] }); setAdding(null); };
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${row.include ? "border-violet-200 bg-violet-50/20" : "border-slate-200 bg-slate-50/40 opacity-70"}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
        <input value={row.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="ชื่องานย่อย" className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
        <button onClick={onRemove} className="text-slate-300 hover:text-red-500 text-sm px-1" title="ลบแถว">✕</button>
      </div>
      {row.include && (
        <div className="pl-6 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">ผู้รับผิดชอบ:</span>
            {row.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => onChange({ assignees: row.assignees.filter((x) => x.id !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}
            {row.assignees.length === 0 && <span className="text-xs text-slate-400">ยังไม่กำหนด</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-56"><UserPicker value={adding} onChange={addAssignee} disableCreate /></div>
            <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={row.required_before_next} onChange={(e) => onChange({ required_before_next: e.target.checked })} />ต้องเสร็จก่อนขั้นถัดไป</label>
          </div>
        </div>
      )}
    </div>
  );
}
