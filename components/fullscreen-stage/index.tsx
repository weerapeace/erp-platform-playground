"use client";
/**
 * ⛶ โหมดเต็มจอของกระดาน/ผัง (ของกลาง) — เจ้าของขอ 2026-11-19 "อยากให้ใหญ่เต็มจอแบบ Miro" (เลือก F1 F2 F3 F5 F6 F7)
 *   - เต็มจอ = ซ่อนหัวเว็บ/เมนูแอป/แถบปุ่มของหน้า ให้กระดานใช้พื้นที่ 100% (ชั้นลอย fixed เหนือ shell แต่ต่ำกว่าป๊อปอัปกลาง z-50)
 *     เปิดในกรอบแอปเดี่ยว (/app/<key>) → บอกเชลล์ให้ซ่อนหัวแอป + แถบเมนูแอปด้วย (lib/app-shell-bar · usePageWantsFullFrame)
 *   - ปุ่ม FullscreenToggle · คีย์ลัด F (ใช้ตำแหน่งปุ่ม KeyF → แป้นไทยก็ได้ · ไม่ทำงานตอนพิมพ์ในช่อง/อยู่ในกระดานวาด Excalidraw ที่ F = เครื่องมือกรอบ)
 *   - Esc = ออก (ผ่านกองกลาง useEscLayer — ป๊อปที่เปิดทับอยู่ปิดก่อน)
 *   - จำต่อคน (useUserPref) · defaultOn = ยังไม่เคยเลือก → เปิดเต็มจอเลย
 *   - มือถือ (จอ < 768) = เต็มจอเสมอ · กด "ออก" ได้ชั่วคราว (ไม่จำ)
 *   - autoHide (เจ้าของขอ 2026-11-19 "ข้างบนให้เอาเมาส์ไปวางแล้วค่อยโชว์"): แถบปุ่มที่ห่อด้วย <FullscreenBar> ซ่อนไว้ขอบบน
 *       ชี้ขอบบน = เลื่อนลงมา · เมาส์ออก ~1 วิ = ซ่อน · ชิปกลางขอบบน (<FullscreenPeek>) ค้างไว้ กดแล้วเปิด/ปิดแถบ (มือถือใช้ทางนี้)
 *       ปุ่ม "ปักไว้" = แถบโชว์ค้าง (จำต่อคน `<prefKey>_pin`)
 * ใช้:
 *   const fs = useFullscreenStage("my_board_fullscreen", { active: isBoardTab, defaultOn: true, autoHide: true });
 *   <FullscreenStage fs={fs}>
 *     <FullscreenBar order={10}>…ปุ่มของหน้า… <FullscreenToggle fs={fs} /></FullscreenBar>
 *     <FullscreenPeek>ค้าง 12 · เกิน 3</FullscreenPeek>
 *     <MyBoard fill={fs.on} />
 *   </FullscreenStage>
 *   FullscreenBar ใช้ข้างในลูกลึก ๆ ได้ (ส่งผ่าน context) · ไม่ได้อยู่ในชั้นเต็มจอแบบ autoHide = แสดงที่เดิมตามปกติ
 * ห้ามใช้: ป๊อปฝังหน้าอื่น (ใช้ EmbedModal ที่มีปุ่มเต็มจอเอง) · ดูรูปเต็มจอ (ImageLightbox) · แอปแยกทั้งหน้า (StandaloneShell)
 * doc: docs/fullscreen-stage.md
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { useEscLayer } from "@/components/modal/esc-layer";
import { usePageWantsFullFrame } from "@/lib/app-shell-bar";
import { useUserPref } from "@/lib/use-user-pref";

const PHONE_MQ = "(max-width: 767px)";

export type FullscreenStageState = {
  /** ตอนนี้เต็มจออยู่ไหม */
  on: boolean;
  /** จอมือถือ (เต็มจอเสมอ เว้นแต่กดออกชั่วคราว) */
  phone: boolean;
  set: (v: boolean) => void;
  toggle: () => void;
  /** ซ่อนแถบปุ่มไว้ขอบบน (ตอนเต็มจอ) */
  autoHide: boolean;
  /** ผู้ใช้ปักแถบให้โชว์ค้าง */
  pinned: boolean;
  setPinned: (v: boolean) => void;
};

const parseBool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** active = หน้านี้กำลังโชว์กระดานอยู่ไหม (เช่น อยู่แท็บอื่น = false → ไม่เต็มจอ ไม่ฟังคีย์ แม้เป็นมือถือ) */
export function useFullscreenStage(prefKey: string, opts: { hotkey?: boolean; active?: boolean; defaultOn?: boolean; autoHide?: boolean } = {}): FullscreenStageState {
  const { active = true, defaultOn = false, autoHide = false } = opts;
  const hotkey = (opts.hotkey ?? true) && active;
  const [saved, setSaved] = useUserPref<boolean>(prefKey, defaultOn, parseBool);
  const [pinned, setPinned] = useUserPref<boolean>(`${prefKey}_pin`, false, parseBool);
  const [phone, setPhone] = useState(false);
  const [phoneExit, setPhoneExit] = useState(false);   // มือถือกดออกชั่วคราว (ไม่จำ)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(PHONE_MQ);
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const on = active && (phone ? !phoneExit : saved);
  const set = useCallback((v: boolean) => { if (phone) setPhoneExit(!v); else setSaved(v); }, [phone, setSaved]);
  const toggle = useCallback(() => set(!on), [set, on]);

  // Esc = ออก (บนมือถือไม่มีคีย์บอร์ดจริง ไม่ต้องจดชั้น)
  useEscLayer(on && !phone, () => set(false));
  // อยู่ในกรอบแอปเดี่ยว → ให้เชลล์ซ่อนหัวแอป + แถบเมนูแอป
  usePageWantsFullFrame(on);

  // คีย์ลัด F
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyF" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest?.(".excalidraw"))) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkey, toggle]);

  // เต็มจอ = ล็อกการเลื่อนหน้าข้างหลัง
  useEffect(() => {
    if (!on || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [on]);

  return { on, phone, set, toggle, autoHide, pinned, setPinned };
}

type Hosts = { bar: HTMLElement | null; peek: HTMLElement | null };
const StageCtx = createContext<Hosts | null>(null);

/** กรอบที่กลายเป็นชั้นเต็มจอ — ไม่ย้ายลูกไปที่อื่น (กระดานไม่โหลดใหม่ตอนสลับ · ช่องแถบ/ชิปเป็นช่องคงที่ก่อน children) */
export function FullscreenStage({ fs, children, className = "space-y-2" }: { fs: FullscreenStageState; children: ReactNode; className?: string }) {
  const hiding = fs.on && fs.autoHide;
  const floating = hiding && !fs.pinned;
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [peek, setPeek] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const show = useCallback(() => { if (timer.current) clearTimeout(timer.current); setShown(true); }, []);
  const hideSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const a = typeof document !== "undefined" ? document.activeElement : null;
      if (a && wrapRef.current?.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;   // กำลังพิมพ์ในแถบ = ไม่ซ่อน
      setShown(false);
    }, 900);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!floating) setShown(false); }, [floating]);

  // แตะกระดาน (นอกแถบ/ชิป) = ปิดแถบ — มือถือเปิดด้วยการแตะชิป ปิดด้วยการแตะที่อื่น
  const onPointerDownCapture = (e: ReactPointerEvent) => {
    if (!floating || !shown) return;
    const t = e.target as HTMLElement;
    if (t.closest?.("[data-fs-bar],[data-fs-peek]")) return;
    setShown(false);
  };

  const ctx: Hosts | null = hiding ? { bar, peek } : null;
  return (
    <StageCtx.Provider value={ctx}>
      <div className={fs.on ? "fixed inset-0 z-[45] flex flex-col gap-2 overflow-hidden bg-slate-50 p-2" : className}
        data-fullscreen={fs.on ? "1" : undefined} onPointerDownCapture={onPointerDownCapture}>
        {hiding ? (
          <div ref={wrapRef} data-fs-bar onMouseEnter={floating ? show : undefined} onMouseLeave={floating ? hideSoon : undefined}
            className={floating
              ? `absolute inset-x-2 top-0 z-30 rounded-b-xl border border-t-0 border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur transition-transform duration-200 ${shown ? "translate-y-0" : "pointer-events-none -translate-y-full"}`
              : "flex-shrink-0"}>
            <div className="flex items-start gap-2">
              <div ref={setBar} className="flex min-w-0 flex-1 flex-col gap-2" />
              <button type="button" onClick={() => fs.setPinned(!fs.pinned)} aria-pressed={fs.pinned}
                title={fs.pinned ? "เลิกปัก — ซ่อนแถบไว้ขอบบน" : "ปักแถบให้โชว์ค้าง"}
                className={`inline-flex h-9 flex-shrink-0 items-center gap-1 rounded-lg border px-2 text-xs ${fs.pinned ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                <Icon value="i:pin" /><span className="hidden sm:inline">{fs.pinned ? "เลิกปัก" : "ปักไว้"}</span>
              </button>
            </div>
          </div>
        ) : null}
        {floating ? <div aria-hidden className="absolute inset-x-0 top-0 z-20 h-3" onMouseEnter={show} /> : null}
        {floating ? (
          <div data-fs-peek className="absolute left-1/2 top-1.5 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1">
            <div ref={setPeek} className="flex min-w-0 items-center gap-1" />
            <button type="button" onClick={() => (shown ? setShown(false) : show())} onMouseEnter={show} aria-expanded={shown}
              title="แถบเครื่องมือ" className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 text-xs text-slate-600 shadow-sm hover:bg-slate-50">
              <Icon value={shown ? "i:chevron-up" : "i:chevron-down"} /><span className="hidden sm:inline">เครื่องมือ</span>
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </StageCtx.Provider>
  );
}

/** แถบปุ่มที่ซ่อนไว้ขอบบนตอนเต็มจอ (autoHide) — order = ลำดับบนลงล่าง · นอกโหมดนี้ = แสดงที่เดิม */
export function FullscreenBar({ children, order = 0 }: { children: ReactNode; order?: number }) {
  const ctx = useContext(StageCtx);
  if (ctx?.bar) return createPortal(<div style={{ order }} className="min-w-0">{children}</div>, ctx.bar);
  return <>{children}</>;
}

/** ของที่ค้างไว้กลางขอบบนตอนแถบซ่อน (ชิปสรุป · ปุ่มเปิดถาดมือถือ) — นอกโหมดนี้ = ไม่แสดง */
export function FullscreenPeek({ children }: { children: ReactNode }) {
  const ctx = useContext(StageCtx);
  if (ctx?.peek) return createPortal(children, ctx.peek);
  return null;
}

/** อยู่ในชั้นเต็มจอที่ซ่อนแถบไหม (ลูกใช้ซ่อนของซ้ำ เช่น ปุ่มที่ย้ายไปอยู่ในชิปแล้ว) */
export function useInHiddenBarStage(): boolean {
  return !!useContext(StageCtx);
}

/** ปุ่มเข้า/ออกเต็มจอ */
export function FullscreenToggle({ fs, className = "" }: { fs: FullscreenStageState; className?: string }) {
  return (
    <button type="button" onClick={fs.toggle} aria-pressed={fs.on}
      title={fs.on ? (fs.phone ? "ออกจากเต็มจอ" : "ออกจากเต็มจอ (Esc)") : "เต็มจอ (F)"}
      className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-sm ${fs.on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"} ${className}`}>
      <Icon value={fs.on ? "i:minimize" : "i:maximize"} />
      <span className="hidden sm:inline">{fs.on ? "ออกเต็มจอ" : "เต็มจอ"}</span>
    </button>
  );
}
