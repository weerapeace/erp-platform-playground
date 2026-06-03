"use client";

/**
 * FileMultiInput — อัปโหลดไฟล์แนบหลายไฟล์ (ของกลาง) รองรับรูปภาพ + PDF
 * เก็บ R2 object key เป็น array ในค่า value — ใช้ /api/admin/upload + /api/r2-image
 * - รูป → โชว์ thumbnail
 * - PDF → โชว์ไอคอน 📄
 * - กดเพิ่มได้หลายไฟล์ (เลือกทีละ/หลายไฟล์พร้อมกัน), ลบทีละไฟล์
 * ใช้แนบเอกสาร เช่น ใบรับของ, บิล/ใบเสร็จ, สลิป WeChat, สัญญา ฯลฯ
 */
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const isPdfKey = (k: string) => k.toLowerCase().endsWith(".pdf");
const urlOf = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}`;

export function FileMultiInput({
  value, onChange, folder = "uploads", disabled, label, max = 20,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  folder?: string;
  disabled?: boolean;
  label?: string;
  max?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keys = Array.isArray(value) ? value : [];

  const handleFiles = async (files: FileList) => {
    setErr(null); setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (keys.length + added.length >= max) { setErr(`แนบได้สูงสุด ${max} ไฟล์`); break; }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", folder);
        const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (json.error) { setErr(json.error); continue; }
        if (json.r2_key) added.push(json.r2_key);
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
        {keys.map((k, i) => (
          <div key={k + i} className="relative rounded-md border border-slate-200 overflow-hidden bg-slate-50">
            {isPdfKey(k) ? (
              <a href={urlOf(k)} target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center justify-center h-24 text-slate-600 hover:text-blue-700">
                <span className="text-3xl">📄</span>
                <span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span>
              </a>
            ) : (
              <a href={urlOf(k)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlOf(k)} alt="" className="w-full h-24 object-cover" />
              </a>
            )}
            {!disabled && (
              <button type="button" onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-white/90 border border-slate-200 text-red-600 rounded-full shadow text-xs">✕</button>
            )}
          </div>
        ))}
        {!disabled && keys.length < max && (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className={`h-24 flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 ${keys.length === 0 ? "col-span-3" : ""}`}>
            <span className="text-xl">📎</span>
            <span className="text-[11px]">{uploading ? "กำลังอัปโหลด..." : "เพิ่มไฟล์"}</span>
          </button>
        )}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">รูป (JPG/PNG/WebP) หรือ PDF — สูงสุด 10MB/ไฟล์ · แนบได้หลายไฟล์</div>
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        disabled={disabled || uploading} className="hidden"
        onChange={(e) => { const fs = e.target.files; if (fs && fs.length) handleFiles(fs); }} />
      {err && <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>}
    </div>
  );
}
