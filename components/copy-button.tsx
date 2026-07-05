"use client";

/**
 * CopyButton (ของกลาง) — ปุ่มคัดลอกข้อความเล็ก ๆ
 *   คลิก → คัดลอกลง clipboard + โชว์ ✓ ชั่วครู่ · stopPropagation (ไม่ไปโดน onClick ของแถว/เซลล์)
 *   fallback execCommand เมื่อไม่มี navigator.clipboard (http/บาง in-app browser)
 * ใช้: <CopyButton value="JEAN08-01" />  ·  ซ่อน/โผล่ตอน hover ให้ใส่ className group-hover เอง
 */
import { useState, type MouseEvent } from "react";

export function CopyButton({ value, title, className = "" }: { value: string; title?: string; className?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); e.preventDefault();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      }
      setDone(true); setTimeout(() => setDone(false), 1200);
    } catch { /* เงียบ ๆ */ }
  };

  return (
    <button type="button" onClick={copy} title={title ?? `คัดลอก: ${value}`}
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded align-middle transition-colors ${done ? "text-emerald-600" : "text-slate-300 hover:text-slate-600"} ${className}`}>
      {done ? (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}
