"use client";

/**
 * 🚦 ไฟเต็มจอ (ข้อเสนอ 4 รอบมือถือ · 2026-11-19) — ยิงถูก = ขอบจอเขียว · ผิด = แดง (+ สั่น) · เตือน = เหลือง
 *   เห็นจากไกล ๆ ไม่ต้องอ่านตัวหนังสือ · ไม่บังการกด (pointer-events-none) · ปิดได้ในตั้งค่าสถานี
 */
import { useEffect, useState } from "react";
import type { PackSound } from "@/lib/packing-sound";

export type FlashPulse = { kind: PackSound; at: number };
type Tone = "green" | "red" | "amber";

export const pulseTone = (k: PackSound): Tone => (k === "ok" || k === "done" ? "green" : k === "warn" || k === "dup" ? "amber" : "red");
/** สั่น (Android) — ผิด/ยกเลิก/เกิน สั่นยาว · เตือน/ซ้ำ สั่นสั้น · ถูก ไม่สั่น */
export function vibrateFor(k: PackSound) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const t = pulseTone(k);
  if (t === "red") navigator.vibrate([200, 80, 200]);
  else if (t === "amber") navigator.vibrate(120);
}

const COLOR: Record<Tone, { ring: string; tint: string }> = {
  green: { ring: "rgba(5,150,105,0.85)", tint: "rgba(16,185,129,0.10)" },
  red: { ring: "rgba(220,38,38,0.9)", tint: "rgba(239,68,68,0.18)" },
  amber: { ring: "rgba(217,119,6,0.85)", tint: "rgba(245,158,11,0.12)" },
};

export function ScreenFlash({ pulse }: { pulse: FlashPulse | null }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), pulseTone(pulse.kind) === "green" ? 260 : 700);
    return () => window.clearTimeout(t);
  }, [pulse]);
  if (!pulse) return null;
  const c = COLOR[pulseTone(pulse.kind)];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] transition-opacity duration-300"
      style={{ opacity: on ? 1 : 0, boxShadow: `inset 0 0 0 10px ${c.ring}`, background: c.tint }} />
  );
}
