"use client";

/**
 * ✍️ แถบจัดข้อความ (ของกลาง · เจ้าของสั่ง 2026-11-22 "ตอนกำลังพิมพ์หรือคลุมดำ ต้องเปลี่ยนเครื่องมือเป็นจัดการ text · ทำเป็นของกลาง")
 *   ตัวหนา · เอียง · ขีดเส้นใต้ · ขีดฆ่า · ขนาด · สีตัวอักษร · ไฮไลต์ · จัดชิด · รายการ · ลิงก์ · ล้างรูปแบบ
 *   ปุ่มลัด Ctrl+B / I / U / K (รองรับแป้นไทย ผ่าน lib/shortcut-key) · มือถือ (จอสัมผัส) = แถบติดเหนือแป้นพิมพ์ (dock)
 *
 *   ทำงานผ่าน "ตัวสั่งงาน" (TextFormatAdapter) → ใช้ได้กับช่องพิมพ์หลายแบบ
 *     - domTextAdapter(el)  = ช่อง contentEditable ธรรมดา (กระดาน flowchart: กล่อง · ข้อในรายการงาน · ชื่อการ์ด)
 *     - ตัวแก้แบบอื่น (เช่น Tiptap ของ components/rich-text) ส่ง adapter ของตัวเองได้
 *   ใช้:  const el = useTextFormatTarget(scopeRef)  →  {el && <TextFormatBar t={t} adapter={domTextAdapter(el)} />}
 *         onKeyDown={(e) => applyTextShortcut(e, adapter)}
 *   ⚠️ ผู้ใช้ที่บันทึกตอน blur: ถ้าโฟกัสย้ายเข้าแถบ (มี data-text-format-bar) อย่าถือว่าออกจากช่องพิมพ์ — ใช้ isInTextBar(relatedTarget)
 *   ⚠️ HTML ที่ได้ยังไม่กรอง — ผู้ใช้ต้องกรองเองก่อนเก็บ/แสดง (กระดานใช้ sanitizeRich ของ lib/flowchart-rich)
 * doc: docs/text-format-bar.md
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { ColorPicker } from "@/components/color-picker";
import { shortcutKey } from "@/lib/shortcut-key";

type T = (th: string, en: string) => string;
export type TextCmd = "bold" | "italic" | "underline" | "strike" | "list" | "alignLeft" | "alignCenter" | "alignRight" | "clear";
export type TextFormatAdapter = {
  run: (cmd: TextCmd) => void;
  active: (cmd: TextCmd) => boolean;
  color: (hex: string) => void;
  highlight: (hex: string | null) => void;
  size: (px: number) => void;
  link: (url: string | null) => void;
  /** ลิงก์ของคำที่เลือกอยู่ (ไว้แก้/เอาออก) */
  currentLink?: () => string | null;
  /** ตัวแก้ทำคำสั่งนี้ได้ไหม (ไม่ได้ = ซ่อนปุ่ม เช่น Tiptap ไม่มีจัดชิด) · ไม่ส่ง = ได้ทุกอย่าง */
  supports?: (cmd: TextCmd | "color" | "highlight" | "size" | "link") => boolean;
};

export const TEXT_SIZES = [6, 8, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];
const HILITES = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff"];
const COLORS = ["#0f172a", "#64748b", "#e11d48", "#d97706", "#059669", "#2563eb", "#7c3aed", "#db2777"];

/** โฟกัส/ปุ่มอยู่ในแถบจัดข้อความไหม (ผู้ใช้ที่บันทึกตอน blur ใช้เช็ก) */
export const isInTextBar = (n: EventTarget | null | undefined): boolean => !!(n instanceof Element && n.closest("[data-text-format-bar]"));

/** ช่องพิมพ์ contentEditable ที่โฟกัสอยู่ใน scope (null = ไม่ได้พิมพ์) · โฟกัสย้ายเข้าแถบ = ยังนับว่าพิมพ์อยู่ */
export function useTextFormatTarget(scope: React.RefObject<HTMLElement | null>): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const pick = () => {
      const a = document.activeElement as HTMLElement | null;
      if (a && isInTextBar(a)) return;   // กำลังกดในแถบ → คงช่องเดิม
      const ok = a && a.isContentEditable && scope.current?.contains(a) && !a.closest("[data-no-text-bar]");
      setEl(ok ? a : null);
    };
    const onIn = () => pick();
    const onOut = () => setTimeout(pick, 0);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); };
  }, [scope]);
  return el;
}

/** ตัวสั่งงานสำหรับช่อง contentEditable ธรรมดา (execCommand + จำส่วนที่คลุมไว้ เผื่อกดปุ่มในแถบแล้วโฟกัสหลุด) */
export function domTextAdapter(el: HTMLElement): TextFormatAdapter {
  const saved = savedRanges.get(el);
  const restore = () => {
    if (document.activeElement !== el) el.focus();
    const r = savedRanges.get(el) ?? saved;
    if (r && el.contains(r.commonAncestorContainer)) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }
  };
  const exec = (cmd: string, val?: string) => {
    restore();
    try { document.execCommand("styleWithCSS", false, "true"); document.execCommand(cmd, false, val); } catch { /* ไม่รองรับ */ }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const state = (cmd: string) => { try { return document.queryCommandState(cmd); } catch { return false; } };
  const MAP: Record<TextCmd, string> = { bold: "bold", italic: "italic", underline: "underline", strike: "strikeThrough", list: "insertUnorderedList", alignLeft: "justifyLeft", alignCenter: "justifyCenter", alignRight: "justifyRight", clear: "removeFormat" };
  return {
    run: (cmd) => { exec(MAP[cmd]); if (cmd === "clear") exec("unlink"); },
    active: (cmd) => cmd !== "clear" && state(MAP[cmd]),
    color: (hex) => exec("foreColor", hex),
    highlight: (hex) => exec("hiliteColor", hex ?? "transparent"),
    size: (px) => {
      restore();
      const sel = window.getSelection();
      let r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      if (!r || r.collapsed || !el.contains(r.commonAncestorContainer)) { r = document.createRange(); r.selectNodeContents(el); }
      const frag = r.extractContents();
      frag.querySelectorAll("span").forEach((sp) => { (sp as HTMLSpanElement).style.fontSize = ""; });
      const sp = document.createElement("span"); sp.style.fontSize = `${px}px`; sp.appendChild(frag); r.insertNode(sp);
      const nr = document.createRange(); nr.selectNodeContents(sp); sel?.removeAllRanges(); sel?.addRange(nr);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    link: (url) => (url ? exec("createLink", url) : exec("unlink")),
    currentLink: () => { const s = window.getSelection(); const a = s?.anchorNode?.parentElement?.closest("a"); return a && el.contains(a) ? a.getAttribute("href") : null; },
  };
}
/** ส่วนที่คลุมดำล่าสุดของแต่ละช่อง (กดปุ่มสี/ลิงก์ที่ต้องพิมพ์ แล้วกลับมาทำกับคำเดิมได้) */
const savedRanges = new WeakMap<HTMLElement, Range>();
if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", () => {
    const s = window.getSelection(); if (!s || !s.rangeCount) return;
    const n = s.anchorNode; const host = (n instanceof Element ? n : n?.parentElement)?.closest("[contenteditable=true],[contenteditable='']") as HTMLElement | null;
    if (host) savedRanges.set(host, s.getRangeAt(0).cloneRange());
  });
}

/** ปุ่มลัด: Ctrl+B / I / U = ตัวหนา/เอียง/ขีดเส้นใต้ · Ctrl+K = ลิงก์ (ถามที่อยู่) · คืน true = จัดการแล้ว */
export function applyTextShortcut(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "preventDefault">, a: TextFormatAdapter, askLink?: () => void): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return false;
  const k = shortcutKey(e);
  const cmd: TextCmd | null = k === "b" ? "bold" : k === "i" ? "italic" : k === "u" ? "underline" : null;
  if (cmd) { e.preventDefault(); a.run(cmd); return true; }
  if (k === "k" && askLink) { e.preventDefault(); askLink(); return true; }
  return false;
}

const IB = "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-slate-600 hover:bg-slate-100";
const ON = "bg-violet-100 text-violet-700";
const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />;

/**
 * แถบจัดข้อความ — ปุ่มไม่ขโมยโฟกัสจากช่องพิมพ์ (ยกเว้นช่องกรอกในแผง)
 *  dock: "auto" (ค่าเริ่ม) = จอสัมผัสติดเหนือแป้นพิมพ์ จอคอมวางตรงที่ผู้ใช้วาง · "never" = วางตรงที่วางเสมอ
 *  linkRequest = เพิ่มขึ้นเมื่อผู้ใช้กด Ctrl+K (ให้แถบเปิดช่องลิงก์)
 */
export function TextFormatBar({ t, adapter, dock = "auto", linkRequest = 0, className = "", flat = false, extra }: {
  t: T; adapter: TextFormatAdapter; dock?: "auto" | "never"; linkRequest?: number; className?: string;
  /** flat = ไม่มีกรอบลอย/เงา (ใช้เป็นแถบเครื่องมือในกล่องข้อความยาว) */
  flat?: boolean;
  /** ปุ่มเพิ่มต่อท้ายแถบ (เช่น หัวข้อ · ตาราง · รูป ของกล่องข้อความยาว) */
  extra?: ReactNode;
}) {
  const [panel, setPanel] = useState<null | "color" | "hilite" | "size" | "link">(null);
  const [url, setUrl] = useState("");
  const [, force] = useState(0);
  const [coarse, setCoarse] = useState(false);
  const [kb, setKb] = useState(0);   // ความสูงแป้นพิมพ์มือถือ (px)
  useEffect(() => { try { setCoarse(window.matchMedia("(pointer: coarse)").matches); } catch { /* เก่า */ } }, []);
  useEffect(() => {
    const on = () => force((n) => n + 1);
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);
  useEffect(() => { if (linkRequest) { setUrl(adapter.currentLink?.() ?? ""); setPanel("link"); } }, [linkRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const docked = dock === "auto" && coarse;
  useEffect(() => {
    if (!docked || !window.visualViewport) return;
    const vv = window.visualViewport;
    const on = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    on(); vv.addEventListener("resize", on); vv.addEventListener("scroll", on);
    return () => { vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on); };
  }, [docked]);

  const keep = (e: React.MouseEvent | React.PointerEvent) => { const tg = e.target as HTMLElement; if (!/^(INPUT|SELECT|OPTION|TEXTAREA)$/.test(tg.tagName)) e.preventDefault(); e.stopPropagation(); };
  const can = (c: Parameters<NonNullable<TextFormatAdapter["supports"]>>[0]) => !adapter.supports || adapter.supports(c);
  const btn = (cmd: TextCmd, icon: string, th: string, en: string) => !can(cmd) ? null : (
    <button key={cmd} type="button" title={t(th, en)} aria-label={t(th, en)} aria-pressed={adapter.active(cmd)} onClick={() => adapter.run(cmd)} className={`${IB} ${adapter.active(cmd) ? ON : ""}`}><Icon value={icon} /></button>
  );
  const toggle = (p: NonNullable<typeof panel>) => setPanel((v) => (v === p ? null : p));
  const swatches = (list: string[], on: (c: string) => void) => (
    <div className="flex flex-wrap gap-1">{list.map((c) => <button key={c} type="button" title={c} onClick={() => on(c)} className="h-5 w-5 rounded border border-slate-300" style={{ background: c }} />)}</div>
  );

  const bar: ReactNode = (
    <div data-text-format-bar="" onMouseDown={keep} onPointerDown={keep}
      className={`relative ${docked ? "w-full" : flat ? "w-full" : "w-max max-w-[min(560px,calc(100vw-24px))]"} ${className}`}>
      <div className={`flex items-center gap-0.5 ${flat ? "" : "rounded-lg border border-violet-200 bg-white p-1 shadow-md"} ${docked ? "overflow-x-auto" : "flex-wrap"}`}>
        {!flat && <span className="px-1 text-[10.5px] font-medium text-violet-600">{t("ข้อความ", "Text")}</span>}
        {btn("bold", "i:bold", "ตัวหนา (Ctrl+B)", "Bold (Ctrl+B)")}
        {btn("italic", "i:italic", "ตัวเอียง (Ctrl+I)", "Italic (Ctrl+I)")}
        {btn("underline", "i:underline", "ขีดเส้นใต้ (Ctrl+U)", "Underline (Ctrl+U)")}
        {btn("strike", "i:strikethrough", "ขีดฆ่า", "Strikethrough")}
        <Sep />
        {can("size") && <button type="button" title={t("ขนาดตัวอักษร", "Font size")} onClick={() => toggle("size")} className={`${IB} ${panel === "size" ? ON : ""}`}><Icon value="i:text-size" /><Icon value="i:chevron-down" /></button>}
        <button type="button" title={t("สีตัวอักษร", "Text colour")} onClick={() => toggle("color")} className={`${IB} ${panel === "color" ? ON : ""}`}><Icon value="i:text-color" /></button>
        {can("highlight") && <button type="button" title={t("ไฮไลต์", "Highlight")} onClick={() => toggle("hilite")} className={`${IB} ${panel === "hilite" ? ON : ""}`}>
          <span className="rounded px-1 text-[12px] font-semibold leading-5" style={{ background: "#fef08a" }}>A</span>
        </button>}
        <Sep />
        {btn("alignLeft", "i:align-left", "ชิดซ้าย", "Align left")}
        {btn("alignCenter", "i:align-center", "กึ่งกลาง", "Center")}
        {btn("alignRight", "i:align-right", "ชิดขวา", "Align right")}
        {btn("list", "i:list", "รายการ", "Bulleted list")}
        <Sep />
        {can("link") && <button type="button" title={t("ลิงก์ (Ctrl+K)", "Link (Ctrl+K)")} onClick={() => { setUrl(adapter.currentLink?.() ?? ""); toggle("link"); }} className={`${IB} ${panel === "link" ? ON : ""}`}><Icon value="i:link" /></button>}
        {btn("clear", "i:clear-formatting", "ล้างรูปแบบ", "Clear formatting")}
        {extra}
      </div>
      {panel && (
        <div className={`absolute left-0 z-10 rounded-lg border border-slate-200 bg-white p-2 shadow-lg ${docked ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {panel === "size" && (
            <div className="grid w-[220px] grid-cols-5 gap-1">
              {TEXT_SIZES.map((s) => <button key={s} type="button" onClick={() => { adapter.size(s); setPanel(null); }} className="rounded border border-slate-200 py-0.5 text-[11px] text-slate-700 hover:bg-violet-50">{s}</button>)}
            </div>
          )}
          {panel === "color" && <div className="w-[230px] space-y-2">{swatches(COLORS, (c) => adapter.color(c))}<ColorPicker value="#0f172a" onChange={(c) => adapter.color(c)} /></div>}
          {panel === "hilite" && (
            <div className="space-y-1.5">
              {swatches(HILITES, (c) => adapter.highlight(c))}
              <button type="button" onClick={() => adapter.highlight(null)} className="w-full rounded border border-slate-200 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">{t("เอาไฮไลต์ออก", "Remove highlight")}</button>
            </div>
          )}
          {panel === "link" && (
            <form className="flex w-[260px] items-center gap-1" onSubmit={(e) => { e.preventDefault(); const u = url.trim(); adapter.link(u ? (/^(https?:\/\/|\/)/i.test(u) ? u : `https://${u}`) : null); setPanel(null); }}>
              <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="h-7 min-w-0 flex-1 rounded border border-slate-300 px-1.5 text-[12px] outline-none focus:border-violet-400" />
              <button type="submit" className="h-7 rounded bg-violet-600 px-2 text-[11px] text-white">{t("ใส่", "Add")}</button>
              <button type="button" onClick={() => { adapter.link(null); setPanel(null); }} className="h-7 rounded border border-slate-200 px-1.5 text-[11px] text-slate-600" title={t("เอาลิงก์ออก", "Remove link")}><Icon value="i:x" /></button>
            </form>
          )}
        </div>
      )}
    </div>
  );
  if (!docked) return bar;
  // มือถือ: ติดเหนือแป้นพิมพ์ (portal ออกนอกกระดาน — ไม่โดนซูม/ไม่บังข้อความที่พิมพ์)
  return createPortal(<div className="fixed inset-x-0 z-[1200] px-1.5 pb-1.5" style={{ bottom: kb }}>{bar}</div>, document.body);
}

/** ห่อช่องพิมพ์ + แถบลอยเหนือช่อง (จอคอม) — ใช้กับช่องพิมพ์บรรทัดเดียว/กล่องเล็ก */
export function useLinkRequest(): [number, () => void] {
  const n = useRef(0);
  const [v, setV] = useState(0);
  return [v, () => { n.current += 1; setV(n.current); }];
}
