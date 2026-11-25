"use client";

// ============================================================
// ชิ้นส่วนของป๊อป "✨ ให้ AI ร่างรายละเอียดสินค้า" แบบ 5 ขั้น (เจ้าของเลือก 2026-11-25)
//   ImageStrip       — รูปที่ AI จะดู (ข้างซ้ายทุกขั้น · มือถือ = แถบเลื่อนบน) · กดขยาย · ติ๊กเอารูปออกได้
//   TemplatePicker   — ชุดแม่แบบ (Theme) = ลำดับหัวข้อ + รูปแบบ Description · ตั้งค่าเริ่มต่อแบรนด์ · เพิ่ม/แก้/ลบ (ถังขยะ) + ย้อนกลับ
//   RuleQuickEditor  — "⚙ ตั้งค่าหัวข้อ" ในขั้น 2: แก้กฎของประเภทสินค้านี้ได้ทันที (หัวข้อ · คำตอบให้เลือก · บังคับ ·
//                      รายการจุดเด่น · ช่องกรอกมือที่บังคับ) · ทุกการแก้ลง audit + ปุ่มย้อนกลับ
//   CreateTagModal   — ค้นแท็กไม่เจอ → สร้างแท็กใหม่ (ชื่อไทย/อังกฤษ/กลุ่ม) + สร้างกฎประเภทไปด้วย · ย้อนกลับได้
//   WarrantySelect   — ประกันแบบ dropdown (รายการตั้งได้) + "อื่น ๆ (พิมพ์เอง)"
//   แกน pure = lib/ai-draft-setup
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { Spinner } from "@/components/spinner";
import { Popover } from "@/components/popover";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  DRAFT_SETUP_KEY, MANUAL_FIELDS, normalizeExtras, normalizeSetup, topicsToText,
  type DescTemplate, type DraftSetup, type MaterialRule, type RuleExtras, type TagSetup,
} from "@/lib/ai-draft-setup";

/** ✨ ให้ AI ช่วยคิดการตั้งค่าประเภทสินค้า (/api/ai/tag-setup · รุ่นถูก gpt-4o-mini · ~0.02 บาท/ครั้ง) */
function useTagSetupAi() {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (body: { name: string; name_en?: string; groups?: { id: string; name: string }[]; slots?: { id: string; name: string }[] }): Promise<TagSetup | null> => {
    if (!body.name.trim()) { toast.warning(t("ใส่ชื่อไทยของประเภทสินค้าก่อน", "Enter the Thai name first")); return null; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/ai/tag-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      return j.data as TagSetup;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("AI ช่วยคิดไม่สำเร็จ", "AI helper failed")); return null; }
    finally { setBusy(false); }
  };
  return { busy, run };
}
const AI_BTN = "h-7 px-2.5 text-[12px] rounded-lg border border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 disabled:opacity-50 inline-flex items-center gap-1";
const aiMark = (on: boolean) => (on ? " bg-fuchsia-50/60 border-fuchsia-200" : "");

export type ImageGroupKey = "parent" | "desc" | "sku";
const GROUP_LABEL: Record<ImageGroupKey, [string, string]> = { parent: ["รูป Parent SKU", "Parent SKU images"], desc: ["รูป Description", "Description images"], sku: ["รูป SKU ลูก", "Child SKU images"] };

// ── รูปที่ AI จะดู ─────────────────────────────────────────
export function ImageStrip({ keys, groups, max, skip, onToggleSkip }: {
  keys: string[] | null; groups?: Record<string, ImageGroupKey>; max: number; skip: string[]; onToggleSkip: (key: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(-1);
  if (keys === null) return <div className="p-3 text-[12px] text-slate-400"><Spinner /> {t("กำลังโหลดรูป…", "Loading images…")}</div>;
  if (keys.length === 0) return <div className="p-3 text-[12px] text-slate-400">{t("สินค้านี้ยังไม่มีรูป — AI จะเขียนจากข้อมูลอย่างเดียว", "No images yet — AI writes from data only")}</div>;
  const used = keys.filter((k) => !skip.includes(k)).slice(0, max);
  // แบ่งกลุ่ม Parent SKU → รูป Description → SKU ลูก (เจ้าของเลือกแบบ A 2026-11-25) · ไม่มีข้อมูลกลุ่ม = กลุ่มเดียว
  const order: ImageGroupKey[] = ["parent", "desc", "sku"];
  const sections = groups
    ? order.map((g) => ({ g, list: keys.filter((k) => (groups[k] ?? "parent") === g) })).filter((x) => x.list.length)
    : [{ g: "parent" as ImageGroupKey, list: keys }];
  return (
    <div className="flex sm:block gap-3 overflow-x-auto sm:overflow-visible">
      {sections.map(({ g, list }) => (
      <div key={g} className="shrink-0 sm:shrink sm:mb-2">
      {groups && <p className="text-[11px] font-medium text-slate-500 mb-1">{t(...GROUP_LABEL[g])} ({list.length})</p>}
      <div className="flex sm:grid sm:grid-cols-3 gap-1.5">
        {list.map((k) => {
          const i = keys.indexOf(k);
          const off = skip.includes(k);
          const inSet = used.includes(k);
          return (
            <div key={k} className={`relative shrink-0 ${i === 0 ? "sm:col-span-3" : ""}`}>
              <button type="button" onClick={() => setOpen(i)} title={t("กดเพื่อขยาย", "Click to enlarge")}
                className={`block rounded-lg overflow-hidden border bg-slate-50 ${i === 0 ? "w-24 h-24 sm:w-full sm:h-36" : "w-16 h-16 sm:w-full sm:h-14"} ${off ? "opacity-30 border-slate-200" : inSet ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r2ImageUrl(k, i === 0 ? 400 : 160) ?? ""} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
              {/* ติ๊ก = ให้ AI ดูรูปนี้ · เอาติ๊กออก = ข้ามรูปนี้ */}
              <label className="absolute top-1 left-1 bg-white/90 rounded px-0.5 leading-none cursor-pointer" title={off ? t("กดเพื่อให้ AI ดูรูปนี้", "Include this image") : t("กดเพื่อไม่ให้ AI ดูรูปนี้", "Exclude this image")}>
                <input type="checkbox" checked={!off} onChange={() => onToggleSkip(k)} className="h-3.5 w-3.5 accent-fuchsia-600 align-middle" />
              </label>
            </div>
          );
        })}
      </div>
      </div>
      ))}
      <p className="mt-1 text-[11px] text-slate-400 shrink-0 w-32 sm:w-auto">
        {t(`AI ดู ${used.length} รูป (สูงสุด ${max}) · กดรูปเพื่อขยาย · เอาติ๊กออก = ข้ามรูปนั้น`, `AI views ${used.length} images (max ${max}) · click to enlarge · untick to skip`)}
      </p>
      <ImageLightbox images={keys.map((k) => ({ url: r2ImageUrl(k, 2000) ?? "", thumbUrl: r2ImageUrl(k, 200) }))}
        index={open} onClose={() => setOpen(-1)} onIndex={setOpen} thumbnails />
    </div>
  );
}

// ── ชุดแม่แบบ (Theme) ──────────────────────────────────────
export function useDraftSetup() {
  const [setup, setSetup] = useState<DraftSetup | null>(null);
  useEffect(() => {
    apiFetch(`/api/ui-config?key=${DRAFT_SETUP_KEY}`).then((r) => r.json())
      .then((j) => setSetup(normalizeSetup(j.value)))
      .catch(() => setSetup(normalizeSetup(null)));
  }, []);
  const save = async (next: DraftSetup) => {
    const j = await apiFetch("/api/ui-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: DRAFT_SETUP_KEY, value: next }),
    }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    setSetup(next);
  };
  return { setup, save };
}

const EMPTY_TPL: DescTemplate = { id: "", name: "", headings: [], format: "", intro: "" };

export function TemplatePicker({ setup, save, value, onChange, brandId, canEdit }: {
  setup: DraftSetup; save: (s: DraftSetup) => Promise<void>;
  value: string | null; onChange: (id: string) => void; brandId?: string | null; canEdit: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [edit, setEdit] = useState<DescTemplate | null>(null);
  const [headText, setHeadText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const live = setup.templates.filter((x) => !x.archived);
  const trash = setup.templates.filter((x) => x.archived);
  const brandDefault = brandId ? setup.brand_default[brandId] : undefined;

  const commit = async (next: DraftSetup, msg: string) => {
    const prev = setup;
    setBusy(true);
    try {
      await save(next);
      toast.undo(msg, async () => { try { await save(prev); } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); } });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const headings = headText.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!edit.name.trim() || headings.length === 0) { toast.warning(t("ใส่ชื่อแม่แบบและหัวข้ออย่างน้อย 1 บรรทัด", "Enter a name and at least one heading")); return; }
    const id = edit.id || `tpl_${Date.now().toString(36)}`;
    const intro = (edit.intro ?? "").trim();
    const row: DescTemplate = { id, name: edit.name.trim(), headings, format: edit.format.trim(), ...(intro ? { intro } : {}) };
    const exists = setup.templates.some((x) => x.id === id);
    await commit({ ...setup, templates: exists ? setup.templates.map((x) => (x.id === id ? row : x)) : [...setup.templates, row] },
      exists ? t(`แก้แม่แบบ "${row.name}" แล้ว`, `Template "${row.name}" updated`) : t(`เพิ่มแม่แบบ "${row.name}" แล้ว`, `Template "${row.name}" added`));
    setEdit(null);
    onChange(id);
  };
  const setArchived = async (tp: DescTemplate, archived: boolean) => {
    if (archived && live.length <= 1) { toast.warning(t("ต้องเหลือแม่แบบอย่างน้อย 1 ตัว", "Keep at least one template")); return; }
    const bd = { ...setup.brand_default };
    if (archived) for (const k of Object.keys(bd)) if (bd[k] === tp.id) delete bd[k];
    await commit({ ...setup, templates: setup.templates.map((x) => (x.id === tp.id ? { ...x, archived } : x)), brand_default: bd },
      archived ? t(`ย้าย "${tp.name}" ไปถังขยะแล้ว`, `"${tp.name}" moved to trash`) : t(`กู้ "${tp.name}" คืนแล้ว`, `"${tp.name}" restored`));
    if (archived && value === tp.id) onChange(live.find((x) => x.id !== tp.id)?.id ?? "");
  };
  const setBrandDefault = async (id: string) => {
    if (!brandId) return;
    await commit({ ...setup, brand_default: { ...setup.brand_default, [brandId]: id } }, t("ตั้งเป็นแม่แบบเริ่มต้นของแบรนด์นี้แล้ว", "Set as this brand's default"));
  };

  if (edit) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-2">
        <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t("ชื่อแม่แบบ เช่น แม่แบบกระเป๋า", "Template name, e.g. Bag template")}
          className="w-full h-8 px-2.5 text-[13px] border border-slate-200 rounded-lg bg-white" />
        <div>
          <p className="text-[11.5px] text-slate-500 mb-1">{t("หัวข้อ Description เรียงตามลำดับ (บรรทัดละหัวข้อ)", "Description headings in order (one per line)")}</p>
          <textarea value={headText} onChange={(e) => setHeadText(e.target.value)} rows={5} placeholder={"จุดเด่น\nวัสดุ\nขนาด\nการดูแล"}
            className="w-full px-2.5 py-2 text-[12.5px] border border-slate-200 rounded-lg bg-white" />
        </div>
        <input value={edit.format} onChange={(e) => setEdit({ ...edit, format: e.target.value })}
          placeholder={t("รูปแบบ เช่น บรรทัดละข้อ ขึ้นต้นด้วย - · ขึ้นต้นด้วยชื่อหัวข้อ", "Format, e.g. one point per line starting with -")}
          className="w-full h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg bg-white" />
        <input value={edit.intro ?? ""} onChange={(e) => setEdit({ ...edit, intro: e.target.value })}
          placeholder={t("Introduction เน้นแบบไหน เช่น บอกการใช้งานหลัก 2 ประโยค", "Introduction focus, e.g. main use in 2 sentences")}
          className="w-full h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg bg-white" />
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => void saveEdit()} disabled={busy} className="h-8 px-3 text-[12.5px] font-medium bg-slate-700 text-white rounded-lg disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกแม่แบบ", "Save template")}</button>
          <button type="button" onClick={() => setEdit(null)} className="h-8 px-3 text-[12.5px] border border-slate-200 rounded-lg hover:bg-white">{t("ยกเลิก", "Cancel")}</button>
        </div>
      </div>
    );
  }

  // เลือก Theme = ปุ่มเดียวกดแล้วเลือก (เจ้าของขอ 2026-11-25 "ไม่ต้องโชว์หลายอัน") · ใต้ปุ่มบอกว่า Introduction เน้นแบบไหน
  const cur = live.find((x) => x.id === value) ?? null;
  return (
    <div>
      <Popover align="left" panelClassName="w-[min(28rem,92vw)] p-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-y-auto"
        trigger={(toggle, open) => (
          <button type="button" onClick={toggle} aria-expanded={open}
            className={`w-full text-left rounded-lg border px-2.5 py-2 flex items-center gap-2 ${open ? "border-fuchsia-400 ring-1 ring-fuchsia-200" : "border-slate-200 hover:bg-slate-50"} bg-white`}>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1">
                <b className="text-[13px] font-semibold text-slate-700 truncate">{cur?.name ?? t("เลือก Theme", "Pick a theme")}</b>
                {cur && brandDefault === cur.id && <span className="text-[10px] px-1.5 rounded-full bg-emerald-50 text-emerald-700">{t("ค่าเริ่มแบรนด์", "brand default")}</span>}
              </span>
              {cur && <span className="block text-[11px] text-slate-500 truncate">{cur.headings.join(" → ")}</span>}
            </span>
            <span className="text-slate-400 text-[11px]">{open ? "▴" : "▾"}</span>
          </button>
        )}>
        {(close) => (
          <div>
            {live.map((tp) => (
              <button key={tp.id} type="button" onClick={() => { onChange(tp.id); close(); }}
                className={`w-full text-left rounded-lg px-2.5 py-2 ${value === tp.id ? "bg-fuchsia-50" : "hover:bg-slate-50"}`}>
                <span className="flex items-center gap-1">
                  <b className="text-[12.5px] font-semibold text-slate-700 flex-1 min-w-0 truncate">{value === tp.id ? "✓ " : ""}{tp.name}</b>
                  {brandDefault === tp.id && <span className="text-[10px] px-1.5 rounded-full bg-emerald-50 text-emerald-700">{t("ค่าเริ่มแบรนด์", "brand default")}</span>}
                </span>
                <span className="block text-[11px] text-slate-500 leading-snug">{tp.headings.join(" → ")}</span>
                {tp.intro && <span className="block text-[11px] text-fuchsia-600 leading-snug">Intro: {tp.intro}</span>}
              </button>
            ))}
          </div>
        )}
      </Popover>
      {cur?.intro && <p className="mt-1 px-2 py-1 rounded-md bg-fuchsia-50 text-[11.5px] text-fuchsia-700">{t("เน้น Introduction:", "Introduction focus:")} {cur.intro}</p>}
      {cur?.format && <p className="mt-1 text-[11px] text-slate-400">{t("รูปแบบ", "Format")}: {cur.format}</p>}
      {canEdit && cur && (
        <div className="mt-1 flex gap-1 flex-wrap">
          <button type="button" onClick={() => { setEdit(cur); setHeadText(cur.headings.join("\n")); }} className="h-6 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50">{t("แก้", "Edit")}</button>
          {brandId && brandDefault !== cur.id && <button type="button" disabled={busy} onClick={() => void setBrandDefault(cur.id)} className="h-6 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50">{t("ตั้งเป็นค่าเริ่มแบรนด์", "Brand default")}</button>}
          <button type="button" disabled={busy} onClick={() => void setArchived(cur, true)} className="h-6 px-2 text-[11px] rounded border border-rose-200 text-rose-600 bg-white hover:bg-rose-50">{t("ลบ", "Delete")}</button>
        </div>
      )}
      {canEdit && (
        <div className="mt-1.5 flex gap-2 flex-wrap items-center">
          <button type="button" onClick={() => { setEdit(EMPTY_TPL); setHeadText(""); }} className="h-7 px-2.5 text-[12px] rounded-full border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">＋ {t("เพิ่มแม่แบบ", "Add template")}</button>
          {trash.length > 0 && <button type="button" onClick={() => setShowTrash((v) => !v)} className="text-[11.5px] text-slate-500 underline">{t(`ถังขยะ (${trash.length})`, `Trash (${trash.length})`)}</button>}
        </div>
      )}
      {showTrash && trash.map((tp) => (
        <div key={tp.id} className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
          <span className="line-through">{tp.name}</span>
          <button type="button" disabled={busy} onClick={() => void setArchived(tp, false)} className="h-6 px-2 text-[11px] rounded border border-slate-200 hover:bg-slate-50">{t("กู้คืน", "Restore")}</button>
        </div>
      ))}
    </div>
  );
}

// ── ตั้งค่าหัวข้อ (กฎของประเภทสินค้านี้) ─────────────────────
export type MatchedRule = {
  id: string; name: string; tag_ids: string[]; name_keywords: string[]; brand_id: string | null;
  instruction: string; required_topics: string[]; required_topics_en?: string[]; topic_options?: Record<string, string[]>;
  hint: string | null; is_active?: boolean; sort_order?: number; extras?: unknown;
};
type TopicRow = { th: string; en: string; options: string; optionsEn: string; required: boolean };
const splitC = (s: string) => s.split(",").map((x) => x.trim());

/** แปลหลายข้อความไทย → อังกฤษครั้งเดียว (/api/ai/translate แบบชุด) · แปลไม่ได้ = คืนค่าว่าง */
async function translateToEn(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  const j = await apiFetch("/api/ai/translate", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, to: "en", kind: "labels", place: "product" }) }).then((r) => r.json());
  const list = (j?.data?.translated_list ?? []) as unknown[];
  return texts.map((_, i) => String(list[i] ?? "").trim());
}

export function RuleQuickEditor({ rules, newRule, slotItems = [], centralHighlights = [], onSaved, onClose }: {
  rules: MatchedRule[];
  /** สร้างกฎใหม่จากแท็กที่ติดอยู่ (สินค้ายังไม่เข้ากฎใด) */
  newRule?: { name: string; tag_ids: string[] } | null;
  /** ชนิดช่องทั้งหมด (คลังกลาง) — ติ๊กว่าประเภทนี้โชว์ชนิดไหน */
  slotItems?: { id: string; name: string }[];
  /** คลังประโยคกลาง — กดเพิ่มเป็นจุดเด่นของประเภทนี้ได้เร็ว ๆ */
  centralHighlights?: string[];
  onSaved: () => void; onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const draftRule: MatchedRule | null = newRule
    ? { id: "", name: newRule.name, tag_ids: newRule.tag_ids, name_keywords: [], brand_id: null, instruction: "", required_topics: [], hint: null, extras: {} }
    : null;
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? "");
  const rule = draftRule ?? rules.find((r) => r.id === ruleId) ?? null;
  const [ruleName, setRuleName] = useState(newRule?.name ?? "");
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [hlNew, setHlNew] = useState("");
  const ai = useTagSetupAi();
  const askAi = async () => {
    if (!rule) return;
    const d = await ai.run({ name: rule.id ? rule.name : (ruleName.trim() || rule.name), slots: slotItems });
    if (!d) return;
    const done: string[] = [];
    if (rows.length === 0 && d.topics.length) { setRows(d.topics.map((x) => ({ th: x.th, en: x.en, options: x.options.join(", "), optionsEn: "", required: true }))); done.push(t("หัวข้อ", "questions")); }
    if (!highlights.trim() && d.highlights.length) { setHighlights(d.highlights.join(", ")); done.push(t("จุดเด่น", "highlights")); }
    if (slotIds.length === 0 && d.slot_ids.length) { setSlotIds(d.slot_ids); done.push(t("ชนิดช่อง", "compartments")); }
    if (manual.length === 0 && d.manual_required.length) { setManual(d.manual_required); done.push(t("ช่องกรอกมือ", "manual fields")); }
    if (done.length) toast.success(t(`AI เติมให้: ${done.join(" · ")} — ตรวจแล้วกดบันทึก`, `AI filled: ${done.join(" · ")} — review then save`));
    else toast.info(t("ทุกช่องกรอกไว้แล้ว — AI ไม่ทับของเดิม (ล้างช่องที่อยากให้คิดใหม่ก่อน)", "Everything is filled — AI doesn't overwrite"));
  };
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [highlights, setHighlights] = useState("");
  const [highlightsEnState, setHighlightsEn] = useState("");
  const highlightsEn = highlightsEnState;   // คั่นลูกน้ำ เรียงตรงกับไทย
  const [transBusy, setTransBusy] = useState(false);
  const [manual, setManual] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!rule) return;
    const ex = normalizeExtras(rule.extras);
    setSlotIds(ex.slot_ids);
    setRows((rule.required_topics ?? []).map((th, i) => ({
      th, en: (rule.required_topics_en ?? [])[i] ?? "", options: ((rule.topic_options ?? {})[th] ?? []).join(", "), optionsEn: (ex.topic_options_en[th] ?? []).join(", "), required: !ex.optional_topics.includes(th),
    })));
    setHighlights(ex.highlights.join(", "));
    setHighlightsEn(ex.highlights.map((h) => ex.highlights_en[h] ?? "").join(", "));
    setManual(ex.manual_required);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId, newRule?.name]);

  const payloadOf = (r: MatchedRule, extras: RuleExtras | unknown, topics?: TopicRow[]) => {
    const list = topics ?? null;
    return {
      ...(r.id ? { id: r.id } : {}), name: r.id ? r.name : (ruleName.trim() || r.name), tag_ids: r.tag_ids ?? [], name_keywords: r.name_keywords ?? [], brand_id: r.brand_id ?? null,
      instruction: r.instruction ?? "", hint: r.hint ?? "", is_active: r.is_active !== false, sort_order: r.sort_order ?? 0,
      required_topics: list ? list.map((x) => x.th) : r.required_topics ?? [],
      required_topics_en: list ? list.map((x) => x.en) : r.required_topics_en ?? [],
      topic_options: list
        ? Object.fromEntries(list.map((x) => [x.th, x.options.split(",").map((o) => o.trim()).filter(Boolean)]).filter(([, v]) => (v as string[]).length))
        : r.topic_options ?? {},
      extras,
    };
  };
  const post = async (body: unknown) => {
    const j = await apiFetch("/api/ai/product-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
  };

  const save = async () => {
    if (!rule) return;
    // แปลช่อง EN ที่ยังว่างให้อัตโนมัติก่อนบันทึก (แปลไม่ได้ก็บันทึกต่อได้)
    const tr = await translateAll(true);
    const rowsNow = tr?.rows ?? rows;
    const highlightsEn = tr?.hEn ?? highlightsEnState;
    const clean = rowsNow.map((x) => ({ ...x, th: x.th.trim(), en: x.en.trim() })).filter((x) => x.th);
    const extras: RuleExtras = {
      highlights: highlights.split(",").map((x) => x.trim()).filter(Boolean),
      manual_required: manual,
      optional_topics: clean.filter((x) => !x.required).map((x) => x.th),
      slot_ids: slotIds,
      topic_options_en: Object.fromEntries(clean.map((x) => [x.th, splitC(x.optionsEn)]).filter(([, v]) => (v as string[]).some(Boolean))),
      highlights_en: (() => {
        const th = highlights.split(",").map((x) => x.trim()).filter(Boolean);
        const en = splitC(highlightsEn);
        return Object.fromEntries(th.map((h, i) => [h, en[i] ?? ""]).filter(([, v]) => v));
      })(),
    };
    const prevBody = rule.id ? payloadOf(rule, normalizeExtras(rule.extras)) : null;
    setBusy(true);
    try {
      const j = await apiFetch("/api/ai/product-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadOf(rule, extras, clean)) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const newId = rule.id ? "" : String(j.data?.id ?? "");
      onSaved();
      onClose();
      const nm = rule.id ? rule.name : (ruleName.trim() || rule.name);
      toast.undo(rule.id ? t(`บันทึกกฎ "${nm}" แล้ว`, `Rule "${nm}" saved`) : t(`สร้างกฎ "${nm}" แล้ว`, `Rule "${nm}" created`), async () => {
        try {
          if (prevBody) await post(prevBody);
          else if (newId) await apiFetch(`/api/ai/product-rules?id=${encodeURIComponent(newId)}`, { method: "DELETE" });
          onSaved();
        } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };

  /** แปลช่อง EN ที่ยังว่าง (หัวข้อ · คำตอบ · จุดเด่น) — silent = ตอนกดบันทึก (แปลให้อัตโนมัติ ไม่เด้งแจ้ง) */
  const translateAll = async (silent = false): Promise<{ rows: TopicRow[]; hEn: string } | null> => {
    const jobs: { text: string; put: (v: string) => void }[] = [];
    const next = rows.map((x) => ({ ...x }));
    next.forEach((x) => {
      if (x.th.trim() && !x.en.trim()) jobs.push({ text: x.th.trim(), put: (v) => { x.en = v; } });
      const th = splitC(x.options).filter(Boolean);
      if (th.length) {
        const en = splitC(x.optionsEn);
        th.forEach((o, k) => { if (!(en[k] ?? "").trim()) jobs.push({ text: o, put: (v) => { const cur = splitC(x.optionsEn); while (cur.length < th.length) cur.push(""); cur[k] = v; x.optionsEn = cur.slice(0, th.length).join(", "); } }); });
      }
    });
    const hTh = highlights.split(",").map((x) => x.trim()).filter(Boolean);
    const hEn = splitC(highlightsEn);
    while (hEn.length < hTh.length) hEn.push("");
    hTh.forEach((h, k) => { if (!(hEn[k] ?? "").trim()) jobs.push({ text: h, put: (v) => { hEn[k] = v; } }); });
    if (!jobs.length) { if (!silent) toast.info(t("ช่อง EN กรอกครบแล้ว", "English is already filled")); return { rows: next, hEn: hEn.slice(0, hTh.length).join(", ") }; }
    setTransBusy(true);
    try {
      const out = await translateToEn(jobs.map((j) => j.text));
      let n = 0;
      jobs.forEach((j, i) => { if (out[i]) { j.put(out[i].replace(/,/g, " ")); n++; } });
      const joined = hEn.slice(0, hTh.length).join(", ");
      setRows(next);
      setHighlightsEn(joined);
      if (!silent) toast.success(t(`แปลแล้ว ${n} ช่อง — ตรวจแล้วกดบันทึก`, `Translated ${n} fields — review then save`));
      return { rows: next, hEn: joined };
    } catch (e) { if (!silent) toast.error(e instanceof Error ? e.message : t("แปลไม่สำเร็จ", "Translate failed")); return null; }
    finally { setTransBusy(false); }
  };

  const move = (i: number, d: -1 | 1) => setRows((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const upd = (i: number, patch: Partial<TopicRow>) => setRows((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  if (!rule) return null;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-violet-800 font-medium">{newRule ? t("สร้างกฎประเภท", "New type rule") : t("แก้กฎ", "Edit rule")}</span>
        {newRule ? (
          <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} className="h-7 px-2 text-[12px] border border-slate-200 rounded bg-white w-44" />
        ) : rules.length > 1 ? (
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="h-7 px-2 text-[12px] border border-slate-200 rounded bg-white">
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : <b className="text-[12px] text-violet-800">“{rule.name}”</b>}
        <span className="text-[11px] text-violet-600 flex-1 min-w-0">{t("มีผลกับสินค้าทุกตัวในประเภทนี้ · ลงประวัติ · ย้อนได้", "Affects every product of this type · logged · undoable")}</span>
        <button type="button" onClick={() => void translateAll(false)} disabled={transBusy} className="h-7 px-2.5 text-[12px] rounded-lg border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 inline-flex items-center gap-1" title={t("แปลหัวข้อ คำตอบ และจุดเด่น เฉพาะช่อง EN ที่ยังว่าง", "Translate questions, answers and highlights where English is empty")}>
          {transBusy && <Spinner />}{t("⇄ แปลเป็น EN ทั้งหมด", "⇄ Translate all to EN")}
        </button>
        <button type="button" onClick={() => void askAi()} disabled={ai.busy} className={AI_BTN} title={t("เติมเฉพาะช่องที่ยังว่าง · รุ่นถูก ~0.02 บาท/ครั้ง", "Fills empty fields only · cheap model")}>
          {ai.busy && <Spinner />}{t("✨ ให้ AI ช่วยคิด", "✨ AI helps")}
        </button>
      </div>

      <div className="space-y-1.5">
        {rows.map((x, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-white p-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[10px] leading-none text-slate-400 disabled:opacity-30" aria-label={t("เลื่อนขึ้น", "Move up")}>▲</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-[10px] leading-none text-slate-400 disabled:opacity-30" aria-label={t("เลื่อนลง", "Move down")}>▼</button>
              </div>
              <input value={x.th} onChange={(e) => upd(i, { th: e.target.value })} placeholder={t("หัวข้อ (ไทย)", "Heading (Thai)")} className="flex-1 min-w-[120px] h-7 px-2 text-[12px] border border-slate-200 rounded" />
              <input value={x.en} onChange={(e) => upd(i, { en: e.target.value })} placeholder="EN" className="w-28 h-7 px-2 text-[12px] border border-slate-200 rounded" />
              <label className="text-[11.5px] text-slate-600 inline-flex items-center gap-1"><input type="checkbox" checked={x.required} onChange={(e) => upd(i, { required: e.target.checked })} className="accent-violet-600" />{t("บังคับ", "Required")}</label>
              <button type="button" onClick={() => setRows((p) => p.filter((_, k) => k !== i))} className="h-7 px-1.5 text-[12px] text-rose-500 hover:bg-rose-50 rounded" aria-label={t("ลบหัวข้อ", "Delete heading")}>✕</button>
            </div>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
              <input value={x.options} onChange={(e) => upd(i, { options: e.target.value })} placeholder={t("คำตอบให้เลือก คั่นด้วยลูกน้ำ เช่น ซิป, แม่เหล็ก, ไม่มี", "Answer choices, comma-separated")}
                className="w-full h-7 px-2 text-[12px] border border-slate-200 rounded" />
              <input value={x.optionsEn} onChange={(e) => upd(i, { optionsEn: e.target.value })} placeholder={t("คำตอบ EN (เรียงตรงกับไทย)", "Answers in English (same order)")}
                className="w-full h-7 px-2 text-[12px] border border-slate-200 rounded bg-sky-50/40" />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setRows((p) => [...p, { th: "", en: "", options: "", optionsEn: "", required: true }])} className="h-7 px-2.5 text-[12px] rounded-full border border-dashed border-slate-300 text-slate-600 bg-white hover:bg-slate-50">＋ {t("เพิ่มหัวข้อ", "Add heading")}</button>
      </div>

      <div>
        <p className="text-[11.5px] text-slate-600 mb-1">{t("รายการจุดเด่นให้ติ๊ก (คั่นด้วยลูกน้ำ)", "Highlight choices (comma-separated)")}</p>
        <input value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder={t("เช่น ผ้าแคนวาสหนา, ก้นตั้งได้, ปักชื่อได้", "e.g. thick canvas, stands upright")}
          className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded bg-white" />
        <input value={highlightsEn} onChange={(e) => setHighlightsEn(e.target.value)} placeholder={t("จุดเด่น EN คั่นลูกน้ำ เรียงตรงกับไทย (กด ⇄ แปล ได้)", "Highlights in English, same order")}
          className="mt-1 w-full h-8 px-2 text-[12px] border border-slate-200 rounded bg-sky-50/40" />
        {(() => {
          const cur = highlights.split(",").map((x) => x.trim()).filter(Boolean);
          const add = (h: string) => { if (h && !cur.includes(h)) setHighlights([...cur, h].join(", ")); };
          const left = centralHighlights.filter((h) => !cur.includes(h));
          return (
            <div className="mt-1 flex flex-wrap gap-1 items-center">
              {left.length > 0 && <span className="text-[11px] text-slate-400">{t("กดเพิ่มจากคลังกลาง:", "Add from library:")}</span>}
              {left.slice(0, 30).map((h) => <button key={h} type="button" onClick={() => add(h)} className="h-6 px-2 text-[11px] rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">＋ {h}</button>)}
              <input value={hlNew} onChange={(e) => setHlNew(e.target.value)} placeholder={t("พิมพ์ใหม่ + Enter", "Type + Enter")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(hlNew.trim()); setHlNew(""); } }}
                className="h-6 px-2 text-[11px] border border-slate-200 rounded-full bg-white w-32" />
            </div>
          );
        })()}
      </div>
      {slotItems.length > 0 && (
        <div>
          <p className="text-[11.5px] text-slate-600 mb-1">{t("ชนิดช่องที่โชว์ในขั้นนี้ (ไม่ติ๊กเลย = โชว์ทุกชนิด)", "Compartment types to show (none = all)")}</p>
          <div className="flex gap-1.5 flex-wrap">
            {slotItems.map((x) => {
              const on = slotIds.includes(x.id);
              return <button key={x.id} type="button" onClick={() => setSlotIds((p) => (on ? p.filter((k) => k !== x.id) : [...p, x.id]))}
                className={`h-7 px-2.5 text-[12px] rounded-full border ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{x.name}</button>;
            })}
          </div>
        </div>
      )}
      <div>
        <p className="text-[11.5px] text-slate-600 mb-1">{t("ช่องที่ต้องกรอกเองในขั้นสุดท้าย (บังคับ)", "Fields that must be filled in the last step")}</p>
        <div className="flex gap-1.5 flex-wrap">
          {MANUAL_FIELDS.map((f) => {
            const on = manual.includes(f.key);
            return (
              <button key={f.key} type="button" onClick={() => setManual((p) => (on ? p.filter((k) => k !== f.key) : [...p, f.key]))}
                className={`h-7 px-2.5 text-[12px] rounded-full border ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {t(f.label, f.en)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} disabled={busy} className="h-8 px-3 text-[12.5px] font-medium bg-violet-600 text-white rounded-lg disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : newRule ? t("สร้างกฎ", "Create rule") : t("บันทึกกฎ", "Save rule")}</button>
        <button type="button" onClick={onClose} className="h-8 px-3 text-[12.5px] border border-slate-200 rounded-lg bg-white hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
      </div>
    </div>
  );
}

/** ตัวเลือกจากรายการ master (Size/Special description) — รายการสั้น ใช้ select ธรรมดา */
export function RefSelect({ entity, value, onChange }: { entity: string; value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [opts, setOpts] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    apiFetch(`/api/master-v2/${entity}?limit=500`).then((r) => r.json())
      .then((j) => setOpts(((j.data ?? []) as { id: string; name?: string | null }[]).map((x) => ({ id: String(x.id), name: String(x.name ?? x.id) }))))
      .catch(() => setOpts([]));
  }, [entity]);
  const sorted = useMemo(() => (opts ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "th")), [opts]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={opts === null}
      className="w-full h-9 px-2 text-[13px] border border-slate-200 rounded-lg bg-white">
      <option value="">{opts === null ? t("กำลังโหลด…", "Loading…") : t("— ไม่ระบุ —", "— none —")}</option>
      {sorted.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

/** ประกันแบบ dropdown — รายการตั้งได้ (ui_config ai_desc_templates.warranty_options) · ค่าที่ไม่อยู่ในรายการ = "อื่น ๆ" พิมพ์เอง */
export function WarrantySelect({ value, onChange, setup, save, canEdit, invalid }: {
  value: string; onChange: (v: string) => void; setup: DraftSetup | null; save: (s: DraftSetup) => Promise<void>; canEdit: boolean; invalid?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const opts = setup?.warranty_options ?? [];
  const isOther = !!value && !opts.includes(value);
  const [other, setOther] = useState(isOther);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const sel = other || isOther ? "__other" : value;
  const saveList = async () => {
    if (!setup) return;
    const list = [...new Set(text.split("\n").map((x) => x.trim()).filter(Boolean))];
    if (!list.length) { toast.warning(t("ใส่อย่างน้อย 1 รายการ", "Enter at least one option")); return; }
    const prev = setup;
    try {
      await save({ ...setup, warranty_options: list });
      setEditing(false);
      toast.undo(t("บันทึกรายการประกันแล้ว", "Warranty options saved"), async () => { try { await save(prev); } catch { /* ignore */ } });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  if (editing) {
    return (
      <div className="space-y-1">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full px-2 py-1.5 text-[12.5px] border border-slate-200 rounded-lg" />
        <div className="flex gap-1.5">
          <button type="button" onClick={() => void saveList()} className="h-7 px-2.5 text-[12px] rounded-lg bg-slate-700 text-white">{t("บันทึกรายการ", "Save list")}</button>
          <button type="button" onClick={() => setEditing(false)} className="h-7 px-2.5 text-[12px] rounded-lg border border-slate-200">{t("ยกเลิก", "Cancel")}</button>
        </div>
        <p className="text-[11px] text-slate-400">{t("บรรทัดละ 1 ตัวเลือก · ใช้กับสินค้าทุกตัว", "One option per line · used for all products")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <select value={sel} onChange={(e) => { if (e.target.value === "__other") { setOther(true); onChange(""); } else { setOther(false); onChange(e.target.value); } }}
          className={`flex-1 h-9 px-2 text-[13px] border rounded-lg bg-white ${invalid ? "border-rose-300" : "border-slate-200"}`}>
          <option value="">{t("— เลือกประกัน —", "— choose —")}</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__other">{t("อื่น ๆ (พิมพ์เอง)", "Other (type)")}</option>
        </select>
        {canEdit && <button type="button" onClick={() => { setText(opts.join("\n")); setEditing(true); }} title={t("แก้รายการตัวเลือก", "Edit options")} className="h-9 px-2 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">{t("แก้รายการ", "Edit")}</button>}
      </div>
      {(other || isOther) && (
        <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus placeholder={t("เช่น 3 เดือน ตะเข็บหลุด", "e.g. 3 months seams")}
          className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg" />
      )}
    </div>
  );
}

/**
 * สร้างแท็กประเภทสินค้าใหม่จากในป๊อป (ค้นไม่เจอ) — ชื่อไทย/อังกฤษ/กลุ่ม + ติดให้สินค้านี้ทันที
 * + ติ๊ก "สร้างกฎประเภทนี้ไปด้วย" ใส่หัวข้อที่ต้องตอบ/จุดเด่นได้เลย (ตั้งต่อละเอียดในขั้น 2)
 * ย้อนกลับ = ปลดแท็ก + เก็บแท็กเข้าถังขยะ + ลบกฎที่เพิ่งสร้าง
 */
export function CreateTagModal({ parentId, initialName, groups, canRule, onDone, onClose }: {
  parentId: string; initialName: string; groups: { id: string; name: string }[]; canRule: boolean;
  onDone: () => void; onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [nameEn, setNameEn] = useState("");
  const [groupId, setGroupId] = useState("");
  const [withRule, setWithRule] = useState(canRule);
  const [topics, setTopics] = useState("");
  const [hls, setHls] = useState("");
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [manualReq, setManualReq] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // ชนิดช่องทั้งหมด (คลังกลาง) — ให้ AI เลือก + ติ๊กเองได้
  const [slotOpts, setSlotOpts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    apiFetch("/api/master-v2/product_highlight_items?limit=1000").then((r) => r.json())
      .then((j) => setSlotOpts(((j.data ?? []) as { id: string; name: string; kind?: string | null; is_active?: boolean | null }[])
        .filter((x) => x.kind === "slot" && x.is_active !== false).map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setSlotOpts([]));
  }, []);
  const ai = useTagSetupAi();
  const [aiFilled, setAiFilled] = useState<string[]>([]);
  const [beforeAi, setBeforeAi] = useState<{ nameEn: string; groupId: string; topics: string; hls: string; slotIds: string[]; manualReq: string[] } | null>(null);
  const askAi = async () => {
    const d = await ai.run({ name, name_en: nameEn, groups, slots: slotOpts });
    if (!d) return;
    setBeforeAi({ nameEn, groupId, topics, hls, slotIds, manualReq });
    const f: string[] = [];
    // เติมเฉพาะช่องที่ยังว่าง — ที่กรอกเองแล้วไม่ทับ
    if (!nameEn.trim() && d.name_en) { setNameEn(d.name_en); f.push("nameEn"); }
    if (!groupId && d.group_id) { setGroupId(d.group_id); f.push("groupId"); }
    if (d.topics.length) {
      const have = topics.split("\n").map((l) => l.split(":")[0].trim()).filter(Boolean);
      const add = d.topics.filter((x) => !have.includes(x.th));
      if (add.length) { setTopics((p) => [p.trim(), topicsToText(add)].filter(Boolean).join("\n")); f.push("topics"); }
    }
    if (!hls.trim() && d.highlights.length) { setHls(d.highlights.join(", ")); f.push("hls"); }
    if (slotIds.length === 0 && d.slot_ids.length) { setSlotIds(d.slot_ids); f.push("slots"); }
    if (manualReq.length === 0 && d.manual_required.length) { setManualReq(d.manual_required); f.push("manual"); }
    setAiFilled(f);
    if (f.length && canRule) setWithRule(true);
    if (!f.length) toast.info(t("ทุกช่องกรอกไว้แล้ว — AI ไม่ทับของเดิม", "Everything is filled — AI doesn't overwrite"));
  };
  const undoAi = () => {
    if (!beforeAi) return;
    setNameEn(beforeAi.nameEn); setGroupId(beforeAi.groupId); setTopics(beforeAi.topics); setHls(beforeAi.hls); setSlotIds(beforeAi.slotIds); setManualReq(beforeAi.manualReq);
    setAiFilled([]); setBeforeAi(null);
  };
  const post = async (url: string, body: unknown) => {
    const j = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return j;
  };
  const save = async () => {
    if (!name.trim()) { toast.warning(t("ใส่ชื่อแท็กก่อน", "Enter a tag name")); return; }
    // หัวข้อ: บรรทัดละข้อ "หัวข้อ: ตัวเลือก1, ตัวเลือก2"
    const rows = topics.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? { th: l.slice(0, i).trim(), opts: l.slice(i + 1).split(",").map((x) => x.trim()).filter(Boolean) } : { th: l, opts: [] as string[] };
    }).filter((x) => x.th);
    const highlights = hls.split(",").map((x) => x.trim()).filter(Boolean);
    if (withRule && !rows.length && !highlights.length && !slotIds.length && !manualReq.length) { toast.warning(t("ใส่หัวข้อหรือจุดเด่นอย่างน้อย 1 อย่าง หรือเอาติ๊ก “สร้างกฎ” ออก", "Add a question or highlight, or untick “create rule”")); return; }
    setBusy(true);
    let tagId = ""; let existed = false; let ruleId = "";
    try {
      const c = await post("/api/product-tags", { create: { name: name.trim(), name_en: nameEn.trim() || null, group_id: groupId || null } });
      tagId = String(c.data.id); existed = !!c.existed;
      await post("/api/product-tags", { parent_id: parentId, tag_id: tagId, on: true });
      if (withRule) {
        const r = await post("/api/ai/product-rules", {
          name: name.trim(), tag_ids: [tagId], name_keywords: [], brand_id: null, instruction: "", hint: "",
          required_topics: rows.map((x) => x.th), required_topics_en: [],
          topic_options: Object.fromEntries(rows.filter((x) => x.opts.length).map((x) => [x.th, x.opts])),
          extras: { highlights, manual_required: manualReq, optional_topics: [], slot_ids: slotIds },
        });
        ruleId = String(r.data?.id ?? "");
      }
      onDone();
      onClose();
      toast.undo(existed ? t(`ติดแท็ก "${name}" (มีอยู่แล้ว) แล้ว`, `Tagged "${name}" (already existed)`) : t(`สร้างแท็ก "${name}" แล้ว`, `Tag "${name}" created`), async () => {
        try {
          await post("/api/product-tags", { parent_id: parentId, tag_id: tagId, on: false });
          if (!existed) await post("/api/product-tags", { tag_id: tagId, archive: true });
          if (ruleId) await apiFetch(`/api/ai/product-rules?id=${encodeURIComponent(ruleId)}`, { method: "DELETE" });
          onDone();
        } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); }
      }, { ms: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("สร้างแท็กไม่สำเร็จ", "Could not create tag"));
      if (tagId) onDone();
    } finally { setBusy(false); }
  };
  const dirty = name !== initialName || !!nameEn || !!topics || !!hls || slotIds.length > 0 || manualReq.length > 0;
  const chipCls = (on: boolean) => `h-7 px-2.5 text-[12px] rounded-full border ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`;
  return (
    <ERPModal open onClose={onClose} size="md" hasUnsavedChanges={dirty} title={t("สร้างแท็กประเภทสินค้า", "New product-type tag")}
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => void save()} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{t("สร้างแล้วติดแท็ก", "Create & tag")}</button>
      </div>}>
      <div className="space-y-2.5">
        {/* ✨ AI ช่วยคิดทั้งหมด — รุ่นถูก ส่งแค่ข้อความ · เติมเฉพาะช่องที่ยังว่าง */}
        {canRule && (
          <div className="flex items-center gap-2 flex-wrap rounded-lg bg-fuchsia-50/50 border border-fuchsia-100 px-2.5 py-1.5">
            <span className="text-[11.5px] text-fuchsia-800 flex-1 min-w-0">
              {aiFilled.length
                ? t(`AI เติมให้ ${aiFilled.length} ช่อง (สีชมพู) — แก้ได้ทุกช่อง`, `AI filled ${aiFilled.length} fields (pink) — all editable`)
                : t("ใส่ชื่อไทยแล้วให้ AI คิดที่เหลือให้ · ~0.02 บาท/ครั้ง · ช่องที่กรอกเองแล้ว AI ไม่ทับ", "Enter the Thai name and let AI fill the rest · ~0.02 THB · never overwrites")}
            </span>
            {beforeAi && <button type="button" onClick={undoAi} className="text-[11.5px] text-slate-500 underline">{t("ล้างที่ AI เติม", "Undo AI fill")}</button>}
            <button type="button" onClick={() => void askAi()} disabled={ai.busy} className={AI_BTN}>{ai.busy && <Spinner />}{t("✨ ให้ AI ช่วยคิดทั้งหมด", "✨ Let AI fill it all")}</button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block"><span className="text-[12px] text-slate-600">{t("ชื่อไทย", "Thai name")} *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg" /></label>
          <label className="block"><span className="text-[12px] text-slate-600">{t("ชื่ออังกฤษ", "English name")}</span>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Neck pouch" className={`w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg${aiMark(aiFilled.includes("nameEn"))}`} /></label>
        </div>
        <label className="block"><span className="text-[12px] text-slate-600">{t("อยู่ในกลุ่ม", "Group")}</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`w-full h-9 px-2 text-[13px] border border-slate-200 rounded-lg bg-white${aiMark(aiFilled.includes("groupId"))}`}>
            <option value="">{t("— ไม่ระบุกลุ่ม —", "— no group —")}</option>
            {groups.slice().sort((a, b) => a.name.localeCompare(b.name, "th")).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
        {canRule && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
            <label className="flex items-center gap-2 text-[12.5px] text-violet-800 font-medium">
              <input type="checkbox" checked={withRule} onChange={(e) => setWithRule(e.target.checked)} className="accent-violet-600" />
              {t("สร้างกฎประเภทนี้ไปด้วย (ข้อมูลที่จำเป็น)", "Also create this type's rule (required info)")}
            </label>
            {withRule && (<>
              <label className="block"><span className="text-[11.5px] text-slate-600">{t("หัวข้อที่ต้องตอบ — บรรทัดละข้อ “หัวข้อ: ตัวเลือก1, ตัวเลือก2”", "Questions — one per line “question: choice1, choice2”")}</span>
                <textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={4} placeholder={"สายคล้องถอดได้ไหม: ได้, ไม่ได้\nจำนวนช่องใส่บัตร: 1, 2, 3"} className={`w-full px-2.5 py-1.5 text-[12.5px] border border-slate-200 rounded-lg bg-white${aiMark(aiFilled.includes("topics"))}`} /></label>
              <label className="block"><span className="text-[11.5px] text-slate-600">{t("จุดเด่นให้เลือก (คั่นด้วยลูกน้ำ)", "Highlight choices (comma-separated)")}</span>
                <input value={hls} onChange={(e) => setHls(e.target.value)} placeholder={t("เช่น หนังแท้, สายปรับยาวได้, สลักชื่อได้", "e.g. genuine leather, adjustable strap")} className={`w-full h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg bg-white${aiMark(aiFilled.includes("hls"))}`} /></label>
              {slotOpts.length > 0 && (
                <div className={`rounded-md p-1 ${aiFilled.includes("slots") ? "bg-fuchsia-50/60" : ""}`}>
                  <p className="text-[11.5px] text-slate-600 mb-1">{t("ชนิดช่องที่โชว์ (ไม่ติ๊ก = ทุกชนิด)", "Compartment types (none = all)")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {slotOpts.map((x) => { const on = slotIds.includes(x.id); return <button key={x.id} type="button" onClick={() => setSlotIds((p) => (on ? p.filter((k) => k !== x.id) : [...p, x.id]))} className={chipCls(on)}>{x.name}</button>; })}
                  </div>
                </div>
              )}
              <div className={`rounded-md p-1 ${aiFilled.includes("manual") ? "bg-fuchsia-50/60" : ""}`}>
                <p className="text-[11.5px] text-slate-600 mb-1">{t("ช่องที่ต้องกรอกเองในขั้นสุดท้าย (บังคับ)", "Required manual fields")}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {MANUAL_FIELDS.map((f) => { const on = manualReq.includes(f.key); return <button key={f.key} type="button" onClick={() => setManualReq((p) => (on ? p.filter((k) => k !== f.key) : [...p, f.key]))} className={chipCls(on)}>{t(f.label, f.en)}</button>; })}
                </div>
              </div>
            </>)}
          </div>
        )}
      </div>
    </ERPModal>
  );
}

/**
 * แก้แท็กประเภทสินค้า (กดชื่อแท็กในขั้นตั้งต้น) — ชื่อไทย/อังกฤษ/กลุ่ม · มีผลกับทุกสินค้าที่ติดแท็กนี้ (บอกจำนวนก่อน)
 * AI ช่วยคิด = เติมชื่ออังกฤษ/กลุ่มที่ยังว่าง · "แก้กฎ" = ไปตั้งค่าประเภทในขั้น 2 · ย้ายไปถังขยะ = กู้คืนได้
 * ทุกการแก้ลง audit (changes) + ปุ่มย้อนกลับมุมจอ
 */
export function EditTagModal({ tag, groups, canRule, onDone, onEditRule, onClose }: {
  tag: { id: string; name: string; name_en?: string | null; group_id?: string | null };
  groups: { id: string; name: string }[]; canRule: boolean;
  onDone: () => void; onEditRule?: () => void; onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(tag.name);
  const [nameEn, setNameEn] = useState(tag.name_en ?? "");
  const [groupId, setGroupId] = useState(tag.group_id ?? "");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiFilled, setAiFilled] = useState<string[]>([]);
  const ai = useTagSetupAi();
  useEffect(() => {
    apiFetch(`/api/product-tags?usage=${encodeURIComponent(tag.id)}`).then((r) => r.json()).then((j) => setCount(typeof j.count === "number" ? j.count : null)).catch(() => setCount(null));
  }, [tag.id]);
  const post = async (body: unknown) => {
    const j = await apiFetch("/api/product-tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return j;
  };
  const dirty = name.trim() !== tag.name || nameEn.trim() !== (tag.name_en ?? "") || groupId !== (tag.group_id ?? "");
  const askAi = async () => {
    const d = await ai.run({ name, name_en: nameEn, groups });
    if (!d) return;
    const f: string[] = [];
    if (!nameEn.trim() && d.name_en) { setNameEn(d.name_en); f.push("nameEn"); }
    if (!groupId && d.group_id) { setGroupId(d.group_id); f.push("groupId"); }
    setAiFilled(f);
    if (!f.length) toast.info(t("ชื่ออังกฤษและกลุ่มกรอกไว้แล้ว — AI ไม่ทับ (ล้างช่องที่อยากให้คิดใหม่ก่อน)", "Already filled — AI doesn't overwrite"));
  };
  const save = async () => {
    if (!name.trim()) { toast.warning(t("ชื่อแท็กห้ามว่าง", "Name can't be empty")); return; }
    if (!dirty) { onClose(); return; }
    setBusy(true);
    try {
      const j = await post({ tag_id: tag.id, update: { name: name.trim(), name_en: nameEn.trim() || null, group_id: groupId || null } });
      const before = (j.before ?? { name: tag.name, name_en: tag.name_en ?? null, group_id: tag.group_id ?? null }) as { name: string; name_en: string | null; group_id: string | null };
      onDone(); onClose();
      toast.undo(t(`แก้แท็ก "${name.trim()}" แล้ว`, `Tag "${name.trim()}" updated`), async () => {
        try { await post({ tag_id: tag.id, update: { name: before.name, name_en: before.name_en, group_id: before.group_id } }); onDone(); }
        catch (e) { toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archive = async () => {
    setConfirmArchive(false);
    setBusy(true);
    try {
      await post({ tag_id: tag.id, archive: true });
      onDone(); onClose();
      toast.undo(t(`ย้าย "${tag.name}" ไปถังขยะแล้ว`, `"${tag.name}" moved to trash`), async () => {
        try { await post({ tag_id: tag.id, archive: false }); onDone(); } catch (e) { toast.error(e instanceof Error ? e.message : t("กู้คืนไม่สำเร็จ", "Restore failed")); }
      }, { ms: 8000 });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้ายไม่สำเร็จ", "Failed")); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="md" hasUnsavedChanges={dirty} title={t("แก้แท็กประเภทสินค้า", "Edit product-type tag")}
      footer={<div className="flex justify-between gap-2 w-full flex-wrap">
        <button onClick={() => setConfirmArchive(true)} disabled={busy} className="h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50">{t("ย้ายแท็กไปถังขยะ", "Move to trash")}</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => void save()} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{t("บันทึก", "Save")}</button>
        </div>
      </div>}>
      <ConfirmDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} variant="danger"
        title={t("ย้ายแท็กไปถังขยะ", "Move tag to trash")}
        message={t(`ย้าย "${tag.name}" ไปถังขยะ? แท็กจะหายจากรายการเลือก${count ? ` (ใช้กับสินค้า ${count} ตัว — ข้อมูลสินค้าไม่พัง)` : ""} · กู้คืนได้ด้วยปุ่มย้อนกลับ`, `Move "${tag.name}" to trash? Restorable.`)}
        confirmText={t("ย้ายไปถังขยะ", "Move to trash")} cancelText={t("ยกเลิก", "Cancel")} onConfirm={() => void archive()} />
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`flex-1 min-w-0 text-[12px] px-2.5 py-1.5 rounded-lg ${count && count > 1 ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
            {count === null ? t("กำลังนับสินค้าที่ใช้แท็กนี้…", "Counting products…")
              : t(`ใช้กับสินค้า ${count} ตัว — แก้ชื่อ/กลุ่มจะเปลี่ยนทุกตัว`, `Used by ${count} products — changes apply to all`)}
          </p>
          {canRule && <button type="button" onClick={() => void askAi()} disabled={ai.busy} className={AI_BTN}>{ai.busy && <Spinner />}{t("✨ ให้ AI ช่วยคิด", "✨ AI helps")}</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block"><span className="text-[12px] text-slate-600">{t("ชื่อไทย", "Thai name")} *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg" /></label>
          <label className="block"><span className="text-[12px] text-slate-600">{t("ชื่ออังกฤษ", "English name")}</span>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={`w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg${aiMark(aiFilled.includes("nameEn"))}`} /></label>
        </div>
        <label className="block"><span className="text-[12px] text-slate-600">{t("อยู่ในกลุ่ม", "Group")}</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`w-full h-9 px-2 text-[13px] border border-slate-200 rounded-lg bg-white${aiMark(aiFilled.includes("groupId"))}`}>
            <option value="">{t("— ไม่ระบุกลุ่ม —", "— no group —")}</option>
            {groups.slice().sort((a, b) => a.name.localeCompare(b.name, "th")).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
        {canRule && onEditRule && (
          <p className="text-[12px] text-slate-500">
            {t("หัวข้อ · จุดเด่น · ชนิดช่อง · ช่องกรอกมือ ของประเภทนี้ →", "Questions · highlights · compartments · manual fields →")}{" "}
            <button type="button" onClick={() => { onClose(); onEditRule(); }} className="text-violet-700 underline">{t("แก้กฎ (ตั้งค่าประเภทในขั้น 2)", "Edit rule (step 2)")}</button>
          </p>
        )}
      </div>
    </ERPModal>
  );
}

// ── กติกา "วัสดุ → จุดเด่น" (เจ้าของขอ 2026-11-25 · เลือกวัสดุนี้ → ติ๊กจุดเด่นนี้ให้) ─────────────
//    คำค้นคั่นด้วย | เทียบกับชื่อไทย/อังกฤษ/ชื่อเรียกอื่นของวัสดุ เช่น "หนังวัว|cowhide" · แก้/ลบได้ · บันทึกแล้วย้อนกลับได้ (toast)
export function MaterialRuleEditor({ rules, onSave }: { rules: MaterialRule[]; onSave: (rules: MaterialRule[]) => Promise<void> }) {
  const t = useT();
  const [rows, setRows] = useState<MaterialRule[]>(() => rules.map((r) => ({ ...r })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<MaterialRule>) => setRows((p) => p.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const inp = "h-8 px-2 text-[12px] border border-slate-200 rounded-md bg-white min-w-0";
  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-1.5">
      <p className="text-[11.5px] text-slate-600">{t("เลือกวัสดุที่มีคำนี้ → ติ๊กจุดเด่นนี้ให้ (คั่นหลายคำด้วย |)", "Material containing this word → auto-tick this highlight (separate words with |)")}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_1.3fr_auto] gap-1.5 items-center">
          <input value={r.match} onChange={(e) => set(i, { match: e.target.value })} placeholder={t("คำในชื่อวัสดุ เช่น หนังวัว|cowhide", "Material word, e.g. cowhide")} className={inp} />
          <input value={r.highlight} onChange={(e) => set(i, { highlight: e.target.value })} placeholder={t("จุดเด่น (ไทย)", "Highlight (Thai)")} className={inp} />
          <input value={r.highlight_en ?? ""} onChange={(e) => set(i, { highlight_en: e.target.value })} placeholder={t("จุดเด่น (อังกฤษ)", "Highlight (English)")} className={inp} />
          <button type="button" onClick={() => setRows((p) => p.filter((_, k) => k !== i))} className="h-8 px-2 text-[11.5px] rounded-md border border-rose-200 text-rose-600 bg-white hover:bg-rose-50">{t("ลบ", "Delete")}</button>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setRows((p) => [...p, { match: "", highlight: "", highlight_en: "" }])} className="h-7 px-2.5 text-[12px] rounded-full border border-dashed border-slate-300 text-slate-600 hover:bg-white">＋ {t("เพิ่มกติกา", "Add rule")}</button>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(rows); } finally { setBusy(false); } }}
          className="h-7 px-3 text-[12px] font-medium rounded-lg bg-slate-700 text-white disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกกติกา", "Save rules")}</button>
      </div>
    </div>
  );
}
