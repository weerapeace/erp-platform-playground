"use client";
// การ์ด "รายการงานที่ต้องการ" ในป๊อปโพสต์ (ฝั่งซ้าย) — คุยกับพนักงานว่าต้องการงานแบบไหน
// โน้ตจัดรูปแบบ (หนา/เอียง/ธรรมดา/bullet) + โหมดแปลฟรี + Ref รูป/ลิงก์ สูงสุด 6 ช่อง
// เก็บที่ erp_creative_content.brief (HTML) / ref_image_keys / ref_links — ช่องเดียวกับหน้าวางแผนคอนเทนต์
// บันทึกเอง: โน้ต = ตอนคลิกออกจากกล่อง (หรือปิดป๊อป) · Ref = ทันทีที่เพิ่ม/ลบ
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { RichTextEditor } from "@/components/rich-text";
import { Icon } from "@/components/icon";
import { ImageLightbox } from "@/components/image-lightbox";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { noteToHtml, noteToText, isEmptyNote } from "@/lib/rich-note";
import { translateNoteHtml } from "@/lib/content-translate";
import { updateContent, getLinkPreview } from "../data";

export const MAX_BRIEF_REFS = 6;
export type BriefRefLink = { url: string; label?: string };

// รูปตัวอย่างของลิงก์ (OG image) — จำไว้ทั้งหน้า ไม่ยิงซ้ำทุกครั้งที่เปิดป๊อป
const previewCache = new Map<string, string | null>();
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const hasThai = (s: string) => /[฀-๿]/.test(s);

export function ContentBriefCard({ contentId, brief, refImageKeys, refLinks, pushToast, style }: {
  contentId: string;
  brief: string | null | undefined;
  refImageKeys: string[];
  refLinks: BriefRefLink[];
  pushToast: (type: ToastVariant, m: string) => void;
  style?: CSSProperties;
}) {
  const t = useT();
  // ── โน้ต ──
  const [html, setHtml] = useState(() => noteToHtml(brief));
  const htmlRef = useRef(html); htmlRef.current = html;
  const savedRef = useRef(noteToHtml(brief));   // ค่าที่อยู่ในฐานข้อมูลล่าสุด
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveBrief = useCallback(async () => {
    const cur = htmlRef.current;
    const val = isEmptyNote(cur) ? "" : cur;
    if (val === (isEmptyNote(savedRef.current) ? "" : savedRef.current)) return;
    setSaveState("saving");
    try { await updateContent(contentId, { brief: val || null }); savedRef.current = val; setSaveState("saved"); }
    catch (e) { setSaveState("idle"); pushToast("error", t("บันทึกโน้ตไม่สำเร็จ: ", "Couldn't save the note: ") + (e as Error).message); }
  }, [contentId, pushToast, t]);
  // ปิดป๊อปทั้งที่ยังพิมพ์ค้าง (ไม่ได้คลิกออก) → บันทึกให้ก่อน
  const saveRef = useRef(saveBrief); saveRef.current = saveBrief;
  useEffect(() => () => { void saveRef.current(); }, []);

  // ── โหมดแปล (ฟรี) — ต้นฉบับมีภาษาไทย → อังกฤษ · ไม่มี → ไทย · ไม่บันทึกคำแปล ──
  const [mode, setMode] = useState<"orig" | "tr">("orig");
  const [tr, setTr] = useState<{ src: string; html: string } | null>(null);
  const [trBusy, setTrBusy] = useState(false);
  const [trErr, setTrErr] = useState<string | null>(null);
  const plain = noteToText(html);
  const toLang: "en" | "th" = !plain || hasThai(plain) ? "en" : "th";
  const runTranslate = async () => {
    if (isEmptyNote(html)) return;
    setTrBusy(true); setTrErr(null);
    try { setTr({ src: html, html: await translateNoteHtml(html, toLang, { free: true }) }); }
    catch (e) { setTrErr((e as Error).message); }
    finally { setTrBusy(false); }
  };
  const openTranslate = () => { setMode("tr"); if (!tr || tr.src !== html) void runTranslate(); };

  // ── Ref รูป + ลิงก์ (รวมกันไม่เกิน 6) ──
  const [imgs, setImgs] = useState<string[]>(refImageKeys);
  const [links, setLinks] = useState<BriefRefLink[]>(refLinks);
  const imgsRef = useRef(imgs); imgsRef.current = imgs;
  const used = imgs.length + links.length;
  const room = Math.max(0, MAX_BRIEF_REFS - used);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [lb, setLb] = useState(-1);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});

  const saveImgs = async (next: string[]) => {
    const prev = imgsRef.current; setImgs(next);
    try { await updateContent(contentId, { ref_image_keys: next }); }
    catch (e) { setImgs(prev); pushToast("error", t("บันทึกรูป Ref ไม่สำเร็จ: ", "Couldn't save ref images: ") + (e as Error).message); }
  };
  const saveLinks = async (next: BriefRefLink[]) => {
    const prev = links; setLinks(next);
    try { await updateContent(contentId, { ref_links: next }); }
    catch (e) { setLinks(prev); pushToast("error", t("บันทึกลิงก์ Ref ไม่สำเร็จ: ", "Couldn't save ref links: ") + (e as Error).message); }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    if (room <= 0) { pushToast("info", t(`ใส่ Ref ได้สูงสุด ${MAX_BRIEF_REFS} ช่อง`, `Up to ${MAX_BRIEF_REFS} refs`)); return; }
    if (list.length > room) pushToast("info", t(`เหลือที่ ${room} ช่อง — ใช้แค่ ${room} รูปแรก`, `Only ${room} slot(s) left — using the first ${room}`));
    try {
      const r = await uploadImagesWithDupCheck(list.slice(0, room), {
        folder: "content-brief", max: 1600, existingKeys: imgsRef.current,
        onError: (_, e) => pushToast("error", t("อัปโหลดรูปไม่สำเร็จ: ", "Upload failed: ") + e.message),
        onProgress: setUp,
      });
      if (r?.keys.length) await saveImgs([...imgsRef.current, ...r.keys]);
    } catch (e) { pushToast("error", t("อัปโหลดรูปไม่สำเร็จ: ", "Upload failed: ") + (e as Error).message); }
    finally { setUp(null); }
  };

  const addLink = async () => {
    const raw = linkUrl.trim();
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;   // พิมพ์แค่ pinterest.com/... ก็ได้
    if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) { setLinkErr(t("ลิงก์ไม่ถูกต้อง — เช่น https://www.tiktok.com/@…", "Invalid link — e.g. https://www.tiktok.com/@…")); return; }
    if (links.some((l) => l.url === url)) { setLinkErr(t("มีลิงก์นี้แล้ว", "This link is already added")); return; }
    if (room <= 0) { setLinkErr(t(`ใส่ Ref ได้สูงสุด ${MAX_BRIEF_REFS} ช่อง`, `Up to ${MAX_BRIEF_REFS} refs`)); return; }
    setLinkBusy(true);
    let label: string | undefined;
    try { const p = await getLinkPreview(url); label = p.title?.trim().slice(0, 120) || undefined; previewCache.set(url, p.image ?? null); setPreviews((m) => ({ ...m, [url]: p.image ?? null })); }
    catch { /* ไม่มีหัวข้อก็เก็บลิงก์เปล่าได้ */ }
    await saveLinks([...links, label ? { url, label } : { url }]);
    setLinkBusy(false); setLinkUrl(""); setLinkOpen(false);
  };

  // รูปตัวอย่างของลิงก์ที่มีอยู่แล้ว (โหลดตอนเปิด)
  useEffect(() => {
    let live = true;
    for (const l of links) {
      if (previewCache.has(l.url)) { const v = previewCache.get(l.url) ?? null; setPreviews((m) => (l.url in m ? m : { ...m, [l.url]: v })); continue; }
      previewCache.set(l.url, null);
      getLinkPreview(l.url).then((p) => { previewCache.set(l.url, p.image ?? null); if (live) setPreviews((m) => ({ ...m, [l.url]: p.image ?? null })); }).catch(() => { /* ไม่มีรูปก็โชว์โดเมน */ });
    }
    return () => { live = false; };
  }, [links]);

  const tile = "relative group aspect-square rounded-lg overflow-hidden";

  return (
    <div style={style} className="border border-amber-200 rounded-xl bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-amber-900 flex items-center gap-1.5"><Icon name="note" /> {t("รายการงานที่ต้องการ", "Work brief")}</span>
        <div className="inline-flex rounded-lg border border-amber-200 overflow-hidden text-[11px] bg-white shrink-0">
          <button type="button" onClick={() => setMode("orig")} className={`px-2 h-7 ${mode === "orig" ? "bg-amber-100 text-amber-900 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>{t("ต้นฉบับ", "Original")}</button>
          <button type="button" onClick={openTranslate} disabled={isEmptyNote(html)} title={t("แปลฟรี (ไม่บันทึกทับต้นฉบับ)", "Free translation (original is kept)")}
            className={`px-2 h-7 border-l border-amber-200 inline-flex items-center gap-1 disabled:opacity-40 ${mode === "tr" ? "bg-amber-100 text-amber-900 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>
            <Icon name="web" /> {toLang === "en" ? t("แปลเป็น English", "To English") : t("แปลเป็นไทย", "To Thai")}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-amber-800/70 mb-1.5">{t("คุยกับพนักงานว่าอยากได้งานแบบไหน · บันทึกเองเมื่อคลิกออก", "Tell the team what you want · saves when you click away")}
        {saveState === "saving" && <span className="ml-1 text-slate-400">· {t("กำลังบันทึก…", "Saving…")}</span>}
        {saveState === "saved" && <span className="ml-1 text-emerald-600">· {t("บันทึกแล้ว", "Saved")}</span>}
      </p>

      {mode === "orig" ? (
        <RichTextEditor toolbar="basic" value={html} onChange={(v) => { setHtml(v); if (saveState === "saved") setSaveState("idle"); }} onBlur={() => void saveBrief()} minHeight={110}
          placeholder={t("เช่น วิดีโอสั้น 15 วิ เน้นหัวเข็มขัด…", "e.g. 15s video focusing on the buckle…")} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          {trBusy ? <div className="px-3 py-6 text-xs text-slate-400 text-center">{t("กำลังแปล…", "Translating…")}</div>
            : trErr ? (
              <div className="px-3 py-4 text-xs text-rose-600 text-center">{t("แปลไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't translate. Try again")}
                <button type="button" onClick={() => void runTranslate()} className="ml-2 text-violet-700 underline">{t("ลองใหม่", "Retry")}</button>
              </div>
            ) : tr ? <RichTextEditor value={tr.html} onChange={() => { /* อ่านอย่างเดียว */ }} editable={false} minHeight={80} />
            : null}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400">
            <span>{t("แปลฟรีด้วย Google · ต้นฉบับไม่ถูกแก้", "Free Google translation · original unchanged")}</span>
            {!trBusy && <button type="button" onClick={() => void runTranslate()} className="inline-flex items-center gap-1 text-violet-700 hover:underline"><Icon name="refresh" /> {t("แปลใหม่", "Retranslate")}</button>}
          </div>
        </div>
      )}

      {/* ── Ref ตัวอย่างที่อยากได้ ── */}
      <div className="flex items-center justify-between mt-3 mb-1.5">
        <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><Icon name="image" /> {t("Ref ตัวอย่างที่อยากได้", "Reference examples")}</span>
        <span className="text-[11px] text-slate-400">{used}/{MAX_BRIEF_REFS}</span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
      <div className="grid gap-1.5 grid-cols-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files); }}>
        {imgs.map((k, i) => (
          <div key={k} className={`${tile} border border-slate-200 bg-white`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r2ImageUrl(k, 320) ?? ""} alt="" onClick={() => setLb(i)} title={t("กดดูเต็มจอ", "Click to enlarge")} className="w-full h-full object-cover cursor-zoom-in" />
            <button type="button" onClick={() => void saveImgs(imgs.filter((x) => x !== k))} title={t("เอารูปนี้ออก", "Remove image")} aria-label={t("เอารูปนี้ออก", "Remove image")}
              className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-rose-600 shadow opacity-0 group-hover:opacity-100"><Icon name="cancel" size={12} /></button>
          </div>
        ))}
        {links.map((l) => {
          const img = previews[l.url];
          return (
            <div key={l.url} className={`${tile} border border-slate-200 bg-white`}>
              <a href={l.url} target="_blank" rel="noreferrer" title={l.label ? `${l.label}\n${l.url}` : l.url} className="flex flex-col w-full h-full">
                {img
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={img} alt="" className="w-full flex-1 min-h-0 object-cover" />
                  : <span className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50"><Icon name="link" size={20} /></span>}
                <span className="px-1 py-0.5 text-[10px] leading-tight text-slate-600 truncate bg-white/95">{l.label || hostOf(l.url)}</span>
              </a>
              <button type="button" onClick={() => void saveLinks(links.filter((x) => x.url !== l.url))} title={t("เอาลิงก์นี้ออก", "Remove link")} aria-label={t("เอาลิงก์นี้ออก", "Remove link")}
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-rose-600 shadow opacity-0 group-hover:opacity-100"><Icon name="cancel" size={12} /></button>
            </div>
          );
        })}
        {room > 0 && (
          <div className={`${tile} border border-dashed border-amber-300 bg-white flex flex-col`}>
            {up ? <div className="p-1 text-[10px]"><UploadProgress {...up} /></div> : <>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1 text-[11px] text-amber-800 hover:bg-amber-50"><Icon name="add" /> {t("รูป", "Image")}</button>
              <button type="button" onClick={() => { setLinkOpen(true); setLinkErr(null); }} className="flex-1 flex items-center justify-center gap-1 text-[11px] text-amber-800 border-t border-dashed border-amber-200 hover:bg-amber-50"><Icon name="link" /> {t("ลิงก์", "Link")}</button>
            </>}
          </div>
        )}
        {Array.from({ length: Math.max(0, room - 1) }, (_, i) => (
          <button key={`empty-${i}`} type="button" onClick={() => fileRef.current?.click()} title={t("เพิ่มรูป Ref (ลากรูปมาวางก็ได้)", "Add a ref image (or drop one here)")}
            className={`${tile} border border-dashed border-slate-200 text-slate-300 hover:border-amber-300 hover:text-amber-700 flex items-center justify-center`}><Icon name="add" /></button>
        ))}
      </div>
      {linkOpen && (
        <div className="mt-2">
          <div className="flex gap-1.5">
            <input autoFocus value={linkUrl} onChange={(e) => { setLinkUrl(e.target.value); setLinkErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") void addLink(); if (e.key === "Escape") setLinkOpen(false); }}
              placeholder="https://www.tiktok.com/@…" className="flex-1 min-w-0 h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white" />
            <button type="button" onClick={() => void addLink()} disabled={linkBusy} className="h-8 px-3 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">{linkBusy ? t("กำลังเพิ่ม…", "Adding…") : t("เพิ่ม", "Add")}</button>
            <button type="button" onClick={() => setLinkOpen(false)} className="h-8 px-2 text-xs text-slate-500 border border-slate-200 rounded-lg bg-white hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          </div>
          {linkErr && <p className="text-[11px] text-rose-600 mt-1">{linkErr}</p>}
        </div>
      )}
      {used === 0 && !linkOpen && <p className="text-[11px] text-slate-400 mt-1.5">{t("ใส่รูปหรือลิงก์ (TikTok / Pinterest / IG) ที่อยากให้ทำตาม · ลากรูปมาวางได้", "Add images or links (TikTok / Pinterest / IG) to follow · drop images here")}</p>}
      <ImageLightbox images={imgs.map((k) => ({ url: r2ImageUrl(k, 1600) ?? "" }))} index={lb} onClose={() => setLb(-1)} onIndex={setLb} />
    </div>
  );
}
