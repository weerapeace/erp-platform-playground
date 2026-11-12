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
 *     เครื่องมือ vector: เลือกหลายชิ้น (Shift+คลิก · Shift+ลากกรอบ · Ctrl+A) · Ctrl+C / Ctrl+V / Ctrl+D (ก๊อปเป็น SVG ไปวางใน Illustrator ได้)
 *       เส้นช่วยจัดแนว (ลากชิ้นแล้วดูดขอบ/กึ่งกลางชิ้นอื่น) · จัดแนว/เว้นระยะเท่ากัน · ลบมุมโค้ง · สำเนากลับด้าน · เส้นขนาน · เส้นทางผ้า · รอยบาก
 *     ชิ้นที่เลือก: จุดจับ 8 จุดลากย่อขยาย (Shift/ล็อกสัดส่วน = คงสัดส่วน) · จุดจับหมุน (Shift = ทีละ 15°) · หมุน 90° · ความทึบชิ้น (เห็นรูปอ้างอิงด้านล่าง)
 *   คีย์ลัด: R สี่เหลี่ยม · O วงกลม · P ปากกา · V ย้าย · H มือ · Space ค้าง = เลื่อน · ลูกศร = ขยับ (Shift ×10)
 *            Shift ระหว่างวาด = จัตุรัส/วงกลม/เส้น 45° · Enter = ปิดรูปปากกา · Esc = ยกเลิก · Delete = ลบชิ้น/จุด
 *
 *   <ShapeEditor open onClose initial={[{ shape, holes, count, allow, name, mats }]} materials={[{ id, name }]} onSave={(r) => …} />
 * สูตร: lib/pattern-shape · ใช้ที่: แท็บตีราคา ใบงานออกแบบ (components/design-sheet-detail) · คู่มือ docs/pattern-sheet.md
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SearchableSelect } from "@/components/searchable-select";
import {
  SNAP_STEPS, cleanAllow, defaultGrain, cleanFoldEdges, edgeAllowances, foldSegments, flattenShape, outlineLength, outlineStep, outlineWalk, fitPiece, flattenOpen, flipPiece, foldPiece, midEdgeNotches, movePiece, nearestSegment, notchSegments, offsetShape, openPathLength, parseSvgShapes, pieceGeometry, polyD, projectOnOutline, rotatePiece, roundCorners,
  shapeBox, shapeInside, shapePathD, snapTo, splitSegment, toPathShape, toggleSmooth, pointInPolygon, INNER_KINDS, HW_KINDS, hwKind, hwLine, hwSpot, innerOffset, placeInner, setInnerLength,
  type Box, type HwKind, type InnerKind, type InnerLine, type PNode, type PieceGeometry, type Pt, type RefImage, type Shape, type ShapeBasis,
} from "@/lib/pattern-shape";
import { booleanPieces, type BoolOp } from "@/lib/pattern-boolean";
import { SEAM_KINDS, SEAM_MIN_LEN, SEAM_TOP_DEFAULT, checkSeam, cleanEdgeMeta, edgeBusy, edgeMetaSet, extendSide, finishPts, finishRange, withFinishRange, isInnerSide, isPartialSide, pieceEdges, pointAlong, posOnLine, rangeFree, rangedSide, seamLabel, setEdgeLength, sideHasEdge, sideLength, sidePoints, sideRange, subLine, type EdgeMeta, type Seam, type SeamKind, type SeamSide } from "@/lib/pattern-seams";
import { BOND_KINDS, MAT_PRESETS, PIECE_ROLES, cleanPieceInfo, type BondKind, type MatProps, type PieceInfo, type PieceRole } from "@/lib/pattern-project";
import { ColorInput } from "@/components/color-picker";
import { applyLinks, followerSeams, linkTargets, linkedShape, type PieceLink } from "@/lib/pattern-link";
import { formatLength, parseLength, unitLabel, type LengthUnit } from "@/lib/length-units";
import { edgePlan, migrateSeams, remapEdgeMeta, remapEdgeValues, type EdgePlan } from "@/lib/pattern-edge-map";
export type { RefImage };

export type PieceMat = { id: string; name: string };
/** pid = รหัสชิ้น (ผูกบรรทัดตีราคา) · at = ตำแหน่งบนกระดาน (มุมซ้ายบนเส้นเย็บ) · src = บรรทัดเดิมที่ชิ้นนี้มาจาก */
export type EditorPiece = { shape: Shape; holes?: Shape[]; count: number; allow?: number; allowEdges?: number[] | null; foldEdges?: number[] | null; edgeMeta?: EdgeMeta[] | null; info?: PieceInfo | null; name?: string; mats?: PieceMat[]; pid?: string; at?: [number, number]; src?: string[]; grain?: Pt[] | null; notches?: Pt[]; inner?: InnerLine[] | null; link?: PieceLink | null };
export type ResultPiece = { shape: Shape; holes: Shape[]; count: number; allow: number; allowEdges: number[] | null; foldEdges: number[] | null; edgeMeta: EdgeMeta[] | null; info: PieceInfo | null; name: string; mats: PieceMat[]; geo: PieceGeometry; pid: string; at: [number, number]; src: string[]; grain: Pt[] | null; notches: Pt[]; inner: InnerLine[]; link: PieceLink | null };
export type ShapeEditorResult = { pieces: ResultPiece[]; basis: ShapeBasis; refs: RefImage[] };

type Piece = { id: string; shape: Shape; holes: Shape[]; count: number; allow: number; allowEdges?: number[] | null; foldEdges?: number[] | null; edgeMeta?: EdgeMeta[] | null; info?: PieceInfo | null; name: string; mats: PieceMat[]; pid: string; src: string[]; grain?: Pt[] | null; notches?: Pt[]; inner?: InnerLine[] | null; link?: PieceLink | null };
export type Tool = "rect" | "ellipse" | "pen" | "move" | "hand" | "measure" | "sew" | "sewpart" | "sewmany" | "sewedit" | "inner";
/** สีของเส้นในชิ้นตามชนิด (กระดาน) */
const INNER_STYLE: Record<InnerKind, { col: string; dash?: string; w: number }> = { sew: { col: "#2563eb", dash: "6 4", w: 2.5 }, slit: { col: "#c2410c", w: 5 }, fold: { col: "#7c3aed", dash: "10 3 2 3", w: 2 }, mark: { col: "#64748b", dash: "2 4", w: 2 }, hw: { col: "#a16207", w: 2 } };
export const SEAM_COLORS = ["#c2410c", "#2563eb", "#059669", "#7c3aed", "#db2777", "#0891b2", "#ca8a04", "#4b5563"];
type MeasureMode = "line" | "curve" | "edge";
type Measure = { id: string; kind: MeasureMode; nodes: PNode[]; len: number; alt?: number; path?: Pt[] };
type MDraft = { kind: "line"; a: XY; b: XY } | { kind: "curve"; nodes: PNode[]; hover: XY | null } | { kind: "edge"; pieceId: string; a: Pt; hover: XY | null; pos: number; travel: number; last: number };
type Ref = RefImage & { id: string; lock: boolean; show: boolean };
type DrawTool = "rect" | "ellipse" | "pen";
type View = { x: number; y: number; w: number };
type XY = { x: number; y: number };
type PenDraft = { nodes: PNode[]; hover: XY | null };
type BoxDraft = { k: "rect" | "ellipse"; a: XY; b: XY };
type Drag =
  | { k: "pan"; sx: number; sy: number; v: View }
  | { k: "move"; ids: string[]; start: XY; orig: Piece[]; before: Piece[]; moved: boolean }
  | { k: "marquee"; a: XY; add: boolean }
  | { k: "box" }
  | { k: "penHandle"; idx: number; origin: XY }
  | { k: "node"; idx: number; before: Piece[]; moved: boolean }
  | { k: "handle"; idx: number; which: "i" | "o"; before: Piece[]; moved: boolean; alt: boolean }
  | { k: "ref"; id: string; start: XY; ox: number; oy: number }
  | { k: "refSize"; id: string; start: XY; w: number }
  | { k: "resize"; id: string; dir: string; start: Box; orig: Piece; before: Piece[]; moved: boolean }
  | { k: "rotate"; id: string; c: XY; a0: number; orig: Piece; before: Piece[]; moved: boolean; deg: number }
  | { k: "mline" }
  | { k: "medge"; sx: number; sy: number; moved: boolean }
  | { k: "mHandle"; idx: number; origin: XY }
  | { k: "seam"; mode: "move" | "end"; id: string; which: "a" | "b"; end: 0 | 1; off: number; moved: boolean }
  | { k: "inner"; id: string; line: string; idx: number; start: XY; orig: Pt[]; before: Piece[]; moved: boolean };   // ลากเส้นใน: idx −1 = ทั้งเส้น · อื่น ๆ = จุดลำดับนั้น

const SNAP_KEY = "pattern-shape-snap";
const FADE_KEY = "pattern-shape-fade";
const RS_DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const RS_CURSOR: Record<string, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const ALLOW_KEY = "pattern-shape-allow";
const CANVAS_H_KEY = "pattern-shape-h";      // ความสูงพื้นที่วาด (px) — ลากขีดใต้แคนวาส
const PANEL_KEY = "pattern-shape-panel";     // 1 = แผงรายละเอียดชิ้นเปิด · 0 = พับ
const CANVAS_H_DEFAULT = 480, CANVAS_H_MIN = 260, CANVAS_H_MAX = 1600;
const ALLOW_STEPS = [0, 0.3, 0.5, 1] as const;
const MAX_PIECES = 60;
const COLORS = { fill: "#dbeafe", stroke: "#2563eb", sel: "#f59e0b", text: "#1e3a8a", grid: "#e2e8f0", gridMajor: "#cbd5e1", node: "#7c3aed" };
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const r2s = (n: number) => String(Math.round(n * 100) / 100);
let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const newPid = () => `pc${Date.now().toString(36)}${(seq++).toString(36)}`;
const MEASURE_COLOR = "#7c3aed";
const MARK_COLOR = "#dc2626";   // เส้นทางผ้า / รอยบาก
const GUIDE_COLOR = "#db2777";  // เส้นช่วยจัดแนว
const unionBox = (bs: Box[]): Box => {
  if (!bs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
};

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

/** หน่วยความยาวที่แสดงในกระดาน (Bag CAD รอบ A) — ช่องตัวเลขแบบ len อ่านจากที่นี่ */
const LenUnitCtx = createContext<{ unit: LengthUnit; digits?: number }>({ unit: "cm" });

/** ช่องตัวเลขที่พิมพ์ได้ลื่น (ไม่เด้งค่ากลับระหว่างพิมพ์) — เปลี่ยนค่าจากข้างนอกเมื่อไม่ได้โฟกัส
 *  len = ช่องความยาว: ค่าเป็น ซม. เสมอ แต่แสดง/พิมพ์ในหน่วยที่เลือก · รับ "7 mm" · "0.7 cm" · "1 in" · "260/2" (lib/length-units ไม่ใช้ eval)
 *        Enter / Tab / ออกจากช่อง = ยืนยัน · Esc = ยกเลิก · ลูกศรขึ้น/ลง = เพิ่ม/ลดทีละ step · ผิดรูปแบบ = ขอบแดง + บอกเหตุผล */
function NumField({ value, onCommit, min, max, label, step = 0.1, className = "w-20", disabled = false, len = false }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; label: string; step?: number; className?: string; disabled?: boolean; len?: boolean }) {
  const t = useT();
  const { unit, digits } = useContext(LenUnitCtx);
  const show = (v: number) => (len ? formatLength(v, unit, { label: false, digits: digits != null ? Math.max(digits, 2) : undefined }) : r2s(v));
  const [txt, setTxt] = useState(show(value));
  const [focus, setFocus] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  useEffect(() => { if (!focus) setTxt(show(value)); }, [value, focus, unit]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (len) {
    const inRange = (cm: number) => (min == null || cm >= min - 1e-9) && (max == null || cm <= max + 1e-9);
    const put = (cm: number) => { setBad(null); if (Math.abs(cm - value) > 1e-9) onCommit(cm); setTxt(show(cm)); };
    const commitTxt = (): boolean => {
      const r = parseLength(txt, unit);
      if (!r.ok) { setBad(t(r.th, r.en)); return false; }
      if (!inRange(r.cm)) { const lo = min != null ? formatLength(min, unit) : "", hi = max != null ? formatLength(max, unit) : ""; setBad(t(`ต้องอยู่ระหว่าง ${lo || "…"} ถึง ${hi || "…"}`, `Must be between ${lo || "…"} and ${hi || "…"}`)); return false; }
      put(r.cm); return true;
    };
    return (
      <span className="relative inline-block">
        <input type="text" inputMode="decimal" value={txt} aria-label={label.includes(unitLabel(unit, "th")) || label.includes(unitLabel(unit, "en")) ? label : `${label} (${unitLabel(unit)})`} aria-invalid={!!bad} disabled={disabled} data-len-field
          title={bad ?? t("พิมพ์ได้ เช่น 7 mm · 0.7 cm · 1 in · 260/2 — Enter ยืนยัน · Esc ยกเลิก", "Type e.g. 7 mm · 0.7 cm · 1 in · 260/2 — Enter to apply · Esc to cancel")}
          onFocus={(e) => { setFocus(true); setBad(null); e.currentTarget.select(); }}
          onBlur={() => { if (!commitTxt()) setTxt(show(value)); setFocus(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (commitTxt()) (e.currentTarget as HTMLInputElement).select(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setBad(null); setTxt(show(value)); (e.currentTarget as HTMLInputElement).blur(); }
            else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const nv = Math.round((value + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)) * 1e4) / 1e4; if (inRange(nv)) put(nv); }
          }}
          onChange={(e) => { setTxt(e.target.value); if (bad) setBad(null); }}
          className={`h-8 rounded-md border px-1.5 text-right text-sm tabular-nums disabled:bg-slate-100 disabled:text-slate-400 ${bad ? "border-red-400 bg-red-50" : "border-slate-200"} ${className}`} />
        {bad && <span role="alert" className="absolute right-0 top-full z-20 mt-0.5 w-max max-w-[220px] rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 shadow-sm">{bad}</span>}
      </span>
    );
  }
  return (
    <input type="number" step={step} min={min} max={max} value={txt} aria-label={label} disabled={disabled}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setTxt(r2s(value)); }}
      onChange={(e) => { setTxt(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) onCommit(v); }}
      className={`h-8 rounded-md border border-slate-200 px-1.5 text-right text-sm tabular-nums disabled:bg-slate-100 disabled:text-slate-400 ${className}`} />
  );
}

export function ShapeEditor({ open, onClose, onSave, initial = [], initialBasis = "box", title, multiNote, materials = [], defaultMats = [],
  embedded = false, readonly = false, onChange, initialRefs = [], refPicker, initialSel = null, footerNote, inject, onSelChange, selectPid, onLive, seams, onSeamsChange, initialTool, pieceInfoFields, matProps, onMatPropsChange, innerLines = false, hidePids = null, pieceLinks = false, unit: unitProp, seamTol, lockPids = null, flagged = null, focusEdge = null, onToolChange }: {
  /** แจ้งเมื่อเปลี่ยนเครื่องมือ (บทเรียนนับว่าเปิดไม้บรรทัดแล้ว ฯลฯ) */
  onToolChange?: (tool: Tool) => void;
  /** หน่วยที่แสดง (มม./ซม./นิ้ว · Bag CAD รอบ A) — ข้อมูลยังเป็น ซม. เสมอ · ไม่ส่ง = ซม. ทศนิยม 1 ตำแหน่งแบบเดิม (ใบงานออกแบบ) */
  unit?: LengthUnit;
  /** ค่าคลาดของตะเข็บ (ซม.) ที่ใช้ตัดสินสี "ยาวไม่เท่า" — ไม่ส่ง = SEAM_TOL เดิม (1 มม.) */
  seamTol?: number;
  /** ชิ้นที่ล็อกไว้: เห็นปกติแต่กด/ลาก/แก้ไม่ได้ (ปลดล็อกจากรายการชิ้นของสตูดิโอ) */
  lockPids?: Set<string> | null;
  /** ไฮไลต์จุดที่มีปัญหาจากแผงตรวจแบบ (ขอบ หรือทั้งชิ้นถ้าไม่ระบุขอบ) */
  flagged?: { pid: string; edges?: number[] }[] | null;
  /** สั่งไปที่ชิ้น/ขอบจากภายนอก (แผงตรวจแบบ) — nonce เปลี่ยน = ไป 1 ครั้ง · ระบุ edge + มีตะเข็บ = เปิดค่าของขอบนั้น (เครื่องมือแก้ตะเข็บ) */
  focusEdge?: { nonce: number; pid: string; edge?: number; /** เปิดการ์ดของตะเข็บนี้ (เครื่องมือแก้ตะเข็บ) */ seam?: string } | null;
  /** เปิดงาน "ชิ้นคู่ผูกกัน" (lib/pattern-link): ชิ้นตามเปลี่ยนรูปตามชิ้นต้นแบบ + ส่วนผูก/เลิกผูกในแผงชิ้น (แอปสตูดิโอแพทเทิร์น · ใบงานออกแบบไม่ส่ง = ไม่มี) */
  pieceLinks?: boolean;
  /** เปิดงาน "เส้นในชิ้น": เครื่องมือวาดเส้นใน (L) + รายการเส้นในของชิ้นในแผงขวา + เย็บกับเส้นในได้ (แอปสตูดิโอแพทเทิร์น · ใบงานออกแบบไม่ส่ง = ไม่มี) */
  innerLines?: boolean;
  /** รหัสชิ้นที่ซ่อนไว้ (เช่น ดูเฉพาะชั้นซับใน) — ชิ้นยังอยู่ครบ แค่จางและกดไม่ได้ */
  hidePids?: Set<string> | null;
  /** ชิ้นบนกระดานแบบสด (ตอนเปิด + ทุกครั้งที่เปลี่ยน รวมระหว่างลาก) — ไว้วาดภาพ 3D ตาม */
  onLive?: (pieces: ResultPiece[]) => void;
  /** เพิ่มชิ้นเข้ากระดานจากภายนอก (เช่น ตัวสร้างจากแม่แบบทรง) — nonce เปลี่ยน = เพิ่ม 1 ครั้ง · ชิ้นที่มี at วางเป็นกลุ่มต่อจากขวาสุดของกระดาน · ย้อนกลับได้ */
  inject?: { nonce: number; pieces: EditorPiece[]; /** แก้ชิ้นที่มีอยู่ (รูป / เผื่อเย็บ) — ย้อนได้ */ patch?: { pid: string; shape?: Shape; allow?: number; allowEdges?: number[] | null }[]; /** แทนชุดตะเข็บทั้งชุด — ย้อนได้ */ seams?: Seam[]; /** ตั้ง "ขอบเปิดตั้งใจ" ให้ขอบของชิ้นที่มีอยู่ (จากแผงตรวจแบบ) */ edgeOpen?: { pid: string; edges: number[] }[]; /** at ของชิ้น = ตำแหน่งบนกระดานตรง ๆ (ไม่งั้น x นับต่อจากขวาสุดของชิ้นเดิม) */ abs?: boolean; /** เพิ่มเส้นในให้ชิ้นที่มีอยู่แล้ว (ย้อนกลับได้พร้อมชิ้นใหม่ในครั้งเดียว) */ inner?: { pid: string; lines: InnerLine[] }[] } | null;
  /** ชิ้นที่เลือกเปลี่ยน → ส่ง pid กลับ (null = ไม่ได้เลือก) — ใช้ให้ภาพ 3D สว่างตาม */
  onSelChange?: (pid: string | null) => void;
  /** สั่งเลือกชิ้นจากภายนอก (เช่น คลิกชิ้นในภาพ 3D) — nonce เปลี่ยน = เลือก 1 ครั้ง */
  selectPid?: { nonce: number; pid: string | null } | null;
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
  /** ตะเข็บ (lib/pattern-seams · อ้างชิ้นด้วย pid) — ส่ง = มีเครื่องมือ "เย็บขอบกับขอบ (N)" + "แก้ตะเข็บ (B)" บนกระดานเดิม และเห็นตะเข็บบนชิ้นตลอด · ไม่ส่ง = ไม่มี (ใบงานออกแบบ) */
  seams?: Seam[];
  /** แก้ตะเข็บ (เพิ่ม / ลบ / กลับทิศ) — ไม่ส่ง = ดูอย่างเดียว */
  onSeamsChange?: (next: Seam[]) => void;
  /** เครื่องมือตอนเปิดกระดาน (เช่น "sew" เมื่อมาจากปุ่ม ไปเย็บ) */
  initialTool?: Tool;
  /** แผงชิ้นมีหัวข้อ "ข้อมูลชิ้นและการอยู่ทรง" (รหัส · ชนิด · แผ่นเสริม · ปาดขอบ · แข็งอยู่ทรง) + ทิศทางผ้าเป็นองศา — แอปสตูดิโอแพทเทิร์นเปิด · ใบงานออกแบบไม่เปิด */
  pieceInfoFields?: boolean;
  /** ค่าของวัสดุ (ความอยู่ทรง · ความหนา · สี) ต่อรหัสวัสดุ — ส่งพร้อม onMatPropsChange = ป้ายวัสดุมีปุ่มตั้งค่า */
  matProps?: Record<string, MatProps>;
  onMatPropsChange?: (next: Record<string, MatProps>) => void;
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
  const unit: LengthUnit = unitProp ?? "cm";
  const lenDigits = unitProp ? undefined : 1;   // ไม่ส่งหน่วย (ใบงานออกแบบ) = ซม. ทศนิยม 1 ตำแหน่งเหมือนเดิม
  const uL = t(unitLabel(unit, "th"), unitLabel(unit, "en"));
  const fmtN = (cm: number) => Number(formatLength(cm, unit, { label: false, digits: lenDigits })).toLocaleString("th-TH", { maximumFractionDigits: lenDigits ?? (unit === "mm" ? 1 : unit === "cm" ? 2 : 3) });
  const fmtL = (cm: number) => `${fmtN(cm)} ${uL}`;
  const blocked = (pid: string) => !!hidePids?.has(pid) || !!lockPids?.has(pid);
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
      const m = movePiece({ shape: p.shape, holes: p.holes ?? [], grain: p.grain ?? null, notches: p.notches ?? [], inner: p.inner ?? null }, dx, dy);
      return { id: newId(), shape: m.shape, holes: m.holes, grain: m.grain ?? null, notches: m.notches ?? [], inner: m.inner ?? null, count: Math.max(1, Math.round(p.count) || 1), allow: a, allowEdges: p.allowEdges ?? null, foldEdges: p.foldEdges ?? null, edgeMeta: p.edgeMeta ?? null, info: p.info ?? null, link: p.link ?? null, name: p.name ?? "", mats: p.mats ?? [], pid: p.pid || newPid(), src: p.src ?? [] };
    });
  });
  const piecesRef = useRef(pieces); piecesRef.current = pieces;
  // ชิ้นคู่ผูกกัน: ทุกครั้งที่ชิ้นเปลี่ยน (รวมระหว่างลาก) ให้ชิ้นตามมีรูปตรงกับต้นแบบ — ไม่บันทึกเป็นขั้นย้อนกลับแยก (ย้อนการแก้ต้นแบบ = ชิ้นตามย้อนด้วย)
  useEffect(() => { if (!pieceLinks) return; const next = applyLinks(pieces); if (next === pieces) return; const f = followEdges(pieces, next); setPieces(f.pieces); if (f.seams) emitSeams(f.seams); }, [pieces, pieceLinks]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<string | null>(null);
  const [multi, setMulti] = useState<Set<string>>(() => new Set());   // เลือกหลายชิ้น (≥2) — sel = ชิ้นหลักในกลุ่ม
  const [marquee, setMarquee] = useState<{ a: XY; b: XY } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }[]>([]);
  const clipRef = useRef<{ id: string; pieces: Piece[]; n: number } | null>(null);
  const [notchMode, setNotchMode] = useState(false);
  const [edgeHover, setEdgeHover] = useState<{ id: string; i: number } | null>(null);   // ขอบที่ชี้อยู่ในรายการเผื่อรายขอบ (ไฮไลต์บนกระดาน)
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [roundR, setRoundR] = useState(() => (unitProp === "mm" ? "10" : unitProp === "in" ? "0.4" : "1"));   // ในหน่วยที่แสดง (รับ "10 mm" ได้)
  const [offD, setOffD] = useState(() => (unitProp === "mm" ? "10" : unitProp === "in" ? "0.4" : "1"));
  const [tool, setTool] = useState<Tool>(initialTool ?? "rect");
  // ── เย็บ (ตะเข็บอยู่กับหน้าที่เรียก · กระดานแค่วาดและส่งการแก้กลับ) ──
  const [sewA, setSewA] = useState<SeamSide | null>(null);        // ด้านแรกที่เลือกไว้ รอคลิกขอบคู่
  const [sewSel, setSewSel] = useState<string | null>(null);      // ตะเข็บที่เลือก (เครื่องมือแก้ตะเข็บ)
  const [edgeSel, setEdgeSel] = useState<{ pid: string; i: number; n: number } | null>(null);   // ขอบที่เลือก (เครื่องมือแก้ตะเข็บ) → แผงขวาแสดงค่าของขอบ
  const [matOpen, setMatOpen] = useState<string | null>(null);     // วัสดุที่กำลังเปิดตั้งค่า (ในแผงชิ้น)
  const [divN, setDivN] = useState(2);                            // แบ่งขอบเป็นกี่ช่วง (วางรอยบาก)
  const [notchAt, setNotchAt] = useState(5);                      // วางรอยบากที่ระยะจากต้นขอบ (ซม.)
  const [sewHover, setSewHover] = useState<string | null>(null);  // ขอบที่ชี้อยู่ "pid:i:n"
  const lastSeam = useRef<string | null>(null);                   // ตะเข็บที่เพิ่งเย็บ (Shift+คลิก = ต่อด้านที่ 2 ให้ยาวขึ้น)
  const [innerSel, setInnerSel] = useState<{ id: string; line: string } | null>(null);   // เส้นในที่เลือก (ชิ้น + เส้น) — ลากบนกระดาน / พิมพ์ระยะในแผงชิ้น
  const [innerA, setInnerA] = useState<{ id: string; p: XY } | null>(null);   // เครื่องมือเส้นใน: จุดแรก (รอกดจุดที่สอง)
  const [sewP, setSewP] = useState<{ pid: string; i: number; n: number; at: number } | null>(null);   // เย็บบางช่วง: จุดเริ่มของช่วงแรก (รอกดจุดจบบนขอบเดียวกัน)
  const [manyA, setManyA] = useState<{ pid: string; i: number; n: number; at: number; dir: 1 | -1; group: string; made: number } | null>(null);   // เย็บ 1 ขอบกับหลายชิ้น: ขอบหลัก + ตำแหน่งที่ช่วงถัดไปจะเริ่ม + ทิศที่ไล่ไปตามขอบ
  const sewTool = tool === "sew" || tool === "sewpart" || tool === "sewmany" || tool === "sewedit";
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
  // หน้าตาพื้นที่วาด: ความสูง (ลากขีดใต้แคนวาส · จำในเครื่อง) · พับแผงชิ้น · ขยายเต็มป๊อป · เมนูลอยที่เปิดอยู่
  const [canvasH, setCanvasHState] = useState(CANVAS_H_DEFAULT);
  const setCanvasH = (v: number, save = false) => { const x = Math.round(Math.min(CANVAS_H_MAX, Math.max(CANVAS_H_MIN, v))); setCanvasHState(x); if (save) saveNum(CANVAS_H_KEY, x); };
  const [panelOpen, setPanelOpenState] = useState(true);
  const setPanelOpen = (v: boolean) => { setPanelOpenState(v); saveNum(PANEL_KEY, v ? 1 : 0); };
  const [focus, setFocus] = useState(false);
  const [menu, setMenu] = useState<null | "snap" | "more" | "ref">(null);
  const gripRef = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {   // คลิกนอกเมนูลอย = ปิด
    if (!menu) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.("[data-menu]")) setMenu(null); };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [menu]);
  const [rotDeg, setRotDeg] = useState<number | null>(null);
  const [rotIn, setRotIn] = useState("15");     // Transform: หมุนกี่องศา
  const [scaleIn, setScaleIn] = useState("110"); // Transform: ย่อ/ขยายกี่ %

  // ── ย้อนกลับ / ทำซ้ำ ──
  /** ประวัติย้อนกลับรวม (Bag CAD รอบ A · 2026-11-12): 1 ขั้น = ชิ้นทั้งกระดาน + ตะเข็บ ณ ตอนนั้น → Ctrl+Z ครั้งเดียวย้อนได้ทั้งการแก้ชิ้นและการเย็บ (เดิมตะเข็บมีประวัติแยก ย้อนได้เฉพาะตอนถือเครื่องมือเย็บ) */
  type Snap = { p: Piece[]; s: Seam[] | null };
  const hist = useRef<Snap[]>([]);
  const fut = useRef<Snap[]>([]);
  const seamsRef = useRef<Seam[] | null>(seams ?? null); seamsRef.current = seams ?? null;
  const onSeamsRef = useRef(onSeamsChange); onSeamsRef.current = onSeamsChange;
  /** ส่งตะเข็บชุดใหม่ออกไป (อัปเดตตัวจำทันที กันตัวอื่นอ่านค่าเก่าก่อนหน้าแม่ส่งกลับมา) */
  const emitSeams = (next: Seam[]) => { seamsRef.current = next; onSeamsRef.current?.(next); };
  const lastPush = useRef<{ key: string; at: number } | null>(null);
  const [, setHv] = useState(0);
  /** จดสภาพก่อนเปลี่ยน (key เดียวกันติดกันภายใน 1.2 วิ = รวมเป็นครั้งเดียว เช่น พิมพ์ตัวเลขทีละตัว) */
  const record = useCallback((prev: Piece[], key?: string, prevSeams?: Seam[] | null) => {
    const now = Date.now();
    if (key && lastPush.current?.key === key && now - lastPush.current.at < 1200) { lastPush.current.at = now; return; }
    hist.current.push({ p: prev, s: prevSeams === undefined ? seamsRef.current : prevSeams });
    if (hist.current.length > 100) hist.current.shift();
    fut.current = [];
    lastPush.current = key ? { key, at: now } : null;
    setHv((v) => v + 1);
  }, []);
  /** จดขั้นของการแก้ตะเข็บ (ชิ้นไม่เปลี่ยน) ลงประวัติเดียวกับชิ้น */
  const pushSeamHist = (prevSeams: Seam[]) => record(piecesRef.current, undefined, prevSeams);
  /** ชิ้นที่จำนวนขอบเปลี่ยน (แบ่งขอบ · เพิ่ม/ลบจุด · ชิ้นตามต้นแบบ) → ค่ารายขอบตามไปถูกขอบ + ตะเข็บย้ายตาม (lib/pattern-edge-map) — ไม่มีอะไรเปลี่ยน = คืนรายการเดิม */
  const followEdges = (prev: Piece[], next: Piece[]): { pieces: Piece[]; seams: Seam[] | null; lost: number } => {
    const before = new Map(prev.map((p) => [p.id, p]));
    const plans = new Map<string, EdgePlan>();
    let lost = 0;
    const out = next.map((p) => {
      const o = before.get(p.id);
      if (!o || o.shape === p.shape) return p;
      const plan = edgePlan(o.shape, p.shape);
      if (!plan || plan.oldN === plan.newN) return p;
      plans.set(p.pid, plan);
      const fix: Partial<Piece> = {};
      if (p.allowEdges && p.allowEdges.length === plan.oldN) fix.allowEdges = remapEdgeValues(p.allowEdges, plan);
      if (p.foldEdges && p.foldEdges.length === plan.oldN) fix.foldEdges = remapEdgeValues(p.foldEdges, plan);
      if (p.edgeMeta && p.edgeMeta.length === plan.oldN) { const r = remapEdgeMeta(p.edgeMeta, plan); fix.edgeMeta = r.meta; lost += r.lost; }
      return { ...p, ...fix };
    });
    if (!plans.size) return { pieces: next, seams: null, lost };
    const cur = seamsRef.current;
    const m = cur?.length ? migrateSeams(cur, plans) : null;
    return { pieces: out, seams: m?.changed ? m.seams : null, lost: lost + (m?.lost ?? 0) };
  };
  const lostMsg = (n: number) => setMsg({ tone: "err", text: t(`มี ${n} จุด (ตะเข็บ / ซิป / กุ๊น) ตามขอบใหม่ไม่ได้ เพราะขอบถูกรวม — ดูที่แผงตรวจแบบแล้วเลือกขอบใหม่ หรือกด Ctrl+Z`, `${n} item(s) (seams / zips / binding) couldn't follow the new edges because edges were merged — check the review panel and reselect, or press Ctrl+Z`) });
  const commit = useCallback((next: Piece[], key?: string) => {
    const prev = piecesRef.current, f = followEdges(prev, next);
    record(prev, key);
    setPieces(f.pieces); setDirty(true);
    if (f.seams) emitSeams(f.seams);
    if (f.lost) lostMsg(f.lost);
  }, [record]);   // eslint-disable-line react-hooks/exhaustive-deps
  const restore = (to: Snap) => { setPieces(to.p); if (to.s && to.s !== seamsRef.current) emitSeams(to.s); setDirty(true); lastPush.current = null; setSelNode(-1); setSel((s) => (s && to.p.some((p) => p.id === s) ? s : null)); setEditId((e) => (e && to.p.some((p) => p.id === e) ? e : null)); setHv((v) => v + 1); };
  const undo = useCallback(() => { const h = hist.current.pop(); if (!h) return; fut.current.push({ p: piecesRef.current, s: seamsRef.current }); restore(h); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => { const f = fut.current.pop(); if (!f) return; hist.current.push({ p: piecesRef.current, s: seamsRef.current }); restore(f); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSnapState(readNum(SNAP_KEY, SNAP_STEPS, 1)); setLastAllow(readNum(ALLOW_KEY, null, 0)); setPieceFadeState(readNum(FADE_KEY, null, initialRefs.length ? 0.3 : 0.6)); setCanvasH(readNum(CANVAS_H_KEY, null, CANVAS_H_DEFAULT)); setPanelOpenState(readNum(PANEL_KEY, [0, 1], 1) === 1); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
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
    if ((tl === "sew" || tl === "sewpart" || tl === "sewmany" || tl === "sewedit") && !seams) return;
    if (tl === "inner" && (!innerLines || readonly)) return;
    setInnerA(null);
    setTool(tl); setPen(null); setBox(null); setMDraft(null); if (tl !== "move") setEditId(null);
    setSewA(null); setSewP(null); setManyA(null); if (tl !== "sewedit") setEdgeSel(null); if (tl !== "sewedit" && tl !== "sewpart") setSewSel(null);
    if (tl === "sew" || tl === "sewpart" || tl === "sewmany" || tl === "sewedit") { setPanelOpen(true); setNotchMode(false); }
  };
  const newPiece = (shape: Shape, holes: Shape[] = []): Piece => ({ id: newId(), shape, holes, count: 1, allow: lastAllow, name: "", mats: [...defaultMats], pid: newPid(), src: [] });
  const selIds: string[] = multi.size ? [...multi] : sel ? [sel] : [];
  const selIdsRef = useRef(selIds); selIdsRef.current = selIds;
  const selectIds = (ids: string[]) => { setMulti(ids.length > 1 ? new Set(ids) : new Set()); setSel(ids[0] ?? null); };
  const addPieces = (list: Piece[], selectFirst = true): Piece[] | null => {
    const cur = piecesRef.current;
    if (cur.length + list.length > MAX_PIECES) { setMsg({ tone: "err", text: t(`วาดได้ไม่เกิน ${MAX_PIECES} ชิ้นต่อครั้ง`, `Up to ${MAX_PIECES} pieces at a time`) }); return null; }
    const next = [...cur, ...list];
    commit(next);
    if (selectFirst && list[0]) { setSel(list[0].id); setMulti(new Set()); }
    return next;
  };
  const rightEdge = () => piecesRef.current.reduce((m, p) => { const b = pieceGeometry(p).cutBox; return Math.max(m, b.x + b.w); }, -2) + 2;
  // ── เชื่อมกับภายนอก (สตูดิโอแพทเทิร์น): รับชิ้นจากแม่แบบ · บอก/รับชิ้นที่เลือก — ไม่ส่ง prop = ทำงานเหมือนเดิมทุกอย่าง ──
  const injectSeen = useRef<number | null>(inject?.nonce ?? null);   // ค่าที่มีอยู่ตอนเปิด = เคยเพิ่มไปแล้ว ไม่เพิ่มซ้ำ
  useEffect(() => {
    if (!inject || injectSeen.current === inject.nonce) return;
    injectSeen.current = inject.nonce;
    if (readonly || (!inject.pieces.length && !inject.inner?.length && !inject.edgeOpen?.length && !inject.patch?.length && !inject.seams)) return;
    const x0 = inject.abs ? 0 : rightEdge();
    let x = x0;
    const list: Piece[] = inject.pieces.map((p) => {
      const b = shapeBox(p.shape), a = cleanAllow(p.allow);
      const dx = (p.at ? x0 + p.at[0] : x + a) - b.x, dy = (p.at ? p.at[1] : a) - b.y;
      if (!p.at) x += b.w + 2 * a + 2;
      const m = movePiece({ shape: p.shape, holes: p.holes ?? [], grain: p.grain ?? null, notches: p.notches ?? [], inner: p.inner ?? null }, dx, dy);
      return { id: newId(), shape: m.shape, holes: m.holes, grain: m.grain ?? null, notches: m.notches ?? [], inner: m.inner ?? null, count: Math.max(1, Math.round(p.count) || 1), allow: a, allowEdges: p.allowEdges ?? null, foldEdges: p.foldEdges ?? null, edgeMeta: p.edgeMeta ?? null, info: p.info ?? null, link: p.link ?? null, name: p.name ?? "", mats: p.mats ?? [...defaultMats], pid: p.pid || newPid(), src: [] };
    });
    const cur = piecesRef.current;
    const base = inject.inner?.length ? cur.map((q) => { const more = (inject.inner ?? []).filter((x) => x.pid === q.pid).flatMap((x) => x.lines); return more.length ? { ...q, inner: [...(q.inner ?? []), ...more] } : q; }) : cur;
    const opened = inject.edgeOpen?.length ? base.map((q) => {
      const e = (inject.edgeOpen ?? []).find((x) => x.pid === q.pid);
      if (!e) return q;
      const E = pieceEdges(q.shape), cur0 = cleanEdgeMeta(q.shape, q.edgeMeta) ?? E.map(() => ({}) as EdgeMeta);
      return { ...q, edgeMeta: cur0.map((m, i) => (e.edges.includes(i) ? { ...m, open: true } : m)) };
    }) : base;
    const patched = inject.patch?.length ? opened.map((q) => {
      const x = (inject.patch ?? []).find((y) => y.pid === q.pid);
      if (!x) return q;
      return { ...q, ...(x.shape ? { shape: x.shape, ...(pieceEdges(x.shape).length !== pieceEdges(q.shape).length ? { allowEdges: null, foldEdges: null, edgeMeta: null } : {}) } : {}), ...(x.allow != null ? { allow: cleanAllow(x.allow) } : {}), ...("allowEdges" in x ? { allowEdges: x.allowEdges ?? null } : {}) };
    }) : opened;
    if (patched.length + list.length > MAX_PIECES) { setMsg({ tone: "err", text: t(`วาดได้ไม่เกิน ${MAX_PIECES} ชิ้นต่อครั้ง`, `Up to ${MAX_PIECES} pieces at a time`) }); return; }
    const next = [...patched, ...list];
    commit(next);
    if (inject.seams && onSeamsChange) emitSeams(inject.seams);
    if (list[0]) { setSel(list[0].id); setMulti(new Set()); }
    if (list.length || inject.inner?.length) { changeTool("move"); fitView(next); }
  }, [inject]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onSelRef = useRef(onSelChange); onSelRef.current = onSelChange;
  const onToolRef = useRef(onToolChange); onToolRef.current = onToolChange;
  useEffect(() => { onToolRef.current?.(tool); }, [tool]);
  const selPid = pieces.find((p) => p.id === sel)?.pid ?? null;
  useEffect(() => { onSelRef.current?.(selPid); }, [selPid]);
  useEffect(() => {
    if (!selectPid) return;
    const hit = selectPid.pid ? piecesRef.current.find((p) => p.pid === selectPid.pid) : undefined;
    if (hit && lockPids?.has(hit.pid)) return;   // ชิ้นที่ล็อก = เลือกจากภาพ 3D ไม่ได้ (ปลดล็อกที่รายการชิ้นก่อน)
    setMulti(new Set()); setEditId(null); setSel(hit ? hit.id : null);
    if (hit) { setTool("move"); if (!panelOpen) setPanelOpen(true); }
  }, [selectPid]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ล็อกชิ้นที่เลือกอยู่ = เลิกเลือก (กันแก้ด้วยแป้นพิมพ์/แผงขวาต่อ)
  useEffect(() => {
    if (!lockPids?.size) return;
    const isLocked = (id: string | null) => { const p = id ? piecesRef.current.find((x) => x.id === id) : null; return !!p && lockPids.has(p.pid); };
    setSel((cur) => (isLocked(cur) ? null : cur));
    setEditId((cur) => (isLocked(cur) ? null : cur));
    setMulti((m) => { const ids = [...m].filter((id) => !isLocked(id)); return ids.length === m.size ? m : new Set(ids.length > 1 ? ids : []); });
  }, [lockPids]);
  // ไปที่ชิ้น/ขอบจากแผงตรวจแบบ: เลื่อนกระดานให้ชิ้นอยู่กลาง · ระบุขอบ = เปิดค่าของขอบ (เครื่องมือแก้ตะเข็บ)
  const focusSeen = useRef<number | null>(focusEdge?.nonce ?? null);
  useEffect(() => {
    if (!focusEdge || focusSeen.current === focusEdge.nonce) return;
    focusSeen.current = focusEdge.nonce;
    const p = piecesRef.current.find((x) => x.pid === focusEdge.pid);
    if (!p) return;
    const b = pieceGeometry(p).cutBox, cw = sizeRef.current.cw, ch = sizeRef.current.ch;
    setView((v) => { const vh = cw > 0 ? (v.w * ch) / cw : v.w; return { ...v, x: b.x + b.w / 2 - v.w / 2, y: b.y + b.h / 2 - vh / 2 }; });
    if (focusEdge.seam && seams?.some((x) => x.id === focusEdge.seam)) { changeTool("sewedit"); setEdgeSel(null); setSewSel(focusEdge.seam); }
    else if (focusEdge.edge != null && seams) { changeTool("sewedit"); setEdgeSel({ pid: p.pid, i: focusEdge.edge, n: pieceEdges(p.shape).length }); setSewSel(null); }
    else if (!lockPids?.has(p.pid)) { if (sewTool) changeTool("move"); setSel(p.id); setMulti(new Set()); setEditId(null); }
    if (!panelOpen) setPanelOpen(true);
  }, [focusEdge]);   // eslint-disable-line react-hooks/exhaustive-deps
  const patchPiece =(id: string, f: (p: Piece) => Piece, key?: string) => commit(piecesRef.current.map((p) => (p.id === id ? f(p) : p)), key);

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
    const startPan = () => { drag.current = { k: "pan", sx: e.clientX, sy: e.clientY, v: view }; capture(); };
    // ถือ "เลื่อนดู" แล้วกดบนชิ้น = เลือก/ย้ายชิ้นนั้นได้เลย (กลับเป็น "ย้าย" เอง) — กดที่ว่าง = เลื่อนกระดาน
    const handOnPiece = tool === "hand" && e.button === 0 && !spaceDown.current && !readonly && !!(e.target as Element).getAttribute?.("data-piece");
    if (e.button === 1 || (tool === "hand" && !handOnPiece) || spaceDown.current) { startPan(); e.preventDefault(); return; }
    if (e.button !== 0) return;
    const raw = toCm(e), p = snapPt(raw);
    const target = e.target as Element;
    if (tool === "inner" && !readonly) {   // เครื่องมือเส้นใน: กดเส้นเดิม = เลือก + ลากย้าย · กดจุดกลม = ลากจุด · กดที่ว่างข้างในชิ้น = เริ่มเส้นใหม่ (2 จุด)
      const hitLine = target.getAttribute?.("data-innerpt") ?? target.getAttribute?.("data-innerline");
      if (hitLine) {
        const [pieceId, lineId, k] = hitLine.split(":"), pc = piecesRef.current.find((x) => x.id === pieceId), ln = pc?.inner?.find((l) => l.id === lineId);
        if (pc && ln) {
          setInnerA(null); setInnerSel({ id: pieceId, line: lineId }); setSel(pieceId); setMulti(new Set()); if (!panelOpen) setPanelOpen(true);
          drag.current = { k: "inner", id: pieceId, line: lineId, idx: k != null ? Number(k) : -1, start: p, orig: ln.pts, before: piecesRef.current, moved: false }; capture();
        }
        return;
      }
      if (!innerA) {
        const hit = [...piecesRef.current].reverse().find((pc) => !blocked(pc.pid) && pointInPolygon([p.x, p.y], flattenShape(pc.shape)));
        if (!hit) { startPan(); return; }   // กดนอกชิ้น = ลากเลื่อนกระดาน (ไม่เปลี่ยนเครื่องมือ) — เส้นในเริ่มได้เฉพาะข้างในชิ้น
        setInnerA({ id: hit.id, p }); setInnerSel(null); setSel(hit.id); setMulti(new Set()); return;
      }
      const q = e.shiftKey ? constrain45(innerA.p, p) : p;
      if (Math.hypot(q.x - innerA.p.x, q.y - innerA.p.y) < 0.3) return;
      patchPiece(innerA.id, (x) => ({ ...x, inner: [...(x.inner ?? []), { id: `il${Date.now().toString(36)}${(x.inner ?? []).length}`, kind: "sew" as InnerKind, pts: [[innerA.p.x, innerA.p.y], [q.x, q.y]] as Pt[] }] }));
      setInnerA(null); if (!panelOpen) setPanelOpen(true);
      return;
    }
    if (sewTool) {   // เครื่องมือเย็บ / เย็บบางช่วง / แก้ตะเข็บ: กดได้เฉพาะขอบและตะเข็บ — ไม่วาด ไม่ย้ายชิ้น
      const il = target.getAttribute?.("data-inner");
      if (il) { sewInnerClick(il); return; }
      const se = target.getAttribute?.("data-seamend"), ss = target.getAttribute?.("data-seamside"), ed = target.getAttribute?.("data-edge");
      if (se) { const [id, which, k] = se.split(":"); drag.current = { k: "seam", mode: "end", id, which: which === "b" ? "b" : "a", end: k === "1" ? 1 : 0, off: 0, moved: false }; capture(); }
      else if (ss) { const [id, which] = ss.split(":"); if (seamGrab(id, which === "b" ? "b" : "a", raw)) capture(); }
      else if (ed) { if (tool === "sewpart") sewPartClick(ed, raw); else if (tool === "sewmany") sewManyClick(ed, raw); else sewClick(ed, e.shiftKey); }
      else { if (tool !== "sew") { setSewSel(null); setEdgeSel(null); } startPan(); }   // กดที่ไม่ใช่ขอบ/ตะเข็บ = ลากเลื่อนกระดานได้ (ไม่เปลี่ยนเครื่องมือ)
      return;
    }
    // ตั้งขนาดจริงของรูปอ้างอิง: คลิก 2 จุดบนรูป
    if (cal) { if (!cal.a) setCal({ ...cal, a: raw }); else if (!cal.b) setCal({ ...cal, b: raw, m: undefined }); return; }
    // รูปอ้างอิงที่ยังไม่ล็อก: ลากย้าย / ลากมุมย่อขยาย
    const rs = target.getAttribute?.("data-refsize"), rf = target.getAttribute?.("data-ref");
    if (rs) { const r = refs.find((x) => x.id === rs); if (r) { drag.current = { k: "refSize", id: rs, start: raw, w: r.w }; capture(); } return; }
    if (rf) { const r = refs.find((x) => x.id === rf); if (r) { setActiveRef(rf); drag.current = { k: "ref", id: rf, start: raw, ox: r.x, oy: r.y }; capture(); } return; }
    if (tool === "measure") { measureDown(e, raw, p, target, capture); return; }
    if (notchMode && selPiece && !readonly) {   // โหมดรอยบาก: คลิกใกล้ขอบ = เพิ่ม · คลิกที่รอยเดิม = ลบ
      const g = geo.get(selPiece.id); const q: Pt = [raw.x, raw.y];
      if (g) {
        const ex = (selPiece.notches ?? []).findIndex((n) => Math.hypot(n[0] - q[0], n[1] - q[1]) * ppc < 10);
        if (ex >= 0) patchPiece(selPiece.id, (x) => ({ ...x, notches: (x.notches ?? []).filter((_, i) => i !== ex) }));
        else { const pr = projectOnOutline(g.sew, q); if (pr.d * ppc < 16) patchPiece(selPiece.id, (x) => ({ ...x, notches: [...(x.notches ?? []), pr.at] })); else setMsg({ tone: "err", text: t("คลิกให้ใกล้เส้นขอบของชิ้น (เส้นเย็บ)", "Click closer to the piece's edge (sewing line)") }); }
      }
      return;
    }
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
    if (hitId) {   // กดชิ้นที่วาดแล้ว → ย้าย + เปิดแผงรายละเอียด · Shift = เลือกเพิ่ม/เอาออก · กดชิ้นในกลุ่ม = ลากทั้งกลุ่ม
      const pc = piecesRef.current.find((x) => x.id === hitId);
      if (!pc) return;
      setTool("move");
      if (e.shiftKey) {
        const cur = new Set(selIdsRef.current);
        if (cur.has(hitId)) cur.delete(hitId); else cur.add(hitId);
        const ids = [...cur];
        setMulti(ids.length > 1 ? cur : new Set()); setSel(cur.has(hitId) ? hitId : ids[0] ?? null);
        return;
      }
      const group = multi.has(hitId) ? [...multi] : [hitId];
      if (!multi.has(hitId)) setMulti(new Set());
      setSel(hitId);
      drag.current = { k: "move", ids: group, start: raw, orig: piecesRef.current.filter((x) => group.includes(x.id)), before: piecesRef.current, moved: false }; capture();
      return;
    }
    // Shift + ลากที่ว่าง = กรอบเลือกหลายชิ้น
    if (e.shiftKey) { drag.current = { k: "marquee", a: raw, add: true }; setMarquee({ a: raw, b: raw }); capture(); return; }
    // ที่ว่าง (เจ้าของสั่ง 2026-11-11): ถือ "ย้าย" = เลิกเลือก + เปลี่ยนเป็น "เลื่อนดู" แล้วลากเลื่อนได้เลยในการกดครั้งเดียวกัน · ถือเครื่องมือวาด = วาดชิ้นใหม่
    setSel(null); setMulti(new Set());
    if (tool === "move") { setTool("hand"); startPan(); return; }
    const dt = tool as DrawTool;
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
      else if (mDraft?.kind === "edge") setMDraft(edgeStep(mDraft, raw));
      return;
    }
    if (d.k === "resize") {
      // ส่วนเผื่อแต่ละด้านของกรอบตัด (เผื่อรายขอบ = ไม่เท่ากันทุกด้าน · ค่าเดียวทั้งชิ้น = เท่ากับ allow เหมือนเดิม)
      const og = pieceGeometry(d.orig), mL = og.finished.x - og.cutBox.x, mT = og.finished.y - og.cutBox.y;
      const mR = og.cutBox.x + og.cutBox.w - og.finished.x - og.finished.w, mB = og.cutBox.y + og.cutBox.h - og.finished.y - og.finished.h;
      const sb = d.start, minW = mL + mR + 0.2, minH = mT + mB + 0.2;
      let x0 = sb.x, y0 = sb.y, x1 = sb.x + sb.w, y1 = sb.y + sb.h;
      if (d.dir.includes("w")) x0 = Math.min(p.x, x1 - minW);
      if (d.dir.includes("e")) x1 = Math.max(p.x, x0 + minW);
      if (d.dir.includes("n")) y0 = Math.min(p.y, y1 - minH);
      if (d.dir.includes("s")) y1 = Math.max(p.y, y0 + minH);
      if ((lock || e.shiftKey) && d.dir.length === 2 && sb.w > 0 && sb.h > 0) {   // มุม + คงสัดส่วน
        const r = sb.w / sb.h; let w = x1 - x0, h = y1 - y0;
        if (w / h > r) h = w / r; else w = h * r;
        if (d.dir.includes("w")) x0 = x1 - w; else x1 = x0 + w;
        if (d.dir.includes("n")) y0 = y1 - h; else y1 = y0 + h;
      }
      d.moved = true;
      setPieces((ps) => ps.map((x) => (x.id === d.id ? fitPiece(d.orig, x0 + mL, y0 + mT, x1 - x0 - mL - mR, y1 - y0 - mT - mB) : x)));
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
    if (d.k === "medge") { if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true; if (mDraft?.kind === "edge") setMDraft(edgeStep(mDraft, raw)); return; }
    if (d.k === "mHandle" && mDraft?.kind === "curve") {
      const vx = p.x - d.origin.x, vy = p.y - d.origin.y;
      if (Math.hypot(vx, vy) * ppc < 3) return;
      setMDraft({ ...mDraft, hover: null, nodes: mDraft.nodes.map((n, i) => (i === d.idx ? { x: n.x, y: n.y, ox: vx, oy: vy, ix: -vx, iy: -vy } : n)) });
      return;
    }
    if (d.k === "pan") { setView({ x: d.v.x - (e.clientX - d.sx) / ppc, y: d.v.y - (e.clientY - d.sy) / ppc, w: d.v.w }); return; }
    if (d.k === "seam") { seamDrag(d, raw); return; }
    if (d.k === "inner") {   // ลากเส้นใน: ทั้งเส้น = เลื่อนตามระยะที่ลาก (ลงล็อกตามกระดาน) · จุดเดียว = จุดนั้นไปอยู่ตรงเมาส์
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * ppc < 2) return;
      d.moved = true;
      const r3 = (v: number) => Math.round(v * 1000) / 1000;
      const pts = d.orig.map((q, i) => (d.idx < 0 ? [r3(q[0] + dx), r3(q[1] + dy)] : i === d.idx ? [p.x, p.y] : q) as Pt);
      setPieces((ps) => ps.map((x) => (x.id === d.id ? { ...x, inner: (x.inner ?? []).map((l) => (l.id === d.line ? { ...l, pts } : l)) } : x)));
      return;
    }
    if (d.k === "marquee") { setMarquee({ a: d.a, b: raw }); return; }
    if (d.k === "move") {
      const ob = unionBox(d.orig.map((o) => pieceGeometry(o).cutBox));
      let dx = snapTo(ob.x + raw.x - d.start.x, snap) - ob.x, dy = snapTo(ob.y + raw.y - d.start.y, snap) - ob.y;
      // เส้นช่วยจัดแนว: ขอบ/กึ่งกลางของกลุ่มที่ลาก ใกล้ขอบ/กึ่งกลางชิ้นอื่น (6px) = ดูดเข้าให้ตรง
      const tol = 6 / ppc;
      const others = piecesRef.current.filter((x) => !d.ids.includes(x.id)).map((x) => pieceGeometry(x).cutBox);
      let bx: { d: number; v: number } | null = null, by: { d: number; v: number } | null = null;
      for (const o of others) {
        for (const v of [o.x, o.x + o.w / 2, o.x + o.w]) for (const m of [ob.x + dx, ob.x + dx + ob.w / 2, ob.x + dx + ob.w]) { const dd = v - m; if (Math.abs(dd) < tol && (!bx || Math.abs(dd) < Math.abs(bx.d))) bx = { d: dd, v }; }
        for (const v of [o.y, o.y + o.h / 2, o.y + o.h]) for (const m of [ob.y + dy, ob.y + dy + ob.h / 2, ob.y + dy + ob.h]) { const dd = v - m; if (Math.abs(dd) < tol && (!by || Math.abs(dd) < Math.abs(by.d))) by = { d: dd, v }; }
      }
      if (bx) dx += bx.d;
      if (by) dy += by.d;
      setGuides([...(bx ? [{ x: bx.v }] : []), ...(by ? [{ y: by.v }] : [])]);
      if (!dx && !dy && !d.moved) return;
      d.moved = true;
      const om = new Map(d.orig.map((o) => [o.id, o]));
      setPieces((ps) => ps.map((x) => { const o = om.get(x.id); return o ? movePiece(o, dx, dy) : x; }));
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
    setGuides([]);
    if (!d) return;
    if (d.k === "marquee" && marquee) {
      const x0 = Math.min(marquee.a.x, marquee.b.x), x1 = Math.max(marquee.a.x, marquee.b.x), y0 = Math.min(marquee.a.y, marquee.b.y), y1 = Math.max(marquee.a.y, marquee.b.y);
      const inside = piecesRef.current.filter((p) => { const b = pieceGeometry(p).cutBox; return b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1; }).map((p) => p.id);
      setMarquee(null);
      const ids = [...new Set([...(d.add ? selIdsRef.current : []), ...inside])];
      selectIds(ids);
      if (inside.length) setMsg({ tone: "ok", text: t(`เลือก ${ids.length} ชิ้น`, `Selected ${ids.length} pieces`) });
      return;
    }
    if ((d.k === "move" || d.k === "node" || d.k === "handle" || d.k === "resize" || d.k === "rotate" || d.k === "inner") && d.moved) { record(d.before); setDirty(true); }
    if (d.k === "move" && !d.moved && !panelOpen) setPanelOpen(true);
    if (d.k === "rotate") {
      setRotDeg(null);
      // หมุนเอียง (ไม่ใช่ทีละ 90°) → กรอบสี่เหลี่ยมใหญ่ขึ้น · คิดผ้าแบบกรอบ ต้นทุนจะเพิ่ม — บอกให้รู้
      if (d.moved && d.deg % 90 !== 0 && basisRef.current === "box") setMsg({ tone: "err", text: t(`หมุนเอียง ${d.deg}° แล้วกรอบสี่เหลี่ยมใหญ่ขึ้น — ถ้าคิดผ้าจาก "กรอบสี่เหลี่ยม" ต้นทุนจะเพิ่ม · ถ้าหมุนแค่ให้ตรงรูปอ้างอิง แนะนำเลือก "พื้นที่จริง" หรือหมุนทีละ 90°`, `Rotated ${d.deg}° — the bounding box grew; with "Bounding box" costing the fabric cost rises · if you only rotated to match the reference, pick "Actual area" or rotate in 90° steps`) });
    }
    if (d.k === "medge" && d.moved && mDraft?.kind === "edge") { finishEdge(mDraft); return; }   // กดลากปล่อย = จบ · คลิกเฉย ๆ = รอคลิกจุดปลาย
    if (d.k === "mline" && mDraft?.kind === "line") {
      const { a, b } = mDraft; const len = Math.hypot(b.x - a.x, b.y - a.y);
      setMDraft(null);
      if (len > 0) addMeasure({ kind: "line", nodes: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], len });
    }
    if (d.k === "box" && box) {
      const x = Math.min(box.a.x, box.b.x), y = Math.min(box.a.y, box.b.y), w = Math.abs(box.a.x - box.b.x), h = Math.abs(box.a.y - box.b.y);
      setBox(null);
      if (w > 0 && h > 0) addPieces([newPiece({ k: box.k, x, y, w, h })]);
      else setTool("hand");   // คลิกที่ว่างเฉย ๆ ไม่ได้ลาก = เปลี่ยนเป็น "เลื่อนดู" (ปากกาไม่เข้าข้อนี้ เพราะคลิก = วางจุด)
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
      if (e.key === "Escape" && innerA) { e.stopPropagation(); e.preventDefault(); setInnerA(null); return; }
      if (tool === "inner" && innerSel && (e.key === "Delete" || e.key === "Backspace")) {   // ถือเครื่องมือเส้นใน: Delete = ลบเส้นที่เลือก (ไม่ลบชิ้น)
        e.preventDefault(); patchPiece(innerSel.id, (x) => ({ ...x, inner: (x.inner ?? []).filter((l) => l.id !== innerSel.line) })); setInnerSel(null); return;
      }
      if (tool === "inner" && innerSel && e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setInnerSel(null); return; }
      if (sewTool) {   // ถือเครื่องมือเย็บอยู่: Esc = ยกเลิกที่เลือก · Delete = ลบตะเข็บที่เลือก (ไม่ลบชิ้น) · Ctrl+Z = ย้อนตะเข็บ
        if ((e.key === "Escape" || e.key === "Enter") && manyA) { e.stopPropagation(); e.preventDefault(); setManyA(null); return; }
        if (e.key === "Escape" && (sewA || sewP || sewSel || edgeSel)) { e.stopPropagation(); e.preventDefault(); setSewA(null); setSewP(null); setSewSel(null); setEdgeSel(null); return; }
        if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); if (sewSel) removeSeam(sewSel); return; }
      }
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Escape" && (pen || box || sel || editId || notchMode)) {
        e.stopPropagation(); e.preventDefault();
        if (pen || box) { setPen(null); setBox(null); } else if (notchMode) setNotchMode(false); else if (editId) { setEditId(null); setSelNode(-1); } else { setSel(null); setMulti(new Set()); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "a") { e.preventDefault(); selectIds(piecesRef.current.filter((p) => !blocked(p.pid)).map((p) => p.id)); return; }
      if ((e.ctrlKey || e.metaKey) && k === "d") { e.preventDefault(); duplicateSel(); return; }
      if (e.key === "Enter" && pen) { e.preventDefault(); commitPen(); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && pen) { e.preventDefault(); setPen(pen.nodes.length > 1 ? { ...pen, nodes: pen.nodes.slice(0, -1) } : null); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && editId && selNode >= 0) {
        e.preventDefault();
        const pc = piecesRef.current.find((x) => x.id === editId);
        if (pc?.shape.k === "path" && pc.shape.nodes.length > 3) { patchPiece(editId, (x) => (x.shape.k === "path" ? { ...x, shape: { k: "path", nodes: x.shape.nodes.filter((_, i) => i !== selNode) } } : x)); setSelNode(-1); }
        else setMsg({ tone: "err", text: t("รูปต้องมีอย่างน้อย 3 จุด", "A shape needs at least 3 points") });
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selIdsRef.current.length) { e.preventDefault(); deleteSel(); return; }
      if (e.key.startsWith("Arrow") && selIdsRef.current.length) {
        e.preventDefault();
        const d = step * (e.shiftKey ? 10 : 1);
        const [dx, dy] = e.key === "ArrowLeft" ? [-d, 0] : e.key === "ArrowRight" ? [d, 0] : e.key === "ArrowUp" ? [0, -d] : [0, d];
        const ids = new Set(selIdsRef.current);
        commit(piecesRef.current.map((p) => (ids.has(p.id) ? movePiece(p, dx, dy) : p)), `nudge-${[...ids].join(",")}`);
        return;
      }
      if (e.key === " ") { spaceDown.current = true; e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, Tool> = { r: "rect", o: "ellipse", e: "ellipse", p: "pen", v: "move", h: "hand", m: "measure", ...(seams ? { n: "sew", j: "sewpart", k: "sewmany", b: "sewedit" } : {}), ...(innerLines ? { l: "inner" } : {}) };
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
      if (txt && clipRef.current && txt.includes(`pshape:${clipRef.current.id}`)) { e.preventDefault(); pasteInternal(); return; }
      if (txt && /<svg[\s>]/i.test(txt)) { e.preventDefault(); importRef.current(txt); return; }
      if (txt || cd.files?.length) setMsg({ tone: "err", text: t("สิ่งที่วางไม่ใช่รูปทรงจาก Illustrator — ใน Illustrator ไปที่ Preferences → Clipboard Handling → ติ๊ก Include SVG Code แล้วก๊อปใหม่", "That isn't a shape from Illustrator — enable Preferences → Clipboard Handling → Include SVG Code, then copy again") });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp);
    // Ctrl+C: ก๊อปชิ้นที่เลือก (ในกระดาน) + ใส่ SVG ขนาดจริงลงคลิปบอร์ด (เอาไปวางใน Illustrator ได้)
    const onCopy = (e: ClipboardEvent) => {
      if (inField(e.target) || (embedded && !engaged.current)) return;
      const ids = selIdsRef.current;
      if (!ids.length || !e.clipboardData) return;
      e.preventDefault();
      const svg = copySel(ids);
      e.clipboardData.setData("text/plain", svg);
      e.clipboardData.setData("image/svg+xml", svg);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", onCopy);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("paste", onPaste); window.removeEventListener("copy", onCopy); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pen, box, sel, multi, editId, selNode, step, mDraft, cal, readonly, notchMode, tool, sewA, sewP, sewSel, edgeSel, seams, innerA, innerLines, manyA, innerSel]);
  useEffect(() => { setNotchMode(false); }, [sel]);   // เปลี่ยนชิ้น = ออกจากโหมดรอยบาก

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
  // ── เครื่องมือ vector ──
  const deleteSel = () => { const ids = new Set(selIdsRef.current); if (!ids.size) return; commit(piecesRef.current.filter((p) => !ids.has(p.id))); setSel(null); setMulti(new Set()); setEditId(null); };
  /** ก๊อปชิ้นที่เลือกไว้ในกระดาน + คืน SVG ขนาดจริง (ซม.) ไว้ใส่คลิปบอร์ด */
  const copySel = (ids: string[] = selIdsRef.current): string => {
    const ps = piecesRef.current.filter((p) => ids.includes(p.id));
    const id = newId();
    clipRef.current = { id, pieces: JSON.parse(JSON.stringify(ps)) as Piece[], n: 0 };
    const B = unionBox(ps.map((p) => shapeBox(p.shape)));
    const f = (v: number) => String(Math.round(v * 1000) / 1000);
    const body = ps.map((p) => `<path fill="none" stroke="#000" stroke-width="0.05" fill-rule="evenodd" d="${shapePathD(p.shape, -B.x, -B.y)}${p.holes.map((h) => shapePathD(h, -B.x, -B.y)).join("")}"/>`).join("");
    setMsg({ tone: "ok", text: t(`คัดลอก ${ps.length} ชิ้นแล้ว — Ctrl+V วางในกระดาน หรือวางใน Illustrator ได้ (ขนาดจริง)`, `Copied ${ps.length} pieces — Ctrl+V here, or paste into Illustrator (real size)`) });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(B.w)}cm" height="${f(B.h)}cm" viewBox="0 0 ${f(B.w)} ${f(B.h)}"><!--pshape:${id}-->${body}</svg>`;
  };
  const copyButton = () => { const svg = copySel(); try { void navigator.clipboard?.writeText(svg).catch(() => {}); } catch { /* ไม่ได้ก็ยังวางในกระดานได้ */ } };
  /** วางชิ้นที่ก๊อปไว้ (วัสดุ/เผื่อพับ/รู/เครื่องหมายครบ) เยื้อง 2 ซม. ทุกครั้งที่วาง */
  const pasteInternal = () => {
    const c = clipRef.current;
    if (!c || !c.pieces.length) { setMsg({ tone: "err", text: t("ยังไม่ได้คัดลอกชิ้น — เลือกชิ้นแล้วกด Ctrl+C", "Nothing copied yet — select pieces and press Ctrl+C") }); return; }
    c.n += 1;
    const off = 2 * c.n;
    const add = c.pieces.map((p) => ({ ...movePiece(p, off, off), id: newId(), pid: newPid(), src: [] as string[] }));
    const next = addPieces(add, false);
    if (next) { selectIds(add.map((p) => p.id)); setTool("move"); }
  };
  const duplicateSel = () => { if (!selIdsRef.current.length) return; copySel(); pasteInternal(); };
  /** จัดแนวชิ้นที่เลือก (ตามกรอบตัด) */
  const alignSel = (m: "l" | "cx" | "r" | "t" | "cy" | "b") => {
    const ids = new Set(selIdsRef.current); if (ids.size < 2) return;
    const boxes = new Map(piecesRef.current.filter((p) => ids.has(p.id)).map((p) => [p.id, pieceGeometry(p).cutBox]));
    const U = unionBox([...boxes.values()]);
    commit(piecesRef.current.map((p) => {
      const b = boxes.get(p.id); if (!b) return p;
      const dx = m === "l" ? U.x - b.x : m === "r" ? U.x + U.w - b.x - b.w : m === "cx" ? U.x + U.w / 2 - b.x - b.w / 2 : 0;
      const dy = m === "t" ? U.y - b.y : m === "b" ? U.y + U.h - b.y - b.h : m === "cy" ? U.y + U.h / 2 - b.y - b.h / 2 : 0;
      return dx || dy ? movePiece(p, dx, dy) : p;
    }));
  };
  /** เว้นระยะห่างเท่ากัน (≥3 ชิ้น) — ชิ้นหัว/ท้ายอยู่ที่เดิม */
  const distributeSel = (axis: "x" | "y") => {
    const ids = new Set(selIdsRef.current); if (ids.size < 3) return;
    const items = piecesRef.current.filter((p) => ids.has(p.id)).map((p) => ({ p, b: pieceGeometry(p).cutBox })).sort((a, b) => (axis === "x" ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = items[0].b, last = items[items.length - 1].b;
    const span = axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y;
    const sum = items.reduce((m, it) => m + (axis === "x" ? it.b.w : it.b.h), 0);
    const gap = (span - sum) / (items.length - 1);
    let pos = axis === "x" ? first.x : first.y;
    const moved = new Map<string, Piece>();
    for (const it of items) { const d = pos - (axis === "x" ? it.b.x : it.b.y); moved.set(it.p.id, axis === "x" ? movePiece(it.p, d, 0) : movePiece(it.p, 0, d)); pos += (axis === "x" ? it.b.w : it.b.h) + gap; }
    commit(piecesRef.current.map((p) => moved.get(p.id) ?? p));
  };
  const applyRound = () => {
    const pr = parseLength(roundR, unit), r = pr.ok ? pr.cm : NaN;
    if (!selPiece || !(r > 0)) { setMsg({ tone: "err", text: t(`ใส่รัศมีมุมโค้ง เช่น ${fmtL(1)}`, `Enter a corner radius, e.g. ${fmtL(1)}`) }); return; }
    if (selPiece.shape.k === "ellipse") { setMsg({ tone: "err", text: t("วงกลมไม่มีมุมให้ลบ", "Circles have no corners") }); return; }
    patchPiece(selPiece.id, (p) => ({ ...p, shape: roundCorners(p.shape, r) }));
  };
  /** สร้างชิ้นคู่ที่ผูกกับชิ้นที่เลือก (กลับซ้ายขวา) วางข้าง ๆ — แก้ชิ้นต้นแบบแล้วชิ้นคู่เปลี่ยนตาม · ชิ้นที่เลือกเป็นชิ้นตามอยู่ = ผูกกับต้นแบบตัวเดียวกัน */
  const linkedCopy = () => {
    if (!selPiece) return;
    const master = selPiece.link ? pieces.find((p) => p.pid === selPiece.link?.to) ?? selPiece : selPiece;
    const cb = pieceGeometry(selPiece).cutBox, b = shapeBox(selPiece.shape), link: PieceLink = { to: master.pid, mirror: "x" };
    const np: Piece = { ...selPiece, id: newId(), pid: newPid(), src: [], link, inner: null, notches: [], grain: null, shape: linkedShape(master.shape, link, { x: b.x + cb.w + 2, y: b.y }), name: selPiece.name ? `${selPiece.name} (คู่)` : "" };
    const next = addPieces([np]);
    if (!next) return;
    setTool("move");
    sewLikeMaster(np.pid, next, t("สร้างชิ้นคู่แล้ว", "Linked twin created"));
  };
  /** คัดลอกตะเข็บของชิ้นต้นแบบให้ชิ้นตาม (lib/pattern-link followerSeams) — เฉพาะหน้าที่มีเครื่องมือเย็บ · บอกผลเป็นข้อความ */
  const sewLikeMaster = (pid: string, list: Piece[] = piecesRef.current, lead = "") => {
    if (!seams || !onSeamsChange || readonly) { if (lead) setMsg({ tone: "ok", text: lead }); return; }
    const cur = seams, { add, skipped } = followerSeams(list, cur, pid, Date.now().toString(36));
    if (add.length) { pushSeamHist(cur); emitSeams([...cur, ...add]); }
    const body = add.length || skipped
      ? t(`เย็บตามชิ้นต้นแบบให้ ${add.length} แนว${skipped ? ` · ข้าม ${skipped} แนว (หาขอบคู่ไม่เจอ หรือขอบนั้นเย็บไปแล้ว — เย็บเองด้วยเครื่องมือเย็บ)` : ""}`, `${add.length} seams copied from the master${skipped ? ` · ${skipped} skipped (no matching edge, or it is already sewn — sew those yourself)` : ""}`)
      : t("ชิ้นต้นแบบยังไม่มีตะเข็บให้คัดลอก (หรือมีครบแล้ว)", "The master has no seams to copy (or they are all there already)");
    setMsg({ tone: skipped && !add.length ? "err" : "ok", text: lead ? `${lead} · ${body}` : body });
  };
  const mirrorCopy = () => {
    if (!selPiece) return;
    const cb = pieceGeometry(selPiece).cutBox;
    const f = movePiece(flipPiece(selPiece, "x"), cb.w + 2, 0);
    const np: Piece = { ...f, id: newId(), pid: newPid(), src: [], name: selPiece.name ? `${selPiece.name} (กลับ)` : "" };
    if (addPieces([np])) setTool("move");
  };
  const offsetCopy = (sign: 1 | -1) => {
    const pd = parseLength(offD, unit), d = pd.ok ? pd.cm : NaN;
    if (!selPiece || !(d > 0)) { setMsg({ tone: "err", text: t(`ใส่ระยะ เช่น ${fmtL(1)}`, `Enter a distance, e.g. ${fmtL(1)}`) }); return; }
    const sh = offsetShape(selPiece.shape, sign * d);
    if (!sh) { setMsg({ tone: "err", text: t("ชิ้นเล็กเกินจะหดเข้าเท่านี้", "The piece is too small to shrink that much") }); return; }
    const label = sign < 0 ? t(`ด้านใน ${fmtL(d)}`, `inner ${fmtL(d)}`) : t(`ด้านนอก ${fmtL(d)}`, `outer ${fmtL(d)}`);
    const np: Piece = { id: newId(), shape: sh, holes: [], count: selPiece.count, allow: 0, name: `${selPiece.name || `P${pieces.indexOf(selPiece) + 1}`} (${label})`, mats: [], pid: newPid(), src: [] };
    if (addPieces([np])) { setTool("move"); setMsg({ tone: "ok", text: t("สร้างชิ้นเส้นขนานแล้ว (ซ้อนอยู่ตำแหน่งเดิม · ยังไม่เลือกวัสดุ เช่น ผ้ากาว/ซับใน)", "Offset piece created (on top of the original · pick a material, e.g. interfacing)") }); }
  };
  /** รวม / ตัดออก / ส่วนทับ ชิ้นที่เลือก — ชิ้นหลัก = ชิ้นที่อยู่ก่อนบนกระดาน (P เลขน้อยสุด) เก็บวัสดุ/เผื่อพับ/บรรทัดตีราคาเดิม · ชิ้นอื่นที่เลือกหายไป */
  const booleanSel = (op: BoolOp) => {
    const ids = new Set(selIdsRef.current);
    const list = piecesRef.current.filter((p) => ids.has(p.id));
    if (list.length < 2) return;
    const base = list[0], no = piecesRef.current.indexOf(base) + 1;
    const res = booleanPieces(op, list.map((p) => ({ shape: p.shape, holes: p.holes })));
    if (!res.length) {
      setMsg({ tone: "err", text: op === "intersect" ? t("ชิ้นที่เลือกไม่มีส่วนที่ซ้อนกัน", "The selected pieces don't overlap") : t(`ตัดแล้วไม่เหลืออะไรจาก P${no} (ชิ้นที่ตัดคลุมทั้งชิ้น)`, `Nothing left of P${no} (the cutter covers it)`) });
      return;
    }
    const onEdge = (shape: Shape, notches?: Pt[]) => { const P = flattenShape(shape); return (notches ?? []).filter((n) => projectOnOutline(P, n).d < 0.05); };
    const first: Piece = { ...base, shape: res[0].shape, holes: res[0].holes, notches: onEdge(res[0].shape, base.notches) };
    const extra: Piece[] = res.slice(1).map((r, i) => ({ ...base, id: newId(), pid: newPid(), src: [], shape: r.shape, holes: r.holes, notches: [], name: base.name ? `${base.name} (${i + 2})` : "" }));
    const drop = new Set(list.slice(1).map((p) => p.id));
    const next: Piece[] = [];
    for (const p of piecesRef.current) { if (drop.has(p.id)) continue; if (p.id === base.id) next.push(first, ...extra); else next.push(p); }
    commit(next);
    setMulti(new Set()); setSel(base.id); setEditId(null); setTool("move");
    const what = op === "union" ? (res.length === 1 ? t("รวมเป็นชิ้นเดียวแล้ว", "Merged into one piece") : t(`รวมแล้วได้ ${res.length} ชิ้น (บางชิ้นไม่ได้ซ้อนกัน)`, `Merged into ${res.length} pieces (some didn't overlap)`))
      : op === "subtract" ? t(`ตัดออกจาก P${no} แล้ว${res.length > 1 ? ` · แยกเป็น ${res.length} ชิ้น` : ""}${res[0].holes.length ? ` · มีรู ${res[0].holes.length}` : ""}`, `Cut out of P${no}${res.length > 1 ? ` · split into ${res.length}` : ""}`)
      : t("เหลือเฉพาะส่วนที่ซ้อนกันแล้ว", "Kept only the overlapping part");
    setMsg({ tone: "ok", text: `${what} — ${t(`ใช้วัสดุ/เผื่อพับของ P${no} · ชิ้นอื่นที่เลือกถูกเอาออก · Ctrl+Z ย้อนได้`, `uses P${no}'s materials/allowance · other selected pieces removed · Ctrl+Z to undo`)}` });
  };
  const toggleGrain = () => { if (selPiece) patchPiece(selPiece.id, (p) => ({ ...p, grain: p.grain ? null : defaultGrain(p.shape) })); };
  const turnGrain = () => {
    if (!selPiece?.grain || selPiece.grain.length !== 2) return;
    const [[x1, y1], [x2, y2]] = selPiece.grain, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    patchPiece(selPiece.id, (p) => ({ ...p, grain: [[mx - (y1 - my), my + (x1 - mx)], [mx - (y2 - my), my + (x2 - mx)]] }));
  };
  const setAllow = (v: number) => { if (!selPiece) return; const a = cleanAllow(v); patchPiece(selPiece.id, (p) => ({ ...p, allow: a, allowEdges: null }), `allow-${selPiece.id}`); setLastAllow(a); saveNum(ALLOW_KEY, a); };
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
      return { shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, allowEdges: edgeAllowances(p.shape, p.allowEdges, p.allow), foldEdges: cleanFoldEdges(p.shape, p.foldEdges), edgeMeta: cleanEdgeMeta(p.shape, p.edgeMeta), info: cleanPieceInfo(p.info), name: p.name.trim(), mats: p.mats, geo: g, pid: p.pid, src: p.src, at: [Math.round(g.finished.x * 1000) / 1000, Math.round(g.finished.y * 1000) / 1000], grain: p.grain ?? null, notches: p.notches ?? [], inner: p.inner ?? [], link: p.link ?? null };
    }),
    basis: basisRef.current,
    refs: refsRef.current.map((r) => ({ url: r.url, ...(r.label ? { label: r.label } : {}), x: r.x, y: r.y, w: r.w, ar: r.ar, op: r.op })),
  });
  const save = () => {
    if (!pieces.length) { setMsg({ tone: "err", text: t("ยังไม่มีชิ้น — วาดหรือวางจาก Illustrator ก่อน", "No pieces yet — draw or paste from Illustrator first") }); return; }
    onSave?.(buildResult());
  };
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const sigOf = () => JSON.stringify([piecesRef.current.map((p) => [p.shape, p.holes, p.count, p.allow, p.name, p.mats, p.pid, p.grain, p.notches, p.allowEdges ?? null, p.foldEdges ?? null, p.edgeMeta ?? null, p.info ?? null, p.inner ?? null, p.link ?? null]), basisRef.current, refsRef.current.map((r) => [r.url, r.x, r.y, r.w, r.ar, r.op])]);
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
  // ภาพสดของชิ้นบนกระดาน (ตอนเปิด + ทุกครั้งที่ขยับ รวมระหว่างลาก) → ภาพ 3D วาดตาม · ไม่แตะการบันทึก
  const onLiveRef = useRef(onLive); onLiveRef.current = onLive;
  useEffect(() => {
    if (!onLiveRef.current) return;
    const id = setTimeout(() => onLiveRef.current?.(buildResult().pieces), 120);
    return () => clearTimeout(id);
  }, [pieces]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  const fmtLen = (n: number) => fmtL(n);
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
    if (mDraft?.kind === "edge") { finishEdge(edgeStep(mDraft, raw)); return; }   // คลิกจุดปลาย
    const hid = target.getAttribute?.("data-piece");
    const g = hid ? geo.get(hid) : null;
    if (!hid || !g) { drag.current = { k: "pan", sx: e.clientX, sy: e.clientY, v: view }; capture(); return; }   // วัดตามขอบ: กดนอกชิ้น = ลากเลื่อนกระดาน
    const pr = projectOnOutline(g.sew, [raw.x, raw.y]);
    setMDraft({ kind: "edge", pieceId: hid, a: pr.at, hover: null, pos: pr.pos, travel: 0, last: pr.pos });
    drag.current = { k: "medge", sx: e.clientX, sy: e.clientY, moved: false }; capture();
  };
  /** เคอร์เซอร์ขยับ → ระยะตามขอบสะสมตามทิศที่ลาก (อ้อมทางไหนก็ได้ · ไม่เกิน 1 รอบ) */
  const edgeStep = (m: Extract<MDraft, { kind: "edge" }>, raw: XY): Extract<MDraft, { kind: "edge" }> => {
    const g = geo.get(m.pieceId);
    if (!g) return { ...m, hover: raw };
    const total = outlineLength(g.sew), st = outlineStep(g.sew, m.last, [raw.x, raw.y]);
    return { ...m, hover: raw, last: st.pos, travel: Math.max(-total, Math.min(total, m.travel + st.delta)) };
  };
  const finishEdge = (m: Extract<MDraft, { kind: "edge" }>) => {
    const g = geo.get(m.pieceId);
    setMDraft(null);
    if (!g || Math.abs(m.travel) < 0.05) return;
    const total = outlineLength(g.sew), len = Math.abs(m.travel);
    addMeasure({ kind: "edge", nodes: [], len, alt: Math.max(0, total - len), path: outlineWalk(g.sew, m.pos, m.travel) });
  };

  // ── วาดไม้บรรทัด / ตาราง ──
  const rs = rulerSteps(ppc);
  const gridStep = snap > 0 && snap * ppc >= 6 ? snap : rs.minor;
  const fs = view.w / 60;
  const cursor = tool === "hand" ? "grab" : tool === "move" ? "default" : "crosshair";
  const btnCls = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs ${on ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const editPiece = editId ? pieces.find((p) => p.id === editId) ?? null : null;
  // ── เครื่องมือเย็บ (แบบ CLO: เย็บบนกระดานเดิม · คู่เดียวกันสีเดียวกัน · ขีดบอกจุดเริ่ม) ──
  const seamList = seams ?? [];
  const byPidShape = useMemo(() => new Map(pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner }])), [pieces]);
  const seamChecks = useMemo(() => seamList.map((x) => checkSeam(byPidShape, x, seamTol)), [seamList, byPidShape, seamTol]);   // eslint-disable-line react-hooks/exhaustive-deps
  const seamBad = seamChecks.some((c, i) => c.status === "broken" || (c.status === "mismatch" && !seamList[i]?.ease));
  const canSew = !readonly && !!onSeamsChange;
  const seamAt = (pid: string, i: number, n: number) => seamList.find((x) => (x.a.pid === pid && x.a.n === n && sideHasEdge(x.a, i)) || (x.b.pid === pid && x.b.n === n && sideHasEdge(x.b, i)));
  const commitSeams = (next: Seam[]) => { if (!onSeamsChange) return; pushSeamHist(seamList); emitSeams(next); };
  const patchSeam = (id: string, f: (x: Seam) => Seam) => { if (!canSew) return; commitSeams(seamList.map((x) => (x.id === id ? f(x) : x))); };
  const removeSeam = (id: string) => { if (!canSew) return; commitSeams(seamList.filter((x) => x.id !== id)); setSewSel(null); };
  const reverseSeam = (id: string) => { if (!canSew) return; commitSeams(seamList.map((x) => (x.id === id ? (x.rev ? { id: x.id, a: x.a, b: x.b } : { ...x, rev: true }) : x))); };
  const sideFree = (side: SeamSide) => { for (let k = 0; k < side.count; k++) if (seamAt(side.pid, (side.from + k) % side.n, side.n)) return false; return true; };
  const sewClick = (key: string, shift: boolean) => {
    const [pid, iS, nS] = key.split(":"), i = Number(iS), n = Number(nS);
    const hit = seamAt(pid, i, n);
    if (tool === "sewedit") { setSewSel(hit?.id ?? null); setEdgeSel({ pid, i, n }); return; }
    if (!canSew) return;
    if (shift && sewA && sewA.pid === pid && !sideHasEdge(sewA, i)) { const ext = extendSide(sewA, i); if (ext && sideFree(ext)) { setSewA(ext); return; } }
    if (shift && !sewA && lastSeam.current && !hit) {
      const last = seamList.find((x) => x.id === lastSeam.current);
      const ext = last && last.b.pid === pid && !sideHasEdge(last.b, i) ? extendSide(last.b, i) : null;
      if (last && ext) { commitSeams(seamList.map((x) => (x.id === last.id ? { ...x, b: ext } : x))); return; }
    }
    if (hit) { setMsg({ tone: "err", text: t("ขอบนี้เย็บไปแล้ว — ใช้เครื่องมือแก้ตะเข็บ (B) ลบของเดิมก่อน", "This edge is already sewn — delete the old seam with Edit sewing (B) first") }); return; }
    if (!sewA) { setSewA({ pid, from: i, count: 1, n }); return; }
    if (sewA.pid === pid && sideHasEdge(sewA, i)) { setSewA(null); return; }
    const id = `s${Date.now().toString(36)}${seamList.length}`;
    commitSeams([...seamList, { id, a: sewA, b: { pid, from: i, count: 1, n } }]);
    lastSeam.current = id; setSewA(null);
  };
  /**
   * เครื่องมือเย็บ 1 ขอบกับหลายชิ้น: กดขอบหลัก (ขอบยาว) → กดขอบของชิ้นที่จะมาต่อทีละชิ้น ระบบวางช่วงต่อกันไปตามขอบหลัก ยาวเท่าขอบของชิ้นนั้น
   * ตะเข็บทุกแนวของรอบเดียวกันได้ group เดียวกัน → ตัวประกอบ 3D เข้าใจว่าเป็นชิ้นคั่นกลางหลายชิ้นรอบแผ่นเดียว · ครบทั้งขอบ = จบเอง · Enter/Esc = จบก่อน
   */
  const sewManyClick = (key: string, raw: XY) => {
    if (!canSew) return;
    const [pid, iS, nS] = key.split(":"), i = Number(iS), n = Number(nS), pc = pieces.find((p) => p.pid === pid), ed = pc ? pieceEdges(pc.shape)[i] : null;
    if (!pc || !ed) return;
    const L = ed.len;
    if (!manyA) {
      // จุดเริ่มบนขอบหลัก: ใกล้ต้นขอบหรือปลายช่วงที่เย็บไว้แล้ว = ดูดเข้าจุดนั้น (ต่อจากของเดิม) · ไม่งั้นเริ่มตรงที่กด
      const busy = edgeBusy(seamList, pid, i, n, L), pos = posOnLine(ed.pts, [raw.x, raw.y]).pos;
      // ผู้ใช้ไม่เห็นว่าขอบเริ่มนับจากปลายไหน → กดใกล้ปลายไหน ระบบไล่ช่วงออกจากปลายนั้น (dir) · จุดต่อ = ปลายขอบ หรือปลายของช่วงที่เย็บไว้แล้ว
      const fwd = [0, ...busy.map(([, q]) => q)].filter((v) => v < L - 0.05), back = [L, ...busy.map(([p0]) => p0)].filter((v) => v > 0.05);
      const best = [...fwd.map((v) => ({ v, dir: 1 as const })), ...back.map((v) => ({ v, dir: -1 as const }))].sort((a, b) => Math.abs(a.v - pos) - Math.abs(b.v - pos))[0];
      const snapTo = best && Math.abs(best.v - pos) <= Math.max(1.5, L * 0.08);
      const at = snapTo ? best.v : Math.max(0, Math.min(snapAlong(pos, L), L - SEAM_MIN_LEN));
      setManyA({ pid, i, n, at, dir: snapTo ? best.dir : 1, group: `g${Date.now().toString(36)}`, made: 0 }); setSewSel(null); setEdgeSel(null); setSewA(null); setSewP(null);
      return;
    }
    if (manyA.pid === pid && manyA.i === i) { setMsg({ tone: "err", text: t("นี่คือขอบหลัก — กดขอบของชิ้นที่จะมาเย็บต่อกับขอบนี้", "This is the main edge — click the edge of the piece that joins it") }); return; }
    const pa = pieces.find((p) => p.pid === manyA.pid), EA = pa ? pieceEdges(pa.shape) : [];
    if (!pa || EA.length !== manyA.n || !EA[manyA.i]) { setManyA(null); return; }
    const LA = EA[manyA.i].len, t0 = manyA.dir > 0 ? manyA.at : manyA.at - L, t1 = t0 + L, room = manyA.dir > 0 ? LA - manyA.at : manyA.at;
    if (seamList.filter((x) => [x.a, x.b].some((q) => q.pid === pid && q.n === n && sideHasEdge(q, i))).length >= Math.max(1, pc.count)) { setMsg({ tone: "err", text: t("ขอบนี้เย็บไปแล้ว — ใช้เครื่องมือแก้ตะเข็บ (B) ลบของเดิมก่อน", "This edge is already sewn — delete the old seam with Edit sewing (B) first") }); return; }
    if (L > room + 0.1) { setMsg({ tone: "err", text: t(`ขอบหลักเหลือ ${fmtL(room)} แต่ขอบนี้ยาว ${fmtL(L)} — ยาวเกิน ปรับความยาวของชิ้นก่อน หรือกด Esc เพื่อจบ`, `The main edge has ${fmtL(room)} left but this edge is ${fmtL(L)} — too long. Adjust the piece, or press Esc to finish`) }); return; }
    const start = Math.max(0, t0), end = Math.min(t1, LA);
    if (!rangeFree(edgeBusy(seamList, manyA.pid, manyA.i, manyA.n, LA), start, end, pa.count)) { setMsg({ tone: "err", text: t("ช่วงถัดไปของขอบหลักเย็บไปแล้ว — กด Esc แล้วเริ่มใหม่จากตำแหน่งที่ยังว่าง", "The next stretch of the main edge is already sewn — press Esc and start from a free position") }); return; }
    const id = `s${Date.now().toString(36)}${seamList.length}`;
    commitSeams([...seamList, { id, a: rangedSide(manyA.pid, manyA.i, manyA.n, start, end, LA), b: { pid, from: i, count: 1, n }, group: manyA.group }]);
    lastSeam.current = null;
    if (room - L < 0.1) { setManyA(null); setMsg({ tone: "ok", text: t(`เย็บครบทั้งขอบแล้ว (${manyA.made + 1} ชิ้น)`, `The whole edge is sewn (${manyA.made + 1} pieces)`) }); }
    else setManyA({ ...manyA, at: manyA.dir > 0 ? end : start, made: manyA.made + 1 });
  };
  /** กดเส้นในชิ้นตอนถือเครื่องมือเย็บ: เส้นในเป็นด้านของตะเข็บได้ทั้งเส้น (เย็บกับขอบ / ช่วงของขอบ / เส้นในของชิ้นอื่น) */
  const sewInnerClick = (key: string) => {
    const [pid, id] = key.split(":"), side: SeamSide = { pid, from: 0, count: 1, n: 1, inner: id };
    const hit = seamList.find((x) => [x.a, x.b].some((q) => q.pid === pid && q.inner === id));
    if (tool === "sewedit") { setSewSel(hit?.id ?? null); setEdgeSel(null); return; }
    if (!canSew) return;
    if (hit) { setMsg({ tone: "err", text: t("เส้นในนี้เย็บไปแล้ว — ใช้เครื่องมือแก้ตะเข็บ (B) ลบของเดิมก่อน", "This inner line is already sewn — delete the old seam with Edit sewing (B) first") }); return; }
    if (!sewA) { setSewA(side); setSewP(null); return; }
    if (sewA.pid === pid && sewA.inner === id) { setSewA(null); return; }
    const sid = `s${Date.now().toString(36)}${seamList.length}`;
    commitSeams([...seamList, { id: sid, a: sewA, b: side }]);
    lastSeam.current = null; setSewA(null); if (tool === "sewpart") setSewSel(sid);
  };
  const pieceNo = (pid: string) => { const k = pieces.findIndex((p) => p.pid === pid); return k < 0 ? "?" : `P${k + 1}${pieces[k].name ? ` ${pieces[k].name}` : ""}`; };
  const sideTxt = (x: SeamSide) => {
    if (isInnerSide(x)) { const l = pieces.find((q) => q.pid === x.pid)?.inner?.find((q) => q.id === x.inner); return `${pieceNo(x.pid)} · ${t("เส้นใน", "inner line")}${l?.name ? ` ${l.name}` : ""}`; }
    const base = `${pieceNo(x.pid)} · ${x.count > 1 ? t(`${x.count} ขอบติดกัน`, `${x.count} joined edges`) : t(`ขอบ ${x.from + 1}`, `edge ${x.from + 1}`)}`;
    const S = isPartialSide(x) ? byPidShape.get(x.pid) : null, r = S ? sideRange(S, x) : null;
    return r ? `${base} ${t(`ช่วง ${fmtN(r.t0)}–${fmtL(r.t1)}`, `range ${fmtN(r.t0)}–${fmtL(r.t1)}`)}` : base;
  };
  // ── เย็บบางช่วงของขอบ + ย้าย/ปรับช่วงหลังเย็บ (2026-11-11) ──
  /** ระยะตามขอบที่ใช้วางจุด: ลงล็อกทีละ 0.5 ซม. (หรือละเอียดกว่าตามค่าลงล็อกของกระดาน) · ใกล้ปลายขอบ = ดูดเข้าปลาย */
  const snapAlong = (v: number, len: number) => { const st = Math.min(snap > 0 ? snap : 0.1, 0.5), r = Math.round(v / st) * st; return r < 0.3 ? 0 : r > len - 0.3 ? len : Math.round(r * 100) / 100; };
  /** ด้านของตะเข็บที่อยู่บนขอบเดียว: ขอบ + ช่วงที่เย็บตอนนี้ (ด้านหลายขอบ / ชิ้นถูกแก้จนขอบเปลี่ยน = null → ปรับช่วงไม่ได้) */
  const seamEdge = (id: string, which: "a" | "b") => {
    const x = seamList.find((q) => q.id === id), side = x?.[which], pc = side ? pieces.find((p) => p.pid === side.pid) : null;
    if (!x || !side || !pc || side.count !== 1 || isInnerSide(side)) return null;   // ด้านบนเส้นใน = ทั้งเส้น ปรับช่วงไม่ได้
    const E = pieceEdges(pc.shape);
    if (E.length !== side.n || !E[side.from]) return null;
    const ed = E[side.from], part = isPartialSide(side);
    return { x, side, ed, cap: pc.count, t0: part ? Math.max(0, side.t0 as number) : 0, t1: part ? Math.min(ed.len, side.t1 as number) : ed.len };
  };
  /** กดบนเส้นตะเข็บ: เลือกตะเข็บนั้น + เริ่มลากย้ายช่วง (คืน true = เริ่มลากแล้ว) */
  const seamGrab = (id: string, which: "a" | "b", raw: XY): boolean => {
    const g = seamEdge(id, which), x = seamList.find((q) => q.id === id);
    setSewSel(id); setSewA(null); setSewP(null);
    setEdgeSel(tool === "sewedit" && x && !isInnerSide(x[which]) ? { pid: x[which].pid, i: x[which].from, n: x[which].n } : null);
    if (!g || !canSew) return false;
    drag.current = { k: "seam", mode: "move", id, which, end: 0, off: posOnLine(g.ed.pts, [raw.x, raw.y]).pos - g.t0, moved: false };
    return true;
  };
  /** ระหว่างลาก: ย้ายทั้งช่วง หรือยืด/หดปลายข้างหนึ่ง — ส่งตะเข็บใหม่ออกทันที (ภาพ 3D ขยับตาม) · ย้อนกลับได้ 1 ครั้งต่อการลาก */
  const seamDrag = (d: Extract<Drag, { k: "seam" }>, raw: XY) => {
    const g = seamEdge(d.id, d.which);
    if (!g || !canSew) return;
    const L = g.ed.len, pos = posOnLine(g.ed.pts, [raw.x, raw.y]).pos;
    let t0 = g.t0, t1 = g.t1;
    if (d.mode === "move") { const w = g.t1 - g.t0; t0 = Math.max(0, Math.min(L - w, snapAlong(pos - d.off, L))); t1 = t0 + w; }
    else if (d.end === 0) t0 = Math.min(snapAlong(pos, L), g.t1 - SEAM_MIN_LEN);
    else t1 = Math.max(snapAlong(pos, L), g.t0 + SEAM_MIN_LEN);
    if (t0 < -1e-6 || t1 > L + 1e-6 || (Math.abs(t0 - g.t0) < 1e-6 && Math.abs(t1 - g.t1) < 1e-6)) return;
    if (!rangeFree(edgeBusy(seamList, g.side.pid, g.side.from, g.side.n, L, { id: d.id, which: d.which }), t0, t1, g.cap)) return;
    const side = rangedSide(g.side.pid, g.side.from, g.side.n, t0, t1, L);
    const next = seamList.map((q) => (q.id === d.id ? (d.which === "a" ? { ...q, a: side } : { ...q, b: side }) : q));
    if (!d.moved) { d.moved = true; commitSeams(next); } else onSeamsChange?.(next);
  };
  /** ตั้งช่วงของด้านด้วยตัวเลข — เกินขอบ / สั้นเกิน / ทับตะเข็บอื่น = ไม่เปลี่ยน + บอกเหตุผล */
  const setSeamRange = (id: string, which: "a" | "b", t0: number, t1: number): boolean => {
    const g = seamEdge(id, which);
    if (!g || !canSew) return false;
    const L = g.ed.len, a = Math.round(t0 * 100) / 100, b = Math.round(t1 * 100) / 100;
    if (a < -1e-6 || b > L + 0.005 || b - a < SEAM_MIN_LEN - 1e-6) { setMsg({ tone: "err", text: t(`ช่วงนี้เกินขอบ (ขอบยาว ${fmtL(L)}) หรือสั้นกว่า ${fmtL(SEAM_MIN_LEN)}`, `That range runs past the edge (${fmtL(L)} long) or is shorter than ${fmtL(SEAM_MIN_LEN)}`) }); return false; }
    if (!rangeFree(edgeBusy(seamList, g.side.pid, g.side.from, g.side.n, L, { id, which }), a, b, g.cap)) { setMsg({ tone: "err", text: t("ช่วงนี้ทับกับตะเข็บอื่นบนขอบเดียวกัน", "That range overlaps another seam on the same edge") }); return false; }
    const side = rangedSide(g.side.pid, g.side.from, g.side.n, Math.max(0, a), Math.min(L, b), L);
    commitSeams(seamList.map((q) => (q.id === id ? (which === "a" ? { ...q, a: side } : { ...q, b: side }) : q)));
    return true;
  };
  /** ทำให้ด้าน target ยาวเท่าอีกด้าน (คงจุดเริ่ม · ถ้าล้นปลายขอบ = เลื่อนกลับ) */
  const fitSeam = (id: string, target: "a" | "b") => {
    const g = seamEdge(id, target);
    if (!g) return;
    const o = g.x[target === "a" ? "b" : "a"], S = byPidShape.get(o.pid), want = S ? sideLength(S, o) : null;
    if (want == null) return;
    if (want > g.ed.len + 0.005) { setMsg({ tone: "err", text: t(`${sideTxt(g.side)} ยาวแค่ ${fmtL(g.ed.len)} ยาวไม่พอ — ให้ปรับอีกด้านแทน`, `${sideTxt(g.side)} is only ${fmtL(g.ed.len)} long — adjust the other side instead`) }); return; }
    const t0 = Math.max(0, Math.min(g.t0, g.ed.len - want));
    if (setSeamRange(id, target, t0, t0 + want)) setMsg({ tone: "ok", text: t(`ปรับแล้ว ทั้งสองด้านยาว ${fmtL(want)}`, `Done — both sides are ${fmtL(want)}`) });
  };
  /** เครื่องมือเย็บบางช่วง: กดจุดเริ่ม → จุดจบบนขอบเดียวกัน → จุดเริ่มบนขอบของอีกชิ้น (ระบบวางให้ยาวเท่าช่วงแรก) */
  const sewPartClick = (key: string, raw: XY) => {
    if (!canSew) return;
    const [pid, iS, nS] = key.split(":"), i = Number(iS), n = Number(nS), pc = pieces.find((p) => p.pid === pid), ed = pc ? pieceEdges(pc.shape)[i] : null;
    if (!pc || !ed) return;
    const L = ed.len, pos = snapAlong(posOnLine(ed.pts, [raw.x, raw.y]).pos, L), busy = edgeBusy(seamList, pid, i, n, L);
    if (!sewA) {
      if (!sewP || sewP.pid !== pid || sewP.i !== i) {
        if (busy.some(([p, q]) => (pos > p + 0.01 && pos < q - 0.01) || (p <= 0.01 && q >= L - 0.01))) { setMsg({ tone: "err", text: t("ตรงนี้เย็บไปแล้ว — กดบนส่วนของขอบที่ยังว่าง หรือกดเส้นตะเข็บเดิมเพื่อย้าย", "This part is already sewn — click a free part of the edge, or click the seam to move it") }); return; }
        setSewP({ pid, i, n, at: pos }); setSewSel(null); return;
      }
      const a = Math.min(sewP.at, pos), b = Math.max(sewP.at, pos);
      if (b - a < SEAM_MIN_LEN) { setMsg({ tone: "err", text: t(`ช่วงสั้นเกินไป (อย่างน้อย ${fmtL(SEAM_MIN_LEN)}) — กดจุดจบให้ห่างจากจุดเริ่ม`, `Too short (at least ${fmtL(SEAM_MIN_LEN)}) — click the end further from the start`) }); return; }
      if (!rangeFree(busy, a, b)) { setMsg({ tone: "err", text: t("ช่วงนี้ทับกับตะเข็บเดิมบนขอบนี้", "That range overlaps a seam already on this edge") }); return; }
      setSewA(rangedSide(pid, i, n, a, b, L)); setSewP(null); return;
    }
    if (!isInnerSide(sewA) && sewA.pid === pid && sewA.from === i) { setMsg({ tone: "err", text: t("ด้านที่สองต้องเป็นอีกขอบหนึ่ง", "The second side must be a different edge") }); return; }
    const A = byPidShape.get(sewA.pid), want = (A ? sideLength(A, sewA) : null) ?? 0, w = Math.min(want, L), t0 = Math.max(0, Math.min(pos, L - w));
    if (w < SEAM_MIN_LEN || !rangeFree(busy, t0, t0 + w)) { setMsg({ tone: "err", text: t("วางช่วงตรงนี้ไม่ได้ (ทับกับตะเข็บเดิม หรือขอบสั้นเกินไป) — กดตำแหน่งอื่น", "Cannot place the range here (it overlaps a seam, or the edge is too short) — click elsewhere") }); return; }
    const id = `s${Date.now().toString(36)}${seamList.length}`;
    commitSeams([...seamList, { id, a: sewA, b: rangedSide(pid, i, n, t0, t0 + w, L) }]);
    lastSeam.current = null; setSewA(null); setSewSel(id); setEdgeSel(null);
    if (want > L + 0.1) setMsg({ tone: "err", text: t(`ขอบนี้ยาวแค่ ${fmtL(L)} สั้นกว่าช่วงแรก (${fmtL(want)}) — เย็บเต็มขอบให้แล้ว ปรับให้เท่ากันได้ในแผงขวา`, `This edge is only ${fmtL(L)}, shorter than the first range (${fmtL(want)}) — sewn along the whole edge; make them equal in the panel on the right`) });
  };
  const midOf = (P: Pt[]): Pt => { let L = 0; for (let k = 1; k < P.length; k++) L += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); let d = L / 2; for (let k = 1; k < P.length; k++) { const l = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); if (d <= l && l > 0) return [P[k - 1][0] + ((P[k][0] - P[k - 1][0]) * d) / l, P[k - 1][1] + ((P[k][1] - P[k - 1][1]) * d) / l]; d -= l; } return P[P.length - 1]; };
  const lineD = (P: Pt[]) => "M" + P.map((q) => `${q[0]} ${q[1]}`).join("L");
  const polyLen = (P: Pt[]) => { let L = 0; for (let k = 1; k < P.length; k++) L += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return L; };
  /** เลขความยาวข้างเส้นที่เย็บ (แบบ CLO) — ตัวหนังสือขนาดคงที่บนจอ มีขอบขาวให้อ่านออกบนชิ้น */
  const lenLabel = (P: Pt[], col: string) => { if (!(ppc > 0)) return null; const m = midOf(P); return <text x={m[0]} y={m[1] - 7 / ppc} fontSize={11 / ppc} textAnchor="middle" fill={col} stroke="#fff" strokeWidth={3 / ppc} paintOrder="stroke" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtN(polyLen(P))}</text>; };
  const edgePiece = edgeSel ? pieces.find((p) => p.pid === edgeSel.pid) ?? null : null;
  const edgeList = edgePiece ? pieceEdges(edgePiece.shape) : [];
  const selEdge = edgePiece && edgeSel && edgeList.length === edgeSel.n ? edgeList[edgeSel.i] ?? null : null;
  /** งานขอบที่เห็นบนชิ้น (2026-11-11): ขอบที่กุ๊น = แถบฟ้า · ขอบที่ติดซิป = ฟันซิป (เส้นประหนา) — วาดเสมอ ไม่ต้องถือเครื่องมือเย็บ */
  const finishLayer = pieces.some((p) => p.edgeMeta?.some((m) => m.bind || m.zip)) ? (
    <g style={{ pointerEvents: "none" }} data-edge-finish>
      {pieces.map((p) => {
        if (hidePids?.has(p.pid)) return null;
        const meta = cleanEdgeMeta(p.shape, p.edgeMeta);
        if (!meta) return null;
        return (
          <g key={p.id}>
            {pieceEdges(p.shape).map((e) => { const m = meta[e.i]; return !m?.bind && !m?.zip ? null : (
              <g key={e.i}>
                {m.bind && <path data-finish="bind" d={lineD(finishPts(e, m, "bind"))} fill="none" stroke="#0ea5e9" strokeOpacity={0.5} strokeWidth={6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                {m.zip && <>
                  <path data-finish="zip" d={lineD(finishPts(e, m, "zip"))} fill="none" stroke="#334155" strokeWidth={8} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
                  <path d={lineD(finishPts(e, m, "zip"))} fill="none" stroke="#f8fafc" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </>}
              </g>
            ); })}
          </g>
        );
      })}
    </g>
  ) : null;
  /** จุดที่แผงตรวจแบบชี้ (ขอบ หรือทั้งชิ้น) — เส้นประแดงหนา */
  const flagLayer = flagged?.length ? (
    <g style={{ pointerEvents: "none" }} data-flagged>
      {flagged.map((f, k) => {
        const p = pieces.find((x) => x.pid === f.pid);
        if (!p || hidePids?.has(p.pid)) return null;
        const E = pieceEdges(p.shape), list = f.edges?.length ? f.edges.map((i) => E[i]).filter(Boolean) : null;
        return list
          ? list.map((e) => <path key={`${k}-${e.i}`} d={lineD(e.pts)} fill="none" stroke="#dc2626" strokeOpacity={0.55} strokeWidth={8} strokeDasharray="4 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)
          : <path key={k} d={shapePathD(p.shape)} fill="none" stroke="#dc2626" strokeOpacity={0.55} strokeWidth={6} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />;
      })}
    </g>
  ) : null;
  /** เส้นของตะเข็บทั้งหมดบนกระดาน: ขอบทั้งสองด้านสีเดียวกัน + เส้นประโยงคู่ + ขีดบอกจุดเริ่ม (rev = ขีดของด้านที่สองไปอยู่ปลายอีกข้าง) */
  const seamLayer = seams ? (
    <g style={{ pointerEvents: "none" }}>
      {seamList.map((x, si) => {
        if (hidePids?.has(x.a.pid) && hidePids.has(x.b.pid)) return null;   // ตะเข็บของชั้นที่ซ่อนไว้ทั้งสองด้าน = ไม่วาด
        const A = byPidShape.get(x.a.pid), B = byPidShape.get(x.b.pid), pa = A ? sidePoints(A, x.a) : null, pb = B ? sidePoints(B, x.b) : null;
        const col = SEAM_COLORS[si % SEAM_COLORS.length], on = x.id === sewSel, w = on ? 6 : 3.5;
        const tick = (P: Pt[], shape: Shape, atEnd: boolean) => {
          const p = atEnd ? P[P.length - 1] : P[0], q = atEnd ? P[P.length - 2] : P[1], bx = shapeBox(shape);
          let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          if (nx * (p[0] - (bx.x + bx.w / 2)) + ny * (p[1] - (bx.y + bx.h / 2)) < 0) { nx = -nx; ny = -ny; }
          const len = ppc > 0 ? 9 / ppc : 0;   // ยังไม่ได้วัดขนาดกระดาน (วาดครั้งแรก) = ยังไม่วาดขีด
          return <line x1={p[0]} y1={p[1]} x2={p[0] + nx * len} y2={p[1] + ny * len} stroke={col} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
        };
        return (
          <g key={x.id}>
            {pa && <path d={lineD(pa)} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {pb && <path d={lineD(pb)} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {pa && pb && (() => { const m1 = midOf(pa), m2 = midOf(pb); return <line x1={m1[0]} y1={m1[1]} x2={m2[0]} y2={m2[1]} stroke={col} strokeWidth={on ? 2 : 1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />; })()}
            {pa && A && pa.length > 1 && tick(pa, A.shape, false)}
            {pb && B && pb.length > 1 && tick(pb, B.shape, !!x.rev)}
            {pa && lenLabel(pa, col)}
            {pb && lenLabel(pb, col)}
          </g>
        );
      })}
      {sewA && (() => { const A = byPidShape.get(sewA.pid), P = A ? sidePoints(A, sewA) : null; return P ? <path d={lineD(P)} fill="none" stroke="#f59e0b" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null; })()}
      {manyA && (() => {   // ขอบหลักของเย็บ 1 ต่อหลายชิ้น: ส่วนที่ยังเหลือ + จุดที่ช่วงถัดไปจะเริ่ม
        const pc = pieces.find((p) => p.pid === manyA.pid), ed = pc ? pieceEdges(pc.shape)[manyA.i] : null, P = ed ? (manyA.dir > 0 ? subLine(ed.pts, manyA.at, ed.len) : subLine(ed.pts, 0, manyA.at)) : [], q = manyA.dir > 0 ? P[0] : P[P.length - 1];
        return q ? <><path d={lineD(P)} fill="none" stroke="#f59e0b" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.75} vectorEffect="non-scaling-stroke" /><circle cx={q[0]} cy={q[1]} r={ppc > 0 ? 6 / ppc : 0} fill="#f59e0b" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" /></> : null;
      })()}
      {sewP && (() => { const pc = pieces.find((p) => p.pid === sewP.pid), ed = pc ? pieceEdges(pc.shape)[sewP.i] : null, q = ed ? pointAlong(ed.pts, sewP.at) : null; return q ? <circle cx={q[0]} cy={q[1]} r={6 / ppc} fill="#f59e0b" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null; })()}
      {selEdge && <path d={lineD(selEdge.pts)} fill="none" stroke={COLORS.sel} strokeWidth={7} strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </g>
  ) : null;
  /** เส้นตะเข็บที่กดได้ (เครื่องมือเย็บบางช่วง / แก้ตะเข็บ): กด = เลือก · ลากเส้น = ย้ายทั้งช่วง · ลากจุดกลมที่ปลาย = ยืด/หด — วางทับขอบที่กดได้ */
  const seamGrips = seams && (tool === "sewedit" || tool === "sewpart") ? (
    <g>
      {seamList.map((x, si) => (["a", "b"] as const).map((which) => {
        const side = x[which], S = side.count === 1 ? byPidShape.get(side.pid) : null, P = S ? sidePoints(S, side) : null;
        if (!P || P.length < 2) return null;
        const on = x.id === sewSel, col = SEAM_COLORS[si % SEAM_COLORS.length];
        return (
          <g key={`${x.id}:${which}`}>
            <path data-seamside={`${x.id}:${which}`} d={lineD(P)} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" style={{ cursor: canSew && isPartialSide(side) ? "grab" : "pointer" }}>
              <title>{`${t("ตะเข็บ", "Seam")} ${seamLabel(si)} · ${sideTxt(side)}${canSew ? ` · ${t("ลากเพื่อย้าย", "drag to move")}` : ""}`}</title>
            </path>
            {on && canSew && !isInnerSide(side) && [0, 1].map((k) => { const q = k ? P[P.length - 1] : P[0]; return <circle key={k} data-seamend={`${x.id}:${which}:${k}`} cx={q[0]} cy={q[1]} r={6.5 / ppc} fill="#fff" stroke={col} strokeWidth={2.5} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }}><title>{t("ลากเพื่อยืดหรือหดช่วงที่เย็บ", "Drag to lengthen or shorten the sewn range")}</title></circle>; })}
          </g>
        );
      }))}
    </g>
  ) : null;
  /** เส้นในชิ้นทั้งหมดบนกระดาน (สี/ลายตามชนิด) + เส้นที่กำลังวาด · ตอนถือเครื่องมือเย็บ เส้นในกดได้ (เย็บกับเส้นใน) */
  const lenOfPts = (P: Pt[]) => { let L = 0; for (let k = 1; k < P.length; k++) L += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return L; };
  const innerLayer = pieces.some((p) => p.inner?.length) || innerA ? (
    <g>
      {pieces.filter((p) => !hidePids?.has(p.pid)).map((p) => (p.inner ?? []).map((l) => {
        const st = INNER_STYLE[l.kind], d = "M" + l.pts.map((q) => `${q[0]} ${q[1]}`).join("L"), sewn = seamList.some((x) => [x.a, x.b].some((q) => q.pid === p.pid && q.inner === l.id));
        const picked = innerSel?.id === p.id && innerSel.line === l.id, grab = tool === "inner" && !readonly;
        return (
          <g key={`${p.id}:${l.id}`}>
            {picked && <path d={d} fill="none" stroke={COLORS.sel} strokeWidth={st.w + 5} strokeOpacity={0.35} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
            {l.kind === "hw" ? (() => {
              // อะไหล่: สัญลักษณ์ตามชนิด ขนาดจริง (ห่วง = วงแหวน · หมุดย้ำ = จุดทึบ · ตัวล็อก = แผ่นเหลี่ยม · แม่เหล็ก = วงกลมมีกากบาท · ตาไก่ = วงซ้อน)
              const { c, size } = hwSpot(l), r = Math.max(size / 2, 0.15), k = hwKind(l.hw), sw = { stroke: st.col, strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const, style: { pointerEvents: "none" as const } };
              return (
                <g data-hw={k}>
                  {k === "lock" ? <rect x={c[0] - r} y={c[1] - r * 0.6} width={2 * r} height={1.2 * r} rx={r * 0.2} fill="#fde68a" {...sw} />
                    : <circle cx={c[0]} cy={c[1]} r={r} fill={k === "rivet" ? st.col : k === "ring" ? "none" : "#fde68a"} {...sw} strokeWidth={k === "ring" ? 4 : 2} />}
                  {k === "eyelet" && <circle cx={c[0]} cy={c[1]} r={r * 0.45} fill="#fff" {...sw} />}
                  {k === "magnet" && <path d={`M${c[0] - r * 0.5} ${c[1]}H${c[0] + r * 0.5}M${c[0]} ${c[1] - r * 0.5}V${c[1] + r * 0.5}`} fill="none" {...sw} />}
                </g>
              );
            })() : <path d={d} fill="none" stroke={st.col} strokeWidth={st.w} strokeDasharray={st.dash} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
            {grab && <path data-innerline={`${p.id}:${l.id}`} d={d} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" style={{ cursor: "move" }}><title>{t("กด = เลือก · ลาก = ย้ายเส้นใน", "Click to select · drag to move the inner line")}</title></path>}
            {grab && picked && l.pts.map((q, qi) => <circle key={qi} data-innerpt={`${p.id}:${l.id}:${qi}`} cx={q[0]} cy={q[1]} r={ppc > 0 ? 6 / ppc : 0} fill="#fff" stroke={st.col} strokeWidth={2.5} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} />)}
            {seams && sewTool && l.kind !== "hw" && tool !== "sewpart" && tool !== "sewmany" && <path data-inner={`${p.pid}:${l.id}`} d={d} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }}><title>{`${pieceNo(p.pid)} · ${t("เส้นใน", "inner line")}${l.name ? ` ${l.name}` : ""} · ${fmtL(lenOfPts(l.pts))}${sewn ? ` · ${t("เย็บแล้ว", "sewn")}` : ""}`}</title></path>}
            {seams && tool === "sewpart" && sewA && l.kind !== "hw" && <path data-inner={`${p.pid}:${l.id}`} d={d} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} />}
          </g>
        );
      }))}
      {innerA && hover && <line x1={innerA.p.x} y1={innerA.p.y} x2={hover.x} y2={hover.y} stroke={INNER_STYLE.sew.col} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
      {innerA && <circle cx={innerA.p.x} cy={innerA.p.y} r={ppc > 0 ? 4 / ppc : 0} fill={INNER_STYLE.sew.col} style={{ pointerEvents: "none" }} />}
    </g>
  ) : null;
  /** ขอบที่กดได้ (เฉพาะตอนถือเครื่องมือเย็บ / แก้ตะเข็บ) — วางทับชิ้น */
  const edgeHits = seams && sewTool ? (
    <g>
      {pieces.filter((p) => !blocked(p.pid)).map((p) => { const E = pieceEdges(p.shape); return E.map((ed) => {
        const key = `${p.pid}:${ed.i}:${E.length}`, hov = sewHover === key && !seamAt(p.pid, ed.i, E.length);
        return (
          <g key={key}>
            {hov && tool === "sew" && <path d={lineD(ed.pts)} fill="none" stroke="#94a3b8" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
            <path data-edge={key} d={lineD(ed.pts)} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }}
              onPointerEnter={() => setSewHover(key)} onPointerLeave={() => setSewHover((h) => (h === key ? null : h))}>
              <title>{`${pieceNo(p.pid)} · ${t("ขอบ", "edge")} ${ed.i + 1} · ${fmtL(ed.len)}`}</title>
            </path>
          </g>
        );
      }); })}
    </g>
  ) : null;
  /** แผงขวาตอนถือเครื่องมือเย็บ (แบบ Property Editor ของ CLO): ค่าของตะเข็บที่เลือก · ค่าของขอบที่เลือก · รายการตะเข็บทั้งหมด */
  const row = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2";
  const selSeam = sewSel ? seamList.find((x) => x.id === sewSel) ?? null : null, selSeamIdx = selSeam ? seamList.indexOf(selSeam) : -1;
  const edgeAllow = edgePiece && selEdge ? (edgeAllowances(edgePiece.shape, edgePiece.allowEdges, edgePiece.allow)?.[selEdge.i] ?? edgePiece.allow) : 0;
  const edgeFold = !!(edgePiece && selEdge && cleanFoldEdges(edgePiece.shape, edgePiece.foldEdges)?.[selEdge.i]);
  const edgeMetaNow: EdgeMeta = (edgePiece && selEdge && cleanEdgeMeta(edgePiece.shape, edgePiece.edgeMeta)?.[selEdge.i]) || {};
  const setEdgeMeta = (f: (m: EdgeMeta) => EdgeMeta) => { if (!edgePiece || !selEdge) return; const k = selEdge.i, n = edgeList.length; patchPiece(edgePiece.id, (p) => { const cur = cleanEdgeMeta(p.shape, p.edgeMeta) ?? Array.from({ length: n }, () => ({} as EdgeMeta)); const next = cur.map((m, q) => (q === k ? f(m) : m)); return { ...p, edgeMeta: next.some(edgeMetaSet) ? next : null }; }); };
  const addNotches = (ds: number[]) => { if (!edgePiece || !selEdge) return; const pts = ds.map((d) => pointAlong(selEdge.pts, d)).filter((q): q is Pt => !!q); if (pts.length) patchPiece(edgePiece.id, (p) => ({ ...p, notches: [...(p.notches ?? []), ...pts] })); };
  const seamPanel = (
    <aside className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs" aria-label={t("ตะเข็บและขอบ", "Seams and edges")}>
      <div className="flex items-center gap-2"><Icon value="i:needle-thread" className="text-[16px] text-slate-500" /><span className="text-sm font-semibold text-slate-700">{t(`ตะเข็บ ${seamList.length} แนว`, `${seamList.length} seams`)}</span></div>
      {tool === "sew" && canSew && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-slate-600">
          {sewA ? <><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />{sideTxt(sewA)} · <b className="tabular-nums">{fmtN(sideLength(byPidShape.get(sewA.pid)!, sewA) ?? 0)}</b> {uL}<div className="mt-1 text-slate-400">{t("กดขอบของอีกชิ้นเพื่อเย็บ", "Click the other edge to sew")}</div></>
            : t("กดขอบแรกบนกระดาน", "Click the first edge on the board")}
        </div>
      )}
      {tool === "sewmany" && canSew && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-slate-600">
          {manyA ? (() => {
            const pc = pieces.find((p) => p.pid === manyA.pid), ed = pc ? pieceEdges(pc.shape)[manyA.i] : null, L = ed?.len ?? 0;
            return <><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />{t("ขอบหลัก", "Main edge")}: {pieceNo(manyA.pid)} · {t(`ขอบ ${manyA.i + 1}`, `edge ${manyA.i + 1}`)} · <b className="tabular-nums">{fmtN(L)}</b> {uL}
              <div className="mt-1 tabular-nums">{t(`เย็บแล้ว ${manyA.made} ชิ้น · เหลือ ${fmtL(manyA.dir > 0 ? L - manyA.at : manyA.at)}`, `${manyA.made} pieces sewn · ${fmtL(manyA.dir > 0 ? L - manyA.at : manyA.at)} left`)}</div>
              <div className="mt-1 text-slate-400">{t("กดขอบของชิ้นถัดไปที่จะมาต่อ · Enter หรือ Esc = จบ", "Click the edge of the next piece · Enter or Esc = finish")}</div></>;
          })() : t("กดขอบหลัก (ขอบยาวที่มีหลายชิ้นมาเย็บต่อกัน) ตรงจุดที่ชิ้นแรกจะเริ่ม", "Click the main edge (the long edge several pieces join) where the first piece starts")}
        </div>
      )}
      {tool === "sewpart" && canSew && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-slate-600">
          {sewA ? <><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />{sideTxt(sewA)} · <b className="tabular-nums">{fmtN(sideLength(byPidShape.get(sewA.pid)!, sewA) ?? 0)}</b> {uL}<div className="mt-1 text-slate-400">{t("กดจุดเริ่มบนขอบของอีกชิ้น ระบบจะวางให้ยาวเท่ากันเอง", "Click the start on the other piece's edge — the range is made the same length")}</div></>
            : sewP ? t("กดจุดจบของช่วงบนขอบเดียวกัน", "Click the end of the range on the same edge")
            : t("กดจุดเริ่มของช่วงบนขอบ · หรือกดเส้นตะเข็บเดิมแล้วลากเพื่อย้าย", "Click where the range starts on an edge · or click a seam and drag to move it")}
        </div>
      )}
      {tool === "sewedit" && !selSeam && !selEdge && <p className="rounded-md border border-dashed border-slate-200 bg-white p-2 text-slate-500">{t("กดขอบของชิ้นบนกระดาน เพื่อดูและปรับค่าของขอบนั้น (และของตะเข็บ ถ้าขอบนั้นเย็บไว้)", "Click an edge on the board to see and adjust its values (and its seam, if sewn)")}</p>}

      {selSeam && (() => {
        const x = selSeam, c = seamChecks[selSeamIdx], kind = SEAM_KINDS.find((k) => k.key === x.kind);
        return (
          <section className="space-y-2 rounded-md border border-blue-200 bg-white p-2.5" aria-label={t("ค่าของตะเข็บ", "Seam values")}>
            <div className="flex items-center gap-1.5 font-semibold text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEAM_COLORS[selSeamIdx % SEAM_COLORS.length] }} />{t(`ตะเข็บ ${seamLabel(selSeamIdx)}`, `Seam ${seamLabel(selSeamIdx)}`)}</div>
            <div className="text-slate-600">{sideTxt(x.a)} <span className="text-slate-400">{t("กับ", "to")}</span> {sideTxt(x.b)}</div>
            <div className={`tabular-nums ${c.status === "ok" ? "text-emerald-700" : c.status === "mismatch" && !x.ease ? "text-red-600" : "text-amber-700"}`}>
              {c.status === "broken" ? t("ชิ้นถูกแก้จนขอบเปลี่ยน ต้องเย็บใหม่", "The piece changed — sew this again") : `${fmtN(c.la ?? 0)} ${t("กับ", "and")} ${fmtL(c.lb ?? 0)} · ${c.status === "ok" ? t("ยาวเท่ากัน", "same length") : x.ease ? t(`ตั้งใจให้ย่น ${fmtL(c.diff)}`, `eased by ${fmtL(c.diff)} on purpose`) : t(`ต่างกัน ${fmtL(c.diff)}`, `differ by ${fmtL(c.diff)}`)}`}
            </div>
            {(["a", "b"] as const).map((which, k) => {
              const g = seamEdge(x.id, which);
              if (!g) return null;
              const len = Math.round((g.t1 - g.t0) * 100) / 100, start = Math.round(g.t0 * 100) / 100;
              return (
                <div key={which} className="space-y-1 rounded-md bg-slate-50 p-1.5">
                  <div className="text-slate-500">{t(`ด้านที่ ${k + 1}`, `Side ${k + 1}`)} · {pieceNo(g.side.pid)} · {t(`ขอบ ${g.side.from + 1}`, `edge ${g.side.from + 1}`)} <span className="text-slate-400">({t(`ขอบยาว ${fmtL(g.ed.len)}`, `edge ${fmtL(g.ed.len)}`)})</span></div>
                  {canSew ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{t("เริ่มที่", "Start")}</span><NumField len value={start} min={0} max={500} step={0.5} label={t(`ด้านที่ ${k + 1} เริ่มที่ ${uL}`, `Side ${k + 1} start ${uL}`)} onCommit={(v) => setSeamRange(x.id, which, v, v + len)} className="w-16" />
                      <span>{t("ยาว", "Length")}</span><NumField len value={len} min={SEAM_MIN_LEN} max={500} step={0.5} label={t(`ด้านที่ ${k + 1} ยาว ${uL}`, `Side ${k + 1} length ${uL}`)} onCommit={(v) => setSeamRange(x.id, which, start, start + v)} className="w-16" />
                      {isPartialSide(g.side) && <button type="button" onClick={() => setSeamRange(x.id, which, 0, g.ed.len)} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("เต็มขอบ", "Whole edge")}</button>}
                    </div>
                  ) : <div className="tabular-nums">{fmtN(g.t0)}–{fmtL(g.t1)}</div>}
                </div>
              );
            })}
            {canSew && c.status === "mismatch" && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {seamEdge(x.id, "b") && <button type="button" onClick={() => fitSeam(x.id, "b")} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("ให้ด้านที่ 2 ยาวเท่าด้านที่ 1", "Make side 2 match side 1")}</button>}
                  {seamEdge(x.id, "a") && <button type="button" onClick={() => fitSeam(x.id, "a")} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("ให้ด้านที่ 1 ยาวเท่าด้านที่ 2", "Make side 1 match side 2")}</button>}
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!x.ease} onChange={(e) => patchSeam(x.id, (q) => { const { ease: _e, ...rest } = q; void _e; return e.target.checked ? { ...rest, ease: true } : rest; })} className="h-3.5 w-3.5 accent-amber-600" />{t("ตั้งใจให้ต่างกัน (รูด / ย่น)", "Different on purpose (gather / ease)")}</label>
              </div>
            )}
            <label className="block space-y-1"><span className="text-slate-500">{t("ชื่อตะเข็บ", "Seam name")}</span>
              <input key={`${x.id}:${x.name ?? ""}`} defaultValue={x.name ?? ""} disabled={!canSew} maxLength={60} placeholder={t("เช่น ข้าง–ก้น ด้านหน้า", "e.g. side–base, front")}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (x.name ?? "")) patchSeam(x.id, (q) => { const { name: _n, ...rest } = q; void _n; return v ? { ...rest, name: v } : rest; }); }}
                className="h-8 w-full rounded-md border border-slate-200 px-2 disabled:bg-slate-50" /></label>
            <label className="block space-y-1"><span className="text-slate-500">{t("วิธีเย็บ", "Seam type")}</span>
              <select value={x.kind ?? ""} disabled={!canSew} onChange={(e) => { const v = e.target.value as SeamKind | ""; patchSeam(x.id, (q) => { const { kind: _k, ...rest } = q; void _k; return v ? { ...rest, kind: v } : rest; }); }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 disabled:bg-slate-50">
                <option value="">{t("ยังไม่ระบุ", "Not set")}</option>
                {SEAM_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.th, k.en)}</option>)}
              </select>
              {kind && <span className="block text-[11px] text-slate-400">{t(kind.hintTh, kind.hintEn)}</span>}</label>
            <div className="space-y-1.5 border-t border-slate-100 pt-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!x.top} disabled={!canSew} onChange={(e) => patchSeam(x.id, (q) => { const { top: _t, ...rest } = q; void _t; return e.target.checked ? { ...rest, top: { ...SEAM_TOP_DEFAULT } } : rest; })} className="h-3.5 w-3.5 accent-blue-600" />{t("เดินด้ายทับ", "Topstitch")}</label>
              {x.top && (
                <div className="space-y-1 pl-5">
                  <div className={row}><span className="text-slate-500">{t("ห่างจากตะเข็บ (มม.)", "Distance from seam (mm)")}</span><NumField value={x.top.off} min={0.5} max={30} step={0.5} label={t("ห่างจากตะเข็บ มม.", "Distance from seam mm")} onCommit={(v) => patchSeam(x.id, (q) => (q.top ? { ...q, top: { ...q.top, off: v } } : q))} className="w-16" /></div>
                  <div className={row}><span className="text-slate-500">{t("จำนวนแถว", "Rows")}</span>
                    <select value={x.top.rows} disabled={!canSew} onChange={(e) => patchSeam(x.id, (q) => (q.top ? { ...q, top: { ...q.top, rows: e.target.value === "2" ? 2 : 1 } } : q))} className="h-7 w-16 rounded-md border border-slate-200 bg-white px-1"><option value={1}>1</option><option value={2}>2</option></select></div>
                  <div className={row}><span className="text-slate-500">{t("ฝีเข็มต่อนิ้ว", "Stitches per inch")}</span><NumField value={x.top.spi} min={2} max={20} step={1} label={t("ฝีเข็มต่อนิ้ว", "Stitches per inch")} onCommit={(v) => patchSeam(x.id, (q) => (q.top ? { ...q, top: { ...q.top, spi: v } } : q))} className="w-16" /></div>
                </div>
              )}
            </div>
            {canSew && (
              <div className="flex gap-1.5 border-t border-slate-100 pt-2">
                <button type="button" data-guide="seam-rev" onClick={() => reverseSeam(x.id)} aria-pressed={!!x.rev} className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 ${x.rev ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white hover:bg-slate-50"}`}><Icon value="i:arrows-exchange" className="text-[14px]" />{t("กลับทิศ", "Reverse")}</button>
                <button type="button" onClick={() => removeSeam(x.id)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-red-600 hover:bg-red-50"><Icon value="i:trash" className="text-[14px]" />{t("ลบตะเข็บ", "Delete seam")}</button>
              </div>
            )}
          </section>
        );
      })()}

      {selEdge && edgePiece && (() => {
        const canLen = !!setEdgeLength(edgePiece.shape, selEdge.i, selEdge.len), ed = !readonly;
        /** ช่วงของซิป/กุ๊นบนขอบนี้: ยาวเท่าไร + ห่างจากต้นขอบเท่าไร (ยาวเท่าขอบ = ทั้งขอบ) — เห็นผลบนกระดานและภาพ 3 มิติทันที */
        const finishRows = (kind: "zip" | "bind") => {
          const L = selEdge.len, [a, b] = finishRange(edgeMetaNow, kind, L), span = b - a, part = span < L - 0.01, what = kind === "zip" ? t("ซิป", "zip") : t("กุ๊น", "binding");
          const put = (na: number, nb: number) => setEdgeMeta((m) => withFinishRange(m, kind, [na, nb], L));
          return (
            <div className="space-y-1.5 pl-5" data-finish-range={kind}>
              <div className={row}><span className="text-slate-500">{t(`ยาวของ${what}บนขอบ (${uL})`, `Length of the ${what} on this edge (${uL})`)}</span>
                {ed ? <NumField len value={Math.round(span * 100) / 100} min={SEAM_MIN_LEN} max={Math.round(L * 100) / 100} label={t(`ยาวของ${what}บนขอบ ${uL}`, `Length of the ${what} ${uL}`)} onCommit={(v) => { const s = Math.min(L, Math.max(SEAM_MIN_LEN, v)), na = Math.max(0, Math.min(a, L - s)); put(na, na + s); }} className="w-16" /> : <b className="tabular-nums">{fmtN(span)}</b>}</div>
              {part ? (<>
                <div className={row}><span className="text-slate-500">{t(`ห่างจากต้นขอบ (${uL})`, `From the start of the edge (${uL})`)}</span>
                  {ed ? <NumField len value={Math.round(a * 100) / 100} min={0} max={Math.round((L - span) * 100) / 100} label={t(`${what}ห่างจากต้นขอบ ${uL}`, `${what} offset ${uL}`)} onCommit={(v) => { const na = Math.max(0, Math.min(L - span, v)); put(na, na + span); }} className="w-16" /> : <b className="tabular-nums">{fmtN(a)}</b>}</div>
                {ed && <div className="flex gap-1.5">
                  <button type="button" onClick={() => put((L - span) / 2, (L + span) / 2)} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("กึ่งกลางขอบ", "Centre")}</button>
                  <button type="button" onClick={() => put(L - b, L - a)} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("สลับไปอีกปลาย", "Other end")}</button>
                  <button type="button" onClick={() => setEdgeMeta((m) => withFinishRange(m, kind, null, L))} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("ทั้งขอบ", "Whole edge")}</button>
                </div>}
              </>) : <div className="text-[11px] text-slate-400">{t(`ตอนนี้ทั้งขอบ — พิมพ์ความยาวที่สั้นกว่าขอบ เพื่อติด${what}เฉพาะบางช่วง`, `Whole edge now — type a shorter length to put the ${what} on part of the edge`)}</div>}
            </div>
          );
        };
        return (
          <section className="space-y-2 rounded-md border border-slate-300 bg-white p-2.5" aria-label={t("ค่าของขอบ", "Edge values")}>
            <div className="font-semibold text-slate-700">{t(`ขอบ ${selEdge.i + 1}`, `Edge ${selEdge.i + 1}`)} <span className="font-normal text-slate-500">· {pieceNo(edgePiece.pid)}</span></div>
            <div className={row}><span className="text-slate-500">{t(`ความยาวขอบ (${uL})`, `Edge length (${uL})`)}</span>
              {ed && canLen ? <NumField len value={Math.round(selEdge.len * 100) / 100} min={0.2} max={500} label={t(`ความยาวขอบ ${uL}`, `Edge length ${uL}`)} onCommit={(v) => { const next = setEdgeLength(edgePiece.shape, selEdge.i, v); if (next) patchPiece(edgePiece.id, (p) => ({ ...p, shape: next })); }} className="w-20" /> : <b className="tabular-nums">{fmtN(selEdge.len)}</b>}</div>
            {ed && !canLen && <div className="text-[11px] text-slate-400">{t("ขอบโค้ง แก้ความยาวด้วยการลากจุด (เครื่องมือย้าย → แก้จุด)", "Curved edge — change its length by dragging points (Move → Edit points)")}</div>}
            <div className={row}><span className="text-slate-500">{t(`เผื่อของขอบนี้ (${uL})`, `Allowance of this edge (${uL})`)}</span>
              {ed ? <NumField len value={edgeAllow} min={0} max={20} label={t(`เผื่อของขอบ ${uL}`, `Edge allowance ${uL}`)} onCommit={(v) => patchPiece(edgePiece.id, (p) => { const cur = edgeAllowances(p.shape, p.allowEdges, p.allow) ?? edgeList.map(() => p.allow); return { ...p, allowEdges: cur.map((a, k) => (k === selEdge.i ? cleanAllow(v) : a)) }; })} className="w-16" /> : <b className="tabular-nums">{edgeAllow}</b>}</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edgeFold} disabled={!ed} onChange={() => patchPiece(edgePiece.id, (p) => { const next = (cleanFoldEdges(p.shape, p.foldEdges) ?? edgeList.map(() => 0)).map((v, k) => (k === selEdge.i ? (v ? 0 : 1) : v)); return { ...p, foldEdges: next.some(Boolean) ? next : null }; })} className="h-3.5 w-3.5 accent-violet-600" />{t("พับเข้าใน", "Folds inward")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!edgeMetaNow.bind} disabled={!ed} onChange={(e) => setEdgeMeta((m) => { const { bind: _b, bindR: _r, ...rest } = m; void _b; void _r; return e.target.checked ? { ...rest, bind: true } : rest; })} className="h-3.5 w-3.5 accent-blue-600" />{t("กุ้นขอบ", "Bound edge")}</label>
            {edgeMetaNow.bind && finishRows("bind")}
            <label className="flex items-center gap-2"><input type="checkbox" data-edge-zip checked={!!edgeMetaNow.zip} disabled={!ed} onChange={(e) => setEdgeMeta((m) => { const { zip: _z, zipR: _r, ...rest } = m; void _z; void _r; return e.target.checked ? { ...rest, zip: true } : rest; })} className="h-3.5 w-3.5 accent-blue-600" />{t("ติดซิปตามขอบนี้", "Zip along this edge")}</label>
            {edgeMetaNow.zip && finishRows("zip")}
            {(edgeMetaNow.zip || edgeMetaNow.bind) && <div className="pl-5 text-[11px] text-slate-400">{t("เลือกซิป / เทปกุ๊น ได้ที่ปุ่ม ซิป / อะไหล่ — ความยาวคิดจากขอบนี้ให้เอง", "Choose the zip / binding tape under Zips / hardware — the length comes from this edge")}</div>}
            <label className="flex items-center gap-2" title={t("ขอบที่ตั้งใจไม่เย็บ เช่น ปากกระเป๋า ช่องล้วง — แผงตรวจแบบจะไม่เตือนว่าลืมเย็บ", "An edge left unsewn on purpose, e.g. the bag mouth — the review panel won't flag it as forgotten")}><input type="checkbox" data-edge-open checked={!!edgeMetaNow.open} disabled={!ed} onChange={(e) => setEdgeMeta((m) => { const { open: _o, ...rest } = m; void _o; return e.target.checked ? { ...rest, open: true } : rest; })} className="h-3.5 w-3.5 accent-blue-600" />{t("ขอบเปิดตั้งใจ (ปากกระเป๋า / ช่องล้วง)", "Intended opening (bag mouth / access)")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edgeMetaNow.top != null} disabled={!ed} onChange={(e) => setEdgeMeta((m) => { const { top: _t, ...rest } = m; void _t; return e.target.checked ? { ...rest, top: 3 } : rest; })} className="h-3.5 w-3.5 accent-blue-600" />{t("เดินด้ายทับ", "Topstitch")}</label>
            {edgeMetaNow.top != null && <div className={`${row} pl-5`}><span className="text-slate-500">{t("ห่างจากขอบ (มม.)", "Distance from edge (mm)")}</span><NumField value={edgeMetaNow.top} min={0.5} max={30} step={0.5} label={t("ห่างจากขอบ มม.", "Distance from edge mm")} onCommit={(v) => setEdgeMeta((m) => ({ ...m, top: v }))} className="w-16" /></div>}
            {ed && (
              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                <div className="text-slate-500">{t("รอยบากบนขอบนี้", "Notches on this edge")}</div>
                <div className="flex items-center gap-1.5"><span className="min-w-0 flex-1">{t("แบ่งเท่ากันเป็น (ช่วง)", "Split evenly into")}</span><NumField value={divN} min={2} max={12} step={1} label={t("จำนวนช่วง", "Number of parts")} onCommit={(v) => setDivN(Math.round(v))} className="w-14" />
                  <button type="button" onClick={() => addNotches(Array.from({ length: Math.max(1, divN - 1) }, (_, k) => (selEdge.len * (k + 1)) / divN))} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("วาง", "Place")}</button></div>
                <div className="flex items-center gap-1.5"><span className="min-w-0 flex-1">{t(`ที่ระยะจากต้นขอบ (${uL})`, `At distance from start (${uL})`)}</span><NumField len value={notchAt} min={0} max={500} label={t(`ระยะ ${uL}`, `Distance ${uL}`)} onCommit={setNotchAt} className="w-14" />
                  <button type="button" disabled={!(notchAt >= 0 && notchAt <= selEdge.len)} onClick={() => addNotches([notchAt])} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50 disabled:opacity-40">{t("วาง", "Place")}</button></div>
                <div className="text-[11px] text-slate-400">{t("ระยะวัดจากปลายด้านหนึ่งของขอบ ถ้ารอยบากไปอยู่ผิดปลาย ให้ใส่ระยะที่วัดจากอีกปลายแทน · ลบรอยบากได้ในแผงของชิ้น (โหมดรอยบาก)", "Distance is measured from one end of the edge; if the notch lands at the wrong end, enter the distance from the other end · remove notches in the piece panel (notch mode)")}</div>
              </div>
            )}
          </section>
        );
      })()}

      {seamList.length === 0 && <p className="text-slate-400">{t("ยังไม่มีตะเข็บ — กดรูปเข็ม แล้วกดขอบของชิ้นหนึ่ง ตามด้วยขอบของอีกชิ้นที่จะเย็บติดกัน", "No seams yet — pick the needle tool, click an edge, then the edge it is sewn to")}</p>}
      <div className="space-y-1.5">
        {seamList.map((x, si) => {
          const c = seamChecks[si], on = x.id === sewSel, kind = SEAM_KINDS.find((k) => k.key === x.kind);
          return (
            <div key={x.id} role="button" tabIndex={0} onClick={() => { setSewSel(x.id); setEdgeSel(null); if (tool !== "sewedit" && tool !== "sewpart") { setTool("sewedit"); setSewA(null); } }} onKeyDown={(e) => { if (e.key === "Enter") { setSewSel(x.id); setEdgeSel(null); } }}
              className={`cursor-pointer rounded-md border p-2 ${on ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="flex items-start gap-1.5"><span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEAM_COLORS[si % SEAM_COLORS.length] }} />
                <span className="min-w-0 flex-1"><b>{seamLabel(si)}</b>{x.name ? ` ${x.name}` : ""} <span className="text-slate-500">· {sideTxt(x.a)} {t("กับ", "to")} {sideTxt(x.b)}</span></span></div>
              <div className={`mt-0.5 tabular-nums ${c.status === "ok" ? "text-emerald-700" : c.status === "mismatch" && !x.ease ? "text-red-600" : "text-amber-700"}`}>
                {c.status === "broken" ? t("ต้องเย็บใหม่", "Needs redoing") : `${fmtN(c.la ?? 0)} ${t("กับ", "and")} ${fmtL(c.lb ?? 0)} · ${c.status === "ok" ? t("เท่ากัน", "same") : x.ease ? t(`ตั้งใจให้ย่น ${fmtL(c.diff)}`, `eased ${fmtL(c.diff)}`) : t(`ต่าง ${r1(c.diff)}`, `differ ${r1(c.diff)}`)}`}
                {kind ? <span className="text-slate-500"> · {t(kind.th, kind.en)}</span> : null}{x.top ? <span className="text-slate-500"> · {t("เดินด้ายทับ", "topstitch")}</span> : null}{x.rev ? <span className="text-slate-500"> · {t("กลับทิศ", "reversed")}</span> : null}{x.group ? <span className="text-slate-500"> · {t("ชุด 1 ต่อหลายชิ้น", "1-to-many set")}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-1 text-[11px] text-slate-500">
        <div className="font-medium text-slate-600">{t("ช่างคิดยังไง", "How a pattern maker thinks")}</div>
        <p>{t("ตะเข็บ 1 แนว = ขอบ 2 ขอบที่จะถูกเย็บติดกัน กฎข้อแรกคือสองขอบต้องยาวเท่ากัน ถ้าไม่เท่า ชิ้นที่ยาวกว่าจะย่นหรือเหลือปลาย", "One seam = two edges sewn together. Rule one: both edges must be the same length, or the longer one puckers or overhangs.")}</p>
        <p>{t("เย็บ 1 ขอบกับหลายชิ้น (K) ใช้ตอนขอบยาวขอบเดียวมีหลายชิ้นมาต่อกัน เช่น ชิ้นข้าง ก้น ข้าง รอบตัวหน้า หรือแถบซิปกับแถบก้นรอบกระเป๋ากลม ความยาวของทุกชิ้นรวมกันควรเท่ากับขอบหลักพอดี", "Sew one edge to many (K) when several pieces join one long edge — side, base, side around a front panel, or a zip band and a base band around a round bag. Their lengths should add up to the main edge.")}</p>
        <p>{t("เย็บบางช่วง (J) ใช้ตอนชิ้นเล็กติดกับส่วนหนึ่งของขอบยาว เช่น โคนหูบนขอบปาก ขอบเดียวมีได้หลายตะเข็บแต่ห้ามทับกัน ย้ายตำแหน่งทีหลังได้ด้วยการลากเส้นตะเข็บ", "Sew part of an edge (J) when a small piece joins part of a long edge, like a handle base on the mouth. One edge can hold several seams as long as they do not overlap; drag a seam later to move it.")}</p>
        <p>{t("วิธีเย็บ เดินด้ายทับ กุ้นขอบ เป็นข้อมูลให้ช่างเย็บ จะออกในตารางตะเข็บของใบพิมพ์ ยังไม่เปลี่ยนภาพ 3D", "Seam type, topstitch and binding are instructions for the sewer — they print in the seam table and do not change the 3D view yet.")}</p>
      </div>
    </aside>
  );

  const hint = pen
    ? t(`ปากกา: ${pen.nodes.length} จุด · กดลาก = เส้นโค้ง · กดจุดแรก/ดับเบิลคลิก/Enter = ปิดรูป · Backspace = ลบจุดล่าสุด · Esc = ยกเลิก`, `Pen: ${pen.nodes.length} points · drag = curve · click first point / double-click / Enter = close · Backspace = undo point · Esc = cancel`)
    : editPiece ? t("แก้จุด: ลากจุด = ย้าย · ลากหูจับ = ดัดโค้ง (Alt = แยกหูจับ) · ดับเบิลคลิกจุด = มุม↔โค้ง · ดับเบิลคลิกเส้น = เพิ่มจุด · Delete = ลบจุด · Esc = เสร็จ", "Edit points: drag a point to move · drag a handle to bend (Alt = break) · double-click a point = corner↔smooth · double-click the outline = add point · Delete = remove point · Esc = done")
    : tool === "pen" ? t("ปากกา: คลิกวางจุด (มุม) · กดค้างแล้วลาก = เส้นโค้ง · Shift = เส้น 45°", "Pen: click to place corners · press and drag for curves · Shift = 45°")
    : tool === "sew" ? (sewA ? t("เย็บ: กดขอบของอีกชิ้นที่จะเย็บติดกัน · Shift+คลิกขอบที่ติดกัน = ต่อด้านแรกให้ยาวขึ้น · Esc = ยกเลิก", "Sew: click the edge to sew it to · Shift+click a neighbouring edge to extend the first side · Esc cancels") : t("เย็บขอบกับขอบ: กดขอบแรก แล้วกดขอบที่จะเย็บติดกัน · หลังเย็บ Shift+คลิกขอบที่ติดกัน = ต่อด้านที่สอง · Ctrl+Z ย้อนตะเข็บ", "Sew edge to edge: click the first edge, then the edge it is sewn to · after sewing, Shift+click a neighbouring edge to extend the second side · Ctrl+Z undoes"))
    : tool === "inner" ? (innerA ? t("เส้นในชิ้น: กดจุดที่สอง (Shift = เส้น 45°) · Esc = ยกเลิก", "Inner line: click the second point (Shift = 45°) · Esc cancels") : t("เส้นในชิ้น: กดเส้นเดิมแล้วลาก = ย้าย · ลากจุดกลม = ขยับจุด · Delete = ลบเส้นที่เลือก · กดที่ว่างข้างในชิ้น 2 จุด = เส้นใหม่ · พิมพ์ระยะจากขอบและตั้งชนิดได้ในแผงของชิ้น", "Inner line: click a first point inside a piece, then a second = one straight line · set its type and delete it in the piece panel"))
    : tool === "sewmany" ? (manyA ? t("เย็บ 1 ขอบกับหลายชิ้น: กดขอบของชิ้นถัดไปที่จะมาต่อกับขอบหลัก (ส่วนสีส้มคือที่ยังเหลือ) · Enter / Esc = จบ", "Sew one edge to many: click the edge of the next piece that joins the main edge (orange = what is left) · Enter / Esc = finish") : t("เย็บ 1 ขอบกับหลายชิ้น: กดขอบหลักตรงจุดที่ชิ้นแรกจะเริ่ม แล้วกดขอบของแต่ละชิ้นตามลำดับ ระบบวางช่วงต่อกันให้เอง · ใช้กับชิ้นข้าง/ก้นหลายท่อน แถบซิปรอบปาก", "Sew one edge to many: click the main edge where the first piece starts, then click each piece's edge in order — the ranges are laid end to end · for multi-part gussets and zip bands"))
    : tool === "sewpart" ? (sewA ? t("เย็บบางช่วง: กดจุดเริ่มบนขอบของอีกชิ้น ระบบวางให้ยาวเท่าช่วงแรก · Esc = ยกเลิก", "Sew part: click the start on the other piece's edge — it is made as long as the first range · Esc cancels") : sewP ? t("เย็บบางช่วง: กดจุดจบของช่วงบนขอบเดียวกัน · Esc = ยกเลิก", "Sew part: click the end of the range on the same edge · Esc cancels") : t("เย็บบางช่วง: กดจุดเริ่ม แล้วจุดจบบนขอบเดียวกัน ตามด้วยจุดเริ่มบนขอบของอีกชิ้น · กดเส้นตะเข็บแล้วลาก = ย้าย · ลากจุดกลมที่ปลาย = ยืด/หด · Ctrl+Z ย้อน", "Sew part: click a start, then an end on the same edge, then a start on the other piece's edge · click a seam and drag to move it · drag an end dot to resize · Ctrl+Z undoes"))
    : tool === "sewedit" ? t("แก้ตะเข็บ: กดตะเข็บบนกระดานหรือในรายการ · ลากเส้นตะเข็บ = ย้ายช่วง · ลากจุดกลมที่ปลาย = ยืด/หด · กลับทิศหรือลบ (Delete) ได้ในแผงขวา", "Edit sewing: click a seam on the board or in the list · drag the seam to move its range · drag an end dot to resize · reverse or delete (Delete) in the panel")
    : tool === "hand" ? t("เลื่อนดู: ลากที่ว่าง = เลื่อนกระดาน · กดชิ้น = เลือกและย้ายชิ้นนั้น", "Pan: drag empty space to move the board · click a piece to select and move it")
    : tool === "measure" ? (measureMode === "line" ? t("ไม้บรรทัด วัดตรง: กดลากจากจุดหนึ่งไปอีกจุด (Shift = 45°)", "Measure straight: drag from one point to another (Shift = 45°)") : measureMode === "curve" ? t("ไม้บรรทัด วัดโค้ง: คลิกวางจุดตามแนว · กดลาก = โค้ง · ดับเบิลคลิก/Enter = จบ", "Measure curve: click points along the line · drag = curve · double-click/Enter = finish") : t("ไม้บรรทัด ตามขอบ: กดบนชิ้นที่จุดเริ่ม แล้วลากไปตามขอบทางที่ต้องการ (อ้อมทางยาวก็ได้) ปล่อย = จบ · หรือคลิกจุดเริ่ม → เลื่อนตามขอบ → คลิกจุดปลาย — วัดตามเส้นเย็บ", "Measure along edge: press on a piece at the start and drag along the edge the way you want (long way works too) · release = done · or click start → move along → click end — measured along the sewing line"))
    : tool === "move" ? t("ย้าย: กดชิ้น = ย้าย + แผงรายละเอียด · ลากจุดจับรอบชิ้น = ย่อขยาย · จุดกลมด้านบน = หมุน · กดที่ว่าง = เลื่อนดู · Shift+ลากที่ว่าง = กรอบเลือก · Ctrl+Z ย้อนกลับ", "Move: click a piece to move it and open its panel · drag the handles to resize · the round handle rotates · click empty space to pan · Shift+drag empty space = selection box · Ctrl+Z undo")
    : t("กดลากที่ว่างเพื่อวาด (Shift = จัตุรัส/วงกลม) · คลิกที่ว่างเฉย ๆ = เลื่อนดู · กดชิ้น = ย้าย + แผงรายละเอียด · ลากจุดจับรอบชิ้น = ย่อขยาย · จุดกลมด้านบน = หมุน · Ctrl+Z ย้อนกลับ", "Drag on empty space to draw (Shift = square/circle) · click a piece = move + details · drag the handles = resize · top circle = rotate · Ctrl+Z undo");

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
  // ── เครื่องมือลอยบนแคนวาส (แทนแถบ 3 แถวด้านบน — พื้นที่วาดได้เต็ม) ──
  const fbar = "pointer-events-auto flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm";
  const ibCls = (on: boolean) => `relative inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-xs disabled:opacity-35 ${on ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`;
  const toolIcon = (tl: Tool, icon: string, label: string, key: string) => (
    <button key={tl} type="button" data-tool={tl} onClick={() => changeTool(tl)} title={`${label} (${key})`} aria-label={label} aria-pressed={tool === tl} className={ibCls(tool === tl)}>
      <Icon value={`i:${icon}`} className="text-[16px]" />
    </button>
  );
  const sep = <span className="mx-0.5 h-5 w-px bg-slate-200" />;
  const overlayEl = (
    <div className="pointer-events-none absolute inset-0" data-float-ui>
      <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {/* ซ้าย: เครื่องมือวาด */}
      <div className={`${fbar} absolute left-2 top-14 flex-col`} aria-label={t("เครื่องมือวาด", "Drawing tools")}>
        {toolIcon("move", "pointer", readonly ? t("เลือก", "Select") : t("ย้าย", "Move"), "V")}
        {!readonly && toolIcon("rect", "square", t("สี่เหลี่ยม", "Rectangle"), "R")}
        {!readonly && toolIcon("ellipse", "circle", t("วงกลม", "Circle"), "O")}
        {!readonly && toolIcon("pen", "vector-bezier", t("ปากกา", "Pen"), "P")}
        {toolIcon("hand", "hand-stop", t("เลื่อนดู", "Pan"), "H")}
        {toolIcon("measure", "ruler-measure", t("ไม้บรรทัด", "Measure"), "M")}
        {seams && <>
          <span className="my-0.5 h-px w-5 self-center bg-slate-200" />
          <button type="button" onClick={() => changeTool("sew")} title={`${t("เย็บขอบกับขอบ", "Sew edge to edge")} (N)`} aria-label={t("เย็บขอบกับขอบ", "Sew edge to edge")} aria-pressed={tool === "sew"} className={ibCls(tool === "sew")}>
            <Icon value="i:needle-thread" className="text-[16px]" />
            {seams.length > 0 && <span className={`absolute -right-1 -top-1 rounded-full px-1 text-[10px] leading-4 text-white ${seamBad ? "bg-red-500" : "bg-slate-500"}`}>{seams.length}</span>}
          </button>
          {toolIcon("sewpart", "line-dashed", t("เย็บบางช่วงของขอบ", "Sew part of an edge"), "J")}
          {toolIcon("sewmany", "arrows-split-2", t("เย็บ 1 ขอบกับหลายชิ้น", "Sew one edge to many pieces"), "K")}
          {toolIcon("sewedit", "needle", t("แก้ตะเข็บ", "Edit sewing"), "B")}
        </>}
        {innerLines && !readonly && toolIcon("inner", "line", t("เส้นในชิ้น", "Inner line"), "L")}
        {refPicker && <button type="button" onClick={() => setRefPickOpen((v) => !v)} title={t("ใส่รูปสินค้าเป็นภาพอ้างอิงใต้กระดาน (วาดลอกตาม)", "Put a product photo under the board as a tracing reference")} aria-label={t("รูปอ้างอิง", "Reference")} className={ibCls(refPickOpen)}><Icon value="i:photo" className="text-[16px]" /></button>}
      </div>
      {/* บนซ้าย: คำสั่ง */}
      <div className="absolute left-14 right-24 top-2 flex flex-col items-start gap-1.5">
        <div className={`${fbar} flex-wrap`} aria-label={t("คำสั่ง", "Commands")}>
          {!readonly && <>
            <button type="button" onClick={undo} disabled={!hist.current.length} title={t("ย้อนกลับ (Ctrl+Z)", "Undo (Ctrl+Z)")} aria-label={t("ย้อน", "Undo")} className={ibCls(false)}><Icon value="i:arrow-back-up" className="text-[16px]" /></button>
            <button type="button" onClick={redo} disabled={!fut.current.length} title={t("ทำซ้ำ (Ctrl+Shift+Z / Ctrl+Y)", "Redo (Ctrl+Shift+Z / Ctrl+Y)")} aria-label={t("ทำซ้ำ", "Redo")} className={ibCls(false)}><Icon value="i:arrow-forward-up" className="text-[16px]" /></button>
            {sep}
            <button type="button" onClick={copyButton} disabled={!selIds.length} title={t("คัดลอกชิ้นที่เลือก (Ctrl+C) — วางใน Illustrator ได้", "Copy selected (Ctrl+C) — pastes into Illustrator too")} aria-label={t("คัดลอก", "Copy")} className={ibCls(false)}><Icon value="i:copy" className="text-[16px]" /></button>
            <button type="button" onClick={pasteInternal} title={t("วาง (Ctrl+V)", "Paste (Ctrl+V)")} aria-label={t("วาง", "Paste")} className={ibCls(false)}><Icon value="i:clipboard" className="text-[16px]" /></button>
            <button type="button" onClick={duplicateSel} disabled={!selIds.length} title={t("ทำสำเนาชิ้นที่เลือก (Ctrl+D)", "Duplicate (Ctrl+D)")} className={ibCls(false)}>{t("สำเนา", "Dup")}</button>
            {sep}
          </>}
          <span className="relative" data-menu>
            <button type="button" onClick={() => setMenu(menu === "snap" ? null : "snap")} title={t("ดูดเข้าจุดทุกกี่ ซม.", "Snap step")} className={ibCls(menu === "snap")}>
              <Icon value="i:magnet" className="text-[15px]" />{snap === 0 ? t("ไม่ดูด", "Off") : `${snap}`}<Icon value="i:chevron-down" className="text-[12px] text-slate-400" />
            </button>
            {menu === "snap" && (
              <div className="absolute left-0 top-9 z-30 w-40 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg">
                <div className="px-2 py-1 text-[11px] text-slate-400">{t("ดูดเข้าทุก", "Snap every")}</div>
                {SNAP_STEPS.map((s) => (
                  <button key={s} type="button" onClick={() => { setSnap(s); setMenu(null); }} className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left ${snap === s ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                    {s === 0 ? t("ไม่ดูด", "Off") : fmtL(s)}
                  </button>
                ))}
              </div>
            )}
          </span>
          <span className="relative" data-menu>
            <button type="button" onClick={() => setMenu(menu === "more" ? null : "more")} title={t("ตั้งค่าเพิ่ม: ความทึบชิ้น · นำเข้าไฟล์ SVG", "More: piece fill · import SVG")} aria-label={t("ตั้งค่าเพิ่ม", "More")} className={ibCls(menu === "more")}><Icon value="i:adjustments-horizontal" className="text-[16px]" /></button>
            {menu === "more" && (
              <div className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
                <label className="flex items-center gap-2" title={t("ความทึบของพื้นชิ้น — จางลงเพื่อเห็นรูปอ้างอิงด้านล่าง (เส้นขอบยังชัด)", "Piece fill opacity — fade to see the reference below (outlines stay sharp)")}>
                  <span className="w-14">{t("ชิ้นทึบ", "Piece fill")}</span>
                  <input type="range" min={5} max={100} step={5} value={Math.round(pieceFade * 100)} onChange={(e) => setPieceFade(Number(e.target.value) / 100)} className="min-w-0 flex-1" aria-label={t("ความทึบของชิ้น", "Piece opacity")} />
                  <span className="w-9 text-right tabular-nums">{Math.round(pieceFade * 100)}%</span>
                </label>
                {!readonly && <button type="button" onClick={() => { setMenu(null); fileRef.current?.click(); }} className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50" title={t("นำเข้าไฟล์ .svg (หรือก๊อปจาก Illustrator แล้วกด Ctrl+V)", "Import an .svg file (or copy in Illustrator and press Ctrl+V)")}>
                  <Icon value="i:file-import" className="text-[14px]" />{t("นำเข้าไฟล์ SVG", "Import SVG file")}
                </button>}
                <div className="text-[11px] text-slate-400">{t("ลากขีดใต้พื้นที่วาด = ปรับความสูง · ดับเบิลคลิกขีด = ความสูงเดิม", "Drag the bar under the board to resize · double-click it to reset")}</div>
              </div>
            )}
          </span>
        </div>
        {tool === "measure" && (
          <div className={`${fbar} bg-violet-50/95 text-xs text-violet-800`}>
            <Icon value="i:ruler-measure" className="mx-1 text-[14px]" />
            {([["line", t("วัดตรง", "Straight")], ["curve", t("วัดโค้ง", "Curve")], ["edge", t("ตามขอบชิ้น", "Along edge")]] as [MeasureMode, string][]).map(([m, l]) => (
              <button key={m} type="button" onClick={() => { setMeasureMode(m); setMDraft(null); }} className={`h-7 rounded-md border px-2 ${measureMode === m ? "border-violet-400 bg-white font-medium text-violet-700" : "border-transparent text-violet-700 hover:bg-white/60"}`}>{l}</button>
            ))}
            {measures.length > 0 && <button type="button" onClick={() => setMeasures([])} className="h-7 rounded-md px-2 text-violet-700 hover:bg-white/60">{t(`ล้าง (${measures.length})`, `Clear (${measures.length})`)}</button>}
          </div>
        )}
        {cal && (
          <div className={`${fbar} flex-wrap gap-2 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-800`}>
            <span>{!cal.a ? t("ตั้งขนาดจริง: คลิกจุดที่ 1 บนรูป (เช่น มุมซ้ายของตัวกระเป๋า)", "Set real size: click point 1 on the image (e.g. the bag's left corner)") : !cal.b ? t("คลิกจุดที่ 2 (เช่น มุมขวาของตัวกระเป๋า)", "Click point 2 (e.g. the bag's right corner)") : t(`ตอนนี้ห่าง ${r1(Math.hypot(cal.b.x - cal.a.x, cal.b.y - cal.a.y))} ${t("ซม.", "cm")} — ของจริงยาว`, `Now ${r1(Math.hypot(cal.b.x - cal.a.x, cal.b.y - cal.a.y))} ${t("ซม.", "cm")} apart — real length`)}</span>
            {cal.a && cal.b && <>
              <input type="number" step="0.1" min={0.1} value={cal.cm} onChange={(e) => setCal({ ...cal, cm: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") applyCal(); }} autoFocus aria-label={t("ระยะจริง ซม.", "Real length cm")} className="h-7 w-20 rounded border border-amber-300 bg-white px-1.5 text-right" />
              <span>{t("ซม.", "cm")}</span>
              <button type="button" onClick={applyCal} className="h-7 rounded-md bg-amber-600 px-2.5 text-white hover:bg-amber-700">{t("ตั้ง", "Set")}</button>
            </>}
            <button type="button" onClick={() => setCal(null)} className="h-7 rounded-md px-2 hover:bg-amber-100">{t("ยกเลิก", "Cancel")}</button>
          </div>
        )}
        {refPickOpen && refPicker && (
          <div className="pointer-events-auto max-h-[min(60vh,420px)] w-[min(440px,100%)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-600"><b className="font-medium">{t("เลือกรูปสินค้าเป็นภาพอ้างอิง", "Pick a product photo as a reference")}</b><button type="button" onClick={() => setRefPickOpen(false)} aria-label={t("ปิด", "Close")} className="ml-auto text-slate-400 hover:text-slate-600">✕</button></div>
            {refPicker(addRef)}
          </div>
        )}
      </div>
      {/* บนขวา: ขยายเต็มป๊อป · พับแผง */}
      <div className={`${fbar} absolute right-2 top-2`}>
        <button type="button" onClick={() => setFocus((v) => !v)} title={focus ? t("ย่อกลับ", "Exit full view") : t("ขยายพื้นที่วาดเต็มหน้าจอ", "Expand the board to full screen")} className={ibCls(focus)}>
          <Icon value={focus ? "i:x" : "i:maximize"} className="text-[16px]" />{focus ? t("ย่อกลับ", "Exit") : null}
        </button>
        <button type="button" onClick={() => setPanelOpen(!panelOpen)} title={panelOpen ? t("พับแผงรายละเอียดชิ้น (พื้นที่วาดกว้างขึ้น)", "Collapse the piece panel (wider board)") : t("เปิดแผงรายละเอียดชิ้น", "Open the piece panel")} aria-label={t("แผงรายละเอียดชิ้น", "Piece panel")} className={ibCls(panelOpen)}>
          <Icon value="i:layout-sidebar-right" className="text-[16px]" />
        </button>
      </div>
      {/* ล่างซ้าย: รูปอ้างอิง */}
      {refs.length > 0 && activeRefObj && (
        <div className="absolute bottom-3 left-14 flex flex-col items-start gap-1.5" data-menu>
          {menu === "ref" && (
            <div className="pointer-events-auto w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
              <div className="flex flex-wrap gap-1">
                {refs.map((r, i) => <button key={r.id} type="button" onClick={() => setActiveRef(r.id)} className={`h-7 max-w-[10rem] truncate rounded-md border px-2 ${r.id === activeRefObj.id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white"}`}>{r.label || t(`รูป ${i + 1}`, `Image ${i + 1}`)}</button>)}
              </div>
              <label className="flex items-center gap-2"><span className="w-10 text-slate-400">{t("จาง", "Fade")}</span>
                <input type="range" min={10} max={100} step={5} value={Math.round(activeRefObj.op * 100)} onChange={(e) => patchRef(activeRefObj.id, { op: Number(e.target.value) / 100 })} className="min-w-0 flex-1" aria-label={t("ความจางของรูป", "Image opacity")} />
                <span className="w-9 text-right tabular-nums">{Math.round(activeRefObj.op * 100)}%</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1"><input type="checkbox" checked={activeRefObj.lock} onChange={(e) => patchRef(activeRefObj.id, { lock: e.target.checked })} className="h-3.5 w-3.5" />{t("ล็อก", "Lock")}</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={activeRefObj.show} onChange={(e) => patchRef(activeRefObj.id, { show: e.target.checked })} className="h-3.5 w-3.5" />{t("แสดง", "Show")}</label>
                <span className="text-slate-400">{t("กว้าง", "W")} {fmtL(activeRefObj.w)}</span>
              </div>
              {!readonly && <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => { setMenu(null); setActiveRef(activeRefObj.id); patchRef(activeRefObj.id, { lock: true, show: true }); setCal({ cm: "30" }); }} className={btnCls(!!cal)}><Icon value="i:ruler-measure" className="text-[14px]" />{t("ตั้งขนาดจริง", "Set real size")}</button>
                <button type="button" onClick={() => { setRefs((rs) => rs.filter((r) => r.id !== activeRefObj.id)); setActiveRef(null); }} className="h-8 rounded-md px-2 text-rose-600 hover:bg-rose-50">{t("เอารูปออก", "Remove")}</button>
              </div>}
            </div>
          )}
          <button type="button" onClick={() => setMenu(menu === "ref" ? null : "ref")} className={`${fbar} gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50`} title={t("ตั้งค่ารูปอ้างอิง", "Reference image settings")}>
            <Icon value="i:photo" className="text-[14px]" />
            <span className="max-w-[9rem] truncate">{activeRefObj.label || t("รูปอ้างอิง", "Reference")}</span>
            <span className="text-slate-400">{t(`จาง ${Math.round(activeRefObj.op * 100)}%`, `${Math.round(activeRefObj.op * 100)}%`)}</span>
            {!activeRefObj.show && <span className="text-amber-600">{t("ซ่อนอยู่", "hidden")}</span>}
            <Icon value={menu === "ref" ? "i:chevron-down" : "i:chevron-up"} className="text-[12px] text-slate-400" />
          </button>
        </div>
      )}
      {/* ล่างขวา: พิกัด + ซูม */}
      <div className={`${fbar} absolute bottom-3 right-2`}>
        <span className="hidden px-1.5 font-mono text-[11px] tabular-nums text-slate-400 sm:inline">{hover ? `x ${r2s(hover.x)} · y ${r2s(hover.y)}` : "x — · y —"}</span>
        <button type="button" onClick={() => zoomAt(0.5)} aria-label={t("ซูมออก", "Zoom out")} className={ibCls(false)}><Icon value="i:minus" className="text-[15px]" /></button>
        <span className="w-11 text-center text-xs tabular-nums text-slate-500">{Math.round((62 / view.w) * 100)}%</span>
        <button type="button" onClick={() => zoomAt(2)} aria-label={t("ซูมเข้า", "Zoom in")} className={ibCls(false)}><Icon value="i:plus" className="text-[15px]" /></button>
        <button type="button" onClick={() => fitView()} title={t("พอดีจอ", "Fit")} className={ibCls(false)}>{t("พอดี", "Fit")}</button>
      </div>
      {/* ขีดใต้แคนวาส: ลากปรับความสูง */}
      {!focus && (
        <div role="separator" aria-orientation="horizontal" aria-label={t("ลากเพื่อปรับความสูงพื้นที่วาด", "Drag to resize the board")} title={t("ลากเพื่อปรับความสูง · ดับเบิลคลิก = ความสูงเดิม", "Drag to resize · double-click to reset")}
          className="pointer-events-auto absolute bottom-0 left-1/2 flex h-3 w-20 -translate-x-1/2 cursor-ns-resize items-center justify-center"
          onPointerDown={(e) => { gripRef.current = { y: e.clientY, h: canvasH }; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ */ } e.preventDefault(); }}
          onPointerMove={(e) => { const g = gripRef.current; if (g) setCanvasH(g.h + e.clientY - g.y); }}
          onPointerUp={() => { if (gripRef.current) { gripRef.current = null; saveNum(CANVAS_H_KEY, canvasH); } }}
          onDoubleClick={() => setCanvasH(CANVAS_H_DEFAULT, true)}>
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>
      )}
    </div>
  );
  const bodyEl = (
      <div className={focus ? "fixed inset-0 z-[80] space-y-3 overflow-y-auto bg-white p-3" : "space-y-3"}>
        <div className={`grid gap-3 ${panelOpen ? "lg:grid-cols-[minmax(0,1fr)_290px]" : "lg:grid-cols-[minmax(0,1fr)_36px]"} ${focus ? "lg:[&>aside]:max-h-[calc(100vh-110px)] lg:[&>aside]:overflow-y-auto" : ""}`}>   {/* แผงขวาอยู่ตลอด — เลือก/เลิกเลือกชิ้นแล้วพื้นที่วาดไม่ขยับ */}
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
              <div className="relative min-w-0">
              <svg ref={bindSvg} className="block w-full bg-white" style={{ height: focus ? "calc(100vh - 150px)" : canvasH, cursor, touchAction: "none" }}
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
                  const on = p.id === sel || multi.has(p.id), single = p.id === sel && multi.size < 2, b = g.finished, cb = g.cutBox;
                  const cutD = p.allow > 0 || g.segAllow ? polyD(g.cut) + g.holesCut.map((h) => polyD(h)).join("") : shapePathD(p.shape) + p.holes.map((h) => shapePathD(h)).join("");
                  return (
                    <g key={p.id} data-locked={lockPids?.has(p.pid) ? "1" : undefined} style={hidePids?.has(p.pid) ? { opacity: 0.12, pointerEvents: "none" } : lockPids?.has(p.pid) ? { pointerEvents: "none" } : undefined}>
                      <path d={cutD} fillRule="evenodd" data-piece={p.id} fill={COLORS.fill} fillOpacity={on ? Math.min(1, pieceFade + 0.15) : pieceFade} stroke={on ? COLORS.sel : COLORS.stroke} strokeWidth={on ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" style={{ cursor: editId === p.id ? "copy" : "move" }} />
                      {(p.allow > 0 || !!g.segAllow) && <path d={shapePathD(p.shape) + p.holes.map((h) => shapePathD(h)).join("")} fill="none" stroke={COLORS.stroke} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
                      {lockPids?.has(p.pid) && <text x={g.finished.x + fs * 0.4} y={g.finished.y + fs * 1.1} fontSize={fs * 0.85} fill="#475569" style={{ pointerEvents: "none" }}>{t("ล็อก", "Locked")}</text>}
                      {foldSegments(p.shape, cleanFoldEdges(p.shape, p.foldEdges)).map((L, fi) => (   // เส้นพับ (ขอบที่ตั้งว่าพับเข้าใน)
                        <path key={`f${fi}`} d={"M" + L.map((q) => `${q[0]} ${q[1]}`).join("L")} fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="10 3 2 3" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                      ))}
                      {edgeHover && edgeHover.id === p.id && (() => {   // ขอบที่ชี้อยู่ในรายการเผื่อรายขอบ
                        const ed = pieceEdges(p.shape)[edgeHover.i];
                        return ed ? <path d={"M" + ed.pts.map((q) => `${q[0]} ${q[1]}`).join("L")} fill="none" stroke={COLORS.sel} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} /> : null;
                      })()}
                      {p.grain && p.grain.length === 2 && (() => {   // เส้นทางผ้า: ลูกศร 2 หัว
                        const [[x1, y1], [x2, y2]] = p.grain; const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, hs = fs * 0.45;
                        const head = (x: number, y: number, s: number) => `M${x + s * ux * hs - uy * hs * 0.6} ${y + s * uy * hs + ux * hs * 0.6}L${x} ${y}L${x + s * ux * hs + uy * hs * 0.6} ${y + s * uy * hs - ux * hs * 0.6}`;
                        return <path d={`M${x1} ${y1}L${x2} ${y2}${head(x1, y1, 1)}${head(x2, y2, -1)}`} fill="none" stroke={MARK_COLOR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />;
                      })()}
                      {(p.notches ?? []).length > 0 && notchSegments(g.sew, p.notches ?? [], p.allow, Math.max(0.5, fs * 0.45), g.segAllow).map(([a, c], ni) => (
                        <line key={ni} x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} stroke={MARK_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                      ))}
                      {notchMode && p.id === sel && (p.notches ?? []).map((n, ni) => <circle key={`n${ni}`} cx={n[0]} cy={n[1]} r={fs * 0.22} fill="#fff" stroke={MARK_COLOR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />)}
                      <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={COLORS.text} style={{ pointerEvents: "none" }}>P{i + 1}{p.name ? ` ${p.name}` : ""}{p.count > 1 ? ` ×${p.count}` : ""}</text>
                      {single && editId !== p.id && <>
                        <rect x={cb.x} y={cb.y} width={cb.w} height={cb.h} fill="none" stroke={COLORS.sel} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                        <text x={cb.x + cb.w / 2} y={cb.y + cb.h + fs * 1.1} fontSize={fs * 0.9} textAnchor="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{p.allow > 0 || g.segAllow ? t("ตัด ", "cut ") : ""}{fmtL(cb.w)}</text>
                        <text x={cb.x + cb.w + fs * 0.6} y={cb.y + cb.h / 2} fontSize={fs * 0.9} dominantBaseline="middle" fill={COLORS.sel} style={{ pointerEvents: "none" }}>{fmtL(cb.h)}</text>
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
                {finishLayer}
                {seamLayer}
                {flagLayer}
                {edgeHits}
                {seamGrips}
                {innerLayer}
                {marquee && <rect x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)} width={Math.abs(marquee.a.x - marquee.b.x)} height={Math.abs(marquee.a.y - marquee.b.y)} fill={COLORS.stroke} fillOpacity={0.08} stroke={COLORS.stroke} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
                {guides.map((gd, gi) => gd.x != null
                  ? <line key={`gd${gi}`} x1={gd.x} x2={gd.x} y1={view.y} y2={view.y + vh} stroke={GUIDE_COLOR} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                  : <line key={`gd${gi}`} y1={gd.y} y2={gd.y} x1={view.x} x2={view.x + view.w} stroke={GUIDE_COLOR} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />)}
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
                    <text x={x + w / 2} y={y - fs * 0.5} fontSize={fs * 0.9} textAnchor="middle" fill={COLORS.sel}>{fmtN(w)} × {fmtN(h)} {uL}</text>
                  </g>;
                })()}
                {pen && <g style={{ pointerEvents: "none" }}>
                  <path d={penPath()} fill="none" stroke={COLORS.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  {pen.hover && lastNode && <>
                    <line x1={lastNode.x} y1={lastNode.y} x2={pen.hover.x} y2={pen.hover.y} stroke={COLORS.sel} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <text x={(lastNode.x + pen.hover.x) / 2} y={(lastNode.y + pen.hover.y) / 2 - fs * 0.4} fontSize={fs * 0.85} textAnchor="middle" fill={COLORS.sel}>{fmtL(Math.hypot(pen.hover.x - lastNode.x, pen.hover.y - lastNode.y))}</text>
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
                  const path = g && mDraft.hover && Math.abs(mDraft.travel) > 0 ? outlineWalk(g.sew, mDraft.pos, mDraft.travel) : null;
                  const end = path?.[path.length - 1];
                  return <g style={{ pointerEvents: "none" }}>
                    {path && <polyline points={path.map((q) => q.join(",")).join(" ")} fill="none" stroke={MEASURE_COLOR} strokeWidth={3} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />}
                    <circle cx={mDraft.a[0]} cy={mDraft.a[1]} r={fs * 0.25} fill={MEASURE_COLOR} />
                    {end && <circle cx={end[0]} cy={end[1]} r={fs * 0.18} fill="#fff" stroke={MEASURE_COLOR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
                    {path && mDraft.hover && <text x={mDraft.hover.x + fs * 0.4} y={mDraft.hover.y - fs * 0.4} fontSize={fs * 0.85} fill={MEASURE_COLOR} stroke="#fff" strokeWidth={fs * 0.12} paintOrder="stroke">{fmtLen(Math.abs(mDraft.travel))}</text>}
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
              {overlayEl}
              </div>
            </div>
            <div className="text-xs text-slate-500">{hint}</div>
            {msg && <div className={`rounded-lg px-3 py-2 text-xs ${msg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
          </div>

          {/* แผงรายละเอียดชิ้น (พับได้ — เหลือแถบบาง ๆ · คลิกชิ้นแล้วกางเอง) */}
          {!panelOpen && (
            <button type="button" onClick={() => setPanelOpen(true)} title={t("เปิดแผงรายละเอียดชิ้น", "Open the piece panel")}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs text-slate-500 hover:bg-slate-100 lg:flex-col lg:justify-start">
              <Icon value="i:layout-sidebar-right" className="text-[16px]" />
              <span className="lg:[writing-mode:vertical-rl]">{selPiece ? `P${selIdx + 1}${selPiece.name ? ` ${selPiece.name}` : ""}` : multi.size >= 2 ? t(`เลือก ${multi.size} ชิ้น`, `${multi.size} selected`) : t("รายละเอียดชิ้น", "Piece details")}</span>
            </button>
          )}
          {panelOpen && sewTool && seamPanel}
          {panelOpen && !sewTool && multi.size >= 2 && (
            <aside className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs" aria-label={t("เลือกหลายชิ้น", "Multiple pieces")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">{t(`เลือก ${multi.size} ชิ้น`, `${multi.size} pieces selected`)}</span>
                <button type="button" onClick={() => { setMulti(new Set()); setSel(null); }} aria-label={t("เลิกเลือก", "Deselect")} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {pieces.filter((p) => multi.has(p.id)).map((p) => <span key={p.id} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">P{pieces.indexOf(p) + 1}{p.name ? ` ${p.name}` : ""}</span>)}
              </div>
              {!readonly && <>
                <div>
                  <div className="mb-1 font-medium text-slate-600">{t("จัดแนว (ตามกรอบตัด)", "Align (by cut box)")}</div>
                  <div className="grid grid-cols-3 gap-1">
                    {([["l", t("ชิดซ้าย", "Left")], ["cx", t("กึ่งกลาง ↕", "Center")], ["r", t("ชิดขวา", "Right")], ["t", t("ชิดบน", "Top")], ["cy", t("กึ่งกลาง ↔", "Middle")], ["b", t("ชิดล่าง", "Bottom")]] as const).map(([m, l]) => (
                      <button key={m} type="button" onClick={() => alignSel(m)} className={btnCls(false)}>{l}</button>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button type="button" disabled={multi.size < 3} onClick={() => distributeSel("x")} className={`${btnCls(false)} disabled:opacity-40`} title={t("ระยะห่างแนวนอนเท่ากัน (≥3 ชิ้น)", "Equal horizontal gaps (3+ pieces)")}>{t("เว้นเท่ากัน ↔", "Distribute ↔")}</button>
                    <button type="button" disabled={multi.size < 3} onClick={() => distributeSel("y")} className={`${btnCls(false)} disabled:opacity-40`} title={t("ระยะห่างแนวตั้งเท่ากัน (≥3 ชิ้น)", "Equal vertical gaps (3+ pieces)")}>{t("เว้นเท่ากัน ↕", "Distribute ↕")}</button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-medium text-slate-600">{t("รวมรูป", "Combine shapes")}</div>
                  <div className="grid grid-cols-3 gap-1">
                    <button type="button" onClick={() => booleanSel("union")} className={btnCls(false)} title={t("รวมทุกชิ้นที่เลือกเป็นรูปเดียว", "Merge all selected into one shape")}>{t("รวม", "Union")}</button>
                    <button type="button" onClick={() => booleanSel("subtract")} className={btnCls(false)} title={t("ชิ้นหลัก (P เลขน้อยสุด) ถูกเจาะด้วยชิ้นอื่น", "The main piece (lowest P) is cut by the others")}>{t("ตัดออก", "Subtract")}</button>
                    <button type="button" onClick={() => booleanSel("intersect")} className={btnCls(false)} title={t("เหลือเฉพาะส่วนที่ทุกชิ้นซ้อนกัน", "Keep only where all pieces overlap")}>{t("ส่วนทับ", "Intersect")}</button>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">{t(`ชิ้นหลัก = P${pieces.findIndex((p) => multi.has(p.id)) + 1} (เก็บวัสดุ/เผื่อพับ/บรรทัดตีราคา) · ขอบโค้งกลายเป็นจุด แก้จุดต่อได้`, `Main piece = P${pieces.findIndex((p) => multi.has(p.id)) + 1} (keeps materials/allowance/cost row) · curves become points`)}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={copyButton} className={btnCls(false)}><Icon value="i:copy" className="text-[13px]" />{t("คัดลอก", "Copy")}</button>
                  <button type="button" onClick={duplicateSel} className={btnCls(false)}>{t("ทำสำเนา", "Duplicate")}</button>
                  <button type="button" onClick={deleteSel} className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50"><Icon value="i:trash" className="text-[13px]" />{t("ลบทั้งหมด", "Delete all")}</button>
                </div>
              </>}
              <div className="text-[11px] text-slate-400">{t("ลากชิ้นใดก็ได้ในกลุ่ม = ย้ายพร้อมกัน · ลูกศร = ขยับทั้งกลุ่ม · Shift+คลิก = เอาออกจากกลุ่ม", "Drag any piece to move the group · arrows nudge all · Shift+click removes from the group")}</div>
            </aside>
          )}
          {panelOpen && !sewTool && multi.size < 2 && !(selPiece && selGeo) && (
            <aside className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500" aria-label={t("รายละเอียดชิ้น", "Piece details")}>
              <div className="mb-2 flex items-center gap-2"><span className="text-sm font-semibold text-slate-600">{t("รายละเอียดชิ้น", "Piece details")}</span><button type="button" onClick={() => setPanelOpen(false)} title={t("ปิดแผง (พื้นที่วาดกว้างขึ้น · คลิกชิ้นแล้วแผงกลับมาเอง)", "Close the panel (wider board · it reopens when you click a piece)")} aria-label={t("ปิดแผง", "Close panel")} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button></div>
              <p>{t("กดชิ้นที่วาดแล้ว เพื่อตั้งชื่อ ใส่วัสดุ (หนัง ซับใน …) เผื่อพับ ขนาด จำนวน เจาะรู พับครึ่ง กลับด้าน แก้จุด", "Click a piece to set its name, materials (leather, lining…), allowance, size, count, holes, fold, flip and points")}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-slate-400">
                <li>{t("Ctrl+Z ย้อนกลับ · Ctrl+Shift+Z / Ctrl+Y ทำซ้ำ", "Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo")}</li>
                <li>{t("R สี่เหลี่ยม · O วงกลม · P ปากกา · V ย้าย · H เลื่อนดู", "R rect · O circle · P pen · V move · H pan")}</li>
                <li>{t("ลูกศร = ขยับชิ้น (Shift ×10) · Delete = ลบ", "Arrows = nudge (Shift ×10) · Delete = remove")}</li>
                <li>{t("M ไม้บรรทัด: วัดตรง · วัดโค้ง · ตามขอบชิ้น", "M measure: straight · curve · along edge")}</li>
                <li>{t("Shift+คลิก / Shift+ลากกรอบ / Ctrl+A = เลือกหลายชิ้น · Ctrl+C / Ctrl+V / Ctrl+D", "Shift+click / Shift+drag / Ctrl+A = multi-select · Ctrl+C / Ctrl+V / Ctrl+D")}</li>
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
          {panelOpen && !sewTool && multi.size < 2 && selPiece && selGeo && (
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
                      {matProps?.[m.id]?.color && <span className="h-2.5 w-2.5 rounded-full border border-white" style={{ background: matProps[m.id].color }} />}
                      {m.name}
                      {onMatPropsChange && <button type="button" onClick={() => setMatOpen(matOpen === m.id ? null : m.id)} aria-pressed={matOpen === m.id} title={t("ตั้งค่าวัสดุ: ความอยู่ทรง ความหนา สี", "Material settings: stiffness, thickness, colour")} aria-label={t(`ตั้งค่า ${m.name}`, `Settings for ${m.name}`)} className={matProps?.[m.id] ? "text-blue-600" : "text-blue-300 hover:text-blue-600"}><Icon value="i:adjustments-horizontal" className="text-[13px]" /></button>}
                      <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, mats: p.mats.filter((x) => x.id !== m.id) }))} aria-label={t(`เอา ${m.name} ออก`, `Remove ${m.name}`)} className="text-blue-400 hover:text-rose-600">✕</button>
                    </span>
                  )) : <span className="text-amber-600">{t("ยังไม่เลือกวัสดุ", "No material yet")}</span>}
                </div>
                {materials.length > 0
                  ? <SearchableSelect value="" options={matOptions} placeholder={t("＋ เพิ่มวัสดุ (เช่น หนัง, ซับใน)", "＋ Add material (e.g. leather, lining)")}
                      onChange={(v) => { const m = materials.find((x) => x.id === v); if (m) patchPiece(selPiece.id, (p) => ({ ...p, mats: [...p.mats, { id: m.id, name: m.name }] })); }} />
                  : <div className="text-slate-400">{t("เลือกวัสดุในตารางตีราคาทีหลังได้", "Pick materials in the costing table later")}</div>}
                {onMatPropsChange && matOpen && selPiece.mats.some((m) => m.id === matOpen) && (() => {
                  const m = selPiece.mats.find((x) => x.id === matOpen)!, cur = matProps?.[m.id], val: MatProps = cur ?? { stiff: 0.5, thick: 1 };
                  const put = (next: MatProps) => onMatPropsChange({ ...(matProps ?? {}), [m.id]: next });
                  return (
                    <div className="mt-2 space-y-1.5 rounded-md border border-blue-200 bg-white p-2">
                      <div className="font-medium text-slate-700">{t(`ค่าของวัสดุ: ${m.name}`, `Material values: ${m.name}`)}</div>
                      <label className="block space-y-1"><span className="text-slate-500">{t("ชุดค่าสำเร็จ", "Preset")}</span>
                        <select value={val.preset ?? ""} disabled={readonly} onChange={(e) => { const pz = MAT_PRESETS.find((x) => x.key === e.target.value); if (pz) put({ ...val, preset: pz.key, stiff: pz.stiff, thick: pz.thick }); else { const { preset: _p, ...rest } = val; void _p; put(rest); } }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5">
                          <option value="">{t("ตั้งเอง", "Custom")}</option>
                          {MAT_PRESETS.map((pz) => <option key={pz.key} value={pz.key}>{t(pz.th, pz.en)}</option>)}
                        </select></label>
                      <label className="block space-y-0.5"><span className="flex justify-between text-slate-500"><span>{t("ความอยู่ทรง (0 นิ่ม – 1 แข็ง)", "Holds its shape (0 soft – 1 rigid)")}</span><b className="tabular-nums text-slate-700">{val.stiff.toFixed(2)}</b></span>
                        <input type="range" min={0} max={1} step={0.05} value={val.stiff} disabled={readonly} onChange={(e) => { const { preset: _p, ...rest } = val; void _p; put({ ...rest, stiff: Number(e.target.value) }); }} className="w-full accent-blue-600" /></label>
                      <div className="flex items-center justify-between gap-2"><span className="text-slate-500">{t("ความหนา (มม.)", "Thickness (mm)")}</span><NumField value={val.thick} min={0.1} max={20} label={t("ความหนา มม.", "Thickness mm")} onCommit={(v) => { const { preset: _p, ...rest } = val; void _p; put({ ...rest, thick: v }); }} className="w-16" /></div>
                      <div className="flex items-center justify-between gap-2"><span className="text-slate-500">{t("สีในภาพ 3D", "Colour in 3D")}</span><ColorInput value={val.color ?? "#d8c08c"} allowText={false} onChange={(c) => put({ ...val, color: c })} /></div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400"><span>{t("ค่านี้ใช้ทั้งแพทเทิร์นใบนี้ (ทุกชิ้นที่ใช้วัสดุนี้) · เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง", "Applies to every piece using this material in this pattern · estimates, not measured values")}</span>
                        {cur && !readonly && <button type="button" onClick={() => { const next = { ...(matProps ?? {}) }; delete next[m.id]; onMatPropsChange(next); }} className="shrink-0 text-blue-700 hover:underline">{t("ล้างค่า", "Clear")}</button>}</div>
                    </div>
                  );
                })()}
              </div>
              {pieceInfoFields && (() => {
                const inf = selPiece.info ?? {};
                const setInfo = (f: (x: PieceInfo) => PieceInfo, key?: string) => patchPiece(selPiece.id, (p) => { const next = f(p.info ?? {}); return { ...p, info: Object.keys(next).length ? next : null }; }, key);
                const drop = <K extends keyof PieceInfo>(x: PieceInfo, k: K): PieceInfo => { const { [k]: _d, ...rest } = x; void _d; return rest; };
                return (
                  <div className="space-y-1.5">
                    <div className="font-medium text-slate-600">{t("ข้อมูลชิ้นและการอยู่ทรง", "Piece details and stiffness")}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5"><span className="text-slate-500">{t("รหัสชิ้น", "Piece code")}</span>
                        <input key={`${selPiece.id}:${inf.code ?? ""}`} defaultValue={inf.code ?? ""} disabled={readonly} maxLength={30} placeholder="FR-01" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (inf.code ?? "")) setInfo((x) => (v ? { ...x, code: v } : drop(x, "code"))); }} className="h-8 w-full rounded-md border border-slate-200 px-2 disabled:bg-slate-50" /></label>
                      <label className="space-y-0.5"><span className="text-slate-500">{t("ชนิดชิ้น", "Piece type")}</span>
                        <select value={inf.role ?? ""} disabled={readonly} onChange={(e) => { const v = e.target.value as PieceRole | ""; setInfo((x) => (v ? { ...x, role: v } : drop(x, "role"))); }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 disabled:bg-slate-50">
                          <option value="">{t("ยังไม่ระบุ", "Not set")}</option>{PIECE_ROLES.map((r0) => <option key={r0.key} value={r0.key}>{t(r0.th, r0.en)}</option>)}
                        </select></label>
                    </div>
                    <label className="block space-y-0.5"><span className="text-slate-500">{t("ติดแผ่นเสริม", "Bonded reinforcement")}</span>
                      <select value={inf.bond ?? ""} disabled={readonly} onChange={(e) => { const v = e.target.value as BondKind | ""; setInfo((x) => (v ? { ...x, bond: v } : drop(x, "bond"))); }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 disabled:bg-slate-50">
                        <option value="">{t("ไม่ติด", "None")}</option>{BOND_KINDS.map((b0) => <option key={b0.key} value={b0.key}>{t(b0.th, b0.en)}</option>)}
                      </select></label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={inf.skive != null} disabled={readonly} onChange={(e) => setInfo((x) => (e.target.checked ? { ...x, skive: 8 } : drop(x, "skive")))} className="h-3.5 w-3.5 accent-blue-600" />{t("ปาดขอบ", "Skive edges")}</label>
                      {inf.skive != null && <><NumField value={inf.skive} min={1} max={50} step={1} label={t("กว้างที่ปาด มม.", "Skive width mm")} onCommit={(v) => setInfo((x) => ({ ...x, skive: v }), `skive-${selPiece.id}`)} className="w-14" /><span className="text-slate-400">{t("มม.", "mm")}</span></>}
                    </div>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!inf.solid} disabled={readonly} onChange={(e) => setInfo((x) => (e.target.checked ? { ...x, solid: true } : drop(x, "solid")))} className="h-3.5 w-3.5 accent-blue-600" />{t("ชิ้นนี้แข็งอยู่ทรง (ไม่ทรุดในภาพจำลอง)", "This piece is rigid (does not slump in the simulation)")}</label>
                    <div className="text-[11px] text-slate-400">{t("แผ่นเสริมกับแข็งอยู่ทรง มีผลกับภาพจำลองวัสดุทิ้งตัวในแท็บประกอบ 3D · รหัส ชนิด ปาดขอบ ออกในใบพิมพ์", "Reinforcement and rigid affect the drape simulation in the Assemble 3D tab · code, type and skive print on the sheet")}</div>
                  </div>
                );
              })()}

              <div data-guide="allow">
                <div className="mb-1 font-medium text-slate-600">{t(`เผื่อพับ / เผื่อเย็บ (${uL})`, `Fold / seam allowance (${uL})`)}</div>
                <div className="flex flex-wrap items-center gap-1">
                  {ALLOW_STEPS.map((a) => <button key={a} type="button" onClick={() => setAllow(a)} className={`h-7 rounded-md border px-2 ${selPiece.allow === a ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{a}</button>)}
                  <NumField len value={selPiece.allow} min={0} max={20} label={t(`เผื่อพับ ${uL}`, `Allowance ${uL}`)} onCommit={setAllow} className="w-16" />
                </div>
                <div className="mt-1 text-slate-400">{t("เส้นประ = แนวเย็บ · เส้นทึบ = แนวตัด (รวมเผื่อ) · รูเจาะหดเข้าตามเผื่อ", "Dashed = sewing line · solid = cutting line · holes shrink by the allowance")}</div>
                {(() => {   // เผื่อรายขอบ: ขอบปากพับ 3 ซม. ขอบอื่น 1 ซม. ฯลฯ — แก้ขอบไหน ขอบนั้นสว่างบนกระดาน · กดค่าเดียวด้านบน = ล้างรายขอบ
                  const E = pieceEdges(selPiece.shape);
                  if (E.length < 2 || E.length > 24) return null;
                  const per = edgeAllowances(selPiece.shape, selPiece.allowEdges, selPiece.allow);
                  const setEdge = (i: number, v: number) => patchPiece(selPiece.id, (p) => {
                    const cur = edgeAllowances(p.shape, p.allowEdges, p.allow) ?? E.map(() => p.allow);
                    return { ...p, allowEdges: cur.map((x, k) => (k === i ? cleanAllow(v) : x)) };
                  }, `allow-edge-${selPiece.id}-${i}`);
                  const fold = cleanFoldEdges(selPiece.shape, selPiece.foldEdges);
                  const toggleFold = (i: number) => patchPiece(selPiece.id, (p) => {
                    const next = (cleanFoldEdges(p.shape, p.foldEdges) ?? E.map(() => 0)).map((x, k) => (k === i ? (x ? 0 : 1) : x));
                    return { ...p, foldEdges: next.some(Boolean) ? next : null };
                  });
                  return (
                    <div className="mt-1.5">
                      <button type="button" onClick={() => setEdgeOpen(!edgeOpen)} className="text-blue-700 hover:underline">{edgeOpen || per || fold ? "▾" : "▸"} {t("เผื่อรายขอบ / ขอบพับ (เช่น ขอบปากพับ 3 ซม.)", "Per-edge allowance / fold edges (e.g. 3 cm top hem)")}</button>
                      {(per || fold) && <span className="ml-1.5 rounded bg-amber-50 px-1 text-amber-700">{t("ใช้อยู่", "in use")}</span>}
                      {(edgeOpen || !!per || !!fold) && (
                        <div className="mt-1 space-y-1" onPointerLeave={() => setEdgeHover(null)}>
                          {E.map((ed) => (
                            <div key={ed.i} className="flex items-center gap-1.5" onPointerEnter={() => setEdgeHover({ id: selPiece.id, i: ed.i })}>
                              <span className="w-28 shrink-0 tabular-nums text-slate-600">{t(`ขอบ ${ed.i + 1}`, `Edge ${ed.i + 1}`)} · {fmtL(ed.len)}</span>
                              {readonly ? <span className="tabular-nums">{per ? per[ed.i] : selPiece.allow}</span>
                                : <NumField len value={per ? per[ed.i] : selPiece.allow} min={0} max={20} label={t(`เผื่อของขอบ ${ed.i + 1} ${uL}`, `Allowance of edge ${ed.i + 1} ${uL}`)} onCommit={(v) => setEdge(ed.i, v)} className="w-16" />}
                              <label className="inline-flex items-center gap-1 text-slate-500"><input type="checkbox" disabled={readonly} checked={!!fold?.[ed.i]} onChange={() => toggleFold(ed.i)} className="h-3.5 w-3.5 accent-violet-600" />{t("พับ", "Fold")}</label>
                            </div>
                          ))}
                          <div className="text-slate-400">{t("ชี้ที่แถว = ขอบนั้นสว่างบนกระดาน · ติ๊ก พับ = ขอบนี้พับเข้าใน (เส้นม่วงบนกระดาน · เส้นพับในหน้าพิมพ์และไฟล์ตัด) · เพิ่ม/ลบจุดของชิ้น = กลับไปใช้ค่าเดียวทั้งชิ้น", "Hover a row to light up that edge · tick Fold = this edge folds inward (purple line; fold line in print and cut files) · adding or removing points resets")}</div>
                          {per && !readonly && <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, allowEdges: null }))} className="text-blue-700 hover:underline">{t("กลับไปใช้ค่าเดียวทุกขอบ", "Back to one value for all edges")}</button>}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <div className="mb-1 font-medium text-slate-600">{t("ขนาดสำเร็จ (เส้นประ)", "Finished size (dashed)")}</div>
                {selPiece.link && <div className="mb-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800" data-link-note>{t(`ชิ้นนี้ผูกรูปกับ ${pieceNo(selPiece.link.to)} — ขนาด รูปทรง หมุน ย่อขยาย ต้องแก้ที่ชิ้นต้นแบบ (แก้ที่ชิ้นนี้ค่าจะกลับตามต้นแบบ) · ถ้าต้องการให้ต่างกัน กด เลิกผูก ที่หัวข้อ ชิ้นคู่ผูกกัน`, `This piece follows ${pieceNo(selPiece.link.to)} — change size, shape, rotation or scale on the master piece (changes here snap back) · to make it different, press Unlink under Linked pieces`)}</div>}
                <div data-guide="size" className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-2 gap-y-1.5 text-slate-500">
                  <span>{t("กว้าง", "W")}</span><NumField len value={selGeo.finished.w} min={0.1} label={t(`กว้าง ${uL}`, `Width ${uL}`)} disabled={!!selPiece.link} onCommit={(v) => setSelBox({ w: v }, `w-${selPiece.id}`)} className="w-16" />
                  <span>{t("สูง", "H")}</span><NumField len value={selGeo.finished.h} min={0.1} label={t(`สูง ${uL}`, `Height ${uL}`)} disabled={!!selPiece.link} onCommit={(v) => setSelBox({ h: v }, `h-${selPiece.id}`)} className="w-16" />
                  <span>X</span><NumField len value={selGeo.finished.x} label="X" onCommit={(v) => setSelBox({ x: v }, `x-${selPiece.id}`)} className="w-16" />
                  <span>Y</span><NumField len value={selGeo.finished.y} label="Y" onCommit={(v) => setSelBox({ y: v }, `y-${selPiece.id}`)} className="w-16" />
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
                  {t("ขนาดตัด", "Cut size")} <b className="tabular-nums">{fmtN(selGeo.cutBox.w)} × {fmtN(selGeo.cutBox.h)}</b> {uL}
                  <span className="text-slate-400"> · {t("พื้นที่ตัด", "cut area")} {Math.round(selGeo.cutArea).toLocaleString("th-TH")} {t("ตร.ซม.", "cm²")} · {t("รอบรูป", "perimeter")} {fmtL(selGeo.perimeter)}</span>
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
                  <button type="button" onClick={mirrorCopy} className={btnCls(false)} title={t("สร้างชิ้นกลับด้านวางข้าง ๆ (ได้คู่ซ้าย/ขวา)", "Create a mirrored copy beside it (left/right pair)")}>{t("สำเนากลับด้าน", "Mirror copy")}</button>
                  {selHost && <button type="button" onClick={() => makeHole(selPiece)} className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 hover:bg-amber-100">{t(`เจาะเป็นรูใน P${pieces.indexOf(selHost) + 1}`, `Make a hole in P${pieces.indexOf(selHost) + 1}`)}</button>}
                  <button type="button" onClick={() => { commit(piecesRef.current.filter((p) => p.id !== selPiece.id)); setSel(null); setEditId(null); }} className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50"><Icon value="i:trash" className="text-[13px]" />{t("ลบชิ้น", "Delete")}</button>
                </div>
                {/* เครื่องมือ vector ของชิ้นนี้ */}
                <div className="mt-2 space-y-1.5 rounded-md border border-slate-200 bg-white p-2 text-slate-500">
                  <div data-guide="round" className="flex flex-wrap items-center gap-1">
                    <span className="w-16">{t("มุมโค้ง", "Round")}</span>
                    <input type="text" inputMode="decimal" value={roundR} onChange={(e) => setRoundR(e.target.value)} aria-label={t(`รัศมีมุมโค้ง ${uL}`, `Corner radius ${uL}`)} title={t("พิมพ์ได้ เช่น 10 mm · 1 cm", "Type e.g. 10 mm · 1 cm")} className="h-7 w-14 rounded border border-slate-200 px-1 text-right" />{uL}
                    <button type="button" onClick={applyRound} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("ลบมุมทุกมุมให้มน", "Round every corner")}>{t("ลบมุม", "Apply")}</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="w-16">{t("เส้นขนาน", "Offset")}</span>
                    <input type="text" inputMode="decimal" value={offD} onChange={(e) => setOffD(e.target.value)} aria-label={t(`ระยะเส้นขนาน ${uL}`, `Offset distance ${uL}`)} title={t("พิมพ์ได้ เช่น 10 mm · 1 cm", "Type e.g. 10 mm · 1 cm")} className="h-7 w-14 rounded border border-slate-200 px-1 text-right" />{uL}
                    <button type="button" onClick={() => offsetCopy(-1)} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("ชิ้นใหม่เล็กลงรอบด้าน เช่น ผ้ากาว/ซับใน", "New smaller piece, e.g. interfacing")}>{t("ด้านใน", "Inner")}</button>
                    <button type="button" onClick={() => offsetCopy(1)} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("ชิ้นใหม่ใหญ่ขึ้นรอบด้าน", "New larger piece")}>{t("ด้านนอก", "Outer")}</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="w-16">{t("เส้นทางผ้า", "Grain")}</span>
                    <button type="button" onClick={toggleGrain} className={`h-7 rounded-md border px-2 ${selPiece.grain ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 hover:bg-slate-50"}`}>{selPiece.grain ? t("ซ่อน", "Hide") : t("แสดง", "Show")}</button>
                    {selPiece.grain && <button type="button" onClick={turnGrain} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50">{t("หมุน 90°", "Turn 90°")}</button>}
                    {pieceInfoFields && selPiece.grain && selPiece.grain.length === 2 && (() => {   // ทิศทางผ้าเป็นองศา: 0 = แนวตั้ง · บวก = เอียงตามเข็ม
                      const [[x1, y1], [x2, y2]] = selPiece.grain, deg = Math.round(((Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI + 360) % 180);
                      return <><NumField value={deg} min={0} max={179} step={1} label={t("ทิศทางผ้า องศา", "Grain angle degrees")} className="w-14" onCommit={(v) => patchPiece(selPiece.id, (p) => {
                        if (!p.grain || p.grain.length !== 2) return p;
                        const [[a1, b1], [a2, b2]] = p.grain, mx = (a1 + a2) / 2, my = (b1 + b2) / 2, h = Math.hypot(a2 - a1, b2 - b1) / 2, r = (v * Math.PI) / 180;
                        return { ...p, grain: [[mx - Math.sin(r) * h, my + Math.cos(r) * h], [mx + Math.sin(r) * h, my - Math.cos(r) * h]] };
                      })} /><span className="text-slate-400">°</span></>;
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="w-16">{t("รอยบาก", "Notches")}</span>
                    <button type="button" onClick={() => setNotchMode((v) => !v)} className={`h-7 rounded-md border px-2 ${notchMode ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 hover:bg-slate-50"}`} title={t("คลิกบนขอบชิ้น = เพิ่ม · คลิกที่รอยเดิม = ลบ", "Click the edge to add · click a notch to remove")}>{notchMode ? t("เสร็จ", "Done") : t("คลิกเพิ่ม/ลบ", "Click to add")}</button>
                    <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, notches: [...(p.notches ?? []), ...midEdgeNotches(p.shape)] }))} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("ใส่รอยบากกลางทุกขอบตรง (ยาว ≥ 3 ซม.)", "Notch the middle of every straight edge (≥ 3 cm)")}>{t("กลางทุกขอบ", "Mid edges")}</button>
                    {(selPiece.notches ?? []).length > 0 && <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, notches: [] }))} className="h-7 rounded-md px-2 text-rose-600 hover:bg-rose-50">{t(`ล้าง (${(selPiece.notches ?? []).length})`, `Clear (${(selPiece.notches ?? []).length})`)}</button>}
                  </div>
                  {notchMode && <div className="text-[11px] text-rose-600">{t("โหมดรอยบาก: คลิกบนขอบชิ้นเพื่อเพิ่ม · คลิกที่รอยเดิมเพื่อลบ · Esc = เสร็จ", "Notch mode: click the edge to add · click a notch to remove · Esc = done")}</div>}
                </div>
                {pieceLinks && (() => {
                  const master = selPiece.link ? pieces.find((p) => p.pid === selPiece.link?.to) ?? null : null;
                  const followers = pieces.filter((p) => p.link?.to === selPiece.pid), targets = linkTargets(pieces, selPiece.pid);
                  return (
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                      <div className="flex items-center gap-1.5 font-medium text-slate-600"><Icon value="i:link" className="text-[14px]" />{t("ชิ้นคู่ผูกกัน", "Linked pieces")}</div>
                      {master ? (
                        <>
                          <div className="rounded-md bg-blue-50 px-2 py-1.5 text-blue-900">{t(`รูปของชิ้นนี้ตาม ${pieceNo(master.pid)} — แก้รูปที่ชิ้นต้นแบบ แล้วชิ้นนี้เปลี่ยนตาม (ย้าย ตั้งชื่อ วัสดุ เผื่อเย็บ เส้นใน เป็นของชิ้นนี้เอง)`, `This piece follows ${pieceNo(master.pid)} — edit the master's shape and this one changes with it (position, name, material, allowance and inner lines stay its own)`)}</div>
                          {!readonly && <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5"><input type="checkbox" checked={selPiece.link?.mirror === "x"} onChange={(e) => patchPiece(selPiece.id, (p) => (p.link ? { ...p, link: e.target.checked ? { to: p.link.to, mirror: "x" } : { to: p.link.to } } : p))} className="h-3.5 w-3.5 accent-blue-600" />{t("กลับซ้ายขวา", "Mirrored left-right")}</label>
                            <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, link: null }))} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("ชิ้นนี้กลับเป็นชิ้นอิสระ รูปคงเดิม แก้เองได้", "Make this piece independent again (shape stays as is)")}>{t("เลิกผูก", "Unlink")}</button>
                            {seams && onSeamsChange && <button type="button" onClick={() => sewLikeMaster(selPiece.pid)} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("คัดลอกตะเข็บของชิ้นต้นแบบมาให้ชิ้นนี้ (เย็บกับคู่ของชิ้นที่ต้นแบบเย็บอยู่ · ที่มีอยู่แล้วไม่สร้างซ้ำ)", "Copy the master's seams to this piece (sewn to the counterparts of the master's partners · existing ones are not duplicated)")}>{t("เย็บตามต้นแบบ", "Sew like the master")}</button>}
                          </div>}
                        </>
                      ) : (
                        <>
                          {followers.length > 0 && <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-900">{t(`ชิ้นนี้เป็นต้นแบบของ ${followers.map((p) => pieceNo(p.pid)).join(", ")} — แก้รูปชิ้นนี้ ชิ้นเหล่านั้นเปลี่ยนตาม`, `This piece is the master of ${followers.map((p) => pieceNo(p.pid)).join(", ")} — they follow its shape`)}</div>}
                          {!readonly && <div className="flex flex-wrap items-center gap-1.5">
                            <button type="button" onClick={linkedCopy} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50" title={t("สร้างชิ้นคู่กลับซ้ายขวาวางข้าง ๆ ผูกรูปกับชิ้นนี้ และเย็บตามชิ้นนี้ให้ (เย็บกับขอบฝั่งตรงข้ามของชิ้นที่สมมาตร)", "Create a mirrored twin next to this piece, linked to its shape and sewn like it (to the opposite edge of symmetric partners)")}>{t("+ สร้างชิ้นคู่ (ผูก)", "+ Linked twin")}</button>
                            {followers.length === 0 && targets.length > 0 && (
                              <select value="" aria-label={t("ผูกรูปกับชิ้น", "Link shape to piece")} onChange={(e) => { const to = e.target.value; if (to) patchPiece(selPiece.id, (p) => ({ ...p, link: { to } })); }} className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1">
                                <option value="">{t("ผูกรูปกับชิ้น…", "Link shape to…")}</option>
                                {targets.map((p) => <option key={p.pid} value={p.pid}>{pieceNo(p.pid)}</option>)}
                              </select>
                            )}
                          </div>}
                          {!readonly && followers.length === 0 && targets.length > 0 && <div className="text-[11px] text-slate-400">{t("ผูกแล้วรูปของชิ้นนี้จะเปลี่ยนเป็นรูปของชิ้นที่เลือกทันที (ย้อนกลับได้ด้วย Ctrl+Z)", "Linking replaces this piece's shape with the chosen piece's shape right away (Ctrl+Z undoes it)")}</div>}
                        </>
                      )}
                    </div>
                  );
                })()}
                {seams && !readonly && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <button type="button" data-edge-values onClick={() => { changeTool("sewedit"); setMsg({ tone: "ok", text: t("กดขอบของชิ้นที่ต้องการบนกระดาน แล้วตั้งค่าในแผงขวา: ติดซิป · กุ้นขอบ · พับเข้าใน · เผื่อของขอบ · เดินด้ายทับ", "Click the edge you want on the board, then set it in the right panel: zip · binding · fold · allowance · topstitch") }); }}
                      title={t("ค่าของขอบอยู่ในเครื่องมือ แก้ตะเข็บ (B): กดขอบแล้วตั้งค่าได้", "Edge settings live in the Edit sewing tool (B): click an edge to set it")}
                      className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50"><Icon value="i:needle" className="text-[13px]" />{t("ตั้งค่าขอบ: ติดซิป · กุ๊น · พับ · เผื่อรายขอบ", "Edge settings: zip · binding · fold · allowance")}</button>
                  </div>
                )}
                {innerLines && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-1.5"><span className="font-medium text-slate-600">{t(`เส้นในชิ้น (${(selPiece.inner ?? []).length})`, `Inner lines (${(selPiece.inner ?? []).length})`)}</span>
                      {!readonly && <button type="button" onClick={() => changeTool("inner")} className={`ml-auto h-7 rounded-md border px-2 ${tool === "inner" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50"}`} title={t("กด 2 จุดข้างในชิ้น = เส้นตรง 1 เส้น (L)", "Click 2 points inside the piece = one straight line (L)")}>{t("+ วาดเส้นใน", "+ Draw a line")}</button>}</div>
                    {(selPiece.inner ?? []).map((l) => {
                      const used = seamList.some((x) => [x.a, x.b].some((q) => q.pid === selPiece.pid && q.inner === l.id));
                      const picked = innerSel?.id === selPiece.id && innerSel.line === l.id, pb = shapeBox(selPiece.shape), off = innerOffset(l, pb);
                      const setLine = (f: (q: InnerLine) => InnerLine | null) => patchPiece(selPiece.id, (p) => ({ ...p, inner: (p.inner ?? []).map((q) => (q.id === l.id ? f(q) ?? q : q)) }));
                      return (
                        <div key={l.id} className={`space-y-1.5 rounded-md ${picked ? "border border-blue-200 bg-blue-50/50 p-1.5" : ""}`}>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setInnerSel(picked ? null : { id: selPiece.id, line: l.id })} aria-pressed={picked} title={t("เลือกเส้นนี้ เพื่อพิมพ์ระยะจากขอบ (ลากบนกระดานได้ด้วยเครื่องมือเส้นใน L)", "Select this line to type its distance from the edges (drag it on the board with the Inner line tool, L)")} aria-label={t("เลือกเส้นใน", "Select inner line")} className={`h-5 w-5 shrink-0 rounded-full border-2 ${picked ? "border-blue-600" : "border-transparent"}`} style={{ background: INNER_STYLE[l.kind].col, backgroundClip: "content-box", padding: 2 }} />
                          <select value={l.kind} disabled={readonly} aria-label={t("ชนิดของเส้นใน", "Inner line type")} onChange={(e) => patchPiece(selPiece.id, (p) => ({ ...p, inner: (p.inner ?? []).map((q) => (q.id === l.id ? { ...q, kind: e.target.value as InnerKind } : q)) }))} className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1 disabled:bg-slate-50">
                            {INNER_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.th, k.en)}</option>)}
                          </select>
                          {l.kind === "hw" && <select value={hwKind(l.hw)} disabled={readonly} aria-label={t("ชนิดอะไหล่", "Hardware type")} onChange={(e) => setLine((q) => ({ ...q, hw: e.target.value as HwKind }))} className="h-7 min-w-0 rounded-md border border-slate-200 bg-white px-1 text-xs">
                            {HW_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.th, k.en)}</option>)}
                          </select>}
                          <span className="shrink-0 tabular-nums text-slate-500" title={l.name}>{fmtL(lenOfPts(l.pts))}{used ? ` · ${t("เย็บแล้ว", "sewn")}` : ""}</span>
                          {!readonly && <button type="button" onClick={() => patchPiece(selPiece.id, (p) => ({ ...p, inner: (p.inner ?? []).filter((q) => q.id !== l.id) }))} title={used ? t("ลบเส้นนี้ (ตะเข็บที่เย็บกับเส้นนี้จะขึ้นว่าต้องเย็บใหม่)", "Delete this line (its seam will need redoing)") : t("ลบเส้นนี้", "Delete this line")} aria-label={t("ลบเส้นใน", "Delete inner line")} className="shrink-0 text-slate-400 hover:text-red-600"><Icon value="i:x" /></button>}
                        </div>
                        {picked && (readonly ? <div className="tabular-nums text-slate-500">{t(`ห่างจากขอบบน ${fmtL(off.top)} · ขอบซ้าย ${fmtL(off.left)}`, `${fmtL(off.top)} from the top · ${fmtL(off.left)} from the left`)}</div> : (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span>{t("ห่างจากขอบบน", "From top")}</span><NumField len value={Math.round(off.top * 100) / 100} min={-500} max={500} step={0.5} label={t(`เส้นในห่างจากขอบบนของชิ้น ${uL}`, `Inner line distance from the piece's top ${uL}`)} onCommit={(v) => setLine((q) => placeInner(q, pb, { top: v }))} className="w-16" />
                            <span>{t("ขอบซ้าย", "From left")}</span><NumField len value={Math.round(off.left * 100) / 100} min={-500} max={500} step={0.5} label={t(`เส้นในห่างจากขอบซ้ายของชิ้น ${uL}`, `Inner line distance from the piece's left ${uL}`)} onCommit={(v) => setLine((q) => placeInner(q, pb, { left: v }))} className="w-16" />
                            {l.pts.length === 2 && <><span>{t("ยาว", "Length")}</span><NumField len value={Math.round(lenOfPts(l.pts) * 100) / 100} min={0.2} max={500} step={0.5} label={t(`ความยาวเส้นใน ${uL}`, `Inner line length ${uL}`)} onCommit={(v) => setLine((q) => setInnerLength(q, v))} className="w-16" /></>}
                            <button type="button" onClick={() => setLine((q) => placeInner(q, pb, { center: true }))} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50" title={t("จัดเส้นนี้ให้อยู่กึ่งกลางซ้ายขวาของชิ้น", "Centre this line left-right on the piece")}>{t("กึ่งกลางซ้ายขวา", "Centre")}</button>
                          </div>
                        ))}
                        </div>
                      );
                    })}
                    {!readonly && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5" data-hw-add>
                        <span className="text-slate-500">{t("＋ วางอะไหล่:", "＋ Place hardware:")}</span>
                        {HW_KINDS.map((k) => (
                          <button key={k.key} type="button" data-hw-btn={k.key} title={t(`วาง${k.th} 1 ตัวที่กึ่งกลางชิ้น แล้วลากย้ายด้วยเครื่องมือเส้นใน (L) หรือพิมพ์ระยะจากขอบ`, `Place one ${k.en.toLowerCase()} at the piece centre, then drag it with the inner-line tool (L) or type its distance from the edges`)}
                            onClick={() => { const b = shapeBox(selPiece.shape), n = (selPiece.inner ?? []).filter((q) => q.kind === "hw").length, id = `hw${Date.now().toString(36)}${n}`;
                              patchPiece(selPiece.id, (p) => ({ ...p, inner: [...(p.inner ?? []), hwLine(id, k.key, [b.x + b.w / 2 + (n % 5) * 1.5, b.y + b.h / 2 + Math.floor(n / 5) * 1.5])] }));
                              setInnerSel({ id: selPiece.id, line: id }); if (tool !== "inner") changeTool("inner"); }}
                            className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t(k.th, k.en)}</button>
                        ))}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400">{t("เส้นในไม่ใช่เส้นตัด: บอกตำแหน่งให้ช่าง (แนวเย็บช่องใส่ของ ช่องซิป แนวพับ) และให้ชิ้นอื่นมาเย็บได้ด้วยเครื่องมือเย็บ · ออกในใบพิมพ์และไฟล์ตัดเป็นชั้น INNER", "Inner lines are not cut lines: they mark positions (pocket stitching, zip slot, folds) and other pieces can be sewn to them · printed and exported on layer INNER")}</div>
                  </div>
                )}
                {selPiece.holes.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selPiece.holes.map((h, hi) => { const hb = shapeBox(h); return (
                      <div key={hi} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1">
                        <span className="text-slate-600">{t(`รู ${hi + 1}`, `Hole ${hi + 1}`)} · {fmtN(hb.w)}×{fmtN(hb.h)} {uL}</span>
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
                      <td className="py-1.5 text-right tabular-nums">{fmtN(g.cutBox.w)}×{fmtN(g.cutBox.h)}</td>
                      <td className="py-1.5 text-right tabular-nums">{Math.round(g.cutArea).toLocaleString("th-TH")}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{fmtN(p.allow)}{p.holes.length ? t(` · ${p.holes.length} รู`, ` · ${p.holes.length} holes`) : ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-2 text-[11px] text-slate-400">{t(`หน่วย: ${uL} (พื้นที่ ตร.ซม.) · ขนาดตัด = รวมเผื่อพับ (ลงตารางตีราคาเป็นกว้าง×ยาว)`, `Units: ${uL} (area cm²) · cut size includes the allowance (goes to the costing table as width×length)`)}</div>
          </div>
        </div>
      </div>
  );
  if (embedded) return (
    <LenUnitCtx.Provider value={{ unit, digits: lenDigits }}>
    <div ref={rootRef} className="space-y-3">
      {bodyEl}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">{footerEl}</div>
    </div>
    </LenUnitCtx.Provider>
  );
  return (
    <ERPModal open={open} onClose={() => onClose?.()} size="xl" hasUnsavedChanges={dirty}
      title={title ?? t("วาดชิ้นวัสดุ", "Draw material pieces")}
      description={t("ขนาดจริงหน่วย ซม. · กดชิ้นเพื่อใส่วัสดุ เผื่อพับ เจาะรู พับครึ่ง แก้จุด · Ctrl+Z ย้อนกลับ", "Real size in cm · click a piece for materials, allowance, holes, fold, points · Ctrl+Z to undo")}
      footer={footerEl}>
      <LenUnitCtx.Provider value={{ unit, digits: lenDigits }}><div ref={rootRef}>{bodyEl}</div></LenUnitCtx.Provider>
    </ERPModal>
  );
}
