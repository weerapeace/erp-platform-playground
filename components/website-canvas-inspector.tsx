"use client";

/**
 * แผงตั้งค่าแบบ "ภาพ" ของผืนผ้าใบอิสระ (ด้านขวาของป๊อปอัปแก้เต็มจอ)
 *
 * แสดงเฉพาะเรื่องที่ใช้บ่อยของชิ้นที่เลือก — สีเป็นจุดสีของธีม · ฟอนต์โชว์ตัวอย่างจริง · ขนาดเป็นแถบเลื่อน · กรอบเลือกจากภาพ
 * ค่าละเอียดทั้งหมด (ตำแหน่งเป๊ะ ๆ ฯลฯ) อยู่ใน "ตั้งค่าละเอียด" = ฟอร์มจาก schema ตัวเดิม (SchemaForm)
 * ไม่มีชิ้นที่เลือก = ตั้งค่าของทั้งผืน (ความสูง · พื้นหลัง · มือถือ: เรียงอัตโนมัติ / จัดเอง)
 * เลือกหลายชิ้น = แผงหลายชิ้น (จับกลุ่ม · จัดชิดกัน · กระจายระยะ · ชั้น · สำเนา · ลบ)
 * ดูจอมือถือ + ผืนจัดเอง = ขนาดตัวอักษร/จัดข้อความ แก้เฉพาะมือถือ (ช่อง msize/malign)
 */
import { useState, type ReactNode } from "react";
import { SchemaForm, type SchemaFormContext } from "@/components/website-schema-form";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { CanvasShape } from "@/components/website-canvas-shapes";
import { FillLineControls, ShopPatternControls, type PatternFields } from "@/components/website-shop-pattern";
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { VideoThumb } from "@/components/video-thumb";
import { CustomFrameGrid } from "@/components/website-frame-builder";
import { RangeInput } from "@/components/range-input";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-canvas-en";
import {
  CANVAS_BUTTON_VARIANTS,
  CANVAS_FRAME_PRESETS,
  CANVAS_LOOPS,
  CANVAS_NO_LINE_FRAMES,
  CANVAS_SHAPES,
  CANVAS_SPEEDS,
  CANVAS_WEIGHTS,
  CANVAS_EXPANDS,
  CANVAS_MAX_HEIGHT,
  CANVAS_WIDTHS,
  CANVAS_SFX_FADES,
  CANVAS_SFX_SPEED_PRESETS,
  CANVAS_SFX_ZOOMS,
  canvasEntrancesFor,
  canvasFrameMask,
  canvasHasScrollFx,
  canvasHoversFor,
  canvasMobileBox,
  canvasScrollClear,
  canvasScrollGallery,
  canvasHasSceneFx,
  canvasSceneClear,
  canvasScenePreset,
  canvasSceneInsFor,
  CANVAS_SCENE_OUTS,
  canvasStagger,
  canvasShapeHasLine,
  CANVAS_LINE_ONLY_SHAPES,
} from "@/lib/website-canvas";
import { GRAD_DIRS, GRADIENT_PRESETS, type GradThemeHex } from "@/lib/website-gradient";
import { GradientPicker } from "@/components/website-gradient-picker";
import { CanvasBgPositioner } from "@/components/website-canvas-bg-position";
import { CanvasScrubPrep } from "@/components/website-canvas-scrub";
import type { Block, ChildBlock } from "@/components/website-block-editor";
// สีธีม/จุดสี/ฟอนต์ = ของกลาง (ใช้ร่วมกับแผง "🔤 ตัวอักษร" ของทุก Section)
import { ColorSwatches, FontPickList, softOf, swatchesOf, type ThemeColors } from "@/components/website-text-pickers";
export { softOf, swatchesOf, type ThemeColors } from "@/components/website-text-pickers";

export type CanvasAlign = "top" | "left" | "middle" | "center" | "bottom" | "right" | "distribute-h" | "distribute-v";
export type CanvasMultiAction = "group" | "ungroup" | "duplicate" | "delete" | "front" | "back" | "hideMobile" | "showMobile" | "lock" | "unlock" | "stagger";

/** โหมดมือถือของผืน (ป๊อปอัปแก้เต็มจอส่งมา) */
export interface CanvasMobileCtl {
  device: "desktop" | "mobile";
  /** เริ่มจัดเอง: จับตำแหน่งที่เรียงอัตโนมัติอยู่ตอนนี้เป็นจุดเริ่ม */
  onFreeze: () => void;
  /** กลับไปใช้ตำแหน่งมือถือที่เคยจัดไว้ */
  onUseSaved: () => void;
  /** กลับเป็นเรียงอัตโนมัติ (ตำแหน่งที่จัดไว้ยังเก็บอยู่) */
  onAuto: () => void;
}

const H = ({ children }: { children: ReactNode }) => <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{children}</p>;
const SCALLOP_MASK = "radial-gradient(circle closest-side, #000 97%, transparent) 0 0 / 10px 10px round, linear-gradient(#000 0 0) center / calc(100% - 10px) calc(100% - 10px) no-repeat";

/** สีธีม (hex) → ชุดสีของตัวเลือกสีไล่ */
export function gradThemeOf(t: ThemeColors): GradThemeHex {
  return { ink: t.ink, brand: t.brand, brandDeep: t.brandDeep, brandSoft: softOf(t.brand), muted: t.muted, page: t.page, surface: t.surface, white: "#ffffff" };
}

/** ตัวเลือกแบบปุ่มหลายช่อง (การเคลื่อนไหว) */
function Chips({ options, value, onPick }: { options: { v: string; l: string }[]; value: string; onPick: (v: string) => void }) {
  useT();
  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map((o) => (
        <button key={o.v || "none"} type="button" onClick={() => onPick(o.v)} className={`px-1.5 py-1.5 text-[11px] rounded-md border ${value === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
          {labelEn(o.l)}
        </button>
      ))}
    </div>
  );
}
const seg = (on: boolean) => `flex-1 px-2 py-1.5 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;

const Swatches = ColorSwatches;

/** แถบเลื่อน + ช่องพิมพ์ตัวเลข (ของกลาง RangeInput แบบซ้อน · พิมพ์ได้ในช่วงเดียวกับแถบ) */
function Slider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (n: number) => void }) {
  return <RangeInput label={<H>{label}</H>} value={value} min={min} max={max} step={step} unit={unit.trim() || undefined} ariaLabel={label} onChange={onChange} />;
}

const framePreview = (key: string): React.CSSProperties => {
  const base: React.CSSProperties = { width: 30, height: 38, background: "#f1d5dc" };
  const mask = canvasFrameMask(key);
  if (mask) return { ...base, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", ...(key === "cloud" ? { width: 40, height: 30 } : null) };
  if (key === "scallop") return { ...base, borderRadius: 0, WebkitMask: SCALLOP_MASK, mask: SCALLOP_MASK };
  if (key === "stamp") return { ...base, borderRadius: 0, outline: "3px dotted #fff", outlineOffset: -3, boxShadow: "0 0 0 1px #e2e8f0" };
  if (key === "polaroid") return { ...base, borderRadius: 0, border: "3px solid #fff", borderBottomWidth: 9, boxShadow: "0 1px 5px rgba(15,23,42,.22)" };
  if (key === "mat") return { ...base, background: "#b76e79", border: "5px solid #f1d5dc", outline: "1.5px solid #9d4e5a", outlineOffset: 2 };
  const r = key.startsWith("arch") ? "50% 50% 0 0 / 40% 40% 0 0" : key.startsWith("ellipse") || key === "lace" ? "50%" : key === "rounded" ? 8 : 2;
  const o =
    key === "lace" || key === "ellipse-dot"
      ? "2px dotted #b76e79"
      : key === "ellipse-line" || key === "arch-line"
        ? "1.5px solid #b76e79"
        : key === "rect-double"
          ? "3px double #b76e79"
          : undefined;
  return { ...base, borderRadius: r, outline: o, outlineOffset: o ? 3 : undefined };
};

export function CanvasInspector({
  block,
  item,
  theme,
  fontNames,
  ctx,
  onPatchItem,
  onPatchBlock,
  onReplaceImage,
  onPickBgImage,
  onLayer,
  onAlign,
  onCrop,
  multi = [],
  onMulti,
  mobile,
  onReplay,
  onPickFrame,
  onReplaceVideo,
  scrollPreview = false,
  onScrollPreview,
  onExpandDemo,
}: {
  block: Block;
  item: ChildBlock | null;
  /** เล่น "โผล่ตอนเลื่อนมาเจอ" ในพรีวิว (ไม่ระบุ = ทั้งผืน) */
  onReplay?: (ids?: string[]) => void;
  /** 🌀 "ลองเลื่อนดู" เปิดอยู่ไหม (พรีวิวขยับตามการเลื่อนจริง · ลากชิ้นไม่ได้ระหว่างนั้น) */
  scrollPreview?: boolean;
  onScrollPreview?: (on: boolean) => void;
  /** 🔍 เล่นท่า "กดแล้วขยาย" ของชิ้นนี้ในพรีวิว (ไม่เปลี่ยนหน้า) */
  onExpandDemo?: (id: string) => void;
  /** เปิดคลังกรอบรูปของร้าน (PNG วางทับรูป) */
  onPickFrame?: () => void;
  /** เลือกหลายชิ้น (≥ 2) → แสดงแผงหลายชิ้นแทน */
  multi?: ChildBlock[];
  onMulti?: (a: CanvasMultiAction) => void;
  mobile?: CanvasMobileCtl;
  theme: ThemeColors;
  /** ชื่อฟอนต์หัวข้อ/เนื้อหาของธีม (โชว์ในรายการฟอนต์) */
  fontNames: { display: string; body: string };
  ctx: SchemaFormContext;
  onPatchItem: (p: Record<string, unknown>) => void;
  onPatchBlock: (p: Record<string, unknown>) => void;
  onReplaceImage: () => void;
  onPickBgImage: () => void;
  /** ชั้นหน้า-หลังของชิ้นที่เลือก */
  onLayer: (to: "up" | "down" | "front" | "back") => void;
  /** จัดชิดผืน / ชิดกันเอง (พรีวิวคำนวณจากขนาดจริงบนจอ) */
  onAlign: (to: CanvasAlign) => void;
  /** เข้าโหมดครอปบนผืน (ลากรูปในกรอบ) */
  onCrop: () => void;
  /** 🎬 เปลี่ยนคลิปของชิ้นวิดีโอ (ป๊อปคลังวิดีโอ) */
  onReplaceVideo?: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const t = useT();
  const spec = SECTION_SCHEMAS.canvas.children!;
  const custom = block.mobileMode === "custom";
  const mobileEditing = custom && mobile?.device === "mobile";
  const arr = "flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-700";

  /* ── หลายชิ้น ── */
  if (multi.length > 1) {
    const grouped = !!multi[0].group && multi.every((x) => x.group === multi[0].group);
    const allHidden = multi.every((x) => x.hideMobile === true);
    const allLocked = multi.every((x) => x.locked === true);
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {t(`เลือก ${multi.length} ชิ้น`, `${multi.length} items selected`)} {grouped && <span className="text-[11px] font-normal text-blue-700">{t("· ⛓ กลุ่มเดียวกัน", "· ⛓ Same group")}</span>}
          </p>
          <p className="text-[11px] text-slate-500">{t("Shift/Ctrl+คลิก = เพิ่ม/เอาออก · ลากที่ว่างบนผืนเป็นกรอบ = เลือกหลายชิ้น · ลากชิ้นใดก็ได้ = ย้ายทั้งชุด", "Shift/Ctrl+click = add/remove · drag a box on empty canvas = select many · drag any item = move the whole set")}</p>
        </div>
        <button onClick={() => onMulti?.(grouped ? "ungroup" : "group")} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
          {grouped ? t("✂ แยกกลุ่ม", "✂ Ungroup") : t("⛓ จับกลุ่ม (คลิกทีเดียวได้ทั้งชุด)", "⛓ Group (one click selects the set)")}
        </button>
        <button onClick={() => onMulti?.("stagger")} className="w-full rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-700 hover:bg-violet-100">
          {t("✨ ให้โผล่ทีละชิ้นตามลำดับ (บน→ล่าง)", "✨ Reveal one by one (top→bottom)")}
        </button>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
          <H>{t("จัดชิดกัน (เทียบกรอบรวม)", "Align together (to combined box)")}</H>
          <div className="grid grid-cols-2 gap-1.5 -mt-1">
            <button className={arr} onClick={() => onAlign("top")}>{t("⤒ ชิดบน", "⤒ Top")}</button>
            <button className={arr} onClick={() => onAlign("left")}>{t("⇤ ชิดซ้าย", "⇤ Left")}</button>
            <button className={arr} onClick={() => onAlign("middle")}>{t("⇕ กลางแนวตั้ง", "⇕ Middle")}</button>
            <button className={arr} onClick={() => onAlign("center")}>{t("⇔ กลางแนวนอน", "⇔ Center")}</button>
            <button className={arr} onClick={() => onAlign("bottom")}>{t("⤓ ชิดล่าง", "⤓ Bottom")}</button>
            <button className={arr} onClick={() => onAlign("right")}>{t("⇥ ชิดขวา", "⇥ Right")}</button>
          </div>
          {multi.length >= 3 && (
            <>
              <H>{t("กระจายระยะห่างเท่ากัน", "Distribute evenly")}</H>
              <div className="grid grid-cols-2 gap-1.5 -mt-1">
                <button className={arr} onClick={() => onAlign("distribute-h")}>{t("↔ แนวนอน", "↔ Horizontal")}</button>
                <button className={arr} onClick={() => onAlign("distribute-v")}>{t("↕ แนวตั้ง", "↕ Vertical")}</button>
              </div>
            </>
          )}
          <H>{t("ชั้น", "Layer")}</H>
          <div className="grid grid-cols-2 gap-1.5 -mt-1">
            <button className={arr} onClick={() => onMulti?.("front")}>{t("⤒ หน้าสุด", "⤒ Bring to front")}</button>
            <button className={arr} onClick={() => onMulti?.("back")}>{t("⤓ หลังสุด", "⤓ Send to back")}</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={seg(allHidden)} onClick={() => onMulti?.(allHidden ? "showMobile" : "hideMobile")}>{allHidden ? t("📵 ซ่อนบนมือถือ", "📵 Hidden on mobile") : t("📲 โชว์บนมือถือ", "📲 Shown on mobile")}</button>
          <button className={seg(allLocked)} onClick={() => onMulti?.(allLocked ? "unlock" : "lock")}>{allLocked ? t("🔒 ล็อกอยู่", "🔒 Locked") : t("🔓 ไม่ล็อก", "🔓 Unlocked")}</button>
        </div>
        <div className="flex gap-1.5">
          <button className={seg(false)} onClick={() => onMulti?.("duplicate")}>{t("⧉ ทำสำเนาทั้งหมด", "⧉ Duplicate all")}</button>
          <button className="flex-1 px-2 py-1.5 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50" onClick={() => onMulti?.("delete")}>{t(`🗑 ลบ ${multi.length} ชิ้น`, `🗑 Delete ${multi.length} items`)}</button>
        </div>
      </div>
    );
  }

  /* ── ทั้งผืน ── */
  if (!item) {
    const style = (block.style ?? {}) as Record<string, unknown>;
    const bg = String(style.bg ?? "auto");
    const items = (Array.isArray(block.items) ? block.items : []) as ChildBlock[];
    const hasSaved = items.some((x) => Number(x.mw) > 0);
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-800">{t("ทั้งผืน", "Whole canvas")}</p>
        <p className="text-[11px] text-slate-500 -mt-2">{t("คลิกชิ้นบนผืนเพื่อแก้ทีละชิ้น · คลิกที่ว่างเพื่อกลับมาตรงนี้", "Click an item on the canvas to edit it · click empty space to come back here")}</p>
        <Slider label={t("ความสูงผืน", "Canvas height")} value={Number(block.height) || 560} min={120} max={CANVAS_MAX_HEIGHT} step={10} onChange={(n) => onPatchBlock({ height: n })} />
        <div>
          <H>{t("ความกว้างผืน (คอม)", "Canvas width (desktop)")}</H>
          <div className="flex gap-1.5">
            {CANVAS_WIDTHS.map((w) => {
              const cur = CANVAS_WIDTHS.some((x) => x.v === block.width) ? block.width : "normal";
              return (
                <button key={w.v} type="button" title={labelEn(w.l)} className={seg(cur === w.v)} onClick={() => onPatchBlock({ width: w.v })}>
                  {w.v === "normal" ? t("ปกติ 1200", "Normal 1200") : w.v === "wide" ? t("กว้าง 1600", "Wide 1600") : t("↔️ เต็มจอ", "↔️ Full screen")}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">{t("กว้างขึ้น = ทุกชิ้นขยายตามจอ ตำแหน่งที่จัดไว้ไม่เพี้ยน (จอใหญ่ตัวหนังสือใหญ่ตาม) · มือถือไม่มีผล", "Wider = every item scales with the screen, positions stay put (bigger screen, bigger text) · no effect on mobile")}</p>
        </div>
        <div>
          <H>{t("สีพื้นผืน (เต็มความกว้างจอ)", "Canvas background (full screen width)")}</H>
          <div className="flex flex-wrap gap-1.5">
            {[
              { v: "auto", l: t("ตามหน้า", "Match page"), hex: theme.page },
              { v: "page", l: t("พื้นเว็บ", "Page"), hex: theme.page },
              { v: "surface", l: t("พื้นการ์ด", "Card"), hex: theme.surface },
              { v: "brand", l: t("แบรนด์", "Brand"), hex: theme.brand },
              { v: "ink", l: t("เข้ม", "Dark"), hex: theme.ink },
            ].map((o) => (
              <button key={o.v} title={o.l} onClick={() => onPatchBlock({ style: { ...style, bg: o.v } })} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${bg === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: o.hex }} />
                {o.l}
              </button>
            ))}
            <label className={`relative flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] cursor-pointer ${bg === "custom" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: bg === "custom" ? String(style.bgColor || "#fff") : "conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6,#f87171)" }} />
              {t("สีเอง", "Custom")}
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={String(style.bgColor || "#ffffff")} onChange={(e) => onPatchBlock({ style: { ...style, bg: "custom", bgColor: e.target.value } })} />
            </label>
            <button
              title={t("ไล่สี", "Gradient")}
              onClick={() => onPatchBlock({ style: { ...style, bg: "gradient", bgGrad: style.bgGrad ?? GRADIENT_PRESETS[0].g } })}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${bg === "gradient" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}
            >
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: `linear-gradient(180deg, ${softOf(theme.brand)}, ${theme.brand})` }} />
              {t("ไล่สี", "Gradient")}
            </button>
          </div>
          {bg === "gradient" && (
            <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
              <GradientPicker value={(style.bgGrad as never) ?? null} theme={gradThemeOf(theme)} onChange={(g) => onPatchBlock({ style: { ...style, bg: "gradient", bgGrad: g } })} />
            </div>
          )}
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-2.5 space-y-2">
          <H>{t("✨ การเคลื่อนไหวทั้งผืน", "✨ Whole-canvas animation")}</H>
          <button
            onClick={() => {
              onPatchBlock({ items: canvasStagger(items) });
              window.setTimeout(() => onReplay?.(), 250);
            }}
            className="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100"
          >
            {t("✨ ให้ทุกชิ้นโผล่ทีละชิ้น (บน→ล่าง)", "✨ Reveal every item one by one (top→bottom)")}
          </button>
          <div className="flex gap-1.5">
            <button className={seg(false)} onClick={() => onReplay?.()}>{t("▶ ดูตัวอย่าง", "▶ Preview")}</button>
            <button className={seg(false)} disabled={!items.some((x) => x.anim || x.loop || x.hover)} onClick={() => onPatchBlock({ items: items.map((x) => ({ ...x, anim: "", animDelay: 0, loop: "", hover: "" })) })}>
              {t("ล้างทั้งหมด", "Clear all")}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">{t("ตั้งทีละชิ้นได้ที่ \"✨ เคลื่อนไหว\" บนแถบลอย หรือแผงนี้ตอนเลือกชิ้น", "Set per item via \"✨ Animate\" on the floating bar, or this panel when an item is selected")}</p>
          {/* 🌀 ขยับตามการเลื่อนจอ ทั้งผืน */}
          <div className="border-t border-violet-200 pt-2 space-y-1.5">
            <H>{t("🌀 ตอนเลื่อนจอ (รูปขยับเร็ว-ช้าไม่เท่ากัน)", "🌀 On scroll (images move at different speeds)")}</H>
            <button
              onClick={() => {
                onPatchBlock({ items: canvasScrollGallery(items) });
                onScrollPreview?.(true);
              }}
              className="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100"
            >
              {t("🌀 ทำทั้งผืนแบบเลื่อนแล้วมีมิติ (แบบนิตยสาร)", "🌀 Make the whole canvas parallax (magazine style)")}
            </button>
            <div className="flex gap-1.5">
              <button className={seg(scrollPreview)} onClick={() => onScrollPreview?.(!scrollPreview)}>
                {scrollPreview ? t("⏸ หยุดลองเลื่อน", "⏸ Stop scroll test") : t("▶ ลองเลื่อนดู", "▶ Try scrolling")}
              </button>
              <button className={seg(false)} disabled={!items.some(canvasHasScrollFx)} onClick={() => onPatchBlock({ items: canvasScrollClear(items) })}>
                {t("ล้างการขยับ", "Clear motion")}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {t("ลองเลื่อนดู = เลื่อนพรีวิวขึ้น-ลงเพื่อดูของจริง (ระหว่างนี้ลากชิ้นไม่ได้) · ได้ผลดีกับผืนสูงหลายจอ วางรูปกระจายซ้าย-ขวา · ตัวหนังสือใหญ่ (≥ 72) จะค้างเป็นหัวข้อพื้นหลัง", "Try scrolling = scroll the preview up/down to see the real effect (items can't be dragged meanwhile) · works best on tall canvases with images spread left/right · large text (≥ 72) stays as a background heading")}
            </p>
          </div>
          {/* 🎬 ฉากค้าง (แบบเว็บ Apple) ทั้งผืน */}
          <div className="border-t border-violet-200 pt-2 space-y-1.5">
            <H>{t("🎬 ฉากค้าง (แบบเว็บ Apple)", "🎬 Pinned scene (Apple-style)")}</H>
            <button className={`${seg(block.scene === true)} w-full`} onClick={() => onPatchBlock({ scene: !block.scene })}>
              {block.scene ? t("🎬 เปิดฉากค้างอยู่ (กดเพื่อปิด)", "🎬 Pinned scene on (click to turn off)") : t("🎬 เปิดฉากค้าง — ผืนค้างบนจอ ชิ้นเล่นท่าทีละจังหวะ", "🎬 Turn on pinned scene — canvas stays on screen, items animate step by step")}
            </button>
            {block.scene === true && (
              <>
                <Slider label={t("ความยาวฉาก (ต้องเลื่อนกี่จอ)", "Scene length (screens to scroll)")} value={Math.round((Number(block.sceneLen) || 200) / 10) / 10} min={0.5} max={8} step={0.5} unit={t(" จอ", " screens")} onChange={(n) => onPatchBlock({ sceneLen: Math.round(n * 100) })} />
                <button
                  onClick={() => {
                    onPatchBlock({ items: canvasScenePreset(items) });
                    onScrollPreview?.(true);
                  }}
                  className="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100"
                >
                  {t("🎬 จัดฉากให้ทั้งผืน (เข้าทีละจังหวะ บน→ล่าง)", "🎬 Auto-stage the whole canvas (enter step by step, top→bottom)")}
                </button>
                <div className="flex gap-1.5">
                  <button className={seg(scrollPreview)} onClick={() => onScrollPreview?.(!scrollPreview)}>
                    {scrollPreview ? t("⏸ หยุดลองเลื่อน", "⏸ Stop scroll test") : t("▶ ลองเลื่อนดู", "▶ Try scrolling")}
                  </button>
                  <button className={seg(false)} disabled={!items.some(canvasHasSceneFx)} onClick={() => onPatchBlock({ items: canvasSceneClear(items) })}>
                    {t("ล้างท่าในฉาก", "Clear scene moves")}
                  </button>
                </div>
                {block.mobileMode !== "custom" && (
                  <p className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">{t("มือถือแบบเรียงอัตโนมัติจะไม่ค้าง (เห็นท่าสุดท้าย) — อยากให้ค้างบนมือถือ เลือก \"✋ จัดเอง\" ในส่วนมือถือด้านล่าง", "Auto-stacked mobile doesn't pin (shows the final pose) — to pin on mobile, pick \"✋ Arrange myself\" in the mobile section below")}</p>
                )}
                <p className="text-[10px] text-slate-500">{t("ตั้งท่าทีละชิ้น: คลิกชิ้น → \"🎬 ในฉากค้าง\" · ระหว่างค้าง ผืนย่อให้พอดีความสูงจอ · เปิดฉากแล้ว \"ตอนเลื่อนจอ\" แบบเดิมของผืนนี้ไม่ทำงาน", "Set moves per item: click an item → \"🎬 In pinned scene\" · while pinned, the canvas shrinks to fit the screen height · with the scene on, this canvas's regular \"On scroll\" effects are off")}</p>
              </>
            )}
          </div>
        </div>
        <div>
          <H>{t("รูปพื้นหลังผืน", "Canvas background image")}</H>
          <div className="flex items-center gap-2">
            {block.bgImageKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/r2-image?key=${encodeURIComponent(String(block.bgImageKey))}&w=200`} alt="" className="w-16 h-10 rounded object-cover border border-slate-200" />
            ) : (
              <span className="w-16 h-10 rounded border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-center">{t("ไม่มี", "None")}</span>
            )}
            <button onClick={onPickBgImage} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs hover:border-blue-500">{block.bgImageKey ? t("เปลี่ยนรูป", "Change image") : t("เลือกรูป", "Pick image")}</button>
            {Boolean(block.bgImageKey) && (
              <button onClick={() => onPatchBlock({ bgImageKey: null })} className="text-xs text-red-600 hover:underline">
                {t("เอาออก", "Remove")}
              </button>
            )}
          </div>
          {Boolean(block.bgImageKey) && (
            <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
              <CanvasBgPositioner block={block as Record<string, unknown>} device={mobile?.device ?? "desktop"} onChange={(p) => onPatchBlock(p)} />
            </div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
          <H>{t("📲 มือถือ", "📲 Mobile")}</H>
          <div className="flex gap-1.5 -mt-1">
            <button className={seg(!custom)} onClick={() => mobile?.onAuto()}>{t("เรียงอัตโนมัติ", "Auto stack")}</button>
            <button className={seg(custom)} onClick={() => (custom ? undefined : hasSaved ? mobile?.onUseSaved() : mobile?.onFreeze())}>
              {t("✋ จัดเอง", "✋ Arrange myself")}
            </button>
          </div>
          {custom ? (
            <>
              <p className="text-[11px] text-slate-500">{t("ผืนมือถือแยกจากคอม — ", "Mobile canvas is separate from desktop — ")}{mobile?.device === "mobile" ? t("ลาก/ย่อ/หมุนบนผืนได้เลย ไม่กระทบหน้าคอม", "drag/resize/rotate on the canvas, desktop is not affected") : t("กด 📲 มือถือ ด้านบนเพื่อจัด", "click 📲 Mobile above to arrange")}</p>
              <Slider label={t("ความสูงผืนมือถือ", "Mobile canvas height")} value={Number(block.mobileHeight) || 800} min={120} max={3000} step={10} onChange={(n) => onPatchBlock({ mobileHeight: n })} />
              <button onClick={() => mobile?.onFreeze()} className="text-[11px] text-slate-500 hover:text-blue-600">
                {t("↺ เริ่มจัดใหม่จากแบบเรียงอัตโนมัติ", "↺ Restart from the auto-stacked layout")}
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">{t("เรียงชิ้นลงมาตามตำแหน่ง บน→ล่าง · กด \"จัดเอง\" = ใช้ที่เรียงไว้ตอนนี้เป็นจุดเริ่ม แล้วลากต่อเองได้", "Items stack by position, top→bottom · \"Arrange myself\" = start from the current stack, then drag freely")}</p>
              <div className="flex gap-1.5">
                <button className={seg(block.mobileAlign !== "left")} onClick={() => onPatchBlock({ mobileAlign: "center" })}>{t("จัดกึ่งกลาง", "Center")}</button>
                <button className={seg(block.mobileAlign === "left")} onClick={() => onPatchBlock({ mobileAlign: "left" })}>{t("ชิดซ้าย", "Left")}</button>
              </div>
              {hasSaved && (
                <button onClick={() => mobile?.onFreeze()} className="text-[11px] text-slate-500 hover:text-blue-600">
                  {t("✋ จัดเองใหม่จากแบบเรียงอัตโนมัติ (ทิ้งที่เคยจัด)", "✋ Re-arrange from the auto stack (discard saved layout)")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── ชิ้นที่เลือก ── */
  const kind = String(item.kind ?? "text");
  const num = (k: string, fb: number) => (Number.isFinite(Number(item[k])) ? Number(item[k]) : fb);
  const str = (k: string) => String(item[k] ?? "");
  // เส้นรอบกรอบใช้ไม่ได้: ทรงลาย (ขอบหยัก/แสตมป์/โพลารอยด์) + ทรงจากรูป PNG ในคลังกรอบ (ไม่มีเส้นทางให้วาดตาม)
  const noLineFrame = CANVAS_NO_LINE_FRAMES.includes(str("frame")) || (str("frame") === "custom" && !item.frameShape);
  const colorPick = (key: string, hexKey: string) => (v: string, hex?: string) => onPatchItem(hex ? { [key]: v, [hexKey]: hex } : { [key]: v });

  const mb = canvasMobileBox(item);
  // สีไล่ (ข้อความ/ของตกแต่ง): สีแรก = ช่องสีด้านบน · ที่นี่เลือกทิศ + สีปลาย
  const chip = (on: boolean) => `px-2 py-1 text-[11px] rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
  const gradRow = (
    <div>
      <H>{t("ไล่สี", "Gradient")}</H>
      <div className="flex flex-wrap gap-1">
        <button className={chip(!str("grad"))} onClick={() => onPatchItem({ grad: "" })}>
          {t("สีเดียว", "Solid")}
        </button>
        {GRAD_DIRS.map((d) => (
          <button key={d.v} className={chip(str("grad") === d.v)} onClick={() => onPatchItem({ grad: d.v })}>
            {labelEn(d.l)}
          </button>
        ))}
      </div>
      {str("grad") && (
        <div className="mt-2">
          <H>{t("สีปลาย", "End color")}</H>
          <Swatches theme={theme} value={str("color2") || "brandSoft"} hex={str("color2Hex")} onPick={colorPick("color2", "color2Hex")} />
        </div>
      )}
    </div>
  );
  return (
    <div className="space-y-4">
      {/* ดูจอมือถือ: ผืนจัดเอง = แก้แยกจากคอม · เรียงอัตโนมัติ = บอกวิธีเปลี่ยน */}
      {mobile?.device === "mobile" &&
        (mobileEditing ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 space-y-2">
            <p className="text-[11px] font-semibold text-violet-800">{t("📲 กำลังจัดหน้ามือถือ — ลาก/ย่อบนผืนได้เลย ไม่กระทบหน้าคอม", "📲 Arranging mobile — drag/resize on the canvas, desktop is not affected")}</p>
            {(kind === "text" || kind === "button") && (
              <Slider label={t("ขนาดตัวอักษร (มือถือ)", "Text size (mobile)")} value={mb.msize} min={8} max={kind === "button" ? 32 : 96} onChange={(n) => onPatchItem({ ...mb, msize: n })} />
            )}
            {kind === "text" && (
              <div>
                <H>{t("จัดข้อความ (มือถือ)", "Text align (mobile)")}</H>
                <div className="flex gap-1">
                  {(
                    [
                      ["", t("เหมือนคอม", "Same as desktop")],
                      ["left", t("ซ้าย", "Left")],
                      ["center", t("กลาง", "Center")],
                      ["right", t("ขวา", "Right")],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v || "same"} className={seg(str("malign") === v)} onClick={() => onPatchItem({ malign: v })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">{t("มือถือเรียงชิ้นให้อัตโนมัติอยู่ — อยากวางเองบนมือถือ กด \"← ทั้งผืน\" แล้วเลือก ✋ จัดเอง", "Mobile is auto-stacked — to place items yourself, click \"← Whole canvas\" and pick ✋ Arrange myself")}</p>
        ))}

      {Boolean(item.group) && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1.5">
          <span className="flex-1 text-[11px] text-blue-800">{t("⛓ อยู่ในกลุ่ม — คลิกบนผืน = เลือกทั้งกลุ่ม · คลิกซ้ำ = ชิ้นเดียว", "⛓ In a group — click on canvas = select group · click again = single item")}</span>
          <button onClick={() => onPatchItem({ group: "" })} className="text-[11px] text-blue-700 hover:underline">
            {t("เอาออกจากกลุ่ม", "Remove from group")}
          </button>
        </div>
      )}

      {/* จัดวาง (Arrange) — ชั้น + จัดชิดผืน */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
        <H>{t("ชั้น", "Layer")}</H>
        <div className="grid grid-cols-2 gap-1.5 -mt-1">
          <button className={arr} onClick={() => onLayer("up")}>{t("↑ ขึ้นหน้า 1 ชั้น", "↑ Bring forward")}</button>
          <button className={arr} onClick={() => onLayer("down")}>{t("↓ ถอยหลัง 1 ชั้น", "↓ Send backward")}</button>
          <button className={arr} onClick={() => onLayer("front")}>{t("⤒ หน้าสุด", "⤒ Bring to front")}</button>
          <button className={arr} onClick={() => onLayer("back")}>{t("⤓ หลังสุด", "⤓ Send to back")}</button>
        </div>
        <H>{t("จัดชิดผืน", "Align to canvas")}</H>
        <div className="grid grid-cols-2 gap-1.5 -mt-1">
          <button className={arr} onClick={() => onAlign("top")}>{t("⤒ ชิดบน", "⤒ Top")}</button>
          <button className={arr} onClick={() => onAlign("left")}>{t("⇤ ชิดซ้าย", "⇤ Left")}</button>
          <button className={arr} onClick={() => onAlign("middle")}>{t("⇕ กลางแนวตั้ง", "⇕ Middle")}</button>
          <button className={arr} onClick={() => onAlign("center")}>{t("⇔ กลางแนวนอน", "⇔ Center")}</button>
          <button className={arr} onClick={() => onAlign("bottom")}>{t("⤓ ชิดล่าง", "⤓ Bottom")}</button>
          <button className={arr} onClick={() => onAlign("right")}>{t("⇥ ชิดขวา", "⇥ Right")}</button>
        </div>
      </div>

      {(kind === "image" || kind === "shape" || kind === "video") && (
        <div>
          <H>{t("พลิก", "Flip")}</H>
          <div className="flex gap-1.5">
            <button className={seg(item.flipH === true)} onClick={() => onPatchItem({ flipH: !item.flipH })}>{t("⇋ ซ้าย-ขวา", "⇋ Horizontal")}</button>
            <button className={seg(item.flipV === true)} onClick={() => onPatchItem({ flipV: !item.flipV })}>{t("⇅ บน-ล่าง", "⇅ Vertical")}</button>
          </div>
          <button className={`${seg(item.bleed === true)} mt-1.5 w-full`} onClick={() => onPatchItem({ bleed: !item.bleed })}>
            ⟷ {item.bleed ? t("ยืดเต็มความกว้างจออยู่ (กดเพื่อเลิก)", "Stretched to full screen width (click to undo)") : t("ยืดเต็มความกว้างจอ", "Stretch to full screen width")}
          </button>
          {item.bleed === true && <p className="text-[10px] text-slate-400 mt-1">{t("กว้างซ้ายสุด–ขวาสุดของจอทุกขนาด · ลากได้แค่ขึ้น-ลง · ปรับสูงด้วยจุดจับบน/ล่าง", "Spans edge to edge on every screen · drag up/down only · resize height with the top/bottom handles")}</p>}
        </div>
      )}

      {kind === "image" && Boolean(item.imageKey) && (
        <div>
          <div className="flex items-center justify-between">
            <H>{t("ครอป (ซูม/เลื่อนรูปในกรอบ)", "Crop (zoom/pan image in frame)")}</H>
            <button onClick={onCrop} className="text-[11px] text-blue-600 hover:underline">{t("✂️ ลากบนผืน", "✂️ Drag on canvas")}</button>
          </div>
          <Slider label={t("ซูม", "Zoom")} value={num("cropZoom", 100)} min={100} max={400} step={5} unit="%" onChange={(n) => onPatchItem({ cropZoom: n })} />
          <div className="grid grid-cols-2 gap-2">
            <Slider label={t("ซ้าย ↔ ขวา", "Left ↔ right")} value={num("cropX", 50)} min={0} max={100} unit="%" onChange={(n) => onPatchItem({ cropX: n })} />
            <Slider label={t("บน ↕ ล่าง", "Top ↕ bottom")} value={num("cropY", 50)} min={0} max={100} unit="%" onChange={(n) => onPatchItem({ cropY: n })} />
          </div>
          {(num("cropZoom", 100) !== 100 || num("cropX", 50) !== 50 || num("cropY", 50) !== 50) && (
            <button onClick={() => onPatchItem({ cropZoom: 100, cropX: 50, cropY: 50 })} className="text-[11px] text-slate-500 hover:text-blue-600">{t("↺ รีเซ็ตครอป", "↺ Reset crop")}</button>
          )}
          <p className="text-[10px] text-slate-400 mt-1">{t("ตัดขอบรูป = ลากจุดจับที่มุม/ขอบของกรอบ · ซูม/เลื่อน = ตรงนี้ หรือกด \"ลากบนผืน\"", "Trim = drag the frame's corner/edge handles · zoom/pan = here, or click \"Drag on canvas\"")}</p>
        </div>
      )}

      {kind === "video" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {item.videoKey ? (
              <VideoThumb url={`/api/r2-image?key=${encodeURIComponent(str("videoKey"))}`} className="w-24 h-16 rounded-lg border border-slate-200" />
            ) : (
              <span className="w-24 h-16 rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-center">{t("ยังไม่มีคลิป", "No clip yet")}</span>
            )}
            <button onClick={() => onReplaceVideo?.()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:border-blue-500">🎬 {item.videoKey ? t("เปลี่ยนคลิป", "Change clip") : t("เลือกคลิป", "Pick clip")}</button>
          </div>
          <p className="text-[10px] text-slate-400">{t("เล่นเองแบบเงียบ วนซ้ำ (เบราว์เซอร์บังคับให้เงียบถ้าเล่นเอง) · รูปปกก่อนเล่น + ตำแหน่งเป๊ะ ๆ = \"ตั้งค่าละเอียด\" ด้านล่าง", "Autoplays muted on loop (browsers require mute for autoplay) · poster image + exact position = \"Advanced settings\" below")}</p>
          <div>
            <H>{t("ทรงคลิป", "Clip shape")}</H>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["rect", t("สี่เหลี่ยม", "Rectangle")],
                  ["rounded", t("มุมมน", "Rounded")],
                  ["ellipse", t("วงรี", "Oval")],
                  ["arch", t("โค้งประตู", "Arch")],
                ] as const
              ).map(([v, l]) => (
                <button key={v} className={seg(str("frame") === v)} onClick={() => onPatchItem({ frame: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            <button className={seg(str("fit") !== "contain")} onClick={() => onPatchItem({ fit: "cover" })}>{t("เต็มกรอบ", "Fill frame")}</button>
            <button className={seg(str("fit") === "contain")} onClick={() => onPatchItem({ fit: "contain" })}>{t("ทั้งคลิป (ไม่ตัด)", "Whole clip (no crop)")}</button>
          </div>
        </div>
      )}

      {(kind === "image" || kind === "video") && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-semibold text-emerald-800">{kind === "video" ? t("🛍 สินค้าในคลิปนี้", "🛍 Products in this clip") : t("🛍 สินค้าในรูปนี้", "🛍 Products in this image")}</span>
            {Array.isArray(item.products) && item.products.length > 0 && <span className="text-[10px] text-emerald-700">{t(`${item.products.length} ตัว`, `${item.products.length} items`)}</span>}
          </div>
          <WebsiteProductPicker
            shopSlug={ctx.shopSlug}
            value={Array.isArray(item.products) ? (item.products as string[]) : []}
            max={6}
            onChange={(codes) => onPatchItem({ products: codes })}
          />
          <p className="text-[10px] text-slate-500">{t(`ลูกค้ากด${kind === "video" ? "คลิป" : "รูป"}นี้ = การ์ดสินค้าเด้งขึ้นมา (หลายตัวเลื่อนดู ‹ 1/3 ›) · มีสินค้าแล้ว "กดแล้วไปที่" จะไม่ใช้`, `Customer clicks this ${kind === "video" ? "clip" : "image"} = product card pops up (swipe through several ‹ 1/3 ›) · with products set, "Link to" is ignored`)}</p>
          {Array.isArray(item.products) && item.products.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="accent-emerald-600" checked={item.shopIcon !== false} onChange={(e) => onPatchItem({ shopIcon: e.target.checked })} /> {t(`ไอคอน 🛍 มุม${kind === "video" ? "คลิป" : "รูป"} (บอกลูกค้าว่ากดซื้อได้)`, `🛍 icon in the ${kind === "video" ? "clip" : "image"} corner (tells customers it's shoppable)`)}
            </label>
          )}
        </div>
      )}

      {/* 🔍 กดแล้วขยาย (รูป/คลิป) — ชนะการ์ดสินค้าและลิงก์ธรรมดา */}
      {(kind === "image" || kind === "video") && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-semibold text-sky-800">{kind === "video" ? t("🔍 กดคลิปแล้วขยาย", "🔍 Click clip to expand") : t("🔍 กดรูปแล้วขยาย", "🔍 Click image to expand")}</span>
            {str("expand") && (
              <button onClick={() => onExpandDemo?.(item.id)} className="text-[11px] text-sky-700 hover:underline">
                {t("▶ ลองกดดู", "▶ Try it")}
              </button>
            )}
          </div>
          <Chips
            options={CANVAS_EXPANDS}
            value={str("expand")}
            onPick={(v) => {
              onPatchItem({ expand: v });
              if (v) window.setTimeout(() => onExpandDemo?.(item.id), 300);
            }}
          />
          {str("expand") === "full" && (!str("href").startsWith("/") || item.newTab === true) && (
            <p className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">{t("ตั้ง \"กดแล้วไปที่\" (ด้านล่าง) เป็นหน้าในเว็บ ไม่เปิดแท็บใหม่ — ไม่งั้นบนเว็บจริงกดแล้วจะไม่ขยาย", "Set \"Link to\" (below) to a page on this site, not a new tab — otherwise it won't expand on the live site")}</p>
          )}
          {str("expand") === "full" && <p className="text-[10px] text-slate-500">{t(`${kind === "video" ? "คลิป" : "รูป"}ค่อย ๆ ขยายเต็มจอ แล้วเปลี่ยนเป็นหน้าที่ลิงก์ไว้ใต้ภาพ`, `The ${kind === "video" ? "clip" : "image"} grows to full screen, then becomes the linked page underneath`)}</p>}
          {str("expand") === "story" && (
            <>
              <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={str("expTitle")} maxLength={120} placeholder={t("หัวข้อ เช่น คอลเลกชันฤดูร้อน (ว่าง = ใช้คำบรรยายรูป)", "Title, e.g. Summer collection (empty = use image caption)")} onChange={(e) => onPatchItem({ expTitle: e.target.value })} />
              <textarea className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" rows={4} value={str("expText")} maxLength={1500} placeholder={t("เล่าเรื่องสั้น ๆ ของภาพนี้", "A short story about this image")} onChange={(e) => onPatchItem({ expText: e.target.value })} />
              <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={str("expCta")} maxLength={40} placeholder={t("ข้อความบนปุ่ม (ว่าง = ดูเพิ่มเติม)", "Button text (empty = See more)")} onChange={(e) => onPatchItem({ expCta: e.target.value })} />
              <p className="text-[10px] text-slate-500">
                {t(`${kind === "video" ? "คลิป" : "รูป"}ขยายเต็มครึ่งซ้ายของจอ (มือถือ = ครึ่งบน) เนื้อหาขึ้นอีกฝั่ง · สินค้าใน${kind === "video" ? "คลิป" : "รูป"}ด้านบนจะขึ้นในนั้นด้วย · ปุ่มพาไปที่ "กดแล้วไปที่" (ไม่ตั้ง = ไม่มีปุ่ม)`, `The ${kind === "video" ? "clip" : "image"} fills the left half of the screen (mobile = top half) with the content on the other side · products set above appear there too · the button goes to "Link to" (not set = no button)`)}
              </p>
            </>
          )}
        </div>
      )}

      {kind === "image" && (
        <>
          <div className="flex items-center gap-3">
            {item.imageKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/r2-image?key=${encodeURIComponent(str("imageKey"))}&w=200`} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
            ) : (
              <span className="w-16 h-16 rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-center">{t("ยังไม่มีรูป", "No image yet")}</span>
            )}
            <button onClick={onReplaceImage} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:border-blue-500">{t("🖼 เปลี่ยนรูป", "🖼 Change image")}</button>
          </div>
          <div>
            <H>{t("กรอบรูป", "Frame")}</H>
            <div className="grid grid-cols-3 gap-1.5">
              {CANVAS_FRAME_PRESETS.map((p) => {
                const exact = CANVAS_FRAME_PRESETS.find((q) => q.patch.frame === item.frame && q.patch.border === item.border);
                const on = exact ? exact.key === p.key : p.patch.frame === item.frame && CANVAS_FRAME_PRESETS.find((q) => q.patch.frame === item.frame)?.key === p.key;
                return (
                  <button key={p.key} onClick={() => onPatchItem(p.patch)} className={`flex flex-col items-center gap-1 rounded-lg border py-2 ${on ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
                    <span style={framePreview(p.key)} />
                    <span className="text-[10px] text-slate-600">{labelEn(p.label)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* 🗂 กรอบของฉัน (คลังกรอบที่สร้างเอง) + ＋ สร้างกรอบเอง */}
          <CustomFrameGrid item={item} shopSlug={ctx.shopSlug} shopId={ctx.shopId} swatches={swatchesOf(theme).map((x) => ({ v: x.v, hex: x.hex }))} onPatchItem={onPatchItem} />
          {!noLineFrame && (
            <div>
              <H>{t("เส้นรอบกรอบ", "Frame outline")}</H>
              <div className="flex gap-1">
                {(
                  [
                    ["none", t("ไม่มี", "None")],
                    ["line", t("เส้น", "Line")],
                    ["dotted", t("จุด", "Dots")],
                    ["double", t("เส้นคู่", "Double")],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} className={seg(str("border") === v)} onClick={() => onPatchItem({ border: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] font-semibold text-slate-500">{t("กรอบจากรูปของร้าน (PNG วางทับรูป)", "Shop frame image (PNG overlay)")}</span>
              <button onClick={() => onPickFrame?.()} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:border-blue-500">
                {item.overlayKey ? t("เปลี่ยน…", "Change…") : t("เลือก/อัปโหลด…", "Pick/upload…")}
              </button>
            </div>
            {Boolean(item.overlayKey) && (
              <>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/r2-image?key=${encodeURIComponent(str("overlayKey"))}&w=200`} alt="" className="w-12 h-12 rounded object-contain border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:12px_12px]" />
                  <button onClick={() => onPatchItem({ overlayKey: null })} className="text-[11px] text-red-600 hover:underline">
                    {t("เอากรอบรูปออก", "Remove frame")}
                  </button>
                </div>
                <Slider label={t("รูปห่างขอบกรอบ", "Image inset from frame")} value={num("overlayInset", 12)} min={0} max={40} unit="%" onChange={(n) => onPatchItem({ overlayInset: n })} />
              </>
            )}
          </div>
          {str("border") && str("border") !== "none" && !noLineFrame && (
            <>
              <div>
                <H>{t("สีเส้นกรอบ", "Outline color")}</H>
                <Swatches theme={theme} value={str("borderColor")} hex={str("borderHex")} onPick={colorPick("borderColor", "borderHex")} />
              </div>
              <Slider label={t("ความหนาเส้น", "Line thickness")} value={num("borderWidth", 2)} min={1} max={16} onChange={(n) => onPatchItem({ borderWidth: n })} />
              <Slider label={t("ระยะห่างกรอบกับรูป", "Gap between outline and image")} value={num("borderGap", 12)} min={0} max={60} onChange={(n) => onPatchItem({ borderGap: n })} />
            </>
          )}
          <div>
            <H>{t("การจัดรูปในกรอบ", "Image fit")}</H>
            <div className="flex gap-1.5">
              <button className={seg(str("fit") !== "contain")} onClick={() => onPatchItem({ fit: "cover" })}>{t("เต็มกรอบ", "Fill frame")}</button>
              <button className={seg(str("fit") === "contain")} onClick={() => onPatchItem({ fit: "contain" })}>{t("ทั้งรูป", "Whole image")}</button>
            </div>
          </div>
          <div>
            <H>{t("คำบรรยายรูป (มีผลกับ Google)", "Image caption (affects Google)")}</H>
            <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={str("alt")} maxLength={200} placeholder={t("เช่น กระเป๋าสีชมพูพาสเทล", "e.g. Pastel pink bag")} onChange={(e) => onPatchItem({ alt: e.target.value })} />
          </div>
        </>
      )}

      {kind === "text" && (
        <>
          <div>
            <H>{t("ข้อความ (ดับเบิลคลิกบนผืนเพื่อพิมพ์ตรงนั้นก็ได้)", "Text (or double-click on the canvas to type there)")}</H>
            <textarea className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" rows={3} value={str("text")} maxLength={2000} onChange={(e) => onPatchItem({ text: e.target.value })} />
          </div>
          <Slider label={t("ขนาดตัวอักษร", "Text size")} value={num("size", 40)} min={8} max={160} onChange={(n) => onPatchItem({ size: n })} />
          <div>
            <H>{t("สีตัวอักษร", "Text color")}</H>
            <Swatches theme={theme} value={str("color")} hex={str("colorHex")} onPick={colorPick("color", "colorHex")} />
          </div>
          {gradRow}
          <div>
            <H>{t("จัดข้อความ", "Text align")}</H>
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => (
                <button key={a} className={seg(str("align") === a)} onClick={() => onPatchItem({ align: a })}>
                  {a === "left" ? t("ชิดซ้าย", "Left") : a === "center" ? t("กลาง", "Center") : t("ชิดขวา", "Right")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button className={seg(item.italic === true)} onClick={() => onPatchItem({ italic: !item.italic })}><i>{t("เอียง", "Italic")}</i></button>
            <button className={seg(item.uppercase === true)} onClick={() => onPatchItem({ uppercase: !item.uppercase })}>{t("ABC ตัวใหญ่", "ABC Uppercase")}</button>
          </div>
          <div>
            <H>{t("แถบพื้นหลังข้อความ", "Text highlight")}</H>
            <Swatches theme={theme} value={str("bg") || "none"} hex={str("bgHex")} onPick={colorPick("bg", "bgHex")} allowNone />
          </div>
        </>
      )}

      {kind === "button" && (
        <>
          <div>
            <H>{t("ข้อความบนปุ่ม", "Button text")}</H>
            <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={str("label")} maxLength={60} onChange={(e) => onPatchItem({ label: e.target.value })} />
          </div>
          <div>
            <H>{t("แบบปุ่ม", "Button style")}</H>
            <div className="grid grid-cols-2 gap-1.5">
              {CANVAS_BUTTON_VARIANTS.map((v) => (
                <button key={v.v} className={seg(str("variant") === v.v)} onClick={() => onPatchItem({ variant: v.v })}>
                  {labelEn(v.l)}
                </button>
              ))}
            </div>
          </div>
          {str("variant") !== "brand" && (
            <div>
              <H>{t("สีปุ่ม/ตัวอักษร", "Button/text color")}</H>
              <Swatches theme={theme} value={str("color")} hex={str("colorHex")} onPick={colorPick("color", "colorHex")} />
            </div>
          )}
          <Slider label={t("ขนาดตัวอักษร", "Text size")} value={num("size", 16)} min={10} max={40} onChange={(n) => onPatchItem({ size: n })} />
        </>
      )}

      {(kind === "text" || kind === "button") && (
        <>
          <div>
            <H>{t("ฟอนต์", "Font")}</H>
            <FontPickList value={str("font")} onPick={(v) => onPatchItem({ font: v })} fontNames={fontNames} sample={kind === "button" ? str("label") || t("ปุ่ม", "Button") : "Aa ก ข ค"} />
          </div>
          <div>
            <H>{t("ความหนา", "Weight")}</H>
            <div className="flex gap-1">
              {CANVAS_WEIGHTS.map((w) => (
                <button key={w.v} className={seg(str("weight") === w.v)} style={{ fontWeight: Number(w.v) }} onClick={() => onPatchItem({ weight: w.v })}>
                  {labelEn(w.l)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {kind === "shape" && !!item.pattern && <ShopPatternControls it={item as PatternFields} theme={theme} onPatch={onPatchItem} boxW={num("w", 100)} boxH={num("h", 100)} />}

      {kind === "shape" && !item.pattern && (
        <>
          <div>
            <H>{t("ลาย", "Pattern")}</H>
            <div className="grid grid-cols-4 gap-1.5">
              {CANVAS_SHAPES.map((o) => (
                <button key={o.v} title={labelEn(o.l)} onClick={() => onPatchItem({ shape: o.v })} className={`h-12 rounded-lg border p-1.5 ${str("shape") === o.v ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
                  <CanvasShape it={{ shape: o.v, w: 60, h: 40, outline: o.v === "rect" || o.v === "ellipse" || o.v === "arch", strokeWidth: 2 }} color={theme.brand} />
                </button>
              ))}
            </div>
          </div>
          {/* 🎨 สีพื้น + สีเส้น + ความหนา (ของกลาง FillLineControls) · ลายเส้นล้วน/สีเดียว = สีเดียว */}
          {canvasShapeHasLine(str("shape")) ? (
            <FillLineControls it={item as PatternFields} theme={theme} onPatch={onPatchItem} />
          ) : (
            <div>
              <H>{t("สี", "Color")}</H>
              <Swatches theme={theme} value={str("color")} hex={str("colorHex")} onPick={colorPick("color", "colorHex")} />
            </div>
          )}
          {gradRow}
          {CANVAS_LINE_ONLY_SHAPES.includes(str("shape")) && (
            <Slider label={t("ความหนาเส้น", "Line thickness")} value={num("strokeWidth", 2)} min={1} max={16} onChange={(n) => onPatchItem({ strokeWidth: n })} />
          )}
        </>
      )}

      {/* การเคลื่อนไหว (ทุกชนิด) */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
        <div className="flex items-center">
          <span className="flex-1 text-[11px] font-semibold text-violet-800">{t("✨ เคลื่อนไหว", "✨ Animate")}</span>
          {str("anim") && (
            <button onClick={() => onReplay?.([item.id])} className="text-[11px] text-violet-700 hover:underline">
              {t("▶ ดูอีกครั้ง", "▶ Replay")}
            </button>
          )}
        </div>
        <div>
          <H>{t("โผล่ตอนเลื่อนมาเจอ", "Reveal on scroll")}</H>
          <Chips
            options={canvasEntrancesFor(kind)}
            value={str("anim")}
            onPick={(v) => {
              onPatchItem({ anim: v });
              if (v) window.setTimeout(() => onReplay?.([item.id]), 250);
            }}
          />
        </div>
        {str("anim") && (
          <>
            <Slider label={t("หน่วงเวลาก่อนโผล่", "Delay before reveal")} value={Math.round(num("animDelay", 0) / 100) / 10} min={0} max={3} step={0.1} unit={t(" วิ", " s")} onChange={(n) => onPatchItem({ animDelay: Math.round(n * 1000) })} />
            <div className="flex gap-1">
              {CANVAS_SPEEDS.map((o) => (
                <button key={o.v} className={seg((str("animSpeed") || "normal") === o.v)} onClick={() => onPatchItem({ animSpeed: o.v })}>
                  {labelEn(o.l)}
                </button>
              ))}
            </div>
          </>
        )}
        <div>
          <H>{t("ขยับตลอดเวลา", "Continuous motion")}</H>
          <Chips options={CANVAS_LOOPS.filter((o) => o.v !== "shine" || kind === "image" || kind === "button")} value={str("loop")} onPick={(v) => onPatchItem({ loop: v })} />
        </div>
        {str("loop") && (
          <div className="flex gap-1">
            {CANVAS_SPEEDS.map((o) => (
              <button key={o.v} className={seg((str("loopSpeed") || "normal") === o.v)} onClick={() => onPatchItem({ loopSpeed: o.v })}>
                {labelEn(o.l)}
              </button>
            ))}
          </div>
        )}
        <div>
          <H>{t("ตอนเอาเมาส์ชี้ (คอม · ลองชี้ที่ชิ้นบนผืนได้เลย)", "On hover (desktop · try hovering the item on the canvas)")}</H>
          <Chips options={canvasHoversFor(kind)} value={str("hover")} onPick={(v) => onPatchItem({ hover: v })} />
        </div>
        {str("anim") === "type" && <p className="text-[10px] text-violet-700">{t("พิมพ์ทีละตัว: ความเร็ว = เร็ว/ปกติ/ช้า ด้านบน · ข้อความยาวเกิน 400 ตัวจะใช้ \"ค่อย ๆ ขึ้นมา\" แทน", "Typewriter: speed = Fast/Normal/Slow above · text over 400 characters uses \"Fade up\" instead")}</p>}
        {/* 🎬 ในฉากค้าง (ผืนเปิดฉากค้าง · เว็บร้าน lib/canvas-scene) */}
        {block.scene === true ? (
          <div className="border-t border-violet-200 pt-2 space-y-2">
            <div className="flex items-center">
              <span className="flex-1 text-[11px] font-semibold text-violet-800">{t("🎬 ในฉากค้าง", "🎬 In pinned scene")}</span>
              <button onClick={() => onScrollPreview?.(!scrollPreview)} className="text-[11px] text-violet-700 hover:underline">
                {scrollPreview ? t("⏸ หยุดลอง", "⏸ Stop test") : t("▶ ลองเลื่อนดู", "▶ Try scrolling")}
              </button>
            </div>
            <div>
              <H>{t("ท่าเข้า", "Enter move")}</H>
              <Chips options={canvasSceneInsFor(kind)} value={str("scIn")} onPick={(v) => onPatchItem(v === "scrub" ? { scIn: v, scFrom: 0, scTo: 100 } : { scIn: v })} />
            </div>
            {str("scIn") && (
              <div className="grid grid-cols-2 gap-2">
                <Slider label={t("เริ่มที่", "Start at")} value={num("scFrom", 0)} min={0} max={99} unit="%" onChange={(n) => onPatchItem({ scFrom: n, ...(n >= num("scTo", 30) ? { scTo: Math.min(100, n + 5) } : null) })} />
                <Slider label={t("เสร็จที่", "Finish at")} value={num("scTo", 30)} min={1} max={100} unit="%" onChange={(n) => onPatchItem({ scTo: Math.max(n, num("scFrom", 0) + 1) })} />
              </div>
            )}
            {str("scIn") === "scrub" && <CanvasScrubPrep item={item} onPatch={onPatchItem} />}
            {str("scIn") === "fill" && <p className="text-[10px] text-slate-500">{t("ขยายจากที่วางไว้จนเต็มจอ · ข้อความที่อยู่ชั้นบนกว่าจะโผล่ทับรูปได้ (จัดชั้นด้านบน)", "Grows from its spot to full screen · text on a higher layer can show on top (set layers above)")}</p>}
            <div>
              <H>{t("ท่าออก", "Exit move")}</H>
              <Chips options={CANVAS_SCENE_OUTS} value={str("scOut")} onPick={(v) => onPatchItem({ scOut: v })} />
            </div>
            {str("scOut") && (
              <div className="grid grid-cols-2 gap-2">
                <Slider label={t("เริ่มออกที่", "Start exit at")} value={num("scOutFrom", 85)} min={0} max={99} unit="%" onChange={(n) => onPatchItem({ scOutFrom: n, ...(n >= num("scOutTo", 100) ? { scOutTo: Math.min(100, n + 5) } : null) })} />
                <Slider label={t("หายหมดที่", "Gone at")} value={num("scOutTo", 100)} min={1} max={100} unit="%" onChange={(n) => onPatchItem({ scOutTo: Math.max(n, num("scOutFrom", 85) + 1) })} />
              </div>
            )}
            <p className="text-[10px] text-slate-500">{t("% = ช่วงของฉาก (0 = เริ่มค้าง · 100 = จบฉาก) · บนผืนที่จัดอยู่ ชิ้นอยู่ท่าสุดท้ายเสมอ (วางตามที่อยากให้จบ)", "% = point in the scene (0 = pin starts · 100 = scene ends) · in the editor, items always show their final pose (place them where they should end)")}</p>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 border-t border-violet-200 pt-2">{t("🎬 อยากได้ท่าแบบเว็บ Apple (ผืนค้างแล้วชิ้นเข้าทีละจังหวะ · สว่างทีละคำ · ขยายเต็มจอ · คลิปเล่นตามการเลื่อน) — เปิด \"ฉากค้าง\" ที่แผงทั้งผืน", "🎬 Want Apple-style moves (pinned canvas, items enter step by step · word-by-word light up · expand to full screen · clip plays with scroll)? Turn on \"Pinned scene\" in the whole-canvas panel")}</p>
        )}
        {/* 🌀 ขยับตามการเลื่อนจอ (เว็บร้าน lib/canvas-scroll) */}
        <div className="border-t border-violet-200 pt-2 space-y-2">
          <div className="flex items-center">
            <span className="flex-1 text-[11px] font-semibold text-violet-800">{t("🌀 ตอนเลื่อนจอ", "🌀 On scroll")}</span>
            <button onClick={() => onScrollPreview?.(!scrollPreview)} className="text-[11px] text-violet-700 hover:underline">
              {scrollPreview ? t("⏸ หยุดลอง", "⏸ Stop test") : t("▶ ลองเลื่อนดู", "▶ Try scrolling")}
            </button>
          </div>
          <div>
            <H>{t("ความเร็วเทียบการเลื่อนหน้าเว็บ", "Speed relative to page scroll")}</H>
            <div className="grid grid-cols-5 gap-1">
              {CANVAS_SFX_SPEED_PRESETS.map((o) => (
                <button key={o.v} type="button" onClick={() => onPatchItem({ sfxSpeed: o.v })} className={`px-1 py-1.5 text-[11px] rounded-md border ${num("sfxSpeed", 0) === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {labelEn(o.l)}
                </button>
              ))}
            </div>
            <Slider label={t("ปรับละเอียด (ลบ = ช้ากว่า · บวก = เร็วกว่า)", "Fine tune (minus = slower · plus = faster)")} value={num("sfxSpeed", 0)} min={-100} max={100} step={5} onChange={(n) => onPatchItem({ sfxSpeed: n })} />
          </div>
          <div>
            <H>{t("จางตามตำแหน่งบนจอ", "Fade by screen position")}</H>
            <Chips options={CANVAS_SFX_FADES} value={str("sfxFade")} onPick={(v) => onPatchItem({ sfxFade: v })} />
          </div>
          <div>
            <H>{t("ซูมตามการเลื่อน", "Zoom on scroll")}</H>
            <Chips options={CANVAS_SFX_ZOOMS} value={str("sfxZoom")} onPick={(v) => onPatchItem({ sfxZoom: v })} />
          </div>
          <Slider label={t("หมุนตามการเลื่อน (ต่อ 1 จอ)", "Rotate on scroll (per screen)")} value={num("sfxRotate", 0)} min={-90} max={90} step={5} unit="°" onChange={(n) => onPatchItem({ sfxRotate: n })} />
          <button className={`${seg(item.sfxPin === true)} w-full`} onClick={() => onPatchItem({ sfxPin: !item.sfxPin })}>
            📌 {item.sfxPin ? t("ค้างอยู่กับที่ระหว่างเลื่อนผืน (กดเพื่อเลิก)", "Pinned while the canvas scrolls (click to undo)") : t("ค้างอยู่กับที่ระหว่างเลื่อนผืน", "Pin while the canvas scrolls")}
          </button>
          <p className="text-[10px] text-slate-500">
            {t("ค้าง = อยู่ที่เดิมบนจอจนเลื่อนพ้นผืน (เหมาะกับหัวข้อตัวใหญ่ด้านหลัง) · มือถือขยับครึ่งเดียวให้เอง · ลูกค้าที่ตั้งเครื่อง \"ลดการเคลื่อนไหว\" จะเห็นนิ่ง", "Pin = stays in place on screen until the canvas scrolls past (good for big background headings) · mobile moves half as much automatically · customers with \"Reduce motion\" see it still")}
          </p>
        </div>
      </div>

      {/* ทุกชนิด */}
      <div>
        <H>{t("กดแล้วไปที่", "Link to")}</H>
        <LinkTargetPicker value={str("href")} onChange={(href) => onPatchItem({ href })} ctx={ctx} />
        {str("href") && (
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" className="accent-blue-600" checked={item.newTab === true} onChange={(e) => onPatchItem({ newTab: e.target.checked })} /> {t("เปิดในแท็บใหม่", "Open in new tab")}
          </label>
        )}
      </div>
      <Slider label={t("ความทึบ", "Opacity")} value={num("opacity", 100)} min={5} max={100} step={5} unit="%" onChange={(n) => onPatchItem({ opacity: n })} />
      <Slider label={t("หมุน", "Rotate")} value={num("rotate", 0)} min={-180} max={180} unit="°" onChange={(n) => onPatchItem({ rotate: n })} />
      <div className="flex flex-wrap gap-1.5">
        <button className={seg(item.hideMobile === true)} onClick={() => onPatchItem({ hideMobile: !item.hideMobile })}>{item.hideMobile ? t("📵 ซ่อนบนมือถือ", "📵 Hidden on mobile") : t("📲 โชว์บนมือถือ", "📲 Shown on mobile")}</button>
        <button className={seg(item.locked === true)} onClick={() => onPatchItem({ locked: !item.locked })}>{item.locked ? t("🔒 ล็อกอยู่", "🔒 Locked") : t("🔓 ไม่ล็อก", "🔓 Unlocked")}</button>
        <button className={seg(false)} onClick={() => onAlign("center")}>{t("↔ กึ่งกลางผืน", "↔ Center on canvas")}</button>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <button onClick={() => setAdvanced((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {advanced ? "▾" : "▸"} {t("ตั้งค่าละเอียด (ตำแหน่งเป๊ะ ๆ · ทุกช่อง)", "Advanced settings (exact position · all fields)")}
        </button>
        {advanced && (
          <div className="mt-3">
            <SchemaForm fields={spec.fields} value={item} onChange={onPatchItem} ctx={ctx} parent={block as unknown as Record<string, unknown>} />
          </div>
        )}
      </div>
    </div>
  );
}
