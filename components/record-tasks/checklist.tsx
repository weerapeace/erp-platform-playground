"use client";

/**
 * เช็กลิสต์กลางแบบฝัง (ของกลาง) — ใช้ hook useRecordTasks ตัวเดียวกับ RecordTasksButton
 *   <RecordChecklist .../>     = ในฟอร์ม: ติ๊ก / กดข้อความเพื่อแก้ / ✕ ลบ / 👤 ผู้รับผิดชอบรายข้อ / เพิ่ม + ปุ่มลัด "ใช้บ่อย" + พับข้อที่เสร็จ
 *   <RecordChecklistChip .../> = บนการ์ด: ข้อที่รอเป็นช่องติ๊กได้เลย (สูงสุด 3 ข้อ) + ⋯ เด้งกล่องดูทั้งหมด/เพิ่ม (ไม่เปิดเรคคอร์ด · ไม่ลากการ์ด)
 * ค่าที่ใช้บ่อย = ค่ากลาง erp_lookups ชนิด presetType (⚙️ ข้างปุ่มลัด เปิดป๊อปแก้/ลากเรียง)
 * ผู้รับผิดชอบ = ของกลาง UserPicker (เฉพาะคนที่ยังทำงานอยู่) · ใส่ชื่อแล้วกระดิ่งเด้งบอกคนนั้น + เห็นใน "งานของคุณ" ของป๊อปตอนเข้า ERP
 * ใช้แล้วที่: ใบงานออกแบบ "⏳ รออะไรอยู่" (lib/design-sheet-waiting) · doc: docs/record-tasks.md
 */
import { useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { LookupValuesEditor, useLookupNames } from "@/components/lookup-values-editor";
import { UserPicker } from "@/components/pickers";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { isTaskDone, summarizeTasks, taskWithWho, type ChecklistSummary } from "@/lib/record-tasks";
import type { RecordTask } from "@/app/api/record-tasks/route";
import { relTime, useRecordTasks } from "./use-record-tasks";

type Common = {
  moduleKey: string;
  recordType?: string | null;
  recordId: string;
  canEdit: boolean;
  /** แก้แล้ว → สรุปใหม่ (ให้หน้าแม่อัปเดตการ์ด/ตัวนับ) */
  onChange?: (summary: ChecklistSummary) => void;
};

const tickCls = (done: boolean) =>
  `mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-400"}`;

const AV_COLORS = ["#7F77DD", "#1D9E75", "#D85A30", "#378ADD", "#D4537E", "#639922", "#BA7517"];
const avColor = (name: string) => AV_COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AV_COLORS.length];

/** ชิปผู้รับผิดชอบ — มีชื่อ = วงกลมตัวแรก + ชื่อ · ไม่มี = เส้นประ "👤 ใคร" */
export function WhoChip({ name, onClick, compact = false }: { name: string | null | undefined; onClick?: () => void; compact?: boolean }) {
  const cls = `inline-flex shrink-0 items-center gap-1 rounded-full border text-[11px] whitespace-nowrap ${compact ? "h-5" : "h-6"} ${onClick ? "cursor-pointer hover:bg-slate-50" : "cursor-default"}`;
  const inner = name
    ? <><span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: avColor(name) }}>{[...name][0]}</span><span className="max-w-[7rem] truncate pr-1.5 text-slate-700">{name}</span></>
    : <span className="px-1.5 text-slate-400">👤 ใคร</span>;
  return onClick
    ? <button type="button" onClick={onClick} title={name ? `ผู้รับผิดชอบ: ${name} (กดเพื่อเปลี่ยน)` : "ใส่ผู้รับผิดชอบ"} className={`${cls} ${name ? "border-slate-200 pl-0.5" : "border-dashed border-slate-300"}`}>{inner}</button>
    : <span className={`${cls} ${name ? "border-slate-200 pl-0.5" : "border-dashed border-slate-300"}`}>{inner}</span>;
}

/** เลือกผู้รับผิดชอบแบบเปิดในแถว (ไม่ซ้อน popover กับรายการของ UserPicker) */
function WhoPicker({ onPick, onCancel, allowNone }: { onPick: (u: { id: string; name: string } | null) => void; onCancel: () => void; allowNone: boolean }) {
  return (
    <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5">
      <div className="min-w-[12rem] flex-1"><UserPicker value={null} onChange={(u) => { if (u) onPick({ id: u.id, name: u.name }); }} placeholder="พิมพ์ชื่อคนรับผิดชอบ…" /></div>
      {allowNone && <button type="button" onClick={() => onPick(null)} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-100">ไม่ระบุ</button>}
      <button type="button" onClick={onCancel} className="h-8 rounded-md px-2 text-xs text-slate-500 hover:text-slate-800">ยกเลิก</button>
    </div>
  );
}

export function RecordChecklist({ moduleKey, recordType = null, recordId, canEdit, onChange, presetType = null, label = null,
  emptyText = "ไม่มีอะไรรอ", placeholder = "＋ เพิ่มสิ่งที่รอ… (Enter)", presetTitle = "ค่าที่ใช้บ่อย", assignable = true }: Common & {
  /** ชนิดค่ากลางของปุ่มลัด (null = ไม่มีปุ่มลัด) */
  presetType?: string | null;
  label?: ReactNode;
  emptyText?: string;
  placeholder?: string;
  presetTitle?: string;
  /** ใส่ผู้รับผิดชอบรายข้อได้ */
  assignable?: boolean;
}) {
  const { items, loading, loaded, add, toggle, rename, assign, remove } = useRecordTasks({
    moduleKey, recordId, recordType, onChange: onChange ? (list) => onChange(summarizeTasks(list)) : undefined,
  });
  const presets = useLookupNames(presetType);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [pickFor, setPickFor] = useState<string | null>(null);   // id ข้อที่กำลังเลือกคน · "new" = ข้อที่กำลังจะเพิ่ม
  const [newWho, setNewWho] = useState<{ id: string; name: string } | null>(null);

  const openItems = items.filter((t) => !isTaskDone(t.status));
  const doneItems = items.filter((t) => isTaskDone(t.status));
  const quick = presets.filter((p) => !openItems.some((i) => i.title.trim() === p.trim()));   // ข้อที่มีอยู่แล้ว ไม่ต้องโชว์ปุ่มลัดซ้ำ

  const submit = async (t: string) => {
    if (!t.trim()) { setErr(true); return; }
    setBusy(true);
    const ok = await add(t, newWho);
    setBusy(false);
    if (ok) { if (t === text) setText(""); setNewWho(null); if (pickFor === "new") setPickFor(null); }
  };
  const commitEdit = () => { const e = editing; setEditing(null); if (e) { const it = items.find((x) => x.id === e.id); if (it) void rename(it, e.text); } };

  const row = (it: RecordTask) => {
    const done = isTaskDone(it.status);
    const meta = (done ? ["✓", [it.resolved_by, relTime(it.resolved_at)].filter(Boolean).join(" · ")] : [[it.created_by, relTime(it.created_at)].filter(Boolean).join(" · ")]).join(" ");
    return (
      <div key={it.id}>
      <div className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
        <button type="button" onClick={() => canEdit && void toggle(it)} disabled={!canEdit} className={tickCls(done)}
          title={done ? "ทำเครื่องหมายว่ายังรอ" : "ติ๊กว่าเสร็จ"} aria-label={done ? `ยกเลิกติ๊ก ${it.title}` : `ติ๊กเสร็จ ${it.title}`}>✓</button>
        <div className="min-w-0 flex-1">
          {editing?.id === it.id ? (
            <input autoFocus value={editing.text} maxLength={300} aria-label="ข้อความ"
              onChange={(e) => setEditing({ id: it.id, text: e.target.value })} onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditing(null); }}
              className="h-7 w-full rounded-md border border-blue-400 bg-white px-1.5 text-sm focus:outline-none" />
          ) : (
            <button type="button" disabled={!canEdit} onClick={() => setEditing({ id: it.id, text: it.title })} title={canEdit ? "กดเพื่อแก้" : undefined}
              className={`block w-full break-words text-left text-sm disabled:cursor-default ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{it.title}</button>
          )}
        </div>
        {assignable && (it.assigned_name || canEdit) && <WhoChip name={it.assigned_name} onClick={canEdit ? () => setPickFor(pickFor === it.id ? null : it.id) : undefined} />}
        <span className="mt-0.5 hidden shrink-0 whitespace-nowrap text-[10px] text-slate-400 sm:inline">{meta}</span>
        {canEdit && (
          <button type="button" onClick={() => void remove(it)} title="ลบ" aria-label={`ลบ ${it.title}`}
            className="mt-0.5 shrink-0 px-0.5 text-xs text-slate-300 opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100">✕</button>
        )}
      </div>
      {pickFor === it.id && <WhoPicker allowNone={!!it.assigned_to} onCancel={() => setPickFor(null)} onPick={(u) => { setPickFor(null); void assign(it, u); }} />}
      </div>
    );
  };

  return (
    <div>
      {label && (
        <div className="text-[11px] text-slate-500">
          {label}{items.length > 0 && <span className="text-slate-400"> · เหลือ {openItems.length}/{items.length}</span>}
        </div>
      )}
      <div className="mt-0.5 rounded-lg border border-slate-200 bg-white p-1">
        {!loaded && loading ? <div className="px-2 py-1.5 text-xs text-slate-400">กำลังโหลด…</div>
          : openItems.length ? openItems.map(row)
          : <div className="px-2 py-1.5 text-xs text-slate-400">{emptyText}</div>}
        {canEdit && (
          <div className="flex gap-1.5 px-1 pt-1">
            <input value={text} maxLength={300} placeholder={placeholder} aria-label="เพิ่มรายการ"
              onChange={(e) => { setText(e.target.value); setErr(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(text); } }}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {assignable && <span className="flex items-center"><WhoChip name={newWho?.name} onClick={() => setPickFor(pickFor === "new" ? null : "new")} /></span>}
            <button type="button" onClick={() => void submit(text)} disabled={busy} className="h-8 shrink-0 rounded-md border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">เพิ่ม</button>
          </div>
        )}
        {pickFor === "new" && <WhoPicker allowNone={!!newWho} onCancel={() => setPickFor(null)} onPick={(u) => { setNewWho(u); setPickFor(null); }} />}
        {err && <p className="px-2 pt-1 text-xs text-rose-600">พิมพ์ข้อความก่อน</p>}
        {canEdit && presetType && (
          <div className="flex flex-wrap items-center gap-1 px-1 pb-0.5 pt-1.5">
            {quick.length > 0 && <span className="text-[11px] text-slate-400">ใช้บ่อย:</span>}
            {quick.map((p) => (
              <button key={p} type="button" onClick={() => void submit(p)} disabled={busy}
                className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">＋ {p}</button>
            ))}
            <button type="button" onClick={() => setPresetOpen(true)} title={`ตั้งค่า${presetTitle} (เพิ่ม · แก้ · ลากเรียง)`}
              className="ml-auto rounded px-1 text-[11px] text-slate-400 hover:text-blue-600">⚙️ ตั้งค่า</button>
          </div>
        )}
        {doneItems.length > 0 && (
          <div className="mt-1 border-t border-slate-100 pt-0.5">
            <button type="button" onClick={() => setShowDone((s) => !s)} className="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-800">
              {showDone ? "▾" : "▸"} เสร็จแล้ว {doneItems.length} ข้อ
            </button>
            {showDone && doneItems.map(row)}
          </div>
        )}
      </div>
      {presetType && <LookupValuesEditor lookupType={presetType} open={presetOpen} onClose={() => setPresetOpen(false)} title={presetTitle} />}
    </div>
  );
}

/** แถบบนการ์ด — ไม่มีรายการเลย = ไม่โชว์ (การ์ดสั้นเท่าเดิม) · เสร็จครบ = "✓ ไม่มีอะไรรอแล้ว"
 *  สรุปมี ids (API รายการรุ่นใหม่) = ติ๊กบนการ์ดได้เลยทีละข้อ (สูงสุด CHIP_ROWS ข้อ · ติ๊กแล้วขีดฆ่า กดซ้ำ = ยกเลิก) + ปุ่ม ⋯ เปิดกล่องดูทั้งหมด/เพิ่ม
 *  ติ๊กได้ = canEdit หรือเป็นผู้รับผิดชอบข้อนั้น (กฎเดียวกับ PATCH /api/record-tasks/[id]) */
const CHIP_ROWS = 3;
type ChipRow = { id: string; title: string; who: string | null; aid: string | null };
export function RecordChecklistChip({ moduleKey, recordType = null, recordId, canEdit, onChange, summary }: Common & {
  /** สรุปจาก API รายการ (ไม่ต้องยิงทีละการ์ด) */
  summary: ChecklistSummary | null | undefined;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const [doneLocal, setDoneLocal] = useState<ChipRow[]>([]);   // เพิ่งติ๊กบนการ์ด — ยังโชว์ขีดฆ่าให้กดยกเลิกได้
  const [busy, setBusy] = useState<string | null>(null);
  if (!summary || (summary.open.length === 0 && summary.done === 0 && !open && doneLocal.length === 0)) return null;
  // กันคลิก/พิมพ์ในแถบและกล่อง (portal) ไหลไปเปิดการ์ด / ลากการ์ด
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const rows: ChipRow[] | null = summary.ids && summary.ids.length === summary.open.length
    ? summary.open.map((title, i) => ({ id: summary.ids![i], title, who: summary.who?.[i] ?? null, aid: summary.aids?.[i] ?? null }))
    : null;

  // ── ติ๊กตรงบนการ์ด ──
  if (rows) {
    const canTick = (r: ChipRow) => canEdit || (!!user && r.aid === user.id);
    const struck = doneLocal.filter((d) => !rows.some((r) => r.id === d.id));
    const setStatus = async (r: ChipRow, done: boolean) => {
      if (busy) return;
      setBusy(r.id);
      try {
        const res = await apiFetch(`/api/record-tasks/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: done ? "resolved" : "open", actor: user?.name }) });
        if (!res.ok) throw new Error();
        const idx = rows.findIndex((x) => x.id === r.id);
        if (done) {
          setDoneLocal((d) => [...d.filter((x) => x.id !== r.id), r]);
          if (idx >= 0) onChange?.({ open: summary.open.filter((_, i) => i !== idx), who: summary.who?.filter((_, i) => i !== idx), ids: summary.ids!.filter((_, i) => i !== idx), aids: summary.aids?.filter((_, i) => i !== idx), done: summary.done + 1 });
        } else {
          setDoneLocal((d) => d.filter((x) => x.id !== r.id));
          onChange?.({ open: [...summary.open, r.title], who: [...(summary.who ?? summary.open.map(() => null)), r.who], ids: [...summary.ids!, r.id], aids: [...(summary.aids ?? summary.open.map(() => null)), r.aid], done: Math.max(0, summary.done - 1) });
        }
      } catch { toast.error("ติ๊กไม่สำเร็จ ลองใหม่อีกครั้ง"); }
      finally { setBusy(null); }
    };
    const rowBtn = (r: ChipRow, done: boolean) => {
      const can = canTick(r);
      return (
        <button key={r.id} type="button" draggable={false} onDragStart={(e) => e.preventDefault()} disabled={!can || busy === r.id}
          onClick={() => void setStatus(r, !done)}
          title={can ? (done ? "กดเพื่อยกเลิกติ๊ก" : "ติ๊กเมื่อเสร็จ") : "ติ๊กได้เฉพาะคนที่แก้ใบงานได้ / ผู้รับผิดชอบข้อนี้"}
          className={`flex w-full min-w-0 items-start gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11px] transition ${done ? "bg-emerald-50 text-slate-400" : "bg-amber-50 text-amber-900"} ${can ? "hover:bg-amber-100" : "cursor-default"} ${busy === r.id ? "opacity-60" : ""}`}>
          <span className={tickCls(done)}>✓</span>
          <span className={`min-w-0 flex-1 truncate ${done ? "line-through" : ""}`}>{r.title}{r.who && <span className={done ? "" : "text-amber-700/70"}> · {r.who}</span>}</span>
        </button>
      );
    };
    return (
      <span className="mt-1 block space-y-0.5" onClick={stop} onKeyDown={stop} onMouseDown={stop} onPointerDown={stop}>
        {rows.slice(0, CHIP_ROWS).map((r) => rowBtn(r, false))}
        {struck.map((r) => rowBtn(r, true))}
        {rows.length === 0 && struck.length === 0 && <span className="block text-[10px] text-emerald-600">✓ ไม่มีอะไรรอแล้ว</span>}
        <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)} draggable={false} onDragStart={(e) => e.preventDefault()}
          title="ดูทั้งหมด / เพิ่มสิ่งที่รอ" className="rounded px-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100">
          {rows.length > CHIP_ROWS ? `+${rows.length - CHIP_ROWS} ข้อ ⋯` : canEdit ? "＋ เพิ่ม ⋯" : "⋯"}
        </button>
        <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} minWidth={240} maxWidth={320}>
          {open && <ChipPanel moduleKey={moduleKey} recordType={recordType} recordId={recordId} canEdit={canEdit} onChange={onChange} />}
        </FloatingDropdown>
      </span>
    );
  }

  // ── สรุปแบบเก่า (ไม่มี ids) = แถบเดียว กดแล้วเด้งกล่องติ๊ก ──
  if (summary.open.length === 0 && !open) return <div className="mt-1 text-[10px] text-emerald-600">✓ ไม่มีอะไรรอแล้ว</div>;
  return (
    <span className="block" onClick={stop} onKeyDown={stop} onMouseDown={stop} onPointerDown={stop}>
      <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)} draggable={false} onDragStart={(e) => e.preventDefault()}
        title="กดเพื่อติ๊ก / เพิ่มสิ่งที่รอ"
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100">
        <span className="shrink-0">⏳</span>
        <span className="truncate">{summary.open[0] ? taskWithWho(summary.open[0], summary.who?.[0]) : "ไม่มีอะไรรอแล้ว"}</span>
        {summary.open.length > 1 && <span className="shrink-0 font-semibold">+{summary.open.length - 1}</span>}
      </button>
      <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} minWidth={240} maxWidth={320}>
        {open && <ChipPanel moduleKey={moduleKey} recordType={recordType} recordId={recordId} canEdit={canEdit} onChange={onChange} />}
      </FloatingDropdown>
    </span>
  );
}

function ChipPanel({ moduleKey, recordType, recordId, canEdit, onChange }: Common) {
  const { items, loading, loaded, add, toggle } = useRecordTasks({
    moduleKey, recordId, recordType, onChange: onChange ? (list) => onChange(summarizeTasks(list)) : undefined,
  });
  const [text, setText] = useState("");
  const [touched, setTouched] = useState<Set<string>>(new Set());   // ข้อที่เพิ่งติ๊กในกล่องนี้ — ยังโชว์ (ขีดฆ่า) จนกว่าจะปิด กดผิดแก้ได้
  const shown = items.filter((t) => !isTaskDone(t.status) || touched.has(t.id));
  const openCount = items.filter((t) => !isTaskDone(t.status)).length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xl">
      <div className="mb-1 px-1 text-[11px] text-slate-500">⏳ รออะไรอยู่{items.length > 0 && ` · เหลือ ${openCount}/${items.length}`}</div>
      {!loaded && loading ? <div className="px-1 py-2 text-xs text-slate-400">กำลังโหลด…</div> : (
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.length === 0 && <div className="px-1 py-1 text-xs text-slate-400">ไม่มีอะไรรอแล้ว</div>}
          {shown.map((it) => {
            const done = isTaskDone(it.status);
            return (
              <label key={it.id} className={`flex items-start gap-2 rounded-md px-1 py-1 text-sm ${canEdit ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                <button type="button" disabled={!canEdit} className={tickCls(done)} aria-label={done ? `ยกเลิกติ๊ก ${it.title}` : `ติ๊กเสร็จ ${it.title}`}
                  onClick={() => { setTouched((s) => new Set(s).add(it.id)); void toggle(it); }}>✓</button>
                <span className={`min-w-0 flex-1 break-words ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{it.title}</span>
                {it.assigned_name && <WhoChip name={it.assigned_name} compact />}
              </label>
            );
          })}
        </div>
      )}
      {canEdit && (
        <input value={text} maxLength={300} placeholder="＋ เพิ่ม… (Enter)" aria-label="เพิ่มสิ่งที่รอ"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); const t = text; void add(t).then((ok) => { if (ok) setText(""); }); } }}
          className="mt-1.5 h-8 w-full rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}
      <div className="mt-1.5 px-1 text-[10px] text-slate-400">เปิดใบงานเพื่อแก้/ลบ หรือดูข้อที่เสร็จแล้ว</div>
    </div>
  );
}
