"use client";

// ============================================================
// SubtaskTypePicker — เลือกชนิดงานย่อยด้วย checkbox card + ตั้งค่าแต่ละชนิด (ของกลางหน้าเทมเพลต)
// ชนิด + ความสามารถ/ค่าเริ่มต้นมาจาก registry กลาง (erp_subtask_types) — ไม่ hardcode
// step.config = snapshot ค่าตั้ง (เก็บลง template.steps แล้วคัดลอกไป subtask ตอนสร้างงาน)
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ERPInput, ERPSelect } from "@/components/form";
import { PromptEditor } from "@/components/prompt-editor";
import { UserPicker, type UserPickerValue } from "@/components/pickers";
import { TeamFill } from "../team-picker";
import { subtaskTypeHint, listContentTemplates, POST_TYPES, postTypeLabel, type SubtaskType, type SubtaskStepConfig, type ContentItem } from "../data";
import { ERPModal } from "@/components/modal";
import { SubtaskTypeManager } from "../subtask-type-manager";

const isHex = (c?: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

export type EditStep = {
  type: string;
  title: string;
  description: string;
  required_before_next: boolean;
  assignees: { id: string; label: string }[];
  config: SubtaskStepConfig;
};

// สร้าง step ใหม่จากชนิด (ดึงค่าเริ่มต้นจาก registry)
export function stepFromType(ty: SubtaskType): EditStep {
  const isDescText = ty.approve_target === "sku_description";
  return {
    type: ty.key,
    title: ty.label_th,
    description: "",
    required_before_next: false,
    assignees: [],
    config: {
      required: ty.default_required,
      due_offset_days: ty.default_due_offset_days,
      requires_approval: ty.requires_approval,
      approve_target: ty.approve_target,
      accepts_text: ty.accepts_text,
      accepts_image: ty.accepts_image,
      accepts_multi_image: ty.accepts_multi_image,
      accepts_link: ty.accepts_link,
      accepts_file: ty.accepts_file,
      applies_to: (ty.applies_to as ("parent" | "sku")[]) ?? ["parent", "sku"],
      has_copy_prompt: ty.has_copy_prompt,
      prompt_template: ty.prompt_template,
      description_field: isDescText ? "description" : undefined,
      desc_mode: isDescText ? "append" : undefined,
    },
  };
}

const DESC_FIELD_OPTS = () => [
  { value: "description", label: tr("คำอธิบายหลัก", "Main description") },
  { value: "english_description", label: tr("คำอธิบาย (อังกฤษ)", "Description (English)") },
  { value: "platform_description", label: tr("คำอธิบายแพลตฟอร์ม", "Platform description") },
];

const TYPE_HINT: Record<string, () => string> = {
  images: () => tr("อัปรูป → อนุมัติ → เข้าแกลเลอรีรูปสินค้า", "Upload images → approve → product gallery"),
  description_text: () => tr("เขียนคำอธิบาย (มี prompt) → อนุมัติ → เข้า description", "Write description (with prompt) → approve → product description"),
  description_image: () => tr("รูปประกอบคำอธิบาย → อนุมัติ → เข้า media คำอธิบาย", "Description images → approve → description media"),
  custom: () => tr("งานอิสระ ตั้งค่าได้เอง (text/รูป/ลิงก์/ไฟล์)", "Free-form task, configurable (text/image/link/file)"),
};

export function SubtaskTypePicker({ steps, types, onChange, onTypesChanged }: { steps: EditStep[]; types: SubtaskType[]; onChange: (s: EditStep[]) => void; onTypesChanged?: () => void }) {
  const t = useT();
  const [mgrOpen, setMgrOpen] = useState(false);
  const mgrChanged = useRef(false);
  const closeMgr = () => { setMgrOpen(false); if (mgrChanged.current) { mgrChanged.current = false; onTypesChanged?.(); } };
  // แม่แบบคอนเทนต์ (ให้เลือกในสเต็ปชนิด content) — โหลดเมื่อ registry มีชนิด content
  const [contentTpls, setContentTpls] = useState<ContentItem[]>([]);
  useEffect(() => { if (types.some((x) => x.key === "content")) listContentTemplates().then(setContentTpls).catch(() => {}); }, [types]);
  const included = new Set(steps.map((s) => s.type));
  const setStep = (i: number, patch: Partial<EditStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setCfg = (i: number, patch: Partial<SubtaskStepConfig>) => onChange(steps.map((s, j) => (j === i ? { ...s, config: { ...s.config, ...patch } } : s)));
  const removeStep = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const MULTI_TYPES = new Set(["content"]);   // ชนิดที่เพิ่มได้หลายอัน (เช่น คอนเทนต์หลายโพสต์)
  const countOf = (key: string) => steps.filter((s) => s.type === key).length;
  const toggleType = (ty: SubtaskType) => {
    if (MULTI_TYPES.has(ty.key)) { onChange([...steps, stepFromType(ty)]); return; }   // เพิ่มได้เรื่อยๆ (ลบที่การ์ดตั้งค่า)
    if (included.has(ty.key)) onChange(steps.filter((s) => s.type !== ty.key));
    else onChange([...steps, stepFromType(ty)]);
  };
  const addCustom = () => { const ct = types.find((x) => x.key === "custom"); if (ct) onChange([...steps, stepFromType(ct)]); };

  return (
    <div className="space-y-4">
      {/* 1. checkbox card เลือกชนิด */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700">{t("เลือกงานย่อยที่ต้องทำ", "Choose subtasks")}</p>
          <button type="button" onClick={() => { mgrChanged.current = false; setMgrOpen(true); }} className="text-[11px] text-violet-600 hover:underline shrink-0">⚙️ {t("จัดการชนิดงานย่อย", "Manage types")}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {types.map((ty) => {
            const multi = MULTI_TYPES.has(ty.key);
            const cnt = countOf(ty.key);
            const on = multi ? cnt > 0 : included.has(ty.key);
            return (
              <button type="button" key={ty.key} onClick={() => toggleType(ty)} title={multi ? t("กดเพื่อเพิ่มอีก 1 อัน (ลบได้ที่การ์ดตั้งค่าด้านล่าง)", "Click to add another (remove in settings below)") : subtaskTypeHint(ty)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors ${on ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs font-semibold shrink-0 ${on ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400"}`}>{multi ? (cnt > 0 ? cnt : "＋") : (on ? "✓" : <span className="text-transparent">✓</span>)}</span>
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded text-base leading-none shrink-0" style={isHex(ty.color) ? { backgroundColor: `${ty.color}1a` } : undefined}>{ty.icon ?? "🧩"}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{ty.label_th}{multi && <span className="ml-1 text-[10px] font-normal text-violet-500">· {t("เพิ่มได้หลายอัน", "add multiple")}</span>}</span>
                  <span className="block text-[11px] text-slate-400 leading-snug">{TYPE_HINT[ty.key]?.() ?? subtaskTypeHint(ty)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. ตั้งค่าแต่ละงานย่อยที่เลือก */}
      {steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{t("ตั้งค่างานย่อย", "Subtask settings")} ({steps.length})</p>
          {steps.map((s, i) => (
            <StepCard key={i} step={s} index={i} contentTpls={contentTpls}
              onTitle={(v) => setStep(i, { title: v })}
              onReqBefore={(v) => setStep(i, { required_before_next: v })}
              onAssignees={(a) => setStep(i, { assignees: a })}
              onCfg={(p) => setCfg(i, p)}
              onSelectTemplate={(cfg, asg) => onChange(steps.map((s2, j) => j === i ? { ...s2, config: { ...s2.config, ...cfg }, ...(asg ? { assignees: asg } : {}) } : s2))}
              onRemove={() => removeStep(i)} />
          ))}
          <button type="button" onClick={addCustom} className="text-sm text-violet-700 hover:underline">＋ {t("เพิ่มงานอื่น (Custom)", "Add custom task")}</button>
        </div>
      )}

      {/* 3. preview */}
      {steps.length > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{t("เทมเพลตนี้จะสร้างงานย่อย", "This template will create")}:</p>
          <ol className="text-xs text-slate-600 space-y-0.5 list-decimal list-inside">
            {steps.map((s, i) => (
              <li key={i}>
                {(types.find((x) => x.key === s.type)?.icon ?? "🧩")} {s.title || t("(ไม่มีชื่อ)", "(no name)")}
                {s.config.requires_approval && <span className="text-amber-600"> · {t("ต้องอนุมัติ", "needs approval")}</span>}
                {s.config.required && <span className="text-red-500"> · {t("บังคับ", "required")}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {mgrOpen && (
        <ERPModal open onClose={closeMgr} size="xl" title={t("จัดการชนิดงานย่อย", "Manage subtask types")}>
          <SubtaskTypeManager onChanged={() => { mgrChanged.current = true; }} />
        </ERPModal>
      )}
    </div>
  );
}

function StepCard({ step, index, contentTpls, onTitle, onReqBefore, onAssignees, onCfg, onSelectTemplate, onRemove }: {
  step: EditStep; index: number; contentTpls?: ContentItem[];
  onTitle: (v: string) => void; onReqBefore: (v: boolean) => void;
  onAssignees: (a: { id: string; label: string }[]) => void;
  onCfg: (p: Partial<SubtaskStepConfig>) => void;
  onSelectTemplate: (cfg: Partial<SubtaskStepConfig>, assignees?: { id: string; label: string }[]) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const c = step.config;
  const ids = step.assignees.map((a) => a.id);
  const chk = (label: string, val: boolean | undefined, on: (v: boolean) => void) => (
    <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={!!val} onChange={(e) => on(e.target.checked)} />{label}</label>
  );

  return (
    <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-5">{index + 1}.</span>
        <ERPInput value={step.title} onChange={(e) => onTitle(e.target.value)} placeholder={t("ชื่องานย่อย", "Subtask name")} />
        <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500">✕</button>
      </div>

      {/* ค่าตั้งทั่วไป */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {chk(t("บังคับ (required)", "Required"), c.required, (v) => onCfg({ required: v }))}
        {chk(t("ต้องเสร็จก่อนขั้นถัดไป", "Must finish before next"), step.required_before_next, onReqBefore)}
        <label className="flex items-center gap-1.5 text-xs text-slate-600">{t("กำหนดส่ง: หลังสร้าง", "Due: after create")}
          <ERPInput type="number" value={c.due_offset_days == null ? "" : String(c.due_offset_days)} onChange={(e) => onCfg({ due_offset_days: e.target.value === "" ? null : Number(e.target.value) })} className="w-16 h-7" />{t("วัน", "days")}</label>
      </div>

      {/* ค่าตั้งเฉพาะชนิด */}
      {step.type === "images" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100">
          {chk(t("รับหลายรูป", "Multiple images"), c.accepts_multi_image, (v) => onCfg({ accepts_multi_image: v }))}
          {chk(t("รับลิงก์", "Accept link"), c.accepts_link, (v) => onCfg({ accepts_link: v }))}
          {chk(t("ต้องอนุมัติก่อนส่งต่อ", "Require approval"), c.requires_approval, (v) => onCfg({ requires_approval: v }))}
          <span className="text-[11px] text-emerald-600">→ {t("อนุมัติแล้วเพิ่มเข้าแกลเลอรีรูปสินค้า", "approved → product gallery")}</span>
        </div>
      )}

      {step.type === "description_text" && (
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {chk(t("ต้องอนุมัติ", "Require approval"), c.requires_approval, (v) => onCfg({ requires_approval: v }))}
            {chk(t("มีปุ่ม copy prompt", "Copy prompt"), c.has_copy_prompt, (v) => onCfg({ has_copy_prompt: v }))}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">{t("ลงช่อง", "Field")}
              <ERPSelect value={c.description_field ?? "description"} options={DESC_FIELD_OPTS()} onChange={(e) => onCfg({ description_field: e.target.value })} className="h-7" /></label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">{t("วิธีบันทึก", "Mode")}
              <ERPSelect value={c.desc_mode ?? "append"} options={[{ value: "append", label: t("ต่อท้าย", "Append") }, { value: "replace", label: t("แทนที่", "Replace") }]} onChange={(e) => onCfg({ desc_mode: e.target.value as "append" | "replace" })} className="h-7" /></label>
          </div>
          {c.has_copy_prompt && (
            <PromptEditor value={c.prompt_template ?? ""} rows={3} onChange={(v) => onCfg({ prompt_template: v })}
              placeholder={t("เขียน prompt แล้วกดปุ่มด้านล่างเพื่อแทรกตัวแปร", "Write the prompt, click chips below to insert variables")} />
          )}
        </div>
      )}

      {step.type === "description_image" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100">
          {chk(t("รับหลายรูป", "Multiple images"), c.accepts_multi_image, (v) => onCfg({ accepts_multi_image: v }))}
          {chk(t("รับลิงก์", "Accept link"), c.accepts_link, (v) => onCfg({ accepts_link: v }))}
          {chk(t("ต้องอนุมัติ", "Require approval"), c.requires_approval, (v) => onCfg({ requires_approval: v }))}
          <span className="text-[11px] text-emerald-600">→ {t("อนุมัติแล้วเพิ่มเข้า media คำอธิบาย", "approved → description media")}</span>
        </div>
      )}

      {step.type === "custom" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100">
          {chk(t("รับข้อความ", "Text"), c.accepts_text, (v) => onCfg({ accepts_text: v }))}
          {chk(t("รับรูป", "Image"), c.accepts_image, (v) => onCfg({ accepts_image: v }))}
          {chk(t("รับลิงก์", "Link"), c.accepts_link, (v) => onCfg({ accepts_link: v }))}
          {chk(t("รับไฟล์", "File"), c.accepts_file, (v) => onCfg({ accepts_file: v }))}
          {chk(t("ต้องอนุมัติ", "Require approval"), c.requires_approval, (v) => onCfg({ requires_approval: v }))}
        </div>
      )}

      {/* content: เลือกแม่แบบคอนเทนต์ + ประเภท (เก็บใน config → ตอนสร้างงานจากเทมเพลตจะสร้างคอนเทนต์ให้ตามแม่แบบ) */}
      {step.type === "content" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          <div>
            <label className="text-[11px] text-slate-400">{t("แม่แบบคอนเทนต์ (ถ้ามี)", "Content template (optional)")}</label>
            <ERPSelect value={c.content_template_id ?? ""}
              options={[{ value: "", label: t("— ไม่ใช้แม่แบบ —", "— none —") }, ...(contentTpls ?? []).map((ct) => ({ value: ct.id, label: ct.title }))]}
              onChange={(e) => {
                const id = e.target.value;
                const tpl = (contentTpls ?? []).find((x) => x.id === id);
                const asg = (tpl && tpl.assignees?.length) ? tpl.assignees.map((a) => ({ id: a.id, label: a.name })) : undefined;
                // อัปเดตครั้งเดียว (config + ผู้รับผิดชอบ) กัน race ที่ทำให้ post_type/แม่แบบหาย
                onSelectTemplate({ content_template_id: id || undefined, ...(tpl?.post_type ? { post_type: tpl.post_type } : {}) }, asg);
              }} className="h-8" />
          </div>
          <div>
            <label className="text-[11px] text-slate-400">{t("ประเภทคอนเทนต์", "Content type")}</label>
            <ERPSelect value={c.post_type ?? ""}
              options={[{ value: "", label: t("— เลือกประเภท —", "— select —") }, ...POST_TYPES.map((p) => ({ value: p.value, label: postTypeLabel(p.value) }))]}
              onChange={(e) => onCfg({ post_type: e.target.value || undefined })} className="h-8" />
          </div>
        </div>
      )}

      {/* ผูกกับ + ผู้รับผิดชอบ */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">{t("ผูกกับ:", "Applies to:")}</span>
        {chk("Parent SKU", c.applies_to?.includes("parent"), (v) => onCfg({ applies_to: v ? [...new Set([...(c.applies_to ?? []), "parent" as const])] : (c.applies_to ?? []).filter((x) => x !== "parent") }))}
        {chk("SKU", c.applies_to?.includes("sku"), (v) => onCfg({ applies_to: v ? [...new Set([...(c.applies_to ?? []), "sku" as const])] : (c.applies_to ?? []).filter((x) => x !== "sku") }))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ:", "Assignees:")}</span>
        {step.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button type="button" onClick={() => onAssignees(step.assignees.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        <div className="w-44"><UserPicker value={adding} onChange={(v) => { if (v && !ids.includes(v.id)) onAssignees([...step.assignees, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate /></div>
        <TeamFill onPick={(members) => { const fresh = members.filter((m) => !ids.includes(m.id)).map((m) => ({ id: m.id, label: m.name })); if (fresh.length) onAssignees([...step.assignees, ...fresh]); }} />
      </div>
    </div>
  );
}
