"use client";
/**
 * 🧱 บล็อกพิมพ์ — แท็บ "จัดวางในบล็อก" · เจ้าของเลือกใน widget 2026-11-24 (ข้อเสนอ 1-6 · สีแยกส่วนบนจอ PDF ดำล้วน)
 *   ตั้งขนาดบล็อก → วางชิ้นจากไฟล์ .ai / ข้อความ (เลือกฟอนต์ แปลงเป็นเส้น) / สี่เหลี่ยม / วงกลม / เส้นตรง
 *   ย้าย: ลาก (เลื่อนทีละ 0.1 มม. ดูดขอบ/กึ่งกลางบล็อก) · ลูกศร 0.1 มม. (Shift = 1 มม.) · พิมพ์ X/Y
 *   ปรับขนาด: จุดจับ 4 มุม (ล็อกสัดส่วน · Shift = ยืดอิสระ) + 4 ด้าน · โชว์ขนาดสดระหว่างลาก
 *   ซูม: use-zoom.ts (Ctrl+ล้อเมาส์ · ปุ่ม · ถ่างนิ้ว) · กรอบภาพขยายได้อย่างเดียว ไม่หดระหว่างลาก (กันภาพกระตุก)
 *   ชิ้นจากคลัง: SymbolPickerModal → ชิ้นชนิด vector (เก็บเส้นในบล็อกเลย ไม่ผูกกับชิ้นในงาน)
 *   เลือกหลายชิ้น: Shift+คลิก / ลากกรอบ · จัดแนว · กระจายระยะเท่ากัน · ทำซ้ำเป็นแถว · ลบ (Delete)
 *   ภาพนี้วาดระยะ/เส้นไกด์ชมพูด้วย layoutDims ตัวเดียวกับ PDF · ประวัติย้อนกลับ/บันทึก = ของหน้าทำงาน (editor.tsx)
 *   สูตรทั้งหมด lib/block-print-layout.ts · แปลงข้อความ lib/block-print-text.ts
 *   กระดาน = ชุดกระดานกลาง (components/board-kit): ล็อก (ลูกกลิ้ง = เลื่อนหน้า · ล็อกเข้ม = ลาก/ย้าย/ปรับขนาด/ลบ บนกระดานไม่ได้ เลือกได้) · กล่องเครื่องมือลอย · ปุ่มลัด ? · ขยายเต็มจอ
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { downloadBlob } from "@/lib/pdf-merge-engine";
import { buildLayoutPdf } from "@/lib/block-print-pdf";
import { DIM, DIM_COLORS, PAPERS, UNITS, fromUnit, opsToSvgPath, pdfFileName, toUnit, type BlockPaper, type BlockPiece, type BlockUnit } from "@/lib/block-print";
import {
  BLOCK_FONTS, KIND_LABEL, LAYOUT_LIMITS, POS_COLOR, SCREEN_COLORS, alignItems, baseItem, dimsExtent, distributeItems, findBlockFont,
  itemInk, itemSvg, layoutDims, layoutSvg, missingPieceIds, newLayout, outsideIds, repeatItem, resizeItem, svgFileName, uid,
  type AlignMode, type BlockItem, type BlockLayout, type ItemKind,
} from "@/lib/block-print-layout";
import { textToOps, uploadFont, uploadedFontNames } from "@/lib/block-print-text";
import { PieceThumb } from "./piece-thumb";
import { useCanvasZoom, zoomLabel } from "./use-zoom";
import { BoardFullscreenButton, BoardLockButton, BoardLockHint, BoardToolbox, useBoardLock, type BoardToolGroup } from "@/components/board-kit";
import { FullscreenStage, useFullscreenStage } from "@/components/fullscreen-stage";
import { SymbolPickerModal } from "./symbols-ui";
import type { BlockSymbol } from "@/lib/block-print-symbols";

type Props = {
  code: string;
  layouts: BlockLayout[];
  pieces: BlockPiece[];
  unit: BlockUnit;
  paper: BlockPaper;
  canEdit: boolean;
  onLayouts: (ls: BlockLayout[]) => void;
  onPaper: (p: BlockPaper) => void;
  onUnit: (u: BlockUnit) => void;
  undo: () => void;
  /** ทำซ้ำ (ปุ่มในกล่องเครื่องมือ) */
  redo?: () => void;
};
type Box = { x: number; y: number; w: number; h: number };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const svgBlob = (s: string) => new Blob([s], { type: "image/svg+xml" });

export function BlockLayoutEditor({ code, layouts, pieces, unit, paper, canEdit, onLayouts, onPaper, onUnit, undo, redo }: Props) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(layouts[0]?.id ?? null);
  const layout = layouts.find((l) => l.id === activeId) ?? layouts[0] ?? null;
  const [sel, setSel] = useState<string[]>([]);
  const [showDims, setShowDims] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pickPiece, setPickPiece] = useState(false);
  const [pickLib, setPickLib] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const boardLock = useBoardLock("block_print_board_lock");
  const fsStage = useFullscreenStage("block_print_board_fullscreen", { phoneAlways: false });
  const { zoom, zoomTo, step: zoomStep } = useCanvasZoom(boxRef, 1, !!layout, { locked: boardLock.locked, onLockedWheel: boardLock.nudge });
  /** ล็อกเข้ม: กดชิ้นแล้วลาก = ไม่ย้าย แต่เตือนให้ปลดล็อก */
  const blockedDrag = useRef<{ x: number; y: number } | null>(null);
  const [lock, setLock] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pieceById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);

  // เลือกอยู่แต่ชิ้นหายไป (ย้อนกลับ/ลบ) → ตัดออก
  useEffect(() => {
    if (!layout) return;
    const ids = new Set(layout.items.map((i) => i.id));
    setSel((cur) => (cur.every((id) => ids.has(id)) ? cur : cur.filter((id) => ids.has(id))));
  }, [layout]);

  const setLayout = (fn: (l: BlockLayout) => BlockLayout) => { if (layout && canEdit) onLayouts(layouts.map((l) => (l.id === layout.id ? fn(l) : l))); };
  const setItems = (fn: (items: BlockItem[], l: BlockLayout) => BlockItem[]) => setLayout((l) => ({ ...l, items: fn(l.items, l) }));
  const say = (t: string) => setMsg(t);

  // ───── บล็อก ─────
  const addBlock = () => {
    if (layouts.length >= LAYOUT_LIMITS.blocks) return toast.error(`มีบล็อกได้ไม่เกิน ${LAYOUT_LIMITS.blocks} บล็อก`);
    const nb = newLayout(layouts);
    onLayouts([...layouts, nb]); setActiveId(nb.id); setSel([]);
  };
  const dupBlock = () => {
    if (!layout) return;
    const nb: BlockLayout = { ...layout, id: uid("b"), name: `${layout.name} (สำเนา)`.slice(0, 80), items: layout.items.map((i) => ({ ...i, id: uid("i") })) };
    onLayouts([...layouts, nb]); setActiveId(nb.id); setSel([]);
  };
  const delBlock = () => {
    if (!layout) return;
    const rest = layouts.filter((l) => l.id !== layout.id);
    onLayouts(rest); setActiveId(rest[0]?.id ?? null); setSel([]);
    toast.action(`ลบ ${layout.name} แล้ว`, "ย้อนกลับ", () => { undo(); setActiveId(layout.id); });
  };

  // ───── เพิ่มชิ้น ─────
  const addItem = (it: BlockItem) => { setItems((items) => [...items, it]); setSel([it.id]); };
  const center = (w: number, h: number) => (layout ? { x: r3(Math.max(0, (layout.w - w) / 2)), y: r3(Math.max(0, (layout.h - h) / 2)) } : { x: 0, y: 0 });
  const addShape = (t: ItemKind) => {
    if (!layout) return;
    const s = Math.max(2, Math.min(layout.w, layout.h) * 0.25);
    const w = t === "line" ? Math.min(layout.w * 0.5, 30) : s, h = t === "line" ? 0 : s;
    const c = center(w, h);
    addItem(baseItem(t, c.x, c.y, w, h));
  };
  const addPiece = (p: BlockPiece) => {
    const c = center(p.w, p.h);
    addItem({ ...baseItem("piece", c.x, c.y, p.w, p.h), pieceId: p.id });
    setPickPiece(false);
  };
  const addSymbols = (syms: BlockSymbol[]) => {
    if (!layout || !syms.length) return;
    const added: BlockItem[] = syms.map((s, k) => {
      const w = Number(s.w), h = Number(s.h), c = center(w, h);
      return { ...baseItem("vector", c.x + k * 2, c.y + k * 2, w, h), parts: s.parts, dw: Number(s.ow), dh: Number(s.oh), label: s.name };
    });
    setItems((items) => [...items, ...added]); setSel(added.map((a) => a.id));
    say(`วาง ${added.length} สัญลักษณ์จากคลังแล้ว`);
  };
  const addText = async () => {
    if (!layout) return;
    setBusy("กำลังแปลงตัวหนังสือเป็นเส้น…");
    try {
      const r = await textToOps("ข้อความ", "Sarabun", 700);
      const h = Math.max(2, Math.min(8, layout.h * 0.2)), w = r3((h * r.w) / r.h), c = center(w, h);
      addItem({ ...baseItem("text", c.x, c.y, w, h), text: "ข้อความ", font: "Sarabun", weight: 700, d: r.d, dw: r.w, dh: r.h });
    } catch (e) { toast.error(e instanceof Error ? e.message : "แปลงตัวหนังสือไม่สำเร็จ"); }
    setBusy(null);
  };
  /** แก้ข้อความ/ฟอนต์ → แปลงใหม่ · ขนาดตัวอักษรเท่าเดิม */
  const retext = async (it: BlockItem, patch: { text?: string; font?: string; weight?: number }) => {
    const text = patch.text ?? it.text ?? "", font = patch.font ?? it.font ?? "Sarabun";
    const f = findBlockFont(font);
    const weight = patch.weight ?? (f && !f.weights.includes(it.weight ?? 0) ? f.weights[f.weights.length - 1] : it.weight ?? 700);
    setBusy("กำลังแปลงตัวหนังสือเป็นเส้น…");
    try {
      const r = await textToOps(text, font, weight);
      const k = it.dh ? it.h / it.dh : 1;
      setItems((items) => items.map((x) => (x.id === it.id ? { ...x, text, font, weight, d: r.d, dw: r.w, dh: r.h, w: r3(r.w * k), h: r3(r.h * k) } : x)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "แปลงตัวหนังสือไม่สำเร็จ"); }
    setBusy(null);
  };

  // ───── แก้ชิ้นที่เลือก ─────
  const picked = layout ? layout.items.filter((i) => sel.includes(i.id)) : [];
  const one = picked.length === 1 ? picked[0] : null;
  const patchItem = (id: string, p: Partial<BlockItem>) => setItems((items) => items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const removeSel = () => {
    if (!picked.length) return;
    const n = picked.length;
    setItems((items) => items.filter((i) => !sel.includes(i.id))); setSel([]);
    toast.action(`ลบ ${n} ชิ้นแล้ว`, "ย้อนกลับ", undo);
  };
  const dupSel = () => {
    if (!picked.length || !layout) return;
    const copies = picked.map((i) => ({ ...i, id: uid("i"), x: r3(i.x + 2), y: r3(i.y + 2) }));
    setItems((items) => [...items, ...copies]); setSel(copies.map((c) => c.id));
    say(`ทำซ้ำ ${copies.length} ชิ้นแล้ว (เลื่อนไป 2 มม.)`);
  };
  const order = (dir: "front" | "back") => setItems((items) => {
    const a = items.filter((i) => sel.includes(i.id)), b = items.filter((i) => !sel.includes(i.id));
    return dir === "front" ? [...b, ...a] : [...a, ...b];
  });
  const align = (m: AlignMode) => layout && setItems(() => alignItems(layout, sel, m));
  const distribute = (axis: "h" | "v") => {
    if (picked.length < 3) return say("เลือกตั้งแต่ 3 ชิ้นก่อนกระจายระยะ");
    if (layout) setItems(() => distributeItems(layout, sel, axis));
  };
  const [rep, setRep] = useState({ count: "3", gap: "1", axis: "h" as "h" | "v" });
  const doRepeat = () => {
    if (!one || !layout) return;
    const r = repeatItem(layout, one.id, Number(rep.count), fromUnit(Number(rep.gap.replace(",", ".")) || 0, unit), rep.axis);
    if (!r.added.length) return say("ใส่จำนวนที่จะทำซ้ำก่อน");
    setItems(() => r.items); setSel([one.id, ...r.added]);
    say(`ทำซ้ำเพิ่ม ${r.added.length} ชิ้นแล้ว`);
  };

  // ───── ส่งออก ─────
  const exportPdf = async () => {
    if (!layout || exporting) return;
    setExporting(true);
    try {
      const blob = await buildLayoutPdf(layout, pieces, { paper, unit, title: `${code} ${layout.name}` });
      downloadBlob(blob, pdfFileName(code, layout.name));
      toast.success("ส่งออก PDF แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ"); }
    setExporting(false);
  };
  const exportSvg = (it?: BlockItem) => {
    if (!layout) return;
    if (it) downloadBlob(svgBlob(itemSvg(it, pieceById)), svgFileName(code, layout.name, it.text || (it.pieceId ? pieceById.get(it.pieceId)?.name ?? "" : KIND_LABEL[it.t])));
    else downloadBlob(svgBlob(layoutSvg(layout, pieceById)), svgFileName(code, layout.name));
  };

  // ───── คีย์ลัด (Delete · ลูกศร · Esc) ─────
  const keyRef = useRef({ removeSel, nudge: (_dx: number, _dy: number) => {}, clear: () => {}, locked: true, warn: () => {} });
  keyRef.current = {
    removeSel,
    locked: boardLock.locked,
    warn: () => boardLock.nudge("edit"),
    nudge: (dx, dy) => sel.length && setItems((items) => items.map((i) => (sel.includes(i.id) ? { ...i, x: r3(i.x + dx), y: r3(i.y + dy) } : i))),
    clear: () => setSel([]),
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") return keyRef.current.clear();
      if (!canEdit) return;
      const step = e.shiftKey ? 1 : 0.1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      const del = e.key === "Delete" || e.key === "Backspace";
      if ((del || d) && keyRef.current.locked) { e.preventDefault(); keyRef.current.warn(); return; }
      if (del) { e.preventDefault(); keyRef.current.removeSel(); return; }
      if (d) { e.preventDefault(); keyRef.current.nudge(d[0], d[1]); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canEdit]);

  // ───── ลาก / ลากกรอบเลือก ─────
  const svgRef = useRef<SVGSVGElement>(null);
  type Live = Map<string, { x: number; y: number; w?: number; h?: number }>;
  const drag = useRef<
    | { kind: "move"; sx: number; sy: number; start: Map<string, { x: number; y: number }>; moved: boolean }
    | { kind: "box"; sx: number; sy: number; add: boolean }
    | { kind: "resize"; sx: number; sy: number; h: number; id: string; o: { x: number; y: number; w: number; h: number }; moved: boolean }
    | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [mq, setMq] = useState<Box | null>(null);
  const toSvg = (e: RPointerEvent) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!layout) return;
    const p = toSvg(e);
    const hd = (e.target as Element).closest("[data-handle]");
    if (hd && canEdit && one && !boardLock.locked) {
      drag.current = { kind: "resize", sx: p.x, sy: p.y, h: Number(hd.getAttribute("data-handle")), id: one.id, o: { x: one.x, y: one.y, w: one.w, h: one.h }, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const hit = (e.target as Element).closest("[data-item]");
    if (hit) {
      const id = hit.getAttribute("data-item")!;
      let next = sel;
      if (e.shiftKey) next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) next = [id];
      setSel(next); setMsg("");
      if (!canEdit || e.shiftKey) return;
      if (boardLock.locked) { blockedDrag.current = p; return; }
      const start = new Map(layout.items.filter((i) => next.includes(i.id)).map((i) => [i.id, { x: i.x, y: i.y }]));
      drag.current = { kind: "move", sx: p.x, sy: p.y, start, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.pointerType === "touch") { setSel([]); return; }
    drag.current = { kind: "box", sx: p.x, sy: p.y, add: e.shiftKey };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const b = blockedDrag.current;
    if (b) { const q = toSvg(e); if (Math.hypot(q.x - b.x, q.y - b.y) > 0.5) { blockedDrag.current = null; boardLock.nudge("edit"); } return; }
    const d = drag.current; if (!d || !layout) return;
    const p = toSvg(e);
    if (d.kind === "box") { setMq({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) }); return; }
    if (d.kind === "resize") {
      const it = layout.items.find((i) => i.id === d.id);
      if (!it) return;
      d.moved = true;
      setLive(new Map([[d.id, resizeBox(d.o, d.h, p.x - d.sx, p.y - d.sy, !e.shiftKey && it.t !== "line")]]));
      return;
    }
    let dx = Math.round((p.x - d.sx) * 10) / 10, dy = Math.round((p.y - d.sy) * 10) / 10;
    if (!d.moved && Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
    d.moved = true;
    // ดูดขอบ/กึ่งกลางบล็อก (ชิ้นเดียว)
    if (d.start.size === 1) {
      const [id, s] = [...d.start.entries()][0];
      const it = layout.items.find((i) => i.id === id);
      if (it) {
        const tol = 0.6;
        const snapTo = (v: number, size: number, max: number) => {
          for (const target of [0, (max - size) / 2, max - size]) if (Math.abs(v - target) < tol) return target;
          return v;
        };
        dx = r3(snapTo(s.x + dx, it.w, layout.w) - s.x); dy = r3(snapTo(s.y + dy, it.h, layout.h) - s.y);
      }
    }
    setLive(new Map([...d.start.entries()].map(([id, s]) => [id, { x: r3(s.x + dx), y: r3(s.y + dy) }])));
  };
  const onUp = () => {
    blockedDrag.current = null;
    const d = drag.current; drag.current = null;
    if (!d || !layout) return;
    if (d.kind === "move" || d.kind === "resize") {
      const lv = live; setLive(null);
      if (d.moved && lv) setItems((items) => items.map((i) => (lv.has(i.id) ? { ...i, ...lv.get(i.id)! } : i)));
      return;
    }
    const r = mq; setMq(null);
    if (!r || (r.w < 0.5 && r.h < 0.5)) { if (!d.add) setSel([]); return; }
    const inside = layout.items.filter((i) => i.x <= r.x + r.w && i.x + i.w >= r.x && i.y <= r.y + r.h && i.y + i.h >= r.y).map((i) => i.id);
    setSel((cur) => [...new Set([...(d.add ? cur : []), ...inside])]);
  };

  // ───── ภาพ ─────
  const shown = useMemo(() => (layout ? { ...layout, items: layout.items.map((i) => (live?.has(i.id) ? { ...i, ...live.get(i.id)! } : i)) } : null), [layout, live]);
  const dims = useMemo(() => (shown ? layoutDims(shown, unit) : null), [shown, unit]);
  // กรอบภาพ: คิดจากบล็อกที่บันทึกแล้ว (ไม่ใช่ระหว่างลาก) และขยายได้อย่างเดียว → ภาพไม่ขยับตามชิ้นที่ลาก (เคยกระตุก)
  const frameMax = useRef<{ key: string; f: { x0: number; y0: number; x1: number; y1: number } } | null>(null);
  const frame = useMemo(() => {
    if (!layout) return null;
    const key = `${layout.id}|${layout.w}|${layout.h}|${unit}`;
    const e = dimsExtent(layoutDims(layout, unit));
    for (const i of layout.items) { e.x0 = Math.min(e.x0, i.x); e.y0 = Math.min(e.y0, i.y); e.x1 = Math.max(e.x1, i.x + i.w); e.y1 = Math.max(e.y1, i.y + i.h); }   // ชิ้นที่ล้นขอบต้องยังเห็น
    const prev = frameMax.current?.key === key ? frameMax.current.f : null;
    const f = prev ? { x0: Math.min(prev.x0, e.x0), y0: Math.min(prev.y0, e.y0), x1: Math.max(prev.x1, e.x1), y1: Math.max(prev.y1, e.y1) } : e;
    frameMax.current = { key, f };
    return { x: f.x0 - 3, y: f.y0 - 3, w: f.x1 - f.x0 + 6, h: f.y1 - f.y0 + 6 };
  }, [layout, unit]);
  // มม. ต่อ 1 จุดบนจอ (ไว้ทำจุดจับ/ตัวหนังสือบนจอให้ขนาดคงที่)
  const svgRefW = useRef(0);
  const [pxW, setPxW] = useState(0);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const upd = () => { const w = el.getBoundingClientRect().width; if (Math.abs(w - svgRefW.current) > 0.5) { svgRefW.current = w; setPxW(w); } };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const mmPerPx = frame && pxW ? frame.w / pxW : 0.1;

  if (!layout) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="text-base font-medium text-slate-800">ยังไม่มีบล็อก</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">สร้างบล็อกขนาดที่ต้องการ แล้ววางสัญลักษณ์จากไฟล์ ข้อความ หรือรูปทรง ตามตำแหน่ง — PDF จะบอกระยะจากขอบบล็อกให้โรงงาน</p>
        {canEdit && <button type="button" onClick={addBlock} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="add" /> สร้างบล็อกแรก</button>}
      </div>
    );
  }

  const outside = outsideIds(layout);
  const missing = missingPieceIds(layout, pieceById);
  const uLabel = unit === "cm" ? "ซม." : "มม.";
  const sw = mmPerPx;   // ความหนาเส้นบนจอ = 1 จุดบนจอ
  const big = Math.max(1, zoom);   // ซูมเข้า → ตัวเลข/เส้นบอกระยะไม่ใหญ่ตาม
  const liveOne = one ? shown?.items.find((i) => i.id === one.id) ?? one : null;
  /** กล่องเครื่องมือ (ของกลาง BoardToolbox) — editing = ต้องปลดล็อกก่อน · ชิ้นจากคลัง/ไฟล์ อยู่แถบบน (เปิดตัวเลือก) */
  const toolGroups: BoardToolGroup[] = [
    { key: "add", label: "วางชิ้น", tools: [
      { key: "text", icon: "i:typography", label: "ข้อความ", hotkey: "T", editing: true, onClick: () => void addText() },
      { key: "rect", icon: "i:square", label: "สี่เหลี่ยม", hotkey: "R", editing: true, onClick: () => addShape("rect") },
      { key: "ellipse", icon: "i:circle", label: "วงกลม", hotkey: "E", editing: true, onClick: () => addShape("ellipse") },
      { key: "line", icon: "i:line", label: "เส้นตรง", hotkey: "I", editing: true, onClick: () => addShape("line") },
    ] },
    { key: "edit", label: "ชิ้นที่เลือก", tools: [
      { key: "del", icon: "i:trash", label: sel.length > 1 ? `ลบ ${sel.length} ชิ้น` : "ลบชิ้นที่เลือก", hint: "Delete", editing: true, disabled: !sel.length, onClick: removeSel },
    ] },
    { key: "hist", label: "ประวัติ", tools: [
      { key: "undo", icon: "i:arrow-back-up", label: "ย้อนกลับ", hint: "Ctrl+Z", onClick: undo },
      ...(redo ? [{ key: "redo", icon: "i:arrow-forward-up", label: "ทำซ้ำ", hint: "Ctrl+Y", onClick: redo }] : []),
    ] },
  ];

  return (
    <div className="space-y-2">
      {/* บล็อกในงานนี้ */}
      <div className="flex flex-wrap items-center gap-1.5">
        {layouts.map((l) => (
          <button key={l.id} type="button" onClick={() => { setActiveId(l.id); setSel([]); }}
            className={`h-8 rounded-lg border px-3 text-sm ${l.id === layout.id ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {l.name} <span className="text-xs font-normal text-slate-400">{toUnit(l.w, unit)}×{toUnit(l.h, unit)}</span></button>
        ))}
        {canEdit && <>
          <button type="button" onClick={addBlock} className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 text-sm text-slate-600 hover:bg-slate-50"><Icon name="add" /> บล็อกใหม่</button>
          <button type="button" onClick={dupBlock} className="h-8 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100">ทำซ้ำบล็อกนี้</button>
          <button type="button" onClick={delBlock} className="h-8 rounded-lg px-2 text-xs text-red-600 hover:bg-red-50">ลบบล็อกนี้</button>
        </>}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => exportSvg()} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-50"><Icon name="download" /> SVG ทั้งบล็อก</button>
          <button type="button" onClick={exportPdf} disabled={exporting} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"><Icon name="download" /> {exporting ? "กำลังสร้าง…" : "PDF บล็อกนี้"}</button>
        </div>
      </div>

      {/* เครื่องมือ */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {canEdit && <>
          <ToolBtn label="ชิ้นจากคลัง" onClick={() => setPickLib(true)} strong />
          <div className="relative">
            <ToolBtn label="ชิ้นจากไฟล์ ▾" onClick={() => setPickPiece((v) => !v)} strong />
            {pickPiece && (
              <div className="absolute left-0 top-10 z-30 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {pieces.filter((p) => !p.kind).length === 0 && <div className="p-3 text-xs text-slate-500">ยังไม่มีชิ้นในไฟล์</div>}
                {pieces.filter((p) => !p.kind).map((p) => (
                  <button key={p.id} type="button" onClick={() => addPiece(p)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                    <PieceThumb p={p} /> <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="whitespace-nowrap text-xs text-slate-500">{toUnit(p.w, unit)}×{toUnit(p.h, unit)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>}
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block" />
        <span className="text-xs text-slate-500">กระดาษ</span>
        {(Object.keys(PAPERS) as BlockPaper[]).map((k) => (
          <button key={k} type="button" disabled={!canEdit} onClick={() => onPaper(k)} className={`h-7 rounded-md border px-2 text-xs ${paper === k ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`}>{k}</button>
        ))}
        {UNITS.map((u) => (
          <button key={u.key} type="button" disabled={!canEdit} onClick={() => onUnit(u.key)} className={`h-7 rounded-md border px-2 text-xs ${unit === u.key ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`}>{u.th}</button>
        ))}
        <label className="ml-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /> ระยะ + เส้นไกด์</label>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          ซูม
          <button type="button" aria-label="ซูมออก" onClick={() => zoomStep(-1)} className="h-7 w-7 rounded-md border border-slate-200 bg-white">−</button>
          <span className="w-10 text-center tabular-nums">{zoomLabel(zoom)}</span>
          <button type="button" aria-label="ซูมเข้า" onClick={() => zoomStep(1)} className="h-7 w-7 rounded-md border border-slate-200 bg-white">+</button>
          <button type="button" onClick={() => zoomTo(1)} className="h-7 rounded-md border border-slate-200 bg-white px-2">พอดีจอ</button>
          <BoardLockButton lock={boardLock} />
          <BoardFullscreenButton on={fsStage.on} onToggle={fsStage.toggle} />
        </span>
      </div>

      {(outside.length > 0 || missing.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          {outside.length > 0 && <div>มี {outside.length} ชิ้นล้นขอบบล็อก — ใน PDF จะเห็นล้นกรอบด้วย</div>}
          {missing.length > 0 && <div>มี {missing.length} ชิ้นที่ชิ้นต้นฉบับในไฟล์หายไปแล้ว (จัดกลุ่มใหม่) — จะไม่ออกใน PDF · ลบแล้ววางชิ้นใหม่</div>}
        </div>
      )}

      <FullscreenStage fs={fsStage} className="">
      <div className={`grid gap-3 lg:grid-cols-[minmax(0,1fr)_290px] ${fsStage.on ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
        <section className="min-w-0 space-y-1.5">
          {fsStage.on && <div className="flex justify-end gap-1"><BoardLockButton lock={boardLock} /><BoardFullscreenButton on={fsStage.on} onToggle={fsStage.toggle} /></div>}
          <div className="relative">
          <div ref={boxRef} className={`${fsStage.on ? "max-h-[calc(100dvh-6rem)]" : "max-h-[70vh]"} overflow-auto rounded-xl bg-slate-100 p-2 md:p-3`}>
            {frame && shown && (
              <svg ref={svgRef} viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} className="mx-auto block select-none bg-white"
                style={{ width: `${zoom * 100}%`, touchAction: zoom > 1 ? "pan-x pan-y" : "none", cursor: "default" }}
                role="img" aria-label={`บล็อก ${layout.name}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setLive(null); setMq(null); }}>
                <rect x={0} y={0} width={layout.w} height={layout.h} fill="#f8fafc" />
                {shown.items.map((it) => <ItemView key={it.id} it={it} pieceById={pieceById} sw={sw} selected={sel.includes(it.id)} />)}
                {canEdit && !boardLock.locked && liveOne && <ResizeHandles it={liveOne} mmPerPx={mmPerPx} unit={unit} showSize={!!live} />}
                {showDims && dims && <>
                  {dims.lines.map((l, i) => (
                    <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} pointerEvents="none"
                      stroke={l.kind === "pos" ? POS_COLOR : l.kind === "dim" ? DIM_COLORS.dim : DIM_COLORS.guide}
                      strokeWidth={(l.kind === "dim" ? 0.3 : l.kind === "outline" ? 0.2 : 0.15) / big} />
                  ))}
                  {dims.texts.map((t, i) => (
                    <text key={i} x={t.x} y={t.y} fontSize={DIM.text / big} fontFamily="Courier New, monospace" fill={DIM_COLORS.text} textAnchor="middle" pointerEvents="none"
                      transform={t.rotate ? `rotate(90 ${t.x} ${t.y})` : undefined}>{t.text}</text>
                  ))}
                </>}
                {!showDims && <rect x={0} y={0} width={layout.w} height={layout.h} fill="none" stroke={DIM_COLORS.guide} strokeWidth={0.2} pointerEvents="none" />}
                {mq && <rect x={mq.x} y={mq.y} width={mq.w} height={mq.h} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeDasharray="1 0.6" strokeWidth={sw} pointerEvents="none" />}
              </svg>
            )}
          </div>
          {canEdit && <BoardToolbox prefKey="block_print_layout_toolbox" lock={boardLock} groups={toolGroups} />}
          <BoardLockHint lock={boardLock} />
          </div>
          <p className="text-xs text-slate-500">
            <span className="hidden lg:inline">ลากชิ้นเพื่อย้าย (ดูดขอบ/กึ่งกลางบล็อก) · ลากจุดมุม = ปรับขนาด (Shift = ยืดอิสระ) · Ctrl+ล้อเมาส์ = ซูม · Shift+คลิก หรือลากกรอบที่ว่าง = เลือกหลายชิ้น · ลูกศร = เลื่อน 0.1 มม. (Shift 1 มม.) · Delete = ลบ · Ctrl+Z = ย้อนกลับ</span>
            <span className="lg:hidden">แตะชิ้นเพื่อเลือก แล้วลากเพื่อย้าย · ลากจุดมุม = ปรับขนาด · ถ่าง 2 นิ้ว = ซูม</span>
            <span className="ml-1">· สีใช้แยกส่วนบนจอ — PDF/SVG เป็นสีดำล้วน</span>
          </p>
          <div className="min-h-[18px] text-sm text-indigo-700" aria-live="polite">{busy ?? msg}</div>
        </section>

        <aside className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          {!picked.length && (
            <>
              <div className="text-xs font-medium text-slate-500">บล็อกนี้</div>
              <input key={`bn-${layout.id}-${layout.name}`} defaultValue={layout.name} disabled={!canEdit} aria-label="ชื่อบล็อก"
                onBlur={(e) => { const v = e.target.value.trim().slice(0, 80); if (v && v !== layout.name) setLayout((l) => ({ ...l, name: v })); else e.target.value = layout.name; }}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 font-medium" />
              <div className="grid grid-cols-2 gap-2">
                <NumField label={`กว้างบล็อก (${uLabel})`} mm={layout.w} unit={unit} disabled={!canEdit} onCommit={(v) => setLayout((l) => ({ ...l, w: Math.min(LAYOUT_LIMITS.maxSize, Math.max(LAYOUT_LIMITS.minSize, v)) }))} />
                <NumField label={`สูงบล็อก (${uLabel})`} mm={layout.h} unit={unit} disabled={!canEdit} onCommit={(v) => setLayout((l) => ({ ...l, h: Math.min(LAYOUT_LIMITS.maxSize, Math.max(LAYOUT_LIMITS.minSize, v)) }))} />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">เพิ่มชิ้นจากแถบเครื่องมือด้านบน แล้วคลิกชิ้นเพื่อแก้ตำแหน่ง ขนาด สี เส้นขอบ · {layout.items.length} ชิ้นในบล็อกนี้</p>
            </>
          )}

          {picked.length > 1 && (
            <>
              <div className="text-xs font-medium text-slate-500">เลือก {picked.length} ชิ้น</div>
              {canEdit && <AlignBar onAlign={align} />}
              {canEdit && <div className="grid grid-cols-2 gap-1.5">
                <SmallBtn label="กระจายแนวนอน" onClick={() => distribute("h")} />
                <SmallBtn label="กระจายแนวตั้ง" onClick={() => distribute("v")} />
                <SmallBtn label="ทำซ้ำ" onClick={dupSel} />
                <SmallBtn label="ลบ" onClick={removeSel} danger />
              </div>}
            </>
          )}

          {one && (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span className="flex-1">{KIND_LABEL[one.t]}{one.t === "piece" && one.pieceId ? ` · ${pieceById.get(one.pieceId)?.name ?? "ชิ้นต้นฉบับหายไป"}` : ""}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumField label={`X จากขอบซ้าย (${uLabel})`} mm={one.x} unit={unit} allowNegative disabled={!canEdit} onCommit={(v) => patchItem(one.id, { x: r3(v) })} />
                <NumField label={`Y จากขอบบน (${uLabel})`} mm={one.y} unit={unit} allowNegative disabled={!canEdit} onCommit={(v) => patchItem(one.id, { y: r3(v) })} />
                <NumField label={`กว้าง (${uLabel})`} mm={one.w} unit={unit} allowZero={one.t === "line"} disabled={!canEdit} onCommit={(v) => setItems((items) => items.map((i) => (i.id === one.id ? resizeItem(i, "w", v, lock) : i)))} />
                <NumField label={`สูง (${uLabel})`} mm={one.h} unit={unit} allowZero={one.t === "line"} disabled={!canEdit} onCommit={(v) => setItems((items) => items.map((i) => (i.id === one.id ? resizeItem(i, "h", v, lock) : i)))} />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> ล็อกสัดส่วน</label>

              {one.t === "text" && canEdit && <TextFields it={one} onRetext={(p) => void retext(one, p)} onError={(m) => toast.error(m)} />}
              {one.t === "piece" && canEdit && one.pieceId && pieceById.get(one.pieceId) && (
                <SmallBtn label="ใช้ขนาดจากหน้าตั้งขนาด" onClick={() => { const p = pieceById.get(one.pieceId!)!; patchItem(one.id, { w: p.w, h: p.h }); }} />
              )}

              {canEdit && (
                <div className="space-y-2 rounded-lg bg-slate-50 p-2">
                  <div className="text-[11px] text-slate-500">{one.t === "line" ? "สีเส้น" : "สีพื้น"} (บนจอเท่านั้น)</div>
                  <div className="flex flex-wrap items-center gap-1">
                    {SCREEN_COLORS.map((c) => (
                      <button key={c} type="button" aria-label={`สี ${c}`} onClick={() => patchItem(one.id, { color: c })}
                        className={`h-6 w-6 rounded border ${one.color === c ? "ring-2 ring-indigo-400 ring-offset-1" : "border-slate-300"}`} style={{ background: c }} />
                    ))}
                    <input type="color" value={one.color} onChange={(e) => patchItem(one.id, { color: e.target.value })} aria-label="เลือกสีเอง" className="h-6 w-8 cursor-pointer" />
                  </div>
                  {(one.t === "rect" || one.t === "ellipse") && (
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={one.fill} onChange={(e) => patchItem(one.id, { fill: e.target.checked })} /> มีพื้น (ไม่ติ๊ก = เส้นขอบอย่างเดียว)</label>
                  )}
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <NumField label={one.t === "line" ? "ความหนาเส้น (มม.)" : "ความหนาเส้นขอบ (มม.) · 0 = ไม่มี"} mm={one.stroke} unit="mm" allowZero disabled={!canEdit}
                      onCommit={(v) => patchItem(one.id, { stroke: r3(Math.min(50, Math.max(0, v))) })} />
                    {one.t !== "line" && <input type="color" value={one.strokeColor} onChange={(e) => patchItem(one.id, { strokeColor: e.target.value })} aria-label="สีเส้นขอบ" className="mb-1 h-7 w-8 cursor-pointer" />}
                  </div>
                  {one.t === "line" && <SmallBtn label="เอียงอีกทาง" onClick={() => patchItem(one.id, { flip: !one.flip })} />}
                </div>
              )}

              {canEdit && <>
                <div className="text-[11px] text-slate-500">จัดเทียบบล็อก</div>
                <AlignBar onAlign={align} />
                <div className="rounded-lg border border-slate-200 p-2">
                  <div className="mb-1 text-[11px] text-slate-500">ทำซ้ำเป็นแถว</div>
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
                    <label className="text-[11px] text-slate-500">เพิ่มอีก (ชิ้น)<input inputMode="numeric" value={rep.count} onChange={(e) => setRep({ ...rep, count: e.target.value })} className="mt-0.5 h-8 w-full rounded border border-slate-200 px-1.5 text-sm" /></label>
                    <label className="text-[11px] text-slate-500">ห่างกัน ({uLabel})<input inputMode="decimal" value={rep.gap} onChange={(e) => setRep({ ...rep, gap: e.target.value })} className="mt-0.5 h-8 w-full rounded border border-slate-200 px-1.5 text-sm" /></label>
                    <select value={rep.axis} onChange={(e) => setRep({ ...rep, axis: e.target.value as "h" | "v" })} aria-label="ทิศทาง" className="h-8 rounded border border-slate-200 text-sm">
                      <option value="h">ไปทางขวา</option><option value="v">ลงล่าง</option>
                    </select>
                  </div>
                  <SmallBtn label="ทำซ้ำ" onClick={doRepeat} className="mt-1.5 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <SmallBtn label="นำขึ้นหน้า" onClick={() => order("front")} />
                  <SmallBtn label="ส่งไปหลัง" onClick={() => order("back")} />
                  <SmallBtn label="ทำซ้ำ" onClick={dupSel} />
                  <SmallBtn label="ลบ" onClick={removeSel} danger />
                </div>
              </>}
              <SmallBtn label="SVG ชิ้นนี้" onClick={() => exportSvg(one)} className="w-full" />
            </>
          )}
        </aside>
      </div>
      </FullscreenStage>
      <SymbolPickerModal open={pickLib} onClose={() => setPickLib(false)} onPick={addSymbols} unit={unit} title="วางสัญลักษณ์จากคลังลงบล็อก" />
    </div>
  );
}

/** ลากจุดจับ (0-7 ตามเข็มจากมุมซ้ายบน) → กรอบใหม่ · lock = มุมล็อกสัดส่วน */
const HANDLES: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
function resizeBox(o: { x: number; y: number; w: number; h: number }, h: number, dx: number, dy: number, lock: boolean) {
  const [a, b] = HANDLES[h];
  const min = 0.2;
  let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
  if (a === 0) x0 = Math.min(x1 - min, o.x + dx);
  if (a === 1) x1 = Math.max(x0 + min, x1 + dx);
  if (b === 0) y0 = Math.min(y1 - min, o.y + dy);
  if (b === 1) y1 = Math.max(y0 + min, y1 + dy);
  let w = x1 - x0, hh = y1 - y0;
  if (lock && a !== 0.5 && b !== 0.5 && o.w > 0 && o.h > 0) {
    const k = Math.max(w / o.w, hh / o.h);
    w = o.w * k; hh = o.h * k;
    if (a === 0) x0 = x1 - w;
    if (b === 0) y0 = y1 - hh;
  }
  const t = (v: number) => Math.round(v * 100) / 100;
  return { x: t(x0), y: t(y0), w: t(w), h: t(hh) };
}

function ResizeHandles({ it, mmPerPx, unit, showSize }: { it: BlockItem; mmPerPx: number; unit: BlockUnit; showSize: boolean }) {
  const s = 9 * mmPerPx, hit = 22 * mmPerPx, fs = 11 * mmPerPx;   // มองเห็น 9 จุด · กดได้ 22 จุด (นิ้วกดง่าย)
  const cursors = ["nwse", "ns", "nesw", "ew", "nwse", "ns", "nesw", "ew"];
  const u = unit === "cm" ? "ซม." : "มม.";
  const label = `${toUnit(it.w, unit)} × ${toUnit(it.h, unit)} ${u}`;
  return (
    <g>
      {HANDLES.map(([a, b], i) => {
        if ((it.w === 0 && a === 0.5) || (it.h === 0 && b === 0.5)) return null;
        const cx = it.x + a * it.w, cy = it.y + b * it.h;
        return (
          <g key={i} data-handle={i} style={{ cursor: `${cursors[i]}-resize` }}>
            <rect x={cx - hit / 2} y={cy - hit / 2} width={hit} height={hit} fill="rgba(255,255,255,0.01)" />
            <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={s * 0.15} fill="#fff" stroke="#2563eb" strokeWidth={mmPerPx * 1.5} />
          </g>
        );
      })}
      {showSize && (
        <g pointerEvents="none">
          <rect x={it.x + it.w + s} y={it.y + it.h + s * 0.4} width={label.length * fs * 0.55 + fs} height={fs * 1.6} rx={fs * 0.3} fill="#1e3a8a" />
          <text x={it.x + it.w + s + fs * 0.5} y={it.y + it.h + s * 0.4 + fs * 1.15} fontSize={fs} fill="#fff" fontFamily="sans-serif">{label}</text>
        </g>
      )}
    </g>
  );
}

function ItemView({ it, pieceById, sw, selected }: { it: BlockItem; pieceById: Map<string, BlockPiece>; sw: number; selected: boolean }) {
  const ink = itemInk(it, pieceById);
  const missing = it.t === "piece" && !ink.length;
  const pad = Math.max(sw * 2, it.t === "line" ? 0.8 : 0);
  return (
    <g data-item={it.id} style={{ cursor: "move" }}>
      {ink.map((s, i) => (s.mode === "fill"
        ? <path key={i} d={opsToSvgPath(s.d)} fill={it.color} fillRule={s.rule} />
        : <path key={i} d={opsToSvgPath(s.d)} fill="none" stroke={it.t === "line" || (!it.fill && it.stroke <= 0) ? it.color : it.strokeColor} strokeWidth={s.width} strokeLinejoin="round" />))}
      {missing && <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="none" stroke="#dc2626" strokeDasharray="1 0.6" strokeWidth={sw} />}
      <rect x={it.x - pad} y={it.y - pad} width={it.w + 2 * pad} height={it.h + 2 * pad} fill="rgba(255,255,255,0.01)"
        stroke={selected ? "#2563eb" : "none"} strokeWidth={sw * 1.5} strokeDasharray={`${sw * 4} ${sw * 2.5}`} />
    </g>
  );
}

function TextFields({ it, onRetext, onError }: { it: BlockItem; onRetext: (p: { text?: string; font?: string; weight?: number }) => void; onError: (m: string) => void }) {
  const [text, setText] = useState(it.text ?? "");
  useEffect(() => { setText(it.text ?? ""); }, [it.id, it.text]);
  const fileRef = useRef<HTMLInputElement>(null);
  const font = findBlockFont(it.font ?? "");
  const extra = uploadedFontNames();
  const fontOptions = [...BLOCK_FONTS.map((f) => f.family), ...extra, ...(it.font && !font && !extra.includes(it.font) ? [it.font] : [])];
  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-slate-500">ข้อความ (Enter = ขึ้นบรรทัดใหม่)
        <textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== it.text) onRetext({ text }); }}
          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <select value={it.font} aria-label="ฟอนต์" onChange={(e) => { if (e.target.value === "__upload") { fileRef.current?.click(); return; } onRetext({ font: e.target.value }); }}
          className="h-8 min-w-0 rounded border border-slate-200 text-sm">
          {fontOptions.map((f) => <option key={f} value={f}>{f}{findBlockFont(f)?.thai ? " (ไทย)" : ""}</option>)}
          <option value="__upload">+ อัปโหลดฟอนต์เอง…</option>
        </select>
        <select value={it.weight} aria-label="ความหนาตัวอักษร" onChange={(e) => onRetext({ weight: Number(e.target.value) })} className="h-8 rounded border border-slate-200 text-sm">
          {(font?.weights ?? [it.weight ?? 400]).map((w) => <option key={w} value={w}>{w >= 600 ? "หนา" : "ปกติ"}</option>)}
        </select>
      </div>
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          try { const name = await uploadFont(f); onRetext({ font: name }); }
          catch (err) { onError(err instanceof Error ? err.message : "อ่านไฟล์ฟอนต์ไม่ได้"); }
        }} />
      <p className="text-[11px] leading-snug text-slate-400">ส่งออกเป็นเส้นแล้ว โรงงานไม่ต้องมีฟอนต์ · ฟอนต์ที่อัปโหลดจำไว้เฉพาะตอนเปิดหน้านี้</p>
    </div>
  );
}

function AlignBar({ onAlign }: { onAlign: (m: AlignMode) => void }) {
  const items: [AlignMode, string][] = [["left", "ชิดซ้าย"], ["hcenter", "กลางแนวนอน"], ["right", "ชิดขวา"], ["top", "ชิดบน"], ["vcenter", "กลางแนวตั้ง"], ["bottom", "ชิดล่าง"]];
  return <div className="grid grid-cols-3 gap-1">{items.map(([m, l]) => <SmallBtn key={m} label={l} onClick={() => onAlign(m)} />)}</div>;
}

function ToolBtn({ label, onClick, strong }: { label: string; onClick: () => void; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-sm ${strong ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
      {label.startsWith("ชิ้น") ? null : <Icon name="add" />} {label}</button>
  );
}
function SmallBtn({ label, onClick, danger, className = "" }: { label: string; onClick: () => void; danger?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`h-8 rounded-lg border px-2 text-xs ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-200 text-slate-700 hover:bg-slate-50"} ${className}`}>{label}</button>
  );
}

/** ช่องตัวเลข (แสดงตามหน่วยที่เลือก · เก็บเป็น มม.) — กด Enter หรือออกจากช่องถึงจะใช้ */
function NumField({ label, mm, unit, disabled, onCommit, allowZero, allowNegative }: {
  label: string; mm: number; unit: BlockUnit; disabled?: boolean; onCommit: (mm: number) => void; allowZero?: boolean; allowNegative?: boolean;
}) {
  const shown = String(toUnit(mm, unit));
  const [v, setV] = useState(shown);
  useEffect(() => { setV(shown); }, [shown]);
  const commit = () => {
    const n = Number(v.replace(",", "."));
    const ok = Number.isFinite(n) && (allowNegative || n > 0 || (allowZero && n === 0));
    if (ok && String(n) !== shown) onCommit(fromUnit(n, unit)); else setV(shown);
  };
  return (
    <label className="block min-w-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input inputMode="decimal" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 px-2 text-sm tabular-nums" />
    </label>
  );
}
