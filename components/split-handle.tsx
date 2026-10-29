"use client";

/**
 * ↔ SplitHandle (ของกลาง) — เส้นแบ่งลากปรับความกว้างแผงขวา (เช่น พรีวิว) + จำความกว้างต่อคน
 *
 * ใช้: const split = useSplitWidth("website-design-preview", { min: 300, reserve: 420 });
 *      <div ref={split.containerRef} className="grid lg:grid-cols-[minmax(0,1fr)_14px_var(--pv-w)]" style={split.style("minmax(320px,40%)")}>
 *        <div>ซ้าย</div><SplitHandle split={split} /><div>ขวา</div>
 *      </div>
 *   - ลาก = เปลี่ยนสด · ปล่อย = บันทึก (lib/modal-layout-pref · ตามไปทุกเครื่อง) · ดับเบิลคลิก = ค่าเริ่ม
 *   - split.toggleMax() = กว้างสุด/คืนค่า (ปุ่ม ⇔)
 * ใช้ที่: หน้าใหญ่แก้ Section (website-section-studio) · แท็บดีไซน์เว็บ (website-theme-panel)
 */
import { useRef, useState, type CSSProperties } from "react";
import { getLayoutPref, setLayoutPref } from "@/lib/modal-layout-pref";

export const SPLIT_HANDLE_W = 14;

export interface SplitWidth {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** px ที่ผู้ใช้ตั้ง (null = ค่าเริ่ม) */
  width: number | null;
  dragging: boolean;
  isMax: boolean;
  /** style ของกล่อง grid: ตั้ง --pv-w (ค่าเริ่ม = def เช่น "minmax(320px,40%)") */
  style: (def: string) => CSSProperties;
  save: (w: number | null) => void;
  toggleMax: () => void;
  /** ใช้ภายใน SplitHandle */
  _live: (w: number) => void;
  _fit: (clientX: number) => number;
  _setDragging: (v: boolean) => void;
}

/**
 * @param prefKey คีย์จำค่า (ต่อคน)
 * @param opts.min ความกว้างแผงขวาต่ำสุด (px) · opts.reserve = พื้นที่ที่ต้องเหลือให้ฝั่งซ้าย (px · รวมเส้นแบ่ง)
 */
export function useSplitWidth(prefKey: string, opts: { min: number; reserve: number }): SplitWidth {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(() => getLayoutPref(prefKey)?.w ?? null);
  const [dragging, setDragging] = useState(false);
  const max = () => Math.max(opts.min, (containerRef.current?.clientWidth ?? 1200) - opts.reserve);
  const clamp = (w: number) => Math.round(Math.max(opts.min, Math.min(max(), w)));
  const save = (w: number | null) => {
    setWidth(w);
    setLayoutPref(prefKey, w == null ? null : { w });
  };
  const isMax = width != null && width >= max() - 4;
  return {
    containerRef,
    width,
    dragging,
    isMax,
    style: (def) => ({ ["--pv-w" as string]: width != null ? `min(${width}px, calc(100% - ${opts.reserve}px))` : def }),
    save,
    toggleMax: () => save(isMax ? null : clamp(Number.MAX_SAFE_INTEGER)),
    _live: (w) => setWidth(w),
    _fit: (clientX) => clamp((containerRef.current?.getBoundingClientRect().right ?? clientX) - clientX - SPLIT_HANDLE_W / 2),
    _setDragging: setDragging,
  };
}

/** เส้นแบ่งแนวตั้ง (ซ่อนบนจอเล็ก — ส่ง className กำหนดเองได้ เช่น "hidden xl:flex") */
export function SplitHandle({ split, className = "hidden lg:flex", label = "ปรับความกว้างพรีวิว" }: { split: SplitWidth; className?: string; label?: string }) {
  const dragRef = useRef(false); // อ่านใน pointermove ได้ทันที (state อัปเดตไม่ทันระหว่างลากเร็ว)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`ลากเพื่อ${label} · ดับเบิลคลิก = ค่าเริ่ม`}
      className={`group ${className} cursor-col-resize select-none items-center justify-center self-stretch`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ไม่มี pointer จริง (เช่น สคริปต์) — ลากต่อได้ตามเดิม */
        }
        dragRef.current = true;
        split._setDragging(true);
      }}
      onPointerMove={(e) => {
        if (dragRef.current) split._live(split._fit(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragRef.current) return;
        dragRef.current = false;
        split._setDragging(false);
        split.save(split._fit(e.clientX));
      }}
      onDoubleClick={() => split.save(null)}
    >
      <span className={`h-16 w-1 rounded-full transition-colors ${split.dragging ? "bg-blue-500" : "bg-slate-200 group-hover:bg-blue-400"}`} />
    </div>
  );
}
