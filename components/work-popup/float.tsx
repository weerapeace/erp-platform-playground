"use client";
/**
 * 🔔 ป๊อปเตือนงานแบบลอย (ส่วนของ WorkPopupHost) — การ์ดลอยมุมขวาล่าง/ขวาบน บนจอคอม แทนหน้าต่างกลางจอ
 * - เนื้อหา = WorkPopupBody เดิม (ติ๊กงานของคุณได้) · ปุ่ม ไว้ทีหลัง / ✓ รับทราบ / ดูทั้งหมด เหมือนเดิม
 * - ปุ่มเล็กลอยอยู่ทั้งวัน (ป๊อปของวันนี้ · /api/popups/active?all=1) · กางเองเมื่อถึงเวลาและยังไม่รับทราบ
 *   รับทราบ/ไว้ทีหลัง/นอกเวลา = ยุบเป็นปุ่ม กดดูได้ตลอด · ✕ / กดข้างนอก / Esc = ซ่อนเป็นปุ่มเล็ก
 *   ปิดถาวร (ไม่ถาม ไม่เด้ง) ทำได้ที่เดียว = เมนูโปรไฟล์ → 🔔 ป๊อปเตือนงาน (เจ้าของสั่ง 2026-10-30: "ปุ่มปิดคือซ่อน")
 * - ค่าตั้งต่อคน: user_ui_prefs key work_popup_float = { enabled, minimized, position } (useUserPref · บอกต่อในหน้าเดียว)
 * จอแคบกว่า FLOAT_MIN_WIDTH ยังเป็นหน้าต่างกลางจอแบบเดิม (ลอยแล้วบังงาน/ทับแถบเมนูล่าง)
 * 2026-11-03 (เจ้าของสั่ง): ปุ่มเล็ก "งานค้าง" → ตัว Pet ลอย (components/floating-pet · เลือกตัว/อัป GIF-Lottie เองได้ต่อคน)
 *   การ์ดที่กางเป็น "ศูนย์แจ้งเตือน" แบบแท็บ (tabs) — ตอนนี้ งาน + GIF ที่เพื่อนส่ง · แอปอื่นเพิ่มแท็บได้โดยส่ง FloatTab เพิ่ม
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import { cornerStyle, useCornerDrag } from "@/lib/use-corner-drag";
import { Icon } from "@/components/icon";
import { FloatingPet, PetArt, useFloatingPetPref } from "@/components/floating-pet";
import { PetPickerModal } from "@/components/floating-pet/pet-picker";
import type { PetMood } from "@/lib/floating-pet";
import {
  FLOAT_MIN_WIDTH, WORK_POPUP_FLOAT_DEFAULT, WORK_POPUP_FLOAT_KEY, WORK_POPUP_HIDE_HINT, parseWorkPopupFloatPref,
  type WorkPopupFloatPref, workPopupAnchor,
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

/** 1 แท็บในศูนย์แจ้งเตือน — แอปอื่นเพิ่มแท็บได้โดยส่งอันใหม่เข้ามา (icon = ชื่อในทะเบียนไอคอนกลาง) */
export type FloatTab = { key: string; label: string; icon: string; count?: number; subtitle?: string; content: ReactNode; footer?: ReactNode };

/** การ์ดลอย (กรอบอย่างเดียว — เนื้อหา/ปุ่มส่งมาจาก WorkPopupHost) · ตอนยุบ = ตัว Pet */
export function WorkPopupFloatCard({ pref, minimized, tabs, tab, onTab, pet, onMinimize, onExpand }: {
  pref: WorkPopupFloatPref;
  /** ยุบเป็นตัว Pet (ค่าเริ่ม: ยุบ · กางเองเมื่อมีป๊อปถึงเวลา) */
  minimized: boolean;
  tabs: FloatTab[];
  tab: string;
  onTab: (key: string) => void;
  /** สถานะตัว Pet ตอนยุบ — อารมณ์ / ตัวเลข / ฟองข้อความ */
  pet: { mood: PetMood; badge: string | null; bubble?: string | null };
  /** ✕ / กดข้างนอก / Esc = ซ่อนเป็นตัว Pet */
  onMinimize: () => void;
  onExpand: () => void;
}) {
  const [petPref] = useFloatingPetPref();
  const [pickOpen, setPickOpen] = useState(false);
  const cur = tabs.find((x) => x.key === tab) ?? tabs[0];
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

  if (minimized) {
    return (<>
      <FloatingPet source={petPref.source} size={petPref.size} mood={pet.mood} badge={pet.badge} bubble={pet.bubble}
        anchor={anchor} onDrop={(a) => setPref({ ...pref, anchor: a })} onClick={onExpand} label="ศูนย์แจ้งเตือน" />
      {pickOpen && <PetPickerModal open onClose={() => setPickOpen(false)} />}
    </>);
  }
  // ปุ่มสลับ การ์ดลอย ⇄ แถบข้าง (จำต่อคน — เลือกได้ที่เมนูโปรไฟล์ด้วย)
  const switchMode = () => setPref({ ...pref, mode: drawer ? "card" : "drawer" });
  return (
    <>
    <div ref={boxRef} role={drawer ? "complementary" : "dialog"} aria-label="ศูนย์แจ้งเตือน"
      className={drawer
        ? "fixed right-0 bottom-0 z-[45] w-[400px] max-w-[calc(100vw-2rem)] flex flex-col bg-white border-l border-slate-200 shadow-2xl overflow-hidden"
        : "fixed z-[45] w-[400px] max-w-[calc(100vw-2rem)] flex flex-col bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"}
      style={drawer ? { top: drawerTop } : { ...(drag.liveStyle ?? cornerStyle(anchor, { w: 400, h: 120 })), maxHeight: `calc(100vh - ${Math.min(anchor.y, 400) + 16}px)` }}>
      <div onPointerDown={drawer ? undefined : drag.onPointerDown} title={drawer ? undefined : "ลากที่หัวเพื่อย้ายที่"} style={drawer ? undefined : { touchAction: "none" }}
        className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-amber-50/60 select-none ${drawer ? "" : drag.dragging ? "cursor-grabbing" : "cursor-grab"}`}>
        <button type="button" data-no-drag onClick={() => setPickOpen(true)} title="เปลี่ยนตัว Pet" aria-label="เปลี่ยนตัว Pet" className="shrink-0 rounded-lg hover:bg-white">
          <PetArt source={petPref.source} size={32} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">ศูนย์แจ้งเตือน</div>
          <div className="text-[11px] text-slate-500 truncate">{cur?.subtitle ?? ""}</div>
        </div>
        <button type="button" data-no-drag onClick={switchMode} aria-label={drawer ? "สลับเป็นการ์ดลอย" : "สลับเป็นแถบข้าง"}
          title={drawer ? "สลับเป็นการ์ดลอย (กดข้างนอก = ซ่อน)" : "สลับเป็นแถบข้าง (เปิดค้างจนกด ✕)"}
          className="h-8 px-2 rounded-md text-[11px] text-slate-500 hover:bg-white hover:text-slate-800">{drawer ? "▢ การ์ด" : "▕ แถบข้าง"}</button>
        <button type="button" data-no-drag onClick={onMinimize} aria-label="ซ่อน" title="ซ่อนเป็นตัว Pet (กดที่ตัวเพื่อเปิดกลับ)"
          className="w-8 h-8 rounded-md text-slate-400 hover:bg-white hover:text-slate-700">✕</button>
      </div>
      {/* แท็บ (งาน · GIF · แอปอื่นในอนาคต) */}
      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 border-b border-slate-100 px-2">
          {tabs.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={x.key === cur?.key} onClick={() => onTab(x.key)}
              className={`-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-xs ${x.key === cur?.key ? "border-indigo-500 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              <Icon name={x.icon} /> {x.label}
              {!!x.count && <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-600">{x.count > 99 ? "99+" : x.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{cur?.content}</div>
      {cur?.footer && <div className="border-t border-slate-100 px-3 py-2">{cur.footer}</div>}
      <p className="bg-amber-50 px-3 py-1.5 text-[11px] leading-snug text-amber-800">
        {drawer
          ? <>กด <b>✕</b> = ซ่อนเป็นตัว Pet · กดรูป Pet ด้านบน = เปลี่ยนตัว · {WORK_POPUP_HIDE_HINT}</>
          : <>กด <b>✕</b> = ซ่อนเป็นตัว Pet · ลากที่หัวเพื่อย้ายที่ · กดรูป Pet = เปลี่ยนตัว · {WORK_POPUP_HIDE_HINT}</>}
      </p>
    </div>
    {pickOpen && <PetPickerModal open onClose={() => setPickOpen(false)} />}
    </>
  );
}

/** สวิตช์ในเมนูโปรไฟล์ — เปิด/ซ่อนป๊อปเตือนงาน + เลือกมุม (ใช้ใน AccountMenu) */
export function WorkPopupFloatToggle() {
  const [pref, setPref] = useWorkPopupFloatPref();
  const [petPref] = useFloatingPetPref();
  const [pickOpen, setPickOpen] = useState(false);
  return (
    <div className="px-3 py-2 border-t border-slate-100">
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="flex-1 text-xs text-slate-700">🔔 ป๊อปเตือนงาน <span className="text-[10px] text-slate-400">(ตอนเข้า ERP)</span></span>
        <input type="checkbox" className="sr-only peer" checked={pref.enabled}
          onChange={(e) => setPref({ ...pref, enabled: e.target.checked, minimized: false })} />
        <span aria-hidden className="relative w-9 h-5 rounded-full bg-slate-300 peer-checked:bg-blue-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      </label>
      {pref.enabled ? (<>
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[11px] text-slate-400 mr-1">แบบ</span>
          {([["card", "▢ การ์ดลอย"], ["drawer", "▕ แถบข้าง"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPref({ ...pref, mode: k, minimized: false })}
              title={k === "drawer" ? "แถบข้างขวา เปิดค้างจนกด ✕" : "การ์ดลอย ลากย้ายได้ กดข้างนอก = ซ่อน"}
              className={`h-6 px-2 rounded-md border text-[11px] ${(pref.mode ?? "card") === k ? "border-blue-300 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[11px] text-slate-400 mr-1">ลอยที่</span>
          {([["br", "↘ ขวาล่าง"], ["tr", "↗ ขวาบน"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPref({ ...pref, position: k, anchor: null })}
              className={`h-6 px-2 rounded-md border text-[11px] ${!pref.anchor && pref.position === k ? "border-blue-300 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
          ))}
          {pref.anchor && <span title="ลากป๊อปไปวางเองไว้ · กดมุมด้านซ้ายเพื่อกลับไปมุมสำเร็จรูป" className="h-6 px-2 leading-6 rounded-md border border-blue-300 bg-blue-50 text-blue-700 font-medium text-[11px]">📍 ที่ลากไว้</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 mr-1">ตัว Pet</span>
          <PetArt source={petPref.source} size={24} />
          <button type="button" onClick={() => setPickOpen(true)} className="h-6 px-2 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">เปลี่ยน</button>
        </div>
        {pickOpen && <PetPickerModal open onClose={() => setPickOpen(false)} />}
      </>) : (
        <p className="mt-1 text-[11px] text-slate-400">ปิดอยู่ — ป๊อปไม่เด้ง (ทุกเครื่องของคุณ)</p>
      )}
    </div>
  );
}
