"use client";

/**
 * SearchableSelect — ของกลาง: dropdown ที่ค้นหาได้ (พิมพ์กรองรายการ)
 * ใช้แทน <select> เมื่อ option เยอะ เช่น เลือก table ปลายทางของ relation
 *
 * <SearchableSelect value={v} options={[{value,label,badge?,sub?}]} onChange={setV} />
 *
 * dropdown วาดผ่าน portal + position:fixed → ลอยทะลุกล่องที่มี overflow (ไม่โดนตัด/จม)
 * คำนวณตำแหน่งจากปุ่ม และเด้งขึ้นเองถ้าพื้นที่ด้านล่างไม่พอ
 *
 * เลือกหลายค่า (2026-11-13 · แทนชิปที่กางเต็มจอในช่องคุณลักษณะของร้านค้า):
 * <SearchableMultiSelect values={["a","b"]} options={…} onChange={(vals) => …} maxChips={2} highlight={["a"]} onCreate={(q) => …} />
 *   ปุ่มโชว์ค่าที่เลือกเป็นชิป (เกิน maxChips = "+N") · กดแล้วติ๊กได้หลายตัว + พิมพ์ค้น · ค่าที่ไม่อยู่ในรายการ (กำหนดเอง) ยังโชว์/เอาออกได้
 *   highlight = ค่าที่ระบบแนะนำ (ป้าย "แนะนำ") · onCreate = อนุญาตพิมพ์ค่าใหม่เอง
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/i18n";

export type SelectOption = { value: string; label: string; badge?: string; sub?: string; searchText?: string };

type Pos = { left: number; top: number; width: number; openUp: boolean };

export function SearchableSelect({
  value, options, onChange, placeholder: placeholderProp, disabled, className, onCreate, createLabel: createLabelProp, initialQuery,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** ถ้าค้นแล้วไม่เจอ → โชว์ปุ่ม "+ สร้าง <คำค้น>" (ของกลาง: ใช้สร้างรายการใหม่ทันทีจาก dropdown) */
  onCreate?: (query: string) => void;
  createLabel?: string;
  /** เปิด dropdown มาพร้อมคำค้นตั้งต้น (เช่น ดึงชื่อจากหมายเหตุ) — ผู้ใช้ลบ/แก้ได้ */
  initialQuery?: string;
}) {
  const t = useT();
  const placeholder = placeholderProp ?? t("— เลือก —", "— Select —");
  const createLabel = createLabelProp ?? t("เพิ่มใหม่", "Add new");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const openMenu = () => { setQ(initialQuery ?? ""); setOpen(true); };   // seed คำค้นทุกครั้งที่เปิด
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cur = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    // value ที่เป็น uuid ไม่เอามาค้น — hex + "-" ทำให้คำสั้น ๆ (เช่น "C-") จับติดทุกแถว
    const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    return options.filter((o) =>
      o.label.toLowerCase().includes(s) ||
      (!isUuid(o.value) && o.value.toLowerCase().includes(s)) ||
      (o.sub ?? "").toLowerCase().includes(s) ||
      (o.searchText ?? "").toLowerCase().includes(s));
  }, [q, options]);

  const close = () => { setOpen(false); setQ(""); };

  // คำนวณตำแหน่ง dropdown จาก rect ของปุ่ม (เด้งขึ้นถ้าด้านล่างไม่พอ)
  const compute = useCallback(() => {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_MAX = 320;   // ความสูงโดยประมาณ (input ค้นหา + รายการ)
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < PANEL_MAX && r.top > spaceBelow;
    setPos({ left: r.left, width: r.width, top: openUp ? r.top : r.bottom, openUp });
  }, []);

  useLayoutEffect(() => { if (open) compute(); }, [open, compute]);
  useEffect(() => {
    if (!open) return;
    const h = () => compute();
    window.addEventListener("scroll", h, true);   // capture → จับ scroll ของกล่องด้านในด้วย
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, compute]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => (open ? close() : openMenu())} data-field-trigger
        className="w-full h-9 px-2 text-sm text-left border border-slate-200 rounded-md bg-white flex items-center gap-1 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
        <span className="flex-1 min-w-0 truncate">
          {cur ? <>{cur.label}{cur.badge ? ` ${cur.badge}` : ""}</> : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && !disabled && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={close} />
          <div className="fixed z-[1001] bg-white border border-slate-200 rounded-lg shadow-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width, transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
            <div className="p-2 border-b border-slate-100">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหา…", "Search…")}
                className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && !onCreate && <div className="px-3 py-2 text-xs text-slate-400">{t("ไม่พบรายการ", "No matches")}</div>}
              {filtered.map((o) => (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); close(); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 ${o.value === value ? "bg-blue-100 font-medium" : ""}`}>
                  {o.label}{o.badge ? ` ${o.badge}` : ""}
                  {o.sub ? <span className="text-[11px] text-slate-400"> · {o.sub}</span> : null}
                </button>
              ))}
              {/* ค้นไม่เจอ (ชื่อไม่ตรงเป๊ะ) → ปุ่มสร้างใหม่จากคำค้น */}
              {onCreate && q.trim() && !options.some((o) => o.label.trim().toLowerCase() === q.trim().toLowerCase()) && (
                <button type="button" onClick={() => { onCreate(q.trim()); close(); }}
                  className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-slate-100 flex items-center gap-1.5">
                  <span className="text-base leading-none">＋</span> {createLabel}: <strong>&ldquo;{q.trim()}&rdquo;</strong>
                </button>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ───────── เลือกหลายค่า (ตัวเดียวกัน · ไม่สร้างกล่องเลือกชุดที่ 2) ─────────
/** ตำแหน่ง dropdown ลอย (คำนวณจากปุ่ม · เด้งขึ้นถ้าด้านล่างไม่พอ · ตามการเลื่อนจอ) */
function useFloatPos(open: boolean, ref: RefObject<HTMLElement | null>, panelMax = 360): Pos | null {
  const [pos, setPos] = useState<Pos | null>(null);
  const compute = useCallback(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < panelMax && r.top > spaceBelow;
    setPos({ left: r.left, width: Math.max(r.width, 220), top: openUp ? r.top : r.bottom, openUp });
  }, [ref, panelMax]);
  useLayoutEffect(() => { if (open) compute(); }, [open, compute]);
  useEffect(() => {
    if (!open) return;
    const h = () => compute();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, compute]);
  return open ? pos : null;
}

export function SearchableMultiSelect({
  values, options, onChange, placeholder: placeholderProp, disabled, className, buttonClassName, maxChips = 2, highlight, highlightLabel, onCreate,
}: {
  values: string[];
  options: SelectOption[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** สีกรอบปุ่ม (เช่น แก้แล้ว = ม่วง · ช่องบังคับว่าง = แดง) — ไม่ส่ง = กรอบเทาปกติ */
  buttonClassName?: string;
  /** โชว์ชิปกี่ตัว ที่เหลือรวมเป็น "+N" */
  maxChips?: number;
  /** ค่าที่ระบบแนะนำ (ป้ายเหลือง) */
  highlight?: string[];
  highlightLabel?: string;
  /** อนุญาตพิมพ์ค่าใหม่เอง (ค้นไม่เจอ → "+ ใช้ “คำค้น”") */
  onCreate?: (query: string) => void;
}) {
  const t = useT();
  const placeholder = placeholderProp ?? t("— เลือก —", "— Select —");
  const hl = highlightLabel ?? t("แนะนำ", "Suggested");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const pos = useFloatPos(open && !disabled, btnRef);
  const set = useMemo(() => new Set(values), [values]);
  const hlSet = useMemo(() => new Set(highlight ?? []), [highlight]);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  // ค่าที่เลือกแต่ไม่อยู่ในรายการ (ค่ากำหนดเอง / ค่าเดิมที่รายการไม่มีแล้ว) — ขึ้นบนสุดให้เอาออกได้
  const extra: SelectOption[] = values.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v, sub: t("ค่ากำหนดเอง", "Custom") }));
  const all = [...extra, ...options];
  const s = q.trim().toLowerCase();
  const filtered = s ? all.filter((o) => o.label.toLowerCase().includes(s) || (o.sub ?? "").toLowerCase().includes(s) || (o.searchText ?? "").toLowerCase().includes(s)) : all;
  const toggle = (v: string) => onChange(set.has(v) ? values.filter((x) => x !== v) : [...values, v]);
  const close = () => { setOpen(false); setQ(""); };
  const chips = values.slice(0, maxChips);
  return (
    <div className={`relative ${className ?? ""}`}>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => (open ? close() : setOpen(true))} data-field-trigger
        className={`w-full min-h-9 px-2 py-1 text-sm text-left border rounded-md flex items-center gap-1 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 ${buttonClassName ?? "border-slate-200 bg-white"}`}>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {chips.length ? chips.map((v) => (
            <span key={v} className="inline-flex max-w-[11rem] items-center gap-1 truncate rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
              <span className="truncate">{labelOf(v)}</span>
              {hlSet.has(v) && <span className="rounded-full bg-amber-100 px-1 text-[10px] text-amber-800">{hl}</span>}
            </span>
          )) : <span className="text-slate-400">{placeholder}</span>}
          {values.length > maxChips && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">+{values.length - maxChips}</span>}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={close} />
          <div className="fixed z-[1001] bg-white border border-slate-200 rounded-lg shadow-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width, transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
            <div className="p-2 border-b border-slate-100">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหา…", "Search…")}
                onKeyDown={(e) => { if (e.key === "Enter" && onCreate && q.trim()) { e.preventDefault(); onCreate(q.trim()); setQ(""); } }}
                className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && !onCreate && <div className="px-3 py-2 text-xs text-slate-400">{t("ไม่พบรายการ", "No matches")}</div>}
              {filtered.map((o) => (
                <label key={o.value} className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-blue-50 ${set.has(o.value) ? "bg-blue-50/60" : ""}`}>
                  <input type="checkbox" checked={set.has(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 shrink-0 accent-violet-600" />
                  <span className="min-w-0 flex-1 truncate">{o.label}{o.sub ? <span className="text-[11px] text-slate-400"> · {o.sub}</span> : null}</span>
                  {hlSet.has(o.value) && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">{hl}</span>}
                </label>
              ))}
              {onCreate && q.trim() && !all.some((o) => o.label.trim().toLowerCase() === q.trim().toLowerCase()) && (
                <button type="button" onClick={() => { onCreate(q.trim()); setQ(""); }}
                  className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-slate-100 flex items-center gap-1.5">
                  <span className="text-base leading-none">＋</span> {t("ใช้", "Use")} <strong>&ldquo;{q.trim()}&rdquo;</strong>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 px-2 py-1.5 text-xs">
              <span className="text-slate-500">{t(`เลือก ${values.length}`, `${values.length} selected`)}</span>
              {values.length > 0 && <button type="button" onClick={() => onChange([])} className="text-rose-600 hover:underline">{t("ล้าง", "Clear")}</button>}
              <button type="button" onClick={close} className="ml-auto h-7 rounded-md bg-violet-600 px-3 text-white hover:bg-violet-700">{t("เสร็จ", "Done")}</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
