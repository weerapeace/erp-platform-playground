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
 *
 * สูงสุด 16 ใบต่อแถว (เจ้าของสั่ง 2026-11-17):
 *   - ctrlWheel เปิดเป็นค่าเริ่มต้นแล้ว (ผูก wheelRef ที่กริด · ปิดได้ด้วย { ctrlWheel: false })
 *   - gridStyle = "สูงสุด cols ใบ" — จอ/กล่องแคบจนการ์ดเล็กกว่า 70px ลดจำนวนต่อแถวเอง
 *     หน้าที่ทำกริดเองด้วย CSS var ให้ใช้ galleryTemplate(cols, gap) แทน repeat(cols, …)
 *   - {...compactAttr} ที่กริด + className={GALLERY_LABEL} ที่ชื่อ/ป้ายใต้การ์ด = 12 ใบขึ้นไปซ่อนเอง (ใส่ title ที่การ์ดไว้ให้ชี้ดูชื่อ)
 *   - thumbW(base) = ความกว้างรูปย่อที่ควรขอ (การ์ดเล็ก = รูปเล็ก โหลดเร็ว)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { galleryTemplate, galleryThumbWidth, isCompactGallery, stepGalleryCols } from "@/lib/gallery-cols";
import { GALLERY_COL_CHOICES, GALLERY_COL_OPTIONS, type GalleryCols } from "./options";

export { GALLERY_COL_CHOICES, GALLERY_COL_OPTIONS, type GalleryCols };
export { galleryTemplate, galleryThumbWidth, isCompactGallery };
/** ใส่ที่ชื่อ/ป้ายใต้การ์ด — กริดที่มี compactAttr (12 ใบขึ้นไป) จะซ่อนให้เอง (CSS ใน app/globals.css) */
export const GALLERY_LABEL = "gallery-label";

const isValidCols = (n: unknown, options: readonly number[]): n is GalleryCols =>
  typeof n === "number" && options.includes(n);

/** อ่าน/ตั้งจำนวนการ์ดต่อแถว + คืน gridStyle พร้อมใช้ (จำค่ารายคน) */
export function useGalleryColumns(scopeKey: string, initial: GalleryCols = 6, gap = "0.75rem",
  opts?: { options?: readonly GalleryCols[]; ctrlWheel?: boolean; enabled?: boolean; legacyKey?: string }) {
  const options = opts?.options ?? GALLERY_COL_OPTIONS;
  const [cols, setColsState] = useState<GalleryCols>(initial);
  const prefKey = `gallery_cols_${scopeKey}`;
  // enabled=false = ยังไม่โหลดค่าที่จำไว้ (เช่น ป๊อปอัปที่ฝังอยู่ในหน้าแต่ยังปิด) — กันยิงคำขอฟรีทุกหน้า
  const enabled = opts?.enabled ?? true;
  const loadedKey = useRef("");
  useEffect(() => {
    if (!enabled || loadedKey.current === prefKey) return;
    loadedKey.current = prefKey;
    apiFetch(`/api/user-prefs?key=${encodeURIComponent(prefKey)}`).then((r) => r.json())
      .then((j) => {
        const v = Number(j?.value);
        if (isValidCols(v, options)) { setColsState(v); return; }
        // ยังไม่เคยจำกับบัญชี → ยกค่าเดิมที่หน้าเคยจำไว้ในเครื่อง (localStorage legacyKey) มาครั้งแรก แล้วจำกับบัญชีต่อ
        const lk = opts?.legacyKey;
        if (!lk || typeof window === "undefined") return;
        let old = NaN;
        try { old = Number(window.localStorage.getItem(lk)); } catch { /* ignore */ }
        if (!(old > 0)) return;
        const near = options.reduce((b, n) => (Math.abs(n - old) < Math.abs(b - old) ? n : b), options[0]);
        setColsState(near);
        void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prefKey, value: near }) }).catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey, enabled]);
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
    gridTemplateColumns: galleryTemplate(cols, gap),
  }), [cols, gap]);
  const compact = isCompactGallery(cols);
  /** ใส่ที่กริด: {...compactAttr} — 12 ใบขึ้นไปซ่อนชื่อที่ติด GALLERY_LABEL */
  const compactAttr = useMemo(() => (compact ? { "data-gallery-compact": "" } : {}) as Record<string, string>, [compact]);
  const thumbW = useCallback((base = 480) => galleryThumbWidth(cols, base), [cols]);

  // Ctrl (⌘) + ลูกกลิ้ง — ฟังที่ตัวกริดเอง (passive:false เพื่อกันเบราว์เซอร์ซูมทั้งหน้า)
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const wheelRef = useCtrlWheel((dir) => {
    const next = stepGalleryCols(colsRef.current, dir, options) as GalleryCols;
    if (next !== colsRef.current) setCols(next);
  }, opts?.ctrlWheel ?? true);

  return { cols, setCols, gridStyle, wheelRef, compact, compactAttr, thumbW, options };
}

/**
 * ตัวจับ Ctrl (⌘) + ลูกกลิ้ง (ของกลาง) — ใช้เมื่อหน้าเก็บ "จำนวนต่อแถว/ขนาด" เองที่อื่น (เช่น ธีมบอร์ดงาน /tasks)
 *   const wheelRef = useCtrlWheel((dir) => …);   // dir 1 = หมุนลง (ย่อ = เห็นมากขึ้น) · -1 = หมุนขึ้น (ขยาย)
 *   <div ref={wheelRef}>…</div>
 * ฟังที่กล่องเอง passive:false กันเบราว์เซอร์ซูมทั้งหน้า · ทัชแพดบีบนิ้วส่งถี่ → ขั้นละครั้งทุก 140ms
 * ถ้าหน้าใช้ useGalleryColumns อยู่แล้ว ใช้ wheelRef ของตัวนั้น ไม่ต้องเรียกตัวนี้ซ้ำ
 */
export function useCtrlWheel(onStep: (dir: 1 | -1) => void, enabled = true) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const detach = useRef<(() => void) | null>(null);
  useEffect(() => () => detach.current?.(), []);
  return useCallback((el: HTMLElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el || !enabled) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      // กริดซ้อนกัน (เช่น กริดของกลางอยู่ในพื้นที่การ์ดของหน้า) → ตัวในสุดรับไปแล้ว ตัวนอกไม่ซูมซ้ำ
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || !e.deltaY) return;
      e.preventDefault();
      const now = Date.now();
      if (now - last < 140) return;
      last = now;
      stepRef.current(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    detach.current = () => el.removeEventListener("wheel", onWheel);
  }, [enabled]);
}

/** กริดที่มือถือคง 2 ใบต่อแถว แต่จอ ≥ sm ใช้ขนาดจาก gallery (หน้าจัดซื้อ 2026-11-20)
 *   <div className={`gap-3 ${GALLERY_GRID_PHONE2}`} style={galleryVars(cols, "0.75rem")}>  · gap ต้องตรงกับ gap ของจอ ≥ sm */
export const GALLERY_GRID_PHONE2 = "grid grid-cols-2 sm:[grid-template-columns:var(--gallery-tpl)]";
export const galleryVars = (cols: number, gap = "0.75rem") => ({ "--gallery-tpl": galleryTemplate(cols, gap) }) as CSSProperties;

/** ค่าที่ useGalleryColumns คืน — ส่งต่อให้ CardGrid / CardViewBar */
export type GalleryState = ReturnType<typeof useGalleryColumns>;

// มุมมองการ์ดกลาง (กริด + สถานะ + แถบเครื่องมือ) — ต่อยอดจากตัวนี้ (2026-11-20)
export { CardGrid, CardViewBar, CardZoom } from "./card-grid";

/** ปุ่มเลือกจำนวนการ์ดต่อแถว (segmented · as="select" = dropdown กะทัดรัด · as="stepper" = − N ต่อแถว + ใช้ได้ทั้ง PC/มือถือ)
 *  — เสียบข้างแถบเครื่องมือของหน้ากริดใดก็ได้
 *  wheelHint = บอกในป้ายชี้ว่า Ctrl + ลูกกลิ้งบนกริดใช้ได้ (ใส่เมื่อเปิด ctrlWheel) */
export function GalleryColumnsControl({ cols, onChange, options = GALLERY_COL_OPTIONS, className = "", as = "buttons", wheelHint = true }: {
  cols: number; onChange: (n: GalleryCols) => void; options?: readonly GalleryCols[]; className?: string; as?: "buttons" | "select" | "stepper"; wheelHint?: boolean;
}) {
  const t = useT();
  const title = wheelHint
    ? t("จำนวนการ์ดต่อแถว · Ctrl + หมุนลูกกลิ้งบนการ์ด = ย่อ/ขยาย", "Cards per row · Ctrl + scroll on the grid to resize")
    : t("จำนวนการ์ดต่อแถว", "Cards per row");
  if (as === "stepper") {
    const i = Math.max(0, options.indexOf(cols as GalleryCols));
    const go = (d: 1 | -1) => { const n = options[Math.max(0, Math.min(options.length - 1, i + d))]; if (n !== cols) onChange(n); };
    const stepBtn = "h-7 w-7 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent";
    return (
      <div className={`inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 ${className}`} title={title}>
        {/* − = การ์ดเล็กลง (ต่อแถวมากขึ้น) · + = ใหญ่ขึ้น — ทิศเดียวกับ Ctrl+ลูกกลิ้ง */}
        <button type="button" onClick={() => go(1)} disabled={i >= options.length - 1} aria-label={t("ย่อการ์ด", "Smaller cards")} className={stepBtn}>−</button>
        <select value={cols} onChange={(e) => onChange(Number(e.target.value) as GalleryCols)} aria-label={t("จำนวนการ์ดต่อแถว", "Cards per row")}
          className="h-7 cursor-pointer appearance-none rounded bg-transparent px-1.5 text-center text-xs text-slate-700 hover:bg-slate-50">
          {options.map((n) => <option key={n} value={n}>{t(`${n} ต่อแถว`, `${n} per row`)}</option>)}
        </select>
        <button type="button" onClick={() => go(-1)} disabled={i <= 0} aria-label={t("ขยายการ์ด", "Bigger cards")} className={stepBtn}>+</button>
      </div>
    );
  }
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
