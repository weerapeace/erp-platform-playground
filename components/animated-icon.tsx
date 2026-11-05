"use client";

/**
 * 🎞️ ไอคอนเคลื่อนไหว (ของกลาง) — ไฟล์ Lottie (.json) หรือ GIF / WebP ขยับ ที่เก็บใน R2
 *
 *   <AnimatedIcon src="pattern-icons/scissors.json" size={28} play="hover" />
 *   ส่วนใหญ่ไม่ต้องเรียกตรง: <Icon value="img:<r2_key>.json" /> ของกลางเรียกให้เอง (ดู components/icon)
 *
 *   play  "hover" (ค่าเริ่ม) = นิ่งที่เฟรมแรก · เอาเมาส์ชี้/แตะ/โฟกัสปุ่มที่ครอบอยู่ → เล่น 1 รอบ (ไม่รกตา)
 *         "loop"  = เล่นวนตลอด · "once" = เล่น 1 รอบตอนโผล่ แล้วหยุด
 *   ผู้ใช้ตั้งเครื่องว่า "ลดการเคลื่อนไหว" → นิ่งเสมอ
 *   GIF / WebP ขยับ = เบราว์เซอร์เล่นวนเอง (หยุดตามเมาส์ไม่ได้ — อยากได้แบบชี้แล้วขยับ ให้ใช้ Lottie)
 *   ตัวเล่น Lottie (lottie-react) โหลดเฉพาะหน้าที่มีไอคอน Lottie · ไฟล์เสีย/โหลดไม่ได้ = กล่องว่างขนาดเท่าเดิม (ไม่ดันหน้าเลื่อน)
 * แหล่งไฟล์แนะนำ: Lordicon (ไอคอนเส้น) · LottieFiles — ดาวน์โหลดแบบ "Lottie JSON"
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LottieRefCurrentProps } from "lottie-react";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export type AnimPlay = "hover" | "loop" | "once";

/** r2 key นี้เป็นไฟล์ Lottie ไหม */
export const isLottieKey = (key: string | null | undefined) => /\.json$/i.test(String(key ?? "").split("?")[0]);

/** ที่อยู่ไฟล์ตัวเต็ม (ไม่ย่อ — ย่อแล้ว GIF/WebP ขยับจะกลายเป็นภาพนิ่ง · Lottie ต้องได้ไฟล์ดิบ) */
export const animatedFileUrl = (key: string) => (/^(https:\/\/|\/)/i.test(key) ? key : `/api/r2-image?key=${encodeURIComponent(key)}`);

const cache = new Map<string, Promise<Record<string, unknown> | null>>();
function loadLottie(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => (j && typeof j === "object" && "layers" in j ? j as Record<string, unknown> : null)).catch(() => null);
    cache.set(url, p);
  }
  return p;
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function AnimatedIcon({ src, size = "1em", play = "hover", className, title, style }: {
  /** r2 key (หรือ https URL) ของไฟล์ .json / .gif / .webp */
  src: string;
  size?: number | string;
  play?: AnimPlay;
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const box: CSSProperties = { width: size, height: size, display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...style };
  const a11y = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };
  if (!isLottieKey(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={animatedFileUrl(src)} alt={title ?? ""} className={className} style={{ ...box, objectFit: "contain" }} draggable={false} />;
  }
  return <LottieIcon src={src} box={box} play={play} className={className} a11y={a11y} title={title} />;
}

function LottieIcon({ src, box, play, className, a11y, title }: {
  src: string; box: CSSProperties; play: AnimPlay; className?: string; title?: string;
  a11y: { role: "img"; "aria-label": string } | { "aria-hidden": true };
}) {
  const [data, setData] = useState<Record<string, unknown> | null | undefined>(undefined);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const [still] = useState(() => (typeof window !== "undefined" ? prefersReducedMotion() : false));

  useEffect(() => {
    let live = true;
    void loadLottie(animatedFileUrl(src)).then((j) => { if (live) setData(j); });
    return () => { live = false; };
  }, [src]);

  // โหมดชี้แล้วขยับ: ฟังที่ปุ่ม/ลิงก์/การ์ดที่ครอบไอคอนอยู่ (ชี้ทั้งปุ่มก็ขยับ ไม่ต้องชี้โดนไอคอนพอดี)
  useEffect(() => {
    if (play !== "hover" || still || !data) return;
    const el = wrapRef.current;
    const host = (el?.closest("button, a, [role=button], [data-anim-hover]") as HTMLElement | null) ?? el;
    if (!host) return;
    const go = () => { lottieRef.current?.goToAndPlay(0, true); };
    host.addEventListener("mouseenter", go);
    host.addEventListener("focus", go);
    host.addEventListener("touchstart", go, { passive: true });
    return () => {
      host.removeEventListener("mouseenter", go);
      host.removeEventListener("focus", go);
      host.removeEventListener("touchstart", go);
    };
  }, [play, still, data]);

  return (
    <span ref={wrapRef} className={className} style={box} title={title} {...a11y}>
      {data && (
        <Lottie lottieRef={lottieRef} animationData={data}
          loop={play === "loop" && !still}
          autoplay={(play === "loop" || play === "once") && !still}
          style={{ width: "100%", height: "100%" }} />
      )}
    </span>
  );
}
