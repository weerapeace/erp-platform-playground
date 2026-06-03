"use client";

/**
 * AttachmentPanel — ของกลางสำหรับแนบไฟล์ (N)
 *
 * **Rule**: ทุก module ที่ต้องแนบไฟล์ใช้ component นี้ — ห้ามเขียน upload เอง
 *
 * ผูกกับ entity ใดก็ได้ผ่าน entity_type + entity_id
 *   <AttachmentPanel entityType="purchase_request" entityId={pr.id} />
 *
 * Backend (มีอยู่แล้ว): /api/attachments
 *   GET   ?entity_type&entity_id   → list
 *   POST  (multipart)              → upload ไป R2 + บันทึก metadata
 *   DELETE /[id]                   → ลบไฟล์ + metadata
 *   PATCH  /[id] (set primary)
 *
 * Permission: attachments.view / attachments.upload / attachments.delete
 * Audit: ทำที่ฝั่ง RPC แล้ว
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Attachment } from "@/app/api/attachments/route";

const MAX_MB = 10;

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(ct: string | null, name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ct?.startsWith("image/")) return "🖼️";
  if (ct === "application/pdf" || ext === "pdf") return "📕";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  return "📎";
}

const isImage = (a: Attachment) => (a.content_type ?? "").startsWith("image/");

export function AttachmentPanel({
  entityType, entityId, title = "ไฟล์แนบ", compact = false,
}: {
  entityType: string;
  entityId: string;
  title?: string;
  compact?: boolean;
}) {
  const { can, user } = useAuth();
  const canView   = can("attachments.view");
  const canUpload = can("attachments.upload");
  const canDelete = can("attachments.delete");

  const [items,   setItems]   = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems((json.data ?? []) as Attachment[]);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไฟล์ไม่ได้"); }
    finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { if (canView && entityId) load(); }, [canView, entityId, load]);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!canUpload) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`"${file.name}" ใหญ่เกิน ${MAX_MB}MB`);
        continue;
      }
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", entityType);
        fd.append("entity_id", entityId);
        if (user?.name) fd.append("actor", user.name);
        const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
      } finally { setBusy(false); }
    }
    await load();
  };

  const remove = async (a: Attachment) => {
    if (!canDelete) return;
    if (!confirm(`ลบไฟล์ "${a.file_name}" ?`)) return;
    setBusy(true); setError(null);
    try {
      const res = await apiFetch(`/api/attachments/${a.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const setPrimary = async (a: Attachment) => {
    if (!canUpload || a.is_primary) return;
    setBusy(true);
    try {
      await apiFetch(`/api/attachments/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true, actor: user?.name }),
      });
      await load();
    } finally { setBusy(false); }
  };

  if (!canView) {
    return <div className="text-xs text-slate-400">คุณไม่มีสิทธิ์ดูไฟล์แนบ</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title} {items.length > 0 && <span className="text-xs font-normal text-slate-400">({items.length})</span>}</h3>
        {busy && <span className="text-xs text-slate-400">กำลังทำงาน...</span>}
      </div>

      {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {error}</div>}

      {/* dropzone */}
      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-4 ${compact ? "py-3" : "py-5"} text-center cursor-pointer transition-colors ${
            dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          }`}>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ""; }} />
          <div className="text-2xl mb-1">📎</div>
          <div className="text-xs text-slate-500">
            ลากไฟล์มาวาง หรือ <span className="text-blue-600 font-medium">คลิกเพื่อเลือก</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">สูงสุด {MAX_MB}MB ต่อไฟล์</div>
        </div>
      )}

      {/* list */}
      {loading ? (
        <div className="space-y-1.5">{[0,1].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        !canUpload && <div className="text-xs text-slate-400 text-center py-3">ยังไม่มีไฟล์แนบ</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(a => (
            <div key={a.id} className="flex items-center gap-2.5 px-2.5 py-2 bg-white border border-slate-200 rounded-lg">
              {isImage(a) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.public_url} alt={a.file_name} className="w-9 h-9 rounded object-cover flex-shrink-0 bg-slate-100" />
              ) : (
                <span className="w-9 h-9 flex items-center justify-center text-lg bg-slate-50 rounded flex-shrink-0">{fileIcon(a.content_type, a.file_name)}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <a href={a.public_url} target="_blank" rel="noreferrer" className="text-sm text-slate-700 hover:text-blue-600 truncate" onClick={(e) => e.stopPropagation()}>
                    {a.file_name}
                  </a>
                  {a.is_primary && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 rounded-full flex-shrink-0">★ หลัก</span>}
                </div>
                <div className="text-[10px] text-slate-400">{fmtSize(a.size_bytes)}{a.uploaded_by && ` · ${a.uploaded_by}`}</div>
              </div>
              {/* set primary (images only) */}
              {isImage(a) && canUpload && !a.is_primary && (
                <button onClick={() => setPrimary(a)} title="ตั้งเป็นรูปหลัก"
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-slate-300 hover:text-amber-400 rounded">☆</button>
              )}
              <a href={a.public_url} target="_blank" rel="noreferrer" download title="ดาวน์โหลด"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">⬇</a>
              {canDelete && (
                <button onClick={() => remove(a)} title="ลบ"
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">🗑</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
