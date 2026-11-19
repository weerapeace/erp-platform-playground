"use client";
/**
 * ⛶ โหมดเต็มจอของกระดาน/ผัง (ของกลาง) — เจ้าของขอ 2026-11-19 "อยากให้ใหญ่เต็มจอแบบ Miro" (เลือก F1 F2 F3 F5 F6 F7)
 *   - เต็มจอ = ซ่อนหัวเว็บ/เมนูแอป/แถบปุ่มของหน้า ให้กระดานใช้พื้นที่ 100% (ชั้นลอย fixed เหนือ shell แต่ต่ำกว่าป๊อปอัปกลาง z-50)
 *   - ปุ่ม FullscreenToggle · คีย์ลัด F (ใช้ตำแหน่งปุ่ม KeyF → แป้นไทยก็ได้ · ไม่ทำงานตอนพิมพ์ในช่อง/อยู่ในกระดานวาด Excalidraw ที่ F = เครื่องมือกรอบ)
 *   - Esc = ออก (ผ่านกองกลาง useEscLayer — ป๊อปที่เปิดทับอยู่ปิดก่อน)
 *   - จำต่อคน (useUserPref) → เปิดหน้านี้ครั้งหน้าเต็มจอเลย
 *   - มือถือ (จอ < 768) = เต็มจอเสมอ · กด "ออก" ได้ชั่วคราว (ไม่จำ)
 * ใช้:
 *   const fs = useFullscreenStage("team_plan_board_fullscreen");
 *   <FullscreenStage fs={fs}> ...แถบปุ่ม + <div className={fs.on ? "min-h-0 flex-1" : ""}>กระดาน height={fs.on ? "100%" : "calc(100vh - 260px)"}</div> </FullscreenStage>
 *   <FullscreenToggle fs={fs} />
 * ห้ามใช้: ป๊อปฝังหน้าอื่น (ใช้ EmbedModal ที่มีปุ่มเต็มจอเอง) · ดูรูปเต็มจอ (ImageLightbox) · แอปแยกทั้งหน้า (StandaloneShell)
 * doc: docs/fullscreen-stage.md
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useEscLayer } from "@/components/modal/esc-layer";
import { useUserPref } from "@/lib/use-user-pref";

const PHONE_MQ = "(max-width: 767px)";

export type FullscreenStageState = {
  /** ตอนนี้เต็มจออยู่ไหม */
  on: boolean;
  /** จอมือถือ (เต็มจอเสมอ เว้นแต่กดออกชั่วคราว) */
  phone: boolean;
  set: (v: boolean) => void;
  toggle: () => void;
};

const parseBool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** active = หน้านี้กำลังโชว์กระดานอยู่ไหม (เช่น อยู่แท็บอื่น = false → ไม่เต็มจอ ไม่ฟังคีย์ แม้เป็นมือถือ) */
export function useFullscreenStage(prefKey: string, opts: { hotkey?: boolean; active?: boolean } = {}): FullscreenStageState {
  const { active = true } = opts;
  const hotkey = (opts.hotkey ?? true) && active;
  const [saved, setSaved] = useUserPref<boolean>(prefKey, false, parseBool);
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

  return { on, phone, set, toggle };
}

/** กรอบที่กลายเป็นชั้นเต็มจอ — ไม่ย้ายลูกไปที่อื่น (กระดานไม่โหลดใหม่ตอนสลับ) */
export function FullscreenStage({ fs, children, className = "space-y-2" }: { fs: FullscreenStageState; children: ReactNode; className?: string }) {
  return (
    <div className={fs.on ? "fixed inset-0 z-[45] flex flex-col gap-2 overflow-hidden bg-slate-50 p-2" : className} data-fullscreen={fs.on ? "1" : undefined}>
      {children}
    </div>
  );
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
