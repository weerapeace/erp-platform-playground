"use client";

/**
 * UploadProgress — ของกลาง "กำลังอัปโหลด" ให้ผู้ใช้เห็นว่าไฟล์กำลังส่งอยู่ (ไม่ใช่ค้าง)
 * โชว์: ตัวหมุน + ขั้น (label) + รูปที่เท่าไร (count) + ชื่อไฟล์/ขนาด + แถบ % (รู้ %) หรือแถบกระพริบ (ไม่รู้ %) + ปุ่มยกเลิก (ถ้าส่ง onCancel)
 *
 *   const [up, setUp] = useState<UploadProgressState | null>(null);
 *   setUp({ name: file.name, size: file.size, pct: null });
 *   await uploadFileByRule({ …, onProgress: (pct) => setUp((u) => u && { ...u, pct }) });
 *   {up && <UploadProgress {...up} onCancel={…} />}
 *
 * ตัวส่งที่รายงานให้: uploadFileByRule (lib/file-upload · % ต่อไฟล์) · uploadImagesWithDupCheck (components/duplicate-upload · onProgress ส่ง state นี้มาเลย)
 * ใช้ที่: FileInput · ImageAttach / ImageAttachKeys · แถวสี + รูปบนเว็บ (parent-web-listings) — docs/upload-progress.md
 */
import { Spinner } from "@/components/spinner";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { formatBytes } from "@/lib/assets";

export interface UploadProgressState {
  name: string;
  size?: number;
  /** 0–100 · null = ไม่รู้ % → แถบกระพริบ */
  pct: number | null;
  /** ขั้นที่กำลังทำ เช่น "กำลังย่อรูป" · ไม่ส่ง = "กำลังอัปโหลด" */
  label?: string;
  /** อัปหลายไฟล์: ไฟล์ที่กำลังทำ (เริ่ม 1) / ทั้งหมด */
  count?: { current: number; total: number };
}

/**
 * สถานะของงานอัปรูปหลายรูปทีละขั้น (ย่อรูป → ตรวจรูปซ้ำ → อัปโหลด) — ใช้กับตัวส่งที่ไม่รู้ % ต่อไฟล์
 * current เริ่ม 1 · หลายไฟล์ = % ตามจำนวนที่เสร็จ · ไฟล์เดียว / ขั้นตรวจซ้ำ = แถบกระพริบ
 */
export function imageStepProgress(step: "prepare" | "check" | "upload", file: File, current: number, total: number): UploadProgressState {
  const label = step === "prepare" ? tr("กำลังย่อรูป", "Resizing") : step === "check" ? tr("กำลังตรวจรูปซ้ำ", "Checking duplicates") : tr("กำลังอัปโหลด", "Uploading");
  if (step === "check") return { label, name: total > 1 ? tr(`${total} รูป`, `${total} images`) : file.name, pct: null };
  return { label, name: file.name, size: file.size, count: { current, total }, pct: total > 1 ? Math.round(((current - 1) / total) * 100) : null };
}

export function UploadProgress({ name, size, pct, label, count, onCancel, className = "" }: UploadProgressState & {
  onCancel?: () => void;
  className?: string;
}) {
  const t = useT();
  const status = pct == null ? t("รอสักครู่…", "Please wait…") : pct >= 100 ? t("กำลังบันทึก…", "Saving…") : `${pct}%`;
  return (
    <div role="status" aria-live="polite" className={`w-full flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
        <Spinner size={14} className="text-blue-600 shrink-0" />
        <span className="shrink-0 font-medium text-slate-700">{label ?? t("กำลังอัปโหลด", "Uploading")}</span>
        {count && count.total > 1 && <span className="shrink-0 tabular-nums text-slate-500">{t("รูป", "file")} {count.current}/{count.total}</span>}
        <span className="truncate text-slate-500" title={name}>{name}{size ? ` · ${formatBytes(size)}` : ""}</span>
        <span className="ml-auto shrink-0 tabular-nums font-semibold text-blue-700">{status}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        {pct == null
          ? <div className="h-full w-full bg-blue-400 animate-pulse" />
          : <div className="h-full bg-blue-600 transition-[width] duration-200" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />}
      </div>
      {onCancel && pct != null && pct < 100 && (
        <button type="button" onClick={onCancel} className="self-end text-[11px] text-slate-500 hover:text-red-600 underline-offset-2 hover:underline">
          {t("ยกเลิก", "Cancel")}
        </button>
      )}
    </div>
  );
}
