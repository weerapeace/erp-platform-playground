"use client";
// การ์ด "รายการงานที่ต้องการ" ในป๊อปโพสต์ (ฝั่งซ้าย) — คุยกับพนักงานว่าต้องการงานแบบไหน
// โน้ตจัดรูปแบบ (หนา/เอียง/ธรรมดา/bullet) + โหมดแปลฟรี + Ref รูป/ลิงก์ สูงสุด 6 ช่อง
// เก็บที่ erp_creative_content.brief (HTML) / ref_image_keys / ref_links — ช่องเดียวกับหน้าวางแผนคอนเทนต์
// บันทึกเอง: โน้ต = ตอนคลิกออกจากกล่อง (หรือปิดป๊อป) · Ref = ทันทีที่เพิ่ม/ลบ
// BriefRefSlots = ช่อง Ref ของกลาง (ใช้ทั้งป๊อปโพสต์ + การ์ดไอเดียหน้าวางแผน) — กดเลือก / ลากวาง / ชี้แล้ว Ctrl+V (รูปหรือลิงก์)
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

// ข้อมูลตัวอย่างของลิงก์ (หัวข้อ + รูป OG) — จำไว้ทั้งหน้า ไม่ยิงซ้ำทุกครั้งที่เปิดป๊อป
const previewCache = new Map<string, Promise<{ title: string | null; image: string | null }>>();
const previewOf = (url: string) => {
  let p = previewCache.get(url);
  if (!p) { p = getLinkPreview(url).then((r) => ({ title: r.title, image: r.image })).catch(() => ({ title: null, image: null })); previewCache.set(url, p); }
  return p;
};
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const hasThai = (s: string) => /[฀-๿]/.test(s);
const isTyping = (el: Element | null) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

/** ช่อง Ref รูป + ลิงก์ (รวมกันไม่เกิน max) — ควบคุมจากข้างนอก: onImages/onLinks ได้รายการใหม่ทั้งชุด */
export function BriefRefSlots({ images, links, onImages, onLinks, onMessage, max = MAX_BRIEF_REFS, title, disabled = false }: {
  images: string[];
  links: BriefRefLink[];
  onImages: (next: string[]) => void | Promise<void>;
  onLinks: (next: BriefRefLink[]) => void | Promise<void>;
  /** แจ้งเตือน (อัปไม่สำเร็จ / เต็มแล้ว) */
  onMessage: (type: ToastVariant, m: string) => void;
  max?: number;
  /** หัวข้อเหนือช่อง (ไม่ใส่ = ไม่มีหัว ใช้ป้ายของฟอร์มแทน) */
  title?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const imgsRef = useRef(images); imgsRef.current = images;
  const linksRef = useRef(links); linksRef.current = links;
  const used = images.length + links.length;
  const room = Math.max(0, max - used);
  const roomRef = useRef(room); roomRef.current = room;
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [lb, setLb] = useState(-1);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length || disabled) return;
    const left = roomRef.current;
    if (left <= 0) { onMessage("info", t(`ใส่ Ref ได้สูงสุด ${max} ช่อง`, `Up to ${max} refs`)); return; }
    if (list.length > left) onMessage("info", t(`เหลือที่ ${left} ช่อง — ใช้แค่ ${left} รูปแรก`, `Only ${left} slot(s) left — using the first ${left}`));
    try {
      const r = await uploadImagesWithDupCheck(list.slice(0, left), {
        folder: "content-brief", max: 1600, existingKeys: imgsRef.current,
        onError: (_, e) => onMessage("error", t("อัปโหลดรูปไม่สำเร็จ: ", "Upload failed: ") + e.message),
        onProgress: setUp,
      });
      const keys = (r?.keys ?? []).filter((k): k is string => typeof k === "string" && !!k);
      if (keys.length) await onImages([...imgsRef.current, ...keys]);
    } catch (e) { onMessage("error", t("อัปโหลดรูปไม่สำเร็จ: ", "Upload failed: ") + (e as Error).message); }
    finally { setUp(null); }
  };

  /** เพิ่มลิงก์ — คืนข้อความ error (null = สำเร็จ) */
  const addLinkUrl = async (raw: string): Promise<string | null> => {
    const s = raw.trim();
    const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;   // พิมพ์แค่ pinterest.com/... ก็ได้
    if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return t("ลิงก์ไม่ถูกต้อง — เช่น https://www.tiktok.com/@…", "Invalid link — e.g. https://www.tiktok.com/@…");
    if (linksRef.current.some((l) => l.url === url)) return t("มีลิงก์นี้แล้ว", "This link is already added");
    if (roomRef.current <= 0) return t(`ใส่ Ref ได้สูงสุด ${max} ช่อง`, `Up to ${max} refs`);
    const p = await previewOf(url);
    setPreviews((m) => ({ ...m, [url]: p.image }));
    const label = p.title?.trim().slice(0, 120);
    await onLinks([...linksRef.current, label ? { url, label } : { url }]);
    return null;
  };
  const submitLink = async () => {
    setLinkBusy(true);
    const err = await addLinkUrl(linkUrl);
    setLinkBusy(false);
    if (err) { setLinkErr(err); return; }
    setLinkUrl(""); setLinkOpen(false);
  };

  // วาง (Ctrl+V) เมื่อชี้เมาส์อยู่ที่ช่อง Ref หรือคลิกเลือกช่องไว้: รูป → อัปเป็น Ref · ลิงก์ → เพิ่มเป็นลิงก์ Ref
  // ดักแบบ capture แล้วหยุดต่อ — ไม่ให้ตัวอัปรูปอื่นในป๊อปเดียวกันรับรูปซ้ำ · กำลังพิมพ์ที่อื่น (โน้ต/ช่องกรอก) = ไม่ยุ่ง
  const pasteRef = useRef({ addFiles, addLinkUrl }); pasteRef.current = { addFiles, addLinkUrl };
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const box = boxRef.current; if (!box) return;
      const ae = document.activeElement;
      const inside = !!ae && box.contains(ae);
      if (inside ? isTyping(ae) : !(hoverRef.current && !isTyping(ae))) return;
      const files = Array.from(e.clipboardData?.items ?? []).map((i) => i.getAsFile()).filter((f): f is File => !!f && f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); e.stopPropagation(); void pasteRef.current.addFiles(files); return; }
      const text = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (/^https?:\/\/\S+$/i.test(text)) {
        e.preventDefault(); e.stopPropagation();
        void pasteRef.current.addLinkUrl(text).then((err) => { if (err) onMessage("info", err); });
      }
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [disabled, onMessage]);

  // รูปตัวอย่างของลิงก์ที่มีอยู่แล้ว
  useEffect(() => {
    for (const l of links) void previewOf(l.url).then((p) => setPreviews((m) => (m[l.url] === p.image ? m : { ...m, [l.url]: p.image })));
  }, [links]);

  const tile = "relative group aspect-square rounded-lg overflow-hidden";

  return (
    <div>
      {title && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><Icon name="image" /> {title}</span>
          <span className="text-[11px] text-slate-400">{used}/{max}</span>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
      <div ref={boxRef} tabIndex={disabled ? undefined : 0} aria-label={t("ช่อง Ref — วางรูปหรือลิงก์ด้วย Ctrl+V ได้", "Reference slots — paste an image or link with Ctrl+V")}
        onMouseEnter={() => { hoverRef.current = true; }} onMouseLeave={() => { hoverRef.current = false; }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files); }}
        className="grid gap-1.5 grid-cols-6 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus:ring-2 focus:ring-amber-200">
        {images.map((k, i) => (
          <div key={k} className={`${tile} border border-slate-200 bg-white`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r2ImageUrl(k, 320) ?? ""} alt="" onClick={() => setLb(i)} title={t("กดดูเต็มจอ", "Click to enlarge")} className="w-full h-full object-cover cursor-zoom-in" />
            {!disabled && <button type="button" onClick={() => void onImages(images.filter((x) => x !== k))} title={t("เอารูปนี้ออก", "Remove image")} aria-label={t("เอารูปนี้ออก", "Remove image")}
              className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-rose-600 shadow opacity-0 group-hover:opacity-100"><Icon name="cancel" size={12} /></button>}
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
              {!disabled && <button type="button" onClick={() => void onLinks(links.filter((x) => x.url !== l.url))} title={t("เอาลิงก์นี้ออก", "Remove link")} aria-label={t("เอาลิงก์นี้ออก", "Remove link")}
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-rose-600 shadow opacity-0 group-hover:opacity-100"><Icon name="cancel" size={12} /></button>}
            </div>
          );
        })}
        {!disabled && room > 0 && (
          <div className={`${tile} border border-dashed border-amber-300 bg-white flex flex-col`}>
            {up ? <div className="p-1 text-[10px]"><UploadProgress {...up} /></div> : <>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1 text-[11px] text-amber-800 hover:bg-amber-50"><Icon name="add" /> {t("รูป", "Image")}</button>
              <button type="button" onClick={() => { setLinkOpen(true); setLinkErr(null); }} className="flex-1 flex items-center justify-center gap-1 text-[11px] text-amber-800 border-t border-dashed border-amber-200 hover:bg-amber-50"><Icon name="link" /> {t("ลิงก์", "Link")}</button>
            </>}
          </div>
        )}
        {!disabled && Array.from({ length: Math.max(0, room - 1) }, (_, i) => (
          <button key={`empty-${i}`} type="button" onClick={() => fileRef.current?.click()} title={t("เพิ่มรูป Ref (ลากรูปมาวาง หรือ Ctrl+V ก็ได้)", "Add a ref image (drop or Ctrl+V works too)")}
            className={`${tile} border border-dashed border-slate-200 text-slate-300 hover:border-amber-300 hover:text-amber-700 flex items-center justify-center`}><Icon name="add" /></button>
        ))}
      </div>
      {linkOpen && (
        <div className="mt-2">
          <div className="flex gap-1.5">
            <input autoFocus value={linkUrl} onChange={(e) => { setLinkUrl(e.target.value); setLinkErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitLink(); } if (e.key === "Escape") setLinkOpen(false); }}
              placeholder="https://www.tiktok.com/@…" className="flex-1 min-w-0 h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white" />
            <button type="button" onClick={() => void submitLink()} disabled={linkBusy} className="h-8 px-3 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">{linkBusy ? t("กำลังเพิ่ม…", "Adding…") : t("เพิ่ม", "Add")}</button>
            <button type="button" onClick={() => setLinkOpen(false)} className="h-8 px-2 text-xs text-slate-500 border border-slate-200 rounded-lg bg-white hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          </div>
          {linkErr && <p className="text-[11px] text-rose-600 mt-1">{linkErr}</p>}
        </div>
      )}
      {!disabled && !linkOpen && (
        <p className="text-[11px] text-slate-400 mt-1.5">
          {used === 0 ? t("ใส่รูปหรือลิงก์ (TikTok / Pinterest / IG) ที่อยากให้ทำตาม · ", "Add images or links (TikTok / Pinterest / IG) to follow · ") : ""}
          {t("ลากรูปมาวาง หรือชี้ที่ช่องแล้วกด Ctrl+V (วางรูปหรือลิงก์)", "Drop images, or point here and press Ctrl+V (image or link)")}
          {!title && <span className="ml-1">· {used}/{max}</span>}
        </p>
      )}
      <ImageLightbox images={images.map((k) => ({ url: r2ImageUrl(k, 1600) ?? "" }))} index={lb} onClose={() => setLb(-1)} onIndex={setLb} />
    </div>
  );
}

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

  // ── Ref รูป + ลิงก์ — บันทึกทันทีที่เพิ่ม/ลบ (พลาด = ย้อนกลับ) ──
  const [imgs, setImgs] = useState<string[]>(refImageKeys);
  const [links, setLinks] = useState<BriefRefLink[]>(refLinks);
  const saveImgs = async (next: string[]) => {
    const prev = imgs; setImgs(next);
    try { await updateContent(contentId, { ref_image_keys: next }); }
    catch (e) { setImgs(prev); pushToast("error", t("บันทึกรูป Ref ไม่สำเร็จ: ", "Couldn't save ref images: ") + (e as Error).message); }
  };
  const saveLinks = async (next: BriefRefLink[]) => {
    const prev = links; setLinks(next);
    try { await updateContent(contentId, { ref_links: next }); }
    catch (e) { setLinks(prev); pushToast("error", t("บันทึกลิงก์ Ref ไม่สำเร็จ: ", "Couldn't save ref links: ") + (e as Error).message); }
  };

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

      <div className="mt-3">
        <BriefRefSlots title={t("Ref ตัวอย่างที่อยากได้", "Reference examples")} images={imgs} links={links} onImages={saveImgs} onLinks={saveLinks} onMessage={pushToast} />
      </div>
    </div>
  );
}
