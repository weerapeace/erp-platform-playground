"use client";

/**
 * UploadProgress — ของกลาง "กำลังอัปโหลด" ให้ผู้ใช้เห็นว่าไฟล์กำลังส่งอยู่ (ไม่ใช่ค้าง)
 * โชว์: ตัวหมุน + ชื่อไฟล์/ขนาด + แถบ % (รู้ %) หรือแถบกระพริบ (ไม่รู้ %) + ปุ่มยกเลิก (ถ้าส่ง onCancel)
 *
 *   const [up, setUp] = useState<UploadProgressState | null>(null);
 *   setUp({ name: file.name, size: file.size, pct: null });
 *   await uploadFileByRule({ …, onProgress: (pct) => setUp((u) => u && { ...u, pct }) });
 *   {up && <UploadProgress {...up} onCancel={…} />}
 *
 * ใช้ที่: FileInput (ไฟล์แนบ/บิล) · ตัวส่งไฟล์ที่ให้ % ได้: uploadFileByRule (lib/file-upload) · uploadMediaFile (lib/media-upload)
 */
import { Spinner } from "@/components/spinner";
import { fileMb } from "@/lib/media-upload-limits";

export interface UploadProgressState {
  name: string;
  size?: number;
  /** 0–100 · null = ไม่รู้ % (เช่น ทางส่งผ่านเว็บ) → แถบกระพริบ */
  pct: number | null;
}

export function UploadProgress({ name, size, pct, onCancel, className = "" }: UploadProgressState & {
  onCancel?: () => void;
  className?: string;
}) {
  const status = pct == null ? "รอสักครู่…" : pct >= 100 ? "กำลังบันทึก…" : `${pct}%`;
  return (
    <div role="status" aria-live="polite" className={`w-full flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
        <Spinner size={14} className="text-blue-600 shrink-0" />
        <span className="shrink-0 font-medium text-slate-700">กำลังอัปโหลด</span>
        <span className="truncate text-slate-500" title={name}>{name}{size ? ` · ${fileMb(size)}` : ""}</span>
        <span className="ml-auto shrink-0 tabular-nums font-semibold text-blue-700">{status}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        {pct == null
          ? <div className="h-full w-full bg-blue-400 animate-pulse" />
          : <div className="h-full bg-blue-600 transition-[width] duration-200" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />}
      </div>
      {onCancel && pct != null && pct < 100 && (
        <button type="button" onClick={onCancel} className="self-end text-[11px] text-slate-500 hover:text-red-600 underline-offset-2 hover:underline">
          ยกเลิก
        </button>
      )}
    </div>
  );
}
