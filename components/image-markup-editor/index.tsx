"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment } from "@/app/api/attachments/route";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";

type Tool = "pen" | "arrow" | "text" | "box";
type Point = { x: number; y: number };

type MarkupObject =
  | { id: string; type: "pen"; points: Point[]; color: string; width: number }
  | { id: string; type: "arrow"; start: Point; end: Point; color: string; width: number }
  | { id: string; type: "text"; at: Point; text: string; color: string; fontSize: number }
  | { id: string; type: "box"; start: Point; end: Point; color: string; width: number; fill: string };

type UploadResponse = {
  data?: Attachment | Attachment[];
  public_url?: string;
  error?: string | null;
};

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

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function colorToSoftFill(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return "rgba(220, 38, 38, 0.12)";
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function drawMarkupObject(
  ctx: CanvasRenderingContext2D,
  obj: MarkupObject,
  scaleX = 1,
  scaleY = 1,
) {
  const widthScale = (scaleX + scaleY) / 2;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (obj.type === "pen") {
    if (obj.points.length < 2) {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = Math.max(1, obj.width * widthScale);
    ctx.beginPath();
    ctx.moveTo(obj.points[0].x * scaleX, obj.points[0].y * scaleY);
    for (const p of obj.points.slice(1)) ctx.lineTo(p.x * scaleX, p.y * scaleY);
    ctx.stroke();
  }

  if (obj.type === "arrow") {
    const start = { x: obj.start.x * scaleX, y: obj.start.y * scaleY };
    const end = { x: obj.end.x * scaleX, y: obj.end.y * scaleY };
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = Math.max(1, obj.width * widthScale);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    drawArrowHead(ctx, start, end, Math.max(12, obj.width * 5) * widthScale);
  }

  if (obj.type === "text") {
    ctx.fillStyle = obj.color;
    ctx.font = `700 ${Math.max(10, obj.fontSize * widthScale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(obj.text, obj.at.x * scaleX, obj.at.y * scaleY);
  }

  if (obj.type === "box") {
    const b = normalizeBox(
      { x: obj.start.x * scaleX, y: obj.start.y * scaleY },
      { x: obj.end.x * scaleX, y: obj.end.y * scaleY },
    );
    ctx.lineWidth = Math.max(1, obj.width * widthScale);
    if (obj.fill !== "transparent") {
      ctx.fillStyle = obj.fill;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.strokeStyle = obj.color;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }

  ctx.restore();
}

function fitCanvas(naturalWidth: number, naturalHeight: number) {
  const scale = Math.min(MAX_CANVAS_WIDTH / naturalWidth, MAX_CANVAS_HEIGHT / naturalHeight, 1);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

export function ImageMarkupButton({
  sourceUrl,
  fileName = "image",
  entityType,
  entityId,
  actor,
  onSaved,
  triggerClassName,
  compact = true,
}: ImageMarkupButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title="แก้รูป / วาดกำกับ"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={triggerClassName ?? "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"}
      >
        <IconEdit />
        {!compact && <span>แก้รูป</span>}
      </button>

      {open && (
        <ImageMarkupEditorModal
          sourceUrl={sourceUrl}
          fileName={fileName}
          entityType={entityType}
          entityId={entityId}
          actor={actor}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function ImageMarkupEditorModal({
  sourceUrl,
  fileName,
  entityType,
  entityId,
  actor,
  onClose,
  onSaved,
}: {
  sourceUrl: string;
  fileName: string;
  entityType: string;
  entityId: string;
  actor?: string;
  onClose: () => void;
  onSaved?: (attachment?: Attachment) => void | Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const draftRef = useRef<MarkupObject | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [width, setWidth] = useState(5);
  const [fontSize, setFontSize] = useState(28);
  const [text, setText] = useState("แก้ตรงนี้");
  const [fillBox, setFillBox] = useState(true);
  const [objects, setObjects] = useState<MarkupObject[]>([]);
  const [draft, setDraft] = useState<MarkupObject | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 420 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const obj of objects) drawMarkupObject(ctx, obj);
    if (draft) drawMarkupObject(ctx, draft);
  }, [draft, objects]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setCanvasSize(fitCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height));
      setLoading(false);
    };
    image.onerror = () => {
      if (cancelled) return;
      setError("โหลดรูปไม่สำเร็จ ลองเปิดรูปใหม่หรืออัปโหลดรูปอีกครั้ง");
      setLoading(false);
    };
    image.src = sourceUrl;

    return () => { cancelled = true; };
  }, [sourceUrl]);

  useEffect(() => { redraw(); }, [canvasSize, redraw]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (loading || saving) return;
    const p = pointFromEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "text") {
      const cleanText = text.trim();
      if (!cleanText) {
        setError("พิมพ์ข้อความก่อน แล้วค่อยคลิกวางบนรูป");
        return;
      }
      setError(null);
      setObjects((list) => [...list, { id: newId(), type: "text", at: p, text: cleanText, color, fontSize }]);
      return;
    }

    drawingRef.current = true;
    setError(null);
    if (tool === "pen") setDraft({ id: newId(), type: "pen", points: [p], color, width });
    if (tool === "arrow") setDraft({ id: newId(), type: "arrow", start: p, end: p, color, width });
    if (tool === "box") setDraft({ id: newId(), type: "box", start: p, end: p, color, width, fill: fillBox ? colorToSoftFill(color) : "transparent" });
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const p = pointFromEvent(e);
    setDraft((current) => {
      if (!current) return current;
      if (current.type === "pen") return { ...current, points: [...current.points, p] };
      if (current.type === "arrow") return { ...current, end: p };
      if (current.type === "box") return { ...current, end: p };
      return current;
    });
  };

  const endDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const current = draftRef.current;
    if (current) setObjects((list) => [...list, current]);
    setDraft(null);
  };

  const saveEditedImage = async () => {
    const image = imageRef.current;
    if (!image || objects.length === 0) {
      setError("ยังไม่มีจุดที่แก้ไขบนรูป");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const output = document.createElement("canvas");
      output.width = naturalWidth;
      output.height = naturalHeight;
      const ctx = output.getContext("2d");
      if (!ctx) throw new Error("เปิด canvas ไม่สำเร็จ");
      ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight);

      const scaleX = naturalWidth / canvasSize.width;
      const scaleY = naturalHeight / canvasSize.height;
      for (const obj of objects) drawMarkupObject(ctx, obj, scaleX, scaleY);

      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          output.toBlob((b) => b ? resolve(b) : reject(new Error("สร้างไฟล์รูปไม่สำเร็จ")), "image/png", 0.95);
        } catch (err) {
          reject(err);
        }
      });

      const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
      const fd = new FormData();
      fd.append("file", new File([blob], `${baseName}-marked.png`, { type: "image/png" }));
      fd.append("entity_type", entityType);
      fd.append("entity_id", entityId);
      if (actor) fd.append("actor", actor);

      const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
      const json = (await res.json()) as UploadResponse;
      if (!res.ok || json.error) throw new Error(json.error || "บันทึกรูปที่แก้แล้วไม่สำเร็จ");

      const saved = Array.isArray(json.data) ? json.data[0] : json.data;
      await onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกรูปที่แก้แล้วไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = objects.length > 0 || draft !== null;

  return (
    <ERPModal
      open
      onClose={onClose}
      title="แก้รูป / วาดกำกับ"
      description="วาดเส้น ลูกศร ข้อความ หรือกล่องทับบนรูป แล้วบันทึกเป็นไฟล์แนบใหม่ รูปต้นฉบับยังอยู่เหมือนเดิม"
      size="xl"
      storageKey="image-markup-editor"
      hasUnsavedChanges={hasChanges && !saving}
      footer={(
        <>
          <button
            type="button"
            onClick={() => setObjects([])}
            disabled={!hasChanges || saving}
            className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            ล้าง
          </button>
          <button
            type="button"
            onClick={() => setObjects((list) => list.slice(0, -1))}
            disabled={objects.length === 0 || saving}
            className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={saveEditedImage}
            disabled={objects.length === 0 || saving || loading}
            className="h-9 px-4 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกเป็นรูปใหม่"}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {(["pen", "arrow", "text", "box"] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                tool === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {t === "pen" ? "วาด" : t === "arrow" ? "ลูกศร" : t === "text" ? "ข้อความ" : "กล่อง"}
            </button>
          ))}

          <label className="ml-1 flex items-center gap-2 text-xs font-medium text-slate-600">
            สี
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 rounded border border-slate-200 bg-white p-1" />
          </label>

          {tool !== "text" ? (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              ขนาด
              <input type="range" min={2} max={16} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              <span className="w-6 text-right">{width}</span>
            </label>
          ) : (
            <>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="ข้อความที่จะวางบนรูป"
                className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                ขนาดตัวอักษร
                <input type="range" min={14} max={64} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                <span className="w-7 text-right">{fontSize}</span>
              </label>
            </>
          )}

          {tool === "box" && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={fillBox} onChange={(e) => setFillBox(e.target.checked)} />
              เติมสีอ่อนในกล่อง
            </label>
          )}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
          <div className="flex min-h-[360px] items-center justify-center">
            {loading ? (
              <div className="text-sm text-slate-500">กำลังโหลดรูป...</div>
            ) : (
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerCancel={endDraw}
                className={`rounded-lg bg-white shadow-sm ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
              />
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          วิธีใช้: เลือกเครื่องมือด้านบน แล้วลากหรือคลิกบนรูป ถ้าบันทึกแล้ว ระบบจะเพิ่มเป็นรูปแนบใหม่ในรายการเดิม
        </p>
      </div>
    </ERPModal>
  );
}
