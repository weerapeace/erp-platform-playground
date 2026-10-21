"use client";
// คลังไฟล์: อัปโหลดไฟล์ทั่วไป — แยกจาก index.tsx (Y1)
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { formatBytes } from "@/lib/assets";
import { downscaleImageWidth } from "@/lib/image-resize";
import { MediaUploadError, SMALL_UPLOAD_BYTES, normalizeMediaFile, uploadMediaAsset } from "@/lib/media-upload";
import type { AssetCollection } from "@/app/api/assets/collections/route";

// ── อัปโหลด (ลากวาง) ──
export type UpItem = { file: File; status: "pending" | "uploading" | "done" | "dup" | "error"; msg?: string };

export function UploadModal({ actor, collections, onClose, onDone, initialFiles, defaultCollectionId }: {
  actor: string | null; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFiles?: File[] | null; defaultCollectionId?: string | null;
}) {
  const toast = useToast();
  const t = useT();
  const [items, setItems] = useState<UpItem[]>([]);
  const [tagsStr, setTagsStr] = useState("");
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? "");   // เปิดอยู่ในอัลบั้มไหน → ตั้งให้เลย
  const [resizeW, setResizeW] = useState(1200);   // ย่อด้านกว้างก่อนอัป (0 = ขนาดจริง) · ไฟล์ที่ไม่ใช่รูปไม่ถูกย่ออยู่แล้ว
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).map((file) => ({ file, status: "pending" as const }));
    setItems((s) => [...s, ...arr]);
  };
  // ลากไฟล์มาวางบนหน้าคลัง (มุมมองรูปที่อัปเอง) → เปิดฟอร์มพร้อมไฟล์ที่ลากมา
  useEffect(() => { if (initialFiles?.length) addFiles(initialFiles); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const imgDims = (file: File): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      if (!file.type.startsWith("image/")) return res(null);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { res(null); URL.revokeObjectURL(url); };
      img.src = url;
    });

  const upload = async () => {
    if (items.length === 0) { toast.error(t("ยังไม่ได้เลือกไฟล์", "No files selected yet")); return; }
    setBusy(true);
    let done = 0;
    const next = [...items];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status === "done" || next[i].status === "dup") { done++; continue; }
      next[i] = { ...next[i], status: "uploading" }; setItems([...next]);
      try {
        // 🎬 วิดีโอ (ทุกขนาด) / ไฟล์ใหญ่กว่า 4 MB → ตัวอัปโหลดกลาง (วิดีโอถึง 200 MB · มีแถบ % · ลงคลังเอง · ชื่อ+ขนาดซ้ำ = ใช้ไฟล์เดิม)
        const real = await normalizeMediaFile(next[i].file);
        const realVideo = real.type.startsWith("video/");
        const shrunk = !realVideo && resizeW > 0 ? await downscaleImageWidth(real, resizeW) : real;
        if (realVideo || (shrunk.size > SMALL_UPLOAD_BYTES && shrunk.type.startsWith("image/"))) {
          const idx = i;
          const r = await uploadMediaAsset(shrunk, {
            folder: realVideo ? "storefront-videos" : "storefront-images",
            library: { tags: tagsStr.split(",").map((x) => x.trim()).filter(Boolean), collectionId: collectionId || undefined },
            onProgress: (p) => { next[idx] = { ...next[idx], msg: `${p}%` }; setItems([...next]); },
          });
          next[i] = { ...next[i], status: r.duplicate ? "dup" : "done", msg: r.duplicate ? t("มีอยู่แล้ว — ใช้ตัวเดิม", "Already exists — reused") : undefined };
          done++;
          setItems([...next]);
          continue;
        }
        // ย่อด้านกว้างตามที่เลือก (0 = ขนาดจริง ไม่ย่อ) · ไฟล์ที่ไม่ใช่รูป/เล็กกว่าอยู่แล้ว = ผ่านไปเลย
        const upFile = shrunk;
        const fd = new FormData();
        fd.append("file", upFile);
        if (tagsStr.trim()) fd.append("tags", tagsStr.trim());
        if (collectionId) fd.append("collection_id", collectionId);
        if (actor) fd.append("actor", actor);
        const d = await imgDims(upFile);
        if (d) { fd.append("width", String(d.w)); fd.append("height", String(d.h)); }
        const res = await apiFetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || t("อัปโหลดไม่สำเร็จ", "Upload failed"));
        next[i] = { ...next[i], status: j.duplicate ? "dup" : "done", msg: j.duplicate ? t("มีอยู่แล้ว — ใช้ตัวเดิม", "Already exists — reused") : undefined };
        done++;
      } catch (e) {
        next[i] = { ...next[i], status: "error", msg: e instanceof MediaUploadError || e instanceof Error ? e.message : t("ผิดพลาด", "Error") };
      }
      setItems([...next]);
    }
    setBusy(false);
    toast.success(`${t("อัปโหลดเสร็จ", "Uploaded")} ${done}/${items.length} ${t("ไฟล์", "files")}`);
    if (done > 0) onDone();
  };

  return (
    <ERPModal open onClose={onClose} title={t("อัปโหลดไฟล์เข้าคลัง", "Upload files to library")} size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{t("รองรับ รูป / PDF / ไฟล์ออกแบบ / วิดีโอ · วิดีโอถึง 200MB · ไฟล์อื่นไม่เกิน 25MB", "Supports images / PDF / design files / video · video up to 200MB · others max 25MB")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={upload} disabled={busy || items.length === 0}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {busy ? t("กำลังอัป…", "Uploading…") : t("บันทึกเข้าคลัง", "Save to library")}
            </button>
          </div>
        </div>
      }>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center mb-3 ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
      >
        <div className="text-3xl mb-1">⬆️</div>
        <p className="text-sm font-medium text-slate-700">{t("ลากไฟล์มาวางที่นี่", "Drag files here")}</p>
        <p className="text-[12px] text-slate-400">{t("หรือ คลิกเพื่อเลือกไฟล์", "or click to choose files")}</p>
        <input ref={inputRef} type="file" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3 max-h-48 overflow-auto">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="truncate flex-1">{it.file.name}</span>
              <span className={
                it.status === "done" ? "text-emerald-600" :
                it.status === "dup" ? "text-amber-600" :
                it.status === "error" ? "text-rose-600" :
                it.status === "uploading" ? "text-indigo-600" : "text-slate-400"
              }>
                {it.status === "done" ? t("✓ เสร็จ", "✓ Done") : it.status === "dup" ? t("ซ้ำ — ใช้ตัวเดิม", "Duplicate — reused") :
                 it.status === "error" ? `✕ ${it.msg ?? t("ผิดพลาด", "Error")}` : it.status === "uploading" ? `${t("กำลังอัป…", "Uploading…")}${it.msg ? ` ${it.msg}` : ""}` : formatBytes(it.file.size)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ย่อขนาดรูปก่อนอัป — ประหยัดพื้นที่/โหลดเร็ว · เลือก "ขนาดจริง" ถ้าต้องเก็บไฟล์เต็ม */}
      <div className="mb-3">
        <p className="text-[12px] text-slate-500 mb-1">{t("ย่อขนาดรูปก่อนอัป", "Shrink image before upload")} <span className="text-[10px] text-slate-400">{t("(ด้านกว้าง · ไฟล์ที่ไม่ใช่รูปไม่ถูกย่อ)", "(width · non-image files aren't shrunk)")}</span></p>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {[{ w: 800, label: "800px" }, { w: 1200, label: "1200px" }, { w: 1600, label: "1600px" }, { w: 0, label: t("ขนาดจริง", "Full size") }].map((o, i) => (
            <button key={o.w} type="button" onClick={() => setResizeW(o.w)} disabled={busy}
              className={`h-8 px-3 text-[12px] ${i > 0 ? "border-l border-slate-200" : ""} ${resizeW === o.w ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"} disabled:opacity-50`}>
              {resizeW === o.w ? "✓ " : ""}{o.label}
            </button>
          ))}
        </div>
        {resizeW === 0 && <p className="text-[11px] text-amber-600 mt-1">{t("⚠ เก็บขนาดจริง — ไฟล์ใหญ่ขึ้น (ไม่เกิน 25MB/ไฟล์)", "⚠ Keeping full size — larger files (max 25MB/file)")}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] text-slate-500">
          {t("แท็ก (คั่นด้วย ,)", "Tags (comma-separated)")}
          <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder={t("สินค้า, กระเป๋า", "product, bag")}
            className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>
        <label className="text-[12px] text-slate-500">
          {t("อัลบั้ม", "Album")}
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}
            className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">{t("— ไม่ระบุ —", "— None —")}</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
    </ERPModal>
  );
}
