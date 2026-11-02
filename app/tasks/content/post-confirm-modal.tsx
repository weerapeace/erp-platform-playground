"use client";

// ป๊อปอัปยืนยันก่อนโพสต์ — ปลายทาง + พรีวิวแคปชั่น + เลือกรูป (หลายรูป) + โพสต์เลย / ตั้งคิวให้ระบบโพสต์ตามเวลา
// ใช้ ERPModal กลาง · ใช้ได้ทั้งโพสต์จริง (เชื่อม FB แล้ว) และโหมดมือ (คัดลอก+เปิดเพจ)
// ตั้งคิว = คิวโพสต์กลาง (lib/social-publish/queue) — ใช้ได้ทุกรูปแบบทั้ง FB/IG รวม Story (แอป FB/IG เองตั้งเวลา Story/IG ไม่ได้)

import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";
import { PlatformChip } from "../platform-chip";
import { FORMATS } from "./brand-platforms-modal";

export type PostImage = { key: string; label?: string | null; type?: "image" | "video" };

export function PostConfirmModal({
  platform, connected, pageName, captionText, images, defaultSelected, scheduledAtLocal, busy,
  format, onClose, onPublish, onQueue, onManual,
}: {
  platform: string;
  connected: boolean;              // เชื่อมแล้ว → โพสต์จริง · false → โหมดมือ
  pageName?: string | null;
  captionText: string;
  images: PostImage[];
  defaultSelected: string[];
  scheduledAtLocal: string;        // ค่า datetime-local ("" = ยังไม่ตั้งเวลา)
  format?: string;                 // รูปแบบโพสต์ที่ตั้งไว้ในการ์ด (แก้ตรงนี้ก่อนโพสต์ได้)
  busy: boolean;
  onClose: () => void;
  onPublish: (imageKeys: string[], scheduledUnix: number | null, format: string) => void;
  onQueue?: (imageKeys: string[], runAtLocal: string, format: string) => void;   // ตั้งคิวให้ระบบโพสต์ (ค่าเวลา YYYY-MM-DDTHH:mm เวลาเครื่อง)
  onManual: () => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<string[]>(defaultSelected);
  const [mode, setMode] = useState<"now" | "queue">("now");
  // เวลาคิว: ตั้งต้นจากเวลาโพสต์ของคอนเทนต์ (ถ้ายังไม่ผ่าน)
  const [runAt, setRunAt] = useState(() => (scheduledAtLocal && new Date(scheduledAtLocal).getTime() > Date.now() + 60_000 ? scheduledAtLocal : ""));
  const [fmt, setFmt] = useState(format ?? "");   // ประเภทโพสต์ (ว่าง = อัตโนมัติจากสื่อที่เลือก)
  const fmtOpts = FORMATS[platform] ?? [];
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // เรียงรูปที่เลือกตามลำดับที่แสดง
  const orderedSel = images.filter((im) => sel.includes(im.key)).map((im) => im.key);
  const selHasVideo = images.some((im) => sel.includes(im.key) && im.type === "video");
  const showQueue = connected && !!onQueue;
  const runAtMs = runAt ? new Date(runAt).getTime() : NaN;
  const runAtOk = Number.isFinite(runAtMs) && runAtMs - Date.now() >= 60_000;   // ≥ 1 นาทีล่วงหน้า

  const doPublish = () => (mode === "queue" ? onQueue?.(orderedSel, runAt, fmt) : onPublish(orderedSel, null, fmt));
  const storyBlocked = false;   // IG Story ใช้สิทธิ์เดียวกับโพสต์ IG แล้ว (ถ้า Meta ไม่ให้ จะเห็นข้อความจาก Meta ตอนกด)
  const storyNoMedia = connected && fmt === "story" && orderedSel.length === 0;   // Story ที่ลงแผนไว้ก่อน ยังไม่มีไฟล์ → ยิงไม่ได้

  return (
    <ERPModal open onClose={onClose} size="lg" title={`🚀 ${t("ยืนยันการโพสต์", "Confirm post")}`}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        {connected ? (
          <button onClick={doPublish} disabled={busy || storyBlocked || storyNoMedia || (mode === "queue" && !runAtOk)} className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? t("กำลังส่ง...", "Sending...") : mode === "queue" ? `⏰ ${t("ตั้งคิวโพสต์", "Queue post")}` : `🚀 ${t("โพสต์เลย", "Post now")}`}
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

        {/* ประเภทโพสต์ — เลือกก่อนยิงได้ (ค่าเริ่มต้นมาจากที่ตั้งในการ์ด/ค่าของแบรนด์) */}
        {fmtOpts.length > 0 && (
          <div>
            <p className="text-[11px] text-slate-400 mb-1">🎬 {t("ลงเป็น", "Post as")}</p>
            <div className="flex flex-wrap gap-1.5">
              {[{ key: "", th: "อัตโนมัติ", en: "Auto" }, ...fmtOpts].map((f) => (
                <button key={f.key || "auto"} type="button" onClick={() => setFmt(f.key)}
                  className={`px-2.5 py-1 rounded-full text-xs border ${fmt === f.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                  {t(f.th, f.en)}
                </button>
              ))}
            </div>
            {fmt === "story" && (
              <p className={`text-[11px] mt-1 ${storyBlocked ? "text-rose-600" : "text-slate-500"}`}>
                {storyBlocked
                  ? t("Instagram Story ยังยิงอัตโนมัติไม่ได้ (รอ Meta อนุมัติสิทธิ์) — กดยกเลิกแล้วลงเองในแอป", "IG story needs Meta approval — post manually for now")
                  : t("Story = ใช้สื่อ 1 ชิ้น · อยู่ 24 ชม. · ตั้งเวลาได้ด้วย “ตั้งคิวให้ระบบโพสต์”", "Story = 1 item, 24h · schedule it with the queue")}
              </p>
            )}
            {storyNoMedia && !storyBlocked && (
              <p className="text-[11px] mt-1 text-rose-600">
                {images.length === 0
                  ? t("Story นี้ยังไม่มีไฟล์ — ใส่รูปหรือวิดีโอที่การ์ด 🖼 รูป/วิดีโอ ก่อน แล้วค่อยกดโพสต์ (ลิงก์ธรรมดาโพสต์อัตโนมัติไม่ได้)", "This story has no file yet — add an image/video first (plain links can't be auto-posted)")
                  : t("เลือกรูปหรือวิดีโอ 1 ชิ้นด้านล่างก่อน แล้วค่อยกดโพสต์", "Select one image or video below first")}
              </p>
            )}
            {(fmt === "video" || fmt === "reels") && !selHasVideo && (
              <p className="text-[11px] text-amber-700 mt-1">{t("เลือกไฟล์วิดีโอในรายการด้านล่างก่อน", "Select a video below first")}</p>
            )}
          </div>
        )}

        {/* พรีวิวแคปชั่น */}
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ตัวอย่างที่จะโพสต์", "Preview")}</p>
          <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">{captionText || t("(ไม่มีแคปชั่น)", "(no caption)")}</pre>
        </div>

        {/* เลือกรูป/วิดีโอ (หลายรูป = อัลบั้ม) */}
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("เลือกรูป/วิดีโอที่จะลง", "Choose media")} — {t("เลือกแล้ว", "selected")} {sel.length}</p>
          {images.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{fmt === "story" ? t("ยังไม่มีรูป/วิดีโอ — Story ต้องมีไฟล์ 1 ชิ้น", "No media — a story needs one file") : t("ไม่มีรูป/วิดีโอ — จะโพสต์เป็นข้อความอย่างเดียว", "No media — text only")}</p>
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

        {/* เวลา: โพสต์เลย / ตั้งคิวให้ระบบโพสต์ (ทุกแพลตฟอร์มที่ยิงอัตโนมัติได้ · รวม Story) */}
        {showQueue && (
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("เวลาโพสต์", "Timing")}</p>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="radio" checked={mode === "now"} onChange={() => setMode("now")} /> {t("โพสต์เลย (ทันที)", "Post now")}</label>
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="radio" checked={mode === "queue"} onChange={() => setMode("queue")} /> {t("ตั้งคิวให้ระบบโพสต์ตามเวลา", "Queue — the system posts it on time")}</label>
              {mode === "queue" && (
                <div className="pl-6 space-y-1">
                  <ERPDateTime24 value={runAt} onChange={setRunAt} />
                  {runAt && !runAtOk && <p className="text-[11px] text-rose-500">{t("ต้องเป็นเวลาข้างหน้า (อย่างน้อย 1 นาที)", "Must be at least 1 minute ahead")}</p>}
                  <p className="text-[10px] text-slate-400">💡 {t("ระบบโพสต์ให้เองตามเวลา (ช้าได้ไม่เกิน ~5 นาที) ไม่ต้องเปิดเครื่องรอ · ใช้แคปชั่น/รูปตามที่เห็นตอนนี้ · ยกเลิก/ดูผลได้ที่กล่อง “คิวโพสต์อัตโนมัติ”", "Posts automatically on time (up to ~5 min late) · uses this caption/media · cancel or check in the Auto-post queue box")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}
