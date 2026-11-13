"use client";

/**
 * FileMultiInput — อัปโหลดไฟล์แนบหลายไฟล์ (ของกลาง) รองรับรูปภาพ + PDF
 * ค่า value = array ของ "ที่อยู่ไฟล์กลาง" (ref · lib/file-ref): R2 key เดิม หรือ "sb:erp-files/…" (Supabase ส่วนตัว)
 * - ส่ง category (หมวดในกฎที่เก็บไฟล์ เช่น "china_pay") → ระบบเลือกที่เก็บตามกฎ (lib/file-upload) · folder = โฟลเดอร์ R2 ถ้ากฎตั้งเป็น R2
 * - ไม่ส่ง category → ทางเดิม /api/admin/upload (R2 + ลงคลังไฟล์กลาง)
 * - รูป → โชว์ thumbnail · PDF → โชว์ไอคอน 📄 (ไฟล์ส่วนตัวขอลิงก์ชั่วคราวให้เอง — components/file-ref)
 * - กดเพิ่มได้หลายไฟล์ (เลือกทีละ/หลายไฟล์พร้อมกัน), ลบทีละไฟล์
 * ใช้แนบเอกสาร เช่น ใบรับของ, บิล/ใบเสร็จ, สลิป WeChat, สัญญา ฯลฯ
 * ตัวเลือกเสริม (ไม่ใส่ = พฤติกรรมเดิม):
 * - removable={false} → ซ่อนปุ่ม ✕ (เพิ่มได้อย่างเดียว เช่น หน้าดูรายละเอียดที่บันทึกทันทีเมื่อแนบ — กันลบพลาด)
 * - onPreview={(key, url) => …} → กดรูปแล้วเรียกฟังก์ชันนี้ (เช่น เปิด lightbox ของหน้า) แทนเปิดแท็บใหม่ · url = ลิงก์เปิดดูที่ได้แล้ว
 */
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useFileUploadAccess } from "@/components/upload-permission";
import { FileUploadError, uploadFileByRule } from "@/lib/file-upload";
import { useFileRefResolver } from "@/components/file-ref";
import { fileRefName, isPdfRef } from "@/lib/file-ref";

export function FileMultiInput({
  value, onChange, folder = "uploads", category, disabled, label, max = 20, removable = true, onPreview,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  folder?: string;
  /** หมวดในกฎที่เก็บไฟล์ (/master/storage-rules) — ส่ง = ทำตามกฎ */
  category?: string;
  disabled?: boolean;
  label?: string;
  max?: number;
  removable?: boolean;
  onPreview?: (key: string, url: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keys = Array.isArray(value) ? value : [];
  const { uploadDisabled, uploadDeniedMessage } = useFileUploadAccess(disabled);
  const urlOf = useFileRefResolver();

  const uploadOne = async (file: File): Promise<string | null> => {
    if (category) return uploadFileByRule({ category, file, r2Folder: folder });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);
    const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (json.error) { setErr(json.error); return null; }
    return json.r2_key ? String(json.r2_key) : null;
  };

  const handleFiles = async (files: FileList) => {
    if (uploadDisabled) { setErr(uploadDeniedMessage ?? "ไม่สามารถอัปโหลดไฟล์ได้"); return; }
    setErr(null); setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (keys.length + added.length >= max) { setErr(`แนบได้สูงสุด ${max} ไฟล์`); break; }
        try {
          const ref = await uploadOne(file);
          if (ref) added.push(ref);
        } catch (e) { if (!(e instanceof FileUploadError && e.aborted)) setErr(String((e as Error).message ?? e)); }
      }
      if (added.length) onChange([...keys, ...added]);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removeAt = (i: number) => onChange(keys.filter((_, idx) => idx !== i));

  return (
    <div>
      {label && <label className="text-xs font-medium text-slate-600">{label}</label>}
      <div className="mt-0.5 grid grid-cols-3 gap-2">
        {keys.map((k, i) => {
          const url = urlOf(k);
          return (
            <div key={k + i} className="relative rounded-md border border-slate-200 overflow-hidden bg-slate-50">
              {isPdfRef(k) ? (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center h-24 text-slate-600 hover:text-blue-700">
                  <span className="text-3xl">📄</span>
                  <span className="text-[10px] truncate w-full px-1 text-center">{fileRefName(k)}</span>
                </a>
              ) : !url ? (
                <div className="h-24 flex items-center justify-center text-[10px] text-slate-400">กำลังโหลด…</div>
              ) : onPreview ? (
                <button type="button" onClick={() => onPreview(k, url)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={url} alt="" className="w-full h-24 object-cover" />
                </button>
              ) : (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-24 object-cover" />
                </a>
              )}
              {!disabled && removable && (
                <button type="button" onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-white/90 border border-slate-200 text-red-600 rounded-full shadow text-xs">✕</button>
              )}
            </div>
          );
        })}
        {!disabled && keys.length < max && (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || uploadDisabled}
            className={`h-24 flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 ${keys.length === 0 ? "col-span-3" : ""}`}>
            <span className="text-xl">📎</span>
            <span className="text-[11px]">{uploading ? "กำลังอัปโหลด..." : "เพิ่มไฟล์"}</span>
          </button>
        )}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">{category ? "รูป (JPG/PNG/WebP) หรือ PDF — เก็บตามกฎที่เก็บไฟล์ · แนบได้หลายไฟล์" : "รูป (JPG/PNG/WebP) หรือ PDF — สูงสุด 10MB/ไฟล์ · แนบได้หลายไฟล์"}</div>
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        disabled={uploadDisabled || uploading} className="hidden"
        onChange={(e) => { const fs = e.target.files; if (fs && fs.length) handleFiles(fs); }} />
      {err && <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>}
      {uploadDeniedMessage && <div className="mt-1 text-[11px] text-amber-700">{uploadDeniedMessage}</div>}
    </div>
  );
}
