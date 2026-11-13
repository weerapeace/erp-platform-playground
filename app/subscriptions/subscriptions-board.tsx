"use client";

// ============================================================
// App Subscription — มุมมองบอร์ด (Kanban)
// ลากการ์ดข้ามคอลัมน์ = เปลี่ยนค่า (สถานะ/หมวด/ประเภท/รอบบิล) · ใช้ @dnd-kit ของกลาง
// จัดกลุ่มสลับได้: สถานะ (default) / หมวดหมู่ / งาน-ส่วนตัว / รอบบิล
// โหมด "ใช้งาน · ตามหมวด" (activeOnly): เฉพาะที่ยังจ่ายอยู่ แยกคอลัมน์ตามหมวด (หมวดแพงสุดก่อน) + สรุปยอดรวม/แถบสัดส่วน
// ============================================================
import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  type Subscription, type SubSettings, type SubType, type BillingCycle,
  CYCLE_LABEL, SUB_STATUSES, SUB_STATUS_BADGE, subStatusLabel, monthlyTHB, fmtBaht, fmtCost, nextRenewal, daysUntil,
} from "@/lib/subscriptions";
import { AppLogo } from "@/components/logo-picker";
import { MembersChip } from "./members-chip";
import { PlanBadge } from "./sub-name-cell";

export type BoardGroupBy = "status" | "category" | "type" | "cycle";
export const GROUP_OPTIONS: { key: BoardGroupBy; label: string }[] = [
  { key: "status", label: "สถานะ" },
  { key: "category", label: "หมวดหมู่" },
  { key: "type", label: "งาน–ส่วนตัว" },
  { key: "cycle", label: "รอบบิล" },
];

type BoardCol = { key: string; label: string; dot: string };

/** โหมดบอร์ดที่จำต่อคน (useUserPref "subs_board_mode") — all = บอร์ดเดิม · active = ใช้งาน · ตามหมวด */
export type BoardPref = { mode: "all" | "active"; includePending: boolean; sort: "cost" | "name" };
export const BOARD_PREF_DEFAULT: BoardPref = { mode: "all", includePending: false, sort: "cost" };
export function parseBoardPref(raw: unknown): BoardPref | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return { mode: o.mode === "active" ? "active" : "all", includePending: o.includePending === true, sort: o.sort === "name" ? "name" : "cost" };
}

/** ยังจ่ายอยู่ไหม (โหมดใช้งาน) — กำลังยกเลิก = ยังจ่ายจนหมดรอบ นับเมื่อเลือกให้รวม */
export const isPayingNow = (s: Subscription, includePending: boolean) => s.active && !s.want_to_buy && (includePending || !s.pending_cancel);

const STATUS_COLS: BoardCol[] = [
  { key: "active", label: "ใช้งาน", dot: "bg-emerald-400" },
  { key: "pending_cancel", label: "กำลังยกเลิก", dot: "bg-amber-400" },
  { key: "wishlist", label: "อยากซื้อ", dot: "bg-blue-400" },
  { key: "closed", label: "ปิด", dot: "bg-slate-300" },
  { key: "cancelled", label: "ยกเลิกแล้ว", dot: "bg-red-400" },
];
const TYPE_COLS: BoardCol[] = [
  { key: "work", label: "งาน", dot: "bg-indigo-400" },
  { key: "personal", label: "ส่วนตัว", dot: "bg-pink-400" },
];
const CYCLE_COLS: BoardCol[] = [
  { key: "monthly", label: "รายเดือน", dot: "bg-sky-400" },
  { key: "yearly", label: "รายปี", dot: "bg-violet-400" },
  { key: "one-time", label: "จ่ายครั้งเดียว", dot: "bg-slate-400" },
];
const CATEGORY_DOTS = ["bg-purple-400", "bg-teal-400", "bg-amber-400", "bg-blue-400", "bg-pink-400", "bg-green-400", "bg-orange-400", "bg-rose-400"];

const STATUS_PATCH: Record<string, Partial<Subscription>> = Object.fromEntries(SUB_STATUSES.map((s) => [s.key, s.patch]));

// รายการนี้อยู่คอลัมน์ไหน (ตามการจัดกลุ่ม)
export function boardKeyOf(groupBy: BoardGroupBy, sub: Subscription): string {
  if (groupBy === "category") return sub.category || "Other";
  if (groupBy === "type") return sub.type;
  if (groupBy === "cycle") return sub.billing_cycle;
  // status
  if (sub.want_to_buy) return "wishlist";
  if (!sub.active && sub.pending_cancel) return "cancelled";
  if (!sub.active) return "closed";
  if (sub.pending_cancel) return "pending_cancel";
  return "active";
}

// ลากไปคอลัมน์นี้ → ต้องแก้ค่าอะไร
export function boardPatchFor(groupBy: BoardGroupBy, toKey: string): Partial<Subscription> {
  if (groupBy === "status") return STATUS_PATCH[toKey] ?? {};
  if (groupBy === "category") return { category: toKey };
  if (groupBy === "type") return { type: toKey as SubType };
  return { billing_cycle: toKey as BillingCycle };
}

function boardColumns(groupBy: BoardGroupBy, rows: Subscription[]): BoardCol[] {
  if (groupBy === "status") return STATUS_COLS;
  if (groupBy === "type") return TYPE_COLS;
  if (groupBy === "cycle") return CYCLE_COLS;
  // category = ไดนามิกจากข้อมูลจริง
  const seen = new Set<string>();
  for (const r of rows) seen.add(r.category || "Other");
  return [...seen].sort((a, b) => a.localeCompare(b, "th")).map((k, i) => ({ key: k, label: k, dot: CATEGORY_DOTS[i % CATEGORY_DOTS.length] }));
}

function SubCardBody({ sub, settings, dragging, hideActiveBadge }: { sub: Subscription; settings: SubSettings; dragging?: boolean; hideActiveBadge?: boolean }) {
  const monthly = monthlyTHB(sub, settings);
  const status = subStatusLabel(sub);
  // ราคาจริงตามบิล (ถ้าต่างจากยอดบาท/เดือน) เช่น "รายปี ฿4,580" / "$20"
  const original = sub.billing_cycle === "yearly" ? `รายปี ${fmtCost(sub.cost, sub.currency)}` : sub.currency !== "THB" ? fmtCost(sub.cost, sub.currency) : "";
  const d = daysUntil(nextRenewal(sub));
  const soon = d !== null && d >= 0 && d <= 30;
  return (
    <div className={`bg-white rounded-lg border p-3 ${dragging ? "shadow-xl ring-2 ring-indigo-300 rotate-1 border-indigo-200" : "border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow"}`}>
      <div className="flex items-center gap-2.5">
        <AppLogo src={sub.logo_url} name={sub.name} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{sub.name}</span>
            <span className="flex shrink-0 items-center gap-1">
              <PlanBadge plan={sub.plan_name} />
              {sub.type === "personal" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600">ส่วนตัว</span>}
            </span>
          </div>
          {sub.members?.length >= 2 ? (
            <div className="mt-0.5 flex min-w-0"><MembersChip sub={sub} /></div>
          ) : (sub.account_email || sub.category) && (
            <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
              {sub.account_email || sub.category}{sub.billing_cycle !== "monthly" ? ` · ${CYCLE_LABEL[sub.billing_cycle]}` : ""}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-sm font-semibold text-slate-800 tabular-nums">
          {fmtBaht(monthly)}<span className="text-[11px] text-slate-400 font-normal">/ด.</span>
          {original && <span className="ml-1.5 text-[10px] text-slate-400 font-normal">{original}</span>}
        </span>
        {!(hideActiveBadge && status === "ใช้งาน") && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${SUB_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}>{status}</span>
        )}
      </div>
      {soon && <div className="text-[10px] text-amber-600 mt-1.5">⏰ ต่ออายุอีก {d} วัน</div>}
    </div>
  );
}

function DraggableCard({ sub, settings, onClick, hideActiveBadge }: { sub: Subscription; settings: SubSettings; onClick: () => void; hideActiveBadge?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: sub.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? "opacity-40" : ""}`}>
      <SubCardBody sub={sub} settings={settings} hideActiveBadge={hideActiveBadge} />
    </div>
  );
}

// สวิตช์ เปิด-ปิดใช้งาน รายคนในการ์ดกลุ่ม
function ActiveSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-label={on ? "ปิดใช้งาน" : "เปิดใช้งาน"} title={on ? "ใช้งานอยู่ — กดเพื่อปิด" : "ปิดอยู่ — กดเพื่อเปิด"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${on ? "bg-emerald-400" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

// การ์ดกลุ่ม — รวมหลายผู้ใช้ชื่อกลุ่มเดียวกัน (ไว้ดู+เปิดปิดรายคน ไม่ลาก)
function GroupCard({ name, members, settings, onEdit, onToggleActive }: {
  name: string; members: Subscription[]; settings: SubSettings;
  onEdit: (s: Subscription) => void; onToggleActive?: (s: Subscription, active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = members.reduce((sum, m) => sum + monthlyTHB(m, settings), 0);
  const activeCount = members.filter((m) => m.active).length;
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-2 p-3 text-left rounded-lg hover:border-indigo-300">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs shrink-0">{open ? "▾" : "▸"}</span>
            <AppLogo src={members.find((m) => m.logo_url)?.logo_url} name={name} size={22} />
            <span className="text-sm font-medium text-slate-800 leading-snug truncate">{name}</span>
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">กลุ่ม {members.length}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 ml-4">
            {members.length} ผู้ใช้{activeCount < members.length ? ` · ใช้งาน ${activeCount}` : ""}
          </div>
        </div>
        <span className="text-sm font-semibold text-slate-800 tabular-nums shrink-0">{fmtBaht(total)}<span className="text-[11px] text-slate-400 font-normal">/ด.</span></span>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 px-3 py-2 ${m.active ? "" : "opacity-50"}`}>
              <button type="button" onClick={() => onEdit(m)} className="min-w-0 flex-1 text-left">
                <div className={`text-[13px] text-slate-700 truncate ${m.active ? "" : "line-through"}`}>{m.account_email || m.name}</div>
                <div className="text-[11px] text-slate-400 tabular-nums">{fmtBaht(monthlyTHB(m, settings))}/ด.{!m.active ? " · ปิด" : ""}</div>
              </button>
              {onToggleActive && <ActiveSwitch on={m.active} onToggle={() => onToggleActive(m, !m.active)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// แยก rows ในคอลัมน์เป็น การ์ดเดี่ยว / การ์ดกลุ่ม (กลุ่ม = ชื่อกลุ่มเดียวกัน ≥2 รายการในคอลัมน์นี้)
type BoardItem = { kind: "solo"; sub: Subscription } | { kind: "group"; name: string; members: Subscription[] };
function bucketRows(rows: Subscription[]): BoardItem[] {
  const groups = new Map<string, Subscription[]>();
  const order: ({ g: string } | { sub: Subscription })[] = [];
  for (const r of rows) {
    const g = (r.group_name || "").trim();
    if (g) {
      if (!groups.has(g)) { groups.set(g, []); order.push({ g }); }
      groups.get(g)!.push(r);
    } else order.push({ sub: r });
  }
  return order.map((o): BoardItem => {
    if ("sub" in o) return { kind: "solo", sub: o.sub };
    const members = groups.get(o.g)!;
    return members.length >= 2 ? { kind: "group", name: o.g, members } : { kind: "solo", sub: members[0] };
  });
}

function BoardColumn({ col, rows, total, share, settings, onEdit, onToggleActive, hideActiveBadge }: {
  col: BoardCol; rows: Subscription[]; total: number; settings: SubSettings;
  /** สัดส่วนจากยอดรวมทั้งบอร์ด (0–1) — ส่งมา = โชว์บรรทัด "฿/ปี · %" (โหมดใช้งาน · ตามหมวด) */
  share?: number;
  onEdit: (s: Subscription) => void; onToggleActive?: (s: Subscription, active: boolean) => void;
  hideActiveBadge?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const items = useMemo(() => bucketRows(rows), [rows]);
  return (
    <div className="flex flex-col w-60 shrink-0">
      <div className="px-3 py-2 bg-white rounded-t-lg border border-b-0 border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${col.dot}`} />
            <span className="text-sm font-semibold text-slate-700 truncate">{col.label}</span>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{rows.length}</span>
          </div>
          <span className={`text-xs shrink-0 tabular-nums ${share !== undefined ? "font-semibold text-slate-800" : "font-medium text-slate-500"}`}>{fmtBaht(total)}/ด.</span>
        </div>
        {share !== undefined && (
          <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">{fmtBaht(total * 12)}/ปี · {Math.round(share * 100)}% ของทั้งหมด</div>
        )}
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[120px] space-y-2 p-2 rounded-b-lg border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-indigo-50" : "bg-slate-50/60"}`}>
        {items.map((it) => it.kind === "solo"
          ? <DraggableCard key={it.sub.id} sub={it.sub} settings={settings} onClick={() => onEdit(it.sub)} hideActiveBadge={hideActiveBadge} />
          : <GroupCard key={`g:${it.name}`} name={it.name} members={it.members} settings={settings} onEdit={onEdit} onToggleActive={onToggleActive} />)}
        {rows.length === 0 && <div className="h-20 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">ลากการ์ดมาวางที่นี่</div>}
      </div>
    </div>
  );
}

export function SubscriptionsBoard({ rows, settings, groupBy, onEdit, onMove, onToggleActive, activeOnly }: {
  rows: Subscription[];
  settings: SubSettings;
  groupBy: BoardGroupBy;
  onEdit: (s: Subscription) => void;
  /** ลากข้ามคอลัมน์ — โหมดใช้งาน · ตามหมวด คอลัมน์ = หมวด (ผู้เรียกต้องใช้ groupBy "category" ตอนแปลงเป็นค่าที่แก้) */
  onMove: (sub: Subscription, toKey: string) => void;
  /** เปิด-ปิดใช้งานรายคนในการ์ดกลุ่ม (ไม่ส่ง = ไม่มีสิทธิ์แก้ → ไม่โชว์สวิตช์) */
  onToggleActive?: (sub: Subscription, active: boolean) => void;
  /** โหมด "ใช้งาน · ตามหมวด" — ส่งมา = เฉพาะที่ยังจ่าย แยกตามหมวด + สรุปยอด (ไม่ส่ง = บอร์ดเดิมตาม groupBy) */
  activeOnly?: Pick<BoardPref, "includePending" | "sort"> | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const effGroup: BoardGroupBy = activeOnly ? "category" : groupBy;
  const viewRows = useMemo(() => (activeOnly ? rows.filter((r) => isPayingNow(r, activeOnly.includePending)) : rows), [rows, activeOnly]);

  // คอลัมน์ + แถวในคอลัมน์ + ยอดรวม · โหมดใช้งาน: หมวดแพงสุดก่อน และเรียงการ์ดตามที่เลือก (สีหมวดคงที่ตามลำดับชื่อ)
  const columns = useMemo(() => {
    const list = boardColumns(effGroup, viewRows).map((col) => {
      const colRows = viewRows.filter((r) => boardKeyOf(effGroup, r) === col.key);
      if (activeOnly) {
        colRows.sort(activeOnly.sort === "name"
          ? (a, b) => a.name.localeCompare(b.name)
          : (a, b) => monthlyTHB(b, settings) - monthlyTHB(a, settings));
      }
      return { col, rows: colRows, total: colRows.reduce((sum, r) => sum + monthlyTHB(r, settings), 0) };
    });
    return activeOnly ? list.sort((a, b) => b.total - a.total) : list;
  }, [effGroup, viewRows, activeOnly, settings]);
  const grand = columns.reduce((s, c) => s + c.total, 0);
  const activeSub = viewRows.find((r) => r.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : undefined;
    if (!overId) return;
    const sub = viewRows.find((r) => r.id === String(e.active.id));
    if (sub && boardKeyOf(effGroup, sub) !== overId) onMove(sub, overId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {activeOnly && <ActiveSummary columns={columns} grand={grand} count={viewRows.length} />}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map(({ col, rows: colRows, total }) => (
          <BoardColumn key={col.key} col={col} rows={colRows} total={total} settings={settings} onEdit={onEdit} onToggleActive={onToggleActive}
            share={activeOnly ? (grand > 0 ? total / grand : 0) : undefined} hideActiveBadge={!!activeOnly} />
        ))}
        {columns.length === 0 && <div className="text-sm text-slate-400 p-8">{activeOnly ? "ไม่มีรายการที่ใช้งานอยู่" : "ยังไม่มีรายการ"}</div>}
      </div>
      <DragOverlay dropAnimation={null}>{activeSub ? <div className="w-60"><SubCardBody sub={activeSub} settings={settings} dragging hideActiveBadge={!!activeOnly} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

/** สรุปบนหัวโหมด "ใช้งาน · ตามหมวด": รวมต่อเดือน / ต่อปี / จำนวน + แถบสัดส่วนแต่ละหมวด */
function ActiveSummary({ columns, grand, count }: { columns: { col: BoardCol; total: number }[]; grand: number; count: number }) {
  return (
    <div className="mb-3 space-y-2">
      <div className="grid grid-cols-3 gap-2 max-w-xl">
        {([["รวมต่อเดือน", fmtBaht(grand)], ["รวมต่อปี", fmtBaht(grand * 12)], ["จำนวนรายการ", `${count} รายการ`]] as const).map(([l, v]) => (
          <div key={l} className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[11px] text-slate-500">{l}</div>
            <div className="text-lg font-semibold text-slate-800 tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {grand > 0 && (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden max-w-3xl bg-slate-100">
            {columns.map(({ col, total }) => total > 0 && (
              <div key={col.key} className={col.dot} style={{ width: `${(total / grand) * 100}%` }} title={`${col.label} ${fmtBaht(total)}/ด.`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {columns.map(({ col, total }) => (
              <span key={col.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${col.dot}`} />{col.label} <b className="font-medium text-slate-700 tabular-nums">{Math.round((total / grand) * 100)}%</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
