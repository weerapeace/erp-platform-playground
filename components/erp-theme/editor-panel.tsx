"use client";
/**
 * ThemeEditorPanel — แผงปรับธีม 9 หมวด (ธีมกลาง ERP เฟส 2)
 *   รับ config + onPatch(patch แบบลึก) · ใช้ของกลาง ColorInput / RangeInput / ImageInput
 *   หมวด: สี · พื้นหลัง · ไล่สี · เอฟเฟกต์ · ขอบและเงา · มาสคอต · ตัวอักษร · รูปทรง · ความแน่น · ชิ้นส่วน · สว่าง/มืด
 *   เอฟเฟกต์ = ตาราง "จุด × เอฟเฟกต์ (เลือกได้ 2) × ความแรง" + ชุดสำเร็จรูป (lib/erp-theme-fx · รอบเอฟเฟกต์เพิ่ม)
 */
import { ColorInput } from "@/components/color-picker";
import { RangeInput } from "@/components/range-input";
import { ImageInput } from "@/components/image-input";
import { FONT_OPTIONS, VEIL_MAX_OPACITY, type ErpThemeConfig } from "@/lib/erp-theme-config";
import { EFFECTS, EFFECT_TARGETS, FX_PRESETS, MAX_FX_PER_TARGET, TARGET_EFFECTS, type EffectKey, type EffectTarget } from "@/lib/erp-theme-fx";
import { useEffect, useRef } from "react";
import { ADV_GROUPS, currentFxPreset, motionLevel, withMotionLevel, type AdvGroupKey, type EditorCategory } from "@/lib/erp-theme-easy";
import { Icon } from "@/components/icon";

export type ThemeCategory = "colors" | "background" | "gradient" | "effects" | "outline" | "animation" | "typography" | "shape" | "density" | "components" | "mode";
export const THEME_CATEGORIES: { key: ThemeCategory; label: string }[] = [
  { key: "colors", label: "สี" }, { key: "background", label: "พื้นหลัง" }, { key: "gradient", label: "ไล่สี" },
  { key: "effects", label: "เอฟเฟกต์" }, { key: "outline", label: "ขอบและเงา" },
  { key: "animation", label: "มาสคอต/ความเร็ว" }, { key: "typography", label: "ตัวอักษร" }, { key: "shape", label: "รูปทรง" },
  { key: "density", label: "ความแน่น" }, { key: "components", label: "ชิ้นส่วน" }, { key: "mode", label: "สว่าง/มืด" },
];

type Patch = Record<string, unknown>;

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={`h-8 px-3 rounded-lg border text-xs ${value === v ? "bg-blue-50 border-blue-300 text-blue-800 font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <div className="text-xs font-medium text-slate-700 mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 py-1 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-[11px] text-slate-400">{hint}</span>}</span>
    </label>
  );
}

export function ThemeEditorPanel({ config: c, category, onPatch, readOnly }: {
  config: ErpThemeConfig; category: ThemeCategory; onPatch: (p: Patch) => void; readOnly?: boolean;
}) {
  const set = (group: string, values: Patch) => onPatch({ [group]: values });
  const body = (() => {
    switch (category) {
      case "colors": return (
        <>
          <Row label="สีหลัก" hint="ปุ่ม ลิงก์ แถบบน · ระบบสร้างเฉดอ่อน-เข้ม 11 ระดับให้เอง"><ColorInput value={c.colors.primary} onChange={(v) => set("colors", { primary: v })} /></Row>
          <Row label="สีเน้นรอง" hint="แท็บที่เลือก ป้ายเน้น (คลาส violet เดิม)"><ColorInput value={c.colors.accent} onChange={(v) => set("colors", { accent: v })} /></Row>
          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">สีสถานะ (ร่าง / รออนุมัติ / อนุมัติ / ไม่อนุมัติ) ล็อกไว้เหมือนกันทุกธีม เพื่อไม่ให้สับสนความหมาย</div>
        </>
      );
      case "background": return (
        <>
          <Row label="รูปพื้นหลัง" hint="เลือกจากคลังรูปกลางหรืออัปโหลด · ระบบย่อขนาดให้เอง"><ImageInput value={c.background.image} onChange={(k) => set("background", { image: k })} folder="themes" /></Row>
          <Row label="วางที่"><Seg value={c.background.where} options={[["page", "ทั้งหน้า"], ["top", "แถบบน"], ["banner", "แบนเนอร์หัวหน้า"]]} onChange={(v) => set("background", { where: v })} /></Row>
          <Row label="ความชัด"><RangeInput value={c.background.opacity} min={0} max={100} unit="%" onChange={(v) => set("background", { opacity: v })} /></Row>
          <Row label="เบลอ" hint="บนมือถือไม่เบลอ (โหมดเบา)"><RangeInput value={c.background.blur} min={0} max={10} unit="px" onChange={(v) => set("background", { blur: v })} /></Row>
          <Check checked={c.background.veil} onChange={(v) => set("background", { veil: v })} label="กันอ่านยาก" hint={`รูปทั้งหน้าชัดไม่เกิน ${VEIL_MAX_OPACITY}% · แถบบน/แบนเนอร์ใส่ฝ้าดำบาง ๆ`} />
          <div className="mt-2 text-[11px] text-slate-400">ตาราง การ์ด และฟอร์มพื้นทึบเสมอ รูปอยู่ข้างหลังเท่านั้น</div>
        </>
      );
      case "gradient": return (
        <>
          <Row label="สีที่ 2" hint="สีแรก = สีหลัก"><ColorInput value={c.gradient.color2} onChange={(v) => set("gradient", { color2: v })} /></Row>
          <Row label="มุม"><RangeInput value={c.gradient.angle} min={0} max={360} step={15} unit="°" onChange={(v) => set("gradient", { angle: v })} /></Row>
          <Row label="ใช้ที่">
            <div className="grid grid-cols-2 gap-x-2">
              {([["top", "แถบบน"], ["button", "ปุ่มหลัก"], ["sidebar", "เมนูข้าง (ที่เลือก)"], ["banner", "แบนเนอร์หัวหน้า"], ["page", "พื้นหลังหน้า"]] as const).map(([k, l]) => (
                <Check key={k} checked={c.gradient.spots[k]} onChange={(v) => set("gradient", { spots: { [k]: v } })} label={l} />
              ))}
            </div>
          </Row>
          <div className="text-[11px] text-slate-400 mt-1">ให้ไล่สีวิ่ง: ตั้งที่แท็บ "เอฟเฟกต์" (เลือก "ไล่สีวิ่ง" ให้จุดที่ต้องการ)</div>
        </>
      );
      case "animation": return (
        <>
          <Check checked={c.animation.mascot} onChange={(v) => set("animation", { mascot: v })} label="ของตกแต่งขยับ (มาสคอต)" hint="มุมขวาล่าง · มือถือปิดให้" />
          {c.animation.mascot && <Row label="รูปมาสคอต (GIF/PNG/WebP)"><ImageInput value={c.animation.mascotImage} onChange={(k) => set("animation", { mascotImage: k })} folder="themes" compact /></Row>}
          <Row label="ความเร็วแอนิเมชันทั้งธีม"><Seg value={c.animation.speed} options={[["slow", "ช้า"], ["normal", "ปกติ"], ["fast", "เร็ว"]]} onChange={(v) => set("animation", { speed: v })} /></Row>
          <div className="text-[11px] text-slate-400">แสงวิ่ง ยกตัว นับขึ้น เข้าหน้า → ย้ายไปแท็บ "เอฟเฟกต์" แล้ว · ผู้ใช้ปิดแอนิเมชันเองได้ · เครื่องที่ตั้ง "ลดการเคลื่อนไหว" ปิดให้อัตโนมัติ</div>
        </>
      );
      case "effects": return <EffectsTab c={c} onPatch={onPatch} />;
      case "outline": return <OutlineTab c={c} onPatch={onPatch} />;
      case "typography": return (
        <>
          <Row label="ฟอนต์">
            <select className="w-full h-9 rounded-lg border border-slate-200 px-2 text-sm" value={c.typography.font} onChange={(e) => set("typography", { font: e.target.value })}>
              {FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Row>
          <Row label="ขนาดตัวอักษรพื้นฐาน"><RangeInput value={c.typography.baseSize} min={12} max={16} unit="px" onChange={(v) => set("typography", { baseSize: v })} /></Row>
          <Row label="ความหนาหัวข้อ"><Seg value={c.typography.headingWeight} options={[[500, "กลาง"], [600, "หนา"], [700, "หนามาก"]]} onChange={(v) => set("typography", { headingWeight: v })} /></Row>
        </>
      );
      case "shape": return (
        <>
          <Row label="ขอบมน"><RangeInput value={c.shape.radius} min={0} max={20} unit="px" onChange={(v) => set("shape", { radius: v })} /></Row>
          <div className="text-[11px] text-slate-400">เงา → ตั้งที่แท็บ "ขอบและเงา"</div>
        </>
      );
      case "density": return (
        <Row label="ความแน่นของตาราง/ฟอร์ม" hint="ค่าเริ่มของธีม · ผู้ใช้เลือกของตัวเองทับได้ (เฟส 5)">
          <Seg value={c.density} options={[["compact", "แน่น"], ["normal", "ปกติ"], ["spacious", "โปร่ง"]]} onChange={(v) => onPatch({ density: v })} />
        </Row>
      );
      case "components": return (
        <>
          <Row label="ปุ่มหลัก"><Seg value={c.components.button} options={[["solid", "ทึบ"], ["soft", "อ่อน"], ["outline", "ขอบ"]]} onChange={(v) => set("components", { button: v })} /></Row>
          <Row label="ตาราง"><Seg value={c.components.table} options={[["plain", "เรียบ"], ["zebra", "แถวสลับสี"], ["lines", "มีเส้นแบ่ง"]]} onChange={(v) => set("components", { table: v })} /></Row>
          <Row label="ช่องกรอก"><Seg value={c.components.input} options={[["outline", "กรอบ"], ["filled", "พื้นเทา"]]} onChange={(v) => set("components", { input: v })} /></Row>
          <Row label="แท็บ"><Seg value={c.components.tabs} options={[["underline", "ขีดเส้นใต้"], ["pill", "แคปซูล"]]} onChange={(v) => set("components", { tabs: v })} /></Row>
          <Row label="ป้ายสถานะ"><Seg value={c.components.badge} options={[["soft", "อ่อน"], ["solid", "ทึบ"]]} onChange={(v) => set("components", { badge: v })} /></Row>
          <Row label="เมนูข้าง"><Seg value={c.components.sidebar} options={[["light", "สว่าง"], ["dark", "เข้ม"], ["brand", "สีธีม"]]} onChange={(v) => set("components", { sidebar: v })} /></Row>
        </>
      );
      case "mode": return (
        <>
          <Check checked={c.mode.allowDark} onChange={(v) => set("mode", { allowDark: v })} label="อนุญาตโหมดมืด" hint="โหมดมืดทั้งระบบมาในเฟส 8 · ตอนนี้ลองดูในพรีวิวได้" />
          <Row label="รูปพื้นหลังสำหรับโหมดมืด" hint="ไม่ใส่ = ใช้รูปเดียวกัน (กันรูปสว่างจ้าตอนมืด)"><ImageInput value={c.background.darkImage} onChange={(k) => set("background", { darkImage: k })} folder="themes" compact /></Row>
        </>
      );
    }
  })();
  return <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70">{body}</fieldset>;
}

// ── แท็บเอฟเฟกต์ (ข้อ 31 จุด × เอฟเฟกต์ · 32 ความแรง · 33 ชุดสำเร็จรูป) ─────────
const FX_LABEL = Object.fromEntries(EFFECTS.map((e) => [e.key, e.label])) as Record<EffectKey, string>;

function EffectsTab({ c, onPatch }: { c: ErpThemeConfig; onPatch: (p: Patch) => void }) {
  const fx = c.effects;
  return (
    <>
      <Row label="ชุดสำเร็จรูป" hint="กดแล้วตั้งให้ทั้งตาราง + ขอบและเงา · ปรับต่อเองได้ · กดย้อนได้">
        <div className="grid grid-cols-2 gap-1.5">
          {FX_PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => onPatch({ effects: p.fx, outline: p.outline, elevation: p.elevation })}
              className="text-left rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:border-blue-300 hover:bg-blue-50">
              <div className="text-xs font-medium text-slate-800">ชุด{p.name}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{p.description}</div>
            </button>
          ))}
        </div>
      </Row>
      <div className="py-2.5 border-b border-slate-100">
        <div className="text-xs font-medium text-slate-700 mb-1.5">ใช้ที่ไหน (เลือกได้จุดละ {MAX_FX_PER_TARGET} เอฟเฟกต์)</div>
        <div className="space-y-2">
          {EFFECT_TARGETS.map((t) => (
            <div key={t.key} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-baseline gap-1.5 mb-1.5"><span className="text-xs font-medium text-slate-800">{t.label}</span><span className="text-[10px] text-slate-400">{t.hint}</span></div>
              <TargetFxEditor config={c} target={t.key} onPatch={onPatch} />
            </div>
          ))}
        </div>
        <div className="text-[11px] text-slate-400 mt-1.5">กระพริบ/เปลี่ยนสีวน ล็อกไม่ให้เร็วเกิน (ปลอดภัยต่อคนไวแสง) · มือถือ/ผู้ใช้ปิดแอนิเมชัน = หยุดหมด</div>
      </div>
      <Row label="ชี้เมาส์ / กด">
        <Check checked={fx.scaleHover} onChange={(v) => onPatch({ effects: { scaleHover: v } })} label="ปุ่มขยายเล็กน้อยตอนชี้" />
        <Check checked={fx.ripple} onChange={(v) => onPatch({ effects: { ripple: v } })} label="คลื่นน้ำตอนกดปุ่ม" />
        <Check checked={fx.underline} onChange={(v) => onPatch({ effects: { underline: v } })} label="ขีดเส้นใต้วิ่ง (แท็บ/ลิงก์)" />
        <Check checked={fx.iconWiggle} onChange={(v) => onPatch({ effects: { iconWiggle: v } })} label="ไอคอนขยับตอนชี้" />
      </Row>
      <Row label="เข้าหน้า"><Seg value={fx.enter} options={[["none", "ไม่มี"], ["fade", "จาง"], ["up", "เลื่อนขึ้น"], ["zoom", "ซูม"], ["blur", "เบลอ"]]} onChange={(v) => onPatch({ effects: { enter: v } })} /></Row>
      <Check checked={fx.stagger} onChange={(v) => onPatch({ effects: { stagger: v } })} label="การ์ดโผล่ทีละใบ" />
      <Row label="อนุภาคพื้นหลัง" hint="เหมาะกับธีมเทศกาล · มือถือปิดให้"><Seg value={fx.particles} options={[["none", "ไม่มี"], ["snow", "หิมะ"], ["stars", "ดาว"], ["bubbles", "ฟอง"], ["sakura", "ซากุระ"]]} onChange={(v) => onPatch({ effects: { particles: v } })} /></Row>
    </>
  );
}

// ── แท็บขอบและเงา (ข้อ 8–17) ─────────────────────────────
function OutlineTab({ c, onPatch }: { c: ErpThemeConfig; onPatch: (p: Patch) => void }) {
  const o = c.outline, e = c.elevation;
  return (
    <>
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-1">เส้นขอบการ์ด</div>
      <Row label="ความหนา"><RangeInput value={o.width} min={0} max={3} unit="px" onChange={(v) => onPatch({ outline: { width: v } })} /></Row>
      <Row label="สีเส้นขอบ"><Seg value={o.color} options={[["gray", "เทา"], ["soft", "สีธีมอ่อน"], ["theme", "สีธีม"]]} onChange={(v) => onPatch({ outline: { color: v } })} /></Row>
      <Row label="ลายเส้น"><Seg value={o.style} options={[["solid", "ทึบ"], ["dashed", "ประ"], ["dotted", "จุด"], ["double", "คู่"]]} onChange={(v) => onPatch({ outline: { style: v } })} /></Row>
      <Check checked={o.gradient} onChange={(v) => onPatch({ outline: { gradient: v } })} label="ขอบไล่สี" hint="ใช้สีหลัก → สีที่ 2 ของไล่สี" />
      {o.gradient && <Check checked={o.running} onChange={(v) => onPatch({ outline: { running: v } })} label="ขอบไล่สีวิ่ง" hint="มือถือ/ปิดแอนิเมชัน = หยุด" />}
      <Check checked={o.accentBar} onChange={(v) => onPatch({ outline: { accentBar: v } })} label="แถบเน้นด้านซ้ายของการ์ด" />
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-3">เงา</div>
      <Row label="ความเข้ม/ระยะ"><Seg value={e.depth} options={[["none", "ไม่มี"], ["soft", "บาง"], ["medium", "กลาง"], ["float", "ลอย"]]} onChange={(v) => onPatch({ elevation: { depth: v } })} /></Row>
      <Row label="สีเงา"><Seg value={e.color} options={[["gray", "เทา"], ["theme", "สีธีม"], ["black", "ดำ"]]} onChange={(v) => onPatch({ elevation: { color: v } })} /></Row>
      <Check checked={e.hoverGlow} onChange={(v) => onPatch({ elevation: { hoverGlow: v } })} label="ชี้แล้วเรืองสีธีม" />
      <Check checked={e.inset} onChange={(v) => onPatch({ elevation: { inset: v } })} label="เงาด้านในช่องกรอก" />
    </>
  );
}

// ── การ์ดเอฟเฟกต์มีตัวอย่างขยับ (ข้อ 1 รอบใช้ง่าย) — ใช้ทั้งแท็บเอฟเฟกต์และป๊อปแก้ชิ้นในพรีวิว ──
const FX_DEMO_CSS = `
@keyframes fxdPulse{0%{box-shadow:0 0 0 0 rgba(124,58,237,.55)}100%{box-shadow:0 0 0 6px rgba(124,58,237,0)}}
@keyframes fxdGlow{0%,100%{box-shadow:0 0 1px rgba(124,58,237,.4)}50%{box-shadow:0 0 7px rgba(124,58,237,.9)}}
@keyframes fxdBlink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes fxdShift{0%,100%{background:#7c3aed}50%{background:#db2777}}
@keyframes fxdFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes fxdShine{0%{left:-60%}60%,100%{left:130%}}
@keyframes fxdLift{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes fxdCount{0%{content:"1"}50%{content:"5"}100%{content:"9"}}
@keyframes fxdShake{0%,30%,100%{transform:rotate(0)}8%{transform:rotate(-18deg)}16%{transform:rotate(14deg)}24%{transform:rotate(-8deg)}}
.fxd{display:inline-block;width:22px;height:12px;border-radius:4px;background:#7c3aed;position:relative;overflow:hidden;flex:none}
.fxd-pulse{animation:fxdPulse 1.6s infinite}.fxd-glow{animation:fxdGlow 2s infinite}.fxd-blink{animation:fxdBlink 1.6s infinite}
.fxd-colorShift{animation:fxdShift 2.4s infinite}.fxd-flow{background:linear-gradient(90deg,#7c3aed,#db2777,#7c3aed);background-size:300% 100%;animation:fxdFlow 2s infinite}
.fxd-shine::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:rgba(255,255,255,.6);transform:skewX(-20deg);animation:fxdShine 1.8s infinite}
.fxd-lift{background:#fff;border:1px solid #c4b5fd;animation:fxdLift 1.4s infinite}.fxd-accentBar{background:#fff;border:1px solid #e2e8f0;box-shadow:inset 3px 0 0 #7c3aed}
.fxd-countUp{background:none;width:auto;font-size:10px;color:#5b21b6;font-weight:600}.fxd-countUp::before{content:"1";animation:fxdCount 1.2s steps(1) infinite}
.fxd-shake{background:none;width:auto;height:auto;font-size:12px;color:#7c3aed;animation:fxdShake 1.6s infinite;transform-origin:50% 10%}
@media (prefers-reduced-motion: reduce){.fxd,.fxd::after,.fxd::before{animation:none!important}}
`;
const FX_SHORT: Partial<Record<EffectKey, string>> = { pulse: "Pulse", blink: "กระพริบ", colorShift: "เปลี่ยนสี", flow: "ไล่สีวิ่ง", glow: "เรือง", shine: "แสงวิ่ง", lift: "ยกตัว", accentBar: "แถบเน้น", countUp: "นับขึ้น", shake: "สั่น" };

/** เลือกเอฟเฟกต์ของ 1 จุด: การ์ดเล็กมีตัวอย่างขยับ (กด = เปิด/ปิด · สูงสุด 2) + ความแรง */
export function TargetFxEditor({ config: c, target, onPatch, readOnly }: { config: ErpThemeConfig; target: EffectTarget; onPatch: (p: Patch) => void; readOnly?: boolean }) {
  const v = c.effects.targets[target];
  const set = (nv: { fx?: EffectKey[]; strength?: 1 | 2 | 3 }) => onPatch({ effects: { targets: { [target]: { ...v, ...nv } } } });
  const toggle = (e: EffectKey) => {
    const on = v.fx.includes(e);
    const next = on ? v.fx.filter((x) => x !== e) : [...v.fx, e].slice(-MAX_FX_PER_TARGET);   // เกิน 2 = ตัวเก่าสุดหลุด
    set({ fx: next });
  };
  return (
    <div>
      <style>{FX_DEMO_CSS}</style>
      <div className="grid grid-cols-3 gap-1">
        {TARGET_EFFECTS[target].map((e) => {
          const on = v.fx.includes(e);
          return (
            <button key={e} type="button" disabled={readOnly} onClick={() => toggle(e)} title={FX_LABEL[e]} aria-pressed={on}
              className={`h-8 px-1.5 rounded-md border text-[10px] flex items-center gap-1.5 ${on ? "bg-blue-50 border-blue-300 text-blue-800 font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
              <span className={`fxd fxd-${e}`}>{e === "shake" ? <Icon name="bell" /> : null}</span>
              <span className="truncate">{FX_SHORT[e]}</span>
            </button>
          );
        })}
      </div>
      {v.fx.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[10px] text-slate-500 w-12">ความแรง</span>
          {([1, 2, 3] as const).map((n) => (
            <button key={n} type="button" disabled={readOnly} onClick={() => set({ strength: n })}
              className={`h-6 px-2 rounded text-[10px] border ${v.strength === n ? "bg-blue-50 border-blue-300 text-blue-800" : "border-slate-200 text-slate-500"}`}>{["เบา", "ปกติ", "แรง"][n - 1]}</button>
          ))}
          <span className="ml-auto text-[10px] text-slate-400">เลือกได้ {MAX_FX_PER_TARGET}</span>
        </div>
      )}
    </div>
  );
}

// ── โหมดง่าย (B): 5 อย่าง ─────────────────────────────────
const EASY_SWATCHES = ["#ea580c", "#7c3aed", "#0e7490", "#15803d", "#db2777", "#1d4ed8", "#a16207", "#334155"];

export function ThemeEasyPanel({ config: c, onPatch, onReplace, readOnly }: {
  config: ErpThemeConfig; onPatch: (p: Patch) => void; onReplace: (next: ErpThemeConfig) => void; readOnly?: boolean;
}) {
  const preset = currentFxPreset(c);
  const lvl = motionLevel(c);
  return (
    <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70 space-y-3">
      <div>
        <div className="text-xs font-medium text-slate-700 mb-1.5">สีหลัก</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {EASY_SWATCHES.map((x) => (
            <button key={x} type="button" aria-label={`สี ${x}`} onClick={() => onPatch({ colors: { primary: x } })}
              className="w-7 h-7 rounded-full" style={{ background: x, outline: c.colors.primary.toLowerCase() === x ? "2px solid #0f172a" : "none", outlineOffset: 2 }} />
          ))}
          <div className="w-28"><ColorInput value={c.colors.primary} onChange={(v) => onPatch({ colors: { primary: v } })} /></div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-700 mb-1.5">สไตล์ {preset === null && <span className="text-[10px] font-normal text-slate-400">(กำหนดเอง)</span>}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {FX_PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => onPatch({ effects: p.fx, outline: p.outline, elevation: p.elevation })}
              className={`text-left rounded-lg border px-2 py-1.5 ${preset === p.key ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"}`}>
              <div className="text-xs font-medium text-slate-800">{p.name}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center text-xs font-medium text-slate-700 mb-1">ความเคลื่อนไหว<span className="ml-auto text-[11px] font-normal text-slate-500">{["นิ่ง", "น้อย", "ปกติ", "มาก"][lvl]}</span></div>
        <input type="range" min={0} max={3} step={1} value={lvl} onChange={(e) => onReplace(withMotionLevel(c, Number(e.target.value) as 0 | 1 | 2 | 3))} className="w-full" aria-label="ความเคลื่อนไหว" />
        <div className="flex justify-between text-[10px] text-slate-400"><span>นิ่ง</span><span>มาก</span></div>
      </div>
      <div>
        <div className="flex items-center text-xs font-medium text-slate-700 mb-1">ความมน<span className="ml-auto text-[11px] font-normal text-slate-500">{c.shape.radius}px</span></div>
        <input type="range" min={0} max={20} step={1} value={c.shape.radius} onChange={(e) => onPatch({ shape: { radius: Number(e.target.value) } })} className="w-full" aria-label="ความมน" />
        <div className="flex justify-between text-[10px] text-slate-400"><span>เหลี่ยม</span><span>มน</span></div>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-700 mb-1.5">รูปพื้นหลัง</div>
        <ImageInput value={c.background.image} onChange={(k) => onPatch({ background: { image: k } })} folder="themes" />
        {c.background.image && <div className="mt-1.5"><Seg value={c.background.where} options={[["page", "ทั้งหน้า"], ["top", "แถบบน"], ["banner", "แบนเนอร์"]]} onChange={(v) => onPatch({ background: { where: v } })} /></div>}
      </div>
      <div className="text-[11px] text-slate-400">อยากปรับลึกกว่านี้ → กด "ละเอียด" ด้านบน หรือคลิกชิ้นในพรีวิว</div>
    </fieldset>
  );
}

// ── โหมดละเอียด (B): 4 กลุ่มพับได้ ───────────────────────────
const CAT_LABEL: Record<EditorCategory, string> = {
  colors: "สี", background: "พื้นหลัง", gradient: "ไล่สี", effects: "เอฟเฟกต์", outline: "ขอบและเงา", animation: "มาสคอต / ความเร็ว",
  typography: "ตัวอักษร", shape: "รูปทรง", density: "ความแน่น", components: "ชิ้นส่วน", mode: "สว่าง / มืด",
};

export function ThemeAdvancedPanel({ config, onPatch, readOnly, open, onToggle, focusCat }: {
  config: ErpThemeConfig; onPatch: (p: Patch) => void; readOnly?: boolean;
  open: AdvGroupKey | null; onToggle: (g: AdvGroupKey | null) => void; focusCat?: EditorCategory | null;
}) {
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (focusCat) focusRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [focusCat, open]);
  return (
    <div className="space-y-2">
      {ADV_GROUPS.map((g) => {
        const isOpen = open === g.key;
        return (
          <div key={g.key} className={`rounded-lg border ${isOpen ? "border-blue-200" : "border-slate-200"} bg-white`}>
            <button type="button" onClick={() => onToggle(isOpen ? null : g.key)} className="w-full text-left px-3 py-2 flex items-center gap-2" aria-expanded={isOpen}>
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-800">{g.label}</span><span className="block text-[11px] text-slate-400 truncate">{g.hint}</span></span>
              <span className="text-slate-400 text-xs">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="px-3 pb-2">
                {g.cats.map((cat) => (
                  <div key={cat} ref={cat === focusCat ? focusRef : undefined} className={`pt-2 mt-1 border-t border-slate-100 first:border-0 first:mt-0 ${cat === focusCat ? "rounded-md ring-2 ring-amber-200 bg-amber-50/40 px-1.5 -mx-1.5" : ""}`}>
                    {g.cats.length > 1 && <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{CAT_LABEL[cat]}</div>}
                    <ThemeEditorPanel config={config} category={cat} onPatch={onPatch} readOnly={readOnly} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ป๊อปแก้ชิ้นในพรีวิว (C · แบบ 1) — เนื้อหาตามชิ้น ─────────────
export function PartQuickEditor({ config: c, part, onPatch, readOnly }: { config: ErpThemeConfig; part: EffectTarget; onPatch: (p: Patch) => void; readOnly?: boolean }) {
  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-2.5">
      {(part === "button" || part === "topbar" || part === "menu") && (
        <div><div className="text-[11px] text-slate-500 mb-1">สีหลัก</div><ColorInput value={c.colors.primary} onChange={(v) => onPatch({ colors: { primary: v } })} /></div>
      )}
      {part === "topbar" && (
        <Check checked={c.gradient.spots.top} onChange={(v) => onPatch({ gradient: { spots: { top: v } } })} label="แถบบนไล่สี" />
      )}
      {part === "card" && (
        <div className="grid grid-cols-2 gap-x-2">
          <div className="col-span-2 text-[11px] text-slate-500">ขอบ</div>
          <Seg value={c.outline.width} options={[[0, "ไม่มี"], [1, "1"], [2, "2"], [3, "3"]]} onChange={(v) => onPatch({ outline: { width: v } })} />
          <div className="col-span-2 mt-1"><Seg value={c.outline.color} options={[["gray", "เทา"], ["soft", "ธีมอ่อน"], ["theme", "สีธีม"]]} onChange={(v) => onPatch({ outline: { color: v } })} /></div>
          <div className="col-span-2"><Check checked={c.outline.gradient} onChange={(v) => onPatch({ outline: { gradient: v } })} label="ขอบไล่สี" /></div>
          <div className="col-span-2 text-[11px] text-slate-500 mt-1">เงา</div>
          <div className="col-span-2"><Seg value={c.elevation.depth} options={[["none", "ไม่มี"], ["soft", "บาง"], ["medium", "กลาง"], ["float", "ลอย"]]} onChange={(v) => onPatch({ elevation: { depth: v } })} /></div>
        </div>
      )}
      <div><div className="text-[11px] text-slate-500 mb-1">เอฟเฟกต์</div><TargetFxEditor config={c} target={part} onPatch={onPatch} readOnly={readOnly} /></div>
    </fieldset>
  );
}

