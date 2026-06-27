"use client";

/**
 * ParentDescriptionImages — ช่อง "รูป Description (มีลำดับ)" ในฟอร์ม Parent SKU
 *
 * อัปรูป → เข้าคลังกลาง (assets) + ผูกเป็น Description ของ Parent (asset_usages module=parent_sku_description)
 * → โผล่ในโฟลเดอร์ Description ของมุมมอง "ดูตามแบรนด์". ลากเรียงลำดับได้.
 * กดรูป → ดูใหญ่ (โชว์ขนาด) · ตอนอัปมี animation · ปุ่มลบ = ลบจากคลังด้วย (กู้คืนได้ 30 วัน)
 * ใช้ของกลาง: /api/assets (อัป/ลบ) · /api/assets/description (ผูก/ลบลิงก์/ลิสต์) · /api/assets/brand-tree POST (ลำดับ)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { downscaleImageWidth } from "@/lib/image-resize";
import { formatBytes } from "@/lib/assets";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import type { AssetRow } from "@/app/api/assets/shared";

const imgDims = (file: File) => new Promise<{ w: number; h: number } | null>((res) => {
  if (!file.type.startsWith("image/")) return res(null);
  const img = new Image(); const u = URL.createObjectURL(file);
  img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u); };
  img.onerror = () => { res(null); URL.revokeObjectURL(u); };
  img.src = u;
});

// ข้อความขนาดรูป: กว้าง×สูง (ถ้ามี) ไม่งั้นใช้ขนาดไฟล์
const sizeText = (a: AssetRow) => (a.width && a.height ? `${a.width}×${a.height}` : formatBytes(a.size_bytes));

export function ParentDescriptionImages({ parentId, readonly, actor }: { parentId: string | null; readonly?: boolean; actor?: string }) {
  const toast = useToast();
  const [images, setImages] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);   // อัปโหลดอยู่ → โชว์ animation
  const [lightbox, setLightbox] = useState<AssetRow | null>(null);   // กดรูป → ดูใหญ่
  const [delTarget, setDelTarget] = useState<AssetRow | null>(null); // ยืนยันก่อนลบจากคลัง
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);   // ลากไฟล์จากนอกมาวาง
  const [hovering, setHovering] = useState(false);    // ชี้อยู่ในกล่อง → รับ Ctrl+V
  const busy = progress !== null;

  const load = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    try { const j = await apiFetch(`/api/assets/description?parent_id=${parentId}`).then((r) => r.json()); setImages(j.images ?? []); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  const upload = async (files: FileList | File[]) => {
    if (!parentId) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setProgress({ done: 0, total: arr.length });
    let ok = 0;
    for (let i = 0; i < arr.length; i++) {
      try {
        const file = await downscaleImageWidth(arr[i], 1200);   // ย่อด้านกว้าง ≤ 1200px ตอนอัป
        const fd = new FormData();
        fd.append("file", file); fd.append("source", "upload");
        if (actor) fd.append("actor", actor);
        const d = await imgDims(file); if (d) { fd.append("width", String(d.w)); fd.append("height", String(d.h)); }
        const res = await apiFetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "อัปไม่สำเร็จ");
        const assetId = j.data?.id as string | undefined; if (!assetId) throw new Error("อัปไม่สำเร็จ");
        const lr = await apiFetch("/api/assets/description", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_id: parentId, asset_id: assetId }) });
        const lj = await lr.json().catch(() => ({})); if (!lr.ok || lj.error) throw new Error(lj.error || "ผูกไม่สำเร็จ");
        ok++;
      } catch (e) { toast.error(e instanceof Error ? e.message : "อัปไม่สำเร็จ"); }
      setProgress({ done: i + 1, total: arr.length });
    }
    setProgress(null);
    if (ok) { toast.success(`เพิ่มรูป Description ${ok} รูป`); await load(); }
  };

  // วางจาก clipboard (Ctrl+V) — เฉพาะตอนเมาส์ชี้อยู่ในกล่องนี้ (กันชนกับ ImageManager ในหน้าเดียวกัน)
  const uploadRef = useRef(upload); uploadRef.current = upload;
  useEffect(() => {
    if (readonly || !hovering || !parentId) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); void uploadRef.current(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readonly, hovering, parentId]);

  // ลบ = เอาออกจาก Description + ลบไฟล์ออกจากคลัง (→ ถังขยะ กู้คืนได้ 30 วัน) · ถ้าไฟล์ถูกใช้ที่อื่นจะคงไว้ในคลัง
  const removeFromLibrary = async (a: AssetRow) => {
    if (!parentId) return;
    setDelTarget(null);
    try {
      const r = await apiFetch(`/api/assets/description?parent_id=${parentId}&asset_id=${a.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "เอาออกไม่สำเร็จ");
      const dr = await apiFetch(`/api/assets/${a.id}`, { method: "DELETE" });
      const dj = await dr.json().catch(() => ({}));
      setImages((s) => s.filter((x) => x.id !== a.id));
      if (!dr.ok || dj.error) toast.success("เอาออกจาก Description แล้ว (ไฟล์ยังถูกใช้ที่อื่น เลยยังเก็บไว้ในคลัง)");
      else toast.success("ลบรูปออกจากคลังแล้ว (กู้คืนได้ 30 วัน)");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const saveOrder = async (ids: string[]) => {
    if (!parentId) return;
    try {
      await apiFetch("/api/assets/brand-tree", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: "parent_sku_description", record_id: parentId, ordered_asset_ids: ids }) });
    } catch { toast.error("บันทึกลำดับไม่สำเร็จ"); }
  };
  const drop = (toIdx: number) => {
    const from = dragIdx.current; dragIdx.current = null; setOverIdx(null);
    if (from == null || from === toIdx) return;
    const next = [...images]; const [m] = next.splice(from, 1); next.splice(toIdx, 0, m);
    setImages(next); void saveOrder(next.map((a) => a.id));
  };

  if (!parentId) return <div className="text-xs text-slate-400 text-center py-3">บันทึก Parent SKU ก่อน แล้วค่อยเพิ่มรูป Description</div>;

  const upRemaining = progress ? Math.max(0, progress.total - progress.done) : 0;

  return (
    <div
      onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onDragOver={(e) => { if (!readonly && dragIdx.current == null) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { if (dragIdx.current == null) { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files); } }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-medium text-slate-700">📂 รูป Description <span className="text-slate-400 font-normal">({images.length})</span></p>
        {!readonly && <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="h-8 px-3 text-[12px] border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
          {busy ? <><span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />กำลังอัป {progress?.done}/{progress?.total}</> : "＋ เพิ่มรูป"}</button>}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.currentTarget.value = ""; }} />
      </div>
      {loading ? <div className="text-xs text-slate-400 py-3 text-center">กำลังโหลด…</div>
        : images.length === 0 && !busy ? (
          <div onClick={() => { if (!readonly) inputRef.current?.click(); }}
            className={`text-xs text-center py-5 border border-dashed rounded-lg transition-colors ${dragOver ? "border-indigo-400 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-400"} ${!readonly ? "cursor-pointer hover:bg-slate-50" : ""}`}>
            {dragOver ? "วางรูปที่นี่" : <>ยังไม่มีรูป Description{!readonly && " — ลากรูปมาวาง · คลิก · หรือกด Ctrl+V"}</>}
          </div>
        ) : (
          <div className={`grid gap-2 rounded-lg ${dragOver ? "ring-2 ring-indigo-300 p-1" : ""}`} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
            {images.map((a, idx) => (
              <div key={a.id} draggable={!readonly}
                onDragStart={() => { dragIdx.current = idx; }}
                onDragOver={(e) => { if (!readonly) { e.preventDefault(); if (dragIdx.current != null && overIdx !== idx) setOverIdx(idx); } }}
                onDrop={(e) => { e.preventDefault(); if (dragIdx.current != null) drop(idx); else if (e.dataTransfer.files?.length) { setDragOver(false); void upload(e.dataTransfer.files); } }}
                onDragEnd={() => { dragIdx.current = null; setOverIdx(null); }}
                className={`relative group rounded-lg border overflow-hidden bg-white ${overIdx === idx ? "ring-2 ring-indigo-400" : "border-slate-200"} ${!readonly ? "cursor-grab active:cursor-grabbing" : ""}`}>
                <div className="h-20 bg-slate-100 flex items-center justify-center overflow-hidden cursor-zoom-in"
                  onClick={() => a.asset_type === "image" && setLightbox(a)} title="กดเพื่อดูรูปใหญ่">
                  {a.asset_type === "image"
                    ? <img src={withImageWidth(a.url, 200) ?? a.url} alt={a.title} loading="lazy" draggable={false} className="w-full h-full object-cover" />
                    : <span className="text-xl">🖼️</span>}
                </div>
                <span className="absolute top-0.5 left-0.5 text-[9px] bg-black/50 text-white rounded px-1">{idx + 1}</span>
                {/* ขนาดรูป */}
                <span className="block px-1 py-0.5 text-[9px] text-slate-400 text-center truncate">{sizeText(a)}</span>
                {!readonly && <button type="button" onClick={(e) => { e.stopPropagation(); setDelTarget(a); }} title="ลบรูปนี้ (เอาออกจาก Description + ลบจากคลัง)"
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-white/90 border border-slate-200 text-rose-500 text-[11px] opacity-0 group-hover:opacity-100 hover:bg-rose-50">✕</button>}
              </div>
            ))}
            {/* tiles กำลังอัป (animation) */}
            {Array.from({ length: upRemaining }).map((_, i) => (
              <div key={`up-${i}`} className="rounded-lg border border-indigo-200 overflow-hidden">
                <div className="h-20 bg-indigo-50/60 flex flex-col items-center justify-center gap-1.5">
                  <span className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <span className="text-[9px] text-indigo-500">กำลังอัป…</span>
                </div>
                <span className="block px-1 py-0.5 text-[9px] text-transparent">.</span>
              </div>
            ))}
          </div>
        )}
      {!readonly && images.length > 0 && <p className="text-[10px] text-slate-300 mt-1">ลากรูปย่อยจัดลำดับ · ลากไฟล์มาวาง / Ctrl+V เพื่อเพิ่ม · กดรูปเพื่อดูใหญ่</p>}

      {/* ดูรูปใหญ่ + ขนาด */}
      {lightbox && (
        <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.title} className="max-w-full max-h-full object-contain rounded-lg" />
          <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-white/90 text-slate-700 text-xs">
            {lightbox.width && lightbox.height ? `${lightbox.width} × ${lightbox.height} px · ` : ""}{formatBytes(lightbox.size_bytes)}
          </div>
          <a href={lightbox.url} download={lightbox.title || "image"} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-16 h-9 px-3 rounded-lg bg-white/90 text-slate-700 text-sm font-medium flex items-center hover:bg-white">⬇ ดาวน์โหลด</a>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-slate-700 text-lg flex items-center justify-center hover:bg-white">✕</button>
        </div>
      )}

      <ConfirmDialog open={delTarget !== null} onClose={() => setDelTarget(null)}
        onConfirm={() => { if (delTarget) void removeFromLibrary(delTarget); }}
        title="ลบรูปนี้?" message="รูปจะถูกเอาออกจาก Description และลบออกจากคลังไฟล์กลางด้วย (กู้คืนได้ 30 วัน) — ถ้ารูปยังถูกใช้ที่อื่นจะคงไว้ในคลัง"
        confirmText="ลบ" variant="danger" />
    </div>
  );
}
