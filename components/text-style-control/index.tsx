"use client";
/**
 * TextStyleControl — ตัวตั้งค่าตัวอักษรกลาง (เจ้าของเลือกแบบ A จาก widget 2026-11-23 · "ไม่ให้รก รวมเป็นไอคอน กดแล้วมีให้เลือก")
 *   แถบไอคอนแถวเดียว · กดไอคอน = เมนูลอย (Popover กลาง): ฟอนต์ · ขนาด px 6-25 · หนา/เอียง/ขีดเส้นใต้/ขีดฆ่า ·
 *   สีตัวอักษร (ทุกสี + สีล่าสุด + ดูดสี — ColorPicker กลาง) · ไฮไลต์ทุกสี · จัดซ้าย/กลาง/ขวา · bullets/เลข · ปุ่มค่าเริ่มต้น
 * กติกา/แปลงเป็น CSS = lib/text-style · คู่มือ docs/text-style-control.md · ตัวอย่าง /admin/plugins (ทะเบียน key text-style-control)
 */
import type { ReactNode } from "react";
import { Popover } from "@/components/popover";
import { ColorPicker } from "@/components/color-picker";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { TEXT_SIZE_MAX, TEXT_SIZE_MIN, clampTextSize, type TextAlign, type TextFontOption, type TextList, type TextStyle, type TextStyleFeature } from "@/lib/text-style";

const QUICK_COLORS = ["#1e293b", "#64748b", "#633806", "#791F1F", "#be123c", "#c2410c", "#085041", "#0C447C", "#26215C", "#7c3aed"];
const QUICK_HIGHLIGHTS = ["#fef08a", "#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fed7aa", "#e2e8f0"];
const QUICK_SIZES = [8, 10, 12, 14, 16, 18, 20, 22, 24];

export function TextStyleControl({ value, onChange, fonts, defaults, hide, notes, onReset, extra, className = "" }: {
  value: TextStyle;
  onChange: (next: TextStyle) => void;
  /** รายการฟอนต์ · ไม่ส่ง = ไม่มีปุ่มฟอนต์ */
  fonts?: TextFontOption[];
  /** ค่าที่ใช้จริงเมื่อยังไม่ตั้ง (โชว์บนปุ่ม) */
  defaults?: TextStyle;
  /** ซ่อนส่วนที่ที่นี้ไม่ใช้ */
  hide?: Partial<Record<TextStyleFeature, boolean>>;
  /** ส่วนที่ทำไม่ได้ในที่นี้ → ปุ่มจาง + เหตุผล (เช่น กระดานวาดทำตัวเอียงไม่ได้) */
  notes?: Partial<Record<TextStyleFeature, string>>;
  /** ปุ่ม "ค่าเริ่มต้น" (ไม่ส่ง = ไม่มีปุ่ม) */
  onReset?: () => void;
  /** ปุ่มเพิ่มท้ายแถบ (เช่น แปรงก๊อปสไตล์) */
  extra?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const v: TextStyle = { ...defaults, ...value };
  const set = (p: Partial<TextStyle>) => onChange({ ...value, ...p });
  const show = (f: TextStyleFeature) => !hide?.[f] && (f !== "font" || !!fonts?.length);
  const btn = (on = false) => `inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-md border px-1.5 text-[12px] ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
  const caret = <Icon value="i:chevron-down" size={10} className="text-slate-400" />;
  const fontLabel = fonts?.find((f) => f.value === v.font);
  const styleOn = !!(v.bold || v.italic || v.underline || v.strike);
  const swatch = (c: string, on: boolean, pick: () => void, square = false) => (
    <button key={c} type="button" onClick={pick} aria-label={c} title={c}
      className={`h-5 w-5 border ${square ? "rounded" : "rounded-full"} ${on ? "ring-2 ring-violet-400 ring-offset-1" : "border-slate-200"}`} style={{ backgroundColor: c }} />
  );
  const note = (f: TextStyleFeature) => notes?.[f] ? <div className="mt-1 text-[11px] leading-snug text-amber-700">{notes[f]}</div> : null;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {show("font") && (
        <Popover panelClassName="w-56 p-1" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("ฟอนต์", "Font")} className={`${btn(open)} max-w-[9.5rem]`}>
            <Icon value="i:typography" size={15} /><span className="truncate" style={fontLabel?.css ? { fontFamily: fontLabel.css } : undefined}>{fontLabel?.label ?? t("ฟอนต์", "Font")}</span>{caret}
          </button>)}>
          {(close) => <div className="flex flex-col">
            {fonts!.map((f) => (
              <button key={f.value} type="button" onClick={() => { set({ font: f.value }); close(); }}
                className={`rounded px-2 py-1.5 text-left text-[13px] hover:bg-slate-50 ${f.value === v.font ? "bg-violet-50 text-violet-800" : "text-slate-700"}`}
                style={f.css ? { fontFamily: f.css } : undefined}>{f.label}</button>
            ))}
          </div>}
        </Popover>
      )}
      {show("size") && (
        <Popover panelClassName="w-60 p-2" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("ขนาดตัวอักษร (px)", "Font size (px)")} className={btn(open)}>
            <Icon value="i:text-size" size={15} /><span className="tabular-nums">{v.size ?? "–"}</span>{caret}
          </button>)}>
          {() => <div className="space-y-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => set({ size: clampTextSize((v.size ?? 14) - 1) })} className={btn()} aria-label={t("เล็กลง", "Smaller")}><Icon value="i:minus" size={14} /></button>
              <input type="number" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} value={v.size ?? ""} onChange={(e) => set({ size: clampTextSize(e.target.value, v.size ?? 14) })}
                className="h-8 w-14 rounded-md border border-slate-200 px-1 text-center text-[13px] tabular-nums" />
              <span className="text-[12px] text-slate-500">px</span>
              <button type="button" onClick={() => set({ size: clampTextSize((v.size ?? 14) + 1) })} className={btn()} aria-label={t("ใหญ่ขึ้น", "Bigger")}><Icon value="i:plus" size={14} /></button>
            </div>
            <input type="range" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} step={1} value={v.size ?? 14} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full accent-violet-600" />
            <div className="flex flex-wrap gap-1">{QUICK_SIZES.map((s) => <button key={s} type="button" onClick={() => set({ size: s })} className={`${btn(v.size === s)} h-7 min-w-7 text-[11px]`}>{s}</button>)}</div>
          </div>}
        </Popover>
      )}
      {(show("bold") || show("italic") || show("underline") || show("strike")) && (
        <Popover panelClassName="w-56 p-2" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("หนา · เอียง · ขีดเส้น", "Bold · italic · lines")} className={btn(open || styleOn)}>
            <Icon value="i:bold" size={15} />{caret}
          </button>)}>
          {() => <div>
            <div className="flex gap-1">
              {([["bold", "bold", t("หนา", "Bold")], ["italic", "italic", t("เอียง", "Italic")], ["underline", "underline", t("ขีดเส้นใต้", "Underline")], ["strike", "strikethrough", t("ขีดฆ่า", "Strikethrough")]] as const)
                .filter(([k]) => show(k)).map(([k, icon, label]) => (
                  <button key={k} type="button" onClick={() => set({ [k]: !v[k] } as Partial<TextStyle>)} title={label} aria-pressed={!!v[k]}
                    className={`${btn(!!v[k])} h-9 w-9 ${notes?.[k] ? "opacity-60" : ""}`}><Icon value={`i:${icon}`} size={16} /></button>
                ))}
            </div>
            {note("italic")}{note("bold")}{note("underline")}{note("strike")}
          </div>}
        </Popover>
      )}
      {show("color") && (
        <Popover panelClassName="p-2" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("สีตัวอักษร", "Text color")} className={btn(open)}>
            <span className="flex flex-col items-center leading-none"><Icon value="i:text-color" size={14} /><span className="mt-0.5 h-1 w-4 rounded-sm" style={{ backgroundColor: v.color ?? "#1e293b" }} /></span>{caret}
          </button>)}>
          {() => <div className="w-[214px] space-y-2">
            <div className="flex flex-wrap gap-1">{QUICK_COLORS.map((c) => swatch(c, v.color?.toLowerCase() === c.toLowerCase(), () => set({ color: c })))}</div>
            <ColorPicker value={v.color ?? "#1e293b"} onChange={(c) => set({ color: c })} />
          </div>}
        </Popover>
      )}
      {show("highlight") && (
        <Popover panelClassName="p-2" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("ไฮไลต์", "Highlight")} className={btn(open || !!v.highlight)}>
            <span className="flex flex-col items-center leading-none"><Icon value="i:paint" size={14} /><span className="mt-0.5 h-1 w-4 rounded-sm border border-slate-200" style={{ backgroundColor: v.highlight ?? "transparent" }} /></span>{caret}
          </button>)}>
          {() => <div className="w-[214px] space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => set({ highlight: undefined })} className={`${btn(!v.highlight)} h-6 text-[11px]`}>{t("ไม่มี", "None")}</button>
              {QUICK_HIGHLIGHTS.map((c) => swatch(c, v.highlight?.toLowerCase() === c.toLowerCase(), () => set({ highlight: c }), true))}
            </div>
            <ColorPicker value={v.highlight ?? "#fef08a"} onChange={(c) => set({ highlight: c })} />
            {note("highlight")}
          </div>}
        </Popover>
      )}
      {show("align") && (
        <Popover panelClassName="p-1.5" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("จัดตำแหน่ง", "Alignment")} className={btn(open)}>
            <Icon value={`i:align-${v.align ?? "left"}`} size={15} />{caret}
          </button>)}>
          {(close) => <div className="flex gap-1">
            {(["left", "center", "right"] as TextAlign[]).map((a) => (
              <button key={a} type="button" onClick={() => { set({ align: a }); close(); }} aria-pressed={(v.align ?? "left") === a}
                title={a === "left" ? t("ชิดซ้าย", "Left") : a === "center" ? t("กึ่งกลาง", "Center") : t("ชิดขวา", "Right")}
                className={`${btn((v.align ?? "left") === a)} h-9 w-9`}><Icon value={`i:align-${a}`} size={16} /></button>
            ))}
          </div>}
        </Popover>
      )}
      {show("list") && (
        <Popover panelClassName="w-44 p-1" trigger={(toggle, open) => (
          <button type="button" onClick={toggle} title={t("นำหน้าบรรทัด (bullets / เลข)", "Bullets / numbers")} className={btn(open || (!!v.list && v.list !== "none"))}>
            <Icon value={v.list === "number" ? "i:list-numbers" : "i:list"} size={15} />{caret}
          </button>)}>
          {(close) => <div className="flex flex-col">
            {([["none", "minus", t("ไม่มี", "None")], ["bullet", "list", t("bullets •", "Bullets •")], ["number", "list-numbers", t("เลข 1. 2. 3.", "Numbers 1. 2. 3.")]] as [TextList, string, string][]).map(([k, icon, label]) => (
              <button key={k} type="button" onClick={() => { set({ list: k === "none" ? undefined : k }); close(); }}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-slate-50 ${(v.list ?? "none") === k ? "bg-violet-50 text-violet-800" : "text-slate-700"}`}>
                <Icon value={`i:${icon}`} size={14} />{label}
              </button>
            ))}
          </div>}
        </Popover>
      )}
      {extra}
      {onReset && (
        <button type="button" onClick={onReset} title={t("กลับค่าเริ่มต้น", "Reset to default")} className={btn()}><Icon value="i:clear-formatting" size={15} /></button>
      )}
    </div>
  );
}
