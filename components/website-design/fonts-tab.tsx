"use client";

/** ตัวอักษร — ฟอนต์หลัก + ปรับละเอียดรายบทบาท (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
import { TEXT_ROLE_DEFS, defaultTextRole, type TextRole } from "@/lib/website-theme";
import { WheelSelect } from "@/components/wheel-select";
import { FontSelect } from "@/components/font-select";
import { RangeInput } from "@/components/range-input";
import { latinFontOptions, webFontOptions, WEB_FONT_NAMES } from "@/components/website-text-pickers";
import { type Theme, roleOf, labelCls, ColorField, ResetBtn } from "./shared";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";

export function FontsTab() {
  const { theme, published, apply } = useDesign();
  const roleEditor = useRoleEditor();
  return (
    <>
      <DesignCard title="ฟอนต์หลัก" hint={<>ฟอนต์หัวข้อใช้กับหัวข้อ/ชื่อสินค้า · ฟอนต์เนื้อหาใช้กับข้อความทั่วไป ปุ่ม เมนู · 🔤 ตั้ง &quot;ตัวอังกฤษ/ตัวเลข&quot; แยกได้: ตัวอังกฤษใช้ฟอนต์อังกฤษสวย ๆ ตัวไทยใช้ฟอนต์ไทยที่เลือก</>} summary={`${theme.fonts.display} / ${theme.fonts.body}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["display", "body"] as const).map((fk) => (
            <div key={fk}>
              <label className={labelCls}>{fk === "display" ? "ฟอนต์หัวข้อ" : "ฟอนต์เนื้อหา"}</label>
              <div className="flex items-center gap-2">
                <FontSelect value={theme.fonts[fk]} onChange={(v) => apply({ ...theme, fonts: { ...theme.fonts, [fk]: v } })} options={webFontOptions()} googleFonts={WEB_FONT_NAMES} sample="กขค งานหนัง Aa 123" />
                <ResetBtn show={theme.fonts[fk] !== published.fonts[fk]} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, [fk]: published.fonts[fk] } })} />
              </div>
              {(() => {
                const lk = fk === "display" ? "displayLatin" : "bodyLatin";
                return (
                  <>
                    <label className={`${labelCls} mt-2`}>ตัวอังกฤษ/ตัวเลข</label>
                    <div className="flex items-center gap-2">
                      <FontSelect value={theme.fonts[lk]} onChange={(v) => apply({ ...theme, fonts: { ...theme.fonts, [lk]: v } })} options={latinFontOptions("ใช้ฟอนต์เดียวกัน (แบบเดิม)")} googleFonts={WEB_FONT_NAMES} sample="Premium Leather Aa 123" />
                      <ResetBtn show={theme.fonts[lk] !== published.fonts[lk]} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, [lk]: published.fonts[lk] } })} />
                    </div>
                  </>
                );
              })()}
              <p className="mt-1.5 text-base leading-snug" style={{ fontFamily: `${theme.fonts[fk === "display" ? "displayLatin" : "bodyLatin"] ? `"${theme.fonts[fk === "display" ? "displayLatin" : "bodyLatin"]}", ` : ""}"${theme.fonts[fk]}", ${fk === "display" ? `"${theme.fonts.body}",` : ""} sans-serif`, color: theme.colors.ink, fontWeight: fk === "display" ? 600 : 400 }}>
                งานหนังคุณภาพ Premium leather 0123456789
              </p>
            </div>
          ))}
        </div>
      </DesignCard>

      <DesignCard title="ปรับละเอียดรายบทบาท" hint="แต่ละชนิดข้อความตั้งแยกได้: ฟอนต์ น้ำหนัก เอียง ขนาด (คอม/มือถือ) ระยะห่าง ตัวพิมพ์ใหญ่ สี พื้นหลัง · ตัวอย่างด้านล่างเปลี่ยนตามทันที">
        <div className="space-y-3">
          {TEXT_ROLE_DEFS.map(roleEditor)}
        </div>
      </DesignCard>
    </>
  );
}

/* ─────────── ตัวแก้ 1 บทบาทตัวอักษร + ตัวอย่างสด ─────────── */
export const WEIGHT_CHOICES = [300, 400, 500, 600, 700];
export function TextRoleEditor({ def, value, pub, theme, onChange, onReset }: { def: (typeof TEXT_ROLE_DEFS)[number]; value: TextRole; pub: TextRole; theme: Theme; onChange: (p: Partial<TextRole>) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(pub);
  const isDefault = JSON.stringify(value) === JSON.stringify(defaultTextRole(def.key));
  const baseFont = def.base === "display" ? theme.fonts.display : theme.fonts.body;
  const fam = value.font ? `"${value.font}", "${baseFont}", sans-serif` : `"${baseFont}", sans-serif`;
  const scale = (mobile && value.sizeMobile ? value.sizeMobile : value.size) / 100;
  const defaultColor = def.key === "eyebrow" ? theme.colors.brand : def.key === "button" ? "#fff" : theme.colors.ink;
  const sample: React.CSSProperties = {
    fontFamily: fam,
    fontWeight: value.weight,
    fontStyle: value.italic ? "italic" : "normal",
    letterSpacing: `${value.spacing / 100}em`,
    textTransform: value.uppercase ? "uppercase" : "none",
    fontSize: def.px * scale,
    color: value.color || defaultColor,
    background: def.key === "button" ? theme.colors.brand : value.bg || undefined,
    padding: def.key === "button" ? "0.7em 1.6em" : value.bg ? "0.08em 0.35em" : undefined,
    borderRadius: def.key === "button" ? 99 : undefined,
    width: "fit-content",
    lineHeight: 1.3,
  };
  return (
    <div className={`rounded-lg border ${dirty ? "border-amber-300" : "border-slate-200"} bg-slate-50/50`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">{def.label}</span>
            {!isDefault && <span className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5">ปรับแล้ว</span>}
            <span className="text-[10px] text-slate-400">{open ? "▲" : "▼"}</span>
          </div>
          <div className="mt-1 overflow-hidden" style={{ background: theme.colors.page, padding: "6px 8px", borderRadius: 6 }}>
            <span style={sample}>{def.sample}</span>
          </div>
        </button>
        {!isDefault && (
          <button type="button" onClick={() => onChange(defaultTextRole(def.key))} className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0" title="กลับค่าเริ่มต้น">↺ ค่าเริ่มต้น</button>
        )}
        {dirty && (
          <button type="button" onClick={onReset} className="text-[11px] text-amber-700 hover:underline shrink-0" title="คืนค่าที่เผยแพร่อยู่">คืนค่าเดิม</button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-200 pt-3">
          <p className="text-[11px] text-slate-500">{def.hint}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>ฟอนต์</label>
              <FontSelect
                value={value.font}
                onChange={(v) => onChange({ font: v })}
                options={webFontOptions([{ value: "", label: `ตาม${def.base === "display" ? "ฟอนต์หัวข้อ" : "ฟอนต์เนื้อหา"} (${baseFont})`, family: `"${baseFont}", sans-serif` }])}
                googleFonts={WEB_FONT_NAMES}
                sample={def.sample.slice(0, 18)}
              />
            </div>
            <div>
              <label className={labelCls}>น้ำหนัก</label>
              <WheelSelect value={value.weight} onChange={(e) => onChange({ weight: Number(e.target.value) })}>
                {WEIGHT_CHOICES.map((w) => <option key={w} value={w}>{w === 300 ? "บาง (300)" : w === 400 ? "ปกติ (400)" : w === 500 ? "กลาง (500)" : w === 600 ? "หนา (600)" : "หนามาก (700)"}</option>)}
              </WheelSelect>
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.italic} onChange={(e) => onChange({ italic: e.target.checked })} />เอียง</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.uppercase} onChange={(e) => onChange({ uppercase: e.target.checked })} />ตัวพิมพ์ใหญ่ (อังกฤษ)</label>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>🖥 ขนาดบนคอม ({value.size}%)</label>
              <RangeInput min={50} max={250} step={5} value={value.size} onChange={(v) => onChange({ size: v })} className="w-full" onMouseEnter={() => setMobile(false)} />
            </div>
            <div>
              <label className={labelCls}>📱 ขนาดบนมือถือ ({value.sizeMobile ? `${value.sizeMobile}%` : "เท่าคอม"})</label>
              <RangeInput min={0} max={250} step={5} value={value.sizeMobile} onChange={(v) => onChange({ sizeMobile: v })} className="w-full" onMouseEnter={() => setMobile(true)} />
            </div>
            <div>
              <label className={labelCls}>ระยะห่างตัวอักษร ({value.spacing / 100}em)</label>
              <RangeInput min={-10} max={40} step={1} value={value.spacing} onChange={(v) => onChange({ spacing: v })} className="w-full" />
            </div>
          </div>
          {def.key !== "button" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField label="สีตัวอักษร" value={value.color} onChange={(hex) => onChange({ color: hex })} />
              {def.key !== "body" && <ColorField label="พื้นหลังไฮไลต์" value={value.bg} onChange={(hex) => onChange({ bg: hex })} emptyLabel="ไม่มี" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ✏️ ตัวแก้ 1 บทบาทตัวอักษร — ใช้ร่วม แท็บตัวอักษร + แท็บเมนู (เมนูด้านบน/เมนูย่อย) → แก้ที่ไหนก็ค่าเดียวกัน
export function useRoleEditor() {
  const { theme, published, apply } = useDesign();
  return (d: (typeof TEXT_ROLE_DEFS)[number]) => (
    <TextRoleEditor
      key={d.key}
      def={d}
      value={roleOf(theme, d.key)}
      pub={roleOf(published, d.key)}
      theme={theme}
      onChange={(patch) => apply({ ...theme, typography: { ...theme.typography, [d.key]: { ...roleOf(theme, d.key), ...patch } } })}
      onReset={() => apply({ ...theme, typography: { ...theme.typography, [d.key]: { ...roleOf(published, d.key) } } })}
    />
  );
}
