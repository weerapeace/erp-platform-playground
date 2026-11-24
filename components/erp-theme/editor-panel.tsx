"use client";
/**
 * ThemeEditorPanel — แผงปรับธีม 9 หมวด (ธีมกลาง ERP เฟส 2)
 *   รับ config + onPatch(patch แบบลึก) · ใช้ของกลาง ColorInput / RangeInput / ImageInput
 *   หมวด: สี · พื้นหลัง · ไล่สี · แอนิเมชัน · ตัวอักษร · รูปทรง · ความแน่น · ชิ้นส่วน · สว่าง/มืด
 */
import { ColorInput } from "@/components/color-picker";
import { RangeInput } from "@/components/range-input";
import { ImageInput } from "@/components/image-input";
import { FONT_OPTIONS, VEIL_MAX_OPACITY, type ErpThemeConfig } from "@/lib/erp-theme-config";

export type ThemeCategory = "colors" | "background" | "gradient" | "animation" | "typography" | "shape" | "density" | "components" | "mode";
export const THEME_CATEGORIES: { key: ThemeCategory; label: string }[] = [
  { key: "colors", label: "สี" }, { key: "background", label: "พื้นหลัง" }, { key: "gradient", label: "ไล่สี" },
  { key: "animation", label: "แอนิเมชัน" }, { key: "typography", label: "ตัวอักษร" }, { key: "shape", label: "รูปทรง" },
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
          <Check checked={c.gradient.animate} onChange={(v) => set("gradient", { animate: v })} label="ไล่สีขยับช้า ๆ" hint="บนมือถือปิดให้อัตโนมัติ" />
        </>
      );
      case "animation": return (
        <>
          <Check checked={c.animation.enter} onChange={(v) => set("animation", { enter: v })} label="เข้าหน้าแล้วค่อย ๆ โผล่" />
          <Check checked={c.animation.hover} onChange={(v) => set("animation", { hover: v })} label="การ์ด/แถวยกตัวตอนชี้เมาส์" />
          <Check checked={c.animation.shine} onChange={(v) => set("animation", { shine: v })} label="ปุ่มหลักมีแสงวิ่ง" hint="เฉพาะปุ่มแบบทึบ · มือถือปิดให้" />
          <Check checked={c.animation.countUp} onChange={(v) => set("animation", { countUp: v })} label="ตัวเลขสรุปนับขึ้น" />
          <Check checked={c.animation.mascot} onChange={(v) => set("animation", { mascot: v })} label="ของตกแต่งขยับ (มาสคอต)" hint="มือถือปิดให้" />
          {c.animation.mascot && <Row label="รูปมาสคอต (GIF/PNG/WebP)"><ImageInput value={c.animation.mascotImage} onChange={(k) => set("animation", { mascotImage: k })} folder="themes" compact /></Row>}
          <Row label="ความเร็ว"><Seg value={c.animation.speed} options={[["slow", "ช้า"], ["normal", "ปกติ"], ["fast", "เร็ว"]]} onChange={(v) => set("animation", { speed: v })} /></Row>
          <div className="text-[11px] text-slate-400">ผู้ใช้ปิดแอนิเมชันเองได้ (เฟส 5) · เครื่องที่ตั้ง "ลดการเคลื่อนไหว" ปิดให้อัตโนมัติ</div>
        </>
      );
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
          <Row label="เงา"><Seg value={c.shape.shadow} options={[["none", "ไม่มี"], ["soft", "บาง"], ["strong", "ชัด"]]} onChange={(v) => set("shape", { shadow: v })} /></Row>
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
