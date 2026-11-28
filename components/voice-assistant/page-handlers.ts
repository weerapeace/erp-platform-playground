"use client";

/**
 * ชั้น 2 ของผู้ช่วยเสียง — "หน้าประกาศว่าทำอะไรได้" (ตัวทำงานฝั่งหน้า)
 *
 *   useVoiceHandler("search_here", (q) => setGlobalSearch(q));   // ในตารางกลาง DataTable — ทุกหน้าที่ใช้ตารางกลางได้เอง
 *
 * - ผู้ช่วยเสียงอ่านว่าหน้าปัจจุบันมีตัวทำงานอะไร → ส่งให้ AI รู้ (page_caps) + โชว์ปุ่มลัด "คำสั่งของหน้านี้"
 * - หลายตัวลงชื่อคำสั่งเดียวกัน (เช่น ตารางในป๊อปซ้อนตารางหน้า) = ตัวที่ลงชื่อล่าสุดชนะ · ถอดออกตอนปิด/ออกจากหน้า
 * - คำสั่งที่ใช้ได้ต้องมีในทะเบียน lib/voice-assistant (VOICE_COMMANDS · needsHandler) — หน้าตั้งค่าเปิด/ปิดได้
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { VoiceCommandKey } from "@/lib/voice-assistant";

type Handler = (arg: string) => void;
type Entry = { id: number; key: VoiceCommandKey; fn: { current: Handler } };

let entries: Entry[] = [];
let seq = 0;
let keysCache: VoiceCommandKey[] = [];
const subs = new Set<() => void>();
const emit = () => { keysCache = [...new Set(entries.map((e) => e.key))]; subs.forEach((f) => f()); };

/** ลงชื่อตัวทำงานของคำสั่งนี้ในหน้า (ถอดออกเองตอน unmount) */
export function useVoiceHandler(key: VoiceCommandKey, fn: Handler, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const e: Entry = { id: ++seq, key, fn: ref };
    entries = [...entries, e];
    emit();
    return () => { entries = entries.filter((x) => x.id !== e.id); emit(); };
  }, [key, enabled]);
}

/** เรียกตัวทำงานล่าสุดของคำสั่งนี้ · ไม่มี = false */
export function runVoiceHandler(key: VoiceCommandKey, arg: string): boolean {
  const e = [...entries].reverse().find((x) => x.key === key);
  if (!e) return false;
  e.fn.current(arg);
  return true;
}

/** คำสั่งที่หน้าปัจจุบันมีตัวทำงาน (อัปเดตสด) */
export function useVoiceHandlerKeys(): VoiceCommandKey[] {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => keysCache,
    () => keysCache,
  );
}

/* ─────────── สร้างใหม่พร้อมค่า: ฝากค่าที่พูดไว้ให้ฟอร์มหน้าปลายทางหยิบ (?new=1) ─────────── */
const PREFILL_KEY = "voice-create-prefill";
type Prefill = { path: string; values: Record<string, string>; at: number };

export function stashVoicePrefill(path: string, values: Record<string, string>): void {
  try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ path, values, at: Date.now() } satisfies Prefill)); } catch { /* ไม่มีที่เก็บ = เปิดฟอร์มเปล่า */ }
}

/** หยิบค่าที่ฝากไว้ (ครั้งเดียว · หมดอายุ 2 นาที · ต้องเป็นหน้าเดียวกัน) */
export function takeVoicePrefill(path: string): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREFILL_KEY);
    const p = JSON.parse(raw) as Prefill;
    if (Date.now() - p.at > 120_000 || p.path.split("?")[0] !== path.split("?")[0]) return null;
    return p.values && typeof p.values === "object" ? p.values : null;
  } catch { return null; }
}
