"use client";
/**
 * ResultBurst — แอนิเมชันเล็ก ๆ บอกผล "สำเร็จ / ไม่สำเร็จ / สำเร็จบางส่วน" (ของกลาง)
 *   <ResultBurst tone="ok" title="ลงสำเร็จ 3 ตัว" />   tone: "ok" (เขียว ขีดถูก + จุดกระจาย) | "fail" (แดง กากบาท + สั่น) | "partial" (เหลือง ! )
 * เล่นครั้งเดียวตอนโผล่ (key ใหม่ = เล่นใหม่) · ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง = นิ่ง · คีย์เฟรมอยู่ app/globals.css (rb-*)
 * ใช้เมื่อ: จบงานที่ใช้เวลา/ส่งข้อมูลออกนอกระบบ (ลงสินค้า · ส่งขึ้นร้าน · นำเข้า) แล้วโชว์หน้าผลลัพธ์
 * ห้ามใช้: แจ้งผลสั้น ๆ ทั่วไป (ใช้ toast) · ไอคอนประจำเมนู (ใช้ Icon / AnimatedIcon)
 */
import type { ReactNode } from "react";

export type ResultTone = "ok" | "fail" | "partial";

const TONE = {
  ok: { ring: "#10b981", fill: "#ecfdf5", text: "text-emerald-700" },
  fail: { ring: "#f43f5e", fill: "#fff1f2", text: "text-rose-700" },
  partial: { ring: "#f59e0b", fill: "#fffbeb", text: "text-amber-700" },
} as const;

/** สรุปผลจากจำนวนสำเร็จ/ไม่สำเร็จ → tone */
export const resultTone = (okCount: number, failCount: number): ResultTone => (failCount === 0 ? "ok" : okCount === 0 ? "fail" : "partial");

export function ResultBurst({ tone, title, detail, size = 64 }: { tone: ResultTone; title?: ReactNode; detail?: ReactNode; size?: number }) {
  const c = TONE[tone];
  return (
    <div className="flex flex-col items-center gap-1.5 py-2 text-center" role="status" aria-live="polite">
      <div className={tone === "fail" ? "rb-shake" : undefined} style={{ width: size, height: size }}>
        <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
          {tone === "ok" && Array.from({ length: 8 }, (_, i) => (
            <circle key={i} className="rb-dot" cx="32" cy="32" r="2.6" fill={i % 2 ? "#34d399" : "#a78bfa"} style={{ ["--rb-a" as string]: `${i * 45}deg` }} />
          ))}
          <g className="rb-pop">
            <circle cx="32" cy="32" r="26" fill={c.fill} stroke={c.ring} strokeWidth="3" />
            {tone === "ok" && <path className="rb-draw" d="M20 33 l8 8 l16 -17" fill="none" stroke={c.ring} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
            {tone === "fail" && <path className="rb-draw" d="M23 23 L41 41 M41 23 L23 41" fill="none" stroke={c.ring} strokeWidth="5" strokeLinecap="round" />}
            {tone === "partial" && <path className="rb-draw" d="M32 19 L32 36 M32 44 L32 45" fill="none" stroke={c.ring} strokeWidth="5" strokeLinecap="round" />}
          </g>
        </svg>
      </div>
      {title && <div className={`text-sm font-medium ${c.text}`}>{title}</div>}
      {detail && <div className="text-xs text-slate-500">{detail}</div>}
    </div>
  );
}
