"use client";

/**
 * 🔊 เสียงตอบรับสถานีแพ็ค (ข้อเสนอ 6 รอบแรก · ตั้งค่า/อัปโหลดได้ 2026-11-19) — ไม่ต้องมองจอก็รู้ผล
 *   เสียงเดิม = Web Audio สร้างเอง (ไม่ต้องโหลดไฟล์) · ชุดเสียงที่หัวหน้าอัป/อัดไว้ (ใช้ร่วมทุกโต๊ะ) แทนที่ทีละเสียง
 *   ความดัง = ความดังรวมของเครื่องนี้ × ความดังของเสียงนั้น (ตั้งกลาง)
 *   เบราว์เซอร์ต้องมีการกด/ยิงครั้งแรกก่อนถึงจะมีเสียง
 * รายชื่อเสียง/คำอธิบาย: lib/packing-sound (PACK_SOUND_INFO)
 */
import type { PackSound } from "@/lib/packing-sound";
export type { PackSound } from "@/lib/packing-sound";

let ctx: AudioContext | null = null;
export const getAudioCtx = (): AudioContext | null => {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = C ? new C() : null;
    }
    if (ctx?.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
};

/** ชุดเสียงที่ตั้งไว้ (ใช้ร่วมทุกโต๊ะ) — buffer = ไฟล์ที่อัป (ไม่มี = เสียงเดิม) · volume 0–1.5 */
type BankEntry = { buffer: AudioBuffer | null; volume: number };
const bank: Partial<Record<PackSound, BankEntry>> = {};
let master = 1;

export function setPackMasterVolume(v: number) { master = Math.max(0, Math.min(1, v)); }
export function setPackSoundEntry(k: PackSound, e: BankEntry) { bank[k] = e; }

/** data URL → AudioBuffer (ถอดไม่ได้ = null → ใช้เสียงเดิม) */
export async function decodeSound(dataUrl: string): Promise<AudioBuffer | null> {
  const c = getAudioCtx();
  if (!c) return null;
  try {
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    return await c.decodeAudioData(buf);
  } catch { return null; }
}

function tone(gainScale: number, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.25) {
  const c = getAudioCtx();
  if (!c || gainScale <= 0) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * gainScale), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/** เสียงเดิมของระบบ (scale = ความดังรวม × ความดังเสียงนั้น · 1 = เท่าเดิม) */
function playBase(kind: PackSound, s: number) {
  if (kind === "ok") tone(s, 1500, 0, 0.09, "square", 0.12);
  else if (kind === "done") { tone(s, 1100, 0, 0.1, "sine", 0.25); tone(s, 1650, 0.12, 0.18, "sine", 0.25); }
  else if (kind === "warn") { tone(s, 700, 0, 0.12, "square", 0.15); tone(s, 700, 0.18, 0.12, "square", 0.15); }
  else if (kind === "dup") { for (let i = 0; i < 3; i++) tone(s, 1250, i * 0.11, 0.07, "square", 0.13); }
  else if (kind === "cancelled") { tone(s, 520, 0, 0.25, "triangle", 0.3); tone(s, 300, 0.28, 0.45, "triangle", 0.3); }
  else if (kind === "over") { for (let i = 0; i < 4; i++) tone(s, i % 2 ? 900 : 1800, i * 0.09, 0.08, "square", 0.12); }
  else tone(s, 220, 0, 0.6, "sawtooth", 0.2);
}

/** เล่นเสียง — ใช้ไฟล์ที่ตั้งไว้ถ้ามี ไม่งั้นเสียงเดิม · override = ลองฟังค่าที่ยังไม่บันทึก (หน้าตั้งค่า) */
export function playPackSound(kind: PackSound, override?: Partial<BankEntry>) {
  const e = { buffer: bank[kind]?.buffer ?? null, volume: bank[kind]?.volume ?? 1, ...override };
  const s = master * e.volume;
  const c = getAudioCtx();
  if (e.buffer && c) {
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = e.buffer; g.gain.value = s;
    src.connect(g).connect(c.destination); src.start();
  } else playBase(kind, s);
}
