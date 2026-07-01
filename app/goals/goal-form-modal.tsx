"use client";

// ป๊อปอัปตั้งเป้าหมายใหม่ (เฟส 1 mock) — ใช้ ERPModal + SearchableSelect + DateInput กลาง
// + ตัวช่วยแตกขั้นบันได (Step Builder): เพิ่ม/ลบ/เลื่อนลำดับ

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { DateInput } from "@/components/date-input";
import {
  CATEGORY_LABEL,
  type GoalDraft,
  type MeasureType,
} from "./mock-data";

type DraftStep = { key: string; title: string; target_date: string };

const DEPT_OPTIONS = ["ฝ่ายขาย", "ฝ่ายปฏิบัติการ", "ฝ่ายผลิต", "ฝ่ายการตลาด", "ฝ่ายไอที"].map((n) => ({ value: n, label: n }));
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
const LEVEL_OPTIONS = [
  { value: "team", label: "ทีม (เป้าหมายของทีม/บริษัท)" },
  { value: "personal", label: "ส่วนตัว (เป้าหมายของฉัน)" },
];
const MEASURE_OPTIONS = [
  { value: "percent", label: "เปอร์เซ็นต์ความคืบหน้า (%)" },
  { value: "currency", label: "เงิน (บาท)" },
  { value: "number", label: "ตัวเลข (จำนวน/ครั้ง)" },
  { value: "boolean", label: "ทำได้ / ทำไม่ได้" },
];

let seq = 100;

export function GoalFormModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  /** สร้างเป้า (เรียก API) — คืน true ถ้าสำเร็จ (ป๊อปอัปจะรีเซ็ต/ปิด) */
  onCreate: (draft: GoalDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [category, setCategory] = useState("sales");
  const [level, setLevel] = useState("team");
  const [department, setDepartment] = useState("ฝ่ายขาย");
  const [targetDate, setTargetDate] = useState("");
  const [measureType, setMeasureType] = useState<MeasureType>("percent");
  const [unit, setUnit] = useState("");
  const [startValue, setStartValue] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([{ key: "s1", title: "", target_date: "" }]);
  const [showError, setShowError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isNumeric = measureType === "currency" || measureType === "number" || measureType === "percent";
  const dirty = useMemo(
    () => title.trim() !== "" || why.trim() !== "" || steps.some((s) => s.title.trim() !== ""),
    [title, why, steps],
  );

  function reset() {
    setTitle(""); setWhy(""); setCategory("sales"); setLevel("team");
    setDepartment("ฝ่ายขาย"); setTargetDate(""); setMeasureType("percent"); setUnit("");
    setStartValue(""); setTargetValue(""); setCurrentValue(""); setSteps([{ key: "s1", title: "", target_date: "" }]);
    setShowError(false);
  }
  function close() { reset(); onClose(); }

  function addStep() {
    setSteps((prev) => [...prev, { key: `s${++seq}`, title: "", target_date: "" }]);
  }
  function removeStep(key: string) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  }
  function updateStep(key: string, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }
  function moveStep(idx: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function submit() {
    if (!title.trim()) { setShowError(true); return; }
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const draft: GoalDraft = {
      title: title.trim(),
      why: why.trim() || undefined,
      category,
      level: level as GoalDraft["level"],
      department: level === "personal" ? undefined : department,
      target_date: targetDate || undefined,
      measure_type: measureType,
      measure_unit: unit.trim() || undefined,
      start_value: isNumeric ? num(startValue) : undefined,
      target_value: isNumeric ? num(targetValue) : undefined,
      current_value: isNumeric ? num(currentValue) : undefined,
      steps: steps.filter((st) => st.title.trim() !== "").map((st) => ({ title: st.title.trim(), target_date: st.target_date || undefined })),
    };
    setSubmitting(true);
    const ok = await onCreate(draft);
    setSubmitting(false);
    if (ok) reset();
  }

  return (
    <ERPModal
      open={open}
      onClose={close}
      title="ตั้งเป้าหมายใหม่"
      description="ตั้งปลายทาง แล้วแตกเป็นขั้นบันไดสู่ความสำเร็จ"
      size="lg"
      storageKey="goal-form"
      hasUnsavedChanges={dirty}
      footer={
        <>
          <button onClick={close} disabled={submitting} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={submit} disabled={submitting} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {submitting ? "กำลังบันทึก..." : "สร้างเป้าหมาย"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อเป้าหมาย" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ยอดขายออนไลน์โต 30% ภายในสิ้นปี"
            className={`w-full h-9 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              showError && !title.trim() ? "border-red-300" : "border-slate-200"
            }`}
          />
          {showError && !title.trim() && <p className="text-xs text-red-500 mt-1">กรุณาตั้งชื่อเป้าหมาย</p>}
        </Field>

        <Field label="ทำไมต้องทำ (ช่วยกันเป้าหลอก ๆ)">
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            placeholder="เหตุผล / ประโยชน์ที่จะได้..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="หมวด"><SearchableSelect value={category} options={CATEGORY_OPTIONS} onChange={setCategory} /></Field>
          <Field label="ระดับ"><SearchableSelect value={level} options={LEVEL_OPTIONS} onChange={setLevel} /></Field>
          {level !== "personal" && (
            <Field label="แผนก"><SearchableSelect value={department} options={DEPT_OPTIONS} onChange={setDepartment} /></Field>
          )}
          <Field label="เส้นตาย (วันครบกำหนด)"><DateInput value={targetDate} onChange={setTargetDate} placeholder="เลือกวันที่" /></Field>
          <Field label="วัดผลแบบไหน"><SearchableSelect value={measureType} options={MEASURE_OPTIONS} onChange={(v) => setMeasureType(v as MeasureType)} /></Field>
        </div>

        {isNumeric && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-lg p-3">
            <Field label="เริ่มที่"><NumInput value={startValue} onChange={setStartValue} /></Field>
            <Field label="ปัจจุบัน"><NumInput value={currentValue} onChange={setCurrentValue} /></Field>
            <Field label="เป้าหมาย"><NumInput value={targetValue} onChange={setTargetValue} /></Field>
            <Field label="หน่วย"><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="บาท/ครั้ง/%" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" /></Field>
          </div>
        )}

        {/* Step Builder */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">🛤️ ขั้นบันไดสู่ความสำเร็จ (เรียงลำดับ)</label>
            <button onClick={addStep} type="button" className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 hover:bg-violet-50 rounded-lg px-2.5 py-1">
              + เพิ่มขั้น
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-6 text-center text-sm text-slate-400 flex-shrink-0">{i + 1}</span>
                <input
                  value={s.title}
                  onChange={(e) => updateStep(s.key, { title: e.target.value })}
                  placeholder={`ก้าวที่ ${i + 1}...`}
                  className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <div className="w-32 flex-shrink-0"><DateInput value={s.target_date} onChange={(v) => updateStep(s.key, { target_date: v })} placeholder="กำหนด" /></div>
                <div className="flex flex-shrink-0">
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="w-7 h-9 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="w-7 h-9 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeStep(s.key)} disabled={steps.length <= 1} className="w-7 h-9 text-slate-300 hover:text-red-500 disabled:opacity-30">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ERPModal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
    />
  );
}
