"use client";

/**
 * ของกลาง — ภาพย่อวิดีโอ (คลัง / ป๊อปเลือกจากคลัง / ช่องวิดีโอ)
 *
 *   <VideoThumb url="/api/r2-image?key=..." className="h-20" />
 *
 * - เห็นภาพเฟรมแรก (โหลดแค่ส่วนหัวไฟล์ preload="metadata" · ไม่โหลดทั้งคลิป)
 * - ชี้เมาส์ = เล่นเงียบวนซ้ำ · เอาเมาส์ออก = หยุดกลับเฟรมแรก (มือถือ/ทัช = ภาพนิ่ง)
 * - ป้ายความยาวคลิป (เช่น 0:15) มุมขวาล่าง + ป้าย 🎬 มุมซ้ายบน
 */
import { useRef, useState } from "react";

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

export function VideoThumb({ url, className = "", fit = "cover", showBadge = true }: { url: string; className?: string; fit?: "cover" | "contain"; showBadge?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState("");
  const [broken, setBroken] = useState(false);
  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    void v.play().catch(() => {});
  };
  const stop = () => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0.1;
  };
  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`} onMouseEnter={play} onMouseLeave={stop}>
      {broken ? (
        <div className="absolute inset-0 flex items-center justify-center text-2xl">🎬</div>
      ) : (
        <video
          ref={ref}
          // #t=0.1 = ให้เบราว์เซอร์วาดเฟรมแรกเป็นภาพย่อ (บางเครื่องเฟรม 0 เป็นจอดำ)
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          loop
          playsInline
          onLoadedMetadata={(e) => setDur(fmt(e.currentTarget.duration))}
          onError={() => setBroken(true)}
          className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
        />
      )}
      {showBadge && <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">🎬</span>}
      {dur && <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white tabular-nums">{dur}</span>}
    </div>
  );
}
