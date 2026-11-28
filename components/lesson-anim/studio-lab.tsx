"use client";

/**
 * 🎬 สตูดิโอจำลองตัวเต็ม (Master Class) — จัดไฟหลายดวงแล้วดูผลบนจอกล้องทันที
 *   ผังบน (ลากไฟ/ตัวคุม/กล้องได้) · มองด้านข้าง (ลากความสูงไฟ) · จอกล้อง (ทิศเงา · นุ่ม/แข็ง · สว่าง/มืด · สีแสง · แววตา · แถบสะท้อนบนของเงา)
 *   ตัวเลขช่างไฟ: อัตราส่วนไฟ · ค่ารูรับแสงแนะนำ · รายการอุปกรณ์ · สูตรไฟสำเร็จรูป 16 สูตร พร้อมเหตุผล
 *   ย้อนกลับ/ทำซ้ำ (ปุ่ม + Ctrl+Z / Ctrl+Y) · จำชุดล่าสุดในเครื่อง (ของส่วนตัว ไม่ใช่การบันทึกจริง)
 *   กติกา/ตัวคำนวณแสง = lib/studio-light.ts · ใช้ที่ /misc/learn/studio และภาพสอน preset "studio-lab"
 *   เจ้าของเลือก 2026-11-28 (แบบ widget + ข้อ 1 มุมข้าง · 2 ตัวเลขช่างไฟ · 3 แววตา · 4 รายการอุปกรณ์ · 6 3D = รอบถัดไป)
 * คู่มือ docs/studio-sim.md
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { shortcutKey } from "@/lib/shortcut-key";
import {
  BACKDROPS, BAG_COLORS, BAG_MATERIALS, BAG_SHAPES, CONTROLS, LIGHT_TYPES, MAX_ITEMS, MODIFIERS, RECIPES, SKIN, SUBJECTS,
  applyRecipe, cleanSetup, computeStudio, defaultSetup, explain, gearList, kelvinRgb, newControl, newLight, planXZ, ratioText, shadeAt,
  type Backdrop, type BagMaterial, type BagShape, type ControlKind, type LightType, type ModifierKey, type StudioControl, type StudioItem,
  type StudioLight, type StudioRecipe, type StudioResult, type StudioSetup, type SubjectKind, type V3,
} from "@/lib/studio-light";

const LS_KEY = "erp.studioLab.last.v1";
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(",")})`;
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const isLight = (i: StudioItem): i is StudioLight => i.kind === "light";

// ───────── ย้อนกลับ/ทำซ้ำ ─────────
function useHistoryState(init: () => StudioSetup) {
  const [s, setS] = useState<StudioSetup>(init);
  // ค่าปัจจุบันเก็บใน ref (ไม่ทำงานข้างเคียงใน setState — โหมด dev ของ React เรียกซ้ำ 2 รอบ)
  const cur = useRef<StudioSetup>(s);
  const past = useRef<StudioSetup[]>([]);
  const future = useRef<StudioSetup[]>([]);
  const lastKey = useRef<{ k: string; t: number } | null>(null);
  const commit = (n: StudioSetup) => { cur.current = n; setS(n); };
  /** key = รวมการเปลี่ยนต่อเนื่อง (ลากแถบ/ลากไฟ) เป็นก้าวเดียว */
  const change = useCallback((fn: (o: StudioSetup) => StudioSetup, key?: string) => {
    const o = cur.current, now = Date.now();
    const merge = key && lastKey.current?.k === key && now - lastKey.current.t < 900;
    if (!merge) { past.current.push(o); if (past.current.length > 80) past.current.shift(); future.current = []; }
    lastKey.current = key ? { k: key, t: now } : null;
    commit(fn(o));
  }, []);
  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; future.current.push(cur.current); lastKey.current = null; commit(p); }, []);
  const redo = useCallback(() => { const f = future.current.pop(); if (!f) return; past.current.push(cur.current); lastKey.current = null; commit(f); }, []);
  return { s, change, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

// ───────── ชิ้นเล็ก ๆ ─────────
function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-medium text-slate-700">
        {title}<span className="text-slate-400 transition group-open:rotate-180"><Icon name="chevron-down" /></span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-3 py-2.5">{children}</div>
    </details>
  );
}
function Slider({ label, value, min, max, step, fmt, onChange, k }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number, key: string) => void; k: string }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-slate-600">
      <span className="w-[68px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value), k)} className="min-w-0 flex-1 accent-indigo-600" aria-label={label} />
      <span className="w-14 shrink-0 text-right font-medium text-slate-700">{fmt(value)}</span>
    </label>
  );
}
function Chips<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onPick(k)}
          className={`rounded-full border px-2.5 py-1 text-[12px] ${value === k ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
      ))}
    </div>
  );
}
const sel = "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]";

// ───────── ผังบน ─────────
const PX = 42, CX = 150, CY = 128, CAM_D = 2.5;
function itemLabel(it: StudioItem) { return isLight(it) ? `${LIGHT_TYPES[it.type].label} · ${MODIFIERS[it.mod].label}` : CONTROLS[it.kind].label; }

function PlanView({ s, r, selId, onSelect, onMove, onCam }: { s: StudioSetup; r: StudioResult; selId: string | null; onSelect: (id: string) => void; onMove: (id: string, a: number, d: number) => void; onCam: (a: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<string | null>(null);
  const pt = (e: RPointerEvent) => { const b = ref.current!.getBoundingClientRect(); return [((e.clientX - b.left) * 300) / b.width - CX, ((e.clientY - b.top) * 260) / b.height - CY] as const; };
  const xy = (a: number, d: number) => { const [x, z] = planXZ(a, d); return [CX + x * PX, CY + z * PX] as const; };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const [x, y] = pt(e);
    const a = Math.round((Math.atan2(x, y) * 180) / Math.PI);
    if (drag.current === "__cam") { onCam(clamp(a, -90, 90)); return; }
    onMove(drag.current, a, Math.round(clamp(Math.hypot(x, y) / PX, 0.4, 2.8) * 10) / 10);
  };
  const start = (id: string) => (e: RPointerEvent) => { e.stopPropagation(); drag.current = id; if (id !== "__cam") onSelect(id); ref.current?.setPointerCapture(e.pointerId); };
  const bgY = CY - Math.min(s.bgDist, 2.6) * PX;
  const [camX, camY] = xy(s.camA, CAM_D);
  const fov = (Math.atan(18 / s.lens) * 180) / Math.PI;
  const subjPerson = SUBJECTS[s.subject].person;
  return (
    <svg ref={ref} viewBox="0 0 300 260" className="block h-auto w-full touch-none select-none rounded-lg bg-slate-50" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
      role="img" aria-label="ผังสตูดิโอมองจากด้านบน ลากไฟ ตัวคุมแสง และกล้องได้">
      <defs><pattern id="sl-grid" width={PX / 2} height={PX / 2} patternUnits="userSpaceOnUse"><path d={`M${PX / 2} 0H0V${PX / 2}`} fill="none" stroke="#E2E8F0" strokeWidth="0.6" /></pattern></defs>
      <rect width="300" height="260" fill="url(#sl-grid)" />
      <line x1="16" y1={bgY} x2="284" y2={bgY} stroke={css(BACKDROPS[s.backdrop].rgb.map((v) => Math.min(200, v)))} strokeWidth="4" />
      <text x="18" y={bgY - 5} fontSize="10" fill="#94A3B8">{BACKDROPS[s.backdrop].label} · ห่าง {s.bgDist.toFixed(1)} ม.</text>
      {/* มุมรับภาพกล้อง */}
      <g transform={`translate(${camX},${camY}) rotate(${-s.camA})`}>
        <polygon points={`0,0 ${-Math.tan((fov * Math.PI) / 180) * 120},-120 ${Math.tan((fov * Math.PI) / 180) * 120},-120`} fill="#94A3B8" opacity="0.13" />
      </g>
      {/* ลำแสง */}
      {s.items.filter(isLight).map((l) => {
        const [x, y] = xy(l.a, l.d); const res = r.lights.find((q) => q.id === l.id);
        const sp = Math.min(70, MODIFIERS[l.mod].spread) * (Math.PI / 180); const ang = Math.atan2(CY - y, CX - x); const len = Math.hypot(CX - x, CY - y) + 40;
        const p1 = [x + Math.cos(ang - sp) * len, y + Math.sin(ang - sp) * len], p2 = [x + Math.cos(ang + sp) * len, y + Math.sin(ang + sp) * len];
        return <polygon key={`b${l.id}`} points={`${x},${y} ${p1.join(",")} ${p2.join(",")}`} fill={css(kelvinRgb(l.k))} opacity={res?.blocked ? 0.06 : 0.1 + (l.power / 100) * 0.12} />;
      })}
      {/* ตัวแบบ */}
      {subjPerson
        ? <g><ellipse cx={CX} cy={CY} rx="16" ry="11" fill="#CBD5E1" stroke="#64748B" /><circle cx={CX} cy={CY} r="7" fill="#94A3B8" /><circle cx={CX} cy={CY + 8} r="2.5" fill="#64748B" /></g>
        : <rect x={CX - 14} y={CY - 7} width="28" height="14" rx="3" fill={s.bag.color} stroke="#475569" />}
      {/* กล้อง */}
      <g transform={`translate(${camX},${camY}) rotate(${-s.camA})`} onPointerDown={start("__cam")} className="cursor-grab">
        <rect x="-13" y="-6" width="26" height="15" rx="3" fill="#475569" /><rect x="-5" y="-12" width="10" height="7" rx="1.5" fill="#475569" />
        <circle r="20" fill="transparent" />
      </g>
      <text x={camX + 16} y={camY + 14} fontSize="10" fill="#94A3B8">กล้อง {s.lens}mm</text>
      {/* ไฟ + ตัวคุม */}
      {s.items.map((it) => {
        const [x, y] = xy(it.a, it.d); const rot = (Math.atan2(CY - y, CX - x) * 180) / Math.PI; const on = it.id === selId;
        if (isLight(it)) {
          const w = 5 + MODIFIERS[it.mod].size * 9;
          return (
            <g key={it.id} onPointerDown={start(it.id)} className="cursor-grab">
              <g transform={`translate(${x},${y}) rotate(${rot})`}>
                <rect x="-5" y={-w} width="10" height={w * 2} rx="2" fill={css(kelvinRgb(it.k))} stroke={on ? "#4F46E5" : "#854F0B"} strokeWidth={on ? 2.2 : 1} />
                {it.mod === "grid" && <path d={`M5 ${-w} V${w}`} stroke="#334155" strokeWidth="2" strokeDasharray="2 2" />}
              </g>
              <text x={x} y={y - w - 4} fontSize="9" fill={on ? "#4F46E5" : "#64748B"} textAnchor="middle">{it.power}%</text>
              <circle cx={x} cy={y} r="18" fill="transparent" />
            </g>
          );
        }
        const fill = it.kind === "refl-gold" ? "#E7B65A" : it.kind === "refl-silver" ? "#CBD5E1" : it.kind === "refl-white" ? "#FFFFFF" : "#1F2937";
        return (
          <g key={it.id} onPointerDown={start(it.id)} className="cursor-grab">
            <g transform={`translate(${x},${y}) rotate(${rot})`}>
              {it.kind === "vflat" ? <path d="M-4 -16 L4 0 L-4 16" fill="none" stroke="#111827" strokeWidth="4" /> : <rect x="-3" y={it.kind === "flag" ? -13 : -15} width="6" height={it.kind === "flag" ? 26 : 30} fill={fill} stroke={on ? "#4F46E5" : "#64748B"} strokeWidth={on ? 2 : 1} />}
            </g>
            <circle cx={x} cy={y} r="16" fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

// ───────── มองด้านข้าง (ข้อ 1) ─────────
function SideView({ s, selId, onHeight }: { s: StudioSetup; selId: string | null; onHeight: (id: string, h: number, d: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<string | null>(null);
  const SX = 205, SY = 92, P = 42;
  const person = SUBJECTS[s.subject].person;
  const pos = (h: number, d: number) => [SX - d * Math.cos((h * Math.PI) / 180) * P, SY - d * Math.sin((h * Math.PI) / 180) * P] as const;
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const b = ref.current!.getBoundingClientRect(); const x = ((e.clientX - b.left) * 300) / b.width - SX, y = ((e.clientY - b.top) * 170) / b.height - SY;
    const h = Math.round(clamp((Math.atan2(-y, -x) * 180) / Math.PI, -40, 85)); const d = Math.round(clamp(Math.hypot(x, y) / P, 0.4, 2.8) * 10) / 10;
    onHeight(drag.current, h, d);
  };
  const lights = s.items.filter(isLight);
  return (
    <svg ref={ref} viewBox="0 0 300 170" className="block h-auto w-full touch-none select-none rounded-lg bg-slate-50" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
      role="img" aria-label="มองจากด้านข้าง ลากไฟขึ้นลงเพื่อเปลี่ยนความสูง">
      <line x1="0" y1="150" x2="300" y2="150" stroke="#CBD5E1" strokeWidth="2" />
      <text x="6" y="164" fontSize="9" fill="#94A3B8">พื้น · ลากไฟขึ้น/ลง = มุมสูง</text>
      {person ? (
        <g fill="#CBD5E1" stroke="#64748B"><circle cx={SX} cy={SY} r="10" /><path d={`M${SX - 9} ${SY + 12} q9 -4 18 0 l2 46 h-22z`} /><path d={`M${SX + 9} ${SY - 2} l5 3 -5 2`} fill="#94A3B8" /></g>
      ) : (
        <g><rect x={SX - 26} y={SY + 14} width="52" height="5" fill="#94A3B8" /><path d={`M${SX - 4} ${SY + 14} V150 M${SX + 20} ${SY + 14} V150`} stroke="#94A3B8" strokeWidth="2" /><rect x={SX - 8} y={SY - 8} width="16" height="22" rx="2" fill={s.bag.color} /></g>
      )}
      <g transform={`translate(${SX + 70},${SY + 4 - Math.sin((s.camH * Math.PI) / 180) * 30})`}><rect x="-10" y="-6" width="20" height="12" rx="2" fill="#475569" /><path d="M-10 0 h-8" stroke="#475569" strokeWidth="5" /></g>
      {lights.map((l) => {
        const [x, y] = pos(l.h, l.d); const on = l.id === selId;
        return (
          <g key={l.id} opacity={on ? 1 : 0.4} onPointerDown={(e) => { e.stopPropagation(); drag.current = l.id; ref.current?.setPointerCapture(e.pointerId); }} className="cursor-grab">
            <line x1={x} y1={y} x2={SX} y2={SY} stroke={css(kelvinRgb(l.k))} strokeWidth={on ? 8 : 4} opacity="0.35" />
            <line x1={x} y1={y} x2={x} y2="150" stroke="#94A3B8" strokeDasharray="2 3" />
            <g transform={`translate(${x},${y}) rotate(${-l.h})`}><rect x="-4" y={-6 - MODIFIERS[l.mod].size * 6} width="8" height={12 + MODIFIERS[l.mod].size * 12} rx="2" fill={css(kelvinRgb(l.k))} stroke={on ? "#4F46E5" : "#854F0B"} strokeWidth={on ? 2 : 1} /></g>
            {on && <text x={x} y={y - 14 - MODIFIERS[l.mod].size * 6} fontSize="10" fontWeight="600" fill="#4F46E5" textAnchor="middle">{l.h > 0 ? `สูง ${l.h}°` : l.h < 0 ? `ต่ำ ${-l.h}°` : "ระดับเดียวกัน"}</text>}
            <circle cx={x} cy={y} r="16" fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

// ───────── จอกล้อง ─────────
function CameraView({ s, r }: { s: StudioSetup; r: StudioResult }) {
  const uid = useId().replace(/:/g, "");
  const g = (n: string) => `${n}${uid}`;
  const ex = r.exposure;
  const wb = r.wbRgb;
  const shade = (alb: readonly number[], n: V3) => { const c = shadeAt(r, n); return [0, 1, 2].map((j) => alb[j] * c[j] * ex * (255 / wb[j])); };
  const person = SUBJECTS[s.subject].person;
  const key = r.lights.find((l) => l.id === r.keyId);
  const kd: V3 = key ? key.dir : [0, 0.3, 1];
  const ratio = r.ratio ?? 1;
  const shadowK = clamp(1 - 1 / ratio, 0, 0.92);   // เงาเข้มแค่ไหน (ตามอัตราส่วนไฟ)
  const soft = key?.soft ?? 0.5;
  const zoom = s.lens / 85;

  // ไล่แสงแนวนอน (9 จุดรอบทรงกระบอก) + แนวตั้ง
  const hStops = (alb: readonly number[], ny = 0.12) => [-85, -64, -42, -21, 0, 21, 42, 64, 85].map((t, i) => {
    const tr = (t * Math.PI) / 180; return <stop key={i} offset={i / 8} stopColor={css(shade(alb, [Math.sin(tr), ny, Math.cos(tr)]))} />;
  });
  const lum = (n: V3) => { const c = shadeAt(r, n); return (c[0] + c[1] + c[2]) / 3; };
  const mid = Math.max(0.0001, lum([0, 0, 1]));
  const topDark = clamp(1 - lum([0, 0.75, 0.66]) / mid, 0, 0.8), botDark = clamp(1 - lum([0, -0.7, 0.7]) / mid, 0, 0.85);
  const vGrad = (id: string) => (
    <linearGradient id={g(id)} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#000" stopOpacity={topDark} /><stop offset="0.45" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity={botDark} />
    </linearGradient>
  );

  // ฉากหลัง
  const bd = BACKDROPS[s.backdrop].rgb;
  const bgL = (ch: number) => bd[ch] * (r.bgE * (r.bgRgb[ch] / 255) + s.ambient * 0.05) * (255 / wb[ch]);
  const bgCss = css([0, 1, 2].map(bgL)), bgEdge = css([0, 1, 2].map((ch) => bgL(ch) * 0.55));
  const hot = r.lights.reduce((a, l) => a + l.bgE * l.dir[0], 0) / Math.max(0.0001, r.lights.reduce((a, l) => a + l.bgE, 0));

  // เงาตกบนฉาก/พื้น
  const wallShadow = clamp(shadowK * (1 - s.bgDist / 2.4), 0, 0.75);
  const sdx = -kd[0] * (20 + s.bgDist * 40), sdy = kd[1] * 18;
  const blur = 1 + soft * 9 + s.bgDist * 3;

  // ขอบสว่างจากไฟหลังตัวแบบ (rim)
  const rims = r.lights.filter((l) => l.dir[2] < -0.15 && l.e > 0.02).map((l) => ({ side: Math.sign(l.dir[0]) || 1, o: clamp(l.e * ex * 1.6, 0, 1), c: css(l.rgb) }));

  let body: ReactNode;
  if (person) {
    const sc = (s.subject === "face" ? 1.6 : s.subject === "half" ? 0.95 : 0.5) * zoom;
    const cy = s.subject === "face" ? 150 : s.subject === "half" ? 118 : 92;
    const skin = SKIN[s.skin], cloth: [number, number, number] = [70, 82, 104];
    // เงาจมูก: ชี้ตรงข้ามไฟหลัก · ยาวตามมุมเฉียง/สูง · ขอบฟุ้งตามความนุ่ม
    const nl = 6 + 20 * Math.min(1, Math.hypot(kd[0], kd[1]));
    const nx = -kd[0], ny = Math.max(0.15, kd[1]) * 1.1; const nn = Math.hypot(nx, ny) || 1;
    const ndx = (nx / nn) * nl, ndy = (ny / nn) * nl;
    const ax = Math.abs(kd[0]);
    const occ = clamp(clamp((ax - 0.28) / 0.3, 0, 1) * shadowK * 1.25, 0, 0.92);
    const tri = occ > 0.05 && ax < 0.8 && kd[1] > 0.3 ? clamp(occ * 1.1, 0, 1) : 0;
    const eyeR = 4.2;
    const catch_ = r.lights.filter((l) => l.front && l.e > (key?.e ?? 0) * 0.12).map((l) => ({ l, x: l.dir[0] * eyeR * 0.55, y: -l.dir[1] * eyeR * 0.55, z: clamp(l.apparent * 1.6, 0.5, 2.6) }));
    const bounceCatch = r.bounce.filter((b) => b.e > 0.04 && b.dir[2] > 0.2);
    const eye = (ex0: number) => (
      <g key={ex0}>
        <ellipse cx={ex0} cy="-6" rx="6.5" ry="3.6" fill="#F4F1EC" opacity="0.9" />
        <circle cx={ex0} cy="-6" r={eyeR} fill="#3A2A20" /><circle cx={ex0} cy="-6" r="1.8" fill="#0B0B0B" />
        {catch_.map(({ l, x, y, z }, i) => {
          const cx = ex0 + x, cy2 = -6 + y; const o = clamp(l.e * ex * 2.5, 0.35, 1);
          switch (l.shape) {
            case "round": return <circle key={i} cx={cx} cy={cy2} r={z * 0.75} fill="#fff" opacity={o} />;
            case "ring": return <circle key={i} cx={cx} cy={cy2} r={z * 0.6} fill="none" stroke="#fff" strokeWidth="0.7" opacity={o} />;
            case "strip": return <rect key={i} x={cx - 0.35} y={cy2 - z * 0.9} width="0.7" height={z * 1.8} fill="#fff" opacity={o} />;
            case "window": return <g key={i} opacity={o}><rect x={cx - z * 0.6} y={cy2 - z * 0.6} width={z * 1.2} height={z * 1.2} fill="#fff" /><path d={`M${cx} ${cy2 - z * 0.6}V${cy2 + z * 0.6}M${cx - z * 0.6} ${cy2}H${cx + z * 0.6}`} stroke="#3A2A20" strokeWidth="0.25" /></g>;
            case "rect": return <rect key={i} x={cx - z * 0.5} y={cy2 - z * 0.65} width={z} height={z * 1.3} fill="#fff" opacity={o} />;
            default: return <circle key={i} cx={cx} cy={cy2} r="0.45" fill="#fff" opacity={o} />;
          }
        })}
        {bounceCatch.map((b, i) => <ellipse key={`b${i}`} cx={ex0 + b.dir[0] * 2} cy={-6 + 2.6} rx="1.2" ry="0.45" fill="#fff" opacity={clamp(b.e * ex * 3, 0.2, 0.7)} />)}
      </g>
    );
    const torso = s.subject !== "face";
    body = (
      <g transform={`translate(200,${cy}) scale(${sc})`}>
        <defs>
          <linearGradient id={g("skin")} x1="0" x2="1">{hStops(skin)}</linearGradient>
          <linearGradient id={g("cloth")} x1="0" x2="1">{hStops(cloth, 0.3)}</linearGradient>
          {vGrad("v")}
          <clipPath id={g("face")}><ellipse cx="0" cy="0" rx="34" ry="44" /></clipPath>
          <filter id={g("nb")} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={0.6 + soft * 3.5} /></filter>
        </defs>
        {torso && <path d={`M-62 62 Q-58 40 -16 36 L16 36 Q58 40 62 62 L74 ${s.subject === "full" ? 300 : 170} L-74 ${s.subject === "full" ? 300 : 170} Z`} fill={`url(#${g("cloth")})`} />}
        {torso && <path d={`M-62 62 Q-58 40 -16 36 L16 36 Q58 40 62 62 L74 ${s.subject === "full" ? 300 : 170} L-74 ${s.subject === "full" ? 300 : 170} Z`} fill={`url(#${g("v")})`} />}
        <rect x="-11" y="26" width="22" height="16" fill={`url(#${g("skin")})`} />
        <rect x="-11" y="26" width="22" height="16" fill="#000" opacity={clamp(0.25 + kd[1] * 0.5, 0, 0.7) * shadowK} />
        <ellipse cx="0" cy="0" rx="34" ry="44" fill={`url(#${g("skin")})`} />
        <ellipse cx="0" cy="0" rx="34" ry="44" fill={`url(#${g("v")})`} />
        {/* เบ้าตา: ไฟสูง = ลึก */}
        {[-13, 13].map((x) => <ellipse key={x} cx={x} cy="-7" rx="9" ry="6" fill="#000" opacity={clamp(kd[1] * 0.45, 0, 0.4) * shadowK} filter={`url(#${g("nb")})`} />)}
        {/* แก้มฝั่งไกลไฟโดนจมูกบัง (ไฟเฉียงมาก = เงาครึ่งหน้า) · เหลือ "สามเหลี่ยมแสง" ใต้ตาเมื่อไฟสูงพอ = Rembrandt · 90° = Split */}
        {occ > 0.02 && (
          <g clipPath={`url(#${g("face")})`}><g transform={kd[0] > 0 ? undefined : "scale(-1,1)"} filter={`url(#${g("nb")})`}>
            <path d="M1 -24 L-40 -24 L-40 48 L1 48 L1 12 L3 4 L1 -6 Z" fill="#000" opacity={occ} />
            {tri > 0 && <path d="M-3 6 L-19 4 L-6 21 Z" fill={css(shade(skin, [0, 0.1, 1]))} opacity={tri} />}
          </g></g>
        )}
        {/* เงาจมูก (Rembrandt/Loop/Butterfly เกิดจากตรงนี้) */}
        <path d={`M-1 4 L1 4 L${ndx * 0.4 + 2} 14 L${ndx} ${10 + ndy} L${ndx * 0.5 - 2} ${12 + ndy * 0.6} Z`} fill="#000" opacity={shadowK * 0.75} filter={`url(#${g("nb")})`} />
        <path d="M-2 -4 Q0 10 -4 13 Q0 15 4 13" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" />
        <path d="M-9 25 Q0 29 9 25" fill="none" stroke="#7A3B30" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
        {eye(-13)}{eye(13)}
        <path d="M-35 -6 Q-36 -48 0 -50 Q36 -48 35 -6 Q30 -34 0 -38 Q-30 -34 -35 -6" fill="#1F1A17" />
        {rims.map((m, i) => <path key={i} d={m.side > 0 ? "M30 -30 Q38 0 28 30" : "M-30 -30 Q-38 0 -28 30"} fill="none" stroke={m.c} strokeWidth="3" opacity={m.o} strokeLinecap="round" />)}
        {torso && rims.map((m, i) => <path key={`t${i}`} d={m.side > 0 ? "M18 37 Q60 42 64 70" : "M-18 37 Q-60 42 -64 70"} fill="none" stroke={m.c} strokeWidth="3" opacity={m.o} strokeLinecap="round" />)}
      </g>
    );
  } else {
    const alb = hex(s.bag.color); const gloss = BAG_MATERIALS[s.bag.material].gloss;
    const shape = s.bag.shape;
    const outline = shape === "tote" ? "M-62 -38 L62 -38 L74 52 Q74 58 68 58 L-68 58 Q-74 58 -74 52 Z" : shape === "cross" ? "M-66 -34 Q-66 -44 -56 -44 L56 -44 Q66 -44 66 -34 L66 48 Q66 58 56 58 L-56 58 Q-66 58 -66 48 Z" : "M0 -50 A54 54 0 1 1 -0.1 -50 Z";
    const half = shape === "round" ? 54 : 70, top = shape === "round" ? -50 : -42, h = shape === "round" ? 108 : 100;
    const zs = zoom * 0.95;
    // จุด/แถบสะท้อน = ภาพของตัวปรับแสงที่สะท้อนบนผิวเงา (ตำแหน่ง = เวกเตอร์กึ่งกลางระหว่างไฟกับกล้อง)
    const specs = gloss > 0 ? r.lights.map((l) => {
      const hv = [l.dir[0], l.dir[1], l.dir[2] + 1]; const hn = Math.hypot(hv[0], hv[1], hv[2]) || 1;
      if (hv[2] / hn < 0.25) return null;
      const x = (hv[0] / Math.hypot(hv[0], hv[2])) * half * 0.95;
      const big = l.apparent; const w = clamp(big * 18, 2.5, 34);
      const tall = l.shape === "strip" || l.shape === "rect" || l.shape === "window" ? clamp(big * 90, 10, h * 0.92) : clamp(big * 50, 3, h * 0.7);
      const y = -(hv[1] / hn) * h * 0.35 - tall / 2;
      return { x, y, w, tall, o: clamp(l.e * ex * 2.4, 0, 1) * gloss * (0.75 + 0.25 * (1 - alb[0] / 255)), soft: l.soft, c: css(l.rgb), round: l.shape === "round" || l.shape === "ring" };
    }).filter(Boolean) : [];
    const texture = s.bag.material === "fabric" ? clamp((1 - soft) * Math.abs(kd[0]) * 1.2, 0.05, 0.6) : s.bag.material === "matte" ? clamp((1 - soft) * Math.abs(kd[0]) * 0.6, 0.03, 0.3) : 0;
    body = (
      <g transform={`translate(200,168) scale(${zs})`}>
        <defs>
          <linearGradient id={g("bag")} x1="0" x2="1">{hStops(alb, 0.15)}</linearGradient>
          {vGrad("v")}
          <clipPath id={g("clip")}><path d={outline} /></clipPath>
          <pattern id={g("tx")} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform={`rotate(${kd[0] > 0 ? 35 : -35})`}><path d="M0 2H4" stroke="#000" strokeWidth="1.1" /></pattern>
          <filter id={g("sb")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={1.2} /></filter>
          <filter id={g("sb2")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={3} /></filter>
        </defs>
        {shape === "tote" && <path d="M-34 -38 Q-34 -86 0 -86 Q34 -86 34 -38" fill="none" stroke={css(shade(alb, [0, 0.4, 0.9]))} strokeWidth="7" />}
        {shape === "round" && <path d="M-30 -40 Q0 -100 30 -40" fill="none" stroke={css(shade(alb, [0, 0.4, 0.9]))} strokeWidth="6" />}
        {shape === "cross" && <path d="M-60 -40 Q-90 -120 0 -130 Q90 -120 60 -40" fill="none" stroke={css(shade(alb, [0, 0.4, 0.9]).map((v) => v * 0.8))} strokeWidth="3" />}
        <path d={outline} fill={`url(#${g("bag")})`} />
        <g clipPath={`url(#${g("clip")})`}>
          <rect x={-half - 10} y={top - 10} width={half * 2 + 20} height={h + 20} fill={`url(#${g("v")})`} />
          {texture > 0 && <rect x={-half - 10} y={top - 10} width={half * 2 + 20} height={h + 20} fill={`url(#${g("tx")})`} opacity={texture} />}
          {shape === "cross" && <><path d="M-66 -44 L66 -44 L66 8 Q0 22 -66 8 Z" fill="#000" opacity="0.08" /><path d="M-66 8 Q0 22 66 8" fill="none" stroke="#000" strokeOpacity={0.25 + shadowK * 0.3} strokeWidth="2" /><rect x="-7" y="6" width="14" height="10" rx="2" fill="#C8A24A" /></>}
          {specs.map((p, i) => p && (p.round
            ? <ellipse key={i} cx={p.x} cy={p.y + p.tall / 2} rx={p.w / 2} ry={p.tall / 2} fill={p.c} opacity={p.o} filter={`url(#${g(p.soft > 0.5 ? "sb2" : "sb")})`} />
            : <rect key={i} x={p.x - p.w / 2} y={p.y} width={p.w} height={p.tall} rx={p.w / 3} fill={p.c} opacity={p.o} filter={`url(#${g(p.soft > 0.5 ? "sb2" : "sb")})`} />))}
          {rims.map((m, i) => <rect key={`r${i}`} x={m.side > 0 ? half - 5 : -half - 1} y={top} width="6" height={h} fill={m.c} opacity={m.o * 0.9} filter={`url(#${g("sb")})`} />)}
        </g>
        <path d={outline} fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
      </g>
    );
  }

  const floorY = person ? (s.subject === "full" ? 232 : null) : 222;
  const subjW = person ? 70 * zoom : 80 * zoom;
  const hintTop = `${r.lights.length} ไฟ · ${s.wb === "auto" ? "WB อัตโนมัติ" : `WB ${s.wb}K`} · ${r.fstop?.label ?? "-"} · ${s.lens}mm`;
  return (
    <svg viewBox="0 0 400 300" className="block h-auto w-full rounded-lg bg-black" role="img" aria-label="จอกล้อง ภาพที่ถ่ายได้จากการจัดไฟตอนนี้">
      <defs>
        <radialGradient id={g("bg")} cx={0.5 + hot * 0.25} cy="0.45" r="0.8"><stop offset="0" stopColor={bgCss} /><stop offset="1" stopColor={bgEdge} /></radialGradient>
        <filter id={g("ws")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={blur} /></filter>
        <filter id={g("fs")} x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation={1.5 + soft * 10} /></filter>
      </defs>
      <rect width="400" height="300" fill={`url(#${g("bg")})`} />
      {floorY && <rect x="0" y={floorY - 14} width="400" height={300 - floorY + 14} fill="#000" opacity="0.12" />}
      {/* เงาบนฉากหลัง: ชิดฉาก = เงาเข้มชัด · ห่างฉาก = จาง/หลุดเฟรม */}
      {wallShadow > 0.02 && <ellipse cx={200 + sdx} cy={person ? 150 + sdy : 160 + sdy} rx={subjW * 0.9} ry={person ? 110 * zoom : 60 * zoom} fill="#000" opacity={wallShadow} filter={`url(#${g("ws")})`} />}
      {floorY && <ellipse cx={200 - kd[0] * 60 * zoom} cy={floorY} rx={(person ? 40 : 82) * zoom + soft * 26} ry={7 + Math.max(0, 1 - kd[1]) * 5} fill="#000" opacity={clamp(0.25 + shadowK * 0.6, 0, 0.85)} filter={`url(#${g("fs")})`} />}
      {body}
      <text x="12" y="20" fontSize="12" fill="#F1F5F9" opacity="0.9">{hintTop}</text>
      <circle cx="384" cy="16" r="5" fill="#E24B4A" />
    </svg>
  );
}

// ───────── ตัวหลัก ─────────
function loadLast(initial?: StudioSetup): StudioSetup {
  if (initial) return cleanSetup(initial);
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return cleanSetup(JSON.parse(raw)); } catch { /* ไม่มี/อ่านไม่ได้ */ }
  return defaultSetup();
}

/** วาดเฉพาะในเบราว์เซอร์ — เลขทศนิยมของ Math.sin/cos ฝั่งเซิร์ฟเวอร์กับเบราว์เซอร์ต่างกันนิดหน่อย (hydration ไม่ตรง) + ต้องอ่านชุดล่าสุดจากเครื่อง */
export function StudioLab(props: { initial?: StudioSetup; variant?: "page" | "embed" }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="h-[420px] animate-pulse rounded-xl bg-slate-100" aria-label="กำลังเปิดสตูดิโอจำลอง" />;
  return <StudioLabInner {...props} />;
}

function StudioLabInner({ initial, variant = "page" }: { initial?: StudioSetup; variant?: "page" | "embed" }) {
  const recipes = useMemo(() => RECIPES.map((f) => f()), []);
  const { s, change, undo, redo, canUndo, canRedo } = useHistoryState(() => (variant === "page" || initial ? loadLast(initial) : defaultSetup()));
  const [selId, setSelId] = useState<string | null>(s.items[0]?.id ?? null);
  const [recipe, setRecipe] = useState<StudioRecipe | null>(null);
  const [view2, setView2] = useState<"plan" | "side">("plan");
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const r = useMemo(() => computeStudio(s), [s]);
  const tips = useMemo(() => explain(s, r), [s, r]);
  const gear = useMemo(() => gearList(s), [s]);
  const selItem = s.items.find((i) => i.id === selId) ?? s.items[0] ?? null;
  const selKey = selItem?.id ?? null;

  useEffect(() => { if (variant !== "page") return; try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* เก็บไม่ได้ ไม่เป็นไร */ } }, [s, variant]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (variant === "embed" && !rootRef.current?.contains(document.activeElement)) return;
      const k = shortcutKey(e);
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [undo, redo, variant]);

  const set = <K extends keyof StudioSetup>(k: K, v: StudioSetup[K], key?: string) => change((o) => ({ ...o, [k]: v }), key);
  const setItem = (id: string, patch: Partial<StudioLight> | Partial<StudioControl>, key?: string) => change((o) => ({ ...o, items: o.items.map((i) => (i.id === id ? ({ ...i, ...patch } as StudioItem) : i)) }), key);
  const addItem = (it: StudioItem) => { if (s.items.length >= MAX_ITEMS) return; change((o) => ({ ...o, items: [...o.items, it] })); setSelId(it.id); setRecipe(null); };
  const removeItem = (id: string) => { change((o) => ({ ...o, items: o.items.filter((i) => i.id !== id) })); if (selKey === id) setSelId(null); };
  const dupItem = (it: StudioItem) => addItem({ ...it, id: `${it.id.slice(0, 20)}c${Date.now().toString(36)}`, a: clamp(it.a + 25, -180, 180) } as StudioItem);
  const pickRecipe = (rc: StudioRecipe) => { const n = applyRecipe(rc, s); change(() => n); setRecipe(rc); setSelId(n.items[0]?.id ?? null); };
  const copyGear = async () => {
    const text = gear.map((g) => `☐ ${g.item}${g.qty > 1 ? ` × ${g.qty}` : ""}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* คัดลอกไม่ได้ */ }
  };

  const recipeBar = (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {(["คน", "อารมณ์ภาพ", "สินค้า"] as const).map((grp) => (
        <div key={grp} className="flex shrink-0 items-center gap-1">
          <span className="shrink-0 text-[11px] text-slate-400">{grp}</span>
          {recipes.filter((x) => x.group === grp).map((x) => (
            <button key={x.key} type="button" onClick={() => pickRecipe(x)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] ${recipe?.key === x.key ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{x.label}</button>
          ))}
        </div>
      ))}
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={undo} disabled={!canUndo} title="ย้อนกลับ (Ctrl+Z)" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Icon name="arrow-back-up" /> ย้อน</button>
      <button type="button" onClick={redo} disabled={!canRedo} title="ทำซ้ำ (Ctrl+Y)" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Icon name="arrow-forward-up" /> ทำซ้ำ</button>
      <button type="button" onClick={() => { const d = defaultSetup(); change(() => d); setRecipe(null); setSelId(d.items[0].id); }} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-slate-500 hover:bg-slate-50"><Icon name="refresh" /> เริ่มใหม่</button>
    </div>
  );

  const readout = (
    <div className="grid grid-cols-3 gap-1.5 text-center">
      <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] text-slate-400">อัตราส่วนไฟ</div><div className="text-[13px] font-semibold text-slate-800">{r.ratio === null ? "-" : r.ratio < 1.25 ? "1:1" : `${r.ratio >= 10 ? Math.round(r.ratio) : r.ratio.toFixed(1)}:1`}</div></div>
      <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] text-slate-400">ตั้งรูรับแสง*</div><div className="text-[13px] font-semibold text-slate-800">{r.fstop?.label ?? "-"}</div></div>
      <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] text-slate-400">ความนุ่มแสง</div><div className="text-[13px] font-semibold text-slate-800">{r.softness > 0.6 ? "นุ่ม" : r.softness < 0.25 ? "แข็ง" : "กลาง"} {Math.round(r.softness * 100)}%</div></div>
    </div>
  );

  const explainBox = (
    <div className="space-y-2">
      {recipe && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-[13px] leading-relaxed text-slate-700">
          <div className="mb-0.5 font-semibold text-indigo-700">สูตร {recipe.label}</div>
          <p>{recipe.why}</p>
          <p className="mt-1 text-[12px] text-indigo-600"><b>ดูในภาพ:</b> {recipe.look}</p>
        </div>
      )}
      <ul className="space-y-1 text-[13px] leading-relaxed text-slate-700" aria-live="polite">
        {tips.map((t, i) => <li key={i} className="flex gap-1.5"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />{t}</li>)}
      </ul>
      {r.ratio !== null && <p className="text-[11px] text-slate-400">อัตราส่วน {ratioText(r.ratio)} · *รูรับแสงประมาณที่ ISO 400 · 1/125 (ไฟต่อเนื่อง) — วัดจริงด้วยเครื่องวัดแสง/ฮิสโตแกรม</p>}
    </div>
  );

  const gearBox = (
    <Section title={`รายการอุปกรณ์ (${gear.reduce((a, g) => a + g.qty, 0)} ชิ้น)`} open={false}>
      <ul className="space-y-0.5 text-[12px] text-slate-700">{gear.map((g) => <li key={g.item} className="flex justify-between gap-2"><span>☐ {g.item}</span>{g.qty > 1 && <span className="text-slate-400">× {g.qty}</span>}</li>)}</ul>
      <button type="button" onClick={() => void copyGear()} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[12px] text-slate-600 hover:bg-slate-50"><Icon name="copy" /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายการ"}</button>
    </Section>
  );

  const subjectBox = (
    <Section title="วัตถุและฉาก">
      <Chips value={s.subject} options={Object.entries(SUBJECTS).map(([k, v]) => [k as SubjectKind, v.label])} onPick={(v) => set("subject", v)} />
      {s.subject === "bag" ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <select className={sel} value={s.bag.shape} onChange={(e) => set("bag", { ...s.bag, shape: e.target.value as BagShape })} aria-label="ทรงกระเป๋า">{Object.entries(BAG_SHAPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select className={sel} value={s.bag.material} onChange={(e) => set("bag", { ...s.bag, material: e.target.value as BagMaterial })} aria-label="วัสดุ">{Object.entries(BAG_MATERIALS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          </div>
          <div className="flex items-center gap-1.5"><span className="text-[12px] text-slate-500">สี</span>{BAG_COLORS.map((c) => <button key={c} type="button" onClick={() => set("bag", { ...s.bag, color: c })} aria-label={`สี ${c}`} className={`h-6 w-6 rounded-full border-2 ${s.bag.color === c ? "border-indigo-500" : "border-white ring-1 ring-slate-200"}`} style={{ background: c }} />)}</div>
        </>
      ) : (
        <div className="flex items-center gap-1.5"><span className="text-[12px] text-slate-500">สีผิว</span>{(["light", "tan", "deep"] as const).map((k) => <button key={k} type="button" onClick={() => set("skin", k)} aria-label={`สีผิว ${k}`} className={`h-6 w-6 rounded-full border-2 ${s.skin === k ? "border-indigo-500" : "border-white ring-1 ring-slate-200"}`} style={{ background: css(SKIN[k]) }} />)}</div>
      )}
      <Chips value={s.backdrop} options={Object.entries(BACKDROPS).map(([k, v]) => [k as Backdrop, v.label])} onPick={(v) => set("backdrop", v)} />
      <Slider label="ห่างฉาก" k="bgDist" value={s.bgDist} min={0.3} max={2.6} step={0.1} fmt={(v) => `${v.toFixed(1)} ม.`} onChange={(v, k) => set("bgDist", v, k)} />
      <Slider label="ไฟห้อง" k="amb" value={Math.round(s.ambient * 100)} min={0} max={100} step={5} fmt={(v) => (v === 0 ? "ปิด" : `${v}%`)} onChange={(v, k) => set("ambient", v / 100, k)} />
    </Section>
  );

  const cameraBox = (
    <Section title="กล้อง" open={variant === "page"}>
      <Slider label="เลนส์" k="lens" value={s.lens} min={24} max={135} step={1} fmt={(v) => `${v}mm`} onChange={(v, k) => set("lens", v, k)} />
      <Slider label="มุมกล้อง" k="camA" value={s.camA} min={-90} max={90} step={1} fmt={(v) => `${v}°`} onChange={(v, k) => set("camA", v, k)} />
      <Slider label="ความสูงกล้อง" k="camH" value={s.camH} min={-30} max={45} step={1} fmt={(v) => `${v}°`} onChange={(v, k) => set("camH", v, k)} />
      <label className="flex items-center gap-2 text-[12px] text-slate-600"><span className="w-[68px] shrink-0">ไวต์บาลานซ์</span>
        <select className={sel} value={String(s.wb)} onChange={(e) => set("wb", e.target.value === "auto" ? "auto" : Number(e.target.value))}>
          <option value="auto">อัตโนมัติ (ตามไฟ)</option>{[3200, 4300, 5600, 6500].map((k) => <option key={k} value={k}>{k}K</option>)}
        </select>
      </label>
      <p className="text-[11px] text-slate-400">เลนส์ยาว = ตัวแบบใหญ่ขึ้น เห็นฉากหลังน้อยลง · ลากกล้องในผังเพื่อเปลี่ยนมุมถ่าย (ทิศไฟเทียบกับกล้องจะเปลี่ยนตาม)</p>
    </Section>
  );

  const itemsBox = (
    <Section title={`ไฟและตัวคุมแสง (${s.items.length}/${MAX_ITEMS})`}>
      <div className="space-y-1">
        {s.items.map((it) => (
          <div key={it.id} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] ${it.id === selKey ? "border-indigo-300 bg-indigo-50" : "border-transparent hover:bg-slate-50"}`}>
            <button type="button" onClick={() => setSelId(it.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ background: isLight(it) ? css(kelvinRgb(it.k)) : it.kind === "vflat" || it.kind === "flag" ? "#1F2937" : it.kind === "refl-gold" ? "#E7B65A" : it.kind === "refl-silver" ? "#CBD5E1" : "#fff" }} />
              <span className="truncate">{itemLabel(it)}{r.keyId === it.id && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">ไฟหลัก</span>}{isLight(it) && r.lights.find((l) => l.id === it.id)?.blocked && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] text-rose-700">โดนบัง</span>}</span>
            </button>
            <button type="button" onClick={() => dupItem(it)} disabled={s.items.length >= MAX_ITEMS} aria-label="ทำซ้ำชิ้นนี้" className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><Icon name="copy" /></button>
            <button type="button" onClick={() => removeItem(it.id)} aria-label="ลบชิ้นนี้" className="text-slate-400 hover:text-rose-600"><Icon name="trash" /></button>
          </div>
        ))}
        {!s.items.length && <p className="py-2 text-center text-[12px] text-slate-400">ยังไม่มีไฟ — เพิ่มไฟ หรือเลือกสูตรไฟด้านบน</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        {([["+ ไฟ", () => addItem(newLight())], ["+ รีเฟล็ก", () => addItem(newControl("refl-white"))], ["+ V-flat ดำ", () => addItem(newControl("vflat"))], ["+ Flag", () => addItem(newControl("flag", 30))]] as [string, () => void][]).map(([l, f]) => (
          <button key={l} type="button" onClick={f} disabled={s.items.length >= MAX_ITEMS} className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-40">{l}</button>
        ))}
      </div>
      {selItem && isLight(selItem) && (
        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <select className={sel} value={selItem.type} aria-label="ประเภทไฟ" onChange={(e) => { const t = e.target.value as LightType; setItem(selItem.id, { type: t, k: LIGHT_TYPES[t].k, mod: t === "window" ? "window" : selItem.mod === "window" ? "softbox" : selItem.mod }); }}>
              {Object.entries(LIGHT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className={sel} value={selItem.mod} aria-label="ตัวปรับแสง" onChange={(e) => setItem(selItem.id, { mod: e.target.value as ModifierKey })}>
              {(Object.keys(MODIFIERS) as ModifierKey[]).filter((k) => (selItem.type === "window" ? k === "window" || k === "diff" : k !== "window")).map((k) => <option key={k} value={k}>{MODIFIERS[k].label}</option>)}
            </select>
          </div>
          <p className="text-[11px] leading-snug text-slate-500">{LIGHT_TYPES[selItem.type].note} · {MODIFIERS[selItem.mod].note}</p>
          <Slider label="ความแรง" k={`p${selItem.id}`} value={selItem.power} min={5} max={100} step={5} fmt={(v) => `${v}%`} onChange={(v, k) => setItem(selItem.id, { power: v }, k)} />
          <Slider label="สีแสง" k={`k${selItem.id}`} value={selItem.k} min={2700} max={7500} step={100} fmt={(v) => `${v}K`} onChange={(v, k) => setItem(selItem.id, { k: v }, k)} />
          <Slider label="ระยะ" k={`d${selItem.id}`} value={selItem.d} min={0.4} max={2.8} step={0.1} fmt={(v) => `${v.toFixed(1)} ม.`} onChange={(v, k) => setItem(selItem.id, { d: v }, k)} />
          <Slider label="มุมรอบ" k={`a${selItem.id}`} value={selItem.a} min={-180} max={180} step={1} fmt={(v) => `${v}°`} onChange={(v, k) => setItem(selItem.id, { a: v }, k)} />
          <Slider label="มุมสูง" k={`h${selItem.id}`} value={selItem.h} min={-40} max={85} step={1} fmt={(v) => `${v}°`} onChange={(v, k) => setItem(selItem.id, { h: v }, k)} />
        </div>
      )}
      {selItem && !isLight(selItem) && (
        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2">
          <select className={sel} value={selItem.kind} aria-label="ชนิดตัวคุมแสง" onChange={(e) => setItem(selItem.id, { kind: e.target.value as ControlKind })}>
            {Object.entries(CONTROLS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <p className="text-[11px] leading-snug text-slate-500">{CONTROLS[selItem.kind].note}</p>
          <Slider label="ระยะ" k={`d${selItem.id}`} value={selItem.d} min={0.4} max={2.8} step={0.1} fmt={(v) => `${v.toFixed(1)} ม.`} onChange={(v, k) => setItem(selItem.id, { d: v }, k)} />
          <Slider label="มุมรอบ" k={`a${selItem.id}`} value={selItem.a} min={-180} max={180} step={1} fmt={(v) => `${v}°`} onChange={(v, k) => setItem(selItem.id, { a: v }, k)} />
        </div>
      )}
    </Section>
  );

  const views = (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[12px]">
        {([["plan", "ผังบน"], ["side", "ด้านข้าง (ความสูงไฟ)"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView2(k)} className={`rounded-md px-2 py-0.5 ${view2 === k ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{l}</button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">{view2 === "plan" ? "ลากไฟ/กล้องได้" : "ลากไฟขึ้น-ลง"}</span>
      </div>
      {view2 === "plan"
        ? <PlanView s={s} r={r} selId={selKey} onSelect={setSelId} onMove={(id, a, d) => setItem(id, { a, d }, `mv${id}`)} onCam={(a) => set("camA", a, "cam")} />
        : <SideView s={s} selId={selItem && isLight(selItem) ? selItem.id : s.items.find(isLight)?.id ?? null} onHeight={(id, h, d) => { setSelId(id); setItem(id, { h, d }, `h${id}`); }} />}
    </div>
  );

  if (variant === "embed") {
    return (
      <div ref={rootRef} className="space-y-2">
        {recipeBar}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {views}
          <div><p className="mb-1 text-[12px] text-slate-500">จอกล้อง (ภาพที่ถ่ายได้)</p><CameraView s={s} r={r} /></div>
        </div>
        {readout}
        {explainBox}
        {toolbar}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{itemsBox}<div className="space-y-2">{subjectBox}{cameraBox}{gearBox}</div></div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">{toolbar}<div className="min-w-0 flex-1">{recipeBar}</div></div>
      {/* มือถือ: จอกล้องติดบนจอ (ลากไฟในผังแล้วเห็นผลทันที) → ผัง → คำอธิบาย → ตัวตั้งค่า
          PC: ซ้าย = ตั้งค่า · กลาง = ผัง · ขวา = จอกล้อง + คำอธิบาย */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.25fr)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'ctl_plan_cam'_'ctl_plan_info']">
        <div className="sticky top-0 z-20 bg-white pb-1 lg:top-2 lg:self-start lg:[grid-area:cam]">
          <p className="mb-1 text-[12px] text-slate-500">จอกล้อง (ภาพที่ถ่ายได้)</p>
          <CameraView s={s} r={r} />
        </div>
        <div className="order-1 space-y-2 lg:[grid-area:plan]">{views}{gearBox}</div>
        <div className="order-2 space-y-2 lg:[grid-area:info]">{readout}{explainBox}</div>
        <div className="order-3 space-y-2 lg:[grid-area:ctl]">{itemsBox}{subjectBox}{cameraBox}</div>
      </div>
    </div>
  );
}
