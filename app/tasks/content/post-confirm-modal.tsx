"use client";

// ป๊อปอัปยืนยันก่อนโพสต์ — ปลายทาง + พรีวิวแคปชั่น + เลือกรูป (หลายรูป) + ตั้งเวลา (Facebook จัดคิวให้)
// ใช้ ERPModal กลาง · ใช้ได้ทั้งโพสต์จริง (เชื่อม FB แล้ว) และโหมดมือ (คัดลอก+เปิดเพจ)

import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";
import { PlatformChip } from "../platform-chip";

export type PostImage = { key: string; label?: string | null; type?: "image" | "video" };

export function PostConfirmModal({
  platform, connected, allowSchedule = true, pageName, captionText, images, defaultSelected, scheduledAtLocal, busy,
  onClose, onPublish, onManual,
}: {
  platform: string;
  connected: boolean;              // เชื่อมแล้ว → โพสต์จริง · false → โหมดมือ
  allowSchedule?: boolean;         // ตั้งเวลาได้ไหม (FB ได้ · IG ไม่ได้)
  pageName?: string | null;
  captionText: string;
  images: PostImage[];
  defaultSelected: string[];
  scheduledAtLocal: string;        // ค่า datetime-local ("" = ยังไม่ตั้งเวลา)
  busy: boolean;
  onClose: () => void;
  onPublish: (imageKeys: string[], scheduledUnix: number | null) => void;
  onManual: () => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<string[]>(defaultSelected);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // เรียงรูปที่เลือกตามลำดับที่แสดง
  const orderedSel = images.filter((im) => sel.includes(im.key)).map((im) => im.key);
  const selHasVideo = images.some((im) => sel.includes(im.key) && im.type === "video");
  const showSchedule = connected && allowSchedule;

  const schedUnix = scheduledAtLocal ? Math.floor(new Date(scheduledAtLocal).getTime() / 1000) : 0;
  const schedFuture = schedUnix > 0 && schedUnix * 1000 - Date.now() >= 10 * 60 * 1000;   // ≥ 10 นาทีล่วงหน้า

  const doPublish = () => onPublish(orderedSel, mode === "schedule" && schedFuture ? schedUnix : null);

  return (
    <ERPModal open onClose={onClose} size="lg" title={`🚀 ${t("ยืนยันการโพสต์", "Confirm post")}`}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        {connected ? (
          <button onClick={doPublish} disabled={busy || (mode === "schedule" && !schedFuture)} className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? t("กำลังส่ง...", "Sending...") : mode === "schedule" ? `⏰ ${t("ตั้งเวลาโพสต์", "Schedule")}` : `🚀 ${t("โพสต์เลย", "Post now")}`}
          </button>
        ) : (
          <button onClick={onManual} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">📤 {t("คัดลอก + เปิดเพจ", "Copy + open")}</button>
        )}
      </>}>
      <div className="space-y-4">
        {/* ปลายทาง */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-slate-500">{t("จะโพสต์ขึ้น", "Posting to")}:</span>
          <PlatformChip code={platform} />
          {connected && pageName
            ? <span className="text-slate-700">· {t("เพจ", "Page")} <b>{pageName}</b></span>
            : <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{t("โหมดมือ — ยังไม่เชื่อมต่อ", "manual — not connected")}</span>}
        </div>

        {/* พรีวิวแคปชั่น */}
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ตัวอย่างที่จะโพสต์", "Preview")}</p>
          <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">{captionText || t("(ไม่มีแคปชั่น)", "(no caption)")}</pre>
        </div>

        {/* เลือกรูป/วิดีโอ (หลายรูป = อัลบั้ม) */}
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("เลือกรูป/วิดีโอที่จะลง", "Choose media")} — {t("เลือกแล้ว", "selected")} {sel.length}</p>
          {images.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{t("ไม่มีรูป/วิดีโอ — จะโพสต์เป็นข้อความอย่างเดียว", "No media — text only")}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.map((im) => {
                const on = sel.includes(im.key);
                const isVid = im.type === "video";
                return (
                  <button key={im.key} type="button" onClick={() => toggle(im.key)} title={im.label ?? ""} className={`relative rounded-lg overflow-hidden border-2 h-20 ${on ? "border-blue-500" : "border-slate-200 opacity-70 hover:opacity-100"}`}>
                    {isVid ? (
                      <span className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white gap-0.5"><span className="text-lg">▶</span><span className="text-[9px] px-1 truncate max-w-full">{im.label ?? t("วิดีโอ", "video")}</span></span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r2ImageUrl(im.key, 200) ?? ""} alt="" className="w-full h-full object-cover" />
                    )}
                    {on && <span className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          {selHasVideo && <p className="text-[11px] text-amber-600 mt-1.5">🎬 {t("มีวิดีโอถูกเลือก — จะโพสต์เป็นวิดีโอ (รูปที่เลือกจะไม่ถูกใช้)", "A video is selected — it posts as a video (images ignored)")}{platform === "instagram" ? t(" · IG ลงเป็น Reels", " · IG posts as Reels") : ""}</p>}
        </div>

        {/* เวลา (FB โพสต์จริงเท่านั้น — IG ตั้งเวลาไม่ได้) */}
        {showSchedule ? (
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("เวลาโพสต์", "Timing")}</p>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="radio" checked={mode === "now"} onChange={() => setMode("now")} /> {t("โพสต์เลย (ทันที)", "Post now")}</label>
              <label className={`inline-flex items-center gap-2 ${schedUnix <= 0 ? "text-slate-300" : "cursor-pointer"}`}>
                <input type="radio" disabled={schedUnix <= 0} checked={mode === "schedule"} onChange={() => setMode("schedule")} />
                {schedUnix > 0 ? `${t("ตั้งเวลา", "Schedule")}: ${scheduledAtLocal.replace("T", " ")}` : t("ตั้งเวลา (ตั้งวันเวลาที่ช่อง 🗓 ก่อน)", "Schedule (set date/time in 🗓 first)")}
              </label>
              {mode === "schedule" && schedUnix > 0 && !schedFuture && <p className="text-[11px] text-rose-500">{t("ต้องตั้งล่วงหน้าอย่างน้อย 10 นาที", "Must be ≥10 minutes ahead")}</p>}
              <p className="text-[10px] text-slate-400">💡 {t("ถ้าตั้งเวลา Facebook จะจัดคิวโพสต์ให้เองตามเวลานั้น (ไม่ต้องเปิดเครื่องรอ)", "If scheduled, Facebook publishes it at that time for you")}</p>
            </div>
          </div>
        ) : connected && (
          <p className="text-[11px] text-slate-400">⏱ {t("Instagram โพสต์ทันทีเท่านั้น (ตั้งเวลายังไม่รองรับ)", "Instagram posts immediately (scheduling not supported)")}</p>
        )}
      </div>
    </ERPModal>
  );
}
