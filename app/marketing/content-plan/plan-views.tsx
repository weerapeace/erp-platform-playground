"use client";

/**
 * มุมมองของหน้าวางแผนคอนเทนต์: การ์ด · สัปดาห์ (แถว = ช่องทาง) · เดือน · บอร์ดตามขั้น · กล่องไอเดียยังไม่ลงวัน
 * ลากการ์ด (HTML5 drag) → วางช่องวัน = เปลี่ยนวัน (คงเวลาเดิม) · วางกล่องไอเดีย = เอาวันออก · วางคอลัมน์บอร์ด = เปลี่ยนขั้น
 */
import { useState, type DragEvent, type ReactNode } from "react";
import { useLang } from "@/components/i18n";
import { PlatformIcon } from "@/components/platform-icon";
import { POST_TYPES, splitPostTypes, type ContentItem } from "@/app/tasks/data";
import { labelName, type MarketingSkuLabel } from "@/lib/marketing/sku-list";
import {
  PLAN_STAGES, STAGE_META, GOAL_META, stageOf, dateKeyOf, timeOf, addDays, localDateKey, parseDateKey, dowLabel, shortThaiDate,
  placementLabelsFor, type PlanStage, type PlacementType,
} from "@/lib/marketing/content-plan";
import type { PlatformOpt } from "./plan-modal";

const TYPE_ICON = Object.fromEntries(POST_TYPES.map((t) => [t.value, t.icon]));
const NO_PLATFORM = "__none";

// ── drag helpers ──
const DRAG_KEY = "text/x-content-id";
export const dragProps = (id: string, enabled: boolean) => enabled ? {
  draggable: true,
  onDragStart: (e: DragEvent) => { e.dataTransfer.setData(DRAG_KEY, id); e.dataTransfer.effectAllowed = "move"; },
} : {};
function useDrop(onDrop: (id: string) => void, enabled: boolean) {
  const [over, setOver] = useState(false);
  if (!enabled) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG_KEY)) { e.preventDefault(); if (!over) setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData(DRAG_KEY); if (id) onDrop(id); },
    },
  };
}

// ── การ์ด ──
export function PlanCard({ item, pillar, compact = false, showDate = false, canEdit, onOpen, placementText }: {
  item: ContentItem; pillar?: MarketingSkuLabel; compact?: boolean; showDate?: boolean; canEdit: boolean; onOpen: (c: ContentItem) => void;
  /** ป้ายประเภทการลง เช่น "🏪 แต่งร้าน" (ในแถวช่องทาง) */
  placementText?: string;
}) {
  useLang();   // ฟังการสลับภาษา → ชื่อป้าย/แนว (labelName) เปลี่ยนตาม (หน้าแรกวาดเป็นไทยก่อน แล้วค่อยสลับ)
  const stage = stageOf(item) ?? "idea";
  const st = STAGE_META[stage];
  const types = splitPostTypes(item.post_type);
  const goal = item.goal ? GOAL_META[item.goal] : undefined;
  const thumb = item.parent_sku_image_url || item.task_cover_url || null;
  const dk = dateKeyOf(item.scheduled_at);
  return (
    <button type="button" onClick={() => onOpen(item)} {...dragProps(item.id, canEdit)}
      title={`${item.title}${pillar ? ` · ${labelName(pillar)}` : ""}${goal ? ` · ${goal.label}` : ""} · ${st.label}`}
      className="group block w-full rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-400 hover:shadow"
      style={{ borderLeft: `4px solid ${pillar?.color ?? "#cbd5e1"}` }}>
      <div className={`flex gap-1.5 ${compact ? "p-1.5" : "p-2"}`}>
        {!compact && thumb && <img src={thumb} alt="" loading="lazy" className="h-10 w-10 flex-shrink-0 rounded-md object-cover" />} {/* eslint-disable-line @next/next/no-img-element */}
        <div className="min-w-0 flex-1">
          {placementText && <div className="truncate text-[10px] font-medium text-slate-500">{placementText}</div>}
          <div className={`line-clamp-2 font-medium text-slate-800 ${compact ? "text-[11px] leading-4" : "text-xs leading-4"}`}>{item.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {types.map((t) => <span key={t}>{TYPE_ICON[t] ?? "•"}</span>)}
            {pillar?.icon && <span>{pillar.icon}</span>}
            {!compact && pillar && <span className="truncate">{labelName(pillar)}</span>}
            {showDate && dk && <span className="ml-auto whitespace-nowrap text-slate-400">{shortThaiDate(dk)} {timeOf(item.scheduled_at)}</span>}
            {!showDate && !compact && item.scheduled_at && <span className="ml-auto text-slate-400">{timeOf(item.scheduled_at)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── สัปดาห์: แถว = ช่องทาง · คอลัมน์ = 7 วัน ──
export function WeekView({ start, items, platforms, allPlatforms, placementTypes = [], pillarOf, canEdit, onOpen, onAdd, onMove }: {
  /** แถว = ช่องทางที่ตั้งให้โชว์ (เรียงแล้ว) */
  start: string; items: ContentItem[]; platforms: PlatformOpt[];
  /** ทุกช่องทาง (ไว้หาชื่อ/ไอคอน ของช่องทางที่ซ่อนแต่มีคอนเทนต์ในสัปดาห์นี้) */
  allPlatforms: PlatformOpt[];
  /** ประเภทการลง (ทำป้ายบนการ์ด) */
  placementTypes?: PlacementType[];
  pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined;
  canEdit: boolean; onOpen: (c: ContentItem) => void; onAdd: (date: string, platform: string | null) => void;
  onMove: (id: string, date: string | null, platform: string | null) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = localDateKey(new Date());
  const inWeek = items.filter((c) => { const k = dateKeyOf(c.scheduled_at); return k && k >= days[0] && k <= days[6]; });
  // ช่องทางที่ถูกซ่อนแต่มีคอนเทนต์ในสัปดาห์นี้ → ยังโชว์ (กันคอนเทนต์หาย) พร้อมป้าย "ซ่อนอยู่"
  const shown = new Set(platforms.map((p) => p.value));
  const hiddenUsed = [...new Set(inWeek.flatMap((c) => c.platforms ?? []))].filter((k) => !shown.has(k));
  const allByKey = new Map(allPlatforms.map((p) => [p.value, p]));
  const rows = [...platforms.map((p) => ({ key: p.value, label: p.label, p })),
    ...hiddenUsed.map((k) => ({ key: k, label: `${allByKey.get(k)?.label ?? k} (ซ่อนอยู่)`, p: allByKey.get(k) ?? ({ value: k, label: k } as PlatformOpt) })),
    ...(inWeek.some((c) => !(c.platforms ?? []).length) ? [{ key: NO_PLATFORM, label: "ยังไม่เลือกช่องทาง", p: null as PlatformOpt | null }] : [])];
  const cellItems = (day: string, row: string) => inWeek.filter((c) => dateKeyOf(c.scheduled_at) === day
    && (row === NO_PLATFORM ? !(c.platforms ?? []).length : (c.platforms ?? []).includes(row)));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="grid min-w-[880px]" style={{ gridTemplateColumns: "8.5rem repeat(7, minmax(0, 1fr))" }}>
        <div className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50" />
        {days.map((d) => (
          <div key={d} className={`border-b border-l border-slate-200 px-2 py-1.5 text-center text-xs ${d === today ? "bg-blue-50 font-semibold text-blue-700" : "bg-slate-50 text-slate-600"}`}>
            {dowLabel(d)} <span className="text-slate-400">{shortThaiDate(d)}</span>
          </div>
        ))}
        {rows.map((r) => (
          <WeekRow key={r.key} row={r} days={days} today={today} cellItems={cellItems} pillarOf={pillarOf} placementTypes={placementTypes}
            canEdit={canEdit} onOpen={onOpen} onAdd={onAdd} onMove={onMove} />
        ))}
      </div>
    </div>
  );
}

function WeekRow({ row, days, today, cellItems, pillarOf, placementTypes, canEdit, onOpen, onAdd, onMove }: {
  row: { key: string; label: string; p: PlatformOpt | null }; days: string[]; today: string;
  cellItems: (day: string, row: string) => ContentItem[]; pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined;
  placementTypes: PlacementType[];
  canEdit: boolean; onOpen: (c: ContentItem) => void; onAdd: (date: string, platform: string | null) => void;
  onMove: (id: string, date: string | null, platform: string | null) => void;
}) {
  const labelOf = (c: ContentItem) => (row.key === NO_PLATFORM ? "" : placementLabelsFor(c.placements, row.key, placementTypes).join(" · "));
  return (
    <>
      <div className="sticky left-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-white px-2 py-2 text-xs font-medium text-slate-700">
        {row.p ? <PlatformIcon code={row.p.value} iconKey={row.p.icon_key ?? row.p.icon} size={16} /> : <span>❔</span>}
        <span className="truncate">{row.label}</span>
      </div>
      {days.map((d) => (
        <DayCell key={d} today={d === today} items={cellItems(d, row.key)} pillarOf={pillarOf} canEdit={canEdit} onOpen={onOpen} labelOf={labelOf}
          onAdd={() => onAdd(d, row.key === NO_PLATFORM ? null : row.key)} onDrop={(id) => onMove(id, d, row.key === NO_PLATFORM ? null : row.key)} />
      ))}
    </>
  );
}

function DayCell({ today, items, pillarOf, canEdit, onOpen, onAdd, onDrop, labelOf, minH = "min-h-[5.5rem]", children }: {
  today: boolean; items: ContentItem[]; pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined; canEdit: boolean;
  labelOf?: (c: ContentItem) => string;
  onOpen: (c: ContentItem) => void; onAdd: () => void; onDrop: (id: string) => void; minH?: string; children?: ReactNode;
}) {
  const { over, props } = useDrop(onDrop, canEdit);
  return (
    <div {...props} className={`group/cell relative ${minH} space-y-1 border-b border-l border-slate-100 p-1 ${today ? "bg-blue-50/40" : ""} ${over ? "bg-blue-100 ring-2 ring-inset ring-blue-400" : ""}`}>
      {children}
      {items.map((c) => <PlanCard key={c.id} item={c} pillar={pillarOf(c)} compact canEdit={canEdit} onOpen={onOpen} placementText={labelOf?.(c) || undefined} />)}
      {canEdit && (
        <button type="button" onClick={onAdd} title="เพิ่มไอเดียลงช่องนี้"
          className="w-full rounded-md border border-dashed border-transparent py-0.5 text-[11px] text-slate-300 hover:border-slate-300 hover:text-slate-500 group-hover/cell:text-slate-400 max-sm:text-slate-400">＋</button>
      )}
    </div>
  );
}

// ── เดือน ──
export function MonthView({ ym, items, pillarOf, canEdit, onOpen, onAdd, onMove }: {
  ym: string; items: ContentItem[]; pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined;
  canEdit: boolean; onOpen: (c: ContentItem) => void; onAdd: (date: string, platform: string | null) => void;
  onMove: (id: string, date: string | null, platform: string | null) => void;
}) {
  const first = parseDateKey(`${ym}-01`);
  const gridStart = addDays(`${ym}-01`, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = localDateKey(new Date());
  const byDay = new Map<string, ContentItem[]>();
  for (const c of items) { const k = dateKeyOf(c.scheduled_at); if (k) (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(c); }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="grid min-w-[760px] grid-cols-7">
        {["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."].map((d) => <div key={d} className="border-b border-slate-200 bg-slate-50 py-1.5 text-center text-xs text-slate-600">{d}</div>)}
        {days.map((d) => {
          const inMonth = d.startsWith(ym);
          return (
            <DayCell key={d} today={d === today} items={(byDay.get(d) ?? []).sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))}
              pillarOf={pillarOf} canEdit={canEdit} onOpen={onOpen} onAdd={() => onAdd(d, null)} onDrop={(id) => onMove(id, d, null)} minH="min-h-[6.5rem]">
              <div className={`text-right text-[11px] ${d === today ? "font-bold text-blue-700" : inMonth ? "text-slate-500" : "text-slate-300"}`}>{parseDateKey(d).getDate()}</div>
            </DayCell>
          );
        })}
      </div>
    </div>
  );
}

// ── บอร์ดตามขั้น ──
export function BoardView({ items, pillarOf, canEdit, onOpen, onStage }: {
  items: ContentItem[]; pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined; canEdit: boolean;
  onOpen: (c: ContentItem) => void; onStage: (id: string, stage: PlanStage) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PLAN_STAGES.map((s) => {
        const col = items.filter((c) => stageOf(c) === s.key)
          .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"));
        return <BoardColumn key={s.key} stage={s.key} items={col} pillarOf={pillarOf} canEdit={canEdit} onOpen={onOpen} onDrop={(id) => onStage(id, s.key)} />;
      })}
    </div>
  );
}

function BoardColumn({ stage, items, pillarOf, canEdit, onOpen, onDrop }: {
  stage: PlanStage; items: ContentItem[]; pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined; canEdit: boolean;
  onOpen: (c: ContentItem) => void; onDrop: (id: string) => void;
}) {
  const s = STAGE_META[stage];
  const { over, props } = useDrop(onDrop, canEdit);
  return (
    <div {...props} className={`flex w-64 flex-shrink-0 flex-col rounded-xl border bg-slate-50 ${over ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"}`}>
      <div className={`flex items-center gap-1.5 rounded-t-xl border-b px-3 py-2 text-sm font-semibold ${s.cls}`}>
        {s.icon} {s.label} <span className="ml-auto text-xs font-normal opacity-70">{items.length}</span>
      </div>
      <div className="max-h-[65vh] min-h-[8rem] space-y-1.5 overflow-y-auto p-2">
        {items.map((c) => <PlanCard key={c.id} item={c} pillar={pillarOf(c)} showDate canEdit={canEdit} onOpen={onOpen} />)}
        {items.length === 0 && <div className="py-6 text-center text-xs text-slate-400">ว่าง</div>}
      </div>
    </div>
  );
}

// ── กล่องไอเดียยังไม่ลงวัน (วางการ์ดที่นี่ = เอาวันออก) ──
export function BacklogPanel({ items, pillarOf, canEdit, onOpen, onAdd, onDrop }: {
  items: ContentItem[]; pillarOf: (c: ContentItem) => MarketingSkuLabel | undefined; canEdit: boolean;
  onOpen: (c: ContentItem) => void; onAdd: () => void; onDrop: (id: string) => void;
}) {
  const { over, props } = useDrop(onDrop, canEdit);
  return (
    <aside {...props} className={`rounded-xl border bg-white ${over ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">💡 ไอเดียยังไม่ลงวัน <span className="font-normal text-slate-400">{items.length}</span></span>
        {canEdit && <button type="button" onClick={onAdd} className="rounded-md px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50">＋ เพิ่ม</button>}
      </div>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto p-2">
        {items.map((c) => <PlanCard key={c.id} item={c} pillar={pillarOf(c)} canEdit={canEdit} onOpen={onOpen} />)}
        {items.length === 0 && <div className="py-6 text-center text-xs text-slate-400">ยังไม่มีไอเดียค้าง{canEdit ? " — กด ＋ เพิ่ม หรือลากการ์ดมาวางที่นี่" : ""}</div>}
      </div>
    </aside>
  );
}
