"use client";

/** ชิ้นเล็กของหน้า Contents — ป้ายสถานะอัลบั้ม · ชิปสถานะต่อแพลตฟอร์ม · ภาพย่อไฟล์ · ปุ่มเลือกไฟล์/โฟลเดอร์ */
import { useEffect, useRef } from "react";
import { r2ImageUrl } from "@/lib/r2-image";
import { typeFromName } from "@/lib/media-upload-limits";
import { filePathOf } from "@/components/file-drop";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { ALBUM_STAGE_META, ALBUM_PLAT_META, type AlbumStage, type AlbumPlatState } from "@/lib/content-album-status";

/** ชนิดไฟล์ที่อัลบั้มรับ (รูป/วิดีโอ) — บางเครื่องไม่บอกชนิด (HEIC/MP4) → เดาจากนามสกุล */
export const ALBUM_ACCEPT = ["image/", "video/"];
export const isAlbumMedia = (f: File) => {
  const t = f.type && f.type !== "application/octet-stream" ? f.type : typeFromName(f.name);
  return ALBUM_ACCEPT.some((p) => t.startsWith(p));
};
/** โฟลเดอร์ชั้นบนสุดของไฟล์ (ลากโฟลเดอร์/เลือกโฟลเดอร์) · ไฟล์เดี่ยว = "" */
export const topFolderOf = (f: File) => { const p = filePathOf(f); const i = p.indexOf("/"); return i > 0 ? p.slice(0, i) : ""; };

/** ปุ่ม "เลือกไฟล์" + "เลือกทั้งโฟลเดอร์" (ไล่ไฟล์ทุกชั้นในโฟลเดอร์) — ส่งเฉพาะรูป/วิดีโอ */
export function PickMediaButtons({ onFiles, className = "" }: { onFiles: (files: File[]) => void; className?: string }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  // webkitdirectory ไม่มีใน type ของ React → ตั้งผ่าน DOM
  useEffect(() => { dirRef.current?.setAttribute("webkitdirectory", ""); dirRef.current?.setAttribute("directory", ""); }, []);
  const take = (list: FileList | null) => { const fs = [...(list ?? [])].filter(isAlbumMedia); if (fs.length) onFiles(fs); };
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <input ref={dirRef} type="file" multiple className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"><Icon name="image" />{t("เลือกไฟล์", "Choose files")}</button>
      <button type="button" onClick={() => dirRef.current?.click()} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"><Icon name="folder" />{t("เลือกทั้งโฟลเดอร์", "Choose a folder")}</button>
    </span>
  );
}

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
