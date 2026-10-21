"use client";
// คลังไฟล์: เพิ่ม Artwork ทีละรูป / หลายรูป — แยกจาก index.tsx (Y1)
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { downscaleImageWidth } from "@/lib/image-resize";
import { type AssetSize } from "@/app/api/assets/shared";
import { runBackgroundTask } from "@/lib/background-tasks";
import { triggerRefresh } from "@/lib/refresh-bus";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import { type LookupItem, commonNameSeed, estimateSizeCm, previewForDrive, uploadArtworkToDrive, useArtworkPathRule, pathMatchesRule, useDriveFolderMaps, brandFolderPath } from "./asset-shared";
import { CollectionMultiSelect, ArtTypeMultiSelect, SizesEditor, ParentSkuField, TagPickerField } from "./asset-fields";
import { ArtworkPathRuleModal } from "./manage-modals";

// ── เพิ่ม Artwork ลงบัตร (รูป + ชนิด + ชื่อ + แท็ก + ไซส์ + location + อัลบั้ม + Parent SKU + keyword) ──
export function ArtworkAddModal({ actor, artTypes, collections, onClose, onDone, initialFile, defaultCollectionIds, targetFolder }: { actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFile?: File | null; defaultCollectionIds?: string[]; targetFolder?: { id: string; url: string; label: string } | null }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artTypesSel, setArtTypesSel] = useState<string[]>([]);          // ชนิดหลายอัน (m2m)
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes); // สำเนาไว้ต่อท้ายเมื่อเพิ่มชนิดใหม่ในฟอร์ม
  const [masterPath, setMasterPath] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [sizes, setSizes] = useState<AssetSize[]>([]);
  const [sizeHint, setSizeHint] = useState<{ px: { w: number; h: number }; dpi: number; fromImage: boolean } | null>(null);   // ที่มาของขนาดที่แกะจากรูป
  const [parentCodes, setParentCodes] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>(defaultCollectionIds ?? []);      // อัลบั้มหลายอัน (m2m) · เปิดอยู่ในอัลบั้มไหน → ตั้งให้เลย
  const [cols, setCols] = useState<AssetCollection[]>(collections);       // สำเนาไว้ต่อท้ายเมื่อสร้างอัลบั้มใหม่ในฟอร์ม
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const t = useT();
  const [ruleOpen, setRuleOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rule, , reloadRule] = useArtworkPathRule();
  const { brandBase, typeSub } = useDriveFolderMaps();
  const [fileExt, setFileExt] = useState("");
  const [pathAuto, setPathAuto] = useState(true);   // path ยังตามชื่ออัตโนมัติอยู่ไหม (ผู้ใช้แก้เอง = หยุด)
  const [srcFiles, setSrcFiles] = useState<File[]>([]);   // ไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Drive
  const [driveOn, setDriveOn] = useState(false);
  const [autoFolder, setAutoFolder] = useState(true);     // default: สร้างโฟลเดอร์ Drive + ก็อปรูปตัวอย่างให้เลย
  const [driveProg, setDriveProg] = useState({ done: 0, total: 0 });   // สถานะอัป Drive
  const srcInputRef = useRef<HTMLInputElement>(null);
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  // path ต้นฉบับผิดโฟลเดอร์ไหม — ยอมทั้งกฎกลาง + ฐานในเครื่องของแบรนด์
  const allowedBases = brandId && brandBase[brandId] ? [...rule.base_paths, brandBase[brandId]] : rule.base_paths;
  const pathWarn = !!masterPath.trim() && !pathMatchesRule(masterPath, allowedBases);

  // อัปไฟล์ต้นฉบับ + ก็อปรูป preview ขึ้น Google Drive "ผ่านแอป" (ของกลาง uploadArtworkToDrive) → คืนลิงก์โฟลเดอร์
  const uploadSourcesToDrive = async (): Promise<string> => {
    const previewFile = file ? await previewForDrive(file) : null;   // รูปตัวอย่างลง Drive: เต็มขนาดถ้า ≤4MB
    const { folderLink, largeCount } = await uploadArtworkToDrive({
      name: title, artworkType: artTypesSel[0], brandId, srcFiles, previewFile,
      folderId: targetFolder?.id || undefined,   // ลากเข้ามุมมองโฟลเดอร์ → อัปเข้าโฟลเดอร์นั้นเลย
      onProgress: (done, total) => setDriveProg({ done, total }),
    });
    if (largeCount) toast.warning(`${t("ไฟล์ใหญ่", "Large file")} ${largeCount} ${t("ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์ Drive จากลิงก์แล้วลากขึ้นเอง", "files weren't auto-uploaded (over 4MB) — open the Drive folder from the link and drag them up yourself")}`);
    return folderLink;
  };

  // เติม path ต้นฉบับอัตโนมัติ: มีฐานตามแบรนด์ → <ฐาน>\<ซับชนิด>\<ชื่องาน> (จบที่โฟลเดอร์) · ไม่มี → กฎกลางเดิม (path ไฟล์)
  const buildPath = (name: string, ext = fileExt) => {
    const bp = brandFolderPath(name, brandId, artTypesSel[0], brandBase, typeSub);
    if (bp) return bp;
    const base = rule.base_paths[0]; if (!base) return "";
    return name.trim() ? `${base.replace(/[\\/]+$/, "")}\\${name.trim()}${ext}` : "";
  };

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    if (f) {
      const nameNoExt = f.name.replace(/\.[^.]+$/, "");
      const ext = f.name.match(/\.[^.]+$/)?.[0] ?? "";
      setFileExt(ext);
      const nm = title.trim() || nameNoExt;
      if (!title.trim()) setTitle(nameNoExt);   // ดึงชื่อจากชื่อไฟล์ (ถ้ายังไม่มีชื่อ)
      if (pathAuto) setMasterPath(buildPath(nm, ext));
      // แกะขนาดจริง (cm) จากรูป → เติมช่องขนาดให้ (เฉพาะตอนว่าง · เป็นค่าประมาณ แก้ได้)
      if (f.type.startsWith("image/")) {
        estimateSizeCm(f).then((est) => {
          if (!est) return;
          setSizeHint({ px: est.px, dpi: est.dpi, fromImage: est.fromImage });
          setSizes((cur) => cur.length ? cur : [{ label: "ขนาด #1", w: est.w, h: est.h, unit: "cm" }]);
        });
      }
    }
  };

  // ลากรูปมาวางบนหน้าคลัง → เปิด popup พร้อมรูปที่ลากมา · มีโฟลเดอร์ปลายทาง (ลากเข้ามุมมองโฟลเดอร์) → ตั้งลิงก์ให้เลย
  useEffect(() => { if (initialFile) pick(initialFile); if (targetFolder) setMasterUrl(targetFolder.url); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // เลือกแบรนด์/ชนิด หรือแม็ปโหลดเสร็จ → เติม path ตามแบรนด์ใหม่ (ถ้ายัง auto อยู่)
  useEffect(() => { if (pathAuto && title.trim()) setMasterPath(buildPath(title)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brandId, artTypesSel, brandBase, typeSub]);

  const save = async () => {
    if (!file) { toast.error(t("แนบรูปตัวอย่างก่อน (export JPG/PNG จากงานออกแบบ)", "Attach a preview image first (export JPG/PNG from the design)")); return; }
    if (!brandId) { toast.error(t("เลือกแบรนด์ก่อน", "Select a brand first")); return; }
    if (!artTypesSel.length) { toast.error(t("เลือกชนิด artwork ก่อน", "Select an artwork type first")); return; }
    // สร้างโฟลเดอร์ Drive เมื่อ: มีไฟล์ต้นฉบับโยนขึ้น หรือ ติ๊ก "สร้างอัตโนมัติ" และยังไม่มีลิงก์เอง · มีโฟลเดอร์ปลายทาง = อัปเข้าเลย
    const willAutoFolder = driveOn && (autoFolder && !masterUrl.trim() || !!targetFolder);
    const willDrive = driveOn && (srcFiles.length > 0 || willAutoFolder);
    if (!masterPath.trim() && !masterUrl.trim() && !willDrive) { toast.error(t("ใส่ที่อยู่ไฟล์ต้นฉบับอย่างน้อย 1 อย่าง (path NAS / ลิงก์ / สร้างโฟลเดอร์ Drive)", "Enter at least one source-file location (NAS path / link / create Drive folder)")); return; }
    setBusy(true);
    try {
      // สร้างโฟลเดอร์ Drive + ก็อปรูปตัวอย่าง (+ อัปไฟล์ต้นฉบับถ้ามี) → ได้ลิงก์โฟลเดอร์มาเติมให้
      let effUrl = masterUrl.trim();
      if (willDrive) { const link = await uploadSourcesToDrive(); if (link) { effUrl = link; setMasterUrl(link); } }

      const upFile = await downscaleImageWidth(file, 1600);   // ย่อด้านกว้าง ≤ 1600px ตอนอัป
      const fd = new FormData();
      fd.append("file", upFile);
      fd.append("source", "artwork");
      if (artTypesSel.length) fd.append("artwork_types", JSON.stringify(artTypesSel));
      if (brandId) fd.append("brand_id", brandId);
      if (title.trim()) fd.append("title", title.trim());
      if (masterPath.trim()) fd.append("master_path", masterPath.trim());
      if (effUrl) fd.append("master_url", effUrl);
      if (keywords.trim()) fd.append("keywords", keywords.trim());
      if (tags.length) fd.append("tags", tags.join(","));
      if (sizes.length) fd.append("sizes", JSON.stringify(sizes));
      if (parentCodes.length) fd.append("parent_sku_codes", JSON.stringify(parentCodes));
      if (collectionIds.length) fd.append("collection_ids", JSON.stringify(collectionIds));
      if (actor) fd.append("actor", actor);
      if (upFile.type.startsWith("image/")) {
        const dim = await new Promise<{ w: number; h: number } | null>((res) => {
          const img = new Image(); const u = URL.createObjectURL(upFile);
          img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u); };
          img.onerror = () => { res(null); URL.revokeObjectURL(u); };
          img.src = u;
        });
        if (dim) { fd.append("width", String(dim.w)); fd.append("height", String(dim.h)); }
      }
      const res = await apiFetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(t("เพิ่ม Artwork ลงคลังแล้ว", "Artwork added to library")); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={t("เพิ่ม Artwork ลงคลัง", "Add Artwork to library")} size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">
            {driveProg.total > 0 ? `${t("📤 อัปขึ้น Drive", "📤 Uploading to Drive")} ${driveProg.done}/${driveProg.total}…` : t("รูปตัวอย่างเล็กพอ — ไฟล์ใหญ่ .ai/.psd เก็บที่ NAS/Drive", "Preview is small enough — large .ai/.psd files stay on NAS/Drive")}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? (driveProg.total > 0 ? `${t("อัป Drive", "Drive upload")} ${driveProg.done}/${driveProg.total}…` : t("กำลังบันทึก…", "Saving…")) : t("บันทึก", "Save")}</button>
          </div>
        </div>
      }>
      <div className="grid grid-cols-2 gap-3">
        <div
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pick(f); }}
          onPaste={(e) => { const f = Array.from(e.clipboardData?.items ?? []).map((i) => i.type.startsWith("image/") ? i.getAsFile() : null).find(Boolean); if (f) { e.preventDefault(); pick(f); } }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden outline-none focus:border-indigo-400 ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
          style={{ minHeight: 150 }}>
          {preview
            ? <img src={preview} alt="" className="max-w-full max-h-44 object-contain" />
            : <div className="text-center py-6"><div className="text-3xl">🎨</div><p className="text-[12px] text-slate-500 mt-1">{t("วางรูปตัวอย่าง / คลิกเลือก", "Drop a preview / click to choose")}</p></div>}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px] text-slate-500">{t("ชื่อ", "Name")}
            <input value={title} onChange={(e) => { const v = e.target.value; setTitle(v); if (pathAuto) setMasterPath(buildPath(v, fileExt)); }} placeholder={t("เช่น ลายดอกไม้ PIX32", "e.g. Floral pattern PIX32")}
              className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
          <label className="text-[12px] text-slate-500">{t("แบรนด์", "Brand")} <span className="text-red-500">*</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg bg-white ${brandId ? "border-slate-200" : "border-amber-300"}`}>
              <option value="">{t("— เลือกแบรนด์ —", "— Select brand —")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-[12px] text-slate-500">{t("ชนิด", "Type")} <span className="text-red-500">*</span> <span className="text-[10px] text-slate-400">{t("— เลือกได้หลายอัน", "— multiple allowed")}</span>
              <div className={`mt-0.5 rounded-lg ${artTypesSel.length ? "" : "ring-1 ring-amber-300"}`}><ArtTypeMultiSelect value={artTypesSel} types={artTypeList} onChange={setArtTypesSel} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div></div>
            <div className="text-[12px] text-slate-500">Group Album <span className="text-[10px] text-slate-400">{t("— เลือกได้หลายอัน / สร้างใหม่ได้", "— multiple allowed / can create new")}</span>
              <div className="mt-0.5"><CollectionMultiSelect value={collectionIds} collections={cols} onChange={setCollectionIds} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
          </div>
          <div className="text-[12px] text-slate-500">{t("แท็ก", "Tags")} <span className="text-[10px] text-slate-400">{t("— กดเลือกในป๊อปอัป", "— select in the popup")}</span>
            <div className="mt-0.5"><TagPickerField value={tags} onChange={setTags} /></div></div>
        </div>
      </div>

      {/* ขนาด (หลายไซส์ + ชื่อกำกับ + หน่วย) */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("📐 ขนาด (กว้าง × สูง)", "📐 Size (W × H)")} <span className="text-[10px] text-slate-400 font-normal">{t("— เพิ่มได้หลายไซส์ ใส่ชื่อกำกับ + เลือกหน่วยต่อไซส์", "— add multiple sizes, label them + choose a unit per size")}</span></p>
        {sizeHint && (
          <p className="text-[11px] text-slate-400 mb-1">{t("📷 จากรูป", "📷 From image")} {sizeHint.px.w}×{sizeHint.px.h} px @ {sizeHint.dpi} DPI {sizeHint.fromImage ? t("(อ่านจากไฟล์)", "(read from file)") : t("(ใช้ค่ามาตรฐาน 300)", "(using default 300)")} {t("→ เติมขนาด cm ให้เป็น", "→ cm size filled in as an")}<b>{t("ค่าประมาณ", "estimate")}</b> {t("แก้ได้", "editable")}</p>
        )}
        <SizesEditor value={sizes} onChange={setSizes} />
      </div>

      {/* Parent SKU ที่ใช้ */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("📦 Parent SKU ที่ใช้ artwork นี้", "📦 Parent SKUs that use this artwork")}</p>
        <ParentSkuField value={parentCodes} onChange={setParentCodes} />
      </div>

      {targetFolder && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-800">
          {t("📎 จะเพิ่มเข้าโฟลเดอร์เดียวกับ", "📎 Will be added to the same folder as")} <b>“{targetFolder.label}”</b> {t("— รูป/ไฟล์ต้นฉบับจะไปอยู่ในโฟลเดอร์นี้ (ไม่สร้างโฟลเดอร์ใหม่)", "— the image/source files go into this folder (no new folder created)")}
        </div>
      )}

      {/* location ไฟล์ต้นฉบับ + tooltip + จับผิดโฟลเดอร์ */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[12px] font-medium text-slate-600">{t("📁 ที่เก็บไฟล์ต้นฉบับ", "📁 Source file location")} <span className="text-[10px] text-slate-400 font-normal">{t("— ใส่อย่างน้อย 1 อย่าง (path NAS หรือ ลิงก์)", "— enter at least one (NAS path or link)")}</span></p>
          <button type="button" onClick={() => setRuleOpen(true)} className="text-[11px] text-indigo-600 hover:underline">{t("⚙️ ตั้งโฟลเดอร์มาตรฐาน", "⚙️ Set standard folder")}</button>
        </div>
        <label className="block text-[12px] text-slate-500">{t("path NAS / โฟลเดอร์", "NAS path / folder")}
          <span className="ml-1 text-slate-300" title={t("ใส่ที่อยู่เต็มของไฟล์/โฟลเดอร์ต้นฉบับบนเครื่อง เช่น G:\\Shared drives\\Louis Montini\\[4] Assets\\4. Artworks\\PIX32-02_v3.ai", "Enter the full path of the source file/folder on the machine, e.g. G:\\Shared drives\\Louis Montini\\[4] Assets\\4. Artworks\\PIX32-02_v3.ai")}>ⓘ</span>
          <input value={masterPath} onChange={(e) => { setMasterPath(e.target.value); setPathAuto(false); }}
            title={t("ที่อยู่เต็มของไฟล์ต้นฉบับ — ควรอยู่ใต้โฟลเดอร์มาตรฐานที่ตั้งไว้ · แก้เองแล้วจะไม่ตามชื่ออัตโนมัติ", "Full path of the source file — should be under the configured standard folder · editing it manually stops auto-naming")}
            placeholder={rule.base_paths[0] ? `${rule.base_paths[0]}\\…` : t("\\\\nas\\Artwork\\PIX\\PIX32-02_v3.ai  หรือ  Z:\\Artwork\\…", "\\\\nas\\Artwork\\PIX\\PIX32-02_v3.ai  or  Z:\\Artwork\\…")}
            className={`mt-0.5 w-full h-9 px-3 text-[12px] border rounded-lg font-mono focus:outline-none focus:ring-2 ${pathWarn ? "border-amber-300 focus:ring-amber-400 bg-amber-50/40" : "border-slate-200 focus:ring-indigo-500"}`} /></label>
        {pathWarn && (
          <p className="text-[11px] text-amber-600 mt-1">{t("⚠ ที่อยู่นี้ไม่ได้อยู่ในโฟลเดอร์มาตรฐาน — ควรเก็บไว้ใต้", "⚠ This location isn't under a standard folder — should be stored under")} <b className="font-mono">{rule.base_paths.join(t(" หรือ ", " or "))}</b> {t("(เพิ่มได้ แต่เช็คว่าตั้งใจ)", "(allowed, but make sure it's intended)")}</p>
        )}
        <label className="block text-[12px] text-slate-500 mt-2">{t("ลิงก์ Google Drive / Synology", "Google Drive / Synology link")} <span className="text-slate-300" title={t("ลิงก์ที่เปิดได้จากที่ไหนก็ได้ (นอกออฟฟิศ) — ไม่ใส่ก็ได้ถ้ามี path NAS แล้ว", "A link that opens anywhere (outside the office) — optional if you already have a NAS path")}>ⓘ</span>
          <input value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} placeholder={t("https://drive.google.com/…  หรือ  ลิงก์ Synology Drive", "https://drive.google.com/…  or  Synology Drive link")}
            className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>

        {/* สร้างโฟลเดอร์ Drive อัตโนมัติ + โยนไฟล์ต้นฉบับ */}
        {driveOn && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
              <input type="checkbox" checked={autoFolder} onChange={(e) => setAutoFolder(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
              <span className="text-[12px] text-slate-700">
                🗂️ <b>{t("สร้างโฟลเดอร์ Drive ให้อัตโนมัติ", "Auto-create a Drive folder")}</b> {t("+ ก็อปรูปตัวอย่างเข้าไป", "+ copy the preview into it")}
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  {autoFolder
                    ? <>{t("จะสร้างโฟลเดอร์ชื่อ", "Will create a folder named")} “{title.trim() || t("(ใส่ชื่อก่อน)", "(enter a name first)")}” {t("แล้วเติมลิงก์ Drive ให้ ·", "then fill in the Drive link ·")} {masterUrl.trim() ? t("มีลิงก์เองแล้ว จะไม่สร้างซ้ำ", "you already have a link, won't create a duplicate") : t("ไม่ต้องไปสร้างทีหลัง", "no need to create it later")}</>
                    : t("ปิดอยู่ — ต้องใส่ path/ลิงก์เอง หรือไปสร้างโฟลเดอร์ทีหลัง", "Off — enter a path/link yourself or create the folder later")}
                </span>
              </span>
            </label>
            <span className="block mt-3 text-[12px] text-slate-500">{t("📤 หรือ โยนไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Google Drive ให้อัตโนมัติ", "📤 Or drop source files (AI/PSD/PDF) → auto-upload to Google Drive")}</span>
            <div onClick={() => srcInputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]); }}
              onDragOver={(e) => e.preventDefault()}
              className="mt-1 border border-dashed border-slate-300 rounded-lg px-3 py-3 text-center text-[12px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
              {t("+ ลากไฟล์มาวาง หรือคลิกเลือก", "+ Drag files here or click to choose")}
              <input ref={srcInputRef} type="file" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
            </div>
            {srcFiles.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {srcFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
                    <span className="flex-1 truncate">📄 {f.name}</span>
                    <span className="text-slate-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button type="button" onClick={() => setSrcFiles((p) => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">{t("จะสร้างโฟลเดอร์ชื่อ", "Will create a folder named")} “{title.trim() || t("(ใส่ชื่อก่อน)", "(enter a name first)")}” {t("+ ตั้งชื่อไฟล์ตามชื่องาน + เติมลิงก์ Drive ให้อัตโนมัติ", "+ name files after the job + auto-fill the Drive link")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <label className="block text-[12px] text-slate-500 mt-3">{t("คำค้นเพิ่มเติม (keyword)", "Extra keywords")} <span className="text-[10px] text-slate-400">{t("— คำพ้อง/ชื่ออื่น พิมพ์แล้วเจอ", "— synonyms/other names, type to find")}</span>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t("เช่น flower ดอกไม้ summer ฤดูร้อน", "e.g. flower summer")}
          className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>

      {ruleOpen && <ArtworkPathRuleModal rule={rule} onClose={() => setRuleOpen(false)} onSaved={reloadRule} />}
    </ERPModal>
  );
}

// ── เพิ่ม Artwork หลายรูปพร้อมกัน (ตาราง inline) — ลากหลายไฟล์ → 1 แถว/ไฟล์ → แก้แล้วบันทึกทีเดียว ──
export type MassRow = { id: number; file: File; preview: string | null; name: string; types: string[]; path: string; url: string; srcFiles: File[]; sizes: AssetSize[]; parentCodes: string[]; pathAuto: boolean };

export function MassArtworkModal({ actor, artTypes, collections, onClose, onDone, initialFiles, defaultAlbums, targetFolder }: {
  actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFiles?: File[] | null; defaultAlbums?: string[]; targetFolder?: { id: string; url: string; label: string } | null;
}) {
  const toast = useToast();
  const t = useT();
  const [rows, setRows] = useState<MassRow[]>([]);
  const [cols, setCols] = useState<AssetCollection[]>(collections);
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [batchAlbums, setBatchAlbums] = useState<string[]>(defaultAlbums ?? []);   // อัลบั้มใช้กับทั้งชุด · เปิดอยู่ในอัลบั้มไหน → ตั้งให้เลย
  const [batchTypes, setBatchTypes] = useState<string[]>([]);     // ชนิดเริ่มต้น → กดใส่ให้ทุกแถว
  const [batchBrandId, setBatchBrandId] = useState("");           // แบรนด์ใช้กับทุกรูป (จัดโฟลเดอร์ Drive + เก็บ brand_id)
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [driveOn, setDriveOn] = useState(false);
  const [oneFolder, setOneFolder] = useState(false);   // รูปชุดนี้ใช้โฟลเดอร์ Drive เดียวกัน (แทนที่จะสร้างแยกทุกใบ)
  const [oneFolderName, setOneFolderName] = useState("");   // ชื่อโฟลเดอร์รวม (default = ชื่อร่วม/รูปแรก)
  const [dragOver, setDragOver] = useState(false);
  const [rule] = useArtworkPathRule();
  const { brandBase, typeSub } = useDriveFolderMaps();
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const base = rule.base_paths[0];
  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);

  // path ต้นฉบับตามแบรนด์: <ฐานในเครื่อง>\<ซับชนิด>\<ชื่องาน> (จบที่โฟลเดอร์) · ไม่มีฐานแบรนด์ → กฎกลาง\<ชื่องาน>
  const massPath = (name: string, types: string[]) => {
    const bp = brandFolderPath(name, batchBrandId, types[0], brandBase, typeSub);
    if (bp) return bp;
    return base && name.trim() ? `${base.replace(/[\\/]+$/, "")}\\${name.trim()}` : "";
  };
  const makeRow = (f: File): MassRow => {
    const name = f.name.replace(/\.[^.]+$/, ""); const types = [...batchTypes];
    return {
      id: ++idRef.current, file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      name, types, path: massPath(name, types), url: "",
      srcFiles: [], sizes: [], parentCodes: [], pathAuto: true,
    };
  };
  const addFiles = (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) { toast.error(t("รับเฉพาะไฟล์รูปภาพ (JPG/PNG/…)", "Only image files are accepted (JPG/PNG/…)")); return; }
    const newRows = imgs.map(makeRow);
    setRows((r) => [...r, ...newRows]);
    // แกะขนาดจริง (cm) จากแต่ละรูป → เติมช่องขนาด (เฉพาะแถวที่ยังว่าง · ค่าประมาณ แก้ได้)
    for (const row of newRows) {
      estimateSizeCm(row.file).then((est) => {
        if (!est) return;
        setRows((rs) => rs.map((x) => x.id === row.id && x.sizes.length === 0 ? { ...x, sizes: [{ label: "ขนาด #1", w: est.w, h: est.h, unit: "cm" }] } : x));
      });
    }
  };
  // ลากหลายรูปมาวางบนหน้าคลัง → เปิด popup พร้อมรูปทั้งหมด
  useEffect(() => { if (initialFiles?.length) addFiles(initialFiles); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // เลือกแบรนด์ หรือแม็ปโหลดเสร็จ → เติม path ตามแบรนด์ให้แถวที่ยัง auto อยู่
  useEffect(() => { setRows((rs) => rs.map((x) => x.pathAuto ? { ...x, path: massPath(x.name, x.types) } : x)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [batchBrandId, brandBase, typeSub]);
  const setRow = (id: number, patch: Partial<MassRow>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  // แก้ชื่อ/ชนิด → เติม path ใหม่ถ้ายัง auto · แก้ path เอง → หยุด auto
  const setName = (id: number, v: string) => setRows((r) => r.map((x) => x.id === id ? { ...x, name: v, path: x.pathAuto ? massPath(v, x.types) : x.path } : x));
  const setTypes = (id: number, v: string[]) => setRows((r) => r.map((x) => x.id === id ? { ...x, types: v, path: x.pathAuto ? massPath(x.name, v) : x.path } : x));
  const applyTypesToAll = () => setRows((r) => r.map((x) => ({ ...x, types: [...batchTypes], path: x.pathAuto ? massPath(x.name, [...batchTypes]) : x.path })));
  // copy ค่าของใบหนึ่ง → ใส่ทุกใบ (ขนาด deep-copy กัน state ปนกัน)
  const applySizesToAll = (sizes: AssetSize[]) => setRows((r) => r.map((x) => ({ ...x, sizes: sizes.map((s) => ({ ...s })) })));
  const applyParentsToAll = (codes: string[]) => setRows((r) => r.map((x) => ({ ...x, parentCodes: [...codes] })));

  const save = async () => {
    if (rows.length === 0) { toast.error(t("ยังไม่มีรายการ — ลากไฟล์รูปเข้ามาก่อน", "No items yet — drag image files in first")); return; }
    if (!batchBrandId) { toast.error(t("เลือกแบรนด์ก่อน (ใช้กับทุกรูป)", "Select a brand first (applies to all images)")); return; }
    // โหมดโฟลเดอร์เดียว = ทุกใบได้ลิงก์ Drive อยู่แล้ว → ไม่ต้องมี path/ลิงก์เอง
    // แถวที่ไม่มี path/ลิงก์ แต่มีไฟล์ต้นฉบับให้อัปขึ้น Drive ก็ถือว่าครบ (ได้ลิงก์โฟลเดอร์มาเติมให้)
    const missing = (driveOn && (oneFolder || targetFolder)) ? [] : rows.filter((r) => !r.path.trim() && !r.url.trim() && !(driveOn && r.srcFiles.length > 0));
    if (missing.length) { toast.error(`${missing.length} ${t("แถวยังไม่ใส่ที่อยู่ไฟล์ต้นฉบับ (path / ลิงก์ / โยนไฟล์ขึ้น Drive)", "rows have no source-file location yet (path / link / drop files to Drive)")}`); return; }
    // ชื่อโฟลเดอร์รวม (โหมดโฟลเดอร์เดียว) = ที่ตั้งไว้ · ไม่ตั้ง = ชื่อร่วมของรูป/รูปแรก
    const combinedName = oneFolderName.trim() || commonNameSeed(rows.map((r) => r.name)) || rows[0]?.name?.trim() || "artwork";
    const combinedPath = oneFolder ? massPath(combinedName, rows[0]?.types ?? []) : "";   // path ชี้โฟลเดอร์รวม (ทุกใบเหมือนกัน)

    // snapshot ค่าที่ต้องใช้ (โมดัลปิดแล้วยังทำงานต่อได้) → ส่งงานไปวิ่งเบื้องหลัง + โชว์กล่องสถานะมุมจอ
    const jobRows = rows, jobBrand = batchBrandId, jobAlbums = batchAlbums, jobDrive = driveOn, jobOneFolder = oneFolder || !!targetFolder, jobTarget = targetFolder;
    runBackgroundTask({
      label: `${t("เพิ่ม Artwork", "Add Artwork")} ${jobRows.length} ${t("รูป", "images")}`,
      total: jobRows.length,
      run: async (report) => {
        let ok = 0, fail = 0, largeTotal = 0;
        let sharedFolderId = jobTarget?.id ?? "";   // โหมดโฟลเดอร์เดียว: ใบแรกสร้างโฟลเดอร์ → ใบต่อ ๆ ไปอัปเข้าโฟลเดอร์นี้ · มีปลายทาง=อัปเข้าเลย
        for (let i = 0; i < jobRows.length; i++) {
          const r = jobRows[i];
          try {
            const upFile = await downscaleImageWidth(r.file, 1600);   // ย่อด้านกว้าง ≤1600px (อัป R2)
            // อัปไฟล์ต้นฉบับ + ก็อปรูป preview ขึ้น Drive → ได้ลิงก์โฟลเดอร์ (โฟลเดอร์เดียว = ทุกใบ · แยก = เฉพาะใบมีไฟล์แนบ)
            let effUrl = r.url.trim();
            if (jobDrive && (jobOneFolder || r.srcFiles.length > 0)) {
              const drivePreview = await previewForDrive(r.file);
              const { folderId, folderLink, largeCount } = await uploadArtworkToDrive({
                name: r.name, artworkType: r.types[0], brandId: jobBrand, srcFiles: r.srcFiles, previewFile: drivePreview,
                folderId: jobOneFolder ? sharedFolderId : "", folderName: jobOneFolder ? combinedName : undefined,
              });
              if (jobOneFolder && folderId) sharedFolderId = folderId;
              if (folderLink) effUrl = folderLink; largeTotal += largeCount;
            }
            const fd = new FormData();
            fd.append("file", upFile); fd.append("source", "artwork");
            fd.append("brand_id", jobBrand);
            if (r.name.trim()) fd.append("title", r.name.trim());
            if (r.types.length) fd.append("artwork_types", JSON.stringify(r.types));
            const effPath = jobOneFolder && combinedPath ? combinedPath : r.path.trim();
            if (effPath) fd.append("master_path", effPath);
            if (effUrl) fd.append("master_url", effUrl);
            if (r.sizes.length) fd.append("sizes", JSON.stringify(r.sizes));
            if (r.parentCodes.length) fd.append("parent_sku_codes", JSON.stringify(r.parentCodes));
            if (jobAlbums.length) fd.append("collection_ids", JSON.stringify(jobAlbums));
            if (actor) fd.append("actor", actor);
            const res = await apiFetch("/api/assets", { method: "POST", body: fd });
            const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "");
            ok++;
          } catch { fail++; }
          report(i + 1);
        }
        triggerRefresh();   // เสร็จ → รีเฟรชลิสต์คลัง
        const parts = [`${t("เพิ่ม", "Added")} ${ok} ${t("รูป", "images")}`];
        if (fail) parts.push(`${t("ล้มเหลว", "failed")} ${fail}`);
        if (largeTotal) parts.push(`${t("ไฟล์ใหญ่", "Large file")} ${largeTotal} ${t("ต้องลากขึ้น Drive เอง", "must be dragged to Drive manually")}`);
        return { ok, fail, message: parts.join(" · ") };
      },
    });
    onDone();   // ปิดโมดัลทันที — งานวิ่งต่อเบื้องหลัง
  };

  return (
    <ERPModal open onClose={onClose} title={t("📋 เพิ่ม Artwork หลายรูป", "📋 Add multiple Artwork")} size="xl"
      description={t("ลากไฟล์รูปหลายไฟล์เข้ามา → ได้ 1 การ์ดต่อ 1 รูป (เลือกแบรนด์ใช้ทุกรูป · แต่ละรูปแนบไฟล์ต้นฉบับ/ใส่ขนาด/Parent SKU ได้) → กดบันทึกแล้วปิดได้เลย งานวิ่งเบื้องหลัง", "Drag in several image files → get one card per image (pick a brand for all · each image can attach source files/sizes/Parent SKU) → click save and close, the job runs in the background")}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{rows.length} {t("รายการ · บันทึกแล้ววิ่งเบื้องหลัง (ดูสถานะมุมจอ)", "items · saving runs in the background (see status in the corner)")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={save} disabled={rows.length === 0} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("บันทึกทั้งหมด", "Save all")} ({rows.length})</button>
          </div>
        </div>
      }>
      {targetFolder && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-800">
          {t("📎 ทุกรูปจะเพิ่มเข้าโฟลเดอร์เดียวกับ", "📎 All images will be added to the same folder as")} <b>“{targetFolder.label}”</b> {t("(ไม่สร้างโฟลเดอร์ใหม่)", "(no new folder created)")}
        </div>
      )}
      {/* โซนลากไฟล์หลายไฟล์ */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed flex items-center justify-center py-4 mb-3 text-center ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}>
        <div><span className="text-2xl">🎨</span><p className="text-[12px] text-slate-500 mt-1">{t("ลากไฟล์รูปหลายไฟล์มาที่นี่ / คลิกเพื่อเลือกหลายไฟล์", "Drag several image files here / click to choose multiple")}</p></div>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* ตั้งค่าทั้งชุด */}
      <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
        <label className="block text-[12px] text-slate-500">{t("แบรนด์", "Brand")} <span className="text-red-500">*</span> <span className="text-[10px] text-slate-400">{t("— ใช้กับทุกรูป (จัดโฟลเดอร์ Drive + เก็บกับทุกใบ)", "— applies to all images (organize the Drive folder + saved on each)")}</span>
          <select value={batchBrandId} onChange={(e) => setBatchBrandId(e.target.value)}
            className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg bg-white ${batchBrandId ? "border-slate-200" : "border-amber-300"}`}>
            <option value="">{t("— เลือกแบรนด์ —", "— Select brand —")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        {driveOn && (
          <div>
            <label className="flex items-start gap-2 text-[12px] text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={oneFolder} onChange={(e) => setOneFolder(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
              <span>{t("📎 รูปชุดนี้ใช้โฟลเดอร์ Drive เดียวกัน", "📎 This batch uses the same Drive folder")} <span className="text-[10px] text-slate-400">{t("— สร้างโฟลเดอร์เดียว เก็บทุกรูปในนี้ (ก็อปรูปตัวอย่าง + ไฟล์ต้นฉบับที่แนบ) แทนที่จะแยกโฟลเดอร์ทุกใบ", "— create one folder holding all images (previews + attached source files) instead of a separate folder per image")}</span></span>
            </label>
            {oneFolder && (
              <label className="block text-[12px] text-slate-500 mt-1.5 ml-6">{t("ชื่อโฟลเดอร์รวม", "Combined folder name")} <span className="text-[10px] text-slate-400">{t("— ไม่ตั้ง = ใช้ชื่อร่วมของรูป/รูปแรก", "— leave blank = use the images' common name/first image")}</span>
                <input value={oneFolderName} onChange={(e) => setOneFolderName(e.target.value)}
                  placeholder={commonNameSeed(rows.map((r) => r.name)) || rows[0]?.name || t("เช่น Tabby Brown Cat", "e.g. Tabby Brown Cat")}
                  className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-[12px] text-slate-500">{t("อัลบั้ม (ใช้กับทุกแถว)", "Album (applies to all rows)")}
            <div className="mt-0.5"><CollectionMultiSelect value={batchAlbums} collections={cols} onChange={setBatchAlbums} onCreated={(c) => setCols((cur) => [...cur, c])} /></div>
          </div>
          <div className="text-[12px] text-slate-500 flex flex-col">{t("ชนิดเริ่มต้น", "Default type")}
            <div className="mt-0.5"><ArtTypeMultiSelect value={batchTypes} types={artTypeList} onChange={setBatchTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div>
            {rows.length > 0 && batchTypes.length > 0 && <button type="button" onClick={applyTypesToAll} className="self-start mt-1 text-[11px] text-indigo-600 hover:underline">{t("→ ใส่ชนิดนี้ให้ทุกแถว", "→ Apply this type to all rows")}</button>}
          </div>
        </div>
      </div>

      {/* การ์ดรายรูป — 1 ใบ/รูป: ชื่อ+ชนิด · path/ลิงก์ · ไฟล์ต้นฉบับ→Drive · ขนาด · Parent SKU */}
      {rows.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-[13px]">{t("ยังไม่มีรายการ — ลากไฟล์เข้ามาด้านบน", "No items yet — drag files in above")}</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.id} className="border border-slate-200 rounded-lg p-2.5">
              <div className="flex items-start gap-2.5">
                {r.preview
                  ? <img src={r.preview} alt="" className="w-14 h-14 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" />
                  : <span className="text-2xl shrink-0">🎨</span>}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={r.name} onChange={(e) => setName(r.id, e.target.value)} placeholder={t("ชื่อรูป", "Image name")}
                      className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
                    <button type="button" onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))} title={t("ลบรูปนี้", "Remove this image")}
                      className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded shrink-0">🗑</button>
                  </div>
                  <ArtTypeMultiSelect value={r.types} types={artTypeList} onChange={(v) => setTypes(r.id, v)} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
                </div>
              </div>

              {/* path ต้นฉบับ / ลิงก์ */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input value={r.path} onChange={(e) => setRow(r.id, { path: e.target.value, pathAuto: false })} placeholder={base ? "path NAS…" : t("\\\\nas\\… หรือ Z:\\…", "\\\\nas\\… or Z:\\…")}
                  className="h-8 px-2 text-[11px] font-mono border border-slate-200 rounded" />
                <input value={r.url} onChange={(e) => setRow(r.id, { url: e.target.value })} placeholder={t("ลิงก์ Drive / Synology (ถ้ามี)", "Drive / Synology link (if any)")}
                  className="h-8 px-2 text-[11px] border border-slate-200 rounded" />
              </div>

              {/* แนบไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Drive + ก็อปรูปตัวอย่าง */}
              {driveOn && (
                <div className="mt-2">
                  <p className="text-[11px] text-slate-500 mb-1">{t("📤 ไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Drive + ก็อปรูปตัวอย่างให้อัตโนมัติ", "📤 Source files (AI/PSD/PDF) → auto-upload to Drive + copy the preview")}</p>
                  <label onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setRow(r.id, { srcFiles: [...r.srcFiles, ...Array.from(e.dataTransfer.files)] }); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="block border border-dashed border-slate-300 rounded-lg px-3 py-2 text-center text-[11px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
                    {t("+ ลากไฟล์มาวาง / คลิกเลือก", "+ Drag files here / click to choose")}
                    <input type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) setRow(r.id, { srcFiles: [...r.srcFiles, ...Array.from(e.target.files!)] }); e.target.value = ""; }} />
                  </label>
                  {r.srcFiles.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {r.srcFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-0.5">
                          <span className="flex-1 truncate">📄 {f.name}</span>
                          <span className="text-slate-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                          <button type="button" onClick={() => setRow(r.id, { srcFiles: r.srcFiles.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ขนาด + Parent SKU (รายรูป) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[11px] text-slate-500">{t("📐 ขนาด (กว้าง × สูง)", "📐 Size (W × H)")}</p>
                    {r.sizes.length > 0 && rows.length > 1 && <button type="button" onClick={() => applySizesToAll(r.sizes)} className="text-[10px] text-indigo-600 hover:underline">{t("→ ใส่ทุกใบ", "→ Apply to all")}</button>}
                  </div>
                  <SizesEditor value={r.sizes} onChange={(v) => setRow(r.id, { sizes: v })} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[11px] text-slate-500">{t("📦 Parent SKU ที่ใช้", "📦 Parent SKUs used")}</p>
                    {r.parentCodes.length > 0 && rows.length > 1 && <button type="button" onClick={() => applyParentsToAll(r.parentCodes)} className="text-[10px] text-indigo-600 hover:underline">{t("→ ใส่ทุกใบ", "→ Apply to all")}</button>}
                  </div>
                  <ParentSkuField value={r.parentCodes} onChange={(v) => setRow(r.id, { parentCodes: v })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
