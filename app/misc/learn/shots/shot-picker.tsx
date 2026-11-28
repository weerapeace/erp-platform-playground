"use client";

/**
 * 🎬 เลือกช็อตจากคลัง Video Shot (ใช้ในป๊อปแก้บทเรียน → เติมลิงก์ + เริ่ม/จบ ให้ขั้นตอน)
 *   ค้นชื่อ/แท็ก · กรองตามชุดช็อต · แตะ = เลือก (คัดลอกค่าไปที่ขั้นตอน — แก้ช็อตในคลังทีหลัง ขั้นตอนไม่เปลี่ยนตาม)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { rangeText, SHOT_PLATFORMS, shotMatches, sizeLabel, youtubeThumb, type VideoShot } from "@/lib/video-shot";
import { useShots } from "./use-shots";

export function ShotPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (s: VideoShot) => void }) {
  const { shots, lists, loading, error, reload } = useShots(false);
  const [q, setQ] = useState("");
  const [listId, setListId] = useState("");
  const shown = useMemo(() => shots.filter((s) => (!listId || s.list_id === listId) && shotMatches(s, q)), [shots, listId, q]);

  return (
    <ERPModal open onClose={onClose} size="md" title="เลือกช็อตจากคลัง Video Shot">
      {loading ? <LoadingState rows={4} /> : error ? <ErrorState title="โหลดคลังช็อตไม่ได้" hint={error} onRetry={() => void reload()} /> : shots.length === 0 ? (
        <EmptyState icon={<Icon name="movie" />} title="คลังช็อตยังว่าง" hint="ไปที่แท็บ Video Shot ในศูนย์เรียนรู้ วางลิงก์คลิปแล้วตัดช่วงเก็บไว้ก่อน" />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นช็อต ชื่อ แท็ก" autoFocus className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[13px]" />
            {lists.length > 0 && (
              <select value={listId} onChange={(e) => setListId(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px]" aria-label="กรองชุดช็อต">
                <option value="">ทุกชุด</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
          </div>
          {shown.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-400">ไม่พบช็อตที่ตรงกับคำค้น</p> : (
            <div className="max-h-[55vh] space-y-1 overflow-y-auto">
              {shown.map((s) => {
                const th = s.thumb_url || (s.platform === "youtube" && s.video_id ? youtubeThumb(s.video_id) : null);
                return (
                  <button key={s.id} type="button" onClick={() => onPick(s)} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/50">
                    <span className="flex h-11 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800 text-white/80">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {th ? <img src={th} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <Icon name="player-play" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-800">{s.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">{SHOT_PLATFORMS[s.platform].label}{rangeText(s.start_sec, s.end_sec) ? ` · ${rangeText(s.start_sec, s.end_sec)}` : ""}{sizeLabel(s.shot_size) ? ` · ${sizeLabel(s.shot_size)}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-medium text-indigo-600">เลือก</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
