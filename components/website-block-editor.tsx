"use client";

/**
 * ของกลาง — ชิ้นส่วนร่วมของตัวจัดหน้าเว็บ (Website Builder)
 *
 * ตั้งแต่เฟส Schema-Driven: ฟอร์มตั้งค่าต่อชนิดย้ายไป components/website-schema-form.tsx (วาดจาก schema)
 * และต้นไม้/พรีวิว/แผงคุณสมบัติอยู่ที่ components/website-builder.tsx
 * ไฟล์นี้เหลือ: ชนิดข้อมูลแบบหลวมสำหรับหน้าจอ · makeBlock · แผง "รูปลักษณ์" (StylePanel) ที่ใช้ร่วมทุก Section
 *
 * ⚠️ ชนิดบล็อก/ค่าตั้งต้น มาจาก lib/website-blocks.ts + lib/website-schema.ts ที่เดียวเท่านั้น — ห้ามประกาศซ้ำที่นี่
 */
import { useEffect, useRef, useState } from "react";
import { SectionDecorPanel } from "@/components/website-section-decor";
import { useWheelStep } from "@/components/wheel-select";
import { ColorInput } from "@/components/color-picker";
import { GradientPicker } from "@/components/website-gradient-picker";
import { GRADIENT_PRESETS } from "@/lib/website-gradient";
import { DEFAULT_BG_IMAGE, DEFAULT_BLOCK_STYLE, DEFAULT_BLOCK_TEXT, DEFAULT_MOTION, newBlock, type BlockBgImage, type BlockMotion, type BlockStyle, type BlockText, type BlockType, type TextSize, type TextSpacing, type TextCase, type EyeSize, type Visibility, DEFAULT_PATTERN, DEFAULT_EDGE, DEFAULT_BOX, type BlockPattern, type BlockEdge, type BlockBox, type PatternKind, type EdgeShape, type LayerSize, type BoxRadius, type DecorScreen } from "@/lib/website-blocks";
import { ImageUploadField } from "@/components/website-theme-media";
import { RangeInput } from "@/components/range-input";
import { CANVAS_WEIGHTS } from "@/lib/website-canvas";
import { ColorSwatches, DEFAULT_FONT_NAMES, DEFAULT_THEME_COLORS, FontPickList, type ThemeColors, type ThemeFontNames } from "@/components/website-text-pickers";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelEn } from "@/lib/website-schema-en";

export type { BlockType, Visibility };

/**
 * บล็อกแบบหลวมสำหรับหน้าจอ — ฟอร์มต้องอ่าน/เขียนฟิลด์ตามชนิดที่เลือกตอนรันไทม์
 * (ชนิดเข้มของจริงคือ Block ใน lib ซึ่งใช้ตอน normalize/ตรวจก่อนเผยแพร่)
 */
export interface Block {
  id: string;
  type: BlockType;
  enabled: boolean;
  visibility?: Visibility;
  style?: BlockStyle;
  [k: string]: unknown;
}

/** ชิ้นย่อยใน Section (Block) แบบหลวม */
export interface ChildBlock {
  id: string;
  enabled?: boolean;
  visibility?: Visibility;
  [k: string]: unknown;
}

export const ALL_VISIBLE: Visibility = { desktop: true, tablet: true, mobile: true };

export type BlockTypeInfo = { type: BlockType; label: string; icon: string; hint: string; group?: string };

/** สร้างบล็อกใหม่ตอนผู้ใช้กดเพิ่ม/ลากจากคลัง — ค่าตั้งต้นทั้งหมดมาจาก newBlock() ใน lib */
export function makeBlock(type: BlockType, seq: number): Block {
  return newBlock(type, seq, { uniqueId: true }) as unknown as Block;
}

/** สรุปว่าซ่อนบนอุปกรณ์ไหนบ้าง */
export function visibilityLabel(v?: Visibility): string {
  const x = { ...ALL_VISIBLE, ...v };
  const hidden = [!x.desktop && tr("คอม", "desktop"), !x.tablet && tr("แท็บเล็ต", "tablet"), !x.mobile && tr("มือถือ", "phone")].filter(Boolean);
  return hidden.length ? tr(`ซ่อนบน ${hidden.join("/")}`, `Hidden on ${hidden.join("/")}`) : "";
}

const labelCls = webForm.label;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, wheel }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[]; /** 🖱 ค่ามีลำดับ (ขนาด/ระยะ/ความเร็ว) — ชี้แล้วหมุนลูกกลิ้งเลื่อนไปตัวซ้าย/ขวาได้ (ของกลาง useWheelStep) */ wheel?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // ค่าล่าสุดที่ส่งออกไป (หมุนเร็วหลายคลิกก่อนวาดใหม่ ก็นับต่อได้)
  const curRef = useRef(value);
  curRef.current = value;
  useWheelStep(
    ref,
    (dir) => {
      const i = options.findIndex((o) => o.v === curRef.current);
      const next = options[i < 0 ? 0 : i + dir];
      if (next && next.v !== curRef.current) {
        curRef.current = next.v;
        onChange(next.v);
      }
    },
    !!wheel
  );
  const t = useT();
  const tip = wheel ? t("ชี้แล้วหมุนลูกกลิ้งเมาส์เพื่อเลื่อนตัวเลือก", "Hover and scroll the mouse wheel to change the option") : undefined;
  // ตัวเลือกเยอะ (> 5) = ตารางปุ่ม 3 คอลัมน์ (แถวเดียวปุ่มจะเล็กจนอ่านไม่ออก)
  if (options.length > 5)
    return (
      <div ref={ref} title={tip} className="grid grid-cols-3 gap-1">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-2 py-1.5 text-xs rounded-md border transition ${value === o.v ? "bg-slate-900 border-slate-900 text-white font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    );
  return (
    <div ref={ref} title={tip} className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 px-2 py-1.5 text-xs transition ${value === o.v ? "bg-slate-900 text-white font-medium" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

const SPACE = [
  { v: "auto" as const, get l() { return tr("ตามเดิม", "Default"); } },
  { v: "none" as const, get l() { return tr("ไม่มี", "None"); } },
  { v: "sm" as const, get l() { return tr("น้อย", "Small"); } },
  { v: "md" as const, get l() { return tr("กลาง", "Medium"); } },
  { v: "lg" as const, get l() { return tr("มาก", "Large"); } },
];
const ALIGN = [
  { v: "auto" as const, get l() { return tr("ตามเดิม", "Default"); } },
  { v: "left" as const, get l() { return tr("ซ้าย", "Left"); } },
  { v: "center" as const, get l() { return tr("กลาง", "Medium"); } },
  { v: "right" as const, get l() { return tr("ขวา", "Right"); } },
];
/** ขนาดหัวข้อ — เว็บร้านแปลงเป็นขนาดที่ย่อตามจอ (s ≈ 22-26px · m ≈ 28-36 · l ≈ 34-48 · xl ≈ 40-64 · xxl ≈ 48-88) */
const H_SIZE: { v: TextSize; l: string }[] = [
  { v: "auto", get l() { return tr("ตามเดิม", "Default"); } },
  { v: "s", get l() { return tr("เล็ก", "Small"); } },
  { v: "m", get l() { return tr("กลาง", "Medium"); } },
  { v: "l", get l() { return tr("ใหญ่", "Large"); } },
  { v: "xl", get l() { return tr("ใหญ่มาก", "Extra large"); } },
  { v: "xxl", get l() { return tr("ยักษ์", "Giant"); } },
];

/**
 * แผง "รูปลักษณ์" — มีเหมือนกันทุกชนิด Section (แยกจากฟอร์มเนื้อหา)
 * เก็บเป็นชื่อขนาด/ชื่อสีจากธีม ไม่ใช่ค่า pixel หรือรหัสสีตรง ๆ → เว็บแต่ละร้านแปลงเป็นสเกลของตัวเอง
 * แท็บ "มือถือ" = ตั้งทับเฉพาะจอเล็ก (auto = ใช้ค่าเดียวกับคอม)
 *
 * mode: "all" = หัวพับได้ + 3 แท็บ (แบบเดิม) · "style" = เฉพาะ ทุกจอ/มือถือ ไม่มีหัว · "motion" = เฉพาะลูกเล่น ไม่มีหัว
 * (ตัวจัดหน้าใหม่แยก "รูปลักษณ์" กับ "ลูกเล่น" เป็นแท็บของแผงขวาเอง จึงเรียกทีละโหมด)
 */
/** ตัวเลือกระยะห่างตัวอักษร / ตัวพิมพ์ — ใช้ร่วมทุกส่วนในแท็บ 🔤 ตัวอักษร */
const SPACING_OPTS: { v: TextSpacing; l: string }[] = [
  { v: "auto", get l() { return tr("ตามเดิม", "Default"); } },
  { v: "tight", get l() { return tr("ชิด", "Tight"); } },
  { v: "wide", get l() { return tr("ห่าง", "Wide"); } },
  { v: "wider", get l() { return tr("ห่างมาก", "Wider"); } },
];
const CASE_OPTS: { v: TextCase; l: string }[] = [
  { v: "auto", get l() { return tr("ตามเดิม", "Default"); } },
  { v: "upper", get l() { return tr("ตัวพิมพ์ใหญ่", "Uppercase"); } },
  { v: "normal", get l() { return tr("ตามที่พิมพ์", "As typed"); } },
];

/** 🎨 พื้นหลังเพิ่ม: ลวดลายทับพื้น · ขอบบน/ล่าง · กล่องเนื้อหา (เว็บร้านวาดที่ SectionLayers + CSS [data-box]) */
const PATTERN_OPTS: { v: PatternKind; l: string }[] = [
  { v: "none", get l() { return tr("ไม่มี", "None"); } },
  { v: "dots", get l() { return tr("จุด", "Dots"); } },
  { v: "lines", get l() { return tr("เส้นทแยง", "Diagonal lines"); } },
  { v: "grid", get l() { return tr("ตาราง", "Grid"); } },
  { v: "checks", get l() { return tr("หมากรุก", "Checks"); } },
  { v: "grain", get l() { return tr("เกรน", "Grain"); } },
  { v: "waves", get l() { return tr("คลื่น", "Wave"); } },
];
const EDGE_OPTS: { v: EdgeShape; l: string }[] = [
  { v: "none", get l() { return tr("ตรง (เดิม)", "Straight (classic)"); } },
  { v: "wave", get l() { return tr("คลื่น", "Wave"); } },
  { v: "waves", get l() { return tr("คลื่นนุ่ม", "Soft waves"); } },
  { v: "curve", get l() { return tr("โค้งลง", "Curve down"); } },
  { v: "arch", get l() { return tr("โค้งขึ้น", "Arch up"); } },
  { v: "tilt", get l() { return tr("เฉียง", "Tilt"); } },
  { v: "zigzag", get l() { return tr("ฟันปลา", "Zigzag"); } },
];
const SIZE_OPTS: { v: LayerSize; l: string }[] = [
  { v: "s", get l() { return tr("เล็ก", "Small"); } },
  { v: "m", get l() { return tr("กลาง", "Medium"); } },
  { v: "l", get l() { return tr("ใหญ่", "Large"); } },
];
function SectionBgExtras({ s, set, theme }: { s: BlockStyle; set: (p: Partial<BlockStyle>) => void; theme: ThemeColors }) {
  const pat = { ...DEFAULT_PATTERN, ...(s.pattern ?? {}) };
  const t = useT();
  const box = { ...DEFAULT_BOX, ...(s.box ?? {}) };
  const setPat = (p: Partial<BlockPattern>) => set({ pattern: { ...pat, ...p } });
  const setBox = (p: Partial<BlockBox>) => set({ box: { ...box, ...p } });
  const edge = (k: "edgeTop" | "edgeBottom") => {
    const e = { ...DEFAULT_EDGE, ...(s[k] ?? {}) };
    const setE = (p: Partial<BlockEdge>) => set({ [k]: { ...e, ...p } } as Partial<BlockStyle>);
    return (
      <TextGroup key={k} title={k === "edgeTop" ? t("ขอบบนเป็นรูปทรง", "Shaped top edge") : t("ขอบล่างเป็นรูปทรง", "Shaped bottom edge")} touched={e.shape !== "none"}>
        <Field label={t("รูปทรง", "Shape")}><Seg<EdgeShape> wheel value={e.shape} onChange={(v) => setE({ shape: v })} options={EDGE_OPTS} /></Field>
        {e.shape !== "none" && (
          <>
            <Field label={t(`ความสูง: ${e.height}px (มือถือย่อเหลือ 60%)`, `Height: ${e.height}px (phone shrinks to 60%)`)}><RangeInput value={e.height} min={16} max={200} step={4} onChange={(v) => setE({ height: v })} /></Field>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={e.flip} onChange={(ev) => setE({ flip: ev.target.checked })} />
              {t("กลับซ้าย-ขวา", "Flip left-right")}
            </label>
            <Field label={t("สีส่วนที่ตัด (ให้ตรงกับ Section ที่ติดกัน)", "Cut-out color (match the adjacent section)")}>
              <ColorSwatches theme={theme} value={e.color} hex={e.colorHex} autoLabel={t("สีพื้นเว็บ (แนะนำ)", "Site background (recommended)")} onPick={(v, hex) => setE(v === "custom" ? { color: v, colorHex: hex ?? e.colorHex } : { color: v })} />
            </Field>
          </>
        )}
      </TextGroup>
    );
  };
  return (
    <div className="space-y-2">
      <TextGroup title={t("ลวดลายทับพื้น", "Background pattern")} touched={pat.kind !== "none"}>
        <Field label={t("ลาย", "Pattern")}><Seg<PatternKind> wheel value={pat.kind} onChange={(v) => setPat({ kind: v })} options={PATTERN_OPTS} /></Field>
        {pat.kind !== "none" && (
          <>
            <Field label={t("สีลาย", "Pattern color")}>
              <ColorSwatches theme={theme} value={pat.color} hex={pat.colorHex} autoLabel={t("ตามเดิม (สีตัวอักษร)", "Default (text color)")} onPick={(v, hex) => setPat(v === "custom" ? { color: v, colorHex: hex ?? pat.colorHex } : { color: v })} />
            </Field>
            <Field label={t(`ความเข้ม: ${pat.opacity}%`, `Strength: ${pat.opacity}%`)}><RangeInput value={pat.opacity} min={3} max={60} step={1} onChange={(v) => setPat({ opacity: v })} /></Field>
            <Field label={t("ขนาดลาย", "Pattern size")}><Seg<LayerSize> value={pat.size} onChange={(v) => setPat({ size: v })} options={SIZE_OPTS} /></Field>
          </>
        )}
      </TextGroup>
      {edge("edgeTop")}
      {edge("edgeBottom")}
      <TextGroup title={t("กล่องเนื้อหามีพื้น", "Content box with background")} touched={box.on}>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
          <input type="checkbox" checked={box.on} onChange={(ev) => setBox({ on: ev.target.checked })} />
          {t("ใส่กล่องรอบเนื้อหา (พื้นหลัง Section ยังเห็นรอบ ๆ)", "Add a box around content (section background still shows around it)")}
        </label>
        {box.on && (
          <>
            <Field label={t("สีกล่อง", "Box color")}>
              <ColorSwatches theme={theme} value={box.color} hex={box.colorHex} autoLabel={t("สีพื้นการ์ด", "Card background")} onPick={(v, hex) => setBox(v === "custom" ? { color: v, colorHex: hex ?? box.colorHex } : { color: v })} />
            </Field>
            <Field label={t(`ความทึบ: ${box.opacity}%`, `Opacity: ${box.opacity}%`)}><RangeInput value={box.opacity} min={40} max={100} step={5} onChange={(v) => setBox({ opacity: v })} /></Field>
            <Field label={t("มุมโค้ง", "Corner radius")}>
              <Seg<BoxRadius> value={box.radius} onChange={(v) => setBox({ radius: v })} options={[{ v: "none", l: t("เหลี่ยม", "Square") }, { v: "s", l: t("นิด", "Slight") }, { v: "m", l: t("กลาง", "Medium") }, { v: "l", l: t("มาก", "Large") }, { v: "xl", l: t("มากสุด", "Max") }]} />
            </Field>
            <Field label={t("ระยะกล่องจากขอบ", "Box inset from edge")}><Seg<LayerSize> value={box.gap} onChange={(v) => setBox({ gap: v })} options={SIZE_OPTS} /></Field>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={box.shadow} onChange={(ev) => setBox({ shadow: ev.target.checked })} />{t("เงา", "Shadow")}</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={box.border} onChange={(ev) => setBox({ border: ev.target.checked })} />{t("เส้นขอบ", "Border")}</label>
            </div>
          </>
        )}
      </TextGroup>
    </div>
  );
}

/** กลุ่มพับได้ในแท็บ 🔤 ตัวอักษร (• = ตั้งค่าไว้แล้ว) */
function TextGroup({ title, touched, defaultOpen = false, children }: { title: string; touched: boolean; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen || touched} className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-medium text-slate-700">
        <span>
          {title}
          {touched && <span className="ml-1 text-blue-600">•</span>}
        </span>
        <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-3 py-3">{children}</div>
    </details>
  );
}

export function StylePanel({
  value,
  onChange,
  defaultOpen = true,
  mode = "all",
  hasHeading = true,
  theme = DEFAULT_THEME_COLORS,
  fontNames = DEFAULT_FONT_NAMES,
  onPlay,
  shopId,
  decorSel = null,
  onDecorSel,
  decorTabReq = 0,
  screen,
  onScreen,
}: {
  value: BlockStyle;
  onChange: (s: BlockStyle) => void;
  defaultOpen?: boolean;
  mode?: "all" | "style" | "motion";
  /** Section นี้มีหัวข้อไหม (ไม่มี = ไม่โชว์แท็บตัวอักษร / ช่องหัวข้อในแท็บมือถือ) */
  hasHeading?: boolean;
  /** สี/ฟอนต์ของธีมร้าน — วาดจุดสี/ตัวอย่างฟอนต์ (ของกลาง useShopTheme) */
  theme?: ThemeColors;
  fontNames?: ThemeFontNames;
  /** แท็บลูกเล่น: ปุ่ม ▶ เล่นให้ดูอีกครั้งในพรีวิว (ไม่ส่ง = ไม่มีปุ่ม) — เลือกค่าแล้วพรีวิวเล่นให้เองอยู่แล้ว */
  onPlay?: () => void;
  /** ✨ แท็บตกแต่ง: ร้าน (เปิดคลังของตกแต่ง) · ชิ้นที่เลือก (ตัวจัดหน้าคุม — กดในพรีวิวก็เลือกได้) · เลขเพิ่ม = สลับมาแท็บตกแต่ง */
  shopId?: string;
  decorSel?: string | null;
  onDecorSel?: (id: string | null) => void;
  decorTabReq?: number;
  /** 📱 จอที่พรีวิวอยู่ (ของตกแต่งปรับแยก คอม/แท็บเล็ต/มือถือ) · onScreen = สลับจอพรีวิวจากแผง */
  screen?: DecorScreen;
  onScreen?: (s: DecorScreen) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"all" | "text" | "mobile" | "motion" | "decor">(mode === "motion" ? "motion" : "all");
  const [localDecorSel, setLocalDecorSel] = useState<string | null>(null);
  // กดชิ้นตกแต่งในพรีวิว → ตัวจัดหน้าเพิ่มเลข → สลับมาแท็บตกแต่ง
  useEffect(() => {
    if (decorTabReq > 0 && mode !== "motion") setTab("decor");
  }, [decorTabReq, mode]);
  const bare = mode !== "all";
  const showTab = tab === "motion" ? mode !== "style" : mode !== "motion";
  const s: BlockStyle = {
    ...DEFAULT_BLOCK_STYLE,
    ...(value ?? {}),
    mobile: { ...DEFAULT_BLOCK_STYLE.mobile, ...(value?.mobile ?? {}) },
    motion: { ...DEFAULT_MOTION, ...(value?.motion ?? {}) },
    text: { ...DEFAULT_BLOCK_TEXT, ...(value?.text ?? {}) },
  };
  const set = (p: Partial<BlockStyle>) => onChange({ ...s, ...p });
  const setT = (p: Partial<BlockText>) => onChange({ ...s, text: { ...s.text, ...p } });
  const img: BlockBgImage = { ...DEFAULT_BG_IMAGE, ...(s.bgImg ?? {}) };
  const setImg = (p: Partial<BlockBgImage>) => set({ bg: "image", bgImg: { ...img, ...p } });
  const textTouched = JSON.stringify(s.text) !== JSON.stringify(DEFAULT_BLOCK_TEXT);
  const setM = (p: Partial<BlockStyle["mobile"]>) => onChange({ ...s, mobile: { ...s.mobile, ...p } });
  const setMo = (p: Partial<BlockMotion>) => onChange({ ...s, motion: { ...s.motion, ...p } });
  const motionTouched = JSON.stringify(s.motion) !== JSON.stringify(DEFAULT_MOTION);
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULT_BLOCK_STYLE);
  const mobileTouched = JSON.stringify(s.mobile) !== JSON.stringify(DEFAULT_BLOCK_STYLE.mobile);

  const tabs = [
    { k: "all" as const, l: t("🖥️ ทุกจอ", "🖥️ All screens") },
    { k: "text" as const, l: `${t("🔤 ตัวอักษร", "🔤 Text")}${textTouched ? " •" : ""}` },
    { k: "mobile" as const, l: `${t("📲 มือถือ", "📲 Phone")}${mobileTouched ? " •" : ""}` },
    { k: "motion" as const, l: `${t("✨ ลูกเล่น", "✨ Motion")}${motionTouched ? " •" : ""}` },
    { k: "decor" as const, l: `${t("🎀 ตกแต่ง", "🎀 Decor")}${s.decor?.length ? ` (${s.decor.length})` : ""}` },
  ].filter((x) => (mode === "style" ? x.k !== "motion" : mode === "motion" ? x.k === "motion" : true));
  void showTab;

  return (
    <div className={bare ? "" : "pt-3 border-t border-slate-200"}>
      {!bare && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900">
          <span>{open ? "▾" : "▸"}</span>
          {t("🎨 รูปลักษณ์", "🎨 Style")}
          {!isDefault && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] border border-blue-200">{t("ปรับแล้ว", "Changed")}</span>}
        </button>
      )}

      {(open || bare) && (
        <div className={bare ? "space-y-3" : "mt-3 space-y-3"}>
          {tabs.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {tabs.map((x) => (
              <button
                key={x.k}
                type="button"
                onClick={() => setTab(x.k)}
                className={`px-2.5 py-1 rounded-full border whitespace-nowrap ${tab === x.k ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                {x.l}
              </button>
            ))}
            {tab === "mobile" && <span className="basis-full text-slate-400 mt-0.5">{t('ตั้งทับเฉพาะจอเล็ก · "ตามเดิม" = ใช้ค่าเดียวกับคอม', 'Overrides for small screens only · "Default" = same as desktop')}</span>}
          </div>
          )}

          {tab === "motion" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t("โผล่ตอนเลื่อนมาถึง (Entrance)", "Appear on scroll (Entrance)")}>
                  <Seg
                    value={s.motion.entrance}
                    onChange={(v) => setMo({ entrance: v })}
                    options={[
                      { v: "none", l: t("ตามค่าทั้งเว็บ", "Site default") },
                      { v: "still", l: t("ไม่ขยับ", "Still") },
                      { v: "fade-up", l: t("ลอยขึ้น", "Fade up") },
                      { v: "fade-in", l: t("จางเข้า", "Fade in") },
                      { v: "slide-left", l: t("จากขวา", "From right") },
                      { v: "slide-right", l: t("จากซ้าย", "From left") },
                      { v: "zoom", l: t("ซูม", "Zoom") },
                      { v: "pop", l: t("เด้ง", "Pop") },
                      { v: "spin-in", l: t("หมุนเข้า", "Spin in") },
                      { v: "blur", l: t("เบลอ→ชัด", "Blur→sharp") },
                    ]}
                  />
                </Field>
              </div>
              <Field label={t("ความเร็ว", "Speed")}>
                <Seg wheel value={s.motion.speed} onChange={(v) => setMo({ speed: v })} options={[{ v: "fast", l: t("เร็ว", "Fast") }, { v: "normal", l: t("ปกติ", "Normal") }, { v: "slow", l: t("ช้า", "Slow") }]} />
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer self-end pb-2">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={s.motion.stagger} disabled={s.motion.entrance === "none" || s.motion.entrance === "still"} onChange={(e) => setMo({ stagger: e.target.checked })} />
                {t("การ์ด/ชิ้นย่อยโผล่ไล่กันทีละชิ้น", "Cards/items appear one after another")}
              </label>
              <div className="sm:col-span-2">
                <Field label={t("ตอนชี้เมาส์ (Hover) — มีผลกับการ์ดและรูปใน Section นี้", "On hover — affects cards and images in this section")}>
                  <Seg value={s.motion.hover} onChange={(v) => setMo({ hover: v })} options={[{ v: "none", l: t("ไม่มี", "None") }, { v: "lift", l: t("ยกตัว", "Lift") }, { v: "zoom", l: t("ซูมรูป", "Zoom image") }, { v: "glow", l: t("เรืองแสง", "Glow") }]} />
                </Field>
              </div>
              {onPlay && (
                <button
                  type="button"
                  onClick={onPlay}
                  disabled={s.motion.entrance === "none" && s.motion.hover === "none"}
                  className="sm:col-span-2 justify-self-start rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                >
                  {t("▶ เล่นให้ดูอีกครั้ง", "▶ Play again")}
                </button>
              )}
              <p className="sm:col-span-2 text-[11px] text-slate-400">
                {t('กดเลือกแล้วพรีวิวเล่นให้ดูทันที (ตอนชี้เมาส์ = ค้างให้ดูแป๊บหนึ่ง) · ขยับไม่เกิน 1 วิ · ลูกค้าที่ตั้งเครื่องว่า "ลดการเคลื่อนไหว" จะไม่เห็นลูกเล่น (ระบบปิดให้เอง)', 'Pick and the preview plays it right away (hover = held briefly) · motion lasts under 1 s · customers with "reduce motion" on won\'t see it (turned off automatically)')}
              </p>
            </div>
          ) : tab === "text" ? (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400">{t('ตั้งเฉพาะ Section นี้ · แบ่ง 4 ส่วน: หัวข้อใหญ่ · ตัวเล็กเหนือหัวข้อ · เนื้อหา (ชื่อการ์ด/ราคา/คำอธิบาย) · ปุ่ม · "ตามเดิม" = ตามธีมร้าน', 'This section only · 4 parts: big title · small text above title · body (card name/price/description) · buttons · "Default" = shop theme')}</p>
              {hasHeading && (
              <TextGroup title={t("หัวข้อใหญ่", "Big title")} touched={["font", "size", "weight", "color", "spacing", "upper", "italic"].some((k) => s.text[k as keyof BlockText] !== DEFAULT_BLOCK_TEXT[k as keyof BlockText])} defaultOpen>
              <Field label={t("ฟอนต์หัวข้อ", "Title font")}>
                <FontPickList value={s.text.font} onPick={(v) => setT({ font: v })} fontNames={fontNames} autoLabel={t("ตามเดิม (ฟอนต์หัวข้อของธีม)", "Default (theme heading font)")} />
              </Field>
              <Field label={t("ขนาดหัวข้อ (ย่อตามจอเอง)", "Title size (scales with screen)")}><Seg wheel value={s.text.size} onChange={(v) => setT({ size: v })} options={H_SIZE} /></Field>
              <Field label={t("ความหนา", "Weight")}>
                <Seg wheel value={s.text.weight} onChange={(v) => setT({ weight: v })} options={[{ v: "auto", l: t("ตามเดิม", "Default") }, ...CANVAS_WEIGHTS.map((o) => ({ ...o, l: labelEn(o.l) }))]} />
              </Field>
              <Field label={t("ระยะห่างตัวอักษร", "Letter spacing")}>
                <Seg<TextSpacing>
                  wheel
                  value={s.text.spacing}
                  onChange={(v) => setT({ spacing: v })}
                  options={[
                    { v: "auto", l: t("ตามเดิม", "Default") },
                    { v: "tight", l: t("ชิด", "Tight") },
                    { v: "wide", l: t("ห่าง", "Wide") },
                    { v: "wider", l: t("ห่างมาก", "Wider") },
                  ]}
                />
              </Field>
              <div className="flex flex-wrap gap-4 text-xs text-slate-700">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={s.text.upper} onChange={(e) => setT({ upper: e.target.checked })} />
                  {t("ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)", "All uppercase (English)")}
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={s.text.italic} onChange={(e) => setT({ italic: e.target.checked })} />
                  {t("ตัวเอียง", "Italic")}
                </label>
              </div>
              <Field label={t("สีหัวข้อ", "Title color")}>
                <ColorSwatches theme={theme} value={s.text.color} hex={s.text.colorHex} autoLabel={t("ตามเดิม", "Default")} onPick={(v, hex) => setT(v === "custom" ? { color: v, colorHex: hex ?? s.text.colorHex } : { color: v })} />
              </Field>
              </TextGroup>
              )}
              {hasHeading && (
              <TextGroup title={t("ตัวเล็กเหนือหัวข้อ + คำโปรย", "Small text above title + tagline")} touched={["eyeFont", "eyeSize", "eyeSpacing", "eyeCase", "subColor"].some((k) => s.text[k as keyof BlockText] !== DEFAULT_BLOCK_TEXT[k as keyof BlockText])}>
                <Field label={t("ฟอนต์ตัวเล็กเหนือหัวข้อ", "Font for small text above title")}>
                  <FontPickList value={s.text.eyeFont} onPick={(v) => setT({ eyeFont: v })} fontNames={fontNames} autoLabel={t("ตามเดิม (ฟอนต์เนื้อหาของธีม)", "Default (theme body font)")} />
                </Field>
                <Field label={t("ขนาด", "Size")}>
                  <Seg<EyeSize> wheel value={s.text.eyeSize} onChange={(v) => setT({ eyeSize: v })} options={[{ v: "auto", l: t("ตามเดิม", "Default") }, { v: "s", l: t("เล็ก", "Small") }, { v: "m", l: t("กลาง", "Medium") }, { v: "l", l: t("ใหญ่", "Large") }]} />
                </Field>
                <Field label={t("ระยะห่างตัวอักษร", "Letter spacing")}><Seg<TextSpacing> wheel value={s.text.eyeSpacing} onChange={(v) => setT({ eyeSpacing: v })} options={SPACING_OPTS} /></Field>
                <Field label={t("ตัวพิมพ์", "Case")}><Seg<TextCase> wheel value={s.text.eyeCase} onChange={(v) => setT({ eyeCase: v })} options={CASE_OPTS} /></Field>
                <Field label={t("สีตัวเล็กเหนือหัวข้อ + คำโปรย", "Color of small text above title + tagline")}>
                  <ColorSwatches theme={theme} value={s.text.subColor} hex={s.text.subColorHex} autoLabel={t("ตามเดิม", "Default")} onPick={(v, hex) => setT(v === "custom" ? { subColor: v, subColorHex: hex ?? s.text.subColorHex } : { subColor: v })} />
                </Field>
              </TextGroup>
              )}
              <TextGroup title={t("เนื้อหา (ชื่อการ์ด · ราคา · คำอธิบาย)", "Body (card name · price · description)")} touched={["bodyFont", "bodyColor", "bodySpacing", "bodyUpper"].some((k) => s.text[k as keyof BlockText] !== DEFAULT_BLOCK_TEXT[k as keyof BlockText])}>
                <Field label={t("ฟอนต์เนื้อหา", "Body font")}>
                  <FontPickList value={s.text.bodyFont} onPick={(v) => setT({ bodyFont: v })} fontNames={fontNames} autoLabel={t("ตามเดิม (ตามธีม)", "Default (per theme)")} />
                </Field>
                <Field label={t("ระยะห่างตัวอักษร", "Letter spacing")}><Seg<TextSpacing> wheel value={s.text.bodySpacing} onChange={(v) => setT({ bodySpacing: v })} options={SPACING_OPTS} /></Field>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                  <input type="checkbox" checked={s.text.bodyUpper} onChange={(e) => setT({ bodyUpper: e.target.checked })} />
                  {t("ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)", "All uppercase (English)")}
                </label>
                <Field label={t("สีเนื้อหา", "Body color")}>
                  <ColorSwatches theme={theme} value={s.text.bodyColor} hex={s.text.bodyColorHex} autoLabel={t("ตามเดิม", "Default")} onPick={(v, hex) => setT(v === "custom" ? { bodyColor: v, bodyColorHex: hex ?? s.text.bodyColorHex } : { bodyColor: v })} />
                </Field>
                <p className="text-[11px] text-slate-400">{t("ขนาดชื่อการ์ด/ราคา ตั้งที่ ดีไซน์ → การ์ดสินค้า (หรือ 🃏 การ์ดในส่วนนี้)", "Card name/price size is set in Design → Product card (or 🃏 Cards in this section)")}</p>
              </TextGroup>
              <TextGroup title={t("ปุ่ม", "Buttons")} touched={["btnFont", "btnCase", "btnSpacing"].some((k) => s.text[k as keyof BlockText] !== DEFAULT_BLOCK_TEXT[k as keyof BlockText])}>
                <Field label={t("ฟอนต์ปุ่ม", "Button font")}>
                  <FontPickList value={s.text.btnFont} onPick={(v) => setT({ btnFont: v })} fontNames={fontNames} autoLabel={t("ตามเดิม (ตามธีม)", "Default (per theme)")} />
                </Field>
                <Field label={t("ตัวพิมพ์", "Case")}><Seg<TextCase> wheel value={s.text.btnCase} onChange={(v) => setT({ btnCase: v })} options={CASE_OPTS} /></Field>
                <Field label={t("ระยะห่างตัวอักษร", "Letter spacing")}><Seg<TextSpacing> wheel value={s.text.btnSpacing} onChange={(v) => setT({ btnSpacing: v })} options={SPACING_OPTS} /></Field>
              </TextGroup>
              {textTouched && (
                <button type="button" onClick={() => onChange({ ...s, text: { ...DEFAULT_BLOCK_TEXT } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                  {t("คืนค่าตัวอักษรเป็นตามเดิม", "Reset text to default")}
                </button>
              )}
            </div>
          ) : tab === "decor" ? (
            <SectionDecorPanel
              value={s.decor ?? []}
              onChange={(next) => set({ decor: next.length ? next : undefined })}
              theme={theme}
              fontNames={fontNames}
              shopId={shopId}
              selId={onDecorSel ? decorSel : localDecorSel}
              onSel={onDecorSel ?? setLocalDecorSel}
              screen={screen}
              onScreen={onScreen}
            />
          ) : tab === "all" ? (
            <div className="grid gap-3">
              <Field label={t("ระยะห่างด้านบน", "Top spacing")}><Seg wheel value={s.padTop} onChange={(v) => set({ padTop: v })} options={SPACE} /></Field>
              <Field label={t("ระยะห่างด้านล่าง", "Bottom spacing")}><Seg wheel value={s.padBottom} onChange={(v) => set({ padBottom: v })} options={SPACE} /></Field>
              <Field label={t("ความกว้างเนื้อหา", "Content width")}>
                <Seg wheel value={s.width} onChange={(v) => set({ width: v })} options={[{ v: "auto", l: t("ตามเดิม", "Default") }, { v: "narrow", l: t("แคบ", "Narrow") }, { v: "full", l: t("เต็มจอ", "Full screen") }]} />
              </Field>
              <Field label={t("จัดข้อความ", "Text align")}><Seg value={s.align} onChange={(v) => set({ align: v })} options={ALIGN} /></Field>
              <div>
                <Field label={t("พื้นหลังบล็อก", "Block background")}>
                  <Seg
                    value={s.bg}
                    // เลือก "ไล่สี" ครั้งแรก = ใส่แบบสำเร็จแรกให้เลย (เห็นผลทันที)
                    onChange={(v) => set(v === "gradient" && !s.bgGrad ? { bg: v, bgGrad: GRADIENT_PRESETS[0].g } : { bg: v })}
                    options={[
                      { v: "auto", l: t("ตามเดิม", "Default") },
                      { v: "page", l: t("พื้นเว็บ", "Site background") },
                      { v: "surface", l: t("พื้นการ์ด", "Card background") },
                      { v: "brand", l: t("สีแบรนด์", "Brand color") },
                      { v: "ink", l: t("เข้ม", "Dark") },
                      { v: "custom", l: t("เลือกเอง", "Custom") },
                      { v: "gradient", l: t("ไล่สี", "Gradient") },
                      { v: "image", l: t("รูปภาพ", "Image") },
                    ]}
                  />
                </Field>
                {s.bg === "image" && (
                  <div className="mt-2 rounded-lg border border-slate-200 p-2.5 space-y-3">
                    <ImageUploadField label={t("รูปพื้นหลัง", "Background image")} hint={t("แนวนอน กว้าง ≥ 1600px คมสุด", "Landscape, ≥ 1600px wide is sharpest")} value={img.key} onChange={(k) => setImg({ key: k })} height={72} />
                    {img.key ? (
                      <>
                        <Field label={t("วางรูป", "Image fit")}>
                          <Seg
                            value={img.fit}
                            onChange={(v) => setImg({ fit: v })}
                            options={[
                              { v: "cover", l: t("เต็มพื้นที่", "Fill") },
                              { v: "contain", l: t("เห็นทั้งรูป", "Whole image") },
                              { v: "repeat", l: t("ปูซ้ำ (ลาย)", "Tile (pattern)") },
                            ]}
                          />
                        </Field>
                        <Field label={t("ให้เห็นส่วนไหนของรูป", "Which part of the image to show")}>
                          <Seg
                            value={img.pos}
                            onChange={(v) => setImg({ pos: v })}
                            options={[
                              { v: "top", l: t("บน", "Top") },
                              { v: "center", l: t("กลาง", "Medium") },
                              { v: "bottom", l: t("ล่าง", "Bottom") },
                            ]}
                          />
                        </Field>
                        <Field label={t("ลูกเล่นของรูป", "Image effect")}>
                          <Seg
                            value={img.fx}
                            onChange={(v) => setImg({ fx: v })}
                            options={[
                              { v: "none", l: t("นิ่ง", "Still") },
                              { v: "zoom", l: t("ซูมช้า ๆ", "Slow zoom") },
                              { v: "pan", l: t("เลื่อนซ้าย-ขวา", "Pan left-right") },
                              { v: "float", l: t("ลอยขึ้นลง", "Float up-down") },
                              { v: "parallax", l: t("เลื่อนจอแล้วรูปเลื่อนช้ากว่า", "Parallax on scroll") },
                            ]}
                          />
                        </Field>
                        {img.fx !== "none" && img.fx !== "parallax" && (
                          <Field label={t("ความเร็ว", "Speed")}>
                            <Seg
                              wheel
                              value={img.speed}
                              onChange={(v) => setImg({ speed: v })}
                              options={[
                                { v: "slow", l: t("ช้า", "Slow") },
                                { v: "normal", l: t("ปกติ", "Normal") },
                                { v: "fast", l: t("เร็ว", "Fast") },
                              ]}
                            />
                          </Field>
                        )}
                        <Field label={t(`ทำให้รูปจาง: ${img.dim}%`, `Fade image: ${img.dim}%`)}>
                          <RangeInput value={img.dim} min={0} max={90} step={5} onChange={(v) => setImg({ dim: v })} />
                        </Field>
                        <Field label={t("จางด้วยสี", "Fade with color")}>
                          <Seg
                            value={img.tone}
                            onChange={(v) => setImg({ tone: v })}
                            options={[
                              { v: "dark", l: t("ดำ (ตัวหนังสือขาว)", "Black (white text)") },
                              { v: "light", l: t("ขาว", "White") },
                            ]}
                          />
                        </Field>
                        <Field label={t(`เบลอรูป: ${img.blur}px`, `Blur image: ${img.blur}px`)}>
                          <RangeInput value={img.blur} min={0} max={20} step={1} onChange={(v) => setImg({ blur: v })} />
                        </Field>
                        <p className="text-[11px] text-slate-400">{t('ลูกค้าตั้งเครื่อง "ลดการเคลื่อนไหว" = รูปนิ่งเสมอ', 'Customers with "reduce motion" on = image always still')}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-amber-600">{t("ใส่รูปก่อน — ยังไม่ใส่รูป หน้าเว็บจะใช้พื้นหลังตามเดิม", "Add an image first — without one the page uses the default background")}</p>
                    )}
                  </div>
                )}
                {s.bg === "gradient" && (
                  <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
                    <GradientPicker value={s.bgGrad ?? null} onChange={(g) => set({ bg: "gradient", bgGrad: g })} />
                  </div>
                )}
                {s.bg === "custom" && (
                  <div className="mt-2">
                    <ColorInput value={s.bgColor || "#ffffff"} onChange={(hex) => set({ bgColor: hex })} />
                    <p className="mt-1 text-[11px] text-amber-600">{t('เลือกสีเองจะไม่เปลี่ยนตามธีมร้าน — ถ้าอยากให้เปลี่ยนตามธีมด้วย ใช้ "สีแบรนด์" หรือ "พื้นการ์ด"', 'A custom color won\'t follow the shop theme — to follow the theme, use "Brand color" or "Card background"')}</p>
                  </div>
                )}
              </div>
              <SectionBgExtras s={s} set={set} theme={theme} />
            </div>
          ) : (
            <div className="grid gap-3">
              <Field label={t("ระยะห่างด้านบน (มือถือ)", "Top spacing (phone)")}><Seg wheel value={s.mobile.padTop} onChange={(v) => setM({ padTop: v })} options={SPACE} /></Field>
              <Field label={t("ระยะห่างด้านล่าง (มือถือ)", "Bottom spacing (phone)")}><Seg wheel value={s.mobile.padBottom} onChange={(v) => setM({ padBottom: v })} options={SPACE} /></Field>
              <Field label={t("จัดข้อความ (มือถือ)", "Text align (phone)")}><Seg value={s.mobile.align} onChange={(v) => setM({ align: v })} options={ALIGN} /></Field>
              {hasHeading && (
                <>
                  <div>
                    <Field label={t("ขนาดหัวข้อ (มือถือ)", "Title size (phone)")}><Seg wheel value={s.mobile.hSize} onChange={(v) => setM({ hSize: v })} options={H_SIZE} /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={s.mobile.hideEyebrow} onChange={(e) => setM({ hideEyebrow: e.target.checked })} />
                    {t("ซ่อนตัวเล็กเหนือหัวข้อบนมือถือ", "Hide small text above title on phone")}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={s.mobile.hideSub} onChange={(e) => setM({ hideSub: e.target.checked })} />
                    {t("ซ่อนคำโปรยใต้หัวข้อบนมือถือ", "Hide tagline under title on phone")}
                  </label>
                </>
              )}
              <p className="text-[11px] text-slate-400">{t('ซ่อนทั้ง Section บนมือถือ → ใช้ "แสดงบนจอ" ด้านล่าง · ชิ้นย่อยซ่อนเฉพาะมือถือได้ที่ตัวชิ้น', 'To hide the whole section on phone → use "Show on devices" below · items can be hidden on phone individually')}</p>
            </div>
          )}

          {mode === "motion" ? (
            motionTouched && (
              <button type="button" onClick={() => onChange({ ...s, motion: { ...DEFAULT_MOTION } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                {t("คืนค่าเริ่มต้นของลูกเล่น", "Reset motion to default")}
              </button>
            )
          ) : mode === "style" ? (
            JSON.stringify({ ...s, motion: undefined }) !== JSON.stringify({ ...DEFAULT_BLOCK_STYLE, motion: undefined }) && (
              <button type="button" onClick={() => onChange({ ...DEFAULT_BLOCK_STYLE, mobile: { ...DEFAULT_BLOCK_STYLE.mobile }, motion: { ...s.motion }, text: { ...DEFAULT_BLOCK_TEXT } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                {t("คืนค่าเริ่มต้นของรูปลักษณ์", "Reset style to default")}
              </button>
            )
          ) : (
            !isDefault && (
              <button type="button" onClick={() => onChange({ ...DEFAULT_BLOCK_STYLE, mobile: { ...DEFAULT_BLOCK_STYLE.mobile }, motion: { ...DEFAULT_MOTION }, text: { ...DEFAULT_BLOCK_TEXT } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                {t("คืนค่าเริ่มต้นทั้งหมด", "Reset all to default")}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
