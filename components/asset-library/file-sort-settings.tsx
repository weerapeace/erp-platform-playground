"use client";
/**
 * 🗂️ ตั้งค่าตัวแยกไฟล์ ERP (สูตรแยกไฟล์) — เปิดจากคลังไฟล์ หมวด Artwork (สิทธิ์ assets.manage)
 *   แท็บ "โลโก้ / Artwork": ตาราง นามสกุล → รูปตัวอย่างในคลัง / Google Drive / Z: (ลากเรียง = ลำดับเลือกรูปตัวอย่าง)
 *     + รากบน Z: + นามสกุลอื่น + ทดลองดูผล (planFileSort ตัวเดียวกับเซิร์ฟเวอร์) + path Z: ของแต่ละแบรนด์
 *   แท็บ "งานสินค้า": ชื่อโฟลเดอร์ Description / เก็บไฟล์ · ที่เก็บบน Z: · โหมดรูปเดิม + ทดลองกับโฟลเดอร์ตัวอย่าง (planProductSort ตัวเดียวกับเซิร์ฟเวอร์)
 * ข้อมูล: /api/file-sort/config · กฎ: lib/file-sort + lib/file-sort-product · คู่มือ docs/file-sorter.md
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
  DEFAULT_ARTWORK_PROFILE, DEFAULT_PRODUCT_CONFIG, PREVIEWABLE_EXTS, cleanFileSortConfig, findProfile, nasFolderFor, normalizeExt, planFileSort,
  type FileSortConfig, type FileSortProfile, type FileSortRule, type ProductSortConfig,
} from "@/lib/file-sort";
import { planProductSort, productNasFolder } from "@/lib/file-sort-product";
import { DEST_LABEL } from "@/lib/product-image-routing";
import { cleanRoleFolders } from "@/lib/role-folders";
import type { CatalogParent } from "@/lib/product-image-catalog-server";

type BrandRow = { id: string; name: string; folder: string | null };
type TypeRow = { name: string; folder: string };
type Tab = "artwork" | "product";

const SAMPLE_FILES = ["logo.jpg", "logo.png", "logo.psd", "logo.ai", "logo.pdf", "notes.txt", "Thumbs.db"].map((path) => ({ path }));
const canPreview = (ext: string) => (PREVIEWABLE_EXTS as readonly string[]).includes(ext);

// โฟลเดอร์ตัวอย่างของแท็บงานสินค้า (หน้าตาเดียวกับโฟลเดอร์จริงบน Z:) + สินค้าสมมติ BSD15 / BSD15-01
const SAMPLE_PRODUCT_FILES = [
  "[01] Description/1.New Arrival.jpeg", "[01] Description/1.New Arrival.psd", "[01] Description/Ver.2/1.New Arrival.jpeg", "[01] Description/Ver.2/2.Color.jpeg",
  "[03] Rawfiles/IMG_0001.CR2", "[03] Rawfiles/IMG_0001.jpg", "BSD15/1.jpeg", "BSD15/2.jpeg", "BSD15/1.psd",
  "BSD15-01/1.jpeg", "BSD15-01/2.jpeg", "BSD15-01/2.psd", "BSD15-01/BSD15-01.png", "BSD15-01.jpeg", "Thumbs.db",
].map((path) => ({ path, size: 1000 }));
const SAMPLE_PARENTS: CatalogParent[] = [{
  parentId: "sample-p", code: "BSD15", name: "ตัวอย่าง", gallery: 0, galleryItems: [], desc: 0, descItems: [], png: false, pngKey: null, shopIds: [],
  skus: [{ id: "sample-s", code: "BSD15-01", label: "ยีนส์", gallery: 0, items: [] }],
}];
const listText = (xs: string[]) => xs.join(", ");
const parseList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function FileSortSettingsModal({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const toast = useToast();
  const t = useT();
  const [tab, setTab] = useState<Tab>("artwork");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<FileSortConfig | null>(null);
  const [draft, setDraft] = useState<FileSortProfile>(DEFAULT_ARTWORK_PROFILE);
  const [product, setProduct] = useState<ProductSortConfig>(DEFAULT_PRODUCT_CONFIG);
  const [descText, setDescText] = useState(listText(DEFAULT_PRODUCT_CONFIG.roleFolders.desc));
  const [archText, setArchText] = useState(listText(DEFAULT_PRODUCT_CONFIG.roleFolders.archive));
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [newExt, setNewExt] = useState("");
  const [extErr, setExtErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const applyConfig = (cfg: FileSortConfig) => {
    setSaved(cfg); setDraft(findProfile(cfg, "artwork")); setProduct(cfg.product);
    setDescText(listText(cfg.product.roleFolders.desc)); setArchText(listText(cfg.product.roleFolders.archive));
  };

  const load = async () => {
    setLoading(true); setLoadErr(null);
    try {
      const res = await apiFetch("/api/file-sort/config");
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || t("โหลดสูตรไม่สำเร็จ", "Couldn't load the rules"));
      applyConfig(cleanFileSortConfig(j.data));
      setBrands((j.brands ?? []) as BrandRow[]); setTypes((j.artwork_types ?? []) as TypeRow[]);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : t("โหลดสูตรไม่สำเร็จ", "Couldn't load the rules")); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  // ช่องรายชื่อโฟลเดอร์: พิมพ์เป็นข้อความ (คั่นด้วย ,) → แปลงเป็นค่าตั้งทุกครั้งที่พิมพ์
  const productNow: ProductSortConfig = useMemo(() => ({ ...product, roleFolders: cleanRoleFolders({ desc: parseList(descText), archive: parseList(archText) }) }), [product, descText, archText]);
  const savedProfile = saved ? findProfile(saved, "artwork") : null;
  const dirty = !!saved && (JSON.stringify(savedProfile) !== JSON.stringify(draft) || JSON.stringify(saved.product) !== JSON.stringify(productNow));
  const plan = useMemo(() => planFileSort(draft, SAMPLE_FILES), [draft]);
  const productPlan = useMemo(() => planProductSort(SAMPLE_PRODUCT_FILES, SAMPLE_PARENTS, productNow, { jobFolder: "BSD15" }), [productNow]);
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

  const resetTab = () => {
    if (tab === "artwork") setDraft({ ...DEFAULT_ARTWORK_PROFILE, nasRoot: draft.nasRoot });
    else { setProduct({ ...DEFAULT_PRODUCT_CONFIG, nasRoot: product.nasRoot }); setDescText(listText(DEFAULT_PRODUCT_CONFIG.roleFolders.desc)); setArchText(listText(DEFAULT_PRODUCT_CONFIG.roleFolders.archive)); }
  };

  const save = async () => {
    if (!saved || saving) return;
    setSaving(true);
    try {
      const config: FileSortConfig = { profiles: saved.profiles.map((p) => (p.key === draft.key ? draft : p)), product: productNow };
      const res = await apiFetch("/api/file-sort/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      applyConfig(cleanFileSortConfig(j.data));
      toast.success(t("บันทึกสูตรแยกไฟล์แล้ว — ตัวแยกไฟล์ทุกเครื่องใช้สูตรนี้ทันที", "Rules saved — every computer uses them now"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  const chk = "w-4 h-4 accent-indigo-600 disabled:opacity-40";
  const destOf = (d: "preview" | "drive" | "nas") => plan.files.filter((f) => !f.skip && (d === "preview" ? f.preview : f[d]));
  const tabBtn = (k: Tab, label: string) => (
    <button key={k} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}
      className={`h-9 px-4 text-sm rounded-t-lg border-b-2 ${tab === k ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
  );

  return (
    <ERPModal open onClose={onClose} size="lg" loading={loading} hasUnsavedChanges={dirty} storageKey="file-sort-settings"
      title={t("ตั้งค่าตัวแยกไฟล์ ERP", "File sorter settings")}
      description={t("โยนโฟลเดอร์เข้าโปรแกรมตัวแยกไฟล์ → แต่ละไฟล์ไปที่ไหน ตั้งที่นี่ที่เดียว ทุกเครื่องใช้สูตรเดียวกัน", "Where each file goes when a folder is dropped into the File Sorter app. One set of rules for every computer.")}
      footer={<div className="flex items-center justify-between gap-2 w-full">
        <button onClick={resetTab} disabled={!canEdit || loading}
          className="h-9 px-3 text-[13px] text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1.5">
          <Icon name="refresh" /> {t("คืนค่าเริ่มต้นของแท็บนี้", "Reset this tab")}
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
        <div>
          <div className="flex gap-1 border-b border-slate-200 mb-4" role="tablist">
            {tabBtn("artwork", t("โลโก้ / Artwork", "Logo / Artwork"))}
            {tabBtn("product", t("งานสินค้า", "Product work"))}
          </div>

          {tab === "artwork" ? (
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
          ) : (
            <div className="space-y-5">
              <section className="text-[13px] text-slate-600 leading-6">
                <p className="font-medium text-slate-700 mb-1">{t("โยนโฟลเดอร์รุ่น 1 โฟลเดอร์ (เช่น BSD15) แล้วระบบดูชื่อโฟลเดอร์ย่อย", "Drop one model folder (e.g. BSD15); the sub-folder names decide")}</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>{t("โฟลเดอร์ชื่อรหัสรุ่น → แกลเลอรี Parent · ชื่อรหัสสี (SKU) → แกลเลอรี SKU (รูป 1 = ปก)", "Folder named the model code → Parent gallery · colour (SKU) code → SKU gallery (image 1 = cover)")}</li>
                  <li>{t("ไฟล์ชื่อตรงรหัส SKU → ปกของ SKU นั้น · ไฟล์ .png ชื่อตรงรหัส → รูปตัด PNG", "File named exactly the SKU code → that SKU's cover · .png named a code → cut-out PNG")}</li>
                  <li>{t("ลงรูปผ่านตัวจัดรูปกลางชุดเดียวกับปุ่ม 📂 จัดรูปสินค้าหลายโฟลเดอร์ · ย้อนทั้งชุดได้จากปุ่มนั้น", "Uses the same central router as the 📂 button · undo a whole batch from there")}</li>
                  <li>{t("ไฟล์ PSD / RAW และโฟลเดอร์เก็บไฟล์ ไม่ลงระบบ (อยู่บน Z:) · สูตรนี้ไม่ลบ/ไม่ย้ายต้นฉบับ", "PSD / RAW files and archive folders don't go to the ERP (they stay on Z:) · never deletes or moves the source")}</li>
                </ul>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-desc-folders">{t("ชื่อโฟลเดอร์รูป Description", "Description folder names")}</label>
                  <input id="fs-desc-folders" value={descText} disabled={!canEdit} onChange={(e) => setDescText(e.target.value)} placeholder="description, desc"
                    className="w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                  <p className="text-[12px] text-slate-500 mt-1">{t("คั่นด้วย , · ไม่สนเลขนำหน้า เช่น [01] · มีโฟลเดอร์ Ver.2 ใช้เวอร์ชันล่าสุด", "Comma separated · numbering like [01] is ignored · Ver.N folders: newest wins")}</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-arch-folders">{t("ชื่อโฟลเดอร์เก็บไฟล์ (ไม่ลงระบบ)", "Archive folder names (not uploaded)")}</label>
                  <input id="fs-arch-folders" value={archText} disabled={!canEdit} onChange={(e) => setArchText(e.target.value)} placeholder="images, rawfiles"
                    className="w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                  <p className="text-[12px] text-slate-500 mt-1">{t("ไฟล์ข้างในอยู่บน Z: ตามเดิม", "Files inside stay on Z:")}</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-prod-nas">{t("ที่เก็บบน Z: (เฉพาะโฟลเดอร์ที่ยังไม่อยู่บน Z:)", "Z: location (only for folders not on Z: yet)")}</label>
                  <input id="fs-prod-nas" value={product.nasRoot} disabled={!canEdit} spellCheck={false} onChange={(e) => setProduct((p) => ({ ...p, nasRoot: e.target.value }))} placeholder="Z:\Work In Process\[01] New Product"
                    className="w-full h-9 px-3 text-[13px] font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                  <p className="text-[12px] text-slate-500 mt-1 font-mono break-all">{t("ตัวอย่าง: ", "Example: ")}{productNasFolder(productNow, "BSD15") ?? t("— ไม่ก๊อปลง Z:", "— not copied")}</p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-slate-700 mb-1">{t("รูปเดิมของสินค้าในระบบ", "Existing product images")}</p>
                  <div className="flex flex-col gap-1 text-[13px]">
                    <label className="inline-flex items-center gap-2"><input type="radio" name="fs-mode" className={chk} checked={product.mode === "replace"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, mode: "replace" }))} />{t("แทนที่ทั้งชุด (กดซ้ำแล้วไม่ซ้ำ)", "Replace the set (safe to re-run)")}</label>
                    <label className="inline-flex items-center gap-2"><input type="radio" name="fs-mode" className={chk} checked={product.mode === "append"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, mode: "append" }))} />{t("ต่อท้ายรูปเดิม", "Append")}</label>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-1">{t("ค่าตั้งต้นในโปรแกรม (เปลี่ยนเป็นรายครั้งได้) · รูปเดิมที่ถูกแทนย้อนคืนได้", "Default in the app (changeable per run) · replaced images can be restored")}</p>
                </div>
              </section>

              <section className="rounded-lg bg-slate-50 p-3">
                <p className="text-[13px] font-medium text-slate-700 mb-2">{t("ทดลอง: ถ้าโยนโฟลเดอร์ BSD15 แบบนี้", "Try it: a BSD15 folder like this")}</p>
                <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 text-[12px]">
                  {productPlan.files.map((f) => (
                    <div key={f.rel} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2 px-2 py-1">
                      <span className="font-mono text-slate-700 truncate" title={f.rel}>{f.rel}</span>
                      <span className={f.erp ? "text-indigo-700" : "text-slate-500"}>
                        {f.erp && f.dest && f.dest !== "skip" ? DEST_LABEL[f.dest] : f.nas ? t("อยู่บน Z: (ไม่ลงระบบ)", "Stays on Z:") : t("ข้าม", "Skipped")}
                        {!f.erp && f.note ? <span className="text-slate-400"> · {f.note}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
                {productPlan.warnings.map((w) => <p key={w} className="text-[12px] text-amber-700 mt-1">{w}</p>)}
              </section>
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
