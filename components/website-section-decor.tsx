"use client";

/**
 * ✨ แผงของตกแต่งของ Section (แผงรูปลักษณ์ → แท็บ "✨ ตกแต่ง") — ของกลาง ใช้ได้กับทุกชนิด Section
 *
 * เพิ่ม : 🎀 คลังของตกแต่ง (ลายในตัว + ของร้าน: อัปโหลด / เลือกจากคลังไฟล์ — DecorLibrary ตัวเดียวกับผืนผ้าใบ) · 🔤 ข้อความ
 * ย้าย : ลากชิ้นในพรีวิว (เว็บร้านส่ง storefront-decor-change → ตัวจัดหน้าแก้ x/y ให้) หรือเลื่อน "ซ้าย-ขวา / บน-ล่าง" ที่นี่
 * เลือก: กดชิ้นในพรีวิว (storefront-decor-select) หรือกดในรายการ — ตัวจัดหน้าคุม selId
 * ข้อมูล: BlockStyle.decor (lib/website-blocks.ts DecorItem · ตำแหน่ง/ขนาดเป็น % ของ Section) · เว็บร้านวาดที่ SectionLayers.tsx
 */
import { useState } from "react";
import { DecorLibrary } from "@/components/website-canvas-media";
import { CanvasShape } from "@/components/website-canvas-shapes";
import { RangeInput } from "@/components/range-input";
import { Seg } from "@/components/website-block-editor";
import { ColorSwatches, FontPickList, fontFamilyOf, swatchesOf, type ThemeColors, type ThemeFontNames } from "@/components/website-text-pickers";
import { CANVAS_SHAPE_LABEL } from "@/lib/website-canvas";
import { DECOR_MAX, DECOR_SHAPE_RATIO, newDecor, type DecorAnim, type DecorItem, type DecorLayer } from "@/lib/website-blocks";

const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
/** ลายที่ยืด/หดสัดส่วนได้ (ลายไอคอน เช่น โบว์/หัวใจ คงรูปเสมอ) */
const FREE_RATIO = ["pearls", "lace", "scallop", "wave", "line", "arch", "rect", "ellipse"];
const ANIM_OPTS: { v: DecorAnim; l: string }[] = [
  { v: "none", l: "นิ่ง" },
  { v: "float", l: "ลอย" },
  { v: "sway", l: "แกว่ง" },
  { v: "pulse", l: "เต้น" },
  { v: "spin", l: "หมุน" },
  { v: "twinkle", l: "กะพริบ" },
  { v: "bounce", l: "เด้ง" },
];
const LAYER_OPTS: { v: DecorLayer; l: string }[] = [
  { v: "back", l: "หลังเนื้อหา" },
  { v: "front", l: "หน้าเนื้อหา" },
];

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
  const r = Math.min(1.4, Math.max(0.08, d.ratio));
  return <CanvasShape it={{ shape: d.shape, w: 60, h: 60 * r, outline: d.outline, strokeWidth: 2 }} color={color} />;
}

const nameOf = (d: DecorItem) => (d.kind === "image" ? "รูป" : d.kind === "text" ? `“${d.text}”` : CANVAS_SHAPE_LABEL[d.shape] ?? "ลาย");

export function SectionDecorPanel({
  value,
  onChange,
  theme,
  fontNames,
  shopId,
  selId,
  onSel,
}: {
  value: DecorItem[];
  onChange: (next: DecorItem[]) => void;
  theme: ThemeColors;
  fontNames: ThemeFontNames;
  /** ร้าน (เปิดคลังของตกแต่งของร้าน) — ไม่ส่ง = เพิ่มได้แค่ข้อความ */
  shopId?: string;
  selId: string | null;
  onSel: (id: string | null) => void;
}) {
  const [libOpen, setLibOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const full = value.length >= DECOR_MAX;
  const sel = value.find((d) => d.id === selId) ?? null;

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
  const dup = (d: DecorItem) => add({ ...newDecor(d.kind), ...d, id: newDecor(d.kind).id, x: Math.min(100, d.x + 4), y: Math.min(100, d.y + 4) });
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
          title={shopId ? "ลายในตัว · ของร้าน (อัปโหลด / เลือกจากคลังไฟล์)" : "ต้องเลือกร้านก่อน"}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50"
        >
          🎀 เพิ่มลาย / รูป
        </button>
        <button type="button" disabled={full} onClick={() => add(newDecor("text", {}, value.length))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50">
          🔤 เพิ่มข้อความ
        </button>
        <span className="ml-auto text-[11px] text-slate-400">
          {value.length}/{DECOR_MAX} ชิ้น
        </span>
      </div>
      <p className="text-[11px] text-slate-500 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
        💡 <b>ลากชิ้นในพรีวิว</b>เพื่อย้ายตำแหน่ง · กดชิ้นในพรีวิวเพื่อเลือกมาแก้ · ตำแหน่ง/ขนาดยืดตามความกว้างจอ (ทุกจอสัดส่วนเดิม)
      </p>

      {value.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">ยังไม่มีของตกแต่ง — กด &quot;🎀 เพิ่มลาย / รูป&quot; หรือ &quot;🔤 เพิ่มข้อความ&quot;</p>
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
                  {d.layer === "front" ? "· หน้าเนื้อหา" : ""}
                  {d.anim !== "none" ? ` · ${ANIM_OPTS.find((o) => o.v === d.anim)?.l}` : ""}
                  {d.hideMobile ? " · ซ่อนมือถือ" : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                <button type="button" title="ไว้ล่าง (ถูกชิ้นอื่นทับ)" disabled={i === 0} onClick={() => move(i, -1)} className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" title="ไว้บน (ทับชิ้นอื่น)" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30">
                  ↓
                </button>
                <button type="button" title="ทำซ้ำ" disabled={full} onClick={() => dup(d)} className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30">
                  ⧉
                </button>
                <button type="button" title="เอาออก" onClick={() => remove(d.id)} className="h-6 w-6 rounded text-red-600 hover:bg-red-50">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-700">แก้ชิ้นที่เลือก: {nameOf(sel)}</p>
          {sel.kind === "text" && (
            <>
              <div>
                <label className={labelCls}>ข้อความ</label>
                <input value={sel.text} maxLength={120} onChange={(e) => patch(sel.id, { text: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                {!sel.text.trim() && <p className="mt-1 text-[11px] text-red-600">ข้อความว่าง — ตอนบันทึกชิ้นนี้จะถูกเอาออก</p>}
              </div>
              <div>
                <button type="button" onClick={() => setFontOpen((v) => !v)} className={labelCls + " hover:text-slate-800"}>
                  {fontOpen ? "▾" : "▸"} ฟอนต์: <span style={{ fontFamily: `"${fontFamilyOf(sel.font, fontNames)}", sans-serif` }}>{fontFamilyOf(sel.font, fontNames)}</span>
                </button>
                {fontOpen && <FontPickList value={sel.font} onPick={(v) => patch(sel.id, { font: v })} fontNames={fontNames} sample={sel.text || "Aa ก ข"} />}
              </div>
              <div>
                <label className={labelCls}>ขนาดตัวอักษร (บนคอม · จอแคบย่อตาม)</label>
                <RangeInput value={sel.size} min={10} max={240} step={2} unit="px" onChange={(v) => patch(sel.id, { size: v })} />
              </div>
            </>
          )}
          {sel.kind !== "image" && (
            <div>
              <label className={labelCls}>สี</label>
              <ColorSwatches theme={theme} value={sel.color === "auto" ? "brand" : sel.color} hex={sel.colorHex} onPick={(v, hex) => patch(sel.id, v === "custom" ? { color: v, colorHex: hex ?? sel.colorHex } : { color: v })} />
            </div>
          )}
          {sel.kind === "shape" && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={sel.outline} onChange={(e) => patch(sel.id, { outline: e.target.checked })} />
                แบบเส้นขอบ (ไม่ทึบ)
              </label>
            </div>
          )}
          {sel.kind !== "text" && (
            <div>
              <label className={labelCls}>ความกว้าง (% ของ Section)</label>
              <RangeInput value={sel.w} min={1} max={80} step={0.5} hardMax={100} unit="%" onChange={(v) => patch(sel.id, { w: v })} />
            </div>
          )}
          {sel.kind === "shape" && FREE_RATIO.includes(sel.shape) && (
            <div>
              <label className={labelCls}>ความสูงเทียบความกว้าง</label>
              <RangeInput value={Math.round(sel.ratio * 100)} min={2} max={200} step={1} hardMax={400} unit="%" onChange={(v) => patch(sel.id, { ratio: v / 100 })} />
              <button type="button" onClick={() => patch(sel.id, { ratio: DECOR_SHAPE_RATIO[sel.shape] ?? 1 })} className="mt-1 text-[11px] text-blue-600 hover:underline">
                คืนสัดส่วนเดิม
              </button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>ซ้าย ↔ ขวา</label>
              <RangeInput value={sel.x} min={0} max={100} step={0.5} hardMin={-20} hardMax={120} unit="%" onChange={(v) => patch(sel.id, { x: v })} />
            </div>
            <div>
              <label className={labelCls}>บน ↕ ล่าง</label>
              <RangeInput value={sel.y} min={0} max={100} step={0.5} hardMin={-20} hardMax={120} unit="%" onChange={(v) => patch(sel.id, { y: v })} />
            </div>
            <div>
              <label className={labelCls}>หมุน</label>
              <RangeInput value={sel.rotate} min={-180} max={180} step={1} unit="°" onChange={(v) => patch(sel.id, { rotate: v })} />
            </div>
            <div>
              <label className={labelCls}>ความทึบ</label>
              <RangeInput value={sel.opacity} min={5} max={100} step={5} unit="%" onChange={(v) => patch(sel.id, { opacity: v })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>ชั้น</label>
            <Seg<DecorLayer> value={sel.layer} onChange={(v) => patch(sel.id, { layer: v })} options={LAYER_OPTS} />
            <p className="mt-1 text-[11px] text-slate-400">{sel.layer === "front" ? "ทับสินค้า/ข้อความได้ (ลูกค้ายังกดของข้างใต้ได้ตามปกติ)" : "อยู่หลังสินค้า/ข้อความ ทับแค่พื้นหลัง"}</p>
          </div>
          <div>
            <label className={labelCls}>ขยับตลอดเวลา</label>
            <Seg<DecorAnim> value={sel.anim} onChange={(v) => patch(sel.id, { anim: v })} options={ANIM_OPTS} />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={sel.flip} onChange={(e) => patch(sel.id, { flip: e.target.checked })} />
              กลับซ้าย-ขวา
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={sel.hideMobile} onChange={(e) => patch(sel.id, { hideMobile: e.target.checked })} />
              ซ่อนบนมือถือ
            </label>
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
        />
      )}
    </div>
  );
}
