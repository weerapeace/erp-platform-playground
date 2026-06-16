"use client";

// ============================================================
// Task Manager — Canvas / Whiteboard (แบบ Miro) · ขั้น A mock
// พื้นขาว · ขยายเต็มหน้าต่าง · โซนตามสถานะ · ลากการ์ด (ปล่อยในโซน=เปลี่ยนสถานะ)
// กล่อง/ข้อความ/โน้ต · จัดรูปแบบตัวอักษร (ขนาด/หนา/เอียง/ขีด/สี/ไฮไลต์/จัดชิด)
// คัดลอก · ลบ (ปุ่ม Del) · จัดชั้นหน้า/หลัง · Undo/Redo · จำ layout (localStorage)
// รอบ 2 (ถัดไป): ลูกศรเชื่อมกล่อง + paste รูปขึ้น R2 (+ลบใน R2)
// ============================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import {
  PRIORITY_META, isOverdue,
  type CreativeTask, type CreativePriority,
} from "./data";
import { statusMeta, canTransitionTo, type Status } from "./use-statuses";

type Viewport = { x: number; y: number; scale: number };
type Pos = { x: number; y: number };
type Align = "left" | "center" | "right";
type Style = { fontSize: number; bold: boolean; italic: boolean; underline: boolean; color: string; align: Align; fontFamily: string };
type Sticky = { id: string; x: number; y: number; text: string; color: string; fontSize: number };
type BoardObject =
  | ({ id: string; type: "box"; x: number; y: number; w: number; h: number; text: string; fill: string; border: string } & Style)
  | ({ id: string; type: "text"; x: number; y: number; w: number; h: number; text: string; highlight: string } & Style)
  | { id: string; type: "image"; x: number; y: number; w: number; h: number; key: string; url: string };
type ImageObject = Extract<BoardObject, { type: "image" }>;
type StyledObject = Extract<BoardObject, { type: "box" | "text" }>;   // วัตถุที่จัดรูปแบบตัวอักษรได้
type Connector = { id: string; from: string; to: string };   // เชื่อมระหว่าง node (การ์ด/กล่อง/text/โน้ต) แบบเกาะวัตถุ
type Board = { positions: Record<string, Pos>; stickies: Sticky[]; objects: BoardObject[]; connectors: Connector[]; zoneSizes?: Record<string, { w: number; h: number }> };
type Rect = { x: number; y: number; w: number; h: number };
type Tool = "select" | "pan" | "sticky" | "box" | "text" | "connect";
type Interaction =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "card"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { type: "drag"; id: string; sx: number; sy: number; ox: number; oy: number }       // sticky/object move
  | { type: "resize"; id: string; sx: number; sy: number; ow: number; oh: number }
  | { type: "zoneresize"; key: string; sx: number; sy: number; ow: number; oh: number } // ปรับขนาดโซนสถานะ
  | null;

const CARD_W = 280, CARD_H = 150;
const ZONE_W = 340, ZONE_H = 1240, ZONE_GAP = 32, CARD_GAP_Y = 150;
const BOARD_KEY = "erp-creative-canvas:v3";
const STICKY_COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6", "#fed7aa", "#e0e7ff"];
const TEXT_COLORS = ["#1e293b", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#ffffff"];
const FILL_COLORS = ["transparent", "#ffffff", "#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6", "#1e293b"];
const FONT_SIZES = [12, 14, 16, 20, 24, 32, 44];
const FONTS_VALUES: string[] = [
  "",
  "system-ui, -apple-system, 'Segoe UI', sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Courier New', monospace",
];
const DEF_STYLE: Style = { fontSize: 16, bold: false, italic: false, underline: false, color: "#1e293b", align: "left", fontFamily: "" };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clone = (b: Board): Board => JSON.parse(JSON.stringify(b));
// จุดบนขอบสี่เหลี่ยม r ในทิศไปยัง (tx,ty) — ใช้ให้ลูกศรแตะขอบกล่อง ไม่ใช่กลาง
function edgePoint(r: Rect, tx: number, ty: number): Pos {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? (r.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (r.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}
const styleOf = (o: StyledObject): React.CSSProperties => ({
  fontSize: o.fontSize, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal",
  textDecoration: o.underline ? "underline" : "none", color: o.color, textAlign: o.align,
  fontFamily: o.fontFamily || undefined,
});

export function CanvasBoard({
  tasks, statuses, onMove, onCardClick, onAddTask, startMaximized,
}: {
  tasks: CreativeTask[];
  statuses: Status[];
  onMove: (taskId: string, toKey: string, force?: boolean) => void;
  onCardClick: (id: string) => void;
  onAddTask?: () => void;
  startMaximized?: boolean;
}) {
  const t = useT();
  const FONTS = useMemo(() => [
    { label: t("ค่าเริ่มต้น", "Default"), value: FONTS_VALUES[0] },
    { label: t("ไม่มีหัว (Sans)", "Sans-serif"), value: FONTS_VALUES[1] },
    { label: t("มีเชิง (Serif)", "Serif"), value: FONTS_VALUES[2] },
    { label: t("พิมพ์ดีด (Mono)", "Monospace"), value: FONTS_VALUES[3] },
  ], [t]);
  const columns = useMemo(() => statuses.map((s) => s.key), [statuses]);
  const [freeMove, setFreeMove] = useState(false);   // ย้ายอิสระ (ข้ามกฎ workflow)
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Interaction>(null);
  const movedRef = useRef(false);
  const dragStartRef = useRef<Board | null>(null);   // snapshot ก่อนเริ่มลาก (สำหรับ undo)
  const editStartRef = useRef<Board | null>(null);   // snapshot ก่อนเริ่มพิมพ์

  const [vp, setVp] = useState<Viewport>({ x: 40, y: 24, scale: 0.7 });
  const [board, setBoard] = useState<Board>({ positions: {}, stickies: [], objects: [], connectors: [] });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);   // ต้นทางลูกศรที่กำลังเลือก
  const [uploading, setUploading] = useState(false);   // กำลังอัปโหลดรูปที่ paste ขึ้น R2
  const [past, setPast] = useState<Board[]>([]);
  const [future, setFuture] = useState<Board[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [selId, setSelId] = useState<string | null>(null);
  const [isMax, setIsMax] = useState(!!startMaximized);
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(44);
  const [dragging, setDragging] = useState(false);   // ลาก/ย่อขยายอยู่ → ซ่อนแถบจัดรูปแบบ
  const [pop, setPop] = useState<null | "text" | "fill" | "more">(null);   // popover ในแถบจัดรูปแบบ
  useEffect(() => { setPop(null); }, [selId]);

  // ---- load/save ----
  useEffect(() => { try { const r = localStorage.getItem(BOARD_KEY); if (r) { const b = JSON.parse(r); setBoard({ positions: b.positions ?? {}, stickies: b.stickies ?? [], objects: b.objects ?? [], connectors: b.connectors ?? [], zoneSizes: b.zoneSizes ?? {} }); } } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch { /* ignore */ } }, [board]);

  // ---- history ----
  const commit = (next: Board) => { setPast(p => [...p, board]); setFuture([]); setBoard(next); };
  const pushPast = (snap: Board) => { setPast(p => [...p, snap]); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setFuture(f => [board, ...f]); setBoard(prev); setPast(p => p.slice(0, -1)); setSelId(null); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setPast(p => [...p, board]); setBoard(nxt); setFuture(f => f.slice(1)); setSelId(null); };

  // ---- selection helpers ----
  const sel = selId ? (board.objects.find(o => o.id === selId) ?? board.stickies.find(s => s.id === selId) ?? null) : null;
  const selKind: "box" | "text" | "image" | "sticky" | null = sel ? ("type" in sel ? (sel as BoardObject).type : "sticky") : null;

  const patchObject = (id: string, patch: Partial<BoardObject>) =>
    commit({ ...board, objects: board.objects.map(o => o.id === id ? { ...o, ...patch } as BoardObject : o) });
  const patchSticky = (id: string, patch: Partial<Sticky>) =>
    commit({ ...board, stickies: board.stickies.map(s => s.id === id ? { ...s, ...patch } : s) });

  const deleteSelected = () => {
    if (!selId) return;
    const next: Board = { ...board,
      objects: board.objects.filter(o => o.id !== selId),
      stickies: board.stickies.filter(s => s.id !== selId),
      connectors: board.connectors.filter(c => c.from !== selId && c.to !== selId),   // ลบลูกศรที่ต่อกับวัตถุนี้ด้วย
    };
    // ถ้าลบรูป → ลบไฟล์จริงใน R2 ด้วย (เฉพาะเมื่อไม่มีรูปอื่นใช้ key เดียวกัน)
    const img = board.objects.find(o => o.id === selId && o.type === "image") as ImageObject | undefined;
    if (img && !next.objects.some(o => o.type === "image" && o.key === img.key)) {
      apiFetch(`/api/admin/upload?key=${encodeURIComponent(img.key)}`, { method: "DELETE" }).catch(() => { /* best-effort */ });
    }
    commit(next);
    setSelId(null);
  };
  const removeConnector = (id: string) => commit({ ...board, connectors: board.connectors.filter(c => c.id !== id) });

  // ---- connectors (ลูกศรเกาะวัตถุ) ----
  const nodeRect = (id: string): Rect | null => {
    const o = board.objects.find(x => x.id === id);
    if (o) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const s = board.stickies.find(x => x.id === id);
    if (s) return { x: s.x, y: s.y, w: 180, h: 140 };
    const t = tasks.find(x => x.id === id);
    if (t) { const p = posOf(id); return { x: p.x, y: p.y, w: CARD_W, h: CARD_H }; }
    return null;
  };
  const handleConnectClick = (id: string) => {
    if (!connectFrom) { setConnectFrom(id); return; }
    if (connectFrom !== id) commit({ ...board, connectors: [...board.connectors, { id: `cn-${Date.now()}`, from: connectFrom, to: id }] });
    setConnectFrom(null); setTool("select");
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

  // ---- paste image → อัปโหลดขึ้น R2 แล้ววางบนกระดาน ----
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName ?? "")) return;   // กำลังพิมพ์ → ปล่อยให้ paste ปกติ
      const item = Array.from(e.clipboardData?.items ?? []).find(it => it.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile(); if (!file) return;
      e.preventDefault();
      setUploading(true);
      try {
        const ext = (file.type.split("/")[1] || "png").replace("+xml", "");
        const fd = new FormData();
        fd.append("file", file, `paste-${Date.now()}.${ext}`);
        fd.append("folder", "task-canvas");
        const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        const key: string = json.r2_key;
        const url = `/api/r2-image?key=${encodeURIComponent(key)}`;
        const rect = boardRef.current?.getBoundingClientRect();
        const sx = rect ? rect.width / 2 : 300, sy = rect ? rect.height / 2 : 220;
        const wx = (sx - vp.x) / vp.scale, wy = (sy - vp.y) / vp.scale;
        const place = (w: number, h: number) => {
          const id = `img-${Date.now()}`;
          commit({ ...board, objects: [...board.objects, { id, type: "image", x: wx - w / 2, y: wy - h / 2, w, h, key, url }] });
          setSelId(id);
        };
        const img = new window.Image();
        img.onload = () => { const W = 320; place(W, Math.max(60, Math.round(W * (img.naturalHeight / img.naturalWidth || 0.66)))); };
        img.onerror = () => place(320, 220);
        img.src = url;
      } catch (err) {
        alert(t("อัปโหลดรูปไม่สำเร็จ: ", "Image upload failed: ") + ((err as Error).message ?? err));
      } finally { setUploading(false); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [board, vp]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- layout โซน (รองรับขนาดต่อโซนที่ผู้ใช้ปรับเอง) ----
  const zoneLayout = useMemo(() => {
    let x = 0; const out: { key: string; x: number; w: number; h: number }[] = [];
    for (const key of columns) {
      const w = board.zoneSizes?.[key]?.w ?? ZONE_W;
      const h = board.zoneSizes?.[key]?.h ?? ZONE_H;
      out.push({ key, x, w, h }); x += w + ZONE_GAP;
    }
    return out;
  }, [columns, board.zoneSizes]);
  const zoneIndexAt = (wx: number): number => zoneLayout.findIndex((z) => wx >= z.x && wx <= z.x + z.w);

  // ---- auto layout (การ์ดที่ยังไม่เคยลาก) ----
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    zoneLayout.forEach((z) => tasks.filter(t => t.status === z.key).forEach((t, ri) => { map[t.id] = { x: z.x + 30, y: 90 + ri * CARD_GAP_Y }; }));
    return map;
  }, [tasks, zoneLayout]);
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
    if (tool === "connect") { setConnectFrom(null); return; }   // คลิกพื้นหลัง = ยกเลิกการเชื่อมที่ค้าง
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
    e.stopPropagation();
    if (tool === "connect") { handleConnectClick(id); return; }
    setSelId(null);
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    dragStartRef.current = clone(board);
    const p = posOf(id);
    interRef.current = { type: "card", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };
  const startDrag = (e: RPE, id: string) => {
    e.stopPropagation();
    if (tool === "connect") { handleConnectClick(id); return; }
    setSelId(id); setDragging(true);
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
  const startZoneResize = (e: RPE, key: string, w: number, h: number) => {
    e.stopPropagation(); setDragging(true);
    boardRef.current?.setPointerCapture(e.pointerId);
    dragStartRef.current = clone(board);
    interRef.current = { type: "zoneresize", key, sx: e.clientX, sy: e.clientY, ow: w, oh: h };
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
    } else if (it.type === "zoneresize") {
      const nw = Math.max(160, it.ow + dx / vp.scale), nh = Math.max(200, it.oh + dy / vp.scale);
      setBoard(b => ({ ...b, zoneSizes: { ...(b.zoneSizes ?? {}), [it.key]: { w: nw, h: nh } } }));
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
      const zi = zoneIndexAt(centerX);
      const toKey = zi >= 0 ? zoneLayout[zi].key : null;
      const task = tasks.find(t => t.id === it.id);
      if (toKey && task && task.status !== toKey) {
        if (freeMove) onMove(it.id, toKey, true);                       // ย้ายอิสระ (ข้ามกฎ)
        else if (canTransitionTo(task.status, toKey)) onMove(it.id, toKey);
        // เปลี่ยนสถานะนี้ไม่ได้ตาม workflow → เด้งการ์ดกลับโซนเดิม
        else setBoard(b => { const pos = { ...b.positions }; delete pos[it.id]; return { ...b, positions: pos }; });
      }
    } else if ((it.type === "drag" || it.type === "resize" || it.type === "zoneresize") && movedRef.current && dragStartRef.current) {
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
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title={t("เลือก/ลาก", "Select / Drag")}>🖱️</ToolBtn>
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title={t("เลื่อนกระดาน", "Pan canvas")}>✋</ToolBtn>
        <Sep />
        <ToolBtn active={tool === "box"} onClick={() => setTool("box")} title={t("กล่อง", "Box")}>▭</ToolBtn>
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} title={t("ข้อความ", "Text")}>𝐓</ToolBtn>
        <ToolBtn active={tool === "sticky"} onClick={() => setTool("sticky")} title={t("โน้ตกาว", "Sticky note")}>🟨</ToolBtn>
        <ToolBtn active={tool === "connect"} onClick={() => { setTool(tool === "connect" ? "select" : "connect"); setConnectFrom(null); }} title={t("เชื่อมลูกศร (คลิกต้นทาง → ปลายทาง)", "Connect arrow (click source → target)")}>↗</ToolBtn>
        <Sep />
        <ToolBtn onClick={undo} title={t("ย้อนกลับ (Ctrl+Z)", "Undo (Ctrl+Z)")} disabled={!past.length}>↶</ToolBtn>
        <ToolBtn onClick={redo} title={t("ทำซ้ำ (Ctrl+Y)", "Redo (Ctrl+Y)")} disabled={!future.length}>↷</ToolBtn>
        <Sep />
        <ToolBtn onClick={() => zoomBtn(1 / 1.2)} title={t("ซูมออก", "Zoom out")}>➖</ToolBtn>
        <span className="text-xs text-slate-500 tabular-nums w-10 text-center">{Math.round(vp.scale * 100)}%</span>
        <ToolBtn onClick={() => zoomBtn(1.2)} title={t("ซูมเข้า", "Zoom in")}>➕</ToolBtn>
        <Sep />
        <ToolBtn onClick={resetView} title={t("จัดมุมมองกลับ", "Reset view")}>🎯</ToolBtn>
        <ToolBtn onClick={resetLayout} title={t("จัดเรียงการ์ดใหม่", "Reset card layout")}>↺</ToolBtn>
        <ToolBtn onClick={toggleFs} title={isMax ? t("ย่อกลับ (Esc)", "Restore (Esc)") : t("ขยายเต็มหน้าต่าง", "Fullscreen")}>{isMax ? "🗗" : "⛶"}</ToolBtn>
        <Sep />
        <ToolBtn active={freeMove} onClick={() => setFreeMove(f => !f)} title={freeMove ? t("ย้ายอิสระ: เปิด — ลากไปสถานะไหนก็ได้ (ข้าม workflow)", "Free move: ON — drag to any status (bypass workflow)") : t("ย้ายอิสระ: ปิด — ลากตามเส้นทาง workflow", "Free move: OFF — follow workflow transitions")}>{freeMove ? "🔓" : "🔒"}</ToolBtn>
        {onAddTask && <button onClick={onAddTask} title={t("เพิ่มงานใหม่", "Add task")} className="h-8 px-2.5 ml-0.5 flex items-center gap-1 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-700">＋ {t("งาน", "Task")}</button>}
      </div>
      {/* ปุ่มออกจากเต็มจอ (ลอยมุมขวาบน) */}
      {isMax && <button onClick={toggleFs} title={t("ออกจากเต็มจอ (Esc)", "Exit fullscreen (Esc)")} className="absolute top-3 right-3 z-30 h-9 w-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 shadow-md text-slate-500 hover:text-slate-800 hover:bg-slate-50">✕</button>}
      {tool === "connect" ? (
        <div className="absolute top-3 right-3 z-20 text-xs font-medium text-blue-700 bg-blue-50 rounded px-2.5 py-1.5 border border-blue-200">
          ↗ {t("โหมดเชื่อมลูกศร", "Connect mode")}: {connectFrom ? t("คลิกวัตถุปลายทาง", "Click target object") : t("คลิกวัตถุต้นทาง", "Click source object")} · {t("ชี้ที่เส้นแล้วกด ✕ เพื่อลบ", "Hover a line and click ✕ to delete")}
        </div>
      ) : !isMax && (
        <div className="absolute top-3 right-3 z-20 text-[11px] text-slate-400 bg-white/80 rounded px-2 py-1 border border-slate-200">
          {t("ดับเบิลคลิกการ์ด = ดูรายละเอียด · วางรูป (Ctrl+V) ได้ · ↗ เชื่อมลูกศร · Del = ลบ · Ctrl+Z = ย้อน", "Double-click card = view details · Paste image (Ctrl+V) · ↗ Connect arrow · Del = delete · Ctrl+Z = undo")}
        </div>
      )}

      {/* Canvas */}
      <div ref={boardRef} onPointerDown={onBoardPointerDown} onPointerMove={onBoardPointerMove} onPointerUp={onBoardPointerUp}
        className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white ${isMax ? "flex-1 mt-2" : "h-[calc(100vh-260px)] min-h-[520px]"} ${tool === "pan" ? "cursor-grab" : tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
        style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.x}px ${vp.y}px`, touchAction: "none" }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.scale})` }}>
          {/* Zones */}
          {zoneLayout.map((z) => {
            const m = statusMeta(z.key);
            const count = tasks.filter(t => t.status === z.key).length;
            return (
              <div key={z.key} className="absolute rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 group" style={{ left: z.x, top: 0, width: z.w, height: z.h }}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
                  <span className="text-base font-bold text-slate-700">{m.label}</span>
                  <span className="text-xs font-medium text-slate-400 bg-white/70 rounded-full px-2 py-0.5">{count}</span>
                </div>
                {/* ที่จับปรับขนาดโซน (มุมขวาล่าง) */}
                <div onPointerDown={(e) => startZoneResize(e, z.key, z.w, z.h)} title={t("ลากปรับขนาดโซน", "Drag to resize zone")} className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize opacity-0 group-hover:opacity-100" style={{ background: "linear-gradient(135deg, transparent 50%, #cbd5e1 50%)" }} />
              </div>
            );
          })}

          {/* Connectors (ลูกศรเกาะวัตถุ) */}
          <svg className="absolute top-0 left-0 pointer-events-none" width="1" height="1" style={{ overflow: "visible" }}>
            <defs>
              <marker id="ctm-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L7,3 L0,6 Z" fill="#64748b" />
              </marker>
            </defs>
            {board.connectors.map(c => {
              const ra = nodeRect(c.from), rb = nodeRect(c.to);
              if (!ra || !rb) return null;
              const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 }, cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
              const a = edgePoint(ra, cb.x, cb.y), b = edgePoint(rb, ca.x, ca.y);
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              return (
                <g key={c.id} className="group">
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" strokeWidth={2} markerEnd="url(#ctm-arrow)" />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} className="pointer-events-auto cursor-pointer" />
                  <circle cx={mid.x} cy={mid.y} r={9} fill="white" stroke="#e2e8f0" className="opacity-0 group-hover:opacity-100 pointer-events-auto cursor-pointer"
                    onPointerDown={e => { e.stopPropagation(); removeConnector(c.id); }} />
                  <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontSize="11" fill="#ef4444" className="opacity-0 group-hover:opacity-100 pointer-events-none select-none">✕</text>
                </g>
              );
            })}
          </svg>

          {/* Objects (box/text) */}
          {board.objects.map(o => {
            const selected = selId === o.id;
            const common = `absolute group ${connectFrom === o.id ? "ring-2 ring-blue-400" : selected ? "ring-2 ring-violet-400" : ""}`;
            if (o.type === "image") {
              return (
                <div key={o.id} className={`${common} rounded-md overflow-hidden border border-slate-200 shadow-sm bg-white`} style={{ left: o.x, top: o.y, width: o.w, height: o.h }}
                  onPointerDown={e => startDrag(e, o.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none select-none" />
                  {selected && <div onPointerDown={e => startResize(e, o.id)} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)" }} />}
                </div>
              );
            }
            if (o.type === "box") {
              return (
                <div key={o.id} className={`${common} rounded-lg border-2 shadow-sm`} style={{ left: o.x, top: o.y, width: o.w, height: o.h, background: o.fill, borderColor: o.border }}
                  onPointerDown={e => startDrag(e, o.id)} onDoubleClick={() => setSelId(o.id)}>
                  {selected ? (
                    <textarea autoFocus value={o.text} onPointerDown={e => e.stopPropagation()}
                      onFocus={() => { editStartRef.current = clone(board); }}
                      onBlur={() => { if (editStartRef.current) { pushPast(editStartRef.current); editStartRef.current = null; } }}
                      onChange={e => setBoard(b => ({ ...b, objects: b.objects.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) }))}
                      placeholder={t("พิมพ์ข้อความ...", "Type text...")} style={styleOf(o)}
                      className="w-full h-full bg-transparent resize-none p-2 outline-none placeholder:text-slate-400 cursor-text" />
                  ) : (
                    <div className="w-full h-full p-2 whitespace-pre-wrap overflow-hidden cursor-grab active:cursor-grabbing" style={styleOf(o)}>
                      {o.text || <span className="text-slate-300">{t("กล่อง", "Box")}</span>}
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
                    placeholder={t("พิมพ์ข้อความ...", "Type text...")} style={{ ...styleOf(o), background: o.highlight }}
                    className="w-full h-full resize-none p-1 rounded outline-none placeholder:text-slate-400 cursor-text" />
                ) : (
                  <div className="w-full h-full p-1 rounded whitespace-pre-wrap cursor-grab active:cursor-grabbing" style={{ ...styleOf(o), background: o.highlight }}>
                    {o.text || <span className="text-slate-300">{t("ข้อความ", "Text")}</span>}
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
              <div key={s.id} className={`absolute rounded-lg shadow-md ${connectFrom === s.id ? "ring-2 ring-blue-400" : selected ? "ring-2 ring-violet-400" : ""}`} style={{ left: s.x, top: s.y, width: 180, minHeight: 120, background: s.color }}
                onPointerDown={e => startDrag(e, s.id)}>
                <div className="flex justify-between items-center px-2 pt-1 cursor-grab active:cursor-grabbing">
                  <span className="text-[10px] text-slate-500">{t("โน้ต", "Note")}</span>
                </div>
                <textarea value={s.text} onPointerDown={e => e.stopPropagation()}
                  onFocus={() => { setSelId(s.id); editStartRef.current = clone(board); }}
                  onBlur={() => { if (editStartRef.current) { pushPast(editStartRef.current); editStartRef.current = null; } }}
                  onChange={e => setBoard(b => ({ ...b, stickies: b.stickies.map(x => x.id === s.id ? { ...x, text: e.target.value } : x) }))}
                  placeholder={t("พิมพ์โน้ต...", "Type a note...")} style={{ fontSize: s.fontSize }}
                  className="w-full bg-transparent resize-none px-2 pb-2 text-slate-700 outline-none placeholder:text-slate-400 cursor-text" rows={4} />
              </div>
            );
          })}

          {/* Task cards */}
          {tasks.map(t => {
            const p = posOf(t.id);
            return <div key={t.id} className={`absolute rounded-lg ${connectFrom === t.id ? "ring-2 ring-blue-400" : ""}`} style={{ left: p.x, top: p.y, width: CARD_W }} onPointerDown={e => startCardDrag(e, t.id)} onDoubleClick={() => onCardClick(t.id)}><CanvasCard task={t} /></div>;
          })}
        </div>

        {uploading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-slate-900/90 text-white text-sm rounded-lg px-3 py-1.5 shadow-lg">
            <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> {t("กำลังอัปโหลดรูปขึ้น R2...", "Uploading image to R2...")}
          </div>
        )}

        {/* Format bar (minimal) — ซ่อนตอนกำลังลาก */}
        {sel && barPos && !dragging && (() => {
          const o = (selKind === "box" || selKind === "text") ? (sel as StyledObject) : null;
          const fi = o ? FONT_SIZES.indexOf(o.fontSize) : -1;
          const setSize = (d: number) => { if (o) patchObject(o.id, { fontSize: FONT_SIZES[clamp((fi < 0 ? 2 : fi) + d, 0, FONT_SIZES.length - 1)] }); };
          const nextAlign: Record<Align, Align> = { left: "center", center: "right", right: "left" };
          return (
            <div ref={barRef} className="absolute z-30 flex items-stretch bg-white rounded-xl border border-slate-200 shadow-lg h-11" style={{ left: barPos.left, top: barPos.top }} onPointerDown={e => e.stopPropagation()}>
              <div className="flex items-center px-3 text-slate-700 font-semibold text-sm">{selKind === "text" ? "T" : selKind === "box" ? "▭" : selKind === "image" ? "🖼" : "🟨"}</div>

              {o && <>
                <BarSep />
                <div className="relative flex items-center pl-2.5 pr-1 hover:bg-slate-50">
                  <select value={o.fontFamily} onChange={e => patchObject(o.id, { fontFamily: e.target.value })} title={t("ฟอนต์", "Font")}
                    className="appearance-none bg-transparent text-sm text-slate-700 outline-none cursor-pointer pr-4 max-w-[112px]"
                    style={{ fontFamily: o.fontFamily || undefined }}>
                    {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-1.5 text-slate-400"><IconChevron /></span>
                </div>
                <BarSep />
                <div className="flex items-center pl-2.5 pr-1.5 gap-1.5">
                  <span className="text-sm text-slate-700 tabular-nums w-5 text-center">{o.fontSize}</span>
                  <div className="flex flex-col text-slate-400">
                    <button onClick={() => setSize(1)} title={t("ใหญ่ขึ้น", "Increase size")} className="h-3 flex items-center hover:text-slate-700"><IconCaret dir="up" /></button>
                    <button onClick={() => setSize(-1)} title={t("เล็กลง", "Decrease size")} className="h-3 flex items-center hover:text-slate-700"><IconCaret dir="down" /></button>
                  </div>
                </div>
                <BarSep />
                <BarBtn active={o.bold} onClick={() => patchObject(o.id, { bold: !o.bold })} title={t("ตัวหนา", "Bold")}><span className="font-bold text-[15px]">B</span></BarBtn>
                <BarBtn active={o.italic} onClick={() => patchObject(o.id, { italic: !o.italic })} title={t("ตัวเอียง", "Italic")}><span className="italic font-serif text-[15px]">I</span></BarBtn>
                <BarBtn active={o.underline} onClick={() => patchObject(o.id, { underline: !o.underline })} title={t("ขีดเส้นใต้", "Underline")}><span className="underline text-[15px]">U</span></BarBtn>
                <BarSep />
                <BarBtn onClick={() => patchObject(o.id, { align: nextAlign[o.align] })} title={t("จัดชิด (สลับ)", "Alignment (cycle)")}><IconAlign align={o.align} /></BarBtn>
                <BarSep />
                <BarBtn active={pop === "text"} onClick={() => setPop(pop === "text" ? null : "text")} title={t("สีตัวอักษร", "Text color")}>
                  <span className="flex flex-col items-center leading-none gap-0.5"><span className="text-[15px] font-semibold">A</span><span className="block h-1 w-4 rounded-sm" style={{ background: o.color }} /></span>
                </BarBtn>
                <BarBtn active={pop === "fill"} onClick={() => setPop(pop === "fill" ? null : "fill")} title={o.type === "box" ? t("สีพื้น", "Fill color") : t("ไฮไลต์", "Highlight")}>
                  <Swatch c={o.type === "box" ? o.fill : o.highlight} className="h-5 w-5" />
                </BarBtn>
              </>}

              {selKind === "sticky" && <>
                <BarSep />
                <BarBtn active={pop === "fill"} onClick={() => setPop(pop === "fill" ? null : "fill")} title={t("สีโน้ต", "Note color")}>
                  <Swatch c={(sel as Sticky).color} className="h-5 w-5" />
                </BarBtn>
              </>}

              <BarSep />
              <BarBtn active={pop === "more"} onClick={() => setPop(pop === "more" ? null : "more")} title={t("เพิ่มเติม", "More options")}><IconMore /></BarBtn>

              {/* popovers */}
              {pop === "text" && o && <ColorPopover colors={TEXT_COLORS} value={o.color} onPick={c => { patchObject(o.id, { color: c }); setPop(null); }} />}
              {pop === "fill" && (o ? (
                <ColorPopover colors={FILL_COLORS} value={o.type === "box" ? o.fill : o.highlight} onPick={c => { patchObject(o.id, o.type === "box" ? { fill: c } : { highlight: c }); setPop(null); }} />
              ) : selKind === "sticky" ? (
                <ColorPopover colors={STICKY_COLORS} value={(sel as Sticky).color} onPick={c => { patchSticky(sel.id, { color: c }); setPop(null); }} />
              ) : null)}
              {pop === "more" && (
                <div className="absolute top-full right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-40 text-sm">
                  <MenuItem onClick={() => { duplicateSelected(); setPop(null); }}>⧉ {t("คัดลอก", "Duplicate")}</MenuItem>
                  {o && <>
                    <MenuItem onClick={() => { bringFront(); setPop(null); }}>⬆ {t("ขึ้นหน้าสุด", "Bring to front")}</MenuItem>
                    <MenuItem onClick={() => { sendBack(); setPop(null); }}>⬇ {t("ลงหลังสุด", "Send to back")}</MenuItem>
                  </>}
                  <MenuItem danger onClick={() => { deleteSelected(); setPop(null); }}>🗑 {t("ลบ", "Delete")}</MenuItem>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Sep() { return <span className="w-px h-6 bg-slate-200 mx-0.5" />; }
function ToolBtn({ active, onClick, title, disabled, children }: { active?: boolean; onClick: () => void; title: string; disabled?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} disabled={disabled}
    className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30 ${active ? "bg-violet-100 ring-1 ring-violet-300" : "hover:bg-slate-100"}`}>{children}</button>;
}
// ---- Format bar (minimal) helpers ----
function BarSep() { return <span className="w-px self-stretch bg-slate-200" />; }
function BarBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title}
    className={`px-2.5 flex items-center justify-center transition-colors first:rounded-l-xl ${active ? "bg-violet-50 text-violet-700" : "text-slate-700 hover:bg-slate-50"}`}>{children}</button>;
}
function Swatch({ c, className = "" }: { c: string; className?: string }) {
  return <span className={`block rounded border border-slate-300 ${className}`}
    style={c === "transparent" ? { backgroundImage: "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)", backgroundSize: "8px 8px" } : { background: c }} />;
}
function ColorPopover({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="absolute top-full right-2 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5 z-40">
      {colors.map(c => (
        <button key={c} onClick={() => onPick(c)} title={c} className={`h-6 w-6 rounded ${value === c ? "ring-2 ring-violet-400" : "hover:ring-1 hover:ring-slate-300"}`}>
          <Swatch c={c} className="h-full w-full" />
        </button>
      ))}
    </div>
  );
}
function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${danger ? "text-red-600" : "text-slate-700"}`}>{children}</button>;
}
function IconChevron() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>; }
function IconCaret({ dir }: { dir: "up" | "down" }) { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={dir === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>; }
function IconMore() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>; }
function IconAlign({ align }: { align: Align }) {
  const lines = align === "center" ? ["M6 7h12", "M8 12h8", "M6 17h12"] : align === "right" ? ["M6 7h12", "M10 12h8", "M6 17h12"] : ["M6 7h12", "M6 12h8", "M6 17h12"];
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{lines.map((d, i) => <path key={i} d={d} />)}</svg>;
}

function CanvasCard({ task }: { task: CreativeTask }) {
  const pr = PRIORITY_META[task.priority as CreativePriority] ?? PRIORITY_META.normal;
  const m = statusMeta(task.status);
  const overdue = isOverdue(task);
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-300 p-3 cursor-grab active:cursor-grabbing select-none">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${m.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
        </span>
        <span className="font-mono text-[10px] text-slate-400">{task.task_no}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 mb-1.5">{task.title}</p>
      {task.sku_code && <p className="text-[11px] text-slate-400 line-clamp-1 mb-1">📦 {task.sku_code}</p>}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={`px-1.5 py-0.5 rounded-full border ${pr.cls}`}>{pr.label}</span>
        <span className="text-slate-500 line-clamp-1">👤 {task.assignee_label || "—"}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${task.progress_percent}%` }} /></div>
        {task.due_date && <span className={`text-[11px] ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>}
      </div>
    </div>
  );
}
