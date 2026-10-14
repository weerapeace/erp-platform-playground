"use client";

/**
 * ของกลาง — ตัวเลือก "สีไล่" แบบภาพ (พื้นหลังทุก Section · ผืนผ้าใบ)
 *
 *   แบบสำเร็จ 6 แบบ (ตามสีธีม) · จุดสี 2–3 จุด (สีธีม หรือสีเอง) · ทิศ 5 แบบ · แถบตัวอย่าง
 * ค่า = { dir, stops } (lib/website-gradient.ts) — จุดสีชื่อธีม = เปลี่ยนธีมแล้วสีไล่เปลี่ยนตาม
 */
import { GRAD_DIRS, GRAD_THEME_COLORS, GRADIENT_PRESETS, gradientPreviewCss, type GradDir, type GradientValue, type GradThemeHex } from "@/lib/website-gradient";

const THEME_LABEL: Record<string, string> = {
  ink: "ตัวอักษรหลัก",
  brand: "แบรนด์",
  brandDeep: "แบรนด์เข้ม",
  brandSoft: "แบรนด์จาง",
  muted: "ตัวอักษรรอง",
  page: "พื้นเว็บ",
  surface: "พื้นการ์ด",
  white: "ขาว",
};

/** สีธีมเริ่มต้นสำหรับวาดตัวอย่าง (ตอนยังไม่รู้สีธีมของร้าน) */
export const DEFAULT_GRAD_THEME: GradThemeHex = {
  ink: "#141517",
  brand: "#b76e79",
  brandDeep: "#9d4e5a",
  brandSoft: "#f4e3e6",
  muted: "#9ba1a9",
  page: "#fafaf9",
  surface: "#ffffff",
  white: "#ffffff",
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function GradientPicker({ value, onChange, theme = DEFAULT_GRAD_THEME }: { value: GradientValue | null | undefined; onChange: (g: GradientValue) => void; theme?: GradThemeHex }) {
  const g: GradientValue = value && value.stops.length >= 2 ? value : GRADIENT_PRESETS[0].g;
  const hexOf = (s: string) => (HEX6.test(s) ? s : theme[s as keyof GradThemeHex] ?? "#ffffff");
  const setStop = (i: number, s: string) => onChange({ ...g, stops: g.stops.map((x, j) => (j === i ? s : x)) });
  const same = (a: GradientValue, b: GradientValue) => a.dir === b.dir && a.stops.join() === b.stops.join();

  return (
    <div className="space-y-3">
      <div className="h-10 rounded-lg border border-slate-200" style={{ background: gradientPreviewCss(g, theme) }} />
      <div>
        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">แบบสำเร็จ (ตามสีธีมร้าน)</p>
        <div className="grid grid-cols-3 gap-1.5">
          {GRADIENT_PRESETS.map((p) => (
            <button key={p.key} type="button" title={p.label} onClick={() => onChange(p.g)} className={`h-9 rounded-md border ${same(p.g, g) ? "ring-2 ring-blue-500 ring-offset-1 border-transparent" : "border-slate-200"}`} style={{ background: gradientPreviewCss(p.g, theme) }} />
          ))}
        </div>
      </div>
      {g.stops.map((s, i) => (
        <div key={i}>
          <div className="flex items-center mb-1">
            <p className="flex-1 text-[11px] font-semibold text-slate-500">{i === 0 ? "สีเริ่ม" : i === g.stops.length - 1 ? "สีปลาย" : "สีกลาง"}</p>
            {g.stops.length === 3 && i === 1 && (
              <button type="button" onClick={() => onChange({ ...g, stops: [g.stops[0], g.stops[2]] })} className="text-[11px] text-red-600 hover:underline">
                เอาสีกลางออก
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {GRAD_THEME_COLORS.map((c) => (
              <button key={c} type="button" title={THEME_LABEL[c]} onClick={() => setStop(i, c)} className={`w-6 h-6 rounded-full border border-black/10 ${s === c ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: theme[c] }} />
            ))}
            <label title="สีเอง" className={`relative w-6 h-6 rounded-full border border-black/10 overflow-hidden cursor-pointer ${HEX6.test(s) ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: HEX6.test(s) ? s : "conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6,#f87171)" }}>
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={hexOf(s)} onChange={(e) => setStop(i, e.target.value.toLowerCase())} />
            </label>
          </div>
        </div>
      ))}
      {g.stops.length === 2 && (
        <button type="button" onClick={() => onChange({ ...g, stops: [g.stops[0], "white", g.stops[1]] })} className="text-[11px] text-blue-600 hover:underline">
          + เพิ่มสีกลาง (3 สี)
        </button>
      )}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">ทิศทาง</p>
        <div className="flex flex-wrap gap-1">
          {GRAD_DIRS.map((d) => (
            <button
              key={d.v}
              type="button"
              onClick={() => onChange({ ...g, dir: d.v as GradDir })}
              className={`px-2 py-1 text-[11px] rounded-md border ${g.dir === d.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              {d.l}
            </button>
          ))}
        </div>
      </div>
      {g.stops.some((s) => HEX6.test(s)) && <p className="text-[11px] text-amber-600">สีที่เลือกเองจะไม่เปลี่ยนตามธีมร้าน</p>}
    </div>
  );
}
