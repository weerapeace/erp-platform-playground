"use client";

/**
 * 🎬 สตูดิโอจำลอง — ผังไฟ (มองจากด้านบน · ลากไฟได้) คู่กับจอกล้อง (ภาพที่ถ่ายได้จริง)
 *   ใช้ตัวเดียวทุกฉากเรื่องไฟ — แต่ละฉากแค่บอกว่าเน้นปุ่มไหน (focus) + ค่าเริ่ม + ปุ่มลัด (chips)
 *   ตัวเลขแบบช่างกล้อง: ระยะ (ม.) · แสงถึงสินค้า % · เคลวิน · องศา · ปุ่ม "ดูตัวอย่าง" เล่นให้ดู (เคารพ reduced motion)
 *   เจ้าของเลือก 2026-11-27 (ข้อ 1-4) · ใช้ผ่าน components/lesson-anim/presets.tsx
 */
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "@/components/icon";
import { kelvinRgb } from "@/lib/studio-light";

export type StudioState = { d: number; a: number; soft: number; k: number; flag: boolean };
export type StudioFocus = "dist" | "angle" | "soft" | "k";
export type StudioChip = { label: string; set: Partial<StudioState>; tip: string };
/** exposure: auto (ค่าเริ่ม) = กล้องชดเชยแสงให้สินค้าพอดีเหมือนกล้องจริง · fixed = เห็นแสงลดลงตามระยะจริง (ฉากระยะไฟ) */
export type StudioConfig = { focus: StudioFocus; init?: Partial<StudioState>; chips?: StudioChip[]; exposure?: "auto" | "fixed" };

const DEFAULT: StudioState = { d: 1.2, a: 40, soft: 15, k: 3200, flag: false };
const FOCUS: Record<StudioFocus, { label: string; key: "d" | "a" | "soft" | "k"; min: number; max: number; step: number; lo: string; hi: string; fmt: (v: number) => string }> = {
  dist: { label: "ระยะไฟ", key: "d", min: 0.5, max: 3, step: 0.1, lo: "ใกล้", hi: "ไกล", fmt: (v) => `${v.toFixed(1)} ม.` },
  angle: { label: "องศาไฟ", key: "a", min: -180, max: 180, step: 1, lo: "ซ้าย", hi: "ขวา", fmt: (v) => `${Math.round(v)}°` },
  soft: { label: "ความนุ่ม", key: "soft", min: 0, max: 100, step: 1, lo: "แข็ง", hi: "นุ่ม", fmt: (v) => `${Math.round(v)}%` },
  k: { label: "สีแสง", key: "k", min: 2700, max: 6500, step: 100, lo: "ส้ม", hi: "ฟ้า", fmt: (v) => `${Math.round(v)}K` },
};

const cl = (x: number) => Math.max(0, Math.min(1, x));
/** สีของแสงตามเคลวิน — ตารางกลางเดียวกับสตูดิโอเต็ม (lib/studio-light) */
const tint = kelvinRgb;
const rgb = (c: readonly number[], L: number) => `rgb(${c.map((v) => Math.round(v * cl(L))).join(",")})`;
const SUBJ = { x: 150, y: 130 };
const lampPos = (s: StudioState) => { const R = 30 + s.d * 36, r = (s.a * Math.PI) / 180; return [SUBJ.x + R * Math.sin(r), SUBJ.y + R * Math.cos(r)] as const; };

function focusTip(f: StudioFocus, s: StudioState, I: number): string {
  if (f === "dist") return s.d < 0.9 ? "ไฟชิดสินค้า: สินค้าสว่าง ฉากหลังมืดลงชัด เหมาะทำภาพหรู ดราม่า"
    : s.d > 2.2 ? `ไฟอยู่ไกล ${s.d.toFixed(1)} ม.: แสงถึงสินค้าเหลือ ${Math.round(I * 100)}% แต่ฉากหลังกับสินค้าสว่างใกล้กัน ภาพเรียบ`
      : `ถอยไฟออก 2 เท่า แสงเหลือ 1 ใน 4 — ตอนนี้แสงถึงสินค้า ${Math.round(I * 100)}%`;
  if (f === "angle") { const a = Math.abs(s.a);
    return a < 25 ? "ไฟตรงหน้ากล้อง: สว่างทั่ว แต่ภาพแบน ไม่มีมิติ"
      : a < 70 ? "ไฟเฉียง 30–60°: ด้านหนึ่งสว่าง อีกด้านมีเงา ภาพดูมีมิติ — มุมมาตรฐานถ่ายสินค้า"
        : a < 130 ? "ไฟด้านข้าง 90°: ครึ่งมืดครึ่งสว่าง เห็นผิวสัมผัสชัด ดราม่า"
          : "ไฟอยู่หลังสินค้า: ตัวสินค้ามืด เหลือขอบสว่าง (rim light) ใช้แยกสินค้าออกจากฉากหลัง"; }
  if (f === "soft") return s.soft < 30 ? "แสงแข็ง: เงาคม ขอบชัด สินค้าผิวมันจะมีจุดแสงแรง"
    : s.soft > 70 ? "แสงนุ่ม (ซอฟต์บ็อกซ์ใหญ่): เงาฟุ้ง ไล่แสงเนียน — เหมาะถ่ายสินค้าเกือบทุกแบบ" : "แสงกึ่งนุ่ม: เงายังเห็นทรง แต่ขอบไม่คม";
  return s.k < 3800 ? "ไฟส้ม (ทังสเตน ~3200K): ถ้ากล้องตั้งแสงกลางวัน สีสินค้าจะเพี้ยนเป็นส้ม"
    : s.k > 5200 ? "แสงกลางวัน (~5600K): สีขาวสะอาด — ไฟทุกดวงในฉากควรเป็นค่านี้เหมือนกัน"
      : "สีกลาง ๆ: ถ้าผสมไฟสองสีในฉากเดียว ด้านหนึ่งจะส้ม อีกด้านจะฟ้า";
}

export function StudioSim({ config }: { config: StudioConfig }) {
  const uid = useId().replace(/:/g, "");
  const init = { ...DEFAULT, ...config.init };
  const [s, setS] = useState<StudioState>(init);
  const [chip, setChip] = useState<number | null>(null);
  const planRef = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const raf = useRef<number | null>(null);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  const F = FOCUS[config.focus];

  const [lx, ly] = lampPos(s);
  const ang = (Math.atan2(SUBJ.y - ly, SUBJ.x - lx) * 180) / Math.PI;
  const r = (s.a * Math.PI) / 180, f = Math.cos(r), sn = Math.sin(r);
  const I = Math.min(1, 1 / (s.d * s.d));
  // กล้องจริงชดเชยแสงให้สินค้าพอดี (auto) — ยกเว้นฉาก "ระยะไฟ" ที่ต้องเห็นแสงลดลงจริง (fixed)
  const fixed = config.exposure === "fixed";
  const Is = fixed ? I : 1;
  const wallRel = (s.d * s.d) / ((s.d + 1) ** 2); // ฉากหลังอยู่หลังสินค้า ~1 ม. → แสงถึงฉากหลังเทียบกับสินค้า
  const c = tint(s.k);
  const base = [243, 241, 236].map((v, i) => (v * c[i]) / 255);
  const hard = 1 - s.soft / 100;
  const behind = f < -0.3 ? 0.05 : 1;
  const left = Math.max(0.06, cl(0.08 + 0.55 * f - 0.6 * sn + 0.25) * Is * behind);
  const right = Math.max(0.06, cl(0.08 + 0.55 * f + 0.6 * sn + 0.25) * Is * behind);
  const gap = 0.5 * (1 - hard) * 0.9;
  const wallBase = 0.04 + 0.6 * wallRel * Is;
  const wall = s.flag ? wallBase * 0.25 : wallBase;
  const w = 4 + s.soft * 0.16, px = -Math.sin((ang * Math.PI) / 180), py = Math.cos((ang * Math.PI) / 180), sp = 10 + s.soft * 0.22;
  const mx = (lx + SUBJ.x) / 2, my = (ly + SUBJ.y) / 2;
  const tip = chip !== null && config.chips?.[chip] ? `${config.chips[chip].tip} · ${focusTip(config.focus, s, I)}` : focusTip(config.focus, s, I);

  const pt = (e: RPointerEvent<SVGSVGElement>) => { const b = planRef.current!.getBoundingClientRect(); return [((e.clientX - b.left) * 300) / b.width, ((e.clientY - b.top) * 240) / b.height] as const; };
  const onDown = (e: RPointerEvent<SVGSVGElement>) => { const [x, y] = pt(e); if (Math.hypot(x - lx, y - ly) < 30) { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); } };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const [x, y] = pt(e); const dx = x - SUBJ.x, dy = y - SUBJ.y;
    setS((o) => ({ ...o, a: Math.round((Math.atan2(dx, dy) * 180) / Math.PI), d: Math.round(Math.max(0.5, Math.min(3, (Math.hypot(dx, dy) - 30) / 36)) * 10) / 10 }));
  };
  const onUp = () => { drag.current = false; };

  const play = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now(), dur = reduce ? 1 : 3200;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur); const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      const v = Math.round((F.min + (F.max - F.min) * e) / F.step) * F.step;
      setS((o) => ({ ...o, [F.key]: +v.toFixed(2) }));
      raf.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  }, [F]);

  const g = (n: string) => `${n}${uid}`;
  return (
    <div>
      {config.chips && config.chips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {config.chips.map((ch, i) => (
            <button key={ch.label} type="button" onClick={() => { setChip(i); setS((o) => ({ ...o, ...ch.set })); }}
              className={`rounded-full border px-3 py-1 text-[12px] ${chip === i ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{ch.label}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <figure className="m-0">
          <figcaption className="mb-1 text-[11px] text-slate-500">ผังสตูดิโอ (มองจากด้านบน) · ลากไฟได้</figcaption>
          <svg ref={planRef} viewBox="0 0 300 240" className="block h-auto w-full cursor-grab touch-none rounded-lg bg-slate-50 active:cursor-grabbing"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label={`ผังไฟ: ไฟห่าง ${s.d.toFixed(1)} เมตร มุม ${Math.round(s.a)} องศา`}>
            <defs><pattern id={g("grid")} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#E2E8F0" strokeWidth="0.6" /></pattern></defs>
            <rect width="300" height="240" fill={`url(#${g("grid")})`} />
            <line x1="20" y1="34" x2="280" y2="34" stroke="#94A3B8" strokeWidth="3" />
            <text x="24" y="28" fontSize="10" fill="#94A3B8">ฉากหลัง</text>
            {s.flag && <g><rect x={SUBJ.x + 26} y={44} width={70} height={6} rx={1} fill="#334155" /><text x={SUBJ.x + 30} y={62} fontSize="9" fill="#475569">Flag</text></g>}
            <polygon points="150,212 118,150 182,150" fill="#94A3B8" opacity="0.15" />
            <g transform="translate(150,214)"><rect x="-14" y="-7" width="28" height="16" rx="3" fill="#475569" /><rect x="-6" y="-13" width="12" height="7" rx="1.5" fill="#475569" /></g>
            <text x="172" y="222" fontSize="10" fill="#94A3B8">กล้อง</text>
            <polygon points={`${lx + px * w},${ly + py * w} ${lx - px * w},${ly - py * w} ${SUBJ.x - px * sp},${SUBJ.y - py * sp} ${SUBJ.x + px * sp},${SUBJ.y + py * sp}`} fill={rgb(c, 1)} opacity="0.3" />
            <line x1={lx} y1={ly} x2={SUBJ.x} y2={SUBJ.y} stroke="#64748B" strokeWidth="1" strokeDasharray="3 3" />
            <rect x={mx - 22} y={my - 20} width="44" height="16" rx="4" fill="#fff" stroke="#E2E8F0" />
            <text x={mx} y={my - 8} fontSize="11" fontWeight="600" fill="#1E293B" textAnchor="middle">{s.d.toFixed(1)} ม.</text>
            <circle cx={SUBJ.x} cy={SUBJ.y} r="15" fill="#F3F1EC" stroke="#64748B" />
            <rect x={SUBJ.x + 13} y={SUBJ.y - 5} width="7" height="10" rx="3" fill="none" stroke="#64748B" strokeWidth="1.5" />
            <g transform={`translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${ang.toFixed(1)})`}>
              <rect x="-6" y={-w} width="12" height={w * 2} rx="2" fill={rgb(c, 1)} stroke="#854F0B" />
              <circle r="18" fill="transparent" />
            </g>
          </svg>
        </figure>
        <figure className="m-0">
          <figcaption className="mb-1 text-[11px] text-slate-500">จอกล้อง (ภาพที่ถ่ายได้)</figcaption>
          <svg viewBox="0 0 300 240" className="block h-auto w-full rounded-lg bg-[#141518]" role="img" aria-label={tip}>
            <defs>
              <linearGradient id={g("mug")} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={rgb(base, left)} /><stop offset={0.5 - gap} stopColor={rgb(base, left)} />
                <stop offset={0.5 + gap} stopColor={rgb(base, right)} /><stop offset="1" stopColor={rgb(base, right)} />
              </linearGradient>
              <radialGradient id={g("wall")} cx="0.5" cy="0.55" r="0.75"><stop offset="0" stopColor={rgb(c, wall + 0.05)} /><stop offset="1" stopColor={rgb(c, wall * 0.35)} /></radialGradient>
              <filter id={g("bl")} x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation={(0.4 + s.soft * 0.09).toFixed(1)} /></filter>
            </defs>
            <rect x="10" y="10" width="280" height="220" rx="4" fill={`url(#${g("wall")})`} />
            <rect x="10" y="176" width="280" height="54" fill={rgb(c, wall * 0.6 + 0.04)} />
            <ellipse cx={150 - sn * 38} cy="180" rx={36 + s.soft * 0.25} ry="7" fill="#000" filter={`url(#${g("bl")})`}
              opacity={(cl(0.25 + 0.6 * f + 0.3) * Is * (0.85 - s.soft * 0.004)).toFixed(2)} />
            <path d="M184 112 q26 0 26 22 q0 22 -26 22" fill="none" strokeWidth="9" strokeLinecap="round" stroke={rgb(base, right * 0.9)} />
            <rect x="116" y="96" width="70" height="84" rx="7" fill={`url(#${g("mug")})`} />
            <rect x="116" y="96" width="70" height="84" rx="7" fill="none" strokeWidth="2.5" stroke={rgb(c, 1)} opacity={f < -0.2 ? cl(-f) * Math.min(1, Is * 1.4) : 0} />
            <text x="18" y="26" fontSize="11" fill="#E8E6E1">{`${fixed ? `แสงถึงสินค้า ${Math.round(I * 100)}%` : `ไฟห่าง ${s.d.toFixed(1)} ม.`}  ·  ${s.k}K  ·  ${Math.round(s.a)}°`}</text>
            <circle cx="272" cy="20" r="4" fill="#E24B4A" />
          </svg>
        </figure>
      </div>
      <p className="mt-2 min-h-[44px] text-[14px] leading-relaxed text-slate-800" aria-live="polite">{tip}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 text-[12px] text-slate-500">{F.label}</span>
        <span className="text-[11px] text-slate-400">{F.lo}</span>
        <input type="range" min={F.min} max={F.max} step={F.step} value={s[F.key]} aria-label={F.label}
          onChange={(e) => setS((o) => ({ ...o, [F.key]: Number(e.target.value) }))} className="min-w-[120px] flex-1 accent-indigo-600" />
        <span className="text-[11px] text-slate-400">{F.hi}</span>
        <span className="w-14 text-right text-[12px] font-medium text-slate-700">{F.fmt(s[F.key])}</span>
        <button type="button" onClick={play} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 hover:bg-slate-50">
          <Icon name="player-play" /> ดูตัวอย่าง
        </button>
        <button type="button" onClick={() => { setS(init); setChip(null); }} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-slate-500 hover:bg-slate-50">
          <Icon name="refresh" /> เริ่มใหม่
        </button>
      </div>
    </div>
  );
}
