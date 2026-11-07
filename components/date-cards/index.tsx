"use client";

/**
 * 📅 DateCards — การ์ดวันสำคัญ (ของกลาง) · เจ้าของขอ 2026-11-07 "ออกแบบตรงวันที่นัดกับ deadline ให้ดูสวยหน่อย" (ใบงานออกแบบ)
 *
 *   • การ์ดละ 1 วัน: เลขวันตัวใหญ่ + เดือน ปี พ.ศ. + วันในสัปดาห์ + ป้าย "อีก 5 วัน / วันนี้ / เลยมา 2 วัน" (สีตามความใกล้)
 *   • กดการ์ด = เปิดปฏิทินเลือกวัน (ปุ่ม ✕ = ล้างวัน) · ไม่ส่ง onChange = ดูอย่างเดียว · ยังไม่มีวัน = กรอบเส้นประ "+ ตั้งวัน"
 *   • เส้นเวลาใต้การ์ด (timeline): จากวันเริ่ม → วันกำหนดตัวแรกที่มีค่า + ขีด "วันนี้" · เลยกำหนด = แดง
 *   • compact = ที่แคบ (เช่น กล่องถูกดันใน SplitPanes) → เรียงเป็นแถวเตี้ย ๆ
 *   • muted = งานปิดแล้ว → ไม่เตือนสีแดง/ส้ม
 *
 * ใช้:
 *   <DateCards muted={done} items={[
 *     { key: "order", label: "วันที่สั่ง", icon: "cart", kind: "since", value: form.order_date, onChange: (v) => patch({ order_date: v }) },
 *     { key: "due", label: "Deadline", icon: "flag", kind: "due", value: form.deadline, onChange: canEdit ? (v) => patch({ deadline: v }) : undefined },
 *   ]} timeline={{ from: "order", to: ["due"] }} />
 * ส่วน pure: lib/date-cards.ts · คู่มือ: docs/date-cards.md
 */
import { useRef, type KeyboardEvent } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { dateStatus, dateTimeline, thaiDateParts, todayIsoTh, type DateKind, type DateTone } from "@/lib/date-cards";

export type DateCardItem = {
  key: string;
  label: string;
  icon?: string;
  /** "YYYY-MM-DD" หรือ "" */
  value: string | null | undefined;
  kind: DateKind;
  /** ไม่ส่ง = ดูอย่างเดียว */
  onChange?: (v: string) => void;
};

const TONE: Record<DateTone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-rose-50 text-rose-700",
  muted: "bg-slate-100 text-slate-500",
};

function DateCard({ item, today, muted, compact }: { item: DateCardItem; today: string; muted: boolean; compact: boolean }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const value = item.value ?? "";
  const parts = thaiDateParts(value);
  const status = dateStatus(value, item.kind, today, muted);
  const editable = !!item.onChange;
  const open = () => {
    if (!editable) return;
    const el = ref.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }   // เบราว์เซอร์เก่าไม่มี showPicker
  };
  const clear = editable && value ? (
    <button type="button" onClick={(e) => { e.stopPropagation(); item.onChange?.(""); }} title={t("ล้างวัน", "Clear date")} aria-label={t(`ล้าง${item.label}`, `Clear ${item.label}`)}
      className="h-5 w-5 shrink-0 inline-flex items-center justify-center rounded text-[11px] text-slate-300 hover:text-rose-500 hover:bg-rose-50">✕</button>
  ) : null;
  const input = (
    <input ref={ref} type="date" value={value} tabIndex={-1} aria-hidden="true" className="sr-only"
      onChange={(e) => item.onChange?.(e.target.value)} />
  );
  const common = {
    role: editable ? "button" : undefined,
    tabIndex: editable ? 0 : undefined,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } },
    title: editable ? t(`กดเพื่อเลือก${item.label}`, `Click to pick ${item.label}`) : undefined,
  };

  if (compact) {
    return (
      <div {...common} className={`relative flex items-center gap-2 rounded-lg border px-2 py-1.5 min-w-0 ${parts ? "border-slate-200 bg-white" : "border-dashed border-slate-300"} ${editable ? "cursor-pointer hover:border-blue-300" : ""}`}>
        {item.icon && <Icon name={item.icon} className="text-slate-400 shrink-0" />}
        <span className="text-[11px] text-slate-500 truncate min-w-0 flex-1">{item.label}</span>
        {parts ? (
          <span className="text-xs text-slate-700 tabular-nums shrink-0">{parts.text} <span className="text-slate-400">({parts.weekdayShort})</span></span>
        ) : <span className="text-xs text-blue-600 shrink-0">{editable ? t("+ ตั้งวัน", "+ Set") : "—"}</span>}
        {status && <span className={`shrink-0 inline-flex h-[18px] items-center rounded-full px-1.5 text-[10.5px] ${TONE[status.tone]}`}>{status.text}</span>}
        {clear}
        {input}
      </div>
    );
  }
  return (
    <div {...common} className={`relative rounded-xl border px-2.5 py-2 min-w-0 ${parts ? "border-slate-200 bg-white" : "border-dashed border-slate-300 flex flex-col justify-center"} ${editable ? "cursor-pointer hover:border-blue-300" : ""}`}>
      <div className="flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
        {item.icon && <Icon name={item.icon} className="text-slate-400 shrink-0" />}
        <span className="truncate flex-1">{item.label}</span>
        {clear}
      </div>
      {parts ? (
        <>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-2xl font-semibold leading-none tabular-nums text-slate-800">{parts.day}</span>
            <span className="text-xs text-slate-600 whitespace-nowrap">{parts.month} {parts.yearShort}</span>
          </div>
          <div className="text-[11px] text-slate-400">{t(`วัน${parts.weekday}`, parts.weekday)}</div>
          {status && <span className={`mt-1 inline-flex h-[18px] items-center rounded-full px-1.5 text-[11px] ${TONE[status.tone]}`}>{status.text}</span>}
        </>
      ) : (
        <div className="mt-1 text-sm text-blue-600">{editable ? t("+ ตั้งวัน", "+ Set date") : <span className="text-slate-300">—</span>}</div>
      )}
      {input}
    </div>
  );
}

export function DateCards({ items, timeline, muted = false, compact = false, today: todayProp, className = "" }: {
  items: DateCardItem[];
  /** เส้นเวลา: from = key การ์ดวันเริ่ม · to = key การ์ดวันกำหนด เรียงตามลำดับที่อยากใช้ (ตัวแรกที่มีค่า) */
  timeline?: { from: string; to: string[] };
  muted?: boolean;
  compact?: boolean;
  /** วันนี้ (ไว้ทดสอบ) — ไม่ส่ง = วันนี้ตามเวลาไทย */
  today?: string;
  className?: string;
}) {
  const t = useT();
  const today = todayProp ?? todayIsoTh();
  const byKey = new Map(items.map((i) => [i.key, i]));
  const from = timeline ? byKey.get(timeline.from) : undefined;
  const to = timeline ? timeline.to.map((k) => byKey.get(k)).find((i) => !!i?.value) : undefined;
  const tl = from && to ? dateTimeline(from.value, to.value, today) : null;
  return (
    <div className={className}>
      <div className={compact ? "space-y-1.5" : "grid gap-2"} style={compact ? undefined : { gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}>
        {items.map((it) => <DateCard key={it.key} item={it} today={today} muted={muted} compact={compact} />)}
      </div>
      {tl && to && (
        <div className="mt-2 px-1" title={t(`ผ่านไป ${tl.elapsed} จาก ${tl.total} วัน`, `${tl.elapsed} of ${tl.total} days passed`)}>
          <div className="relative h-1.5 rounded-full bg-slate-100">
            <div className={`absolute inset-y-0 left-0 rounded-full ${tl.over && !muted ? "bg-rose-500" : "bg-blue-500"}`} style={{ width: `${tl.pct}%` }} />
            <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-slate-700" style={{ left: `calc(${tl.pct}% - 1px)` }} />
          </div>
          <div className="mt-1 flex justify-between gap-2 text-[10.5px] text-slate-400">
            <span className="truncate">{from?.label}</span>
            <span className="truncate">{tl.over ? t(`วันนี้ · เลยกำหนดมา ${tl.elapsed - tl.total} วัน`, `Today · ${tl.elapsed - tl.total} days overdue`) : t(`วันนี้ · ผ่านไป ${tl.elapsed} จาก ${tl.total} วัน`, `Today · ${tl.elapsed} of ${tl.total} days`)}</span>
            <span className="truncate">{to.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
