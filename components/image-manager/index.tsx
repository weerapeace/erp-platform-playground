"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Attachment, AttachmentsResponse } from "@/app/api/attachments/route";
import { ImageMarkupButton } from "@/components/image-markup-editor";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { downscaleImageWidth } from "@/lib/image-resize";
import { AssetPicker } from "@/components/asset-picker";

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
      {/* object-contain (fit): รูปไม่จัตุรัสเห็นทั้งใบ ไม่ถูกครอบตัด · รูปจัตุรัสยังเต็มกรอบเหมือนเดิม */}
      <img src={withImageWidth(url, Math.min(size * 3, 512)) ?? url} alt={alt} loading="lazy" decoding="async" className="rounded object-contain border border-slate-200 bg-white" style={{ width: size, height: size }} />
      {mounted && hover && createPortal(
        <div className="fixed z-[60] pointer-events-none rounded-lg overflow-hidden shadow-2xl border border-slate-200 bg-white"
          style={{ left, top, width: ZOOM, height: ZOOM }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(url, 480) ?? url} alt={alt} decoding="async" className="w-full h-full object-contain bg-slate-50" />
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
  maxItems = 0,
  maxSizeBytes = 10 * 1024 * 1024,
  imageOnly = false,
  title,
  description,
  layout = "grid",
}: {
  entityType: string;
  entityId:   string;
  actor?:     string;
  readonly?:  boolean;
  maxItems?: number;
  maxSizeBytes?: number;
  imageOnly?: boolean;
  title?: string;
  description?: string;
  /** "grid" (เริ่มต้น) = กริดเต็มความกว้าง · "gallery" = รูปย่อฝั่งซ้าย + พรีวิวใหญ่ฝั่งขวา */
  layout?: "grid" | "gallery";
}) {
  const [items,   setItems]   = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxSizeMb = Math.round((maxSizeBytes / 1024 / 1024) * 10) / 10;
  const atMaxItems = maxItems > 0 && items.length >= maxItems;
  const [pickerOpen, setPickerOpen] = useState(false);   // เลือกไฟล์จากคลังกลาง

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`);
      const json: AttachmentsResponse = await res.json();
      setItems(json.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // gallery: รูปที่โชว์ใหญ่ฝั่งขวา = รูปหลัก (หรือรูปแรก) · คงไว้ถ้าตัวที่เลือกยังอยู่
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (items.length === 0) { setSelectedId(null); return; }
    setSelectedId((cur) => (cur && items.some((a) => a.id === cur)) ? cur : (items.find((a) => a.is_primary)?.id ?? items[0].id));
  }, [items]);

  // ----- Lightbox (ดูรูปเต็มจอ) — กดรูปเล็ก/รูปใหญ่เพื่อขยาย, ←→ เลื่อน, Esc ปิด -----
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const imageItems = items.filter((a) => isImage(a.content_type));
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const lbIndex = imageItems.findIndex((a) => a.id === lightboxId);
  const lbImage = lbIndex >= 0 ? imageItems[lbIndex] : null;
  const openLightbox = (id: string) => setLightboxId(id);
  const lbStep = useCallback((d: number) => {
    setLightboxId((cur) => {
      const idx = imageItems.findIndex((a) => a.id === cur);
      if (idx < 0 || imageItems.length === 0) return cur;
      return imageItems[(idx + d + imageItems.length) % imageItems.length].id;
    });
  }, [imageItems]);
  useEffect(() => {
    if (!lbImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxId(null);
      else if (e.key === "ArrowLeft") lbStep(-1);
      else if (e.key === "ArrowRight") lbStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lbImage, lbStep]);

  const upload = useCallback(async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;
    if (maxItems > 0 && items.length + incoming.length > maxItems) {
      setError(`เพิ่มได้สูงสุด ${maxItems} รูป`);
      return;
    }
    const wrongType = imageOnly ? incoming.find(file => !(file.type || "").startsWith("image/")) : null;
    if (wrongType) {
      setError("รับเฉพาะไฟล์รูปภาพเท่านั้น");
      return;
    }
    setUploading(true); setError(null);
    try {
      for (const orig of incoming) {
        // ย่อรูป "ด้านกว้าง ≤ 1200px" ตอนอัป (คงสัดส่วน · เฉพาะรูป) — ไฟล์อื่นคงเดิม · เช็กขนาดหลังย่อ
        const file = imageOnly ? await downscaleImageWidth(orig, 1200) : orig;
        if (file.size > maxSizeBytes) { setError(`ไฟล์ ${orig.name} ใหญ่เกิน ${maxSizeMb}MB (แม้ย่อแล้ว)`); continue; }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", entityType);
        fd.append("entity_id", entityId);
        if (actor) fd.append("actor", actor);
        if (imageOnly) {
          fd.append("attachment_kind", "image_gallery");
          fd.append("image_only", "1");
        }
        if (maxItems > 0) fd.append("max_items", String(maxItems));
        fd.append("max_size_bytes", String(maxSizeBytes));
        const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
      }
      await fetchList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally { setUploading(false); }
  }, [entityType, entityId, actor, fetchList, imageOnly, items.length, maxItems, maxSizeBytes, maxSizeMb]);

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

  // ลากเรียงลำดับรูป (โหมด gallery) — optimistic แล้วยิงเก็บ sort_order
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const saveOrder = async (orderedIds: string[]) => {
    try { await apiFetch("/api/attachments/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_type: entityType, entity_id: entityId, ordered_ids: orderedIds }) }); }
    catch { /* ignore */ }
  };
  const dropReorder = (toIdx: number) => {
    const from = dragIdx.current; dragIdx.current = null; setOverIdx(null);
    if (from == null || from === toIdx) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(toIdx, 0, m);
    setItems(next);
    void saveOrder(next.map((a) => a.id));
  };

  // แนบไฟล์เดิมจากคลังกลาง (ไม่อัปซ้ำ)
  const attachFromLibrary = async (assets: { id: string }[]) => {
    if (assets.length === 0) return;
    if (maxItems > 0 && items.length + assets.length > maxItems) { setError(`เพิ่มได้สูงสุด ${maxItems} รูป`); return; }
    setUploading(true); setError(null);
    try {
      const res = await apiFetch("/api/attachments/from-library", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, asset_ids: assets.map((a) => a.id), actor }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      await fetchList();
    } catch (err) { setError(err instanceof Error ? err.message : "แนบจากคลังไม่สำเร็จ"); }
    finally { setUploading(false); }
  };

  const selected = items.find((a) => a.id === selectedId) ?? null;

  // รูปย่อ 1 ใบ (ใช้ทั้งกริดและแกลเลอรี) — pickable=true → กดเลือกมาโชว์ใหญ่ฝั่งขวา (โหมด gallery)
  const renderTile = (a: Attachment, pickable: boolean) => (
    <div key={a.id} onClick={pickable ? () => { setSelectedId(a.id); if (isImage(a.content_type)) openLightbox(a.id); } : undefined}
      title={pickable && isImage(a.content_type) ? "กดเพื่อดูเต็มจอ" : undefined}
      className={`relative group aspect-square rounded-lg overflow-hidden border bg-slate-50 ${pickable ? "cursor-pointer" : ""} ${pickable && selectedId === a.id ? "border-blue-500 ring-2 ring-blue-300" : "border-slate-200"}`}>
      {isImage(a.content_type) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.public_url} alt={a.file_name} className="w-full h-full object-cover" />
      ) : (
        <a href={a.public_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="w-full h-full flex flex-col items-center justify-center text-slate-400 hover:text-slate-600">
          <span className="text-2xl">📄</span>
          <span className="text-[10px] px-1 truncate max-w-full">{a.file_name}</span>
        </a>
      )}
      {a.is_primary && (
        <span className="absolute top-1 left-1 text-[10px] bg-blue-600 text-white px-1.5 rounded-full">หลัก</span>
      )}
      {!readonly && (
        <div onClick={(e) => e.stopPropagation()} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          {isImage(a.content_type) && (
            <ImageMarkupButton sourceUrl={a.public_url} fileName={a.file_name} entityType={entityType} entityId={entityId} actor={actor} onSaved={fetchList}
              triggerClassName="h-7 w-7 flex items-center justify-center bg-white rounded-full text-xs hover:bg-blue-50 text-blue-600" />
          )}
          {!a.is_primary && (
            <button onClick={() => setPrimary(a.id)} title="ตั้งเป็นรูปหลัก"
              className="h-7 w-7 flex items-center justify-center bg-white rounded-full text-xs hover:bg-blue-50">⭐</button>
          )}
          <button onClick={() => remove(a.id)} title="ลบ"
            className="h-7 w-7 flex items-center justify-center bg-white rounded-full text-xs hover:bg-red-50 text-red-600">🗑</button>
        </div>
      )}
    </div>
  );

  // กล่องลากวาง/อัปโหลด (compact = ใช้ในคอลัมน์ซ้ายของแกลเลอรี ให้เล็กลง)
  const renderUpload = (compact: boolean) => !readonly && (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!atMaxItems && e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      onClick={() => { if (!atMaxItems) fileRef.current?.click(); }}
      className={`image-manager-upload ${imageOnly ? "image-only-upload [&>p]:hidden" : ""} border-2 border-dashed rounded-lg ${compact ? "p-3" : "p-4"} text-center transition-colors ${
        atMaxItems ? "border-slate-200 bg-slate-50 cursor-not-allowed" : dragging ? "border-blue-400 bg-blue-50 cursor-pointer" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer"
      }`}
    >
      <input ref={fileRef} type="file" accept={imageOnly ? "image/*" : "image/*,application/pdf"} multiple className="hidden"
        onChange={e => { if (e.target.files?.length) upload(e.target.files); }} />
      {uploading ? (
        <p className="text-sm text-blue-600">⏳ กำลังอัปโหลด...</p>
      ) : atMaxItems ? (
        <p className="text-sm text-slate-500">ครบ {maxItems} รูปแล้ว</p>
      ) : (
        <>
          {imageOnly && (
            <div>
              <p className={`${compact ? "text-xs" : "text-sm"} text-slate-600`}>{dragging ? "วางรูปที่นี่" : compact ? "ลาก/คลิก/Ctrl+V" : "ลากรูปมาวาง · คลิกเลือก · หรือกด Ctrl+V"}</p>
              {!compact && <p className="text-xs text-slate-400 mt-0.5">รับเฉพาะรูปภาพ · ไม่เกิน {maxSizeMb}MB/รูป</p>}
            </div>
          )}
          <p className={`${compact ? "text-xs" : "text-sm"} text-slate-600`}>{dragging ? "วางไฟล์ที่นี่" : compact ? "＋ ลาก/คลิก/Ctrl+V" : "ลากรูป/ไฟล์มาวาง · คลิกเลือก · หรือชี้ที่กล่องนี้แล้วกด Ctrl+V"}</p>
          {!compact && <p className="text-xs text-slate-400 mt-0.5">รูปภาพ หรือ PDF · ไม่เกิน 10MB</p>}
        </>
      )}
    </div>
  );

  const libraryBtn = !readonly && !atMaxItems && (
    <button type="button" onClick={() => setPickerOpen(true)} disabled={uploading}
      className="mt-2 h-8 px-3 text-xs font-medium border border-indigo-200 rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">📁 เลือกจากคลังไฟล์กลาง</button>
  );

  return (
    <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {title ?? (imageOnly ? "รูปภาพ" : "รูปภาพ & ไฟล์แนบ")} {maxItems > 0 ? `(${items.length}/${maxItems})` : items.length > 0 ? `(${items.length})` : ""}
          </p>
          {description && <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>}
        </div>
        {imageOnly && <span className="text-[11px] text-slate-400 whitespace-nowrap">ไม่เกิน {maxSizeMb}MB/รูป</span>}
      </div>
      <div className="hidden">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">รูปภาพ & ไฟล์แนบ {items.length > 0 && `(${items.length})`}</p>
      </div>

      {error && <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠️ {error}</div>}

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0,1,2].map(i => <div key={i} className="aspect-square bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : layout === "gallery" ? (
        // แกลเลอรีแนวตั้ง (เหมาะกับคอลัมน์แคบ): พรีวิวรูปใหญ่ด้านบน + รูปย่อด้านล่าง
        <div className="space-y-2">
          <div className="w-full min-h-[220px] rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
            {selected ? (
              isImage(selected.content_type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={withImageWidth(selected.public_url, 1024) ?? selected.public_url} alt={selected.file_name}
                  onClick={() => openLightbox(selected.id)} title="กดเพื่อดูเต็มจอ"
                  className="max-w-full max-h-[340px] object-contain cursor-zoom-in" />
              ) : (
                <a href={selected.public_url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 text-slate-500 hover:text-slate-700 py-6">
                  <span className="text-5xl">📄</span><span className="text-sm px-3 text-center break-all">{selected.file_name}</span>
                  <span className="text-xs text-blue-600 underline">เปิดไฟล์</span>
                </a>
              )
            ) : <span className="text-sm text-slate-300 py-10">{readonly ? "ไม่มีรูป" : "ยังไม่มีรูป — ลากมาวางด้านล่าง"}</span>}
          </div>
          {items.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {items.map((a, idx) => (
                <div key={a.id}
                  draggable={!readonly}
                  onDragStart={() => { dragIdx.current = idx; }}
                  onDragOver={(e) => { if (!readonly) { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); } }}
                  onDrop={(e) => { e.preventDefault(); dropReorder(idx); }}
                  onDragEnd={() => { dragIdx.current = null; setOverIdx(null); }}
                  className={`${!readonly ? "cursor-grab active:cursor-grabbing" : ""} ${overIdx === idx ? "ring-2 ring-blue-400 rounded-lg" : ""}`}>
                  {renderTile(a, true)}
                </div>
              ))}
            </div>
          )}
          {!readonly && items.length > 1 && <p className="text-[10px] text-slate-400 -mt-1">ลากรูปย่อยเพื่อจัดลำดับ · กด ⭐ ตั้งรูปหลัก</p>}
          {renderUpload(false)}
          {libraryBtn}
        </div>
      ) : (
        // กริด (เริ่มต้น)
        <>
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">{items.map(a => renderTile(a, false))}</div>
          )}
          {renderUpload(false)}
          {libraryBtn}
        </>
      )}

      {!readonly && (
        <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} multiple
          typeFilter={imageOnly ? "image" : undefined}
          title="เลือกไฟล์จากคลังกลาง"
          onSelect={(assets) => { setPickerOpen(false); void attachFromLibrary(assets); }} />
      )}

      {readonly && items.length === 0 && <p className="text-sm text-slate-400 text-center py-3">ไม่มีไฟล์แนบ</p>}

      {/* Lightbox: ดูรูปเต็มจอ (กดรูปเล็ก/รูปใหญ่เพื่อขยาย) */}
      {mounted && lbImage && createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center select-none"
          onClick={() => setLightboxId(null)}>
          <button onClick={() => setLightboxId(null)} title="ปิด (Esc)"
            className="absolute top-3 right-3 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white text-xl">✕</button>
          {imageItems.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); lbStep(-1); }} title="ก่อนหน้า (←)"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl">‹</button>
              <button onClick={(e) => { e.stopPropagation(); lbStep(1); }} title="ถัดไป (→)"
                className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl">›</button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-xs bg-white/10 px-2.5 py-1 rounded-full">{lbIndex + 1} / {imageItems.length}</span>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(lbImage.public_url, 1920) ?? lbImage.public_url} alt={lbImage.file_name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[94vw] max-h-[92vh] object-contain rounded shadow-2xl" />
          <span className="absolute bottom-4 right-4 text-white/60 text-[11px] truncate max-w-[40vw]">{lbImage.file_name}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}
