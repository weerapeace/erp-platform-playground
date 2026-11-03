"use client";

/**
 * กล่อง "อัลบั้มรอลง" ข้างปฏิทินคอนเทนต์ — อัลบั้ม Contents (คลังไฟล์) ที่ยังไม่ลงครบ
 * ลากอัลบั้มไปวางวัน = เปิดป๊อปสร้างโพสต์ (กลาง) พร้อมไฟล์ที่เลือก/แคปชั่นร่าง/แพลตฟอร์ม · มือถือ: กดช่องวัน → "หยิบจากอัลบั้ม"
 * ไม่มีสิทธิ์ดูคลังไฟล์ (assets.view) = กล่องไม่ขึ้น
 * ใช้ของกลาง: listContentAlbums / StageBadge / PlatChip / FileThumb (components/asset-library/contents)
 */
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { listContentAlbums, type ContentAlbum } from "@/components/asset-library/contents/api";
import { StageBadge, PlatChip, FileThumb } from "@/components/asset-library/contents/album-bits";

const WAITING = new Set(["manage", "caption", "ready"]);
export const albumLink = (id: string) => `/master/assets?source=contents&album=${id}`;

/** อัลบั้มที่ยังรอลง (มีไฟล์แล้ว · ไม่ปิด · ยังลงไม่ครบ) ของแบรนด์ที่กรองอยู่ */
export function useWaitingAlbums(brandFilter: string) {
  const [all, setAll] = useState<ContentAlbum[] | null>(null);
  const reload = useCallback(() => { listContentAlbums().then(setAll).catch(() => setAll(null)); }, []);
  useEffect(() => { reload(); }, [reload]);
  const albums = (all ?? []).filter((a) => a.file_count > 0 && WAITING.has(a.status.stage) && (brandFilter === "all" || a.brand_id === brandFilter));
  return { albums, available: all !== null, reload };
}

export function CalendarAlbumsBox({ albums, platformLabel, onDragStart, onDragEnd }: {
  albums: ContentAlbum[];
  platformLabel: (code: string) => string;
  onDragStart: (a: ContentAlbum) => void;
  onDragEnd: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <Icon name="library" />
        <span className="text-sm font-semibold text-slate-700">{t("อัลบั้มรอลง", "Albums to post")}</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{albums.length}</span>
        <span className={`text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}>▾</span>
      </button>
      {open && (
        <>
          <p className="text-[11px] text-slate-400 mt-1 mb-2">{t("ลากอัลบั้มไปวางวันที่จะโพสต์ = สร้างโพสต์ร่างพร้อมรูปในอัลบั้ม · กดชื่อ = เปิดอัลบั้ม", "Drag an album onto a day to draft a post with its files · click to open")}</p>
          {albums.length === 0 ? (
            <div className="text-center text-xs text-slate-300 py-4">{t("ไม่มีอัลบั้มรอลง", "No albums waiting")}</div>
          ) : (
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5">
              {albums.map((a) => (
                <div key={a.id} draggable onDragStart={() => onDragStart(a)} onDragEnd={onDragEnd}
                  className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center gap-2 cursor-grab hover:border-violet-300">
                  <span className="text-slate-300 shrink-0" title={t("ลากเพื่อลงวัน", "Drag to a day")}>⠿</span>
                  <FileThumb r2Key={a.cover_key} type="image" width={96} className="w-10 h-10 rounded shrink-0" />
                  <div className="min-w-0 flex-1">
                    <a href={albumLink(a.id)} target="_blank" rel="noreferrer" className="block text-xs font-medium text-slate-700 truncate hover:text-violet-700 hover:underline">{a.name}</a>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      <StageBadge stage={a.status.stage} className="!h-5 !text-[10px]" />
                      {a.status.platforms.slice(0, 4).map((p) => <PlatChip key={p.code} code={p.code} state={p.state} label={platformLabel(p.code)} compact />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
