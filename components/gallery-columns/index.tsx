"use client";

/**
 * Gallery Columns (ของกลาง) — ตัวเลือก "จำนวนการ์ดต่อแถว" สำหรับมุมมองกริด/แกลเลอรีทุกหน้า
 *   จำค่ารายคนผ่าน /api/user-prefs (key = gallery_cols_<scope>) — ตั้งครั้งเดียวจำไว้ตลอด
 *
 * ใช้:
 *   const { cols, setCols, gridStyle } = useGalleryColumns("design-dashboard", 6);
 *   <GalleryColumnsControl cols={cols} onChange={setCols} />
 *   <div style={gridStyle}> ...การ์ด... </div>
 *
 * Ctrl (⌘) + หมุนลูกกลิ้งบนกริด = ย่อ/ขยายการ์ด (เจ้าของสั่ง 2026-11-15 หน้า SAMPLE Images) — เปิดเฉพาะหน้าที่ขอ:
 *   const { cols, setCols, gridStyle, wheelRef } = useGalleryColumns("sample-albums", 3, "0.75rem", { options: GALLERY_COL_CHOICES, ctrlWheel: true });
 *   <div ref={wheelRef} style={gridStyle}> … </div>
 *   หมุนลง = การ์ดเล็กลง (ต่อแถวมากขึ้น) · หมุนขึ้น = ใหญ่ขึ้น · ไม่ซูมทั้งหน้าเว็บเมื่อชี้อยู่บนกริด · นอกกริดซูมหน้าเว็บได้ตามปกติ
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { stepGalleryCols } from "@/lib/gallery-cols";

/** ตัวเลือกมาตรฐาน (ทุกหน้าที่ใช้อยู่เดิม) */
export const GALLERY_COL_OPTIONS = [3, 4, 5, 6, 8] as const;
/** ตัวเลือกทั้งหมดที่รองรับ — มี 2 ต่อแถว ไว้สำหรับการ์ดใหญ่ (เช่น การ์ดอัลบั้ม) */
export const GALLERY_COL_CHOICES = [2, 3, 4, 5, 6, 8] as const;
export type GalleryCols = (typeof GALLERY_COL_CHOICES)[number];

const isValidCols = (n: unknown, options: readonly number[]): n is GalleryCols =>
  typeof n === "number" && options.includes(n);

/** อ่าน/ตั้งจำนวนการ์ดต่อแถว + คืน gridStyle พร้อมใช้ (จำค่ารายคน) */
export function useGalleryColumns(scopeKey: string, initial: GalleryCols = 6, gap = "0.75rem",
  opts?: { options?: readonly GalleryCols[]; ctrlWheel?: boolean }) {
  const options = opts?.options ?? GALLERY_COL_OPTIONS;
  const [cols, setColsState] = useState<GalleryCols>(initial);
  const prefKey = `gallery_cols_${scopeKey}`;
  useEffect(() => {
    apiFetch(`/api/user-prefs?key=${encodeURIComponent(prefKey)}`).then((r) => r.json())
      .then((j) => { const v = Number(j?.value); if (isValidCols(v, options)) setColsState(v); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey]);
  // บันทึกค่าหลังหยุดเปลี่ยนครู่หนึ่ง — หมุนลูกกลิ้งรัว ๆ ไม่ยิงบันทึกทุกขั้น
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setCols = useCallback((n: GalleryCols) => {
    setColsState(n);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prefKey, value: n }) }).catch(() => {});
    }, 400);
  }, [prefKey]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const gridStyle = useMemo<CSSProperties>(() => ({
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  }), [cols, gap]);

  // Ctrl (⌘) + ลูกกลิ้ง — ฟังที่ตัวกริดเอง (passive:false เพื่อกันเบราว์เซอร์ซูมทั้งหน้า)
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const detach = useRef<(() => void) | null>(null);
  const ctrlWheel = !!opts?.ctrlWheel;
  const optionsKey = options.join(",");
  const wheelRef = useCallback((el: HTMLElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el || !ctrlWheel) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.deltaY) return;
      e.preventDefault();
      const now = Date.now();
      if (now - last < 140) return;   // ทัชแพด (บีบนิ้ว) ส่งมาถี่มาก — ขั้นละครั้ง
      last = now;
      const next = stepGalleryCols(colsRef.current, e.deltaY > 0 ? 1 : -1, options) as GalleryCols;
      if (next !== colsRef.current) setCols(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    detach.current = () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrlWheel, optionsKey, setCols]);

  return { cols, setCols, gridStyle, wheelRef };
}

/** ปุ่มเลือกจำนวนการ์ดต่อแถว (segmented · หรือ as="select" = dropdown กะทัดรัด) — เสียบข้างแถบเครื่องมือของหน้ากริดใดก็ได้
 *  wheelHint = บอกในป้ายชี้ว่า Ctrl + ลูกกลิ้งบนกริดใช้ได้ (ใส่เมื่อเปิด ctrlWheel) */
export function GalleryColumnsControl({ cols, onChange, options = GALLERY_COL_OPTIONS, className = "", as = "buttons", wheelHint = false }: {
  cols: number; onChange: (n: GalleryCols) => void; options?: readonly GalleryCols[]; className?: string; as?: "buttons" | "select"; wheelHint?: boolean;
}) {
  const t = useT();
  const title = wheelHint
    ? t("จำนวนการ์ดต่อแถว · Ctrl + หมุนลูกกลิ้งบนตาราง = ย่อ/ขยาย", "Cards per row · Ctrl + scroll on the grid to resize")
    : t("จำนวนการ์ดต่อแถว", "Cards per row");
  if (as === "select") {
    return (
      <label className={`inline-flex items-center gap-1.5 text-xs text-slate-500 ${className}`} title={title}>
        <span aria-hidden>▦</span>
        <select value={cols} onChange={(e) => onChange(Number(e.target.value) as GalleryCols)} className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-700">
          {options.map((n) => <option key={n} value={n}>{t(`${n} ต่อแถว`, `${n} per row`)}</option>)}
        </select>
      </label>
    );
  }
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 ${className}`} title={title}>
      <span className="px-1 text-[13px] leading-none text-slate-400" aria-hidden>▦</span>
      {options.map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={t(`${n} การ์ดต่อแถว`, `${n} cards per row`)} aria-pressed={cols === n}
          className={`h-7 w-7 rounded text-xs font-medium transition ${cols === n ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{n}</button>
      ))}
    </div>
  );
}
