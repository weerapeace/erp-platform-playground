"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

// ---- Icons ----

function IconLoader() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
function IconAlertCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconTrash2() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ---- ERPFormSection ----

export interface ERPFormSectionProps {
  title?: string;
  description?: string;
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
}

export function ERPFormSection({ title, description, columns = 1, children }: ERPFormSectionProps) {
  return (
    <div className="mb-6 last:mb-0">
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      )}
      <div className={`grid gap-4 ${
        columns === 2 ? "grid-cols-1 sm:grid-cols-2" :
        columns === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
        "grid-cols-1"
      }`}>
        {children}
      </div>
    </div>
  );
}

// ---- ERPFormField ----

export interface ERPFormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  span?: 1 | 2 | 3;
  className?: string;
  style?: React.CSSProperties;
}

export function ERPFormField({ label, required, error, hint, children, span = 1, className = "", style }: ERPFormFieldProps) {
  const spanClass = span === 2 ? "sm:col-span-2" : span === 3 ? "sm:col-span-3" : "";
  return (
    <div className={`${spanClass} ${className}`} style={style}>
      <label className="block text-xs font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <div className="flex items-center gap-1 mt-1.5 text-red-600">
          <IconAlertCircle />
          <span className="text-xs">{error}</span>
        </div>
      )}
      {hint && !error && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ---- Base Input ----

export interface ERPInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
}

export function ERPInput({ error, leftIcon, className = "", ...props }: ERPInputProps) {
  return (
    <div className="relative">
      {leftIcon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {leftIcon}
        </span>
      )}
      <input
        {...props}
        className={`w-full h-9 ${leftIcon ? "pl-9" : "pl-3"} pr-3 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors
          ${error
            ? "border-red-300 focus:ring-red-500 focus:border-transparent bg-red-50"
            : "border-slate-200 focus:ring-blue-500 focus:border-transparent bg-white"
          }
          ${props.disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : ""}
          ${props.readOnly ? "bg-slate-50 text-slate-600" : ""}
          ${className}`}
      />
    </div>
  );
}

// ---- Textarea ----

export interface ERPTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const ERPTextarea = React.forwardRef<HTMLTextAreaElement, ERPTextareaProps>(function ERPTextarea({ error, className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none transition-colors
        ${error
          ? "border-red-300 focus:ring-red-500 focus:border-transparent bg-red-50"
          : "border-slate-200 focus:ring-blue-500 focus:border-transparent bg-white"
        }
        ${props.disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : ""}
        ${className}`}
    />
  );
});

// ---- Select ----

export interface ERPSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function ERPSelect({ error, options, placeholder, className = "", ...props }: ERPSelectProps) {
  return (
    <select
      {...props}
      className={`w-full h-9 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors appearance-none bg-white
        ${error
          ? "border-red-300 focus:ring-red-500 focus:border-transparent"
          : "border-slate-200 focus:ring-blue-500 focus:border-transparent"
        }
        ${props.disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : ""}
        ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ---- Line Items ----

export type LineItem = {
  id: string;
  product: string;
  qty: number;
  unit: string;
  price: number;
  note: string;
};

export interface LineItemsProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  readonly?: boolean;
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

export function LineItems({ items, onChange, readonly = false }: LineItemsProps) {
  const addRow = () => {
    onChange([...items, { id: genId(), product: "", qty: 1, unit: "ชิ้น", price: 0, note: "" }]);
  };
  const removeRow = (id: string) => onChange(items.filter((i) => i.id !== id));
  const updateRow = (id: string, key: keyof LineItem, value: string | number) => {
    onChange(items.map((i) => i.id === id ? { ...i, [key]: value } : i));
  };

  const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-8">#</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">สินค้า</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-24">จำนวน</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-20">หน่วย</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-28">ราคา/หน่วย</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 w-28">รวม</th>
              {!readonly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={readonly ? 6 : 7} className="px-3 py-6 text-center text-xs text-slate-400">
                  ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot; ด้านล่าง
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-400 text-center">{idx + 1}</td>
                  <td className="px-3 py-2">
                    {readonly ? (
                      <span className="text-sm text-slate-700">{item.product || "—"}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.product}
                        onChange={(e) => updateRow(item.id, "product", e.target.value)}
                        placeholder="ชื่อสินค้า / รายการ"
                        className="w-full h-8 px-2 text-sm border border-transparent rounded focus:border-blue-300 focus:outline-none focus:bg-blue-50"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readonly ? (
                      <span className="text-sm">{item.qty}</span>
                    ) : (
                      <input
                        type="number"
                        value={item.qty}
                        min={1}
                        onChange={(e) => updateRow(item.id, "qty", Number(e.target.value))}
                        className="w-full h-8 px-2 text-sm border border-transparent rounded focus:border-blue-300 focus:outline-none focus:bg-blue-50 text-right"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readonly ? (
                      <span className="text-sm">{item.unit}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateRow(item.id, "unit", e.target.value)}
                        className="w-full h-8 px-2 text-sm border border-transparent rounded focus:border-blue-300 focus:outline-none focus:bg-blue-50"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readonly ? (
                      <span className="text-sm">฿{item.price.toLocaleString("th-TH")}</span>
                    ) : (
                      <input
                        type="number"
                        value={item.price}
                        min={0}
                        onChange={(e) => updateRow(item.id, "price", Number(e.target.value))}
                        className="w-full h-8 px-2 text-sm border border-transparent rounded focus:border-blue-300 focus:outline-none focus:bg-blue-50 text-right"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-slate-700">
                    ฿{(item.qty * item.price).toLocaleString("th-TH")}
                  </td>
                  {!readonly && (
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => removeRow(item.id)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded"
                      >
                        <IconTrash2 />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={readonly ? 5 : 6} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                  ยอดรวม
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">
                  ฿{total.toLocaleString("th-TH")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!readonly && (
        <button
          onClick={addRow}
          type="button"
          className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <IconPlus />
          เพิ่มรายการ
        </button>
      )}
    </div>
  );
}

// ---- ERPForm ----

export interface ERPFormProps {
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
  loading?: boolean;
  readonly?: boolean;
  submitText?: string;
  cancelText?: string;
  isDirty?: boolean;
  children: React.ReactNode;
}

export function ERPForm({
  onSubmit,
  onCancel,
  loading = false,
  readonly = false,
  submitText = "บันทึก",
  cancelText = "ยกเลิก",
  isDirty = false,
  children,
}: ERPFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {readonly && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          โหมดดูอย่างเดียว — ไม่สามารถแก้ไขได้
        </div>
      )}

      {children}

      {!readonly && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {isDirty && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
            </span>
          )}
          {!isDirty && <span />}
          <div className="flex gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="h-9 px-5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {cancelText}
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {loading && <IconLoader />}
              {submitText}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
