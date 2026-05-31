"use client";

/**
 * ImageInput — Sprint 6
 *
 * Single image upload + preview + clear
 * Stores R2 object key in field value
 * แสดง signed URL preview ผ่าน /api/master-v2/r2-signed-url
 */

import { useState, useEffect, useRef } from "react";
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
  const fileRef = useRef<HTMLInputElement>(null);

  // resolve r2_key → signed URL
  useEffect(() => {
    if (!value) { setPreviewUrl(null); return; }
    apiFetch(`/api/master-v2/r2-signed-url?key=${encodeURIComponent(value)}&ttl=3600`)
      .then((r) => r.json())
      .then((j) => setPreviewUrl(j.url ?? null))
      .catch(() => setPreviewUrl(null));
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

  return (
    <div className="mt-0.5">
      <div className={`relative w-full rounded-md border-2 border-dashed transition-colors ${
        hasError ? "border-red-300" : "border-slate-200 hover:border-orange-300"
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
              {uploading ? "กำลังอัปโหลด..." : "คลิกเพื่อเลือกรูป"}
              {required && <span className="text-red-500 ml-1">*</span>}
            </span>
            <span className="text-[10px] text-slate-400">JPG / PNG / WebP — สูงสุด 5MB</span>
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

export function ImageCell({ r2Key, size = 40 }: { r2Key: string | null | undefined; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!r2Key) { setUrl(null); return; }
    apiFetch(`/api/master-v2/r2-signed-url?key=${encodeURIComponent(r2Key)}&ttl=3600`)
      .then((r) => r.json())
      .then((j) => setUrl(j.url ?? null))
      .catch(() => setUrl(null));
  }, [r2Key]);

  if (!r2Key) {
    return (
      <div className="flex items-center justify-center rounded bg-slate-100 text-slate-300" style={{ width: size, height: size }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
    );
  }

  if (!url) {
    return <div className="rounded bg-slate-100 animate-pulse" style={{ width: size, height: size }} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="rounded object-cover border border-slate-200 bg-white" style={{ width: size, height: size }} />
  );
}
