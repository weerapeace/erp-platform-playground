"use client";

/**
 * ImageInput — Sprint 6
 *
 * Single image upload + preview + clear
 * Stores R2 object key in field value
 * แสดง signed URL preview ผ่าน /api/master-v2/r2-signed-url
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

interface ImageInputProps {
  value:    string | null;        // r2_key
  onChange: (r2_key: string | null) => void;
  folder?:  string;               // default: 'uploads'
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
}

export function ImageInput({
  value, onChange, folder = "uploads", required, disabled, hasError,
}: ImageInputProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // F15: ใช้ /api/r2-image proxy ตรงๆ (ไม่ติด CORS + เร็วขึ้น)
  useEffect(() => {
    setPreviewUrl(value ? `/api/r2-image?key=${encodeURIComponent(value)}` : null);
  }, [value]);

  const handleFile = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);

      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) { setErr(json.error); return; }
      onChange(json.r2_key);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ลากรูปมาวาง (drag & drop)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (disabled || uploading) return;
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    if (f) void handleFile(f);
  };
  // วางรูปจากคลิปบอร์ด (Ctrl+V / print screen → วาง)
  const onPaste = (e: React.ClipboardEvent) => {
    if (disabled || uploading) return;
    const items = e.clipboardData?.items ?? [];
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); void handleFile(f); return; }
      }
    }
  };

  return (
    <div className="mt-0.5">
      <div
        tabIndex={disabled ? -1 : 0}
        onPaste={onPaste}
        onDragOver={(e) => { if (!disabled && !uploading) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative w-full rounded-md border-2 border-dashed transition-colors outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 ${
          dragOver ? "border-orange-400 bg-orange-50" : hasError ? "border-red-300" : "border-slate-200 hover:border-orange-300"
        } ${disabled ? "opacity-50" : ""}`}
        style={{ minHeight: previewUrl ? 120 : 80 }}
      >
        {previewUrl ? (
          // preview mode
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="preview" className="w-full max-h-48 object-contain rounded-md bg-slate-50" />
            {!disabled && (
              <div className="absolute top-1 right-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded shadow hover:bg-slate-50 disabled:opacity-50"
                >
                  📷 เปลี่ยน
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  disabled={uploading}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 text-red-600 rounded shadow hover:bg-red-50 disabled:opacity-50"
                >
                  ✕ ลบ
                </button>
              </div>
            )}
          </div>
        ) : (
          // upload mode
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="w-full h-20 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-orange-600"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
            </svg>
            <span className="text-xs">
              {uploading ? "กำลังอัปโหลด..." : "คลิกเลือกรูป · ลากวาง · วาง (Ctrl+V)"}
              {required && <span className="text-red-500 ml-1">*</span>}
            </span>
            <span className="text-[10px] text-slate-400">JPG / PNG / WebP — สูงสุด 5MB · พิมพ์หน้าจอแล้ววางได้</span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="hidden"
      />

      {err && (
        <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>
      )}
    </div>
  );
}

// ============================================================
// ImageCell — แสดง thumbnail ในตาราง (auto load signed URL)
// ============================================================

/**
 * F25: ImageGallery — รูปใหญ่ใน detail drawer (รองรับหลายรูป เผื่ออนาคต)
 * ตอนนี้รับ r2Key เดียว → โชว์เต็มกรอบ + คลิกเปิดเต็มจอ
 */
export function ImageGallery({ r2Key }: { r2Key: string }) {
  const [full, setFull] = useState(false);
  const src = `/api/r2-image?key=${encodeURIComponent(r2Key)}`;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-full h-full object-contain cursor-zoom-in"
        onClick={() => setFull(true)}
      />
      {full && createPortal(
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setFull(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * F15: ImageCell ใช้ /api/r2-image?key=X (Worker proxy)
 * - ไม่ติด CORS เพราะ same-origin
 * - ไม่ต้องสร้าง signed URL ผ่าน fetch แยก (เร็วขึ้น 1 round trip)
 * - <img src> โหลดตรงจาก proxy → Cloudflare Edge cache อัตโนมัติ
 * - ยังคง lazy load ด้วย IntersectionObserver
 */
export function ImageCell({ r2Key, size = 40 }: { r2Key: string | null | undefined; size?: number }) {
  const [visible, setVisible] = useState(false);
  // F22: hover preview — hover thumbnail → รูปใหญ่เด้งลอยตามเมาส์
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || visible) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: "200px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  if (!r2Key) {
    return (
      <div ref={ref} className="flex items-center justify-center rounded bg-slate-100 text-slate-300" style={{ width: size, height: size }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
    );
  }

  if (!visible) {
    return <div ref={ref} className="rounded bg-slate-100 animate-pulse" style={{ width: size, height: size }} />;
  }

  const src = `/api/r2-image?key=${encodeURIComponent(r2Key)}`;
  // วาง preview ฝั่งที่ไม่ตกขอบจอ (default ขวาของ cursor, ถ้าชิดขวาจอ → ซ้าย)
  const PREVIEW = 320;
  const flipLeft = typeof window !== "undefined" && pos.x + 24 + PREVIEW > window.innerWidth;
  const px = flipLeft ? pos.x - PREVIEW - 24 : pos.x + 24;
  const py = Math.max(8, Math.min(pos.y - PREVIEW / 2, (typeof window !== "undefined" ? window.innerHeight : 800) - PREVIEW - 8));

  return (
    <div
      ref={ref}
      className="inline-block cursor-zoom-in"
      onMouseEnter={(e) => { setHover(true); setPos({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        className="rounded object-cover border border-slate-200 bg-white"
        style={{ width: size, height: size }}
      />
      {/* F22: floating zoom preview (fixed → ลอยเหนือทุกอย่าง) */}
      {hover && createPortal(
        <div
          className="fixed z-[100] pointer-events-none rounded-lg shadow-2xl border-2 border-white bg-white overflow-hidden"
          style={{ left: px, top: py, width: PREVIEW, height: PREVIEW }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full h-full object-contain bg-slate-50" />
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * HoverZoomImage (ของกลาง) — รูปที่เอาเมาส์ชี้แล้วเด้งรูปใหญ่ลอยตามเมาส์
 * ใช้ครอบรูปการ์ด/thumbnail ที่อยากให้ดูใหญ่ตอน hover (คลิกยังส่งต่อไปยัง element แม่ได้ปกติ)
 */
export function HoverZoomImage({ src, alt = "", className = "", previewSize = 320 }: {
  src: string; alt?: string; className?: string; previewSize?: number;
}) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const flipLeft = typeof window !== "undefined" && pos.x + 24 + previewSize > window.innerWidth;
  const px = flipLeft ? pos.x - previewSize - 24 : pos.x + 24;
  const py = Math.max(8, Math.min(pos.y - previewSize / 2, (typeof window !== "undefined" ? window.innerHeight : 800) - previewSize - 8));

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className}
        onMouseEnter={(e) => { setHover(true); setPos({ x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(false)} />
      {hover && createPortal(
        <div className="fixed z-[120] pointer-events-none rounded-lg shadow-2xl border-2 border-white bg-white overflow-hidden"
          style={{ left: px, top: py, width: previewSize, height: previewSize }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full h-full object-contain bg-slate-50" />
        </div>,
        document.body,
      )}
    </>
  );
}
