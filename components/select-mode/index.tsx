"use client";

/**
 * โหมดเลือก + Shift เลือกเป็นช่วง + กดค้างเข้าโหมด — ของกลาง (เจ้าของเลือก widget 2026-11-23)
 * ⚠️ 2026-11-23 (รอบ 2 · เจ้าของเลือก A ทุกตาราง): ไม่มีปุ่ม "เลือก" แล้ว — ติ๊กช่องแรก = เข้าโหมดเอง · ล้างหมด = ออกเอง
 *    (โหมด = "มีรายการที่ติ๊กอยู่" ไม่ใช่สวิตช์แยก)
 * ใช้ในตารางกลาง MiniTable และ DataTable → ทุกหน้าที่มีช่องติ๊กได้เหมือนกัน ไม่ต้องทำเองทีละหน้า
 *
 *   const sm = useSelectMode({ order: keysOnScreen, selected, onChange: setSelected });
 *   แถว/การ์ด:  onClick={(e) => sm.mode ? sm.pick(key, e) : openDetail()}  {...sm.pressProps(key)}
 *   ช่องติ๊ก:   onClick={(e) => { e.stopPropagation(); sm.pick(key, e); }}
 *   มีโหมด (ติ๊กอยู่ ≥ 1) = <SelectModeBar … />
 *
 * - Shift + กด = เลือกทั้งช่วงจากตัวที่กดล่าสุด (ตัวตั้งต้นไม่ได้ติ๊ก = เอาออกทั้งช่วง) — กฎ pure ที่ lib/range-select
 * - โหมดเลือก (ติ๊กอยู่ ≥ 1): กดตรงไหนของแถว/การ์ดก็ติ๊ก (แทนการเปิดรายละเอียด) · Ctrl+A = เลือกทั้งหมดที่เห็น
 *   ออก = กด "ล้าง" หรือเอาติ๊กออกจนหมด (ไม่ผูก Esc — กันกดพลาดแล้วชุดที่ติ๊กไว้หาย)
 * - มือถือ/แท็บเล็ต: กดค้างที่แถว ~0.45 วิ = ติ๊กตัวนั้น (= เข้าโหมด) (เลื่อนนิ้ว = ยกเลิก ไม่ทับการเลื่อนจอ)
 * - ไม่บันทึกอะไรเอง — หน้าเจ้าของถือชุดที่เลือก
 */

import { useCallback, useEffect, useRef } from "react";
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
  // โหมด = มีรายการที่ติ๊กอยู่ (ไม่มีสวิตช์แยก — เจ้าของ 2026-11-23)
  const mode = enabled && selected.size > 0;
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
  /** ออกจากโหมด = ล้างที่ติ๊ก */
  const exit = useCallback(() => live.current.onChange(new Set()), []);

  // คีย์ลัดในโหมดเลือก (ไม่แย่งตอนพิมพ์ในช่องกรอก)
  useEffect(() => {
    if (!mode || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
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

  return { mode, exit, pick, selectAll, pressProps };
}

/** แถบบอกว่าอยู่ในโหมดเลือก (ติ๊กอยู่ ≥ 1) + ปุ่มเลือกทั้งหมด / ล้าง (= ออกจากโหมด) */
export function SelectModeBar({ count, total, onAll, onClear, className = "" }: {
  count: number; total: number; onAll: () => void; onClear: () => void; className?: string;
}) {
  const t = useT();
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 ${className}`}>
      <Icon value="i:list-check" />
      <span className="min-w-[12rem] flex-1">
        {t("โหมดเลือก — กดตรงไหนของแถวก็ติ๊ก · Shift+กด = เลือกเป็นช่วง · ล้าง = ออก", "Select mode — tap a row to tick · Shift+click = range · Clear = leave")}
        {count > 0 && <b className="ml-1 font-semibold">· {t(`เลือกแล้ว ${count.toLocaleString()}`, `${count.toLocaleString()} selected`)}</b>}
      </span>
      <span className="flex items-center gap-1.5">
        <button type="button" onClick={onAll} className="h-7 rounded-md border border-blue-200 bg-white px-2.5 text-blue-700 hover:bg-blue-100">{t(`เลือกทั้งหมด (${total.toLocaleString()})`, `Select all (${total.toLocaleString()})`)}</button>
        <button type="button" onClick={onClear} className="h-7 rounded-md bg-blue-600 px-3 text-white hover:bg-blue-700">{t("ล้าง", "Clear")}</button>
      </span>
    </div>
  );
}
