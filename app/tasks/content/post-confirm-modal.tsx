"use client";

// ป๊อปอัปยืนยันก่อนโพสต์ (แบบ ก.) — ซ้าย = ปลายทาง/รูปแบบ/เลือกรูป/เวลา · ขวา = ตัวอย่างหน้าตาโพสต์ (เปลี่ยนตามที่เลือกทันที) · จอแคบ = ตัวอย่างอยู่ใต้
// กดรูป = ดูเต็มจอ (ImageLightbox กลาง) · วงกลมมุมรูป = เลือก/ไม่เลือก (เลข = ลำดับในโพสต์) · เตือนสัดส่วนที่ Instagram ไม่รับ
// ใช้ ERPModal กลาง · โพสต์จริง (เชื่อมแล้ว) หรือโหมดมือ (คัดลอก+เปิดเพจ)
// ตั้งคิว = คิวโพสต์กลาง (lib/social-publish/queue) — ใช้ได้ทุกรูปแบบทั้ง FB/IG รวม Story
// สื่อที่ตัวอย่างโชว์ = กติกาเดียวกับตอนยิงจริง (normalizeMedia ใน lib/social-publish/rules)
// ปรับรูปให้พอดี (IG ฟีด/Story): เติมขอบ/ครอป · สัดส่วน · สีขอบ → ตัวอย่างโชว์รูปที่ประมวลผลจริง (/api/post-image) · จำค่าล่าสุดต่อแพลตฟอร์มในเครื่อง
// ความคมชัด: ป้ายขนาดจริงของแต่ละรูป (ต้นฉบับ Drive / รูปในระบบ) + ปุ่ม "＋ ต้นฉบับจาก Google Drive"

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { ImageLightbox } from "@/components/image-lightbox";
import { ColorInput } from "@/components/color-picker";
import { type ToastVariant } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { normalizeMedia } from "@/lib/social-publish/rules";
import { DEFAULT_IG_FIT, fitQuery, fitTargetRatio, ratioLabel, type FitSpec } from "@/lib/social-publish/fit";
import type { DriveFileRef } from "../data";
import { DriveImageAdd } from "./drive-image-add";
import { useT } from "@/components/i18n";
import { PlatformChip } from "../platform-chip";
import { FORMATS } from "./brand-platforms-modal";
import { PostMockup } from "./post-mockup";

// original = คีย์ต้นฉบับเต็มบน Drive (drive:<id>) ของรูปย่อนี้ — มี = ตอนโพสต์ใช้ต้นฉบับได้ (ชัดกว่า)
export type PostImage = { key: string; label?: string | null; type?: "image" | "video"; src?: string; original?: string };

// สัดส่วนรูปฟีด Instagram ที่ยอมรับ: แนวตั้งสุด 4:5 (0.8) · แนวนอนสุด 1.91:1
const IG_MIN = 0.8, IG_MAX = 1.91;
const igRatioBad = (r: number | undefined) => r != null && (r < IG_MIN - 0.01 || r > IG_MAX + 0.01);
const STORY_RATIO = 0.5625;   // 9:16
const BG_PRESETS: { key: string; th: string; en: string }[] = [{ key: "white", th: "ขาว", en: "White" }, { key: "black", th: "ดำ", en: "Black" }, { key: "blur", th: "เบลอจากรูป", en: "Blurred" }];
// ค่าปรับขอบล่าสุดต่อแพลตฟอร์ม (สะดวกต่อเครื่อง — ไม่มี/อ่านไม่ได้ = ค่าตั้งต้น)
const fitStoreKey = (p: string) => `post-fit-v1:${p}`;
export function loadPostFit(p: string): FitSpec {
  try { const v = JSON.parse(localStorage.getItem(fitStoreKey(p)) ?? "null") as FitSpec | null; if (v && (v.mode === "pad" || v.mode === "crop")) return { ...DEFAULT_IG_FIT, ...v }; } catch { /* ใช้ค่าตั้งต้น */ }
  return DEFAULT_IG_FIT;
}
type Size = { width: number; height: number; original: boolean };
// วิดีโอเปิดดูในแท็บใหม่ (drive:<id> = วิดีโอบน Google Drive)
const videoUrl = (k: string) => (k.startsWith("drive:") ? `/api/drive-video/${encodeURIComponent(k.slice(6))}` : r2ImageUrl(k) ?? "#");

export function PostConfirmModal({
  platform, connected, pageName, avatarUrl, captionText, images, defaultSelected, scheduledAtLocal, busy,
  format, onClose, onPublish, onQueue, onManual, onAddDriveImages, pushToast,
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
  onPublish: (imageKeys: string[], scheduledUnix: number | null, format: string, fit: FitSpec | null, useOriginal: boolean) => void;
  onQueue?: (imageKeys: string[], runAtLocal: string, format: string, fit: FitSpec | null, useOriginal: boolean) => void;   // ตั้งคิวให้ระบบโพสต์ (ค่าเวลา YYYY-MM-DDTHH:mm เวลาเครื่อง)
  onManual: () => void;
  onAddDriveImages?: (files: DriveFileRef[]) => Promise<void>;   // ＋ ต้นฉบับจาก Google Drive (แนบเข้าคอนเทนต์ แล้วเลือกให้เลย)
  pushToast?: (type: ToastVariant, m: string) => void;
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
  const [sizes, setSizes] = useState<Record<string, Size>>({});   // ขนาดจริงของไฟล์ (ความคมชัด)
  const [fit, setFitState] = useState<FitSpec>(() => loadPostFit(platform));
  const [useOriginal, setUseOriginal] = useState(true);   // ใช้ต้นฉบับ Drive ตอนโพสต์ (เมื่อรูปนั้นมีต้นฉบับ)
  const [storyFitOn, setStoryFitOn] = useState(false);
  const [lbProc, setLbProc] = useState(false);   // หน้าดูเต็มจอ: โชว์ "แบบที่จะโพสต์" (หลังปรับขอบ) แทนไฟล์เดิม
  const setFit = (patch: Partial<FitSpec>) => setFitState((f) => { const n = { ...f, ...patch }; try { localStorage.setItem(fitStoreKey(platform), JSON.stringify(n)); } catch { /* ไม่จำก็ได้ */ } return n; });
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
  const previewBase: PostImage[] = finalMedia.map((m) => images.find((im) => im.key === m.key)!).filter(Boolean);
  const isStory = fmt === "story";
  const hasVideo = finalMedia.some((m) => m.type === "video");
  const igFeed = platform === "instagram" && !isStory && fmt !== "reels" && !hasVideo;
  // ค่าปรับขอบที่ใช้จริง: IG ฟีด = ใช้เสมอ (ไม่งั้น IG ปฏิเสธรูปนอกช่วง) · Story = เปิดเองได้ (บังคับ 9:16) · FB ฟีด = ไม่ปรับ
  const effFit: FitSpec | null = hasVideo ? null : igFeed ? fit : isStory && storyFitOn ? { ...fit, ratio: STORY_RATIO } : null;
  const willChange = (k: string) => (effFit && ratios[k] != null ? fitTargetRatio(ratios[k], effFit) : null);
  const changed = effFit ? finalMedia.filter((m) => willChange(m.key) != null) : [];
  const igBad = igFeed && !effFit ? finalMedia.filter((m) => igRatioBad(ratios[m.key])) : [];
  const procSrc = (k: string) => (effFit ? `/api/post-image?k=${encodeURIComponent(k)}&${fitQuery(effFit)}&w=700` : undefined);
  const previewImages: PostImage[] = previewBase.map((im) => (im.type !== "video" && effFit ? { ...im, src: procSrc(im.key) } : im));
  const r0 = previewImages[0] ? ratios[previewImages[0].key] : undefined;
  const firstRatio = r0 != null ? (effFit ? fitTargetRatio(r0, effFit) ?? r0 : r0) : null;

  const doPublish = () => (mode === "queue" ? onQueue?.(sel, runAt, fmt, effFit, useOriginal) : onPublish(sel, null, fmt, effFit, useOriginal));
  const origOf = (k: string) => images.find((im) => im.key === k)?.original;
  const selWithOrig = sel.filter((k) => origOf(k)).length;
  // ขนาดที่จะขึ้นจริง: ต้นฉบับ (ถ้าเลือกใช้และมี) ไม่งั้นรูปในระบบ
  const sizeFor = (k: string): Size | undefined => (useOriginal && origOf(k) && sizes[origOf(k) as string]) || sizes[k];

  // ขนาดจริงของแต่ละรูป (โหลดครั้งเดียวต่อรูป) — บอกว่าคมพอไหม / เป็นต้นฉบับจาก Drive หรือรูปในระบบที่ย่อแล้ว
  useEffect(() => {
    const todo = images.filter((im) => im.type !== "video").flatMap((im) => [im.key, ...(im.original ? [im.original] : [])]).filter((k) => !sizes[k]);
    if (!todo.length) return;
    let live = true;
    void Promise.all(todo.map(async (k) => {
      try {
        const r = await fetch(k.startsWith("drive:") ? `/api/post-image?k=${encodeURIComponent(k)}&meta=1` : `/api/r2-image?key=${encodeURIComponent(k)}&meta=1`);
        const j = await r.json() as { width?: number; height?: number };
        return j.width && j.height ? ([k, { width: j.width, height: j.height, original: k.startsWith("drive:") }] as const) : null;
      } catch { return null; }
    })).then((rows) => { if (live) setSizes((m) => { const n = { ...m }; for (const r of rows) if (r) n[r[0]] = r[1]; return n; }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);
  const minW = platform === "instagram" ? 1080 : 1200;   // กว้างต่ำกว่านี้ = แพลตฟอร์มขยายรูป → ไม่คม
  const addFromDrive = async (files: DriveFileRef[]) => {
    if (!onAddDriveImages) return;
    await onAddDriveImages(files);
    setSel((s) => [...s, ...files.map((f) => `drive:${f.file_id}`).filter((k) => !s.includes(k))]);   // ต้นฉบับที่เพิ่ม = เลือกลงโพสต์ให้เลย
  };
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
                  const bad = igFeed && !isVid && igRatioBad(r);
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
                      {/* ป้ายบน: ต้นฉบับ Drive / ขนาดจริง (เล็กไป = เหลือง) */}
                      {!isVid && sizeFor(im.key) && (() => { const z = sizeFor(im.key) as Size; return (
                        <span className={`absolute top-1 left-1 text-[9px] px-1 rounded pointer-events-none ${z.width < minW ? "bg-amber-500 text-white" : z.original ? "bg-emerald-600 text-white" : "bg-black/55 text-white"}`}
                          title={z.original ? t("จะโพสต์ไฟล์ต้นฉบับจาก Google Drive", "Posts the original file from Google Drive") : t("รูปในระบบ (ย่อไว้ตอนอัป)", "Stored copy (resized on upload)")}>
                          {z.original ? `${t("ต้นฉบับ", "Original")} · ` : ""}{z.width}×{z.height}{z.width < minW ? ` · ${t("เล็ก", "small")}` : ""}
                        </span>
                      ); })()}
                      {/* ป้ายล่าง: สัดส่วน · จะถูกปรับเป็นอะไร / IG ไม่รับ */}
                      {r != null && !isVid && (
                        <span className={`absolute bottom-1 left-1 text-[9px] px-1 rounded pointer-events-none ${bad && !effFit ? "bg-rose-600 text-white" : on && willChange(im.key) != null ? "bg-violet-600 text-white" : "bg-black/55 text-white"}`}>
                          {ratioLabel(r)}{on && willChange(im.key) != null ? ` → ${ratioLabel(willChange(im.key) as number)}` : bad && !effFit ? ` · ${t("IG ไม่รับ", "IG rejects")}` : ""}
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
            {sel.some((k) => sizeFor(k) && (sizeFor(k) as Size).width < minW) && (
              <p className="text-[11px] text-amber-700 mt-1.5">💡 {t(`มีรูปที่กว้างไม่ถึง ${minW}px (ป้ายเหลือง) — ขึ้นแพลตฟอร์มแล้วอาจไม่คม · ใช้ไฟล์ต้นฉบับจาก Google Drive แทนได้`, `Some images are narrower than ${minW}px — use the original from Google Drive for sharper posts`)}</p>
            )}
            {images.some((im) => im.original) && (
              <label className="mt-2 flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={useOriginal} onChange={(e) => setUseOriginal(e.target.checked)} />
                <span>
                  <b className="font-medium text-slate-700">{t("โพสต์ด้วยไฟล์ต้นฉบับจาก Google Drive (ชัดสุด)", "Post the original files from Google Drive (sharpest)")}</b>
                  <span className="text-slate-500"> — {t(`${selWithOrig}/${sel.length} รูปที่เลือกมีต้นฉบับ · ที่เหลือใช้รูปในระบบ · ต้นฉบับเปิดไม่ได้ = ใช้รูปในระบบแทนให้อัตโนมัติ`, `${selWithOrig}/${sel.length} selected have originals · others use the stored copy · falls back automatically`)}</span>
                </span>
              </label>
            )}
            {onAddDriveImages && pushToast && (
              <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-2.5 py-2">
                <p className="text-[11px] text-slate-500">📁 {t("อยากได้ชัดที่สุด: ใช้ไฟล์ต้นฉบับจาก Google Drive (ไม่ถูกย่อ) — วางลิงก์รูปหรือโฟลเดอร์ แล้วระบบเลือกลงโพสต์ให้", "Sharpest: use original files from Google Drive — paste an image or folder link")}</p>
                <DriveImageAdd existingKeys={images.map((im) => im.key).filter((k) => k.startsWith("drive:"))} onAdd={addFromDrive} pushToast={pushToast} />
              </div>
            )}
          </div>

          {/* ปรับรูปให้พอดี — IG ฟีด (ใช้เสมอ) · Story (เปิดเองได้ = 9:16) */}
          {!hasVideo && (igFeed || isStory) && finalMedia.length > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-700">🖼 {igFeed ? t("ปรับรูปให้พอดี Instagram", "Fit images for Instagram") : t("ปรับรูปเป็นแนวตั้ง 9:16 (Story)", "Fit to 9:16 (Story)")}</span>
                {isStory && <label className="ml-auto inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={storyFitOn} onChange={(e) => setStoryFitOn(e.target.checked)} /> {t("ปรับ", "Fit")}</label>}
              </div>
              {(igFeed || storyFitOn) && (
                <>
                  {igFeed && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="text-slate-500 w-16 shrink-0">{t("สัดส่วน", "Ratio")}</span>
                      {([["auto", t("อัตโนมัติ (แก้เฉพาะรูปที่ไม่ผ่าน)", "Auto (only failing images)")], [0.8, t("4:5 ทุกรูป", "4:5 all")], [1, t("1:1 ทุกรูป", "1:1 all")]] as [FitSpec["ratio"], string][]).map(([v, l]) => (
                        <button key={String(v)} type="button" onClick={() => setFit({ ratio: v })} className={`px-2 py-0.5 rounded-full border ${fit.ratio === v ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{l}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="text-slate-500 w-16 shrink-0">{t("วิธี", "Method")}</span>
                    {([["pad", t("เติมขอบ (ไม่ตัดรูป)", "Add borders (no crop)")], ["crop", t("ครอป (ตัดขอบรูป)", "Crop edges")]] as [FitSpec["mode"], string][]).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setFit({ mode: v })} className={`px-2 py-0.5 rounded-full border ${fit.mode === v ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{l}</button>
                    ))}
                  </div>
                  {fit.mode === "pad" && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="text-slate-500 w-16 shrink-0">{t("สีขอบ", "Border")}</span>
                      {BG_PRESETS.map((b) => (
                        <button key={b.key} type="button" onClick={() => setFit({ bg: b.key })} className={`px-2 py-0.5 rounded-full border ${fit.bg === b.key ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{t(b.th, b.en)}</button>
                      ))}
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-400">{t("สีอื่น", "Custom")}</span>
                        <ColorInput value={/^[0-9a-f]{6}$/i.test(fit.bg) ? `#${fit.bg}` : "#ffffff"} onChange={(v) => { const h = v.replace(/^#/, "").toLowerCase(); if (/^[0-9a-f]{6}$/.test(h)) setFit({ bg: h }); }} allowText={false} />
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">
                    {changed.length
                      ? t(`จะปรับ ${changed.length} รูป (ป้ายม่วงบนรูป) — ตัวอย่างด้านขวาคือรูปที่ปรับแล้วจริง · ไฟล์ในระบบไม่ถูกแก้`, `${changed.length} image(s) will be adjusted — the preview shows the real result · stored files aren't changed`)
                      : t("รูปที่เลือกพอดีอยู่แล้ว ไม่ต้องปรับ", "Selected images already fit")}
                  </p>
                </>
              )}
            </div>
          )}

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
                  images={previewImages} ratio={firstRatio} t={t} />}
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1">{t("ภาพจำลองหน้าตาโพสต์ (รูป/แคปชั่น/ชื่อเพจจริง) — ของจริงอาจต่างเล็กน้อยตามแอป/ขนาดจอ", "Mock-up with your real media and caption — the live post may differ slightly")}</p>
        </div>
      </div>

      <ImageLightbox images={photos.map((im) => ({ url: lbProc && effFit && willChange(im.key) != null ? `/api/post-image?k=${encodeURIComponent(im.key)}&${fitQuery(effFit)}&w=1600` : r2ImageUrl(im.key, 1600) ?? "", label: im.label }))}
        index={lb} onClose={() => { setLb(-1); setLbProc(false); }} onIndex={setLb}
        footer={() => lbKey ? (
          <>
            <button type="button" onClick={() => toggle(lbKey)}
              className={`h-10 px-4 rounded-full text-sm font-medium shadow ${sel.includes(lbKey) ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
              {sel.includes(lbKey) ? `✓ ${t(`เลือกแล้ว (ลำดับ ${sel.indexOf(lbKey) + 1}) — กดเพื่อเอาออก`, `Selected (#${sel.indexOf(lbKey) + 1}) — click to remove`)}` : `＋ ${t("เลือกรูปนี้ลงโพสต์", "Add to post")}`}
            </button>
            {ratios[lbKey] != null && (
              <span className={`text-xs px-2 py-1 rounded-full ${igFeed && !effFit && igRatioBad(ratios[lbKey]) ? "bg-rose-600 text-white" : "bg-white/15 text-white"}`}>
                {sizeFor(lbKey) ? `${(sizeFor(lbKey) as Size).original ? `${t("ต้นฉบับ", "Original")} · ` : ""}${(sizeFor(lbKey) as Size).width}×${(sizeFor(lbKey) as Size).height} · ` : ""}{ratioLabel(ratios[lbKey])}
              </span>
            )}
            {effFit && willChange(lbKey) != null && (
              <button type="button" onClick={() => setLbProc((v) => !v)} className="h-10 px-4 rounded-full text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 shadow">
                {lbProc ? t("ดูไฟล์เดิม", "Show original") : t(`ดูแบบที่จะโพสต์ (${ratioLabel(willChange(lbKey) as number)})`, `Show as posted (${ratioLabel(willChange(lbKey) as number)})`)}
              </button>
            )}
          </>
        ) : null} />
    </ERPModal>
  );
}
