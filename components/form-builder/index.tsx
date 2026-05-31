"use client";

import React from "react";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { useAuth, type Permission } from "@/components/auth";

// ============================================================
// Form Layout Builder — engine กลาง (full feature)
//   - field types + default + placeholder + options
//   - validation (min/max/pattern/custom message)
//   - conditional visibility (showWhen)
//   - FormRenderer + validateForm + getDefaultValues
// ============================================================

export type FormFieldType = "text" | "number" | "currency" | "boolean" | "date" | "select" | "textarea";

export type ValidationRule = {
  min?:           number;
  max?:           number;
  pattern?:       "none" | "email" | "phone" | "url";
  customMessage?: string;
};

export type ConditionalOp = "equals" | "not_equals" | "is_empty" | "is_not_empty";

export type ConditionalRule = {
  field:    string;        // key ของช่องอ้างอิง
  operator: ConditionalOp;
  value:    string;
};

export type FormFieldConfig = {
  key:          string;
  label:        string;
  type:         FormFieldType;
  required?:    boolean;
  hidden?:      boolean;
  readonly?:    boolean;
  width?:       1 | 2 | 3;
  helpText?:    string;
  placeholder?: string;
  defaultValue?: string;
  options?:     { value: string; label: string }[];
  validation?:  ValidationRule;
  showWhen?:    ConditionalRule | null;
  /** ต้องมีสิทธิ์นี้ถึงเห็น field (เช่น "products.cost.view") */
  permission?:  string;
};

export type FormSection = {
  id:      string;
  title:   string;
  columns: 1 | 2 | 3;
  fields:  FormFieldConfig[];
};

export type FormLayoutConfig = { sections: FormSection[] };

// ---- map ui_type จาก Field Registry ----
export function mapRegistryType(uiType: string): FormFieldType {
  switch (uiType) {
    case "currency": return "currency";
    case "number":   return "number";
    case "boolean":  return "boolean";
    case "date":     return "date";
    default:         return "text";
  }
}

// ---- localStorage ----
const KEY = (formId: string) => `erp-form-layout-${formId}`;
export function loadFormLayout(formId: string): FormLayoutConfig | null {
  try { const raw = localStorage.getItem(KEY(formId)); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
export function saveFormLayout(formId: string, config: FormLayoutConfig) {
  try { localStorage.setItem(KEY(formId), JSON.stringify(config)); } catch { /* ignore */ }
}
export function clearFormLayout(formId: string) {
  try { localStorage.removeItem(KEY(formId)); } catch { /* ignore */ }
}

// ---- Conditional: ช่องนี้ควรแสดงไหม ----
export function isFieldVisible(f: FormFieldConfig, values: Record<string, unknown>): boolean {
  if (f.hidden) return false;
  if (!f.showWhen || !f.showWhen.field) return true;
  const ref = String(values[f.showWhen.field] ?? "");
  const cmp = f.showWhen.value;
  switch (f.showWhen.operator) {
    case "equals":       return ref === cmp;
    case "not_equals":   return ref !== cmp;
    case "is_empty":     return ref === "";
    case "is_not_empty": return ref !== "";
    default:             return true;
  }
}

// ---- Default values จาก config ----
export function getDefaultValues(config: FormLayoutConfig): Record<string, unknown> {
  const vals: Record<string, unknown> = {};
  config.sections.forEach(s => s.fields.forEach(f => {
    if (f.defaultValue !== undefined && f.defaultValue !== "") {
      vals[f.key] = (f.type === "number" || f.type === "currency") ? Number(f.defaultValue) : f.defaultValue;
    }
  }));
  return vals;
}

// ---- Validation ----
const PATTERNS: Record<string, { re: RegExp; msg: string }> = {
  email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: "รูปแบบอีเมลไม่ถูกต้อง" },
  phone: { re: /^[0-9+\-\s()]{6,}$/,          msg: "รูปแบบเบอร์โทรไม่ถูกต้อง" },
  url:   { re: /^https?:\/\/.+/,               msg: "รูปแบบ URL ไม่ถูกต้อง" },
};

export function validateForm(
  config: FormLayoutConfig,
  values: Record<string, unknown>,
  canFn?: (perm: string) => boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  config.sections.forEach(s => s.fields.forEach(f => {
    if (f.permission && canFn && !canFn(f.permission)) return;  // ไม่มีสิทธิ์ → ไม่ validate
    if (!isFieldVisible(f, values)) return;       // ข้ามช่องที่ซ่อน/เงื่อนไขไม่ตรง
    const raw = values[f.key];
    const str = String(raw ?? "").trim();

    if (f.required && str === "") {
      errors[f.key] = f.validation?.customMessage ?? `กรุณากรอก ${f.label}`;
      return;
    }
    if (str === "") return;  // ไม่บังคับ + ว่าง → ผ่าน

    const v = f.validation;
    if (v) {
      if ((f.type === "number" || f.type === "currency")) {
        const n = Number(str);
        if (v.min !== undefined && n < v.min) errors[f.key] = v.customMessage ?? `ต้องไม่น้อยกว่า ${v.min}`;
        if (v.max !== undefined && n > v.max) errors[f.key] = v.customMessage ?? `ต้องไม่เกิน ${v.max}`;
      } else {
        if (v.min !== undefined && str.length < v.min) errors[f.key] = v.customMessage ?? `ต้องยาวอย่างน้อย ${v.min} ตัว`;
        if (v.max !== undefined && str.length > v.max) errors[f.key] = v.customMessage ?? `ต้องยาวไม่เกิน ${v.max} ตัว`;
      }
      if (v.pattern && v.pattern !== "none" && PATTERNS[v.pattern] && !PATTERNS[v.pattern].re.test(str)) {
        errors[f.key] = v.customMessage ?? PATTERNS[v.pattern].msg;
      }
    }
  }));
  return errors;
}

// ============================================================
// FormRenderer
// ============================================================

export function FormRenderer({
  config, values, onChange, errors = {}, readonlyAll = false,
}: {
  config: FormLayoutConfig;
  values: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
  readonlyAll?: boolean;
}) {
  const { can } = useAuth();
  const renderInput = (f: FormFieldConfig) => {
    const val = values[f.key];
    const ro = readonlyAll || f.readonly;
    const hasErr = !!errors[f.key];

    if (f.type === "boolean") {
      return (
        <label className="flex items-center gap-2 h-9">
          <input type="checkbox" disabled={ro} checked={!!val}
            onChange={e => onChange?.(f.key, e.target.checked)}
            className="rounded border-slate-300 text-blue-600 disabled:opacity-50" />
          <span className="text-sm text-slate-600">{f.label}</span>
        </label>
      );
    }
    if (f.type === "select") {
      return (
        <ERPSelect value={String(val ?? "")} disabled={ro} error={hasErr}
          options={f.options ?? []} placeholder={f.placeholder ?? "— เลือก —"}
          onChange={e => onChange?.(f.key, e.target.value)} />
      );
    }
    if (f.type === "textarea") {
      return (
        <ERPTextarea value={String(val ?? "")} rows={2} disabled={ro} error={hasErr}
          placeholder={f.placeholder}
          onChange={e => onChange?.(f.key, e.target.value)} />
      );
    }
    const inputType = (f.type === "number" || f.type === "currency") ? "number" : f.type === "date" ? "date" : "text";
    return (
      <ERPInput type={inputType} value={String(val ?? "")} readOnly={ro} error={hasErr}
        placeholder={f.placeholder}
        onChange={e => onChange?.(f.key, inputType === "number" ? Number(e.target.value) : e.target.value)} />
    );
  };

  return (
    <>
      {config.sections.map(section => {
        const visible = section.fields.filter(f =>
          isFieldVisible(f, values) && (!f.permission || can(f.permission as Permission))
        );
        if (visible.length === 0) return null;
        return (
          <ERPFormSection key={section.id} title={section.title} columns={section.columns}>
            {visible.map(f => (
              f.type === "boolean" ? (
                <ERPFormField key={f.key} label="" error={errors[f.key]} span={f.width}>
                  {renderInput(f)}
                </ERPFormField>
              ) : (
                <ERPFormField key={f.key} label={f.label} required={f.required} hint={f.helpText} error={errors[f.key]} span={f.width}>
                  {renderInput(f)}
                </ERPFormField>
              )
            ))}
          </ERPFormSection>
        );
      })}
    </>
  );
}
