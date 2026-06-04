"use client";

// ============================================================
// Task Manager — Canvas / Whiteboard (แบบ Miro) · ขั้น A mock
// พื้นขาว · ขยายเต็มหน้าต่าง · โซนตามสถานะ · ลากการ์ด (ปล่อยในโซน=เปลี่ยนสถานะ)
// กล่อง/ข้อความ/โน้ต · จัดรูปแบบตัวอักษร (ขนาด/หนา/เอียง/ขีด/สี/ไฮไลต์/จัดชิด)
// คัดลอก · ลบ (ปุ่ม Del) · จัดชั้นหน้า/หลัง · Undo/Redo · จำ layout (localStorage)
// รอบ 2 (ถัดไป): ลูกศรเชื่อมกล่อง + paste รูปขึ้น R2 (+ลบใน R2)
// ============================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import {
  STATUS_META, PRIORITY_META, isOverdue,
  type Task, type TaskStatus, type TaskPriority,
} from "./mock-data";

type Viewport = { x: number; y: number; scale: number };
type Pos = { x: number; y: number };
type Align = "left" | "center" | "right";
type Style = { fontSize: number; bold: boolean; italic: boolean; underline: boolean; color: string; align: Align; fontFamily: string };
type Sticky = { id: string; x: number; y: number; text: string; color: string; fontSize: number };
type BoardObject =
  | ({ id: string; type: "box"; x: number; y: number; w: number; h: number; text: string; fill: string; border: string } & Style)
  | ({ id: string; type: "text"; x: number; y: number; w: number; h: number; text: string; highlight: string } & Style);
type Board = { positions: Record<string, Pos>; stickies: Sticky[]; objects: BoardObject[] };
type Tool = "select" | "pan" | "sticky" | "box" | "text";
type Interaction =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "card"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { type: "drag"; id: string; sx: number; sy: number; ox: number; oy: number }       // sticky/object move
  | { type: "resize"; id: string; sx: number; sy: number; ow: number; oh: number }
  | null;

const COLUMNS: TaskStatus[] = ["new", "in_progress", "review", "done", "cancelled"];
const CARD_W = 280;
const ZONE_W = 340, ZONE_H = 1240, ZONE_GAP = 32, CARD_GAP_Y = 150;
const BOARD_KEY = "erp-tasks-canvas:v2";
const STICKY_COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6", "#fed7aa", "#e0e7ff"];
const TEXT_COLORS = ["#1e293b", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#ffffff"];
const FILL_COLORS = ["transparent", "#ffffff", "#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6", "#1e293b"];
const FONT_SIZES = [12, 14, 16, 20, 24, 32, 44];
const FONTS: { label: string; value: string }[] = [
  { label: "ค่าเริ่มต้น", value: "" },
  { label: "ไม่มีหัว (Sans)", value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { label: "มีเชิง (Serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "พิมพ์ดีด (Mono)", value: "'Courier New', monospace" },
];
const DEF_STYLE: Style = { fontSize: 16, bold: false, italic: false, underline: false, color: "#1e293b", align: "left", fontFamily: "" };

const ZONE_TONE: Record<TaskStatus, string> = {
  new: "border-blue-200 bg-blue-50/40", in_progress: "border-indigo-200 bg-indigo-50/40",
  review: "border-amber-200 bg-amber-50/40", done: "border-emerald-200 bg-emerald-50/40",
  cancelled: "border-slate-200 bg-slate-50/50",
};
const zoneX = (i: number) => i * (ZONE_W + ZONE_GAP);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clone = (b: Board): Board => JSON.parse(JSON.stringify(b));
function zoneIndexAtWorldX(wx: number): number {
  for (let i = 0; i < COLUMNS.length; i++) if (wx >= zoneX(i) && wx <= zoneX(i) + ZONE_W) return i;
  return -1;
}
const styleOf = (o: BoardObject): React.CSSProperties => ({
  fontSize: o.fontSize, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal",
  textDecoration: o.underline ? "underline" : "none", color: o.color, textAlign: o.align,
  fontFamily: o.fontFamily || undefined,
});

export function CanvasBoard({
  tasks, onMove, onCardClick,
}: {
  tasks: Task[];
  onMove: (taskId: string, to: TaskStatus) => void;
  onCardClick: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Interaction>(null);
  const movedRef = useRef(false);
  const dragStartRef = useRef<Board | null>(null);   // snapshot ก่อนเริ่มลาก (สำหรับ undo)
  const editStartRef = useRef<Board | null>(null);   // snapshot ก่อนเริ่มพิมพ์

  const [vp, setVp] = useState<Viewport>({ x: 40, y: 24, scale: 0.7 });
  const [board, setBoard] = useState<Board>({ positions: {}, stickies: [], objects: [] });
  const [past, setPast] = useState<Board[]>([]);
  const [future, setFuture] = useState<Board[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [selId, setSelId] = useState<string | null>(null);
  const [isMax, setIsMax] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(44);
  const [dragging, setDragging] = useState(false);   // ลาก/ย่อขยายอยู่ → ซ่อนแถบจัดรูปแบบ

  // ---- load/save ----
  useEffect(() => { try { const r = localStorage.getItem(BOARD_KEY); if (r) setBoard(JSON.parse(r)); } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch { /* ignore */ } }, [board]);

  // ---- history ----
  const commit = (next: Board) => { setPast(p => [...p, board]); setFuture([]); setBoard(next); };
  const pushPast = (snap: Board) => { setPast(p => [...p, snap]); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setFuture(f => [board, ...f]); setBoard(prev); setPast(p => p.slice(0, -1)); setSelId(null); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setPast(p => [...p, board]); setBoard(nxt); setFuture(f => f.slice(1)); setSelId(null); };

  // ---- selection helpers ----
  const sel = selId ? (board.objects.find(o => o.id === selId) ?? board.stickies.find(s => s.id === selId) ?? null) : null;
  const selKind: "box" | "text" | "sticky" | null = sel ? ("type" in sel ? (sel as BoardObject).type : "sticky") : null;

  const patchObject = (id: string, patch: Partial<BoardObject>) =>
    commit({ ...board, objects: board.objects.map(o => o.id === id ? { ...o, ...patch } as BoardObject : o) });
  const patchSticky = (id: string, patch: Partial<Sticky>) =>
    commit({ ...board, stickies: board.stickies.map(s => s.id === id ? { ...s, ...patch } : s) });

  const deleteSelected = () => {
    if (!selId) return;
    commit({ ...board, objects: board.objects.filter(o => o.id !== selId), stickies: board.stickies.filter(s => s.id !== selId) });
    setSelId(null);
  };
  const duplicateSelected = () => {
    if (!selId) return;
    const o = board.objects.find(x => x.id === selId);
    if (o) { const id = `${o.type}-${Date.now()}`; commit({ ...board, objects: [...board.objects, { ...o, id, x: o.x + 24, y: o.y + 24 }] }); setSelId(id); return; }
    const s = board.stickies.find(x => x.id === selId);
    if (s) { const id = `st-${Date.now()}`; commit({ ...board, stickies: [...board.stickies, { ...s, id, x: s.x + 24, y: s.y + 24 }] }); setSelId(id); }
  };
  const bringFront = () => { if (!selId) return; const o = board.objects.find(x => x.id === selId); if (!o) return; commit({ ...board, objects: [...board.objects.filter(x => x.id !== selId), o] }); };
  const sendBack = () => { if (!selId) return; const o = board.objects.find(x => x.id === selId); if (!o) return; commit({ ...board, objects: [o, ...board.objects.filter(x => x.id !== selId)] }); };

  // ---- fullscreen(in-window) + keyboard ----
  const toggleFs = () => setIsMax(m => !m);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = ["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName ?? "");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "d" && selId) { e.preventDefault(); duplicateSelected(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selId && !typing) { e.preventDefault(); deleteSelected(); }
      else if (e.key === "Escape") { setIsMax(false); setSelId(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selId, board, past, future]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- auto layout (การ์ดที่ยังไม่เคยลาก) ----
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    COLUMNS.forEach((status, ci) => tasks.filter(t => t.status === status).forEach((t, ri) => { map[t.id] = { x: zoneX(ci) + 30, y: 90 + ri * CARD_GAP_Y }; }));
    return map;
  }, [tasks]);
  const posOf = (id: string): Pos => board.positions[id] ?? autoPos[id] ?? { x: 40, y: 90 };

  // ---- zoom ----
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setVp(v => { const ns = clamp(v.scale * factor, 0.25, 2); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const zoomBtn = (factor: number) => {
    const el = boardRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = rect.width / 2, sy = rect.height / 2;
    setVp(v => { const ns = clamp(v.scale * factor, 0.25, 2); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });
  };
  const resetView = () => setVp({ x: 40, y: 24, scale: 0.7 });
  const resetLayout = () => commit({ ...board, positions: {} });

  const screenToWorld = (clientX: number, clientY: number): Pos => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - vp.x) / vp.scale, y: (clientY - rect.top - vp.y) / vp.scale };
  };

  // ---- pointer ----
  const onBoardPointerDown = (e: RPE) => {
    const w = screenToWorld(e.clientX, e.clientY);
    if (tool === "sticky") {
      const id = `st-${Date.now()}`;
      commit({ ...board, stickies: [...board.stickies, { id, x: w.x - 90, y: w.y - 60, text: "", color: STICKY_COLORS[board.stickies.length % STICKY_COLORS.length], fontSize: 14 }] });
      setSelId(id); setTool("select"); return;
    }
    if (tool === "box") {
      const id = `box-${Date.now()}`;
      commit({ ...board, objects: [...board.objects, { id, type: "box", x: w.x - 110, y: w.y - 70, w: 220, h: 140, text: "", fill: "#ffffff", border: "#cbd5e1", ...DEF_STYLE }] });
      setSelId(id); setTool("select"); return;
    }
    if (tool === "text") {
      const id = `text-${Date.now()}`;
      commit({ ...board, objects: [...board.objects, { id, type: "text", x: w.x - 80, y: w.y - 14, w: 200, h: 40, text: "", highlight: "transparent", ...DEF_STYLE, fontSize: 20 }] });
      setSelId(id); setTool("select"); return;
    }
    setSelId(null);
    boardRef.current?.setPointerCapture(e.pointerId);
    interRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y };
  };

  const startCardDrag = (e: RPE, id: string) => {
    e.stopPropagation(); setSelId(null);
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    dragStartRef.current = clone(board);
    const p = posOf(id);
    interRef.current = { type: "card", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };
  const startDrag = (e: RPE, id: string) => {
    e.stopPropagation(); setSelId(id); setDragging(true);
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    dragStartRef.current = clone(board);
    const node = board.objects.find(o => o.id === id) ?? board.stickies.find(s => s.id === id)!;
    interRef.current = { type: "drag", id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y };
  };
  const startResize = (e: RPE, id: string) => {
    e.stopPropagation(); setDragging(true);
    boardRef.current?.setPointerCapture(e.pointerId);
    dragStartRef.current = clone(board);
    const o = board.objects.find(x => x.id === id); if (!o) return;
    interRef.current = { type: "resize", id, sx: e.clientX, sy: e.clientY, ow: o.w, oh: o.h };
  };

  const onBoardPointerMove = (e: RPE) => {
    const it = interRef.current; if (!it) return;
    const dx = e.clientX - it.sx, dy = e.clientY - it.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    if (it.type === "pan") setVp(v => ({ ...v, x: it.ox + dx, y: it.oy + dy }));
    else if (it.type === "card") setBoard(b => ({ ...b, positions: { ...b.positions, [it.id]: { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale } } }));
    else if (it.type === "drag") {
      const nx = it.ox + dx / vp.scale, ny = it.oy + dy / vp.scale;
      setBoard(b => ({ ...b, objects: b.objects.map(o => o.id === it.id ? { ...o, x: nx, y: ny } : o), stickies: b.stickies.map(s => s.id === it.id ? { ...s, x: nx, y: ny } : s) }));
    } else if (it.type === "resize") {
      const nw = Math.max(120, it.ow + dx / vp.scale), nh = Math.max(60, it.oh + dy / vp.scale);
      setBoard(b => ({ ...b, objects: b.objects.map(o => o.id === it.id ? { ...o, w: nw, h: nh } : o) }));
    }
  };
  const onBoardPointerUp = (e: RPE) => {
    const it = interRef.current; interRef.current = null;
    setDragging(false);
    try { boardRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!it) return;
    if (it.type === "card") {
      if (!movedRef.current) return;   // คลิกเดียว = ไม่เปิด (ใช้ดับเบิลคลิกเปิด Drawer)
      if (dragStartRef.current) pushPast(dragStartRef.current);
      const centerX = posOf(it.id).x + CARD_W / 2;
      const zi = zoneIndexAtWorldX(centerX);
      const task = tasks.find(t => t.id === it.id);
      if (zi >= 0 && task && task.status !== COLUMNS[zi]) onMove(it.id, COLUMNS[zi]);
    } else if ((it.type === "drag" || it.type === "resize") && movedRef.current && dragStartRef.current) {
      pushPast(dragStartRef.current);
    }
    dragStartRef.current = null;
  };

  // ---- format bar position (วางเหนือวัตถุให้พ้น ถ้าชนขอบบนสลับไปใต้) ----
  const selH = sel ? ("h" in sel ? (sel as BoardObject).h : 124) : 0;
  const barPos = (() => {
    if (!sel) return null;
    const left = Math.max(4, vp.x + sel.x * vp.scale);
    let top = vp.y + sel.y * vp.scale - barH - 10;
    if (top < 4) top = vp.y + (sel.y + selH) * vp.scale + 10;
    return { left, top };
  })();
  useLayoutEffect(() => { if (barRef.current) setBarH(barRef.current.offsetHeight); }, [selId, selKind, board, vp.scale]);

  return (
    <div ref={wrapRef} className={isMax ? "fixed inset-0 z-[60] bg-white flex flex-col p-3" : "relative"}>
      {/* Toolbar */}
      <div className={`${isMax ? "" : "absolute top-3 left-3"} z-20 flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1 w-fit`}>
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="เลือก/ลาก">🖱️</ToolBtn>
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="เลื่อนกระดาน">✋</ToolBtn>
        <Sep />
        <ToolBtn active={tool === "box"} onClick={() => setTool("box")} title="กล่อง">▭</ToolBtn>
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} title="ข้อความ">𝐓</ToolBtn>
        <ToolBtn active={tool === "sticky"} onClick={() => setTool("sticky")} title="โน้ตกาว">🟨</ToolBtn>
        <Sep />
        <ToolBtn onClick={undo} title="ย้อนกลับ (Ctrl+Z)" disabled={!past.length}>↶</ToolBtn>
        <ToolBtn onClick={redo} title="ทำซ้ำ (Ctrl+Y)" disabled={!future.length}>↷</ToolBtn>
        <Sep />
        <ToolBtn onClick={() => zoomBtn(1 / 1.2)} title="ซูมออก">➖</ToolBtn>
        <span className="text-xs text-slate-500 tabular-nums w-10 text-center">{Math.round(vp.scale * 100)}%</span>
        <ToolBtn onClick={() => zoomBtn(1.2)} title="ซูมเข้า">➕</ToolBtn>
        <Sep />
        <ToolBtn onClick={resetView} title="จัดมุมมองกลับ">🎯</ToolBtn>
        <ToolBtn onClick={resetLayout} title="จัดเรียงการ์ดใหม่">↺</ToolBtn>
        <ToolBtn onClick={toggleFs} title={isMax ? "ย่อกลับ (Esc)" : "ขยายเต็มหน้าต่าง"}>{isMax ? "🗗" : "⛶"}</ToolBtn>
      </div>
      {!isMax && (
        <div className="absolute top-3 right-3 z-20 text-[11px] text-slate-400 bg-white/80 rounded px-2 py-1 border border-slate-200">
          ดับเบิลคลิกการ์ด = ดูรายละเอียด · คลิกกล่อง/ข้อความ = จัดรูปแบบ · Del = ลบ · Ctrl+Z = ย้อน
        </div>
      )}

      {/* Canvas */}
      <div ref={boardRef} onPointerDown={onBoardPointerDown} onPointerMove={onBoardPointerMove} onPointerUp={onBoardPointerUp}
        className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white ${isMax ? "flex-1 mt-2" : "h-[calc(100vh-260px)] min-h-[520px]"} ${tool === "pan" ? "cursor-grab" : tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
        style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.x}px ${vp.y}px`, touchAction: "none" }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.scale})` }}>
          {/* Zones */}
          {COLUMNS.map((status, i) => {
            const m = STATUS_META[status];
            const count = tasks.filter(t => t.status === status).length;
            return (
              <div key={status} className={`absolute rounded-2xl border-2 border-dashed ${ZONE_TONE[status]}`} style={{ left: zoneX(i), top: 0, width: ZONE_W, height: ZONE_H }}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
                  <span className="text-base font-bold text-slate-700">{m.label}</span>
                  <span className="text-xs font-medium text-slate-400 bg-white/70 rounded-full px-2 py-0.5">{count}</span>
                </div>
              </div>
            );
          })}

          {/* Objects (box/text) */}
          {board.objects.map(o => {
            const selected = selId === o.id;
            const common = `absolute group ${selected ? "ring-2 ring-violet-400" : ""}`;
            if (o.type === "box") {
              return (
                <div key={o.id} className={`${common} rounded-lg border-2 shadow-sm`} style={{ left: o.x, top: o.y, width: o.w, height: o.h, background: o.fill, borderColor: o.border }}
                  onPointerDown={e => startDrag(e, o.id)} onDoubleClick={() => setSelId(o.id)}>
                  {selected ? (
                    <textarea autoFocus value={o.text} onPointerDown={e => e.stopPropagation()}
                      onFocus={() => { editStartRef.current = clone(board); }}
                      onBlur={() => { if (editStartRef.current) { pushPast(editStartRef.current); editStartRef.current = null; } }}
                      onChange={e => setBoard(b => ({ ...b, objects: b.objects.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) }))}
                      placeholder="พิมพ์ข้อความ..." style={styleOf(o)}
                      className="w-full h-full bg-transparent resize-none p-2 outline-none placeholder:text-slate-400 cursor-text" />
                  ) : (
                    <div className="w-full h-full p-2 whitespace-pre-wrap overflow-hidden cursor-grab active:cursor-grabbing" style={styleOf(o)}>
                      {o.text || <span className="text-slate-300">กล่อง</span>}
                    </div>
                  )}
                  {selected && <div onPointerDown={e => startResize(e, o.id)} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)" }} />}
                </div>
              );
            }
            return (
              <div key={o.id} className={common} style={{ left: o.x, top: o.y, width: o.w, height: o.h }}
                onPointerDown={e => startDrag(e, o.id)} onDoubleClick={() => setSelId(o.id)}>
                {selected ? (
                  <textarea autoFocus value={o.text} onPointerDown={e => e.stopPropagation()}
                    onFocus={() => { editStartRef.current = clone(board); }}
                    onBlur={() => { if (editStartRef.current) { pushPast(editStartRef.current); editStartRef.current = null; } }}
                    onChange={e => setBoard(b => ({ ...b, objects: b.objects.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) }))}
                    placeholder="พิมพ์ข้อความ..." style={{ ...styleOf(o), background: o.highlight }}
                    className="w-full h-full resize-none p-1 rounded outline-none placeholder:text-slate-400 cursor-text" />
                ) : (
                  <div className="w-full h-full p-1 rounded whitespace-pre-wrap cursor-grab active:cursor-grabbing" style={{ ...styleOf(o), background: o.highlight }}>
                    {o.text || <span className="text-slate-300">ข้อความ</span>}
                  </div>
                )}
                {selected && <div onPointerDown={e => startResize(e, o.id)} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)" }} />}
              </div>
            );
          })}

          {/* Sticky notes */}
          {board.stickies.map(s => {
            const selected = selId === s.id;
            return (
              <div key={s.id} className={`absolute rounded-lg shadow-md ${selected ? "ring-2 ring-violet-400" : ""}`} style={{ left: s.x, top: s.y, width: 180, minHeight: 120, background: s.color }}
                onPointerDown={e => startDrag(e, s.id)}>
                <div className="flex justify-between items-center px-2 pt-1 cursor-grab active:cursor-grabbing">
                  <span className="text-[10px] text-slate-500">โน้ต</span>
                </div>
                <textarea value={s.text} onPointerDown={e => e.stopPropagation()}
                  onFocus={() => { setSelId(s.id); editStartRef.current = clone(board); }}
                  onBlur={() => { if (editStartRef.current) { pushPast(editStartRef.current); editStartRef.current = null; } }}
                  onChange={e => setBoard(b => ({ ...b, stickies: b.stickies.map(x => x.id === s.id ? { ...x, text: e.target.value } : x) }))}
                  placeholder="พิมพ์โน้ต..." style={{ fontSize: s.fontSize }}
                  className="w-full bg-transparent resize-none px-2 pb-2 text-slate-700 outline-none placeholder:text-slate-400 cursor-text" rows={4} />
              </div>
            );
          })}

          {/* Task cards */}
          {tasks.map(t => {
            const p = posOf(t.id);
            return <div key={t.id} className="absolute" style={{ left: p.x, top: p.y, width: CARD_W }} onPointerDown={e => startCardDrag(e, t.id)} onDoubleClick={() => onCardClick(t.id)}><CanvasCard task={t} /></div>;
          })}
        </div>

        {/* Format bar (ลอยเหนือวัตถุที่เลือก) — ซ่อนตอนกำลังลาก */}
        {sel && barPos && !dragging && (
          <div ref={barRef} className="absolute z-30 flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-lg p-1 flex-wrap" style={{ left: barPos.left, top: barPos.top, maxWidth: 420 }} onPointerDown={e => e.stopPropagation()}>
            {selKind === "sticky" && sel && "color" in sel && (
              <SwatchRow colors={STICKY_COLORS} value={(sel as Sticky).color} onPick={c => patchSticky(sel.id, { color: c })} />
            )}
            {(selKind === "box" || selKind === "text") && sel && "fontSize" in sel && (() => {
              const o = sel as BoardObject;
              const fi = FONT_SIZES.indexOf(o.fontSize);
              const setSize = (d: number) => patchObject(o.id, { fontSize: FONT_SIZES[clamp((fi < 0 ? 2 : fi) + d, 0, FONT_SIZES.length - 1)] });
              return (
                <>
                  <select value={o.fontFamily} onChange={e => patchObject(o.id, { fontFamily: e.target.value })}
                    title="ฟอนต์" className="h-7 text-xs border border-slate-200 rounded px-1 bg-white hover:bg-slate-50 outline-none max-w-[96px]"
                    style={{ fontFamily: o.fontFamily || undefined }}>
                    {FONTS.map(f => <option key={f.label} value={f.value} style={{ fontFamily: f.value || undefined }}>{f.label}</option>)}
                  </select>
                  <Sep />
                  <FmtBtn onClick={() => setSize(-1)} title="เล็กลง">A−</FmtBtn>
                  <span className="text-xs text-slate-500 w-6 text-center tabular-nums">{o.fontSize}</span>
                  <FmtBtn onClick={() => setSize(1)} title="ใหญ่ขึ้น">A+</FmtBtn>
                  <Sep />
                  <FmtBtn active={o.bold} onClick={() => patchObject(o.id, { bold: !o.bold })} title="ตัวหนา"><b>B</b></FmtBtn>
                  <FmtBtn active={o.italic} onClick={() => patchObject(o.id, { italic: !o.italic })} title="ตัวเอียง"><i>I</i></FmtBtn>
                  <FmtBtn active={o.underline} onClick={() => patchObject(o.id, { underline: !o.underline })} title="ขีดเส้นใต้"><u>U</u></FmtBtn>
                  <Sep />
                  <FmtBtn active={o.align === "left"} onClick={() => patchObject(o.id, { align: "left" })} title="ชิดซ้าย">⬅</FmtBtn>
                  <FmtBtn active={o.align === "center"} onClick={() => patchObject(o.id, { align: "center" })} title="กึ่งกลาง">⬌</FmtBtn>
                  <FmtBtn active={o.align === "right"} onClick={() => patchObject(o.id, { align: "right" })} title="ชิดขวา">➡</FmtBtn>
                  <Sep />
                  <span className="text-[10px] text-slate-400 px-0.5">สี</span>
                  <SwatchRow colors={TEXT_COLORS} value={o.color} onPick={c => patchObject(o.id, { color: c })} />
                  <span className="text-[10px] text-slate-400 px-0.5">{o.type === "box" ? "พื้น" : "ไฮไลต์"}</span>
                  <SwatchRow colors={FILL_COLORS} value={o.type === "box" ? o.fill : o.highlight}
                    onPick={c => patchObject(o.id, o.type === "box" ? { fill: c } : { highlight: c })} />
                </>
              );
            })()}
            <Sep />
            <FmtBtn onClick={duplicateSelected} title="คัดลอก (Ctrl+D)">⧉</FmtBtn>
            {(selKind === "box" || selKind === "text") && <>
              <FmtBtn onClick={bringFront} title="ขึ้นหน้าสุด">⬆</FmtBtn>
              <FmtBtn onClick={sendBack} title="ลงหลังสุด">⬇</FmtBtn>
            </>}
            <FmtBtn onClick={deleteSelected} title="ลบ (Del)" danger>🗑</FmtBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function Sep() { return <span className="w-px h-6 bg-slate-200 mx-0.5" />; }
function ToolBtn({ active, onClick, title, disabled, children }: { active?: boolean; onClick: () => void; title: string; disabled?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} disabled={disabled}
    className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30 ${active ? "bg-violet-100 ring-1 ring-violet-300" : "hover:bg-slate-100"}`}>{children}</button>;
}
function FmtBtn({ active, onClick, title, danger, children }: { active?: boolean; onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} title={title}
    className={`h-7 min-w-7 px-1.5 flex items-center justify-center rounded text-sm transition-colors ${danger ? "text-red-500 hover:bg-red-50" : active ? "bg-violet-100 ring-1 ring-violet-300" : "hover:bg-slate-100"}`}>{children}</button>;
}
function SwatchRow({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {colors.map(c => (
        <button key={c} onClick={() => onPick(c)} title={c}
          className={`h-5 w-5 rounded border ${value === c ? "ring-2 ring-violet-400 border-white" : "border-slate-200"}`}
          style={c === "transparent" ? { backgroundImage: "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)", backgroundSize: "8px 8px" } : { background: c }} />
      ))}
    </div>
  );
}

function CanvasCard({ task }: { task: Task }) {
  const pr = PRIORITY_META[task.priority as TaskPriority];
  const m = STATUS_META[task.status as TaskStatus];
  const overdue = isOverdue(task);
  const doneSub = task.subtasks.filter(s => s.status === "done").length;
  const doneChk = task.checklist.filter(c => c.done).length;
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-300 p-3 cursor-grab active:cursor-grabbing select-none">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${m.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
        </span>
        <span className="font-mono text-[10px] text-slate-400">{task.task_no}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 mb-1.5">{task.title}</p>
      {task.product_sku && <p className="text-[11px] text-slate-400 line-clamp-1 mb-1">📦 {task.product_sku}</p>}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={`px-1.5 py-0.5 rounded-full border ${pr.cls}`}>{pr.label}</span>
        <span className="text-slate-500 line-clamp-1">👤 {task.assignee_name}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-slate-400">
        <span>{(task.subtasks.length > 0 || task.checklist.length > 0) ? `☑️ ${doneSub}/${task.subtasks.length} · ✓ ${doneChk}/${task.checklist.length}` : ""}</span>
        {task.due_date && <span className={overdue ? "text-red-600 font-semibold" : ""}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>}
      </div>
    </div>
  );
}
