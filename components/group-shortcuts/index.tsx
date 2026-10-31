"use client";

/**
 * 🧭 GroupShortcuts — ของกลาง: ปุ่มทางลัด "จัดกลุ่ม" ที่ผู้ใช้เลือกเองว่าจะเอาแบบไหนขึ้นเป็นปุ่ม (เจ้าของขอ 2026-10-31)
 *   กดปุ่ม = จัดกลุ่มแบบนั้นทันที · กดซ้ำ = เลิกจัดกลุ่ม · ปุ่ม ⚙ = ติ๊กว่าแบบไหนขึ้นเป็นปุ่ม + ลูกศรเรียงลำดับ
 *   แบบที่ไม่ได้ติ๊ก ยังเลือกได้จากเมนูจัดกลุ่มของหน้า (ตัวนี้ไม่แทนเมนู) · หน้าเป็นคนเก็บ pinned (เช่น useUserPref = จำต่อคน)
 *
 *   <GroupShortcuts options={[{ k: "parent", label: "สินค้าแม่", icon: "dna" }]} pinned={pins} onPinnedChange={setPins} active={group} onPick={setGroup} />
 */
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { FloatingDropdown } from "@/components/floating-dropdown";

export type GroupShortcutOption = { k: string; label: string; icon?: string; title?: string };

export function GroupShortcuts({ options, pinned, onPinnedChange, active, onPick, tabLabel, touch = false }: {
  options: GroupShortcutOption[];
  /** แบบที่ขึ้นเป็นปุ่ม (เรียงตามนี้) */
  pinned: string[];
  onPinnedChange: (next: string[]) => void;
  /** แบบที่จัดกลุ่มอยู่ตอนนี้ ("none" / ว่าง = ไม่จัดกลุ่ม) */
  active: string;
  /** กดปุ่ม → แบบนั้น · กดซ้ำ → "none" */
  onPick: (k: string) => void;
  /** ชื่อแท็บในหัวแผงตั้งค่า เช่น "แท็บรอจ่าย" */
  tabLabel?: string;
  touch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const known = pinned.filter((k) => options.some((o) => o.k === k));
  const order = [...known, ...options.map((o) => o.k).filter((k) => !known.includes(k))];
  const opt = (k: string) => options.find((o) => o.k === k)!;
  const move = (k: string, d: -1 | 1) => {
    const i = known.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= known.length) return;
    const next = [...known]; [next[i], next[j]] = [next[j], next[i]];
    onPinnedChange(next);
  };
  const h = touch ? "h-11" : "h-8";
  return (
    <>
      {known.map((k) => {
        const o = opt(k), on = active === k;
        return (
          <button key={k} type="button" onClick={() => onPick(on ? "none" : k)} title={o.title ?? (on ? "กดอีกครั้ง = เลิกจัดกลุ่ม" : `จัดกลุ่มตาม${o.label}`)}
            className={`inline-flex ${h} items-center gap-1 rounded-lg border px-3 text-sm ${on ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {o.icon && <Icon name={o.icon} />} {o.label}{on ? " ✓" : ""}
          </button>
        );
      })}
      <span ref={anchor} className="inline-flex">
        <button type="button" onClick={() => setOpen((v) => !v)} title="ปรับทางลัดจัดกลุ่ม (เลือกว่าแบบไหนขึ้นเป็นปุ่ม)"
          className={`inline-flex ${h} w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50`}><Icon name="sliders" /></button>
      </span>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={300} maxWidth={360}>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="text-[13px] font-medium text-slate-800">ปรับทางลัดจัดกลุ่ม{tabLabel ? ` · ${tabLabel}` : ""}</div>
          <div className="mb-2 text-[11px] text-slate-500">ติ๊ก = ขึ้นเป็นปุ่ม · ลูกศร = เรียงลำดับ · ที่ไม่ติ๊กยังเลือกได้จากเมนูจัดกลุ่ม</div>
          <div className="divide-y divide-slate-100">
            {order.map((k) => {
              const o = opt(k), on = known.includes(k), i = known.indexOf(k);
              return (
                <div key={k} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={on} onChange={() => onPinnedChange(on ? known.filter((x) => x !== k) : [...known, k])} className="h-4 w-4 accent-amber-600" />
                    {o.icon && <Icon name={o.icon} />} จัดกลุ่มตาม{o.label}
                  </label>
                  {on && (
                    <span className="flex gap-1">
                      <button type="button" disabled={i === 0} onClick={() => move(k, -1)} aria-label="เลื่อนขึ้น" className="h-6 w-6 rounded border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-30">↑</button>
                      <button type="button" disabled={i === known.length - 1} onClick={() => move(k, 1)} aria-label="เลื่อนลง" className="h-6 w-6 rounded border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-30">↓</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-slate-400">จำต่อคน (ตามไปทุกเครื่อง)</div>
        </div>
      </FloatingDropdown>
    </>
  );
}
