"use client";

/**
 * 🔊 เสียงตอบรับสถานีแพ็ค (ข้อเสนอ 6) — ไม่ต้องมองจอก็รู้ผล
 *   ok    = ติ๊ดสั้น (ยิงสินค้าถูก)       done  = ติ๊ด-ติ๊ด ขึ้น (ครบ/แพ็คเสร็จ)
 *   error = บี๊บยาวต่ำ (ผิด/ห้ามแพ็ค)     warn  = ตึ๊ด ๆ สองที (เตือน)
 * ใช้ Web Audio สร้างเสียงเอง ไม่ต้องโหลดไฟล์ · เบราว์เซอร์ต้องมีการกด/ยิงครั้งแรกก่อนถึงจะมีเสียง
 */
export type PackSound = "ok" | "done" | "error" | "warn";

let ctx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = C ? new C() : null;
    }
    if (ctx?.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.25) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export function playPackSound(kind: PackSound) {
  if (kind === "ok") tone(1500, 0, 0.09, "square", 0.12);
  else if (kind === "done") { tone(1100, 0, 0.1, "sine", 0.25); tone(1650, 0.12, 0.18, "sine", 0.25); }
  else if (kind === "warn") { tone(700, 0, 0.12, "square", 0.15); tone(700, 0.18, 0.12, "square", 0.15); }
  else tone(220, 0, 0.6, "sawtooth", 0.2);
  if (kind === "error" && navigator.vibrate) navigator.vibrate([200, 80, 200]);
}
