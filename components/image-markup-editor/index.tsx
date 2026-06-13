"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment } from "@/app/api/attachments/route";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";

type Tool = "select" | "pen" | "arrow" | "text" | "box";
type Point = { x: number; y: number };

type MarkupObject =
  | { id: string; type: "pen"; points: Point[]; color: string; width: number }
  | { id: string; type: "arrow"; start: Point; end: Point; color: string; width: number }
  | { id: string; type: "text"; at: Point; text: string; color: string; fontSize: number }
  | { id: string; type: "box"; start: Point; end: Point; color: string; width: number; fill: string };

type UploadResponse = { data?: Attachment | Attachment[]; public_url?: string; error?: string | null };

type ImageMarkupButtonProps = {
  sourceUrl: string;
  fileName?: string;
  entityType: string;
  entityId: string;
  actor?: string;
  onSaved?: (attachment?: Attachment) => void | Promise<void>;
  triggerClassName?: string;
  compact?: boolean;
};

const DEFAULT_COLOR = "#dc2626";
const MAX_CANVAS_WIDTH = 820;
const MAX_CANVAS_HEIGHT = 540;
// สีด่วน (กดเลือกเลย)
const SWATCHES = ["#dc2626", "#2563eb", "#16a34a", "#000000", "#f59e0b", "#ffffff"];
// ขนาด เล็ก/กลาง/ใหญ่ → เส้น (px) / ตัวอักษร (px)
const SIZES = { s: { width: 3, font: 18 }, m: { width: 6, font: 30 }, l: { width: 11, font: 46 } };
type SizeLevel = keyof typeof SIZES;

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function colorToSoftFill(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return "rgba(220, 38, 38, 0.12)";
  const r = parseInt(value.slice(1, 3), 16), g = parseInt(value.slice(3, 5), 16), b = parseInt(value.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function normalizeBox(start: Point, end: Point) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
}

// ---- วัดความกว้างข้อความ (สำหรับ bbox / hit-test) ----
let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, fontSize: number) {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.55;
  measureCtx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

// ---- bbox ของวัตถุ (พิกัด canvas) ----
function objBBox(obj: MarkupObject) {
  if (obj.type === "pen") {
    const xs = obj.points.map((p) => p.x), ys = obj.points.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (obj.type === "arrow" || obj.type === "box") return normalizeBox(obj.start, obj.end);
  return { x: obj.at.x, y: obj.at.y, w: measureTextWidth(obj.text, obj.fontSize), h: obj.fontSize * 1.2 };
}

function distToSeg(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

// คืน id วัตถุที่อยู่ใต้จุด (บนสุดก่อน) — null = ไม่โดน
function hitTest(objects: MarkupObject[], p: Point): string | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type === "text" || o.type === "box") {
      const b = objBBox(o); const pad = 6;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return o.id;
    } else if (o.type === "arrow") {
      if (distToSeg(p, o.start, o.end) <= Math.max(8, o.width * 2)) return o.id;
    } else {
      for (let k = 1; k < o.points.length; k++) if (distToSeg(p, o.points[k - 1], o.points[k]) <= Math.max(8, o.width * 2)) return o.id;
    }
  }
  return null;
}

function translateObj(obj: MarkupObject, dx: number, dy: number): MarkupObject {
  const mv = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  if (obj.type === "pen") return { ...obj, points: obj.points.map(mv) };
  if (obj.type === "arrow") return { ...obj, start: mv(obj.start), end: mv(obj.end) };
  if (obj.type === "box") return { ...obj, start: mv(obj.start), end: mv(obj.end) };
  return { ...obj, at: mv(obj.at) };
}

function drawMarkupObject(ctx: CanvasRenderingContext2D, obj: MarkupObject, scaleX = 1, scaleY = 1) {
  const widthScale = (scaleX + scaleY) / 2;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (obj.type === "pen") {
    if (obj.points.length < 2) { ctx.restore(); return; }
    ctx.strokeStyle = obj.color; ctx.lineWidth = Math.max(1, obj.width * widthScale);
    ctx.beginPath(); ctx.moveTo(obj.points[0].x * scaleX, obj.points[0].y * scaleY);
    for (const p of obj.points.slice(1)) ctx.lineTo(p.x * scaleX, p.y * scaleY);
    ctx.stroke();
  }
  if (obj.type === "arrow") {
    const start = { x: obj.start.x * scaleX, y: obj.start.y * scaleY }, end = { x: obj.end.x * scaleX, y: obj.end.y * scaleY };
    ctx.strokeStyle = obj.color; ctx.lineWidth = Math.max(1, obj.width * widthScale);
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    drawArrowHead(ctx, start, end, Math.max(12, obj.width * 5) * widthScale);
  }
  if (obj.type === "text") {
    ctx.fillStyle = obj.color; ctx.font = `700 ${Math.max(10, obj.fontSize * widthScale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top"; ctx.fillText(obj.text, obj.at.x * scaleX, obj.at.y * scaleY);
  }
  if (obj.type === "box") {
    const b = normalizeBox({ x: obj.start.x * scaleX, y: obj.start.y * scaleY }, { x: obj.end.x * scaleX, y: obj.end.y * scaleY });
    ctx.lineWidth = Math.max(1, obj.width * widthScale);
    if (obj.fill !== "transparent") { ctx.fillStyle = obj.fill; ctx.fillRect(b.x, b.y, b.w, b.h); }
    ctx.strokeStyle = obj.color; ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.restore();
}

function fitCanvas(naturalWidth: number, naturalHeight: number) {
  const scale = Math.min(MAX_CANVAS_WIDTH / naturalWidth, MAX_CANVAS_HEIGHT / naturalHeight, 1);
  return { width: Math.max(1, Math.round(naturalWidth * scale)), height: Math.max(1, Math.round(naturalHeight * scale)) };
}

export function ImageMarkupButton({ sourceUrl, fileName = "image", entityType, entityId, actor, onSaved, triggerClassName, compact = true }: ImageMarkupButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" title="แก้รูป / วาดกำกับ"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={triggerClassName ?? "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"}>
        <IconEdit />{!compact && <span>แก้รูป</span>}
      </button>
      {open && (
        <ImageMarkupEditorModal sourceUrl={sourceUrl} fileName={fileName} entityType={entityType} entityId={entityId}
          actor={actor} onClose={() => setOpen(false)} onSaved={onSaved} />
      )}
    </>
  );
}

function ImageMarkupEditorModal({ sourceUrl, fileName, entityType, entityId, actor, onClose, onSaved }: {
  sourceUrl: string; fileName: string; entityType: string; entityId: string; actor?: string;
  onClose: () => void; onSaved?: (attachment?: Attachment) => void | Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const draftRef = useRef<MarkupObject | null>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [sizeLevel, setSizeLevel] = useState<SizeLevel>("m");
  const width = SIZES[sizeLevel].width;
  const fontSize = SIZES[sizeLevel].font;
  const [fillBox, setFillBox] = useState(true);
  const [objects, setObjects] = useState<MarkupObject[]>([]);
  const [draft, setDraft] = useState<MarkupObject | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textEdit, setTextEdit] = useState<{ at: Point; value: string } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 420 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // แหล่งความจริงล่าสุด (กัน stale closure ใน handler) + undo/redo (ref + counter รีเรนเดอร์ปุ่ม)
  const objectsRef = useRef<MarkupObject[]>([]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  const undoRef = useRef<MarkupObject[][]>([]);
  const redoRef = useRef<MarkupObject[][]>([]);
  const dragRef = useRef<{ id: string; last: Point; snapshot: MarkupObject[]; moved: boolean } | null>(null);
  const [, bumpHist] = useState(0);
  const refresh = () => bumpHist((n) => n + 1);

  const commit = useCallback((next: MarkupObject[]) => {
    undoRef.current = [...undoRef.current.slice(-49), objectsRef.current];
    redoRef.current = [];
    setObjects(next); refresh();
  }, []);
  const undo = useCallback(() => {
    if (undoRef.current.length === 0) return;
    const prev = undoRef.current[undoRef.current.length - 1];
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, objectsRef.current];
    setObjects(prev); setSelectedId(null); refresh();
  }, []);
  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, objectsRef.current];
    setObjects(next); setSelectedId(null); refresh();
  }, []);
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(objectsRef.current.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, commit]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const obj of objects) drawMarkupObject(ctx, obj);
    if (draft) drawMarkupObject(ctx, draft);
    // กรอบไฮไลต์วัตถุที่เลือก
    if (selectedId) {
      const sel = objects.find((o) => o.id === selectedId);
      if (sel) {
        const b = objBBox(sel); const pad = 6;
        ctx.save(); ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2); ctx.restore();
      }
    }
  }, [draft, objects, selectedId]);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => { if (cancelled) return; imageRef.current = image; setCanvasSize(fitCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height)); setLoading(false); };
    image.onerror = () => { if (cancelled) return; setError("โหลดรูปไม่สำเร็จ ลองเปิดรูปใหม่หรืออัปโหลดรูปอีกครั้ง"); setLoading(false); };
    image.src = sourceUrl;
    return () => { cancelled = true; };
  }, [sourceUrl]);

  useEffect(() => { redraw(); }, [canvasSize, redraw]);

  // คีย์ลัด: Ctrl+Z ย้อนกลับ · Ctrl+Y / Ctrl+Shift+Z ทำซ้ำ · Delete ลบที่เลือก
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textEdit) return;   // กำลังพิมพ์ข้อความ → ไม่ดักคีย์
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); deleteSelected(); }
    };
    window.addEventListener("keydown", onKey, true);   // capture phase — กัน modal กิน event ก่อน
    return () => window.removeEventListener("keydown", onKey, true);
  }, [undo, redo, deleteSelected, selectedId, textEdit]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (loading || saving || textEdit) return;
    const p = pointFromEvent(e);

    // ข้อความ: เปิดช่องพิมพ์ตรงจุดที่คลิก — ห้าม setPointerCapture (จะแย่ง focus ทำช่องพิมพ์ blur ทันที)
    if (tool === "text") { setSelectedId(null); setError(null); setTextEdit({ at: p, value: "" }); return; }

    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "select") {
      const id = hitTest(objects, p);
      setSelectedId(id);
      if (id) dragRef.current = { id, last: p, snapshot: objectsRef.current, moved: false };
      return;
    }
    drawingRef.current = true; setError(null); setSelectedId(null);
    if (tool === "pen") setDraft({ id: newId(), type: "pen", points: [p], color, width });
    if (tool === "arrow") setDraft({ id: newId(), type: "arrow", start: p, end: p, color, width });
    if (tool === "box") setDraft({ id: newId(), type: "box", start: p, end: p, color, width, fill: fillBox ? colorToSoftFill(color) : "transparent" });
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFromEvent(e);
    // ลากย้ายวัตถุที่เลือก
    if (dragRef.current) {
      const d = dragRef.current; const dx = p.x - d.last.x, dy = p.y - d.last.y;
      if (dx || dy) { d.last = p; d.moved = true; setObjects((list) => list.map((o) => o.id === d.id ? translateObj(o, dx, dy) : o)); }
      return;
    }
    if (!drawingRef.current) return;
    setDraft((current) => {
      if (!current) return current;
      if (current.type === "pen") return { ...current, points: [...current.points, p] };
      if (current.type === "arrow") return { ...current, end: p };
      if (current.type === "box") return { ...current, end: p };
      return current;
    });
  };

  const endDraw = () => {
    if (dragRef.current) {
      const d = dragRef.current; dragRef.current = null;
      if (d.moved) { undoRef.current = [...undoRef.current.slice(-49), d.snapshot]; redoRef.current = []; refresh(); }
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const current = draftRef.current;
    if (current) commit([...objectsRef.current, current]);
    setDraft(null);
  };

  const commitText = () => {
    if (!textEdit) return;
    const t = textEdit.value.trim();
    if (t) commit([...objectsRef.current, { id: newId(), type: "text", at: textEdit.at, text: t, color, fontSize }]);
    setTextEdit(null);
  };

  const saveEditedImage = async () => {
    const image = imageRef.current;
    if (!image || objects.length === 0) { setError("ยังไม่มีจุดที่แก้ไขบนรูป"); return; }
    setSaving(true); setError(null);
    try {
      const naturalWidth = image.naturalWidth || image.width, naturalHeight = image.naturalHeight || image.height;
      const output = document.createElement("canvas");
      output.width = naturalWidth; output.height = naturalHeight;
      const ctx = output.getContext("2d"); if (!ctx) throw new Error("เปิด canvas ไม่สำเร็จ");
      ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight);
      const scaleX = naturalWidth / canvasSize.width, scaleY = naturalHeight / canvasSize.height;
      for (const obj of objects) drawMarkupObject(ctx, obj, scaleX, scaleY);
      const blob = await new Promise<Blob>((resolve, reject) => {
        try { output.toBlob((b) => b ? resolve(b) : reject(new Error("สร้างไฟล์รูปไม่สำเร็จ")), "image/png", 0.95); } catch (err) { reject(err); }
      });
      const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
      const fd = new FormData();
      fd.append("file", new File([blob], `${baseName}-marked.png`, { type: "image/png" }));
      fd.append("entity_type", entityType); fd.append("entity_id", entityId);
      if (actor) fd.append("actor", actor);
      const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
      const json = (await res.json()) as UploadResponse;
      if (!res.ok || json.error) throw new Error(json.error || "บันทึกรูปที่แก้แล้วไม่สำเร็จ");
      const saved = Array.isArray(json.data) ? json.data[0] : json.data;
      await onSaved?.(saved); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกรูปที่แก้แล้วไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const hasChanges = objects.length > 0 || draft !== null;
  const canUndo = undoRef.current.length > 0, canRedo = redoRef.current.length > 0;

  const ToolBtn = ({ t, label }: { t: Tool; label: string }) => (
    <button type="button" onClick={() => { setTool(t); setTextEdit(null); if (t !== "select") setSelectedId(null); }}
      className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${tool === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"}`}>
      {label}
    </button>
  );

  return (
    <ERPModal open onClose={onClose} title="แก้รูป / วาดกำกับ"
      description="เลือกเครื่องมือ → คลิก/ลากบนรูป · กด ‘เลือก’ เพื่อลากย้าย/ลบทีละชิ้น · Ctrl+Z ย้อนกลับ · บันทึกเป็นไฟล์แนบใหม่ (รูปต้นฉบับยังอยู่)"
      size="xl" storageKey="image-markup-editor" hasUnsavedChanges={hasChanges && !saving}
      footer={(
        <>
          <button type="button" onClick={() => commit([])} disabled={!hasChanges || saving}
            className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">ล้าง</button>
          <button type="button" onClick={saveEditedImage} disabled={objects.length === 0 || saving || loading}
            className="h-9 px-4 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึกเป็นรูปใหม่"}</button>
        </>
      )}>
      <div className="space-y-4">
        {/* แถวเครื่องมือ */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <ToolBtn t="select" label="🖐 เลือก" />
          <ToolBtn t="pen" label="✏️ วาด" />
          <ToolBtn t="arrow" label="↗ ลูกศร" />
          <ToolBtn t="text" label="ก ข้อความ" />
          <ToolBtn t="box" label="▢ กล่อง" />
          <span className="mx-1 h-6 w-px bg-slate-200" />
          {/* undo / redo */}
          <button type="button" onClick={undo} disabled={!canUndo} title="ย้อนกลับ (Ctrl+Z)" className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40">↶</button>
          <button type="button" onClick={redo} disabled={!canRedo} title="ทำซ้ำ (Ctrl+Y)" className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40">↷</button>
          {selectedId && <button type="button" onClick={deleteSelected} title="ลบชิ้นที่เลือก (Delete)" className="h-9 px-3 text-sm rounded-lg border border-rose-300 bg-white text-rose-600 hover:bg-rose-50">🗑 ลบที่เลือก</button>}
        </div>

        {/* แถวสี + ขนาด */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs font-medium text-slate-600">สี</span>
          <div className="flex items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} title={c}
                className={`h-7 w-7 rounded-full border ${color.toLowerCase() === c ? "ring-2 ring-offset-1 ring-slate-700 border-white" : "border-slate-300"}`}
                style={{ backgroundColor: c }} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="สีเอง" className="h-7 w-8 rounded border border-slate-200 bg-white p-0.5" />
          </div>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <span className="text-xs font-medium text-slate-600">ขนาด</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {(["s", "m", "l"] as SizeLevel[]).map((lv) => (
              <button key={lv} type="button" onClick={() => setSizeLevel(lv)}
                className={`h-9 px-3 text-sm font-medium border-l first:border-l-0 border-slate-200 ${sizeLevel === lv ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>
                {lv === "s" ? "เล็ก" : lv === "m" ? "กลาง" : "ใหญ่"}
              </button>
            ))}
          </div>
          {tool === "box" && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={fillBox} onChange={(e) => setFillBox(e.target.checked)} /> เติมสีอ่อนในกล่อง
            </label>
          )}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
          <div className="flex min-h-[360px] items-center justify-center">
            {loading ? (
              <div className="text-sm text-slate-500">กำลังโหลดรูป...</div>
            ) : (
              <div className="relative inline-block">
                <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height}
                  onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw}
                  className={`rounded-lg bg-white shadow-sm ${tool === "select" ? "cursor-pointer" : tool === "text" ? "cursor-text" : "cursor-crosshair"}`} />
                {/* ช่องพิมพ์ข้อความ inline ตรงจุดที่คลิก */}
                {textEdit && (
                  <input autoFocus value={textEdit.value}
                    onChange={(e) => setTextEdit((s) => s ? { ...s, value: e.target.value } : s)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextEdit(null); }}
                    onBlur={commitText}
                    placeholder="พิมพ์แล้ว Enter"
                    style={{ position: "absolute", left: textEdit.at.x, top: textEdit.at.y, color, fontSize: `${fontSize}px`, fontWeight: 700, lineHeight: 1.1, minWidth: 60 }}
                    className="bg-white/70 outline-none border border-dashed border-blue-400 rounded px-0.5" />
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          💡 ข้อความ: เลือก “ข้อความ” แล้วคลิกตรงที่อยากใส่ → พิมพ์ได้เลย · ย้าย/ลบ: เลือก “🖐 เลือก” แล้วคลิกชิ้นนั้น → ลากย้าย หรือกด Delete
        </p>
      </div>
    </ERPModal>
  );
}
