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
import { useRef, useState } from "react";
import { useWheelStep } from "@/components/wheel-select";
import { ColorInput } from "@/components/color-picker";
import { GradientPicker } from "@/components/website-gradient-picker";
import { GRADIENT_PRESETS } from "@/lib/website-gradient";
import { DEFAULT_BLOCK_STYLE, DEFAULT_BLOCK_TEXT, DEFAULT_MOTION, newBlock, type BlockMotion, type BlockStyle, type BlockText, type BlockType, type TextSize, type Visibility } from "@/lib/website-blocks";
import { CANVAS_WEIGHTS } from "@/lib/website-canvas";
import { ColorSwatches, DEFAULT_FONT_NAMES, DEFAULT_THEME_COLORS, FontPickList, type ThemeColors, type ThemeFontNames } from "@/components/website-text-pickers";

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
  const hidden = [!x.desktop && "คอม", !x.tablet && "แท็บเล็ต", !x.mobile && "มือถือ"].filter(Boolean);
  return hidden.length ? `ซ่อนบน ${hidden.join("/")}` : "";
}

const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

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
  const tip = wheel ? "ชี้แล้วหมุนลูกกลิ้งเมาส์เพื่อเลื่อนตัวเลือก" : undefined;
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
  { v: "auto" as const, l: "ตามเดิม" },
  { v: "none" as const, l: "ไม่มี" },
  { v: "sm" as const, l: "น้อย" },
  { v: "md" as const, l: "กลาง" },
  { v: "lg" as const, l: "มาก" },
];
const ALIGN = [
  { v: "auto" as const, l: "ตามเดิม" },
  { v: "left" as const, l: "ซ้าย" },
  { v: "center" as const, l: "กลาง" },
  { v: "right" as const, l: "ขวา" },
];
/** ขนาดหัวข้อ — เว็บร้านแปลงเป็นขนาดที่ย่อตามจอ (s ≈ 22-26px · m ≈ 28-36 · l ≈ 34-48 · xl ≈ 40-64 · xxl ≈ 48-88) */
const H_SIZE: { v: TextSize; l: string }[] = [
  { v: "auto", l: "ตามเดิม" },
  { v: "s", l: "เล็ก" },
  { v: "m", l: "กลาง" },
  { v: "l", l: "ใหญ่" },
  { v: "xl", l: "ใหญ่มาก" },
  { v: "xxl", l: "ยักษ์" },
];

/**
 * แผง "รูปลักษณ์" — มีเหมือนกันทุกชนิด Section (แยกจากฟอร์มเนื้อหา)
 * เก็บเป็นชื่อขนาด/ชื่อสีจากธีม ไม่ใช่ค่า pixel หรือรหัสสีตรง ๆ → เว็บแต่ละร้านแปลงเป็นสเกลของตัวเอง
 * แท็บ "มือถือ" = ตั้งทับเฉพาะจอเล็ก (auto = ใช้ค่าเดียวกับคอม)
 *
 * mode: "all" = หัวพับได้ + 3 แท็บ (แบบเดิม) · "style" = เฉพาะ ทุกจอ/มือถือ ไม่มีหัว · "motion" = เฉพาะลูกเล่น ไม่มีหัว
 * (ตัวจัดหน้าใหม่แยก "รูปลักษณ์" กับ "ลูกเล่น" เป็นแท็บของแผงขวาเอง จึงเรียกทีละโหมด)
 */
export function StylePanel({
  value,
  onChange,
  defaultOpen = true,
  mode = "all",
  hasHeading = true,
  theme = DEFAULT_THEME_COLORS,
  fontNames = DEFAULT_FONT_NAMES,
  onPlay,
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
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"all" | "text" | "mobile" | "motion">(mode === "motion" ? "motion" : "all");
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
  const textTouched = JSON.stringify(s.text) !== JSON.stringify(DEFAULT_BLOCK_TEXT);
  const setM = (p: Partial<BlockStyle["mobile"]>) => onChange({ ...s, mobile: { ...s.mobile, ...p } });
  const setMo = (p: Partial<BlockMotion>) => onChange({ ...s, motion: { ...s.motion, ...p } });
  const motionTouched = JSON.stringify(s.motion) !== JSON.stringify(DEFAULT_MOTION);
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULT_BLOCK_STYLE);
  const mobileTouched = JSON.stringify(s.mobile) !== JSON.stringify(DEFAULT_BLOCK_STYLE.mobile);

  const tabs = [
    { k: "all" as const, l: "🖥️ ทุกจอ" },
    ...(hasHeading ? [{ k: "text" as const, l: `🔤 ตัวอักษร${textTouched ? " •" : ""}` }] : []),
    { k: "mobile" as const, l: `📲 มือถือ${mobileTouched ? " •" : ""}` },
    { k: "motion" as const, l: `✨ ลูกเล่น${motionTouched ? " •" : ""}` },
  ].filter((t) => (mode === "style" ? t.k !== "motion" : mode === "motion" ? t.k === "motion" : true));
  void showTab;

  return (
    <div className={bare ? "" : "pt-3 border-t border-slate-200"}>
      {!bare && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900">
          <span>{open ? "▾" : "▸"}</span>
          🎨 รูปลักษณ์
          {!isDefault && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] border border-blue-200">ปรับแล้ว</span>}
        </button>
      )}

      {(open || bare) && (
        <div className={bare ? "space-y-3" : "mt-3 space-y-3"}>
          {tabs.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {tabs.map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={`px-2.5 py-1 rounded-full border whitespace-nowrap ${tab === t.k ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                {t.l}
              </button>
            ))}
            {tab === "mobile" && <span className="basis-full text-slate-400 mt-0.5">ตั้งทับเฉพาะจอเล็ก · &quot;ตามเดิม&quot; = ใช้ค่าเดียวกับคอม</span>}
          </div>
          )}

          {tab === "motion" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="โผล่ตอนเลื่อนมาถึง (Entrance)">
                  <Seg
                    value={s.motion.entrance}
                    onChange={(v) => setMo({ entrance: v })}
                    options={[
                      { v: "none", l: "ไม่มี" },
                      { v: "fade-up", l: "ลอยขึ้น" },
                      { v: "fade-in", l: "จางเข้า" },
                      { v: "slide-left", l: "จากขวา" },
                      { v: "slide-right", l: "จากซ้าย" },
                      { v: "zoom", l: "ซูม" },
                      { v: "pop", l: "เด้ง" },
                      { v: "spin-in", l: "หมุนเข้า" },
                      { v: "blur", l: "เบลอ→ชัด" },
                    ]}
                  />
                </Field>
              </div>
              <Field label="ความเร็ว">
                <Seg wheel value={s.motion.speed} onChange={(v) => setMo({ speed: v })} options={[{ v: "fast", l: "เร็ว" }, { v: "normal", l: "ปกติ" }, { v: "slow", l: "ช้า" }]} />
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer self-end pb-2">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={s.motion.stagger} disabled={s.motion.entrance === "none"} onChange={(e) => setMo({ stagger: e.target.checked })} />
                การ์ด/ชิ้นย่อยโผล่ไล่กันทีละชิ้น
              </label>
              <div className="sm:col-span-2">
                <Field label="ตอนชี้เมาส์ (Hover) — มีผลกับการ์ดและรูปใน Section นี้">
                  <Seg value={s.motion.hover} onChange={(v) => setMo({ hover: v })} options={[{ v: "none", l: "ไม่มี" }, { v: "lift", l: "ยกตัว" }, { v: "zoom", l: "ซูมรูป" }, { v: "glow", l: "เรืองแสง" }]} />
                </Field>
              </div>
              {onPlay && (
                <button
                  type="button"
                  onClick={onPlay}
                  disabled={s.motion.entrance === "none" && s.motion.hover === "none"}
                  className="sm:col-span-2 justify-self-start rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                >
                  ▶ เล่นให้ดูอีกครั้ง
                </button>
              )}
              <p className="sm:col-span-2 text-[11px] text-slate-400">
                กดเลือกแล้วพรีวิวเล่นให้ดูทันที (ตอนชี้เมาส์ = ค้างให้ดูแป๊บหนึ่ง) · ขยับไม่เกิน 1 วิ · ลูกค้าที่ตั้งเครื่องว่า &quot;ลดการเคลื่อนไหว&quot; จะไม่เห็นลูกเล่น (ระบบปิดให้เอง)
              </p>
            </div>
          ) : tab === "text" ? (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400">มีผลกับหัวข้อใหญ่ · ตัวเล็กเหนือหัวข้อ · คำโปรยใต้หัวข้อ ของ Section นี้ (ไม่แตะชื่อสินค้า/การ์ด) · &quot;ตามเดิม&quot; = ตามธีมร้าน</p>
              <Field label="ฟอนต์หัวข้อ">
                <FontPickList value={s.text.font} onPick={(v) => setT({ font: v })} fontNames={fontNames} autoLabel="ตามเดิม (ฟอนต์หัวข้อของธีม)" />
              </Field>
              <Field label="ขนาดหัวข้อ (ย่อตามจอเอง)"><Seg wheel value={s.text.size} onChange={(v) => setT({ size: v })} options={H_SIZE} /></Field>
              <Field label="ความหนา">
                <Seg wheel value={s.text.weight} onChange={(v) => setT({ weight: v })} options={[{ v: "auto", l: "ตามเดิม" }, ...CANVAS_WEIGHTS]} />
              </Field>
              <Field label="สีหัวข้อ">
                <ColorSwatches theme={theme} value={s.text.color} hex={s.text.colorHex} autoLabel="ตามเดิม" onPick={(v, hex) => setT(v === "custom" ? { color: v, colorHex: hex ?? s.text.colorHex } : { color: v })} />
              </Field>
              <Field label="สีตัวเล็กเหนือหัวข้อ + คำโปรย">
                <ColorSwatches theme={theme} value={s.text.subColor} hex={s.text.subColorHex} autoLabel="ตามเดิม" onPick={(v, hex) => setT(v === "custom" ? { subColor: v, subColorHex: hex ?? s.text.subColorHex } : { subColor: v })} />
              </Field>
              {textTouched && (
                <button type="button" onClick={() => onChange({ ...s, text: { ...DEFAULT_BLOCK_TEXT } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                  คืนค่าตัวอักษรเป็นตามเดิม
                </button>
              )}
            </div>
          ) : tab === "all" ? (
            <div className="grid gap-3">
              <Field label="ระยะห่างด้านบน"><Seg wheel value={s.padTop} onChange={(v) => set({ padTop: v })} options={SPACE} /></Field>
              <Field label="ระยะห่างด้านล่าง"><Seg wheel value={s.padBottom} onChange={(v) => set({ padBottom: v })} options={SPACE} /></Field>
              <Field label="ความกว้างเนื้อหา">
                <Seg wheel value={s.width} onChange={(v) => set({ width: v })} options={[{ v: "auto", l: "ตามเดิม" }, { v: "narrow", l: "แคบ" }, { v: "full", l: "เต็มจอ" }]} />
              </Field>
              <Field label="จัดข้อความ"><Seg value={s.align} onChange={(v) => set({ align: v })} options={ALIGN} /></Field>
              <div>
                <Field label="พื้นหลังบล็อก">
                  <Seg
                    value={s.bg}
                    // เลือก "ไล่สี" ครั้งแรก = ใส่แบบสำเร็จแรกให้เลย (เห็นผลทันที)
                    onChange={(v) => set(v === "gradient" && !s.bgGrad ? { bg: v, bgGrad: GRADIENT_PRESETS[0].g } : { bg: v })}
                    options={[
                      { v: "auto", l: "ตามเดิม" },
                      { v: "page", l: "พื้นเว็บ" },
                      { v: "surface", l: "พื้นการ์ด" },
                      { v: "brand", l: "สีแบรนด์" },
                      { v: "ink", l: "เข้ม" },
                      { v: "custom", l: "เลือกเอง" },
                      { v: "gradient", l: "ไล่สี" },
                    ]}
                  />
                </Field>
                {s.bg === "gradient" && (
                  <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
                    <GradientPicker value={s.bgGrad ?? null} onChange={(g) => set({ bg: "gradient", bgGrad: g })} />
                  </div>
                )}
                {s.bg === "custom" && (
                  <div className="mt-2">
                    <ColorInput value={s.bgColor || "#ffffff"} onChange={(hex) => set({ bgColor: hex })} />
                    <p className="mt-1 text-[11px] text-amber-600">เลือกสีเองจะไม่เปลี่ยนตามธีมร้าน — ถ้าอยากให้เปลี่ยนตามธีมด้วย ใช้ &quot;สีแบรนด์&quot; หรือ &quot;พื้นการ์ด&quot;</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <Field label="ระยะห่างด้านบน (มือถือ)"><Seg wheel value={s.mobile.padTop} onChange={(v) => setM({ padTop: v })} options={SPACE} /></Field>
              <Field label="ระยะห่างด้านล่าง (มือถือ)"><Seg wheel value={s.mobile.padBottom} onChange={(v) => setM({ padBottom: v })} options={SPACE} /></Field>
              <Field label="จัดข้อความ (มือถือ)"><Seg value={s.mobile.align} onChange={(v) => setM({ align: v })} options={ALIGN} /></Field>
              {hasHeading && (
                <>
                  <div>
                    <Field label="ขนาดหัวข้อ (มือถือ)"><Seg wheel value={s.mobile.hSize} onChange={(v) => setM({ hSize: v })} options={H_SIZE} /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={s.mobile.hideEyebrow} onChange={(e) => setM({ hideEyebrow: e.target.checked })} />
                    ซ่อนตัวเล็กเหนือหัวข้อบนมือถือ
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={s.mobile.hideSub} onChange={(e) => setM({ hideSub: e.target.checked })} />
                    ซ่อนคำโปรยใต้หัวข้อบนมือถือ
                  </label>
                </>
              )}
              <p className="text-[11px] text-slate-400">ซ่อนทั้ง Section บนมือถือ → ใช้ &quot;แสดงบนจอ&quot; ด้านล่าง · ชิ้นย่อยซ่อนเฉพาะมือถือได้ที่ตัวชิ้น</p>
            </div>
          )}

          {mode === "motion" ? (
            motionTouched && (
              <button type="button" onClick={() => onChange({ ...s, motion: { ...DEFAULT_MOTION } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                คืนค่าเริ่มต้นของลูกเล่น
              </button>
            )
          ) : mode === "style" ? (
            JSON.stringify({ ...s, motion: undefined }) !== JSON.stringify({ ...DEFAULT_BLOCK_STYLE, motion: undefined }) && (
              <button type="button" onClick={() => onChange({ ...DEFAULT_BLOCK_STYLE, mobile: { ...DEFAULT_BLOCK_STYLE.mobile }, motion: { ...s.motion }, text: { ...DEFAULT_BLOCK_TEXT } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                คืนค่าเริ่มต้นของรูปลักษณ์
              </button>
            )
          ) : (
            !isDefault && (
              <button type="button" onClick={() => onChange({ ...DEFAULT_BLOCK_STYLE, mobile: { ...DEFAULT_BLOCK_STYLE.mobile }, motion: { ...DEFAULT_MOTION }, text: { ...DEFAULT_BLOCK_TEXT } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
                คืนค่าเริ่มต้นทั้งหมด
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
