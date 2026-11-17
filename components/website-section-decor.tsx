"use client";

/**
 * ✨ แผงของตกแต่งของ Section (แผงรูปลักษณ์ → แท็บ "✨ ตกแต่ง") — ของกลาง ใช้ได้กับทุกชนิด Section
 *
 * เพิ่ม : 🎀 คลังของตกแต่ง (ลายในตัว + ของร้าน: อัปโหลด / เลือกจากคลังไฟล์ — DecorLibrary ตัวเดียวกับผืนผ้าใบ) · 🔤 ข้อความ
 * ย้าย/ย่อขยาย/หมุน: ลากในพรีวิว (เว็บร้าน preview-decor.ts ส่ง storefront-decor-change → ตัวจัดหน้าแก้ x/y/w/size/rotate ให้) หรือเลื่อนแถบที่นี่
 * เลือก: กดชิ้นในพรีวิว (storefront-decor-select) หรือกดในรายการ — ตัวจัดหน้าคุม selId
 * ข้อมูล: BlockStyle.decor (lib/website-blocks.ts DecorItem · ตำแหน่ง/ขนาดเป็น % ของ Section) · เว็บร้านวาดที่ SectionLayers.tsx
 */
import { useState } from "react";
import { DecorLibrary } from "@/components/website-canvas-media";
import { CanvasShape } from "@/components/website-canvas-shapes";
import { FillLineControls, ShopPatternBox, ShopPatternControls, patternInsert } from "@/components/website-shop-pattern";
import { shopPatternRatio } from "@/lib/website-frames";
import { RangeInput } from "@/components/range-input";
import { Seg } from "@/components/website-block-editor";
import { ColorSwatches, FontPickList, fontFamilyOf, swatchesOf, type ThemeColors, type ThemeFontNames } from "@/components/website-text-pickers";
import { CANVAS_LINE_ONLY_SHAPES, CANVAS_SHAPE_LABEL, canvasShapeHasLine } from "@/lib/website-canvas";
import {
  DECOR_MAX,
  DECOR_SHAPE_RATIO,
  decorHideKey,
  decorIsCustom,
  decorPlaceOf,
  newDecor,
  patchDecorPlace,
  resetDecorPlace,
  type DecorAnim,
  type DecorItem,
  type DecorLayer,
  type DecorPlace,
  type DecorScreen,
} from "@/lib/website-blocks";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelEn } from "@/lib/website-schema-en";

const labelCls = webForm.label;
/** ลายที่ยืด/หดสัดส่วนได้ (ลายไอคอน เช่น โบว์/หัวใจ คงรูปเสมอ) */
const FREE_RATIO = ["pearls", "lace", "scallop", "wave", "line", "arch", "rect", "ellipse"];
const ANIM_OPTS: { v: DecorAnim; l: string }[] = [
  { v: "none", get l() { return tr("นิ่ง", "Still"); } },
  { v: "float", get l() { return tr("ลอย", "Float"); } },
  { v: "sway", get l() { return tr("แกว่ง", "Sway"); } },
  { v: "pulse", get l() { return tr("เต้น", "Pulse"); } },
  { v: "spin", get l() { return tr("หมุน", "Spin"); } },
  { v: "twinkle", get l() { return tr("กะพริบ", "Twinkle"); } },
  { v: "bounce", get l() { return tr("เด้ง", "Bounce"); } },
];
const LAYER_OPTS: { v: DecorLayer; l: string }[] = [
  { v: "back", get l() { return tr("หลังเนื้อหา", "Behind content"); } },
  { v: "front", get l() { return tr("หน้าเนื้อหา", "In front of content"); } },
];

/** 📱 จอที่ปรับแยกได้ (ตรงกับปุ่มจอของพรีวิว) */
const SCREENS: { v: DecorScreen; icon: string; l: string }[] = [
  { v: "desktop", icon: "🖥️", get l() { return tr("คอม", "Desktop"); } },
  { v: "tablet", icon: "📱", get l() { return tr("แท็บเล็ต", "Tablet"); } },
  { v: "mobile", icon: "📲", get l() { return tr("มือถือ", "Phone"); } },
];
const screenName = (s: DecorScreen) => SCREENS.find((x) => x.v === s)?.l ?? tr("คอม", "Desktop");

const imgUrl = (key: string, w = 160) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** สีจริงของชิ้น (วาดตัวอย่างในรายการ) — auto = สีแบรนด์ */
function hexOf(d: DecorItem, theme: ThemeColors): string {
  if (d.color === "custom" && d.colorHex) return d.colorHex;
  return swatchesOf(theme).find((s) => s.v === d.color)?.hex ?? theme.brand;
}

function Thumb({ d, theme, fontNames }: { d: DecorItem; theme: ThemeColors; fontNames: ThemeFontNames }) {
  const color = hexOf(d, theme);
  if (d.kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imgUrl(d.key)} alt="" className="w-full h-full object-contain" loading="lazy" />;
  if (d.kind === "text")
    return (
      <span className="block truncate text-center text-[15px] leading-9" style={{ color, fontFamily: `"${fontFamilyOf(d.font, fontNames)}", sans-serif` }}>
        {d.text}
      </span>
    );
  if (d.pattern) return <ShopPatternBox it={d} theme={theme} w={100} h={100 * d.ratio} />;
  const r = Math.min(1.4, Math.max(0.08, d.ratio));
  const line = d.lineColor && d.lineColor !== "none" ? (d.lineColor === "custom" ? d.lineColorHex || theme.brand : swatchesOf(theme).find((s) => s.v === d.lineColor)?.hex ?? theme.brand) : null;
  return <CanvasShape it={{ shape: d.shape, w: 60, h: 60 * r, outline: d.outline, strokeWidth: (d.strokeWidth || 2) * 0.6 }} color={color} line={line} />;
}

const nameOf = (d: DecorItem) =>
  d.kind === "image" ? tr("รูป", "Image") : d.kind === "text" ? `“${d.text}”` : d.pattern ? `🎨 ${d.pattern.name || tr("ลายของร้าน", "Shop pattern")}` : labelEn(CANVAS_SHAPE_LABEL[d.shape]) ?? tr("ลาย", "Pattern");

export function SectionDecorPanel({
  value,
  onChange,
  theme,
  fontNames,
  shopId,
  selId,
  onSel,
  screen: screenProp,
  onScreen,
}: {
  value: DecorItem[];
  onChange: (next: DecorItem[]) => void;
  theme: ThemeColors;
  fontNames: ThemeFontNames;
  /** ร้าน (เปิดคลังของตกแต่งของร้าน) — ไม่ส่ง = เพิ่มได้แค่ข้อความ */
  shopId?: string;
  selId: string | null;
  onSel: (id: string | null) => void;
  /** 📱 จอที่กำลังแก้ตำแหน่ง/ขนาด (ตัวจัดหน้าส่งจอพรีวิวมา · ไม่ส่ง = แผงจำเอง) · onScreen = สลับจอพรีวิวตาม */
  screen?: DecorScreen;
  onScreen?: (s: DecorScreen) => void;
}) {
  const t = useT();
  const [libOpen, setLibOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [localScreen, setLocalScreen] = useState<DecorScreen>("desktop");
  const screen = screenProp ?? localScreen;
  const pickScreen = (s: DecorScreen) => (onScreen ? onScreen(s) : setLocalScreen(s));
  const full = value.length >= DECOR_MAX;
  const sel = value.find((d) => d.id === selId) ?? null;
  // ตำแหน่ง/ขนาด/มุม ของจอที่กำลังแก้ (แท็บเล็ต/มือถือ ไม่ได้ปรับแยก = ค่าคอม)
  const place = sel ? decorPlaceOf(sel, screen) : null;
  const setPlace = (p: Partial<DecorPlace>) => sel && onChange(value.map((d) => (d.id === sel.id ? patchDecorPlace(d, screen, p) : d)));

  const add = (d: DecorItem) => {
    if (full) return;
    onChange([...value, d]);
    onSel(d.id);
  };
  const patch = (id: string, p: Partial<DecorItem>) => onChange(value.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const remove = (id: string) => {
    onChange(value.filter((d) => d.id !== id));
    if (selId === id) onSel(null);
  };
  // ทำซ้ำ = เหลื่อมทุกจอ (ไม่ทับชิ้นเดิมสนิทบนจอที่ปรับแยกไว้)
  const nudge = (p: DecorPlace | null) => (p ? { ...p, x: Math.min(100, p.x + 4), y: Math.min(100, p.y + 4) } : null);
  const dup = (d: DecorItem) => add({ ...newDecor(d.kind), ...d, id: newDecor(d.kind).id, x: Math.min(100, d.x + 4), y: Math.min(100, d.y + 4), tab: nudge(d.tab), mob: nudge(d.mob) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={full || !shopId}
          onClick={() => setLibOpen(true)}
          title={shopId ? t("ลายในตัว · ของร้าน (อัปโหลด / เลือกจากคลังไฟล์)", "Built-in patterns · shop's own (upload / pick from file library)") : t("ต้องเลือกร้านก่อน", "Pick a shop first")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50"
        >
          {t("🎀 เพิ่มลาย / รูป", "🎀 Add pattern / image")}
        </button>
        <button type="button" disabled={full} onClick={() => add(newDecor("text", {}, value.length))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50">
          {t("🔤 เพิ่มข้อความ", "🔤 Add text")}
        </button>
        <span className="ml-auto text-[11px] text-slate-400">
          {value.length}/{DECOR_MAX} {t("ชิ้น", "items")}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
        {t("💡 ในพรีวิว:", "💡 In the preview:")} <b>{t("ลากชิ้น", "drag item")}</b> = {t("ย้าย", "move")} · <b>{t("ลากมุม", "drag corner")}</b> = {t("ย่อ/ขยาย", "resize")} · <b>{t("ลากปุ่ม ↻", "drag ↻")}</b> = {t("หมุน (กด Shift = ทีละ 15°) · ตำแหน่ง/ขนาดยืดตามความกว้างจอ", "rotate (Shift = 15° steps) · position/size scale with screen width")}
      </p>

      {value.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">{t('ยังไม่มีของตกแต่ง — กด "🎀 เพิ่มลาย / รูป" หรือ "🔤 เพิ่มข้อความ"', 'No decorations yet — tap "🎀 Add pattern / image" or "🔤 Add text"')}</p>
      ) : (
        <ul className="space-y-1">
          {value.map((d, i) => (
            <li
              key={d.id}
              onClick={() => onSel(d.id === selId ? null : d.id)}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-pointer ${d.id === selId ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-400"}`}
            >
              <span className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-1">
                <Thumb d={d} theme={theme} fontNames={fontNames} />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                {nameOf(d)}
                <span className="ml-1 text-[10px] text-slate-400">
                  {d.layer === "front" ? t("· หน้าเนื้อหา", "· in front") : ""}
                  {d.anim !== "none" ? ` · ${ANIM_OPTS.find((o) => o.v === d.anim)?.l}` : ""}
                  {(() => {
                    const hid = SCREENS.filter((s) => d[decorHideKey(s.v)]).map((s) => s.l);
                    const own = SCREENS.filter((s) => s.v !== "desktop" && decorIsCustom(d, s.v)).map((s) => s.l);
                    return `${hid.length ? t(` · ซ่อน${hid.join("/")}`, ` · hidden on ${hid.join("/")}`) : ""}${own.length ? t(` · ปรับแยก${own.join("/")}`, ` · separate on ${own.join("/")}`) : ""}`;
                  })()}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                <button type="button" title={t("ไว้ล่าง (ถูกชิ้นอื่นทับ)", "Send back (others on top)")} disabled={i === 0} onClick={() => move(i, -1)} className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" title={t("ไว้บน (ทับชิ้นอื่น)", "Bring forward (on top of others)")} disabled={i === value.length - 1} onClick={() => move(i, 1)} className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30">
                  ↓
                </button>
                <button type="button" title={t("ทำซ้ำ", "Duplicate")} disabled={full} onClick={() => dup(d)} className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30">
                  ⧉
                </button>
                <button type="button" title={t("เอาออก", "Remove")} onClick={() => remove(d.id)} className="h-6 w-6 rounded text-red-600 hover:bg-red-50">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-700">{t("แก้ชิ้นที่เลือก:", "Editing:")} {nameOf(sel)}</p>
          {/* 📱 ตำแหน่ง/ขนาด/มุม แยกตามจอ — สลับแล้วพรีวิวสลับจอตาม */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
            <p className="text-[11px] font-medium text-slate-500">{t("ตำแหน่ง / ขนาด / มุม ของจอ", "Position / size / angle per screen")}</p>
            <div className="flex gap-1">
              {SCREENS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => pickScreen(s.v)}
                  className={`flex-1 rounded-md border px-1.5 py-1 text-[11px] ${screen === s.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
                >
                  {s.icon} {s.l}
                  {s.v !== "desktop" && decorIsCustom(sel, s.v) && <span className="ml-1 text-[9px] text-emerald-600">{t("● แยก", "● separate")}</span>}
                </button>
              ))}
            </div>
            {screen === "desktop" ? (
              <p className="text-[11px] text-slate-500">{t("ค่าหลัก — แท็บเล็ต/มือถือที่ยังไม่ปรับแยกจะใช้ค่านี้ตาม", "Main values — tablet/phone without separate values follow these")}</p>
            ) : decorIsCustom(sel, screen) ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-emerald-700">✓ {t(`${screenName(screen)}ปรับแยกแล้ว (แก้คอมแล้วจอนี้ไม่เปลี่ยนตาม)`, `${screenName(screen)} has separate values (desktop edits won't change it)`)}</span>
                <button type="button" onClick={() => onChange(value.map((d) => (d.id === sel.id ? resetDecorPlace(d, screen) : d)))} className="text-blue-600 hover:underline">
                  {t("↩ กลับไปใช้ตามคอม", "↩ Follow desktop again")}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">{t(`ตอนนี้${screenName(screen)}ใช้ตามคอม — ลากในพรีวิว (จอ${screenName(screen)}) หรือเลื่อนแถบด้านล่าง = ปรับแยกให้จอนี้เลย`, `${screenName(screen)} currently follows desktop — drag in the preview (${screenName(screen)} screen) or move the sliders below = separate values for this screen`)}</p>
            )}
            {sel[decorHideKey(screen)] && <p className="text-[11px] text-amber-700">{t(`⚠️ ชิ้นนี้ซ่อนบน${screenName(screen)}อยู่ — ในพรีวิวจอนี้จะไม่เห็น (เปิดได้ที่ "แสดงบน" ด้านล่าง)`, `⚠️ This item is hidden on ${screenName(screen)} — not visible in this screen's preview (turn on under "Show on" below)`)}</p>}
          </div>
          {sel.kind === "text" && (
            <>
              <div>
                <label className={labelCls}>{t("ข้อความ", "Text")}</label>
                <input value={sel.text} maxLength={120} onChange={(e) => patch(sel.id, { text: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                {!sel.text.trim() && <p className="mt-1 text-[11px] text-red-600">{t("ข้อความว่าง — ตอนบันทึกชิ้นนี้จะถูกเอาออก", "Empty text — this item will be removed on save")}</p>}
              </div>
              <div>
                <button type="button" onClick={() => setFontOpen((v) => !v)} className={labelCls + " hover:text-slate-800"}>
                  {fontOpen ? "▾" : "▸"} {t("ฟอนต์:", "Font:")} <span style={{ fontFamily: `"${fontFamilyOf(sel.font, fontNames)}", sans-serif` }}>{fontFamilyOf(sel.font, fontNames)}</span>
                </button>
                {fontOpen && <FontPickList value={sel.font} onPick={(v) => patch(sel.id, { font: v })} fontNames={fontNames} sample={sel.text || "Aa ก ข"} />}
              </div>
              <div>
                <label className={labelCls}>{t("ขนาดตัวอักษร", "Font size")} · {screenName(screen)} {t("(จอแคบกว่า 1200px ย่อตามความกว้างจอ)", "(screens narrower than 1200px scale down)")}</label>
                <RangeInput value={place!.size} min={10} max={240} step={2} unit="px" onChange={(v) => setPlace({ size: v })} />
              </div>
            </>
          )}
          {sel.kind === "shape" && sel.pattern && (
            <ShopPatternControls it={sel} theme={theme} onPatch={(p) => patch(sel.id, p as Partial<DecorItem>)} boxW={100} boxH={100 * sel.ratio} minWidth={0.5} widthStep={0.5} />
          )}
          {/* 🎨 ลายในตัวที่มีพื้น: สีพื้น + สีเส้น + ความหนา (ของกลางเดียวกับผืนผ้าใบ) */}
          {sel.kind === "shape" && !sel.pattern && canvasShapeHasLine(sel.shape) && (
            <FillLineControls it={sel} theme={theme} onPatch={(p) => patch(sel.id, p as Partial<DecorItem>)} minWidth={0.5} widthStep={0.5} />
          )}
          {sel.kind !== "image" && !sel.pattern && !(sel.kind === "shape" && canvasShapeHasLine(sel.shape)) && (
            <div>
              <label className={labelCls}>{t("สี", "Color")}</label>
              <ColorSwatches theme={theme} value={sel.color === "auto" ? "brand" : sel.color} hex={sel.colorHex} onPick={(v, hex) => patch(sel.id, v === "custom" ? { color: v, colorHex: hex ?? sel.colorHex } : { color: v })} />
            </div>
          )}
          {sel.kind === "shape" && !sel.pattern && CANVAS_LINE_ONLY_SHAPES.includes(sel.shape) && (
            <div>
              <label className={labelCls}>{t("ความหนาเส้น", "Line thickness")}</label>
              <RangeInput value={sel.strokeWidth} min={0.5} max={12} step={0.5} hardMax={24} unit="px" onChange={(v) => patch(sel.id, { strokeWidth: v })} />
            </div>
          )}
          {sel.kind !== "text" && (
            <div>
              <label className={labelCls}>{t("ความกว้าง (% ของ Section)", "Width (% of section)")} · {screenName(screen)}</label>
              <RangeInput value={place!.w} min={1} max={80} step={0.5} hardMax={100} unit="%" onChange={(v) => setPlace({ w: v })} />
            </div>
          )}
          {sel.kind === "shape" && FREE_RATIO.includes(sel.shape) && (
            <div>
              <label className={labelCls}>{t("ความสูงเทียบความกว้าง", "Height relative to width")}</label>
              <RangeInput value={Math.round(sel.ratio * 100)} min={2} max={200} step={1} hardMax={400} unit="%" onChange={(v) => patch(sel.id, { ratio: v / 100 })} />
              <button type="button" onClick={() => patch(sel.id, { ratio: DECOR_SHAPE_RATIO[sel.shape] ?? 1 })} className="mt-1 text-[11px] text-blue-600 hover:underline">
                {t("คืนสัดส่วนเดิม", "Reset ratio")}
              </button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("ซ้าย ↔ ขวา", "Left ↔ right")} · {screenName(screen)}</label>
              <RangeInput value={place!.x} min={0} max={100} step={0.5} hardMin={-20} hardMax={120} unit="%" onChange={(v) => setPlace({ x: v })} />
            </div>
            <div>
              <label className={labelCls}>{t("บน ↕ ล่าง", "Top ↕ bottom")} · {screenName(screen)}</label>
              <RangeInput value={place!.y} min={0} max={100} step={0.5} hardMin={-20} hardMax={120} unit="%" onChange={(v) => setPlace({ y: v })} />
            </div>
            <div>
              <label className={labelCls}>{t("หมุน", "Rotate")} · {screenName(screen)}</label>
              <RangeInput value={place!.rotate} min={-180} max={180} step={1} unit="°" onChange={(v) => setPlace({ rotate: v })} />
            </div>
            <div>
              <label className={labelCls}>{t("ความทึบ", "Opacity")}</label>
              <RangeInput value={sel.opacity} min={5} max={100} step={5} unit="%" onChange={(v) => patch(sel.id, { opacity: v })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("ชั้น", "Layer")}</label>
            <Seg<DecorLayer> value={sel.layer} onChange={(v) => patch(sel.id, { layer: v })} options={LAYER_OPTS} />
            <p className="mt-1 text-[11px] text-slate-400">{sel.layer === "front" ? t("ทับสินค้า/ข้อความได้ (ลูกค้ายังกดของข้างใต้ได้ตามปกติ)", "Can cover products/text (customers can still tap what's underneath)") : t("อยู่หลังสินค้า/ข้อความ ทับแค่พื้นหลัง", "Behind products/text, covers only the background")}</p>
          </div>
          <div>
            <label className={labelCls}>{t("ขยับตลอดเวลา", "Animate continuously")}</label>
            <Seg<DecorAnim> value={sel.anim} onChange={(v) => patch(sel.id, { anim: v })} options={ANIM_OPTS} />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={sel.flip} onChange={(e) => patch(sel.id, { flip: e.target.checked })} />
              {t("กลับซ้าย-ขวา", "Flip left-right")}
            </label>
          </div>
          <div>
            <label className={labelCls}>{t("แสดงบน", "Show on")}</label>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700">
              {SCREENS.map((s) => (
                <label key={s.v} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={!sel[decorHideKey(s.v)]} onChange={(e) => patch(sel.id, { [decorHideKey(s.v)]: !e.target.checked })} />
                  {s.icon} {s.l}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {shopId && (
        <DecorLibrary
          open={libOpen}
          onClose={() => setLibOpen(false)}
          shopId={shopId}
          color={theme.brand}
          onPickShape={(shape) => add(newDecor("shape", { shape, outline: shape === "rect" || shape === "ellipse" || shape === "arch" }, value.length))}
          onPickSticker={(img) => add(newDecor("image", { key: img.key, ratio: img.w > 0 && img.h > 0 ? Math.round((img.h / img.w) * 100) / 100 : 1 }, value.length))}
          onPickPattern={(pattern) => add(newDecor("shape", { ...patternInsert(pattern, 100, 0.5), ratio: shopPatternRatio(pattern), w: 14 }, value.length))}
        />
      )}
    </div>
  );
}
