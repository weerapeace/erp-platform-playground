"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  ERPForm, ERPFormSection, ERPFormField,
  ERPInput, ERPTextarea, ERPSelect, LineItems,
  type LineItem,
} from "@/components/form";
import { ProductPicker, SupplierPicker, type ProductOption, type SupplierOption } from "@/components/pickers";

// ---- Purchase Request Form Demo ----

type PRFormData = {
  title: string;
  department: string;
  requiredDate: string;
  priority: string;
  supplier: SupplierOption | null;
  note: string;
  items: LineItem[];
};

const EMPTY_FORM: PRFormData = {
  title: "", department: "", requiredDate: "", priority: "normal",
  supplier: null, note: "", items: [],
};

const DEPT_OPTIONS = [
  { value: "purchase", label: "จัดซื้อ" },
  { value: "warehouse", label: "คลังสินค้า" },
  { value: "it", label: "ไอที" },
  { value: "hr", label: "HR" },
  { value: "finance", label: "บัญชี/การเงิน" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "ต่ำ — ไม่เร่งด่วน" },
  { value: "normal", label: "ปกติ" },
  { value: "high", label: "สูง — เร่งด่วน" },
  { value: "urgent", label: "ด่วนมาก" },
];

export default function FormPlaygroundPage() {
  const [formData, setFormData] = useState<PRFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof PRFormData, string>>>({});
  const [loading, setLoading] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const update = <K extends keyof PRFormData>(key: K, val: PRFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof PRFormData, string>> = {};
    if (!formData.title.trim()) errs.title = "กรุณาระบุหัวข้อใบขอซื้อ";
    if (!formData.department) errs.department = "กรุณาเลือกแผนก";
    if (!formData.requiredDate) errs.requiredDate = "กรุณาระบุวันที่ต้องการ";
    if (formData.items.length === 0) errs.items = "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      setIsDirty(false);
    }, 1800);
  };

  const handleReset = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    setIsDirty(false);
    setSubmitted(false);
  };

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 6 — Form System
        </div>
        <h1 className="text-2xl font-bold text-slate-900">📝 Form Playground</h1>
        <p className="text-slate-500 mt-1">ฟอร์มกลาง — ตัวอย่าง Purchase Request Form</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Demo toggles */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setReadonly(!readonly)}
            className={`h-8 px-4 text-sm font-medium rounded-lg border transition-colors ${
              readonly
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
            }`}
          >
            {readonly ? "🔒 Readonly Mode" : "🔓 Edit Mode"}
          </button>
          {submitted && (
            <button onClick={handleReset} className="h-8 px-4 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              ✅ Submit แล้ว — กด Reset เพื่อทดสอบใหม่
            </button>
          )}
        </div>

        {/* Success banner */}
        {submitted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-emerald-800">Submit ฟอร์มสำเร็จ!</p>
              <p className="text-sm text-emerald-600 mt-0.5">ระบบได้รับข้อมูลแล้ว — ในระบบจริงจะสร้างเลขที่เอกสารและส่ง notification</p>
            </div>
          </div>
        )}

        {/* The actual form */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">ใบขอซื้อ (Purchase Request)</h2>
                <p className="text-xs text-slate-500 mt-0.5">กรอกข้อมูลให้ครบถ้วนแล้วกด &ldquo;Submit ใบขอซื้อ&rdquo;</p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full font-mono">
                DRAFT
              </span>
            </div>
          </div>

          <div className="px-6 py-6">
            <ERPForm
              onSubmit={handleSubmit}
              onCancel={handleReset}
              loading={loading}
              readonly={readonly}
              submitText="Submit ใบขอซื้อ"
              cancelText="ล้างข้อมูล"
              isDirty={isDirty}
            >
              {/* Section 1: Basic info */}
              <ERPFormSection title="ข้อมูลทั่วไป" columns={2}>
                <ERPFormField label="หัวข้อใบขอซื้อ" required error={errors.title} span={2}>
                  <ERPInput
                    value={formData.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="เช่น ขอซื้ออุปกรณ์สำนักงานประจำเดือน มิ.ย."
                    error={!!errors.title}
                    disabled={readonly}
                  />
                </ERPFormField>

                <ERPFormField label="แผนก" required error={errors.department}>
                  <ERPSelect
                    value={formData.department}
                    onChange={(e) => update("department", e.target.value)}
                    options={DEPT_OPTIONS}
                    placeholder="— เลือกแผนก —"
                    error={!!errors.department}
                    disabled={readonly}
                  />
                </ERPFormField>

                <ERPFormField label="วันที่ต้องการสินค้า" required error={errors.requiredDate}>
                  <ERPInput
                    type="date"
                    value={formData.requiredDate}
                    onChange={(e) => update("requiredDate", e.target.value)}
                    error={!!errors.requiredDate}
                    disabled={readonly}
                  />
                </ERPFormField>

                <ERPFormField label="ความเร่งด่วน">
                  <ERPSelect
                    value={formData.priority}
                    onChange={(e) => update("priority", e.target.value)}
                    options={PRIORITY_OPTIONS}
                    disabled={readonly}
                  />
                </ERPFormField>

                <ERPFormField label="ผู้จำหน่ายที่ต้องการ" hint="ถ้าไม่ระบุ จัดซื้อจะเลือกให้">
                  <SupplierPicker
                    value={formData.supplier}
                    onChange={(v) => update("supplier", v)}
                    disabled={readonly}
                  />
                </ERPFormField>
              </ERPFormSection>

              <div className="border-t border-slate-100 my-6" />

              {/* Section 2: Line items */}
              <ERPFormSection title="รายการสินค้าที่ต้องการ" description="เพิ่มสินค้าที่ต้องการสั่งซื้อ">
                {errors.items && (
                  <div className="col-span-full text-xs text-red-600 flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-1">
                    ⚠ {errors.items}
                  </div>
                )}
                <div className="col-span-full">
                  <LineItems
                    items={formData.items}
                    onChange={(items) => { update("items", items); }}
                    readonly={readonly}
                  />
                </div>
              </ERPFormSection>

              <div className="border-t border-slate-100 my-6" />

              {/* Section 3: Note */}
              <ERPFormSection title="หมายเหตุและเอกสารแนบ">
                <ERPFormField label="หมายเหตุ" hint="ข้อมูลเพิ่มเติมสำหรับทีมจัดซื้อ" span={2}>
                  <ERPTextarea
                    value={formData.note}
                    onChange={(e) => update("note", e.target.value)}
                    placeholder="ระบุเงื่อนไขพิเศษ, รูปแบบสินค้า, หรือข้อมูลที่เกี่ยวข้อง..."
                    rows={3}
                    disabled={readonly}
                  />
                </ERPFormField>
              </ERPFormSection>
            </ERPForm>
          </div>
        </div>

        {/* Feature checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "ERPFormSection (sections)" },
              { done: true,  label: "ERPFormField (label + error)" },
              { done: true,  label: "Required field indicator" },
              { done: true,  label: "Field validation + errors" },
              { done: true,  label: "Dirty state (unsaved indicator)" },
              { done: true,  label: "Loading on submit" },
              { done: true,  label: "Readonly mode" },
              { done: true,  label: "Multi-column layout" },
              { done: true,  label: "Line Items (เพิ่ม/ลบ/แก้)" },
              { done: true,  label: "Total calculation" },
              { done: true,  label: "SupplierPicker integration" },
              { done: true,  label: "Conditional fields (Form Builder)" },
              { done: true,  label: "Field permission (Form Builder)" },
              { done: true,  label: "Save draft (Products CRUD)" },
              { done: true,  label: "File attachments (R2 + ImageManager)" },
              { done: false, label: "Audit log per field (มี record-level)" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

      </div>
    </PlaygroundShell>
  );
}
