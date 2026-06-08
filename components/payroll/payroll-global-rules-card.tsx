"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_PAYROLL_GLOBAL_RULES,
  normalizePayrollGlobalRules,
  type PayrollGlobalRules,
} from "@/lib/payroll-global-rules";

type RulesPayload = {
  storageReady: boolean;
  storageReason: string;
  module: { id: string; key: string; label: string } | null;
  rules: PayrollGlobalRules;
  updatedAt: string | null;
};

type NumberKey = {
  [K in keyof PayrollGlobalRules]: PayrollGlobalRules[K] extends number ? K : never;
}[keyof PayrollGlobalRules];

type BoolKey = {
  [K in keyof PayrollGlobalRules]: PayrollGlobalRules[K] extends boolean ? K : never;
}[keyof PayrollGlobalRules];

const numberFields: Array<{ key: NumberKey; label: string; suffix: string; hint: string }> = [
  { key: "workingDaysPerMonth", label: "วันทำงานต่อเดือน", suffix: "วัน", hint: "ใช้หารเงินเดือนเพื่อคิดค่าแรงต่อวัน" },
  { key: "hoursPerDay", label: "ชั่วโมงทำงานต่อวัน", suffix: "ชม.", hint: "ใช้หารค่าแรงต่อชั่วโมง" },
  { key: "lateRoundingMinutes", label: "ปัดเศษเวลาสาย", suffix: "นาที", hint: "เช่น 1 = คิดตามจริง, 5 = ปัดทีละ 5 นาที" },
  { key: "absenceFullDayHours", label: "ขาดเต็มวัน", suffix: "ชม.", hint: "จำนวนชั่วโมงที่ใช้คิดหักขาดเต็มวัน" },
  { key: "absenceHalfDayHours", label: "ขาดครึ่งวัน", suffix: "ชม.", hint: "จำนวนชั่วโมงที่ใช้คิดหักขาดครึ่งวัน" },
  { key: "overtimeWeekdayMultiplier", label: "OT วันทำงาน", suffix: "เท่า", hint: "ตัวคูณ OT วันปกติ" },
  { key: "overtimeHolidayMultiplier", label: "OT วันหยุด", suffix: "เท่า", hint: "ตัวคูณ OT วันหยุด/พิเศษ" },
  { key: "socialSecurityEmployeeRate", label: "ประกันสังคมพนักงาน", suffix: "%", hint: "เปอร์เซ็นต์ฝั่งพนักงาน" },
  { key: "socialSecurityMaxWage", label: "ฐานเงินประกันสังคมสูงสุด", suffix: "บาท", hint: "เพดานฐานเงินที่เอาไปคิดประกันสังคม" },
];

const boolFields: Array<{ key: BoolKey; label: string; hint: string }> = [
  { key: "paidSickLeaveWithMedicalCertificate", label: "ลาป่วยมีใบรับรองแพทย์ไม่หักเงิน", hint: "ถ้าเปิดไว้ ระบบควรแสดงผลว่าไม่โดนหักเงิน" },
  { key: "deductSickLeaveWithoutMedicalCertificate", label: "ลาป่วยไม่มีใบรับรองแพทย์ให้หักเงิน", hint: "ใช้แยกเคสลาป่วย/ลาไม่รับเงิน" },
  { key: "requireMedicalCertificateForPaidSickLeave", label: "ลาป่วยแบบไม่หักเงินต้องมีใบรับรองแพทย์", hint: "ช่วยกันบันทึกผิดประเภท" },
  { key: "socialSecurityEnabled", label: "เปิดใช้ประกันสังคม", hint: "ปิดได้สำหรับกลุ่มที่ไม่ต้องคิดประกันสังคม" },
  { key: "withholdingTaxEnabled", label: "เปิดใช้ภาษีหัก ณ ที่จ่าย", hint: "ตอนนี้เป็นสวิตช์กลาง รายคนยัง override ได้ภายหลัง" },
];

function formatDate(value: string | null) {
  if (!value) return "ยังไม่เคยบันทึก";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function PayrollGlobalRulesCard() {
  const [payload, setPayload] = useState<RulesPayload | null>(null);
  const [rules, setRules] = useState<PayrollGlobalRules>(DEFAULT_PAYROLL_GLOBAL_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch("/api/payroll/settings-rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json.error) setError(json.error);
        const data = json.data as RulesPayload | null;
        setPayload(data);
        setRules(normalizePayrollGlobalRules(data?.rules));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "โหลดกฎคำนวณไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const preview = useMemo(() => {
    const day = `เงินเดือน ÷ ${rules.workingDaysPerMonth} วัน`;
    const hour = `เงินเดือน ÷ ${rules.workingDaysPerMonth} ÷ ${rules.hoursPerDay} ชม.`;
    const late = rules.lateDeductionUnit === "minute" ? "สายคิดเป็นนาที" : "สายคิดเป็นชั่วโมง";
    return { day, hour, late };
  }, [rules]);

  const setNumber = (key: NumberKey, value: string) => {
    setRules((cur) => normalizePayrollGlobalRules({ ...cur, [key]: value === "" ? 0 : Number(value) }));
  };

  const setBool = (key: BoolKey, value: boolean) => {
    setRules((cur) => ({ ...cur, [key]: value }));
  };

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/api/payroll/settings-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      const data = json.data as RulesPayload;
      setPayload(data);
      setRules(normalizePayrollGlobalRules(data.rules));
      setMessage("บันทึกกฎคำนวณกลางแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">กฎคำนวณกลาง</h2>
          <p className="mt-1 text-sm text-slate-500">
            ใช้เป็นค่า default ของทั้ง Payroll แล้วรายคนค่อย override เฉพาะกรณีพิเศษ
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>{payload?.module ? `โมดูล: ${payload.module.label}` : "ยังไม่พบโมดูล Payroll"}</div>
          <div>แก้ล่าสุด: {formatDate(payload?.updatedAt ?? null)}</div>
        </div>
      </div>

      {loading && <div className="mt-4 rounded-lg bg-slate-50 p-6 text-sm text-slate-400">กำลังโหลดกฎคำนวณ...</div>}

      {!loading && (
        <>
          {payload && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              payload.storageReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
            }`}>
              {payload.storageReason}
            </div>
          )}

          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {message && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-medium text-slate-700">วิธีคิดหักสาย</div>
                  <select
                    value={rules.lateDeductionUnit}
                    onChange={(e) => setRules((cur) => ({ ...cur, lateDeductionUnit: e.target.value === "hour" ? "hour" : "minute" }))}
                    className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-900"
                  >
                    <option value="minute">คิดเป็นนาที</option>
                    <option value="hour">คิดเป็นชั่วโมง</option>
                  </select>
                  <div className="mt-2 text-xs text-slate-400">เลือกให้ตรงวิธีคิดจริงของโรงงาน</div>
                </label>

                {numberFields.slice(0, 2).map((field) => (
                  <NumberInput key={field.key} field={field} value={rules[field.key]} onChange={setNumber} />
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {numberFields.slice(2).map((field) => (
                  <NumberInput key={field.key} field={field} value={rules[field.key]} onChange={setNumber} />
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {boolFields.map((field) => (
                  <label key={field.key} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <input
                      type="checkbox"
                      checked={rules[field.key]}
                      onChange={(e) => setBool(field.key, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-700">{field.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">{field.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-800">ตัวอย่างวิธีคิด</div>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <PreviewLine label="ค่าแรงต่อวัน" value={preview.day} />
                <PreviewLine label="ค่าแรงต่อชั่วโมง" value={preview.hour} />
                <PreviewLine label="หักสาย" value={preview.late} />
                <PreviewLine label="ขาดเต็มวัน" value={`${rules.absenceFullDayHours} ชม.`} />
                <PreviewLine label="ขาดครึ่งวัน" value={`${rules.absenceHalfDayHours} ชม.`} />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving || payload?.storageReady === false}
                className="mt-5 h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกกฎกลาง"}
              </button>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                การบันทึกจะมี audit log เพื่อรู้ว่าใครแก้กฎคำนวณเมื่อไหร่
              </p>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: { key: NumberKey; label: string; suffix: string; hint: string };
  value: number;
  onChange: (key: NumberKey, value: string) => void;
}) {
  return (
    <label className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-medium text-slate-700">{field.label}</div>
      <div className="mt-2 flex rounded-md border border-slate-200 bg-white focus-within:border-slate-900">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-l-md bg-transparent px-3 text-sm outline-none"
        />
        <span className="flex h-10 items-center rounded-r-md border-l border-slate-200 px-3 text-xs text-slate-400">
          {field.suffix}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{field.hint}</div>
    </label>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2 last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-700">{value}</span>
    </div>
  );
}

