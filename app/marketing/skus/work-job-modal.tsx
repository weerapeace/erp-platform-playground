"use client";

/**
 * ป๊อปสร้าง/แก้ "งาน" ของโหมดทำงาน (หน้า SKU การตลาด)
 *   ประเภทงาน (Clearance / ลงเว็บไซต์ / อื่น ๆ) → ได้ขั้นตอนตั้งต้นของแบบงาน แก้/เพิ่ม/ลบได้
 *   ผู้รับผิดชอบ (หลายคน/ทั้งทีม) + วันครบกำหนด (ระดับงาน) · ติดป้ายหลักอัตโนมัติตอนใส่รุ่น (Clearance = Clearance Products)
 * ของกลางที่ใช้: ERPModal · MultiUserPicker (ตัวเดียวกับงาน Creative) · DateInput · SearchableSelect
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import type { UserPickerValue } from "@/components/pickers/master";
import { MultiUserPicker } from "@/app/tasks/multi-user-picker";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { getLang } from "@/lib/lang";
import { labelName, type MarketingSkuLabel } from "@/lib/marketing/sku-list";
import {
  JOB_KINDS, kindInfo, kindDefaultName, kindLabel, kindSteps, nextStepKey, stepsFromLabels, MAX_JOB_NAME, MAX_STEPS, MAX_STEP_LABEL,
  type WorkJob, type WorkJobKind, type WorkStep,
} from "@/lib/marketing/work-jobs";

// ชื่องานแนะนำ = ชื่อแบบงาน + เดือน/ปี ตามภาษาที่เลือก (ไทย "Clearance ต.ค. 2569" · อังกฤษ "Clearance Oct 2026")
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const suggestName = (k: WorkJobKind) => {
  const base = kindDefaultName(k);
  if (!base) return "";
  const d = new Date();
  return getLang() === "en" ? `${base} ${EN_MONTH[d.getMonth()]} ${d.getFullYear()}` : `${base} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
};

type Form = {
  kind: WorkJobKind; name: string; steps: WorkStep[]; assignees: UserPickerValue[];
  due_date: string; auto_label_id: string; note: string;
};

export function WorkJobModal({ open, onClose, job, labels, presetIds, onSaved }: {
  open: boolean;
  onClose: () => void;
  /** null = สร้างงานใหม่ */
  job: WorkJob | null;
  /** ป้ายหลัก (kind=status) ไว้เลือก "ติดป้ายอัตโนมัติ" */
  labels: MarketingSkuLabel[];
  /** รุ่นที่ติ๊กมาจากหน้าการ์ด/ตาราง → ใส่เข้างานตอนสร้าง */
  presetIds?: string[];
  onSaved: (job: WorkJob, info: { added: number; labeled: number }) => void;
}) {
  const t = useT();
  const defaultLabel = (k: WorkJobKind) => {
    const re = kindInfo(k).autoLabel;
    return re ? labels.find((l) => l.is_active && re.test(l.name))?.id ?? "" : "";
  };
  const initial = (): Form => job ? {
    kind: job.kind, name: job.name, steps: job.steps,
    assignees: (job.assignees ?? []).map((a) => ({ id: a.id, code: null, name: a.name })),
    due_date: job.due_date ?? "", auto_label_id: job.auto_label_id ?? "", note: job.note ?? "",
  } : {
    kind: "clearance", name: suggestName("clearance"), steps: stepsFromLabels(kindSteps("clearance")),
    assignees: [], due_date: "", auto_label_id: defaultLabel("clearance"), note: "",
  };
  const [form, setForm] = useState<Form>(initial);
  const [orig, setOrig] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // เปิดใหม่ทุกครั้ง → เริ่มจากค่าของงาน (หรือค่าตั้งต้น)
  useEffect(() => {
    if (!open) return;
    const f = initial();
    setForm(f); setOrig(JSON.stringify(f)); setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);

  const dirty = JSON.stringify(form) !== orig;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErr(null); };

  // เปลี่ยนประเภท (ตอนสร้าง): ชื่อ/ขั้นตอน/ป้าย ที่ยังเป็นค่าตั้งต้น → เปลี่ยนตามแบบงานใหม่
  const pickKind = (k: WorkJobKind) => setForm((f) => {
    const prev = kindInfo(f.kind);
    const cur = JSON.stringify(f.steps.map((s) => s.label));
    const sameSteps = cur === JSON.stringify(prev.steps) || cur === JSON.stringify(prev.steps_en);
    return {
      ...f, kind: k,
      name: !f.name.trim() || f.name === suggestName(f.kind) ? suggestName(k) : f.name,
      steps: sameSteps || f.steps.length === 0 ? stepsFromLabels(kindSteps(k)) : f.steps,
      auto_label_id: f.auto_label_id === defaultLabel(f.kind) ? defaultLabel(k) : f.auto_label_id,
    };
  });

  const removedWithTicks = useMemo(() => {
    if (!job) return [] as string[];
    const keep = new Set(form.steps.map((s) => s.key));
    return job.steps.filter((s) => !keep.has(s.key)).map((s) => s.label);
  }, [job, form.steps]);

  const labelOptions = useMemo(() => [
    { value: "", label: t("— ไม่ติดป้าย —", "— No label —") },
    ...labels.filter((l) => l.is_active || l.id === form.auto_label_id).map((l) => ({ value: l.id, label: labelName(l), badge: l.icon ?? undefined })),
  ], [labels, form.auto_label_id, t]);

  const save = async () => {
    const name = form.name.trim();
    if (!name) { setErr(t("ใส่ชื่องานก่อน", "Enter a job name first")); return; }
    const steps = form.steps.map((s) => ({ ...s, label: s.label.trim() })).filter((s) => s.label);
    if (steps.length === 0) { setErr(t("ใส่ขั้นตอนอย่างน้อย 1 ขั้น (เช่น ทำรูป / แก้ราคา Lazada)", "Add at least 1 step (e.g. make image / update Lazada price)")); return; }
    const body = {
      name, steps, kind: form.kind,
      assignees: form.assignees.map((u) => ({ id: u.id, name: u.name })),
      due_date: form.due_date || null, auto_label_id: form.auto_label_id || null, note: form.note,
      ...(job ? {} : { parent_sku_ids: presetIds ?? [] }),
    };
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(job ? `/api/marketing/work-jobs/${job.id}` : "/api/marketing/work-jobs", {
        method: job ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 207) { setErr(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save")); return; }
      if (!j.data?.job) { setErr(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save")); return; }
      onSaved(j.data.job as WorkJob, { added: Number(j.data.added) || 0, labeled: Number(j.data.labeled) || 0 });
      if (j.error) setErr(j.error);   // สร้างงานได้แต่ใส่รุ่นพลาด (207)
    } catch { setErr(t("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่", "Connection problem. Please try again.")); }
    finally { setBusy(false); }
  };

  const inp = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const rowLabel = "text-xs font-medium text-slate-500 mb-1";

  return (
    <ERPModal open={open} onClose={onClose} title={job ? `${t("แก้ไขงาน", "Edit job")} — ${job.name}` : t("สร้างงานใหม่", "New job")} size="md" defaultExpanded={false}
      hasUnsavedChanges={dirty && !busy}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-slate-400">{!job && presetIds?.length ? t(`จะใส่ ${presetIds.length.toLocaleString("th-TH")} รุ่นที่เลือกไว้เข้างานนี้`, `${presetIds.length.toLocaleString("th-TH")} selected models will be added to this job`) : ""}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button type="button" onClick={() => void save()} disabled={busy}
              className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? t("กำลังบันทึก…", "Saving…") : job ? t("บันทึก", "Save") : t("สร้างงาน", "Create job")}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {!job && (
          <div>
            <div className={rowLabel}>{t("ประเภทงาน", "Job type")}</div>
            <div className="grid grid-cols-3 gap-2">
              {JOB_KINDS.map((k) => (
                <button key={k.kind} type="button" onClick={() => pickKind(k.kind)}
                  className={`rounded-lg border px-2 py-2 text-sm transition ${form.kind === k.kind ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  <span className="mr-1">{k.icon}</span>{kindLabel(k.kind)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className={rowLabel}>{t("ชื่องาน", "Job name")} <span className="text-red-500">*</span></div>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={MAX_JOB_NAME} placeholder={t("เช่น Clearance ปลายปี", "e.g. Year-end Clearance")}
            className={inp} autoFocus={!job} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className={rowLabel}>{t("ผู้รับผิดชอบ (เลือกได้หลายคน)", "Assignees (pick one or more)")}</div>
            <MultiUserPicker value={form.assignees} onChange={(v) => set("assignees", v)} disableCreate />
          </div>
          <div>
            <div className={rowLabel}>{t("วันครบกำหนด", "Due date")}</div>
            <DateInput value={form.due_date} onChange={(v) => set("due_date", v)} placeholder={t("วว/ดด/ปปปป", "dd/mm/yyyy")} />
          </div>
        </div>

        <div>
          <div className={rowLabel}>{t("ขั้นตอน (ทุกรุ่นในงานจะมีเช็กลิสต์ชุดนี้)", "Steps (every model in the job gets this checklist)")}</div>
          <div className="space-y-1.5">
            {form.steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-slate-400">{i + 1}.</span>
                <input value={s.label} maxLength={MAX_STEP_LABEL} placeholder={t("เช่น แก้ราคา TikTok", "e.g. Update TikTok price")}
                  onChange={(e) => set("steps", form.steps.map((x) => (x.key === s.key ? { ...x, label: e.target.value } : x)))}
                  className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" disabled={i === 0} title={t("เลื่อนขึ้น", "Move up")} onClick={() => { const a = [...form.steps]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set("steps", a); }}
                  className="h-7 w-7 rounded text-slate-400 hover:text-blue-600 disabled:opacity-30">▲</button>
                <button type="button" title={t("ลบขั้นตอน", "Delete step")} onClick={() => set("steps", form.steps.filter((x) => x.key !== s.key))}
                  className="h-7 w-7 rounded text-slate-400 hover:text-red-500">✕</button>
              </div>
            ))}
            {form.steps.length < MAX_STEPS && (
              <button type="button" onClick={() => set("steps", [...form.steps, { key: nextStepKey(form.steps), label: "" }])}
                className="ml-7 text-sm text-blue-600 hover:underline">＋ {t("เพิ่มขั้นตอน", "Add step")}</button>
            )}
          </div>
          {removedWithTicks.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-600">{t(`ลบขั้นตอน “${removedWithTicks.join(", ")}” — ที่ติ๊กไว้ในขั้นนี้จะไม่นับแล้ว`, `Removing step “${removedWithTicks.join(", ")}” — ticks on it won't count any more`)}</p>
          )}
        </div>

        <div>
          <div className={rowLabel}>{t("ติดป้ายให้รุ่นอัตโนมัติตอนใส่เข้างาน", "Auto-label models when added to the job")}</div>
          <SearchableSelect value={form.auto_label_id} options={labelOptions} onChange={(v) => set("auto_label_id", v)} />
          <p className="mt-1 text-xs text-slate-400">{t(
            "รุ่นที่ใส่เข้างานจะถูกเปลี่ยน “ป้ายหลัก” เป็นป้ายนี้ (แทนป้ายเดิม · มีประวัติย้อนดูได้) · เอารุ่นออกจากงาน ป้ายไม่เปลี่ยนกลับ",
            "Models added to the job get this as their main label (replaces the old one · history is kept) · removing a model from the job doesn't change the label back")}</p>
        </div>

        <div>
          <div className={rowLabel}>{t("หมายเหตุ", "Note")}</div>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} maxLength={1000} placeholder={t("เช่น ลดถึงสิ้นเดือน / ห้ามลดเกิน 30%", "e.g. sale until end of month / max 30% off")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      </div>
    </ERPModal>
  );
}
