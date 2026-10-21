"use client";
// การ์ดแคปชันรายแพลตฟอร์ม + แถบเครื่องมือ + ป๊อปเขียนด้วย AI / ดึงแคปชัน + ช่องแฮชแท็ก (แยกจาก content.tsx — Y1)
import { useCallback, useEffect, useRef, useState } from "react";
import { renderCaption } from "@/lib/caption-template";
import { ERPModal } from "@/components/modal";
import { ERPTextarea } from "@/components/form";
import { InfoHint } from "@/components/info-hint";
import { r2ImageUrl } from "@/lib/r2-image";
import { listHashtags, createHashtag, type ContentCaption, type Hashtag, type CaptionTemplate, type PlatformSettings, type PlatformSetting } from "../data";
import { platformLabel } from "../use-options";
import { PlatformChip } from "../platform-chip";
import { type PostImage } from "./post-confirm-modal";
import { PostMockup } from "./post-mockup";
import { CopyPathButton, type PathItem } from "@/components/copy-path-button";
import { assembleCaption, captionTemplateFor, type SharedVars } from "./caption-assemble";
import { captionLimitCheck, PLATFORM_LIMITS } from "@/lib/caption-template";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { RowMenu } from "./content-ui";

// ช่องกรอก hashtag พร้อม typeahead (กรองจากคลัง + เพิ่มใหม่เข้าคลังได้)
export function HashtagInput({ value, onChange, brandId, platform, pushToast }: { value: string | null; onChange: (v: string) => void; brandId: string | null; platform: string; pushToast: (type: ToastVariant, m: string) => void }) {
  const t = useT();
  const [tags, setTags] = useState<Hashtag[]>([]);
  const [focus, setFocus] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);   // ไฮไลต์รายการในดรอปดาวน์ด้วยคีย์บอร์ด (↓/↑/Enter)
  // คลังแฮชแท็กใช้ร่วมทุกแพลตฟอร์ม — กรองแค่ "แบรนด์นี้ + ของกลาง" (ไม่ผูกแพลตฟอร์ม) · โหลดใหม่ทุกครั้งที่โฟกัส (เห็นตัวที่เพิ่งเพิ่ม)
  const loadTags = useCallback(async () => { try { setTags(await listHashtags({ brand_id: brandId || undefined })); } catch { /* ว่าง */ } }, [brandId]);
  useEffect(() => { if (focus) loadTags(); }, [focus, loadTags]);

  const tokens = (value ?? "").split(/\s+/).filter(Boolean);
  const lastTok = (value ?? "").split(/\s+/).pop() ?? "";
  const q = lastTok.replace(/^#/, "").toLowerCase();
  const suggestions = tags
    .filter((h) => { const txt = h.text.toLowerCase().replace(/^#/, ""); return q ? txt.includes(q) : true; })
    .filter((h) => !tokens.includes(h.text))
    .slice(0, 12);
  const exists = tags.some((h) => h.text.toLowerCase().replace(/^#/, "") === q);
  const showAdd = !!q && !exists;
  const itemCount = suggestions.length + (showAdd ? 1 : 0);
  useEffect(() => { setActiveIdx(-1); }, [q, focus]);   // รีเซ็ตไฮไลต์เมื่อคำค้น/โฟกัสเปลี่ยน

  const applyTag = (text: string) => {
    const parts = (value ?? "").split(/\s+/);
    if (parts.length === 0) { onChange(text + " "); return; }
    parts[parts.length - 1] = text;   // แทนที่ token ที่กำลังพิมพ์
    onChange(parts.join(" ") + " ");
  };
  const addNew = async () => {
    const raw = q.trim(); if (!raw) return;
    const text = "#" + raw.replace(/^#/, "");
    try { const h = await createHashtag({ text, brand_id: brandId || null }); applyTag(h.text); await loadTags(); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <div className="relative">
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (!focus || itemCount === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % itemCount); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + itemCount) % itemCount); }
          else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); if (activeIdx < suggestions.length) applyTag(suggestions[activeIdx].text); else void addNew(); }
          else if (e.key === "Escape") { setActiveIdx(-1); e.currentTarget.blur(); }
        }}
        placeholder={t("#hashtag คั่นด้วยเว้นวรรค (พิมพ์เพื่อค้นหาจากคลัง)", "#hashtag (type to search library)")} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" />
      {focus && itemCount > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto p-1">
          {suggestions.map((h, idx) => (
            <button key={h.id} onMouseDown={(e) => { e.preventDefault(); applyTag(h.text); }} onMouseEnter={() => setActiveIdx(idx)}
              className={`flex w-full items-center justify-between gap-2 text-left px-2 py-1 text-sm rounded text-slate-700 ${activeIdx === idx ? "bg-violet-100" : "hover:bg-violet-50"}`}>
              <span className="truncate">{h.text}</span><span className="text-[10px] text-slate-300 shrink-0">{h.usage_count}</span>
            </button>
          ))}
          {showAdd && <button onMouseDown={(e) => { e.preventDefault(); void addNew(); }} onMouseEnter={() => setActiveIdx(suggestions.length)}
            className={`block w-full text-left px-2 py-1 text-sm rounded text-emerald-700 ${activeIdx === suggestions.length ? "bg-emerald-100" : "hover:bg-emerald-50"}`}>＋ {t("เพิ่ม", "Add")} “#{q}” {t("เข้าคลัง", "to library")}</button>}
        </div>
      )}
    </div>
  );
}

// แถบปุ่มหัวคอลัมน์แคปชั่น — โชว์แค่ 3 ปุ่มที่ปักไว้ ที่เหลือซ่อนใน ⋯ (เลือกได้เองว่าจะโชว์อะไร)
// จำเป็นรายคนที่ user_ui_prefs (key: content_caption_toolbar) → ใช้เครื่องอื่นก็ได้ค่าเดิม
export type ToolAction = { key: string; label: string; onClick: () => void; primary?: boolean };

export const MAX_PINNED = 3;

export function CaptionToolbar({ actions, pinned, onSavePinned }: {
  actions: ToolAction[];
  pinned: string[];
  onSavePinned: (keys: string[]) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setCfg(false); } };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);

  const shown = pinned.map((k) => actions.find((a) => a.key === k)).filter((a): a is ToolAction => !!a).slice(0, MAX_PINNED);
  const rest = actions.filter((a) => !shown.some((s) => s.key === a.key));
  const togglePin = (k: string) => {
    const has = pinned.includes(k);
    if (has) onSavePinned(pinned.filter((x) => x !== k));
    else if (pinned.length >= MAX_PINNED) onSavePinned([...pinned.slice(1), k]);   // เต็ม 3 → ดันตัวเก่าสุดออก
    else onSavePinned([...pinned, k]);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {shown.map((a) => (
        <button key={a.key} onClick={a.onClick}
          className={a.primary
            ? "text-xs font-medium text-white bg-fuchsia-600 hover:bg-fuchsia-700 rounded-md px-2 py-1"
            : "text-xs text-violet-700 hover:underline"}>{a.label}</button>
      ))}
      <div ref={boxRef} className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} title={t("เมนูเพิ่มเติม", "More")}
          className="text-slate-400 hover:text-violet-700 leading-none text-base px-1">⋯</button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 min-w-[230px] bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {rest.map((a) => (
              <button key={a.key} type="button" onClick={() => { setOpen(false); a.onClick(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">{a.label}</button>
            ))}
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button type="button" onClick={() => setCfg((c) => !c)} className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
                ⚙️ {t("เลือกปุ่มที่โชว์ (3 ปุ่ม)", "Choose visible buttons (3)")}
              </button>
              {cfg && (
                <div className="px-3 py-1.5 space-y-1">
                  {actions.map((a) => (
                    <label key={a.key} className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={pinned.includes(a.key)} onChange={() => togglePin(a.key)} />
                      <span className="truncate">{a.label}</span>
                    </label>
                  ))}
                  <p className="text-[10px] text-slate-400">{t("ติ๊กได้ 3 ปุ่ม — ถ้าครบแล้วติ๊กเพิ่ม ตัวเก่าสุดจะถูกเอาออก", "Up to 3 — adding a 4th drops the oldest")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// รูปแบบโพสต์ที่แต่ละแพลตฟอร์มมีให้เลือก (ไม่เลือก = ให้ระบบเดาจากสื่อที่เลือก: วิดีโอ→วิดีโอ, หลายรูป→อัลบั้ม)
// ใช้ทั้งบอกคนโพสต์มือ และคุมตอนยิงอัตโนมัติ (Story ยังต้องโพสต์มือ)
export const POST_FORMATS: Record<string, { key: string; th: string; en: string }[]> = {
  instagram: [
    { key: "single", th: "โพสต์รูปเดียว", en: "Single post" },
    { key: "carousel", th: "อัลบั้มหลายรูป", en: "Carousel" },
    { key: "reels", th: "Reels (วิดีโอ)", en: "Reels" },
    { key: "story", th: "Story (24 ชม.)", en: "Story" },
  ],
  facebook: [
    { key: "single", th: "โพสต์รูปเดียว", en: "Single post" },
    { key: "carousel", th: "อัลบั้มหลายรูป", en: "Album" },
    { key: "video", th: "วิดีโอ", en: "Video" },
    { key: "story", th: "Story (24 ชม.)", en: "Story" },
  ],
  tiktok: [{ key: "video", th: "วิดีโอ", en: "Video" }, { key: "carousel", th: "โพสต์รูปภาพ", en: "Photo post" }],
  youtube: [{ key: "video", th: "วิดีโอปกติ", en: "Video" }, { key: "reels", th: "Shorts", en: "Shorts" }],
};

export function postFormatLabel(platform: string, key: string | undefined, t: (th: string, en: string) => string): string {
  const f = (POST_FORMATS[platform] ?? []).find((x) => x.key === key);
  return f ? t(f.th, f.en) : "";
}

// caption ต่อ 1 แพลตฟอร์ม: แม่แบบ + แคปชั่น + hashtag typeahead + พรีวิว + ปุ่มไปโพสต์/คัดลอก
// เคารพตั้งค่าแพลตฟอร์ม: แม่แบบเริ่มต้น / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์
export function CaptionCard({ paths = [], onAddPath, fallbackImages = [], onPullFrom, open = true, onToggle, contentId, canAi = false, aiBusy = false, onAiWrite, format, onSetFormat, cap, templates, sharedVars, brandId, setting, onChange, onOpenSettings, onApplyAll, postStatus = "todo", postedUrl = "", onSetStatus, onSetPostedUrl, onCommitPostedUrl, onRequestPost, canAuto = false, autoLabel, connInfo, postImages = [], selectedImages = [], onToggleImage, onSetMain, pushToast, pageName, avatarUrl }: { open?: boolean; pageName?: string | null; avatarUrl?: string | null; onToggle?: () => void; contentId?: string; canAi?: boolean; aiBusy?: boolean; onAiWrite?: () => void; format?: string; onSetFormat?: (v: string) => void; cap: ContentCaption; templates: CaptionTemplate[]; sharedVars: SharedVars; brandId: string | null; setting?: PlatformSetting; onChange: (p: Partial<ContentCaption>) => void; onOpenSettings?: () => void; onApplyAll?: (platform: string) => void; postStatus?: string; postedUrl?: string; onSetStatus?: (s: string) => void; onSetPostedUrl?: (url: string) => void; onCommitPostedUrl?: () => void; onRequestPost?: (captionText: string) => void; canAuto?: boolean; autoLabel?: string; connInfo?: { connected: boolean; label: string; href: string }; postImages?: PostImage[]; selectedImages?: string[]; onToggleImage?: (key: string) => void; onSetMain?: (key: string) => void; pushToast: (type: ToastVariant, m: string) => void;
  paths?: PathItem[]; onAddPath?: (path: string) => Promise<void>;   // 📂 path ไฟล์ของโพสต์ (คัดลอกจากหัวการ์ด)
  fallbackImages?: string[];                                          // รูปที่จะลงเมื่อยังไม่ได้เลือกรูปให้แพลตฟอร์มนี้ (= รูปแนบของโพสต์ เหมือนตอนกดโพสต์จริง)
  onPullFrom?: () => void;                                            // ⇈ ดึงแคปชั่นจากแพลตฟอร์มอื่น
}) {
  const t = useT();
  const [imgEdit, setImgEdit] = useState(false);   // โหมดเลือกรูป (ปกติโชว์เฉพาะรูปที่เลือก · กดแล้วกางเลือก)
  // ปุ่ม ✨ ของช่องนี้ = เปิดป๊อป "AI เขียนแคปชั่น" ของ drawer (ใส่คำสั่งเพิ่มได้) — ใช้เส้นทางเดียวกับปุ่มเขียนทั้งหมด
  const useCaption = setting?.use_caption !== false;
  const useHashtags = setting?.use_hashtags !== false;
  const postUrl = (setting?.post_url ?? "").trim();

  const typeKey = cap.caption_type ?? setting?.template_key ?? templates[0]?.key ?? "short";
  const tpl = captionTemplateFor(cap, setting, templates);
  // ข้อความที่จะโพสต์ (แม่แบบ + ตัวแปร · ตัดแคปชั่น/แฮชแท็กที่ปิดไว้) — ของกลาง caption-assemble ตัวเดียวกับปฏิทิน
  const preview = assembleCaption(cap, setting, templates, sharedVars);
  const copy = async () => { try { await navigator.clipboard.writeText(preview); pushToast("success", t(`คัดลอก ${platformLabel(cap.platform)} แล้ว`, `Copied ${platformLabel(cap.platform)}`)); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); } };
  const [previewOpen, setPreviewOpen] = useState(false);   // 👁 ป๊อปดูตัวอย่างโพสต์ (จากหัวการ์ด ไม่ต้องกาง)
  const previewImgKeys = selectedImages.length ? selectedImages : fallbackImages;   // รูปในตัวอย่าง: ที่เลือกไว้ ไม่งั้น = รูปแนบของโพสต์
  const canPreview = !!preview.trim() || previewImgKeys.length > 0;
  const lim = captionLimitCheck(cap.platform, preview);   // ลิมิตตัวอักษร/แฮชแท็กของแพลตฟอร์ม (lib/caption-template PLATFORM_LIMITS)
  const overLimit = lim.over > 0 || lim.hashtagsOver > 0;
  // สถานะโพสต์ต่อแพลตฟอร์ม: ป้ายบนหัวการ์ด + ปุ่ม ✅ โพสต์แล้ว (กดสลับ) · "ข้าม" อยู่ในเมนู ⋯ (นาน ๆ ใช้ที)

  // ตัวอย่างที่ประกอบจากแม่แบบ — โชว์เฉพาะตอนแม่แบบ "เติมข้อความเพิ่ม" จริง ๆ
  // (ถ้าแม่แบบมีแค่ {caption}/{hashtags} ก็ไม่ต้องโชว์ เพราะซ้ำกับช่องด้านบน = ต้นตอความรกเดิม)
  const tplAddsText = !!tpl && renderCaption(tpl.body, { caption: "", hashtags: "", ...sharedVars }).replace(/\s+/g, "").length > 0;
  const snippet = (cap.caption ?? "").split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  const stBadge = postStatus === "posted" ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: `✅ ${t("โพสต์แล้ว", "Posted")}` }
    : postStatus === "scheduled" ? { cls: "bg-blue-50 text-blue-700 border-blue-200", label: `⏰ ${t("ตั้งเวลาแล้ว", "Scheduled")}` }
    : postStatus === "skip" ? { cls: "bg-rose-50 text-rose-700 border-rose-300", label: `⊘ ${t("ข้าม", "Skip")}` }
    : { cls: "bg-white text-slate-400 border-slate-200", label: t("ยังไม่โพสต์", "Not posted") };
  // เมนู ⋯ = ของที่ไม่ได้ใช้ทุกครั้ง (ยุบออกจากหัวการ์ดเพื่อลดความรก)
  const menuItems: { label: string; onClick: () => void }[] = [];
  if (postUrl) menuItems.push({ label: `↗ ${t("ไปหน้าโพสต์", "Open post page")}`, onClick: () => window.open(postUrl, "_blank", "noopener") });
  else if (onOpenSettings) menuItems.push({ label: `🔗 ${t("ตั้งลิงก์ไปหน้าโพสต์", "Set post link")}`, onClick: onOpenSettings });
  if (onApplyAll) menuItems.push({ label: `⇊ ${t("ใช้แคปชั่นนี้กับแพลตฟอร์มอื่น", "Apply to other platforms")}`, onClick: () => onApplyAll(cap.platform) });
  if (onPullFrom && (useCaption || useHashtags)) menuItems.push({ label: `⇈ ${t("ดึงแคปชั่นจากแพลตฟอร์มอื่น…", "Pull caption from another platform…")}`, onClick: onPullFrom });
  if (onOpenSettings) menuItems.push({ label: `⚙️ ${t("ตั้งค่าแพลตฟอร์มนี้", "Platform settings")}`, onClick: onOpenSettings });
  if (onSetStatus) {
    if (postStatus === "skip") menuItems.push({ label: `↺ ${t("เลิกข้าม (กลับเป็นยังไม่โพสต์)", "Un-skip")}`, onClick: () => onSetStatus("todo") });
    else menuItems.push({ label: `⊘ ${t("ข้ามแพลตฟอร์มนี้", "Skip this platform")}`, onClick: () => onSetStatus("skip") });
    if (postStatus === "posted") menuItems.push({ label: `↺ ${t("ยกเลิก “โพสต์แล้ว”", "Mark as not posted")}`, onClick: () => onSetStatus("todo") });
  }

  return (
    <div className={`border rounded-lg bg-white ${open ? "border-violet-200 shadow-sm" : "border-slate-200"}`}>
      {/* ── หัวแถว: กดเพื่อกาง/พับ · ตอนพับเห็นครบว่าเขียนแล้วยัง มีรูปกี่รูป โพสต์แล้วยัง ── */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 shrink-0 text-left">
          <span className="text-[10px] text-slate-400 w-3 shrink-0">{open ? "▲" : "▼"}</span>
          <PlatformChip code={cap.platform} />
        </button>
        {/* ⓘ คำแนะนำประจำแพลตฟอร์ม (เอาเมาส์ชี้/แตะ) — ข้อความตั้งที่ ⚙️ ตั้งค่าแพลตฟอร์ม → "คำแนะนำ" */}
        <InfoHint label={t("คำแนะนำสำหรับแพลตฟอร์มนี้", "Tips for this platform")} className="shrink-0 -ml-1 mr-1">
          {(setting?.note ?? "").trim()
            ? <span className="whitespace-pre-wrap">💡 <b className="text-slate-700">{platformLabel(cap.platform)}</b><br />{setting?.note}</span>
            : <span>{t("ยังไม่ได้ตั้งคำแนะนำสำหรับ", "No tips set for")} {platformLabel(cap.platform)}<br />
                {onOpenSettings && <button type="button" onClick={onOpenSettings} className="mt-1 text-violet-700 hover:underline">⚙️ {t("ตั้งคำแนะนำ (ตั้งค่าแพลตฟอร์ม)", "Set tips (platform settings)")}</button>}
              </span>}
        </InfoHint>
        <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {!open && (
            <>
              <span className={`text-xs truncate min-w-0 flex-1 ${snippet ? "text-slate-600" : "text-slate-300 italic"}`}>
                {snippet || (useCaption ? t("ยังไม่เขียน", "Not written") : t("ปิดแคปชั่นแพลตฟอร์มนี้", "Caption off"))}
              </span>
              {format && <span className="text-[10px] text-slate-500 bg-slate-100 rounded-full px-1.5 shrink-0" title={t("รูปแบบโพสต์", "Post format")}>{postFormatLabel(cap.platform, format, t)}</span>}
              {selectedImages.length > 0 && <span className="text-[11px] text-slate-400 shrink-0" title={t("รูปที่เลือกไว้", "Selected images")}>🖼 {selectedImages.length}</span>}
            </>
          )}
          {open && <span className="flex-1" />}
        </button>
        {/* 👁 ดูตัวอย่าง · 📋 คัดลอกแคปชั่น · 📂 คัดลอก path · ☐ โพสต์แล้ว — กดได้จากหัวการ์ดโดยไม่ต้องกาง (เจ้าของขอ) */}
        <button type="button" onClick={() => setPreviewOpen(true)} disabled={!canPreview}
          title={useCaption ? t("ดูตัวอย่างที่จะโพสต์", "Preview the post") : t("ดูรูปที่จะลง (แพลตฟอร์มนี้ไม่ใช้แคปชั่น)", "Preview the images (no caption on this platform)")}
          className="h-7 w-7 shrink-0 rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 hover:text-violet-700 disabled:opacity-40">👁</button>
        {useCaption && (
          <>
            <button type="button" onClick={() => void copy()} disabled={!preview.trim()} title={t("คัดลอกแคปชั่นที่จะโพสต์ (ประกอบจากแม่แบบ+แฮชแท็ก)", "Copy the assembled caption")}
              className="h-7 w-7 shrink-0 rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 hover:text-violet-700 disabled:opacity-40">📋</button>
            {overLimit && (
              <button type="button" onClick={() => setPreviewOpen(true)} className="h-7 shrink-0 rounded-md border border-rose-300 bg-rose-50 px-1.5 text-[10px] font-medium text-rose-700"
                title={lim.over > 0 ? t(`ยาวเกินลิมิต ${platformLabel(cap.platform)} ${lim.max?.toLocaleString("th-TH")} ตัวอักษร อยู่ ${lim.over.toLocaleString("th-TH")} ตัว`, `${lim.over} chars over the ${lim.max} limit`) : t(`แฮชแท็กเกิน ${lim.maxHashtags} อัน`, `Over ${lim.maxHashtags} hashtags`)}>
                ⚠ {lim.over > 0 ? t(`เกิน ${lim.over.toLocaleString("th-TH")} ตัว`, `+${lim.over}`) : t(`#เกิน ${lim.hashtagsOver}`, `#+${lim.hashtagsOver}`)}
              </button>
            )}
          </>
        )}
        <CopyPathButton paths={paths} onAdd={onAddPath} notify={(type, m) => pushToast(type, m)}
          emptyHint={t("ยังไม่มี path — ผูกงานที่ส่ง path มาแล้ว หรือกดใส่ path เอง", "No path yet — link a task that has one, or add it")} />
        {onSetStatus && (postStatus === "todo" || postStatus === "posted") ? (
          // ป้ายสถานะ = ปุ่มติ๊ก "โพสต์แล้ว" (บันทึกทันที · กดซ้ำ = ยกเลิก) — ข้าม/ตั้งเวลาแล้ว ยังเป็นป้ายเหมือนเดิม
          <button type="button" onClick={() => onSetStatus(postStatus === "posted" ? "todo" : "posted")}
            title={postStatus === "posted" ? t("โพสต์แล้ว — กดอีกครั้งเพื่อยกเลิก", "Posted — click again to undo") : t("โพสต์เสร็จแล้ว → ติ๊กที่นี่ (บันทึกทันที)", "Posted? Tick here (saves instantly)")}
            className={`shrink-0 h-7 inline-flex items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${postStatus === "posted" ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700" : "bg-white text-slate-500 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"}`}>
            <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none ${postStatus === "posted" ? "bg-white text-emerald-600 border-white" : "bg-white border-slate-400"}`}>{postStatus === "posted" ? "✓" : ""}</span>
            {t("โพสต์แล้ว", "Posted")}
          </button>
        ) : (
          <button type="button" onClick={onToggle} className="shrink-0"><span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${stBadge.cls}`}>{stBadge.label}</span></button>
        )}
        {open && menuItems.length > 0 && <div className="shrink-0"><RowMenu items={menuItems} /></div>}
      </div>

      {/* 👁 ป๊อปตัวอย่างโพสต์: รูปที่เลือก + ข้อความที่ประกอบแล้ว (ของกลาง ERPModal) */}
      <ERPModal open={previewOpen} onClose={() => setPreviewOpen(false)} size="sm"
        title={`👁 ${t("ตัวอย่างที่จะโพสต์", "Post preview")} · ${platformLabel(cap.platform)}`}
        footer={<div className="flex items-center justify-between gap-2 w-full">
          <span className={`text-[11px] ${lim.over > 0 ? "text-rose-600 font-medium" : "text-slate-400"}`} title={PLATFORM_LIMITS[cap.platform]?.note ?? ""}>
            {useCaption ? <>
              {lim.chars.toLocaleString("th-TH")}{lim.max != null ? ` / ${lim.max.toLocaleString("th-TH")}` : ""} {t("ตัวอักษร", "chars")}
              {lim.maxHashtags != null ? <span className={lim.hashtagsOver > 0 ? " text-rose-600 font-medium" : ""}> · #{lim.hashtagCount}/{lim.maxHashtags}</span> : null}
            </> : t("ไม่ใช้แคปชั่น — ลงแค่รูป", "No caption — images only")}
            {previewImgKeys.length ? ` · 🖼 ${previewImgKeys.length}` : ""}
          </span>
          <div className="flex gap-2">
            {useCaption && !!preview.trim() && <button type="button" onClick={() => void copy()} className="h-9 px-3 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">📋 {t("คัดลอก", "Copy")}</button>}
            <button type="button" onClick={() => setPreviewOpen(false)} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">{t("ปิด", "Close")}</button>
          </div>
        </div>}>
        <div className="space-y-2">
          {overLimit && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
              ⚠ {lim.over > 0
                ? t(`ข้อความยาว ${lim.chars.toLocaleString("th-TH")} ตัวอักษร เกินลิมิต ${platformLabel(cap.platform)} (${lim.max?.toLocaleString("th-TH")}) อยู่ ${lim.over.toLocaleString("th-TH")} ตัว — ต้องตัดก่อนโพสต์`, `${lim.chars} chars — ${lim.over} over the ${lim.max} limit`)
                : t(`แฮชแท็ก ${lim.hashtagCount} อัน เกินที่ ${platformLabel(cap.platform)} รับ (${lim.maxHashtags}) — ตัดออก ${lim.hashtagsOver} อัน`, `${lim.hashtagCount} hashtags — ${lim.hashtagsOver} over the ${lim.maxHashtags} limit`)}
            </div>
          )}
          <div className="rounded-xl bg-slate-100 p-3">
            <PostMockup platform={cap.platform} pageName={pageName} avatarUrl={avatarUrl} format={format} text={preview} t={t}
              images={previewImgKeys.map((k) => postImages.find((im) => im.key === k)).filter((im): im is PostImage => !!im)} />
          </div>
          <p className="text-[10px] text-slate-400 text-center">{t("ภาพจำลองหน้าตาโพสต์ — ของจริงอาจต่างเล็กน้อยตามแอป/ขนาดจอ", "Mock-up — the real post may differ slightly")}</p>
        </div>
      </ERPModal>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {/* สถานะเชื่อมบัญชี (Facebook/Instagram): เชื่อมแล้วโพสต์จริงได้ · ยังไม่เชื่อม = โพสต์มือ + ลิงก์ไปตั้งค่า */}
          {connInfo && (
            <div className={`flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 border ${connInfo.connected ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <span>{connInfo.connected ? "🔗" : "⚠️"}</span>
              <span className="flex-1 min-w-0 truncate">{connInfo.label}</span>
              <a href={connInfo.href} target="_blank" rel="noreferrer" className="shrink-0 underline hover:no-underline">{connInfo.connected ? t("เปลี่ยน", "Change") : t("เชื่อมบัญชี", "Connect")} ↗</a>
            </div>
          )}
          {/* แม่แบบ — เปลี่ยนเป็นช่องเลือกเล็ก ๆ (เดิมเป็นชิปกางเต็มแถว) */}
          {(POST_FORMATS[cap.platform] ?? []).length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 shrink-0">🎬 {t("ลงเป็น", "Post as")}</span>
              <select value={format ?? ""} onChange={(e) => onSetFormat?.(e.target.value)} className="h-7 text-xs border border-slate-200 rounded-md px-1.5 bg-white">
                <option value="">{t("อัตโนมัติ (ดูจากสื่อที่เลือก)", "Auto (from media)")}</option>
                {(POST_FORMATS[cap.platform] ?? []).map((f) => <option key={f.key} value={f.key}>{t(f.th, f.en)}</option>)}
              </select>
              {format === "story" && (cap.platform === "facebook"
                ? <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5" title={t("กดโพสต์เลย = ขึ้น Story ของเพจอัตโนมัติ (ตั้งเวลาล่วงหน้าไม่ได้)", "Auto-posts to the Page story")}>{t("ยิง Story ได้", "Auto story")}</span>
                : cap.platform === "instagram"
                  ? <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5" title={t("IG Story ต้องรอ Meta อนุมัติสิทธิ์ (App Review) — ระหว่างนี้โพสต์มือ", "IG story needs Meta App Review")}>{t("IG Story รอสิทธิ์", "IG story pending")}</span>
                  : <span className="text-[10px] text-slate-500 bg-slate-100 rounded-full px-1.5">{t("โพสต์มือ", "Manual")}</span>)}
            </div>
          )}
          {useCaption && templates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 shrink-0">📑 {t("แม่แบบ", "Template")}</span>
              <select value={typeKey} onChange={(e) => onChange({ caption_type: e.target.value })} className="h-7 text-xs border border-slate-200 rounded-md px-1.5 bg-white max-w-[60%]">
                {templates.map((tp) => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
              </select>
            </div>
          )}
          {useCaption
            ? <ERPTextarea value={cap.caption ?? ""} rows={3} onChange={(e) => onChange({ caption: e.target.value })} placeholder={t(`เขียน caption สำหรับ ${platformLabel(cap.platform)}...`, `Write caption for ${platformLabel(cap.platform)}...`)} />
            : <p className="text-[11px] text-slate-400 italic bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">{t("ปิดแคปชั่นสำหรับแพลตฟอร์มนี้ (เปิดได้ที่ ⚙️ ตั้งค่าแพลตฟอร์ม)", "Caption off for this platform (toggle in ⚙️ Platform settings)")}</p>}
          {useHashtags && <HashtagInput value={cap.hashtags} onChange={(v) => onChange({ hashtags: v })} brandId={brandId} platform={cap.platform} pushToast={pushToast} />}
          {/* ตัวอย่างจริง — เฉพาะเมื่อแม่แบบเติมข้อความเพิ่ม (ไม่งั้นซ้ำกับช่องบน) */}
          {useCaption && tplAddsText && (cap.caption ?? "").trim() && (
            <details className="group">
              <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-violet-700 list-none">👁 {t("ดูตัวอย่างที่จะโพสต์ (ประกอบจากแม่แบบ)", "Preview (assembled from template)")}</summary>
              <pre className="mt-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed">{preview || "—"}</pre>
            </details>
          )}

          {/* ── รูป + สถานะโพสต์ รวมอยู่ท้ายเดียว (เดิมแยก 2 บล็อกมีเส้นคั่น 2 เส้น) ── */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 mt-1 shrink-0">🖼 {t("รูป", "Images")}</span>
              {postImages.length === 0
                ? <span className="text-[11px] text-slate-300 italic mt-1">{t("ยังไม่มีรูป — แนบที่ส่วน “แนบเพิ่มเอง” หรือผูกงานก่อน", "No media yet — attach in “Attach” section or link a task first")}</span>
                : imgEdit
                  ? (   // โหมดเลือก: โชว์รูปทั้งหมดให้ติ๊ก
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      {postImages.map((im) => { const on = selectedImages.includes(im.key); return (
                        <button key={im.key} type="button" onClick={() => onToggleImage?.(im.key)} title={im.label ?? ""} className={`relative h-12 w-12 rounded-md overflow-hidden border-2 transition-all ${on ? "border-violet-500 ring-1 ring-violet-300" : "border-slate-200 opacity-60 hover:opacity-100"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r2ImageUrl(im.key, 120) ?? ""} alt="" className="w-full h-full object-cover" />
                          {im.type === "video" && <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/60 text-white px-1 rounded">🎬</span>}
                          {on && <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center shadow">✓</span>}
                        </button>
                      ); })}
                    </div>
                  )
                  : selectedImages.length === 0
                    ? <span className="text-[11px] text-slate-300 italic mt-1">{t("ยังไม่เลือกรูป", "No image selected")}</span>
                    : (   // ปกติ: เฉพาะรูปที่เลือก · รูปแรก = รูปใหญ่
                      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                        {selectedImages.map((key, idx) => { const im = postImages.find((p) => p.key === key); if (!im) return null; const isMain = idx === 0; return (
                          <div key={key} className={`group/mi relative h-12 w-12 rounded-md overflow-hidden border-2 ${isMain ? "border-violet-500" : "border-slate-200"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r2ImageUrl(key, 140) ?? ""} alt="" className="w-full h-full object-cover" />
                            {im.type === "video" && <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/60 text-white px-1 rounded">🎬</span>}
                            {isMain
                              ? <span className="absolute top-0.5 left-0.5 text-[8px] bg-violet-600 text-white px-1 rounded shadow" title={t("รูปใหญ่", "Main")}>⭐</span>
                              : onSetMain && <button type="button" onClick={() => onSetMain(key)} title={t("ตั้งเป็นรูปใหญ่", "Set as main")} className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[9px] font-medium opacity-0 group-hover/mi:opacity-100 transition-opacity">⭐</button>}
                          </div>
                        ); })}
                      </div>
                    )}
              {postImages.length > 0 && (
                <button type="button" onClick={() => setImgEdit((v) => !v)} className="text-[11px] font-medium text-violet-700 hover:underline mt-1 shrink-0 ml-auto">
                  {imgEdit ? `✓ ${t("เสร็จ", "Done")}` : `✏️ ${t("เลือก/แก้รูป", "Choose")}`}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {canAi && useCaption && contentId && (
                <button onClick={onAiWrite} disabled={aiBusy} title={t("ให้ AI อ่านรูปที่แนบ + แฮชแท็ก แล้วเขียนแคปชั่นให้", "Let AI read the attached images + hashtags and write the caption")}
                  className="h-7 px-2.5 text-xs font-medium text-fuchsia-700 border border-fuchsia-200 rounded-md hover:bg-fuchsia-50 disabled:opacity-50">{aiBusy ? t("✨ กำลังเขียน...", "✨ Writing...") : t("✨ AI เขียน", "✨ AI write")}</button>
              )}
              <button onClick={copy} className="h-7 px-2.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">📋 {t("คัดลอกทั้งหมด", "Copy all")}</button>
              <span className="flex-1" />
              {postStatus !== "skip" && (
                <button onClick={() => onRequestPost?.(preview)} title={canAuto ? t(`โพสต์ขึ้น ${autoLabel} จริง`, `Publish to ${autoLabel}`) : t("คัดลอกแคปชั่น + เปิดหน้าโพสต์ของแพลตฟอร์มนี้", "Copy caption + open this platform's post page")} className={`h-7 inline-flex items-center gap-1 text-xs font-medium text-white rounded-md px-2.5 ${canAuto ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700"}`}>{canAuto ? `🚀 ${t("โพสต์ขึ้น", "Post to")} ${autoLabel}` : `📤 ${t("ไปโพสต์ที่", "Post on")} ${platformLabel(cap.platform)}`}</button>
              )}
            </div>
            {(postStatus === "posted" || postStatus === "scheduled") && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 shrink-0">{t("ลิงก์ที่ลง", "Posted link")}</span>
                <input value={postedUrl} onChange={(e) => onSetPostedUrl?.(e.target.value)} onBlur={() => onCommitPostedUrl?.()} placeholder="https://..." className="flex-1 min-w-0 h-7 border border-slate-200 rounded-md px-2 text-xs" />
                {postedUrl.trim() && <a href={postedUrl} target="_blank" rel="noreferrer" title={t("เปิดโพสต์", "Open post")} className="text-xs text-violet-700 hover:underline shrink-0">↗</a>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ป๊อปอัปกลาง "ให้ AI เขียนแคปชั่น" — ใช้ทั้งปุ่มเขียนทั้งหมด / ปุ่ม ✨ ของแต่ละช่อง / สั่งรวบจากหน้ารายการ
// ใส่คำสั่งเพิ่มครั้งนี้ได้ (ไม่กระทบ prompt ที่ตั้งไว้) · เลือกได้ว่าทับของเดิมหรือเขียนเฉพาะช่องว่าง
// บอกค่าใช้จ่ายคร่าว ๆ ก่อนกด เพราะกดแล้วมีค่าใช้จ่ายจริง
export function AiCaptionModal({ platformLabels, filledCount, contentCount = 1, busy, onClose, onRun }: {
  platformLabels: string[];
  filledCount: number;                 // จำนวนช่องที่มีข้อความอยู่แล้ว
  contentCount?: number;               // จำนวนคอนเทนต์ (สั่งรวบจากหน้ารายการ)
  busy: boolean;
  onClose: () => void;
  onRun: (extra: string, overwrite: boolean) => void;
}) {
  const t = useT();
  const [extra, setExtra] = useState("");
  // ตั้งต้นแบบปลอดภัย/ประหยัด: ถ้ามีของเดิมอยู่ หรือสั่งหลายคอนเทนต์ → ไม่ทับ
  const [overwrite, setOverwrite] = useState(filledCount === 0 && contentCount === 1);
  // ประมาณค่าใช้จ่าย: ยิง 1 ครั้งต่อคอนเทนต์ · รูป ≤7 ใบ ≈ 2,800 token/ใบ + ข้อความ ~600 (gpt-4o-mini, 36 บาท/USD)
  const estBaht = Math.max(0.01, contentCount * ((7 * 2800 + 600) * 0.15 / 1e6 + (platformLabels.length * 350) * 0.6 / 1e6) * 36);
  return (
    <ERPModal open onClose={busy ? () => {} : onClose} size="md" title={t("✨ ให้ AI เขียนแคปชั่น", "✨ AI write captions")}
      description={contentCount > 1
        ? t(`${contentCount} คอนเทนต์ที่เลือก — ใช้ prompt ที่ตั้งไว้ของแต่ละแพลตฟอร์ม และบันทึกให้เลย`, `${contentCount} selected — uses each platform's prompt and saves automatically`)
        : t("ใช้ prompt ที่ตั้งไว้ของแต่ละแพลตฟอร์ม + อ่านรูปที่แนบ", "Uses each platform's prompt + reads attached images")}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">{t("ค่าใช้จ่ายประมาณ", "Approx. cost")} ~{estBaht < 0.1 ? estBaht.toFixed(2) : estBaht.toFixed(1)} {t("บาท", "THB")}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => onRun(extra, overwrite)} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700 disabled:opacity-50">
              {busy ? t("กำลังเขียน...", "Writing...") : t("✨ เขียนเลย", "✨ Write")}
            </button>
          </div>
        </div>}>
      <div className="space-y-3">
        {contentCount === 1 && (
          <div className="flex flex-wrap gap-1.5">
            {platformLabels.map((p) => <span key={p} className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{p}</span>)}
          </div>
        )}
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{t("คำสั่งเพิ่มครั้งนี้ (ไม่ใส่ก็ได้)", "Extra instruction for this run (optional)")}</span>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} disabled={busy}
            placeholder={t("เช่น เน้นโปรลด 20% ถึงสิ้นเดือน / ใช้คำสุภาพ ไม่ต้องมีอีโมจิ", "e.g. push the 20% promo, no emojis")}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-300" />
          <span className="text-[11px] text-slate-400">{t("ใช้แค่ครั้งนี้ ไม่ทับ prompt ที่ตั้งไว้ในตั้งค่า", "Applies to this run only — your saved prompt is unchanged")}</span>
        </label>
        {(filledCount > 0 || contentCount > 1) && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-600">{filledCount > 0
              ? t(`มี ${filledCount} ช่องที่เขียนไว้แล้ว`, `${filledCount} already written`)
              : t("ช่องที่เขียนไว้แล้ว", "Captions that already exist")}</span>
            {([[false, t("เขียนเฉพาะช่องที่ยังว่าง (ประหยัดกว่า)", "Only fill empty ones (cheaper)")], [true, t("เขียนใหม่ทับทั้งหมด", "Rewrite everything")]] as [boolean, string][]).map(([v, lb]) => (
              <label key={String(v)} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={overwrite === v} onChange={() => setOverwrite(v)} disabled={busy} />{lb}
              </label>
            ))}
          </div>
        )}
      </div>
    </ERPModal>
  );
}

// ป๊อป "⇈ ดึงแคปชั่นจากแพลตฟอร์มอื่น" — ทางกลับของ "ใช้แคปชั่นนี้กับแพลตฟอร์มอื่น"
// เลือกต้นทาง (เห็นข้อความก่อน) + เลือกว่าจะเอาแคปชั่น/แฮชแท็ก · เตือนถ้าจะทับของเดิม / ยาวเกินลิมิตของแพลตฟอร์มปลายทาง
export function PullCaptionModal({ target, caps, settings, onClose, onApply }: {
  target: string; caps: ContentCaption[]; settings: PlatformSettings;
  onClose: () => void; onApply: (from: string, opts: { caption: boolean; hashtags: boolean }) => void;
}) {
  const t = useT();
  const useCaption = settings[target]?.use_caption !== false;
  const useHashtags = settings[target]?.use_hashtags !== false;
  // ข้อความที่ต้นทาง "ใช้จริง" — แพลตฟอร์มที่ปิดแคปชั่น/แฮชแท็ก (เช่น Shopee/Lazada) มีแค่แฮชแท็กตั้งต้นค้างไว้ ไม่นับเป็นต้นทาง
  const capOf = (c: ContentCaption) => (settings[c.platform]?.use_caption !== false ? (c.caption ?? "").trim() : "");
  const tagsOf = (c: ContentCaption) => (settings[c.platform]?.use_hashtags !== false ? (c.hashtags ?? "").trim() : "");
  const sources = caps.filter((c) => c.platform !== target && (capOf(c) || tagsOf(c)));
  const [from, setFrom] = useState<string>(() => sources.find((c) => capOf(c))?.platform ?? sources[0]?.platform ?? "");
  const [wantCap, setWantCap] = useState(true);
  const [wantTags, setWantTags] = useState(true);
  const src = sources.find((c) => c.platform === from);
  const cur = caps.find((c) => c.platform === target);
  const srcCap = src ? capOf(src) : "", srcTags = src ? tagsOf(src) : "";
  const doCap = useCaption && wantCap && !!srcCap;
  const doTags = useHashtags && wantTags && !!srcTags;
  const willOverwrite = [doCap && (cur?.caption ?? "").trim() ? t("แคปชั่น", "caption") : null, doTags && (cur?.hashtags ?? "").trim() ? t("แฮชแท็ก", "hashtags") : null].filter(Boolean) as string[];
  const lim = captionLimitCheck(target, [doCap ? srcCap : (cur?.caption ?? ""), doTags ? srcTags : (cur?.hashtags ?? "")].filter((x) => x.trim()).join("\n\n"));
  const firstLine = (x: string | null) => (x ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return (
    <ERPModal open onClose={onClose} size="md" title={`⇈ ${t("ดึงแคปชั่นมาใส่", "Pull caption into")} ${platformLabel(target)}`}
      description={t("เลือกแพลตฟอร์มที่เขียนไว้แล้ว แล้วก๊อปมาใส่ช่องนี้ (แก้ต่อได้ · กดบันทึกเพื่อเก็บ)", "Pick a platform that's already written and copy it here (editable · press Save to keep)")}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => onApply(from, { caption: doCap, hashtags: doTags })} disabled={!doCap && !doTags}
            className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">⇈ {t("ดึงมาใส่", "Pull in")}</button>
        </div>}>
      {sources.length === 0 ? (
        <p className="text-sm text-slate-400 italic rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">{t("ยังไม่มีแพลตฟอร์มอื่นที่เขียนแคปชั่นไว้", "No other platform has a caption yet")}</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {sources.map((c) => {
              const on = c.platform === from; const cl = capOf(c);
              return (
                <button key={c.platform} type="button" onClick={() => setFrom(c.platform)}
                  className={`w-full text-left rounded-lg border px-2.5 py-2 flex items-start gap-2 ${on ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${on ? "border-violet-600 bg-violet-600 shadow-[inset_0_0_0_2px_white]" : "border-slate-300"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><PlatformChip code={c.platform} /><span className="text-[10px] text-slate-400">{cl ? `${Array.from(cl).length.toLocaleString("th-TH")} ${t("ตัวอักษร", "chars")}` : t("มีแต่แฮชแท็ก", "hashtags only")}</span></span>
                    <span className="mt-0.5 block text-xs text-slate-600 truncate">{firstLine(cl) || firstLine(tagsOf(c))}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {src && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
              <label className={`flex items-start gap-2 text-xs ${useCaption && srcCap ? "text-slate-700" : "text-slate-400"}`}>
                <input type="checkbox" className="mt-0.5" checked={doCap} disabled={!useCaption || !srcCap} onChange={(e) => setWantCap(e.target.checked)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t("แคปชั่น", "Caption")}</span>
                  {!useCaption ? <span className="ml-1 text-[11px]">({t(`${platformLabel(target)} ตั้งไม่ใช้แคปชั่น`, `caption is off for ${platformLabel(target)}`)})</span> : !srcCap ? <span className="ml-1 text-[11px]">({t("ต้นทางไม่มีแคปชั่น", "source has none")})</span> : null}
                  {srcCap && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-600 bg-white border border-slate-200 rounded-md p-2">{srcCap}</pre>}
                </span>
              </label>
              <label className={`flex items-start gap-2 text-xs ${useHashtags && srcTags ? "text-slate-700" : "text-slate-400"}`}>
                <input type="checkbox" className="mt-0.5" checked={doTags} disabled={!useHashtags || !srcTags} onChange={(e) => setWantTags(e.target.checked)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t("แฮชแท็ก", "Hashtags")}</span>
                  {!useHashtags ? <span className="ml-1 text-[11px]">({t(`${platformLabel(target)} ตั้งไม่ใช้แฮชแท็ก`, `hashtags are off for ${platformLabel(target)}`)})</span> : !srcTags ? <span className="ml-1 text-[11px]">({t("ต้นทางไม่มีแฮชแท็ก", "source has none")})</span> : <span className="block text-[11px] text-slate-500 break-words">{srcTags}</span>}
                </span>
              </label>
            </div>
          )}
          {willOverwrite.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">⚠ {t(`${platformLabel(target)} มี${willOverwrite.join("และ")}อยู่แล้ว — จะถูกแทนที่ (ยังไม่บันทึกจนกว่าจะกดบันทึก)`, `${platformLabel(target)} already has ${willOverwrite.join(" and ")} — it will be replaced (not saved until you press Save)`)}</p>
          )}
          {(lim.over > 0 || lim.hashtagsOver > 0) && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">⚠ {lim.over > 0
              ? t(`ยาว ${lim.chars.toLocaleString("th-TH")} ตัวอักษร เกินลิมิต ${platformLabel(target)} (${lim.max?.toLocaleString("th-TH")}) — ดึงมาแล้วต้องตัดให้สั้นลง`, `${lim.chars} chars — over the ${lim.max} limit; trim it after pulling`)
              : t(`แฮชแท็ก ${lim.hashtagCount} อัน เกินที่ ${platformLabel(target)} รับ (${lim.maxHashtags})`, `${lim.hashtagCount} hashtags — over the ${lim.maxHashtags} limit`)}</p>
          )}
        </div>
      )}
    </ERPModal>
  );
}
