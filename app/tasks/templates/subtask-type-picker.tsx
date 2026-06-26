"use client";

// ============================================================
// SubtaskTypePicker — เลือกชนิดงานย่อยด้วย checkbox card + ตั้งค่าแต่ละชนิด (ของกลางหน้าเทมเพลต)
// ชนิด + ความสามารถ/ค่าเริ่มต้นมาจาก registry กลาง (erp_subtask_types) — ไม่ hardcode
// step.config = snapshot ค่าตั้ง (เก็บลง template.steps แล้วคัดลอกไป subtask ตอนสร้างงาน)
// ============================================================

import { useState } from "react";
import { useT } from "@/components/i18n";
import { ERPInput, ERPTextarea, ERPSelect } from "@/components/form";
import { UserPicker, type UserPickerValue } from "@/components/pickers";
import type { SubtaskType, SubtaskStepConfig } from "../data";

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

const DESC_FIELD_OPTS = [
  { value: "description", label: "คำอธิบายหลัก" },
  { value: "english_description", label: "คำอธิบาย (อังกฤษ)" },
  { value: "platform_description", label: "คำอธิบายแพลตฟอร์ม" },
];

const TYPE_HINT: Record<string, string> = {
  images: "อัปรูป → อนุมัติ → เข้าแกลเลอรีรูปสินค้า",
  description_text: "เขียนคำอธิบาย (มี prompt) → อนุมัติ → เข้า description",
  description_image: "รูปประกอบคำอธิบาย → อนุมัติ → เข้า media คำอธิบาย",
  custom: "งานอิสระ ตั้งค่าได้เอง (text/รูป/ลิงก์/ไฟล์)",
};

export function SubtaskTypePicker({ steps, types, onChange }: { steps: EditStep[]; types: SubtaskType[]; onChange: (s: EditStep[]) => void }) {
  const t = useT();
  const included = new Set(steps.map((s) => s.type));
  const setStep = (i: number, patch: Partial<EditStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setCfg = (i: number, patch: Partial<SubtaskStepConfig>) => onChange(steps.map((s, j) => (j === i ? { ...s, config: { ...s.config, ...patch } } : s)));
  const removeStep = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const toggleType = (ty: SubtaskType) => {
    if (included.has(ty.key)) onChange(steps.filter((s) => s.type !== ty.key));
    else onChange([...steps, stepFromType(ty)]);
  };
  const addCustom = () => { const ct = types.find((x) => x.key === "custom"); if (ct) onChange([...steps, stepFromType(ct)]); };

  return (
    <div className="space-y-4">
      {/* 1. checkbox card เลือกชนิด */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">{t("เลือกงานย่อยที่ต้องทำ", "Choose subtasks")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {types.map((ty) => {
            const on = included.has(ty.key);
            return (
              <button type="button" key={ty.key} onClick={() => toggleType(ty)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors ${on ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${on ? "bg-violet-600 text-white" : "bg-slate-100 text-transparent"}`}>✓</span>
                <span className="text-lg leading-none mt-0.5">{ty.icon ?? "🧩"}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{ty.label_th}</span>
                  <span className="block text-[11px] text-slate-400 leading-snug">{TYPE_HINT[ty.key] ?? (ty.has_copy_prompt ? "มี prompt ช่วยเขียน" : "งานย่อยทั่วไป")}</span>
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
            <StepCard key={i} step={s} index={i}
              onTitle={(v) => setStep(i, { title: v })}
              onReqBefore={(v) => setStep(i, { required_before_next: v })}
              onAssignees={(a) => setStep(i, { assignees: a })}
              onCfg={(p) => setCfg(i, p)}
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
    </div>
  );
}

function StepCard({ step, index, onTitle, onReqBefore, onAssignees, onCfg, onRemove }: {
  step: EditStep; index: number;
  onTitle: (v: string) => void; onReqBefore: (v: boolean) => void;
  onAssignees: (a: { id: string; label: string }[]) => void;
  onCfg: (p: Partial<SubtaskStepConfig>) => void; onRemove: () => void;
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
          {chk(t("มีปุ่ม copy prompt", "Copy prompt button"), c.has_copy_prompt, (v) => onCfg({ has_copy_prompt: v }))}
          <span className="text-[11px] text-emerald-600">→ {t("อนุมัติแล้วเพิ่มเข้าแกลเลอรีรูปสินค้า", "approved → product gallery")}</span>
        </div>
      )}

      {step.type === "description_text" && (
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {chk(t("ต้องอนุมัติ", "Require approval"), c.requires_approval, (v) => onCfg({ requires_approval: v }))}
            {chk(t("มีปุ่ม copy prompt", "Copy prompt"), c.has_copy_prompt, (v) => onCfg({ has_copy_prompt: v }))}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">{t("ลงช่อง", "Field")}
              <ERPSelect value={c.description_field ?? "description"} options={DESC_FIELD_OPTS} onChange={(e) => onCfg({ description_field: e.target.value })} className="h-7" /></label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">{t("วิธีบันทึก", "Mode")}
              <ERPSelect value={c.desc_mode ?? "append"} options={[{ value: "append", label: t("ต่อท้าย", "Append") }, { value: "replace", label: t("แทนที่", "Replace") }]} onChange={(e) => onCfg({ desc_mode: e.target.value as "append" | "replace" })} className="h-7" /></label>
          </div>
          <ERPTextarea value={c.prompt_template ?? ""} rows={3} onChange={(e) => onCfg({ prompt_template: e.target.value })}
            placeholder={t("Prompt template (ใช้ตัวแปร {{brand_name}} {{price}} {{colors}} {{materials}} {{collection}} {{platforms}} ...)", "Prompt template with {{vars}}")} />
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
      </div>
    </div>
  );
}
