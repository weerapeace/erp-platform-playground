"use client";

/**
 * CopyButton (ของกลาง) — ปุ่มคัดลอกข้อความ
 *   คลิก → คัดลอกลง clipboard + โชว์ ✓ ชั่วครู่ · stopPropagation (ไม่ไปโดน onClick ของแถว/เซลล์)
 *   fallback execCommand เมื่อไม่มี navigator.clipboard (http/บาง in-app browser)
 * ใช้: <CopyButton value="JEAN08-01" />  ·  ซ่อน/โผล่ตอน hover ให้ใส่ className group-hover เอง
 *      <CopyButton value={url} label="คัดลอกลิงก์" />  → ปุ่มมีข้อความ (กดแล้วเป็น "คัดลอกแล้ว")
 */
import { useState, type MouseEvent } from "react";

/** คัดลอกข้อความลง clipboard (ของกลาง) — ลอง navigator.clipboard ก่อน · ไม่มี/ถูกปฏิเสธ (http, in-app browser, ไม่มีสิทธิ์) → วิธีสำรอง execCommand · คืน true = สำเร็จ */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* ตกไปใช้วิธีสำรอง */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = value; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export function CopyButton({ value, title, className = "", label }: { value: string; title?: string; className?: string; /** มี = ปุ่มมีข้อความ (แทนไอคอนเล็ก) */ label?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); e.preventDefault();
    if (await copyText(value)) { setDone(true); setTimeout(() => setDone(false), 1200); }
  };

  const icon = done ? (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
  );

  if (label) {
    return (
      <button type="button" onClick={copy} title={title ?? `คัดลอก: ${value}`}
        className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg border px-2.5 py-1 text-xs transition-colors ${done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"} ${className}`}>
        {icon}
        {done ? "คัดลอกแล้ว" : label}
      </button>
    );
  }

  return (
    <button type="button" onClick={copy} title={title ?? `คัดลอก: ${value}`}
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded align-middle transition-colors ${done ? "text-emerald-600" : "text-slate-300 hover:text-slate-600"} ${className}`}>
      {icon}
    </button>
  );
}
