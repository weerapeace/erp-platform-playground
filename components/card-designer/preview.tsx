"use client";
/**
 * 💌 ส่วนดูการ์ด (เบา) — แยกจากตัวออกแบบเต็ม components/card-designer/index.tsx (2026-11-25 รอบ 5)
 *   CardPreview   ดูอย่างเดียว
 *   CardQuickEdit แก้ด่วน: ลากข้อความบนการ์ด + พิมพ์ข้อความ + เพิ่ม/ลบข้อความ (ป๊อปคำสั่งพิเศษ)
 *   ตัวออกแบบเต็ม (ย่อ/หมุน/รูป/สติ๊กเกอร์) = CardDesigner ใน index.tsx — โหลดแยกเฉพาะตอนกด "ออกแบบเต็ม"
 * วาดด้วยสูตรเดียวกับหน้าพิมพ์ (elBox / textCss)
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import type { TextFontOption } from "@/lib/text-style";
import {
  CARD_FONTS, CARD_MAX_ELS, FONT_SIZE_MAX, FONT_SIZE_MIN, elBox, fontStack, googleFontsHref, newTextEl, resolveSrc, textCss, uploadFontFaces,
  faceDoc, isFolded, withFace, sampleView,
  type CardDoc, type CardEl, type CardFace, type CardRole, type CardTextStyle,
} from "@/lib/gift-card-design";

export type UploadedFont = { id: string; name: string };
const r2Url = (k: string) => r2ImageUrl(k);
const ROLE_LABEL: Record<CardRole, string> = { message: "ข้อความจากลูกค้า", to: "ถึง", from: "จาก" };

/** เครื่องหมายบนจอ (ไม่ติดตอนพิมพ์): กรอบเส้นปะสีเหลือง = ช่องข้อความจากลูกค้า/ถึง/จาก · เส้นปะแดง = รอยพับ */
export function ScreenMarks({ doc, k, fold, labels = true, sampleOn = false }: { doc: CardDoc; k: number; fold?: { x?: number; y?: number } | null; labels?: boolean; /** โหมดดูข้อความตัวอย่าง = ป้ายบอก "ตัวอย่าง" */ sampleOn?: boolean }) {
  return (
    <>
      {doc.els.filter((e) => !e.hidden && e.kind === "text" && e.role).map((e) => {
        const b = elBox(e, k);
        return (
          <div key={`m${e.id}`} className="pointer-events-none absolute" style={{ left: b.left, top: b.top, width: b.width, height: b.height, transform: b.transform, outline: "1.5px dashed #BA7517", background: "rgba(250,199,117,.16)" }}>
            {labels && <span className="absolute -top-4 left-0 whitespace-nowrap rounded bg-amber-100 px-1 text-[9px] leading-4 text-amber-800">{ROLE_LABEL[e.role as CardRole]}{sampleOn || !(e.text ?? "").trim() ? " · ตัวอย่าง" : ""}</span>}
          </div>
        );
      })}
      {fold?.x != null && <div className="pointer-events-none absolute top-0 h-full border-l-[1.5px] border-dashed border-rose-500" style={{ left: fold.x * k }} />}
      {fold?.y != null && <div className="pointer-events-none absolute left-0 w-full border-t-[1.5px] border-dashed border-rose-500" style={{ top: fold.y * k }} />}
    </>
  );
}

// ─── โหลดฟอนต์ (Google + ฟอนต์ที่อัปโหลด) ครั้งเดียวต่อหน้า ───
export function useCardFonts(uploaded: UploadedFont[] = []) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.getElementById("gcd-fonts")) {
      const l = document.createElement("link");
      l.id = "gcd-fonts"; l.rel = "stylesheet"; l.href = googleFontsHref(CARD_FONTS.map((f) => f.family));
      document.head.appendChild(l);
    }
    let st = document.getElementById("gcd-upfonts") as HTMLStyleElement | null;
    if (!st) { st = document.createElement("style"); st.id = "gcd-upfonts"; document.head.appendChild(st); }
    st.textContent = uploadFontFaces(uploaded.map((f) => `upload:${f.id}`));
  }, [uploaded]);
}

/** ตัวเลือกฟอนต์ให้ TextStyleControl */
export function cardFontOptions(uploaded: UploadedFont[] = []): TextFontOption[] {
  return [
    ...CARD_FONTS.map((f) => ({ value: f.family, label: f.label, css: fontStack(f.family) })),
    ...uploaded.map((f) => ({ value: `upload:${f.id}`, label: `${f.name} (แบรนด์)`, css: fontStack(`upload:${f.id}`) })),
  ];
}

// ─── วาดชิ้นเดียว (ใช้ทั้งพรีวิวและตัวออกแบบ) ───
/** sample = ข้อความตัวอย่างแทนข้อความจริง (บนจอเท่านั้น) · faint = จาง ๆ (ช่องยังว่าง) */
export function CardElView({ e, k, sample }: { e: CardEl; k: number; sample?: { text: string; faint: boolean } | null }) {
  const b = elBox(e, k);
  const box: CSSProperties = { position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, transform: b.transform, opacity: e.opacity };
  if (e.kind === "text" && e.style) {
    const t = textCss(e.style, k) as CSSProperties;
    const op = sample?.faint ? (e.opacity ?? 1) * 0.35 : e.opacity;
    return <div style={{ ...box, opacity: op }}><div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...t }}><span style={{ display: "block" }}>{sample ? sample.text : e.text ||" "}</span></div></div>;
  }
  if (e.kind === "image") {
    const url = resolveSrc(e.src, r2Url);
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img src={url} alt="" draggable={false} style={{ ...box, objectFit: e.fit ?? "contain", userSelect: "none" }} /> : null;
  }
  const sw = (e.strokeW ?? 0) * k;
  if (e.shape === "line") return <div style={{ ...box, height: 0, borderTop: `${Math.max(sw, 1)}px solid ${e.stroke || "#000"}` }} />;
  return <div style={{ ...box, boxSizing: "border-box", background: e.fill || "transparent", border: e.stroke ? `${sw}px solid ${e.stroke}` : "none", borderRadius: e.shape === "ellipse" ? "50%" : (e.radius ?? 0) * k }} />;
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** พรีวิวการ์ด (ดูอย่างเดียว) — กว้างเต็มกล่องแม่ หรือกำหนด width (px) */
export function CardPreview({ doc, width, className = "", maxHeight, marks = false, fold = null }: { doc: CardDoc; width?: number; className?: string; maxHeight?: number; /** โชว์กรอบช่องข้อความจากลูกค้า (บนจอเท่านั้น) */ marks?: boolean; /** เส้นรอยพับ (การ์ดพับ) */ fold?: { x?: number; y?: number } | null }) {
  const [ref, boxW] = useWidth<HTMLDivElement>();
  let k = (width ?? boxW) / doc.w;
  if (maxHeight && doc.h * k > maxHeight) k = maxHeight / doc.h;
  const bg = resolveSrc(doc.bg.image, r2Url);
  return (
    <div ref={ref} className={className} style={width ? { width } : undefined}>
      {k > 0 && (
        <div style={{ position: "relative", overflow: "hidden", width: doc.w * k, height: doc.h * k, background: doc.bg.color, margin: "0 auto" }} className="rounded-[2px] shadow-sm ring-1 ring-black/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {bg && <img src={bg} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: doc.bg.fit }} />}
          {doc.els.filter((e) => !e.hidden).map((e) => <CardElView key={e.id} e={e} k={k} />)}
          {(marks || fold) && <ScreenMarks doc={marks ? doc : { ...doc, els: [] }} k={k} fold={fold} labels={false} />}
        </div>
      )}
    </div>
  );
}

const QE_ROLE: Record<CardRole, string> = { message: "ข้อความจากลูกค้า", to: "ถึง", from: "จาก" };

/**
 * แก้การ์ดด่วน — ลากข้อความไปวางตรงไหนก็ได้ · พิมพ์แก้ข้อความแต่ละกล่อง · เพิ่ม/ลบข้อความ
 *   การ์ดพับ: สลับ ด้านใน/ด้านนอก (เริ่มที่ด้านใน = ที่อยู่ข้อความลูกค้า)
 *   ชิ้นที่ role = message ใช้ช่องข้อความหลัก (message/onMessage) ไม่แก้ทับในตัวนี้
 *   ย่อ/หมุน/ใส่รูป → ตัวออกแบบเต็ม (onFull)
 */
export function CardQuickEdit({ doc, onChange, message, onMessage, maxHeight = 220, onFull, onReset }: {
  doc: CardDoc; onChange: (next: CardDoc) => void;
  message: string; onMessage: (v: string) => void;
  maxHeight?: number;
  /** ปุ่ม "ออกแบบเต็ม" */
  onFull?: () => void;
  /** ปุ่ม "คืนค่าแม่แบบ" (มี = มีการแก้แล้ว) */
  onReset?: () => void;
}) {
  const folded = isFolded(doc);
  const [face, setFace] = useState<CardFace>("in");
  const cur = faceDoc(doc, folded ? face : "out");
  const [ref, boxW] = useWidth<HTMLDivElement>();
  let k = boxW / cur.w;
  if (maxHeight && cur.h * k > maxHeight) k = maxHeight / cur.h;
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const bg = resolveSrc(cur.bg.image, (key) => r2ImageUrl(key));
  const setFaceDoc = (f: CardDoc) => onChange(withFace(doc, folded ? face : "out", f));
  const patchEl = (id: string, p: Partial<CardEl>) => setFaceDoc({ ...cur, els: cur.els.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const texts = cur.els.filter((e) => e.kind === "text" && !e.hidden);

  const down = (e: RPointerEvent<HTMLDivElement>, el: CardEl) => {
    if (el.locked) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSel(el.id);
    drag.current = { id: el.id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d || k <= 0) return;
    const el = cur.els.find((x) => x.id === d.id); if (!el) return;
    const r = (n: number) => Math.round(n * 10) / 10;
    const x = Math.min(Math.max(d.ox + (e.clientX - d.sx) / k, -el.w * 0.5), cur.w - el.w * 0.5);
    const y = Math.min(Math.max(d.oy + (e.clientY - d.sy) / k, -el.h * 0.5), cur.h - el.h * 0.5);
    patchEl(d.id, { x: r(x), y: r(y) });
  };
  const up = () => { drag.current = null; };
  const add = () => {
    if (cur.els.length >= CARD_MAX_ELS) return;
    const el = newTextEl(cur, "ข้อความ", { size: 14, font: "Charm" });
    setFaceDoc({ ...cur, els: [...cur.els, el] });
    setSel(el.id); setEditing(el.id);
  };
  const remove = (id: string) => { setFaceDoc({ ...cur, els: cur.els.filter((e) => e.id !== id) }); if (sel === id) setSel(null); };

  return (
    <div className="space-y-2">
      {folded && (
        <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
          {(["in", "out"] as const).map((f) => <button key={f} type="button" onClick={() => { setFace(f); setSel(null); }} className={`px-2 py-0.5 ${face === f ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>{f === "in" ? "ด้านใน" : "ด้านนอก"}</button>)}
        </div>
      )}
      <div ref={ref} className="touch-none select-none" onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => setSel(null)}>
        {k > 0 && (
          <div style={{ position: "relative", overflow: editing ? "visible" : "hidden", width: cur.w * k, height: cur.h * k, background: cur.bg.color, margin: "0 auto" }} className="rounded-[2px] shadow-sm ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {bg && <img src={bg} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: cur.bg.fit }} />}
            {cur.els.filter((e) => !e.hidden).map((e) => {
              if (e.kind !== "text") return <CardElView key={e.id} e={e} k={k} />;
              if (editing === e.id) return (
                <InlineTextEditor key={e.id} e={e} k={k} value={e.role === "message" ? message : e.text ?? ""}
                  onText={(v) => (e.role === "message" ? onMessage(v) : patchEl(e.id, { text: v }))}
                  onGrow={(h) => patchEl(e.id, { h: Math.min(cur.h - e.y, h) })}
                  onStyle={(p) => e.style && patchEl(e.id, { style: { ...e.style, ...p } })}
                  onDone={() => setEditing(null)} />
              );
              const b = elBox(e, k);
              return (
                <div key={e.id} onPointerDown={(ev) => down(ev, e)} onDoubleClick={() => { if (!e.locked) { setSel(e.id); setEditing(e.id); } }} title={e.locked ? "ล็อกไว้ — แก้ในตัวออกแบบเต็ม" : "ลากเพื่อย้าย · ดับเบิลคลิกเพื่อพิมพ์"}
                  style={{ position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, transform: b.transform, cursor: e.locked ? "default" : "move", outline: sel === e.id ? "1.5px solid #378ADD" : "1px dashed rgba(55,138,221,.45)", zIndex: 2 }}>
                  <div style={{ position: "absolute", inset: 0, transform: "none" }}><CardElView e={{ ...e, x: 0, y: 0, rot: 0 }} k={k} sample={sampleView(e, { on: false, len: "short" })} /></div>
                </div>
              );
            })}
            {folded && face === "in" && (doc.fold === "side"
              ? <div className="pointer-events-none absolute top-0 h-full border-l-[1.5px] border-dashed border-rose-400" style={{ left: (cur.w / 2) * k }} />
              : <div className="pointer-events-none absolute left-0 w-full border-t-[1.5px] border-dashed border-rose-400" style={{ top: (cur.h / 2) * k }} />)}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {texts.map((e) => {
          const isMsg = e.role === "message";
          return (
            <div key={e.id} className={`flex items-start gap-1.5 rounded-md ${sel === e.id ? "ring-1 ring-sky-300" : ""}`} onFocus={() => setSel(e.id)}>
              <span className="mt-1.5 w-[86px] shrink-0 truncate text-[11px] text-slate-500">{e.role ? QE_ROLE[e.role] : "ข้อความ"}</span>
              <textarea value={isMsg ? message : e.text ?? ""} rows={isMsg ? 2 : 1} disabled={!!e.locked && !isMsg}
                onChange={(ev) => (isMsg ? onMessage(ev.target.value) : patchEl(e.id, { text: ev.target.value }))}
                placeholder={isMsg ? "ข้อความบนการ์ด" : "พิมพ์ข้อความ"} className="min-w-0 flex-1 resize-y rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50" />
              {!e.role && !e.locked && <button type="button" onClick={() => remove(e.id)} aria-label="ลบข้อความนี้" title="ลบข้อความนี้" className="mt-1 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="x" className="h-3.5 w-3.5" /></button>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={add} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="plus" className="h-3.5 w-3.5" /> เพิ่มข้อความ</button>
        {onReset && <button type="button" onClick={onReset} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 hover:bg-slate-50" title="ทิ้งที่ย้าย/เพิ่มไว้ กลับเป็นหน้าตาแม่แบบ (ข้อความหลักยังอยู่)"><Icon name="arrow-back-up" className="h-3.5 w-3.5" /> คืนค่าแม่แบบ</button>}
        <span className="flex-1" />
        {onFull && <button type="button" onClick={onFull} className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 text-[12px] text-violet-800 hover:bg-violet-100"><Icon name="palette" className="h-3.5 w-3.5" /> ออกแบบเต็ม</button>}
      </div>
      <p className="text-[10px] text-slate-400">ลากกล่องข้อความเพื่อย้าย · ดับเบิลคลิก (มือถือ: แตะ 2 ครั้ง) เพื่อพิมพ์บนการ์ด · รูป/หมุน แก้ใน &quot;ออกแบบเต็ม&quot;</p>
    </div>
  );
}


const INLINE_COLORS = ["#2c2c2a", "#5f5e5a", "#9b2c4a", "#993c1d", "#0f6e56", "#185fa5", "#ffffff"];
const ALIGN_NEXT: Record<string, CardTextStyle["align"]> = { left: "center", center: "right", right: "left" };

/**
 * พิมพ์บนการ์ดโดยตรง (เจ้าของเลือก 2026-11-27 ข้อ 1-5) — กล่องพิมพ์วางทับชิ้นข้อความ ฟอนต์/ขนาด/สีเหมือนจริง
 *   Esc · Ctrl+Enter · คลิกข้างนอก = เสร็จ · Enter = ขึ้นบรรทัดใหม่ · ข้อความยาวเกินกล่อง = onGrow (สูงขึ้นตาม)
 *   แถบจัดรูปแบบลอย (onStyle): ฟอนต์ · ขนาด −/+ · ตัวหนา · จัดชิด · สี — กดแถบไม่หลุดโหมดพิมพ์
 *   ปุ่มลบ/ลูกศรระหว่างพิมพ์ไม่หลุดไปลบ/ขยับกล่อง (หยุดแป้นไว้ที่ช่องพิมพ์)
 */
export function InlineTextEditor({ e, k, value, onText, onGrow, onStyle, onDone, selectAll = false, fontOpts = [], placeholder }: {
  e: CardEl; k: number; value: string; onText: (v: string) => void; onGrow: (hMm: number) => void;
  onStyle?: (p: Partial<CardTextStyle>) => void; onDone: () => void; selectAll?: boolean; fontOpts?: TextFontOption[]; /** ข้อความจาง ๆ ตอนช่องยังว่าง */ placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const t = ref.current; if (!t) return;
    t.focus();
    if (selectAll) t.select(); else t.setSelectionRange(t.value.length, t.value.length);
  }, [selectAll]);
  const b = elBox(e, k);
  const st = e.style;
  // วัดความสูงข้อความ → ขยายกล่อง + จัดแนวตั้งให้ตรงกับตอนแสดงผล
  useLayoutEffect(() => {
    const t = ref.current; if (!t) return;
    const prevH = t.style.height, prevP = t.style.paddingTop;
    t.style.paddingTop = "0px"; t.style.height = "0px";
    const need = t.scrollHeight;
    t.style.height = prevH; t.style.paddingTop = prevP;
    if (need > b.height + 1) onGrow(Math.ceil((need / k) * 10) / 10);
    const free = Math.max(0, b.height - need);
    setPad(st?.valign === "top" ? 0 : st?.valign === "bottom" ? free : free / 2);
  }, [value, st?.size, st?.font, st?.lineHeight, st?.letterSpacing, e.w, b.height, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const { justifyContent, ...tcss } = (st ? textCss(st, k) : {}) as Record<string, string | number>;
  void justifyContent;
  const bump = (d: number) => st && onStyle?.({ size: Math.round(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, st.size + d * Math.max(1, st.size * 0.1))) * 10) / 10 });
  const barBtn = "inline-flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-[12px] hover:bg-white/15";
  return (
    <>
      {onStyle && st && (
        <div ref={barRef} onPointerDown={(ev) => ev.stopPropagation()} onMouseDown={(ev) => { if ((ev.target as HTMLElement).tagName !== "SELECT") ev.preventDefault(); }}
          className="absolute z-30 flex items-center gap-0.5 rounded-lg bg-slate-900 px-1 py-0.5 text-white shadow-lg" style={{ left: Math.max(0, b.left), top: b.top - 38 }}>
          {fontOpts.length > 0 && (
            <select value={st.font} onChange={(ev) => { onStyle({ font: ev.target.value }); ref.current?.focus(); }} className="h-7 max-w-[120px] rounded bg-slate-800 px-1 text-[12px] text-white" aria-label="ฟอนต์">
              {fontOpts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          )}
          <button type="button" className={barBtn} onClick={() => bump(-1)} title="เล็กลง">A−</button>
          <button type="button" className={barBtn} onClick={() => bump(1)} title="ใหญ่ขึ้น">A+</button>
          <button type="button" className={`${barBtn} font-bold ${st.bold ? "bg-white/20" : ""}`} onClick={() => onStyle({ bold: !st.bold })} title="ตัวหนา">B</button>
          <button type="button" className={barBtn} onClick={() => onStyle({ align: ALIGN_NEXT[st.align] ?? "center" })} title={`จัดชิด: ${st.align === "left" ? "ซ้าย" : st.align === "right" ? "ขวา" : "กลาง"}`}><Icon name={st.align === "left" ? "align-left" : st.align === "right" ? "align-right" : "align-center"} className="h-4 w-4" /></button>
          <span className="mx-0.5 h-4 w-px bg-white/20" />
          {INLINE_COLORS.map((c) => <button key={c} type="button" onClick={() => onStyle({ color: c })} aria-label={`สี ${c}`} className={`h-4 w-4 rounded-full border ${st.color.toLowerCase() === c ? "border-sky-300 ring-2 ring-sky-300" : "border-white/40"}`} style={{ background: c }} />)}
          <span className="mx-0.5 h-4 w-px bg-white/20" />
          <button type="button" className={`${barBtn} text-sky-300`} onClick={onDone}>เสร็จ</button>
        </div>
      )}
      <textarea ref={ref} value={value} maxLength={600} spellCheck={false} aria-label="พิมพ์ข้อความบนการ์ด" placeholder={placeholder}
        onChange={(ev) => onText(ev.target.value)}
        onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === "Escape" || (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); onDone(); } }}
        onBlur={(ev) => { if (barRef.current?.contains(ev.relatedTarget as Node)) return; onDone(); }}
        onPointerDown={(ev) => ev.stopPropagation()}
        style={{
          position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, transform: b.transform, zIndex: 20,
          ...tcss, paddingTop: pad, paddingLeft: 0, paddingRight: 0, paddingBottom: 0, margin: 0, border: "none", resize: "none", overflow: "hidden",
          whiteSpace: "pre-wrap", overflowWrap: "anywhere", outline: "2px solid #378ADD", background: "rgba(255,255,255,.55)", boxSizing: "border-box",
        } as CSSProperties} />
    </>
  );
}
