"use client";
/**
 * การ์ดรู้จักแบรนด์ — ป๊อปกลาง (เปิดได้จาก: วางแผนแบบ Mass ในปฏิทินคอนเทนต์ · ตั้งค่างาน แท็บ Prompt แคปชั่น AI)
 * ทุกปุ่ม AI ใช้ข้อมูลนี้ร่วมกัน (วางแผน Mass · เขียนแคปชั่น · รายละเอียดสินค้า) — ตัวคิดอยู่ที่ lib/marketing/brand-profile
 *   - 6 ช่องพิมพ์เอง + แคปชั่นตัวอย่าง (เลือกจากแคปชั่นเก่าของแบรนด์ หรือพิมพ์เอง ไม่เกิน 3)
 *   - "สินค้าเด่นตอนนี้" ระบบเติมให้สดทุกครั้งจากป้าย NEW IN / Hero ในหน้า SKU การตลาด (แสดงให้ดูเฉย ๆ)
 *   - ปุ่ม "ให้ AI ช่วยร่าง" เติมเฉพาะช่องที่ยังว่าง (ไม่ทับที่พิมพ์ไว้) · ยังไม่บันทึกจนกดบันทึก
 * แก้ได้ = tasks.approve (เท่ากับแก้ prompt AI) · คนอื่นเปิดดูได้อย่างเดียว
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { usePushToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import {
  BRAND_PROFILE_FIELDS, BRAND_PROFILE_MAX_EXAMPLES, EMPTY_BRAND_PROFILE, brandProfileFilled, type BrandProfile,
} from "@/lib/marketing/brand-profile";
import { draftBrandProfile, getBrandProfile, saveBrandProfile, type BrandRecentCaption } from "../data";
import { platformMeta } from "../use-options";

const areaCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function BrandProfileModal({ brandId, brandName, onClose, onSaved }: {
  brandId: string;
  brandName: string;
  onClose: () => void;
  /** บันทึกแล้ว → ส่งการ์ดใหม่กลับ (ผู้เรียกอัปเดตตัวเลข "ครบกี่ช่อง") */
  onSaved?: (p: BrandProfile) => void;
}) {
  const t = useT();
  const pushToast = usePushToast();
  const { can } = useAuth();
  const canEdit = can("tasks.approve" as never);
  const canAi = can("ai.caption" as never);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [orig, setOrig] = useState<BrandProfile>(EMPTY_BRAND_PROFILE);
  const [p, setP] = useState<BrandProfile>(EMPTY_BRAND_PROFILE);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [recent, setRecent] = useState<BrandRecentCaption[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadErr(null);
    getBrandProfile(brandId, true)
      .then((r) => { if (!alive) return; setOrig(r.profile); setP(r.profile); setHighlights(r.highlights); setRecent(r.recent_captions ?? []); })
      .catch((e) => { if (alive) setLoadErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [brandId]);

  const dirty = JSON.stringify({ ...p, updated_at: null, updated_by: null }) !== JSON.stringify({ ...orig, updated_at: null, updated_by: null });
  const filled = brandProfileFilled(p);
  const setField = (k: keyof BrandProfile, v: string) => setP((x) => ({ ...x, [k]: v }));
  const setExample = (i: number, v: string) => setP((x) => ({ ...x, examples: x.examples.map((e, j) => (j === i ? v : e)) }));
  const addExample = (v = "") => setP((x) => (x.examples.length >= BRAND_PROFILE_MAX_EXAMPLES ? x : { ...x, examples: [...x.examples, v] }));
  const removeExample = (i: number) => setP((x) => ({ ...x, examples: x.examples.filter((_, j) => j !== i) }));

  const runDraft = async () => {
    setDrafting(true);
    try {
      const r = await draftBrandProfile(brandId);
      // เติมเฉพาะช่องที่ยังว่าง (ไม่ทับที่พิมพ์ไว้ — รวมที่พิมพ์ระหว่างรอ AI)
      const fill = (x: BrandProfile) => {
        const next = { ...x };
        let n = 0;
        for (const f of BRAND_PROFILE_FIELDS) {
          const v = (r.draft[f.key] ?? "").trim();
          if (!next[f.key].trim() && v) { next[f.key] = v; n++; }
        }
        if (!next.examples.some((e) => e.trim()) && r.examples.length) { next.examples = r.examples.slice(0, BRAND_PROFILE_MAX_EXAMPLES); n++; }
        return { next, n };
      };
      const { n } = fill(p);
      setP((x) => fill(x).next);
      pushToast(n ? "success" : "info", n
        ? t("AI ร่างช่องที่ว่างให้แล้ว — ตรวจแก้ โดยเฉพาะข้อความใน [ ] แล้วกดบันทึก", "AI filled the empty fields — review (esp. [ ] parts) then save")
        : t("ทุกช่องมีข้อความแล้ว AI ไม่ได้ทับ — ลบช่องที่อยากให้ร่างใหม่ก่อน", "All fields already filled — clear a field to redraft it"));
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setDrafting(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveBrandProfile(brandId, { ...p, examples: p.examples.map((e) => e.trim()).filter(Boolean) });
      setOrig(saved); setP(saved);
      pushToast("success", t(`บันทึกการ์ดของ ${brandName} แล้ว — ปุ่ม AI ทุกตัวใช้ข้อมูลนี้ทันที`, `Saved ${brandName} card — all AI buttons use it now`));
      onSaved?.(saved);
      onClose();
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="brand-ai-profile" hasUnsavedChanges={dirty}
      title={t(`การ์ดรู้จักแบรนด์ — ${brandName}`, `Brand card — ${brandName}`)}
      description={t("ตั้งครั้งเดียว ทุกปุ่ม AI ใช้ร่วมกัน (วางแผน Mass · เขียนแคปชั่น · รายละเอียดสินค้า) ยิ่งละเอียด AI ยิ่งเขียนตรงแบรนด์", "Set once — every AI button uses it (mass plan, captions, product details)")}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && canAi && (
            <button onClick={runDraft} disabled={drafting || loading} className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-50">
              <Icon name="ai" /> {drafting ? t("AI กำลังร่าง…", "Drafting…") : t("ให้ AI ช่วยร่างช่องที่ว่าง", "Let AI draft empty fields")}
            </button>
          )}
          <span className="text-xs text-slate-500">{t(`กรอกแล้ว ${filled.done}/${filled.total}`, `${filled.done}/${filled.total} filled`)}</span>
          <div className="flex-1" />
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{canEdit ? t("ยกเลิก", "Cancel") : t("ปิด", "Close")}</button>
          {canEdit && (
            <button onClick={save} disabled={saving || loading || !dirty} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
          )}
        </div>}>
      {loading ? <p className="py-8 text-center text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
        : loadErr ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t("โหลดการ์ดไม่สำเร็จ: ", "Could not load: ")}{loadErr}</div>
        : (
          <div className="space-y-3">
            {!canEdit && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><Icon name="lock" /> {t("ดูได้อย่างเดียว — หัวหน้า/ผู้ดูแลเป็นคนแก้การ์ดนี้", "View only — leads/admins edit this card")}</div>}
            {BRAND_PROFILE_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">{t(f.label, f.labelEn)}</span>
                <textarea value={p[f.key]} onChange={(e) => setField(f.key, e.target.value)} rows={f.rows} disabled={!canEdit}
                  placeholder={t(f.hint, f.hintEn)} className={areaCls} />
              </label>
            ))}

            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-600">
                {t("สินค้าเด่นตอนนี้", "Highlighted products")}
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-normal text-emerald-700">{t("ระบบเติมให้", "auto")}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {highlights.length ? highlights.join(" · ") : t("ยังไม่มี — ติดป้าย NEW IN หรือ Hero Products ในหน้า SKU การตลาด แล้ว AI จะเห็นเอง", "None yet — tag models NEW IN / Hero Products on the marketing SKU page")}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">{t(`แคปชั่นตัวอย่างที่ชอบ (ไม่เกิน ${BRAND_PROFILE_MAX_EXAMPLES}) — AI เลียนโทน ไม่ลอกคำ`, `Example captions (max ${BRAND_PROFILE_MAX_EXAMPLES})`)}</span>
                {canEdit && p.examples.length < BRAND_PROFILE_MAX_EXAMPLES && (
                  <div className="flex items-center gap-1.5">
                    {recent.length > 0 && <button type="button" onClick={() => setShowRecent((s) => !s)} className="h-7 px-2.5 text-xs text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">{showRecent ? t("ซ่อนแคปชั่นเก่า", "Hide old captions") : t(`เลือกจากแคปชั่นเก่า (${recent.length})`, `Pick from old captions (${recent.length})`)}</button>}
                    <button type="button" onClick={() => addExample()} className="h-7 px-2.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("+ พิมพ์เอง", "+ Write one")}</button>
                  </div>
                )}
              </div>
              {p.examples.length === 0 && <p className="text-xs text-slate-400">{t("ยังไม่มีตัวอย่าง", "No examples yet")}</p>}
              <div className="space-y-2">
                {p.examples.map((e, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <textarea value={e} onChange={(ev) => setExample(i, ev.target.value)} rows={3} disabled={!canEdit} className={areaCls} />
                    {canEdit && <button type="button" onClick={() => removeExample(i)} aria-label={t("เอาออก", "Remove")} className="mt-1 h-7 w-7 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"><Icon name="delete" /></button>}
                  </div>
                ))}
              </div>
              {showRecent && canEdit && (
                <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {recent.map((c, i) => {
                    const used = p.examples.some((e) => e.trim() === c.caption.trim());
                    return (
                      <div key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                        <PlatformIcon code={c.platform} iconKey={platformMeta(c.platform)?.icon_key ?? null} size={14} />
                        <div className="min-w-0 flex-1 text-xs text-slate-600">
                          {c.title && <div className="font-medium text-slate-700">{c.title}</div>}
                          <div className="line-clamp-3 whitespace-pre-line">{c.caption}</div>
                        </div>
                        <button type="button" disabled={used || p.examples.length >= BRAND_PROFILE_MAX_EXAMPLES} onClick={() => addExample(c.caption)}
                          className="h-7 shrink-0 px-2.5 text-xs text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-40">{used ? t("ใช้แล้ว", "Used") : t("ใช้อันนี้", "Use")}</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {p.updated_at && <p className="text-[11px] text-slate-400">{t("แก้ล่าสุด", "Last edited")} {new Date(p.updated_at).toLocaleString("th-TH")}{p.updated_by ? ` · ${p.updated_by}` : ""}</p>}
          </div>
        )}
    </ERPModal>
  );
}
