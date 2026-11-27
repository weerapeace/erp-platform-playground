"use client";

/**
 * 🎞️ คลังภาพเคลื่อนไหวสอนสำเร็จรูป — ฉากกดเล่นได้ (แถบลาก / ปุ่มสลับ)
 *   รายชื่อ + คำอธิบาย = lib/lesson-anim.ts (ANIM_PRESETS) · เพิ่มฉาก: เพิ่มทั้ง 2 ที่
 *   วาดเป็น SVG ล้วน (ไม่โหลดไลบรารี เบา เปิดบนมือถือได้)
 */
import { useState, type ReactNode } from "react";

type Ctl =
  | { kind: "range"; label: string; min: number; max: number; step: number; init: number; fmt?: (v: number) => string }
  | { kind: "buttons"; options: string[]; init?: number };

type SceneOut = {
  bg?: string; lampX?: number | null; color?: string; beam?: number; soft?: number;
  product?: string | null; productOpacity?: number; shadow?: number;
  extra?: ReactNode; caption: string;
};

type Preset = { ctl: Ctl; scene: (v: number) => SceneOut };

const kelvinColor = (k: number) => {
  const t = (k - 2700) / 3800;
  return `rgb(${Math.round(250 - t * 70)},${Math.round(180 + t * 45)},${Math.round(100 + t * 150)})`;
};

const PRESETS: Record<string, Preset> = {
  "light-mood": {
    ctl: { kind: "buttons", options: ["สดใส", "ดราม่า"] },
    scene: (v) => ({ bg: v ? "#2C2C2A" : "#B4B2A9", beam: v ? 0.35 : 0.1, shadow: v ? 0.75 : 0.25, caption: v ? "มืด เงาเยอะ = ตึงเครียด ลึกลับ" : "สว่างทั่ว เงาน้อย = สดใส เป็นมิตร" }),
  },
  "light-sources": {
    ctl: { kind: "buttons", options: ["แดด", "ไฟในเฟรม", "ไฟที่มีอยู่แล้ว"] },
    scene: (v) => v === 0
      ? { bg: "#85B7EB", lampX: null, extra: <circle cx={40} cy={44} r={14} fill="#FAC775" />, caption: "แสงธรรมชาติ — แดด จันทร์ ไฟ" }
      : v === 1
        ? { lampX: null, extra: <g><rect x={90} y={54} width={10} height={60} fill="#5F5E5A" /><circle cx={95} cy={50} r={10} fill="#FAC775" /></g>, caption: "ไฟที่เห็นในภาพ (Practical) — โคมไฟ หลอดไฟ" }
        : { lampX: null, extra: <g><rect x={20} y={28} width={6} height={100} fill="#5F5E5A" /><circle cx={30} cy={30} r={7} fill="#FAC775" /></g>, caption: "ไฟที่มีอยู่แล้วในสถานที่ (Ambient) — ไฟถนน ป้ายไฟ" },
  },
  "light-falloff": {
    ctl: { kind: "range", label: "ระยะไฟ", min: 1, max: 4, step: 0.1, init: 1, fmt: (v) => `${v.toFixed(1)} เท่า` },
    scene: (v) => { const p = Math.round(100 / (v * v)); return { lampX: 210 - (v - 1) * 55, productOpacity: 0.25 + 0.75 * p / 100, caption: `แสงถึงสินค้า ${p}%` }; },
  },
  "color-temp": {
    ctl: { kind: "range", label: "เคลวิน", min: 2700, max: 6500, step: 100, init: 3200, fmt: (v) => `${v}K` },
    scene: (v) => { const c = kelvinColor(v); return { color: c, product: c, caption: v < 4000 ? "ออกส้ม — ไฟหลอดไส้ (ทังสเตน)" : v > 5200 ? "ออกฟ้า — แสงกลางวัน" : "ขาวกลาง ๆ" }; },
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
  "key-contrast": {
    ctl: { kind: "buttons", options: ["High-key", "Low-key"] },
    scene: (v) => ({ bg: v ? "#2C2C2A" : "#D3D1C7", shadow: v ? 0.85 : 0.15, beam: v ? 0.35 : 0.15, caption: v ? "แสงกับเงาต่างกันมาก = ดราม่า" : "แสงกับเงาต่างกันน้อย = สดใส" }),
  },
  "hard-soft": {
    ctl: { kind: "range", label: "ความนุ่ม", min: 0, max: 100, step: 1, init: 0, fmt: (v) => `${v}%` },
    scene: (v) => ({ soft: v, caption: v < 30 ? "แสงแข็ง — เงาคม ขอบชัด" : v > 70 ? "แสงนุ่ม — เงาฟุ้ง ขอบไม่ชัด" : "กลาง ๆ" }),
  },
  "light-position": {
    ctl: { kind: "buttons", options: ["Broad side", "Short side"] },
    scene: (v) => ({
      lampX: null, product: null,
      extra: (
        <g>
          <circle cx={160} cy={78} r={32} fill="#5F5E5A" />
          <path d={`M160 46 A32 32 0 0 ${v ? 1 : 0} 160 110 Z`} fill="#F1EFE8" />
          <rect x={150} y={120} width={20} height={10} fill="#888780" />
          <circle cx={v ? 228 : 92} cy={48} r={8} fill="#FAC775" />
        </g>
      ),
      caption: v ? "ส่องด้านที่หันออกจากกล้อง = มีมิติ ดราม่า" : "ส่องด้านที่หันหากล้อง = เป็นมิตร เข้าถึงง่าย",
    }),
  },
  "light-types": {
    ctl: { kind: "buttons", options: ["ทังสเตน", "HMI", "LED ปรับสี"] },
    scene: (v) => { const c = ["#FAC775", "#B5D4F4", "#AFA9EC"][v]; return { color: c, product: c, caption: ["ทังสเตน — แรง แสงอุ่นออกส้ม", "HMI — แรงมาก แทนแสงแดด ออกเย็น", "LED — ปรับสีและความแรงได้ละเอียด"][v] }; },
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
  diffusion: {
    ctl: { kind: "buttons", options: ["ไม่มีซอฟต์บ็อกซ์", "ใส่ซอฟต์บ็อกซ์"] },
    scene: (v) => ({ soft: v ? 90 : 0, extra: v ? <rect x={204} y={56} width={10} height={48} rx={2} fill="#F1EFE8" opacity={0.85} /> : null, caption: v ? "ผ้า/กระดาษคั่นหน้าไฟ แสงนุ่ม เงาฟุ้ง" : "ไฟเปล่า แสงแข็ง เงาคม" }),
  },
  flag: {
    ctl: { kind: "buttons", options: ["ไม่บัง", "ใส่ flag"] },
    scene: (v) => ({
      extra: (
        <g>
          <rect x={292} y={28} width={24} height={106} fill={v ? "#444441" : "#EF9F27"} opacity={v ? 1 : 0.55} />
          {v ? <rect x={226} y={30} width={6} height={90} fill="#0b0b0b" /> : null}
        </g>
      ),
      caption: v ? "บังแล้ว ฉากหลังไม่โดนแสง" : "แสงหกไปโดนฉากหลัง",
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

export function hasPreset(key: string) { return key in PRESETS; }

export function PresetAnim({ animKey }: { animKey: string }) {
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
