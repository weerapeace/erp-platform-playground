"use client";

/**
 * ตัวแก้หน้าตาทีละกล่องในพรีวิวเอกสารพิมพ์ (ของกลาง · เจ้าของขอ 2026-11-20) — กติกา/ค่า: lib/print-part-style
 *
 *   const pp = usePrintPartEditor({ parts: QUOTE_CARD_PARTS, value: layout.partStyles, onChange: (partStyles) => update({ ...layout, partStyles }), enabled });
 *   {pp.bar}
 *   <PrintFrame html={html} onDocLoad={pp.onDocLoad} />
 *   {pp.panel}
 *
 * - กดกล่องในพรีวิว (data-pp) → แผงแก้: ซ่อน (ทุกการ์ด / เฉพาะการ์ดนี้) · ขนาด · ฟอนต์ · ตัวหนา · ตำแหน่ง · สีตัวอักษร/พื้น · (รูป) สูง + พอดี/เต็มกรอบ
 * - จอคอม = แผงลอยลากได้ (FloatingPanel ไม่บังใบ) · มือถือ = แผ่นล่าง (BottomSheet)
 * - ย้อนกลับ (ปุ่ม + Ctrl+Z ทั้งในหน้าและในพรีวิว) · คืนค่าเดิมทีละกล่อง/ทั้งใบ · คัดลอก-วางสไตล์ระหว่างกล่อง
 * - กรอบเส้นประ/สีฟ้าโชว์เฉพาะบนจอ (@media screen) — ไม่ติดไปตอนพิมพ์/บันทึก PDF
 * - กล่องที่ซ่อนทั้งหมดกดในใบไม่ได้แล้ว → แถบบนมีรายการ "ซ่อนอยู่" ให้กดเอากลับ
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FloatingPanel } from "@/components/floating-panel";
import { BottomSheet } from "@/components/modal/bottom-sheet";
import { RangeInput } from "@/components/range-input";
import { ColorInput } from "@/components/color-picker";
import { FontSelect, type FontOption } from "@/components/font-select";
import { Icon } from "@/components/icon";
import { useMediaQuery } from "@/lib/use-media-query";
import { shortcutKey } from "@/lib/shortcut-key";
import {
  copyablePartStyle, normalizePrintPartStyle, PRINT_FONTS, PRINT_IMG_MAX_MM, PRINT_IMG_MIN_MM, PRINT_QUICK_COLORS, PRINT_SIZE_MAX, PRINT_SIZE_MIN,
  type PrintPartAlign, type PrintPartDef, type PrintPartStyle, type PrintPartStyles,
} from "@/lib/print-part-style";

type Sel = { key: string; ci: number | null };

const FONT_OPTIONS: FontOption[] = [
  { value: "", label: "ค่าเดิมของเอกสาร", family: null },
  ...PRINT_FONTS.map((f) => ({ value: f, label: f, family: `"${f}", sans-serif` })),
];
const EDIT_CSS = `@media screen {
  [data-pp] { cursor: pointer; }
  [data-pp]:hover { outline: 1px dashed #85b7eb; outline-offset: 1px; }
  [data-pp].pp-sel { outline: 2px solid #378add !important; outline-offset: 1px; }
}`;
const MAX_UNDO = 60;

export function usePrintPartEditor({ parts, value, onChange, enabled = true, defaultImgMm = 60 }: {
  parts: PrintPartDef[];
  value: PrintPartStyles;
  onChange: (next: PrintPartStyles) => void;
  /** ปิด = ไม่ให้กดเลือก (เช่น แบบตาราง ที่ไม่มีกล่อง data-pp) */
  enabled?: boolean;
  /** ความสูงรูปตั้งต้นตอนยังไม่ปรับ (mm) */
  defaultImgMm?: number;
}) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [clip, setClip] = useState<PrintPartStyle | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const past = useRef<PrintPartStyles[]>([]);
  const valueRef = useRef(value); valueRef.current = value;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const docRef = useRef<Document | null>(null);
  const [docTick, setDocTick] = useState(0);
  const isPhone = useMediaQuery("(max-width: 639px)");

  const commit = useCallback((next: PrintPartStyles) => {
    past.current.push(valueRef.current);
    if (past.current.length > MAX_UNDO) past.current.shift();
    setUndoCount(past.current.length);
    onChangeRef.current(next);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    setUndoCount(past.current.length);
    if (prev) onChangeRef.current(prev);
  }, []);

  // Ctrl+Z ในหน้า (ไม่ใช่ตอนพิมพ์ในช่อง)
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || shortcutKey(e) !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!past.current.length) return;
      e.preventDefault(); undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, undo]);

  // พรีวิวโหลดใหม่ทุกครั้งที่ใบเปลี่ยน → ติดตัวกดเลือก + กรอบบนจอใหม่
  const onDocLoad = useCallback((doc: Document) => {
    docRef.current = doc;
    if (!enabled) return;
    const st = doc.createElement("style"); st.textContent = EDIT_CSS; doc.head?.appendChild(st);
    doc.addEventListener("click", (e) => {
      const el = (e.target as Element | null)?.closest?.("[data-pp]");
      if (!el) return;
      e.preventDefault();
      const ci = el.closest("[data-ci]")?.getAttribute("data-ci");
      setSel({ key: el.getAttribute("data-pp") ?? "", ci: ci != null ? Number(ci) : null });
    });
    doc.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && shortcutKey(e) === "z" && past.current.length) { e.preventDefault(); undo(); }
    });
    setDocTick((n) => n + 1);
  }, [enabled, undo]);

  // ไฮไลต์กล่องที่เลือก (ทุกกล่องคีย์เดียวกัน = ปรับแล้วเปลี่ยนพร้อมกัน)
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    doc.querySelectorAll(".pp-sel").forEach((n) => n.classList.remove("pp-sel"));
    if (sel) doc.querySelectorAll(`[data-pp="${sel.key}"]`).forEach((n) => n.classList.add("pp-sel"));
  }, [sel, docTick]);

  const def = sel ? parts.find((p) => p.key === sel.key) ?? null : null;
  const cur: PrintPartStyle = (sel && value[sel.key]) || {};
  const setField = (patch: Partial<PrintPartStyle>) => {
    if (!sel) return;
    const merged = { ...cur, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(patch)) if (merged[k] === undefined) delete merged[k];
    const clean = normalizePrintPartStyle(merged);
    const next = { ...value };
    if (clean) next[sel.key] = clean; else delete next[sel.key];
    commit(next);
  };
  const oneKey = sel && def?.perCard && sel.ci != null ? `${sel.key}#${sel.ci}` : null;
  const toggleHideOne = () => {
    if (!oneKey) return;
    const next = { ...value };
    if (next[oneKey]?.hide) delete next[oneKey]; else next[oneKey] = { hide: true };
    commit(next);
  };
  const resetPart = () => {
    if (!sel) return;
    const next = Object.fromEntries(Object.entries(value).filter(([k]) => k !== sel.key && !k.startsWith(`${sel.key}#`)));
    commit(next);
  };
  const resetAll = () => { if (Object.keys(value).length) commit({}); setSel(null); };
  const unhide = (k: string) => {
    const next = { ...value };
    if (k.includes("#")) delete next[k];
    else { const { hide: _h, ...rest } = next[k] ?? {}; if (Object.keys(rest).length) next[k] = rest; else delete next[k]; }
    commit(next);
  };

  const hiddenKeys = Object.entries(value).filter(([, s]) => s.hide).map(([k]) => k);
  const labelOf = (k: string) => {
    const [key, ci] = k.split("#");
    const l = parts.find((p) => p.key === key)?.label ?? key;
    return ci != null ? `${l} (การ์ด ${Number(ci) + 1})` : l;
  };

  const bar: ReactNode = enabled ? (
    <div className="mx-auto mb-2 flex max-w-[840px] flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-1.5 text-[12px] text-blue-800 print:hidden">
      <Icon value="i:pointer" className="text-[14px]" />
      <span>กดกล่องในใบเพื่อแก้หน้าตา (ซ่อน · ขนาด · ตัวอักษร · ตำแหน่ง · สี)</span>
      <span className="flex-1" />
      {hiddenKeys.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">ซ่อนอยู่ {hiddenKeys.length} กล่อง ▾</summary>
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {hiddenKeys.map((k) => (
              <button key={k} type="button" onClick={() => unhide(k)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-slate-700 hover:bg-slate-50">
                <span className="truncate">{labelOf(k)}</span><span className="shrink-0 text-blue-600">แสดง</span>
              </button>
            ))}
          </div>
        </details>
      )}
      <button type="button" onClick={undo} disabled={!undoCount} title="ย้อนกลับ (Ctrl+Z)"
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        <Icon value="i:arrow-back-up" className="text-[13px]" />ย้อนกลับ
      </button>
      {Object.keys(value).length > 0 && (
        <button type="button" onClick={resetAll} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50">คืนค่าทั้งใบ</button>
      )}
    </div>
  ) : null;

  const seg = (on: boolean) => `rounded-md border px-2 py-1 text-[12px] ${on ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const row = (label: string, child: ReactNode) => (
    <div className="flex items-start gap-2 py-1.5">
      <span className="w-20 shrink-0 pt-1 text-[12px] text-slate-500">{label}</span>
      <div className="min-w-0 flex-1">{child}</div>
    </div>
  );
  const isImage = def?.kind === "image";
  const body = def && sel ? (
    <div className="px-1 text-sm">
      {row("ซ่อน", (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={seg(!!cur.hide)} onClick={() => setField({ hide: cur.hide ? undefined : true })}>
            {def.perCard ? "ซ่อนทุกการ์ด" : "ซ่อนกล่องนี้"}
          </button>
          {oneKey && (
            <button type="button" className={seg(!!value[oneKey]?.hide)} onClick={toggleHideOne}>เฉพาะการ์ด {(sel.ci ?? 0) + 1}</button>
          )}
        </div>
      ))}
      {isImage ? (
        <>
          {row("ความสูงรูป", <RangeInput value={cur.imgMm ?? defaultImgMm} min={PRINT_IMG_MIN_MM} max={PRINT_IMG_MAX_MM} step={1} unit="mm" onChange={(v) => setField({ imgMm: v })} />)}
          {row("จัดรูป", (
            <div className="flex gap-1.5">
              <button type="button" className={seg((cur.fit ?? "contain") === "contain")} onClick={() => setField({ fit: undefined })}>พอดีกรอบ</button>
              <button type="button" className={seg(cur.fit === "cover")} onClick={() => setField({ fit: "cover" })}>เต็มกรอบ</button>
            </div>
          ))}
          {row("สีพื้น", <BgPicker value={cur.bg} onChange={(bg) => setField({ bg })} />)}
        </>
      ) : (
        <>
          {def.kind !== "box" || def.baseSizePx ? row("ขนาดตัวอักษร", (
            <RangeInput value={cur.sizePx ?? def.baseSizePx ?? 12} min={PRINT_SIZE_MIN} max={Math.min(PRINT_SIZE_MAX, 48)} hardMax={PRINT_SIZE_MAX} step={1} unit="px" onChange={(v) => setField({ sizePx: v })} />
          )) : null}
          {row("ตัวอักษร", <FontSelect value={cur.font ?? ""} onChange={(f) => setField({ font: f || undefined })} options={FONT_OPTIONS} googleFonts={[...PRINT_FONTS]} size="sm" />)}
          {row("ตัวหนา", (
            <div className="flex gap-1.5">
              <button type="button" className={seg(cur.bold == null)} onClick={() => setField({ bold: undefined })}>ค่าเดิม</button>
              <button type="button" className={seg(cur.bold === true)} onClick={() => setField({ bold: true })}>หนา</button>
              <button type="button" className={seg(cur.bold === false)} onClick={() => setField({ bold: false })}>ปกติ</button>
            </div>
          ))}
          {row("ตำแหน่ง", (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={seg(!cur.align)} onClick={() => setField({ align: undefined })}>ค่าเดิม</button>
              {(["left", "center", "right"] as PrintPartAlign[]).map((a) => (
                <button key={a} type="button" className={seg(cur.align === a)} onClick={() => setField({ align: a })}>{a === "left" ? "ซ้าย" : a === "center" ? "กลาง" : "ขวา"}</button>
              ))}
            </div>
          ))}
          {row("สีตัวอักษร", (
            <div className="flex flex-wrap items-center gap-1.5">
              {PRINT_QUICK_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`สี ${c}`} onClick={() => setField({ color: c })}
                  className={`h-6 w-6 rounded-full border ${cur.color === c ? "ring-2 ring-blue-400 ring-offset-1" : "border-slate-300"}`} style={{ background: c }} />
              ))}
              <div className="w-28"><ColorInput value={cur.color ?? ""} onChange={(c) => setField({ color: c || undefined })} /></div>
              {cur.color && <button type="button" className="text-[12px] text-slate-500 hover:underline" onClick={() => setField({ color: undefined })}>ล้าง</button>}
            </div>
          ))}
          {(def.kind === "box" || def.kind === "badge") && row("สีพื้น", <BgPicker value={cur.bg} onChange={(bg) => setField({ bg })} />)}
        </>
      )}
      {def.perCard && <p className="pt-1 text-[11px] text-slate-400">ปรับแล้วทุกการ์ดเปลี่ยนตาม (ยกเว้น "ซ่อนเฉพาะการ์ด")</p>}
    </div>
  ) : null;

  const footer = def ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => setClip(copyablePartStyle(cur))} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50">
        <Icon value="i:copy" className="text-[13px]" />คัดลอกสไตล์</button>
      <button type="button" disabled={!clip} onClick={() => clip && setField({ sizePx: undefined, font: undefined, bold: undefined, align: undefined, color: undefined, bg: undefined, imgMm: undefined, fit: undefined, ...clip })}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        <Icon value="i:clipboard" className="text-[13px]" />วางสไตล์</button>
      <span className="flex-1" />
      <button type="button" onClick={resetPart} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50">
        <Icon value="i:refresh" className="text-[13px]" />คืนค่าเดิม</button>
    </div>
  ) : undefined;

  const title = def ? (oneKey ? `${def.label} · การ์ด ${(sel?.ci ?? 0) + 1}` : def.label) : "";
  const close = () => setSel(null);
  const panel: ReactNode = !enabled ? null : isPhone ? (
    <BottomSheet open={!!def} onClose={close} title={title} footer={footer} maxHeight="60dvh">{body}</BottomSheet>
  ) : (
    <FloatingPanel open={!!def} onClose={close} title={title} width={340} autoSize storageKey="print-part-style-panel" footer={footer}>{body}</FloatingPanel>
  );

  return { onDocLoad, bar, panel, selected: sel };
}

/** สีพื้น: ไม่มี / เลือกสี */
function BgPicker({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-28"><ColorInput value={value ?? ""} onChange={(c) => onChange(c || undefined)} /></div>
      {value && <button type="button" className="text-[12px] text-slate-500 hover:underline" onClick={() => onChange(undefined)}>ไม่มีสีพื้น</button>}
    </div>
  );
}
