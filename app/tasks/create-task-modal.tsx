"use client";

// ============================================================
// CreateTaskModal (ของกลางในโมดูล) — ฟอร์มสร้างงาน Creative
// ใช้ที่: หน้า /tasks (สร้างงานปกติ) และ Campaign Canvas (วางการ์ดงาน — ล็อกแคมเปญ)
// โหลด options/brands/campaigns/templates เองทั้งหมด
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker, SkuPicker } from "@/components/pickers";
import type { UserPickerValue, SkuPickerValue } from "@/components/pickers";
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
  product: SkuPickerValue | null; platforms: string[]; drive_folder_url: string;
};
const EMPTY_FORM: FormState = {
  title: "", description: "", task_type: "photo_shoot", brand_id: "", campaign_id: "",
  assignee: null, reviewer: null, priority: "normal", due_date: "", product: null, platforms: [], drive_folder_url: "",
};

export type CreatedTask = { id: string; task_no: string; title: string; subtasks: { title: string }[] };

export function CreateTaskModal({ open, onClose, onCreated, pushToast, lockedCampaignId, lockedCampaignLabel }: {
  open: boolean;
  onClose: () => void;
  onCreated: (res: CreatedTask) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  /** ถ้าระบุ = ล็อกแคมเปญ (ใช้บน canvas ของแคมเปญ) ฟอร์มจะไม่ให้เลือกแคมเปญ */
  lockedCampaignId?: string;
  lockedCampaignLabel?: string;
}) {
  const { taskTypes, platforms } = useCreativeOptions();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tplId, setTplId] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // โหลด options ครั้งเดียว
  useEffect(() => {
    (async () => { try { const [b, c, tp] = await Promise.all([listBrands(), listCampaigns(), listTemplates()]); setBrands(b); setCampaigns(c); setTemplates(tp); } catch { /* ignore */ } })();
  }, []);
  // reset ทุกครั้งที่เปิด
  useEffect(() => { if (open) { setForm({ ...EMPTY_FORM, campaign_id: lockedCampaignId ?? "" }); setTplId(""); setFormErr(null); setDirty(false); } }, [open, lockedCampaignId]);

  const updateForm = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const applyTemplate = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (t) updateForm({ task_type: t.task_type ?? form.task_type, priority: (t.default_priority as CreativePriority) ?? form.priority, platforms: t.platforms ?? [], brand_id: t.brand_id ?? form.brand_id });
  };
  const togglePlatform = (v: string) => updateForm({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });

  const save = async () => {
    if (!form.title.trim()) { setFormErr("กรุณากรอกชื่องาน"); return; }
    setSaving(true); setFormErr(null);
    const tpl = templates.find((t) => t.id === tplId);
    const subtasks = tpl?.steps?.filter((s) => s.title?.trim()).map((s) => ({ title: s.title, description: s.description ?? null, assignee_ids: s.assignee_ids ?? [], required_before_next: !!s.required_before_next })) ?? [];
    try {
      const { id, task_no } = await createTask({
        title: form.title.trim(), description: form.description.trim() || null, task_type: form.task_type || null,
        brand_id: form.brand_id || null, campaign_id: (lockedCampaignId ?? form.campaign_id) || null,
        assignee_id: form.assignee?.id ?? null, reviewer_id: form.reviewer?.id ?? null,
        priority: form.priority, due_date: form.due_date || null,
        sku_id: form.product?.id ?? null, product_name: form.product?.name ?? null,
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
      open={open} onClose={onClose} title="สร้างงานใหม่"
      description="ผู้รับผิดชอบ + สินค้า ใช้ Picker กลาง (ดึงข้อมูลจริง)" size="lg" hasUnsavedChanges={dirty}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "สร้างงาน"}</button>
      </>}
    >
      {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
      {lockedCampaignId && <div className="mb-4 px-3 py-2 bg-violet-50/60 border border-violet-100 rounded-lg text-sm text-slate-600">📣 แคมเปญ: <span className="font-medium text-slate-800">{lockedCampaignLabel || "แคมเปญนี้"}</span></div>}
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
        <ERPFormField label="สินค้า/SKU (ถ้ามี)" span={2}><SkuPicker value={form.product} onChange={(v) => updateForm({ product: v })} /></ERPFormField>
        <ERPFormField label="แพลตฟอร์ม" span={2}>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}
          </div>
        </ERPFormField>
        <ERPFormField label="รายละเอียด" span={2}><ERPTextarea value={form.description} rows={2} onChange={(e) => updateForm({ description: e.target.value })} placeholder="อธิบายงาน/บรีฟเพิ่มเติม" /></ERPFormField>
      </ERPFormSection>
    </ERPModal>
  );
}
