"use client";

/**
 * โหมดเลือก + Shift เลือกเป็นช่วง + กดค้างเข้าโหมด — ของกลาง (เจ้าของเลือก widget 2026-11-23)
 * ใช้ในตารางกลาง MiniTable และ DataTable → ทุกหน้าที่มีช่องติ๊กได้เหมือนกัน ไม่ต้องทำเองทีละหน้า
 *
 *   const sm = useSelectMode({ order: keysOnScreen, selected, onChange: setSelected });
 *   แถว/การ์ด:  onClick={(e) => sm.mode ? sm.pick(key, e) : openDetail()}  {...sm.pressProps(key)}
 *   ช่องติ๊ก:   onClick={(e) => { e.stopPropagation(); sm.pick(key, e); }}
 *   แถบเครื่องมือ: <SelectModeButton mode={sm.mode} onToggle={sm.toggle} /> · มีโหมด = <SelectModeBar … />
 *
 * - Shift + กด = เลือกทั้งช่วงจากตัวที่กดล่าสุด (ตัวตั้งต้นไม่ได้ติ๊ก = เอาออกทั้งช่วง) — กฎ pure ที่ lib/range-select
 * - โหมดเลือก: กดตรงไหนของแถว/การ์ดก็ติ๊ก (แทนการเปิดรายละเอียด) · Esc = ออก · Ctrl+A = เลือกทั้งหมดที่เห็น
 * - มือถือ/แท็บเล็ต: กดค้างที่แถว ~0.45 วิ = เข้าโหมด + ติ๊กตัวนั้น (เลื่อนนิ้ว = ยกเลิก ไม่ทับการเลื่อนจอ)
 * - ออกจากโหมดไม่ล้างที่เลือก (แถบด้านล่างยังทำงานต่อได้) · ไม่บันทึกอะไรเอง — หน้าเจ้าของถือชุดที่เลือก
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { clickSelect, selectAllVisible } from "@/lib/range-select";
import { shortcutKey } from "@/lib/shortcut-key";

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

type Order = readonly string[] | (() => readonly string[]);

export function useSelectMode({ order, selected, onChange, enabled = true }: {
  /** ลำดับรายการที่เห็นบนจอ (หรือฟังก์ชันคืนลำดับ — ตารางที่รู้ลำดับตอนวาดเท่านั้น) */
  order: Order;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** ตารางที่ไม่มีช่องติ๊ก = ปิด (ไม่ฟังคีย์ ไม่กดค้าง) */
  enabled?: boolean;
}) {
  const [mode, setMode] = useState(false);
  const anchor = useRef<string | null>(null);
  const press = useRef<{ key: string; timer: number; x: number; y: number } | null>(null);
  const fired = useRef<{ key: string; at: number } | null>(null);   // กดค้างสำเร็จ → กลืนคลิกที่ตามมาตอนยกนิ้ว
  const live = useRef({ order, selected, onChange });
  live.current = { order, selected, onChange };
  const keys = () => { const o = live.current.order; return typeof o === "function" ? o() : o; };

  const pick = useCallback((key: string, e?: { shiftKey?: boolean }) => {
    const f = fired.current;
    if (f && f.key === key && Date.now() - f.at < 800) { fired.current = null; return; }
    const { selected: cur, onChange: set } = live.current;
    set(clickSelect(keys(), cur, key, { shift: !!e?.shiftKey, anchor: anchor.current }));
    anchor.current = key;
  }, []);
  const selectAll = useCallback(() => live.current.onChange(selectAllVisible(keys(), live.current.selected)), []);
  const toggle = useCallback(() => setMode((m) => !m), []);
  const exit = useCallback(() => setMode(false), []);

  // คีย์ลัดในโหมดเลือก (ไม่แย่งตอนพิมพ์ในช่องกรอก)
  useEffect(() => {
    if (!mode || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "Escape") { setMode(false); return; }
      if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "a") { e.preventDefault(); selectAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, enabled, selectAll]);

  const cancelPress = () => { if (press.current) { window.clearTimeout(press.current.timer); press.current = null; } };
  useEffect(() => cancelPress, []);

  /** ใส่ที่แถว/การ์ด — กดค้างด้วยนิ้ว = เข้าโหมดเลือก + ติ๊กตัวนั้น · Shift+กด ไม่ลากคลุมข้อความ */
  const pressProps = (key: string) => (!enabled ? {} : {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" || mode) return;
      cancelPress();
      const timer = window.setTimeout(() => {
        press.current = null;
        fired.current = { key, at: Date.now() };
        anchor.current = key;
        setMode(true);
        const next = new Set(live.current.selected); next.add(key);
        live.current.onChange(next);
        try { navigator.vibrate?.(15); } catch { /* บางเครื่องไม่มี */ }
      }, LONG_PRESS_MS);
      press.current = { key, timer, x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && (Math.abs(e.clientX - p.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - p.y) > MOVE_CANCEL_PX)) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    onContextMenu: (e: React.MouseEvent) => { if (fired.current?.key === key) e.preventDefault(); },
    onMouseDown: (e: React.MouseEvent) => { if (e.shiftKey) e.preventDefault(); },
  });

  return { mode, setMode, toggle, exit, pick, selectAll, pressProps };
}

/** ปุ่ม "เลือก" / "เสร็จ" ในแถบเครื่องมือของตาราง */
export function SelectModeButton({ mode, onToggle, className = "" }: { mode: boolean; onToggle: () => void; className?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={onToggle} aria-pressed={mode}
      title={mode ? t("ออกจากโหมดเลือก (Esc)", "Leave select mode (Esc)") : t("โหมดเลือก — กดทั้งแถว/การ์ดเพื่อติ๊ก · Shift+กด = เลือกเป็นช่วง", "Select mode — tap a row to tick · Shift+click = range")}
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm ${mode ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"} ${className}`}>
      <Icon value={mode ? "i:check" : "i:list-check"} />{mode ? t("เสร็จ", "Done") : t("เลือก", "Select")}
    </button>
  );
}

/** แถบบอกว่าอยู่ในโหมดเลือก + ปุ่มเลือกทั้งหมด / ล้าง / เสร็จ */
export function SelectModeBar({ count, total, onAll, onClear, onDone, className = "" }: {
  count: number; total: number; onAll: () => void; onClear: () => void; onDone: () => void; className?: string;
}) {
  const t = useT();
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 ${className}`}>
      <Icon value="i:list-check" />
      <span className="min-w-[12rem] flex-1">
        {t("โหมดเลือก — กดตรงไหนของแถวก็ติ๊ก · Shift+กด = เลือกเป็นช่วง · Esc = ออก", "Select mode — tap a row to tick · Shift+click = range · Esc = leave")}
        {count > 0 && <b className="ml-1 font-semibold">· {t(`เลือกแล้ว ${count.toLocaleString()}`, `${count.toLocaleString()} selected`)}</b>}
      </span>
      <span className="flex items-center gap-1.5">
        <button type="button" onClick={onAll} className="h-7 rounded-md border border-blue-200 bg-white px-2.5 text-blue-700 hover:bg-blue-100">{t(`เลือกทั้งหมด (${total.toLocaleString()})`, `Select all (${total.toLocaleString()})`)}</button>
        {count > 0 && <button type="button" onClick={onClear} className="h-7 rounded-md border border-blue-200 bg-white px-2.5 text-blue-700 hover:bg-blue-100">{t("ล้าง", "Clear")}</button>}
        <button type="button" onClick={onDone} className="h-7 rounded-md bg-blue-600 px-3 text-white hover:bg-blue-700">{t("เสร็จ", "Done")}</button>
      </span>
    </div>
  );
}
