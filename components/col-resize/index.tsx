"use client";

/**
 * ColResize (ของกลาง) — ลากเส้นที่หัวคอลัมน์เพื่อปรับความกว้าง สำหรับ "ตาราง/กริดที่เขียนเอง" (★ 2026-11-28 เจ้าของ: "อยากได้ที่ขยาย column ด้วย")
 *   ตารางกลาง MiniTable / DataTable / LineItemsGrid มีในตัวแล้ว — ห้ามใช้ตัวนี้ซ้อน
 *   จำต่อคน ตามไปทุกเครื่อง (useUserPref) · ดับเบิลคลิกเส้น = พอดีเนื้อหา · cw.reset() = คืนความกว้างเดิม
 *
 * ใช้:
 *   const rootRef = useRef<HTMLDivElement>(null);
 *   const cw = useColWidths("seller_bill_cols", { root: rootRef });
 *   // กริด: style={{ gridTemplateColumns: cw.track([["no", "3rem"], ["name", "1fr"], ["qty", "5rem"]]) }}
 *   // ตาราง: <col style={{ width: cw.px("qty") ?? 80 }} />
 *   // หัวคอลัมน์ (ต้องเป็น relative): <span className="relative">จำนวน<ColGrip {...cw.grip("qty")} /></span>
 *   // ช่องในแถว: data-col="qty" (ให้ดับเบิลคลิกวัดความกว้างเนื้อหาได้)
 *   // {cw.changed && <button onClick={cw.reset}>คืนความกว้างเดิม</button>}
 * ใช้ที่: components/seller-bill-panel (แถวบิลร้าน) · components/delivery-bill-panel (ตารางกล่องในใบส่งของ)
 */
import { useCallback, useRef, useState } from "react";
import { useUserPref } from "@/lib/use-user-pref";

type Widths = Record<string, number>;
const parseWidths = (raw: unknown): Widths | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Widths = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) { const n = Number(v); if (Number.isFinite(n) && n > 0) out[k] = Math.round(n); }
  return out;
};

export type ColWidths = {
  /** ความกว้างที่ผู้ใช้ตั้ง (px) · undefined = ใช้ค่าเริ่มต้นของหน้า */
  px: (key: string) => number | undefined;
  /** grid-template-columns จากรายการ [key, ค่าเริ่มต้น] — "1fr" = ยืดเต็มที่ว่าง · ถ้าคอลัมน์ 1fr ถูกตั้งเป็น px คอลัมน์สุดท้ายจะยืดแทน (แถวยังเต็ม) */
  track: (cols: [string, string][]) => string;
  /** ผลรวมความกว้าง (px) ของคอลัมน์ที่ผู้ใช้ตั้ง + ค่าเริ่มต้นที่เป็น rem — ไว้ตั้ง min-width ให้เลื่อนซ้ายขวาได้ · null = ไม่มีคอลัมน์ไหนถูกตั้ง */
  minWidth: (cols: [string, string][], remPx?: number) => number | null;
  grip: (key: string) => { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void; onDoubleClick: () => void };
  changed: boolean;
  reset: () => void;
};

export function useColWidths(prefKey: string, opts: { min?: number; max?: number; root?: React.RefObject<HTMLElement | null> } = {}): ColWidths {
  const min = opts.min ?? 40, max = opts.max ?? 720;
  const [saved, setSaved] = useUserPref<Widths>(prefKey, {}, parseWidths);
  const [drag, setDrag] = useState<{ key: string; w: number } | null>(null);
  const savedRef = useRef(saved); savedRef.current = saved;
  const widths: Widths = drag ? { ...saved, [drag.key]: drag.w } : saved;
  const clamp = useCallback((w: number) => Math.max(min, Math.min(max, Math.round(w))), [min, max]);

  const start = (key: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const cell = e.currentTarget.parentElement as HTMLElement | null;
    if (!cell) return;
    const zoom = cell.offsetWidth ? cell.getBoundingClientRect().width / cell.offsetWidth || 1 : 1;   // หน้าที่ซูม (CSS zoom) → แปลงระยะเมาส์เป็น px จริง
    const startX = e.clientX, startW = cell.offsetWidth || cell.getBoundingClientRect().width;
    let last = startW;
    const move = (ev: PointerEvent) => { last = clamp(startW + (ev.clientX - startX) / zoom); setDrag({ key, w: last }); };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      setDrag(null);
      if (Math.abs(last - startW) >= 2) setSaved({ ...savedRef.current, [key]: clamp(last) });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };

  /** พอดีเนื้อหา: วัดทุกช่อง data-col=key (หัว + แถว) แบบ max-content */
  const fit = (key: string) => {
    const root = opts.root?.current ?? document.body;
    const sel = `[data-col="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key}"]`;
    let w = 0;
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const prev = el.style.width;
      el.style.width = "max-content";
      w = Math.max(w, el.offsetWidth);
      el.style.width = prev;
    });
    if (w > 0) setSaved({ ...savedRef.current, [key]: clamp(w + 12) });
  };

  const px = (key: string) => widths[key];
  const track = (cols: [string, string][]) => {
    const flexTaken = cols.some(([k, d]) => d === "1fr" && widths[k] != null);
    return cols.map(([k, d], i) => {
      if (widths[k] != null) return `${widths[k]}px`;
      if (d === "1fr") return "minmax(0,1fr)";
      if (flexTaken && i === cols.length - 1) return `minmax(${d},1fr)`;
      return d;
    }).join(" ");
  };
  const minWidth = (cols: [string, string][], remPx = 16) => {
    if (!cols.some(([k]) => widths[k] != null)) return null;
    return cols.reduce((a, [k, d]) => a + (widths[k] ?? (d.endsWith("rem") ? parseFloat(d) * remPx : d.endsWith("px") ? parseFloat(d) : 120)), 0);
  };
  return {
    px, track, minWidth,
    grip: (key) => ({ onPointerDown: start(key), onDoubleClick: () => fit(key) }),
    changed: Object.keys(saved).length > 0,
    reset: () => setSaved({}),
  };
}

/** เส้นลากที่ขอบขวาของหัวคอลัมน์ (หัวคอลัมน์ต้องเป็น relative) */
export function ColGrip({ onPointerDown, onDoubleClick, className = "" }: { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void; onDoubleClick: () => void; className?: string }) {
  return (
    <span role="separator" aria-orientation="vertical" aria-label="ปรับความกว้างคอลัมน์" title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = พอดีเนื้อหา"
      onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClick={(e) => e.stopPropagation()}
      className={`group/cg absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none select-none justify-center ${className}`}>
      <span className="h-full w-px bg-slate-300/80 transition-colors group-hover/cg:w-0.5 group-hover/cg:bg-sky-500" />
    </span>
  );
}
