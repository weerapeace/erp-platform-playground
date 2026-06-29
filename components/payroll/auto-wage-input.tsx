"use client";

/**
 * AutoWageInput — ช่องค่าจ้างรายวัน/รายชม. ที่คำนวณจากเงินเดือนให้อัตโนมัติ
 *
 * สูตรตรงกับระบบคำนวณเงินเดือนจริง (lib/payroll-calc salaryDayDivisor / attendanceHourlyRate):
 *   ค่าจ้างรายวัน   = เงินเดือน ÷ วันทำงานต่อเดือน (default 26 — พนักงานออฟฟิศมัก 30)
 *   ค่าจ้างรายชั่วโมง = ค่าจ้างรายวัน ÷ ชั่วโมงทำงานต่อวัน (default 8)
 *
 * - โหมดสร้างใหม่ (recordId == null): พอกรอกเงินเดือน ช่องนี้เติมให้เอง (แก้ทับได้)
 * - โหมดแก้ไข: ไม่เขียนทับค่าเดิมอัตโนมัติ แต่มีปุ่ม "ใช้ค่าที่คำนวณ" ให้กดเอง
 *
 * ออกแบบให้เสียบกับ FieldDef.renderForm ของ master-crud ได้ตรง ๆ (รับ ctx เดียวกัน)
 */

import { useEffect, useRef } from "react";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function AutoWageInput({
  value,
  onChange,
  recordId,
  disabled,
  form,
  kind,
  label,
  baseField = "base_salary",
  divisor = 26,
  hoursPerDay = 8,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  recordId?: string | null;
  disabled?: boolean;
  form: Record<string, unknown>;
  kind: "daily" | "hourly";
  label: string;
  baseField?: string;
  divisor?: number;
  hoursPerDay?: number;
}) {
  const base = Number(form?.[baseField]) || 0;
  const autoFill = recordId == null; // เฉพาะตอนสร้างใหม่

  const suggested =
    base > 0 ? round2(kind === "daily" ? base / divisor : base / divisor / hoursPerDay) : 0;

  // auto-fill เมื่อเงินเดือนเปลี่ยน (เฉพาะโหมดสร้างใหม่)
  const lastBaseRef = useRef<number | null>(null);
  useEffect(() => {
    if (!autoFill) return;
    if (lastBaseRef.current === null) {
      lastBaseRef.current = base; // ครั้งแรก: จำค่าไว้เฉย ๆ ไม่เขียนทับ
      return;
    }
    if (lastBaseRef.current === base) return;
    lastBaseRef.current = base;
    onChange(base > 0 ? suggested : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, autoFill]);

  const current = value === "" || value == null ? "" : Number(value);
  const differs = base > 0 && current !== suggested;

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        step="0.01"
        value={current === "" ? "" : String(current)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
      />
      {base > 0 && (
        <span className="mt-0.5 block text-[11px] text-slate-400">
          คิดจากเงินเดือน ÷ {divisor} วัน{kind === "hourly" ? ` ÷ ${hoursPerDay} ชม.` : ""} = ฿
          {suggested.toLocaleString("th-TH")}
          {differs && !disabled && (
            <button
              type="button"
              onClick={() => onChange(suggested)}
              className="ml-1 text-blue-600 underline"
            >
              ใช้ค่าที่คำนวณ
            </button>
          )}
        </span>
      )}
    </label>
  );
}
