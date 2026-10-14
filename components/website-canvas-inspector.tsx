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
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import {
  CANVAS_BUTTON_VARIANTS,
  CANVAS_FONTS,
  CANVAS_FRAME_PRESETS,
  CANVAS_LOOPS,
  CANVAS_NO_LINE_FRAMES,
  CANVAS_SHAPES,
  CANVAS_SPEEDS,
  CANVAS_WEIGHTS,
  canvasEntrancesFor,
  canvasFrameMask,
  canvasHoversFor,
  canvasMobileBox,
  canvasStagger,
} from "@/lib/website-canvas";
import { GRAD_DIRS, GRADIENT_PRESETS, type GradThemeHex } from "@/lib/website-gradient";
import { GradientPicker } from "@/components/website-gradient-picker";
import { CanvasBgPositioner } from "@/components/website-canvas-bg-position";
import type { Block, ChildBlock } from "@/components/website-block-editor";

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

/** สีของธีมร้าน (จาก API สาธารณะ) — ใช้วาดจุดสี */
export type ThemeColors = { brand: string; brandDeep: string; ink: string; muted: string; page: string; surface: string };

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

const H = ({ children }: { children: ReactNode }) => <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{children}</p>;
const SCALLOP_MASK = "radial-gradient(circle closest-side, #000 97%, transparent) 0 0 / 10px 10px round, linear-gradient(#000 0 0) center / calc(100% - 10px) calc(100% - 10px) no-repeat";

/** สีธีม (hex) → ชุดสีของตัวเลือกสีไล่ */
export function gradThemeOf(t: ThemeColors): GradThemeHex {
  return { ink: t.ink, brand: t.brand, brandDeep: t.brandDeep, brandSoft: softOf(t.brand), muted: t.muted, page: t.page, surface: t.surface, white: "#ffffff" };
}

/** ตัวเลือกแบบปุ่มหลายช่อง (การเคลื่อนไหว) */
function Chips({ options, value, onPick }: { options: { v: string; l: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map((o) => (
        <button key={o.v || "none"} type="button" onClick={() => onPick(o.v)} className={`px-1.5 py-1.5 text-[11px] rounded-md border ${value === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
const seg = (on: boolean) => `flex-1 px-2 py-1.5 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;

function Swatches({ theme, value, hex, onPick, allowNone }: { theme: ThemeColors; value: string; hex: string; onPick: (v: string, hex?: string) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button title="ไม่มี" onClick={() => onPick("none")} className={`w-7 h-7 rounded-full border text-[10px] text-slate-400 ${value === "none" ? "ring-2 ring-blue-500 ring-offset-1" : "border-slate-300"}`}>
          ∅
        </button>
      )}
      {swatchesOf(theme).map((s) => (
        <button key={s.v} title={s.label} onClick={() => onPick(s.v)} className={`w-7 h-7 rounded-full border border-black/10 ${value === s.v ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: s.hex }} />
      ))}
      <label title="สีเอง" className={`relative w-7 h-7 rounded-full border border-black/10 overflow-hidden cursor-pointer ${value === "custom" ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: value === "custom" && hex ? hex : "conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6,#f87171)" }}>
        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={hex || "#d4537e"} onChange={(e) => onPick("custom", e.target.value)} />
      </label>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <H>{label}</H>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" className="w-full accent-blue-600" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
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
}: {
  block: Block;
  item: ChildBlock | null;
  /** เล่น "โผล่ตอนเลื่อนมาเจอ" ในพรีวิว (ไม่ระบุ = ทั้งผืน) */
  onReplay?: (ids?: string[]) => void;
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
}) {
  const [advanced, setAdvanced] = useState(false);
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
            เลือก {multi.length} ชิ้น {grouped && <span className="text-[11px] font-normal text-blue-700">· ⛓ กลุ่มเดียวกัน</span>}
          </p>
          <p className="text-[11px] text-slate-500">Shift/Ctrl+คลิก = เพิ่ม/เอาออก · ลากที่ว่างบนผืนเป็นกรอบ = เลือกหลายชิ้น · ลากชิ้นใดก็ได้ = ย้ายทั้งชุด</p>
        </div>
        <button onClick={() => onMulti?.(grouped ? "ungroup" : "group")} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
          {grouped ? "✂ แยกกลุ่ม" : "⛓ จับกลุ่ม (คลิกทีเดียวได้ทั้งชุด)"}
        </button>
        <button onClick={() => onMulti?.("stagger")} className="w-full rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-700 hover:bg-violet-100">
          ✨ ให้โผล่ทีละชิ้นตามลำดับ (บน→ล่าง)
        </button>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
          <H>จัดชิดกัน (เทียบกรอบรวม)</H>
          <div className="grid grid-cols-2 gap-1.5 -mt-1">
            <button className={arr} onClick={() => onAlign("top")}>⤒ ชิดบน</button>
            <button className={arr} onClick={() => onAlign("left")}>⇤ ชิดซ้าย</button>
            <button className={arr} onClick={() => onAlign("middle")}>⇕ กลางแนวตั้ง</button>
            <button className={arr} onClick={() => onAlign("center")}>⇔ กลางแนวนอน</button>
            <button className={arr} onClick={() => onAlign("bottom")}>⤓ ชิดล่าง</button>
            <button className={arr} onClick={() => onAlign("right")}>⇥ ชิดขวา</button>
          </div>
          {multi.length >= 3 && (
            <>
              <H>กระจายระยะห่างเท่ากัน</H>
              <div className="grid grid-cols-2 gap-1.5 -mt-1">
                <button className={arr} onClick={() => onAlign("distribute-h")}>↔ แนวนอน</button>
                <button className={arr} onClick={() => onAlign("distribute-v")}>↕ แนวตั้ง</button>
              </div>
            </>
          )}
          <H>ชั้น</H>
          <div className="grid grid-cols-2 gap-1.5 -mt-1">
            <button className={arr} onClick={() => onMulti?.("front")}>⤒ หน้าสุด</button>
            <button className={arr} onClick={() => onMulti?.("back")}>⤓ หลังสุด</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={seg(allHidden)} onClick={() => onMulti?.(allHidden ? "showMobile" : "hideMobile")}>{allHidden ? "📵 ซ่อนบนมือถือ" : "📲 โชว์บนมือถือ"}</button>
          <button className={seg(allLocked)} onClick={() => onMulti?.(allLocked ? "unlock" : "lock")}>{allLocked ? "🔒 ล็อกอยู่" : "🔓 ไม่ล็อก"}</button>
        </div>
        <div className="flex gap-1.5">
          <button className={seg(false)} onClick={() => onMulti?.("duplicate")}>⧉ ทำสำเนาทั้งหมด</button>
          <button className="flex-1 px-2 py-1.5 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50" onClick={() => onMulti?.("delete")}>🗑 ลบ {multi.length} ชิ้น</button>
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
        <p className="text-sm font-semibold text-slate-800">ทั้งผืน</p>
        <p className="text-[11px] text-slate-500 -mt-2">คลิกชิ้นบนผืนเพื่อแก้ทีละชิ้น · คลิกที่ว่างเพื่อกลับมาตรงนี้</p>
        <Slider label="ความสูงผืน" value={Number(block.height) || 560} min={120} max={1600} step={10} onChange={(n) => onPatchBlock({ height: n })} />
        <div>
          <H>สีพื้นผืน (เต็มความกว้างจอ)</H>
          <div className="flex flex-wrap gap-1.5">
            {[
              { v: "auto", l: "ตามหน้า", hex: theme.page },
              { v: "page", l: "พื้นเว็บ", hex: theme.page },
              { v: "surface", l: "พื้นการ์ด", hex: theme.surface },
              { v: "brand", l: "แบรนด์", hex: theme.brand },
              { v: "ink", l: "เข้ม", hex: theme.ink },
            ].map((o) => (
              <button key={o.v} title={o.l} onClick={() => onPatchBlock({ style: { ...style, bg: o.v } })} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${bg === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: o.hex }} />
                {o.l}
              </button>
            ))}
            <label className={`relative flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] cursor-pointer ${bg === "custom" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: bg === "custom" ? String(style.bgColor || "#fff") : "conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6,#f87171)" }} />
              สีเอง
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={String(style.bgColor || "#ffffff")} onChange={(e) => onPatchBlock({ style: { ...style, bg: "custom", bgColor: e.target.value } })} />
            </label>
            <button
              title="ไล่สี"
              onClick={() => onPatchBlock({ style: { ...style, bg: "gradient", bgGrad: style.bgGrad ?? GRADIENT_PRESETS[0].g } })}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${bg === "gradient" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}
            >
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: `linear-gradient(180deg, ${softOf(theme.brand)}, ${theme.brand})` }} />
              ไล่สี
            </button>
          </div>
          {bg === "gradient" && (
            <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
              <GradientPicker value={(style.bgGrad as never) ?? null} theme={gradThemeOf(theme)} onChange={(g) => onPatchBlock({ style: { ...style, bg: "gradient", bgGrad: g } })} />
            </div>
          )}
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-2.5 space-y-2">
          <H>✨ การเคลื่อนไหวทั้งผืน</H>
          <button
            onClick={() => {
              onPatchBlock({ items: canvasStagger(items) });
              window.setTimeout(() => onReplay?.(), 250);
            }}
            className="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100"
          >
            ✨ ให้ทุกชิ้นโผล่ทีละชิ้น (บน→ล่าง)
          </button>
          <div className="flex gap-1.5">
            <button className={seg(false)} onClick={() => onReplay?.()}>▶ ดูตัวอย่าง</button>
            <button className={seg(false)} disabled={!items.some((x) => x.anim || x.loop || x.hover)} onClick={() => onPatchBlock({ items: items.map((x) => ({ ...x, anim: "", animDelay: 0, loop: "", hover: "" })) })}>
              ล้างทั้งหมด
            </button>
          </div>
          <p className="text-[10px] text-slate-500">ตั้งทีละชิ้นได้ที่ &quot;✨ เคลื่อนไหว&quot; บนแถบลอย หรือแผงนี้ตอนเลือกชิ้น</p>
        </div>
        <div>
          <H>รูปพื้นหลังผืน</H>
          <div className="flex items-center gap-2">
            {block.bgImageKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/r2-image?key=${encodeURIComponent(String(block.bgImageKey))}&w=200`} alt="" className="w-16 h-10 rounded object-cover border border-slate-200" />
            ) : (
              <span className="w-16 h-10 rounded border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-center">ไม่มี</span>
            )}
            <button onClick={onPickBgImage} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs hover:border-blue-500">{block.bgImageKey ? "เปลี่ยนรูป" : "เลือกรูป"}</button>
            {Boolean(block.bgImageKey) && (
              <button onClick={() => onPatchBlock({ bgImageKey: null })} className="text-xs text-red-600 hover:underline">
                เอาออก
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
          <H>📲 มือถือ</H>
          <div className="flex gap-1.5 -mt-1">
            <button className={seg(!custom)} onClick={() => mobile?.onAuto()}>เรียงอัตโนมัติ</button>
            <button className={seg(custom)} onClick={() => (custom ? undefined : hasSaved ? mobile?.onUseSaved() : mobile?.onFreeze())}>
              ✋ จัดเอง
            </button>
          </div>
          {custom ? (
            <>
              <p className="text-[11px] text-slate-500">ผืนมือถือแยกจากคอม — {mobile?.device === "mobile" ? "ลาก/ย่อ/หมุนบนผืนได้เลย ไม่กระทบหน้าคอม" : "กด 📲 มือถือ ด้านบนเพื่อจัด"}</p>
              <Slider label="ความสูงผืนมือถือ" value={Number(block.mobileHeight) || 800} min={120} max={3000} step={10} onChange={(n) => onPatchBlock({ mobileHeight: n })} />
              <button onClick={() => mobile?.onFreeze()} className="text-[11px] text-slate-500 hover:text-blue-600">
                ↺ เริ่มจัดใหม่จากแบบเรียงอัตโนมัติ
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">เรียงชิ้นลงมาตามตำแหน่ง บน→ล่าง · กด &quot;จัดเอง&quot; = ใช้ที่เรียงไว้ตอนนี้เป็นจุดเริ่ม แล้วลากต่อเองได้</p>
              <div className="flex gap-1.5">
                <button className={seg(block.mobileAlign !== "left")} onClick={() => onPatchBlock({ mobileAlign: "center" })}>จัดกึ่งกลาง</button>
                <button className={seg(block.mobileAlign === "left")} onClick={() => onPatchBlock({ mobileAlign: "left" })}>ชิดซ้าย</button>
              </div>
              {hasSaved && (
                <button onClick={() => mobile?.onFreeze()} className="text-[11px] text-slate-500 hover:text-blue-600">
                  ✋ จัดเองใหม่จากแบบเรียงอัตโนมัติ (ทิ้งที่เคยจัด)
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
  const colorPick = (key: string, hexKey: string) => (v: string, hex?: string) => onPatchItem(hex ? { [key]: v, [hexKey]: hex } : { [key]: v });

  const mb = canvasMobileBox(item);
  // สีไล่ (ข้อความ/ของตกแต่ง): สีแรก = ช่องสีด้านบน · ที่นี่เลือกทิศ + สีปลาย
  const chip = (on: boolean) => `px-2 py-1 text-[11px] rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
  const gradRow = (
    <div>
      <H>ไล่สี</H>
      <div className="flex flex-wrap gap-1">
        <button className={chip(!str("grad"))} onClick={() => onPatchItem({ grad: "" })}>
          สีเดียว
        </button>
        {GRAD_DIRS.map((d) => (
          <button key={d.v} className={chip(str("grad") === d.v)} onClick={() => onPatchItem({ grad: d.v })}>
            {d.l}
          </button>
        ))}
      </div>
      {str("grad") && (
        <div className="mt-2">
          <H>สีปลาย</H>
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
            <p className="text-[11px] font-semibold text-violet-800">📲 กำลังจัดหน้ามือถือ — ลาก/ย่อบนผืนได้เลย ไม่กระทบหน้าคอม</p>
            {(kind === "text" || kind === "button") && (
              <Slider label="ขนาดตัวอักษร (มือถือ)" value={mb.msize} min={8} max={kind === "button" ? 32 : 96} onChange={(n) => onPatchItem({ ...mb, msize: n })} />
            )}
            {kind === "text" && (
              <div>
                <H>จัดข้อความ (มือถือ)</H>
                <div className="flex gap-1">
                  {(
                    [
                      ["", "เหมือนคอม"],
                      ["left", "ซ้าย"],
                      ["center", "กลาง"],
                      ["right", "ขวา"],
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
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">มือถือเรียงชิ้นให้อัตโนมัติอยู่ — อยากวางเองบนมือถือ กด &quot;← ทั้งผืน&quot; แล้วเลือก ✋ จัดเอง</p>
        ))}

      {Boolean(item.group) && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1.5">
          <span className="flex-1 text-[11px] text-blue-800">⛓ อยู่ในกลุ่ม — คลิกบนผืน = เลือกทั้งกลุ่ม · คลิกซ้ำ = ชิ้นเดียว</span>
          <button onClick={() => onPatchItem({ group: "" })} className="text-[11px] text-blue-700 hover:underline">
            เอาออกจากกลุ่ม
          </button>
        </div>
      )}

      {/* จัดวาง (Arrange) — ชั้น + จัดชิดผืน */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
        <H>ชั้น</H>
        <div className="grid grid-cols-2 gap-1.5 -mt-1">
          <button className={arr} onClick={() => onLayer("up")}>↑ ขึ้นหน้า 1 ชั้น</button>
          <button className={arr} onClick={() => onLayer("down")}>↓ ถอยหลัง 1 ชั้น</button>
          <button className={arr} onClick={() => onLayer("front")}>⤒ หน้าสุด</button>
          <button className={arr} onClick={() => onLayer("back")}>⤓ หลังสุด</button>
        </div>
        <H>จัดชิดผืน</H>
        <div className="grid grid-cols-2 gap-1.5 -mt-1">
          <button className={arr} onClick={() => onAlign("top")}>⤒ ชิดบน</button>
          <button className={arr} onClick={() => onAlign("left")}>⇤ ชิดซ้าย</button>
          <button className={arr} onClick={() => onAlign("middle")}>⇕ กลางแนวตั้ง</button>
          <button className={arr} onClick={() => onAlign("center")}>⇔ กลางแนวนอน</button>
          <button className={arr} onClick={() => onAlign("bottom")}>⤓ ชิดล่าง</button>
          <button className={arr} onClick={() => onAlign("right")}>⇥ ชิดขวา</button>
        </div>
      </div>

      {(kind === "image" || kind === "shape") && (
        <div>
          <H>พลิก</H>
          <div className="flex gap-1.5">
            <button className={seg(item.flipH === true)} onClick={() => onPatchItem({ flipH: !item.flipH })}>⇋ ซ้าย-ขวา</button>
            <button className={seg(item.flipV === true)} onClick={() => onPatchItem({ flipV: !item.flipV })}>⇅ บน-ล่าง</button>
          </div>
          <button className={`${seg(item.bleed === true)} mt-1.5 w-full`} onClick={() => onPatchItem({ bleed: !item.bleed })}>
            ⟷ {item.bleed ? "ยืดเต็มความกว้างจออยู่ (กดเพื่อเลิก)" : "ยืดเต็มความกว้างจอ"}
          </button>
          {item.bleed === true && <p className="text-[10px] text-slate-400 mt-1">กว้างซ้ายสุด–ขวาสุดของจอทุกขนาด · ลากได้แค่ขึ้น-ลง · ปรับสูงด้วยจุดจับบน/ล่าง</p>}
        </div>
      )}

      {kind === "image" && Boolean(item.imageKey) && (
        <div>
          <div className="flex items-center justify-between">
            <H>ครอป (ซูม/เลื่อนรูปในกรอบ)</H>
            <button onClick={onCrop} className="text-[11px] text-blue-600 hover:underline">✂️ ลากบนผืน</button>
          </div>
          <Slider label="ซูม" value={num("cropZoom", 100)} min={100} max={400} step={5} unit="%" onChange={(n) => onPatchItem({ cropZoom: n })} />
          <div className="grid grid-cols-2 gap-2">
            <Slider label="ซ้าย ↔ ขวา" value={num("cropX", 50)} min={0} max={100} unit="%" onChange={(n) => onPatchItem({ cropX: n })} />
            <Slider label="บน ↕ ล่าง" value={num("cropY", 50)} min={0} max={100} unit="%" onChange={(n) => onPatchItem({ cropY: n })} />
          </div>
          {(num("cropZoom", 100) !== 100 || num("cropX", 50) !== 50 || num("cropY", 50) !== 50) && (
            <button onClick={() => onPatchItem({ cropZoom: 100, cropX: 50, cropY: 50 })} className="text-[11px] text-slate-500 hover:text-blue-600">↺ รีเซ็ตครอป</button>
          )}
          <p className="text-[10px] text-slate-400 mt-1">ตัดขอบรูป = ลากจุดจับที่มุม/ขอบของกรอบ · ซูม/เลื่อน = ตรงนี้ หรือกด &quot;ลากบนผืน&quot;</p>
        </div>
      )}

      {kind === "image" && (
        <>
          <div className="flex items-center gap-3">
            {item.imageKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/r2-image?key=${encodeURIComponent(str("imageKey"))}&w=200`} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
            ) : (
              <span className="w-16 h-16 rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-center">ยังไม่มีรูป</span>
            )}
            <button onClick={onReplaceImage} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:border-blue-500">🖼 เปลี่ยนรูป</button>
          </div>
          <div>
            <H>กรอบรูป</H>
            <div className="grid grid-cols-3 gap-1.5">
              {CANVAS_FRAME_PRESETS.map((p) => {
                const exact = CANVAS_FRAME_PRESETS.find((q) => q.patch.frame === item.frame && q.patch.border === item.border);
                const on = exact ? exact.key === p.key : p.patch.frame === item.frame && CANVAS_FRAME_PRESETS.find((q) => q.patch.frame === item.frame)?.key === p.key;
                return (
                  <button key={p.key} onClick={() => onPatchItem(p.patch)} className={`flex flex-col items-center gap-1 rounded-lg border py-2 ${on ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
                    <span style={framePreview(p.key)} />
                    <span className="text-[10px] text-slate-600">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {!CANVAS_NO_LINE_FRAMES.includes(str("frame")) && (
            <div>
              <H>เส้นรอบกรอบ</H>
              <div className="flex gap-1">
                {(
                  [
                    ["none", "ไม่มี"],
                    ["line", "เส้น"],
                    ["dotted", "จุด"],
                    ["double", "เส้นคู่"],
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
              <span className="flex-1 text-[11px] font-semibold text-slate-500">กรอบจากรูปของร้าน (PNG วางทับรูป)</span>
              <button onClick={() => onPickFrame?.()} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:border-blue-500">
                {item.overlayKey ? "เปลี่ยน…" : "เลือก/อัปโหลด…"}
              </button>
            </div>
            {Boolean(item.overlayKey) && (
              <>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/r2-image?key=${encodeURIComponent(str("overlayKey"))}&w=200`} alt="" className="w-12 h-12 rounded object-contain border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:12px_12px]" />
                  <button onClick={() => onPatchItem({ overlayKey: null })} className="text-[11px] text-red-600 hover:underline">
                    เอากรอบรูปออก
                  </button>
                </div>
                <Slider label="รูปห่างขอบกรอบ" value={num("overlayInset", 12)} min={0} max={40} unit="%" onChange={(n) => onPatchItem({ overlayInset: n })} />
              </>
            )}
          </div>
          {str("border") && str("border") !== "none" && !CANVAS_NO_LINE_FRAMES.includes(str("frame")) && (
            <>
              <div>
                <H>สีเส้นกรอบ</H>
                <Swatches theme={theme} value={str("borderColor")} hex={str("borderHex")} onPick={colorPick("borderColor", "borderHex")} />
              </div>
              <Slider label="ความหนาเส้น" value={num("borderWidth", 2)} min={1} max={16} onChange={(n) => onPatchItem({ borderWidth: n })} />
              <Slider label="ระยะห่างกรอบกับรูป" value={num("borderGap", 12)} min={0} max={60} onChange={(n) => onPatchItem({ borderGap: n })} />
            </>
          )}
          <div>
            <H>การจัดรูปในกรอบ</H>
            <div className="flex gap-1.5">
              <button className={seg(str("fit") !== "contain")} onClick={() => onPatchItem({ fit: "cover" })}>เต็มกรอบ</button>
              <button className={seg(str("fit") === "contain")} onClick={() => onPatchItem({ fit: "contain" })}>ทั้งรูป</button>
            </div>
          </div>
          <div>
            <H>คำบรรยายรูป (มีผลกับ Google)</H>
            <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={str("alt")} maxLength={200} placeholder="เช่น กระเป๋าสีชมพูพาสเทล" onChange={(e) => onPatchItem({ alt: e.target.value })} />
          </div>
        </>
      )}

      {kind === "text" && (
        <>
          <div>
            <H>ข้อความ (ดับเบิลคลิกบนผืนเพื่อพิมพ์ตรงนั้นก็ได้)</H>
            <textarea className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" rows={3} value={str("text")} maxLength={2000} onChange={(e) => onPatchItem({ text: e.target.value })} />
          </div>
          <Slider label="ขนาดตัวอักษร" value={num("size", 40)} min={8} max={160} onChange={(n) => onPatchItem({ size: n })} />
          <div>
            <H>สีตัวอักษร</H>
            <Swatches theme={theme} value={str("color")} hex={str("colorHex")} onPick={colorPick("color", "colorHex")} />
          </div>
          {gradRow}
          <div>
            <H>จัดข้อความ</H>
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => (
                <button key={a} className={seg(str("align") === a)} onClick={() => onPatchItem({ align: a })}>
                  {a === "left" ? "ชิดซ้าย" : a === "center" ? "กลาง" : "ชิดขวา"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button className={seg(item.italic === true)} onClick={() => onPatchItem({ italic: !item.italic })}><i>เอียง</i></button>
            <button className={seg(item.uppercase === true)} onClick={() => onPatchItem({ uppercase: !item.uppercase })}>ABC ตัวใหญ่</button>
          </div>
          <div>
            <H>แถบพื้นหลังข้อความ</H>
            <Swatches theme={theme} value={str("bg") || "none"} hex={str("bgHex")} onPick={colorPick("bg", "bgHex")} allowNone />
          </div>
        </>
      )}

      {kind === "button" && (
        <>
          <div>
            <H>ข้อความบนปุ่ม</H>
            <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={str("label")} maxLength={60} onChange={(e) => onPatchItem({ label: e.target.value })} />
          </div>
          <div>
            <H>แบบปุ่ม</H>
            <div className="grid grid-cols-2 gap-1.5">
              {CANVAS_BUTTON_VARIANTS.map((v) => (
                <button key={v.v} className={seg(str("variant") === v.v)} onClick={() => onPatchItem({ variant: v.v })}>
                  {v.l}
                </button>
              ))}
            </div>
          </div>
          {str("variant") !== "brand" && (
            <div>
              <H>สีปุ่ม/ตัวอักษร</H>
              <Swatches theme={theme} value={str("color")} hex={str("colorHex")} onPick={colorPick("color", "colorHex")} />
            </div>
          )}
          <Slider label="ขนาดตัวอักษร" value={num("size", 16)} min={10} max={40} onChange={(n) => onPatchItem({ size: n })} />
        </>
      )}

      {(kind === "text" || kind === "button") && (
        <>
          <div>
            <H>ฟอนต์</H>
            <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1">
              {CANVAS_FONTS.map((f) => {
                const family = f.v === "display" ? fontNames.display : f.v === "body" ? fontNames.body : f.v;
                return (
                  <button key={f.v} onClick={() => onPatchItem({ font: f.v })} className={`flex items-baseline justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left ${str("font") === f.v ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
                    <span className="text-[17px] text-slate-800 truncate" style={{ fontFamily: `"${family}", sans-serif` }}>
                      {kind === "button" ? str("label") || "ปุ่ม" : "Aa ก ข ค"}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{f.v === "display" || f.v === "body" ? `${f.l.replace("ฟอนต์", "")} (${family})` : f.v}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <H>ความหนา</H>
            <div className="flex gap-1">
              {CANVAS_WEIGHTS.map((w) => (
                <button key={w.v} className={seg(str("weight") === w.v)} style={{ fontWeight: Number(w.v) }} onClick={() => onPatchItem({ weight: w.v })}>
                  {w.l}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {kind === "shape" && (
        <>
          <div>
            <H>ลาย</H>
            <div className="grid grid-cols-4 gap-1.5">
              {CANVAS_SHAPES.map((o) => (
                <button key={o.v} title={o.l} onClick={() => onPatchItem({ shape: o.v })} className={`h-12 rounded-lg border p-1.5 ${str("shape") === o.v ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
                  <CanvasShape it={{ shape: o.v, w: 60, h: 40, outline: o.v === "rect" || o.v === "ellipse" || o.v === "arch", strokeWidth: 2 }} color={theme.brand} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <H>สี</H>
            <Swatches theme={theme} value={str("color")} hex={str("colorHex")} onPick={colorPick("color", "colorHex")} />
          </div>
          {gradRow}
          <div className="flex gap-1.5">
            <button className={seg(item.outline !== true)} onClick={() => onPatchItem({ outline: false })}>ทึบ</button>
            <button className={seg(item.outline === true)} onClick={() => onPatchItem({ outline: true })}>เส้น</button>
          </div>
          {(item.outline === true || ["line", "wave", "lace"].includes(str("shape"))) && (
            <Slider label="ความหนาเส้น" value={num("strokeWidth", 2)} min={1} max={16} onChange={(n) => onPatchItem({ strokeWidth: n })} />
          )}
        </>
      )}

      {/* การเคลื่อนไหว (ทุกชนิด) */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
        <div className="flex items-center">
          <span className="flex-1 text-[11px] font-semibold text-violet-800">✨ เคลื่อนไหว</span>
          {str("anim") && (
            <button onClick={() => onReplay?.([item.id])} className="text-[11px] text-violet-700 hover:underline">
              ▶ ดูอีกครั้ง
            </button>
          )}
        </div>
        <div>
          <H>โผล่ตอนเลื่อนมาเจอ</H>
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
            <Slider label="หน่วงเวลาก่อนโผล่" value={Math.round(num("animDelay", 0) / 100) / 10} min={0} max={3} step={0.1} unit=" วิ" onChange={(n) => onPatchItem({ animDelay: Math.round(n * 1000) })} />
            <div className="flex gap-1">
              {CANVAS_SPEEDS.map((o) => (
                <button key={o.v} className={seg((str("animSpeed") || "normal") === o.v)} onClick={() => onPatchItem({ animSpeed: o.v })}>
                  {o.l}
                </button>
              ))}
            </div>
          </>
        )}
        <div>
          <H>ขยับตลอดเวลา</H>
          <Chips options={CANVAS_LOOPS.filter((o) => o.v !== "shine" || kind === "image" || kind === "button")} value={str("loop")} onPick={(v) => onPatchItem({ loop: v })} />
        </div>
        {str("loop") && (
          <div className="flex gap-1">
            {CANVAS_SPEEDS.map((o) => (
              <button key={o.v} className={seg((str("loopSpeed") || "normal") === o.v)} onClick={() => onPatchItem({ loopSpeed: o.v })}>
                {o.l}
              </button>
            ))}
          </div>
        )}
        <div>
          <H>ตอนเอาเมาส์ชี้ (คอม · ลองชี้ที่ชิ้นบนผืนได้เลย)</H>
          <Chips options={canvasHoversFor(kind)} value={str("hover")} onPick={(v) => onPatchItem({ hover: v })} />
        </div>
        {str("anim") === "type" && <p className="text-[10px] text-violet-700">พิมพ์ทีละตัว: ความเร็ว = เร็ว/ปกติ/ช้า ด้านบน · ข้อความยาวเกิน 400 ตัวจะใช้ &quot;ค่อย ๆ ขึ้นมา&quot; แทน</p>}
      </div>

      {/* ทุกชนิด */}
      <div>
        <H>กดแล้วไปที่</H>
        <LinkTargetPicker value={str("href")} onChange={(href) => onPatchItem({ href })} ctx={ctx} />
        {str("href") && (
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" className="accent-blue-600" checked={item.newTab === true} onChange={(e) => onPatchItem({ newTab: e.target.checked })} /> เปิดในแท็บใหม่
          </label>
        )}
      </div>
      <Slider label="ความทึบ" value={num("opacity", 100)} min={5} max={100} step={5} unit="%" onChange={(n) => onPatchItem({ opacity: n })} />
      <Slider label="หมุน" value={num("rotate", 0)} min={-180} max={180} unit="°" onChange={(n) => onPatchItem({ rotate: n })} />
      <div className="flex flex-wrap gap-1.5">
        <button className={seg(item.hideMobile === true)} onClick={() => onPatchItem({ hideMobile: !item.hideMobile })}>{item.hideMobile ? "📵 ซ่อนบนมือถือ" : "📲 โชว์บนมือถือ"}</button>
        <button className={seg(item.locked === true)} onClick={() => onPatchItem({ locked: !item.locked })}>{item.locked ? "🔒 ล็อกอยู่" : "🔓 ไม่ล็อก"}</button>
        <button className={seg(false)} onClick={() => onAlign("center")}>↔ กึ่งกลางผืน</button>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <button onClick={() => setAdvanced((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {advanced ? "▾" : "▸"} ตั้งค่าละเอียด (ตำแหน่งเป๊ะ ๆ · ทุกช่อง)
        </button>
        {advanced && (
          <div className="mt-3">
            <SchemaForm fields={spec.fields} value={item} onChange={onPatchItem} ctx={ctx} />
          </div>
        )}
      </div>
    </div>
  );
}
