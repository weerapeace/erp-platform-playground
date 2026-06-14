"use client";

// ============================================================
// Brainstorm Board Canvas (DB-backed)
// pan/zoom · ลาก/ปรับขนาด item · เพิ่ม item หลายชนิด · right panel แก้ไข · เลือก/ตีตก
// item types: section/note/image/url/video_link/google_slides/sku_card/task_card/comment_marker
// ============================================================

import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { ProductPicker, UserPicker } from "@/components/pickers";
import type { ProductPickerValue, UserPickerValue } from "@/components/pickers";
import { listItems, createItem, updateItem, deleteItem, listItemComments, addItemComment, toggleReaction, type BoardItem, type BoardComment } from "../../data";

type VP = { x: number; y: number; scale: number };
type Inter =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "drag"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { type: "resize"; id: string; sx: number; sy: number; ow: number; oh: number }
  | null;

const NOTE_COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffe4e6", "#fed7aa", "#e0e7ff"];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

export function BoardCanvas({ boardId, pushToast }: { boardId: string; pushToast: (type: "success" | "error" | "info", m: string) => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Inter>(null);
  const movedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<BoardItem[]>([]);
  const [vp, setVp] = useState<VP>({ x: 40, y: 24, scale: 0.7 });
  const [selId, setSelId] = useState<string | null>(null);
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuPick, setSkuPick] = useState<ProductPickerValue | null>(null);
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

  const worldCenter = () => { const r = boardRef.current?.getBoundingClientRect(); const sx = r ? r.width / 2 : 300, sy = r ? r.height / 2 : 200; return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale }; };

  // ---- add items ----
  const add = async (body: Record<string, unknown>) => {
    const c = worldCenter();
    try { const it = await createItem(boardId, { x: Math.round(c.x), y: Math.round(c.y), ...body }); setItems((p) => [...p, it]); setSelId(it.id); }
    catch (e) { pushToast("error", (e as Error).message); }
  };
  const addNote = () => add({ item_type: "note", content: "", width: 200, height: 140, color: NOTE_COLORS[items.length % NOTE_COLORS.length] });
  const addSection = () => add({ item_type: "section", title: "โซนใหม่", width: 340, height: 600, color: "slate" });
  const addUrl = (type: "url" | "video_link" | "google_slides") => { const url = window.prompt("วางลิงก์"); if (!url?.trim()) return; const f = type === "google_slides" ? { item_type: "google_slides", google_slides_url: url.trim(), title: "Google Slides" } : { item_type: type, url: url.trim(), title: url.trim() }; add({ ...f, width: 240, height: 120 }); };
  const addImageClick = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "brainstorm");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await add({ item_type: "image", r2_key: j.r2_key, width: 260, height: 200 });
    } catch (err) { pushToast("error", "อัปโหลดรูปไม่สำเร็จ: " + (err as Error).message); }
    finally { setUploading(false); }
  };
  const addSku = async () => { if (!skuPick) return; await add({ item_type: "sku_card", sku_id: skuPick.id, width: 260, height: 180 }); setSkuOpen(false); setSkuPick(null); };

  // ---- patch helpers ----
  const patchLocal = (id: string, p: Partial<BoardItem>) => setItems((items) => items.map((i) => i.id === id ? { ...i, ...p } : i));
  const saveItem = async (id: string, patch: Record<string, unknown>) => { try { const it = await updateItem(id, patch); patchLocal(id, it); } catch (e) { pushToast("error", (e as Error).message); } };
  const remove = async (id: string) => { try { await deleteItem(id); setItems((p) => p.filter((i) => i.id !== id)); if (selId === id) setSelId(null); } catch (e) { pushToast("error", (e as Error).message); } };

  // ---- pointer ----
  const onBoardDown = (e: RPE) => { setSelId(null); boardRef.current?.setPointerCapture(e.pointerId); interRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y }; };
  const startDrag = (e: RPE, it: BoardItem) => { e.stopPropagation(); setSelId(it.id); movedRef.current = false; boardRef.current?.setPointerCapture(e.pointerId); interRef.current = { type: "drag", id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y }; };
  const startResize = (e: RPE, it: BoardItem) => { e.stopPropagation(); boardRef.current?.setPointerCapture(e.pointerId); interRef.current = { type: "resize", id: it.id, sx: e.clientX, sy: e.clientY, ow: it.width, oh: it.height }; };

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

  const zoomBtn = (f: number) => setVp((v) => { const r = boardRef.current!.getBoundingClientRect(); const sx = r.width / 2, sy = r.height / 2; const ns = clamp(v.scale * f, 0.2, 2); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[480px] rounded-xl border border-slate-200 bg-white overflow-hidden">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      {/* Left toolbar */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1">
        <TBtn onClick={() => setSelId(null)} title="เลือก">🖱️</TBtn>
        <TBtn onClick={addNote} title="โน้ต">📝</TBtn>
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
      {/* Filter bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white rounded-lg border border-slate-200 shadow-sm px-2 py-1.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ค้นหา..." className="h-7 w-40 border border-slate-200 rounded-md px-2 text-sm" />
        <button onClick={() => setSelectedOnly((s) => !s)} className={`h-7 px-2 rounded-md text-xs border ${selectedOnly ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>เฉพาะที่เลือก</button>
        <button onClick={() => setHideRejected((s) => !s)} className={`h-7 px-2 rounded-md text-xs border ${hideRejected ? "bg-violet-600 text-white border-violet-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>ซ่อนที่ตีตก</button>
      </div>

      {/* Canvas */}
      <div ref={boardRef} onPointerDown={onBoardDown} onPointerMove={onBoardMove} onPointerUp={onBoardUp}
        className="absolute inset-0 cursor-default"
        style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.x}px ${vp.y}px`, touchAction: "none" }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.scale})` }}>
          {shown.map((it) => (
            <ItemView key={it.id} it={it} selected={selId === it.id} onDown={(e) => startDrag(e, it)} onResize={(e) => startResize(e, it)} onOpenTask={() => it.task_id && window.open(`/tasks`, "_blank")} />
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
        <ProductPicker value={skuPick} onChange={setSkuPick} disableCreate />
      </ERPModal>
    </div>
  );
}

function TBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className="h-9 w-9 flex items-center justify-center rounded-md text-base hover:bg-slate-100">{children}</button>;
}

// ---- item rendering ----
function ItemView({ it, selected, onDown, onResize, onOpenTask }: { it: BoardItem; selected: boolean; onDown: (e: RPE) => void; onResize: (e: RPE) => void; onOpenTask: () => void }) {
  const ring = selected ? "ring-2 ring-violet-400" : it.status === "selected" ? "ring-2 ring-emerald-400" : it.status === "rejected" ? "ring-2 ring-red-300 opacity-60" : "";
  const base: React.CSSProperties = { left: it.x, top: it.y, width: it.width, height: it.height };
  const handle = selected && <div onPointerDown={onResize} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)" }} />;

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
  return <div onPointerDown={onDown} className={`absolute rounded-lg shadow-sm p-2 cursor-grab whitespace-pre-wrap text-sm text-slate-700 overflow-hidden ${ring}`} style={{ ...base, background: it.color || "#fef9c3" }}>
    {it.content || <span className="text-slate-400">โน้ต (แก้ที่แผงขวา)</span>}{handle}
  </div>;
}

// ---- right detail panel ----
function RightPanel({ it, onChange, onSave, onDelete, onClose, pushToast }: { it: BoardItem; onChange: (p: Partial<BoardItem>) => void; onSave: (patch: Record<string, unknown>) => void; onDelete: () => void; onClose: () => void; pushToast: (type: "success" | "error" | "info", m: string) => void }) {
  const isNote = it.item_type === "note";
  const isSection = it.item_type === "section";
  const isLink = it.item_type === "url" || it.item_type === "video_link";

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
        {isLink && (
          <div><label className="text-xs text-slate-400">ลิงก์</label>
            <input value={it.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} onBlur={(e) => onSave({ url: e.target.value })} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
        )}
        <div><label className="text-xs text-slate-400">แท็ก (คั่นด้วย ,)</label>
          <input defaultValue={(it.tags ?? []).join(", ")} onBlur={(e) => onSave({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
        <div>
          <label className="text-xs text-slate-400">ทิศทาง</label>
          <div className="flex gap-1.5 mt-1">
            <button onClick={() => onSave({ status: it.status === "selected" ? "none" : "selected" })} className={`flex-1 h-8 text-xs rounded-lg border ${it.status === "selected" ? "bg-emerald-600 text-white border-emerald-600" : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}>✓ เลือก</button>
            <button onClick={() => onSave({ status: it.status === "rejected" ? "none" : "rejected" })} className={`flex-1 h-8 text-xs rounded-lg border ${it.status === "rejected" ? "bg-red-600 text-white border-red-600" : "text-red-600 border-red-200 hover:bg-red-50"}`}>✗ ตีตก</button>
          </div>
        </div>

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

const TYPE_LABEL: Record<string, string> = { section: "โซน Section", note: "โน้ต", image: "รูป", url: "ลิงก์ URL", video_link: "ลิงก์วิดีโอ", google_slides: "Google Slides", sku_card: "การ์ดสินค้า", task_card: "การ์ดงาน", comment_marker: "คอมเมนต์" };
