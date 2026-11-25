"use client";

/**
 * 🐾 ทะเบียนแมว — ชิ้นน่ารัก (แบบ A ส้มพีช · เจ้าของเลือก 2026-11-25)
 *   CartoonCat = หน้าแมวการ์ตูนแทนรูป (ตอนยังไม่ใส่รูป) — สีตาม "สีขน" ที่กรอก · ท่าตา/ลายคงที่ต่อตัว (ตาม id)
 *   SleepyCat / CuteEmpty = หน้าว่างแบบแมวนอนหลับ (เฉพาะแอปแมว — ปุ่มสีส้มของแอป ไม่ใช่ปุ่มม่วงของหน้าว่างกลาง)
 *   CatLogo = โลโก้หน้าแมวหัวแอป · pawBurst = รอยเท้าเด้งตอนกด "ฉีดแล้ว/ให้ยาแล้ว" (ปิดเองถ้าเครื่องตั้งลดการเคลื่อนไหว)
 *   สี/มุม/ฟอนต์ของแอปอยู่ cats-theme.css ที่เดียว
 */
import type { ReactNode } from "react";

type Coat = { fur: string; ear: string; mark?: "stripes" | "calico" | "patch"; markColor?: string; ink: string };

/** สีขนจากข้อความที่กรอก (ไทย/อังกฤษ) → ชุดสีการ์ตูน */
export function coatOf(color: string | null | undefined): Coat {
  const c = (color ?? "").toLowerCase();
  const has = (...w: string[]) => w.some((x) => c.includes(x));
  if (has("สามสี", "calico", "ด่าง")) return { fur: "#fffaf3", ear: "#f59e42", mark: "calico", markColor: "#3f3330", ink: "#4a3b33" };
  if (has("ดำ", "black")) return { fur: "#3a3335", ear: "#2b2527", ink: "#fff6ea" };
  if (has("เทา", "ฟ้า", "เงิน", "gray", "grey", "silver", "blue")) return { fur: "#b8bec7", ear: "#9aa1ab", mark: "stripes", markColor: "#8f97a2", ink: "#3d4148" };
  if (has("ส้ม", "ทอง", "orange", "ginger")) return { fur: "#f59e42", ear: "#e8862a", mark: "stripes", markColor: "#d9751c", ink: "#4a3b33" };
  if (has("น้ำตาล", "ช็อก", "สลิด", "brown", "tabby")) return { fur: "#b98559", ear: "#a3714a", mark: "stripes", markColor: "#8a5c39", ink: "#3d2e24" };
  if (has("ขาว", "white")) return { fur: "#ffffff", ear: "#ffe3cf", ink: "#4a3b33" };
  return { fur: "#ffe2c4", ear: "#f7cfa6", mark: "patch", markColor: "#f2bf8d", ink: "#4a3b33" };   // ครีม (ค่าเริ่ม)
}

const BG = ["#ffe3cf", "#ffe9b8", "#ffdfe6", "#e3f1ff", "#e6f6ea", "#efe7ff"];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** หน้าแมวการ์ตูน · seed = id แมว (ท่าตาและพื้นหลังไม่เปลี่ยนไปมา) */
export function CartoonCat({ color, seed, className = "", title }: { color?: string | null; seed: string; className?: string; title?: string }) {
  const k = coatOf(color);
  const h = hash(seed);
  const happy = h % 3 === 0;
  return (
    <div className={`flex items-end justify-center overflow-hidden ${className}`} style={{ background: BG[h % BG.length] }} role="img" aria-label={title ?? "แมว"}>
      <svg viewBox="0 0 120 120" className="h-[88%] w-[88%]" aria-hidden="true">
        <path d="M30 54 L35 20 L56 40 Z M90 54 L85 20 L64 40 Z" fill={k.fur} />
        <path d="M34 46 L37 28 L48 39 Z M86 46 L83 28 L72 39 Z" fill={k.ear} />
        <ellipse cx="60" cy="76" rx="40" ry="35" fill={k.fur} />
        {k.mark === "stripes" && <path d="M48 46 l4 10 M60 43 v11 M72 46 l-4 10" stroke={k.markColor} strokeWidth="4" strokeLinecap="round" />}
        {k.mark === "calico" && <><path d="M24 70 q8 -26 30 -26 q-6 14 -2 30 q-16 4 -28 -4z" fill={k.ear} /><path d="M78 48 q16 4 20 22 q-12 2 -20 -8z" fill={k.markColor} /></>}
        {k.mark === "patch" && <ellipse cx="78" cy="62" rx="12" ry="9" fill={k.markColor} />}
        {happy ? (
          <path d="M42 74 q5 -5 10 0 M68 74 q5 -5 10 0" stroke={k.ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        ) : (
          <><circle cx="47" cy="74" r="5.2" fill={k.ink} /><circle cx="73" cy="74" r="5.2" fill={k.ink} /><circle cx="48.6" cy="72.4" r="1.7" fill="#fff" /><circle cx="74.6" cy="72.4" r="1.7" fill="#fff" /></>
        )}
        <ellipse cx="37" cy="86" rx="6.5" ry="3.8" fill="#ffb3c1" opacity=".85" />
        <ellipse cx="83" cy="86" rx="6.5" ry="3.8" fill="#ffb3c1" opacity=".85" />
        <path d="M56 83 l4 3 4 -3" stroke={k.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function CatLogo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M13 24 L17 8 L29 19 Z M51 24 L47 8 L35 19 Z" fill="#ff8a5c" />
      <ellipse cx="32" cy="37" rx="21" ry="18" fill="#ff8a5c" />
      <circle cx="25" cy="35" r="2.8" fill="#fff" /><circle cx="39" cy="35" r="2.8" fill="#fff" />
      <path d="M29 42 q3 3 6 0" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function SleepyCat({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 120 90" aria-hidden="true">
      <ellipse cx="60" cy="80" rx="44" ry="6" fill="#f3e3d3" />
      <path d="M22 72 q-10 -10 4 -16" stroke="#ffd2b8" strokeWidth="7" fill="none" strokeLinecap="round" />
      <ellipse cx="62" cy="64" rx="34" ry="18" fill="#ffd2b8" />
      <path d="M40 54 L44 34 L56 47 Z M84 54 L80 34 L68 47 Z" fill="#ffd2b8" />
      <path d="M50 60 q3.5 3 7 0 M67 60 q3.5 3 7 0" stroke="#4a3b33" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <ellipse cx="46" cy="66" rx="4" ry="2.4" fill="#ffb3c1" /><ellipse cx="78" cy="66" rx="4" ry="2.4" fill="#ffb3c1" />
      <text x="90" y="30" fontSize="13" fill="#c9a993" fontFamily="sans-serif">z</text>
      <text x="99" y="20" fontSize="10" fill="#d8c0ae" fontFamily="sans-serif">z</text>
    </svg>
  );
}

/** หน้าว่างแบบแมวนอน — ใช้ในแอปแมวแทน EmptyState กลาง (ปุ่มส้มของแอป) */
export function CuteEmpty({ title, hint, actionLabel, onAction, compact = false }: { title: ReactNode; hint?: ReactNode; actionLabel?: ReactNode; onAction?: () => void; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white text-center ${compact ? "px-4 py-6" : "px-6 py-10"}`}>
      <div className="mb-2 flex justify-center"><SleepyCat size={compact ? 76 : 104} /></div>
      <p className="cat-title font-semibold text-slate-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {onAction && actionLabel && (
        <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">{actionLabel}</button>
      )}
    </div>
  );
}

const PAW = '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="15" rx="5" ry="4.2"/><circle cx="6" cy="9" r="2.1"/><circle cx="10" cy="5.8" r="2.1"/><circle cx="14" cy="5.8" r="2.1"/><circle cx="18" cy="9" r="2.1"/></svg>';

/** รอยเท้าเด้งออกจากจุดที่กด (ใช้คู่กับ onClick: pawBurst(e)) */
export function pawBurst(e: { clientX: number; clientY: number }) {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#ff8a5c", "#f59e42", "#ff9fb2", "#5cbf8a"];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement("span");
    el.className = "cat-paw-burst";
    el.innerHTML = PAW;
    const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.6;
    const dist = 28 + Math.random() * 22;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.style.color = colors[i % colors.length];
    el.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    el.style.setProperty("--dy", `${Math.sin(ang) * dist - 14}px`);
    el.style.setProperty("--rot", `${Math.round(Math.random() * 80 - 40)}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }
}

/** คำพูดสั้น ๆ ของตัวช่วยเริ่มต้น */
export function setupSpeech(left: number): string {
  if (left <= 0) return "ครบแล้ว เก่งมาก เหมียว~";
  if (left === 1) return "อีกขั้นเดียวก็ครบแล้ว เหมียว~";
  return `อีก ${left} ขั้น น้อง ๆ รออยู่นะ`;
}
