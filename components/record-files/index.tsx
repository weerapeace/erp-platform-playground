"use client";
/**
 * RecordFilesField — ช่อง "ไฟล์แนบ" ของกลาง (ใช้ได้ทุกโมดูลผ่าน MasterCRUD config `fileAttachments`)
 *   เก็บไฟล์ใน Supabase Storage (bucket record-files) · ทะเบียน erp_record_files · ผูก (entityType, entityId)
 *   ลบไฟล์ออกจากช่อง = ลบไฟล์จริง · ลบ record ถาวร = ลบไฟล์ตามไปด้วย (cascade ที่ฝั่ง API)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";

type RecordFile = {
  id: string; file_name: string; content_type: string | null; size_bytes: number | null;
  created_at: string; url: string | null;
};

const fmtBytes = (n: number | null) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// ไอคอนตามชนิดไฟล์
const iconOf = (f: RecordFile): string => {
  const ct = (f.content_type ?? "").toLowerCase();
  const ext = (f.file_name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "🖼";
  if (ct.includes("pdf") || ext === "pdf") return "📄";
  if (["ai", "psd", "eps", "sketch", "fig", "xd"].includes(ext)) return "🎨";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"].includes(ext)) return "📝";
  if (ct.startsWith("video/")) return "🎬";
  return "📎";
};

export function RecordFilesField({ entityType, entityId, actor, readonly, title, description, maxItems, maxSizeBytes }: {
  entityType: string; entityId: string; actor?: string; readonly?: boolean;
  title?: string; description?: string; maxItems?: number; maxSizeBytes?: number;
}) {
  const toast = useToast();
  const [files, setFiles] = useState<RecordFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [delTarget, setDelTarget] = useState<RecordFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxBytes = maxSizeBytes ?? 25 * 1024 * 1024;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/record-files?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
      const j = await r.json();
      setFiles((j.data ?? []) as RecordFile[]);
    } catch { /* เงียบ */ }
    finally { setLoading(false); }
  }, [entityType, entityId]);
  useEffect(() => { void load(); }, [load]);

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    if (maxItems && files.length + arr.length > maxItems) { toast.error(`แนบได้สูงสุด ${maxItems} ไฟล์`); return; }
    setBusy(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      setProg({ done: i, total: arr.length });
      if (f.size > maxBytes) { fail++; toast.error(`"${f.name}" ใหญ่เกิน ${Math.round(maxBytes / 1024 / 1024)}MB`); continue; }
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("entity_type", entityType);
        fd.append("entity_id", entityId);
        if (actor) fd.append("actor", actor);
        const res = await apiFetch("/api/record-files", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
        ok++;
      } catch (e) { fail++; toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    }
    setProg(null); setBusy(false);
    if (ok) toast.success(`แนบไฟล์แล้ว ${ok} ไฟล์${fail ? ` · ล้มเหลว ${fail}` : ""}`);
    await load();
  };

  const doDelete = async () => {
    if (!delTarget) return;
    const f = delTarget; setDelTarget(null); setBusy(true);
    try {
      const res = await apiFetch(`/api/record-files/${f.id}${actor ? `?actor=${encodeURIComponent(actor)}` : ""}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      setFiles((cur) => cur.filter((x) => x.id !== f.id));
      toast.success("ลบไฟล์แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const canAdd = !readonly && (!maxItems || files.length < maxItems);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-[13px] font-medium text-slate-700">📎 {title ?? "ไฟล์แนบ"} {files.length > 0 && <span className="text-slate-400 font-normal">({files.length}{maxItems ? `/${maxItems}` : ""})</span>}</p>
          {description && <p className="text-[11px] text-slate-400">{description}</p>}
        </div>
        {prog && <span className="text-[11px] text-indigo-600">⏳ กำลังอัป {prog.done + 1}/{prog.total}…</span>}
      </div>

      {loading ? (
        <p className="text-[12px] text-slate-400 py-3 text-center">กำลังโหลด…</p>
      ) : (
        <>
          {files.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <span className="text-lg shrink-0">{iconOf(f)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-slate-700 truncate">{f.file_name}</span>
                    <span className="block text-[10px] text-slate-400">{fmtBytes(f.size_bytes)}</span>
                  </span>
                  {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 hover:underline shrink-0" title="เปิด/ดาวน์โหลด">↗ เปิด</a>}
                  {!readonly && (
                    <button type="button" onClick={() => setDelTarget(f)} disabled={busy}
                      className="text-slate-400 hover:text-red-500 shrink-0 text-sm" title="ลบไฟล์">🗑</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canAdd && (
            <div
              onClick={() => !busy && inputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy && e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`cursor-pointer rounded-lg border border-dashed px-3 py-3 text-center text-[12px] ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40"} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
              {busy ? "กำลังอัป…" : "+ ลากไฟล์มาวาง หรือคลิกเลือก"}
              <input ref={inputRef} type="file" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
            </div>
          )}
          {files.length === 0 && readonly && <p className="text-[12px] text-slate-400 py-2 text-center">ยังไม่มีไฟล์แนบ</p>}
        </>
      )}

      {delTarget && (
        <ConfirmDialog open title="ลบไฟล์แนบ?" variant="danger" confirmText="ลบไฟล์"
          message={`ลบ "${delTarget.file_name}" ออกจากระบบถาวร (ลบไฟล์จริงใน Storage ด้วย) — ยืนยันไหม?`}
          onConfirm={doDelete} onClose={() => setDelTarget(null)} />
      )}
    </div>
  );
}
