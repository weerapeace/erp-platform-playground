"use client";
// ไฟล์แนบของคอนเทนต์: รูป · วิดีโอ · ลิงก์ (แยกจาก content.tsx — Y1)
import { useRef, useState } from "react";
import { ImageAttach } from "@/components/image-attach";
import { r2ImageUrl } from "@/lib/r2-image";
import { type ContentAttachment } from "../data";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";

// ราคาเป็นข้อความได้เมื่อมีหลายสินค้า (บรรทัดละ "ชื่อ: ราคา" — ดู multiProductVars)

// ============================================================
// ไฟล์แนบของคอนเทนต์: รูป (ย่อก่อนอัป) / วิดีโอสั้น / ลิงก์ (พรีวิว OG เต็ม)
// ============================================================
export function ContentAttachments({ attachments, onAttachImage, onUploadVideo, onAddLink, onAddDriveVideo, onDelete, pushToast, hideImageList = false }: {
  attachments: ContentAttachment[];
  hideImageList?: boolean;   // คลังรูปด้านบนโชว์รูปอยู่แล้ว → ตรงนี้เหลือแค่ช่องอัปโหลด
  onAttachImage: (r: { r2_key: string; file_name: string; content_type: string; size_bytes: number }) => Promise<void>;
  onUploadVideo: (f: File) => Promise<void>;
  onAddLink: (url: string) => Promise<void>;
  onAddDriveVideo: (link: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pushToast: (type: ToastVariant, m: string) => void;
}) {
  const t = useT();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [vidBusy, setVidBusy] = useState(false);
  const vidRef = useRef<HTMLInputElement>(null);
  const images = attachments.filter((a) => a.kind === "image");
  const videos = attachments.filter((a) => a.kind === "video");
  const [driveLink, setDriveLink] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const linkAtts = attachments.filter((a) => a.kind === "link");

  const addLink = async () => {
    const u = linkUrl.trim(); if (!u) return;
    setLinkBusy(true);
    try { await onAddLink(u); setLinkUrl(""); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setLinkBusy(false); }
  };
  const pickVideo = async (f: File) => { setVidBusy(true); try { await onUploadVideo(f); } finally { setVidBusy(false); } };

  return (
    <div className="space-y-3">
      {/* รูปภาพ */}
      <div>
        <p className="text-xs text-slate-500 mb-1">🖼 {t("รูปภาพ", "Images")}</p>
        <ImageAttach images={images.map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))} onAttach={onAttachImage} onDelete={onDelete} pushToast={pushToast} hideList={hideImageList} />
      </div>
      {/* วิดีโอ */}
      <div>
        <p className="text-xs text-slate-500 mb-1">🎬 {t("วิดีโอ", "Video")}</p>
        <input ref={vidRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickVideo(f); e.target.value = ""; }} />
        <button onClick={() => vidRef.current?.click()} disabled={vidBusy} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">{vidBusy ? t("⏳ กำลังอัป…", "⏳ Uploading…") : t("⬆ อัปวิดีโอสั้น (≤25MB)", "⬆ Upload short video (≤25MB)")}</button>
        <span className="text-[11px] text-slate-400 ml-2">{t("คลิปใหญ่ → ใช้ Google Drive ด้านล่าง", "Big clips → use Google Drive below")}</span>
        {/* คลิปใหญ่: วางลิงก์ Google Drive — ระบบไม่ก็อปไฟล์ลงระบบ ดึงจาก Drive ตอนใช้งาน */}
        <div className="flex gap-1.5 mt-2">
          <input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder={t("วางลิงก์วิดีโอจาก Google Drive...", "Paste a Google Drive video link...")}
            className="flex-1 min-w-0 h-8 border border-slate-200 rounded-md px-2 text-xs" />
          <button onClick={async () => { const l = driveLink.trim(); if (!l) return; setDriveBusy(true); await onAddDriveVideo(l); setDriveBusy(false); setDriveLink(""); }}
            disabled={driveBusy || !driveLink.trim()} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0">
            {driveBusy ? t("⏳ ตรวจไฟล์…", "⏳ Checking…") : t("＋ เพิ่มจาก Drive", "＋ Add from Drive")}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">{t("ไฟล์อยู่ที่ Drive ที่เดียว (ไม่กินพื้นที่ระบบ) · ต้องแชร์ไฟล์ให้บัญชีระบบก่อน", "Stays on Drive only — share the file with the system account first")}</p>
        {videos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {videos.map((v) => {
              const isDrive = (v.url ?? "").startsWith("drive:");
              const src = isDrive ? `/api/drive-video/${(v.url as string).slice(6)}` : (r2ImageUrl(v.r2_key) ?? undefined);
              return (
              <div key={v.id} className="relative group">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={src} controls preload="metadata" className="w-full h-28 object-cover rounded-lg border border-slate-200 bg-black" />
                {isDrive && <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/70 text-white px-1 rounded">Drive</span>}
                <button onClick={() => void onDelete(v.id)} title={t("ลบ", "Delete")} className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>
              </div>
              ); })}
          </div>
        )}
      </div>
      {/* ลิงก์ (พรีวิวเต็ม) */}
      <div>
        <p className="text-xs text-slate-500 mb-1">🔗 {t("ลิงก์ (มีพรีวิว)", "Links (with preview)")}</p>
        <div className="flex gap-1.5">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addLink(); }} placeholder="https://..." className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
          <button onClick={addLink} disabled={linkBusy} className="h-8 px-3 text-xs font-medium text-violet-700 border border-violet-200 rounded-md hover:bg-violet-50 disabled:opacity-50">{linkBusy ? t("⏳", "⏳") : t("＋ พรีวิว", "＋ Preview")}</button>
        </div>
        {linkAtts.length > 0 && <div className="space-y-2 mt-2">{linkAtts.map((l) => <LinkPreviewCard key={l.id} att={l} onDelete={() => void onDelete(l.id)} />)}</div>}
      </div>
    </div>
  );
}

// การ์ดพรีวิวลิงก์ (รูป OG + หัวข้อ + โดเมน)
export function LinkPreviewCard({ att, onDelete }: { att: ContentAttachment; onDelete: () => void }) {
  const host = (() => { try { return new URL(att.url ?? "").hostname.replace(/^www\./, ""); } catch { return att.url ?? ""; } })();
  return (
    <div className="relative group flex gap-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
      {att.file_name
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={att.file_name} alt="" className="w-20 h-20 object-cover bg-slate-100 shrink-0" />
        : <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-2xl shrink-0">🔗</div>}
      <a href={att.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 py-1.5 pr-6 flex-1">
        <p className="text-sm font-medium text-slate-700 line-clamp-2">{att.label || host}</p>
        <p className="text-[11px] text-slate-400 truncate mt-0.5">{host}</p>
      </a>
      <button onClick={onDelete} title="ลบ" className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>
    </div>
  );
}
