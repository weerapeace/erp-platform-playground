"use client";

// ============================================================
// MetricCardsManager — สร้าง/แก้ "การ์ดเมตริก" ของผู้ใช้เอง (เงื่อนไข + ชื่อ/ไอคอน/สี)
// ============================================================

import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { CARD_COLORS } from "./overview-customizer";
import { describeCond, type MetricDef, type MetricCond, type MetricDue } from "./metrics";

type Opt = { value: string; label: string };
const COLOR_NAMES = Object.keys(CARD_COLORS);

const EMPTY: MetricDef = { id: "", label: "", icon: "📌", color: "violet", cond: {} };

export function MetricCardsManager({ open, metrics, onChange, onClose, typeOptions, brands, statusOptions, priorityOptions }: {
  open: boolean;
  metrics: MetricDef[];
  onChange: (list: MetricDef[]) => void;
  onClose: () => void;
  typeOptions: Opt[];
  brands: { id: string; name: string }[];
  statusOptions: Opt[];
  priorityOptions: Opt[];
}) {
  const t = useT();
  const [draft, setDraft] = useState<MetricDef>(EMPTY);

  const setCond = (p: Partial<MetricCond>) => setDraft((d) => ({ ...d, cond: { ...d.cond, ...p } }));
  const labelOf = (arr: Opt[], v: string) => arr.find((o) => o.value === v)?.label ?? v;
  const descOpt = {
    typeLabel: (v: string) => labelOf(typeOptions, v),
    brandLabel: (v: string) => brands.find((b) => b.id === v)?.name ?? v,
    statusLabel: (v: string) => labelOf(statusOptions, v),
    priorityLabel: (v: string) => labelOf(priorityOptions, v),
  };

  const save = () => {
    if (!draft.label.trim()) return;
    const id = draft.id || `m_${Date.now()}_${Math.round(Math.random() * 1e4)}`;
    const item = { ...draft, id, label: draft.label.trim() };
    onChange([...metrics.filter((m) => m.id !== id), item]);
    setDraft(EMPTY);
  };
  const sel = "h-8 px-2 text-sm border border-slate-200 rounded w-full bg-white";
  const dueOpts: { value: MetricDue; label: string }[] = [
    { value: "", label: t("— ไม่กรองกำหนดส่ง —", "— Any due —") },
    { value: "today", label: t("ครบกำหนดวันนี้", "Due today") },
    { value: "overdue", label: t("เกินกำหนด", "Overdue") },
    { value: "thisweek", label: t("ภายในสัปดาห์นี้", "This week") },
    { value: "thismonth", label: t("ภายในเดือนนี้", "This month") },
    { value: "none", label: t("ไม่มีกำหนดส่ง", "No due date") },
  ];

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={t("📊 การ์ดเมตริกของฉัน", "📊 My metric cards")}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700">{t("เสร็จ", "Done")}</button>}>
      <p className="text-[11px] text-slate-400 mb-3">{t("สร้างการ์ดนับเลขตามเงื่อนไขที่อยากดู — กดการ์ดบนหน้าภาพรวมเพื่อกรองตาราง", "Create count cards by your own conditions — tap on the overview to filter")}</p>

      {/* การ์ดที่มี */}
      {metrics.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {metrics.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 p-2 rounded-lg border ${CARD_COLORS[m.color]?.box ?? CARD_COLORS.slate.box}`}>
              <span className="text-lg shrink-0">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-[11px] opacity-70 truncate">{describeCond(m.cond, descOpt)}</div>
              </div>
              <button onClick={() => setDraft(m)} className="text-xs text-slate-500 hover:text-violet-700 shrink-0">✎ {t("แก้", "Edit")}</button>
              <button onClick={() => onChange(metrics.filter((x) => x.id !== m.id))} className="text-xs text-slate-300 hover:text-red-500 shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ฟอร์มสร้าง/แก้ */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3 space-y-2">
        <div className="text-sm font-semibold text-slate-700">{draft.id ? t("แก้การ์ด", "Edit card") : t("สร้างการ์ดใหม่", "New card")}</div>
        <div className="flex items-center gap-2">
          <input value={draft.icon} onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))} placeholder="📌" className="w-12 h-8 px-1 text-center text-base border border-slate-200 rounded bg-white" />
          <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder={t("ชื่อการ์ด เช่น ครบกำหนดวันนี้", "Card name, e.g. Due today")} className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded bg-white" />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-slate-400 mr-1">{t("สี", "Color")}:</span>
          {COLOR_NAMES.map((name) => (
            <button key={name} onClick={() => setDraft((d) => ({ ...d, color: name }))} title={name}
              className={`w-5 h-5 rounded-full ${CARD_COLORS[name].swatch} ${draft.color === name ? "ring-2 ring-offset-1 ring-slate-500" : ""}`} />
          ))}
        </div>
        {/* เงื่อนไข */}
        <div className="grid grid-cols-2 gap-2">
          <select value={draft.cond.status ?? ""} onChange={(e) => setCond({ status: e.target.value || undefined })} className={sel}>
            <option value="">{t("— ทุกสถานะ —", "— Any status —")}</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={draft.cond.priority ?? ""} onChange={(e) => setCond({ priority: e.target.value || undefined })} className={sel}>
            <option value="">{t("— ทุกความสำคัญ —", "— Any priority —")}</option>
            {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={draft.cond.taskType ?? ""} onChange={(e) => setCond({ taskType: e.target.value || undefined })} className={sel}>
            <option value="">{t("— ทุกประเภทงาน —", "— Any type —")}</option>
            {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={draft.cond.brandId ?? ""} onChange={(e) => setCond({ brandId: e.target.value || undefined })} className={sel}>
            <option value="">{t("— ทุกแบรนด์ —", "— Any brand —")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={draft.cond.due ?? ""} onChange={(e) => setCond({ due: (e.target.value || undefined) as MetricDue })} className={`${sel} col-span-2`}>
            {dueOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={!!draft.cond.mine} onChange={(e) => setCond({ mine: e.target.checked || undefined })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{t("เฉพาะของฉัน", "Mine only")}</label>
          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={!!draft.cond.openOnly} onChange={(e) => setCond({ openOnly: e.target.checked || undefined })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{t("เฉพาะที่ยังไม่เสร็จ", "Open only")}</label>
        </div>
        <div className="flex justify-end gap-2">
          {draft.id && <button onClick={() => setDraft(EMPTY)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg">{t("ล้าง", "Clear")}</button>}
          <button onClick={save} disabled={!draft.label.trim()} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40">{draft.id ? t("บันทึก", "Save") : t("＋ เพิ่มการ์ด", "＋ Add card")}</button>
        </div>
      </div>
    </ERPModal>
  );
}
