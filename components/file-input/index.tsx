"use client";

/**
 * FileInput — อัปโหลดไฟล์แนบกลาง (ของกลาง) รองรับทั้งรูปภาพและ PDF
 * ค่า value = ที่อยู่ไฟล์กลาง (ref · lib/file-ref): R2 key เดิม หรือ "sb:erp-files/…" (Supabase ส่วนตัว)
 * - ส่ง category (หมวดในกฎที่เก็บไฟล์ เช่น "supplier_bills") → ระบบเลือกที่เก็บตามกฎ (lib/file-upload) · folder = โฟลเดอร์ R2 ถ้ากฎตั้งเป็น R2
 * - ไม่ส่ง category → ทางเดิม /api/admin/upload (R2)
 * - รูป → โชว์ thumbnail · PDF → โชว์ไอคอน 📄 + ปุ่มเปิดดู (ไฟล์ส่วนตัวขอลิงก์ชั่วคราวให้เอง — components/file-ref)
 * ใช้แนบเอกสาร เช่น ใบรับของ, บิล/ใบเสร็จ, สัญญา ฯลฯ
 */
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useFileUploadAccess } from "@/components/upload-permission";
import { uploadFileByRule } from "@/lib/file-upload";
import { useFileRefUrl } from "@/components/file-ref";
import { fileRefName, isPdfRef } from "@/lib/file-ref";

export function FileInput({
  value, onChange, folder = "uploads", category, required, disabled, hasError, label,
}: {
  value: string | null;
  onChange: (ref: string | null) => void;
  folder?: string;
  /** หมวดในกฎที่เก็บไฟล์ (/master/storage-rules) — ส่ง = ทำตามกฎ */
  category?: string;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadDisabled, uploadDeniedMessage } = useFileUploadAccess(disabled);
  const viewUrl = useFileRefUrl(value);

  const handleFile = async (file: File) => {
    if (uploadDisabled) { setErr(uploadDeniedMessage ?? "ไม่สามารถอัปโหลดไฟล์ได้"); return; }
    setErr(null); setUploading(true);
    try {
      if (category) { onChange(await uploadFileByRule({ category, file, r2Folder: folder })); return; }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) { setErr(json.error); return; }
      onChange(json.r2_key);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const pdf = isPdfRef(value);

  return (
    <div>
      {label && <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <div className={`mt-0.5 rounded-md border-2 border-dashed transition-colors ${hasError ? "border-red-300" : "border-slate-200 hover:border-orange-300"} ${uploadDisabled ? "opacity-50" : ""}`}>
        {value ? (
          <div className="relative p-2">
            {viewUrl === undefined ? (
              <div className="h-20 flex items-center justify-center text-xs text-slate-400">กำลังโหลดไฟล์…</div>
            ) : viewUrl === null ? (
              <div className="h-20 flex items-center justify-center text-xs text-slate-500">แนบไฟล์แล้ว · เปิดดูไม่ได้ (ไม่มีสิทธิ์ดูไฟล์นี้)</div>
            ) : pdf ? (
              <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-3 text-sm text-slate-700 hover:text-blue-700">
                <span className="text-2xl">📄</span>
                <span className="flex-1 truncate">{fileRefName(value)}</span>
                <span className="text-xs text-blue-600">เปิดดู →</span>
              </a>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={viewUrl} alt="preview" className="w-full max-h-44 object-contain rounded bg-slate-50" />
            )}
            {!disabled && (
              <div className="absolute top-1 right-1 flex gap-1">
                <button type="button" onClick={() => { if (!uploadDisabled) fileRef.current?.click(); }} disabled={uploading || uploadDisabled}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded shadow hover:bg-slate-50 disabled:opacity-50">เปลี่ยน</button>
                <button type="button" onClick={() => onChange(null)} disabled={uploading}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 text-red-600 rounded shadow hover:bg-red-50 disabled:opacity-50">✕ ลบ</button>
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadDisabled || uploading}
            className="w-full h-20 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-orange-600">
            <span className="text-xl">📎</span>
            <span className="text-xs">{uploading ? "กำลังอัปโหลด..." : "คลิกเพื่อแนบไฟล์"}</span>
            <span className="text-[10px] text-slate-400">{category ? "รูป (JPG/PNG/WebP) หรือ PDF — เก็บตามกฎที่เก็บไฟล์" : "รูป (JPG/PNG/WebP) หรือ PDF — สูงสุด 10MB"}</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        disabled={uploadDisabled || uploading} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {err && <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>}
      {uploadDeniedMessage && <div className="mt-1 text-[11px] text-amber-700">{uploadDeniedMessage}</div>}
    </div>
  );
}
