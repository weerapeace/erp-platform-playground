"use client";

/**
 * ช่องเลือกสลิป / หลักฐานการจ่าย (ไม่บังคับ · รูปหรือ PDF ไฟล์เดียว) — ใช้ในป๊อป "จ่ายแล้ว" ของหน้ากระแสเงินสด
 * ตัวอัปโหลดจริงเป็นของกลาง uploadRecordFile (components/record-files) — ช่องนี้แค่เลือกไฟล์ + โชว์ความคืบหน้า
 */
import { UploadProgress } from "@/components/upload-progress";

export function SlipPicker({ file, onChange, busyLabel }: { file: File | null; onChange: (f: File | null) => void; busyLabel: string | null }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">แนบสลิป / หลักฐาน (ไม่บังคับ · รูปหรือ PDF)</label>
      {busyLabel && file ? (
        <UploadProgress name={file.name} size={file.size} pct={null} label={busyLabel} />
      ) : file ? (
        <div className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="flex-1 min-w-0 truncate">{file.name}</span>
          <span className="text-xs text-slate-400">{Math.round(file.size / 1024)} KB</span>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-slate-500 underline">เอาออก</button>
        </div>
      ) : (
        <input type="file" accept="image/*,application/pdf" onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:text-slate-700" />
      )}
    </div>
  );
}
