"use client";
/**
 * ✏️ ShapeEditor — หน้าต่างวาดชิ้นวัสดุขนาดจริง (ซม.) · ของกลาง · เจ้าของขอ 2026-11-09
 *   วาด: สี่เหลี่ยม · วงกลม · ปากกา (คลิก = มุม · กดลาก = เส้นโค้ง เหมือน Illustrator) · วางจาก Illustrator (Ctrl+V) / ไฟล์ .svg
 *   ไม้บรรทัดบน+ซ้าย · ดูดเข้า (snap) 0.1 / 0.5 / 1 / 5 ซม. (จำในเครื่อง) · ซูม/เลื่อน · เพิ่มด้วยตัวเลข
 *   กดชิ้นที่วาดแล้ว = เปลี่ยนเป็น "ย้าย" + เปิดแผงรายละเอียดชิ้น · กดที่ว่าง = วาดต่อด้วยเครื่องมือล่าสุด (เจ้าของขอ)
 *   แผงรายละเอียดชิ้น (ขั้นที่ 2): ชื่อชิ้น · วัสดุหลายตัว (1 วัสดุ = 1 บรรทัดตีราคา) · เผื่อพับ/เผื่อเย็บ · ขนาดสำเร็จ/ขนาดตัด · จำนวน
 *     เครื่องมือ: แก้จุด · พับครึ่ง → ↓ · กลับด้าน ↔ ↕ · เจาะเป็นรูในชิ้นที่ครอบอยู่ · แยกรู/ลบรู · ลบชิ้น
 *   ย้อนกลับ/ทำซ้ำ: Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y (ทุกการเปลี่ยนแปลง)
 *   ขั้นที่ 3: ฝังในแท็บได้ (embedded + onChange = ส่งค่ากลับทุกครั้งที่แก้ → ตารางเปลี่ยนตาม) · ตำแหน่งชิ้นบนกระดาน (at)
 *     รูปอ้างอิง (รูปสินค้า วางใต้กระดาน · จาง · ล็อก · ตั้งขนาดจริงด้วย 2 จุด) · ไม้บรรทัดวัด ตรง / โค้ง / ตามขอบชิ้น (M)
 *     ชิ้นที่เลือก: จุดจับ 8 จุดลากย่อขยาย (Shift/ล็อกสัดส่วน = คงสัดส่วน) · จุดจับหมุน (Shift = ทีละ 15°) · หมุน 90° · ความทึบชิ้น (เห็นรูปอ้างอิงด้านล่าง)
 *   คีย์ลัด: R สี่เหลี่ยม · O วงกลม · P ปากกา · V ย้าย · H มือ · Space ค้าง = เลื่อน · ลูกศร = ขยับ (Shift ×10)
 *            Shift ระหว่างวาด = จัตุรัส/วงกลม/เส้น 45° · Enter = ปิดรูปปากกา · Esc = ยกเลิก · Delete = ลบชิ้น/จุด
 *
 *   <ShapeEditor open onClose initial={[{ shape, holes, count, allow, name, mats }]} materials={[{ id, name }]} onSave={(r) => …} />
 * สูตร: lib/pattern-shape · ใช้ที่: แท็บตีราคา ใบงานออกแบบ (components/design-sheet-detail) · คู่มือ docs/pattern-sheet.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SearchableSelect } from "@/components/searchable-select";
import {
  SNAP_STEPS, cleanAllow, fitPiece, flattenOpen, flipPiece, foldPiece, movePiece, nearestSegment, openPathLength, outlineDistance, parseSvgShapes, pieceGeometry, polyD, projectOnOutline, rotatePiece,
  shapeBox, shapeInside, shapePathD, snapTo, splitSegment, toPathShape, toggleSmooth,
  type Box, type PNode, type PieceGeometry, type Pt, type RefImage, type Shape, type ShapeBasis,
} from "@/lib/pattern-shape";
export type { RefImage };

export type PieceMat = { id: string; name: string };
/** pid = รหัสชิ้น (ผูกบรรทัดตีราคา) · at = ตำแหน่งบนกระดาน (มุมซ้ายบนเส้นเย็บ) · src = บรรทัดเดิมที่ชิ้นนี้มาจาก */
export type EditorPiece = { shape: Shape; holes?: Shape[]; count: number; allow?: number; name?: string; mats?: PieceMat[]; pid?: string; at?: [number, number]; src?: string[] };
export type ResultPiece = { shape: Shape; holes: Shape[]; count: number; allow: number; name: string; mats: PieceMat[]; geo: PieceGeometry; pid: string; at: [number, number]; src: string[] };
export type ShapeEditorResult = { pieces: ResultPiece[]; basis: ShapeBasis; refs: RefImage[] };

type Piece = { id: string; shape: Shape; holes: Shape[]; count: number; allow: number; name: string; mats: PieceMat[]; pid: string; src: string[] };
type Tool = "rect" | "ellipse" | "pen" | "move" | "hand" | "measure";
type MeasureMode = "line" | "curve" | "edge";
type Measure = { id: string; kind: MeasureMode; nodes: PNode[]; len: number; alt?: number; path?: Pt[] };
type MDraft = { kind: "line"; a: XY; b: XY } | { kind: "curve"; nodes: PNode[]; hover: XY | null } | { kind: "edge"; pieceId: string; a: Pt; hover: XY | null };
type Ref = RefImage & { id: string; lock: boolean; show: boolean };
type DrawTool = "rect" | "ellipse" | "pen";
type View = { x: number; y: number; w: number };
type XY = { x: number; y: number };
type PenDraft = { nodes: PNode[]; hover: XY | null };
type BoxDraft = { k: "rect" | "ellipse"; a: XY; b: XY };
type Drag =
  | { k: "pan"; sx: number; sy: number; v: View }
  | { k: "move"; id: string; start: XY; orig: Piece; before: Piece[]; moved: boolean }
  | { k: "box" }
  | { k: "penHandle"; idx: number; origin: XY }
  | { k: "node"; idx: number; before: Piece[]; moved: boolean }
  | { k: "handle"; idx: number; which: "i" | "o"; before: Piece[]; moved: boolean; alt: boolean }
  | { k: "ref"; id: string; start: XY; ox: number; oy: number }
  | { k: "refSize"; id: string; start: XY; w: number }
  | { k: "resize"; id: string; dir: string; start: Box; orig: Piece; before: Piece[]; moved: boolean }
  | { k: "rotate"; id: string; c: XY; a0: number; orig: Piece; before: Piece[]; moved: boolean; deg: number }
  | { k: "mline" }
  | { k: "mHandle"; idx: number; origin: XY };

const SNAP_KEY = "pattern-shape-snap";
const FADE_KEY = "pattern-shape-fade";
const RS_DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const RS_CURSOR: Record<string, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const ALLOW_KEY = "pattern-shape-allow";
const ALLOW_STEPS = [0, 0.3, 0.5, 1] as const;
const MAX_PIECES = 60;
const COLORS = { fill: "#dbeafe", stroke: "#2563eb", sel: "#f59e0b", text: "#1e3a8a", grid: "#e2e8f0", gridMajor: "#cbd5e1", node: "#7c3aed" };
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const r2s = (n: number) => String(Math.round(n * 100) / 100);
let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const newPid = () => `pc${Date.now().toString(36)}${(seq++).toString(36)}`;
const MEASURE_COLOR = "#7c3aed";

function readNum(key: string, allowed: readonly number[] | null, dflt: number): number {
  try { const raw = localStorage.getItem(key); if (raw == null || raw === "") return dflt; const v = Number(raw); return Number.isFinite(v) && (!allowed || allowed.includes(v)) ? v : dflt; } catch { return dflt; }
}
const saveNum = (key: string, v: number) => { try { localStorage.setItem(key, String(v)); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };

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
const hasH = (n: PNode | undefined, w: "i" | "o") => !!n && (w === "i" ? !!(n.ix || n.iy) : !!(n.ox || n.oy));

/** ช่องตัวเลขที่พิมพ์ได้ลื่น (ไม่เด้งค่ากลับระหว่างพิมพ์) — เปลี่ยนค่าจากข้างนอกเมื่อไม่ได้โฟกัส */
function NumField({ value, onCommit, min, max, label, step = 0.1, className = "w-20" }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; label: string; step?: number; className?: string }) {
  const [txt, setTxt] = useState(r2s(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(r2s(value)); }, [value, focus]);
  return (
    <input type="number" step={step} min={min} max={max} value={txt} aria-label={label}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setTxt(r2s(value)); }}
      onChange={(e) => { setTxt(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) onCommit(v); }}
      className={`h-8 rounded-md border border-slate-200 px-1.5 text-right text-sm tabular-nums ${className}`} />
  );
}

export function ShapeEditor({ open, onClose, onSave, initial = [], initialBasis = "box", title, multiNote, materials = [], defaultMats = [],
  embedded = false, readonly = false, onChange, initialRefs = [], refPicker, initialSel = null, footerNote }: {
  open: boolean;
  onClose?: () => void;
  onSave?: (r: ShapeEditorResult) => void;
  /** ฝังในหน้า (ไม่ใช่ป๊อป) — ใช้คู่ onChange: แก้แล้วส่งค่ากลับเอง ไม่มีปุ่มบันทึก */
  embedded?: boolean;
  readonly?: boolean;
  /** เรียกทุกครั้งที่แก้ (หน่วง 0.25 วิ) — ส่งค่าทั้งกระดานกลับ */
  onChange?: (r: ShapeEditorResult) => void;
  initialRefs?: RefImage[];
  /** ตัวเลือกรูปอ้างอิง (เช่น รูปในใบงาน) — เรียก pick(รูป) เมื่อผู้ใช้เลือก */
  refPicker?: (pick: (img: { url: string; label?: string }) => void) => ReactNode;
  /** pid ของชิ้นที่ให้เลือกไว้ตอนเปิด */
  initialSel?: string | null;
  footerNote?: ReactNode;
  initial?: EditorPiece[];
  initialBasis?: ShapeBasis;
  title?: string;
  multiNote?: string;
  /** วัสดุที่เลือกได้ในแผงชิ้น (วัสดุตีราคา) */
  materials?: { id: string; name: string; sub?: string | null }[];
  /** วัสดุตั้งต้นของชิ้นที่วาดใหม่ (เปิดจากบรรทัด = วัสดุของบรรทัดนั้น) */
  defaultMats?: PieceMat[];
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);   // ป๊อปวาดลูกทีหลัง → ผูกตัววัดขนาด/ล้อเมาส์ตอนพื้นที่วาดโผล่จริง
  const bindSvg = useCallback((el: SVGSVGElement | null) => { svgRef.current = el; setSvgEl(el); }, []);
  const [size, setSize] = useState({ cw: 0, ch: 0 });   // วัดจริงหลังเปิด (ResizeObserver)
  const sizeRef = useRef({ cw: 0, ch: 0 });
  const [pieces, setPieces] = useState<Piece[]>(() => {
    // ชิ้นที่เคยวางบนกระดาน (at) = วางที่เดิม · ชิ้นที่ยังไม่มีตำแหน่ง (เช่น บรรทัดแบบเดิมที่พิมพ์กว้าง×ยาว) = เรียงต่อไปทางขวา ห่างกัน 2 ซม.
    let x = initial.reduce((m, p) => (p.at ? Math.max(m, p.at[0] + shapeBox(p.shape).w + (p.allow ?? 0) + 2) : m), 0);
    return initial.map((p) => {
      const b = shapeBox(p.shape), a = cleanAllow(p.allow);
      let dx: number, dy: number;
      if (p.at) { dx = p.at[0] - b.x; dy = p.at[1] - b.y; }
      else { dx = x + a - b.x; dy = a - b.y; x += b.w + 2 * a + 2; }
      const m = movePiece({ shape: p.shape, holes: p.holes ?? [] }, dx, dy);
      return { id: newId(), shape: m.shape, holes: m.holes, count: Math.max(1, Math.round(p.count) || 1), allow: a, name: p.name ?? "", mats: p.mats ?? [], pid: p.pid || newPid(), src: p.src ?? [] };
    });
  });
  const piecesRef = useRef(pieces); piecesRef.current = pieces;
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [lastDraw, setLastDraw] = useState<DrawTool>("rect");
  const [snap, setSnapState] = useState<number>(1);
  const [lastAllow, setLastAllow] = useState(0);
  const [view, setView] = useState<View>({ x: -2, y: -2, w: 62 });
  const [pen, setPen] = useState<PenDraft | null>(null);
  const [box, setBox] = useState<BoxDraft | null>(null);
  const [hover, setHover] = useState<XY | null>(null);
  const [basis, setBasis] = useState<ShapeBasis>(initialBasis);
  const [dirty, setDirty] = useState(false);
  const [lock, setLock] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);   // ชิ้นที่กำลังแก้จุด
  const [selNode, setSelNode] = useState(-1);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [nk, setNk] = useState<"rect" | "ellipse">("rect");
  const [nw, setNw] = useState("30");
  const [nh, setNh] = useState("35");
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engaged = useRef(!embedded);   // ฝังในหน้า: คีย์ลัดทำงานเฉพาะหลังคลิกในกระดาน (ไม่แย่งคีย์ส่วนอื่นของหน้า)
  // รูปอ้างอิง
  const [refs, setRefs] = useState<Ref[]>(() => initialRefs.slice(0, 4).map((r) => ({ ...r, id: newId(), lock: true, show: true })));
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [refPickOpen, setRefPickOpen] = useState(false);
  const [cal, setCal] = useState<{ a?: XY; b?: XY; m?: XY; cm: string } | null>(null);
  // ไม้บรรทัด
  const [measureMode, setMeasureMode] = useState<MeasureMode>("line");
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [mDraft, setMDraft] = useState<MDraft | null>(null);
  const [pieceFade, setPieceFadeState] = useState(0.6);   // ความทึบของพื้นชิ้น (เส้นยังชัด) — จางลง = เห็นรูปอ้างอิงด้านล่าง
  const setPieceFade = (v: number) => { const x = Math.min(1, Math.max(0.05, v)); setPieceFadeState(x); saveNum(FADE_KEY, x); };
  const [rotDeg, setRotDeg] = useState<number | null>(null);
  const [rotIn, setRotIn] = useState("15");     // Transform: หมุนกี่องศา
  const [scaleIn, setScaleIn] = useState("110"); // Transform: ย่อ/ขยายกี่ %

  // ── ย้อนกลับ / ทำซ้ำ ──
  const hist = useRef<Piece[][]>([]);
  const fut = useRef<Piece[][]>([]);
  const lastPush = useRef<{ key: string; at: number } | null>(null);
  const [, setHv] = useState(0);
  /** จดสภาพก่อนเปลี่ยน (key เดียวกันติดกันภายใน 1.2 วิ = รวมเป็นครั้งเดียว เช่น พิมพ์ตัวเลขทีละตัว) */
  const record = useCallback((prev: Piece[], key?: string) => {
    const now = Date.now();
    if (key && lastPush.current?.key === key && now - lastPush.current.at < 1200) { lastPush.current.at = now; return; }
    hist.current.push(prev);
    if (hist.current.length > 100) hist.current.shift();
    fut.current = [];
    lastPush.current = key ? { key, at: now } : null;
    setHv((v) => v + 1);
  }, []);
  const commit = useCallback((next: Piece[], key?: string) => { record(piecesRef.current, key); setPieces(next); setDirty(true); }, [record]);
  const restore = (to: Piece[]) => { setPieces(to); setDirty(true); lastPush.current = null; setSelNode(-1); setSel((s) => (s && to.some((p) => p.id === s) ? s : null)); setEditId((e) => (e && to.some((p) => p.id === e) ? e : null)); setHv((v) => v + 1); };
  const undo = useCallback(() => { const h = hist.current.pop(); if (!h) return; fut.current.push(piecesRef.current); restore(h); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => { const f = fut.current.pop(); if (!f) return; hist.current.push(piecesRef.current); restore(f); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSnapState(readNum(SNAP_KEY, SNAP_STEPS, 1)); setLastAllow(readNum(ALLOW_KEY, null, 0)); setPieceFadeState(readNum(FADE_KEY, null, initialRefs.length ? 0.3 : 0.6)); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const setSnap = (v: number) => { setSnapState(v); saveNum(SNAP_KEY, v); };

  const vh = view.w * (size.ch / Math.max(1, size.cw));
  const ppc = size.cw / view.w;   // px ต่อ ซม.
  const step = snap > 0 ? snap : 0.1;
  const selPiece = pieces.find((p) => p.id === sel) ?? null;
  const geo = useMemo(() => new Map(pieces.map((p) => [p.id, pieceGeometry(p)])), [pieces]);

  useEffect(() => {
    const el = svgEl; if (!el) return;
    // ขนาดพื้นที่วาดเปลี่ยน (ขยายป๊อป/จอ) → คงสเกลเดิม (ซม. ต่อ px เท่าเดิม) ไม่ให้ภาพกระโดด
    const measure = () => {
      const r = el.getBoundingClientRect(); if (!(r.width > 0)) return;
      const old = sizeRef.current;
      if (old.cw > 0 && Math.abs(old.cw - r.width) > 0.5) setView((v) => ({ ...v, w: v.w * (r.width / old.cw) }));
      sizeRef.current = { cw: r.width, ch: r.height };
      setSize(sizeRef.current);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [svgEl]);

  const fitView = useCallback((list: Piece[] = piecesRef.current) => {
    const aspect = size.ch / Math.max(1, size.cw);
    if (!list.length || !(aspect > 0)) { setView({ x: -2, y: -2, w: 62 }); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of list) { const b = pieceGeometry(p).cutBox; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    const pad = Math.max(2, (x1 - x0) * 0.08, (y1 - y0) * 0.08);
    const w = Math.max(10, x1 - x0 + pad * 2, (y1 - y0 + pad * 2) / aspect);
    setView({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * aspect) / 2, w });
  }, [size]);

  const fitted = useRef(false);
  useEffect(() => { if (open && !fitted.current && size.cw > 0) { fitted.current = true; fitView(); } }, [open, size, fitView]);

  const toCm = (e: { clientX: number; clientY: number }): XY => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * vh };
  };
  const snapPt = (p: XY): XY => ({ x: snapTo(p.x, snap), y: snapTo(p.y, snap) });
  const pxDist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) * ppc;
  const constrain45 = (from: XY, p: XY): XY => {
    const dx = p.x - from.x, dy = p.y - from.y, len = Math.hypot(dx, dy);
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: snapTo(from.x + Math.cos(a) * len, snap), y: snapTo(from.y + Math.sin(a) * len, snap) };
  };
  const changeTool = (tl: Tool) => {
    if (readonly && (tl === "rect" || tl === "ellipse" || tl === "pen")) return;
    setTool(tl); if (tl === "rect" || tl === "ellipse" || tl === "pen") setLastDraw(tl); setPen(null); setBox(null); setMDraft(null); if (tl !== "move") setEditId(null);
  };
  const newPiece = (shape: Shape, holes: Shape[] = []): Piece => ({ id: newId(), shape, holes, count: 1, allow: lastAllow, name: "", mats: [...defaultMats], pid: newPid(), src: [] });
  const addPieces = (list: Piece[], selectFirst = true): Piece[] | null => {
    const cur = piecesRef.current;
    if (cur.length + list.length > MAX_PIECES) { setMsg({ tone: "err", text: t(`วาดได้ไม่เกิน ${MAX_PIECES} ชิ้นต่อครั้ง`, `Up to ${MAX_PIECES} pieces at a time`) }); return null; }
    const next = [...cur, ...list];
    commit(next);
    if (selectFirst && list[0]) setSel(list[0].id);
    return next;
  };
  const rightEdge = () => piecesRef.current.reduce((m, p) => { const b = pieceGeometry(p).cutBox; return Math.max(m, b.x + b.w); }, -2) + 2;
  const patchPiece = (id: string, f: (p: Piece) => Piece, key?: string) => commit(piecesRef.current.map((p) => (p.id === id ? f(p) : p)), key);

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
    if (pieceGeometry({ shape: s }).finishedArea <= 0) { setMsg({ tone: "err", text: t("รูปนี้ไม่มีพื้นที่ (จุดเรียงเป็นเส้นตรง)", "This shape has no area (points are in a line)") }); return; }
    addPieces([newPiece(s)]);
  };

  // ── เมาส์/นิ้ว บนพื้นที่วาด ──
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setMsg(null);
    const capture = () => { try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ */ } };
    if (e.button === 1 || tool === "hand" || spaceDown.current) { drag.current = { k: "pan", sx: e.clientX, sy: e.clientY, v: view }; capture(); e.preventDefault(); return; }
    if (e.button !== 0) return;
    const raw = toCm(e), p = snapPt(raw);
    const target = e.target as Element;
    // ตั้งขนาดจริงของรูปอ้างอิง: คลิก 2 จุดบนรูป
    if (cal) { if (!cal.a) setCal({ ...cal, a: raw }); else if (!cal.b) setCal({ ...cal, b: raw, m: undefined }); return; }
    // รูปอ้างอิงที่ยังไม่ล็อก: ลากย้าย / ลากมุมย่อขยาย
    const rs = target.getAttribute?.("data-refsize"), rf = target.getAttribute?.("data-ref");
    if (rs) { const r = refs.find((x) => x.id === rs); if (r) { drag.current = { k: "refSize", id: rs, start: raw, w: r.w }; capture(); } return; }
    if (rf) { const r = refs.find((x) => x.id === rf); if (r) { setActiveRef(rf); drag.current = { k: "ref", id: rf, start: raw, ox: r.x, oy: r.y }; capture(); } return; }
    if (tool === "measure") { measureDown(e, raw, p, target, capture); return; }
    // จุดจับของชิ้นที่เลือก: ย่อขยาย / หมุน
    const rsDir = target.getAttribute?.("data-rs"), rotId = target.getAttribute?.("data-rot");
    if (rsDir && selPiece && !readonly) { drag.current = { k: "resize", id: selPiece.id, dir: rsDir, start: pieceGeometry(selPiece).cutBox, orig: selPiece, before: piecesRef.current, moved: false }; capture(); return; }
    if (rotId && selPiece && !readonly) {
      const b = shapeBox(selPiece.shape), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      drag.current = { k: "rotate", id: selPiece.id, c, a0: Math.atan2(raw.y - c.y, raw.x - c.x), orig: selPiece, before: piecesRef.current, moved: false, deg: 0 }; capture(); return;
    }
    // ดูอย่างเดียว: กด = เลือกชิ้น · ลากที่ว่าง = เลื่อนดู
    if (readonly) { const hid = target.getAttribute?.("data-piece"); if (hid) setSel(hid); else { setSel(null); drag.current = { k: "pan", sx: e.clientX, sy: e.clientY, v: view }; capture(); } return; }
    // แก้จุด: ลากจุด / หูจับ
    if (editId) {
      const nd = target.getAttribute?.("data-node"), hd = target.getAttribute?.("data-handle");
      if (nd != null) { setSelNode(Number(nd)); drag.current = { k: "node", idx: Number(nd), before: piecesRef.current, moved: false }; capture(); return; }
      if (hd != null && selNode >= 0) { drag.current = { k: "handle", idx: selNode, which: hd === "i" ? "i" : "o", before: piecesRef.current, moved: false, alt: e.altKey }; capture(); return; }
      if (target.getAttribute?.("data-piece") === editId) return;   // คลิกบนชิ้นที่กำลังแก้ = ไม่ทำอะไร (ดับเบิลคลิก = เพิ่มจุด)
      setEditId(null); setSelNode(-1);
      if (!target.getAttribute?.("data-piece")) { setSel(null); return; }   // ออกจากโหมดแก้จุด (ไม่เริ่มวาด)
    }
    if (pen) {   // กำลังวาดปากกา: คลิก = เพิ่มจุด · กดจุดแรก = ปิดรูป
      const f = pen.nodes[0];
      if (pen.nodes.length >= 3 && (pxDist(raw, f) <= 12 || (p.x === f.x && p.y === f.y))) { commitPen(); return; }   // กดจุดแรก (หรือจุดที่ดูดเข้าตรงจุดแรก) = ปิดรูป
      const last = pen.nodes[pen.nodes.length - 1];
      const q = e.shiftKey && last ? constrain45(last, p) : p;
      setPen({ nodes: [...pen.nodes, { x: q.x, y: q.y }], hover: null });
      drag.current = { k: "penHandle", idx: pen.nodes.length, origin: q }; capture();
      return;
    }
    const hitId = target.getAttribute?.("data-piece");
    if (hitId) {   // กดชิ้นที่วาดแล้ว → ย้าย + เปิดแผงรายละเอียด
      const pc = piecesRef.current.find((x) => x.id === hitId);
      if (pc) { setSel(hitId); setTool("move"); drag.current = { k: "move", id: hitId, start: raw, orig: pc, before: piecesRef.current, moved: false }; capture(); }
      return;
    }
    // ที่ว่าง → วาดด้วยเครื่องมือล่าสุด
    setSel(null);
    const dt: DrawTool = tool === "move" ? lastDraw : (tool as DrawTool);
    if (tool === "move") setTool(lastDraw);
    if (dt === "pen") { setPen({ nodes: [{ x: p.x, y: p.y }], hover: null }); drag.current = { k: "penHandle", idx: 0, origin: p }; capture(); return; }
    setBox({ k: dt, a: p, b: p }); drag.current = { k: "box" }; capture();
  };
  const setEditNodes = (f: (nodes: PNode[]) => PNode[]) => {
    if (!editId) return;
    setPieces((ps) => ps.map((x) => (x.id === editId && x.shape.k === "path" ? { ...x, shape: { k: "path", nodes: f(x.shape.nodes) } } : x)));
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = toCm(e), p = snapPt(raw);
    setHover(p);
    const d = drag.current;
    if (cal?.a && !cal.b) setCal({ ...cal, m: raw });
    if (!d) {
      if (pen) { const last = pen.nodes[pen.nodes.length - 1]; setPen({ ...pen, hover: e.shiftKey && last ? constrain45(last, p) : p }); }
      else if (mDraft?.kind === "curve") { const last = mDraft.nodes[mDraft.nodes.length - 1]; setMDraft({ ...mDraft, hover: e.shiftKey && last ? constrain45(last, p) : p }); }
      else if (mDraft?.kind === "edge") setMDraft({ ...mDraft, hover: raw });
      return;
    }
    if (d.k === "resize") {
      const sb = d.start, a = d.orig.allow, min = 2 * a + 0.2;
      let x0 = sb.x, y0 = sb.y, x1 = sb.x + sb.w, y1 = sb.y + sb.h;
      if (d.dir.includes("w")) x0 = Math.min(p.x, x1 - min);
      if (d.dir.includes("e")) x1 = Math.max(p.x, x0 + min);
      if (d.dir.includes("n")) y0 = Math.min(p.y, y1 - min);
      if (d.dir.includes("s")) y1 = Math.max(p.y, y0 + min);
      if ((lock || e.shiftKey) && d.dir.length === 2 && sb.w > 0 && sb.h > 0) {   // มุม + คงสัดส่วน
        const r = sb.w / sb.h; let w = x1 - x0, h = y1 - y0;
        if (w / h > r) h = w / r; else w = h * r;
        if (d.dir.includes("w")) x0 = x1 - w; else x1 = x0 + w;
        if (d.dir.includes("n")) y0 = y1 - h; else y1 = y0 + h;
      }
      d.moved = true;
      setPieces((ps) => ps.map((x) => (x.id === d.id ? fitPiece(d.orig, x0 + a, y0 + a, x1 - x0 - 2 * a, y1 - y0 - 2 * a) : x)));
      return;
    }
    if (d.k === "rotate") {
      let deg = ((Math.atan2(raw.y - d.c.y, raw.x - d.c.x) - d.a0) * 180) / Math.PI;
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
      deg = ((deg + 540) % 360) - 180;
      d.moved = deg !== 0; d.deg = deg; setRotDeg(deg);
      setPieces((ps) => ps.map((x) => (x.id === d.id ? rotatePiece(d.orig, deg, d.c.x, d.c.y) : x)));
      return;
    }
    if (d.k === "ref") { setRefs((rs) => rs.map((r) => (r.id === d.id ? { ...r, x: d.ox + raw.x - d.start.x, y: d.oy + raw.y - d.start.y } : r))); return; }
    if (d.k === "refSize") { setRefs((rs) => rs.map((r) => (r.id === d.id ? { ...r, w: Math.max(1, d.w + raw.x - d.start.x) } : r))); return; }
    if (d.k === "mline" && mDraft?.kind === "line") { setMDraft({ ...mDraft, b: e.shiftKey ? constrain45(mDraft.a, p) : p }); return; }
    if (d.k === "mHandle" && mDraft?.kind === "curve") {
      const vx = p.x - d.origin.x, vy = p.y - d.origin.y;
      if (Math.hypot(vx, vy) * ppc < 3) return;
      setMDraft({ ...mDraft, hover: null, nodes: mDraft.nodes.map((n, i) => (i === d.idx ? { x: n.x, y: n.y, ox: vx, oy: vy, ix: -vx, iy: -vy } : n)) });
      return;
    }
    if (d.k === "pan") { setView({ x: d.v.x - (e.clientX - d.sx) / ppc, y: d.v.y - (e.clientY - d.sy) / ppc, w: d.v.w }); return; }
    if (d.k === "move") {
      const ob = shapeBox(d.orig.shape);
      const nx = snapTo(ob.x + raw.x - d.start.x, snap), ny = snapTo(ob.y + raw.y - d.start.y, snap);
      if (nx === ob.x && ny === ob.y && !d.moved) return;
      d.moved = true;
      setPieces((ps) => ps.map((x) => (x.id === d.id ? movePiece(d.orig, nx - ob.x, ny - ob.y) : x)));
      return;
    }
    if (d.k === "node") { d.moved = true; setEditNodes((ns) => ns.map((n, i) => (i === d.idx ? { ...n, x: p.x, y: p.y } : n))); return; }
    if (d.k === "handle") {
      d.moved = true;
      setEditNodes((ns) => ns.map((n, i) => {
        if (i !== d.idx) return n;
        const vx = p.x - n.x, vy = p.y - n.y;
        const m: PNode = { ...n };
        if (d.which === "o") { m.ox = vx; m.oy = vy; if (!d.alt && !e.altKey && hasH(n, "i")) { m.ix = -vx; m.iy = -vy; } }
        else { m.ix = vx; m.iy = vy; if (!d.alt && !e.altKey && hasH(n, "o")) { m.ox = -vx; m.oy = -vy; } }
        return m;
      }));
      return;
    }
    if (d.k === "box" && box) {
      let b = p;
      if (e.shiftKey) { const dx = p.x - box.a.x, dy = p.y - box.a.y, m = Math.max(Math.abs(dx), Math.abs(dy)); b = { x: box.a.x + Math.sign(dx || 1) * m, y: box.a.y + Math.sign(dy || 1) * m }; }
      setBox({ ...box, b });
      return;
    }
    if (d.k === "penHandle" && pen) {
      const vx = p.x - d.origin.x, vy = p.y - d.origin.y;
      if (Math.hypot(vx, vy) * ppc < 3) return;
      setPen({ ...pen, hover: null, nodes: pen.nodes.map((n, i) => (i === d.idx ? { x: n.x, y: n.y, ox: vx, oy: vy, ix: -vx, iy: -vy } : n)) });
    }
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if ((d.k === "move" || d.k === "node" || d.k === "handle" || d.k === "resize" || d.k === "rotate") && d.moved) { record(d.before); setDirty(true); }
    if (d.k === "rotate") {
      setRotDeg(null);
      // หมุนเอียง (ไม่ใช่ทีละ 90°) → กรอบสี่เหลี่ยมใหญ่ขึ้น · คิดผ้าแบบกรอบ ต้นทุนจะเพิ่ม — บอกให้รู้
      if (d.moved && d.deg % 90 !== 0 && basisRef.current === "box") setMsg({ tone: "err", text: t(`หมุนเอียง ${d.deg}° แล้วกรอบสี่เหลี่ยมใหญ่ขึ้น — ถ้าคิดผ้าจาก "กรอบสี่เหลี่ยม" ต้นทุนจะเพิ่ม · ถ้าหมุนแค่ให้ตรงรูปอ้างอิง แนะนำเลือก "พื้นที่จริง" หรือหมุนทีละ 90°`, `Rotated ${d.deg}° — the bounding box grew; with "Bounding box" costing the fabric cost rises · if you only rotated to match the reference, pick "Actual area" or rotate in 90° steps`) });
    }
    if (d.k === "mline" && mDraft?.kind === "line") {
      const { a, b } = mDraft; const len = Math.hypot(b.x - a.x, b.y - a.y);
      setMDraft(null);
      if (len > 0) addMeasure({ kind: "line", nodes: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], len });
    }
    if (d.k === "box" && box) {
      const x = Math.min(box.a.x, box.b.x), y = Math.min(box.a.y, box.b.y), w = Math.abs(box.a.x - box.b.x), h = Math.abs(box.a.y - box.b.y);
      setBox(null);
      if (w > 0 && h > 0) addPieces([newPiece({ k: box.k, x, y, w, h })]);
    }
  };
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mDraft?.kind === "curve") { commitCurve(); return; }
    if (pen) { commitPen(); return; }
    if (!editId) return;
    const target = e.target as Element;
    const nd = target.getAttribute?.("data-node");
    const pc = piecesRef.current.find((x) => x.id === editId);
    if (!pc || pc.shape.k !== "path") return;
    if (nd != null) { patchPiece(editId, (x) => (x.shape.k === "path" ? { ...x, shape: { k: "path", nodes: toggleSmooth(x.shape.nodes, Number(nd)) } } : x)); return; }   // จุดมุม ↔ จุดโค้ง
    if (target.getAttribute?.("data-piece") === editId) {   // ดับเบิลคลิกบนเส้น = เพิ่มจุด (แบ่งเส้นโค้ง รูปไม่เปลี่ยน)
      const q = toCm(e);
      const near = nearestSegment(pc.shape.nodes, [q.x, q.y]);
      patchPiece(editId, (x) => (x.shape.k === "path" ? { ...x, shape: { k: "path", nodes: splitSegment(x.shape.nodes, near.i, near.t) } } : x));
      setSelNode(near.i + 1);
    }
  };

  const zoomAt = (f: number) => {
    setView((v) => {
      const w = Math.min(2000, Math.max(1, v.w / f));
      const ox = v.x + v.w / 2, oy = v.y + (v.w * size.ch) / Math.max(1, size.cw) / 2;
      return { x: ox - (ox - v.x) * (w / v.w), y: oy - (oy - v.y) * (w / v.w), w };
    });
  };
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

  const importSvg = (text: string) => {
    const imp = parseSvgShapes(text);
    if (!imp) { setMsg({ tone: "err", text: t("ไม่พบรูปทรงที่ปิดในสิ่งที่วาง — ใน Illustrator ต้องเลือกรูปแล้วก๊อป (เปิดตัวเลือก Include SVG Code) หรือใช้ไฟล์ .svg", "No closed shapes found — in Illustrator copy with Include SVG Code on, or use an .svg file") }); return; }
    const ox = piecesRef.current.length ? rightEdge() : 0;
    const next = addPieces(imp.pieces.map((p) => { const m = movePiece(p, ox, 0); return newPiece(m.shape, m.holes); }));
    if (!next) return;
    changeTool("move");
    fitView(next);
    const holes = imp.pieces.reduce((m, p) => m + p.holes.length, 0);
    setMsg({ tone: "ok", text: t(`วางแล้ว ${imp.pieces.length} ชิ้น${holes ? ` (มีรูเจาะ ${holes} รู)` : ""} · หน่วย: ${imp.unitNote} — เช็กขนาด ถ้าไม่ตรงพิมพ์แก้ได้`, `Pasted ${imp.pieces.length} pieces${holes ? ` (${holes} holes)` : ""} · units: ${imp.unitNote} — check sizes; type to fix`) });
  };
  const importRef = useRef(importSvg); importRef.current = importSvg;

  // คีย์ลัด + ย้อนกลับ + วาง (Ctrl+V) ระหว่างเปิดหน้าต่าง
  useEffect(() => {
    if (!open) return;
    const inField = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return;   // ในช่องพิมพ์ ใช้ย้อนกลับของช่องเอง
      if (embedded && !engaged.current) return;   // ฝังในหน้า: ต้องคลิกในกระดานก่อน
      const k = e.key.toLowerCase();
      if (e.key === "Escape" && (mDraft || cal)) { e.stopPropagation(); e.preventDefault(); setMDraft(null); setCal(null); return; }
      if (e.key === "Enter" && mDraft?.kind === "curve") { e.preventDefault(); commitCurve(); return; }
      if (readonly) {
        if (e.key === " ") { spaceDown.current = true; e.preventDefault(); }
        else if (!e.ctrlKey && !e.metaKey && (k === "m" || k === "h" || k === "v")) { e.preventDefault(); changeTool(k === "m" ? "measure" : k === "h" ? "hand" : "move"); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Escape" && (pen || box || sel || editId)) {
        e.stopPropagation(); e.preventDefault();
        if (pen || box) { setPen(null); setBox(null); } else if (editId) { setEditId(null); setSelNode(-1); } else setSel(null);
        return;
      }
      if (e.key === "Enter" && pen) { e.preventDefault(); commitPen(); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && pen) { e.preventDefault(); setPen(pen.nodes.length > 1 ? { ...pen, nodes: pen.nodes.slice(0, -1) } : null); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && editId && selNode >= 0) {
        e.preventDefault();
        const pc = piecesRef.current.find((x) => x.id === editId);
        if (pc?.shape.k === "path" && pc.shape.nodes.length > 3) { patchPiece(editId, (x) => (x.shape.k === "path" ? { ...x, shape: { k: "path", nodes: x.shape.nodes.filter((_, i) => i !== selNode) } } : x)); setSelNode(-1); }
        else setMsg({ tone: "err", text: t("รูปต้องมีอย่างน้อย 3 จุด", "A shape needs at least 3 points") });
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && sel) { e.preventDefault(); commit(piecesRef.current.filter((p) => p.id !== sel)); setSel(null); setEditId(null); return; }
      if (e.key.startsWith("Arrow") && sel) {
        e.preventDefault();
        const d = step * (e.shiftKey ? 10 : 1);
        const [dx, dy] = e.key === "ArrowLeft" ? [-d, 0] : e.key === "ArrowRight" ? [d, 0] : e.key === "ArrowUp" ? [0, -d] : [0, d];
        patchPiece(sel, (p) => movePiece(p, dx, dy), `nudge-${sel}`);
        return;
      }
      if (e.key === " ") { spaceDown.current = true; e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, Tool> = { r: "rect", o: "ellipse", e: "ellipse", p: "pen", v: "move", h: "hand", m: "measure" };
      if (map[k]) { e.preventDefault(); changeTool(map[k]); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") spaceDown.current = false; };
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target)) return;
      if ((embedded && !engaged.current) || readonly) return;
      const cd = e.clipboardData; if (!cd) return;
      const file = Array.from(cd.files ?? []).find((f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"));
      if (file) { e.preventDefault(); void file.text().then((x) => importRef.current(x)); return; }
      const txt = cd.getData("image/svg+xml") || cd.getData("text/plain");
      if (txt && /<svg[\s>]/i.test(txt)) { e.preventDefault(); importRef.current(txt); return; }
      if (txt || cd.files?.length) setMsg({ tone: "err", text: t("สิ่งที่วางไม่ใช่รูปทรงจาก Illustrator — ใน Illustrator ไปที่ Preferences → Clipboard Handling → ติ๊ก Include SVG Code แล้วก๊อปใหม่", "That isn't a shape from Illustrator — enable Preferences → Clipboard Handling → Include SVG Code, then copy again") });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("paste", onPaste); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pen, box, sel, editId, selNode, step, mDraft, cal, readonly]);

  // ฝังในหน้า: คลิกในกระดาน = เปิดคีย์ลัด · คลิกนอกกระดาน = ปิด
  useEffect(() => {
    if (!embedded) return;
    const onDown = (e: PointerEvent) => { engaged.current = !!rootRef.current?.contains(e.target as Node); };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [embedded]);

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".svg") && f.type !== "image/svg+xml") { setMsg({ tone: "err", text: t("รองรับเฉพาะไฟล์ .svg (Illustrator: File → Export As → SVG)", "Only .svg files (Illustrator: File → Export As → SVG)") }); return; }
    if (f.size > 5 * 1024 * 1024) { setMsg({ tone: "err", text: t("ไฟล์ใหญ่เกิน 5MB", "File is over 5MB") }); return; }
    importSvg(await f.text());
  };

  // ── แผงรายละเอียดชิ้น ──
  const setSelBox = (patch: Partial<{ x: number; y: number; w: number; h: number }>, key: string) => {
    if (!selPiece) return;
    const b = shapeBox(selPiece.shape);
    let { x, y, w, h } = { ...b, ...patch };
    if (lock && patch.w != null && b.w > 0 && patch.h == null) h = b.h * (w / b.w);
    if (lock && patch.h != null && b.h > 0 && patch.w == null) w = b.w * (h / b.h);
    if (!(w > 0) || !(h > 0)) return;
    patchPiece(selPiece.id, (p) => fitPiece(p, x, y, w, h), key);
  };
  // Transform (แผงชิ้น): หมุนตามองศาที่พิมพ์ · ย่อ/ขยาย % รอบจุดกึ่งกลาง
  const applyRotate = (sign: 1 | -1) => {
    const d = Number(rotIn);
    if (!selPiece || !Number.isFinite(d) || d === 0) { setMsg({ tone: "err", text: t("ใส่องศาที่จะหมุน เช่น 15", "Enter an angle, e.g. 15") }); return; }
    patchPiece(selPiece.id, (p) => rotatePiece(p, sign * d));
  };
  const applyScale = () => {
    const s = Number(scaleIn) / 100;
    if (!selPiece || !(s > 0) || s === 1) { setMsg({ tone: "err", text: t("ใส่ % เช่น 110 = ขยาย 10% · 90 = ย่อ 10%", "Enter a %, e.g. 110 = +10% · 90 = −10%") }); return; }
    const b = shapeBox(selPiece.shape), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    patchPiece(selPiece.id, (p) => fitPiece(p, cx - (b.w * s) / 2, cy - (b.h * s) / 2, b.w * s, b.h * s));
  };
  const setAllow = (v: number) => { if (!selPiece) return; const a = cleanAllow(v); patchPiece(selPiece.id, (p) => ({ ...p, allow: a }), `allow-${selPiece.id}`); setLastAllow(a); saveNum(ALLOW_KEY, a); };
  const hostOf = (p: Piece) => pieces.find((o) => o.id !== p.id && shapeInside(p.shape, o.shape)) ?? null;
  const makeHole = (p: Piece) => {
    const host = hostOf(p); if (!host) return;
    commit(piecesRef.current.filter((x) => x.id !== p.id).map((x) => (x.id === host.id ? { ...x, holes: [...x.holes, p.shape, ...p.holes] } : x)));
    setSel(host.id);
    setMsg({ tone: "ok", text: t(`เจาะเป็นรูใน P${pieces.indexOf(host) + 1} แล้ว (Ctrl+Z ย้อนได้)`, `Made a hole in P${pieces.indexOf(host) + 1} (Ctrl+Z to undo)`) });
  };
  const holeToPiece = (p: Piece, hi: number) => {
    const h = p.holes[hi]; if (!h) return;
    const np = newPiece(h);
    commit([...piecesRef.current.map((x) => (x.id === p.id ? { ...x, holes: x.holes.filter((_, i) => i !== hi) } : x)), np]);
    setSel(np.id);
  };
  const doFold = (p: Piece, axis: "x" | "y") => {
    const f = foldPiece(p, axis);
    if (!f) { setMsg({ tone: "err", text: p.shape.k === "ellipse" ? t("วงกลมพับครึ่งไม่ได้ — วาดครึ่งวงด้วยปากกาให้มีเส้นตรงแนบขอบ แล้วพับ", "Circles can't be folded — draw a half with the pen (straight edge on the fold), then fold") : t("ต้องมีเส้นตรงแนบขอบที่จะพับ (วาดครึ่งชิ้นให้ชิดเส้นพับ)", "Needs a straight edge on the fold side (draw the half against the fold line)") }); return; }
    patchPiece(p.id, () => f);
  };
  const startEdit = (p: Piece) => {
    if (editId === p.id) { setEditId(null); setSelNode(-1); return; }
    if (p.shape.k !== "path") patchPiece(p.id, (x) => ({ ...x, shape: toPathShape(x.shape), holes: x.holes }));
    setEditId(p.id); setSelNode(-1); setTool("move");
  };
  const addByNumber = () => {
    const w = Number(nw), h = Number(nh);
    if (!(w > 0) || !(h > 0)) { setMsg({ tone: "err", text: t("ใส่กว้างและสูงเป็นตัวเลขมากกว่า 0", "Enter a width and height above 0") }); return; }
    const x = piecesRef.current.length ? snapTo(rightEdge(), snap) : 0;
    const next = addPieces([newPiece({ k: nk, x, y: 0, w, h })]);
    if (next) fitView(next);
  };

  const rows = useMemo(() => pieces.map((p, i) => ({ p, i, g: geo.get(p.id) ?? pieceGeometry(p) })), [pieces, geo]);
  const total = rows.reduce((s, r) => s + (basis === "box" ? r.g.cutBox.w * r.g.cutBox.h : r.g.cutArea) * r.p.count, 0);
  const lineCount = rows.reduce((s, r) => s + Math.max(1, r.p.mats.length), 0);
  const noMat = rows.filter((r) => !r.p.mats.length).length;

  // ── ผลลัพธ์ (บันทึกแบบป๊อป / ส่งกลับอัตโนมัติแบบฝัง) ──
  const basisRef = useRef(basis); basisRef.current = basis;
  const refsRef = useRef(refs); refsRef.current = refs;
  const buildResult = (): ShapeEditorResult => ({
    pieces: piecesRef.current.map((p) => {
      const g = pieceGeometry(p);
      return { shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, name: p.name.trim(), mats: p.mats, geo: g, pid: p.pid, src: p.src, at: [Math.round(g.finished.x * 1000) / 1000, Math.round(g.finished.y * 1000) / 1000] };
    }),
    basis: basisRef.current,
    refs: refsRef.current.map((r) => ({ url: r.url, ...(r.label ? { label: r.label } : {}), x: r.x, y: r.y, w: r.w, ar: r.ar, op: r.op })),
  });
  const save = () => {
    if (!pieces.length) { setMsg({ tone: "err", text: t("ยังไม่มีชิ้น — วาดหรือวางจาก Illustrator ก่อน", "No pieces yet — draw or paste from Illustrator first") }); return; }
    onSave?.(buildResult());
  };
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const sigOf = () => JSON.stringify([piecesRef.current.map((p) => [p.shape, p.holes, p.count, p.allow, p.name, p.mats, p.pid]), basisRef.current, refsRef.current.map((r) => [r.url, r.x, r.y, r.w, r.ar, r.op])]);
  const lastSig = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const s = sigOf();
    if (s !== lastSig.current) { lastSig.current = s; onChangeRef.current?.(buildResult()); }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lastSig.current == null) { lastSig.current = sigOf(); return; }   // ตอนเปิด ไม่ส่ง (ยังไม่ได้แก้)
    if (!onChangeRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 250);
  }, [pieces, basis, refs]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) flush(); }, [flush]);   // ปิด/สลับมุมมองระหว่างรอ = ส่งทันที ไม่หาย
  useEffect(() => { if (initialSel) { const pc = piecesRef.current.find((x) => x.pid === initialSel); if (pc) { setSel(pc.id); setTool("move"); } } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── รูปอ้างอิง ──
  const addRef = (img: { url: string; label?: string }) => {
    setRefPickOpen(false);
    const id = newId();
    const w = Math.max(10, Math.round(view.w * 0.45));
    setRefs((rs) => [...rs.slice(-3), { id, url: img.url, label: img.label, x: view.x + view.w * 0.08, y: view.y + vh * 0.08, w, ar: 1, op: 0.5, lock: false, show: true }]);
    if (pieceFade > 0.35) setPieceFade(0.3);   // ชิ้นจางลง จะได้เห็นรูปด้านล่าง
    setActiveRef(id);
    const im = new Image();
    im.onload = () => { if (im.naturalWidth > 0) setRefs((rs) => rs.map((r) => (r.id === id ? { ...r, ar: im.naturalHeight / im.naturalWidth } : r))); };
    im.src = img.url;
    setMsg({ tone: "ok", text: t("วางรูปอ้างอิงแล้ว — ลากย้าย / ลากมุมขวาล่างย่อขยาย แล้วกด \"ตั้งขนาดจริง\"", "Reference added — drag to move, drag the corner to resize, then \"Set real size\"") });
  };
  const patchRef = (id: string, patch: Partial<Ref>) => setRefs((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const applyCal = () => {
    const cm = Number(cal?.cm);
    if (!cal?.a || !cal.b || !(cm > 0) || !activeRef) return;
    const a = cal.a, d = Math.hypot(cal.b.x - a.x, cal.b.y - a.y);
    if (!(d > 0)) return;
    const k = cm / d;
    setRefs((rs) => rs.map((r) => (r.id === activeRef ? { ...r, x: a.x - (a.x - r.x) * k, y: a.y - (a.y - r.y) * k, w: r.w * k, lock: true } : r)));
    setCal(null);
    setMsg({ tone: "ok", text: t(`ตั้งขนาดจริงแล้ว (${cm} ซม.) — รูปล็อกไว้ วาดลอกตามได้เลย`, `Real size set (${cm} cm) — locked; trace over it`) });
  };

  // ── ไม้บรรทัด ──
  const fmtLen = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ${t("ซม.", "cm")}`;
  const addMeasure = (m: Omit<Measure, "id">) => {
    setMeasures((ms) => [...ms.slice(-29), { ...m, id: newId() }]);
    setMsg({ tone: "ok", text: m.kind === "edge" ? t(`ตามขอบ ${fmtLen(m.len)} (อ้อมอีกทาง ${fmtLen(m.alt ?? 0)})`, `Along edge ${fmtLen(m.len)} (other way ${fmtLen(m.alt ?? 0)})`) : t(`วัดได้ ${fmtLen(m.len)}`, `Measured ${fmtLen(m.len)}`) });
  };
  const commitCurve = () => {
    if (mDraft?.kind !== "curve") return;
    const nodes: PNode[] = [];
    for (const n of mDraft.nodes) { const last = nodes[nodes.length - 1]; if (last && Math.hypot(n.x - last.x, n.y - last.y) < 0.02) continue; nodes.push({ ...n }); }
    setMDraft(null);
    if (nodes.length >= 2) addMeasure({ kind: "curve", nodes, len: openPathLength(nodes) });
  };
  const measureDown = (e: React.PointerEvent<SVGSVGElement>, raw: XY, p: XY, target: Element, capture: () => void) => {
    if (measureMode === "line") { setMDraft({ kind: "line", a: p, b: p }); drag.current = { k: "mline" }; capture(); return; }
    if (measureMode === "curve") {
      const nodes = mDraft?.kind === "curve" ? mDraft.nodes : [];
      const last = nodes[nodes.length - 1];
      const q = e.shiftKey && last ? constrain45(last, p) : p;
      setMDraft({ kind: "curve", nodes: [...nodes, { x: q.x, y: q.y }], hover: null });
      drag.current = { k: "mHandle", idx: nodes.length, origin: q }; capture();
      return;
    }
    if (mDraft?.kind === "edge") {   // จุดปลาย
      const g = geo.get(mDraft.pieceId);
      setMDraft(null);
      if (!g) return;
      const r = outlineDistance(g.sew, mDraft.a, [raw.x, raw.y]);
      addMeasure({ kind: "edge", nodes: [], len: r.short, alt: r.long, path: r.path });
      return;
    }
    const hid = target.getAttribute?.("data-piece");
    const g = hid ? geo.get(hid) : null;
    if (!hid || !g) { setMsg({ tone: "err", text: t("วัดตามขอบ: คลิกบนชิ้นตรงจุดเริ่ม แล้วคลิกจุดปลาย", "Along edge: click a piece at the start point, then the end point") }); return; }
    setMDraft({ kind: "edge", pieceId: hid, a: projectOnOutline(g.sew, [raw.x, raw.y]).at, hover: null });
  };

  // ── วาดไม้บรรทัด / ตาราง ──
  const rs = rulerSteps(ppc);
  const gridStep = snap > 0 && snap * ppc >= 6 ? snap : rs.minor;
  const fs = view.w / 60;
  const cursor = tool === "hand" ? "grab" : tool === "move" ? "default" : "crosshair";
  const btnCls = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs ${on ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const toolBtn = (tl: Tool, icon: string, label: string, key: string) => (
    <button key={tl} type="button" onClick={() => changeTool(tl)} title={`${label} (${key})`} className={btnCls(tool === tl)}>
      <Icon value={`i:${icon}`} className="text-[14px]" />{label}
    </button>
  );
  const editPiece = editId ? pieces.find((p) => p.id === editId) ?? null : null;
  const hint = pen
    ? t(`ปากกา: ${pen.nodes.length} จุด · กดลาก = เส้นโค้ง · กดจุดแรก/ดับเบิลคลิก/Enter = ปิดรูป · Backspace = ลบจุดล่าสุด · Esc = ยกเลิก`, `Pen: ${pen.nodes.length} points · drag = curve · click first point / double-click / Enter = close · Backspace = undo point · Esc = cancel`)
    : editPiece ? t("แก้จุด: ลากจุด = ย้าย · ลากหูจับ = ดัดโค้ง (Alt = แยกหูจับ) · ดับเบิลคลิกจุด = มุม↔โค้ง · ดับเบิลคลิกเส้น = เพิ่มจุด · Delete = ลบจุด · Esc = เสร็จ", "Edit points: drag a point to move · drag a handle to bend (Alt = break) · double-click a point = corner↔smooth · double-click the outline = add point · Delete = remove point · Esc = done")
    : tool === "pen" ? t("ปากกา: คลิกวางจุด (มุม) · กดค้างแล้วลาก = เส้นโค้ง · Shift = เส้น 45°", "Pen: click to place corners · press and drag for curves · Shift = 45°")
    : tool === "hand" ? t("ลากเพื่อเลื่อนดู", "Drag to pan")
    : t("กดลากที่ว่างเพื่อวาด (Shift = จัตุรัส/วงกลม) · กดชิ้น = ย้าย + แผงรายละเอียด · ลากจุดจับรอบชิ้น = ย่อขยาย · จุดกลมด้านบน = หมุน · Ctrl+Z ย้อนกลับ", "Drag on empty space to draw (Shift = square/circle) · click a piece = move + details · drag the handles = resize · top circle = rotate · Ctrl+Z undo");

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
  const selIdx = selPiece ? pieces.indexOf(selPiece) : -1;
  const selGeo = selPiece ? geo.get(selPiece.id) ?? null : null;
  const selHost = selPiece ? hostOf(selPiece) : null;
  const matOptions = materials.filter((m) => !selPiece?.mats.some((x) => x.id === m.id)).map((m) => ({ value: m.id, label: m.name, sub: m.sub ?? undefined }));

  const activeRefObj = refs.find((r) => r.id === activeRef) ?? refs[refs.length - 1] ?? null;
  const footerEl = (<>
        <div className="mr-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{t("คิดผ้าจาก", "Fabric from")}</span>
          {(["box", "area"] as ShapeBasis[]).map((b) => (
            <button key={b} type="button" disabled={readonly} onClick={() => { setBasis(b); setDirty(true); }} className={`h-7 rounded-md border px-2 text-xs ${basis === b ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {b === "box" ? t("กรอบสี่เหลี่ยม", "Bounding box") : t("พื้นที่จริง", "Actual area")}
            </button>
          ))}
          <span className="text-slate-400">{t(`รวม ${Math.round(total).toLocaleString("th-TH")} ตร.ซม. · จะได้ ${lineCount} บรรทัด`, `Total ${Math.round(total).toLocaleString("th-TH")} cm² · ${lineCount} lines`)}</span>
          {noMat > 0 && materials.length > 0 && <span className="text-amber-600">{t(`${noMat} ชิ้นยังไม่เลือกวัสดุ`, `${noMat} pieces have no material`)}</span>}
          {multiNote && <span className="text-slate-400">{multiNote}</span>}
          {footerNote}
        </div>
        {!embedded && <>
          <button type="button" onClick={() => onClose?.()} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={save} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">{t(`ใช้ขนาดนี้ (${pieces.length} ชิ้น)`, `Use these (${pieces.length} pcs)`)}</button>
        </>}
      </>);
  const bodyEl = (
      <div className="space-y-3">
        {/* แถบเครื่องมือ */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!readonly && toolBtn("rect", "square", t("สี่เหลี่ยม", "Rectangle"), "R")}
          {!readonly && toolBtn("ellipse", "circle", t("วงกลม", "Circle"), "O")}
          {!readonly && toolBtn("pen", "vector-bezier", t("ปากกา", "Pen"), "P")}
          {toolBtn("move", "pointer", readonly ? t("เลือก", "Select") : t("ย้าย", "Move"), "V")}
          {toolBtn("hand", "hand-stop", t("เลื่อนดู", "Pan"), "H")}
          {toolBtn("measure", "ruler-measure", t("ไม้บรรทัด", "Measure"), "M")}
          {refPicker && <button type="button" onClick={() => setRefPickOpen((v) => !v)} className={btnCls(refPickOpen)} title={t("ใส่รูปสินค้าเป็นภาพอ้างอิงใต้กระดาน (วาดลอกตาม)", "Put a product photo under the board as a tracing reference")}><Icon value="i:photo" className="text-[14px]" />{t("รูปอ้างอิง", "Reference")}</button>}
          {!readonly && <>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" onClick={undo} disabled={!hist.current.length} title={t("ย้อนกลับ (Ctrl+Z)", "Undo (Ctrl+Z)")} className={`${btnCls(false)} disabled:opacity-40`}><Icon value="i:arrow-back-up" className="text-[14px]" />{t("ย้อน", "Undo")}</button>
          <button type="button" onClick={redo} disabled={!fut.current.length} title={t("ทำซ้ำ (Ctrl+Shift+Z / Ctrl+Y)", "Redo (Ctrl+Shift+Z / Ctrl+Y)")} className={`${btnCls(false)} disabled:opacity-40`}><Icon value="i:arrow-forward-up" className="text-[14px]" />{t("ทำซ้ำ", "Redo")}</button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" onClick={() => fileRef.current?.click()} className={btnCls(false)} title={t("นำเข้าไฟล์ .svg (หรือก๊อปจาก Illustrator แล้วกด Ctrl+V)", "Import an .svg file (or copy in Illustrator and press Ctrl+V)")}>
            <Icon value="i:file-import" className="text-[14px]" />{t("ไฟล์ SVG", "SVG file")}
          </button>
          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </>}
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
            <button key={s} type="button" onClick={() => setSnap(s)} className={`h-7 rounded-md border px-2 text-xs ${snap === s ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {s === 0 ? t("ไม่ดูด", "Off") : `${s} ${t("ซม.", "cm")}`}
            </button>
          ))}
          <span className="ml-3 inline-flex items-center gap-1.5" title={t("ความทึบของพื้นชิ้น — จางลงเพื่อเห็นรูปอ้างอิงด้านล่าง (เส้นขอบยังชัด)", "Piece fill opacity — fade to see the reference below (outlines stay sharp)")}>
            {t("ชิ้นทึบ", "Piece fill")}
            <input type="range" min={5} max={100} step={5} value={Math.round(pieceFade * 100)} onChange={(e) => setPieceFade(Number(e.target.value) / 100)} className="w-20" aria-label={t("ความทึบของชิ้น", "Piece opacity")} />
            <span className="w-8 tabular-nums">{Math.round(pieceFade * 100)}%</span>
          </span>
          <span className="ml-auto font-mono tabular-nums text-slate-500">{hover ? `x ${r2s(hover.x)} · y ${r2s(hover.y)} ${t("ซม.", "cm")}` : "x — · y —"}</span>
        </div>
        {tool === "measure" && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1.5 text-xs text-violet-800">
            <Icon value="i:ruler-measure" className="text-[14px]" />{t("ไม้บรรทัด", "Measure")}
            {([["line", t("วัดตรง", "Straight")], ["curve", t("วัดโค้ง", "Curve")], ["edge", t("ตามขอบชิ้น", "Along edge")]] as [MeasureMode, string][]).map(([m, l]) => (
              <button key={m} type="button" onClick={() => { setMeasureMode(m); setMDraft(null); }} className={`h-7 rounded-md border px-2 ${measureMode === m ? "border-violet-400 bg-white font-medium text-violet-700" : "border-transparent text-violet-700 hover:bg-white/60"}`}>{l}</button>
            ))}
            <span className="text-violet-600">{measureMode === "line" ? t("กดลากจากจุดหนึ่งไปอีกจุด (Shift = 45°)", "Drag from one point to another (Shift = 45°)") : measureMode === "curve" ? t("คลิกวางจุดตามแนว · กดลาก = โค้ง · ดับเบิลคลิก/Enter = จบ", "Click points along the line · drag = curve · double-click/Enter = finish") : t("คลิกบนชิ้นที่จุดเริ่ม แล้วคลิกจุดปลาย — วัดตามเส้นเย็บ", "Click a piece at the start, then the end — measured along the sewing line")}</span>
            {measures.length > 0 && <button type="button" onClick={() => setMeasures([])} className="ml-auto h-7 rounded-md px-2 text-violet-700 hover:bg-white/60">{t(`ล้างการวัด (${measures.length})`, `Clear (${measures.length})`)}</button>}
          </div>
        )}
        {refPickOpen && refPicker && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-600"><b className="font-medium">{t("เลือกรูปสินค้าเป็นภาพอ้างอิง", "Pick a product photo as a reference")}</b><button type="button" onClick={() => setRefPickOpen(false)} className="ml-auto text-slate-400 hover:text-slate-600">✕</button></div>
            {refPicker(addRef)}
          </div>
        )}
        {refs.length > 0 && activeRefObj && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600">
            <Icon value="i:photo" className="text-[14px]" />
            {refs.map((r, i) => <button key={r.id} type="button" onClick={() => setActiveRef(r.id)} className={`h-7 max-w-[10rem] truncate rounded-md border px-2 ${r.id === activeRefObj.id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white"}`}>{r.label || t(`รูป ${i + 1}`, `Image ${i + 1}`)}</button>)}
            <span className="text-slate-400">{t("จาง", "Fade")}</span>
            <input type="range" min={10} max={100} step={5} value={Math.round(activeRefObj.op * 100)} onChange={(e) => patchRef(activeRefObj.id, { op: Number(e.target.value) / 100 })} className="w-24" aria-label={t("ความจางของรูป", "Image opacity")} />
            <label className="flex items-center gap-1"><input type="checkbox" checked={activeRefObj.lock} onChange={(e) => patchRef(activeRefObj.id, { lock: e.target.checked })} className="h-3.5 w-3.5" />{t("ล็อก", "Lock")}</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={activeRefObj.show} onChange={(e) => patchRef(activeRefObj.id, { show: e.target.checked })} className="h-3.5 w-3.5" />{t("แสดง", "Show")}</label>
            {!readonly && <button type="button" onClick={() => { setActiveRef(activeRefObj.id); patchRef(activeRefObj.id, { lock: true, show: true }); setCal({ cm: "30" }); }} className={btnCls(!!cal)}><Icon value="i:ruler-measure" className="text-[14px]" />{t("ตั้งขนาดจริง", "Set real size")}</button>}
            {!readonly && <button type="button" onClick={() => { setRefs((rs) => rs.filter((r) => r.id !== activeRefObj.id)); setActiveRef(null); }} className="h-7 rounded-md px-2 text-rose-600 hover:bg-rose-50">{t("เอารูปออก", "Remove")}</button>}
            <span className="text-slate-400">{t("กว้าง", "W")} {r1(activeRefObj.w)} {t("ซม.", "cm")}</span>
          </div>
        )}
        {cal && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>{!cal.a ? t("ตั้งขนาดจริง: คลิกจุดที่ 1 บนรูป (เช่น มุมซ้ายของตัวกระเป๋า)", "Set real size: click point 1 on the image (e.g. the bag's left corner)") : !cal.b ? t("คลิกจุดที่ 2 (เช่น มุมขวาของตัวกระเป๋า)", "Click point 2 (e.g. the bag's right corner)") : t(`ตอนนี้ห่าง ${r1(Math.hypot(cal.b.x - cal.a.x, cal.b.y - cal.a.y))} ซม. — ของจริงยาว`, `Now ${r1(Math.hypot(cal.b.x - cal.a.x, cal.b.y - cal.a.y))} cm apart — real length`)}</span>
            {cal.a && cal.b && <>
              <input type="number" step="0.1" min={0.1} value={cal.cm} onChange={(e) => setCal({ ...cal, cm: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") applyCal(); }} autoFocus aria-label={t("ระยะจริง ซม.", "Real length cm")} className="h-7 w-20 rounded border border-amber-300 bg-white px-1.5 text-right" />
              <span>{t("ซม.", "cm")}</span>
              <button type="button" onClick={applyCal} className="h-7 rounded-md bg-amber-600 px-2.5 text-white hover:bg-amber-700">{t("ตั้ง", "Set")}</button>
            </>}
            <button type="button" onClick={() => setCal(null)} className="ml-auto h-7 rounded-md px-2 hover:bg-amber-100">{t("ยกเลิก", "Cancel")}</button>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_290px]">   {/* แผงขวาอยู่ตลอด — เลือก/เลิกเลือกชิ้นแล้วพื้นที่วาดไม่ขยับ */}
          <div className="min-w-0 space-y-2">
            {/* ไม้บรรทัด + พื้นที่วาด */}
            <div className="grid select-none overflow-hidden rounded-lg border border-slate-200" style={{ gridTemplateColumns: "26px minmax(0,1fr)", gridTemplateRows: "22px auto" }}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}>
              <div className="flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-[9px] text-slate-400">{t("ซม.", "cm")}</div>
              <svg className="block w-full border-b border-slate-200 bg-slate-50" height={22} viewBox={`0 0 ${Math.max(1, size.cw)} 22`} preserveAspectRatio="none">
                {ticks(view.x, view.w, rs.minor).map((v) => { const px = (v - view.x) * ppc, M = isMajor(v, rs.major); return <g key={v}><line x1={px} x2={px} y1={M ? 9 : 15} y2={22} stroke="#94a3b8" strokeWidth={1} />{M && <text x={px + 2} y={9} fontSize={10} fill="#64748b">{r2s(v)}</text>}</g>; })}
                {hover && <line x1={(hover.x - view.x) * ppc} x2={(hover.x - view.x) * ppc} y1={0} y2={22} stroke="#ef4444" strokeWidth={1.5} />}
              </svg>
              <svg className="block border-r border-slate-200 bg-slate-50" width={26} height={Math.max(1, size.ch)} viewBox={`0 0 26 ${Math.max(1, size.ch)}`} preserveAspectRatio="none">
                {ticks(view.y, vh, rs.minor).map((v) => { const py = (v - view.y) * ppc, M = isMajor(v, rs.major); return <g key={v}><line y1={py} y2={py} x1={M ? 10 : 17} x2={26} stroke="#94a3b8" strokeWidth={1} />{M && <text x={2} y={py + 10} fontSize={10} fill="#64748b">{r2s(v)}</text>}</g>; })}
                {hover && <line y1={(hover.y - view.y) * ppc} y2={(hover.y - view.y) * ppc} x1={0} x2={26} stroke="#ef4444" strokeWidth={1.5} />}
              </svg>
              <svg ref={bindSvg} className="block h-[min(52vh,480px)] min-h-[300px] w-full bg-white" style={{ cursor, touchAction: "none" }}
                viewBox={`${view.x} ${view.y} ${view.w} ${Math.max(0.001, vh)}`} preserveAspectRatio="none"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                onPointerLeave={() => setHover(null)} onDoubleClick={onDoubleClick}>
                {refs.filter((r) => r.show).map((r) => (
                  <image key={r.id} href={r.url} x={r.x} y={r.y} width={r.w} height={r.w * r.ar} opacity={r.op} preserveAspectRatio="none"
                    data-ref={r.lock || readonly ? undefined : r.id} style={{ pointerEvents: r.lock || readonly || cal ? "none" : "auto", cursor: "move" }} />
                ))}
                {ticks(view.x, view.w, gridStep).map((x) => <line key={`gx${x}`} x1={x} x2={x} y1={view.y} y2={view.y + vh} stroke={isMajor(x, rs.major) ? COLORS.gridMajor : COLORS.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                {ticks(view.y, vh, gridStep).map((y) => <line key={`gy${y}`} y1={y} y2={y} x1={view.x} x2={view.x + view.w} stroke={isMajor(y, rs.major) ? COLORS.gridMajor : COLORS.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                {rows.map(({ p, i, g }) => {
                  const on = p.id === sel, b = g.finished, cb = g.cutBox;
                  const cutD = p.allow > 0 ? polyD(g.cut) + g.holesCut.map((h) => polyD(h)).join("") : shapePathD(p.shape) + p.holes.map((h) => shapePathD(h)).join("");
                  return (
                    <g key={p.id}>
                      <path d={cutD} fillRule="evenodd" data-piece={p.id} fill={COLORS.fill} fillOpacity={on ? Math.min(1, pieceFade + 0.15) : pieceFade} stroke={on ? COLORS.sel : COLORS.stroke} strokeWidth={on ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" style={{ cursor: editId === p.id ? "copy" : "move" }} />
                      {p.allow > 0 && <path d={shapePathD(p.shape) + p.holes.map((h) => shapePathD(h)).join("")} fill="none" stroke={COLORS.stroke} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
                      <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={COLORS.text} style={{ pointerEvents: "none" }}>P{i + 1}{p.name ? ` ${p.name}` : ""}{p.count > 1 ? ` ×${p.count}` : ""}</text>
                      {on && editId !== p.id && <>
                        <rect x={cb.x} y={cb.y} width={cb.w} height={cb.h} fill="none" stroke={COLORS.sel} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                        <text x={cb.x + cb.w / 2} y={cb.y + cb.h + fs * 1.1} fontSize={fs * 0.9} textAnchor="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{p.allow > 0 ? t("ตัด ", "cut ") : ""}{r1(cb.w)} {t("ซม.", "cm")}</text>
                        <text x={cb.x + cb.w + fs * 0.6} y={cb.y + cb.h / 2} fontSize={fs * 0.9} dominantBaseline="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{r1(cb.h)} {t("ซม.", "cm")}</text>
                        {!readonly && tool !== "measure" && !pen && (() => {
                          const hs = fs * 0.22, cx = cb.x + cb.w / 2, ry = cb.y - fs * 1.8;
                          return <g>
                            <line x1={cx} y1={cb.y} x2={cx} y2={ry} stroke={COLORS.sel} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                            <circle cx={cx} cy={ry} r={hs * 1.3} data-rot={p.id} fill="#fff" stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: "grab" }}><title>{t("ลากเพื่อหมุน (Shift = ทีละ 15°)", "Drag to rotate (Shift = 15° steps)")}</title></circle>
                            {rotDeg != null && <text x={cx + hs * 2} y={ry} fontSize={fs * 0.9} dominantBaseline="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{rotDeg}°</text>}
                            {RS_DIRS.map((dir) => {
                              const hx = dir.includes("w") ? cb.x : dir.includes("e") ? cb.x + cb.w : cx;
                              const hy = dir.includes("n") ? cb.y : dir.includes("s") ? cb.y + cb.h : cb.y + cb.h / 2;
                              return <rect key={dir} x={hx - hs} y={hy - hs} width={hs * 2} height={hs * 2} data-rs={dir} fill="#fff" stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: RS_CURSOR[dir] }} />;
                            })}
                          </g>;
                        })()}
                      </>}
                    </g>
                  );
                })}
                {/* แก้จุด: จุด + หูจับของจุดที่เลือก */}
                {editPiece && editPiece.shape.k === "path" && (() => {
                  const N = editPiece.shape.nodes, sn = N[selNode];
                  const hr = fs * 0.22;
                  return <g>
                    {sn && hasH(sn, "i") && <><line x1={sn.x} y1={sn.y} x2={sn.x + (sn.ix ?? 0)} y2={sn.y + (sn.iy ?? 0)} stroke={COLORS.node} strokeWidth={1} vectorEffect="non-scaling-stroke" /><circle cx={sn.x + (sn.ix ?? 0)} cy={sn.y + (sn.iy ?? 0)} r={hr} data-handle="i" fill="#fff" stroke={COLORS.node} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} /></>}
                    {sn && hasH(sn, "o") && <><line x1={sn.x} y1={sn.y} x2={sn.x + (sn.ox ?? 0)} y2={sn.y + (sn.oy ?? 0)} stroke={COLORS.node} strokeWidth={1} vectorEffect="non-scaling-stroke" /><circle cx={sn.x + (sn.ox ?? 0)} cy={sn.y + (sn.oy ?? 0)} r={hr} data-handle="o" fill="#fff" stroke={COLORS.node} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} /></>}
                    {N.map((n, i) => <rect key={i} x={n.x - fs * 0.22} y={n.y - fs * 0.22} width={fs * 0.44} height={fs * 0.44} data-node={i} fill={i === selNode ? COLORS.node : "#fff"} stroke={COLORS.node} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} />)}
                  </g>;
                })()}
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
                {refs.filter((r) => r.show && !r.lock && !readonly && !cal).map((r) => (
                  <g key={`rf${r.id}`}>
                    <rect x={r.x} y={r.y} width={r.w} height={r.w * r.ar} fill="none" stroke={COLORS.sel} strokeDasharray="5 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                    <rect x={r.x + r.w - fs * 0.35} y={r.y + r.w * r.ar - fs * 0.35} width={fs * 0.7} height={fs * 0.7} fill={COLORS.sel} data-refsize={r.id} style={{ cursor: "nwse-resize" }} />
                  </g>
                ))}
                {/* การวัด */}
                {[...measures, ...(mDraft?.kind === "line" ? [{ id: "draft", kind: "line" as const, nodes: [{ x: mDraft.a.x, y: mDraft.a.y }, { x: mDraft.b.x, y: mDraft.b.y }], len: Math.hypot(mDraft.b.x - mDraft.a.x, mDraft.b.y - mDraft.a.y) }] : [])].map((m) => {
                  const P: Pt[] = m.kind === "edge" ? m.path ?? [] : flattenOpen(m.nodes);
                  if (P.length < 2) return null;
                  const mid = P[Math.floor(P.length / 2)];
                  const label = m.kind === "edge" ? t(`ตามขอบ ${fmtLen(m.len)}`, `along edge ${fmtLen(m.len)}`) : fmtLen(m.len);
                  return (
                    <g key={m.id} style={{ pointerEvents: "none" }}>
                      <polyline points={P.map((q) => q.join(",")).join(" ")} fill="none" stroke={MEASURE_COLOR} strokeWidth={m.kind === "edge" ? 3 : 1.5} strokeOpacity={m.kind === "edge" ? 0.7 : 1} vectorEffect="non-scaling-stroke" />
                      {[P[0], P[P.length - 1]].map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={fs * 0.18} fill={MEASURE_COLOR} />)}
                      <text x={mid[0]} y={mid[1] - fs * 0.45} fontSize={fs * 0.85} textAnchor="middle" fill={MEASURE_COLOR} stroke="#fff" strokeWidth={fs * 0.12} paintOrder="stroke">{label}</text>
                    </g>
                  );
                })}
                {mDraft?.kind === "curve" && (() => {
                  const nodes = mDraft.hover ? [...mDraft.nodes, { x: mDraft.hover.x, y: mDraft.hover.y }] : mDraft.nodes;
                  const P = flattenOpen(nodes);
                  const last = P[P.length - 1];
                  return <g style={{ pointerEvents: "none" }}>
                    <polyline points={P.map((q) => q.join(",")).join(" ")} fill="none" stroke={MEASURE_COLOR} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                    {mDraft.nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={fs * 0.2} fill={MEASURE_COLOR} />)}
                    {last && <text x={last[0] + fs * 0.4} y={last[1] - fs * 0.4} fontSize={fs * 0.85} fill={MEASURE_COLOR} stroke="#fff" strokeWidth={fs * 0.12} paintOrder="stroke">{fmtLen(openPathLength(nodes))}</text>}
                  </g>;
                })()}
                {mDraft?.kind === "edge" && (() => {
                  const g = geo.get(mDraft.pieceId);
                  const r = g && mDraft.hover ? outlineDistance(g.sew, mDraft.a, [mDraft.hover.x, mDraft.hover.y]) : null;
                  return <g style={{ pointerEvents: "none" }}>
                    {r && <polyline points={r.path.map((q) => q.join(",")).join(" ")} fill="none" stroke={MEASURE_COLOR} strokeWidth={3} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />}
                    <circle cx={mDraft.a[0]} cy={mDraft.a[1]} r={fs * 0.25} fill={MEASURE_COLOR} />
                    {r && mDraft.hover && <text x={mDraft.hover.x + fs * 0.4} y={mDraft.hover.y - fs * 0.4} fontSize={fs * 0.85} fill={MEASURE_COLOR} stroke="#fff" strokeWidth={fs * 0.12} paintOrder="stroke">{fmtLen(r.short)}</text>}
                  </g>;
                })()}
                {cal?.a && (() => {
                  const b = cal.b ?? cal.m;
                  return <g style={{ pointerEvents: "none" }}>
                    <circle cx={cal.a.x} cy={cal.a.y} r={fs * 0.25} fill="#dc2626" />
                    {b && <><line x1={cal.a.x} y1={cal.a.y} x2={b.x} y2={b.y} stroke="#dc2626" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /><circle cx={b.x} cy={b.y} r={fs * 0.25} fill="#dc2626" /></>}
                  </g>;
                })()}
              </svg>
            </div>
            <div className="text-xs text-slate-500">{hint}</div>
            {msg && <div className={`rounded-lg px-3 py-2 text-xs ${msg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
          </div>

          {/* แผงรายละเอียดชิ้น */}
          {!(selPiece && selGeo) && (
            <aside className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500" aria-label={t("รายละเอียดชิ้น", "Piece details")}>
              <div className="mb-2 text-sm font-semibold text-slate-600">{t("รายละเอียดชิ้น", "Piece details")}</div>
              <p>{t("กดชิ้นที่วาดแล้ว เพื่อตั้งชื่อ ใส่วัสดุ (หนัง ซับใน …) เผื่อพับ ขนาด จำนวน เจาะรู พับครึ่ง กลับด้าน แก้จุด", "Click a piece to set its name, materials (leather, lining…), allowance, size, count, holes, fold, flip and points")}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-slate-400">
                <li>{t("Ctrl+Z ย้อนกลับ · Ctrl+Shift+Z / Ctrl+Y ทำซ้ำ", "Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo")}</li>
                <li>{t("R สี่เหลี่ยม · O วงกลม · P ปากกา · V ย้าย · H เลื่อนดู", "R rect · O circle · P pen · V move · H pan")}</li>
                <li>{t("ลูกศร = ขยับชิ้น (Shift ×10) · Delete = ลบ", "Arrows = nudge (Shift ×10) · Delete = remove")}</li>
                <li>{t("M ไม้บรรทัด: วัดตรง · วัดโค้ง · ตามขอบชิ้น", "M measure: straight · curve · along edge")}</li>
              </ul>
              {measures.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <div className="mb-1 flex items-center font-medium text-slate-600">{t("การวัด", "Measurements")}<button type="button" onClick={() => setMeasures([])} className="ml-auto text-[11px] text-slate-400 hover:text-rose-600">{t("ล้าง", "Clear")}</button></div>
                  <ul className="space-y-0.5">
                    {measures.map((m, i) => (
                      <li key={m.id} className="flex items-center gap-1.5">
                        <span className="text-violet-700">{i + 1}. {m.kind === "line" ? t("ตรง", "Straight") : m.kind === "curve" ? t("โค้ง", "Curve") : t("ตามขอบ", "Edge")}</span>
                        <b className="tabular-nums text-slate-700">{fmtLen(m.len)}</b>
                        {m.kind === "edge" && <span className="text-slate-400">{t(`(อีกทาง ${fmtLen(m.alt ?? 0)})`, `(other ${fmtLen(m.alt ?? 0)})`)}</span>}
                        <button type="button" onClick={() => setMeasures((ms) => ms.filter((x) => x.id !== m.id))} className="ml-auto text-slate-300 hover:text-rose-600" aria-label={t("ลบการวัดนี้", "Remove measurement")}>✕</button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[11px] text-slate-400">{t("การวัดไว้ดูชั่วคราว ไม่ได้บันทึก", "Measurements are temporary (not saved)")}</div>
                </div>
              )}
            </aside>
          )}
          {selPiece && selGeo && (
            <aside className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs" aria-label={t("รายละเอียดชิ้น", "Piece details")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">P{selIdx + 1}</span>
                <input value={selPiece.name} onChange={(e) => patchPiece(selPiece.id, (p) => ({ ...p, name: e.target.value.slice(0, 60) }), `name-${selPiece.id}`)}
                  placeholder={t("ชื่อชิ้น เช่น ตัวหน้า", "Piece name, e.g. Front")} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm" />
                <button type="button" onClick={() => { setSel(null); setEditId(null); }} aria-label={t("ปิดแผง", "Close panel")} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100">✕</button>
              </div>

              <div>
                <div className="mb-1 font-medium text-slate-600">{t("วัสดุ", "Materials")} <span className="font-normal text-slate-400">{t("· 1 วัสดุ = 1 บรรทัดในตีราคา", "· 1 material = 1 costing line")}</span></div>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {selPiece.mats.length ? selPiece.mats.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                      {m.name}
                      <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, mats: p.mats.filter((x) => x.id !== m.id) }))} aria-label={t(`เอา ${m.name} ออก`, `Remove ${m.name}`)} className="text-blue-400 hover:text-rose-600">✕</button>
                    </span>
                  )) : <span className="text-amber-600">{t("ยังไม่เลือกวัสดุ", "No material yet")}</span>}
                </div>
                {materials.length > 0
                  ? <SearchableSelect value="" options={matOptions} placeholder={t("＋ เพิ่มวัสดุ (เช่น หนัง, ซับใน)", "＋ Add material (e.g. leather, lining)")}
                      onChange={(v) => { const m = materials.find((x) => x.id === v); if (m) patchPiece(selPiece.id, (p) => ({ ...p, mats: [...p.mats, { id: m.id, name: m.name }] })); }} />
                  : <div className="text-slate-400">{t("เลือกวัสดุในตารางตีราคาทีหลังได้", "Pick materials in the costing table later")}</div>}
              </div>

              <div>
                <div className="mb-1 font-medium text-slate-600">{t("เผื่อพับ / เผื่อเย็บ (ซม.)", "Fold / seam allowance (cm)")}</div>
                <div className="flex flex-wrap items-center gap-1">
                  {ALLOW_STEPS.map((a) => <button key={a} type="button" onClick={() => setAllow(a)} className={`h-7 rounded-md border px-2 ${selPiece.allow === a ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{a}</button>)}
                  <NumField value={selPiece.allow} min={0} max={20} label={t("เผื่อพับ ซม.", "Allowance cm")} onCommit={setAllow} className="w-16" />
                </div>
                <div className="mt-1 text-slate-400">{t("เส้นประ = แนวเย็บ · เส้นทึบ = แนวตัด (รวมเผื่อ) · รูเจาะหดเข้าตามเผื่อ", "Dashed = sewing line · solid = cutting line · holes shrink by the allowance")}</div>
              </div>

              <div>
                <div className="mb-1 font-medium text-slate-600">{t("ขนาดสำเร็จ (เส้นประ)", "Finished size (dashed)")}</div>
                <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-2 gap-y-1.5 text-slate-500">
                  <span>{t("กว้าง", "W")}</span><NumField value={selGeo.finished.w} min={0.1} label={t("กว้าง ซม.", "Width cm")} onCommit={(v) => setSelBox({ w: v }, `w-${selPiece.id}`)} className="w-16" />
                  <span>{t("สูง", "H")}</span><NumField value={selGeo.finished.h} min={0.1} label={t("สูง ซม.", "Height cm")} onCommit={(v) => setSelBox({ h: v }, `h-${selPiece.id}`)} className="w-16" />
                  <span>X</span><NumField value={selGeo.finished.x} label="X" onCommit={(v) => setSelBox({ x: v }, `x-${selPiece.id}`)} className="w-16" />
                  <span>Y</span><NumField value={selGeo.finished.y} label="Y" onCommit={(v) => setSelBox({ y: v }, `y-${selPiece.id}`)} className="w-16" />
                </div>
                <label className="mt-1.5 flex items-center gap-1.5 text-slate-500"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="h-3.5 w-3.5" />{t("ล็อกสัดส่วน (ใช้กับจุดจับมุมด้วย)", "Lock ratio (corner handles too)")}</label>
                {/* Transform: หมุน/ย่อขยายด้วยตัวเลข (บนกระดาน = ลากจุดจับรอบชิ้น · จุดกลมด้านบน = หมุน) */}
                <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                  <div className="mb-1 font-medium text-slate-600">{t("Transform", "Transform")}</div>
                  <div className="flex flex-wrap items-center gap-1 text-slate-500">
                    <span className="w-14">{t("หมุน", "Rotate")}</span>
                    <input type="number" step={1} value={rotIn} onChange={(e) => setRotIn(e.target.value)} aria-label={t("องศาที่จะหมุน", "Rotate degrees")} className="h-7 w-14 rounded border border-slate-200 px-1 text-right" />°
                    <button type="button" onClick={() => applyRotate(-1)} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("หมุนทวนเข็ม", "Counter-clockwise")}>⟲</button>
                    <button type="button" onClick={() => applyRotate(1)} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("หมุนตามเข็ม", "Clockwise")}>⟳</button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-slate-500">
                    <span className="w-14">{t("ย่อ/ขยาย", "Scale")}</span>
                    <input type="number" step={1} min={1} value={scaleIn} onChange={(e) => setScaleIn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyScale(); }} aria-label={t("ย่อขยายกี่ %", "Scale %")} className="h-7 w-14 rounded border border-slate-200 px-1 text-right" />%
                    <button type="button" onClick={applyScale} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50">{t("ใช้", "Apply")}</button>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">{t("บนกระดาน: ลากจุดจับ 8 จุด = ย่อขยาย (Shift = คงสัดส่วน) · ลากจุดกลมด้านบน = หมุน (Shift = ทีละ 15°)", "On the board: drag the 8 handles to resize (Shift = keep ratio) · drag the top circle to rotate (Shift = 15° steps)")}</div>
                </div>
                <div className="mt-1.5 rounded-md bg-white px-2 py-1.5 text-slate-600">
                  {t("ขนาดตัด", "Cut size")} <b className="tabular-nums">{r1(selGeo.cutBox.w)} × {r1(selGeo.cutBox.h)}</b> {t("ซม.", "cm")}
                  <span className="text-slate-400"> · {t("พื้นที่ตัด", "cut area")} {Math.round(selGeo.cutArea).toLocaleString("th-TH")} {t("ตร.ซม.", "cm²")} · {t("รอบรูป", "perimeter")} {r1(selGeo.perimeter)} {t("ซม.", "cm")}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-600">{t("จำนวนชิ้น", "Count")}
                <NumField value={selPiece.count} min={1} step={1} label={t("จำนวนชิ้น", "Piece count")} onCommit={(v) => patchPiece(selPiece.id, (p) => ({ ...p, count: Math.max(1, Math.round(v)) }), `count-${selPiece.id}`)} className="w-16" />
              </label>

              <div>
                <div className="mb-1 font-medium text-slate-600">{t("เครื่องมือ", "Tools")}</div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => startEdit(selPiece)} className={btnCls(editId === selPiece.id)}>{editId === selPiece.id ? t("เสร็จแก้จุด", "Done editing") : selPiece.shape.k === "path" ? t("แก้จุด", "Edit points") : t("แปลงเป็นจุด + แก้", "Convert + edit")}</button>
                  <button type="button" onClick={() => doFold(selPiece, "x")} className={btnCls(false)} title={t("วาดครึ่งซ้าย แล้วต่อสมมาตรด้านขวา (ต้องมีเส้นตรงแนบขอบขวา)", "Draw the left half, then mirror to the right (needs a straight right edge)")}>{t("พับครึ่ง →", "Fold →")}</button>
                  <button type="button" onClick={() => doFold(selPiece, "y")} className={btnCls(false)} title={t("วาดครึ่งบน แล้วต่อสมมาตรด้านล่าง", "Draw the top half, then mirror downward")}>{t("พับครึ่ง ↓", "Fold ↓")}</button>
                  <button type="button" onClick={() => patchPiece(selPiece.id, (p) => flipPiece(p, "x"))} className={btnCls(false)}>{t("กลับด้าน ↔", "Flip ↔")}</button>
                  <button type="button" onClick={() => patchPiece(selPiece.id, (p) => flipPiece(p, "y"))} className={btnCls(false)}>{t("กลับด้าน ↕", "Flip ↕")}</button>
                  <button type="button" onClick={() => patchPiece(selPiece.id, (p) => rotatePiece(p, -90))} className={btnCls(false)} title={t("หมุนทวนเข็ม 90°", "Rotate 90° counter-clockwise")}>{t("หมุน ⟲ 90°", "Rotate ⟲ 90°")}</button>
                  <button type="button" onClick={() => patchPiece(selPiece.id, (p) => rotatePiece(p, 90))} className={btnCls(false)} title={t("หมุนตามเข็ม 90°", "Rotate 90° clockwise")}>{t("หมุน ⟳ 90°", "Rotate ⟳ 90°")}</button>
                  {selHost && <button type="button" onClick={() => makeHole(selPiece)} className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 hover:bg-amber-100">{t(`เจาะเป็นรูใน P${pieces.indexOf(selHost) + 1}`, `Make a hole in P${pieces.indexOf(selHost) + 1}`)}</button>}
                  <button type="button" onClick={() => { commit(piecesRef.current.filter((p) => p.id !== selPiece.id)); setSel(null); setEditId(null); }} className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50"><Icon value="i:trash" className="text-[13px]" />{t("ลบชิ้น", "Delete")}</button>
                </div>
                {selPiece.holes.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selPiece.holes.map((h, hi) => { const hb = shapeBox(h); return (
                      <div key={hi} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1">
                        <span className="text-slate-600">{t(`รู ${hi + 1}`, `Hole ${hi + 1}`)} · {r1(hb.w)}×{r1(hb.h)}</span>
                        <button type="button" onClick={() => holeToPiece(selPiece, hi)} className="ml-auto text-blue-600 hover:underline">{t("แยกเป็นชิ้น", "Make piece")}</button>
                        <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, holes: p.holes.filter((_, i) => i !== hi) }))} className="text-rose-600 hover:underline">{t("ลบรู", "Remove")}</button>
                      </div>
                    ); })}
                  </div>
                )}
                {!selHost && !selPiece.holes.length && <div className="mt-1 text-slate-400">{t("เจาะรู: วาดรูปทับในชิ้น แล้วกดรูปเล็กนั้น → ปุ่ม \"เจาะเป็นรูใน…\"", "Holes: draw a shape inside this piece, click it → \"Make a hole in…\"")}</div>}
              </div>
            </aside>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          {/* เพิ่มด้วยตัวเลข */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1.5 text-sm font-semibold text-slate-700">{t("เพิ่มด้วยตัวเลข", "Add by numbers")}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <select value={nk} onChange={(e) => setNk(e.target.value as "rect" | "ellipse")} className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-sm">
                <option value="rect">{t("สี่เหลี่ยม", "Rectangle")}</option><option value="ellipse">{t("วงกลม/วงรี", "Circle/ellipse")}</option>
              </select>
              <input type="number" step="0.1" min={0.1} value={nw} onChange={(e) => setNw(e.target.value)} aria-label={t("กว้าง ซม. (เพิ่มใหม่)", "New width cm")} className="h-8 w-16 rounded-md border border-slate-200 px-1.5 text-right text-sm" />
              <span className="text-slate-400">×</span>
              <input type="number" step="0.1" min={0.1} value={nh} onChange={(e) => setNh(e.target.value)} aria-label={t("สูง ซม. (เพิ่มใหม่)", "New height cm")} className="h-8 w-16 rounded-md border border-slate-200 px-1.5 text-right text-sm" />
              <span className="text-slate-400">{t("ซม.", "cm")}</span>
              <button type="button" onClick={addByNumber} className="h-8 rounded-md border border-blue-300 bg-white px-2.5 text-xs text-blue-700 hover:bg-blue-50">{t("＋ เพิ่ม", "＋ Add")}</button>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">{t(`ชิ้นใหม่ใช้เผื่อพับล่าสุด ${lastAllow} ซม.`, `New pieces use the last allowance ${lastAllow} cm`)}</div>
          </div>
          {/* ตารางชิ้น */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">{t("ระบบวัดให้", "Measured")}</div>
            {rows.length === 0 ? <div className="py-4 text-center text-xs text-slate-400">{t("ยังไม่มีชิ้น — วาด พิมพ์ขนาด หรือวางจาก Illustrator", "No pieces yet — draw, type a size, or paste from Illustrator")}</div> : (
              <table className="w-full table-fixed text-xs">
                <thead><tr className="text-[11px] text-slate-500">
                  <th className="w-[30%] py-1 text-left font-medium">{t("ชิ้น / วัสดุ", "Piece / materials")}</th>
                  <th className="py-1 text-right font-medium">{t("ขนาดตัด", "Cut size")}</th>
                  <th className="py-1 text-right font-medium">{t("พื้นที่ตัด", "Cut area")}</th>
                  <th className="py-1 text-right font-medium">{t("เผื่อพับ", "Allow.")}</th>
                  <th className="w-14 py-1 text-right font-medium">{t("จำนวน", "Qty")}</th>
                </tr></thead>
                <tbody>
                  {rows.map(({ p, i, g }) => (
                    <tr key={p.id} onClick={() => setSel(p.id)} className={`cursor-pointer border-t border-slate-100 ${p.id === sel ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                      <td className="truncate py-1.5"><b className="font-medium text-slate-700">P{i + 1}</b>{p.name ? ` ${p.name}` : ""}<span className={p.mats.length ? "text-slate-400" : "text-amber-600"}> · {p.mats.length ? p.mats.map((m) => m.name).join(", ") : t("ยังไม่เลือกวัสดุ", "no material")}</span></td>
                      <td className="py-1.5 text-right tabular-nums">{r1(g.cutBox.w)}×{r1(g.cutBox.h)}</td>
                      <td className="py-1.5 text-right tabular-nums">{Math.round(g.cutArea).toLocaleString("th-TH")}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{p.allow}{p.holes.length ? t(` · ${p.holes.length} รู`, ` · ${p.holes.length} holes`) : ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-2 text-[11px] text-slate-400">{t("หน่วย: ซม. / ตร.ซม. · ขนาดตัด = รวมเผื่อพับ (ลงตารางตีราคาเป็นกว้าง×ยาว)", "Units: cm / cm² · cut size includes the allowance (goes to the costing table as width×length)")}</div>
          </div>
        </div>
      </div>
  );
  if (embedded) return (
    <div ref={rootRef} className="space-y-3">
      {bodyEl}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">{footerEl}</div>
    </div>
  );
  return (
    <ERPModal open={open} onClose={() => onClose?.()} size="xl" hasUnsavedChanges={dirty}
      title={title ?? t("วาดชิ้นวัสดุ", "Draw material pieces")}
      description={t("ขนาดจริงหน่วย ซม. · กดชิ้นเพื่อใส่วัสดุ เผื่อพับ เจาะรู พับครึ่ง แก้จุด · Ctrl+Z ย้อนกลับ", "Real size in cm · click a piece for materials, allowance, holes, fold, points · Ctrl+Z to undo")}
      footer={footerEl}>
      <div ref={rootRef}>{bodyEl}</div>
    </ERPModal>
  );
}
