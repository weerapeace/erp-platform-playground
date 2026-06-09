"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/modal";
import type {
  PayrollEmployeeSettingTemplate,
  PayrollEmployeeSettingTemplateValues,
} from "@/lib/payroll-employee-setting-templates";

type ApiRecord = {
  storageReady: boolean;
  storageReason: string;
  templates: PayrollEmployeeSettingTemplate[];
  updatedAt: string | null;
};

type ApplyResult = {
  templateKey: string;
  matchedEmployees: number;
  created: number;
  updated: number;
};

const BOOLEAN_FIELDS: { key: keyof PayrollEmployeeSettingTemplateValues; label: string; help: string }[] = [
  { key: "social_security_enabled", label: "ประกันสังคม", help: "เปิด/ปิดการหักประกันสังคมรายคน" },
  { key: "withholding_tax_enabled", label: "ภาษีหัก ณ ที่จ่าย", help: "เปิด/ปิดการคำนวณภาษีรายคน" },
  { key: "overtime_enabled", label: "คำนวณ OT", help: "เปิด/ปิดการจ่าย OT สำหรับสัญญาประเภทนี้" },
  { key: "piece_rate_enabled", label: "รายชิ้น", help: "เปิดถ้าคิดเงินจากจำนวนชิ้นงาน" },
  { key: "attendance_bonus_enabled", label: "เบี้ยขยัน", help: "เปิดถ้ามีเงื่อนไขเบี้ยขยัน" },
  { key: "advance_payment_allowed", label: "เบิกกลางเดือน", help: "เปิดให้เบิก/หักกลางเดือน" },
];

const NUMBER_FIELDS: { key: keyof PayrollEmployeeSettingTemplateValues; label: string; suffix: string; help: string }[] = [
  { key: "social_security_employee_amount", label: "หักประกันสังคม", suffix: "บาท", help: "ยอดหักฝั่งพนักงาน" },
  { key: "social_security_employer_amount", label: "นายจ้างสมทบ", suffix: "บาท", help: "ยอดสมทบฝั่งบริษัท" },
  { key: "withholding_tax_rate", label: "อัตราภาษี", suffix: "%", help: "ใช้กับวิธีคิดภาษีแบบกำหนดเอง" },
  { key: "max_advance_amount", label: "เบิกกลางเดือนสูงสุด", suffix: "บาท", help: "เพดานเบิกเงินล่วงหน้า" },
  { key: "default_mid_month_advance_amount", label: "ยอดเบิกกลางเดือนเริ่มต้น", suffix: "บาท", help: "ค่า default ตอนสร้างรายการเบิก" },
];

function money(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function enabledText(value: boolean) {
  return value ? "เปิด" : "ปิด";
}

export function PayrollEmployeeSettingTemplatesCard() {
  const [record, setRecord] = useState<ApiRecord | null>(null);
  const [templates, setTemplates] = useState<PayrollEmployeeSettingTemplate[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingApply, setPendingApply] = useState<PayrollEmployeeSettingTemplate | null>(null);

  const active = useMemo(() => {
    return templates.find((t) => t.key === activeKey) ?? templates[0] ?? null;
  }, [activeKey, templates]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/payroll/employee-setting-templates", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "โหลด template ไม่สำเร็จ");
      const next = json.data as ApiRecord;
      setRecord(next);
      setTemplates(next.templates ?? []);
      setActiveKey((current) => current || next.templates?.[0]?.key || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลด template ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateActive(patch: Partial<PayrollEmployeeSettingTemplate>) {
    if (!active) return;
    setTemplates((rows) => rows.map((row) => row.key === active.key ? { ...row, ...patch } : row));
  }

  function updateValue<K extends keyof PayrollEmployeeSettingTemplateValues>(key: K, value: PayrollEmployeeSettingTemplateValues[K]) {
    if (!active) return;
    setTemplates((rows) => rows.map((row) => {
      if (row.key !== active.key) return row;
      return { ...row, values: { ...row.values, [key]: value } };
    }));
  }

  async function saveTemplates() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/payroll/employee-setting-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "บันทึก template ไม่สำเร็จ");
      const next = json.data as ApiRecord;
      setRecord(next);
      setTemplates(next.templates ?? []);
      setNotice("บันทึก template แล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึก template ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function applyTemplate() {
    if (!pendingApply) return;
    setApplying(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/payroll/employee-setting-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", templateKey: pendingApply.key }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "นำ template ไปใช้ไม่สำเร็จ");
      const result = json.data as ApplyResult;
      setNotice(`นำ template ไปใช้แล้ว: สร้าง ${result.created} รายการ, แก้ไข ${result.updated} รายการ`);
      setPendingApply(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำ template ไปใช้ไม่สำเร็จ");
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
        กำลังโหลด template เงินเดือนรายคน...
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Template ตั้งค่าเงินเดือนรายคน</h2>
              <p className="mt-1 text-sm text-slate-500">
                ตั้งค่าตามประเภทสัญญา แล้วค่อยกดนำไปใช้กับพนักงานที่มีสัญญาปัจจุบันประเภทนั้น
              </p>
              {record?.storageReason && <p className="mt-1 text-xs text-slate-400">{record.storageReason}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/payroll/employee-settings"
                className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ดูตั้งค่ารายคน
              </Link>
              <button
                type="button"
                onClick={saveTemplates}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก template"}
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex gap-2 overflow-x-auto">
            {templates.map((template) => {
              const selected = template.key === active?.key;
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => setActiveKey(template.key)}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    selected ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {template.label}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {template.employeeCount} คน
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {active ? (
          <div className="grid gap-0 lg:grid-cols-[1.45fr_1fr]">
            <div className="space-y-5 px-4 py-5 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">ชื่อ template</span>
                  <input
                    value={active.label}
                    onChange={(e) => updateActive({ label: e.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">วิธีคิดภาษี</span>
                  <select
                    value={active.values.tax_calculation_method}
                    onChange={(e) => updateValue("tax_calculation_method", e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="manual">กรอกเอง</option>
                    <option value="progressive">คำนวณขั้นบันได</option>
                    <option value="none">ไม่คิดภาษี</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-slate-500">คำอธิบาย</span>
                <input
                  value={active.description}
                  onChange={(e) => updateActive({ description: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                {NUMBER_FIELDS.map((field) => (
                  <label key={field.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="text-xs font-semibold text-slate-600">{field.label}</span>
                    <div className="mt-2 flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <input
                        type="number"
                        value={Number(active.values[field.key] ?? 0)}
                        onChange={(e) => updateValue(field.key, Number(e.target.value) as never)}
                        className="h-10 min-w-0 flex-1 px-3 text-sm outline-none"
                      />
                      <span className="flex h-10 items-center border-l border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">
                        {field.suffix}
                      </span>
                    </div>
                    <span className="mt-1 block text-xs text-slate-400">{field.help}</span>
                  </label>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {BOOLEAN_FIELDS.map((field) => (
                  <label key={field.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={Boolean(active.values[field.key])}
                      onChange={(e) => updateValue(field.key, e.target.checked as never)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-700">{field.label}</span>
                      <span className="block text-xs text-slate-400">{field.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <aside className="border-t border-slate-100 bg-slate-50 px-4 py-5 sm:px-5 lg:border-l lg:border-t-0">
              <div className="sticky top-16 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">ตัวอย่างที่จะนำไปใช้</div>
                  <p className="mt-1 text-sm text-slate-500">
                    มีพนักงานสัญญา “{active.label}” อยู่ {active.employeeCount} คน
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <PreviewRow label="วิธีคิดภาษี" value={active.values.tax_calculation_method === "progressive" ? "คำนวณขั้นบันได" : active.values.tax_calculation_method === "none" ? "ไม่คิดภาษี" : "กรอกเอง"} />
                  <PreviewRow label="หักประกันสังคม" value={`฿${money(active.values.social_security_employee_amount)}`} />
                  <PreviewRow label="นายจ้างสมทบ" value={`฿${money(active.values.social_security_employer_amount)}`} />
                  <PreviewRow label="ภาษี" value={`${money(active.values.withholding_tax_rate)}%`} />
                  <PreviewRow label="เบิกกลางเดือนสูงสุด" value={`฿${money(active.values.max_advance_amount)}`} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {BOOLEAN_FIELDS.map((field) => (
                    <div key={field.key} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                      active.values[field.key]
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-400"
                    }`}>
                      {field.label}: {enabledText(Boolean(active.values[field.key]))}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setPendingApply(active)}
                  disabled={active.employeeCount === 0}
                  className="h-11 w-full rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  นำไปใช้กับพนักงาน {active.employeeCount} คน
                </button>
                <p className="text-xs leading-5 text-slate-400">
                  ปุ่มนี้จะสร้าง/แก้ไข `employee_payroll_settings` ของพนักงานที่มีสัญญาปัจจุบันประเภทนี้ และบันทึก audit log ทุกครั้ง
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">ยังไม่มีประเภทสัญญาให้ตั้งค่า</div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingApply}
        onClose={() => setPendingApply(null)}
        onConfirm={applyTemplate}
        title="นำ template ไปใช้กับพนักงาน?"
        message={
          <div className="space-y-2">
            <p>
              ระบบจะอัปเดตตั้งค่าเงินเดือนรายคนของพนักงานสัญญา “{pendingApply?.label}”
              จำนวน {pendingApply?.employeeCount ?? 0} คน
            </p>
            <p className="text-xs text-slate-400">ถ้าพนักงานยังไม่มีตั้งค่ารายคน ระบบจะสร้างให้ ถ้ามีแล้วระบบจะแก้ค่าเฉพาะ field ใน template นี้</p>
          </div>
        }
        confirmText="นำไปใช้"
        cancelText="ยกเลิก"
        loading={applying}
      />
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
