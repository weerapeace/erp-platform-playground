"use client";

// ป๊อปอัปยืนยันก่อนโพสต์ (แบบ ก.) — ซ้าย = ปลายทาง/รูปแบบ/เลือกรูป/เวลา · ขวา = ตัวอย่างหน้าตาโพสต์ (เปลี่ยนตามที่เลือกทันที) · จอแคบ = ตัวอย่างอยู่ใต้
// กดรูป = ดูเต็มจอ (ImageLightbox กลาง) · วงกลมมุมรูป = เลือก/ไม่เลือก (เลข = ลำดับในโพสต์) · เตือนสัดส่วนที่ Instagram ไม่รับ
// ใช้ ERPModal กลาง · โพสต์จริง (เชื่อมแล้ว) หรือโหมดมือ (คัดลอก+เปิดเพจ)
// ตั้งคิว = คิวโพสต์กลาง (lib/social-publish/queue) — ใช้ได้ทุกรูปแบบทั้ง FB/IG รวม Story
// สื่อที่ตัวอย่างโชว์ = กติกาเดียวกับตอนยิงจริง (normalizeMedia ใน lib/social-publish/rules)

import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { ImageLightbox } from "@/components/image-lightbox";
import { r2ImageUrl } from "@/lib/r2-image";
import { normalizeMedia } from "@/lib/social-publish/rules";
import { useT } from "@/components/i18n";
import { PlatformChip } from "../platform-chip";
import { FORMATS } from "./brand-platforms-modal";
import { PostMockup } from "./post-mockup";

export type PostImage = { key: string; label?: string | null; type?: "image" | "video" };

// สัดส่วนรูปฟีด Instagram ที่ยอมรับ: แนวตั้งสุด 4:5 (0.8) · แนวนอนสุด 1.91:1
const IG_MIN = 0.8, IG_MAX = 1.91;
const igRatioBad = (r: number | undefined) => r != null && (r < IG_MIN - 0.01 || r > IG_MAX + 0.01);
const ratioLabel = (r: number) => {
  const known: [number, string][] = [[1, "1:1"], [0.8, "4:5"], [0.75, "3:4"], [0.667, "2:3"], [0.5625, "9:16"], [1.333, "4:3"], [1.5, "3:2"], [1.778, "16:9"], [1.91, "1.91:1"]];
  const hit = known.find(([v]) => Math.abs(v - r) < 0.02);
  return hit ? hit[1] : r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
};
// วิดีโอเปิดดูในแท็บใหม่ (drive:<id> = วิดีโอบน Google Drive)
const videoUrl = (k: string) => (k.startsWith("drive:") ? `/api/drive-video/${encodeURIComponent(k.slice(6))}` : r2ImageUrl(k) ?? "#");

export function PostConfirmModal({
  platform, connected, pageName, avatarUrl, captionText, images, defaultSelected, scheduledAtLocal, busy,
  format, onClose, onPublish, onQueue, onManual,
}: {
  platform: string;
  connected: boolean;              // เชื่อมแล้ว → โพสต์จริง · false → โหมดมือ
  pageName?: string | null;
  avatarUrl?: string | null;       // โลโก้แบรนด์ (ตัวอย่างโพสต์)
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
  // ลำดับที่เลือก = ลำดับในโพสต์ (รูปแรก = รูปหลัก/ปก)
  const [sel, setSel] = useState<string[]>(() => defaultSelected.filter((k) => images.some((im) => im.key === k)));
  const [mode, setMode] = useState<"now" | "queue">("now");
  // เวลาคิว: ตั้งต้นจากเวลาโพสต์ของคอนเทนต์ (ถ้ายังไม่ผ่าน)
  const [runAt, setRunAt] = useState(() => (scheduledAtLocal && new Date(scheduledAtLocal).getTime() > Date.now() + 60_000 ? scheduledAtLocal : ""));
  const [fmt, setFmt] = useState(format ?? "");   // ประเภทโพสต์ (ว่าง = อัตโนมัติจากสื่อที่เลือก)
  const [ratios, setRatios] = useState<Record<string, number>>({});   // สัดส่วนจริงของรูป (วัดจากรูปย่อตอนโหลด)
  const [lb, setLb] = useState(-1);
  const fmtOpts = FORMATS[platform] ?? [];
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const typeOf = (k: string) => images.find((im) => im.key === k)?.type ?? "image";
  const selHasVideo = sel.some((k) => typeOf(k) === "video");
  const showQueue = connected && !!onQueue;
  const runAtMs = runAt ? new Date(runAt).getTime() : NaN;
  const runAtOk = Number.isFinite(runAtMs) && runAtMs - Date.now() >= 60_000;   // ≥ 1 นาทีล่วงหน้า

  // สื่อที่จะขึ้นจริง (กติกาเดียวกับตัวยิง) — อัตโนมัติ + มีวิดีโอ = โพสต์วิดีโอตัวแรก
  const chosen = sel.map((k) => ({ key: k, type: typeOf(k) }));
  const nm = normalizeMedia(fmt, chosen);
  const finalMedia = "error" in nm ? [] : (!fmt && nm.media.some((m) => m.type === "video") ? [nm.media.find((m) => m.type === "video")!] : nm.media);
  const previewImages: PostImage[] = finalMedia.map((m) => images.find((im) => im.key === m.key)!).filter(Boolean);
  const isStory = fmt === "story";
  const igFeed = platform === "instagram" && !isStory && fmt !== "reels" && !finalMedia.some((m) => m.type === "video");
  const igBad = igFeed ? finalMedia.filter((m) => igRatioBad(ratios[m.key])) : [];

  const doPublish = () => (mode === "queue" ? onQueue?.(sel, runAt, fmt) : onPublish(sel, null, fmt));
  const storyNoMedia = connected && isStory && sel.length === 0;   // Story ที่ลงแผนไว้ก่อน ยังไม่มีไฟล์ → ยิงไม่ได้

  const photos = images.filter((im) => im.type !== "video");   // ชุดรูปในหน้าดูเต็มจอ
  const lbKey = lb >= 0 ? photos[lb]?.key : undefined;

  return (
    <ERPModal open onClose={onClose} size="xl" title={`🚀 ${t("ยืนยันการโพสต์", "Confirm post")}`}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        {connected ? (
          <button onClick={doPublish} disabled={busy || storyNoMedia || (mode === "queue" && !runAtOk)} className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? t("กำลังส่ง...", "Sending...") : mode === "queue" ? `⏰ ${t("ตั้งคิวโพสต์", "Queue post")}` : `🚀 ${t("โพสต์เลย", "Post now")}`}
          </button>
        ) : (
          <button onClick={onManual} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">📤 {t("คัดลอก + เปิดเพจ", "Copy + open")}</button>
        )}
      </>}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* ───── ซ้าย: ตั้งค่า ───── */}
        <div className="space-y-4 min-w-0">
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
              {isStory && <p className="text-[11px] mt-1 text-slate-500">{t("Story = ใช้สื่อ 1 ชิ้น · อยู่ 24 ชม. · ไม่แสดงแคปชั่น · ตั้งเวลาได้ด้วย “ตั้งคิวให้ระบบโพสต์”", "Story = 1 item, 24h, no caption · schedule it with the queue")}</p>}
              {storyNoMedia && (
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

          {/* เลือกรูป/วิดีโอ — กดรูป = ดูใหญ่ · วงกลมมุม = เลือก (เลข = ลำดับในโพสต์) */}
          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              {t("รูป/วิดีโอที่จะลง", "Media")} — {t("เลือกแล้ว", "selected")} {sel.length} · {t("กดรูป = ดูใหญ่ · กดวงกลมมุม = เลือก/ไม่เลือก", "click = view large · corner circle = select")}
            </p>
            {images.length === 0 ? (
              <p className="text-xs text-slate-400 italic">{isStory ? t("ยังไม่มีรูป/วิดีโอ — Story ต้องมีไฟล์ 1 ชิ้น", "No media — a story needs one file") : t("ไม่มีรูป/วิดีโอ — จะโพสต์เป็นข้อความอย่างเดียว", "No media — text only")}</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {images.map((im) => {
                  const order = sel.indexOf(im.key); const on = order >= 0;
                  const isVid = im.type === "video";
                  const r = ratios[im.key];
                  const bad = platform === "instagram" && !isStory && fmt !== "reels" && !isVid && igRatioBad(r);
                  return (
                    <div key={im.key} title={im.label ?? ""} className={`relative rounded-lg overflow-hidden border-2 aspect-square ${on ? "border-blue-500" : "border-slate-200"}`}>
                      {isVid ? (
                        <a href={videoUrl(im.key)} target="_blank" rel="noreferrer" title={t("เปิดดูวิดีโอ (แท็บใหม่)", "Open video (new tab)")}
                          className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white gap-0.5 hover:bg-slate-700">
                          <span className="text-lg">▶</span><span className="text-[9px] px-1 truncate max-w-full">{im.label ?? t("วิดีโอ", "video")}</span>
                        </a>
                      ) : (
                        <button type="button" onClick={() => setLb(photos.findIndex((p) => p.key === im.key))} className={`w-full h-full cursor-zoom-in ${on ? "" : "opacity-70 hover:opacity-100"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r2ImageUrl(im.key, 200) ?? ""} alt="" className="w-full h-full object-cover"
                            onLoad={(e) => { const el = e.currentTarget; if (el.naturalWidth && el.naturalHeight) setRatios((m) => (m[im.key] ? m : { ...m, [im.key]: el.naturalWidth / el.naturalHeight })); }} />
                        </button>
                      )}
                      {/* วงกลมเลือก (เลข = ลำดับในโพสต์) */}
                      <button type="button" onClick={() => toggle(im.key)} title={on ? t("เอาออกจากโพสต์", "Remove from post") : t("เลือกลงโพสต์", "Add to post")}
                        className={`absolute top-1 right-1 w-6 h-6 rounded-full border-2 text-[11px] font-semibold flex items-center justify-center shadow ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-black/30 border-white text-white hover:bg-black/50"}`}>
                        {on ? order + 1 : ""}
                      </button>
                      {r != null && !isVid && (
                        <span className={`absolute bottom-1 left-1 text-[9px] px-1 rounded pointer-events-none ${bad ? "bg-rose-600 text-white" : "bg-black/55 text-white"}`}>
                          {ratioLabel(r)}{bad ? ` · ${t("IG ไม่รับ", "IG rejects")}` : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {selHasVideo && !isStory && <p className="text-[11px] text-amber-600 mt-1.5">🎬 {t("มีวิดีโอถูกเลือก — จะโพสต์เป็นวิดีโอ (รูปที่เลือกจะไม่ถูกใช้)", "A video is selected — it posts as a video (images ignored)")}{platform === "instagram" ? t(" · IG ลงเป็น Reels", " · IG posts as Reels") : ""}</p>}
            {igBad.length > 0 && (
              <p className="text-[11px] text-rose-600 mt-1.5">⚠ {t(`มี ${igBad.length} รูปที่สัดส่วนนอกช่วงที่ Instagram รับ (แนวตั้งสุด 4:5 · แนวนอนสุด 1.91:1) — โพสต์แล้ว IG จะปฏิเสธ · เอารูปนั้นออก หรือครอปใหม่ก่อน`, `${igBad.length} image(s) outside Instagram's 4:5–1.91:1 range — IG will reject them`)}</p>
            )}
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

        {/* ───── ขวา: ตัวอย่างหน้าตาโพสต์ (ใช้ PostMockup กลาง ตัวเดียวกับปุ่ม 👁 ในการ์ดแคปชั่น) ───── */}
        <div className="min-w-0 md:sticky md:top-0 md:self-start">
          <p className="text-[11px] text-slate-400 mb-1">👁 {t("ตัวอย่างหน้าตาตอนขึ้นจริง", "Preview")}</p>
          <div className="rounded-xl bg-slate-100 p-3 max-h-[70vh] overflow-y-auto">
            {previewImages.length === 0 && !captionText.trim()
              ? <p className="text-xs text-slate-400 text-center py-8">{t("เลือกรูปก่อน แล้วตัวอย่างจะขึ้นตรงนี้", "Select media to see the preview")}</p>
              : <PostMockup platform={platform} pageName={pageName} avatarUrl={avatarUrl} format={fmt || null} text={captionText}
                  images={previewImages} ratio={previewImages[0] ? ratios[previewImages[0].key] ?? null : null} t={t} />}
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1">{t("ภาพจำลองหน้าตาโพสต์ (รูป/แคปชั่น/ชื่อเพจจริง) — ของจริงอาจต่างเล็กน้อยตามแอป/ขนาดจอ", "Mock-up with your real media and caption — the live post may differ slightly")}</p>
        </div>
      </div>

      <ImageLightbox images={photos.map((im) => ({ url: r2ImageUrl(im.key, 1600) ?? "", label: im.label }))} index={lb} onClose={() => setLb(-1)} onIndex={setLb}
        footer={() => lbKey ? (
          <>
            <button type="button" onClick={() => toggle(lbKey)}
              className={`h-10 px-4 rounded-full text-sm font-medium shadow ${sel.includes(lbKey) ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
              {sel.includes(lbKey) ? `✓ ${t(`เลือกแล้ว (ลำดับ ${sel.indexOf(lbKey) + 1}) — กดเพื่อเอาออก`, `Selected (#${sel.indexOf(lbKey) + 1}) — click to remove`)}` : `＋ ${t("เลือกรูปนี้ลงโพสต์", "Add to post")}`}
            </button>
            {ratios[lbKey] != null && <span className={`text-xs px-2 py-1 rounded-full ${platform === "instagram" && !isStory && igRatioBad(ratios[lbKey]) ? "bg-rose-600 text-white" : "bg-white/15 text-white"}`}>{t("สัดส่วน", "Ratio")} {ratioLabel(ratios[lbKey])}{platform === "instagram" && !isStory && igRatioBad(ratios[lbKey]) ? ` · ${t("IG ไม่รับ", "IG rejects")}` : ""}</span>}
          </>
        ) : null} />
    </ERPModal>
  );
}
