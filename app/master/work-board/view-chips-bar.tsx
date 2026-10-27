"use client";

/**
 * แถบปุ่มมุมมองด่วน (บอร์ดจ่ายงาน แท็บรอจ่าย)
 *   • ปุ่มที่ไม่พอที่พับเป็น "อื่น ๆ N ▾" (วัดความกว้างจริง) — ปุ่มที่เลือกอยู่โชว์บนแถบเสมอ
 *   • ลากสลับลำดับบนแถบได้ (เมาส์) → onReorder · บน iPad ใช้เมนูลัด "ย้ายซ้าย/ขวา"
 *   • คลิกขวา / กดค้าง (นิ้ว) = เมนูลัด → onMenu (หน้าเจ้าของวาดเมนูเอง)
 * ลำดับ/การซ่อนเก็บต่อคนที่ ./use-quick-views (mine.order / mine.hidden)
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { useDragReorder } from "@/components/sortable-list";
import { qvSummary, type QuickView } from "./quick-views";

const GAP = 6;        // gap-1.5
const MORE_W = 96;    // ที่เผื่อปุ่ม "อื่น ๆ ▾"
const LONG_PRESS_MS = 500;

export function ViewChipsBar({ views, activeId, onPick, countOf, brandColorOf, touch, fmt, onMenu, onReorder, reserve, share, after }: {
  views: QuickView[];
  activeId: string;
  onPick: (id: string) => void;
  countOf: (v: QuickView) => number;
  brandColorOf: (b: string) => string;
  touch: boolean;
  fmt: (n: number) => string;
  onMenu: (v: QuickView, anchor: HTMLElement) => void;
  onReorder: (fromId: string, toId: string) => void;
  reserve: number;      // px ที่เผื่อให้ปุ่มอื่นในแถวเดียวกัน (บันทึกเป็นมุมมอง / ตั้งค่า)
  share: number;        // สัดส่วนของแถวที่ปุ่มมุมมองใช้ได้ (มีชิปแบรนด์ต่อท้าย = น้อยลง)
  after?: ReactNode;    // ปุ่มต่อท้ายปุ่มมุมมอง
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [rowW, setRowW] = useState(0);
  const [chipW, setChipW] = useState<number[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  // ความกว้างแถว (กล่องแม่) — ตามจอ/หมุน iPad
  useLayoutEffect(() => {
    const row = wrapRef.current?.parentElement;
    if (!row) return;
    const f = () => setRowW(row.clientWidth);
    f();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(f) : null;
    ro?.observe(row);
    return () => ro?.disconnect();
  }, []);
  // ความกว้างปุ่มแต่ละอัน (วัดจากสำเนาซ่อน — วาดครบทุกปุ่มเสมอ)
  const sig = views.map((v) => `${v.id}:${v.name}:${v.icon}:${countOf(v)}:${v.brands.length}:${v.layout}`).join("|") + (touch ? "t" : "");
  useLayoutEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    const ws = Array.from(m.children).map((c) => (c as HTMLElement).offsetWidth);
    setChipW((o) => (o.join() === ws.join() ? o : ws));
  }, [sig]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ปุ่มไหนอยู่บนแถบ · ที่เหลือพับ
  const activeIdx = views.findIndex((v) => v.id === activeId);
  let shown = views.map((_, i) => i);
  if (rowW && chipW.length === views.length) {
    const budget = Math.max(180, rowW * share - reserve);
    if (chipW.reduce((s, w) => s + w + GAP, 0) > budget) {
      const fit: number[] = [];
      let used = MORE_W;
      for (let i = 0; i < views.length; i++) { if (used + chipW[i] + GAP > budget) break; used += chipW[i] + GAP; fit.push(i); }
      if (activeIdx >= 0 && !fit.includes(activeIdx)) { if (fit.length) fit.pop(); fit.push(activeIdx); fit.sort((a, b) => a - b); }
      shown = fit.length ? fit : [Math.max(0, activeIdx)];
    }
  }
  const shownViews = shown.map((i) => views[i]);
  const hidden = views.filter((_, i) => !shown.includes(i));

  // ลากสลับ (เมาส์เท่านั้น — นิ้วใช้เลื่อนแถบ)
  const drag = useDragReorder((from, to) => {
    const a = shownViews[from], b = shownViews[to];
    if (a && b) onReorder(a.id, b.id);
  }, { group: "wb-view-chips" });
  // กดค้าง (นิ้ว) = เมนูลัด
  const lp = useRef<{ t: number | null; x: number; y: number; fired: boolean }>({ t: null, x: 0, y: 0, fired: false });
  const cancelLp = () => { if (lp.current.t) { window.clearTimeout(lp.current.t); lp.current.t = null; } };

  const chipCls = (on: boolean) => `inline-flex shrink-0 items-center gap-1.5 ${touch ? "h-10 px-4" : "h-8 px-3"} text-sm rounded-full border select-none [-webkit-touch-callout:none] ${on ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`;
  const body = (v: QuickView, on: boolean) => <>
    <span aria-hidden>{v.icon}</span>{v.name}
    {v.brands.slice(0, 3).map((b) => <span key={b} className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ backgroundColor: brandColorOf(b) }} aria-hidden />)}
    {v.layout === "cards" && <span className={on ? "text-white/60" : "text-slate-300"} title="แสดงเป็นการ์ด" aria-hidden>▤</span>}
    <span className={on ? "text-white/70" : "text-slate-400"}>{fmt(countOf(v))}</span>
  </>;

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center gap-1.5">
      {/* สำเนาซ่อนไว้วัดความกว้าง — กล่อง 0×0 ตัดขอบ ไม่ให้แถบเลื่อนของแถวยาวขึ้น */}
      <div aria-hidden className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <div ref={measureRef} className="invisible flex w-max gap-1.5">
          {views.map((v) => <span key={v.id} className={chipCls(false)}>{body(v, false)}</span>)}
        </div>
      </div>
      {shownViews.map((v, i) => {
        const on = v.id === activeId;
        const key = views.indexOf(v);
        const hint = key < 9 ? ` · กด ${key + 1}` : "";
        return (
          <button key={v.id} type="button" {...drag.rowProps(i)}
            title={`${qvSummary(v)}${hint} · คลิกขวา/กดค้าง = เมนู · ลากเพื่อสลับ`}
            className={`${chipCls(on)} ${drag.rowCls(i)}`}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") { drag.handleProps(i).onPointerDown(e); return; }
              const el = e.currentTarget;
              lp.current = { t: window.setTimeout(() => { lp.current.t = null; lp.current.fired = true; onMenu(v, el); }, LONG_PRESS_MS), x: e.clientX, y: e.clientY, fired: false };
            }}
            onPointerMove={(e) => { if (lp.current.t && Math.hypot(e.clientX - lp.current.x, e.clientY - lp.current.y) > 8) cancelLp(); }}
            onPointerUp={cancelLp} onPointerCancel={cancelLp} onPointerLeave={cancelLp}
            onContextMenu={(e) => { e.preventDefault(); cancelLp(); lp.current.fired = true; onMenu(v, e.currentTarget); }}
            onClick={(e) => { if (lp.current.fired) { lp.current.fired = false; e.preventDefault(); return; } onPick(v.id); }}>
            {body(v, on)}
          </button>
        );
      })}
      {hidden.length > 0 && (
        <button ref={moreRef} type="button" onClick={() => setMoreOpen((o) => !o)} title="มุมมองอื่น ๆ ที่ไม่พอที่บนแถบ"
          className={`shrink-0 ${touch ? "h-10 px-3" : "h-8 px-3"} rounded-full border text-sm ${moreOpen ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          อื่น ๆ {hidden.length} ▾
        </button>
      )}
      <FloatingDropdown anchorRef={moreRef} open={moreOpen && hidden.length > 0} onClose={() => setMoreOpen(false)} minWidth={240}>
        <div className="max-h-[var(--fd-max-h)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {hidden.map((v) => (
            <button key={v.id} type="button" onClick={() => { setMoreOpen(false); onPick(v.id); }}
              onContextMenu={(e) => { e.preventDefault(); setMoreOpen(false); onMenu(v, moreRef.current ?? e.currentTarget); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
              <span aria-hidden>{v.icon}</span><span className="min-w-0 flex-1 truncate">{v.name}</span>
              <span className="tabular-nums text-[11px] text-slate-400">{fmt(countOf(v))}</span>
            </button>
          ))}
          <div className="border-t border-slate-100 px-3 pt-1.5 text-[11px] text-slate-400">ย้ายปุ่มขึ้นแถบ: คลิกขวา/กดค้างที่ปุ่ม → ย้ายซ้าย · หรือ ⚙️ ตั้งค่ามุมมอง</div>
        </div>
      </FloatingDropdown>
      {after}
    </div>
  );
}
