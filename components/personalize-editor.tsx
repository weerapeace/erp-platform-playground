"use client";

/**
 * PersonalizeEditor — ตั้งค่า "ปั๊มชื่อ" ของรุ่นในร้านหนึ่ง (ใช้ในแท็บ 🛍 เว็บไซต์ ของ Parent SKU)
 *   - เปิด/ปิด · จำนวนตัวอักษรสูงสุด · แบบที่อนุญาต (จม/เงิน/ทอง) · รูปฉาก
 *   - ตำแหน่ง 2 จุด (ตรงกลาง / มุมขวาล่าง): ลากข้อความบนรูปเพื่อวาง + จัดชิดซ้าย/กลาง/ขวา + ขนาด + เอียง · เปิด/ปิดแต่ละจุด
 *   - ตัวอักษร: ความห่าง · กลุ่มตัวที่ปั๊มได้ · เปลี่ยนเป็นตัวใหญ่อัตโนมัติ · ตัวพิเศษ (♥ ★ …)
 *   - 🎚 เอฟเฟกต์พิมพ์จมแบบ Photoshop (Bevel & Emboss · Inner Shadow · Outer Glow) — พรีวิวด้วย SVG filter ตัวเดียวกับเว็บร้าน
 *   - พรีวิวเหมือนเว็บจริง (ฟอนต์ Times New Roman + เอฟเฟกต์เดียวกัน)
 * ของกลาง: lib/website-personalize.ts (ชนิดข้อมูล/ค่าเริ่มต้น/ตัวกรอง/ตำแหน่งข้อความ)
 */
import { useCallback, useId, useRef, useState } from "react";
import { RangeInput } from "@/components/range-input";
import {
  PERSONALIZE_ALIGNS,
  PERSONALIZE_ALIGN_OFFSET,
  PERSONALIZE_CHARSETS,
  PERSONALIZE_STYLES,
  DEFAULT_EMBOSS_FX,
  EMBOSS_FX_RANGE,
  cleanPersonalizeText,
  personalizeEmbossFilter,
  parsePersonalizeSymbols,
  personalizeSplitLast,
  personalizeTextPlacement,
  type PersonalizeAlign,
  type PersonalizeConfig,
  type PersonalizeEmbossFx,
  type PersonalizePosition,
  type PersonalizeStyle,
} from "@/lib/website-personalize";

const keyUrl = (key: string, w = 900) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
/** ชุดตัวพิเศษแนะนำ (มีในฟอนต์ทั่วไป) */
const SYMBOL_PRESET = "♥ ★ ✦ ∞ ✿ ☺";

/** เอฟเฟกต์ตัวอักษร (เหมือน storefront globals.css .pz-fx-*) */
export const PZ_STYLE: Record<PersonalizeStyle, React.CSSProperties> = {
  emboss: { color: "rgba(20,10,0,0.42)", mixBlendMode: "multiply", textShadow: "1px 1px 0 rgba(255,255,255,0.45), -1px -1px 1px rgba(0,0,0,0.55)" },
  silver: { color: "transparent", backgroundImage: "linear-gradient(180deg,#fdfdfd 0%,#c9ccd1 30%,#8e939a 48%,#eef0f2 58%,#a7abb1 78%,#6f747a 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.6))" },
  gold: { color: "transparent", backgroundImage: "linear-gradient(180deg,#fff1b8 0%,#f0cf6a 20%,#b98a2c 44%,#f9e08f 54%,#d4a640 70%,#8f6519 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.65)) drop-shadow(0 0 1px rgba(255,214,120,0.35))" },
};

type FxNum = keyof typeof EMBOSS_FX_RANGE;
/** ช่องตัวเลขของเอฟเฟกต์พิมพ์จม แบ่งตามชั้นของ Photoshop */
const FX_LAYERS: { key: "bevel" | "inner" | "glow" | null; title: string; th: string; rows: [FxNum, string, string][] }[] = [
  {
    key: "bevel",
    title: "Bevel & Emboss",
    th: "ขอบนูน/ยุบ",
    rows: [
      ["depth", "ความลึก (Depth)", "%"],
      ["size", "ขนาด (Size)", "px"],
      ["soften", "นุ่ม (Soften)", "px"],
      ["angle", "มุมแสง (Angle)", "°"],
      ["altitude", "ความสูงแสง (Altitude)", "°"],
      ["highlight", "ไฮไลต์ (Highlight)", "%"],
      ["shadow", "เงา (Shadow)", "%"],
    ],
  },
  { key: "inner", title: "Inner Shadow", th: "เงาในร่อง", rows: [["innerOpacity", "ความเข้ม (Opacity)", "%"], ["innerDistance", "ระยะ (Distance)", "px"], ["innerSize", "ขนาด (Size)", "px"]] },
  { key: "glow", title: "Outer Glow", th: "ขอบเข้มรอบตัว", rows: [["glowOpacity", "ความเข้ม (Opacity)", "%"], ["glowSpread", "กระจาย (Spread)", "%"], ["glowSize", "ขนาด (Size)", "px"]] },
  { key: null, title: "Fill", th: "เนื้อตัวอักษร", rows: [["fill", "ความทึบ (Fill)", "%"]] },
];

export function PersonalizeEditor({
  value,
  onChange,
  imageOptions,
  fallbackImageKey,
}: {
  value: PersonalizeConfig;
  onChange: (next: PersonalizeConfig) => void;
  /** รูปให้เลือกเป็นฉาก (key + ป้าย) */
  imageOptions: { key: string; label: string }[];
  /** รูปที่เว็บจะใช้เมื่อไม่ได้เลือก (รูปแรกของสินค้า) */
  fallbackImageKey: string | null;
}) {
  const [preview, setPreview] = useState<PersonalizeStyle>(value.styles[0] ?? "emboss");
  const [active, setActive] = useState<PersonalizePosition["key"]>("center");
  const [sample, setSample] = useState("YOUR NAME");
  const [symDraft, setSymDraft] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // 🎚 พรีวิวพิมพ์จมเป็น SVG ต้องรู้ขนาดกรอบจริง (px) — วัดตอนกรอบโผล่ + รูปโหลด/จอเปลี่ยน
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const setStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const measure = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
    measure();
  }, []);
  const fxId = `pzfx-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const setFx = (p: Partial<PersonalizeEmbossFx>) => set({ embossFx: { ...value.embossFx, ...p } });
  const svgEmboss = preview === "emboss" && stageSize.w > 0 && stageSize.h > 0;
  const textRefs = useRef<Partial<Record<PersonalizePosition["key"], HTMLDivElement | null>>>({});
  const [imgW, setImgW] = useState(600);
  const set = (p: Partial<PersonalizeConfig>) => onChange({ ...value, ...p });
  const setPos = (key: PersonalizePosition["key"], p: Partial<PersonalizePosition>) =>
    set({ positions: value.positions.map((x) => (x.key === key ? { ...x, ...p } : x)) });
  const imageKey = value.imageKey ?? fallbackImageKey;
  const shown = cleanPersonalizeText(sample, value) ?? "YOUR NAME";

  /** เปลี่ยนการจัด → ขยับจุดยึดให้ข้อความตัวอย่างอยู่ที่เดิม (ไม่กระโดด) */
  const setAlign = (p: PersonalizePosition, align: PersonalizeAlign) => {
    const el = textRefs.current[p.key];
    const stageW = stageRef.current?.clientWidth ?? 0;
    const w = el && stageW ? (el.offsetWidth / stageW) * 100 : 0;
    const x = Math.round(Math.min(100, Math.max(0, p.x + (PERSONALIZE_ALIGN_OFFSET[align] - PERSONALIZE_ALIGN_OFFSET[p.align]) * w)) * 10) / 10;
    setPos(p.key, { align, x });
  };

  // ลากข้อความบนรูป → x/y เป็น % ของรูป
  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = Math.round(Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)) * 10) / 10;
    const y = Math.round(Math.max(2, Math.min(98, ((e.clientY - r.top) / r.height) * 100)) * 10) / 10;
    setPos(active, { x, y });
  };
  const onUp = () => {
    dragging.current = false;
  };

  const chip = (on: boolean) => `px-2.5 py-1 rounded-full border text-xs ${on ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
  const [head, last] = personalizeSplitLast(shown);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <button type="button" role="switch" aria-checked={value.enabled} onClick={() => set({ enabled: !value.enabled })} className={`relative w-10 h-6 rounded-full transition-colors ${value.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value.enabled ? "translate-x-4" : ""}`} />
          </button>
          ปั๊มชื่อได้ (Personalized)
        </label>
        <label className="text-xs text-slate-600 flex items-center gap-1.5">
          สูงสุด
          <input type="number" min={1} max={30} value={value.maxChars} onChange={(e) => set({ maxChars: Math.min(30, Math.max(1, Number(e.target.value) || 10)) })} className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right" />
          ตัวอักษร
        </label>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          แบบที่ให้เลือก:
          {PERSONALIZE_STYLES.map((s) => {
            const on = value.styles.includes(s.value);
            return (
              <button key={s.value} type="button" onClick={() => set({ styles: on ? value.styles.filter((x) => x !== s.value) : [...value.styles, s.value] })} className={chip(on)}>
                {on ? "✓ " : ""}{s.label}
              </button>
            );
          })}
        </div>
      </div>

      {value.enabled && (
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          {/* พรีวิว + ลากวางตำแหน่ง */}
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <select value={value.imageKey ?? ""} onChange={(e) => set({ imageKey: e.target.value || null })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs max-w-[60%]">
                <option value="">รูปฉาก: รูปแรกของสินค้า (อัตโนมัติ)</option>
                {imageOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <div className="flex items-center gap-1">
                {PERSONALIZE_STYLES.filter((s) => value.styles.includes(s.value)).map((s) => (
                  <button key={s.value} type="button" onClick={() => setPreview(s.value)} className={chip(preview === s.value)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div ref={setStage} className="relative rounded-xl overflow-hidden bg-slate-100 select-none" style={{ touchAction: "none" }}>
              {imageKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={keyUrl(imageKey)} alt="" className="block w-full h-auto pointer-events-none" onLoad={(e) => setImgW(e.currentTarget.clientWidth)} />
              ) : (
                <div className="aspect-square flex items-center justify-center text-sm text-slate-400">ยังไม่มีรูปสินค้า</div>
              )}
              {value.positions.filter((p) => p.enabled).map((p) => (
                <div
                  key={p.key}
                  ref={(el) => {
                    textRefs.current[p.key] = el;
                  }}
                  onPointerDown={(e) => { setActive(p.key); onDown(e); }}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  title={`${p.label} — ลากเพื่อย้าย`}
                  className={`absolute whitespace-nowrap cursor-move leading-none ${active === p.key ? "outline outline-1 outline-dashed outline-orange-400 rounded" : ""}`}
                  style={{
                    ...personalizeTextPlacement(p),
                    padding: "0.1em 0",
                    fontFamily: '"Times New Roman", Times, serif',
                    letterSpacing: `${value.letterSpacing}em`,
                    fontSize: `${(imgW * p.size) / 100}px`,
                    ...(svgEmboss ? { color: "transparent" } : PZ_STYLE[preview]),
                  }}
                >
                  {head}
                  <span style={{ letterSpacing: 0 }}>{last}</span>
                </div>
              ))}
              {/* 🎚 พิมพ์จม: วาดด้วย SVG filter ตัวเดียวกับเว็บร้าน (personalizeEmbossFilter) */}
              {svgEmboss && (
                <svg className="absolute left-0 top-0 pointer-events-none overflow-visible" width={stageSize.w} height={stageSize.h} viewBox={`0 0 ${stageSize.w} ${stageSize.h}`} aria-hidden>
                  {value.positions.filter((p) => p.enabled).map((p) => {
                    const fontPx = (stageSize.w * p.size) / 100;
                    const x = (stageSize.w * p.x) / 100;
                    const y = (stageSize.h * p.y) / 100;
                    return (
                      <g key={p.key}>
                        <defs>
                          <filter id={`${fxId}-${p.key}`} x="-30%" y="-60%" width="160%" height="220%" colorInterpolationFilters="sRGB" dangerouslySetInnerHTML={{ __html: personalizeEmbossFilter(value.embossFx, fontPx) }} />
                        </defs>
                        <text
                          x={x}
                          y={y}
                          textAnchor={p.align === "left" ? "start" : p.align === "right" ? "end" : "middle"}
                          dominantBaseline="central"
                          transform={p.rotate ? `rotate(${p.rotate} ${x} ${y})` : undefined}
                          fontFamily='"Times New Roman", Times, serif'
                          fontSize={fontPx}
                          letterSpacing={`${value.letterSpacing}em`}
                          fill="#000"
                          filter={`url(#${fxId}-${p.key})`}
                        >
                          {head}
                          <tspan letterSpacing="0">{last}</tspan>
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              {/* จุดยึดของตำแหน่งที่กำลังแก้ (ข้อความเริ่ม/กลาง/จบที่จุดนี้ตามการจัด) */}
              {value.positions.filter((p) => p.enabled && p.key === active).map((p) => (
                <span key={`dot-${p.key}`} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-orange-500 ring-2 ring-white pointer-events-none" style={{ left: `${p.x}%`, top: `${p.y}%` }} title="จุดยึด" />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-slate-500">ข้อความตัวอย่าง</span>
              <input value={sample} onChange={(e) => setSample(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">จุดสีส้ม = จุดยึดของตำแหน่งที่เลือก · ชิดขวา = ชื่อยาวขึ้นจะงอกไปทางซ้าย ปลายชื่ออยู่ที่จุดเสมอ</p>
          </div>

          <div className="space-y-2">
            {/* ตำแหน่ง 2 จุด */}
            {value.positions.map((p) => (
              <div key={p.key} className={`rounded-lg border p-2 space-y-1.5 ${active === p.key ? "border-orange-300 bg-orange-50/40" : "border-slate-200"}`} onClick={() => setActive(p.key)}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={p.enabled} onChange={(e) => setPos(p.key, { enabled: e.target.checked })} title="ให้ลูกค้าเลือกตำแหน่งนี้ได้" />
                  <input value={p.label} onChange={(e) => setPos(p.key, { label: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" placeholder={p.key === "center" ? "ตรงกลาง" : "มุมขวาล่าง"} />
                  <span className="text-[11px] text-slate-400">x {p.x}% · y {p.y}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  จัดข้อความ:
                  {PERSONALIZE_ALIGNS.map((a) => (
                    <button key={a.value} type="button" onClick={(e) => { e.stopPropagation(); setActive(p.key); setAlign(p, a.value); }} className={chip(p.align === a.value)}>{a.label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <RangeInput label={<span className="text-[11px] text-slate-500">ขนาดตัวอักษร (% ของความกว้างรูป)</span>} min={1} max={20} step={0.5} hardMax={30} unit="%" value={p.size} onChange={(v) => setPos(p.key, { size: v })} />
                  <RangeInput label={<span className="text-[11px] text-slate-500">เอียง</span>} min={-30} max={30} step={1} hardMin={-45} hardMax={45} unit="°" value={p.rotate} onChange={(v) => setPos(p.key, { rotate: v })} />
                </div>
              </div>
            ))}

            {/* ตัวอักษร */}
            <div className="rounded-lg border border-slate-200 p-2 space-y-2">
              <p className="text-xs font-medium text-slate-700">ตัวอักษร</p>
              <RangeInput label={<span className="text-[11px] text-slate-500">ความห่างตัวอักษร</span>} min={0} max={0.5} step={0.01} unit="em" value={value.letterSpacing} onChange={(v) => set({ letterSpacing: Math.min(0.5, Math.max(0, v)) })} />
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
                ปั๊มได้:
                {PERSONALIZE_CHARSETS.map((c) => {
                  const on = value.charset[c.key];
                  return (
                    <button key={c.key} type="button" onClick={() => set({ charset: { ...value.charset, [c.key]: !on } })} className={chip(on)}>
                      {on ? "✓ " : ""}{c.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={value.autoUpper} onChange={(e) => set({ autoUpper: e.target.checked })} />
                เปลี่ยนเป็นตัวพิมพ์ใหญ่ให้อัตโนมัติ (ลูกค้าพิมพ์ ann → ANN)
              </label>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">ตัวพิเศษ (ลูกค้ากดเลือกจากปุ่ม &quot;ตัวพิเศษ&quot;)</span>
                  {!value.symbols.length && (
                    <button type="button" onClick={() => set({ symbols: parsePersonalizeSymbols(SYMBOL_PRESET) })} className="text-[11px] text-orange-600 hover:underline">
                      ใส่ชุดแนะนำ {SYMBOL_PRESET}
                    </button>
                  )}
                </div>
                <input
                  value={symDraft ?? value.symbols.join(" ")}
                  onChange={(e) => setSymDraft(e.target.value)}
                  onBlur={() => {
                    if (symDraft !== null) set({ symbols: parsePersonalizeSymbols(symDraft) });
                    setSymDraft(null);
                  }}
                  placeholder="พิมพ์หรือวาง เช่น ♥ ★ ✦"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  style={{ fontFamily: '"Times New Roman", Times, serif' }}
                />
                <p className="text-[11px] text-slate-400 mt-1">ตัวละ 1 ตัวอักษร · สูงสุด 24 ตัว · ใส่เฉพาะตัวที่โรงงานมีบล็อกปั๊ม · ตัวที่ไม่ได้ติ๊ก/ไม่ได้ใส่ ลูกค้าจะพิมพ์ไม่ได้และขึ้นเตือน</p>
              </div>
            </div>

            {/* 🎚 เอฟเฟกต์พิมพ์จม (แบบ Photoshop Layer Style) */}
            {value.styles.includes("emboss") && (
              <div className="rounded-lg border border-slate-200 p-2 space-y-2" onFocusCapture={() => setPreview("emboss")} onPointerDownCapture={() => setPreview("emboss")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">🎚 เอฟเฟกต์พิมพ์จม <span className="font-normal text-slate-400">(แบบ Photoshop)</span></p>
                  <button type="button" onClick={() => set({ embossFx: { ...DEFAULT_EMBOSS_FX } })} className="text-[11px] text-orange-600 hover:underline" title="ค่าที่ตั้งใน Photoshop (Depth 136 · Angle 119 · Inner Shadow 18/12/21 · Outer Glow 61/5/5)">
                    ↺ กลับค่า Photoshop
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  ทิศ (Direction):
                  {(["down", "up"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setFx({ dir: d })} className={chip(value.embossFx.dir === d)}>
                      {d === "down" ? "Down · ยุบลง" : "Up · นูนขึ้น"}
                    </button>
                  ))}
                </div>
                {FX_LAYERS.map((layer) => {
                  const on = layer.key ? value.embossFx[layer.key] : true;
                  return (
                    <div key={layer.title} className={`rounded-md border px-2 py-1.5 ${on ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
                      <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
                        {layer.key && <input type="checkbox" className="w-3.5 h-3.5 accent-orange-500" checked={on} onChange={(e) => setFx({ [layer.key as "bevel"]: e.target.checked })} />}
                        {layer.title} <span className="font-normal text-slate-400">· {layer.th}</span>
                      </label>
                      {on && (
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
                          {layer.rows.map(([k, label, unit]) => (
                            <RangeInput
                              key={k}
                              label={<span className="text-[11px] text-slate-500">{label}</span>}
                              min={EMBOSS_FX_RANGE[k][0]}
                              max={EMBOSS_FX_RANGE[k][1]}
                              step={1}
                              unit={unit}
                              value={value.embossFx[k]}
                              onChange={(v) => setFx({ [k]: Math.round(Math.min(EMBOSS_FX_RANGE[k][1], Math.max(EMBOSS_FX_RANGE[k][0], v))) })}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-400">ค่า px อ้างอิงตัวอักษรสูง 100px แล้วย่อ/ขยายตามขนาดจริงบนรูป · ตั้งต่อรุ่น (หนังแต่ละสี/ผิวจูนต่างกันได้) · ปรับแล้วพรีวิวซ้ายเปลี่ยนทันที</p>
              </div>
            )}
            <p className="text-[11px] text-slate-400">ลากข้อความบนรูปซ้ายมือเพื่อวางตำแหน่ง · ลูกค้าจะเลือกได้เฉพาะจุดที่ติ๊กไว้ · ขนาดเป็น % ของรูป จะได้เท่ากันทุกจอ · รูปทุกสีของรุ่นนี้ควรถ่ายมุมเดียวกัน</p>
          </div>
        </div>
      )}
    </div>
  );
}
