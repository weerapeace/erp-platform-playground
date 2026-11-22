"use client";

// ข้อความจัดรูปแบบในกล่องของกระดาน flowchart กลาง (เจ้าของเลือก 2026-11-19 แบบ B "จัดเฉพาะคำที่เลือก" + ข้อ 1,2,3,4,6)
//   RichText      = แสดงข้อความจัดรูปแบบในกล่อง (ผ่าน sanitizeRich เสมอ)
//   RichEditor    = ช่องพิมพ์ (ดับเบิลคลิกกล่อง) + แถบไอคอนจัดคำที่เลือก: หนา เอียง ขีดเส้นใต้ ขีดฆ่า ขนาด จัดชิด รายการ สี ล้างรูปแบบ
//                   ไม่เลือกคำ = สี/ขนาด ใช้กับทั้งกล่อง · Ctrl+Z ย้อนในช่องพิมพ์ได้ · ยืดตามข้อความ + ลากขอบขวาขยายกว้าง
//   BoxFormatBar  = แถบจัดทั้งกล่อง (เลือก 1 หรือหลายกล่อง ไม่ต้องดับเบิลคลิก) + สีพื้น/เส้นขอบ RGB
//   ColorPanel    = ตัวเลือกสีกลาง (components/color-picker) + ช่อง R G B + 8 สีที่ใช้ล่าสุด (จำต่อเครื่อง)
// ตรรกะล้วน/ตัวกรอง = lib/flowchart-rich

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { ColorPicker } from "@/components/color-picker";
import { RICH_SIZES, sanitizeRich, type FlowAlign, type RichWrap } from "@/lib/flowchart-rich";
import { FontSelect, type FontOption } from "@/components/font-select";
import { TextFormatBar, applyTextShortcut, domTextAdapter, isInTextBar, useLinkRequest } from "@/components/text-format-bar";
import { WEB_FONT_NAMES, webFontOptions } from "@/components/website-text-pickers";

const RECENT_KEY = "flowchart-recent-colors";
function readRecent(): string[] { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : []; } catch { return []; } }
export function useRecentColors(): [string[], (c: string) => void] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => { setList(readRecent()); }, []);
  const push = (c: string) => {
    const next = [c.toLowerCase(), ...readRecent().filter((x) => x !== c.toLowerCase())].slice(0, 8);
    setList(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* จำไม่ได้ก็ไม่เป็นไร */ }
  };
  return [list, push];
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v) || 0)).toString(16).padStart(2, "0")).join("");

/** แสดงข้อความจัดรูปแบบ */
export function RichText({ html, align, color }: { html: string; align: FlowAlign; color: string }) {
  return (
    <div className="fc-rich pointer-events-none w-full break-words leading-snug" style={{ textAlign: align, color, fontSize: 12 }}
      dangerouslySetInnerHTML={{ __html: sanitizeRich(html) }} />
  );
}

/** แผงเลือกสี: สีล่าสุด · ตัวเลือกสีกลาง (ลาก + HEX) · ช่อง R G B · ปุ่มคืนค่า (ถ้าส่ง onReset) */
export function ColorPanel({ value, onChange, onReset, resetLabel, t }: {
  value: string; onChange: (hex: string) => void; onReset?: () => void; resetLabel?: string; t: (th: string, en: string) => string;
}) {
  const [recent, pushRecent] = useRecentColors();
  const [rgb, setRgb] = useState(() => hexToRgb(value));
  const last = useRef<string | null>(null);   // สีที่เลือกจริงในแผงนี้ (ไม่เลือก = ไม่จำ)
  useEffect(() => { setRgb(hexToRgb(value)); }, [value]);
  const pick = (hex: string) => { last.current = hex; onChange(hex); };
  // ปิดแผง = จำสีล่าสุดที่ใช้
  useEffect(() => () => { if (last.current && /^#[0-9a-f]{6}$/i.test(last.current)) pushRecent(last.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setCh = (i: number, v: string) => { const n = [...rgb] as [number, number, number]; n[i] = Math.max(0, Math.min(255, Number(v) || 0)); setRgb(n); pick(rgbToHex(...n)); };
  return (
    <div className="w-[236px] space-y-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recent.map((c) => <button key={c} type="button" title={c} onClick={() => pick(c)} className="h-5 w-5 rounded border border-slate-300" style={{ background: c }} />)}
        </div>
      )}
      <ColorPicker value={value} onChange={pick} />
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        {(["R", "G", "B"] as const).map((ch, i) => (
          <label key={ch} className="flex items-center gap-0.5">{ch}
            <input type="number" min={0} max={255} value={rgb[i]} onChange={(e) => setCh(i, e.target.value)}
              className="h-6 w-[46px] rounded border border-slate-200 px-1 text-[11px] text-slate-700" />
          </label>
        ))}
      </div>
      {onReset && <button type="button" onClick={onReset} className="w-full rounded border border-slate-200 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">{resetLabel ?? t("คืนค่าเดิม", "Reset")}</button>}
    </div>
  );
}

const IB = "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100";
const IBon = "bg-violet-100 text-violet-700";
function IconBtn({ icon, title, on, onClick }: { icon: string; title: string; on?: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`${IB} ${on ? IBon : ""}`}><Icon value={icon} /></button>;
}
const Sep = () => <span className="mx-0.5 h-5 w-px bg-slate-200" />;
function SizeSelect({ onPick, title }: { onPick: (px: number) => void; title: string }) {
  return (
    <label className={`${IB} relative w-auto gap-0.5 px-1`} title={title}>
      <Icon value="i:text-size" />
      <select value="" onChange={(e) => { const v = Number(e.target.value); if (v) onPick(v); }} aria-label={title}
        className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">-</option>
        {RICH_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
      </select>
      <Icon value="i:chevron-down" />
    </label>
  );
}

/**
 * ช่องพิมพ์ข้อความจัดรูปแบบ (ดับเบิลคลิกกล่อง) — คลิกข้างนอก / Ctrl+Enter = บันทึก · Esc = ยกเลิก
 * onDone(html | null, ขนาดช่องพิมพ์) — html ยังไม่กรอง (ผู้เรียกกรองด้วย sanitizeRich)
 */
export function RichEditor({ initialHtml, boxW, boxH, textColor, onDone, t }: {
  initialHtml: string; boxW?: number; boxH?: number; textColor: string;
  onDone: (html: string | null, size?: { w: number; h: number }) => void; t: (th: string, en: string) => string;
}) {
  const ed = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ed.current; if (!el) return;
    el.innerHTML = sanitizeRich(initialHtml) || "<div><br></div>";
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el);
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* เบราว์เซอร์เก่า */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (save: boolean) => {
    if (done.current) return; done.current = true;
    const el = ed.current;
    onDone(save && el ? el.innerHTML : null, save && el ? { w: el.offsetWidth + 8, h: el.offsetHeight + 8 } : undefined);
  };
  const [linkReq, askLink] = useLinkRequest();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
    if (ed.current) applyTextShortcut(e, domTextAdapter(ed.current), askLink);
  };
  return (
    <div className="nodrag nowheel nopan absolute left-1 top-1 z-20"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null) && !isInTextBar(e.relatedTarget)) finish(true); }}>
      {/* แถบจัดข้อความ = ของกลาง components/text-format-bar (เจ้าของสั่ง 2026-11-22) · มือถือติดเหนือแป้นพิมพ์ */}
      <div className="absolute bottom-full left-0 mb-1.5">
        {ready && ed.current && <TextFormatBar t={t} adapter={domTextAdapter(ed.current)} linkRequest={linkReq} />}
      </div>
      <div ref={ed} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        title={t("ลากคลุมคำแล้วกดปุ่มด้านบน · คลิกข้างนอก / Ctrl+Enter = บันทึก · Esc = ยกเลิก · ลากขอบขวา = ขยายกว้าง", "Select words then use the bar · click outside / Ctrl+Enter to save · Esc to cancel")}
        onKeyDown={key}
        onPaste={(e) => { e.preventDefault(); const txt = e.clipboardData.getData("text/plain"); try { document.execCommand("insertText", false, txt); } catch { /* ไม่รองรับ */ } }}
        className="fc-rich rounded-md border border-violet-300 bg-white px-1.5 py-1 text-[12px] leading-snug shadow-sm outline-none focus:ring-2 focus:ring-violet-200"
        style={{ width: Math.max(160, (boxW ?? 0) - 8), minHeight: Math.max(40, (boxH ?? 0) - 8), color: textColor, resize: "horizontal", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }} />
    </div>
  );
}

/** แถบจัดทั้งกล่อง (เลือกกล่องแล้วกด "Aa" บนแถบลอย) — ใช้ได้กับหลายกล่องพร้อมกัน */
export type BoxFormatOp = { wrap?: RichWrap; align?: FlowAlign; fill?: string | null; stroke?: string | null; clear?: boolean; font?: string | null };
/** ฟอนต์ที่เลือกได้ในกล่อง = ฟอนต์ Google ชุดเดียวกับธีมเว็บ (lib/website-theme GOOGLE_FONTS) + "ฟอนต์ปกติ" */
const BOX_FONT_OPTIONS: FontOption[] = [{ value: "", label: "ฟอนต์ปกติ", family: null }, ...webFontOptions()];
export function BoxFormatBar({ onApply, t, fill, stroke, textColor, font = "" }: { onApply: (op: BoxFormatOp) => void; t: (th: string, en: string) => string; fill: string; stroke: string; textColor: string; font?: string }) {
  const [panel, setPanel] = useState<null | "text" | "fill" | "stroke">(null);
  const [txt, setTxt] = useState(textColor);
  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
        <IconBtn icon="i:bold" title={t("ตัวหนาทั้งกล่อง", "Bold whole box")} onClick={() => onApply({ wrap: { bold: true } })} />
        <IconBtn icon="i:italic" title={t("ตัวเอียงทั้งกล่อง", "Italic whole box")} onClick={() => onApply({ wrap: { italic: true } })} />
        <IconBtn icon="i:underline" title={t("ขีดเส้นใต้ทั้งกล่อง", "Underline whole box")} onClick={() => onApply({ wrap: { underline: true } })} />
        <IconBtn icon="i:strikethrough" title={t("ขีดฆ่าทั้งกล่อง", "Strikethrough whole box")} onClick={() => onApply({ wrap: { strike: true } })} />
        <Sep />
        <SizeSelect title={t("ขนาดตัวอักษรทั้งกล่อง", "Font size, whole box")} onPick={(px) => onApply({ wrap: { size: px } })} />
        <FontSelect size="sm" className="w-36" value={font} onChange={(v) => onApply({ font: v || null })} options={BOX_FONT_OPTIONS}
          googleFonts={WEB_FONT_NAMES} title={t("ฟอนต์ทั้งกล่อง", "Font, whole box")} placeholder={t("ฟอนต์ปกติ", "Default font")} />
        <Sep />
        <IconBtn icon="i:align-left" title={t("ชิดซ้าย", "Align left")} onClick={() => onApply({ align: "left" })} />
        <IconBtn icon="i:align-center" title={t("กึ่งกลาง", "Center")} onClick={() => onApply({ align: "center" })} />
        <IconBtn icon="i:align-right" title={t("ชิดขวา", "Align right")} onClick={() => onApply({ align: "right" })} />
        <Sep />
        <button type="button" title={t("สีตัวอักษรทั้งกล่อง", "Text color, whole box")} onClick={() => setPanel(panel === "text" ? null : "text")} className={`${IB} relative ${panel === "text" ? IBon : ""}`}>
          <Icon value="i:text-color" /><span className="absolute bottom-1 left-1.5 right-1.5 h-[3px] rounded" style={{ background: txt }} />
        </button>
        <button type="button" title={t("สีพื้นกล่อง", "Box fill")} onClick={() => setPanel(panel === "fill" ? null : "fill")} className={`${IB} relative ${panel === "fill" ? IBon : ""}`}>
          <Icon value="i:paint" /><span className="absolute bottom-1 left-1.5 right-1.5 h-[3px] rounded border border-slate-300" style={{ background: fill }} />
        </button>
        <button type="button" title={t("สีเส้นขอบกล่อง", "Box border")} onClick={() => setPanel(panel === "stroke" ? null : "stroke")} className={`${IB} relative ${panel === "stroke" ? IBon : ""}`}>
          <Icon value="i:square" /><span className="absolute bottom-1 left-1.5 right-1.5 h-[3px] rounded" style={{ background: stroke }} />
        </button>
        <IconBtn icon="i:clear-formatting" title={t("ล้างรูปแบบข้อความ (กลับเป็นแบบเดิม)", "Clear text formatting")} onClick={() => onApply({ clear: true })} />
      </div>
      {panel && (
        <div className="absolute left-0 top-full z-10 mt-1">
          {panel === "text" && <ColorPanel value={txt} t={t} onChange={(hex) => { setTxt(hex); onApply({ wrap: { color: hex } }); }} />}
          {panel === "fill" && <ColorPanel value={fill} t={t} onChange={(hex) => onApply({ fill: hex })} onReset={() => onApply({ fill: null })} resetLabel={t("คืนสีพื้นตามชุดสี", "Back to theme fill")} />}
          {panel === "stroke" && <ColorPanel value={stroke} t={t} onChange={(hex) => onApply({ stroke: hex })} onReset={() => onApply({ stroke: null })} resetLabel={t("คืนสีเส้นตามชุดสี", "Back to theme border")} />}
        </div>
      )}
    </div>
  );
}
