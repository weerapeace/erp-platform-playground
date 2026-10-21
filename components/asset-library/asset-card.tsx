"use client";
// คลังไฟล์: การ์ดไฟล์ในกริด — แยกจาก index.tsx (Y1)
import { useState } from "react";
import { useT } from "@/components/i18n";
import { formatBytes } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { type AssetRow } from "@/app/api/assets/shared";
import { HoverPreview } from "@/components/hover-image";
import { VideoThumb } from "@/components/video-thumb";
import { isImage, TYPE_ICON, driveFolderNameOf } from "./asset-shared";

export function AssetCard({ a, selected, selectionMode, onToggle, onOpen, onSameFolder }: {
  a: AssetRow; selected: boolean; selectionMode: boolean; onToggle: () => void; onOpen: () => void; onSameFolder?: (id: string, label: string) => void;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  return (
    <div className={`group relative rounded-xl border overflow-hidden bg-white ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"}`}>
      {/* ในโหมดเลือก (มีของเลือกอยู่แล้ว): กล่องติ๊กใหญ่ขึ้น + โชว์ตลอด กดง่าย */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`absolute top-1.5 left-1.5 z-10 rounded-md border flex items-center justify-center ${selectionMode ? "w-7 h-7 text-sm" : "w-5 h-5 text-[11px]"} ${selected
          ? "bg-indigo-600 border-indigo-600 text-white" : selectionMode ? "bg-white border-slate-400 text-slate-300 shadow-sm" : "bg-white/90 border-slate-300 text-transparent group-hover:text-slate-300"}`}
      >✓</button>
      {/* ป้ายเตือน "ยังไม่ครบ" (เฉพาะ Artwork) — ไม่มีโฟลเดอร์ Drive / ยังไม่ใส่ขนาด */}
      {a.source === "artwork" && (
        <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
          {!/\/folders\//.test(a.master_url ?? "") && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">{t("📁 ไม่มีโฟลเดอร์", "📁 No folder")}</span>}
          {!a.sizes?.length && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">{t("📐 ไม่มีขนาด", "📐 No size")}</span>}
        </div>
      )}
      {/* งานพิมพ์: ป้ายประเภท (DTF/UV) + เตือนถ้ายังไม่มีไฟล์พิมพ์ */}
      {a.source === "print" && (
        <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
          {a.print_type && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700 border border-violet-200 shadow-sm">🖨 {a.print_type}</span>}
          {!/\/folders\//.test(a.master_url ?? "") && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">{t("⚠ ยังไม่มีไฟล์พิมพ์", "⚠ No print file")}</span>}
        </div>
      )}
      <button onClick={selectionMode ? (e) => { e.stopPropagation(); onToggle(); } : onOpen} className="block w-full text-left">
        <HoverPreview url={isImage(a) && !broken ? a.url : null} previewW={440}>
          {/* กรอบ 1:1 — รูปแสดงเต็มทั้งใบ (object-contain) ไม่ตัดขอบ/ตัวหนังสือ */}
          <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
            {isImage(a) && !broken ? (
              <img src={withImageWidth(a.url, 320) ?? a.url} alt={a.title} loading="lazy" onError={() => setBroken(true)}
                className="max-w-full max-h-full object-contain" />
            ) : a.asset_type === "video" ? (
              // 🎬 วิดีโอ: เฟรมแรก + ชี้แล้วเล่นเงียบ + ความยาวคลิป (ของกลาง VideoThumb)
              <VideoThumb url={a.url} className="w-full h-full" fit="contain" />
            ) : (
              <span className="text-3xl">{TYPE_ICON[a.asset_type]}</span>
            )}
          </div>
        </HoverPreview>
      </button>
      <div className="px-2 py-1.5 cursor-pointer" onClick={selectionMode ? () => onToggle() : onOpen}>
        <p className="text-[12px] font-medium text-slate-700 truncate">{a.title}</p>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-[10px] text-slate-400 truncate">
            {formatBytes(a.size_bytes)}
            {a.source === "print"
              ? (a.sizes?.length ? ` · ${a.sizes[0].w}×${a.sizes[0].h} ${a.sizes[0].unit}` : "")
              : a.usage_count > 0 ? ` · ${t("ใช้อยู่", "in use at")} ${a.usage_count} ${t("ที่", "places")}` : a.status === "active" ? t(" · ยังไม่ถูกใช้", " · not used yet") : ""}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/^https?:\/\//i.test(a.master_url ?? "") && (
              <a href={(a.master_url ?? "").trim()} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                title={t("เปิดโฟลเดอร์/ไฟล์ต้นฉบับบน Google Drive", "Open source folder/file on Google Drive")}
                className="text-[10px] text-emerald-600 hover:underline">↗ {/drive\.google\.com|\/folders\//i.test(a.master_url ?? "") ? "Drive" : t("เปิด", "Open")}</a>
            )}
            {onSameFolder && a.source === "artwork" && /\/folders\//.test(a.master_url ?? "") && (
              <button type="button" title={t("ดูรูปทั้งหมดในโฟลเดอร์ Drive เดียวกัน", "View all images in the same Drive folder")}
                onClick={(e) => { e.stopPropagation(); const m = (a.master_url ?? "").match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) onSameFolder(m[1], driveFolderNameOf(a)); }}
                className="text-[10px] text-indigo-600 hover:underline">{t("📁 โฟลเดอร์", "📁 Folder")}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
