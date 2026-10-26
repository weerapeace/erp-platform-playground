"use client";

/**
 * เลือกคอลัมน์ของ MiniTable — จำต่อคน ตามไปทุกเครื่อง (useUserPref) · ของกลาง
 * --------------------------------------------------------------------------
 *   const cols = useColumnPrefs("wb_table_cols_pc", allColumns);
 *   <MiniTable columns={cols.visible} actions={<ColumnChooser state={cols} />} ... />
 *
 * ตั้งที่คอลัมน์ (MiniColumn):
 *   locked        = ซ่อนไม่ได้ + ย้ายไม่ได้ (เช่น รูป / ชื่อ — อยู่ตำแหน่งเดิมเสมอ)
 *   defaultHidden = ซ่อนไว้ก่อน ผู้ใช้เปิดเองได้
 *   group         = หมวดในเมนู (ไม่ใส่ = "อื่น ๆ")
 *   label         = ชื่อในเมนู (ไม่ใส่ = header ถ้าเป็นข้อความ)
 *   isNew         = ป้าย "ใหม่"
 *
 * เก็บเฉพาะ "ส่วนที่ผู้ใช้เปลี่ยนจากค่าเริ่มต้น" (on/off) → เพิ่มคอลัมน์ทีหลัง คนที่เคยตั้งไว้แล้วก็ได้ค่าเริ่มต้นของคอลัมน์ใหม่
 * ลำดับ (order) = รายชื่อคอลัมน์ที่ย้ายได้ทั้งหมดตามที่ผู้ใช้เรียง · คอลัมน์ใหม่ที่ยังไม่อยู่ในรายการ = แทรกถัดจากเพื่อนบ้านเดิม
 * อยากจำแยกตามอุปกรณ์/โหมด = ส่ง prefKey คนละตัว (เช่น ..._pc / ..._ipad) — ทั้งเปิด/ปิด และลำดับ จำแยกตาม key
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { useDragReorder, DragHandle } from "@/components/sortable-list";
import type { MiniColumn } from "./index";
import { applyColumnOrder } from "./column-order";
export { applyColumnOrder };

type Prefs = { on: string[]; off: string[]; order: string[] };
const EMPTY: Prefs = { on: [], off: [], order: [] };
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const parsePrefs = (v: unknown): Prefs | null => (v && typeof v === "object"
  ? { on: strs((v as Prefs).on), off: strs((v as Prefs).off), order: strs((v as Prefs).order) } : null);

export type ColumnPrefsState<T> = {
  all: MiniColumn<T>[];
  /** ทุกคอลัมน์ เรียงตามที่ผู้ใช้จัด (รวมที่ซ่อนอยู่) */
  ordered: MiniColumn<T>[];
  /** คอลัมน์ที่โชว์ เรียงตามที่ผู้ใช้จัด */
  visible: MiniColumn<T>[];
  isOn: (key: string) => boolean;
  toggle: (key: string) => void;
  /** ย้ายคอลัมน์ key ไปไว้ตำแหน่งของ toKey (ลากทับ / ลูกศร) */
  move: (key: string, toKey: string) => void;
  reset: () => void;
  /** ผู้ใช้ปรับไปจากค่าเริ่มต้นแล้วหรือยัง (เปิด/ปิด หรือ ลำดับ) */
  customized: boolean;
};

export function useColumnPrefs<T>(prefKey: string, columns: MiniColumn<T>[]): ColumnPrefsState<T> {
  const [prefs, setPrefs] = useUserPref<Prefs>(prefKey, EMPTY, parsePrefs);
  const onOf = useCallback((c: MiniColumn<T>) => (c.locked ? true : prefs.on.includes(c.key) ? true : prefs.off.includes(c.key) ? false : !c.defaultHidden), [prefs]);
  const ordered = useMemo(() => applyColumnOrder(columns, prefs.order), [columns, prefs.order]);
  const visible = useMemo(() => ordered.filter(onOf), [ordered, onOf]);
  const isOn = useCallback((key: string) => { const c = columns.find((x) => x.key === key); return c ? onOf(c) : false; }, [columns, onOf]);
  const toggle = useCallback((key: string) => {
    const c = columns.find((x) => x.key === key);
    if (!c || c.locked) return;
    const next = !onOf(c);
    const on = prefs.on.filter((k) => k !== key), off = prefs.off.filter((k) => k !== key);
    if (next !== !c.defaultHidden) (next ? on : off).push(key);   // ตรงกับค่าเริ่มต้น = ไม่ต้องจำ
    setPrefs({ ...prefs, on, off });
  }, [columns, onOf, prefs, setPrefs]);
  const move = useCallback((key: string, toKey: string) => {
    const keys = ordered.filter((c) => !c.locked).map((c) => c.key);
    const from = keys.indexOf(key), to = keys.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return;
    keys.splice(from, 1); keys.splice(to, 0, key);
    const isDefault = keys.join("|") === columns.filter((c) => !c.locked).map((c) => c.key).join("|");
    setPrefs({ ...prefs, order: isDefault ? [] : keys });   // กลับมาเหมือนเดิม = ไม่ต้องจำ
  }, [ordered, columns, prefs, setPrefs]);
  const reset = useCallback(() => setPrefs(EMPTY), [setPrefs]);
  const customized = prefs.order.length > 0 || columns.some((c) => !c.locked && (prefs.on.includes(c.key) || prefs.off.includes(c.key)));
  return { all: columns, ordered, visible, isOn, toggle, move, reset, customized };
}

const labelOf = <T,>(c: MiniColumn<T>) => c.label ?? (typeof c.header === "string" ? c.header : c.key);

/** ปุ่ม "▥ คอลัมน์ n/ทั้งหมด" + เมนู 2 โหมด: เลือก (ติ๊กเปิด/ปิด แบ่งหมวด) · เรียงลำดับ (ลากหูจับ / ลูกศร) */
export function ColumnChooser<T>({ state, note, className = "" }: { state: ColumnPrefsState<T>; note?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pick" | "order">("pick");
  const anchor = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const m = new Map<string, MiniColumn<T>[]>();
    for (const c of state.all) { const g = c.group ?? "อื่น ๆ"; (m.get(g) ?? m.set(g, []).get(g)!).push(c); }
    return [...m.entries()];
  }, [state.all]);
  // โหมดเรียง: โชว์เฉพาะคอลัมน์ที่เปิดอยู่ (บนสุด = ซ้ายสุดในตาราง) · locked แสดงแต่ย้ายไม่ได้
  const lockedShown = state.visible.filter((c) => c.locked);
  const movableShown = state.visible.filter((c) => !c.locked);
  const drag = useDragReorder((from, to) => { const a = movableShown[from], b = movableShown[to]; if (a && b) state.move(a.key, b.key); }, { group: "column-chooser" });
  const segBtn = (m: "pick" | "order", label: string) => (
    <button type="button" onClick={() => setMode(m)}
      className={`h-7 px-3 text-xs ${mode === m ? "bg-blue-50 text-blue-700 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"}`}>{label}</button>
  );
  return (
    <div ref={anchor} className={`inline-block ${className}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="เลือก/เรียงคอลัมน์ที่จะโชว์ (จำไว้ให้คุณ)"
        className={`h-8 px-3 text-sm rounded-lg border ${open || state.customized ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        ▥ คอลัมน์ {state.visible.length}/{state.all.length}
      </button>
      {/* กว้างพอให้ 3 หมวดอ่านชื่อเต็มได้ (เดิม 320 → ชื่อโดนตัด) · จอแคบถูกบีบตามจอเอง */}
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={600} maxWidth={720}>
        {/* สูงไม่เกินที่เหลือถึงขอบจอ (--fd-max-h จาก FloatingDropdown) — หัวอยู่กับที่ รายการเลื่อนได้ */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl p-3" style={{ maxHeight: "var(--fd-max-h, 80vh)" }}>
          <div className="flex shrink-0 items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">{mode === "pick" ? "เลือกคอลัมน์" : "เรียงลำดับคอลัมน์"}</span>
            <span className="flex items-center gap-2">
              <span className="inline-flex overflow-hidden rounded-md border border-slate-200 divide-x divide-slate-200">{segBtn("pick", "☑ เลือก")}{segBtn("order", "↕ เรียงลำดับ")}</span>
              <button type="button" onClick={state.reset} disabled={!state.customized}
                className="h-7 px-2 text-xs rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">คืนค่าเริ่มต้น</button>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {mode === "pick" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
              {groups.map(([g, cols]) => (
                <div key={g} className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-400 mb-1">{g}</div>
                  {cols.map((c) => (
                    // ชื่อยาวให้ขึ้นบรรทัดใหม่ — ห้ามตัดทิ้ง (เดิม truncate อ่านไม่ออก)
                    <label key={c.key} title={labelOf(c)} className={`flex items-start gap-2 py-1 text-[13px] leading-snug ${c.locked ? "text-slate-400" : "text-slate-700 cursor-pointer"}`}>
                      <input type="checkbox" checked={state.isOn(c.key)} disabled={c.locked} onChange={() => state.toggle(c.key)} className="w-4 h-4 mt-px shrink-0 accent-blue-600" />
                      <span className="min-w-0 break-words">{labelOf(c)}</span>
                      {c.locked && <span className="shrink-0 text-[10px]" title="คอลัมน์หลัก ซ่อนไม่ได้">🔒</span>}
                      {c.isNew && <span className="shrink-0 text-[10px] px-1.5 rounded-full bg-blue-50 text-blue-700">ใหม่</span>}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-md">
              <p className="mb-2 text-[11px] text-slate-500">ลากที่ ⠿ หรือกดลูกศร · บนสุด = ซ้ายสุดในตาราง · คอลัมน์ที่ซ่อนอยู่ไม่อยู่ในรายการนี้ (เปิดได้ที่ ☑ เลือก)</p>
              {lockedShown.map((c) => (
                <div key={c.key} className="mb-1 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-[13px] text-slate-400">
                  <span className="w-4 text-center text-[11px]">🔒</span><span className="min-w-0 flex-1 break-words">{labelOf(c)}</span><span className="text-[10px]">ล็อกไว้</span>
                </div>
              ))}
              {movableShown.map((c, i) => (
                <div key={c.key} {...drag.rowProps(i)} className={`mb-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 text-[13px] text-slate-700 ${drag.rowCls(i)}`}>
                  <DragHandle {...drag.handleProps(i)} className="text-base" />
                  <span className="min-w-0 flex-1 break-words">{labelOf(c)}</span>
                  <button type="button" aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น (ไปทางซ้าย)" disabled={i === 0}
                    onClick={() => state.move(c.key, movableShown[i - 1].key)} className="h-7 w-7 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-25">↑</button>
                  <button type="button" aria-label="เลื่อนลง" title="เลื่อนลง (ไปทางขวา)" disabled={i === movableShown.length - 1}
                    onClick={() => state.move(c.key, movableShown[i + 1].key)} className="h-7 w-7 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-25">↓</button>
                </div>
              ))}
            </div>
          )}
          </div>
          {note && <p className="mt-2 shrink-0 text-[11px] text-slate-400">{note}</p>}
        </div>
      </FloatingDropdown>
    </div>
  );
}
