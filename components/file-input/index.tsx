"use client";

/**
 * FileInput — อัปโหลดไฟล์แนบกลาง (ของกลาง) รองรับทั้งรูปภาพและ PDF
 * เก็บ R2 object key ในค่า value (เหมือน ImageInput) — ใช้ /api/admin/upload + /api/r2-image
 * - รูป → โชว์ thumbnail
 * - PDF → โชว์ไอคอน 📄 + ปุ่มเปิดดู
 * ใช้แนบเอกสาร เช่น ใบรับของ, บิล/ใบเสร็จ, สัญญา ฯลฯ
 */
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const isPdfKey = (k: string | null | undefined) => !!k && k.toLowerCase().endsWith(".pdf");
const urlOf = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}`;

export function FileInput({
  value, onChange, folder = "uploads", required, disabled, hasError, label,
}: {
  value: string | null;
  onChange: (r2_key: string | null) => void;
  folder?: string;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setErr(null); setUploading(true);
    try {
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

  const pdf = isPdfKey(value);

  return (
    <div>
      {label && <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <div className={`mt-0.5 rounded-md border-2 border-dashed transition-colors ${hasError ? "border-red-300" : "border-slate-200 hover:border-orange-300"} ${disabled ? "opacity-50" : ""}`}>
        {value ? (
          <div className="relative p-2">
            {pdf ? (
              <a href={urlOf(value)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-3 text-sm text-slate-700 hover:text-blue-700">
                <span className="text-2xl">📄</span>
                <span className="flex-1 truncate">{value.split("/").pop()}</span>
                <span className="text-xs text-blue-600">เปิดดู →</span>
              </a>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={urlOf(value)} alt="preview" className="w-full max-h-44 object-contain rounded bg-slate-50" />
            )}
            {!disabled && (
              <div className="absolute top-1 right-1 flex gap-1">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded shadow hover:bg-slate-50 disabled:opacity-50">เปลี่ยน</button>
                <button type="button" onClick={() => onChange(null)} disabled={uploading}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 text-red-600 rounded shadow hover:bg-red-50 disabled:opacity-50">✕ ลบ</button>
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || uploading}
            className="w-full h-20 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-orange-600">
            <span className="text-xl">📎</span>
            <span className="text-xs">{uploading ? "กำลังอัปโหลด..." : "คลิกเพื่อแนบไฟล์"}</span>
            <span className="text-[10px] text-slate-400">รูป (JPG/PNG/WebP) หรือ PDF — สูงสุด 10MB</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        disabled={disabled || uploading} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {err && <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>}
    </div>
  );
}
