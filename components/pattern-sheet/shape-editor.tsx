"use client";
/**
 * ✏️ ShapeEditor — หน้าต่างวาดชิ้นวัสดุขนาดจริง (ซม.) · ของกลาง · เจ้าของขอ 2026-11-09
 *   วาด: สี่เหลี่ยม · วงกลม · ปากกา (คลิก = มุม · กดลาก = เส้นโค้ง เหมือน Illustrator) · วางจาก Illustrator (Ctrl+V) / ไฟล์ .svg
 *   ไม้บรรทัดบน+ซ้าย · ดูดเข้า (snap) 0.1 / 0.5 / 1 / 5 ซม. (จำในเครื่อง) · ซูม/เลื่อน · พิมพ์กว้าง สูง ตำแหน่งได้ · เพิ่มด้วยตัวเลข
 *   กดชิ้นที่วาดแล้ว = เปลี่ยนเป็น "ย้าย" ทันที · กดที่ว่าง = วาดต่อด้วยเครื่องมือล่าสุด (เจ้าของขอ)
 *   คีย์ลัด: R สี่เหลี่ยม · O วงกลม · P ปากกา · V ย้าย · H มือ · Space ค้าง = เลื่อน · ลูกศร = ขยับ (Shift ×10)
 *            Shift ระหว่างวาด = จัตุรัส/วงกลม/เส้น 45° · Enter = ปิดรูปปากกา · Esc = ยกเลิก · Delete = ลบชิ้น
 *
 *   <ShapeEditor open onClose initial={[{ shape, count }]} initialBasis="box" onSave={(r) => …} />
 *   onSave → { pieces: [{ shape (ตำแหน่งตามที่วาด), count, stats }], basis }
 * สูตร: lib/pattern-shape · ใช้ที่: แท็บตีราคา ใบงานออกแบบ (components/design-sheet-detail) · คู่มือ docs/pattern-sheet.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import {
  SNAP_STEPS, fitShape, moveShape, parseSvgShapes, shapeBox, shapePathD, shapeStats, snapTo,
  type PNode, type Shape, type ShapeBasis, type ShapeStats,
} from "@/lib/pattern-shape";

export type EditorPiece = { shape: Shape; count: number };
export type ShapeEditorResult = { pieces: (EditorPiece & { stats: ShapeStats })[]; basis: ShapeBasis };

type Piece = EditorPiece & { id: string };
type Tool = "rect" | "ellipse" | "pen" | "move" | "hand";
type DrawTool = "rect" | "ellipse" | "pen";
type View = { x: number; y: number; w: number };
type PenDraft = { nodes: PNode[]; hover: { x: number; y: number } | null };
type BoxDraft = { k: "rect" | "ellipse"; a: { x: number; y: number }; b: { x: number; y: number } };
type Drag =
  | { k: "pan"; sx: number; sy: number; v: View }
  | { k: "move"; id: string; start: { x: number; y: number }; orig: Shape; moved: boolean }
  | { k: "box" }
  | { k: "handle"; idx: number; origin: { x: number; y: number } };

const SNAP_KEY = "pattern-shape-snap";
const MAX_PIECES = 60;
const COLORS = { fill: "#dbeafe", stroke: "#2563eb", sel: "#f59e0b", text: "#1e3a8a", grid: "#e2e8f0", gridMajor: "#cbd5e1" };
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const r2s = (n: number) => String(Math.round(n * 100) / 100);
let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

function readSnap(): number {
  try { const raw = localStorage.getItem(SNAP_KEY); if (raw == null || raw === "") return 1; const v = Number(raw); return (SNAP_STEPS as readonly number[]).includes(v) ? v : 1; } catch { return 1; }
}

/** ระยะเส้นไม้บรรทัด: เส้นใหญ่ห่าง ≥ 48px · เส้นเล็กห่าง ≥ 6px */
function rulerSteps(ppc: number) {
  const M = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const major = M.find((m) => m * ppc >= 48) ?? 500;
  const minor = [major / 10, major / 5, major / 2].find((m) => m * ppc >= 6) ?? major;
  return { major, minor };
}
const ticks = (from: number, len: number, step: number) => {
  const out: number[] = [];
  const s = Math.ceil(from / step - 1e-9) * step;
  for (let v = s, i = 0; v <= from + len + 1e-9 && i < 600; v = Math.round((v + step) * 1e6) / 1e6, i++) out.push(v);
  return out;
};
const isMajor = (v: number, major: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;

/** ช่องตัวเลขที่พิมพ์ได้ลื่น (ไม่เด้งค่ากลับระหว่างพิมพ์) — เปลี่ยนค่าจากข้างนอกเมื่อไม่ได้โฟกัส */
function NumField({ value, onCommit, min, label, className = "w-20" }: { value: number; onCommit: (v: number) => void; min?: number; label: string; className?: string }) {
  const [txt, setTxt] = useState(r2s(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(r2s(value)); }, [value, focus]);
  return (
    <input type="number" step="0.1" min={min} value={txt} aria-label={label}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setTxt(r2s(value)); }}
      onChange={(e) => { setTxt(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(v) && (min == null || v >= min)) onCommit(v); }}
      className={`h-8 rounded-md border border-slate-200 px-1.5 text-right text-sm tabular-nums ${className}`} />
  );
}

export function ShapeEditor({ open, onClose, onSave, initial = [], initialBasis = "box", title, multiNote }: {
  open: boolean;
  onClose: () => void;
  onSave: (r: ShapeEditorResult) => void;
  initial?: EditorPiece[];
  initialBasis?: ShapeBasis;
  title?: string;
  /** ข้อความใต้ปุ่มบันทึกเมื่อมีหลายชิ้น เช่น "ชิ้นที่ 2 ขึ้นไปจะเพิ่มเป็นบรรทัดใหม่" */
  multiNote?: string;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);   // ป๊อปวาดลูกทีหลัง → ผูกตัววัดขนาด/ล้อเมาส์ตอนพื้นที่วาดโผล่จริง
  const bindSvg = useCallback((el: SVGSVGElement | null) => { svgRef.current = el; setSvgEl(el); }, []);
  const [size, setSize] = useState({ cw: 0, ch: 0 });   // วัดจริงหลังเปิด (ResizeObserver)
  const [pieces, setPieces] = useState<Piece[]>(() => {
    // วางเรียงไปทางขวา ห่างกัน 2 ซม. (ชิ้นที่มาจากตารางเริ่มที่ 0,0 ทุกชิ้น)
    let x = 0;
    return initial.map((p) => { const b = shapeBox(p.shape); const s = moveShape(p.shape, x - b.x, -b.y); x += b.w + 2; return { id: newId(), shape: s, count: Math.max(1, Math.round(p.count) || 1) }; });
  });
  const [sel, setSel] = useState<string | null>(() => null);
  const [tool, setTool] = useState<Tool>("rect");
  const [lastDraw, setLastDraw] = useState<DrawTool>("rect");
  const [snap, setSnapState] = useState<number>(1);
  const [view, setView] = useState<View>({ x: -2, y: -2, w: 62 });
  const [pen, setPen] = useState<PenDraft | null>(null);
  const [box, setBox] = useState<BoxDraft | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [basis, setBasis] = useState<ShapeBasis>(initialBasis);
  const [dirty, setDirty] = useState(false);
  const [lock, setLock] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [nk, setNk] = useState<"rect" | "ellipse">("rect");
  const [nw, setNw] = useState("30");
  const [nh, setNh] = useState("35");
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setSnapState(readSnap()); }, []);
  const setSnap = (v: number) => { setSnapState(v); try { localStorage.setItem(SNAP_KEY, String(v)); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };

  const vh = view.w * (size.ch / Math.max(1, size.cw));
  const ppc = size.cw / view.w;   // px ต่อ ซม.
  const step = snap > 0 ? snap : 0.1;   // ระยะขยับด้วยลูกศร
  const selPiece = pieces.find((p) => p.id === sel) ?? null;

  // ขนาดพื้นที่วาด
  useEffect(() => {
    const el = svgEl; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0) setSize({ cw: r.width, ch: r.height }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [svgEl]);

  const fitView = useCallback((list: Piece[] = pieces) => {
    const aspect = size.ch / Math.max(1, size.cw);
    if (!list.length) { setView({ x: -2, y: -2, w: 62 }); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of list) { const b = shapeBox(p.shape); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    const pad = Math.max(2, (x1 - x0) * 0.08, (y1 - y0) * 0.08);
    const w = Math.max(10, x1 - x0 + pad * 2, (y1 - y0 + pad * 2) / aspect);
    setView({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * aspect) / 2, w });
  }, [pieces, size]);

  // เปิดครั้งแรก: ซูมให้เห็นทุกชิ้น
  const fitted = useRef(false);
  useEffect(() => { if (open && !fitted.current && size.cw > 0) { fitted.current = true; fitView(); } }, [open, size, fitView]);

  const toCm = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * vh };
  };
  const snapPt = (p: { x: number; y: number }) => ({ x: snapTo(p.x, snap), y: snapTo(p.y, snap) });
  const pxDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) * ppc;
  const constrain45 = (from: { x: number; y: number }, p: { x: number; y: number }) => {
    const dx = p.x - from.x, dy = p.y - from.y, len = Math.hypot(dx, dy);
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: snapTo(from.x + Math.cos(a) * len, snap), y: snapTo(from.y + Math.sin(a) * len, snap) };
  };
  const changeTool = (tl: Tool) => { setTool(tl); if (tl === "rect" || tl === "ellipse" || tl === "pen") setLastDraw(tl); setPen(null); setBox(null); };
  const addPieces = (shapes: Shape[], selectFirst = true) => {
    if (pieces.length + shapes.length > MAX_PIECES) { setMsg({ tone: "err", text: t(`วาดได้ไม่เกิน ${MAX_PIECES} ชิ้นต่อครั้ง`, `Up to ${MAX_PIECES} pieces at a time`) }); return null; }
    const add = shapes.map((s) => ({ id: newId(), shape: s, count: 1 }));
    const next = [...pieces, ...add];
    setPieces(next); setDirty(true);
    if (selectFirst && add[0]) setSel(add[0].id);
    return next;
  };
  const rightEdge = () => pieces.reduce((m, p) => { const b = shapeBox(p.shape); return Math.max(m, b.x + b.w); }, -2) + 2;

  const commitPen = () => {
    if (!pen) return;
    const nodes: PNode[] = [];
    for (const n of pen.nodes) {
      const last = nodes[nodes.length - 1];
      if (last && Math.hypot(n.x - last.x, n.y - last.y) < 0.02) { if (n.ox || n.oy) { last.ox = n.ox; last.oy = n.oy; } continue; }   // ดับเบิลคลิกได้จุดซ้ำ
      nodes.push({ ...n });
    }
    if (nodes.length > 2) { const f = nodes[0], z = nodes[nodes.length - 1]; if (Math.hypot(f.x - z.x, f.y - z.y) < 0.02) nodes.pop(); }
    setPen(null);
    if (nodes.length < 3) { setMsg({ tone: "err", text: t("ปากกาต้องมีอย่างน้อย 3 จุดถึงจะเป็นรูปปิด", "The pen needs at least 3 points to close a shape") }); return; }
    const s: Shape = { k: "path", nodes };
    if (shapeStats(s).area <= 0) { setMsg({ tone: "err", text: t("รูปนี้ไม่มีพื้นที่ (จุดเรียงเป็นเส้นตรง)", "This shape has no area (points are in a line)") }); return; }
    addPieces([s]);
  };

  // ── เมาส์/นิ้ว บนพื้นที่วาด ──
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setMsg(null);
    const capture = () => { try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ */ } };
    if (e.button === 1 || tool === "hand" || spaceDown.current) { drag.current = { k: "pan", sx: e.clientX, sy: e.clientY, v: view }; capture(); e.preventDefault(); return; }
    if (e.button !== 0) return;
    const raw = toCm(e), p = snapPt(raw);
    if (pen) {   // กำลังวาดปากกา: คลิก = เพิ่มจุด · กดจุดแรก = ปิดรูป
      const f = pen.nodes[0];
      if (pen.nodes.length >= 3 && pxDist(raw, f) <= 9) { commitPen(); return; }
      const last = pen.nodes[pen.nodes.length - 1];
      const q = e.shiftKey && last ? constrain45(last, p) : p;
      setPen({ nodes: [...pen.nodes, { x: q.x, y: q.y }], hover: null });
      drag.current = { k: "handle", idx: pen.nodes.length, origin: q }; capture();
      return;
    }
    const hitId = (e.target as Element).getAttribute?.("data-piece");
    if (hitId) {   // กดชิ้นที่วาดแล้ว → ย้าย
      const pc = pieces.find((x) => x.id === hitId);
      if (pc) { setSel(hitId); setTool("move"); drag.current = { k: "move", id: hitId, start: raw, orig: pc.shape, moved: false }; capture(); }
      return;
    }
    // ที่ว่าง → วาดด้วยเครื่องมือล่าสุด
    setSel(null);
    const dt: DrawTool = tool === "move" ? lastDraw : (tool as DrawTool);
    if (tool === "move") setTool(lastDraw);
    if (dt === "pen") { setPen({ nodes: [{ x: p.x, y: p.y }], hover: null }); drag.current = { k: "handle", idx: 0, origin: p }; capture(); return; }
    setBox({ k: dt, a: p, b: p }); drag.current = { k: "box" }; capture();
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = toCm(e), p = snapPt(raw);
    setHover(p);
    const d = drag.current;
    if (!d) { if (pen) { const last = pen.nodes[pen.nodes.length - 1]; setPen({ ...pen, hover: e.shiftKey && last ? constrain45(last, p) : p }); } return; }
    if (d.k === "pan") { setView({ x: d.v.x - (e.clientX - d.sx) / ppc, y: d.v.y - (e.clientY - d.sy) / ppc, w: d.v.w }); return; }
    if (d.k === "move") {
      const ob = shapeBox(d.orig);
      const nx = snapTo(ob.x + raw.x - d.start.x, snap), ny = snapTo(ob.y + raw.y - d.start.y, snap);
      if (nx === ob.x && ny === ob.y && !d.moved) return;
      d.moved = true;
      setPieces((ps) => ps.map((x) => (x.id === d.id ? { ...x, shape: moveShape(d.orig, nx - ob.x, ny - ob.y) } : x)));
      return;
    }
    if (d.k === "box" && box) {
      let b = p;
      if (e.shiftKey) { const dx = p.x - box.a.x, dy = p.y - box.a.y, m = Math.max(Math.abs(dx), Math.abs(dy)); b = { x: box.a.x + Math.sign(dx || 1) * m, y: box.a.y + Math.sign(dy || 1) * m }; }
      setBox({ ...box, b });
      return;
    }
    if (d.k === "handle" && pen) {
      const vx = p.x - d.origin.x, vy = p.y - d.origin.y;
      if (Math.hypot(vx, vy) * ppc < 3) return;
      setPen({ ...pen, hover: null, nodes: pen.nodes.map((n, i) => (i === d.idx ? { x: n.x, y: n.y, ox: vx, oy: vy, ix: -vx, iy: -vy } : n)) });
    }
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.k === "move" && d.moved) setDirty(true);
    if (d.k === "box" && box) {
      const x = Math.min(box.a.x, box.b.x), y = Math.min(box.a.y, box.b.y), w = Math.abs(box.a.x - box.b.x), h = Math.abs(box.a.y - box.b.y);
      setBox(null);
      if (w > 0 && h > 0) addPieces([{ k: box.k, x, y, w, h }]);
    }
  };
  const onDoubleClick = () => { if (pen) commitPen(); };

  const zoomAt = (f: number, cx?: number, cy?: number) => {
    setView((v) => {
      const w = Math.min(2000, Math.max(1, v.w / f));
      const ox = cx ?? v.x + v.w / 2, oy = cy ?? v.y + (v.w * size.ch) / Math.max(1, size.cw) / 2;
      return { x: ox - (ox - v.x) * (w / v.w), y: oy - (oy - v.y) * (w / v.w), w };
    });
  };
  // ล้อเมาส์: เลื่อนดู · Ctrl/⌘ + ล้อ = ซูมที่ตำแหน่งเมาส์ (ต้องเป็น listener ไม่ passive ถึงกันหน้าเลื่อน)
  useEffect(() => {
    const el = svgEl; if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const k = v.w / r.width;
        if (e.ctrlKey || e.metaKey) {
          const f = Math.exp(-e.deltaY * 0.0015);
          const w = Math.min(2000, Math.max(1, v.w / f));
          const cx = v.x + (e.clientX - r.left) * k, cy = v.y + (e.clientY - r.top) * k;
          return { x: cx - (cx - v.x) * (w / v.w), y: cy - (cy - v.y) * (w / v.w), w };
        }
        return { ...v, x: v.x + (e.shiftKey ? e.deltaY : e.deltaX) * k, y: v.y + (e.shiftKey ? 0 : e.deltaY) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, svgEl]);

  const importSvg = useCallback((text: string) => {
    const imp = parseSvgShapes(text);
    if (!imp) { setMsg({ tone: "err", text: t("ไม่พบรูปทรงที่ปิดในสิ่งที่วาง — ใน Illustrator ต้องเลือกรูปแล้วก๊อป (เปิดตัวเลือก Include SVG Code) หรือใช้ไฟล์ .svg", "No closed shapes found — in Illustrator copy with Include SVG Code on, or use an .svg file") }); return; }
    const ox = pieces.length ? rightEdge() : 0;
    const next = addPieces(imp.shapes.map((s) => moveShape(s, ox, 0)));
    if (!next) return;
    changeTool("move");
    fitView(next);
    setMsg({ tone: "ok", text: t(`วางแล้ว ${imp.shapes.length} ชิ้น · หน่วย: ${imp.unitNote} — เช็กขนาดในตาราง ถ้าไม่ตรงพิมพ์แก้ได้`, `Pasted ${imp.shapes.length} pieces · units: ${imp.unitNote} — check sizes; type to fix`) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, fitView, t]);

  // คีย์ลัด + วาง (Ctrl+V) ระหว่างเปิดหน้าต่าง
  useEffect(() => {
    if (!open) return;
    const inField = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return;
      if (e.key === "Escape" && (pen || box || sel)) { e.stopPropagation(); e.preventDefault(); if (pen || box) { setPen(null); setBox(null); } else setSel(null); return; }
      if (e.key === "Enter" && pen) { e.preventDefault(); commitPen(); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && pen) { e.preventDefault(); setPen(pen.nodes.length > 1 ? { ...pen, nodes: pen.nodes.slice(0, -1) } : null); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && sel) { e.preventDefault(); setPieces((ps) => ps.filter((p) => p.id !== sel)); setSel(null); setDirty(true); return; }
      if (e.key.startsWith("Arrow") && sel) {
        e.preventDefault();
        const d = step * (e.shiftKey ? 10 : 1);
        const [dx, dy] = e.key === "ArrowLeft" ? [-d, 0] : e.key === "ArrowRight" ? [d, 0] : e.key === "ArrowUp" ? [0, -d] : [0, d];
        setPieces((ps) => ps.map((p) => (p.id === sel ? { ...p, shape: moveShape(p.shape, dx, dy) } : p))); setDirty(true);
        return;
      }
      if (e.key === " ") { spaceDown.current = true; e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, Tool> = { r: "rect", o: "ellipse", e: "ellipse", p: "pen", v: "move", h: "hand" };
      if (map[k]) { e.preventDefault(); changeTool(map[k]); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") spaceDown.current = false; };
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target)) return;
      const cd = e.clipboardData; if (!cd) return;
      const file = Array.from(cd.files ?? []).find((f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"));
      if (file) { e.preventDefault(); void file.text().then(importSvg); return; }
      const txt = cd.getData("image/svg+xml") || cd.getData("text/plain");
      if (txt && /<svg[\s>]/i.test(txt)) { e.preventDefault(); importSvg(txt); return; }
      if (txt || cd.files?.length) setMsg({ tone: "err", text: t("สิ่งที่วางไม่ใช่รูปทรงจาก Illustrator — ใน Illustrator ไปที่ Preferences → Clipboard Handling → ติ๊ก Include SVG Code แล้วก๊อปใหม่", "That isn't a shape from Illustrator — enable Preferences → Clipboard Handling → Include SVG Code, then copy again") });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("paste", onPaste); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pen, box, sel, step, importSvg]);

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".svg") && f.type !== "image/svg+xml") { setMsg({ tone: "err", text: t("รองรับเฉพาะไฟล์ .svg (Illustrator: File → Export As → SVG)", "Only .svg files (Illustrator: File → Export As → SVG)") }); return; }
    if (f.size > 5 * 1024 * 1024) { setMsg({ tone: "err", text: t("ไฟล์ใหญ่เกิน 5MB", "File is over 5MB") }); return; }
    importSvg(await f.text());
  };

  // ── แก้ขนาด/ตำแหน่งด้วยตัวเลข ──
  const setSelBox = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (!selPiece) return;
    const b = shapeBox(selPiece.shape);
    let { x, y, w, h } = { ...b, ...patch };
    if (lock && patch.w != null && b.w > 0 && patch.h == null) h = b.h * (w / b.w);
    if (lock && patch.h != null && b.h > 0 && patch.w == null) w = b.w * (h / b.h);
    if (!(w > 0) || !(h > 0)) return;
    setPieces((ps) => ps.map((p) => (p.id === selPiece.id ? { ...p, shape: fitShape(p.shape, x, y, w, h) } : p))); setDirty(true);
  };
  const addByNumber = () => {
    const w = Number(nw), h = Number(nh);
    if (!(w > 0) || !(h > 0)) { setMsg({ tone: "err", text: t("ใส่กว้างและสูงเป็นตัวเลขมากกว่า 0", "Enter a width and height above 0") }); return; }
    const x = pieces.length ? snapTo(rightEdge(), snap) : 0;
    const next = addPieces([{ k: nk, x, y: 0, w, h }]);
    if (next) fitView(next);
  };

  const rows = useMemo(() => pieces.map((p, i) => ({ p, i, st: shapeStats(p.shape) })), [pieces]);
  const total = rows.reduce((s, r) => s + (basis === "box" ? r.st.w * r.st.h : r.st.area) * r.p.count, 0);

  const save = () => {
    if (!pieces.length) { setMsg({ tone: "err", text: t("ยังไม่มีชิ้น — วาดหรือวางจาก Illustrator ก่อน", "No pieces yet — draw or paste from Illustrator first") }); return; }
    onSave({ pieces: rows.map((r) => ({ shape: r.p.shape, count: r.p.count, stats: r.st })), basis });
  };

  // ── วาดไม้บรรทัด / ตาราง ──
  const rs = rulerSteps(ppc);
  const gridStep = snap > 0 && snap * ppc >= 6 ? snap : rs.minor;
  const fs = view.w / 60;
  const cursor = tool === "hand" ? "grab" : tool === "move" ? "default" : "crosshair";
  const toolBtn = (tl: Tool, icon: string, label: string, key: string) => (
    <button key={tl} type="button" onClick={() => changeTool(tl)} title={`${label} (${key})`}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs ${tool === tl ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      <Icon value={`i:${icon}`} className="text-[14px]" />{label}
    </button>
  );
  const hint = pen
    ? t(`ปากกา: ${pen.nodes.length} จุด · กดลาก = เส้นโค้ง · กดจุดแรก/ดับเบิลคลิก/Enter = ปิดรูป · Backspace = ลบจุดล่าสุด · Esc = ยกเลิก`, `Pen: ${pen.nodes.length} points · drag = curve · click first point / double-click / Enter = close · Backspace = undo point · Esc = cancel`)
    : tool === "pen" ? t("ปากกา: คลิกวางจุด (มุม) · กดค้างแล้วลาก = เส้นโค้ง · Shift = เส้น 45°", "Pen: click to place corners · press and drag for curves · Shift = 45°")
    : tool === "hand" ? t("ลากเพื่อเลื่อนดู", "Drag to pan")
    : t("กดลากที่ว่างเพื่อวาด (Shift = จัตุรัส/วงกลม) · กดชิ้นที่วาดแล้ว = ย้าย · Ctrl+V วางจาก Illustrator · Ctrl+ล้อเมาส์ = ซูม", "Drag on empty space to draw (Shift = square/circle) · click a piece to move it · Ctrl+V to paste from Illustrator · Ctrl+wheel = zoom");

  const penPath = () => {
    if (!pen || !pen.nodes.length) return "";
    const N = pen.nodes; const f = (v: number) => Math.round(v * 1000) / 1000;
    let d = `M${f(N[0].x)} ${f(N[0].y)}`;
    for (let i = 1; i < N.length; i++) {
      const a = N[i - 1], b = N[i];
      if (a.ox || a.oy || b.ix || b.iy) d += `C${f(a.x + (a.ox ?? 0))} ${f(a.y + (a.oy ?? 0))} ${f(b.x + (b.ix ?? 0))} ${f(b.y + (b.iy ?? 0))} ${f(b.x)} ${f(b.y)}`;
      else d += `L${f(b.x)} ${f(b.y)}`;
    }
    return d;
  };
  const lastNode = pen?.nodes[pen.nodes.length - 1];

  return (
    <ERPModal open={open} onClose={onClose} size="xl" hasUnsavedChanges={dirty}
      title={title ?? t("วาดชิ้นวัสดุ", "Draw material pieces")}
      description={t("ขนาดจริงหน่วย ซม. · วาดเอง พิมพ์ขนาด หรือก๊อปจาก Illustrator มาวาง", "Real size in cm · draw, type sizes, or paste from Illustrator")}
      footer={<>
        <div className="mr-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{t("คิดผ้าจาก", "Fabric from")}</span>
          {(["box", "area"] as ShapeBasis[]).map((b) => (
            <button key={b} type="button" onClick={() => { setBasis(b); setDirty(true); }}
              className={`h-7 rounded-md border px-2 text-xs ${basis === b ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {b === "box" ? t("กรอบสี่เหลี่ยม", "Bounding box") : t("พื้นที่จริง", "Actual area")}
            </button>
          ))}
          <span className="text-slate-400">{t(`รวม ${Math.round(total).toLocaleString("th-TH")} ตร.ซม.`, `Total ${Math.round(total).toLocaleString("th-TH")} cm²`)}</span>
          {multiNote && pieces.length > 1 && <span className="text-amber-600">{multiNote}</span>}
        </div>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={save} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">
          {t(`ใช้ขนาดนี้ (${pieces.length} ชิ้น)`, `Use these (${pieces.length} pcs)`)}
        </button>
      </>}>
      <div className="space-y-3">
        {/* แถบเครื่องมือ */}
        <div className="flex flex-wrap items-center gap-1.5">
          {toolBtn("rect", "square", t("สี่เหลี่ยม", "Rectangle"), "R")}
          {toolBtn("ellipse", "circle", t("วงกลม", "Circle"), "O")}
          {toolBtn("pen", "vector-bezier", t("ปากกา", "Pen"), "P")}
          {toolBtn("move", "pointer", t("ย้าย", "Move"), "V")}
          {toolBtn("hand", "hand-stop", t("เลื่อนดู", "Pan"), "H")}
          <button type="button" disabled={!sel} onClick={() => { setPieces((ps) => ps.filter((p) => p.id !== sel)); setSel(null); setDirty(true); }} title={t("ลบชิ้นที่เลือก (Delete)", "Delete selected (Delete)")}
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Icon value="i:trash" className="text-[14px]" /></button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50" title={t("นำเข้าไฟล์ .svg (หรือก๊อปจาก Illustrator แล้วกด Ctrl+V)", "Import an .svg file (or copy in Illustrator and press Ctrl+V)")}>
            <Icon value="i:file-import" className="text-[14px]" />{t("ไฟล์ SVG", "SVG file")}
          </button>
          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => zoomAt(0.5)} aria-label={t("ซูมออก", "Zoom out")} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><Icon value="i:zoom-out" className="text-[15px]" /></button>
            <span className="w-12 text-center text-xs tabular-nums text-slate-500">{Math.round((62 / view.w) * 100)}%</span>
            <button type="button" onClick={() => zoomAt(2)} aria-label={t("ซูมเข้า", "Zoom in")} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><Icon value="i:zoom-in" className="text-[15px]" /></button>
            <button type="button" onClick={() => fitView()} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50">{t("พอดี", "Fit")}</button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Icon value="i:magnet" className="text-[14px]" />{t("ดูดเข้าทุก", "Snap every")}
          {SNAP_STEPS.map((s) => (
            <button key={s} type="button" onClick={() => setSnap(s)}
              className={`h-7 rounded-md border px-2 text-xs ${snap === s ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {s === 0 ? t("ไม่ดูด", "Off") : `${s} ${t("ซม.", "cm")}`}
            </button>
          ))}
          <span className="ml-auto font-mono tabular-nums text-slate-500">{hover ? `x ${r2s(hover.x)} · y ${r2s(hover.y)} ${t("ซม.", "cm")}` : "x — · y —"}</span>
        </div>

        {/* ไม้บรรทัด + พื้นที่วาด */}
        <div className="grid select-none overflow-hidden rounded-lg border border-slate-200" style={{ gridTemplateColumns: "26px minmax(0,1fr)", gridTemplateRows: "22px auto" }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}>
          <div className="flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-[9px] text-slate-400">{t("ซม.", "cm")}</div>
          <svg className="block w-full border-b border-slate-200 bg-slate-50" height={22} viewBox={`0 0 ${size.cw} 22`} preserveAspectRatio="none">
            {ticks(view.x, view.w, rs.minor).map((v) => {
              const px = (v - view.x) * ppc, M = isMajor(v, rs.major);
              return <g key={v}><line x1={px} x2={px} y1={M ? 9 : 15} y2={22} stroke="#94a3b8" strokeWidth={1} />{M && <text x={px + 2} y={9} fontSize={10} fill="#64748b">{r2s(v)}</text>}</g>;
            })}
            {hover && <line x1={(hover.x - view.x) * ppc} x2={(hover.x - view.x) * ppc} y1={0} y2={22} stroke="#ef4444" strokeWidth={1.5} />}
          </svg>
          <svg className="block border-r border-slate-200 bg-slate-50" width={26} height={size.ch} viewBox={`0 0 26 ${size.ch}`} preserveAspectRatio="none">
            {ticks(view.y, vh, rs.minor).map((v) => {
              const py = (v - view.y) * ppc, M = isMajor(v, rs.major);
              return <g key={v}><line y1={py} y2={py} x1={M ? 10 : 17} x2={26} stroke="#94a3b8" strokeWidth={1} />{M && <text x={2} y={py + 10} fontSize={10} fill="#64748b">{r2s(v)}</text>}</g>;
            })}
            {hover && <line y1={(hover.y - view.y) * ppc} y2={(hover.y - view.y) * ppc} x1={0} x2={26} stroke="#ef4444" strokeWidth={1.5} />}
          </svg>
          <svg ref={bindSvg} className="block h-[min(52vh,480px)] min-h-[300px] w-full bg-white" style={{ cursor, touchAction: "none" }}
            viewBox={`${view.x} ${view.y} ${view.w} ${vh}`} preserveAspectRatio="none"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onPointerLeave={() => setHover(null)} onDoubleClick={onDoubleClick}>
            {ticks(view.x, view.w, gridStep).map((x) => <line key={`gx${x}`} x1={x} x2={x} y1={view.y} y2={view.y + vh} stroke={isMajor(x, rs.major) ? COLORS.gridMajor : COLORS.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            {ticks(view.y, vh, gridStep).map((y) => <line key={`gy${y}`} y1={y} y2={y} x1={view.x} x2={view.x + view.w} stroke={isMajor(y, rs.major) ? COLORS.gridMajor : COLORS.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            {rows.map(({ p, i, st }) => {
              const on = p.id === sel, b = shapeBox(p.shape);
              return (
                <g key={p.id}>
                  <path d={shapePathD(p.shape)} data-piece={p.id} fill={COLORS.fill} fillOpacity={on ? 0.95 : 0.7} stroke={on ? COLORS.sel : COLORS.stroke} strokeWidth={on ? 2.5 : 1.5}
                    vectorEffect="non-scaling-stroke" style={{ cursor: "move" }} />
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={COLORS.text} style={{ pointerEvents: "none" }}>P{i + 1}{p.count > 1 ? ` ×${p.count}` : ""}</text>
                  {on && <>
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={COLORS.sel} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                    <text x={b.x + b.w / 2} y={b.y - fs * 0.5} fontSize={fs * 0.9} textAnchor="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{r1(st.w)} {t("ซม.", "cm")}</text>
                    <text x={b.x + b.w + fs * 0.4} y={b.y + b.h / 2} fontSize={fs * 0.9} dominantBaseline="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{r1(st.h)} {t("ซม.", "cm")}</text>
                  </>}
                </g>
              );
            })}
            {box && (() => {
              const x = Math.min(box.a.x, box.b.x), y = Math.min(box.a.y, box.b.y), w = Math.abs(box.a.x - box.b.x), h = Math.abs(box.a.y - box.b.y);
              return <g style={{ pointerEvents: "none" }}>
                {box.k === "rect" ? <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  : <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
                <text x={x + w / 2} y={y - fs * 0.5} fontSize={fs * 0.9} textAnchor="middle" fill={COLORS.sel}>{r1(w)} × {r1(h)} {t("ซม.", "cm")}</text>
              </g>;
            })()}
            {pen && <g style={{ pointerEvents: "none" }}>
              <path d={penPath()} fill="none" stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              {pen.hover && lastNode && <>
                <line x1={lastNode.x} y1={lastNode.y} x2={pen.hover.x} y2={pen.hover.y} stroke={COLORS.sel} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <text x={(lastNode.x + pen.hover.x) / 2} y={(lastNode.y + pen.hover.y) / 2 - fs * 0.4} fontSize={fs * 0.85} textAnchor="middle" fill={COLORS.sel}>{r1(Math.hypot(pen.hover.x - lastNode.x, pen.hover.y - lastNode.y))} {t("ซม.", "cm")}</text>
              </>}
              {lastNode && (lastNode.ox || lastNode.oy) ? <>
                <line x1={lastNode.x + (lastNode.ix ?? 0)} y1={lastNode.y + (lastNode.iy ?? 0)} x2={lastNode.x + (lastNode.ox ?? 0)} y2={lastNode.y + (lastNode.oy ?? 0)} stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <circle cx={lastNode.x + (lastNode.ox ?? 0)} cy={lastNode.y + (lastNode.oy ?? 0)} r={fs * 0.25} fill="#fff" stroke="#64748b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </> : null}
              {pen.nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={fs * (i === 0 ? 0.4 : 0.25)} fill={i === 0 ? "#fff" : COLORS.sel} stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
            </g>}
          </svg>
        </div>
        <div className="text-xs text-slate-500">{hint}</div>
        {msg && <div className={`rounded-lg px-3 py-2 text-xs ${msg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}

        <div className="grid gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* พิมพ์ขนาด */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">{t("พิมพ์ขนาดชิ้นที่เลือก", "Type the selected piece's size")}</div>
            {selPiece ? (() => {
              const b = shapeBox(selPiece.shape);
              return (<>
                <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-2 gap-y-1.5 text-xs text-slate-500">
                  <span>{t("กว้าง", "Width")}</span><NumField value={b.w} min={0.1} label={t("กว้าง ซม.", "Width cm")} onCommit={(v) => setSelBox({ w: v })} />
                  <span>{t("สูง", "Height")}</span><NumField value={b.h} min={0.1} label={t("สูง ซม.", "Height cm")} onCommit={(v) => setSelBox({ h: v })} />
                  <span>X</span><NumField value={b.x} label="X" onCommit={(v) => setSelBox({ x: v })} />
                  <span>Y</span><NumField value={b.y} label="Y" onCommit={(v) => setSelBox({ y: v })} />
                </div>
                <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="h-3.5 w-3.5" />{t("ล็อกสัดส่วน", "Lock ratio")}</label>
              </>);
            })() : <div className="text-xs text-slate-400">{t("กดเลือกชิ้นบนพื้นที่วาด หรือในตารางด้านขวา", "Select a piece on the canvas or in the table")}</div>}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-xs text-slate-500">{t("เพิ่มด้วยตัวเลข", "Add by numbers")}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <select value={nk} onChange={(e) => setNk(e.target.value as "rect" | "ellipse")} className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-sm">
                  <option value="rect">{t("สี่เหลี่ยม", "Rectangle")}</option><option value="ellipse">{t("วงกลม/วงรี", "Circle/ellipse")}</option>
                </select>
                <input type="number" step="0.1" min={0.1} value={nw} onChange={(e) => setNw(e.target.value)} aria-label={t("กว้าง ซม.", "Width cm")} className="h-8 w-16 rounded-md border border-slate-200 px-1.5 text-right text-sm" />
                <span className="text-slate-400">×</span>
                <input type="number" step="0.1" min={0.1} value={nh} onChange={(e) => setNh(e.target.value)} aria-label={t("สูง ซม.", "Height cm")} className="h-8 w-16 rounded-md border border-slate-200 px-1.5 text-right text-sm" />
                <span className="text-slate-400">{t("ซม.", "cm")}</span>
                <button type="button" onClick={addByNumber} className="h-8 rounded-md border border-blue-300 bg-white px-2.5 text-xs text-blue-700 hover:bg-blue-50">{t("＋ เพิ่ม", "＋ Add")}</button>
              </div>
            </div>
          </div>
          {/* ตารางชิ้น */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">{t("ระบบวัดให้", "Measured")}</div>
            {rows.length === 0 ? <div className="py-4 text-center text-xs text-slate-400">{t("ยังไม่มีชิ้น — วาด พิมพ์ขนาด หรือวางจาก Illustrator", "No pieces yet — draw, type a size, or paste from Illustrator")}</div> : (
              <table className="w-full table-fixed text-xs">
                <thead><tr className="text-[11px] text-slate-500">
                  <th className="w-10 py-1 text-left font-medium">{t("ชิ้น", "Pc")}</th>
                  <th className="py-1 text-right font-medium">{t("กรอบ ก×ส", "Box W×H")}</th>
                  <th className="py-1 text-right font-medium">{t("พื้นที่จริง", "Area")}</th>
                  <th className="py-1 text-right font-medium">{t("รอบรูป", "Perimeter")}</th>
                  <th className="w-12 py-1 text-right font-medium">{t("ใช้กรอบ", "Fill")}</th>
                  <th className="w-16 py-1 text-right font-medium">{t("จำนวน", "Qty")}</th>
                </tr></thead>
                <tbody>
                  {rows.map(({ p, i, st }) => (
                    <tr key={p.id} onClick={() => setSel(p.id)} className={`cursor-pointer border-t border-slate-100 ${p.id === sel ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                      <td className="py-1.5 font-medium text-slate-700">P{i + 1}</td>
                      <td className="py-1.5 text-right tabular-nums">{r1(st.w)}×{r1(st.h)}</td>
                      <td className="py-1.5 text-right tabular-nums">{Math.round(st.area).toLocaleString("th-TH")}</td>
                      <td className="py-1.5 text-right tabular-nums">{r1(st.perimeter)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{Math.round(st.fill * 100)}%</td>
                      <td className="py-1 text-right">
                        <input type="number" min={1} step={1} value={p.count} onClick={(e) => e.stopPropagation()} aria-label={t("จำนวนชิ้น", "Piece count")}
                          onChange={(e) => { const n = Math.max(1, Math.round(Number(e.target.value)) || 1); setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, count: n } : x))); setDirty(true); }}
                          className="h-7 w-14 rounded border border-slate-200 px-1 text-right text-xs" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-2 text-[11px] text-slate-400">{t("หน่วย: ซม. / ตร.ซม. · ใช้กรอบ = พื้นที่จริงเป็นกี่ % ของกรอบสี่เหลี่ยม · รอบรูปใช้คิดค่าเย็บ/กุ๊นได้", "Units: cm / cm² · fill = actual area as % of the box · perimeter helps price sewing/binding")}</div>
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
