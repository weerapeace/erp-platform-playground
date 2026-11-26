"use client";
/**
 * ThemeEditorPanel — แผงปรับธีม 9 หมวด (ธีมกลาง ERP เฟส 2)
 *   รับ config + onPatch(patch แบบลึก) · ใช้ของกลาง ColorInput / RangeInput / ImageInput
 *   หมวด: สี · พื้นหลัง · ไล่สี · เอฟเฟกต์ · ขอบและเงา · มาสคอต · ตัวอักษร · รูปทรง · ความแน่น · ชิ้นส่วน · สว่าง/มืด
 *   แผงสีแบบ A (2026-11-26): แท็บ ชุดสี (16 ชุด + ดูดสีจากรูป) / สีหลัก (เฉดปุ่ม · สีรองที่เข้ากัน · ไล่สี) / แต่ละส่วน (6 ส่วน)
 *   ตัวแก้แบบเรียบ (2026-11-25 · แบบ D): แถบล่าง สี / สไตล์ / พื้นหลัง (ThemeColorSheet · ThemeStyleSheet · ThemeBgSheet) + "เพิ่มเติม" = ThemeAdvancedPanel · คำอธิบายย่อเป็น ⓘ (InfoTip)
 *   เอฟเฟกต์ = ตาราง "จุด × เอฟเฟกต์ (เลือกได้ 2) × ความแรง" + ชุดสำเร็จรูป (lib/erp-theme-fx · รอบเอฟเฟกต์เพิ่ม)
 */
import { ColorInput } from "@/components/color-picker";
import { RangeInput } from "@/components/range-input";
import { ImageInput } from "@/components/image-input";
import { FONT_OPTIONS, SHADE_MAX, SHADE_MIN, VEIL_MAX_OPACITY, isLightColor, primaryScale, scaleOf, type ErpThemeConfig } from "@/lib/erp-theme-config";
import { THEME_STOPS } from "@/lib/erp-theme";
import { COLOR_SETS, PART_COLORS, currentColorSet, harmonyColors, type ColorPartKey } from "@/lib/erp-theme-palettes";
import { swatchesFromImageKey } from "@/components/erp-theme/palette-from-image";
import { EFFECTS, EFFECT_TARGETS, FX_PRESETS, MAX_FX_PER_TARGET, TARGET_EFFECTS, type EffectKey, type EffectTarget } from "@/lib/erp-theme-fx";
import { useEffect, useRef, useState } from "react";
import { ADV_GROUPS, currentFxPreset, motionLevel, withMotionLevel, type AdvGroupKey, type EditorCategory } from "@/lib/erp-theme-easy";
import { ThemeParticles } from "@/components/erp-theme/particles";
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

/** ⓘ คำอธิบาย (ตัวแก้แบบเรียบ ข้อ 3) — ชี้เมาส์เห็น · มือถือแตะเพื่อเปิด/ปิด · ไม่กินที่บนจอ */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button type="button" title={text} aria-label={text} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 text-[11px]">
        <Icon value="i:info-circle" />
      </button>
      {open && <span className="absolute z-40 left-1/2 -translate-x-1/2 top-5 w-52 rounded-lg bg-slate-800 text-white text-[11px] leading-snug font-normal px-2.5 py-1.5 shadow-lg" onClick={() => setOpen(false)}>{text}</span>}
    </span>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <div className="text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">{label}{hint && <InfoTip text={hint} />}</div>
      {children}
    </div>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>{hint && <InfoTip text={hint} />}
    </label>
  );
}

/** หมายเหตุท้ายหมวด — ย่อเป็น ⓘ บรรทัดเดียว */
function Note({ text }: { text: string }) {
  return <div className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">หมายเหตุ <InfoTip text={text} /></div>;
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
          <Note text="สีสถานะ (ร่าง / รออนุมัติ / อนุมัติ / ไม่อนุมัติ) ล็อกไว้เหมือนกันทุกธีม เพื่อไม่ให้สับสนความหมาย" />
        </>
      );
      case "background": return (
        <>
          <Row label="รูปพื้นหลัง" hint="เลือกจากคลังรูปกลางหรืออัปโหลด · ระบบย่อขนาดให้เอง"><ImageInput value={c.background.image} onChange={(k) => set("background", { image: k })} folder="themes" /></Row>
          <Row label="วางที่"><Seg value={c.background.where} options={[["page", "ทั้งหน้า"], ["top", "แถบบน"], ["banner", "แบนเนอร์หัวหน้า"]]} onChange={(v) => set("background", { where: v })} /></Row>
          <Row label="ความชัด"><RangeInput value={c.background.opacity} min={0} max={100} unit="%" onChange={(v) => set("background", { opacity: v })} /></Row>
          <Row label="เบลอ" hint="บนมือถือไม่เบลอ (โหมดเบา)"><RangeInput value={c.background.blur} min={0} max={10} unit="px" onChange={(v) => set("background", { blur: v })} /></Row>
          <Check checked={c.background.veil} onChange={(v) => set("background", { veil: v })} label="กันอ่านยาก" hint={`รูปทั้งหน้าชัดไม่เกิน ${VEIL_MAX_OPACITY}% · แถบบน/แบนเนอร์ใส่ฝ้าดำบาง ๆ`} />
          <Note text={"ตาราง การ์ด และฟอร์มพื้นทึบเสมอ รูปอยู่ข้างหลังเท่านั้น"} />
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
          <Note text={"ให้ไล่สีวิ่ง: ตั้งที่แท็บ \"เอฟเฟกต์\" (เลือก \"ไล่สีวิ่ง\" ให้จุดที่ต้องการ)"} />
        </>
      );
      case "animation": return (
        <>
          <Check checked={c.animation.mascot} onChange={(v) => set("animation", { mascot: v })} label="ของตกแต่งขยับ (มาสคอต)" hint="มุมขวาล่าง · มือถือปิดให้" />
          {c.animation.mascot && <Row label="รูปมาสคอต (GIF/PNG/WebP)"><ImageInput value={c.animation.mascotImage} onChange={(k) => set("animation", { mascotImage: k })} folder="themes" compact /></Row>}
          <Row label="ความเร็วแอนิเมชันทั้งธีม"><Seg value={c.animation.speed} options={[["slow", "ช้า"], ["normal", "ปกติ"], ["fast", "เร็ว"]]} onChange={(v) => set("animation", { speed: v })} /></Row>
          <Note text={"แสงวิ่ง ยกตัว นับขึ้น เข้าหน้า → ย้ายไปแท็บ \"เอฟเฟกต์\" แล้ว · ผู้ใช้ปิดแอนิเมชันเองได้ · เครื่องที่ตั้ง \"ลดการเคลื่อนไหว\" ปิดให้อัตโนมัติ"} />
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
          <Note text={"เงา → ตั้งที่แท็บ \"ขอบและเงา\""} />
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
        <Note text={"กระพริบ/เปลี่ยนสีวน ล็อกไม่ให้เร็วเกิน (ปลอดภัยต่อคนไวแสง) · มือถือ/ผู้ใช้ปิดแอนิเมชัน = หยุดหมด"} />
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

// ── แถบล่างของตัวแก้แบบเรียบ (แบบ D): สี · สไตล์ · พื้นหลัง ─────────────
const EASY_SWATCHES = ["#ea580c", "#7c3aed", "#0e7490", "#15803d", "#db2777", "#1d4ed8", "#a16207", "#334155"];
/** ความเคลื่อนไหว 3 ระดับ (ข้อ 7) → ระดับ 0 / 2 / 3 ของ withMotionLevel */
export const MOTION_STEPS: { key: "still" | "normal" | "fun"; label: string; level: 0 | 2 | 3; hint: string }[] = [
  { key: "still", label: "นิ่ง", level: 0, hint: "ไม่มีอะไรขยับ เหมาะกับงานจริงจัง" },
  { key: "normal", label: "พอดี", level: 2, hint: "ขยับเบา ๆ ตรงที่ควรสังเกต" },
  { key: "fun", label: "สนุก", level: 3, hint: "ขยับเยอะ เหมาะช่วงเทศกาล" },
];
export function motionStepOf(c: ErpThemeConfig): "still" | "normal" | "fun" {
  const l = motionLevel(c);
  return l === 0 ? "still" : l === 3 ? "fun" : "normal";
}

function SheetLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <div className="text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">{children}{hint && <InfoTip text={hint} />}</div>;
}

/** แผงสีแบบ A (2026-11-26 · ข้อ 1–6): แท็บ ชุดสี / สีหลัก / แต่ละส่วน */
type ColorTab = "sets" | "main" | "parts";
const GRAD_SPOTS: [keyof ErpThemeConfig["gradient"]["spots"], string][] = [["top", "แถบบน"], ["button", "ปุ่มหลัก"], ["sidebar", "เมนูที่เลือก"], ["banner", "แบนเนอร์"], ["page", "พื้นหลังหน้า"]];

export function ThemeColorSheet({ config: c, onPatch, readOnly }: { config: ErpThemeConfig; onPatch: (p: Patch) => void; readOnly?: boolean }) {
  const [tab, setTab] = useState<ColorTab>("sets");
  const tabs: [ColorTab, string][] = [["sets", "ชุดสี"], ["main", "สีหลัก"], ["parts", "แต่ละส่วน"]];
  const partsSet = Object.values(c.colors.parts).filter(Boolean).length;
  return (
    <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70">
      <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5 mb-3" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`h-8 rounded-md text-xs ${tab === k ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500 hover:text-slate-800"}`}>
            {l}{k === "parts" && partsSet > 0 && <span className="ml-1 text-[10px] text-blue-700">{partsSet}</span>}
          </button>
        ))}
      </div>
      {tab === "sets" && <ColorSetsTab c={c} onPatch={onPatch} />}
      {tab === "main" && <ColorMainTab c={c} onPatch={onPatch} />}
      {tab === "parts" && <ColorPartsTab c={c} onPatch={onPatch} />}
    </fieldset>
  );
}

function ColorSetsTab({ c, onPatch }: { c: ErpThemeConfig; onPatch: (p: Patch) => void }) {
  const cur = currentColorSet(c.colors);
  const [img, setImg] = useState<string | null>(null);
  const [sw, setSw] = useState<string[] | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!img) { setSw(null); return; }
    let alive = true;
    setReading(true);
    swatchesFromImageKey(img, 5).then((s) => { if (alive) setSw(s); }).catch(() => { if (alive) setSw([]); }).finally(() => { if (alive) setReading(false); });
    return () => { alive = false; };
  }, [img]);
  return (
    <div className="space-y-3">
      <div>
        <SheetLabel hint="กดทีเดียวได้ สีหลัก + สีรอง + สีไล่ ที่เข้ากันแล้ว · กดย้อนได้">ชุดสีสำเร็จรูป</SheetLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {COLOR_SETS.map((s) => (
            <button key={s.key} type="button" title={s.name} aria-pressed={cur === s.key}
              onClick={() => onPatch({ colors: { primary: s.primary, accent: s.accent }, gradient: { color2: s.color2 } })}
              className={`rounded-lg border p-1 text-left ${cur === s.key ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex h-4 rounded overflow-hidden"><span className="flex-[2]" style={{ background: s.primary }} /><span className="flex-1" style={{ background: s.accent }} /><span className="flex-1" style={{ background: s.color2 }} /></div>
              <div className="mt-0.5 text-[10px] text-slate-600 truncate">{s.name}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <SheetLabel hint="เลือก/วางรูปที่ชอบ (รูปสินค้า โลโก้ บรรยากาศ) ระบบดึงสีเด่น 5 สี · รูปไม่ถูกบันทึกในธีม">ดูดสีจากรูป</SheetLabel>
        <ImageInput value={img} onChange={setImg} folder="themes" compact />
        {reading && <div className="mt-1.5 text-[11px] text-slate-400">กำลังอ่านสีจากรูป…</div>}
        {sw && !reading && (sw.length === 0
          ? <div className="mt-1.5 text-[11px] text-amber-700">รูปนี้ไม่มีสีสดพอ ลองรูปอื่น</div>
          : (
            <div className="mt-2">
              <div className="flex items-center gap-1.5">
                {sw.map((x) => (
                  <button key={x} type="button" title={`ใช้ ${x} เป็นสีหลัก`} onClick={() => onPatch({ colors: { primary: x } })}
                    className="w-8 h-8 rounded-full" style={{ background: x, outline: c.colors.primary === x ? "2px solid #0f172a" : "none", outlineOffset: 2 }} />
                ))}
                <button type="button" onClick={() => onPatch({ colors: { primary: sw[0], accent: sw[1] ?? sw[0] }, gradient: { color2: sw[2] ?? sw[1] ?? sw[0] } })}
                  className="ml-auto h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50">ใช้ทั้งชุด</button>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">กดวงสี = ใช้เป็นสีหลัก</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function ColorMainTab({ c, onPatch }: { c: ErpThemeConfig; onPatch: (p: Patch) => void }) {
  const base = scaleOf(c.colors.primary);
  const btnIdx = 6 + c.colors.shade;   // THEME_STOPS[6] = 600
  const g = c.gradient;
  return (
    <div className="space-y-3">
      <div>
        <SheetLabel hint="ปุ่ม ลิงก์ แถบบน · ระบบสร้างเฉดอ่อน-เข้มให้เอง">สีหลัก</SheetLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {EASY_SWATCHES.map((x) => (
            <button key={x} type="button" aria-label={`สี ${x}`} onClick={() => onPatch({ colors: { primary: x } })}
              className="w-7 h-7 rounded-full" style={{ background: x, outline: c.colors.primary.toLowerCase() === x ? "2px solid #0f172a" : "none", outlineOffset: 2 }} />
          ))}
        </div>
        <div className="mt-2"><ColorInput value={c.colors.primary} onChange={(v) => onPatch({ colors: { primary: v } })} /></div>
      </div>
      <div>
        <SheetLabel hint="เลือกว่าปุ่มหลักใช้เฉดไหน · ทั้งระบบเลื่อนตาม (เฉดอ่อน/เข้มรอบ ๆ เปลี่ยนด้วย)">เฉดปุ่ม อ่อน–เข้ม</SheetLabel>
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {THEME_STOPS.map((s, i) => {
            const ok = i - 6 >= SHADE_MIN && i - 6 <= SHADE_MAX, on = i === btnIdx;
            return (
              <button key={s} type="button" disabled={!ok} onClick={() => onPatch({ colors: { shade: i - 6 } })} title={ok ? `ปุ่มใช้เฉด ${s}` : `เฉด ${s}`} aria-pressed={on}
                className={`flex-1 h-8 relative ${ok ? "cursor-pointer" : "cursor-default opacity-60"}`} style={{ background: base[s] }}>
                {on && <span className="absolute inset-1 rounded border-2" style={{ borderColor: isLightColor(base[s]) ? "#0f172a" : "#fff" }} />}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>อ่อน</span><span>ปุ่มใช้เฉด {THEME_STOPS[btnIdx]}{c.colors.shade === 0 ? " (ปกติ)" : ""}</span><span>เข้ม</span></div>
      </div>
      <div>
        <SheetLabel hint="แท็บที่เลือก ป้ายเน้น · กดสีที่แนะนำเพื่อใช้">สีรอง</SheetLabel>
        <ColorInput value={c.colors.accent} onChange={(v) => onPatch({ colors: { accent: v } })} />
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {harmonyColors(c.colors.primary).map((h) => (
            <button key={h.key} type="button" onClick={() => onPatch({ colors: { accent: h.color } })} title={`ใช้ ${h.color} เป็นสีรอง`}
              className={`h-7 pl-1 pr-2 rounded-md border text-[11px] inline-flex items-center gap-1.5 ${c.colors.accent === h.color ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <span className="w-5 h-5 rounded" style={{ background: h.color }} />{h.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <SheetLabel hint="ไล่จากสีหลักไปสีที่ 2 · เลือกจุดที่จะใช้ไล่สีด้านล่าง">ไล่สี</SheetLabel>
        <div className="h-3 rounded-full mb-2" style={{ backgroundImage: `linear-gradient(${g.angle}deg, ${primaryScale(c)[600]}, ${g.color2})` }} />
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><ColorInput value={g.color2} onChange={(v) => onPatch({ gradient: { color2: v } })} /></div>
        </div>
        <div className="flex items-center text-[11px] text-slate-500 mt-2">มุม<span className="ml-auto">{g.angle}°</span></div>
        <input type="range" min={0} max={360} step={15} value={g.angle} onChange={(e) => onPatch({ gradient: { angle: Number(e.target.value) } })} className="w-full" aria-label="มุมไล่สี" />
        <div className="flex flex-wrap gap-1 mt-1">
          {GRAD_SPOTS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={g.spots[k]} onClick={() => onPatch({ gradient: { spots: { [k]: !g.spots[k] } } })}
              className={`h-7 px-2.5 rounded-full border text-[11px] ${g.spots[k] ? "bg-blue-50 border-blue-300 text-blue-800 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorPartsTab({ c, onPatch }: { c: ErpThemeConfig; onPatch: (p: Patch) => void }) {
  const parts = c.colors.parts;
  const set = (k: ColorPartKey, v: string | null) => onPatch({ colors: { parts: { [k]: v } } });
  return (
    <div>
      <div className="text-[11px] text-slate-500 mb-1">ไม่ตั้ง = ตามธีม (หน้าตาเดิม)</div>
      <div className="divide-y divide-slate-100">
        {PART_COLORS.map((p) => {
          const v = parts[p.key];
          return (
            <div key={p.key} className="py-2 flex items-center gap-2 min-h-[44px]">
              <span className="text-sm text-slate-700 flex items-center gap-1 w-28 shrink-0">{p.label}<InfoTip text={p.hint} /></span>
              {v ? (
                <>
                  <div className="flex-1 min-w-0"><ColorInput value={v} onChange={(x) => set(p.key, x)} /></div>
                  <button type="button" onClick={() => set(p.key, null)} title="กลับไปตามธีม" aria-label={`${p.label}: กลับไปตามธีม`}
                    className="w-8 h-8 shrink-0 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 inline-flex items-center justify-center"><Icon value="i:x" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[11px] text-slate-400">ตามธีม</span>
                  <button type="button" onClick={() => set(p.key, p.suggest)} className="h-8 px-2.5 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50">ตั้งสี</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <Note text="สีสถานะ (ร่าง / รออนุมัติ / อนุมัติ / ไม่อนุมัติ) ล็อกเหมือนกันทุกธีม เพื่อไม่ให้สับสนความหมาย · สีที่ทำให้อ่านยากจะขึ้นจุดเหลืองที่แถบบน กดแก้ให้อัตโนมัติได้" />
    </div>
  );
}

// ── รูปตัวอย่างสไตล์แบบขยับ (ข้อ 6) — เห็นความต่างของชุดทันที: ขอบ เงา ปุ่มเรือง/แสงวิ่ง/ไล่สีวิ่ง การ์ดยก อนุภาค ──
const ST_CSS = `
@keyframes stPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--st) 60%,transparent)}100%{box-shadow:0 0 0 7px transparent}}
@keyframes stGlow{0%,100%{box-shadow:0 0 1px color-mix(in srgb,var(--st) 40%,transparent)}50%{box-shadow:0 0 9px var(--st)}}
@keyframes stBlink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes stFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes stShine{0%{left:-60%}60%,100%{left:130%}}
@keyframes stLift{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@media (prefers-reduced-motion: reduce){.st-root *{animation:none!important}}
`;
const ST_ANIM: Partial<Record<EffectKey, string>> = { pulse: "stPulse 1.6s infinite", glow: "stGlow 2s ease-in-out infinite", blink: "stBlink 1.6s infinite", flow: "stFlow 2.4s ease-in-out infinite", lift: "stLift 2.4s ease-in-out infinite" };
const anims = (fx: EffectKey[]) => fx.map((e) => ST_ANIM[e]).filter(Boolean).join(", ") || undefined;

export function StyleThumb({ preset: p, primary, color2 }: { preset: (typeof FX_PRESETS)[number]; primary: string; color2: string }) {
  const t = p.fx.targets, o = p.outline, e = p.elevation;
  const grad = `linear-gradient(90deg, ${primary}, ${color2}, ${primary})`;
  const shadowColor = e.color === "theme" ? `color-mix(in srgb, ${primary} 45%, transparent)` : e.color === "black" ? "rgba(0,0,0,.35)" : "rgba(15,23,42,.18)";
  const shadow = { none: "none", soft: `0 1px 3px ${shadowColor}`, medium: `0 4px 10px -2px ${shadowColor}`, float: `0 10px 18px -6px ${shadowColor}` }[e.depth];
  const bw = Math.max(o.width, o.gradient ? 1 : 0);
  const borderColor = o.color === "theme" ? primary : o.color === "soft" ? `color-mix(in srgb, ${primary} 35%, white)` : "#e2e8f0";
  const card: React.CSSProperties = o.gradient
    ? { border: `${bw}px solid transparent`, backgroundImage: `linear-gradient(#fff,#fff), ${grad}`, backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box", backgroundSize: o.running ? "100% 100%, 200% 100%" : undefined, animation: [o.running ? "stFlow 2.4s ease-in-out infinite" : "", anims(t.card.fx) ?? ""].filter(Boolean).join(", ") || undefined }
    : { border: bw ? `${bw}px ${o.style} ${borderColor}` : "none", backgroundColor: "#fff", animation: anims(t.card.fx) };
  const btnFlow = t.button.fx.includes("flow");
  return (
    <div className="st-root relative h-[76px] rounded-md overflow-hidden bg-slate-50" style={{ ["--st" as string]: primary }}>
      <style>{ST_CSS}</style>
      <div className="h-2.5" style={t.topbar.fx.includes("flow") ? { backgroundImage: grad, backgroundSize: "200% 100%", animation: "stFlow 2.4s ease-in-out infinite" } : { backgroundColor: primary }} />
      {p.fx.particles !== "none" && <ThemeParticles kind={p.fx.particles} color={primary} count={6} speed={0.5} />}
      <div className="absolute left-2 right-2 top-[18px] rounded-md px-2 py-1.5" style={{ ...card, boxShadow: [shadow !== "none" ? shadow : "", o.accentBar ? `inset 3px 0 0 ${primary}` : ""].filter(Boolean).join(", ") || undefined }}>
        <div className="h-1.5 w-12 rounded bg-slate-200" />
        <div className="h-1.5 w-8 rounded bg-slate-100 mt-1" />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-10 rounded overflow-hidden"
          style={{ ...(btnFlow ? { backgroundImage: grad, backgroundSize: "200% 100%" } : { backgroundColor: primary }), animation: anims(t.button.fx) }}>
          {t.button.fx.includes("shine") && <span className="absolute top-0 h-full w-1/3 bg-white/60 -skew-x-12" style={{ left: "-60%", animation: "stShine 1.8s infinite" }} />}
        </div>
      </div>
      {t.badge.fx.length > 0 && <span className="absolute right-2 top-[5px] w-1.5 h-1.5 rounded-full bg-amber-400" style={{ ["--st" as string]: "#f59e0b", animation: anims(t.badge.fx) }} />}
    </div>
  );
}

/** สไตล์มีรูปตัวอย่าง (ข้อ 6) + ความเคลื่อนไหว 3 ปุ่ม (ข้อ 7) + ความมน */
export function ThemeStyleSheet({ config: c, onPatch, onReplace, readOnly }: {
  config: ErpThemeConfig; onPatch: (p: Patch) => void; onReplace: (next: ErpThemeConfig) => void; readOnly?: boolean;
}) {
  const preset = currentFxPreset(c);
  const step = motionStepOf(c);
  return (
    <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70 space-y-3">
      <div>
        <SheetLabel hint="ตั้งเอฟเฟกต์ ขอบ และเงาให้ทั้งชุด · ปรับต่อเองได้ที่ เพิ่มเติม">สไตล์ {preset === null && <span className="text-[10px] font-normal text-slate-400">(กำหนดเอง)</span>}</SheetLabel>
        <div className="grid grid-cols-2 gap-2">
          {FX_PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => onPatch({ effects: p.fx, outline: p.outline, elevation: p.elevation })} title={p.description}
              className={`text-left rounded-lg border p-1.5 ${preset === p.key ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="pointer-events-none"><StyleThumb preset={p} primary={c.colors.primary} color2={c.gradient.color2} /></div>
              <div className="mt-1 text-xs font-medium text-slate-800">{p.name}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <SheetLabel hint="ผู้ใช้ปิดแอนิเมชันเองได้ · มือถือเบาลงให้อัตโนมัติ">ความเคลื่อนไหว</SheetLabel>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          {MOTION_STEPS.map((m) => (
            <button key={m.key} type="button" title={m.hint} aria-pressed={step === m.key} onClick={() => onReplace(withMotionLevel(c, m.level))}
              className={`h-8 rounded-md text-xs ${step === m.key ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-600 hover:text-slate-900"}`}>{m.label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center text-xs font-medium text-slate-700 mb-1">ความมน<span className="ml-auto text-[11px] font-normal text-slate-500">{c.shape.radius}px</span></div>
        <input type="range" min={0} max={20} step={1} value={c.shape.radius} onChange={(e) => onPatch({ shape: { radius: Number(e.target.value) } })} className="w-full" aria-label="ความมน" />
      </div>
    </fieldset>
  );
}

export function ThemeBgSheet({ config: c, onPatch, readOnly }: { config: ErpThemeConfig; onPatch: (p: Patch) => void; readOnly?: boolean }) {
  return (
    <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70 space-y-3">
      <div>
        <SheetLabel hint="ตาราง การ์ด ฟอร์ม พื้นทึบเสมอ รูปอยู่ข้างหลังเท่านั้น">รูปพื้นหลัง</SheetLabel>
        <ImageInput value={c.background.image} onChange={(k) => onPatch({ background: { image: k } })} folder="themes" />
      </div>
      {c.background.image && (
        <>
          <div><SheetLabel>วางที่</SheetLabel><Seg value={c.background.where} options={[["page", "ทั้งหน้า"], ["top", "แถบบน"], ["banner", "แบนเนอร์"]]} onChange={(v) => onPatch({ background: { where: v } })} /></div>
          <div>
            <div className="flex items-center text-xs font-medium text-slate-700 mb-1">ความชัด<span className="ml-auto text-[11px] font-normal text-slate-500">{c.background.opacity}%</span></div>
            <input type="range" min={0} max={100} step={5} value={c.background.opacity} onChange={(e) => onPatch({ background: { opacity: Number(e.target.value) } })} className="w-full" aria-label="ความชัดของรูป" />
          </div>
        </>
      )}
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

