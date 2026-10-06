"use client";

/**
 * ปุ่มติดตั้งแอป (PWA) — ของกลาง
 *
 * โชว์ปุ่ม "ติดตั้งแอปนี้" เมื่อเบราว์เซอร์รองรับการติดตั้ง (beforeinstallprompt)
 * กดแล้วเด้งกล่องติดตั้งของระบบ → ได้ไอคอนแอปบน desktop/หน้าจอ เปิดมาแบบ standalone
 *
 * - ซ่อนอัตโนมัติเมื่อ: เปิดในโหมดแอปอยู่แล้ว / ติดตั้งเสร็จ / เบราว์เซอร์ไม่รองรับ
 * - iOS/iPadOS Safari ไม่มี beforeinstallprompt → โชว์คำแนะนำ "แชร์ → เพิ่มไปหน้าจอโฮม" แทน
 *   (iPad รุ่นใหม่รายงานตัวเป็น Macintosh — ต้องดู maxTouchPoints ประกอบ)
 *
 * usePwaInstall() = hook กลางให้ปุ่มอื่น (เช่น เมนูผู้ใช้ → มุมมองอุปกรณ์) เรียกติดตั้งได้เหมือนกัน
 * event beforeinstallprompt ยิงครั้งเดียวตอนโหลดหน้า → เก็บไว้ระดับโมดูล ให้คอมโพเนนต์ที่ mount ทีหลังยังใช้ได้
 */
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredGlobal: InstallPromptEvent | null = null;
let installedGlobal = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredGlobal = e as InstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { installedGlobal = true; deferredGlobal = null; notify(); });
}

export const IOS_INSTALL_HINT = "ติดตั้งบน iPhone/iPad: กดปุ่ม แชร์ (▢↑) ของ Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” → ไอคอนแอปจะอยู่บนหน้าจอ";
export const UNSUPPORTED_INSTALL_HINT = "เบราว์เซอร์นี้ยังไม่มีปุ่มติดตั้ง — ลองเมนู ⋮ ของ Chrome/Edge → “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอหลัก”";

export function usePwaInstall(): {
  installed: boolean;        // เปิดในโหมดแอปอยู่แล้ว / ติดตั้งเสร็จ
  canPrompt: boolean;        // เบราว์เซอร์พร้อมเด้งกล่องติดตั้ง
  isIOS: boolean;            // iOS/iPadOS → ต้องใช้ แชร์ → เพิ่มไปหน้าจอโฮม
  install: () => Promise<"prompted" | "ios" | "unsupported" | "installed">;
} {
  const [, bump] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) installedGlobal = true;
    setInstalled(installedGlobal);
    const ua = window.navigator.userAgent;
    const touchMac = /macintosh/i.test(ua) && (window.navigator.maxTouchPoints ?? 0) > 1;   // iPadOS ปลอมตัวเป็น Mac
    setIsIOS((/iphone|ipad|ipod/i.test(ua) || touchMac) && !/crios|fxios/i.test(ua));
    const fn = () => { setInstalled(installedGlobal); bump((n) => n + 1); };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const install = async () => {
    if (installedGlobal) return "installed" as const;
    if (deferredGlobal) {
      const ev = deferredGlobal;
      await ev.prompt();
      try { await ev.userChoice; } catch { /* ignore */ }
      deferredGlobal = null; notify();
      return "prompted" as const;
    }
    return isIOS ? ("ios" as const) : ("unsupported" as const);
  };
  return { installed, canPrompt: !!deferredGlobal, isIOS, install };
}

export function PwaInstallButton({ className }: { className?: string }) {
  const { installed, canPrompt, isIOS, install } = usePwaInstall();
  const [showIOSHint, setShowIOSHint] = useState(false);

  if (installed) return null;
  // เบราว์เซอร์ที่ยังไม่พร้อมติดตั้ง (เช่น desktop ก่อนเข้าเงื่อนไข) และไม่ใช่ iOS → ไม่โชว์ (เมนูผู้ใช้ยังมีปุ่มติดตั้งพร้อมคำแนะนำ)
  if (!canPrompt && !isIOS) return null;

  const click = async () => {
    const r = await install();
    if (r === "ios") setShowIOSHint((s) => !s);
  };

  return (
    <div className="relative">
      <button onClick={click} title="ติดตั้งเป็นแอปบนเครื่อง"
        className={className ?? "inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-white/15 hover:bg-white/25 text-white rounded-lg"}>
        📲 ติดตั้งแอป
      </button>
      {showIOSHint && (
        <div className="absolute right-0 top-9 z-30 w-56 bg-white text-slate-700 text-xs rounded-lg shadow-xl border border-slate-200 p-3 leading-relaxed">
          {IOS_INSTALL_HINT}
        </div>
      )}
    </div>
  );
}
