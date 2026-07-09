"use client";

// ============================================================
// ImageAttach (ของกลาง) — แนบรูปหลายรูป: ลากวาง / Ctrl+V / เลือกไฟล์
// ย่อขนาด ≤ 800px อัตโนมัติก่อนอัปขึ้น R2 (ไฟล์เบา) แล้วเรียก onAttach เก็บเป็น attachment
// ============================================================

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ImageLightbox } from "@/components/image-lightbox";

type Img = { id: string; r2_key: string | null; file_name?: string | null };
type ToastFn = (type: "success" | "error" | "info", m: string) => void;

// ย่อรูปให้ด้านยาวสุด ≤ max (คงสัดส่วน) → คืน Blob
async function resizeImage(file: File, max = 800): Promise<{ blob: Blob; type: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"); if (ctx) ctx.drawImage(img, 0, 0, w, h);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b ?? file), type, 0.85));
    return { blob, type };
  } finally { URL.revokeObjectURL(url); }
}

// ของกลาง: ย่อรูป (≤max) แล้วอัปขึ้น R2 → คืน r2_key (ใช้ซ้ำได้ทั้ง ImageAttach + ฟอร์มสร้าง SKU)
export async function uploadResizedImage(file: File, opts?: { folder?: string; max?: number }): Promise<{ r2_key: string; file_name: string; content_type: string; size_bytes: number }> {
  const { blob, type } = await resizeImage(file, opts?.max ?? 800);
  const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type }));
  fd.append("folder", opts?.folder ?? "creative-tasks");
  const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
  const j = await res.json(); if (j.error) throw new Error(j.error);
  return { r2_key: j.r2_key as string, file_name: file.name, content_type: (j.content_type as string) || type, size_bytes: (j.size as number) ?? blob.size };
}

export function ImageAttach({ images, onAttach, onDelete, pushToast, maxSize = 800 }: {
  images: Img[];
  onAttach: (r: { r2_key: string; file_name: string; content_type: string; size_bytes: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pushToast: ToastFn;
  maxSize?: number;   // ด้านยาวสุดที่ย่อก่อนอัป (ดีฟอลต์ 800)
}) {
  const [busy, setBusy] = useState(false);
  const [lbIndex, setLbIndex] = useState(-1);   // รูปที่กำลังเปิดดูเต็มจอ (-1 = ปิด)
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f && f.type.startsWith("image/")) as File[];
    if (!imgs.length) return;
    setBusy(true);
    for (const f of imgs) {
      try {
        const r = await uploadResizedImage(f, { folder: "creative-tasks", max: maxSize });
        await onAttach(r);
      } catch (e) { pushToast("error", "อัปโหลดรูปไม่สำเร็จ: " + (e as Error).message); }
    }
    setBusy(false);
  };

  // วางรูปจากคลิปบอร์ด (Ctrl+V) ขณะ component นี้แสดงอยู่
  const handleRef = useRef(handleFiles); handleRef.current = handleFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) return;
      const fs = Array.from(e.clipboardData?.items ?? []).map((i) => i.getAsFile()).filter((f): f is File => !!f && f.type.startsWith("image/"));
      if (fs.length) { e.preventDefault(); void handleRef.current(fs); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files); }}
        className="border border-dashed border-slate-300 rounded-lg p-2.5 text-center text-xs text-slate-400">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ""; }} />
        {busy ? "⏳ กำลังอัปโหลด..." : <>📎 ลากรูปมาวาง · วาง Ctrl+V · <button onClick={() => fileRef.current?.click()} className="text-violet-700 underline">เลือกไฟล์</button> <span className="text-slate-300">(ย่อ ≤{maxSize}px ให้อัตโนมัติ)</span></>}
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-2">
          {images.map((im, i) => (
            <div key={im.id} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/r2-image?key=${encodeURIComponent(im.r2_key ?? "")}&w=320`} alt={im.file_name ?? ""} onClick={() => setLbIndex(i)} title="กดเพื่อดูเต็มจอ" className="w-full h-20 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
              <button onClick={() => void onDelete(im.id)} title="ลบรูป" className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>
            </div>
          ))}
        </div>
      )}
      <ImageLightbox images={images.map((im) => ({ url: `/api/r2-image?key=${encodeURIComponent(im.r2_key ?? "")}&w=1600`, label: im.file_name }))} index={lbIndex} onClose={() => setLbIndex(-1)} onIndex={setLbIndex} />
    </div>
  );
}

// ============================================================
// ImageAttachKeys (ของกลาง) — แนบรูปหลายรูปแบบเก็บเป็น "array ของ r2_key" (ไม่ผูกตาราง attachment)
// เหมาะกับ field ในฟอร์ม/หน้ารายละเอียด (เช่น รูปประกอบบรีฟของงาน) · ย่อ ≤maxSize อัตโนมัติ · ลาก/วาง/เลือกไฟล์
// ============================================================
export function ImageAttachKeys({ value, onChange, folder = "creative-tasks", maxSize = 800, disabled }: {
  value: string[];
  onChange: (keys: string[]) => void;
  folder?: string;
  maxSize?: number;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lbIndex, setLbIndex] = useState(-1);
  const fileRef = useRef<HTMLInputElement>(null);
  const valRef = useRef(value); valRef.current = value;

  const handleFiles = async (files: FileList | File[]) => {
    if (disabled) return;
    const imgs = Array.from(files).filter((f) => f && f.type.startsWith("image/")) as File[];
    if (!imgs.length) return;
    setErr(null); setBusy(true);
    const added: string[] = [];
    for (const f of imgs) {
      try { const r = await uploadResizedImage(f, { folder, max: maxSize }); added.push(r.r2_key); }
      catch (e) { setErr("อัปโหลดรูปไม่สำเร็จ: " + (e as Error).message); }
    }
    if (added.length) onChange([...valRef.current, ...added]);
    setBusy(false);
  };

  // วางรูปจากคลิปบอร์ด (Ctrl+V) ขณะ component นี้แสดง (ไม่ดักตอนพิมพ์ใน input/textarea)
  const handleRef = useRef(handleFiles); handleRef.current = handleFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) return;
      const fs = Array.from(e.clipboardData?.items ?? []).map((i) => i.getAsFile()).filter((f): f is File => !!f && f.type.startsWith("image/"));
      if (fs.length) { e.preventDefault(); void handleRef.current(fs); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled]);

  const removeAt = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files); }}
        className="border border-dashed border-slate-300 rounded-lg p-2.5 text-center text-xs text-slate-400">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ""; }} />
        {busy ? "⏳ กำลังอัปโหลด..." : <>📎 ลากรูปมาวาง · วาง Ctrl+V · <button type="button" onClick={() => fileRef.current?.click()} className="text-violet-700 underline">เลือกไฟล์</button> <span className="text-slate-300">(ย่อ ≤{maxSize}px ให้อัตโนมัติ)</span></>}
      </div>
      {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-2">
          {value.map((k, i) => (
            <div key={`${k}-${i}`} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/r2-image?key=${encodeURIComponent(k)}&w=320`} alt="" onClick={() => setLbIndex(i)} title="กดเพื่อดูเต็มจอ" className="w-full h-20 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
              {!disabled && <button type="button" onClick={() => removeAt(i)} title="ลบรูป" className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>}
            </div>
          ))}
        </div>
      )}
      <ImageLightbox images={value.map((k) => ({ url: `/api/r2-image?key=${encodeURIComponent(k)}&w=1600` }))} index={lbIndex} onClose={() => setLbIndex(-1)} onIndex={setLbIndex} />
    </div>
  );
}
