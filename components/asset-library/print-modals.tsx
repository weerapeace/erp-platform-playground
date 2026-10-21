"use client";
// คลังไฟล์: เพิ่มงานพิมพ์ ทีละรูป / หลายรูป — แยกจาก index.tsx (Y1)
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { downscaleImageWidth } from "@/lib/image-resize";
import { type AssetSize, type PrintItem } from "@/app/api/assets/shared";
import { AssetPicker } from "@/components/asset-picker";
import { Spinner, LoadingOverlay } from "@/components/spinner";
import { HelpButton } from "@/components/help-guides";
import { runBackgroundTask } from "@/lib/background-tasks";
import { triggerRefresh } from "@/lib/refresh-bus";
import type { PrintType } from "@/app/api/print-types/route";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import { previewForDrive, uploadArtworkToDrive, useDriveFolderMaps } from "./asset-shared";
import { CollectionMultiSelect, PrintItemsField, SizesEditor, ParentSkuField, TagPickerField } from "./asset-fields";

// ── เพิ่มงานพิมพ์ (DTF/UV) — รูป preview + ไฟล์ .ai/.pdf ขึ้นโฟลเดอร์ Drive + ประเภท/ขนาดแผ่น ──
export function PrintJobAddModal({ actor, printTypes, collections, defaultCollectionIds, initialFile, onClose, onDone }: {
  actor: string | null; printTypes: PrintType[]; collections: AssetCollection[];
  defaultCollectionIds?: string[]; initialFile?: File | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const { brandBase, typeSub } = useDriveFolderMaps();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const t = useT();
  const [ptype, setPtype] = useState("");                       // ประเภทงานพิมพ์ (code)
  const [subpath, setSubpath] = useState("");                   // โฟลเดอร์ Drive ที่จะเก็บ (แก้เองได้ · default จากประเภท)
  const [subpathTouched, setSubpathTouched] = useState(false);  // ผู้ใช้แก้ path เองแล้ว = ไม่ override ตอนสลับประเภท
  const [groupFolder, setGroupFolder] = useState("");           // โฟลเดอร์ย่อยเลือกได้ (เช่น goodgoods) — ไม่ใส่ = ไฟล์ลงในซับตรง ๆ
  const [groupOptions, setGroupOptions] = useState<string[]>([]); // โฟลเดอร์ย่อยที่มีอยู่แล้ว (ทำ dropdown)
  const [groupOpen, setGroupOpen] = useState(false);            // เปิด dropdown โฟลเดอร์ย่อย
  const [driveDest, setDriveDest] = useState<"new" | "shared">("new");   // สร้างโฟลเดอร์ใหม่ vs ลงโฟลเดอร์เดียวกับงานที่มีแล้ว
  const [sharedFolder, setSharedFolder] = useState<{ id: string; url: string; label: string } | null>(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [resizeW, setResizeW] = useState(1200);                 // ย่อรูป preview ก่อนเก็บคลัง (0 = ขนาดจริง)
  const [sizes, setSizes] = useState<AssetSize[]>([]);
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [srcFiles, setSrcFiles] = useState<File[]>([]);         // ไฟล์พิมพ์ .ai/.pdf → Drive
  const [printItems, setPrintItems] = useState<PrintItem[]>([]); // Artwork ในแผ่น + จำนวน
  const [parentCodes, setParentCodes] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>(defaultCollectionIds ?? []);
  const [cols, setCols] = useState<AssetCollection[]>(collections);
  const [tags, setTags] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [driveOn, setDriveOn] = useState(false);
  const [autoFolder, setAutoFolder] = useState(true);
  const [driveProg, setDriveProg] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [printRoot, setPrintRoot] = useState<{ folder_id: string; local_base_path: string }>({ folder_id: "", local_base_path: "" });
  const inputRef = useRef<HTMLInputElement>(null);
  const srcInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  // โฟลเดอร์แม่เฉพาะของงานพิมพ์ (ตั้งที่ ⚙️) — งานพิมพ์ทุกชิ้นไปที่นี่ ไม่สนแบรนด์
  useEffect(() => { apiFetch("/api/ui-config?key=print_drive_root").then((r) => r.json()).then((j) => setPrintRoot({ folder_id: String(j.value?.folder_id ?? ""), local_base_path: String(j.value?.local_base_path ?? "") })).catch(() => {}); }, []);
  // โฟลเดอร์ย่อยที่มีอยู่แล้วใต้ [ราก]/[subpath] → ทำ dropdown เลือก (พิมพ์ชื่อใหม่ = สร้างใหม่)
  useEffect(() => {
    if (!driveOn) return;
    const sub = subpath.trim() || ptype; if (!sub) { setGroupOptions([]); return; }
    let alive = true;
    apiFetch(`/api/drive/group-folders?root=${encodeURIComponent(printRoot.folder_id)}&subpath=${encodeURIComponent(sub)}`)
      .then((r) => r.json()).then((j) => { if (alive) setGroupOptions((j.folders ?? []) as string[]); }).catch(() => {});
    return () => { alive = false; };
  }, [driveOn, subpath, ptype, printRoot.folder_id]);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);

  // เลือกประเภท → เติมขนาด + โฟลเดอร์เริ่มต้นให้ (แก้ทับได้ · ไม่ทับถ้าแก้เองแล้ว)
  const pickType = (code: string) => {
    setPtype(code);
    const t = printTypes.find((x) => x.code === code);
    if (t?.default_w && t?.default_h) {
      const one: AssetSize = { label: "ขนาดแผ่น", w: Number(t.default_w), h: Number(t.default_h), unit: (t.unit || "cm") as AssetSize["unit"] };
      setSizes((cur) => (cur.length ? cur : [one]));
    }
    if (!subpathTouched) setSubpath((t?.drive_subpath ?? "").trim() || code);   // default โฟลเดอร์ตามประเภท
  };

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };
  // ลากรูปมาวางบนหน้างานพิมพ์ → เปิด popup พร้อมรูป
  useEffect(() => { if (initialFile) pick(initialFile); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async () => {
    if (!file) { toast.error(t("แนบรูป preview ของงานพิมพ์ก่อน", "Attach the print job's preview image first")); return; }
    if (!ptype) { toast.error(t("เลือกประเภทงานพิมพ์ (DTF/UV) ก่อน", "Select a print type (DTF/UV) first")); return; }
    setBusy(true);
    try {
      // มีไฟล์พิมพ์ หรือติ๊กสร้างโฟลเดอร์ → สร้างโฟลเดอร์ Drive + ก็อป preview + อัปไฟล์พิมพ์
      let effUrl = "", effPath = "";
      const useShared = driveOn && driveDest === "shared" && !!sharedFolder;
      if (useShared || (driveOn && (srcFiles.length > 0 || autoFolder))) {
        const nm = title.trim() || file.name.replace(/\.[^.]+$/, "") || "งานพิมพ์";
        const previewFile = await previewForDrive(file);
        if (useShared && sharedFolder) {
          // ลงโฟลเดอร์เดียวกับงานที่มีแล้ว (ไฟล์อยู่รวม ไม่สร้างโฟลเดอร์ใหม่)
          const { folderLink, largeCount } = await uploadArtworkToDrive({
            name: nm, srcFiles, previewFile, folderId: sharedFolder.id,
            onProgress: (done, total) => setDriveProg({ done, total }),
          });
          if (largeCount) toast.warning(`${t("ไฟล์ใหญ่", "Large file")} ${largeCount} ${t("ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์ Drive แล้วลากขึ้นเอง", "files weren't auto-uploaded (over 4MB) — open the Drive folder and drag them up yourself")}`);
          effUrl = folderLink || sharedFolder.url;
        } else {
          // โฟลเดอร์ = ซับ(Printed/DTF) + โฟลเดอร์ย่อยที่เลือก (เช่น goodgoods) แล้วสร้างโฟลเดอร์ตามชื่องานข้างใน
          const effSub = [subpath.trim() || ptype, groupFolder.trim()].filter(Boolean).join("/");
          const { folderLink, largeCount } = await uploadArtworkToDrive({
            name: nm, brandId, srcFiles, previewFile, subpath: effSub,
            rootFolderId: printRoot.folder_id || undefined,   // งานพิมพ์ไปโฟลเดอร์แม่เฉพาะ (ถ้าตั้งไว้)
            onProgress: (done, total) => setDriveProg({ done, total }),
          });
          if (largeCount) toast.warning(`${t("ไฟล์ใหญ่", "Large file")} ${largeCount} ${t("ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์ Drive แล้วลากขึ้นเอง", "files weren't auto-uploaded (over 4MB) — open the Drive folder and drag them up yourself")}`);
          if (folderLink) effUrl = folderLink;
          // path ในเครื่อง: ฐานงานพิมพ์ (ถ้าตั้ง) ไม่งั้นฐานแบรนด์ → \Printed\DTF\<โฟลเดอร์ย่อย>\<ชื่องาน>
          const base = printRoot.local_base_path.trim() || brandBase[brandId] || "";
          effPath = base ? [base.replace(/[\\/]+$/, ""), ...effSub.split(/[\\/]+/).filter(Boolean), nm].join("\\") : "";
        }
      }

      const upFile = resizeW > 0 ? await downscaleImageWidth(file, resizeW) : file;   // ย่อรูป preview ตามที่เลือก (0 = ขนาดจริง)
      const fd = new FormData();
      fd.append("file", upFile);
      fd.append("source", "print");
      fd.append("print_type", ptype);
      if (title.trim()) fd.append("title", title.trim());
      if (brandId) fd.append("brand_id", brandId);
      if (effPath) fd.append("master_path", effPath);
      if (effUrl) fd.append("master_url", effUrl);
      if (sizes.length) fd.append("sizes", JSON.stringify(sizes));
      if (printItems.length) fd.append("print_items", JSON.stringify(printItems));
      if (parentCodes.length) fd.append("parent_sku_codes", JSON.stringify(parentCodes));
      if (collectionIds.length) fd.append("collection_ids", JSON.stringify(collectionIds));
      if (tags.length) fd.append("tags", tags.join(","));
      if (keywords.trim()) fd.append("keywords", keywords.trim());
      if (actor) fd.append("actor", actor);
      const res = await apiFetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(t("เพิ่มงานพิมพ์แล้ว", "Print job added")); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); setDriveProg({ done: 0, total: 0 }); }
  };

  return (
    <ERPModal open onClose={() => !busy && onClose()} title={t("🖨 เพิ่มงานพิมพ์", "🖨 Add print job")} size="lg"
      description={t("รูป preview ของแผ่น + ไฟล์ .ai/.pdf สำหรับส่งพิมพ์ (ใส่ทีหลังได้) + ประเภท/ขนาดแผ่น", "The sheet's preview image + .ai/.pdf files for printing (can add later) + type/sheet size")}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{driveProg.total > 0 ? `${t("📤 อัปขึ้น Drive", "📤 Uploading to Drive")} ${driveProg.done}/${driveProg.total}…` : t("ไฟล์พิมพ์เก็บบน Drive · รูป preview เก็บในคลัง", "Print files stored on Drive · preview stored in the library")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
          </div>
        </div>
      }>
      {busy && <LoadingOverlay message={t("กำลังบันทึกงานพิมพ์…", "Saving print job…")} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ซ้าย: รูป preview */}
        <div>
          <div onClick={() => inputRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pick(f); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`cursor-pointer rounded-xl border-2 border-dashed aspect-square flex items-center justify-center overflow-hidden ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}>
            {preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
              : <span className="text-[12px] text-slate-400 text-center px-4">{t("ลากรูป preview ของแผ่นมาวาง", "Drop the sheet's preview image here")}<br />{t("หรือคลิกเลือก", "or click to choose")}</span>}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>
          {/* ย่อขนาดรูป preview ก่อนเก็บคลัง (ไฟล์ส่งพิมพ์บน Drive ไม่โดนย่อ) */}
          <div className="mt-2">
            <p className="text-[11px] text-slate-500 mb-1">{t("ย่อขนาดรูป preview", "Shrink preview image")} <span className="text-[10px] text-slate-400">{t("(ด้านกว้าง)", "(width)")}</span></p>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {[{ w: 800, label: "800px" }, { w: 1200, label: "1200px" }, { w: 1600, label: "1600px" }, { w: 0, label: t("ขนาดจริง", "Full size") }].map((o, i) => (
                <button key={o.w} type="button" onClick={() => setResizeW(o.w)} disabled={busy}
                  className={`h-8 px-2.5 text-[12px] ${i > 0 ? "border-l border-slate-200" : ""} ${resizeW === o.w ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"} disabled:opacity-50`}>
                  {resizeW === o.w ? "✓ " : ""}{o.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-[12px] text-slate-500 mt-2">{t("ชื่องาน", "Job name")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("เช่น DTF 60cm. ช้างใบใหญ่", "e.g. DTF 60cm. large elephant")}
              className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
        </div>

        {/* ขวา: ประเภท/ขนาด/ไฟล์พิมพ์ */}
        <div className="space-y-2.5">
          <div className="text-[12px] text-slate-500">{t("ประเภทงานพิมพ์", "Print type")} <span className="text-rose-500">*</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {printTypes.length === 0 && <span className="text-[11px] text-amber-600">{t("ยังไม่มีประเภท — ตั้งค่าที่ปุ่ม ⚙️ ก่อน", "No types yet — set them up with the ⚙️ button first")}</span>}
              {printTypes.map((t) => (
                <button key={t.id} type="button" onClick={() => pickType(t.code)}
                  className={`h-8 px-3 text-[12px] rounded-lg border ${ptype === t.code ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {t.name}{t.default_w && t.default_h ? <span className="text-slate-400 ml-1">{t.default_w}×{t.default_h}</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[12px] text-slate-500">{t("ขนาดแผ่น", "Sheet size")} <span className="text-[10px] text-slate-400">{t("— เติมให้ตามประเภท แก้ได้", "— filled from the type, editable")}</span>
            <div className="mt-1"><SizesEditor value={sizes} onChange={setSizes} /></div>
          </div>

          <label className="block text-[12px] text-slate-500">{t("แบรนด์", "Brand")} <span className="text-[10px] text-slate-400">{t("(ใช้จัดที่ตั้งโฟลเดอร์ Drive)", "(used to place the Drive folder)")}</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">{t("— ไม่ระบุ —", "— None —")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>

          {driveOn && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
              {/* เลือกปลายทาง: โฟลเดอร์ใหม่ (ตามชื่องาน) vs ลงโฟลเดอร์เดียวกับงานที่มีแล้ว */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex gap-1 p-0.5 bg-white rounded-lg border border-slate-200">
                  <button type="button" onClick={() => setDriveDest("new")}
                    className={`h-7 px-2.5 text-[11px] font-medium rounded-md ${driveDest === "new" ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>{t("🆕 โฟลเดอร์ใหม่", "🆕 New folder")}</button>
                  <button type="button" onClick={() => setDriveDest("shared")}
                    className={`h-7 px-2.5 text-[11px] font-medium rounded-md ${driveDest === "shared" ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>{t("📎 ใช้โฟลเดอร์เดียวกับงานที่มีแล้ว", "📎 Use an existing job's folder")}</button>
                </div>
                <HelpButton guideKey="drive-link" />
              </div>

              {driveDest === "shared" ? (
                <div className="space-y-1.5">
                  {sharedFolder ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2 py-1.5">
                      <span className="text-[12px] text-slate-700 flex-1 min-w-0 truncate">📁 {sharedFolder.label}</span>
                      <button type="button" onClick={() => setSharePickerOpen(true)} className="text-[11px] text-indigo-600 hover:underline shrink-0">{t("เปลี่ยน", "Change")}</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setSharePickerOpen(true)} className="w-full h-9 text-[12px] border border-dashed border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50">{t("＋ เลือกงานพิมพ์ที่มีโฟลเดอร์แล้ว", "＋ Pick a print job that has a folder")}</button>
                  )}
                  <p className="text-[10px] text-slate-500">{t("ไฟล์ของงานนี้จะไปอยู่ในโฟลเดอร์เดียวกับงานที่เลือก (ไม่สร้างโฟลเดอร์ใหม่)", "This job's files will go into the same folder as the selected job (no new folder created)")}</p>
                </div>
              ) : (
              <>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={autoFolder} onChange={(e) => setAutoFolder(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
                <span className="text-[12px] text-slate-700">🗂️ <b>{t("สร้างโฟลเดอร์ Drive ให้อัตโนมัติ", "Auto-create a Drive folder")}</b> {t("+ ก็อปรูป preview เข้าไป", "+ copy the preview into it")}</span>
              </label>

              {/* โฟลเดอร์ที่จะเก็บ (แก้เองได้) + โฟลเดอร์ย่อยเลือกได้ + ตัวอย่างที่อยู่เต็ม */}
              {autoFolder && (
                <div className="mt-2 space-y-1.5">
                  <label className="block text-[11px] text-slate-500">{t("📁 โฟลเดอร์ Drive ที่จะเก็บ", "📁 Drive folder to store in")} <span className="text-[10px] text-slate-400">{t("(ใส่ / เพื่อซ้อนชั้น · เว้นว่าง = ใช้รหัสประเภท)", "(use / to nest · blank = use the type code)")}</span>
                    <input value={subpath} onChange={(e) => { setSubpath(e.target.value); setSubpathTouched(true); }} placeholder={t("เช่น Printed/DTF", "e.g. Printed/DTF")}
                      className="mt-0.5 w-full h-8 px-2.5 text-[12px] border border-slate-200 rounded-lg font-mono" /></label>
                  <div className="text-[11px] text-slate-500">{t("📂 โฟลเดอร์ย่อย", "📂 Subfolder")} <span className="text-[10px] text-slate-400">{t("(เลือกที่มี หรือพิมพ์ใหม่ · เว้นว่าง = ไฟล์ลงใน", "(pick existing or type new · blank = files go directly into")} {subpath.trim() || ptype || "DTF"} {t("ตรง ๆ)", ")")}</span>
                    <div className="relative mt-0.5">
                      <input value={groupFolder} onChange={(e) => { setGroupFolder(e.target.value); setGroupOpen(true); }}
                        onFocus={() => setGroupOpen(true)} onBlur={() => setTimeout(() => setGroupOpen(false), 150)}
                        placeholder={t("เช่น goodgoods", "e.g. goodgoods")} className="w-full h-8 pl-2.5 pr-7 text-[12px] border border-slate-200 rounded-lg font-mono" />
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); setGroupOpen((v) => !v); }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px]" title={t("เลือกโฟลเดอร์ที่มี", "Pick an existing folder")}>▾</button>
                      {groupOpen && (() => {
                        const q = groupFolder.trim().toLowerCase();
                        const opts = groupOptions.filter((f) => !q || f.toLowerCase().includes(q));
                        return (
                          <div className="absolute z-20 left-0 right-0 mt-1 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                            {groupFolder.trim() && <button type="button" onMouseDown={() => { setGroupOpen(false); }} className="w-full text-left px-2.5 py-1 text-[12px] text-indigo-600 hover:bg-indigo-50">{t("＋ สร้างใหม่", "＋ Create new")} “{groupFolder.trim()}”</button>}
                            {opts.length === 0 && !groupFolder.trim() && <p className="px-2.5 py-1.5 text-[11px] text-slate-400">{t("ยังไม่มีโฟลเดอร์ย่อย — พิมพ์เพื่อสร้างใหม่", "No subfolders yet — type to create a new one")}</p>}
                            {opts.map((f) => (
                              <button key={f} type="button" onMouseDown={() => { setGroupFolder(f); setGroupOpen(false); }}
                                className={`w-full text-left px-2.5 py-1 text-[12px] hover:bg-slate-50 ${groupFolder === f ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700"}`}>📂 {f}</button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {t("จะเก็บที่:", "Will store at:")} <span className="font-mono text-slate-500">{[printRoot.folder_id ? t("📁 โฟลเดอร์งานพิมพ์", "📁 Print folder") : (brands.find((b) => b.id === brandId)?.name || t("โฟลเดอร์แม่", "Parent folder")), ...(subpath.trim() || ptype || "").split(/[\\/]+/).filter(Boolean), ...(groupFolder.trim() ? [groupFolder.trim()] : []), title.trim() || t("(ชื่องาน)", "(job name)")].join(" › ")}</span>
                  </p>
                </div>
              )}
              </>
              )}

              <span className="block mt-2 text-[12px] text-slate-500">{t("📎 ไฟล์พิมพ์ (.ai / .pdf)", "📎 Print files (.ai / .pdf)")} <span className="text-[10px] text-slate-400">{t("— ไม่ใส่ตอนนี้ก็ได้", "— optional for now")}</span></span>
              <div onClick={() => srcInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]); }}
                onDragOver={(e) => e.preventDefault()}
                className="mt-1 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-center text-[12px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
                {t("+ ลากไฟล์พิมพ์มาวาง หรือคลิกเลือก", "+ Drag print files here or click to choose")}
                <input ref={srcInputRef} type="file" multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
              </div>
              {srcFiles.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {srcFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] bg-white border border-slate-200 rounded px-2 py-1">
                      <span className="flex-1 truncate">📄 {f.name}</span>
                      <span className="text-slate-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button type="button" onClick={() => setSrcFiles((p) => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-2">
            <PrintItemsField value={printItems} onChange={setPrintItems} />
          </div>

          <div className="text-[12px] text-slate-500">{t("📦 Parent SKU ที่อยู่ในแผ่นนี้", "📦 Parent SKUs on this sheet")} <span className="text-[10px] text-slate-400">{t("(ไม่บังคับ)", "(optional)")}</span>
            <div className="mt-0.5"><ParentSkuField value={parentCodes} onChange={setParentCodes} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-[12px] text-slate-500">{t("อัลบั้ม", "Album")}
              <div className="mt-0.5"><CollectionMultiSelect value={collectionIds} collections={cols} onChange={setCollectionIds} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
            <div className="text-[12px] text-slate-500">{t("แท็ก", "Tags")}
              <div className="mt-0.5"><TagPickerField value={tags} onChange={setTags} /></div></div>
          </div>
          <label className="block text-[12px] text-slate-500">{t("คำค้นเพิ่มเติม", "Extra keywords")}
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t("เช่น ช้าง งานพิมพ์ ลูกค้า A", "e.g. elephant print customer A")}
              className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
        </div>
      </div>

      {/* เลือกงานพิมพ์ที่มีโฟลเดอร์แล้ว → ใช้โฟลเดอร์เดียวกัน */}
      <AssetPicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} typeFilter="image" defaultSource="print" requireDriveFolder
        title={t("เลือกงานพิมพ์ที่มีโฟลเดอร์ Drive แล้ว", "Select a print job that already has a Drive folder")} contextLabel={t("ใช้โฟลเดอร์เดียวกับงานนี้", "Use the same folder as this job")}
        onSelect={(assets) => { const s = assets[0]; if (s) { const m = (s.master_url ?? "").match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) setSharedFolder({ id: m[1], url: s.master_url ?? "", label: s.title || s.file_name }); } setSharePickerOpen(false); }} />
    </ERPModal>
  );
}

// ── เพิ่มงานพิมพ์หลายงาน (ตาราง) — 1 รูป/แถว · ประเภทตัวเดียวทั้งชุด · ต่อแถวใส่ Artwork+จำนวนได้ · บันทึกวิ่ง background ──
export type MassPrintRow = { id: number; file: File; preview: string | null; name: string; sizes: AssetSize[]; group: string; srcFiles: File[]; printItems: PrintItem[] };

export function MassPrintModal({ actor, printTypes, collections, defaultCollectionIds, initialFiles, onClose, onDone }: {
  actor: string | null; printTypes: PrintType[]; collections: AssetCollection[];
  defaultCollectionIds?: string[]; initialFiles?: File[] | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const { brandBase } = useDriveFolderMaps();
  const [rows, setRows] = useState<MassPrintRow[]>([]);
  const [ptype, setPtype] = useState("");                       // ประเภทงานพิมพ์ ใช้ทั้งชุด
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [group, setGroup] = useState("");                       // โฟลเดอร์ย่อยใช้ทั้งชุด (แถวเว้นว่าง = ใช้ตัวนี้)
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const [massShared, setMassShared] = useState<{ id: string; url: string; label: string } | null>(null);   // ทุกงานลงโฟลเดอร์เดียวกับงานที่เลือก
  const [massSharePickerOpen, setMassSharePickerOpen] = useState(false);
  const [collectionIds, setCollectionIds] = useState<string[]>(defaultCollectionIds ?? []);
  const [cols, setCols] = useState<AssetCollection[]>(collections);
  const [tags, setTags] = useState<string[]>([]);
  const [driveOn, setDriveOn] = useState(false);
  const [autoFolder, setAutoFolder] = useState(true);
  const [resizeW, setResizeW] = useState(1200);
  const [printRoot, setPrintRoot] = useState<{ folder_id: string; local_base_path: string }>({ folder_id: "", local_base_path: "" });
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(1);

  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/ui-config?key=print_drive_root").then((r) => r.json()).then((j) => setPrintRoot({ folder_id: String(j.value?.folder_id ?? ""), local_base_path: String(j.value?.local_base_path ?? "") })).catch(() => {}); }, []);

  const subOf = () => (printTypes.find((t) => t.code === ptype)?.drive_subpath ?? "").trim() || ptype;   // เช่น Printed/DTF
  const defSize = (): AssetSize[] => { const t = printTypes.find((x) => x.code === ptype); return t?.default_w && t?.default_h ? [{ label: "ขนาดแผ่น", w: Number(t.default_w), h: Number(t.default_h), unit: (t.unit || "cm") as AssetSize["unit"] }] : []; };
  useEffect(() => {   // โฟลเดอร์ย่อยที่มี → dropdown ทั้งชุด
    if (!driveOn || !ptype) { setGroupOptions([]); return; }
    let alive = true;
    apiFetch(`/api/drive/group-folders?root=${encodeURIComponent(printRoot.folder_id)}&subpath=${encodeURIComponent(subOf())}`)
      .then((r) => r.json()).then((j) => { if (alive) setGroupOptions((j.folders ?? []) as string[]); }).catch(() => {});
    return () => { alive = false; };
  }, [driveOn, ptype, printRoot.folder_id]);

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setRows((cur) => [...cur, ...arr.map((f) => ({ id: idRef.current++, file: f, preview: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, ""), sizes: defSize(), group: "", srcFiles: [], printItems: [] as PrintItem[] }))]);
  };
  useEffect(() => { if (initialFiles?.length) addFiles(initialFiles); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const setRow = (id: number, patch: Partial<MassPrintRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // เลือกประเภท → เติมขนาดให้แถวที่ยังว่าง
  const pickType = (code: string) => { setPtype(code); const t = printTypes.find((x) => x.code === code); if (t?.default_w && t?.default_h) { const one: AssetSize = { label: "ขนาดแผ่น", w: Number(t.default_w), h: Number(t.default_h), unit: (t.unit || "cm") as AssetSize["unit"] }; setRows((rs) => rs.map((r) => (r.sizes.length ? r : { ...r, sizes: [one] }))); } };

  const save = () => {
    if (!rows.length) { toast.error(t("ลากรูป preview ของแผ่นเข้ามาก่อน", "Drag the sheets' preview images in first")); return; }
    if (!ptype) { toast.error(t("เลือกประเภทงานพิมพ์ก่อน (ใช้ทั้งชุด)", "Select a print type first (applies to the whole batch)")); return; }
    setBusy(true);
    const jobRows = rows, jType = ptype, jSub = subOf(), jBrand = brandId, jGroup = group.trim(), jAlbums = collectionIds, jTags = tags, jResize = resizeW, jDrive = driveOn && autoFolder, jRoot = printRoot, jShared = massShared;
    const base = jRoot.local_base_path.trim() || brandBase[jBrand] || "";
    runBackgroundTask({
      label: `${t("เพิ่มงานพิมพ์", "Add print jobs")} ${jobRows.length} ${t("งาน", "jobs")}`,
      total: jobRows.length,
      run: async (report) => {
        let ok = 0, fail = 0, largeTotal = 0;
        for (let i = 0; i < jobRows.length; i++) {
          const r = jobRows[i];
          try {
            const nm = r.name.trim() || r.file.name.replace(/\.[^.]+$/, "") || "งานพิมพ์";
            const effSub = [jSub, (r.group.trim() || jGroup)].filter(Boolean).join("/");
            let effUrl = "", effPath = "";
            if (driveOn && jShared) {
              // ทุกงานลงโฟลเดอร์เดียวกับงานที่เลือก (ไฟล์อยู่รวม)
              const previewFile = await previewForDrive(r.file);
              const { folderLink, largeCount } = await uploadArtworkToDrive({ name: nm, srcFiles: r.srcFiles, previewFile, folderId: jShared.id });
              largeTotal += largeCount; effUrl = folderLink || jShared.url;
            } else if (jDrive) {
              const previewFile = await previewForDrive(r.file);
              const { folderLink, largeCount } = await uploadArtworkToDrive({ name: nm, brandId: jBrand, srcFiles: r.srcFiles, previewFile, subpath: effSub, rootFolderId: jRoot.folder_id || undefined });
              largeTotal += largeCount; if (folderLink) effUrl = folderLink;
              effPath = base ? [base.replace(/[\\/]+$/, ""), ...effSub.split(/[\\/]+/).filter(Boolean), nm].join("\\") : "";
            }
            const upFile = jResize > 0 ? await downscaleImageWidth(r.file, jResize) : r.file;
            const fd = new FormData();
            fd.append("file", upFile); fd.append("source", "print"); fd.append("print_type", jType);
            fd.append("title", nm);
            if (jBrand) fd.append("brand_id", jBrand);
            if (effPath) fd.append("master_path", effPath);
            if (effUrl) fd.append("master_url", effUrl);
            if (r.sizes.length) fd.append("sizes", JSON.stringify(r.sizes));
            if (r.printItems.length) fd.append("print_items", JSON.stringify(r.printItems));
            if (jAlbums.length) fd.append("collection_ids", JSON.stringify(jAlbums));
            if (jTags.length) fd.append("tags", jTags.join(","));
            if (actor) fd.append("actor", actor);
            const res = await apiFetch("/api/assets", { method: "POST", body: fd });
            const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "");
            ok++;
          } catch { fail++; }
          report(i + 1);
        }
        triggerRefresh();
        const parts = [`${t("เพิ่ม", "Added")} ${ok} ${t("งาน", "jobs")}`]; if (fail) parts.push(`${t("ล้มเหลว", "failed")} ${fail}`); if (largeTotal) parts.push(`${t("ไฟล์ใหญ่", "Large file")} ${largeTotal} ${t("ต้องลากขึ้น Drive เอง", "must be dragged to Drive manually")}`);
        return { ok, fail, message: parts.join(" · ") };
      },
    });
    onDone();
  };

  return (
    <ERPModal open onClose={onClose} title={t("📋 เพิ่มงานพิมพ์หลายงาน", "📋 Add multiple print jobs")} size="xl"
      description={t("ลากรูป preview หลายแผ่น → 1 การ์ด/แผ่น · ตั้งประเภท/แบรนด์/โฟลเดอร์ใช้ทั้งชุด · ต่อแถวใส่ชื่อ/ขนาด/Artwork ได้ → กดบันทึกแล้วปิดได้เลย งานวิ่งเบื้องหลัง", "Drag in several sheet previews → one card per sheet · set type/brand/folder for the whole batch · per row add name/size/Artwork → click save and close, the job runs in the background")}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{rows.length} {t("งาน · บันทึกแล้ววิ่งเบื้องหลัง (ดูสถานะมุมจอ)", "jobs · saving runs in the background (see status in the corner)")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={save} disabled={rows.length === 0} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("บันทึกทั้งหมด", "Save all")} ({rows.length})</button>
          </div>
        </div>
      }>
      {/* โซนลากไฟล์ */}
      <div onClick={() => inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        className={`cursor-pointer rounded-xl border-2 border-dashed flex items-center justify-center py-4 mb-3 text-center text-[12px] ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50 text-slate-400"}`}>
        {t("+ ลากรูป preview ของแผ่นหลายไฟล์มาวาง หรือคลิกเลือก", "+ Drag several sheet preview files here or click to choose")}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* ตั้งค่าทั้งชุด */}
      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2.5 mb-3">
        <p className="text-[11px] font-medium text-slate-500">{t("ใช้กับทุกงาน", "Applies to all jobs")}</p>
        <div className="text-[12px] text-slate-500">{t("ประเภทงานพิมพ์", "Print type")} <span className="text-rose-500">*</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {printTypes.length === 0 && <span className="text-[11px] text-amber-600">{t("ยังไม่มีประเภท — ตั้งที่ ⚙️ ก่อน", "No types yet — set them up with ⚙️ first")}</span>}
            {printTypes.map((t) => (
              <button key={t.id} type="button" onClick={() => pickType(t.code)}
                className={`h-8 px-3 text-[12px] rounded-lg border ${ptype === t.code ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {t.name}{t.default_w && t.default_h ? <span className="text-slate-400 ml-1">{t.default_w}×{t.default_h}</span> : null}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-[12px] text-slate-500">{t("แบรนด์", "Brand")}
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">{t("— ไม่ระบุ —", "— None —")}</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <label className="text-[12px] text-slate-500">{t("📂 โฟลเดอร์ย่อย (ทั้งชุด)", "📂 Subfolder (whole batch)")}
            <input value={group} onChange={(e) => setGroup(e.target.value)} disabled={!!massShared} list="mass-print-groups" placeholder={t("เช่น goodgoods (เว้นว่าง = ลงใน DTF ตรง ๆ)", "e.g. goodgoods (blank = go directly into DTF)")}
              className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg font-mono disabled:bg-slate-100" />
            <datalist id="mass-print-groups">{groupOptions.map((f) => <option key={f} value={f} />)}</datalist></label>
        </div>
        {/* ทุกงานลงโฟลเดอร์เดียวกับงานที่มีแล้ว (ไฟล์อยู่รวม) */}
        {driveOn && (
          <div className="flex items-center gap-2 flex-wrap">
            {massShared ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2 py-1.5 text-[12px] text-slate-700">
                <span>{t("📎 ทุกงานลงโฟลเดอร์:", "📎 All jobs to folder:")} <b>{massShared.label}</b></span>
                <button type="button" onClick={() => setMassSharePickerOpen(true)} className="text-[11px] text-indigo-600 hover:underline">{t("เปลี่ยน", "Change")}</button>
                <button type="button" onClick={() => setMassShared(null)} className="text-[11px] text-slate-400 hover:text-red-500">{t("✕ ยกเลิก", "✕ Cancel")}</button>
              </div>
            ) : (
              <button type="button" onClick={() => setMassSharePickerOpen(true)} className="text-[12px] px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">{t("📎 ทุกงานลงโฟลเดอร์เดียวกับงานที่มีแล้ว", "📎 All jobs into an existing job's folder")}</button>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="text-[12px] text-slate-500">{t("อัลบั้ม", "Album")}<div className="mt-0.5"><CollectionMultiSelect value={collectionIds} collections={cols} onChange={setCollectionIds} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
          <div className="text-[12px] text-slate-500">{t("แท็ก", "Tags")}<div className="mt-0.5"><TagPickerField value={tags} onChange={setTags} /></div></div>
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-slate-200/70">
          {driveOn && <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={autoFolder} onChange={(e) => setAutoFolder(e.target.checked)} className="w-4 h-4 accent-indigo-600" />{t("🗂️ สร้างโฟลเดอร์ Drive อัตโนมัติ", "🗂️ Auto-create Drive folder")}</label>}
          <span className="text-[11px] text-slate-400">{t("ย่อ preview:", "Shrink preview:")}</span>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {[{ w: 800, l: "800" }, { w: 1200, l: "1200" }, { w: 1600, l: "1600" }, { w: 0, l: t("จริง", "Full") }].map((o, i) => (
              <button key={o.w} type="button" onClick={() => setResizeW(o.w)} className={`h-7 px-2 text-[11px] ${i > 0 ? "border-l border-slate-200" : ""} ${resizeW === o.w ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500"}`}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* แถวรายงาน */}
      {rows.length === 0 ? <p className="text-[12px] text-slate-400 py-4 text-center">{t("ยังไม่มีรูป — ลากเข้ามาด้านบน", "No images yet — drag them in above")}</p> : (
        <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-start gap-2 mb-1.5">
                {r.preview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={r.preview} alt="" className="w-12 h-12 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" />
                  : <span className="text-2xl shrink-0">🖨</span>}
                <div className="flex-1 min-w-0 space-y-1">
                  <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder={t("ชื่องาน", "Job name")}
                    className="w-full h-8 px-2.5 text-[12px] border border-slate-200 rounded-lg" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 shrink-0">{t("ขนาด", "Size")}</span>
                    <div className="flex-1"><SizesEditor value={r.sizes} onChange={(v) => setRow(r.id, { sizes: v })} /></div>
                  </div>
                </div>
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="text-slate-400 hover:text-red-500 shrink-0" title={t("เอาออก", "Remove")}>✕</button>
              </div>
              <div className="pl-14">
                <PrintItemsField value={r.printItems} onChange={(v) => setRow(r.id, { printItems: v })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <AssetPicker open={massSharePickerOpen} onClose={() => setMassSharePickerOpen(false)} typeFilter="image" defaultSource="print" requireDriveFolder
        title={t("เลือกงานพิมพ์ที่มีโฟลเดอร์ Drive แล้ว", "Select a print job that already has a Drive folder")} contextLabel={t("ทุกงานในชุดนี้ลงโฟลเดอร์เดียวกับงานนี้", "All jobs in this batch into this job's folder")}
        onSelect={(assets) => { const s = assets[0]; if (s) { const m = (s.master_url ?? "").match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) setMassShared({ id: m[1], url: s.master_url ?? "", label: s.title || s.file_name }); } setMassSharePickerOpen(false); }} />
    </ERPModal>
  );
}
