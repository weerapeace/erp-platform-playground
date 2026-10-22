"use client";

/**
 * ของกลาง — ตัวเลือกฟอนต์ / สีตามธีมร้าน ของตัวจัดหน้าเว็บ
 *
 * ใช้ร่วม: ผืนผ้าใบอิสระ (แผงชิ้น) · แผง "🔤 ตัวอักษร" ของทุก Section (StylePanel)
 *  - useShopTheme(shopSlug)  = สีธีม + ชื่อฟอนต์หัวข้อ/เนื้อหาของร้าน (API สาธารณะ) → วาดจุดสี/ตัวอย่างฟอนต์ให้ตรงเว็บจริง
 *  - usePreviewFonts()       = โหลดฟอนต์ตัวอย่าง (CANVAS_FONTS) ในหน้า ERP ครั้งเดียว
 *  - FontPickList            = รายการฟอนต์ + ตัวอย่างตัวอักษร
 *  - ColorSwatches           = จุดสีธีม + สีเอง (ค่าเก็บเป็นชื่อสีธีม เปลี่ยนธีมแล้วตามไปเอง · "custom" + hex)
 * ⚠️ รายชื่อฟอนต์/สีมาจาก lib/website-canvas.ts (CANVAS_FONTS · CANVAS_COLORS) ที่เดียว — เว็บร้านมีชุดเดียวกัน
 *  - webFontOptions / WEB_FONT_NAMES = ตัวเลือกฟอนต์ธีม (GOOGLE_FONTS) สำหรับ FontSelect (ของกลาง components/font-select)
 *  - canvasFontOptions = ตัวเลือก CANVAS_FONTS (ฟอนต์หัวข้อ/เนื้อหาของธีม + ฟอนต์พิเศษ) สำหรับ FontSelect
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CANVAS_FONTS } from "@/lib/website-canvas";
import { GOOGLE_FONTS } from "@/lib/website-theme";
import type { FontOption } from "@/components/font-select";

/** ฟอนต์ทั้งหมดที่ธีมเว็บร้านเลือกได้ (Google Fonts) */
export const WEB_FONT_NAMES = GOOGLE_FONTS.map((f) => f.name);
/** ตัวเลือก FontSelect ของฟอนต์ธีม · first = ตัวเลือกพิเศษบนสุด (เช่น "ตามฟอนต์เนื้อหา") */
export function webFontOptions(first: FontOption[] = []): FontOption[] {
  return [
    ...first,
    ...GOOGLE_FONTS.map((f) => ({ value: f.name, label: f.name, family: `"${f.name}", sans-serif`, group: f.thai ? "ไทย + อังกฤษ" : "อังกฤษ (ตัวไทยใช้ฟอนต์สำรอง)" })),
  ];
}
/** 🔤 ตัวเลือก "ฟอนต์ตัวอังกฤษแยก" (ธีม fonts.displayLatin / bodyLatin) — เฉพาะฟอนต์อังกฤษ · "" = ใช้ฟอนต์เดียวกับตัวไทย */
export function latinFontOptions(sameLabel: string): FontOption[] {
  return [{ value: "", label: sameLabel }, ...GOOGLE_FONTS.filter((f) => !f.thai).map((f) => ({ value: f.name, label: f.name, family: `"${f.name}", sans-serif` }))];
}
/** ตัวเลือก FontSelect ของ CANVAS_FONTS (display/body = ฟอนต์ของธีมร้าน) */
export function canvasFontOptions(fontNames: ThemeFontNames, autoLabel?: string): FontOption[] {
  return [
    ...(autoLabel ? [{ value: "auto", label: autoLabel }] : []),
    ...CANVAS_FONTS.map((f) => {
      const family = fontFamilyOf(f.v, fontNames);
      return { value: f.v, label: f.v === "display" || f.v === "body" ? `${f.l} (${family})` : f.l, family: `"${family}", sans-serif` };
    }),
  ];
}
/** ชื่อฟอนต์ Google ที่ต้องโหลดของ CANVAS_FONTS (+ ฟอนต์ธีม) */
export const canvasFontNames = (fontNames: ThemeFontNames) => [...new Set([fontNames.display, fontNames.body, ...CANVAS_FONTS.filter((f) => f.v !== "display" && f.v !== "body").map((f) => f.v)])];

/** สีของธีมร้าน (จาก API สาธารณะ) — ใช้วาดจุดสี */
export type ThemeColors = { brand: string; brandDeep: string; ink: string; muted: string; page: string; surface: string };
export type ThemeFontNames = { display: string; body: string };

export const DEFAULT_THEME_COLORS: ThemeColors = { brand: "#b76e79", brandDeep: "#9d4e5a", ink: "#141517", muted: "#9ba1a9", page: "#fafaf9", surface: "#ffffff" };
export const DEFAULT_FONT_NAMES: ThemeFontNames = { display: "Kanit", body: "Noto Sans Thai" };

/** สีแบรนด์จาง = แบรนด์ 14% บนขาว (สูตรเดียวกับเว็บร้าน --color-brand-soft) */
export function softOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#f4e3e6";
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c * 0.14 + 255 * 0.86);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

export function swatchesOf(t: ThemeColors): { v: string; label: string; hex: string }[] {
  return [
    { v: "ink", label: "ตัวอักษรหลัก", hex: t.ink },
    { v: "brand", label: "แบรนด์", hex: t.brand },
    { v: "brandDeep", label: "แบรนด์เข้ม", hex: t.brandDeep },
    { v: "brandSoft", label: "แบรนด์จาง", hex: softOf(t.brand) },
    { v: "muted", label: "ตัวอักษรรอง", hex: t.muted },
    { v: "page", label: "พื้นเว็บ", hex: t.page },
    { v: "surface", label: "พื้นการ์ด", hex: t.surface },
    { v: "white", label: "ขาว", hex: "#ffffff" },
  ];
}

/** สีธีม + ฟอนต์ของร้าน (ยังโหลดไม่เสร็จ/โหลดไม่ได้ = ค่าตั้งต้น ใช้งานต่อได้) */
export function useShopTheme(shopSlug: string | null | undefined): { theme: ThemeColors; fontNames: ThemeFontNames } {
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME_COLORS);
  const [fontNames, setFontNames] = useState<ThemeFontNames>(DEFAULT_FONT_NAMES);
  useEffect(() => {
    if (!shopSlug) return;
    let alive = true;
    apiFetch(`/api/public/storefront/site?shop=${encodeURIComponent(shopSlug)}&preview=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.theme) return;
        setTheme({ ...DEFAULT_THEME_COLORS, ...(j.theme.colors ?? {}) });
        if (j.theme.fonts) setFontNames({ display: j.theme.fonts.display || DEFAULT_FONT_NAMES.display, body: j.theme.fonts.body || DEFAULT_FONT_NAMES.body });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shopSlug]);
  return { theme, fontNames };
}

/** ฟอนต์ตัวอย่างในแผง (Google Fonts ของ CANVAS_FONTS) */
const PREVIEW_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Parisienne&family=Great+Vibes&family=Cormorant+Garamond:wght@500&family=Playfair+Display:wght@500&family=Trirong:wght@400;500&family=Charm&family=Mali:wght@500&family=Itim&family=Kanit:wght@400;500&family=Prompt:wght@400;500&display=swap";

export function usePreviewFonts() {
  useEffect(() => {
    const id = "zz-canvas-fonts";
    if (document.getElementById(id)) return;
    const el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    el.href = PREVIEW_FONTS_HREF;
    document.head.appendChild(el);
  }, []);
}

/** ชื่อฟอนต์จริงของตัวเลือก ("display"/"body" = ฟอนต์ของธีมร้าน) */
export function fontFamilyOf(v: string, fontNames: ThemeFontNames): string {
  return v === "display" ? fontNames.display : v === "body" ? fontNames.body : v;
}

/** รายการฟอนต์ + ตัวอย่าง · autoLabel = มีตัวเลือก "ตามเดิม" (ค่า "auto") บนสุด */
export function FontPickList({ value, onPick, fontNames, sample = "Aa ก ข ค", autoLabel }: { value: string; onPick: (v: string) => void; fontNames: ThemeFontNames; sample?: string; autoLabel?: string }) {
  usePreviewFonts();
  const opts = [...(autoLabel ? [{ v: "auto", l: autoLabel }] : []), ...CANVAS_FONTS];
  return (
    <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1">
      {opts.map((f) => {
        const family = f.v === "auto" ? null : fontFamilyOf(f.v, fontNames);
        return (
          <button
            key={f.v}
            type="button"
            onClick={() => onPick(f.v)}
            className={`flex items-baseline justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left ${value === f.v ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}
          >
            <span className="text-[17px] text-slate-800 truncate" style={family ? { fontFamily: `"${family}", sans-serif` } : undefined}>
              {f.v === "auto" ? f.l : sample}
            </span>
            {f.v !== "auto" && <span className="text-[10px] text-slate-400 shrink-0">{f.v === "display" || f.v === "body" ? `${f.l.replace("ฟอนต์", "")} (${family})` : f.v}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** จุดสีธีม + สีเอง · allowNone = มีปุ่ม "ไม่มี" · autoLabel = มีปุ่ม "ตามเดิม" (ค่า "auto") */
export function ColorSwatches({
  theme,
  value,
  hex,
  onPick,
  allowNone,
  autoLabel,
}: {
  theme: ThemeColors;
  value: string;
  hex: string;
  onPick: (v: string, hex?: string) => void;
  allowNone?: boolean;
  autoLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {autoLabel && (
        <button
          type="button"
          title={autoLabel}
          onClick={() => onPick("auto")}
          className={`h-7 px-2 rounded-full border text-[11px] ${value === "auto" ? "bg-slate-900 border-slate-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-500"}`}
        >
          {autoLabel}
        </button>
      )}
      {allowNone && (
        <button type="button" title="ไม่มี" onClick={() => onPick("none")} className={`w-7 h-7 rounded-full border text-[10px] text-slate-400 ${value === "none" ? "ring-2 ring-blue-500 ring-offset-1" : "border-slate-300"}`}>
          ∅
        </button>
      )}
      {swatchesOf(theme).map((s) => (
        <button key={s.v} type="button" title={s.label} onClick={() => onPick(s.v)} className={`w-7 h-7 rounded-full border border-black/10 ${value === s.v ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: s.hex }} />
      ))}
      <label
        title="สีเอง"
        className={`relative w-7 h-7 rounded-full border border-black/10 overflow-hidden cursor-pointer ${value === "custom" ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
        style={{ background: value === "custom" && hex ? hex : "conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6,#f87171)" }}
      >
        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={hex || "#d4537e"} onChange={(e) => onPick("custom", e.target.value)} />
      </label>
    </div>
  );
}
