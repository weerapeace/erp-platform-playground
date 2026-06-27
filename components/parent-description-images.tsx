"use client";

/**
 * ParentDescriptionImages — ช่อง "รูป Description (มีลำดับ)" ในฟอร์ม Parent SKU
 *
 * อัปรูป → เข้าคลังกลาง (assets) + ผูกเป็น Description ของ Parent (asset_usages module=parent_sku_description)
 * → โผล่ในโฟลเดอร์ Description ของมุมมอง "ดูตามแบรนด์". ลากเรียงลำดับได้.
 * ใช้ของกลาง: /api/assets (อัป) · /api/assets/description (ผูก/ลบ/ลิสต์) · /api/assets/brand-tree POST (ลำดับ)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import type { AssetRow } from "@/app/api/assets/shared";

const imgDims = (file: File) => new Promise<{ w: number; h: number } | null>((res) => {
  if (!file.type.startsWith("image/")) return res(null);
  const img = new Image(); const u = URL.createObjectURL(file);
  img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u); };
  img.onerror = () => { res(null); URL.revokeObjectURL(u); };
  img.src = u;
});

export function ParentDescriptionImages({ parentId, readonly, actor }: { parentId: string | null; readonly?: boolean; actor?: string }) {
  const toast = useToast();
  const [images, setImages] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    try { const j = await apiFetch(`/api/assets/description?parent_id=${parentId}`).then((r) => r.json()); setImages(j.images ?? []); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  const upload = async (files: FileList | File[]) => {
    if (!parentId) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
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
    }
    setBusy(false);
    if (ok) { toast.success(`เพิ่มรูป Description ${ok} รูป`); await load(); }
  };

  const remove = async (assetId: string) => {
    if (!parentId) return;
    try {
      const r = await apiFetch(`/api/assets/description?parent_id=${parentId}&asset_id=${assetId}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error);
      setImages((s) => s.filter((a) => a.id !== assetId));
    } catch (e) { toast.error(e instanceof Error ? e.message : "เอาออกไม่สำเร็จ"); }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-medium text-slate-700">📂 รูป Description <span className="text-slate-400 font-normal">({images.length})</span></p>
        {!readonly && <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="h-8 px-3 text-[12px] border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{busy ? "กำลังอัป…" : "＋ เพิ่มรูป"}</button>}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.currentTarget.value = ""; }} />
      </div>
      {loading ? <div className="text-xs text-slate-400 py-3 text-center">กำลังโหลด…</div>
        : images.length === 0 ? <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">ยังไม่มีรูป Description{!readonly && " — กด “＋ เพิ่มรูป”"}</div>
        : (
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
            {images.map((a, idx) => (
              <div key={a.id} draggable={!readonly}
                onDragStart={() => { dragIdx.current = idx; }}
                onDragOver={(e) => { if (!readonly) { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); } }}
                onDrop={(e) => { e.preventDefault(); drop(idx); }}
                onDragEnd={() => { dragIdx.current = null; setOverIdx(null); }}
                className={`relative group rounded-lg border overflow-hidden bg-white ${overIdx === idx ? "ring-2 ring-indigo-400" : "border-slate-200"} ${!readonly ? "cursor-grab active:cursor-grabbing" : ""}`}>
                <div className="h-20 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {a.asset_type === "image"
                    ? <img src={withImageWidth(a.url, 200) ?? a.url} alt={a.title} loading="lazy" draggable={false} className="w-full h-full object-cover" />
                    : <span className="text-xl">🖼️</span>}
                </div>
                <span className="absolute top-0.5 left-0.5 text-[9px] bg-black/50 text-white rounded px-1">{idx + 1}</span>
                {!readonly && <button type="button" onClick={() => void remove(a.id)} title="เอาออกจาก Description (ไฟล์ยังอยู่ในคลัง)"
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-white/90 border border-slate-200 text-rose-500 text-[11px] opacity-0 group-hover:opacity-100 hover:bg-rose-50">✕</button>}
              </div>
            ))}
          </div>
        )}
      {!readonly && images.length > 1 && <p className="text-[10px] text-slate-300 mt-1">ลากรูปเพื่อจัดลำดับ · เลข = ลำดับ</p>}
    </div>
  );
}
