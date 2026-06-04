"use client";

// ============================================================
// Task Manager — Canvas Board (แบบ Miro) · ขั้น A mock
// ผืนผ้าใบไม่มีขอบ: pan/zoom, โซนตามสถานะ, ลากการ์ดอิสระ,
// ปล่อยการ์ดในโซน = เปลี่ยนสถานะ, sticky note, จำ layout (localStorage)
// ขั้น B: ตำแหน่ง/sticky จะเก็บลง Supabase ต่อ record + workflow กลาง
// ============================================================

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import {
  STATUS_META, PRIORITY_META, isOverdue,
  type Task, type TaskStatus, type TaskPriority,
} from "./mock-data";

type Viewport = { x: number; y: number; scale: number };
type Pos = { x: number; y: number };
type Sticky = { id: string; x: number; y: number; text: string; color: string };
type Tool = "select" | "pan" | "sticky";
type Interaction =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "card"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { type: "sticky"; id: string; sx: number; sy: number; ox: number; oy: number }
  | null;

const COLUMNS: TaskStatus[] = ["new", "in_progress", "review", "done", "cancelled"];
const CARD_W = 280;
const ZONE_W = 340;
const ZONE_H = 1240;
const ZONE_GAP = 32;
const CARD_GAP_Y = 150;
const POS_KEY = "erp-tasks-canvas-pos:v1";
const STICKY_KEY = "erp-tasks-canvas-stickies:v1";
const STICKY_COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6"];

const ZONE_TONE: Record<TaskStatus, string> = {
  new:         "border-blue-200 bg-blue-50/50",
  in_progress: "border-indigo-200 bg-indigo-50/50",
  review:      "border-amber-200 bg-amber-50/50",
  done:        "border-emerald-200 bg-emerald-50/50",
  cancelled:   "border-slate-200 bg-slate-50/60",
};

const zoneX = (i: number) => i * (ZONE_W + ZONE_GAP);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function zoneIndexAtWorldX(wx: number): number {
  for (let i = 0; i < COLUMNS.length; i++) {
    if (wx >= zoneX(i) && wx <= zoneX(i) + ZONE_W) return i;
  }
  return -1;
}

export function CanvasBoard({
  tasks, onMove, onCardClick,
}: {
  tasks: Task[];
  onMove: (taskId: string, to: TaskStatus) => void;
  onCardClick: (id: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Interaction>(null);
  const movedRef = useRef(false);
  const [vp, setVp] = useState<Viewport>({ x: 40, y: 24, scale: 0.7 });
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [stickies, setStickies] = useState<Sticky[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [editingSticky, setEditingSticky] = useState<string | null>(null);

  // ---- load/save layout ----
  useEffect(() => {
    try {
      const p = localStorage.getItem(POS_KEY); if (p) setPositions(JSON.parse(p));
      const s = localStorage.getItem(STICKY_KEY); if (s) setStickies(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch { /* ignore */ } }, [positions]);
  useEffect(() => { try { localStorage.setItem(STICKY_KEY, JSON.stringify(stickies)); } catch { /* ignore */ } }, [stickies]);

  // ---- auto layout (เมื่อยังไม่เคยลาก) ----
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    COLUMNS.forEach((status, ci) => {
      tasks.filter(t => t.status === status).forEach((t, ri) => {
        map[t.id] = { x: zoneX(ci) + 30, y: 90 + ri * CARD_GAP_Y };
      });
    });
    return map;
  }, [tasks]);

  const posOf = (id: string): Pos => positions[id] ?? autoPos[id] ?? { x: 40, y: 90 };

  // ---- wheel zoom (anchor ที่เคอร์เซอร์) ----
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setVp(v => {
        const ns = clamp(v.scale * factor, 0.25, 2);
        return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBtn = (factor: number) => {
    const el = boardRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = rect.width / 2, sy = rect.height / 2;
    setVp(v => {
      const ns = clamp(v.scale * factor, 0.25, 2);
      return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns };
    });
  };
  const resetView = () => setVp({ x: 40, y: 24, scale: 0.7 });
  const resetLayout = () => { setPositions({}); };

  const screenToWorld = (clientX: number, clientY: number): Pos => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - vp.x) / vp.scale, y: (clientY - rect.top - vp.y) / vp.scale };
  };

  // ---- pointer handlers (จับที่ board, ใช้ pointer capture) ----
  const onBoardPointerDown = (e: RPE) => {
    // คลิกพื้นหลัง
    if (tool === "sticky") {
      const w = screenToWorld(e.clientX, e.clientY);
      const id = `st-${Date.now()}`;
      setStickies(p => [...p, { id, x: w.x - 80, y: w.y - 60, text: "", color: STICKY_COLORS[p.length % STICKY_COLORS.length] }]);
      setEditingSticky(id);
      setTool("select");
      return;
    }
    boardRef.current?.setPointerCapture(e.pointerId);
    interRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y };
  };

  const startCardDrag = (e: RPE, id: string) => {
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId);
    movedRef.current = false;
    const p = posOf(id);
    interRef.current = { type: "card", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };

  const startStickyDrag = (e: RPE, id: string) => {
    e.stopPropagation();
    if (editingSticky === id) return;
    boardRef.current?.setPointerCapture(e.pointerId);
    movedRef.current = false;
    const s = stickies.find(x => x.id === id)!;
    interRef.current = { type: "sticky", id, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y };
  };

  const onBoardPointerMove = (e: RPE) => {
    const it = interRef.current; if (!it) return;
    const dx = e.clientX - it.sx, dy = e.clientY - it.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    if (it.type === "pan") {
      setVp(v => ({ ...v, x: it.ox + dx, y: it.oy + dy }));
    } else if (it.type === "card") {
      const nx = it.ox + dx / vp.scale, ny = it.oy + dy / vp.scale;
      setPositions(p => ({ ...p, [it.id]: { x: nx, y: ny } }));
    } else if (it.type === "sticky") {
      const nx = it.ox + dx / vp.scale, ny = it.oy + dy / vp.scale;
      setStickies(p => p.map(s => s.id === it.id ? { ...s, x: nx, y: ny } : s));
    }
  };

  const onBoardPointerUp = (e: RPE) => {
    const it = interRef.current; interRef.current = null;
    try { boardRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!it) return;
    if (it.type === "card") {
      if (!movedRef.current) { onCardClick(it.id); return; }   // คลิก (ไม่ลาก) = เปิดรายละเอียด
      const p = posOf(it.id);
      const centerX = p.x + CARD_W / 2;
      const zi = zoneIndexAtWorldX(centerX);
      const task = tasks.find(t => t.id === it.id);
      if (zi >= 0 && task && task.status !== COLUMNS[zi]) onMove(it.id, COLUMNS[zi]);
    }
  };

  const deleteSticky = (id: string) => { setStickies(p => p.filter(s => s.id !== id)); if (editingSticky === id) setEditingSticky(null); };

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1">
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="เลือก/ลาก">🖱️</ToolBtn>
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="เลื่อนกระดาน">✋</ToolBtn>
        <ToolBtn active={tool === "sticky"} onClick={() => setTool("sticky")} title="โน้ตกาว — คลิกบนกระดานเพื่อวาง">🟨</ToolBtn>
        <span className="w-px h-6 bg-slate-200 mx-0.5" />
        <ToolBtn onClick={() => zoomBtn(1 / 1.2)} title="ซูมออก">➖</ToolBtn>
        <span className="text-xs text-slate-500 tabular-nums w-10 text-center">{Math.round(vp.scale * 100)}%</span>
        <ToolBtn onClick={() => zoomBtn(1.2)} title="ซูมเข้า">➕</ToolBtn>
        <span className="w-px h-6 bg-slate-200 mx-0.5" />
        <ToolBtn onClick={resetView} title="จัดมุมมองกลับ">🎯</ToolBtn>
        <ToolBtn onClick={resetLayout} title="จัดเรียงการ์ดใหม่อัตโนมัติ">↺</ToolBtn>
      </div>
      <div className="absolute top-3 right-3 z-20 text-[11px] text-slate-400 bg-white/80 rounded px-2 py-1 border border-slate-200">
        ลากพื้นหลัง = เลื่อน · ล้อเมาส์ = ซูม · ลากการ์ดข้ามโซน = เปลี่ยนสถานะ
      </div>

      {/* Canvas */}
      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 h-[calc(100vh-260px)] min-h-[520px] ${tool === "pan" ? "cursor-grab" : "cursor-default"}`}
        style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.x}px ${vp.y}px`, touchAction: "none" }}
      >
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

          {/* Sticky notes */}
          {stickies.map(s => (
            <div key={s.id} className="absolute rounded-lg shadow-md" style={{ left: s.x, top: s.y, width: 180, minHeight: 120, background: s.color }}
              onPointerDown={e => startStickyDrag(e, s.id)}>
              <div className="flex justify-between items-center px-2 pt-1 cursor-grab active:cursor-grabbing">
                <span className="text-[10px] text-slate-500">โน้ต</span>
                <button onPointerDown={e => e.stopPropagation()} onClick={() => deleteSticky(s.id)} className="text-slate-400 hover:text-red-500 text-xs leading-none">✕</button>
              </div>
              <textarea
                value={s.text}
                onPointerDown={e => e.stopPropagation()}
                onFocus={() => setEditingSticky(s.id)}
                onBlur={() => setEditingSticky(null)}
                onChange={e => setStickies(p => p.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))}
                placeholder="พิมพ์โน้ต..."
                className="w-full bg-transparent resize-none px-2 pb-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                rows={4}
              />
            </div>
          ))}

          {/* Task cards */}
          {tasks.map(t => {
            const p = posOf(t.id);
            return (
              <div key={t.id} className="absolute" style={{ left: p.x, top: p.y, width: CARD_W }} onPointerDown={e => startCardDrag(e, t.id)}>
                <CanvasCard task={t} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className={`h-8 w-8 flex items-center justify-center rounded-md text-sm transition-colors ${active ? "bg-violet-100 ring-1 ring-violet-300" : "hover:bg-slate-100"}`}>
      {children}
    </button>
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
        <span>{(task.subtasks.length > 0 || task.checklist.length > 0)
          ? `☑️ ${doneSub}/${task.subtasks.length} · ✓ ${doneChk}/${task.checklist.length}` : ""}</span>
        {task.due_date && <span className={overdue ? "text-red-600 font-semibold" : ""}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>}
      </div>
    </div>
  );
}
