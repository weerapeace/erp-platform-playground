"use client";

// ============================================================
// ชิ้นส่วนของป๊อป "✨ ให้ AI ร่างรายละเอียดสินค้า" แบบ 5 ขั้น (เจ้าของเลือก 2026-11-25)
//   ImageStrip       — รูปที่ AI จะดู (ข้างซ้ายทุกขั้น · มือถือ = แถบเลื่อนบน) · กดขยาย · ติ๊กเอารูปออกได้
//   TemplatePicker   — ชุดแม่แบบ (Theme) = ลำดับหัวข้อ + รูปแบบ Description · ตั้งค่าเริ่มต่อแบรนด์ · เพิ่ม/แก้/ลบ (ถังขยะ) + ย้อนกลับ
//   RuleQuickEditor  — "⚙ ตั้งค่าหัวข้อ" ในขั้น 2: แก้กฎของประเภทสินค้านี้ได้ทันที (หัวข้อ · คำตอบให้เลือก · บังคับ ·
//                      รายการจุดเด่น · ช่องกรอกมือที่บังคับ) · ทุกการแก้ลง audit + ปุ่มย้อนกลับ
//   แกน pure = lib/ai-draft-setup
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { Spinner } from "@/components/spinner";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  DRAFT_SETUP_KEY, MANUAL_FIELDS, normalizeExtras, normalizeSetup,
  type DescTemplate, type DraftSetup, type RuleExtras,
} from "@/lib/ai-draft-setup";

// ── รูปที่ AI จะดู ─────────────────────────────────────────
export function ImageStrip({ keys, max, skip, onToggleSkip }: {
  keys: string[] | null; max: number; skip: string[]; onToggleSkip: (key: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(-1);
  if (keys === null) return <div className="p-3 text-[12px] text-slate-400"><Spinner /> {t("กำลังโหลดรูป…", "Loading images…")}</div>;
  if (keys.length === 0) return <div className="p-3 text-[12px] text-slate-400">{t("สินค้านี้ยังไม่มีรูป — AI จะเขียนจากข้อมูลอย่างเดียว", "No images yet — AI writes from data only")}</div>;
  const used = keys.filter((k) => !skip.includes(k)).slice(0, max);
  return (
    <div>
      <div className="flex sm:grid sm:grid-cols-3 gap-1.5 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0">
        {keys.map((k, i) => {
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
      <p className="mt-1 text-[11px] text-slate-400">
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

const EMPTY_TPL: DescTemplate = { id: "", name: "", headings: [], format: "" };

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
    const row: DescTemplate = { id, name: edit.name.trim(), headings, format: edit.format.trim() };
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
    await commit({ templates: setup.templates.map((x) => (x.id === tp.id ? { ...x, archived } : x)), brand_default: bd },
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
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => void saveEdit()} disabled={busy} className="h-8 px-3 text-[12.5px] font-medium bg-slate-700 text-white rounded-lg disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกแม่แบบ", "Save template")}</button>
          <button type="button" onClick={() => setEdit(null)} className="h-8 px-3 text-[12.5px] border border-slate-200 rounded-lg hover:bg-white">{t("ยกเลิก", "Cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        {live.map((tp) => {
          const on = value === tp.id;
          return (
            <div key={tp.id} role="button" tabIndex={0} onClick={() => onChange(tp.id)} onKeyDown={(e) => { if (e.key === "Enter") onChange(tp.id); }}
              className={`text-left rounded-lg border p-2 cursor-pointer ${on ? "border-fuchsia-400 bg-fuchsia-50/70 ring-1 ring-fuchsia-200" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <div className="flex items-center gap-1">
                <b className="text-[12.5px] font-semibold text-slate-700 flex-1 min-w-0 truncate">{tp.name}</b>
                {brandDefault === tp.id && <span className="text-[10px] px-1.5 rounded-full bg-emerald-50 text-emerald-700">{t("ค่าเริ่มแบรนด์", "brand default")}</span>}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{tp.headings.join(" → ")}</p>
              {canEdit && on && (
                <div className="mt-1.5 flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => { setEdit(tp); setHeadText(tp.headings.join("\n")); }} className="h-6 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50">{t("แก้", "Edit")}</button>
                  {brandId && brandDefault !== tp.id && <button type="button" disabled={busy} onClick={() => void setBrandDefault(tp.id)} className="h-6 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50">{t("ตั้งเป็นค่าเริ่มแบรนด์", "Brand default")}</button>}
                  <button type="button" disabled={busy} onClick={() => void setArchived(tp, true)} className="h-6 px-2 text-[11px] rounded border border-rose-200 text-rose-600 bg-white hover:bg-rose-50">{t("ลบ", "Delete")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(() => { const cur = live.find((x) => x.id === value); return cur?.format ? <p className="mt-1 text-[11px] text-slate-400">{t("รูปแบบ", "Format")}: {cur.format}</p> : null; })()}
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
type TopicRow = { th: string; en: string; options: string; required: boolean };

export function RuleQuickEditor({ rules, onSaved, onClose }: { rules: MatchedRule[]; onSaved: () => void; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? "");
  const rule = rules.find((r) => r.id === ruleId) ?? null;
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [highlights, setHighlights] = useState("");
  const [manual, setManual] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!rule) return;
    const ex = normalizeExtras(rule.extras);
    setRows((rule.required_topics ?? []).map((th, i) => ({
      th, en: (rule.required_topics_en ?? [])[i] ?? "", options: ((rule.topic_options ?? {})[th] ?? []).join(", "), required: !ex.optional_topics.includes(th),
    })));
    setHighlights(ex.highlights.join(", "));
    setManual(ex.manual_required);
  }, [rule]);

  const payloadOf = (r: MatchedRule, extras: RuleExtras | unknown, topics?: TopicRow[]) => {
    const list = topics ?? null;
    return {
      id: r.id, name: r.name, tag_ids: r.tag_ids ?? [], name_keywords: r.name_keywords ?? [], brand_id: r.brand_id ?? null,
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
    const clean = rows.map((x) => ({ ...x, th: x.th.trim(), en: x.en.trim() })).filter((x) => x.th);
    const extras: RuleExtras = {
      highlights: highlights.split(",").map((x) => x.trim()).filter(Boolean),
      manual_required: manual,
      optional_topics: clean.filter((x) => !x.required).map((x) => x.th),
    };
    const prevBody = payloadOf(rule, normalizeExtras(rule.extras));
    setBusy(true);
    try {
      await post(payloadOf(rule, extras, clean));
      onSaved();
      onClose();
      toast.undo(t(`บันทึกกฎ "${rule.name}" แล้ว`, `Rule "${rule.name}" saved`), async () => {
        try { await post(prevBody); onSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };

  const move = (i: number, d: -1 | 1) => setRows((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const upd = (i: number, patch: Partial<TopicRow>) => setRows((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  if (!rule) return null;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-violet-800 font-medium">{t("แก้กฎ", "Edit rule")}</span>
        {rules.length > 1 ? (
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="h-7 px-2 text-[12px] border border-slate-200 rounded bg-white">
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : <b className="text-[12px] text-violet-800">“{rule.name}”</b>}
        <span className="text-[11px] text-violet-600">{t("มีผลกับสินค้าทุกตัวในประเภทนี้ · ลงประวัติ · ย้อนได้", "Affects every product of this type · logged · undoable")}</span>
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
            <input value={x.options} onChange={(e) => upd(i, { options: e.target.value })} placeholder={t("คำตอบให้เลือก คั่นด้วยลูกน้ำ เช่น ซิป, แม่เหล็ก, ไม่มี", "Answer choices, comma-separated")}
              className="mt-1 w-full h-7 px-2 text-[12px] border border-slate-200 rounded" />
          </div>
        ))}
        <button type="button" onClick={() => setRows((p) => [...p, { th: "", en: "", options: "", required: true }])} className="h-7 px-2.5 text-[12px] rounded-full border border-dashed border-slate-300 text-slate-600 bg-white hover:bg-slate-50">＋ {t("เพิ่มหัวข้อ", "Add heading")}</button>
      </div>

      <div>
        <p className="text-[11.5px] text-slate-600 mb-1">{t("รายการจุดเด่นให้ติ๊ก (คั่นด้วยลูกน้ำ)", "Highlight choices (comma-separated)")}</p>
        <input value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder={t("เช่น ผ้าแคนวาสหนา, ก้นตั้งได้, ปักชื่อได้", "e.g. thick canvas, stands upright")}
          className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded bg-white" />
      </div>
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
        <button type="button" onClick={() => void save()} disabled={busy} className="h-8 px-3 text-[12.5px] font-medium bg-violet-600 text-white rounded-lg disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกกฎ", "Save rule")}</button>
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
