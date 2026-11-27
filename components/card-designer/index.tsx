"use client";
/**
 * 💌 CardDesigner — ตัวออกแบบการ์ดแบบลากวาง (ของกลาง · เจ้าของขอ "ปรับได้เยอะ ใส่รูป PNG เหมือน Canva" 2026-11-24)
 *   ลาก/ย่อขยาย/หมุนชิ้น · ข้อความหลายกล่อง (ฟอนต์ไทย-อังกฤษ 20 แบบ + ฟอนต์แบรนด์ที่อัปโหลด) · รูป PNG พื้นโปร่ง (อัปโหลด/คลังรูปกลาง)
 *   สติ๊กเกอร์ในตัว · รูปทรง · สีพื้น/รูปพื้น · ชั้น (ขึ้น/ลง ซ่อน ล็อก) · ดูดเข้ากึ่งกลาง/ขอบ · ย้อนกลับ/ทำซ้ำ (Ctrl+Z / Ctrl+Y)
 *   หน่วยจริง มม. (lib/gift-card-design) → พิมพ์ได้ขนาดเป๊ะ · วาดบนจอด้วยสูตรเดียวกับหน้าพิมพ์ (elBox / textCss)
 * ใช้: <CardDesigner value={doc} onChange={setDoc} uploadedFonts={fonts} />  ·  ดูอย่างเดียว: <CardPreview doc={doc} />
 * ตั้งค่าตัวอักษรใช้ TextStyleControl กลาง · เลือกสีใช้ ColorInput กลาง · รูปจากคลังใช้ AssetPicker กลาง
 * คู่มือ docs/order-gift-cards.md · ทะเบียน key card-designer
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "@/components/icon";
import { Popover } from "@/components/popover";
import { ColorInput } from "@/components/color-picker";
import { TextStyleControl } from "@/components/text-style-control";
import { AssetPicker } from "@/components/asset-picker";
import { useFileUploadAccess } from "@/components/upload-permission";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { shortcutKey } from "@/lib/shortcut-key";
import type { TextFontOption, TextStyle } from "@/lib/text-style";
import {
  CARD_FONTS, CARD_MAX_ELS, CARD_MAX_MM, CARD_MIN_MM, CARD_SIZES, FONT_SIZE_MAX, FONT_SIZE_MIN, STICKERS, elBox, fontStack, googleFontsHref,
  newElId, newImageEl, newShapeEl, newTextEl, resizeDoc, resolveSrc, stickerDataUrl, textCss, uploadFontFaces,
  faceDoc, foldLine, isFolded, switchFold, withFace,
  type CardDoc, type CardEl, type CardFace, type CardRole, type CardShape, type CardTextStyle,
} from "@/lib/gift-card-design";

import { CardElView as ElView, CardPreview, InlineTextEditor, ScreenMarks, cardFontOptions, useCardFonts, useWidth, type UploadedFont } from "./preview";
export { CardPreview, CardQuickEdit, InlineTextEditor, cardFontOptions, useCardFonts, type UploadedFont } from "./preview";
const r2Url = (k: string) => r2ImageUrl(k);
const ROLE_LABEL: Record<CardRole, string> = { message: "ข้อความจากลูกค้า", to: "ถึง", from: "จาก" };

// ─── ตัวออกแบบ ───

type Drag =
  | { mode: "move"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { mode: "resize"; id: string; sx: number; sy: number; o: CardEl; hx: -1 | 0 | 1; hy: -1 | 0 | 1; keep: boolean }
  | { mode: "rotate"; id: string; cx: number; cy: number };
const HANDLES: { hx: -1 | 0 | 1; hy: -1 | 0 | 1; cur: string }[] = [
  { hx: -1, hy: -1, cur: "nwse-resize" }, { hx: 1, hy: -1, cur: "nesw-resize" }, { hx: -1, hy: 1, cur: "nesw-resize" }, { hx: 1, hy: 1, cur: "nwse-resize" },
  { hx: 0, hy: -1, cur: "ns-resize" }, { hx: 0, hy: 1, cur: "ns-resize" }, { hx: -1, hy: 0, cur: "ew-resize" }, { hx: 1, hy: 0, cur: "ew-resize" },
];
const r2d = (n: number) => Math.round(n * 100) / 100;
const btn = (on = false) => `inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px] ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"} disabled:opacity-40`;

export function CardDesigner({ value, onChange, uploadedFonts = [], height = 460, fold = null, lockSize = false, faceNote }: {
  value: CardDoc;
  onChange: (next: CardDoc) => void;
  uploadedFonts?: UploadedFont[];
  /** การ์ดพับ: เส้นรอยพับ (มม.) */
  fold?: { x?: number; y?: number } | null;
  /** ล็อกขนาด (การ์ดพับใช้ A5 ตายตัว) */
  lockSize?: boolean;
  /** ข้อความบอกด้านที่กำลังแก้ (การ์ดพับ) */
  faceNote?: string;
  /** ความสูงพื้นที่วางการ์ดบน PC (px) */
  height?: number;
}) {
  const toast = useToast();
  useCardFonts(uploadedFonts);
  const doc = value;
  const [sel, setSel] = useState<string | null>(null);
  /** กำลังพิมพ์บนการ์ด (ชิ้นข้อความ) — selectAll = เพิ่งเพิ่มข้อความใหม่ พิมพ์ทับได้เลย */
  const [editing, setEditing] = useState<{ id: string; selectAll: boolean } | null>(null);
  /** หน้าตาการ์ดก่อนเริ่มพิมพ์ — จบการพิมพ์ = ย้อนกลับได้ 1 ขั้นต่อการพิมพ์ 1 ครั้ง (ข้อ 5) */
  const editStart = useRef<CardDoc | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [tab, setTab] = useState<"add" | "edit" | "layers">("add");
  const [picker, setPicker] = useState<null | "el" | "bg">(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<"el" | "bg">("el");
  const { uploadDisabled, uploadDeniedMessage } = useFileUploadAccess();
  const fontOpts = useMemo(() => cardFontOptions(uploadedFonts), [uploadedFonts]);

  // ── ประวัติ (ย้อนกลับ/ทำซ้ำ) ──
  const past = useRef<CardDoc[]>([]);
  const future = useRef<CardDoc[]>([]);
  const docRef = useRef(doc); docRef.current = doc;
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const [, force] = useState(0);
  /** เปลี่ยนแล้วจำไว้ย้อนได้ · key เดียวกันติดกันภายใน 0.8 วิ = รวมเป็นขั้นเดียว (พิมพ์/ลากแถบเลื่อน) */
  const commit = useCallback((next: CardDoc, key?: string) => {
    const now = Date.now();
    if (!(key && lastKey.current?.key === key && now - lastKey.current.at < 800)) {
      past.current = [...past.current.slice(-79), docRef.current];
      future.current = [];
    }
    lastKey.current = key ? { key, at: now } : null;
    onChange(next);
    force((x) => x + 1);
  }, [onChange]);
  const undo = useCallback(() => {
    const p = past.current.pop(); if (!p) return;
    future.current.push(docRef.current); lastKey.current = null; onChange(p); force((x) => x + 1);
  }, [onChange]);
  const redo = useCallback(() => {
    const f = future.current.pop(); if (!f) return;
    past.current.push(docRef.current); lastKey.current = null; onChange(f); force((x) => x + 1);
  }, [onChange]);

  const selected = doc.els.find((e) => e.id === sel) ?? null;
  const patchEl = useCallback((id: string, p: Partial<CardEl>, key?: string) => {
    commit({ ...docRef.current, els: docRef.current.els.map((e) => (e.id === id ? { ...e, ...p } : e)) }, key ? `${key}:${id}` : undefined);
  }, [commit]);
  const patchStyle = (p: Partial<CardTextStyle>, key?: string) => { if (selected?.style) patchEl(selected.id, { style: { ...selected.style, ...p } }, key); };
  const addEl = (e: CardEl) => {
    if (docRef.current.els.length >= CARD_MAX_ELS) { toast.error(`ใส่ได้สูงสุด ${CARD_MAX_ELS} ชิ้นต่อการ์ด`); return; }
    commit({ ...docRef.current, els: [...docRef.current.els, e] }); setSel(e.id); setTab("edit");
  };
  // ── พิมพ์บนการ์ด (ข้อ 1-5) ──
  const startEdit = (id: string, selectAll = false) => {
    const e = docRef.current.els.find((x) => x.id === id);
    if (!e || e.kind !== "text" || e.locked) return;
    setSel(id); editStart.current = null; setEditing({ id, selectAll });
  };
  /** แก้ระหว่างพิมพ์ — ยังไม่ลงประวัติ (รวมเป็นขั้นเดียวตอนจบ) */
  const liveEl = (id: string, p: Partial<CardEl>) => {
    if (!editStart.current) editStart.current = docRef.current;
    onChange({ ...docRef.current, els: docRef.current.els.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  };
  const finishEdit = () => {
    if (editStart.current && editStart.current !== docRef.current) {
      past.current = [...past.current.slice(-79), editStart.current]; future.current = []; lastKey.current = null; force((x) => x + 1);
    }
    editStart.current = null; setEditing(null);
  };
  /** ข้อความที่เพิ่งเพิ่ม (ยังไม่อยู่ใน docRef ตอนกด) → เข้าโหมดพิมพ์ เลือกข้อความตัวอย่างไว้ให้พิมพ์ทับ (ข้อ 4) */
  const startEditNew = (el: CardEl) => { setSel(el.id); editStart.current = null; setEditing({ id: el.id, selectAll: true }); };
  const removeEl = (id: string) => { commit({ ...docRef.current, els: docRef.current.els.filter((e) => e.id !== id) }); setSel(null); };
  const duplicate = (id: string) => {
    const e = docRef.current.els.find((x) => x.id === id); if (!e) return;
    addEl({ ...e, id: newElId(), x: r2d(e.x + 3), y: r2d(e.y + 3), role: null, locked: false });
  };
  const move = (id: string, dir: "up" | "down" | "top" | "bottom") => {
    const els = [...docRef.current.els]; const i = els.findIndex((e) => e.id === id); if (i < 0) return;
    const [e] = els.splice(i, 1);
    const j = dir === "top" ? els.length : dir === "bottom" ? 0 : dir === "up" ? Math.min(els.length, i + 1) : Math.max(0, i - 1);
    els.splice(j, 0, e); commit({ ...docRef.current, els });
  };

  // ── ขนาดบนจอ ──
  const [wrapRef, wrapW] = useWidth<HTMLDivElement>();
  const k = Math.max(0.5, Math.min((wrapW - 24) / doc.w, (height - 24) / doc.h));
  const stageRef = useRef<HTMLDivElement>(null);

  // ── ลาก / ย่อขยาย / หมุน ──
  const drag = useRef<Drag | null>(null);
  const startDoc = useRef<CardDoc | null>(null);
  const toMm = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  };
  const onElDown = (ev: RPointerEvent, e: CardEl) => {
    ev.stopPropagation();
    setSel(e.id);
    if (e.locked) return;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    startDoc.current = docRef.current;
    drag.current = { mode: "move", id: e.id, sx: ev.clientX, sy: ev.clientY, ox: e.x, oy: e.y };
  };
  const onHandleDown = (ev: RPointerEvent, e: CardEl, hx: -1 | 0 | 1, hy: -1 | 0 | 1) => {
    ev.stopPropagation(); ev.preventDefault();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    startDoc.current = docRef.current;
    drag.current = { mode: "resize", id: e.id, sx: ev.clientX, sy: ev.clientY, o: e, hx, hy, keep: e.kind === "image" || (hx !== 0 && hy !== 0 && e.kind === "text") };
  };
  const onRotateDown = (ev: RPointerEvent, e: CardEl) => {
    ev.stopPropagation(); ev.preventDefault();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    startDoc.current = docRef.current;
    const r = stageRef.current!.getBoundingClientRect();
    drag.current = { mode: "rotate", id: e.id, cx: r.left + (e.x + e.w / 2) * k, cy: r.top + (e.y + e.h / 2) * k };
  };
  const onMove = (ev: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    const cur = docRef.current;
    const e = cur.els.find((x) => x.id === d.id); if (!e) return;
    const set = (p: Partial<CardEl>) => onChange({ ...cur, els: cur.els.map((x) => (x.id === d.id ? { ...x, ...p } : x)) });
    if (d.mode === "move") {
      let x = d.ox + (ev.clientX - d.sx) / k, y = d.oy + (ev.clientY - d.sy) / k;
      const th = 6 / k;   // ดูดเข้าเส้นภายใน ~6px
      const xs = [0, cur.w / 2, cur.w, ...cur.els.filter((o) => o.id !== e.id && !o.hidden).flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
      const ys = [0, cur.h / 2, cur.h, ...cur.els.filter((o) => o.id !== e.id && !o.hidden).flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
      const gv: number[] = [], gh: number[] = [];
      if (!ev.altKey) {
        for (const [off, ref] of [[0, "l"], [e.w / 2, "c"], [e.w, "r"]] as const) { void ref; const hit = xs.find((t) => Math.abs(x + off - t) < th); if (hit !== undefined) { x = hit - off; gv.push(hit); break; } }
        for (const off of [0, e.h / 2, e.h]) { const hit = ys.find((t) => Math.abs(y + off - t) < th); if (hit !== undefined) { y = hit - off; gh.push(hit); break; } }
      }
      setGuides({ v: gv, h: gh });
      set({ x: r2d(x), y: r2d(y) });
    } else if (d.mode === "resize") {
      const o = d.o;
      const rad = (o.rot * Math.PI) / 180;
      const dx0 = (ev.clientX - d.sx) / k, dy0 = (ev.clientY - d.sy) / k;
      const dx = dx0 * Math.cos(rad) + dy0 * Math.sin(rad), dy = -dx0 * Math.sin(rad) + dy0 * Math.cos(rad);
      let w = o.w + d.hx * dx, h = o.h + d.hy * dy;
      const minH = o.kind === "shape" && o.shape === "line" ? 0 : 2;
      if (d.keep && d.hx !== 0 && d.hy !== 0 && !ev.shiftKey) {
        const s = Math.max(w / o.w, h / Math.max(o.h, 0.01));
        w = o.w * s; h = o.h * s;
      }
      w = Math.max(2, w); h = Math.max(minH, h);
      const p: Partial<CardEl> = { w: r2d(w), h: r2d(h), x: r2d(d.hx === -1 ? o.x + (o.w - w) : o.x), y: r2d(d.hy === -1 ? o.y + (o.h - h) : o.y) };
      if (o.kind === "text" && o.style && d.hx !== 0 && d.hy !== 0) p.style = { ...o.style, size: r2d(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, o.style.size * (w / o.w)))) };
      set(p);
    } else {
      let a = (Math.atan2(ev.clientY - d.cy, ev.clientX - d.cx) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      const step = ev.shiftKey ? 15 : 0;
      if (step) a = Math.round(a / step) * step;
      else for (const t of [-180, -90, 0, 90, 180]) if (Math.abs(a - t) < 4) a = t;
      set({ rot: Math.round(a) });
    }
  };
  const onUp = () => {
    if (drag.current && startDoc.current && startDoc.current !== docRef.current) {
      past.current = [...past.current.slice(-79), startDoc.current]; future.current = []; lastKey.current = null; force((x) => x + 1);
    }
    drag.current = null; startDoc.current = null; setGuides({ v: [], h: [] });
  };

  // ── แป้นพิมพ์ (เฉพาะตอนโฟกัสอยู่ในตัวออกแบบ และไม่ได้พิมพ์ในช่อง) ──
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (!root.contains(t) || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      const key = shortcutKey(ev);
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && key === "z") { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
      if (mod && key === "y") { ev.preventDefault(); redo(); return; }
      const s = docRef.current.els.find((e) => e.id === sel);
      if (!s) return;
      if (mod && key === "d") { ev.preventDefault(); duplicate(s.id); return; }
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); if (!s.locked) removeEl(s.id); return; }
      if (ev.key === "Escape") { setSel(null); return; }
      const step = ev.shiftKey ? 5 : 0.5;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[ev.key] && !s.locked) { ev.preventDefault(); const [dx, dy] = arrows[ev.key]; patchEl(s.id, { x: r2d(s.x + dx), y: r2d(s.y + dy) }, "nudge"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── รูป: อัปโหลด / คลังรูป ──
  const ratioOf = (url: string) => new Promise<number>((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth / Math.max(1, im.naturalHeight)); im.onerror = () => res(1); im.src = url; });
  const placeImage = async (key: string) => {
    if (uploadTarget.current === "bg") { commit({ ...docRef.current, bg: { ...docRef.current.bg, image: `r2:${key}` } }); return; }
    const ratio = await ratioOf(r2ImageUrl(key) ?? "");
    addEl(newImageEl(docRef.current, `r2:${key}`, ratio));
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { toast.error("ใช้รูป PNG / JPG / WEBP"); return; }
    if (f.size > 4 * 1024 * 1024) { toast.error("รูปใหญ่เกิน 4 MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("folder", "gift-cards");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || j.error || !j.r2_key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
      await placeImage(String(j.r2_key));
    } catch (e) { toast.error((e as Error).message || "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const pickUpload = (target: "el" | "bg") => {
    if (uploadDisabled) { toast.error(uploadDeniedMessage ?? "ไม่มีสิทธิ์อัปโหลดไฟล์"); return; }
    uploadTarget.current = target; fileRef.current?.click();
  };

  // ── ส่วนหน้าจอ ──
  const sizeKey = CARD_SIZES.find((s) => s.w === doc.w && s.h === doc.h)?.key ?? "custom";
  const addPanel = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className={btn()} onClick={() => { const el = newTextEl(docRef.current); addEl(el); setTimeout(() => startEditNew(el), 0); }}><Icon value="i:typography" /> ข้อความ</button>
        <button type="button" className={btn()} disabled={uploading} onClick={() => pickUpload("el")}><Icon value="i:upload" /> {uploading ? "กำลังอัป…" : "รูป PNG"}</button>
        <button type="button" className={btn()} onClick={() => { uploadTarget.current = "el"; setPicker("el"); }}><Icon value="i:photo" /> คลังรูป</button>
        <Popover panelClassName="w-48 p-1" trigger={(toggle, open) => <button type="button" className={btn(open)} onClick={toggle}><Icon value="i:square" /> รูปทรง</button>}>
          {(close) => <div className="flex flex-col">{([["rect", "สี่เหลี่ยม", "i:square"], ["ellipse", "วงกลม/วงรี", "i:circle"], ["line", "เส้นตรง", "i:line"]] as [CardShape, string, string][]).map(([s, l, ic]) => (
            <button key={s} type="button" onClick={() => { addEl(newShapeEl(docRef.current, s)); close(); }} className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-slate-50"><Icon value={ic} /> {l}</button>))}</div>}
        </Popover>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-500">สติ๊กเกอร์</div>
        <div className="grid grid-cols-7 gap-1">
          {STICKERS.map((s) => (
            <button key={s.key} type="button" title={s.label} onClick={() => addEl(newImageEl(docRef.current, `sticker:${s.key}`, 1))} className="flex aspect-square items-center justify-center rounded-md border border-slate-200 bg-white p-1 hover:bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stickerDataUrl(s.svg)} alt={s.label} className="h-full w-full" />
            </button>))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-slate-500">พื้นการ์ด</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ColorInput value={doc.bg.color} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && commit({ ...docRef.current, bg: { ...docRef.current.bg, color: v.toLowerCase() } }, "bg")} allowText={false} />
          {["#fffdf8", "#ffffff", "#fff4f1", "#fdecef", "#eef6ee", "#1f2a44", "#2c2c2a"].map((c) => (
            <button key={c} type="button" aria-label={c} onClick={() => commit({ ...docRef.current, bg: { ...docRef.current.bg, color: c } })} className={`h-6 w-6 rounded-full border ${doc.bg.color === c ? "ring-2 ring-violet-400 ring-offset-1" : "border-slate-200"}`} style={{ background: c }} />))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn()} onClick={() => pickUpload("bg")}><Icon value="i:upload" /> รูปพื้น</button>
          <button type="button" className={btn()} onClick={() => { uploadTarget.current = "bg"; setPicker("bg"); }}><Icon value="i:photo" /> จากคลัง</button>
          {doc.bg.image && <>
            <button type="button" className={btn()} onClick={() => commit({ ...docRef.current, bg: { ...docRef.current.bg, fit: docRef.current.bg.fit === "cover" ? "contain" : "cover" } })}>{doc.bg.fit === "cover" ? "เต็มการ์ด" : "พอดีรูป"}</button>
            <button type="button" className={btn()} onClick={() => commit({ ...docRef.current, bg: { ...docRef.current.bg, image: null } })}><Icon value="i:x" /> เอารูปพื้นออก</button>
          </>}
        </div>
      </div>
      {lockSize ? <p className="text-[11px] text-slate-500">ขนาด: กระดาษ A5 พับครึ่ง ({doc.w} × {doc.h} มม.) · เปลี่ยนแนวพับได้ที่แถบด้านบน</p> : <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-slate-500">ขนาดการ์ด</div>
        <select value={sizeKey} onChange={(e) => { const s = CARD_SIZES.find((x) => x.key === e.target.value); if (s) commit(resizeDoc(docRef.current, s.w, s.h)); }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]">
          {CARD_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          <option value="custom">กำหนดเอง ({doc.w} × {doc.h} มม.)</option>
        </select>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
          <NumField label="กว้าง" value={doc.w} min={CARD_MIN_MM} max={CARD_MAX_MM} onChange={(v) => commit(resizeDoc(docRef.current, v, docRef.current.h))} /> ×
          <NumField label="สูง" value={doc.h} min={CARD_MIN_MM} max={CARD_MAX_MM} onChange={(v) => commit(resizeDoc(docRef.current, docRef.current.w, v))} /> มม.
        </div>
      </div>}
    </div>
  );

  const editPanel = !selected ? (
    <p className="rounded-lg bg-slate-50 p-3 text-[12px] text-slate-500">กดชิ้นบนการ์ดเพื่อแก้ · ดับเบิลคลิกข้อความเพื่อพิมพ์บนการ์ด · ลากเพื่อย้าย · ลากจุดมุมเพื่อย่อ/ขยาย · ลากจุดกลมด้านบนเพื่อหมุน</p>
  ) : (
    <div className="space-y-3">
      {selected.kind === "text" && selected.style && <>
        <textarea value={selected.text ?? ""} rows={3} maxLength={600} onChange={(e) => patchEl(selected.id, { text: e.target.value }, "text")} placeholder="พิมพ์ข้อความ…"
          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm" style={{ fontFamily: fontStack(selected.style.font) }} />
        <div className="space-y-1 text-[12px]">
          <span className="text-slate-500">ชิ้นข้อความนี้คือ</span>
          <div className="flex flex-wrap gap-1">
            {([null, "message", "to", "from"] as (CardRole | null)[]).map((role) => {
              const on = (selected.role ?? null) === role;
              return (
                <button key={role ?? "fixed"} type="button" onClick={() => {
                  // role ละ 1 ชิ้น — ชิ้นเดิมที่มี role นี้ถูกปลดออก
                  commit({ ...docRef.current, els: docRef.current.els.map((x) => (x.id === selected.id ? { ...x, role } : role && x.role === role ? { ...x, role: null } : x)) });
                }} className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 ${on ? (role === "message" ? "border-amber-400 bg-amber-50 font-medium text-amber-800" : "border-violet-300 bg-violet-50 text-violet-800") : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {role === "message" && <Icon value="i:message" />}{role ? ROLE_LABEL[role] : "ข้อความตายตัว"}
                </button>
              );
            })}
          </div>
          {selected.role === "message" && <p className="text-[11px] text-amber-700">ระบบเอาหมายเหตุออเดอร์มาใส่ช่องนี้ให้เอง · กรอบเส้นปะสีเหลืองเห็นแค่บนจอ ไม่ติดตอนพิมพ์</p>}
        </div>
        <TextStyleControl
          value={{ font: selected.style.font, color: selected.style.color, bold: selected.style.bold, italic: selected.style.italic, underline: selected.style.underline, align: selected.style.align }}
          onChange={(v: TextStyle) => patchStyle({ font: v.font ?? selected.style!.font, color: v.color ?? selected.style!.color, bold: !!v.bold, italic: !!v.italic, underline: !!v.underline, align: v.align ?? "center" }, "style")}
          fonts={fontOpts}
          hide={{ size: true, strike: true, highlight: true, list: true }}
        />
        <Slider label="ขนาดตัวอักษร" unit="pt" value={selected.style.size} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={0.5} onChange={(v) => patchStyle({ size: v }, "size")} />
        <Slider label="ระยะบรรทัด" value={selected.style.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => patchStyle({ lineHeight: v }, "lh")} />
        <Slider label="ระยะตัวอักษร" unit="มม." value={selected.style.letterSpacing} min={-2} max={10} step={0.1} onChange={(v) => patchStyle({ letterSpacing: v }, "ls")} />
        <div className="flex items-center gap-1 text-[12px]">
          <span className="mr-1 text-slate-500">แนวตั้ง</span>
          {([["top", "บน"], ["middle", "กลาง"], ["bottom", "ล่าง"]] as const).map(([v, l]) => <button key={v} type="button" className={btn(selected.style!.valign === v)} onClick={() => patchStyle({ valign: v })}>{l}</button>)}
        </div>
      </>}
      {selected.kind === "image" && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn()} onClick={() => patchEl(selected.id, { fit: selected.fit === "cover" ? "contain" : "cover" })}>{selected.fit === "cover" ? "ตัดให้เต็มกรอบ" : "พอดีกรอบ"}</button>
          <button type="button" className={btn(!!selected.flipX)} onClick={() => patchEl(selected.id, { flipX: !selected.flipX })}>กลับด้าน</button>
        </div>
      )}
      {selected.kind === "shape" && (
        <div className="space-y-2 text-[12px]">
          {selected.shape !== "line" && <div className="flex items-center gap-2"><span className="w-16 text-slate-500">สีพื้น</span><ColorInput value={selected.fill || "#ffffff"} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patchEl(selected.id, { fill: v.toLowerCase() }, "fill")} allowText={false} />
            {selected.fill && <button type="button" className={btn()} onClick={() => patchEl(selected.id, { fill: "" })}>ไม่มีสี</button>}</div>}
          <div className="flex items-center gap-2"><span className="w-16 text-slate-500">สีเส้น</span><ColorInput value={selected.stroke || "#000000"} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patchEl(selected.id, { stroke: v.toLowerCase() }, "stroke")} allowText={false} />
            {selected.stroke && selected.shape !== "line" && <button type="button" className={btn()} onClick={() => patchEl(selected.id, { stroke: "" })}>ไม่มีเส้น</button>}</div>
          <Slider label="ความหนาเส้น" unit="มม." value={selected.strokeW ?? 0.5} min={0} max={10} step={0.1} onChange={(v) => patchEl(selected.id, { strokeW: v }, "sw")} />
          {selected.shape === "rect" && <Slider label="มุมมน" unit="มม." value={selected.radius ?? 0} min={0} max={50} step={0.5} onChange={(v) => patchEl(selected.id, { radius: v }, "rad")} />}
        </div>
      )}
      <Slider label="ความทึบ" unit="%" value={Math.round(selected.opacity * 100)} min={5} max={100} step={1} onChange={(v) => patchEl(selected.id, { opacity: v / 100 }, "op")} />
      <Slider label="หมุน" unit="°" value={selected.rot} min={-180} max={180} step={1} onChange={(v) => patchEl(selected.id, { rot: v }, "rot")} />
      <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-500">
        <NumField label="X" value={selected.x} onChange={(v) => patchEl(selected.id, { x: v })} />
        <NumField label="Y" value={selected.y} onChange={(v) => patchEl(selected.id, { y: v })} />
        <NumField label="กว้าง" value={selected.w} min={1} onChange={(v) => patchEl(selected.id, { w: v })} />
        <NumField label="สูง" value={selected.h} min={0} onChange={(v) => patchEl(selected.id, { h: v })} />
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn()} title="กึ่งกลางแนวนอน" onClick={() => patchEl(selected.id, { x: r2d((doc.w - selected.w) / 2) })}><Icon value="i:align-center" /> กลางซ้าย-ขวา</button>
        <button type="button" className={btn()} title="กึ่งกลางแนวตั้ง" onClick={() => patchEl(selected.id, { y: r2d((doc.h - selected.h) / 2) })}>กลางบน-ล่าง</button>
        <button type="button" className={btn()} title="ขึ้นบนสุด" onClick={() => move(selected.id, "top")}><Icon value="i:stack-2" /> หน้าสุด</button>
        <button type="button" className={btn()} title="ลงล่างสุด" onClick={() => move(selected.id, "bottom")}>หลังสุด</button>
        <button type="button" className={btn()} onClick={() => duplicate(selected.id)}><Icon value="i:copy" /> สำเนา</button>
        <button type="button" className={btn(!!selected.locked)} onClick={() => patchEl(selected.id, { locked: !selected.locked })}><Icon value={selected.locked ? "i:lock" : "i:lock-open"} /> {selected.locked ? "ล็อกอยู่" : "ล็อก"}</button>
        <button type="button" className={`${btn()} text-rose-600`} onClick={() => removeEl(selected.id)}><Icon value="i:trash" /> ลบ</button>
      </div>
    </div>
  );

  const layersPanel = (
    <div className="space-y-1">
      {doc.els.length === 0 && <p className="text-[12px] text-slate-400">ยังไม่มีชิ้นบนการ์ด</p>}
      {[...doc.els].reverse().map((e, ri) => {
        const i = doc.els.length - 1 - ri;
        const name = e.kind === "text" ? (e.text || "(ข้อความว่าง)") : e.kind === "image" ? (e.src?.startsWith("sticker:") ? `สติ๊กเกอร์ ${STICKERS.find((s) => `sticker:${s.key}` === e.src)?.label ?? ""}` : "รูป") : e.shape === "line" ? "เส้นตรง" : e.shape === "ellipse" ? "วงกลม" : "สี่เหลี่ยม";
        return (
          <div key={e.id} onClick={() => { setSel(e.id); setTab("edit"); }} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] ${e.id === sel ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
            <Icon value={e.kind === "text" ? "i:typography" : e.kind === "image" ? "i:photo" : "i:square"} className="shrink-0 text-slate-400" />
            <span className={`min-w-0 flex-1 truncate ${e.hidden ? "text-slate-300 line-through" : "text-slate-700"}`}>{name}</span>
            {e.role && <span className="shrink-0 rounded bg-amber-50 px-1 text-[10px] text-amber-700">{ROLE_LABEL[e.role]}</span>}
            <button type="button" title="ขึ้น" disabled={i === doc.els.length - 1} onClick={(ev) => { ev.stopPropagation(); move(e.id, "up"); }} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><Icon value="i:chevron-up" /></button>
            <button type="button" title="ลง" disabled={i === 0} onClick={(ev) => { ev.stopPropagation(); move(e.id, "down"); }} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><Icon value="i:chevron-down" /></button>
            <button type="button" title={e.hidden ? "แสดง" : "ซ่อน"} onClick={(ev) => { ev.stopPropagation(); patchEl(e.id, { hidden: !e.hidden }); }} className="text-slate-400 hover:text-slate-700"><Icon value={e.hidden ? "i:eye-off" : "i:eye"} /></button>
            <button type="button" title={e.locked ? "ปลดล็อก" : "ล็อก"} onClick={(ev) => { ev.stopPropagation(); patchEl(e.id, { locked: !e.locked }); }} className="text-slate-400 hover:text-slate-700"><Icon value={e.locked ? "i:lock" : "i:lock-open"} /></button>
          </div>
        );
      })}
    </div>
  );

  const bgUrl = resolveSrc(doc.bg.image, r2Url);
  return (
    <div ref={rootRef} className="flex flex-col gap-3 lg:flex-row" tabIndex={-1}>
      {/* พื้นที่การ์ด */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button type="button" className={btn()} disabled={!past.current.length} onClick={undo} title="ย้อนกลับ (Ctrl+Z)"><Icon value="i:arrow-back-up" /> ย้อน</button>
          <button type="button" className={btn()} disabled={!future.current.length} onClick={redo} title="ทำซ้ำ (Ctrl+Y)"><Icon value="i:arrow-forward-up" /> ทำซ้ำ</button>
          {faceNote && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">{faceNote}</span>}
          <span className="text-[11px] text-slate-400">{doc.w} × {doc.h} มม. · ลูกศร = ขยับ 0.5 มม. (Shift = 5) · Alt ค้าง = ไม่ดูดเส้น</span>
        </div>
        <div ref={wrapRef} className="flex items-center justify-center rounded-xl bg-slate-100 p-3" style={{ minHeight: Math.min(height, doc.h * k + 24) }} onPointerDown={() => setSel(null)}>
          <div ref={stageRef} className="relative shadow-md ring-1 ring-black/10" style={{ width: doc.w * k, height: doc.h * k, background: doc.bg.color, overflow: "visible", touchAction: "none" }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className="absolute inset-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {bgUrl && <img src={bgUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: doc.bg.fit, pointerEvents: "none" }} />}
              {doc.els.map((e) => !e.hidden && editing?.id !== e.id && (
                <div key={e.id} onPointerDown={(ev) => onElDown(ev, e)} onDoubleClick={() => { if (e.kind === "text" && !e.locked) startEdit(e.id); else setTab("edit"); }}
                  title={e.kind === "text" && !e.locked ? "ดับเบิลคลิกเพื่อพิมพ์บนการ์ด" : undefined} style={{ cursor: e.locked ? "default" : "move" }}>
                  <ElView e={e} k={k} />
                </div>
              ))}
            </div>
            <ScreenMarks doc={doc} k={k} fold={fold} />
            {editing && (() => {
              const e = doc.els.find((x) => x.id === editing.id);
              if (!e) return null;
              return (
                <InlineTextEditor key={e.id} e={e} k={k} value={e.text ?? ""} selectAll={editing.selectAll} fontOpts={fontOpts}
                  onText={(v) => liveEl(e.id, { text: v })}
                  onGrow={(h) => liveEl(e.id, { h: r2d(Math.min(doc.h - e.y, h)) })}
                  onStyle={(p) => e.style && liveEl(e.id, { style: { ...e.style, ...p } })}
                  onDone={finishEdit} />
              );
            })()}
            {guides.v.map((x, i) => <div key={`v${i}`} className="pointer-events-none absolute top-0 h-full w-px bg-fuchsia-500" style={{ left: x * k }} />)}
            {guides.h.map((y, i) => <div key={`h${i}`} className="pointer-events-none absolute left-0 h-px w-full bg-fuchsia-500" style={{ top: y * k }} />)}
            {selected && !selected.hidden && !editing && (() => {
              const b = elBox(selected, k);
              const lineH = selected.kind === "shape" && selected.shape === "line";
              return (
                <div className="pointer-events-none absolute" style={{ left: b.left, top: b.top - (lineH ? 4 : 0), width: b.width, height: lineH ? 8 : b.height, transform: selected.rot ? `rotate(${selected.rot}deg)` : undefined }}>
                  <div className={`absolute inset-0 ${selected.locked ? "outline-dashed outline-1 outline-slate-400" : "outline outline-2 outline-violet-500"}`} />
                  {!selected.locked && <>
                    {HANDLES.filter((h) => !(lineH && h.hy !== 0)).map((h) => (
                      <div key={`${h.hx}${h.hy}`} onPointerDown={(ev) => onHandleDown(ev, selected, h.hx, h.hy)}
                        className="pointer-events-auto absolute h-3 w-3 rounded-sm border border-violet-500 bg-white" style={{ left: `calc(${(h.hx + 1) * 50}% - 6px)`, top: `calc(${(h.hy + 1) * 50}% - 6px)`, cursor: h.cur, touchAction: "none" }} />
                    ))}
                    <div onPointerDown={(ev) => onRotateDown(ev, selected)} title="ลากเพื่อหมุน (Shift = ทีละ 15°)"
                      className="pointer-events-auto absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-violet-500 bg-white" style={{ top: -26, cursor: "grab", touchAction: "none" }} />
                  </>}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* แผงเครื่องมือ (PC ด้านขวา · มือถือ ด้านล่างเป็นแท็บ) */}
      <div className="w-full shrink-0 lg:w-[300px]">
        <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-[12px]">
          {([["add", "เพิ่ม/พื้น"], ["edit", "แก้ชิ้น"], ["layers", `ชั้น (${doc.els.length})`]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={`flex-1 rounded-md px-2 py-1.5 ${tab === v ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"}`}>{l}</button>))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          {tab === "add" ? addPanel : tab === "edit" ? editPanel : layersPanel}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <AssetPicker open={picker !== null} onClose={() => setPicker(null)} typeFilter="image" title={picker === "bg" ? "เลือกรูปพื้นการ์ด" : "เลือกรูปใส่การ์ด"}
        onSelect={(assets) => { setPicker(null); for (const a of assets.slice(0, 5)) if (a.r2_key) void placeImage(a.r2_key); }} />
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="block text-[12px] text-slate-500">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-slate-700">{Math.round(value * 100) / 100}{unit ? ` ${unit}` : ""}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-violet-600" />
    </label>
  );
}

function NumField({ label, value, onChange, min = -1000, max = 1000 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(Math.round(value * 100) / 100)), [value]);
  const done = () => { const n = Number(txt); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100))); else setTxt(String(value)); };
  return (
    <label className="flex flex-col">
      <span className="text-[10px] text-slate-400">{label}</span>
      <input value={txt} inputMode="decimal" onChange={(e) => setTxt(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 w-full min-w-0 rounded-md border border-slate-200 px-1.5 text-[12px] tabular-nums text-slate-800" />
    </label>
  );
}

/**
 * ตัวออกแบบที่รองรับการ์ดพับ (เจ้าของเลือก 2026-11-25) — การ์ดแผ่นเดียว = CardDesigner ตามเดิม
 * การ์ดพับ = สลับแก้ "ด้านนอก" (หลัง + ปกหน้า) / "ด้านใน" (ช่องข้อความจากลูกค้า) · เส้นปะแดง = รอยพับ · ขนาด A5 ล็อก
 * ประวัติย้อน (Ctrl+Z) แยกต่อด้าน — สลับด้านแล้วเริ่มนับใหม่
 */
export function CardDesignerAny({ value, onChange, uploadedFonts = [], height = 460 }: { value: CardDoc; onChange: (next: CardDoc) => void; uploadedFonts?: UploadedFont[]; height?: number }) {
  const [face, setFace] = useState<CardFace>("out");
  const valueRef = useRef(value); valueRef.current = value;
  const onFace = useCallback((f: CardDoc) => onChange(withFace(valueRef.current, face, f)), [onChange, face]);
  if (!isFolded(value)) return <CardDesigner value={value} onChange={onChange} uploadedFonts={uploadedFonts} height={height} />;
  const side = value.fold === "side";
  const note = face === "out"
    ? (side ? "ด้านนอก · ซ้าย = หลังการ์ด · ขวา = ปกหน้า" : "ด้านนอก · บน = หลังการ์ด (กลับหัวตอนพับ) · ล่าง = ปกหน้า")
    : (side ? "ด้านใน · ซ้าย = ในซ้าย · ขวา = ในขวา" : "ด้านใน · บน = ในบน · ล่าง = ในล่าง");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-[13px]">
          {([["out", "ด้านนอก (ปกหน้า + หลัง)"], ["in", "ด้านใน"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFace(k)} className={`h-8 px-3 ${face === k ? "bg-violet-600 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
        <span className="text-[12px] text-slate-500">การ์ดพับ A6 (กระดาษ A5 พับครึ่ง · {side ? "พับข้าง เปิดแบบหนังสือ" : "พับบน เปิดขึ้น"}) · เส้นปะแดง = รอยพับ ไม่ติดตอนพิมพ์</span>
        {/* สลับทิศพับ (เจ้าของเลือก 2026-11-27 ข้อ 6) — ชิ้นย้ายตามให้เอง · กดอีกครั้ง = สลับกลับ */}
        <button type="button" onClick={() => onChange(switchFold(valueRef.current, side ? "top" : "side"))}
          title={side ? "เปลี่ยนเป็นพับบน เปิดขึ้น — หน้าการ์ด A6 แนวนอน" : "เปลี่ยนเป็นพับข้าง เปิดแบบหนังสือ — หน้าการ์ด A6 แนวตั้ง"}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-50">
          <Icon value="i:arrows-exchange" /> {side ? "เปลี่ยนเป็นหน้าแนวนอน (พับบน)" : "เปลี่ยนเป็นหน้าแนวตั้ง (พับข้าง)"}
        </button>
      </div>
      <CardDesigner key={face} value={faceDoc(value, face)} onChange={onFace} uploadedFonts={uploadedFonts} height={height} fold={foldLine(value)} lockSize faceNote={note} />
    </div>
  );
}
