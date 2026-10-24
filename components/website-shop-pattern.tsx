"use client";

/**
 * 🎨 ลายของร้าน (ของตกแต่งจาก SVG ที่ร้านอัป · เปลี่ยนสีได้) — ของกลาง ใช้ร่วม: ผืนผ้าใบ (แผงขวา) + ของตกแต่ง Section
 *
 * patternInsert   : ค่าเริ่มของชิ้นที่วางใหม่ (สีเดิมของไฟล์ · ความหนาเส้นตามไฟล์)
 * ShopPatternBox  : วาดลายตามค่าที่ตั้ง (รายการ / ตัวอย่างในแผง)
 * ShopPatternControls : แผงตั้งค่า — สีเดิมของไฟล์ · สีเดียวทั้งลาย (สีพื้น/สีเส้น/ความหนา) · แยกตามสีในไฟล์
 * FillLineControls : สีพื้น + สีเส้น + ความหนาเส้น — ใช้ร่วม: ลายในตัว (ผืนผ้าใบ/Section) + ลายของร้านโหมดสีเดียว (lib/website-canvas fillLineView/fillLinePick)
 * ข้อมูลที่ชิ้น: pattern · patMode · color/colorHex (สีพื้น) · outline (ไม่เติมพื้น) · lineColor/lineColorHex · strokeWidth · patSlots
 * เว็บร้านวาดด้วย ShopPatternArt (src/components/home/CanvasShapes.tsx) + ตัวคำนวณสีเดียวกัน (lib/frames ↔ ERP lib/website-frames)
 */
import type { ReactNode } from "react";
import { Seg } from "@/components/website-block-editor";
import { RangeInput } from "@/components/range-input";
import { ShopPatternArt } from "@/components/website-canvas-shapes";
import { ColorSwatches, swatchesOf, type ThemeColors } from "@/components/website-text-pickers";
import { PATTERN_MODE_OPTIONS } from "@/lib/website-schema";
import { fillLinePick, fillLineView } from "@/lib/website-canvas";
import {
  normalizePatternSlots,
  normalizeShopPattern,
  shopPatternColors,
  shopPatternLineWidth,
  shopPatternLookOf,
  SHOP_PATTERN_LIMITS,
  type ShopPattern,
  type ShopPatternMode,
} from "@/lib/website-frames";

/** ช่องของชิ้นที่แผงนี้อ่าน/แก้ (ผืนผ้าใบ = ชิ้นในผืน · Section = DecorItem) */
export interface PatternFields {
  pattern?: unknown;
  patMode?: unknown;
  color?: unknown;
  colorHex?: unknown;
  outline?: unknown;
  lineColor?: unknown;
  lineColorHex?: unknown;
  strokeWidth?: unknown;
  patSlots?: unknown;
}

/** สีธีม/สีเอง → สีจริง (ตัวอย่างใน ERP · "auto" = สีแบรนด์) */
export const patternColorOf = (theme: ThemeColors) => (c: string, hex: string) => (c === "custom" ? hex || theme.brand : swatchesOf(theme).find((s) => s.v === c)?.hex ?? theme.brand);

/** ค่าของชิ้นที่วางใหม่ — สีเดิมของไฟล์ · ความหนาเส้นเริ่ม = ตามไฟล์ (boxW = ความกว้างชิ้นในหน่วยของชิ้น) */
export function patternInsert(pattern: ShopPattern, boxW: number, minW = 1) {
  const line = shopPatternLineWidth(pattern) * (boxW / pattern.vb[2]);
  const sw = line > 0 ? Math.max(minW, Math.min(24, Math.round(line / minW) * minW)) : 2;
  return { pattern, patMode: "orig" as ShopPatternMode, color: "brand", colorHex: "", outline: false, lineColor: "none", lineColorHex: "", strokeWidth: sw, patSlots: [] as string[] };
}

/** วาดลายตามค่าที่ตั้ง — w/h = ขนาดกล่องในหน่วยของชิ้น (ความหนาเส้นคิดจากหน่วยนี้) */
export function ShopPatternBox({ it, theme, w, h }: { it: PatternFields; theme: ThemeColors; w: number; h: number }) {
  const pattern = normalizeShopPattern(it.pattern);
  if (!pattern) return null;
  const unit = Math.min(w / pattern.vb[2], h / pattern.vb[3]) || 1;
  return <ShopPatternArt pattern={pattern} look={shopPatternLookOf(it, patternColorOf(theme), unit)} />;
}

const H = ({ children }: { children: ReactNode }) => <p className="text-[11px] font-semibold text-slate-600 mb-1">{children}</p>;

/**
 * 🎨 สีพื้น + สีเส้น + ความหนาเส้น (ของกลาง) — ∅ สีพื้น = ไม่เติมพื้น · ∅ สีเส้น = ไม่มีเส้น
 *   ไม่ปล่อยให้ชิ้นหาย: พื้น ∅ ตอนไม่มีเส้น = ย้ายสีไปเป็นเส้น · เส้น ∅ ตอนไม่มีพื้น = กลับเป็นทึบ
 *   forceWidth = มีส่วนที่เป็นเส้นอยู่แล้ว (เช่น ลายของร้านที่มีชิ้นเส้นล้วน) โชว์ความหนาเสมอ
 */
export function FillLineControls({
  it,
  theme,
  onPatch,
  minWidth = 1,
  widthStep = 1,
  forceWidth = false,
}: {
  it: PatternFields;
  theme: ThemeColors;
  onPatch: (p: Record<string, unknown>) => void;
  minWidth?: number;
  widthStep?: number;
  forceWidth?: boolean;
}) {
  const v = fillLineView(it);
  const sw = Number(it.strokeWidth) > 0 ? Number(it.strokeWidth) : 2;
  return (
    <>
      <div>
        <H>สีพื้น</H>
        <ColorSwatches theme={theme} allowNone value={v.fill} hex={v.fillHex} onPick={(c, hex) => onPatch(fillLinePick(it, "fill", c, hex))} />
      </div>
      <div>
        <H>สีเส้น</H>
        <ColorSwatches theme={theme} allowNone value={v.line} hex={v.lineHex} onPick={(c, hex) => onPatch(fillLinePick(it, "line", c, hex))} />
      </div>
      {(forceWidth || v.line !== "none") && (
        <div>
          <H>ความหนาเส้น</H>
          <RangeInput value={sw} min={minWidth} max={24} step={widthStep} unit="px" onChange={(n) => onPatch({ strokeWidth: n })} />
        </div>
      )}
    </>
  );
}

/** ค่าสีของช่อง (สีธีม / #rrggbb) → ค่าของปุ่มสี */
const swatchVal = (s: string) => (!s ? "" : s.startsWith("#") ? "custom" : s);

export function ShopPatternControls({
  it,
  theme,
  onPatch,
  boxW,
  boxH,
  minWidth = 1,
  widthStep = 1,
}: {
  it: PatternFields;
  theme: ThemeColors;
  onPatch: (p: Record<string, unknown>) => void;
  /** ขนาดชิ้นในหน่วยของชิ้น (ตัวอย่างในแผงหนาเท่าของจริง) */
  boxW: number;
  boxH: number;
  /** ความหนาเส้นต่ำสุด / ทีละ (ผืนผ้าใบ = ทีละ 1 · Section = ทีละ 0.5) */
  minWidth?: number;
  widthStep?: number;
}) {
  const pattern = normalizeShopPattern(it.pattern);
  if (!pattern) return null;
  const colors = shopPatternColors(pattern);
  const mode: ShopPatternMode = it.patMode === "one" || it.patMode === "slot" ? it.patMode : "orig";
  const modes = PATTERN_MODE_OPTIONS.filter((o) => o.v !== "slot" || colors.length > 1) as { v: ShopPatternMode; l: string }[];
  const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
  const lineColor = str(it.lineColor, "none");
  const sw = Number(it.strokeWidth) > 0 ? Number(it.strokeWidth) : 2;
  const slots = normalizePatternSlots(it.patSlots);
  const lineOnly = pattern.parts.some((p) => !p.f);
  const showWidth = mode === "slot" && lineColor !== "none";
  const setSlot = (i: number, v: string) => {
    const next = [...slots];
    while (next.length <= i) next.push("");
    next[i] = v;
    onPatch({ patSlots: normalizePatternSlots(next) });
  };
  const lineRow = (label: string) => (
    <div>
      <H>{label}</H>
      <ColorSwatches
        theme={theme}
        allowNone
        value={lineColor}
        hex={str(it.lineColorHex)}
        onPick={(v, hex) => onPatch(v === "custom" ? { lineColor: v, lineColorHex: hex ?? str(it.lineColorHex) } : { lineColor: v })}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-2">
        <span className="block h-12 w-16 shrink-0">
          <ShopPatternBox it={it} theme={theme} w={boxW} h={boxH} />
        </span>
        <span className="min-w-0 text-[11px] leading-snug text-slate-600">
          <b className="block truncate text-slate-800">🎨 {pattern.name || "ลายของร้าน"}</b>
          {pattern.parts.length} ชิ้นส่วน · {colors.length} สีในไฟล์
        </span>
      </div>
      <div>
        <H>สีของลาย</H>
        <Seg<ShopPatternMode> value={mode} onChange={(v) => onPatch({ patMode: v })} options={modes} />
      </div>

      {mode === "orig" && <p className="text-[11px] text-slate-500">ใช้สีตามไฟล์ที่ออกแบบมา — อยากเปลี่ยนสี เลือก &quot;สีเดียวทั้งลาย&quot; หรือ &quot;แยกตามสีในไฟล์&quot;</p>}

      {mode === "one" && <FillLineControls it={it} theme={theme} onPatch={onPatch} minWidth={minWidth} widthStep={widthStep} forceWidth={lineOnly} />}

      {mode === "slot" && (
        <>
          <div className="space-y-2">
            {colors.slice(0, SHOP_PATTERN_LIMITS.colors).map((c, i) => (
              <div key={c}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  สี {i + 1}
                  <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ background: c }} title={`สีในไฟล์ ${c}`} />
                  <span className="font-normal text-slate-400">ในไฟล์</span>
                  {slots[i] && (
                    <button type="button" onClick={() => setSlot(i, "")} className="ml-auto font-normal text-blue-600 hover:underline">
                      ↺ สีเดิม
                    </button>
                  )}
                </div>
                <ColorSwatches theme={theme} value={swatchVal(slots[i] ?? "")} hex={slots[i]?.startsWith("#") ? slots[i] : c} onPick={(v, hex) => setSlot(i, v === "custom" ? hex ?? c : v)} />
              </div>
            ))}
            {colors.length > SHOP_PATTERN_LIMITS.colors && <p className="text-[11px] text-amber-700">ไฟล์มี {colors.length} สี — สีที่เกิน {SHOP_PATTERN_LIMITS.colors} สีแรกคงสีเดิม</p>}
          </div>
          {lineRow("เส้นขอบเพิ่ม (ชิ้นที่ไม่มีเส้นในไฟล์)")}
        </>
      )}

      {showWidth && (
        <div>
          <H>ความหนาเส้น</H>
          <RangeInput value={sw} min={minWidth} max={24} step={widthStep} unit="px" onChange={(v) => onPatch({ strokeWidth: v })} />
        </div>
      )}
    </div>
  );
}
