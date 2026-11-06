"use client";
// การ์ด "รายการงานที่ต้องการ" ในป๊อปโพสต์ (ฝั่งซ้าย) — คุยกับพนักงานว่าต้องการงานแบบไหน
// โน้ตจัดรูปแบบ (หนา/เอียง/ธรรมดา/bullet) + โหมดแปลฟรี + Ref รูป/ลิงก์ สูงสุด 6 ช่อง
// เก็บที่ erp_creative_content.brief (HTML) / ref_image_keys / ref_links — ช่องเดียวกับหน้าวางแผนคอนเทนต์
// บันทึกเอง: โน้ต = ตอนคลิกออกจากกล่อง (หรือปิดป๊อป) · Ref = ทันทีที่เพิ่ม/ลบ
// ช่อง Ref = BriefRefSlots (brief-ref-slots.tsx) · ปุ่มเทมเพลต = BriefTemplatePicker (brief-templates.tsx — เลือกแล้วต่อท้าย + บันทึกทันที · ย้อนกลับได้)
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { RichTextEditor } from "@/components/rich-text";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { noteToHtml, noteToText, isEmptyNote } from "@/lib/rich-note";
import { translateNoteHtml } from "@/lib/content-translate";
import { appendBriefTemplate, type BriefTemplate } from "@/lib/brief-templates";
import { updateContent } from "../data";
import { BriefRefSlots, type BriefRefLink } from "./brief-ref-slots";
import { BriefTemplatePicker } from "./brief-templates";

const hasThai = (s: string) => /[฀-๿]/.test(s);

export function ContentBriefCard({ contentId, brief, refImageKeys, refLinks, brandId, brands, pushToast, style }: {
  contentId: string;
  brief: string | null | undefined;
  refImageKeys: string[];
  refLinks: BriefRefLink[];
  /** แบรนด์ของโพสต์ — เทมเพลตของแบรนด์นี้ขึ้นก่อน */
  brandId: string | null;
  brands: { id: string; name: string; color?: string | null }[];
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
    try { setTr({ src: html, html: await translateNoteHtml(html, toLang, { place: "content", free: true }) }); }
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

  // ── เทมเพลต: ต่อท้ายโน้ต + รวม Ref (ตัวเดิม ไม่อัปซ้ำ) แล้วบันทึกทันที · มีปุ่มย้อนกลับ ──
  type Snap = { html: string; images: string[]; links: BriefRefLink[] };
  const [applied, setApplied] = useState<{ name: string; before: Snap } | null>(null);
  const persistAll = async (s: Snap) => {
    await updateContent(contentId, { brief: isEmptyNote(s.html) ? null : s.html, ref_image_keys: s.images, ref_links: s.links });
    savedRef.current = isEmptyNote(s.html) ? "" : s.html;
  };
  const applyTemplate = async (tpl: BriefTemplate) => {
    const before: Snap = { html: htmlRef.current, images: imgs, links };
    const next = appendBriefTemplate(before, tpl);
    setMode("orig"); setHtml(next.html); setImgs(next.images); setLinks(next.links);
    setApplied({ name: tpl.name, before });
    if (next.skipped) pushToast("info", t(`Ref เต็ม 6 ช่องแล้ว — ข้าม ${next.skipped} อันของเทมเพลต`, `Refs are full (6) — skipped ${next.skipped} from the template`));
    setSaveState("saving");
    try { await persistAll(next); setSaveState("saved"); }
    catch (e) { setHtml(before.html); setImgs(before.images); setLinks(before.links); setApplied(null); setSaveState("idle"); pushToast("error", t("ใช้เทมเพลตไม่สำเร็จ: ", "Couldn't apply the template: ") + (e as Error).message); }
  };
  const undoTemplate = async () => {
    if (!applied) return;
    const b = applied.before;
    setHtml(b.html); setImgs(b.images); setLinks(b.links); setApplied(null);
    try { await persistAll(b); setSaveState("saved"); }
    catch (e) { pushToast("error", t("ย้อนกลับไม่สำเร็จ: ", "Couldn't undo: ") + (e as Error).message); }
  };

  return (
    <div style={style} className="border border-amber-200 rounded-xl bg-amber-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
        <span className="text-sm font-semibold text-amber-900 flex items-center gap-1.5 whitespace-nowrap"><Icon name="note" /> {t("รายการงานที่ต้องการ", "Work brief")}</span>
        <div className="flex items-center gap-1.5 ml-auto">
        <BriefTemplatePicker brandId={brandId} brands={brands} onMessage={pushToast} onApply={(tpl) => void applyTemplate(tpl)}
          getCurrent={() => ({ html: htmlRef.current, images: imgs, links })} />
        <div className="inline-flex rounded-lg border border-amber-200 overflow-hidden text-[11px] bg-white shrink-0">
          <button type="button" onClick={() => setMode("orig")} className={`px-2 h-7 ${mode === "orig" ? "bg-amber-100 text-amber-900 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>{t("ต้นฉบับ", "Original")}</button>
          <button type="button" onClick={openTranslate} disabled={isEmptyNote(html)} title={t("แปลฟรี (ไม่บันทึกทับต้นฉบับ)", "Free translation (original is kept)")}
            className={`px-2 h-7 border-l border-amber-200 inline-flex items-center gap-1 disabled:opacity-40 ${mode === "tr" ? "bg-amber-100 text-amber-900 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>
            <Icon name="web" /> {toLang === "en" ? t("แปลเป็น English", "To English") : t("แปลเป็นไทย", "To Thai")}
          </button>
        </div>
        </div>
      </div>
      {applied && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] text-emerald-800">
          <span className="min-w-0 truncate"><Icon name="done" /> {t(`ใช้เทมเพลต "${applied.name}" แล้ว · บันทึกให้แล้ว`, `Applied "${applied.name}" · saved`)}</span>
          <button type="button" onClick={() => void undoTemplate()} className="shrink-0 h-6 px-2 rounded-md border border-emerald-300 bg-white hover:bg-emerald-100">{t("ย้อนกลับ", "Undo")}</button>
        </div>
      )}
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
