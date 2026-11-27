"use client";

/**
 * 🎞️ คลังภาพเคลื่อนไหวสอนสำเร็จรูป — ฉากกดเล่นได้ (แถบลาก / ปุ่มสลับ)
 *   ฉากเรื่องไฟ = สตูดิโอจำลอง (studio.tsx · ตาราง STUDIO ด้านล่าง) · ฉากอื่น = PRESETS
 *   รายชื่อ + คำอธิบาย = lib/lesson-anim.ts (ANIM_PRESETS) · เพิ่มฉาก: เพิ่มทั้ง 2 ที่
 *   วาดเป็น SVG ล้วน (ไม่โหลดไลบรารี เบา เปิดบนมือถือได้)
 */
import { useState, type ReactNode } from "react";
import { StudioSim, type StudioConfig } from "./studio";

type Ctl =
  | { kind: "range"; label: string; min: number; max: number; step: number; init: number; fmt?: (v: number) => string }
  | { kind: "buttons"; options: string[]; init?: number };

type SceneOut = {
  bg?: string; lampX?: number | null; color?: string; beam?: number; soft?: number;
  product?: string | null; productOpacity?: number; shadow?: number;
  extra?: ReactNode; caption: string;
};

type Preset = { ctl: Ctl; scene: (v: number) => SceneOut };

const PRESETS: Record<string, Preset> = {
  "light-sources": {
    ctl: { kind: "buttons", options: ["แดด", "ไฟในเฟรม", "ไฟที่มีอยู่แล้ว"] },
    scene: (v) => v === 0
      ? { bg: "#85B7EB", lampX: null, extra: <circle cx={40} cy={44} r={14} fill="#FAC775" />, caption: "แสงธรรมชาติ — แดด จันทร์ ไฟ" }
      : v === 1
        ? { lampX: null, extra: <g><rect x={90} y={54} width={10} height={60} fill="#5F5E5A" /><circle cx={95} cy={50} r={10} fill="#FAC775" /></g>, caption: "ไฟที่เห็นในภาพ (Practical) — โคมไฟ หลอดไฟ" }
        : { lampX: null, extra: <g><rect x={20} y={28} width={6} height={100} fill="#5F5E5A" /><circle cx={30} cy={30} r={7} fill="#FAC775" /></g>, caption: "ไฟที่มีอยู่แล้วในสถานที่ (Ambient) — ไฟถนน ป้ายไฟ" },
  },
  "iso-noise": {
    ctl: { kind: "range", label: "ISO", min: 100, max: 6400, step: 100, init: 400 },
    scene: (v) => {
      const n = Math.round(v / 100);
      return {
        productOpacity: Math.min(1, 0.3 + v / 2000),
        extra: <g>{Array.from({ length: n }, (_, j) => <circle key={j} cx={(j * 53) % 320} cy={24 + ((j * 37) % 116)} r={1.3} fill="#fff" opacity={0.55} />)}</g>,
        caption: v > 2000 ? "สว่างขึ้น แต่ภาพเป็นเม็ดหยาบ — เพิ่มไฟดีกว่า" : "ภาพเนียน",
      };
    },
  },
  histogram: {
    ctl: { kind: "range", label: "ค่าแสง", min: -3, max: 3, step: 0.5, init: 0, fmt: (v) => (v > 0 ? `+${v}` : `${v}`) },
    scene: (v) => ({
      lampX: null, product: null,
      extra: (
        <g>
          {[3, 6, 10, 14, 11, 7, 4].map((h, j) => <rect key={j} x={100 + j * 18 + v * 30} y={130 - h * 6} width={14} height={h * 6} fill="#B4B2A9" />)}
          <line x1={70} y1={130} x2={70} y2={34} stroke="#E24B4A" strokeWidth={2} />
          <line x1={250} y1={130} x2={250} y2={34} stroke="#E24B4A" strokeWidth={2} />
        </g>
      ),
      caption: v >= 2 ? "กราฟชนขอบขวา = ขาวโพลน" : v <= -2 ? "กราฟชนขอบซ้าย = ดำมืด" : "กราฟอยู่กลาง ค่าแสงพอดี",
    }),
  },
};

function Scene({ s }: { s: SceneOut }) {
  const lampX = s.lampX === undefined ? 190 : s.lampX;
  const color = s.color ?? "#FAC775";
  const soft = s.soft ?? 0;
  const spread = 12 + soft * 0.4;
  const product = s.product === undefined ? "#F1EFE8" : s.product;
  const shadow = (s.shadow ?? 0.6) - soft * 0.004;
  return (
    <svg viewBox="0 0 320 140" className="block h-auto w-full" role="img" aria-label={s.caption}>
      <rect width={320} height={140} rx={8} fill={s.bg ?? "#444441"} />
      {lampX !== null && (
        <>
          <polygon points={`${lampX + 9},80 240,${58 - spread} 240,${118 + spread}`} fill={color} opacity={s.beam ?? 0.25} />
          <g transform={`translate(${lampX},80)`}>
            <rect x={-9} y={-12} width={18} height={24} rx={3} fill="#888780" />
            <circle cx={9} cy={0} r={5} fill={color} />
          </g>
        </>
      )}
      {s.extra}
      {product !== null && (
        <>
          <ellipse cx={262} cy={122} rx={26 + soft * 0.35} ry={5} fill="#000" opacity={Math.max(0.05, shadow)} />
          <rect x={240} y={58} width={44} height={62} rx={4} fill={product} opacity={s.productOpacity ?? 1} />
        </>
      )}
    </svg>
  );
}

/** ฉากเรื่องไฟ = สตูดิโอจำลอง (ผังไฟ + จอกล้อง) · ฉากอื่น (ชนิดแหล่งแสง · ISO · Histogram) ใช้ฉากเดี่ยวด้านบน */
const STUDIO: Record<string, StudioConfig> = {
  "light-mood": { focus: "angle", init: { d: 2.2, a: 20, soft: 85, k: 5600 }, chips: [
    { label: "สดใส", set: { d: 2.2, a: 20, soft: 85, k: 5600 }, tip: "สดใส = ไฟนุ่ม อยู่ไกล เกือบตรงหน้า" },
    { label: "ดราม่า", set: { d: 0.7, a: 100, soft: 10, k: 3200 }, tip: "ดราม่า = ไฟแข็ง ชิดสินค้า ส่องด้านข้าง" }] },
  "light-falloff": { focus: "dist", init: { a: 35, d: 1 }, exposure: "fixed" },
  "color-temp": { focus: "k", init: { a: 35 } },
  "key-contrast": { focus: "dist", chips: [
    { label: "High-key", set: { d: 2.6, a: 15, soft: 90, k: 5600 }, tip: "High-key = สว่างทั่ว เงาน้อย" },
    { label: "Low-key", set: { d: 0.6, a: 85, soft: 20 }, tip: "Low-key = มืดเยอะ แสงเงาตัดกันแรง" }] },
  "hard-soft": { focus: "soft", init: { soft: 0, a: 45 } },
  "light-position": { focus: "angle", init: { a: 0, soft: 30 } },
  "light-types": { focus: "k", chips: [
    { label: "ทังสเตน", set: { k: 3200, soft: 20 }, tip: "ทังสเตน: แรง แสงอุ่นออกส้ม" },
    { label: "HMI", set: { k: 5600, soft: 10, d: 2.5 }, tip: "HMI: แรงมาก แทนแสงแดด วางไกลได้" },
    { label: "LED", set: { k: 4400, soft: 60 }, tip: "LED: ปรับสีและความแรงได้ละเอียด" }] },
  diffusion: { focus: "soft", init: { soft: 0, a: 45 }, chips: [
    { label: "ไม่มีซอฟต์บ็อกซ์", set: { soft: 0 }, tip: "ไฟเปล่า" },
    { label: "ใส่ซอฟต์บ็อกซ์", set: { soft: 90 }, tip: "ผ้า/กระดาษคั่นหน้าไฟ" }] },
  flag: { focus: "dist", init: { d: 1.6, a: 50 }, chips: [
    { label: "ไม่บัง", set: { flag: false }, tip: "แสงหกโดนฉากหลัง" },
    { label: "ใส่ Flag", set: { flag: true }, tip: "Flag บังแสงไม่ให้โดนฉากหลัง ฉากหลังมืดลง" }] },
};

export function hasPreset(key: string) { return key in PRESETS || key in STUDIO; }

export function PresetAnim({ animKey }: { animKey: string }) {
  if (STUDIO[animKey]) return <StudioSim config={STUDIO[animKey]} />;
  return <ScenePreset animKey={animKey} />;
}

function ScenePreset({ animKey }: { animKey: string }) {
  const p = PRESETS[animKey];
  const init = p ? (p.ctl.kind === "range" ? p.ctl.init : (p.ctl.init ?? 0)) : 0;
  const [v, setV] = useState(init);
  if (!p) return <p className="text-[12px] text-slate-400">ไม่พบภาพเคลื่อนไหว “{animKey}”</p>;
  const ctl = p.ctl;
  const scene = p.scene(v);
  return (
    <div>
      <p className="mb-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-center text-[13px] font-medium text-white" aria-live="polite">{scene.caption}</p>
      <Scene s={scene} />
      {ctl.kind === "range" ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-16 shrink-0 text-[12px] text-slate-500">{ctl.label}</span>
          <input type="range" min={ctl.min} max={ctl.max} step={ctl.step} value={v} onChange={(e) => setV(Number(e.target.value))} className="min-w-0 flex-1 accent-indigo-600" aria-label={ctl.label} />
          <span className="w-16 shrink-0 text-right text-[12px] font-medium text-slate-700">{ctl.fmt ? ctl.fmt(v) : v}</span>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ctl.options.map((o, j) => (
            <button key={o} type="button" onClick={() => setV(j)}
              className={`rounded-full border px-3 py-1 text-[12px] ${v === j ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
