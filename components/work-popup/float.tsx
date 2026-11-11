"use client";
/**
 * 🔔 ป๊อปเตือนงานแบบลอย (ส่วนของ WorkPopupHost) — การ์ดลอยมุมขวาล่าง/ขวาบน บนจอคอม แทนหน้าต่างกลางจอ
 * - เนื้อหา = WorkPopupBody เดิม (ติ๊กงานของคุณได้) · ปุ่ม ไว้ทีหลัง / ✓ รับทราบ / ดูทั้งหมด เหมือนเดิม
 * - ปุ่มเล็กลอยอยู่ทั้งวัน (ป๊อปของวันนี้ · /api/popups/active?all=1) · กางเองเมื่อถึงเวลาและยังไม่รับทราบ
 *   รับทราบ/ไว้ทีหลัง/นอกเวลา = ยุบเป็นปุ่ม กดดูได้ตลอด · ✕ / กดข้างนอก / Esc = ซ่อนเป็นปุ่มเล็ก
 *   ปิดถาวร (ไม่ถาม ไม่เด้ง) ทำได้ที่เดียว = เมนูโปรไฟล์ → 🔔 ป๊อปเตือนงาน (เจ้าของสั่ง 2026-10-30: "ปุ่มปิดคือซ่อน")
 * - ค่าตั้งต่อคน: user_ui_prefs key work_popup_float = { enabled, minimized, position, … } (useUserPref · บอกต่อในหน้าเดียว)
 * จอแคบกว่า FLOAT_MIN_WIDTH ยังเป็นหน้าต่างกลางจอแบบเดิม (ลอยแล้วบังงาน/ทับแถบเมนูล่าง)
 * 2026-11-03 (เจ้าของสั่ง): ปุ่มเล็ก "งานค้าง" → ตัว Pet ลอย (components/floating-pet · เลือกตัว/อัป GIF-Lottie เองได้ต่อคน)
 *   การ์ดที่กางเป็น "ศูนย์แจ้งเตือน" แบบแท็บ (tabs) — ตอนนี้ งาน + GIF ที่เพื่อนส่ง · แอปอื่นเพิ่มแท็บได้โดยส่ง FloatTab เพิ่ม
 * 2026-11-11 (เจ้าของสั่ง "ยิ่งกว้างยิ่งเตี้ย · แท็บเลื่อนได้ ตั้งค่าได้ เปิด-ปิด สลับที่ได้"):
 *   ลากขอบปรับความกว้าง (จำต่อคน) → เนื้อหาปรับตามผ่าน FloatViewContext (แคบ 3 บรรทัดต่องาน · กลาง 2 · กว้าง 1 + แท็บขึ้นแถวหัว)
 *   แท็บ = ScrollTabs (ของกลาง) · ปุ่มปรับ = หน้า "จัดศูนย์แจ้งเตือน" ในการ์ด (ลากสลับแท็บ · เปิด/ปิด · ความกว้าง · แบบ · รูป)
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import { cornerStyle, useCornerDrag, viewportSize } from "@/lib/use-corner-drag";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ScrollTabs } from "@/components/scroll-tabs";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { ToggleSwitch } from "@/components/toggle-switch";
import { FloatingPet, PetArt, useFloatingPetPref } from "@/components/floating-pet";
import { PetPickerModal } from "@/components/floating-pet/pet-picker";
import type { PetMood } from "@/lib/floating-pet";
import {
  CENTER_TABS, FLOAT_MIN_WIDTH, FLOAT_WIDTH_DEFAULT, FLOAT_WIDTH_PRESETS, WORK_POPUP_FLOAT_DEFAULT, WORK_POPUP_FLOAT_KEY, WORK_POPUP_HIDE_HINT,
  clampFloatWidth, floatLevel, nextWidthPreset, orderTabs, parseWorkPopupFloatPref,
  type FloatLevel, type WorkPopupFloatPref, workPopupAnchor,
} from "./float-pref";

export { WORK_POPUP_HIDE_HINT } from "./float-pref";

export function useWorkPopupFloatPref() {
  return useUserPref<WorkPopupFloatPref>(WORK_POPUP_FLOAT_KEY, WORK_POPUP_FLOAT_DEFAULT, parseWorkPopupFloatPref);
}

/** จอกว้างพอให้ลอยไหม (อัปเดตเมื่อย่อ/ขยายหน้าต่าง) */
export function useFloatScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${FLOAT_MIN_WIDTH}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** 1 แท็บในศูนย์แจ้งเตือน — แอปอื่นเพิ่มแท็บได้โดยส่งอันใหม่เข้ามา (icon = ชื่อในทะเบียนไอคอนกลาง)
 *  flush = เนื้อหาชิดขอบการ์ด (แถวเต็มความกว้าง เช่น แท็บงาน) · ไม่ใส่ = มีขอบใน p-3 แบบเดิม
 *  เพิ่มแท็บใหม่ → ใส่ key ใน CENTER_TABS (./float-pref) ด้วย เพื่อให้จัดลำดับ/ปิดได้ในหน้า "จัดศูนย์แจ้งเตือน" */
export type FloatTab = { key: string; label: string; icon: string; count?: number; subtitle?: string; content: ReactNode; footer?: ReactNode; flush?: boolean };

/** ความกว้างตอนนี้ของการ์ด → เนื้อหาในแท็บปรับตาม (ยิ่งกว้างยิ่งเตี้ย) · นอกการ์ด (หน้าต่างกลางจอ/ตัวอย่างในหน้าตั้งค่า) = แคบ */
export type FloatView = { level: FloatLevel; hideImg: boolean };
export const FloatViewContext = createContext<FloatView>({ level: 1, hideImg: false });
export const useFloatView = () => useContext(FloatViewContext);

const HEAD_BTN = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800";

/** การ์ดลอย (กรอบอย่างเดียว — เนื้อหา/ปุ่มส่งมาจาก WorkPopupHost) · ตอนยุบ = ตัว Pet */
export function WorkPopupFloatCard({ pref, minimized, tabs, tab, onTab, pet, onMinimize, onExpand }: {
  pref: WorkPopupFloatPref;
  /** ยุบเป็นตัว Pet (ค่าเริ่ม: ยุบ · กางเองเมื่อมีป๊อปถึงเวลา) */
  minimized: boolean;
  tabs: FloatTab[];
  tab: string;
  onTab: (key: string) => void;
  /** สถานะตัว Pet ตอนยุบ — อารมณ์ / ตัวเลข / ฟองข้อความ */
  pet: { mood: PetMood; badge: string | null; bubble?: string | null; stickyBubble?: boolean };
  /** ✕ / กดข้างนอก / Esc = ซ่อนเป็นตัว Pet */
  onMinimize: () => void;
  onExpand: () => void;
}) {
  const [petPref] = useFloatingPetPref();
  const [pickOpen, setPickOpen] = useState<false | "pet" | "notify">(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const ordered = orderTabs(tabs, pref.tabOrder);
  const cur = ordered.find((x) => x.key === tab) ?? ordered[0];
  // แบบแถบข้าง: เปิดค้างจนกด ✕ (กดข้างนอก/Esc ไม่ปิด) · ชิดขวาใต้แถบเมนูบน (ไม่บังกระดิ่ง/โปรไฟล์ในหัวแอป)
  const drawer = pref.mode === "drawer";
  const [drawerTop, setDrawerTop] = useState(0);
  useEffect(() => {
    if (!drawer || minimized) return;
    const measure = () => {
      let top = 0;
      document.querySelectorAll<HTMLElement>("[data-shell-topbar], header").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < 160 && r.top <= 1 && r.right > window.innerWidth - 420) top = Math.max(top, r.bottom);
      });
      setDrawerTop(Math.round(top));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [drawer, minimized]);

  // การ์ดลอย: กดข้างนอกการ์ด / กด Esc = ซ่อนเป็นปุ่มเล็ก (ปุ่มยังลอยอยู่ กดกางใหม่ได้) · ตอนเปิดหน้าต่างเลือก Pet ไม่ยุบ
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (minimized || drawer || pickOpen) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) onMinimize(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onMinimize(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [minimized, drawer, pickOpen, onMinimize]);

  // ลากย้ายได้ (ปุ่มเล็ก = ลากทั้งปุ่ม · การ์ด = ลากที่หัว) → จำมุม+ระยะต่อคน (ของกลาง lib/use-corner-drag)
  const [, setPref] = useWorkPopupFloatPref();
  const drag = useCornerDrag((a) => setPref({ ...pref, anchor: a }));
  const anchor = workPopupAnchor(pref);

  // ── ความกว้าง: ลากขอบฝั่งที่ไม่ได้เกาะมุมจอ · จำต่อคนตอนปล่อย · ไม่เกินพื้นที่ที่เหลือบนจอ ──
  const [vw, setVw] = useState(() => viewportSize().w);
  useEffect(() => {
    const on = () => setVw(viewportSize().w);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const room = drawer ? vw - 16 : vw - Math.min(anchor.x, vw) - 16;
  // ระหว่างลาก: ขยับความกว้างที่กล่องตรง ๆ เฟรมละครั้ง (ไม่วาดเนื้อหาใหม่ทุกพิกเซล = ลื่น)
  //   วาดเนื้อหาใหม่เฉพาะตอนข้ามขั้น แคบ/กลาง/กว้าง (liveW) · ปล่อยแล้วจำต่อคน
  //   (เจ้าของบ่น 2026-11-11 "ลากแล้วกระตุก ค่อย ๆ ออก" — เดิม setState ทุกพิกเซล → แท็บงานทั้งรายการวาดใหม่ทุกครั้ง)
  const [liveW, setLiveW] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const width = clampFloatWidth(liveW ?? pref.width ?? FLOAT_WIDTH_DEFAULT, room);
  const level = floatLevel(width);
  const hideImg = !!pref.hideImg;
  const view = useMemo<FloatView>(() => ({ level, hideImg }), [level, hideImg]);   // ค่าเดิม = เนื้อหาไม่วาดใหม่
  const resizeLeft = drawer || anchor.h === "r";
  const setWidth = (w: number) => setPref({ ...pref, width: clampFloatWidth(w, room) });
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = boxRef.current;
    const sx = e.clientX, sw = width;
    let last = sw, lastLevel = floatLevel(sw), raf = 0;
    setResizing(true);
    const paint = () => {
      raf = 0;
      if (el) el.style.width = `${last}px`;
      const lv = floatLevel(last);
      if (lv !== lastLevel) { lastLevel = lv; setLiveW(last); }
    };
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      last = clampFloatWidth(sw + (resizeLeft ? sx - ev.clientX : ev.clientX - sx), room);
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (raf) cancelAnimationFrame(raf);
      if (el) el.style.width = `${last}px`;
      setResizing(false);
      setLiveW(null);
      if (last !== sw) setPref({ ...pref, width: last });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  if (minimized) {
    return (<>
      <FloatingPet source={petPref.source} size={petPref.size} mood={pet.mood} badge={pet.badge} bubble={pet.bubble} stickyBubble={pet.stickyBubble}
        anchor={anchor} onDrop={(a) => setPref({ ...pref, anchor: a })} onClick={onExpand} label="ศูนย์แจ้งเตือน" />
      {pickOpen && <PetPickerModal open initialTab={pickOpen} onClose={() => setPickOpen(false)} />}
    </>);
  }
  // ปุ่มสลับ การ์ดลอย ⇄ แถบข้าง (จำต่อคน — เลือกได้ที่เมนูโปรไฟล์ / หน้าจัดศูนย์แจ้งเตือนด้วย)
  const switchMode = () => setPref({ ...pref, mode: drawer ? "card" : "drawer" });
  // แถบแท็บ (เลื่อนได้ · กดแล้วเลื่อนให้อยู่กลาง) — จอแคบ/กลาง = แถวของตัวเองใต้หัว · กว้าง = อยู่ในแถวหัวเลย (เตี้ยลง 1 แถว)
  const tabsBar = ordered.length > 1 && !layoutOpen && (
    <div data-no-drag role="tablist" aria-label="แท็บแจ้งเตือน" className={level === 3 ? "min-w-0 flex-1 pl-1" : "px-2 pb-1.5"}>
      <ScrollTabs activeKey={cur?.key}>
        {ordered.map((x) => {
          const on = x.key === cur?.key;
          return (
            <button key={x.key} type="button" role="tab" data-tab-key={x.key} aria-selected={on} onClick={() => onTab(x.key)}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs ${on ? "bg-slate-800 font-medium text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <Icon name={x.icon} /> {x.label}
              {!!x.count && <span className={`rounded-full px-1.5 text-[10px] font-semibold leading-4 ${on ? "bg-white/20 text-white" : "bg-rose-50 text-rose-600"}`}>{x.count > 99 ? "99+" : x.count}</span>}
            </button>
          );
        })}
      </ScrollTabs>
    </div>
  );
  const sub = layoutOpen ? "จัดแท็บ · ความกว้าง · การแสดงผล" : cur?.subtitle ?? "";
  return (
    <>
    <div ref={boxRef} role={drawer ? "complementary" : "dialog"} aria-label="ศูนย์แจ้งเตือน"
      className={`${drawer
        ? "fixed right-0 bottom-0 z-[45] max-w-[calc(100vw-2rem)] flex flex-col bg-white border-l border-slate-200 shadow-2xl overflow-hidden"
        : "fixed z-[45] max-w-[calc(100vw-2rem)] flex flex-col bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"}${resizing ? " select-none cursor-ew-resize" : ""}`}
      style={drawer ? { top: drawerTop, width } : { ...(drag.liveStyle ?? cornerStyle(anchor, { w: width, h: 120 })), width, maxHeight: `calc(100vh - ${Math.min(anchor.y, 400) + 16}px)` }}>
      {/* ขอบลากปรับความกว้าง (ฝั่งที่ไม่ได้เกาะมุมจอ) */}
      <div onPointerDown={startResize} data-no-drag title="ลากเพื่อปรับความกว้าง (ยิ่งกว้าง รายการยิ่งเตี้ย)" aria-hidden
        className={`group absolute inset-y-0 z-20 w-2 cursor-ew-resize ${resizeLeft ? "left-0" : "right-0"}`} style={{ touchAction: "none" }}>
        <span className={`absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${resizing ? "bg-indigo-400" : "bg-slate-200 group-hover:bg-indigo-300"}`} />
      </div>
      <div className="border-b border-slate-100">
        <div onPointerDown={drawer ? undefined : drag.onPointerDown} title={drawer ? undefined : "ลากที่หัวเพื่อย้ายที่"} style={drawer ? undefined : { touchAction: "none" }}
          className={`flex items-center gap-1.5 py-1.5 pl-3 pr-1.5 select-none ${drawer ? "" : drag.dragging ? "cursor-grabbing" : "cursor-grab"}`}>
          <button type="button" data-no-drag onClick={() => setPickOpen("pet")} title="เปลี่ยนตัว Pet" aria-label="เปลี่ยนตัว Pet" className="shrink-0 rounded-lg hover:bg-slate-100">
            <PetArt source={petPref.source} size={26} />
          </button>
          <div className={`min-w-0 ${level === 3 ? "shrink-0" : "flex-1"}`} title={level === 3 ? sub : undefined}>
            <div className="truncate text-[13px] font-semibold leading-tight text-slate-800">ศูนย์แจ้งเตือน</div>
            {level < 3 && <div className="truncate text-[11px] leading-tight text-slate-500">{sub}</div>}
          </div>
          {level === 3 && (tabsBar || <div className="flex-1" />)}
          <button type="button" data-no-drag onClick={() => setWidth(nextWidthPreset(width, room))} aria-label="สลับความกว้าง"
            title={`สลับความกว้าง แคบ / กลาง / กว้าง (ตอนนี้ ${width}px) — หรือลากขอบกล่อง`} className={HEAD_BTN}><Icon value="i:arrows-exchange" /></button>
          <button type="button" data-no-drag onClick={() => setLayoutOpen((v) => !v)} aria-pressed={layoutOpen} aria-label="จัดศูนย์แจ้งเตือน"
            title="จัดแท็บ (ลากสลับที่ · เปิด/ปิด) · ความกว้าง · การแสดงผล"
            className={`${HEAD_BTN} ${layoutOpen ? "bg-indigo-50 text-indigo-700" : ""}`}><Icon value="i:adjustments-horizontal" /></button>
          <button type="button" data-no-drag onClick={switchMode} aria-label={drawer ? "สลับเป็นการ์ดลอย" : "สลับเป็นแถบข้าง"}
            title={drawer ? "สลับเป็นการ์ดลอย (กดข้างนอก = ซ่อน)" : "สลับเป็นแถบข้าง (เปิดค้างจนกด ✕)"} className={HEAD_BTN}>
            <Icon value={drawer ? "i:square" : "i:layout-sidebar-right"} /></button>
          <button type="button" data-no-drag onClick={onMinimize} aria-label="ซ่อน" title={`ซ่อนเป็นตัว Pet (กดที่ตัวเพื่อเปิดกลับ) · ${WORK_POPUP_HIDE_HINT}`}
            className={HEAD_BTN}><Icon value="i:x" /></button>
        </div>
        {level < 3 && tabsBar}
      </div>
      <FloatViewContext.Provider value={view}>
        {layoutOpen ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CenterLayoutPanel pref={pref} setPref={setPref} tabs={tabs} width={width} room={room} level={level}
              onDone={() => setLayoutOpen(false)} onNotify={() => setPickOpen("notify")} onPet={() => setPickOpen("pet")} />
          </div>
        ) : (
          <div className={`flex-1 min-h-0 overflow-y-auto ${cur?.flush ? "" : "p-3"}`}>{cur?.content}</div>
        )}
        {!layoutOpen && cur?.footer && <div className="border-t border-slate-100 px-3 py-1.5">{cur.footer}</div>}
      </FloatViewContext.Provider>
    </div>
    {pickOpen && <PetPickerModal open initialTab={pickOpen} onClose={() => setPickOpen(false)} />}
    </>
  );
}

const SEG = (on: boolean) => `h-7 whitespace-nowrap rounded-md px-2.5 text-xs ${on ? "bg-white font-medium text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`;
const PRESET_LABEL = ["แคบ", "กลาง", "กว้าง"];
const PRESET_HINT = ["3 บรรทัดต่องาน", "2 บรรทัดต่องาน", "1 บรรทัดต่องาน + แท็บขึ้นไปอยู่แถวหัว"];

/** หน้า "จัดศูนย์แจ้งเตือน" ในการ์ด — ลากสลับลำดับแท็บ (ของกลาง sortable-list) · เปิด/ปิดแท็บ (ToggleSwitch) · ความกว้าง · แบบ · รูปในแท็บงาน
 *  ค่าเก็บใน work_popup_float เดียวกับตำแหน่ง (ต่อคน ทุกเครื่อง) · เรื่องไหนจะเตือน/เด้ง = ปุ่ม "ตั้งค่าว่าจะเตือนเรื่องไหน" (หน้าต่างเดิม) */
function CenterLayoutPanel({ pref, setPref, tabs, width, room, level, onDone, onNotify, onPet }: {
  pref: WorkPopupFloatPref; setPref: (p: WorkPopupFloatPref) => void; tabs: FloatTab[];
  width: number; room: number; level: FloatLevel; onDone: () => void; onNotify: () => void; onPet: () => void;
}) {
  const { can, permsReady } = useAuth();
  const present = new Map(tabs.map((t) => [t.key, t.count ?? 0]));
  const hidden = new Set(pref.tabHidden ?? []);
  // แท็บที่มีสิทธิ์เห็น (รอสิทธิ์โหลดก่อน กันแถวโผล่แล้วหาย) + แท็บที่ตอนนี้มีอยู่จริง
  const allowed = CENTER_TABS.filter((t) => present.has(t.key) || !t.perm || (permsReady && t.perm.some((p) => can(p as Parameters<typeof can>[0]))));
  const list = orderTabs(allowed, pref.tabOrder);
  const { rowProps, handleProps, rowCls } = useDragReorder(
    (from, to) => setPref({ ...pref, tabOrder: moveItem(list, from, to).map((t) => t.key) }),
    { group: "center-tabs" },
  );
  const shownCount = list.filter((t) => !hidden.has(t.key)).length;
  const toggle = (key: string, on: boolean) => {
    const next = on ? [...hidden].filter((k) => k !== key) : [...hidden, key];
    setPref({ ...pref, tabHidden: next.length ? next : undefined });
  };
  const nearest = FLOAT_WIDTH_PRESETS.reduce((b, p, i) => (Math.abs(p - width) < Math.abs(FLOAT_WIDTH_PRESETS[b] - width) ? i : b), 0);
  return (
    <div className="space-y-3 py-2.5">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-3 pb-1.5">
          <h3 className="text-xs font-semibold text-slate-700">แท็บ</h3>
          <span className="text-[11px] text-slate-400">ลากหูจับเพื่อสลับที่ · ปิดสวิตช์เพื่อซ่อน</span>
        </div>
        <div className={`grid gap-1 px-3 ${level === 3 ? "grid-cols-2" : "grid-cols-1"}`}>
          {list.map((t, i) => {
            const on = !hidden.has(t.key);
            const n = present.get(t.key);
            const last = on && shownCount <= 1;
            return (
              <div key={t.key} {...rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-2 text-sm ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} title="ลากเพื่อสลับที่" />
                <span className={on ? "text-slate-600" : "text-slate-300"}><Icon name={t.icon} /></span>
                <span className={`min-w-0 flex-1 truncate ${on ? "text-slate-800" : "text-slate-400"}`}>{t.label}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{!on ? "ซ่อนอยู่" : n == null ? "ไม่มีเรื่องตอนนี้" : n ? `${n} เรื่อง` : "เปิดอยู่"}</span>
                <ToggleSwitch size="sm" on={on} onChange={(v) => toggle(t.key, v)} disabled={last}
                  title={last ? "ต้องเปิดไว้อย่างน้อย 1 แท็บ" : on ? `ซ่อนแท็บ ${t.label}` : `โชว์แท็บ ${t.label}`} />
              </div>
            );
          })}
        </div>
      </section>
      <section className="space-y-1.5 px-3">
        <h3 className="text-xs font-semibold text-slate-700">การแสดงผล</h3>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-slate-700">ความกว้าง <span className="text-[11px] text-slate-400">({width}px · ลากขอบกล่องก็ได้)</span></span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {FLOAT_WIDTH_PRESETS.map((p, i) => (
              <button key={p} type="button" onClick={() => setPref({ ...pref, width: clampFloatWidth(p, room) })} className={SEG(i === nearest)}
                title={PRESET_HINT[i]}>{PRESET_LABEL[i]}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-slate-700">แบบ</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {([["card", "การ์ดลอย"], ["drawer", "แถบข้าง"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPref({ ...pref, mode: k })} className={SEG((pref.mode ?? "card") === k)}
                title={k === "drawer" ? "แถบข้างขวา เปิดค้างจนกด ✕" : "การ์ดลอย ลากย้ายได้ กดข้างนอก = ซ่อน"}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-slate-700">รูปสินค้าในแท็บงาน</span>
          <ToggleSwitch size="sm" on={!pref.hideImg} onChange={(v) => setPref({ ...pref, hideImg: v ? undefined : true })} title="ปิด = แถวเตี้ยลงอีก" />
        </div>
      </section>
      <section className="flex flex-wrap gap-1.5 px-3">
        <button type="button" onClick={onNotify} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50">
          <Icon name="notify" /> ตั้งค่าว่าจะเตือนเรื่องไหน</button>
        <button type="button" onClick={onPet} className="h-7 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50">เปลี่ยนตัว Pet</button>
      </section>
      <p className="mx-3 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-500">
        กด ✕ = ซ่อนเป็นตัว Pet · ลากที่หัวเพื่อย้ายที่ · กดรูป Pet = เปลี่ยนตัว · {WORK_POPUP_HIDE_HINT}
      </p>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 pt-2">
        <button type="button" onClick={() => setPref({ ...pref, width: undefined, tabOrder: undefined, tabHidden: undefined, hideImg: undefined })}
          className="h-7 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100">คืนค่าเริ่มต้น</button>
        <button type="button" onClick={onDone} className="h-7 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">เสร็จ</button>
      </div>
    </div>
  );
}

/** สวิตช์ในเมนูโปรไฟล์ — เปิด/ซ่อนป๊อปเตือนงาน + เลือกมุม (ใช้ใน AccountMenu) */
export function WorkPopupFloatToggle() {
  const [pref, setPref] = useWorkPopupFloatPref();
  const [petPref] = useFloatingPetPref();
  const [pickOpen, setPickOpen] = useState<false | "pet" | "notify">(false);
  return (
    <div className="px-3 py-2 border-t border-slate-100">
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="flex-1 text-xs text-slate-700">🔔 ป๊อปเตือนงาน <span className="text-[10px] text-slate-400">(ตอนเข้า ERP)</span></span>
        <input type="checkbox" className="sr-only peer" checked={pref.enabled}
          onChange={(e) => setPref({ ...pref, enabled: e.target.checked, minimized: false })} />
        <span aria-hidden className="relative w-9 h-5 rounded-full bg-slate-300 peer-checked:bg-blue-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      </label>
      {pref.enabled ? (<>
        {/* หัวข้อซ้ายกว้างเท่ากันทุกแถว · ปุ่มไม่หักบรรทัดในตัว (เมนูแคบ/ตัวอักษรใหญ่ = ปุ่มขึ้นบรรทัดใหม่ทั้งปุ่ม ไม่ทับกัน) */}
        <div className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
          <span className="whitespace-nowrap text-[11px] text-slate-400">แบบ</span>
          <div className="flex flex-wrap gap-1">
            {([["card", "▢ การ์ดลอย"], ["drawer", "▕ แถบข้าง"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPref({ ...pref, mode: k, minimized: false })}
                title={k === "drawer" ? "แถบข้างขวา เปิดค้างจนกด ✕" : "การ์ดลอย ลากย้ายได้ กดข้างนอก = ซ่อน"}
                className={`min-h-6 whitespace-nowrap px-2 py-0.5 rounded-md border text-[11px] ${(pref.mode ?? "card") === k ? "border-blue-300 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
          <span className="whitespace-nowrap text-[11px] text-slate-400">ลอยที่</span>
          <div className="flex flex-wrap gap-1">
            {([["br", "↘ ขวาล่าง"], ["tr", "↗ ขวาบน"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPref({ ...pref, position: k, anchor: null })}
                className={`min-h-6 whitespace-nowrap px-2 py-0.5 rounded-md border text-[11px] ${!pref.anchor && pref.position === k ? "border-blue-300 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
            ))}
            {pref.anchor && <span title="ลากป๊อปไปวางเองไว้ · กดมุมสำเร็จรูปเพื่อกลับไปมุมนั้น" className="inline-flex min-h-6 items-center whitespace-nowrap px-2 py-0.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 font-medium text-[11px]">📍 ที่ลากไว้</span>}
          </div>
          <span className="whitespace-nowrap text-[11px] text-slate-400">ตัว Pet</span>
          <div className="flex items-center gap-1.5">
            <PetArt source={petPref.source} size={24} />
            <button type="button" onClick={() => setPickOpen("pet")} className="min-h-6 whitespace-nowrap px-2 py-0.5 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">เปลี่ยน</button>
          </div>
          {/* แท็บที่ซ่อนไว้ในหน้า "จัดศูนย์แจ้งเตือน" — ทางกลับเผื่อซ่อนจนหาไม่เจอ */}
          {!!pref.tabHidden?.length && (<>
            <span className="whitespace-nowrap text-[11px] text-slate-400">แท็บ</span>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              ซ่อนไว้ {pref.tabHidden.length} แท็บ
              <button type="button" onClick={() => setPref({ ...pref, tabHidden: undefined })} className="min-h-6 whitespace-nowrap px-2 py-0.5 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">โชว์ทั้งหมด</button>
            </div>
          </>)}
          <span className="whitespace-nowrap text-[11px] text-slate-400">เตือนอะไร</span>
          <div>
            <button type="button" onClick={() => setPickOpen("notify")} className="min-h-6 whitespace-nowrap px-2 py-0.5 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">ตั้งค่าการแจ้งเตือน</button>
          </div>
        </div>
        {pickOpen && <PetPickerModal open initialTab={pickOpen} onClose={() => setPickOpen(false)} />}
      </>) : (
        <p className="mt-1 text-[11px] text-slate-400">ปิดอยู่ (ค่าเริ่มต้น) — ไม่มีตัว Pet / ป๊อปไม่เด้ง · เปิดสวิตช์เพื่อโชว์ (ทุกเครื่องของคุณ)</p>
      )}
    </div>
  );
}
