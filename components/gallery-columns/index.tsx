"use client";

/**
 * Gallery Columns (ของกลาง) — ตัวเลือก "จำนวนการ์ดต่อแถว" สำหรับมุมมองกริด/แกลเลอรีทุกหน้า
 *   จำค่ารายคนผ่าน /api/user-prefs (key = gallery_cols_<scope>) — ตั้งครั้งเดียวจำไว้ตลอด
 *
 * ใช้:
 *   const { cols, setCols, gridStyle } = useGalleryColumns("design-dashboard", 6);
 *   <GalleryColumnsControl cols={cols} onChange={setCols} />
 *   <div style={gridStyle}> ...การ์ด... </div>
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api";

export const GALLERY_COL_OPTIONS = [3, 4, 5, 6, 8] as const;
export type GalleryCols = (typeof GALLERY_COL_OPTIONS)[number];

const isValidCols = (n: unknown): n is GalleryCols =>
  typeof n === "number" && (GALLERY_COL_OPTIONS as readonly number[]).includes(n);

/** อ่าน/ตั้งจำนวนการ์ดต่อแถว + คืน gridStyle พร้อมใช้ (จำค่ารายคน) */
export function useGalleryColumns(scopeKey: string, initial: GalleryCols = 6, gap = "0.75rem") {
  const [cols, setColsState] = useState<GalleryCols>(initial);
  const prefKey = `gallery_cols_${scopeKey}`;
  useEffect(() => {
    apiFetch(`/api/user-prefs?key=${encodeURIComponent(prefKey)}`).then((r) => r.json())
      .then((j) => { const v = Number(j?.value); if (isValidCols(v)) setColsState(v); })
      .catch(() => {});
  }, [prefKey]);
  const setCols = (n: GalleryCols) => {
    setColsState(n);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prefKey, value: n }) }).catch(() => {});
  };
  const gridStyle = useMemo<CSSProperties>(() => ({
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  }), [cols, gap]);
  return { cols, setCols, gridStyle };
}

/** ปุ่มเลือกจำนวนการ์ดต่อแถว (segmented) — เสียบข้างแถบเครื่องมือของหน้ากริดใดก็ได้ */
export function GalleryColumnsControl({ cols, onChange, options = GALLERY_COL_OPTIONS, className = "" }: {
  cols: number; onChange: (n: GalleryCols) => void; options?: readonly GalleryCols[]; className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 ${className}`} title="จำนวนการ์ดต่อแถว">
      <span className="px-1 text-[13px] leading-none text-slate-400" aria-hidden>▦</span>
      {options.map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} การ์ดต่อแถว`} aria-pressed={cols === n}
          className={`h-7 w-7 rounded text-xs font-medium transition ${cols === n ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{n}</button>
      ))}
    </div>
  );
}
