"use client";
/**
 * ตัว Pet ลอยมุมจอ (ของกลาง) — แทนปุ่ม "งานค้าง" · กด = เปิดศูนย์แจ้งเตือน · ลาก = ย้ายที่ (จำมุมต่อคน)
 * - ตัว: ในระบบ (วาดด้วยโค้ด) / GIF / Lottie (.json) — ค่าตั้งต่อคน useFloatingPetPref (user_ui_prefs floating_pet)
 * - อารมณ์: alert = กระโดด + ฟองข้อความ · idle = ลอยเบา ๆ · sleep = นอน (ไม่มีอะไรค้าง)
 * - ลากลื่น: ระหว่างลากขยับด้วย transform ใน requestAnimationFrame (ไม่ให้ React วาดใหม่ทุกจุด) · ปล่อยแล้วไม่เด้งกลับ
 * กติกา/ชนิดอยู่ที่ lib/floating-pet · ตำแหน่งมุมจอ lib/use-corner-drag
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { useUserPref } from "@/lib/use-user-pref";
import { anchorFromRect, cornerStyle, viewportSize, type CornerAnchor } from "@/lib/use-corner-drag";
import {
  FLOATING_PET_DEFAULT, FLOATING_PET_KEY, PET_PX, parseFloatingPetPref, petFileUrl,
  type BuiltinPetId, type FloatingPetPref, type PetMood, type PetSize, type PetSource,
} from "@/lib/floating-pet";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export function useFloatingPetPref() {
  return useUserPref<FloatingPetPref>(FLOATING_PET_KEY, FLOATING_PET_DEFAULT, parseFloatingPetPref);
}

// ── ตัวในระบบ (SVG ล้วน ไม่ต้องโหลดไฟล์) ──
function BuiltinArt({ id, size }: { id: BuiltinPetId; size: number }) {
  if (id === "slime") return (
    <svg viewBox="0 0 76 76" width={size} height={size} aria-hidden>
      <ellipse cx="38" cy="70" rx="22" ry="4" fill="#0f172a" opacity=".12" />
      <path d="M12 64 Q10 26 38 22 Q66 26 64 64 Z" fill="#5DCAA5" />
      <ellipse cx="28" cy="38" rx="6" ry="4" fill="#E1F5EE" opacity=".7" />
      <circle cx="30" cy="46" r="3.5" fill="#04342C" /><circle cx="46" cy="46" r="3.5" fill="#04342C" />
      <path d="M33 54 Q38 58 43 54" stroke="#04342C" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
  if (id === "bot") return (
    <svg viewBox="0 0 76 76" width={size} height={size} aria-hidden>
      <ellipse cx="38" cy="70" rx="18" ry="4" fill="#0f172a" opacity=".12" />
      <line x1="38" y1="10" x2="38" y2="20" stroke="#534AB7" strokeWidth="2" /><circle cx="38" cy="9" r="3" fill="#E24B4A" />
      <rect x="16" y="20" width="44" height="36" rx="10" fill="#AFA9EC" />
      <rect x="22" y="28" width="32" height="16" rx="6" fill="#26215C" />
      <circle cx="31" cy="36" r="3" fill="#5DCAA5" /><circle cx="45" cy="36" r="3" fill="#5DCAA5" />
      <rect x="26" y="58" width="8" height="8" rx="2" fill="#7F77DD" /><rect x="42" y="58" width="8" height="8" rx="2" fill="#7F77DD" />
    </svg>
  );
  return (
    <svg viewBox="0 0 76 76" width={size} height={size} aria-hidden>
      <ellipse cx="38" cy="70" rx="20" ry="4" fill="#0f172a" opacity=".12" />
      <path d="M18 30 L22 12 L32 24 Z" fill="#EF9F27" /><path d="M58 30 L54 12 L44 24 Z" fill="#EF9F27" />
      <ellipse cx="38" cy="44" rx="24" ry="22" fill="#FAC775" />
      <ellipse cx="30" cy="40" rx="3" ry="4" fill="#412402" /><ellipse cx="46" cy="40" rx="3" ry="4" fill="#412402" />
      <path d="M34 50 Q38 54 42 50" stroke="#633806" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="24" cy="48" rx="4" ry="2" fill="#F0997B" opacity=".7" /><ellipse cx="52" cy="48" rx="4" ry="2" fill="#F0997B" opacity=".7" />
    </svg>
  );
}

// Lottie: โหลดไฟล์ .json แล้วเล่นวน · โหลดไม่ได้ = ใช้แมวแทน (ไม่ค้าง)
const lottieCache = new Map<string, Promise<Record<string, unknown> | null>>();
function LottieArt({ src, size }: { src: string; size: number }) {
  const [anim, setAnim] = useState<Record<string, unknown> | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const url = petFileUrl(src);
    let p = lottieCache.get(url);
    if (!p) { p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null); lottieCache.set(url, p); }
    void p.then((j) => { if (live) setAnim(j && typeof j === "object" ? j : null); });
    return () => { live = false; };
  }, [src]);
  if (anim === null) return <BuiltinArt id="cat" size={size} />;
  if (!anim) return <div style={{ width: size, height: size }} />;
  return <Lottie animationData={anim} loop autoplay style={{ width: size, height: size }} />;
}

function GifArt({ src, size }: { src: string; size: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (bad) return <BuiltinArt id="cat" size={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={petFileUrl(src)} alt="" draggable={false} onError={() => setBad(true)} style={{ width: size, height: size, objectFit: "contain" }} />;
}

/** ภาพตัว Pet (ใช้ทั้งตัวลอยและตัวอย่างในหน้าต่างเลือก) */
export function PetArt({ source, size }: { source: PetSource; size: number }) {
  if (source.kind === "gif") return <GifArt src={source.src} size={size} />;
  if (source.kind === "lottie") return <LottieArt src={source.src} size={size} />;
  return <BuiltinArt id={source.id} size={size} />;
}

export function FloatingPet({ source, size = "m", mood, badge, bubble, anchor, onDrop, onClick, label }: {
  source: PetSource;
  size?: PetSize;
  mood: PetMood;
  /** ตัวเลขมุมขวาบน (null = ไม่โชว์) */
  badge: string | null;
  /** ฟองข้อความ (โชว์ตอน alert) */
  bubble?: string | null;
  anchor: CornerAnchor;
  /** ลากวางแล้ว → มุม + ระยะจากมุม (ผู้เรียกบันทึกต่อคน) */
  onDrop: (a: CornerAnchor) => void;
  onClick: () => void;
  label: string;
}) {
  const px = PET_PX[size];
  const ref = useRef<HTMLButtonElement>(null);
  // ตำแหน่งที่เพิ่งลากวาง — ใช้ทันทีจนกว่าค่าที่บันทึกตามมา (กันเด้งกลับที่เดิมแวบหนึ่ง)
  const [local, setLocal] = useState<CornerAnchor | null>(null);
  useEffect(() => { setLocal(null); }, [anchor.h, anchor.v, anchor.x, anchor.y]);
  const drag = useRef<{ sx: number; sy: number; dx: number; dy: number; moved: boolean; raf: number; rect: DOMRect } | null>(null);
  const [dragging, setDragging] = useState(false);

  const paint = () => {
    const d = drag.current; const el = ref.current;
    if (!d || !el) return;
    d.raf = 0;
    el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0)`;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !ref.current) return;
    ref.current.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, raf: 0, rect: ref.current.getBoundingClientRect() };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d) return;
    const rx = e.clientX - d.sx, ry = e.clientY - d.sy;
    if (!d.moved && Math.abs(rx) + Math.abs(ry) < 5) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    // ไม่ให้หลุดจอ
    const vp = viewportSize();
    d.dx = Math.max(-d.rect.left, Math.min(rx, vp.w - d.rect.right));
    d.dy = Math.max(-d.rect.top, Math.min(ry, vp.h - d.rect.bottom));
    if (!d.raf) d.raf = requestAnimationFrame(paint);
  };
  const finish = (cancelled: boolean) => {
    const d = drag.current; const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (!d.moved) { if (!cancelled) onClick(); return; }
    el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0)`;
    const vp = viewportSize();
    const a = anchorFromRect(el.getBoundingClientRect(), vp.w, vp.h);
    el.style.transform = "";
    setLocal(a); setDragging(false);
    onDrop(a);
  };

  const at = local ?? anchor;
  const anim = mood === "alert" ? "ov-pet-alert" : mood === "idle" ? "ov-pet-float" : "fpet-sleep";
  return (
    <button ref={ref} type="button" aria-label={label} title={`${label} — กดเพื่อเปิด · ลากเพื่อย้ายที่`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)}
      // กด Enter/Space จากคีย์บอร์ด (detail = 0) — คลิกเมาส์/นิ้วจัดการใน finish แล้ว
      onClick={(e) => { if (e.detail === 0) onClick(); }}
      style={{ ...cornerStyle(at, { w: px, h: px }), width: px, height: px, touchAction: "none", willChange: dragging ? "transform" : undefined }}
      className={`fpet fixed z-[45] select-none bg-transparent p-0 border-0 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-2xl ${dragging ? "cursor-grabbing" : "cursor-grab"}`}>
      <span className={`block ${dragging ? "" : anim}`} style={{ width: px, height: px }}><PetArt source={source} size={px} /></span>
      {mood === "sleep" && <span aria-hidden className="fpet-z absolute -top-1 right-1 text-xs font-semibold text-slate-400">z</span>}
      {badge && (
        <span className={`absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-semibold flex items-center justify-center shadow ${mood === "alert" ? "ov-badge-pulse" : ""}`}>{badge}</span>
      )}
      {bubble && mood === "alert" && !dragging && (
        <span className={`ov-bubble-pop absolute whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-lg ${at.v === "b" ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${at.h === "r" ? "right-0" : "left-0"}`}>{bubble}</span>
      )}
    </button>
  );
}
