"use client";
/**
 * 🗂️ ตั้งค่าตัวแยกไฟล์ ERP (สูตรแยกไฟล์) — เปิดจากคลังไฟล์ หมวด Artwork (สิทธิ์ assets.manage)
 *   ตาราง นามสกุล → รูปตัวอย่างในคลัง / Google Drive / Z: (ลากเรียง = ลำดับเลือกรูปตัวอย่าง)
 *   + รากบน Z: + นามสกุลอื่น + ทดลองดูผล (ใช้ planFileSort ตัวเดียวกับเซิร์ฟเวอร์) + path Z: ของแต่ละแบรนด์
 * ข้อมูล: /api/file-sort/config · กฎ: lib/file-sort · คู่มือ docs/file-sorter.md
 * ของกลาง: ERPModal · useDragReorder/DragHandle · Icon · useToast · useT
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import {
  DEFAULT_ARTWORK_PROFILE, PREVIEWABLE_EXTS, cleanFileSortConfig, findProfile, nasFolderFor, normalizeExt, planFileSort,
  type FileSortConfig, type FileSortProfile, type FileSortRule,
} from "@/lib/file-sort";

type BrandRow = { id: string; name: string; folder: string | null };
type TypeRow = { name: string; folder: string };

const SAMPLE_FILES = ["logo.jpg", "logo.png", "logo.psd", "logo.ai", "logo.pdf", "notes.txt", "Thumbs.db"].map((path) => ({ path }));
const canPreview = (ext: string) => (PREVIEWABLE_EXTS as readonly string[]).includes(ext);

export function FileSortSettingsModal({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const toast = useToast();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<FileSortConfig | null>(null);
  const [draft, setDraft] = useState<FileSortProfile>(DEFAULT_ARTWORK_PROFILE);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [newExt, setNewExt] = useState("");
  const [extErr, setExtErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setLoadErr(null);
    try {
      const res = await apiFetch("/api/file-sort/config");
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || t("โหลดสูตรไม่สำเร็จ", "Couldn't load the rules"));
      const cfg = cleanFileSortConfig(j.data);
      setSaved(cfg); setDraft(findProfile(cfg, "artwork"));
      setBrands((j.brands ?? []) as BrandRow[]); setTypes((j.artwork_types ?? []) as TypeRow[]);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : t("โหลดสูตรไม่สำเร็จ", "Couldn't load the rules")); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const savedProfile = saved ? findProfile(saved, "artwork") : null;
  const dirty = !!savedProfile && JSON.stringify(savedProfile) !== JSON.stringify(draft);
  const plan = useMemo(() => planFileSort(draft, SAMPLE_FILES), [draft]);
  const sampleBrand = brands.find((b) => b.folder) ?? null;
  const sampleType = types[0] ?? null;

  const setRule = (i: number, patch: Partial<FileSortRule>) => setDraft((d) => ({ ...d, rules: d.rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const removeRule = (i: number) => setDraft((d) => ({ ...d, rules: d.rules.filter((_, k) => k !== i) }));
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setDraft((d) => ({ ...d, rules: moveItem(d.rules, from, to) })));

  const addExt = () => {
    const ext = normalizeExt(newExt);
    if (!ext) { setExtErr(t("พิมพ์นามสกุลก่อน เช่น indd", "Type an extension, e.g. indd")); return; }
    if (draft.rules.some((r) => r.ext === ext)) { setExtErr(t(`มี .${ext} ในตารางแล้ว`, `.${ext} is already listed`)); return; }
    setDraft((d) => ({ ...d, rules: [...d.rules, { ext, library: false, drive: true, nas: true }] }));
    setNewExt(""); setExtErr(null);
  };

  const save = async () => {
    if (!saved || saving) return;
    setSaving(true);
    try {
      const config: FileSortConfig = { profiles: saved.profiles.map((p) => (p.key === draft.key ? draft : p)) };
      const res = await apiFetch("/api/file-sort/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      const cfg = cleanFileSortConfig(j.data);
      setSaved(cfg); setDraft(findProfile(cfg, "artwork"));
      toast.success(t("บันทึกสูตรแยกไฟล์แล้ว — ตัวแยกไฟล์ทุกเครื่องใช้สูตรนี้ทันที", "Rules saved — every computer uses them now"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  const chk = "w-4 h-4 accent-indigo-600 disabled:opacity-40";
  const destOf = (d: "preview" | "drive" | "nas") => plan.files.filter((f) => !f.skip && (d === "preview" ? f.preview : f[d]));

  return (
    <ERPModal open onClose={onClose} size="lg" loading={loading} hasUnsavedChanges={dirty} storageKey="file-sort-settings"
      title={t("ตั้งค่าตัวแยกไฟล์ (สูตร โลโก้ / Artwork)", "File sorter settings (Logo / Artwork)")}
      description={t("โยนโฟลเดอร์เข้าโปรแกรมตัวแยกไฟล์ → แต่ละไฟล์ไปที่ไหน ตั้งที่นี่ที่เดียว ทุกเครื่องใช้สูตรเดียวกัน", "Where each file goes when a folder is dropped into the File Sorter app. One set of rules for every computer.")}
      footer={<div className="flex items-center justify-between gap-2 w-full">
        <button onClick={() => setDraft({ ...DEFAULT_ARTWORK_PROFILE, nasRoot: draft.nasRoot })} disabled={!canEdit || loading}
          className="h-9 px-3 text-[13px] text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1.5">
          <Icon name="refresh" /> {t("คืนค่าตารางเริ่มต้น", "Reset table")}
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {canEdit && <button onClick={save} disabled={!dirty || saving}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            <Icon name="save" /> {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
          </button>}
        </div>
      </div>}>
      {loadErr ? (
        <div className="py-8 text-center">
          <p className="text-sm text-rose-600 mb-3">{loadErr}</p>
          <button onClick={() => void load()} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ลองใหม่", "Retry")}</button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 1) รากบน Z: */}
          <section>
            <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-nas-root">{t("ที่เก็บบน Synology (Z:)", "Synology (Z:) location")}</label>
            <input id="fs-nas-root" value={draft.nasRoot} disabled={!canEdit} spellCheck={false}
              onChange={(e) => setDraft((d) => ({ ...d, nasRoot: e.target.value }))} placeholder="Z:\Assets"
              className="w-full h-9 px-3 text-[13px] font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
            <p className="text-[12px] text-slate-500 mt-1">
              {t("โฟลเดอร์งานบน Z: = ที่เก็บนี้ › โฟลเดอร์แบรนด์ › ซับตามชนิด › ชื่องาน (ชื่อเดียวกับบน Drive) · เว้นว่าง = ไม่ส่งลง Z:", "Job folder on Z: = this location › brand folder › type subfolder › job name (same names as Drive). Leave empty to skip Z:.")}
            </p>
            {sampleBrand && <p className="text-[12px] text-slate-600 mt-1 font-mono break-all">
              {t("ตัวอย่าง: ", "Example: ")}{nasFolderFor(draft, sampleBrand.folder, sampleType?.folder, "Logo Calypso") ?? t("— (ไม่ส่งลง Z:)", "— (Z: off)")}
            </p>}
          </section>

          {/* 2) ตารางสูตร */}
          <section>
            <p className="text-[13px] font-medium text-slate-700 mb-1">{t("ไฟล์แต่ละนามสกุลไปที่ไหน", "Where each file type goes")}</p>
            <p className="text-[12px] text-slate-500 mb-2">{t("รูปตัวอย่าง = ใช้ทำรูปการ์ดในคลัง (เลือก 1 รูป: แถวบนก่อน · ลากหูจับเพื่อเรียงลำดับ)", "Preview = used as the card image in the library (one image: higher rows win · drag to reorder)")}</p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[28px_minmax(0,1fr)_96px_80px_64px_36px] items-center gap-1 px-2 py-1.5 bg-slate-50 text-[12px] text-slate-500 font-medium">
                <span /><span>{t("นามสกุล", "Extension")}</span>
                <span className="text-center">{t("รูปตัวอย่าง", "Preview")}</span>
                <span className="text-center">Drive</span><span className="text-center">Z:</span><span />
              </div>
              {draft.rules.length === 0 && <p className="px-3 py-4 text-[13px] text-slate-500 text-center">{t("ยังไม่มีนามสกุลในตาราง — ทุกไฟล์จะใช้แถว “นามสกุลอื่น”", "No extensions yet — every file uses “Other extensions”")}</p>}
              {draft.rules.map((r, i) => (
                <div key={r.ext} {...rowProps(i)} className={`grid grid-cols-[28px_minmax(0,1fr)_96px_80px_64px_36px] items-center gap-1 px-2 py-1 border-t border-slate-100 ${rowCls(i)}`}>
                  {canEdit ? <DragHandle {...handleProps(i)} title={t("ลากเพื่อเรียง", "Drag to reorder")} /> : <span />}
                  <span className="font-mono text-[13px] text-slate-700">.{r.ext}</span>
                  <span className="text-center"><input type="checkbox" className={chk} checked={r.library} disabled={!canEdit || !canPreview(r.ext)}
                    title={canPreview(r.ext) ? "" : t("ทำรูปตัวอย่างได้เฉพาะ JPG / PNG / WEBP", "Only JPG / PNG / WEBP can be previews")}
                    aria-label={t(`.${r.ext} ใช้เป็นรูปตัวอย่าง`, `.${r.ext} as preview`)} onChange={(e) => setRule(i, { library: e.target.checked })} /></span>
                  <span className="text-center"><input type="checkbox" className={chk} checked={r.drive} disabled={!canEdit} aria-label={`.${r.ext} → Drive`} onChange={(e) => setRule(i, { drive: e.target.checked })} /></span>
                  <span className="text-center"><input type="checkbox" className={chk} checked={r.nas} disabled={!canEdit} aria-label={`.${r.ext} → Z:`} onChange={(e) => setRule(i, { nas: e.target.checked })} /></span>
                  {canEdit ? <button onClick={() => removeRule(i)} title={t("เอาออกจากตาราง", "Remove")} aria-label={t(`เอา .${r.ext} ออก`, `Remove .${r.ext}`)}
                    className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-rose-600 rounded"><Icon name="trash" /></button> : <span />}
                </div>
              ))}
              <div className="grid grid-cols-[28px_minmax(0,1fr)_96px_80px_64px_36px] items-center gap-1 px-2 py-1.5 border-t border-slate-200 bg-slate-50/60">
                <span /><span className="text-[13px] text-slate-600">{t("นามสกุลอื่น ๆ", "Other extensions")}</span>
                <span className="text-center text-[11px] text-slate-400">—</span>
                <span className="text-center"><input type="checkbox" className={chk} checked={draft.other.drive} disabled={!canEdit} aria-label={t("นามสกุลอื่น → Drive", "Other → Drive")} onChange={(e) => setDraft((d) => ({ ...d, other: { ...d.other, drive: e.target.checked } }))} /></span>
                <span className="text-center"><input type="checkbox" className={chk} checked={draft.other.nas} disabled={!canEdit} aria-label={t("นามสกุลอื่น → Z:", "Other → Z:")} onChange={(e) => setDraft((d) => ({ ...d, other: { ...d.other, nas: e.target.checked } }))} /></span>
                <span />
              </div>
            </div>
            {canEdit && <div className="mt-2">
              <div className="flex gap-2">
                <input value={newExt} onChange={(e) => { setNewExt(e.target.value); setExtErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") addExt(); }}
                  placeholder={t("เพิ่มนามสกุล เช่น indd", "Add extension, e.g. indd")} aria-label={t("นามสกุลใหม่", "New extension")}
                  className="h-8 w-48 px-2 text-[13px] font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={addExt} className="h-8 px-3 text-[12px] font-medium border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="plus" /> {t("เพิ่ม", "Add")}</button>
              </div>
              {extErr && <p className="text-[12px] text-rose-600 mt-1">{extErr}</p>}
            </div>}
            <p className="text-[12px] text-slate-500 mt-2">{t("ไฟล์ระบบ (Thumbs.db, desktop.ini, ไฟล์ชั่วคราว ~$…) ข้ามเสมอ", "System files (Thumbs.db, desktop.ini, temp ~$… files) are always skipped")}</p>
          </section>

          {/* 3) ทดลองดูผล */}
          <section className="rounded-lg bg-slate-50 p-3">
            <p className="text-[13px] font-medium text-slate-700 mb-2">{t("ทดลอง: ถ้าโยนโฟลเดอร์ที่มีไฟล์เหล่านี้", "Try it: a folder with these files")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([["preview", t("รูปตัวอย่างในคลัง", "Library preview"), "image"], ["drive", "Google Drive", "folder"], ["nas", "Synology (Z:)", "folder-open"]] as const).map(([k, label, icon]) => (
                <div key={k} className="bg-white border border-slate-200 rounded-lg p-2 min-w-0">
                  <p className="text-[12px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1"><Icon name={icon} /> {label}</p>
                  <div className="flex flex-wrap gap-1">
                    {destOf(k).length ? destOf(k).map((f) => <span key={f.rel} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{f.name}</span>)
                      : <span className="text-[11px] text-slate-400">{t("ไม่มี", "None")}</span>}
                  </div>
                </div>
              ))}
            </div>
            {plan.files.some((f) => f.skip) && <p className="text-[12px] text-slate-500 mt-2">{t("ข้าม: ", "Skipped: ")}{plan.files.filter((f) => f.skip).map((f) => f.name).join(", ")}</p>}
            {plan.warnings.map((w) => <p key={w} className="text-[12px] text-amber-700 mt-1">{w}</p>)}
          </section>

          {/* 4) path Z: ของแต่ละแบรนด์ */}
          <section>
            <p className="text-[13px] font-medium text-slate-700 mb-1">{t("โฟลเดอร์ของแต่ละแบรนด์บน Z:", "Each brand's folder on Z:")}</p>
            <p className="text-[12px] text-slate-500 mb-2">{t("ใช้ชื่อโฟลเดอร์แบรนด์จาก ⚙️ โฟลเดอร์มาตรฐาน (หน้าเพิ่ม Artwork) — แบรนด์ที่ยังไม่ตั้ง ส่งลง Z: ไม่ได้", "Brand folder names come from ⚙️ Standard folders (Add Artwork). Brands without one can't go to Z:.")}</p>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-auto">
              {brands.length === 0 && <p className="px-3 py-3 text-[13px] text-slate-500">{t("ยังไม่มีแบรนด์", "No brands yet")}</p>}
              {brands.map((b) => (
                <div key={b.id} className="px-3 py-1.5 grid grid-cols-[140px_minmax(0,1fr)] gap-2 items-center">
                  <span className="text-[13px] text-slate-700 truncate">{b.name}</span>
                  {b.folder
                    ? <span className="text-[12px] font-mono text-slate-600 break-all">{draft.nasRoot.trim() ? `${draft.nasRoot.trim().replace(/[\\/]+$/, "")}\\${b.folder}\\…` : t("— ไม่ส่งลง Z:", "— Z: off")}</span>
                    : <span className="text-[12px] text-amber-700">{t("ยังไม่ได้ตั้งโฟลเดอร์แบรนด์", "Brand folder not set")}</span>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </ERPModal>
  );
}
