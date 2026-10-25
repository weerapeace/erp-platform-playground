"use client";

/**
 * เลือกคอลัมน์ของ MiniTable — จำต่อคน ตามไปทุกเครื่อง (useUserPref) · ของกลาง
 * --------------------------------------------------------------------------
 *   const cols = useColumnPrefs("wb_table_cols_pc", allColumns);
 *   <MiniTable columns={cols.visible} actions={<ColumnChooser state={cols} />} ... />
 *
 * ตั้งที่คอลัมน์ (MiniColumn):
 *   locked        = ซ่อนไม่ได้ (เช่น รูป / ชื่อ)
 *   defaultHidden = ซ่อนไว้ก่อน ผู้ใช้เปิดเองได้
 *   group         = หมวดในเมนู (ไม่ใส่ = "อื่น ๆ")
 *   label         = ชื่อในเมนู (ไม่ใส่ = header ถ้าเป็นข้อความ)
 *   isNew         = ป้าย "ใหม่"
 *
 * เก็บเฉพาะ "ส่วนที่ผู้ใช้เปลี่ยนจากค่าเริ่มต้น" (on/off) → เพิ่มคอลัมน์ทีหลัง คนที่เคยตั้งไว้แล้วก็ได้ค่าเริ่มต้นของคอลัมน์ใหม่
 * อยากจำแยกตามอุปกรณ์/โหมด = ส่ง prefKey คนละตัว (เช่น ..._pc / ..._ipad)
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import { FloatingDropdown } from "@/components/floating-dropdown";
import type { MiniColumn } from "./index";

type Prefs = { on: string[]; off: string[] };
const EMPTY: Prefs = { on: [], off: [] };
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const parsePrefs = (v: unknown): Prefs | null => (v && typeof v === "object" ? { on: strs((v as Prefs).on), off: strs((v as Prefs).off) } : null);

export type ColumnPrefsState<T> = {
  all: MiniColumn<T>[];
  visible: MiniColumn<T>[];
  isOn: (key: string) => boolean;
  toggle: (key: string) => void;
  reset: () => void;
  /** ผู้ใช้ปรับไปจากค่าเริ่มต้นแล้วหรือยัง */
  customized: boolean;
};

export function useColumnPrefs<T>(prefKey: string, columns: MiniColumn<T>[]): ColumnPrefsState<T> {
  const [prefs, setPrefs] = useUserPref<Prefs>(prefKey, EMPTY, parsePrefs);
  const onOf = useCallback((c: MiniColumn<T>) => (c.locked ? true : prefs.on.includes(c.key) ? true : prefs.off.includes(c.key) ? false : !c.defaultHidden), [prefs]);
  const visible = useMemo(() => columns.filter(onOf), [columns, onOf]);
  const isOn = useCallback((key: string) => { const c = columns.find((x) => x.key === key); return c ? onOf(c) : false; }, [columns, onOf]);
  const toggle = useCallback((key: string) => {
    const c = columns.find((x) => x.key === key);
    if (!c || c.locked) return;
    const next = !onOf(c);
    const on = prefs.on.filter((k) => k !== key), off = prefs.off.filter((k) => k !== key);
    if (next !== !c.defaultHidden) (next ? on : off).push(key);   // ตรงกับค่าเริ่มต้น = ไม่ต้องจำ
    setPrefs({ on, off });
  }, [columns, onOf, prefs, setPrefs]);
  const reset = useCallback(() => setPrefs(EMPTY), [setPrefs]);
  const customized = columns.some((c) => !c.locked && (prefs.on.includes(c.key) || prefs.off.includes(c.key)));
  return { all: columns, visible, isOn, toggle, reset, customized };
}

const labelOf = <T,>(c: MiniColumn<T>) => c.label ?? (typeof c.header === "string" ? c.header : c.key);

/** ปุ่ม "▥ คอลัมน์ n/ทั้งหมด" + เมนูติ๊กเปิด/ปิด แบ่งหมวด */
export function ColumnChooser<T>({ state, note, className = "" }: { state: ColumnPrefsState<T>; note?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const m = new Map<string, MiniColumn<T>[]>();
    for (const c of state.all) { const g = c.group ?? "อื่น ๆ"; (m.get(g) ?? m.set(g, []).get(g)!).push(c); }
    return [...m.entries()];
  }, [state.all]);
  return (
    <div ref={anchor} className={`inline-block ${className}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="เลือกคอลัมน์ที่จะโชว์ (จำไว้ให้คุณ)"
        className={`h-8 px-3 text-sm rounded-lg border ${open || state.customized ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        ▥ คอลัมน์ {state.visible.length}/{state.all.length}
      </button>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={320} maxWidth={560}>
        <div className="rounded-xl border border-slate-200 bg-white shadow-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-semibold text-slate-700">เลือกคอลัมน์</span>
            <button type="button" onClick={state.reset} disabled={!state.customized}
              className="h-7 px-2 text-xs rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">คืนค่าเริ่มต้น</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {groups.map(([g, cols]) => (
              <div key={g}>
                <div className="text-[11px] font-medium text-slate-400 mb-1">{g}</div>
                {cols.map((c) => (
                  <label key={c.key} className={`flex items-center gap-2 py-1 text-[13px] ${c.locked ? "text-slate-400" : "text-slate-700 cursor-pointer"}`}>
                    <input type="checkbox" checked={state.isOn(c.key)} disabled={c.locked} onChange={() => state.toggle(c.key)} className="w-4 h-4 accent-blue-600" />
                    <span className="truncate">{labelOf(c)}</span>
                    {c.locked && <span className="text-[10px]" title="คอลัมน์หลัก ซ่อนไม่ได้">🔒</span>}
                    {c.isNew && <span className="text-[10px] px-1.5 rounded-full bg-blue-50 text-blue-700">ใหม่</span>}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {note && <p className="mt-2 text-[11px] text-slate-400">{note}</p>}
        </div>
      </FloatingDropdown>
    </div>
  );
}
