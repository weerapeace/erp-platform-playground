"use client";

/**
 * ปุ่มติดตั้งแอป (PWA) — ของกลาง
 *
 * โชว์ปุ่ม "ติดตั้งแอปนี้" เมื่อเบราว์เซอร์รองรับการติดตั้ง (beforeinstallprompt)
 * กดแล้วเด้งกล่องติดตั้งของระบบ → ได้ไอคอนแอปบน desktop/หน้าจอ เปิดมาแบบ standalone
 *
 * - ซ่อนอัตโนมัติเมื่อ: เปิดในโหมดแอปอยู่แล้ว / ติดตั้งเสร็จ / เบราว์เซอร์ไม่รองรับ
 * - iOS Safari ไม่มี beforeinstallprompt → โชว์คำแนะนำ "แชร์ → เพิ่มไปหน้าจอโฮม" แทน
 */
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // เปิดในโหมดแอปอยู่แล้ว → ไม่ต้องโชว์ปุ่ม
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const ua = window.navigator.userAgent;
    const iOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    setIsIOS(iOS);

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const click = async () => {
    if (deferred) {
      await deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      setDeferred(null);
    } else if (isIOS) {
      setShowIOSHint((s) => !s);
    }
  };

  // เบราว์เซอร์ที่ยังไม่พร้อมติดตั้ง (เช่น desktop ก่อนเข้าเงื่อนไข) และไม่ใช่ iOS → ไม่โชว์
  if (!deferred && !isIOS) return null;

  return (
    <div className="relative">
      <button onClick={click} title="ติดตั้งเป็นแอปบนเครื่อง"
        className={className ?? "inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-white/15 hover:bg-white/25 text-white rounded-lg"}>
        📲 ติดตั้งแอป
      </button>
      {showIOSHint && (
        <div className="absolute right-0 top-9 z-30 w-56 bg-white text-slate-700 text-xs rounded-lg shadow-xl border border-slate-200 p-3 leading-relaxed">
          ติดตั้งบน iPhone/iPad: กดปุ่ม <b>แชร์</b> (▢↑) ด้านล่าง แล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b>
        </div>
      )}
    </div>
  );
}
