"use client";

/** ชิ้นเล็กของหน้า Contents — ป้ายสถานะอัลบั้ม · ชิปสถานะต่อแพลตฟอร์ม · ภาพย่อไฟล์ (รูป/ภาพปกวิดีโอ/ไม่มีรูปย่อ) */
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { ALBUM_STAGE_META, ALBUM_PLAT_META, type AlbumStage, type AlbumPlatState } from "@/lib/content-album-status";

const STAGE_CLASS: Record<AlbumStage, string> = {
  manage: "bg-slate-100 text-slate-700 border-slate-200",
  caption: "bg-amber-50 text-amber-800 border-amber-200",
  ready: "bg-violet-50 text-violet-800 border-violet-200",
  posted: "bg-emerald-50 text-emerald-800 border-emerald-200",
  closed: "bg-slate-50 text-slate-400 border-slate-200",
};
const PLAT_CLASS: Record<AlbumPlatState, string> = {
  manage: "bg-slate-50 text-slate-500 border-slate-200",
  caption: "bg-amber-50 text-amber-800 border-amber-200",
  ready: "bg-violet-50 text-violet-700 border-violet-200",
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  posted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function StageBadge({ stage, className = "" }: { stage: AlbumStage; className?: string }) {
  const t = useT();
  const m = ALBUM_STAGE_META[stage];
  return <span className={`inline-flex items-center h-6 px-2 rounded-full border text-xs font-medium whitespace-nowrap ${STAGE_CLASS[stage]} ${className}`}>{t(m.th, m.en)}</span>;
}

export function PlatChip({ code, state, label, iconKey, compact = false }: { code: string; state: AlbumPlatState; label?: string; iconKey?: string | null; compact?: boolean }) {
  const t = useT();
  const m = ALBUM_PLAT_META[state];
  const text = t(m.th, m.en);
  return (
    <span title={`${label ?? code} · ${text}`} className={`inline-flex items-center gap-1 h-6 rounded-full border text-[11px] font-medium whitespace-nowrap ${compact ? "px-1.5" : "px-2"} ${PLAT_CLASS[state]}`}>
      <PlatformIcon code={code} iconKey={iconKey} size={13} />
      {compact ? (state === "posted" ? <Icon name="done" size={12} /> : null) : text}
    </span>
  );
}

const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** ภาพย่อไฟล์ในอัลบั้ม — รูปย่อ/ภาพปกจาก R2 · ไม่มีภาพปก (drive:) วิดีโอ = ไอคอน · รูป = ย่อจาก Drive */
export function FileThumb({ r2Key, type, duration, width = 360, className = "" }: { r2Key: string | null; type: string; duration?: number | null; width?: number; className?: string }) {
  const video = type === "video";
  const noPreview = !r2Key || (video && r2Key.startsWith("drive:"));
  return (
    <div className={`relative bg-slate-100 overflow-hidden ${className}`}>
      {noPreview ? (
        <div className="absolute inset-0 grid place-items-center text-slate-400"><Icon name={video ? "video" : "image"} size={28} /></div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r2ImageUrl(r2Key!, width) ?? ""} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {video && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 h-5 px-1.5 rounded bg-black/60 text-white text-[10px]">
          <Icon name="play" size={10} />{duration ? fmtDuration(duration) : ""}
        </span>
      )}
    </div>
  );
}
