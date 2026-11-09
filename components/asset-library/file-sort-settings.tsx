"use client";
/**
 * 🗂️ ตั้งค่าตัวแยกไฟล์ ERP (สูตรแยกไฟล์) — เปิดจากคลังไฟล์ หมวด Artwork (สิทธิ์ assets.manage)
 *   แท็บ "โลโก้ / Artwork": ตาราง นามสกุล → รูปตัวอย่างในคลัง / Google Drive / Z: (ลากเรียง = ลำดับเลือกรูปตัวอย่าง)
 *     + รากบน Z: + นามสกุลอื่น + ทดลองดูผล (planFileSort ตัวเดียวกับเซิร์ฟเวอร์) + path Z: ของแต่ละแบรนด์
 *   แท็บ "งานสินค้า": ชื่อโฟลเดอร์ Description / เก็บไฟล์ · ที่เก็บบน Z: · โหมดรูปเดิม + ทดลองกับโฟลเดอร์ตัวอย่าง (planProductSort ตัวเดียวกับเซิร์ฟเวอร์)
 *   แท็บ "Content": ที่เก็บบน Z: · ชื่อโฟลเดอร์ไฟล์ดิบ · นามสกุลที่ลงอัลบั้ม + ทดลอง (planContentSort ตัวเดียวกับเซิร์ฟเวอร์)
 * ข้อมูล: /api/file-sort/config · กฎ: lib/file-sort + lib/file-sort-product · คู่มือ docs/file-sorter.md
 * ของกลาง: ERPModal · useDragReorder/DragHandle · Icon · useToast · useT
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import {
  DEFAULT_ARTWORK_PROFILE, DEFAULT_CONTENT_CONFIG, DEFAULT_PRODUCT_CONFIG, MOVE_ROLES, MOVE_ROLE_LABEL, NAS_TOKENS, NAS_TOKEN_HINT, PREVIEWABLE_EXTS, PRODUCT_VARIANTS, PRODUCT_VARIANT_LABEL, type MoveRole,
  cleanContentConfig, cleanFileSortConfig, collectionDefaultFor, fillNasPattern, findProfile, nasDateValues, nasFolderFor, nasPrefixOf, normalizeExt, planFileSort,
  type ContentSortConfig, type FileSortConfig, type FileSortProfile, type FileSortRule, type NasToken, type ProductSortConfig, type ProductVariant,
} from "@/lib/file-sort";
import { planProductMoves, planProductSort, planTidyRenames, productNasFolder } from "@/lib/file-sort-product";
import { contentNasFolder, planContentSort } from "@/lib/file-sort-content";
import { DEST_LABEL } from "@/lib/product-image-routing";
import { cleanRoleFolders } from "@/lib/role-folders";
import type { CatalogParent } from "@/lib/product-image-catalog-server";

type BrandRow = { id: string; name: string; folder: string | null };
type TypeRow = { name: string; folder: string };
type Tab = "artwork" | "product" | "content";

const SAMPLE_FILES = ["logo.jpg", "logo.png", "logo.psd", "logo.ai", "logo.pdf", "notes.txt", "Thumbs.db"].map((path) => ({ path }));
const canPreview = (ext: string) => (PREVIEWABLE_EXTS as readonly string[]).includes(ext);

// โฟลเดอร์ตัวอย่างของแท็บงานสินค้า (หน้าตาเดียวกับโฟลเดอร์จริงบน Z:) + สินค้าสมมติ BSD15 / BSD15-01
const SAMPLE_PRODUCT_FILES = [
  "[01] Description/1.New Arrival.jpeg", "[01] Description/1.New Arrival.psd", "[01] Description/Ver.2/1.New Arrival.jpeg", "[01] Description/Ver.2/2.Color.jpeg",
  "[02] Images/lifestyle-1.jpg", "[03] Rawfiles/IMG_0001.CR2", "[03] Rawfiles/IMG_0001.jpg", "BSD15/1.jpeg", "BSD15/2.jpeg", "BSD15/1.psd",
  "BSD15-01/1.jpeg", "BSD15-01/2.jpeg", "BSD15-01/2.psd", "BSD15-01/BSD15-01.png", "BSD15-01.jpeg", "BSD15-02/1.jpeg", "BSD15-02/2.jpeg", "Thumbs.db",
].map((path) => ({ path, size: 1000 }));
// สินค้าสมมติ: BSD15-01 มีรูปในระบบแล้ว (สีเดิม) · BSD15-02 ยังไม่มีรูป (สีใหม่)
const SAMPLE_PARENTS: CatalogParent[] = [{
  parentId: "sample-p", code: "BSD15", name: "ตัวอย่าง", gallery: 0, galleryItems: [], desc: 0, descItems: [], png: false, pngKey: null, shopIds: [],
  skus: [
    { id: "sample-s1", code: "BSD15-01", label: "ยีนส์เข้ม", gallery: 3, items: [{ id: "x1", key: "x1", primary: true }, { id: "x2", key: "x2", primary: false }, { id: "x3", key: "x3", primary: false }] },
    { id: "sample-s2", code: "BSD15-02", label: "ยีนส์อ่อน", gallery: 0, items: [] },
  ],
}];
const SAMPLE_ART_TYPE = { name: "โลโก้", folder: "01_Logo" };
// โฟลเดอร์ตัวอย่างของแท็บ Content (โครงเดียวกับ Create Folder Tool แท็บ Contents)
const SAMPLE_CONTENT_FOLDER = "2026_11_08-1_MPU15";
const SAMPLE_CONTENT_FILES = [
  "01_Instagram/1.jpg", "01_Instagram/2.jpg", "01_Instagram/reel.mp4", "02_Facebook/1.jpg", "04_Shop Decoration/banner.png",
  "01_Images_1/cover.jpg", "01_Images_1/cover.psd", "00_rawfiles/IMG_0001.CR2", "00_rawfiles/IMG_0001.jpg", "Thumbs.db",
].map((path) => ({ path, size: 1000 }));
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
  const [moveText, setMoveText] = useState<Record<MoveRole, string>>({ raw: listText(DEFAULT_PRODUCT_CONFIG.moveFolders.raw), images: listText(DEFAULT_PRODUCT_CONFIG.moveFolders.images) });
  const [content, setContent] = useState<ContentSortConfig>(DEFAULT_CONTENT_CONFIG);
  const [rawText, setRawText] = useState(listText(DEFAULT_CONTENT_CONFIG.rawFolders));
  const [extText, setExtText] = useState(listText(DEFAULT_CONTENT_CONFIG.albumExts));
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [newExt, setNewExt] = useState("");
  const [extErr, setExtErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sampleVariant, setSampleVariant] = useState<ProductVariant>("new");
  // ช่องแม่แบบที่กำลังแก้ (กดช่องเติมคำ → แทรกตรงเคอร์เซอร์ของช่องนี้)
  const patternInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusKey, setFocusKey] = useState("art");

  const applyConfig = (cfg: FileSortConfig) => {
    setSaved(cfg); setDraft(findProfile(cfg, "artwork")); setProduct(cfg.product);
    setDescText(listText(cfg.product.roleFolders.desc)); setArchText(listText(cfg.product.roleFolders.archive));
    setMoveText({ raw: listText(cfg.product.moveFolders.raw), images: listText(cfg.product.moveFolders.images) });
    setContent(cfg.content); setRawText(listText(cfg.content.rawFolders)); setExtText(listText(cfg.content.albumExts));
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
  const productNow: ProductSortConfig = useMemo(() => ({
    ...product, roleFolders: cleanRoleFolders({ desc: parseList(descText), archive: parseList(archText) }),
    moveFolders: { raw: [...new Set(parseList(moveText.raw).map((s) => s.toLowerCase()))], images: [...new Set(parseList(moveText.images).map((s) => s.toLowerCase()))] },
  }), [product, descText, archText, moveText]);
  const sampleMoves = useMemo(() => planProductMoves(SAMPLE_PRODUCT_FILES, productNow, { jobFolder: "BSD15", brandFolder: "[01] Louis Montini" }).moves, [productNow]);
  const sampleTidy = useMemo(() => planTidyRenames(["Description", "Lifestyle", "Model"], productNow), [productNow]);
  // ตัวอย่างที่เก็บ Collection ของรุ่น BSD15 ({กลุ่ม} โชว์เป็น BSD — ของจริงโปรแกรมหาจากโฟลเดอร์บน Z:)
  const collExample = (pattern: string, brandFolder: string | null): string | null =>
    fillNasPattern(pattern, { แบรนด์: brandFolder ?? "", รุ่น: "BSD15", โฟลเดอร์: "BSD15", กลุ่ม: "BSD", ...nasDateValues() }, pattern.includes("{แบรนด์}") ? ["แบรนด์"] : []);
  const savedProfile = saved ? findProfile(saved, "artwork") : null;
  const contentNow: ContentSortConfig = useMemo(() => cleanContentConfig({ ...content, rawFolders: rawText, albumExts: extText }), [content, rawText, extText]);
  const dirty = !!saved && (JSON.stringify(savedProfile) !== JSON.stringify(draft) || JSON.stringify(saved.product) !== JSON.stringify(productNow) || JSON.stringify(saved.content) !== JSON.stringify(contentNow));
  const contentPlan = useMemo(() => planContentSort(SAMPLE_CONTENT_FILES, contentNow), [contentNow]);
  const plan = useMemo(() => planFileSort(draft, SAMPLE_FILES), [draft]);
  const productPlan = useMemo(() => planProductSort(SAMPLE_PRODUCT_FILES, SAMPLE_PARENTS, productNow, { jobFolder: "BSD15", variant: sampleVariant }), [productNow, sampleVariant]);
  const sampleBrand = brands.find((b) => b.folder) ?? null;
  const sampleType = types.find((x) => x.name === SAMPLE_ART_TYPE.name) ?? types[0] ?? SAMPLE_ART_TYPE;

  // แม่แบบที่เก็บบน Z:: art = ค่าตั้งต้นของ Artwork · type:<ชื่อชนิด> = แยกตามชนิด · prod:<variant> = สูตรสินค้า · content = สูตร Content
  //   coll:default = ที่เก็บ Collection ตั้งต้น · coll:<id แบรนด์> = แยกตามแบรนด์ (ว่าง = ค่าตั้งต้นของแบรนด์นั้น)
  const patternOf = (key: string): string =>
    key === "art" ? draft.nasPattern : key === "content" ? content.nasPattern : key === "coll:default" ? product.collection.pattern : key.startsWith("coll:") ? (product.collection.byBrand[key.slice(5)] ?? "")
      : key.startsWith("move:") ? (product.moves[key.slice(5) as MoveRole]?.pattern ?? "") : key.startsWith("type:") ? (draft.nasByType[key.slice(5)] ?? "") : product.nasPatterns[key.slice(5) as ProductVariant] ?? "";
  const setPattern = (key: string, v: string) => {
    if (key === "coll:default") setProduct((p) => ({ ...p, collection: { ...p.collection, pattern: v } }));
    else if (key.startsWith("coll:")) {
      const id = key.slice(5);
      setProduct((p) => { const by = { ...p.collection.byBrand }; if (v.trim()) by[id] = v; else delete by[id]; return { ...p, collection: { ...p.collection, byBrand: by } }; });
    } else if (key === "art") setDraft((d) => ({ ...d, nasPattern: v, nasRoot: nasPrefixOf(v) }));
    else if (key === "content") setContent((c) => ({ ...c, nasPattern: v, nasRoot: nasPrefixOf(v) }));
    else if (key.startsWith("move:")) { const r = key.slice(5) as MoveRole; setProduct((p) => ({ ...p, moves: { ...p.moves, [r]: { ...p.moves[r], pattern: v } } })); }
    else if (key.startsWith("type:")) {
      const name = key.slice(5);
      setDraft((d) => { const by = { ...d.nasByType }; if (v.trim()) by[name] = v; else delete by[name]; return { ...d, nasByType: by }; });
    } else setProduct((p) => ({ ...p, nasPatterns: { ...p.nasPatterns, [key.slice(5)]: v } }));
  };
  const insertToken = (tok: NasToken) => {
    const el = patternInputs.current[focusKey];
    const cur = patternOf(focusKey);
    const at = el?.selectionStart ?? cur.length;
    setPattern(focusKey, `${cur.slice(0, at)}{${tok}}${cur.slice(at)}`);
    setTimeout(() => el?.focus(), 0);
  };
  const patternInput = (key: string, placeholder: string, id?: string) => (
    <input id={id} ref={(el) => { patternInputs.current[key] = el; }} value={patternOf(key)} disabled={!canEdit} spellCheck={false}
      onFocus={() => setFocusKey(key)} onChange={(e) => setPattern(key, e.target.value)} placeholder={placeholder}
      className={`w-full h-9 px-3 text-[12px] font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 ${focusKey === key ? "border-indigo-300" : "border-slate-200"}`} />
  );
  const tokenChips = (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      <span className="text-[11px] text-slate-500 mr-1">{t("กดเพื่อแทรกในช่องที่เลือก:", "Click to insert:")}</span>
      {NAS_TOKENS.map((k) => (
        <button key={k} type="button" disabled={!canEdit} onClick={() => insertToken(k)} title={NAS_TOKEN_HINT[k]}
          className="h-6 px-2 text-[11px] font-mono rounded border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 disabled:opacity-40">{`{${k}}`}</button>
      ))}
    </div>
  );

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
    if (tab === "artwork") setDraft({ ...DEFAULT_ARTWORK_PROFILE, nasPattern: draft.nasPattern, nasByType: draft.nasByType, nasRoot: draft.nasRoot });
    else if (tab === "content") { setContent({ ...DEFAULT_CONTENT_CONFIG, nasPattern: content.nasPattern, nasRoot: content.nasRoot }); setRawText(listText(DEFAULT_CONTENT_CONFIG.rawFolders)); setExtText(listText(DEFAULT_CONTENT_CONFIG.albumExts)); }
    else { setProduct({ ...DEFAULT_PRODUCT_CONFIG, nasPatterns: product.nasPatterns, nasRoot: product.nasRoot }); setDescText(listText(DEFAULT_PRODUCT_CONFIG.roleFolders.desc)); setArchText(listText(DEFAULT_PRODUCT_CONFIG.roleFolders.archive));
      setMoveText({ raw: listText(DEFAULT_PRODUCT_CONFIG.moveFolders.raw), images: listText(DEFAULT_PRODUCT_CONFIG.moveFolders.images) }); }
  };

  const save = async () => {
    if (!saved || saving) return;
    setSaving(true);
    try {
      const config: FileSortConfig = { profiles: saved.profiles.map((p) => (p.key === draft.key ? draft : p)), product: productNow, content: contentNow };
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
            {tabBtn("content", t("Content", "Content"))}
          </div>

          {tab === "artwork" ? (
            <div className="space-y-5">
              {/* 1) ที่เก็บบน Z: (แม่แบบ · แยกตามชนิดได้) */}
              <section>
                <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-nas-pattern">{t("ที่เก็บบน Synology (Z:) — ค่าตั้งต้น", "Synology (Z:) location — default")}</label>
                {patternInput("art", "Z:\\Assets\\{แบรนด์}\\{ชนิด}\\{ชื่องาน}", "fs-nas-pattern")}
                {tokenChips}
                <p className="text-[12px] text-slate-500 mt-1">
                  {t("ช่อง {แบรนด์} {ชนิด} ใช้ชื่อโฟลเดอร์ชุดเดียวกับ Drive · ช่องที่ว่างจะข้ามชั้นนั้น · เว้นว่างทั้งช่อง = ไม่ส่งลง Z: · ในโปรแกรมกด \"เลือกที่เก็บเอง\" รายงานได้อีก", "{แบรนด์} {ชนิด} use the same folder names as Drive · empty fields skip that level · leave blank to skip Z: · the app can still pick a folder per job")}
                </p>
                <p className="text-[12px] text-slate-600 mt-1 font-mono break-all">
                  {t("ตัวอย่าง: ", "Example: ")}{nasFolderFor(draft, sampleBrand?.folder ?? "[01] Louis Montini", sampleType.folder, "Logo Calypso") ?? t("— (ไม่ส่งลง Z:)", "— (Z: off)")}
                </p>
                {types.length > 0 && <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                  <p className="px-3 py-1.5 bg-slate-50 text-[12px] font-medium text-slate-600">{t("แยกตามชนิดงาน (เว้นว่าง = ใช้ค่าตั้งต้น)", "Per job type (blank = default)")}</p>
                  {types.map((ty) => {
                    const key = `type:${ty.name}`;
                    const ex = nasFolderFor(draft, sampleBrand?.folder ?? "[01] Louis Montini", ty.folder, "ชื่องาน", ty.name);
                    return (
                      <div key={ty.name} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-start px-3 py-1.5 border-t border-slate-100">
                        <span className="text-[13px] text-slate-700 pt-2 truncate">{ty.name}</span>
                        <div className="min-w-0">
                          {patternInput(key, t("ใช้ค่าตั้งต้น", "Use default"))}
                          <p className="text-[11px] text-slate-500 font-mono break-all mt-0.5">{ex ?? t("— ไม่ส่งลง Z:", "— Z: off")}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>}
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
                        ? <span className="text-[12px] font-mono text-slate-600 break-all">{nasFolderFor(draft, b.folder, "…", "…") ?? t("— ไม่ส่งลง Z:", "— Z: off")}</span>
                        : <span className="text-[12px] text-amber-700">{t("ยังไม่ได้ตั้งโฟลเดอร์แบรนด์", "Brand folder not set")}</span>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : tab === "product" ? (
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
                <div className="sm:col-span-2">
                  <p className="text-[13px] font-medium text-slate-700 mb-1">{t("ที่เก็บบน Z: ตามชนิดงาน (ใช้เฉพาะโฟลเดอร์ที่ยังไม่อยู่บน Z: · อยู่แล้ว = ไม่ก๊อป)", "Z: location per job type (only for folders not on Z: yet)")}</p>
                  <div className="space-y-2">
                    {PRODUCT_VARIANTS.map((v) => (
                      <div key={v} className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 items-start">
                        <span className="text-[13px] text-slate-700 pt-2">{PRODUCT_VARIANT_LABEL[v]}</span>
                        <div className="min-w-0">
                          {patternInput(`prod:${v}`, "Z:\\Work In Process\\[01] New Product\\{รุ่น}")}
                          <p className="text-[11px] text-slate-500 font-mono break-all mt-0.5">{productNasFolder(productNow, "BSD15", v) ?? t("— ไม่ก๊อปลง Z:", "— not copied")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {tokenChips}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-slate-700 mb-1">{t("รูปเดิมของสินค้าในระบบ", "Existing product images")}</p>
                  <div className="flex flex-col gap-1 text-[13px]">
                    <label className="inline-flex items-center gap-2"><input type="radio" name="fs-mode" className={chk} checked={product.mode === "replace"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, mode: "replace" }))} />{t("แทนที่ทั้งชุด (กดซ้ำแล้วไม่ซ้ำ)", "Replace the set (safe to re-run)")}</label>
                    <label className="inline-flex items-center gap-2"><input type="radio" name="fs-mode" className={chk} checked={product.mode === "append"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, mode: "append" }))} />{t("ต่อท้ายรูปเดิม", "Append")}</label>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-1">{t("ค่าตั้งต้นในโปรแกรม (เปลี่ยนเป็นรายครั้งได้) · รูปเดิมที่ถูกแทนย้อนคืนได้", "Default in the app (changeable per run) · replaced images can be restored")}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[13px] font-medium text-slate-700 mb-1">{t("หลังลงรูปเสร็จ: ย้ายโฟลเดอร์ไปเก็บที่อื่นบน Z:", "After uploading: move folders elsewhere on Z:")}</p>
                  <div className="space-y-3">
                    {MOVE_ROLES.map((r) => {
                      const m = sampleMoves.find((x) => x.role === r);
                      return (
                        <div key={r} className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 items-start">
                          <span className="text-[13px] text-slate-700 pt-1">{MOVE_ROLE_LABEL[r]}</span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap gap-4 text-[13px]" role="radiogroup" aria-label={MOVE_ROLE_LABEL[r]}>
                              <label className="inline-flex items-center gap-2"><input type="radio" name={`fs-move-${r}`} className={chk} checked={product.moves[r].mode === "stay"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, moves: { ...p.moves, [r]: { ...p.moves[r], mode: "stay" } } }))} />{t("อยู่ที่เดิม", "Stay")}</label>
                              <label className="inline-flex items-center gap-2"><input type="radio" name={`fs-move-${r}`} className={chk} checked={product.moves[r].mode === "move"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, moves: { ...p.moves, [r]: { ...p.moves[r], mode: "move" } } }))} />{t("ย้ายไป", "Move to")}</label>
                            </div>
                            {patternInput(`move:${r}`, r === "raw" ? "Z:\\Raw Files\\{แบรนด์}\\{รุ่น}_rawfiles" : t("ที่ย้ายไป (ใช้ตอนติ๊กในโปรแกรม)", "Destination (used when ticked in the app)"))}
                            <p className="text-[11px] text-slate-500 font-mono break-all">
                              {m ? `${m.folder} → ${product.moves[r].mode === "stay" ? t("อยู่ที่เดิม", "stays") : m.target ?? `— ${m.reason}`}` : "—"}
                            </p>
                            <input value={moveText[r]} disabled={!canEdit} onChange={(e) => setMoveText((x) => ({ ...x, [r]: e.target.value }))} aria-label={t(`ชื่อโฟลเดอร์ ${MOVE_ROLE_LABEL[r]}`, `${MOVE_ROLE_LABEL[r]} folder names`)}
                              className="w-full h-8 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[12px] text-slate-500 mt-1">{t("ตัวอย่างใช้แบรนด์ [01] Louis Montini · ช่องล่าง = ชื่อโฟลเดอร์ (คั่นด้วย , · ไม่สนเลขนำหน้า) · ย้ายบน Z: ด้วยกัน = เสร็จทันที · ปลายทางมีแล้ว = ตั้งชื่อ _v.2 ไม่ทับ · โปรแกรมหาโฟลเดอร์แบรนด์ที่สะกดต่างกันให้ · ปิดได้ทีละงานในโปรแกรม",
                    "Sample uses brand [01] Louis Montini · lower box = folder names · moves on Z: are instant · existing destination gets _v.2 · the app finds brand folders spelled differently · can be turned off per job")}</p>
                  {tokenChips}
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[13px] font-medium text-slate-700 mb-1">{t("หลังลงรูปเสร็จ: เก็บทั้งโฟลเดอร์เข้า Collection (แบบปุ่ม Arrange)", "After uploading: file the whole folder into Collection (like Arrange)")}</p>
                  <div className="flex flex-wrap gap-4 text-[13px] mb-2" role="radiogroup" aria-label="Collection">
                    <label className="inline-flex items-center gap-2"><input type="radio" name="fs-coll" className={chk} checked={product.collection.mode === "stay"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, collection: { ...p.collection, mode: "stay" } }))} />{t("อยู่ที่ Work In Process", "Stay in Work In Process")}</label>
                    <label className="inline-flex items-center gap-2"><input type="radio" name="fs-coll" className={chk} checked={product.collection.mode === "move"} disabled={!canEdit} onChange={() => setProduct((p) => ({ ...p, collection: { ...p.collection, mode: "move" } }))} />{t("เก็บเข้า Collection", "File into Collection")}</label>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 items-start">
                      <span className="text-[13px] text-slate-700 pt-2">{t("แบรนด์ที่ไม่ได้ตั้ง", "Other brands")}</span>
                      <div className="min-w-0">
                        {patternInput("coll:default", t("ว่าง = ไม่เก็บ (ตั้งรายแบรนด์ด้านล่าง)", "Empty = don't file (set per brand below)"))}
                        <p className="text-[11px] text-slate-500 font-mono break-all mt-0.5">{collExample(product.collection.pattern, "[01] Louis Montini") ?? t("— ไม่เก็บเข้า Collection", "— not filed")}</p>
                      </div>
                    </div>
                    {brands.map((b) => {
                      const def = collectionDefaultFor(product.collection, b.name);
                      const eff = (product.collection.byBrand[b.id] ?? "").trim() || def;
                      return (
                        <div key={b.id} className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 items-start">
                          <span className="text-[13px] text-slate-700 pt-2 truncate" title={b.name}>{b.name}</span>
                          <div className="min-w-0">
                            {patternInput(`coll:${b.id}`, def || t("ยังไม่ได้ตั้ง — ไม่เก็บ", "Not set — not filed"))}
                            <p className={`text-[11px] font-mono break-all mt-0.5 ${eff ? "text-slate-500" : "text-amber-700"}`}>{collExample(eff, b.folder) ?? (eff ? t("— แม่แบบใช้ไม่ได้", "— invalid template") : t("— ยังไม่มีที่ใน Collection: ไม่เก็บจนกว่าจะตั้ง", "— no Collection location yet: not filed until set"))}{product.collection.byBrand[b.id] || !eff ? "" : t(" · ค่าตั้งต้น", " · default")}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <label className="mt-2 inline-flex items-start gap-2 text-[13px]">
                    <input type="checkbox" className={`${chk} mt-0.5`} checked={product.collection.tidy} disabled={!canEdit} onChange={(e) => setProduct((p) => ({ ...p, collection: { ...p.collection, tidy: e.target.checked } }))} />
                    <span>{t("จัดชื่อโฟลเดอร์ก่อนเก็บ", "Tidy folder names first")}<span className="block text-[12px] text-slate-500 font-mono">{sampleTidy.map((r) => `${r.from} → ${r.to.replace(/\//g, "\\")}`).join(" · ")}</span></span>
                  </label>
                  <p className="text-[12px] text-slate-500 mt-1">{t("ตัวอย่างใช้รุ่น BSD15 · {กลุ่ม} = โฟลเดอร์กลุ่มที่โปรแกรมหาเองบน Z: (ชื่อตรงตัวอักษรหน้ารหัส เช่น BSD · ขึ้นต้นด้วยตัวนั้น เช่น BD (สร้อยข้อมือ) · มีรุ่นพี่น้องอยู่ เช่น JEAN10 → JEANS · ไม่เจอ = สร้างใหม่) · มีรุ่นนี้ใน Collection แล้ว = รวมเข้าไป ไม่ทับ (ชื่อชน → _v.2) · สินค้าที่ยังไม่ตั้งแบรนด์ = ไม่เก็บ · ทำหลังลงรูปครบเท่านั้น · ปิดได้ทีละงาน + ย้ายกลับได้ในโปรแกรม",
                    "Sample model BSD15 · {กลุ่ม} = group folder the app finds on Z: (same letters as the code, starts with them, or holds sibling models like JEAN10 → JEANS; none = created) · model already in Collection = merged, never overwritten (_v.2) · products without a brand stay · only after all images upload · can be turned off per job and undone in the app")}</p>
                </div>
              </section>

              <section className="rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-[13px] font-medium text-slate-700">{t("ทดลอง: ถ้าโยนโฟลเดอร์ BSD15 แบบนี้", "Try it: a BSD15 folder like this")}</p>
                  <div className="flex gap-1" role="radiogroup" aria-label={t("ชนิดงาน", "Job type")}>
                    {PRODUCT_VARIANTS.map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={sampleVariant === v} onClick={() => setSampleVariant(v)}
                        className={`h-7 px-2.5 text-[12px] rounded-lg border ${sampleVariant === v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{PRODUCT_VARIANT_LABEL[v]}</button>
                    ))}
                  </div>
                </div>
                <p className="text-[12px] text-slate-500 mb-2">{t("สินค้าสมมติ: BSD15-01 มีรูปในระบบแล้ว · BSD15-02 ยังไม่มีรูป (สีใหม่)", "Sample: BSD15-01 already has images · BSD15-02 has none (new colour)")}</p>
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
          ) : (
            <div className="space-y-5">
              <section className="text-[13px] text-slate-600 leading-6">
                <p className="font-medium text-slate-700 mb-1">{t("โยนโฟลเดอร์ชุดคอนเทนต์ 1 โฟลเดอร์ → อัลบั้มในหน้า Contents", "Drop one content folder → an album on the Contents page")}</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>{t("รูป/วิดีโอ → ลงอัลบั้ม (ตัวจริงขึ้น Google Drive ของแบรนด์ › Content › อัลบั้ม · ในระบบเก็บรูปย่อ)", "Images/videos → the album (originals on the brand's Google Drive › Content › albums · previews in the ERP)")}</li>
                  <li>{t("โฟลเดอร์ชื่อแพลตฟอร์ม (01_Instagram, 02_Facebook, 03_X …) → ติ๊กแพลตฟอร์มที่จะลงให้อัลบั้ม", "Platform-named folders (01_Instagram, 02_Facebook, 03_X …) → the album's planned platforms")}</li>
                  <li>{t("ไฟล์ในโฟลเดอร์ไฟล์ดิบ / PSD → ไม่ลงอัลบั้ม (อยู่บน Z:) · อัลบั้มชื่อเดิมของแบรนด์เดิม = เติมไฟล์ใส่ ไฟล์ที่มีแล้วข้าม · ไม่ลบ/ไม่ย้ายต้นฉบับ", "Raw-folder files / PSD → not in the album (stay on Z:) · same album name + brand = files added, duplicates skipped · never deletes or moves the source")}</li>
                </ul>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-content-nas">{t("ที่เก็บบน Z: (ใช้เฉพาะโฟลเดอร์ที่ยังไม่อยู่บน Z: · อยู่แล้ว = อยู่ที่เดิม)", "Z: location (only for folders not on Z: yet)")}</label>
                  {patternInput("content", "Z:\\Work In Process\\[01] New Product\\[02] Contents\\{โฟลเดอร์}", "fs-content-nas")}
                  <p className="text-[11px] text-slate-500 font-mono break-all mt-0.5">{contentNasFolder(contentNow, SAMPLE_CONTENT_FOLDER, SAMPLE_CONTENT_FOLDER, "[01] Louis Montini") ?? t("— ไม่ก๊อปลง Z:", "— not copied")}</p>
                  {tokenChips}
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-content-raw">{t("ชื่อโฟลเดอร์ไฟล์ดิบ (ไม่ลงอัลบั้ม)", "Raw folder names (not in the album)")}</label>
                  <input id="fs-content-raw" value={rawText} disabled={!canEdit} onChange={(e) => setRawText(e.target.value)} placeholder="rawfiles, raw"
                    className="w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                  <p className="text-[12px] text-slate-500 mt-1">{t("คั่นด้วย , · ไม่สนเลขนำหน้า · มีเลขต่อท้ายก็นับ (00_rawfiles_1)", "Comma separated · numbering ignored · trailing numbers count (00_rawfiles_1)")}</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1" htmlFor="fs-content-exts">{t("นามสกุลที่ลงอัลบั้ม", "Extensions added to the album")}</label>
                  <input id="fs-content-exts" value={extText} disabled={!canEdit} onChange={(e) => setExtText(e.target.value)} placeholder="jpg, png, mp4"
                    className="w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                  <p className="text-[12px] text-slate-500 mt-1">{t("นามสกุลอื่นอยู่บน Z: อย่างเดียว", "Other files stay on Z: only")}</p>
                </div>
              </section>

              <section className="rounded-lg bg-slate-50 p-3">
                <p className="text-[13px] font-medium text-slate-700 mb-2">{t(`ทดลอง: ถ้าโยนโฟลเดอร์ ${SAMPLE_CONTENT_FOLDER} แบบนี้`, `Try it: a ${SAMPLE_CONTENT_FOLDER} folder like this`)}</p>
                <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 text-[12px]">
                  {contentPlan.files.map((f) => (
                    <div key={f.rel} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2 px-2 py-1">
                      <span className="font-mono text-slate-700 truncate" title={f.rel}>{f.rel}</span>
                      <span className={f.album ? "text-indigo-700" : "text-slate-500"}>
                        {f.album ? t("ลงอัลบั้ม", "Album") : f.why === "junk" ? t("ข้าม (ไฟล์ระบบ)", "Skipped (system file)") : f.why === "raw" ? t("ไฟล์ดิบ — อยู่บน Z:", "Raw — stays on Z:") : t("ไม่ใช่รูป/วิดีโอ — อยู่บน Z:", "Not media — stays on Z:")}
                        {f.album && f.platform ? <span className="text-slate-400"> · {f.platform}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-slate-600 mt-2">{t("แพลตฟอร์มที่จะติ๊กให้อัลบั้ม:", "Planned platforms:")} {contentPlan.platforms.join(", ") || "—"}</p>
                {contentPlan.warnings.map((w) => <p key={w} className="text-[12px] text-amber-700 mt-1">{w}</p>)}
              </section>
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
