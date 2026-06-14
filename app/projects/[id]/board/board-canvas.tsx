"use client";

// ============================================================
// Brainstorm Board Canvas (DB-backed)
// pan/zoom · ลาก/ปรับขนาด item · เพิ่ม item หลายชนิด · right panel แก้ไข · เลือก/ตีตก
// item types: section/note/image/url/video_link/google_slides/sku_card/task_card/comment_marker
// ============================================================

import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { SkuPicker, UserPicker } from "@/components/pickers";
import type { SkuPickerValue, UserPickerValue } from "@/components/pickers";
import { listItems, createItem, updateItem, deleteItem, listItemComments, addItemComment, toggleReaction, type BoardItem, type BoardComment } from "../../data";

type VP = { x: number; y: number; scale: number };
type Inter =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "drag"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { type: "resize"; id: string; sx: number; sy: number; ow: number; oh: number }
  | null;
// เครื่องมือแบบ Miro: เลือก / โน้ต / ข้อความ / กล่อง / วงกลม / ลูกศร
type Tool = "select" | "note" | "text" | "box" | "circle" | "arrow";
const PLACE_TOOLS: Tool[] = ["note", "text", "box", "circle"];
// ขนาดเริ่มต้นของแต่ละชนิดตอนกดวาง
const PLACE_SIZE: Record<string, { w: number; h: number }> = {
  note: { w: 200, h: 140 }, text: { w: 220, h: 56 }, box: { w: 220, h: 140 }, circle: { w: 160, h: 160 },
};

const NOTE_COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6", "#fed7aa", "#e0e7ff"];
const SHAPE_COLORS = ["#64748b", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#0f172a"];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
const itemCenter = (it: BoardItem) => ({ x: it.x + it.width / 2, y: it.y + it.height / 2 });
// จุดบนขอบกล่อง it ในทิศไปยัง (tx,ty) — ใช้ให้หัวลูกศรแตะขอบกล่องพอดี
function rectEdge(it: BoardItem, tx: number, ty: number) {
  const c = itemCenter(it); const dx = tx - c.x, dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  const s = 0.5 / Math.max(Math.abs(dx) / it.width, Math.abs(dy) / it.height);
  return { x: c.x + dx * s, y: c.y + dy * s };
}
// สามเหลี่ยมหัวลูกศรที่ปลาย (ex,ey) ตามทิศ (sx,sy)→(ex,ey)
function arrowHead(sx: number, sy: number, ex: number, ey: number, size = 13) {
  const a = Math.atan2(ey - sy, ex - sx);
  const a1 = a + Math.PI - 0.42, a2 = a + Math.PI + 0.42;
  return `${ex},${ey} ${ex + size * Math.cos(a1)},${ey + size * Math.sin(a1)} ${ex + size * Math.cos(a2)},${ey + size * Math.sin(a2)}`;
}

export function BoardCanvas({ boardId, pushToast }: { boardId: string; pushToast: (type: "success" | "error" | "info", m: string) => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Inter>(null);
  const movedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<BoardItem[]>([]);
  const [vp, setVp] = useState<VP>({ x: 40, y: 24, scale: 0.7 });
  const vpRef = useRef(vp); vpRef.current = vp;
  const [selId, setSelId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null); // ปลายทางแรกของลูกศร
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuPick, setSkuPick] = useState<SkuPickerValue | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [hideRejected, setHideRejected] = useState(false);

  const sel = items.find((i) => i.id === selId) ?? null;
  const shown = items.filter((it) => {
    if (it.item_type === "section") return true;
    if (selectedOnly && it.status !== "selected") return false;
    if (hideRejected && it.status === "rejected") return false;
    if (search.trim()) { const q = search.toLowerCase(); const hay = `${it.title ?? ""} ${it.content ?? ""} ${it.url ?? ""} ${(it.tags ?? []).join(" ")} ${it.sku_info?.code ?? ""}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });

  const byId = new Map(items.map((i) => [i.id, i] as const));
  const arrowEnds = (a: BoardItem) => { const d = (a.data ?? {}) as { from_id?: string; to_id?: string }; const f = d.from_id ? byId.get(d.from_id) : undefined; const t = d.to_id ? byId.get(d.to_id) : undefined; return f && t ? { f, t } : null; };
  const arrows = items.filter((a) => a.item_type === "arrow" && arrowEnds(a));

  const load = async () => { try { setItems(await listItems(boardId)); } catch (e) { pushToast("error", (e as Error).message); } };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [boardId]);

  // zoom (wheel)
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setVp((v) => { const ns = clamp(v.scale * f, 0.2, 2); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const worldCenter = () => { const r = boardRef.current?.getBoundingClientRect(); const v = vpRef.current; const sx = r ? r.width / 2 : 300, sy = r ? r.height / 2 : 200; return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale }; };
  const screenToWorld = (cx: number, cy: number) => { const r = boardRef.current!.getBoundingClientRect(); const v = vpRef.current; return { x: (cx - r.left - v.x) / v.scale, y: (cy - r.top - v.y) / v.scale }; };

  // ---- add items ----
  const addAt = async (body: Record<string, unknown>, at?: { x: number; y: number }): Promise<BoardItem | null> => {
    const c = at ?? worldCenter();
    try { const it = await createItem(boardId, { x: Math.round(c.x), y: Math.round(c.y), ...body }); setItems((p) => [...p, it]); setSelId(it.id); return it; }
    catch (e) { pushToast("error", (e as Error).message); return null; }
  };
  const add = (body: Record<string, unknown>) => addAt(body);
  const addNote = (at?: { x: number; y: number }) => addAt({ item_type: "note", content: "", width: 200, height: 140, color: NOTE_COLORS[items.length % NOTE_COLORS.length] }, at);
  const addText = (at?: { x: number; y: number }) => addAt({ item_type: "text", content: "", width: 220, height: 56, color: "#0f172a" }, at);
  const addBox = (at?: { x: number; y: number }) => addAt({ item_type: "box", content: "", width: 220, height: 140, color: "#64748b" }, at);
  const addCircle = (at?: { x: number; y: number }) => addAt({ item_type: "circle", content: "", width: 160, height: 160, color: "#64748b" }, at);
  const addSection = () => add({ item_type: "section", title: "โซนใหม่", width: 340, height: 600, color: "slate" });

  // วาง item ตรงจุดที่กด (กึ่งกลางเคอร์เซอร์) แล้วเข้าโหมดพิมพ์ทันที — เหมือน Miro
  const placeAt = async (t: Tool, screenX: number, screenY: number) => {
    const sz = PLACE_SIZE[t] ?? { w: 200, h: 140 };
    const w = screenToWorld(screenX, screenY);
    const at = { x: w.x - sz.w / 2, y: w.y - sz.h / 2 };
    const fn = t === "note" ? addNote : t === "text" ? addText : t === "box" ? addBox : addCircle;
    const it = await fn(at);
    if (it) setEditingId(it.id);
    setTool("select");
  };
  // สร้างลูกศรเชื่อม 2 item (เก็บปลายทางใน data) — ลูกศรจะวิ่งตาม item อัตโนมัติ
  const createArrow = async (fromId: string, toId: string) => { await addAt({ item_type: "arrow", width: 0, height: 0, color: "#64748b", data: { from_id: fromId, to_id: toId } }, { x: 0, y: 0 }); };
  const onArrowAnchor = (id: string) => {
    if (!connectFrom) { setConnectFrom(id); return; }
    if (connectFrom !== id) createArrow(connectFrom, id);
    setConnectFrom(null); setTool("select");
  };
  const addUrl = (type: "url" | "video_link" | "google_slides") => { const url = window.prompt("วางลิงก์"); if (!url?.trim()) return; const f = type === "google_slides" ? { item_type: "google_slides", google_slides_url: url.trim(), title: "Google Slides" } : { item_type: type, url: url.trim(), title: url.trim() }; add({ ...f, width: 240, height: 120 }); };
  const addImageClick = () => fileRef.current?.click();
  const uploadImage = async (file: File, at?: { x: number; y: number }) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "brainstorm");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await addAt({ item_type: "image", r2_key: j.r2_key, width: 260, height: 200 }, at);
    } catch (err) { pushToast("error", "อัปโหลดรูปไม่สำเร็จ: " + (err as Error).message); }
    finally { setUploading(false); }
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) uploadImage(file); e.target.value = ""; };
  const addSku = async () => { if (!skuPick) return; await add({ item_type: "sku_card", sku_id: skuPick.id, width: 260, height: 180 }); setSkuOpen(false); setSkuPick(null); };

  // ---- Miro-like: paste image (Ctrl+V) + drag-drop + คีย์ลัด ----
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) return;
      const f = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith("image/"));
      const file = f?.getAsFile(); if (!file) return; e.preventDefault(); uploadImage(file);
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "");
      if (e.key === "Escape") { setSelId(null); setEditingId(null); setTool("select"); setConnectFrom(null); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !typing && selId) { e.preventDefault(); const id = selId; deleteItem(id).then(() => { setItems((p) => p.filter((i) => i.id !== id)); setSelId(null); }).catch((err) => pushToast("error", (err as Error).message)); }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("keydown", onKey); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selId]);

  // ---- patch helpers ----
  const patchLocal = (id: string, p: Partial<BoardItem>) => setItems((items) => items.map((i) => i.id === id ? { ...i, ...p } : i));
  const saveItem = async (id: string, patch: Record<string, unknown>) => { try { const it = await updateItem(id, patch); patchLocal(id, it); } catch (e) { pushToast("error", (e as Error).message); } };
  const remove = async (id: string) => { try { await deleteItem(id); setItems((p) => p.filter((i) => i.id !== id)); if (selId === id) setSelId(null); } catch (e) { pushToast("error", (e as Error).message); } };

  // ---- pointer ----
  const startPan = (e: RPE) => { movedRef.current = false; boardRef.current?.setPointerCapture(e.pointerId); interRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y }; };
  const onBoardDown = (e: RPE) => {
    if (e.button === 1) { e.preventDefault(); startPan(e); return; }   // กดล้อกลาง = เลื่อนกระดานเสมอ
    if (e.button !== 0) return;
    if (PLACE_TOOLS.includes(tool)) { placeAt(tool, e.clientX, e.clientY); return; } // กดวาง item ตรงจุด
    setSelId(null); startPan(e);
  };
  const startDrag = (e: RPE, it: BoardItem) => {
    if (e.button === 1) { e.preventDefault(); startPan(e); return; }   // ล้อกลางบน item ก็เลื่อนกระดาน
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === "arrow") { onArrowAnchor(it.id); return; }            // โหมดลูกศร: คลิกเลือกต้นทาง→ปลายทาง
    if (PLACE_TOOLS.includes(tool)) { placeAt(tool, e.clientX, e.clientY); return; }
    setSelId(it.id); movedRef.current = false; boardRef.current?.setPointerCapture(e.pointerId); interRef.current = { type: "drag", id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y };
  };
  const startResize = (e: RPE, it: BoardItem) => { if (e.button === 1) { e.preventDefault(); startPan(e); return; } e.stopPropagation(); boardRef.current?.setPointerCapture(e.pointerId); interRef.current = { type: "resize", id: it.id, sx: e.clientX, sy: e.clientY, ow: it.width, oh: it.height }; };

  const onBoardMove = (e: RPE) => {
    const it = interRef.current; if (!it) return;
    const dx = e.clientX - it.sx, dy = e.clientY - it.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    if (it.type === "pan") setVp((v) => ({ ...v, x: it.ox + dx, y: it.oy + dy }));
    else if (it.type === "drag") patchLocal(it.id, { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale });
    else if (it.type === "resize") patchLocal(it.id, { width: Math.max(120, it.ow + dx / vp.scale), height: Math.max(80, it.oh + dy / vp.scale) });
  };
  const onBoardUp = (e: RPE) => {
    const it = interRef.current; interRef.current = null;
    try { boardRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!it || !movedRef.current) return;
    const cur = items.find((x) => x.id === (it.type === "pan" ? "" : it.id));
    if (it.type === "drag" && cur) saveItem(it.id, { x: Math.round(cur.x), y: Math.round(cur.y) });
    else if (it.type === "resize" && cur) saveItem(it.id, { width: Math.round(cur.width), height: Math.round(cur.height) });
  };

  const toggleTool = (t: Tool) => setTool((cur) => (cur === t ? "select" : t));
  const zoomBtn = (f: number) => setVp((v) => { const r = boardRef.current!.getBoundingClientRect(); const sx = r.width / 2, sy = r.height / 2; const ns = clamp(v.scale * f, 0.2, 2); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[480px] rounded-xl border border-slate-200 bg-white overflow-hidden">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      {/* Left toolbar */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1">
        <TBtn active={tool === "select"} onClick={() => { setTool("select"); setConnectFrom(null); }} title="เลือก / เลื่อน">🖱️</TBtn>
        <TBtn active={tool === "note"} onClick={() => toggleTool("note")} title="โน้ต — กดเครื่องมือ แล้วคลิกบนกระดานเพื่อวาง แล้วพิมพ์ได้เลย">📝</TBtn>
        <TBtn active={tool === "text"} onClick={() => toggleTool("text")} title="ข้อความ — คลิกวางแล้วพิมพ์">🆎</TBtn>
        <TBtn active={tool === "box"} onClick={() => toggleTool("box")} title="กล่องสี่เหลี่ยม">▭</TBtn>
        <TBtn active={tool === "circle"} onClick={() => toggleTool("circle")} title="วงกลม">◯</TBtn>
        <TBtn active={tool === "arrow"} onClick={() => { toggleTool("arrow"); setConnectFrom(null); }} title="ลูกศรเชื่อม — คลิกการ์ดต้นทาง แล้วคลิกการ์ดปลายทาง">↗</TBtn>
        <div className="h-px bg-slate-200 my-0.5" />
        <TBtn onClick={addImageClick} title="รูป (อัปโหลด R2)">🖼</TBtn>
        <TBtn onClick={() => addUrl("video_link")} title="ลิงก์วิดีโอ">🎬</TBtn>
        <TBtn onClick={() => addUrl("url")} title="ลิงก์ URL">🔗</TBtn>
        <TBtn onClick={() => setSkuOpen(true)} title="การ์ดสินค้า SKU">📦</TBtn>
        <TBtn onClick={() => addUrl("google_slides")} title="Google Slides">📊</TBtn>
        <TBtn onClick={addSection} title="โซน Section">🏷️</TBtn>
      </div>
      {/* Zoom */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1">
        <TBtn onClick={() => zoomBtn(1 / 1.2)} title="ซูมออก">➖</TBtn>
        <span className="text-xs text-slate-500 w-10 text-center">{Math.round(vp.scale * 100)}%</span>
        <TBtn onClick={() => zoomBtn(1.2)} title="ซูมเข้า">➕</TBtn>
        <TBtn onClick={() => setVp({ x: 40, y: 24, scale: 0.7 })} title="รีเซ็ตมุมมอง">🎯</TBtn>
      </div>
      {uploading && <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-sm rounded-lg px-3 py-1.5">กำลังอัปโหลดรูป...</div>}
      {!sel && <div className="absolute bottom-3 right-3 z-10 text-[11px] text-slate-400 bg-white/80 rounded px-2 py-1 border border-slate-200">📝/🆎/▭/◯ กดเครื่องมือแล้วคลิกวาง · ↗ ลากเชื่อมการ์ด · ดับเบิลคลิกพิมพ์ · ล้อกลางลากเลื่อนกระดาน · Ctrl+V วางรูป · Del ลบ</div>}
      {/* Filter bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white rounded-lg border border-slate-200 shadow-sm px-2 py-1.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ค้นหา..." className="h-7 w-40 border border-slate-200 rounded-md px-2 text-sm" />
        <button onClick={() => setSelectedOnly((s) => !s)} className={`h-7 px-2 rounded-md text-xs border ${selectedOnly ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>เฉพาะที่เลือก</button>
        <button onClick={() => setHideRejected((s) => !s)} className={`h-7 px-2 rounded-md text-xs border ${hideRejected ? "bg-violet-600 text-white border-violet-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>ซ่อนที่ตีตก</button>
      </div>

      {/* แถบบอกโหมดเครื่องมือ */}
      {tool !== "select" && <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-violet-600 text-white text-xs rounded-full px-3 py-1.5 shadow">
        {tool === "arrow" ? (connectFrom ? "คลิกการ์ด ‘ปลายทาง’ เพื่อสร้างลูกศร" : "คลิกการ์ด ‘ต้นทาง’ ของลูกศร") : "คลิกบนกระดานเพื่อวาง · Esc = ยกเลิก"}
      </div>}

      {/* Canvas */}
      <div ref={boardRef} onPointerDown={onBoardDown} onPointerMove={onBoardMove} onPointerUp={onBoardUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) uploadImage(f, screenToWorld(e.clientX, e.clientY)); }}
        className="absolute inset-0"
        style={{ cursor: tool === "select" ? "default" : "crosshair", backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.x}px ${vp.y}px`, touchAction: "none" }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.scale})` }}>
          {/* ลูกศรเชื่อม (วาดเป็น SVG วิ่งตาม item) */}
          <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} style={{ pointerEvents: "none" }}>
            {arrows.map((a) => {
              const e = arrowEnds(a); if (!e) return null;
              const fc = itemCenter(e.f), tc = itemCenter(e.t);
              const s = rectEdge(e.f, tc.x, tc.y), q = rectEdge(e.t, fc.x, fc.y);
              const col = a.color || "#64748b"; const on = selId === a.id;
              return (
                <g key={a.id} style={{ pointerEvents: "visiblePainted", cursor: "pointer" }} onPointerDown={(ev) => { if (ev.button === 1) return; ev.stopPropagation(); setSelId(a.id); }}>
                  <line x1={s.x} y1={s.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={16} />
                  <line x1={s.x} y1={s.y} x2={q.x} y2={q.y} stroke={col} strokeWidth={on ? 3.5 : 2} />
                  <polygon points={arrowHead(s.x, s.y, q.x, q.y)} fill={col} />
                </g>
              );
            })}
          </svg>
          {shown.filter((it) => it.item_type !== "arrow").map((it) => (
            <ItemView key={it.id} it={it} selected={selId === it.id} editing={editingId === it.id} connecting={connectFrom === it.id} placing={PLACE_TOOLS.includes(tool)}
              onDown={(e) => startDrag(e, it)} onResize={(e) => startResize(e, it)}
              onStartEdit={() => { if (tool === "select") setEditingId(it.id); }}
              onEditChange={(v) => patchLocal(it.id, { content: v })}
              onEditCommit={(v) => { setEditingId(null); saveItem(it.id, { content: v }); }}
              onOpenTask={() => it.task_id && window.open(`/tasks`, "_blank")} />
          ))}
          {shown.filter((it) => it.item_type !== "section" && ((it.comment_count ?? 0) > 0 || (it.reactions?.vote ?? 0) > 0 || it.my_reactions?.includes("pin"))).map((it) => (
            <div key={`b-${it.id}`} className="absolute z-[1] flex gap-1 pointer-events-none" style={{ left: it.x + 6, top: it.y + it.height - 20 }}>
              {(it.comment_count ?? 0) > 0 && <span className="text-[10px] bg-white/90 border border-slate-200 rounded px-1">💬{it.comment_count}</span>}
              {(it.reactions?.vote ?? 0) > 0 && <span className="text-[10px] bg-white/90 border border-slate-200 rounded px-1">🗳{it.reactions?.vote}</span>}
              {it.my_reactions?.includes("pin") && <span className="text-[10px] bg-white/90 border border-slate-200 rounded px-1">📌</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      {sel && <RightPanel key={sel.id} it={sel} onChange={(p) => patchLocal(sel.id, p)} onSave={(patch) => saveItem(sel.id, patch)} onDelete={() => remove(sel.id)} onClose={() => setSelId(null)} pushToast={pushToast} />}

      {/* SKU modal */}
      <ERPModal open={skuOpen} onClose={() => setSkuOpen(false)} title="เพิ่มการ์ดสินค้า (SKU)" size="md"
        footer={<>
          <button onClick={() => setSkuOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={addSku} disabled={!skuPick} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">เพิ่ม</button>
        </>}>
        <SkuPicker value={skuPick} onChange={setSkuPick} />
      </ERPModal>
    </div>
  );
}

function TBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={`h-9 w-9 flex items-center justify-center rounded-md text-base ${active ? "bg-violet-600 text-white" : "hover:bg-slate-100"}`}>{children}</button>;
}

// ---- item rendering ----
function ItemView({ it, selected, editing, connecting, placing, onDown, onResize, onStartEdit, onEditChange, onEditCommit, onOpenTask }: {
  it: BoardItem; selected: boolean; editing: boolean; connecting: boolean; placing: boolean;
  onDown: (e: RPE) => void; onResize: (e: RPE) => void; onStartEdit: () => void; onEditChange: (v: string) => void; onEditCommit: (v: string) => void; onOpenTask: () => void;
}) {
  const ring = connecting ? "ring-2 ring-amber-400" : selected ? "ring-2 ring-violet-400" : it.status === "selected" ? "ring-2 ring-emerald-400" : it.status === "rejected" ? "ring-2 ring-red-300 opacity-60" : "";
  const base: React.CSSProperties = { left: it.x, top: it.y, width: it.width, height: it.height, pointerEvents: placing ? "none" : undefined };
  const handle = selected && <div onPointerDown={onResize} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)" }} />;
  // ช่องพิมพ์ข้อความในตัว item (โน้ต/ข้อความ/กล่อง/วงกลม) — แบบ Miro
  const editor = (color: string, align: "left" | "center") => (
    <textarea autoFocus defaultValue={it.content ?? ""} onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => onEditChange(e.target.value)} onBlur={(e) => onEditCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
      className={`absolute inset-0 w-full h-full bg-transparent border-0 outline-none resize-none p-2 text-sm ${align === "center" ? "text-center" : ""}`}
      style={{ color }} />
  );

  // ข้อความล้วน (text) — พื้นหลังโปร่ง
  if (it.item_type === "text") {
    return <div onPointerDown={onDown} onDoubleClick={onStartEdit} className={`absolute rounded ${editing ? "ring-1 ring-violet-300" : ""} ${ring}`} style={base}>
      {editing ? editor(it.color || "#0f172a", "left")
        : <div className="w-full h-full p-2 text-sm whitespace-pre-wrap cursor-grab overflow-hidden" style={{ color: it.color || "#0f172a" }}>{it.content || <span className="text-slate-300">พิมพ์ข้อความ (ดับเบิลคลิก)</span>}</div>}
      {handle}
    </div>;
  }
  // กล่องสี่เหลี่ยม / วงกลม
  if (it.item_type === "box" || it.item_type === "circle") {
    const col = it.color || "#64748b"; const round = it.item_type === "circle" ? "rounded-full" : "rounded-lg";
    return <div onPointerDown={onDown} onDoubleClick={onStartEdit} className={`absolute ${round} bg-white cursor-grab flex items-center justify-center ${ring}`} style={{ ...base, border: `2px solid ${col}` }}>
      {editing ? editor("#334155", "center")
        : <span className="px-2 text-sm text-slate-700 text-center whitespace-pre-wrap overflow-hidden">{it.content || ""}</span>}
      {handle}
    </div>;
  }

  if (it.item_type === "section") {
    return <div onPointerDown={onDown} className={`absolute rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 ${ring}`} style={base}>
      <div className="px-3 py-2 text-sm font-bold text-slate-600 cursor-grab">{it.title || "โซน"}</div>{handle}
    </div>;
  }
  if (it.item_type === "image") {
    return <div onPointerDown={onDown} className={`absolute rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm cursor-grab ${ring}`} style={base}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {it.r2_key ? <img src={r2url(it.r2_key)} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <div className="p-2 text-xs text-slate-400">รูป</div>}{handle}
    </div>;
  }
  if (it.item_type === "sku_card") {
    const s = it.sku_info;
    return <div onPointerDown={onDown} className={`absolute rounded-lg border border-slate-200 bg-white shadow-sm p-3 cursor-grab ${ring}`} style={base}>
      <div className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 inline-block mb-1">{s?.code || "SKU"}</div>
      <p className="text-sm text-slate-700 line-clamp-2">{s?.name}</p>
      <div className="flex gap-2 text-xs text-slate-400 mt-1">{s?.color && <span>{s.color}</span>}{s?.price != null && <span>{Number(s.price).toLocaleString()}฿</span>}</div>{handle}
    </div>;
  }
  if (it.item_type === "task_card") {
    return <div onPointerDown={onDown} onDoubleClick={onOpenTask} className={`absolute rounded-lg border border-violet-200 bg-violet-50 shadow-sm p-3 cursor-grab ${ring}`} style={base}>
      <div className="text-[11px] text-violet-700">✅ งาน</div><p className="text-sm text-slate-700 line-clamp-3">{it.title}</p>{handle}
    </div>;
  }
  if (it.item_type === "google_slides") {
    return <div onPointerDown={onDown} className={`absolute rounded-lg border border-slate-200 bg-white shadow-sm p-3 cursor-grab ${ring}`} style={base}>
      <div className="text-sm">📊 {it.title || "Slides"}</div>{it.google_slides_url && <a href={it.google_slides_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-700 hover:underline" onPointerDown={(e) => e.stopPropagation()}>เปิด</a>}{handle}
    </div>;
  }
  if (it.item_type === "url" || it.item_type === "video_link") {
    return <div onPointerDown={onDown} className={`absolute rounded-lg border border-slate-200 bg-white shadow-sm p-3 cursor-grab ${ring}`} style={base}>
      <div className="text-sm">{it.item_type === "video_link" ? "🎬" : "🔗"} {it.title || it.url}</div>
      {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-700 hover:underline line-clamp-1" onPointerDown={(e) => e.stopPropagation()}>{it.url}</a>}{handle}
    </div>;
  }
  // note (default)
  return <div onPointerDown={onDown} onDoubleClick={onStartEdit} className={`absolute rounded-lg shadow-sm ${editing ? "" : "p-2 cursor-grab"} whitespace-pre-wrap text-sm text-slate-700 overflow-hidden ${ring}`} style={{ ...base, background: it.color || "#fef9c3" }}>
    {editing ? editor("#334155", "left")
      : (it.content || <span className="text-slate-400">ดับเบิลคลิกเพื่อพิมพ์</span>)}
    {handle}
  </div>;
}

// ---- right detail panel ----
function RightPanel({ it, onChange, onSave, onDelete, onClose, pushToast }: { it: BoardItem; onChange: (p: Partial<BoardItem>) => void; onSave: (patch: Record<string, unknown>) => void; onDelete: () => void; onClose: () => void; pushToast: (type: "success" | "error" | "info", m: string) => void }) {
  const isNote = it.item_type === "note";
  const isSection = it.item_type === "section";
  const isLink = it.item_type === "url" || it.item_type === "video_link";
  const isText = it.item_type === "text";
  const isShape = it.item_type === "box" || it.item_type === "circle";
  const isArrow = it.item_type === "arrow";

  const [comments, setComments] = useState<BoardComment[]>([]);
  const [ctext, setCtext] = useState("");
  const [mentions, setMentions] = useState<{ id: string; label: string }[]>([]);
  const [mpick, setMpick] = useState<UserPickerValue | null>(null);
  useEffect(() => { listItemComments(it.id).then(setComments).catch(() => { /* ignore */ }); }, [it.id]);

  const toggle = async (type: "vote" | "pin" | "like") => {
    try {
      const active = await toggleReaction(it.id, type);
      const r = { vote: 0, pin: 0, like: 0, ...(it.reactions ?? {}) };
      r[type] = Math.max(0, r[type] + (active ? 1 : -1));
      const my = new Set(it.my_reactions ?? []); if (active) my.add(type); else my.delete(type);
      onChange({ reactions: r, my_reactions: [...my] });
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  const send = async () => {
    if (!ctext.trim()) return;
    try { const c = await addItemComment(it.id, ctext.trim(), mentions.map((m) => m.id)); setComments((cs) => [...cs, c]); setCtext(""); setMentions([]); onChange({ comment_count: (it.comment_count ?? 0) + 1 }); }
    catch (e) { pushToast("error", (e as Error).message); }
  };
  const my = it.my_reactions ?? [];
  const rc = it.reactions ?? { vote: 0, pin: 0, like: 0 };

  return (
    <div className="absolute top-3 right-3 bottom-3 w-72 z-20 bg-white rounded-xl border border-slate-200 shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-700">{TYPE_LABEL[it.item_type] ?? it.item_type}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(isSection || isLink || it.item_type === "google_slides" || it.item_type === "task_card") && (
          <div><label className="text-xs text-slate-400">หัวข้อ</label>
            <input value={it.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} onBlur={(e) => onSave({ title: e.target.value })} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
        )}
        {isNote && (
          <div><label className="text-xs text-slate-400">ข้อความ</label>
            <textarea value={it.content ?? ""} rows={5} onChange={(e) => onChange({ content: e.target.value })} onBlur={(e) => onSave({ content: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm" />
            <div className="flex gap-1 mt-2">{NOTE_COLORS.map((c) => <button key={c} onClick={() => onSave({ color: c })} className={`h-6 w-6 rounded ${it.color === c ? "ring-2 ring-violet-400" : ""}`} style={{ background: c }} />)}</div>
          </div>
        )}
        {(isText || isShape) && (
          <div><label className="text-xs text-slate-400">ข้อความ</label>
            <textarea value={it.content ?? ""} rows={3} onChange={(e) => onChange({ content: e.target.value })} onBlur={(e) => onSave({ content: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm" />
            <div className="flex flex-wrap gap-1 mt-2">{SHAPE_COLORS.map((c) => <button key={c} onClick={() => onSave({ color: c })} className={`h-6 w-6 rounded ${it.color === c ? "ring-2 ring-violet-400" : ""}`} style={{ background: c }} />)}</div>
          </div>
        )}
        {isArrow && (
          <div><label className="text-xs text-slate-400">สีลูกศร</label>
            <div className="flex flex-wrap gap-1 mt-1">{SHAPE_COLORS.map((c) => <button key={c} onClick={() => onSave({ color: c })} className={`h-6 w-6 rounded ${it.color === c ? "ring-2 ring-violet-400" : ""}`} style={{ background: c }} />)}</div>
            <p className="text-[11px] text-slate-400 mt-2">ลูกศรจะวิ่งตามการ์ดต้นทาง/ปลายทางอัตโนมัติ ลบการ์ดปลายทางลูกศรจะหายไปเอง</p>
          </div>
        )}
        {isLink && (
          <div><label className="text-xs text-slate-400">ลิงก์</label>
            <input value={it.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} onBlur={(e) => onSave({ url: e.target.value })} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
        )}
        {!isArrow && <>
        <div><label className="text-xs text-slate-400">แท็ก (คั่นด้วย ,)</label>
          <input defaultValue={(it.tags ?? []).join(", ")} onBlur={(e) => onSave({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
        <div>
          <label className="text-xs text-slate-400">ทิศทาง</label>
          <div className="flex gap-1.5 mt-1">
            <button onClick={() => onSave({ status: it.status === "selected" ? "none" : "selected" })} className={`flex-1 h-8 text-xs rounded-lg border ${it.status === "selected" ? "bg-emerald-600 text-white border-emerald-600" : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}>✓ เลือก</button>
            <button onClick={() => onSave({ status: it.status === "rejected" ? "none" : "rejected" })} className={`flex-1 h-8 text-xs rounded-lg border ${it.status === "rejected" ? "bg-red-600 text-white border-red-600" : "text-red-600 border-red-200 hover:bg-red-50"}`}>✗ ตีตก</button>
          </div>
        </div>
        </>}

        {/* reactions */}
        <div className="flex gap-1.5 border-t border-slate-100 pt-3">
          <button onClick={() => toggle("vote")} className={`flex-1 h-8 text-xs rounded-lg border ${my.includes("vote") ? "bg-violet-600 text-white border-violet-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>🗳 โหวต {rc.vote || ""}</button>
          <button onClick={() => toggle("pin")} className={`h-8 px-2 text-xs rounded-lg border ${my.includes("pin") ? "bg-violet-600 text-white border-violet-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>📌 {rc.pin || ""}</button>
          <button onClick={() => toggle("like")} className={`h-8 px-2 text-xs rounded-lg border ${my.includes("like") ? "bg-violet-600 text-white border-violet-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>👍 {rc.like || ""}</button>
        </div>

        {/* comments */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-400 mb-2">คอมเมนต์ ({comments.length})</p>
          <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="bg-slate-50 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2"><span className="text-[11px] font-medium text-slate-600">{c.author_name || "ผู้ใช้"}</span><span className="text-[10px] text-slate-400">{c.created_at.slice(0, 16).replace("T", " ")}</span></div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-xs text-slate-400 italic">ยังไม่มีคอมเมนต์</p>}
          </div>
          {mentions.length > 0 && <div className="flex flex-wrap gap-1 mb-1.5">{mentions.map((m) => <span key={m.id} className="inline-flex items-center gap-1 text-[11px] bg-violet-50 text-violet-700 rounded-full pl-2 pr-1 py-0.5">@{m.label}<button onClick={() => setMentions((xs) => xs.filter((x) => x.id !== m.id))} className="hover:text-red-500">✕</button></span>)}</div>}
          <div className="mb-1.5"><UserPicker value={mpick} onChange={(v) => { if (v && !mentions.some((m) => m.id === v.id)) setMentions((xs) => [...xs, { id: v.id, label: v.name }]); setMpick(null); }} disableCreate /></div>
          <div className="flex gap-1.5">
            <input value={ctext} onChange={(e) => setCtext(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="เขียนคอมเมนต์... (เลือกคนแท็กด้านบน)" className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
            <button onClick={send} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700">ส่ง</button>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-slate-100"><button onClick={onDelete} className="w-full h-9 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">ลบ item นี้</button></div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { section: "โซน Section", note: "โน้ต", text: "ข้อความ", box: "กล่อง", circle: "วงกลม", arrow: "ลูกศร", image: "รูป", url: "ลิงก์ URL", video_link: "ลิงก์วิดีโอ", google_slides: "Google Slides", sku_card: "การ์ดสินค้า", task_card: "การ์ดงาน", comment_marker: "คอมเมนต์" };
