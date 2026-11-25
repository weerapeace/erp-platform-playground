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
  const setTarget = (t: EffectTarget, v: { fx?: EffectKey[]; strength?: 1 | 2 | 3 }) => onPatch({ effects: { targets: { [t]: { ...fx.targets[t], ...v } } } });
  const setSlot = (t: EffectTarget, i: number, e: EffectKey | "") => {
    const cur = [...fx.targets[t].fx];
    if (e) cur[i] = e; else cur.splice(i, 1);
    setTarget(t, { fx: [...new Set(cur.filter(Boolean))].slice(0, MAX_FX_PER_TARGET) });
  };
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
          {EFFECT_TARGETS.map((t) => {
            const v = fx.targets[t.key];
            const opts = TARGET_EFFECTS[t.key];
            return (
              <div key={t.key} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex items-baseline gap-1.5 mb-1"><span className="text-xs font-medium text-slate-800">{t.label}</span><span className="text-[10px] text-slate-400">{t.hint}</span></div>
                <div className="grid grid-cols-2 gap-1">
                  {[0, 1].map((i) => (
                    <select key={i} value={v.fx[i] ?? ""} disabled={i === 1 && !v.fx[0]} onChange={(e) => setSlot(t.key, i, e.target.value as EffectKey | "")}
                      className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[11px] disabled:opacity-40" aria-label={`${t.label} เอฟเฟกต์ที่ ${i + 1}`}>
                      <option value="">{i === 0 ? "ไม่มี" : "— เพิ่ม —"}</option>
                      {opts.filter((o) => o === v.fx[i] || !v.fx.includes(o)).map((o) => <option key={o} value={o}>{FX_LABEL[o]}</option>)}
                    </select>
                  ))}
                </div>
                {v.fx.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-500 w-12">ความแรง</span>
                    {([1, 2, 3] as const).map((n) => (
                      <button key={n} type="button" onClick={() => setTarget(t.key, { strength: n })}
                        className={`h-6 px-2 rounded text-[10px] border ${v.strength === n ? "bg-blue-50 border-blue-300 text-blue-800" : "border-slate-200 text-slate-500"}`}>{["เบา", "ปกติ", "แรง"][n - 1]}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
