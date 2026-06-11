"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Attachment, AttachmentsResponse } from "@/app/api/attachments/route";
import { apiFetch } from "@/lib/api";

// ============================================================
// ImageThumbnail — รูปเล็กในตาราง + hover ขยาย (component กลาง)
// ============================================================

export function ImageThumbnail({ url, size = 40, alt = "" }: { url?: string | null; size?: number; alt?: string }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos]     = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  if (!url) {
    return (
      <div className="flex items-center justify-center rounded bg-slate-100 text-slate-300" style={{ width: size, height: size }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
    );
  }

  const onEnter = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.right + 8, y: r.top });
    setHover(true);
  };

  // กันทะลุขอบจอ
  const ZOOM = 240;
  const left = typeof window !== "undefined" ? Math.min(pos.x, window.innerWidth - ZOOM - 16) : pos.x;
  const top  = typeof window !== "undefined" ? Math.min(Math.max(8, pos.y), window.innerHeight - ZOOM - 16) : pos.y;

  return (
    <div ref={ref} onMouseEnter={onEnter} onMouseLeave={() => setHover(false)} className="inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="rounded object-cover border border-slate-200 bg-white" style={{ width: size, height: size }} />
      {mounted && hover && createPortal(
        <div className="fixed z-[60] pointer-events-none rounded-lg overflow-hidden shadow-2xl border border-slate-200 bg-white"
          style={{ left, top, width: ZOOM, height: ZOOM }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="w-full h-full object-contain bg-slate-50" />
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================
// ImageManager — อัปโหลด/จัดการรูป-ไฟล์ (component กลาง)
// เก็บไฟล์ที่ Cloudflare R2 ผ่าน API route
// ใช้ได้ทุก entity: product, PR, ฯลฯ
// ============================================================

const isImage = (ct: string | null) => !!ct && ct.startsWith("image/");

export function ImageManager({
  entityType, entityId, actor, readonly = false,
}: {
  entityType: string;
  entityId:   string;
  actor?:     string;
  readonly?:  boolean;
}) {
  const [items,   setItems]   = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`);
      const json: AttachmentsResponse = await res.json();
      setItems(json.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const upload = useCallback(async (files: FileList | File[]) => {
    setUploading(true); setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", entityType);
        fd.append("entity_id", entityId);
        if (actor) fd.append("actor", actor);
        const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
      }
      await fetchList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally { setUploading(false); }
  }, [entityType, entityId, actor, fetchList]);

  // วางรูปจาก clipboard (Ctrl+V) — ทำงานเฉพาะตอนเมาส์ชี้อยู่ในกล่องนี้
  // (กันชนกันเมื่อหน้าเดียวมี ImageManager หลายตัว เช่น รูปใบงาน + รูปประกอบ comment)
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    if (readonly || !hovering) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) { e.preventDefault(); void upload(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readonly, hovering, upload]);

  const remove = async (id: string) => {
    try {
      const res = await apiFetch(`/api/attachments/${id}?actor=${encodeURIComponent(actor ?? "")}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (json.error) { setError(json.error); return; }
      if (json.warning) {
        // ลบ DB แล้วแต่ R2 มีปัญหา → เตือน user
        setError(`⚠ ${json.warning}`);
      } else {
        setError(null);
      }
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไฟล์ไม่สำเร็จ");
    }
  };

  const setPrimary = async (id: string) => {
    try {
      await apiFetch(`/api/attachments/${id}`, { method: "PATCH" });
      await fetchList();
    } catch { /* ignore */ }
  };

  return (
    <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">รูปภาพ & ไฟล์แนบ {items.length > 0 && `(${items.length})`}</p>
      </div>

      {error && <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠️ {error}</div>}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0,1,2].map(i => <div key={i} className="aspect-square bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {items.map(a => (
            <div key={a.id} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              {isImage(a.content_type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.public_url} alt={a.file_name} className="w-full h-full object-cover" />
              ) : (
                <a href={a.public_url} target="_blank" rel="noopener noreferrer" className="w-full h-full flex flex-col items-center justify-center text-slate-400 hover:text-slate-600">
                  <span className="text-2xl">📄</span>
                  <span className="text-[10px] px-1 truncate max-w-full">{a.file_name}</span>
                </a>
              )}
              {a.is_primary && (
                <span className="absolute top-1 left-1 text-[10px] bg-blue-600 text-white px-1.5 rounded-full">หลัก</span>
              )}
              {!readonly && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                  {!a.is_primary && (
                    <button onClick={() => setPrimary(a.id)} title="ตั้งเป็นรูปหลัก"
                      className="h-7 w-7 flex items-center justify-center bg-white rounded-full text-xs hover:bg-blue-50">⭐</button>
                  )}
                  <button onClick={() => remove(a.id)} title="ลบ"
                    className="h-7 w-7 flex items-center justify-center bg-white rounded-full text-xs hover:bg-red-50 text-red-600">🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload zone */}
      {!readonly && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setDragging(false); }}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
          }`}
        >
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) upload(e.target.files); }} />
          {uploading ? (
            <p className="text-sm text-blue-600">⏳ กำลังอัปโหลด...</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">{dragging ? "วางไฟล์ที่นี่" : "ลากรูป/ไฟล์มาวาง · คลิกเลือก · หรือชี้ที่กล่องนี้แล้วกด Ctrl+V"}</p>
              <p className="text-xs text-slate-400 mt-0.5">รูปภาพ หรือ PDF · ไม่เกิน 10MB</p>
            </>
          )}
        </div>
      )}

      {readonly && items.length === 0 && <p className="text-sm text-slate-400 text-center py-3">ไม่มีไฟล์แนบ</p>}
    </div>
  );
}
