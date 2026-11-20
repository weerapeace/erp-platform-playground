"use client";

/**
 * SplitScreen (ของกลาง) — แบ่งจอทั้งแอปเป็น 2 ฝั่ง: หน้าเดิมซ้าย + อีกหน้า/อีกแท็บขวา (หน้าจริงฝัง ?embed=1)
 *
 * วิธีใช้ของผู้ใช้ (จอ PC กว้าง ≥ 1024px):
 *   - กด Ctrl (Mac: ⌘) ค้าง แล้ว "คลิก" แท็บ  → เปิดแท็บนั้นฝั่งขวา
 *   - กด Ctrl ค้าง แล้ว "ลาก" แท็บไปขอบขวาของจอ → ปล่อย = แบ่งจอ
 *   - ลากเส้นกลางปรับสัดส่วน (จำในเครื่อง) · ปุ่ม ⇱ = ให้หน้าฝั่งขวาเป็นหน้าหลัก · ✕ = ปิด
 *
 * แท็บที่แบ่งจอได้ (หาเองจากหน้าเว็บ ไม่ต้องแก้ทีละหน้า):
 *   [data-split-tab] · [role="tab"] · ปุ่มใน [role="tablist"] · ปุ่ม [data-tab-key] (ของกลาง ScrollTabs)
 *   · ปุ่มในกลุ่มปุ่มสลับแบบ inline-flex bg-slate-100 p-0.5 · ยกเว้นใน [data-no-split] / ป๊อป (role=dialog)
 * ปลายทาง: data-split-href (ดีสุด — ลิงก์ที่เปิดแท็บนั้นตรง ๆ) → ลิงก์ <a> ภายใน → หน้าเดิม + กดแท็บชื่อเดียวกันให้ในฝั่งขวา
 * เปิดเองจากโค้ด: openSplit("/tasks/plan?view=board", "กระดาน")
 *
 * ต่างจาก SplitPanes (components/split-panes): ตัวนั้นแบ่ง 2 กล่องในหน้าเดียว (กดฝั่งไหนขยายดัน) · ตัวนี้แบ่งทั้งจอเป็น 2 หน้า
 * วางที่ app/layout.tsx ครั้งเดียว (SplitScreenHost) · ใน iframe (ฝั่งขวา/แอปเดี่ยว) ไม่ทำงาน (กันซ้อน)
 * คู่มือ: docs/split-screen.md
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { embedUrl } from "@/lib/embed-url";

export type SplitTarget = { url: string; title: string; clickLabel?: string; tabKey?: string };

// ── store เล็ก ๆ (ใช้ร่วมทั้งแอป) ──
let current: SplitTarget | null = null;
const subs = new Set<() => void>();
const STORE_KEY = "erp_split_screen";
const RATIO_KEY = "erp_split_ratio";
const MIN_WIDTH = 1024;
function emit() { subs.forEach((f) => f()); }
export function openSplit(url: string, title: string, extra: Partial<SplitTarget> = {}) {
  current = { url, title, ...extra };
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(current)); } catch { /* ไม่มีที่เก็บ = ไม่จำ */ }
  emit();
}
export function closeSplit() {
  current = null;
  try { sessionStorage.removeItem(STORE_KEY); } catch { /* */ }
  emit();
}
export function useSplitScreen(): SplitTarget | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current, () => null);
}

const TAB_SELECTOR = '[data-split-tab],[role="tab"],[role="tablist"] button,button[data-tab-key]';

/** หาแท็บจากจุดที่กด (null = ไม่ใช่แท็บ) */
export function findSplitTab(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  if (el.closest('[data-no-split],[role="dialog"],[aria-modal="true"]')) return null;
  const hit = el.closest<HTMLElement>(TAB_SELECTOR);
  if (hit) return (hit as HTMLButtonElement).disabled ? null : hit;
  // กลุ่มปุ่มสลับแบบที่หลายหน้าเขียนเอง: <div class="inline-flex bg-slate-100 … p-0.5"><button/><button/></div>
  const btn = el.closest<HTMLButtonElement>("button");
  const g = btn?.parentElement;
  if (btn && !btn.disabled && g && /\binline-flex\b/.test(g.className) && /\bbg-slate-100\b/.test(g.className) && /\bp-0\.5\b/.test(g.className)
    && g.querySelectorAll(":scope > button").length >= 2) return btn;
  return null;
}

const labelOf = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** แท็บ → ปลายทางที่จะเปิดฝั่งขวา */
export function splitTargetOf(tab: HTMLElement): SplitTarget {
  const title = labelOf(tab).slice(0, 60) || "หน้าคู่";
  const href = tab.getAttribute("data-split-href") || (tab instanceof HTMLAnchorElement ? tab.getAttribute("href") : null) || tab.closest("a")?.getAttribute("href");
  if (href && href.startsWith("/")) return { url: href, title };
  return { url: window.location.pathname + window.location.search, title, clickLabel: labelOf(tab), tabKey: tab.getAttribute("data-tab-key") ?? undefined };
}

/** หลัง iframe โหลด: กดแท็บชื่อเดียวกันให้ (กรณีแท็บไม่มีลิงก์ของตัวเอง) — ลองซ้ำสูงสุด ~6 วิ เผื่อหน้ายังโหลดข้อมูล */
function clickTabInFrame(frame: HTMLIFrameElement, t: SplitTarget) {
  if (!t.clickLabel && !t.tabKey) return;
  let tries = 0;
  const tick = () => {
    tries += 1;
    try {
      const doc = frame.contentDocument;
      const cands = doc ? Array.from(doc.querySelectorAll<HTMLElement>(`${TAB_SELECTOR},button`)) : [];
      const hit = cands.find((b) => (t.tabKey && b.getAttribute("data-tab-key") === t.tabKey) || (t.clickLabel && labelOf(b) === t.clickLabel));
      if (hit) { hit.click(); return; }
    } catch { return; }   // ต่างโดเมน (ไม่ควรเกิด) → เลิก
    if (tries < 20) window.setTimeout(tick, 300);
  };
  tick();
}

function readRatio(): number {
  try { const n = Number(localStorage.getItem(RATIO_KEY)); return n >= 0.25 && n <= 0.75 ? n : 0.55; } catch { return 0.55; }
}

export function SplitScreenHost({ children }: { children: ReactNode }) {
  const target = useSplitScreen();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);     // false = อยู่ใน iframe หรือจอแคบ
  const [ratio, setRatio] = useState(0.55);
  const [resizing, setResizing] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; label: string; over: boolean } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const press = useRef<{ x: number; y: number; tab: HTMLElement; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  // เปิดใช้เฉพาะหน้าต่างบนสุด + จอกว้าง · กู้การแบ่งจอเดิมหลังรีเฟรช
  useEffect(() => {
    if (window.self !== window.top) return;
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const sync = () => setEnabled(mq.matches);
    sync(); mq.addEventListener("change", sync);
    setRatio(readRatio());
    try { const s = sessionStorage.getItem(STORE_KEY); if (s && !current) { current = JSON.parse(s) as SplitTarget; emit(); } } catch { /* */ }
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Ctrl+คลิก / Ctrl+ลาก แท็บ
  useEffect(() => {
    if (!enabled) return;
    const mod = (e: MouseEvent) => e.ctrlKey || e.metaKey;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !mod(e)) return;
      const tab = findSplitTab(e.target);
      if (!tab) return;
      press.current = { x: e.clientX, y: e.clientY, tab, moved: false };
      e.preventDefault();                       // กันลากแล้วเลือกข้อความ
    };
    const onMove = (e: MouseEvent) => {
      const p = press.current; if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12) return;
      p.moved = true;
      setDrag({ x: e.clientX, y: e.clientY, label: labelOf(p.tab), over: e.clientX > window.innerWidth * 0.6 });
    };
    const onUp = (e: MouseEvent) => {
      const p = press.current; press.current = null;
      if (!p) return;
      setDrag(null);
      if (!p.moved) return;                     // ไม่ได้ลาก → ให้ click (ด้านล่าง) จัดการ
      swallowClick.current = true;
      window.setTimeout(() => { swallowClick.current = false; }, 0);
      if (e.clientX > window.innerWidth * 0.6) { const t = splitTargetOf(p.tab); openSplit(t.url, t.title, t); }
    };
    const onClick = (e: MouseEvent) => {
      if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); swallowClick.current = false; return; }
      if (!mod(e)) return;
      const tab = findSplitTab(e.target);
      if (!tab) return;
      e.preventDefault(); e.stopPropagation();  // ไม่สลับแท็บฝั่งซ้าย · ไม่เปิดแท็บเบราว์เซอร์ใหม่
      const t = splitTargetOf(tab);
      openSplit(t.url, t.title, t);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled]);

  // ลากเส้นกลางปรับสัดส่วน
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); setResizing(true);
    const move = (ev: PointerEvent) => setRatio(Math.min(0.75, Math.max(0.25, ev.clientX / window.innerWidth)));
    const up = (ev: PointerEvent) => {
      setResizing(false);
      const r = Math.min(0.75, Math.max(0.25, ev.clientX / window.innerWidth));
      try { localStorage.setItem(RATIO_KEY, String(r)); } catch { /* */ }
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, []);

  const on = enabled && !!target;
  // โครงเดิมเสมอ (ไม่ remount หน้า): ปิดแบ่งจอ = display:contents
  return (
    <div className={on ? "flex h-dvh w-full overflow-hidden" : "contents"}>
      <div className={on ? "relative h-dvh overflow-auto" : "contents"}
        style={on ? { width: `${ratio * 100}%`, transform: "translateZ(0)" } : undefined}>
        {children}
      </div>
      {on && target && (<>
        <div role="separator" aria-orientation="vertical" title="ลากเพื่อปรับขนาด" onPointerDown={startResize}
          className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-blue-400 active:bg-blue-500" />
        <div className="relative flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 text-xs">
            <span className="truncate font-semibold text-slate-700">{target.title}</span>
            <span className="truncate text-slate-400">{target.url}</span>
            <button type="button" onClick={() => { const u = target.url; closeSplit(); router.push(u); }} title="ให้หน้านี้เป็นหน้าหลัก (ปิดแบ่งจอ)"
              className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-white hover:text-slate-800">⇱ เปิดเป็นหน้าหลัก</button>
            <button type="button" onClick={closeSplit} aria-label="ปิดแบ่งจอ" title="ปิดแบ่งจอ"
              className="shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-white hover:text-rose-600">✕</button>
          </div>
          <iframe ref={frameRef} key={`${target.url}|${target.clickLabel ?? ""}`} src={embedUrl(target.url)} title={target.title}
            onLoad={() => frameRef.current && clickTabInFrame(frameRef.current, target)}
            className="block w-full flex-1 border-0 bg-slate-50" />
          {resizing && <div className="absolute inset-0" />}{/* กัน iframe แย่งเมาส์ตอนลากเส้น */}
        </div>
      </>)}
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-[9999]">
          <div className={`absolute bottom-3 right-3 top-3 flex w-[38%] items-center justify-center rounded-2xl border-2 border-dashed text-sm font-medium transition-colors ${drag.over ? "border-blue-500 bg-blue-500/15 text-blue-700" : "border-slate-300 bg-white/60 text-slate-500"}`}>
            {drag.over ? "ปล่อยเพื่อแบ่งจอ" : "ลากมาวางฝั่งนี้เพื่อแบ่งจอ"}
          </div>
          <div className="absolute rounded-md bg-slate-800 px-2 py-1 text-xs text-white shadow" style={{ left: drag.x + 12, top: drag.y + 12 }}>{drag.label}</div>
        </div>
      )}
    </div>
  );
}
