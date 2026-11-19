"use client";

/**
 * 💡 จอไม่ดับระหว่างแพ็ค (ข้อเสนอ 2 รอบมือถือ · 2026-11-19) — ขอเบราว์เซอร์ไม่ให้จอล็อกตอนเปิดหน้าสถานี
 *   สลับแอป/ปิดจอแล้วกลับมา = ขอใหม่เอง (เบราว์เซอร์ปล่อยเองทุกครั้งที่หน้าถูกซ่อน)
 *   เบราว์เซอร์ที่ไม่รองรับ = ไม่ทำอะไร (คืน false)
 */
import { useEffect, useState } from "react";

type Sentinel = { release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };
type WakeNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };

export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const nav = navigator as WakeNav;
    if (!enabled || !nav.wakeLock) { setHeld(false); return; }
    let lock: Sentinel | null = null;
    let alive = true;
    const ask = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const l = await nav.wakeLock!.request("screen");
        if (!alive) { void l.release(); return; }
        lock = l; setHeld(true);
        l.addEventListener("release", () => { lock = null; if (alive) setHeld(false); });
      } catch { setHeld(false); }   // แบตต่ำ / ไม่อนุญาต
    };
    void ask();
    const onVis = () => { void ask(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); void lock?.release().catch(() => {}); lock = null; setHeld(false); };
  }, [enabled]);
  return held;
}
