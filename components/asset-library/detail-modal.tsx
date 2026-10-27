"use client";
// คลังไฟล์: ป๊อปรายละเอียดไฟล์ (ดู/แก้/ขนาด/ที่ใช้งาน/เลื่อนดูตัวถัดไป) — แยกจาก index.tsx (Y1)
import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ASSET_TYPE_LABEL, formatBytes } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { type AssetRow, type AssetDetail, type AssetSize, type PrintItem } from "@/app/api/assets/shared";
import { AssetPicker } from "@/components/asset-picker";
import { printPreviewProblem } from "@/lib/print-file-policy";
import { PrintFileSlot } from "./print-file-slot";
import { Spinner, LoadingOverlay } from "@/components/spinner";
import { DriveFolderFiles } from "@/components/drive-folder-files";
import { HelpButton } from "@/components/help-guides";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import { type LookupItem, isImage, TYPE_ICON, driveFolderNameOf, commonNameSeed, uploadArtworkToDrive, useArtworkPathRule, pathMatchesRule, useDriveFolderMaps, brandFolderPath } from "./asset-shared";
import { ArtTypeMultiSelect, PrintItemsField, SizesEditor, ParentSkuField, TagPickerField, Meta, UsageList } from "./asset-fields";

// ── รายละเอียดไฟล์ ──
export function DetailModal({ id, actor, collections, artTypes, onClose, onChanged, ids, onNavigate }: {
  id: string; actor: string | null; collections: AssetCollection[]; artTypes: LookupItem[]; onClose: () => void; onChanged: () => void;
  ids?: string[]; onNavigate?: (id: string) => void;
}) {
  // เลื่อนดูรูปก่อนหน้า/ถัดไป (ตามลำดับในกริด) โดยไม่ต้องปิด-เปิด
  const t = useT();
  const navIdx = ids ? ids.indexOf(id) : -1;
  const prevId = navIdx > 0 ? ids![navIdx - 1] : null;
  const nextId = ids && navIdx >= 0 && navIdx < ids.length - 1 ? ids![navIdx + 1] : null;
  const toast = useToast();
  const [d, setD] = useState<AssetDetail | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [masterPath, setMasterPath] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [artTypesSel, setArtTypesSel] = useState<string[]>([]);          // ชนิดหลายอัน (m2m)
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [sizes, setSizes] = useState<AssetSize[]>([]);
  const [parentCodes, setParentCodes] = useState<string[]>([]);
  const [rule] = useArtworkPathRule();
  const [saving, setSaving] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [alsoDrive, setAlsoDrive] = useState(false);   // ตอนลบ: ทิ้งโฟลเดอร์ Drive ด้วยไหม
  const [replacing, setReplacing] = useState(false);
  const [zoom, setZoom] = useState(false);   // กดรูป → ดูเต็มจอ
  const replaceRef = useRef<HTMLInputElement>(null);
  // เพิ่มไฟล์ต้นฉบับขึ้น Drive ย้อนหลัง (บางทีตอนสร้างลืมใส่) — สร้างโฟลเดอร์ + ก็อปรูป preview ให้
  const [driveOn, setDriveOn] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [srcFiles, setSrcFiles] = useState<File[]>([]);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveProg, setDriveProg] = useState({ done: 0, total: 0 });
  const srcInputRef = useRef<HTMLInputElement>(null);
  // โหมดปลายทาง Drive: สร้างโฟลเดอร์ใหม่ vs ใช้โฟลเดอร์เดียวกับรูปอื่น (ไม่อยากสร้างหลายโฟลเดอร์)
  const [driveMode, setDriveMode] = useState<"new" | "shared">("new");
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkConfirmSrc, setLinkConfirmSrc] = useState<AssetRow | null>(null);   // รูปต้นทางที่เลือก (รอ confirm)
  const [renameOpen, setRenameOpen] = useState(false);   // เปลี่ยนชื่อโฟลเดอร์ Drive (มีผลกับทุกรูปที่ใช้โฟลเดอร์นี้)
  const [driveFilesKey, setDriveFilesKey] = useState(0);   // bump = สั่งโหลดรายการไฟล์ในโฟลเดอร์ใหม่ (หลังอัปไฟล์ขึ้น Drive)
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);   // Artwork ในแผ่น + จำนวน (source='print')
  const { brandBase, typeSub } = useDriveFolderMaps();
  const [pathAuto, setPathAuto] = useState(true);   // path ต้นฉบับตามโฟลเดอร์อัตโนมัติ (พิมพ์แก้เอง = หยุด)

  const loadDetail = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/assets/${id}`); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const det = j.data as AssetDetail;
      setD(det); setTitle(det.title); setTags(det.tags ?? []); setCollectionIds(det.collection_ids ?? []);
      setMasterPath(det.master_path ?? ""); setMasterUrl(det.master_url ?? ""); setKeywords(det.keywords ?? "");
      setArtTypesSel(det.artwork_types?.length ? det.artwork_types : (det.artwork_type ? [det.artwork_type] : []));
      setSizes(det.sizes ?? []); setParentCodes(det.parent_sku_codes ?? []); setBrandId(det.brand_id ?? "");
      setPrintItems(det.print_items ?? []);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เปิดไฟล์ไม่สำเร็จ", "Failed to open file")); onClose(); }
  }, [id, toast, onClose]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);
  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  // รวมชนิดจาก prop เข้า list (เผื่อ lookup โหลดหลัง mount) โดยไม่ทับตัวที่เพิ่งเพิ่ม inline
  useEffect(() => { setArtTypeList((cur) => { const s = new Set(cur.map((t) => t.name)); return [...cur, ...artTypes.filter((t) => !s.has(t.name))]; }); }, [artTypes]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/assets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tags, collection_ids: collectionIds, master_path: masterPath, master_url: masterUrl, artwork_types: artTypesSel, keywords, sizes, parent_sku_codes: parentCodes, ...(d?.source === "print" ? { print_items: printItems } : {}) }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("บันทึกแล้ว", "Saved")); await loadDetail(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  const trash = async () => {
    setConfirmTrash(false);
    try {
      const res = await apiFetch(`/api/assets/${id}${alsoDrive ? "?drive=1" : ""}`, { method: "DELETE" });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ลบไม่สำเร็จ", "Delete failed"));
      toast.success(j.driveTrashed ? t("ย้ายลงถังขยะ + ทิ้งโฟลเดอร์ Drive แล้ว", "Moved to trash + Drive folder deleted") : t("ย้ายลงถังขยะแล้ว", "Moved to trash"));
      if (alsoDrive && !j.driveTrashed) toast.warning(t("ลบไฟล์ในคลังแล้ว แต่ทิ้งโฟลเดอร์ Drive ไม่สำเร็จ — ลองลบใน Drive เอง", "Deleted from library, but failed to trash the Drive folder — try deleting it in Drive yourself"));
      onChanged(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
  };

  const restore = async () => {
    try {
      const res = await apiFetch(`/api/assets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("กู้คืนแล้ว", "Restored")); onChanged(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("กู้คืนไม่สำเร็จ", "Restore failed")); }
  };

  const copyLink = () => {
    if (!d) return;
    navigator.clipboard?.writeText(window.location.origin + d.url).then(
      () => toast.success(t("คัดลอกลิงก์แล้ว", "Link copied")), () => toast.error(t("คัดลอกไม่สำเร็จ", "Copy failed")));
  };
  const copyPath = () => {
    if (!masterPath) return;
    navigator.clipboard?.writeText(masterPath).then(
      () => toast.success(t("คัดลอก path แล้ว — เปิด File Explorer แล้ววาง (Ctrl+V) ที่ช่องที่อยู่", "Path copied — open File Explorer and paste (Ctrl+V) into the address bar")),
      () => toast.error(t("คัดลอกไม่สำเร็จ", "Copy failed")));
  };
  // เปิดโฟลเดอร์ผ่าน custom protocol (ต้องติดตั้ง "ตัวเปิดโฟลเดอร์" ครั้งเดียว/เครื่อง) — ถ้ายังไม่ติดตั้งจะไม่เกิดอะไร ใช้ปุ่มคัดลอกแทน
  const openFolder = () => { if (masterPath) window.location.href = "erpfolder:" + encodeURIComponent(masterPath); };

  // แทนที่ไฟล์ — เขียนทับ key เดิม → ทุกที่ที่ใช้รูปนี้เห็นรูปใหม่ทันที
  const doReplace = async (file: File) => {
    // การ์ดงานพิมพ์: แทนที่ได้แค่รูปตัวอย่าง — PDF/EPS/AI ต้องไป Drive (lib/print-file-policy)
    const bad = d?.source === "print" ? printPreviewProblem(file.name, file.type) : null;
    if (bad) { toast.error(t(bad.th, bad.en)); return; }
    setReplacing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (actor) fd.append("actor", actor);
      if (file.type.startsWith("image/")) {
        const dim = await new Promise<{ w: number; h: number } | null>((res) => {
          const img = new Image(); const u = URL.createObjectURL(file);
          img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u); };
          img.onerror = () => { res(null); URL.revokeObjectURL(u); };
          img.src = u;
        });
        if (dim) { fd.append("width", String(dim.w)); fd.append("height", String(dim.h)); }
      }
      const res = await apiFetch(`/api/assets/${id}/replace`, { method: "POST", body: fd });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("แทนที่ไม่สำเร็จ", "Replace failed"));
      toast.success(t("แทนที่ไฟล์แล้ว", "File replaced")); await loadDetail(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แทนที่ไม่สำเร็จ", "Replace failed")); }
    finally { setReplacing(false); }
  };

  // สร้างโฟลเดอร์ Drive + ก็อปรูป preview (จาก R2 ไม่ลบของเดิม) + อัปไฟล์ต้นฉบับถ้ามี → เก็บลิงก์โฟลเดอร์ทันที
  // ใช้ได้ทั้งกรณีมีไฟล์ต้นฉบับ และกรณี "แค่สร้างโฟลเดอร์ + ดึง preview" (ไม่แนบไฟล์)
  const doDriveUpload = async () => {
    if (!brandId) { toast.error(t("เลือกแบรนด์ก่อน (ไว้จัดโฟลเดอร์)", "Select a brand first (to organize the folder)")); return; }
    if (!d) return;
    setDriveBusy(true);
    try {
      let previewFile: File | null = null;
      if (isImage(d)) {
        try { const r = await apiFetch(d.url); const blob = await r.blob(); previewFile = new File([blob], `${(title.trim() || d.file_name)}.png`, { type: blob.type || "image/png" }); } catch { /* ไม่มี preview ก็ยังสร้างโฟลเดอร์ได้ */ }
      }
      const { folderLink, largeCount } = await uploadArtworkToDrive({
        name: title.trim() || d.file_name, artworkType: artTypesSel[0], brandId, srcFiles, previewFile,
        onProgress: (done, total) => setDriveProg({ done, total }),
      });
      if (largeCount) toast.warning(`${t("ไฟล์ใหญ่", "Large file")} ${largeCount} ${t("ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์แล้วลากขึ้นเอง", "files weren't auto-uploaded (over 4MB) — open the folder and drag them up yourself")}`);
      if (folderLink) {
        setMasterUrl(folderLink);
        // path ต้นฉบับตามโฟลเดอร์ใหม่ (ถ้ายัง auto) = <ฐานแบรนด์>\<ซับชนิด>\<ชื่องาน>
        const newPath = pathAuto ? brandFolderPath(title.trim() || d.file_name, brandId, artTypesSel[0], brandBase, typeSub) : "";
        const patch: Record<string, unknown> = { master_url: folderLink };
        if (newPath) { patch.master_path = newPath; setMasterPath(newPath); }
        await apiFetch(`/api/assets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        toast.success(srcFiles.length ? t("อัปขึ้น Drive + เก็บลิงก์แล้ว", "Uploaded to Drive + link saved") : t("สร้างโฟลเดอร์ + ดึงรูป preview แล้ว", "Folder created + preview pulled")); setSrcFiles([]); setDriveFilesKey((k) => k + 1); await loadDetail(); onChanged();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : t("อัป Drive ไม่สำเร็จ", "Drive upload failed")); }
    finally { setDriveBusy(false); setDriveProg({ done: 0, total: 0 }); }
  };

  // ผูกไฟล์นี้เข้าโฟลเดอร์ Drive เดียวกับรูปที่เลือก (ไม่สร้างโฟลเดอร์ใหม่) + ก็อปรูป preview เข้าไปด้วย
  const linkToSharedFolder = async (src: AssetRow) => {
    if (!d) return;
    if (src.id === id) { toast.error(t("เลือกรูปอื่นที่ไม่ใช่รูปนี้", "Pick a different image, not this one")); return; }
    if (!/\/folders\//.test(src.master_url ?? "")) { toast.error(`${t("รูป", "Image")} “${src.title || src.file_name}” ${t("ยังไม่มีโฟลเดอร์ Drive — เลือกรูปที่มีโฟลเดอร์แล้ว", "has no Drive folder yet — pick an image that already has a folder")}`); return; }
    setLinkBusy(true);
    try {
      const res = await apiFetch("/api/assets/drive-folders/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, source_id: src.id, follow_path: pathAuto }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ผูกโฟลเดอร์ไม่สำเร็จ", "Failed to link folder"));
      if (j.folderLink) { setMasterUrl(j.folderLink); await loadDetail(); onChanged(); }   // path ตามโฟลเดอร์ (server เซ็ตให้เมื่อ follow_path) → loadDetail สะท้อน
      toast.success(`${t("ผูกโฟลเดอร์เดียวกับ", "Linked to the same folder as")} “${src.title || src.file_name}” ${t("แล้ว", "")}`);
      setLinkPickerOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ผูกโฟลเดอร์ไม่สำเร็จ", "Failed to link folder")); }
    finally { setLinkBusy(false); }
  };

  // เปลี่ยนชื่อโฟลเดอร์ Drive จริง + อัปเดต path ของ "ทุกรูปที่ใช้โฟลเดอร์นี้"
  const doRenameFolder = async () => {
    const nm = renameName.trim();
    if (!nm) { toast.error(t("ใส่ชื่อใหม่ก่อน", "Enter a new name first")); return; }
    setRenameBusy(true);
    try {
      const res = await apiFetch("/api/assets/drive-folders/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_url: masterUrl, new_name: nm }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("เปลี่ยนชื่อไม่สำเร็จ", "Rename failed"));
      toast.success(`${t("เปลี่ยนชื่อโฟลเดอร์เป็น", "Renamed folder to")} “${nm}” ${t("แล้ว · อัปเดต", "· updated")} ${j.count ?? 1} ${t("รูปที่ใช้โฟลเดอร์นี้", "images using this folder")}`);
      setRenameOpen(false); await loadDetail(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เปลี่ยนชื่อไม่สำเร็จ", "Rename failed")); }
    finally { setRenameBusy(false); }
  };

  const trashed = d?.status === "trashed";
  const pathWarn = !trashed && !!masterPath.trim() && !pathMatchesRule(masterPath, rule.base_paths);

  return (
    <ERPModal open onClose={onClose} title={d?.file_name ?? t("รายละเอียดไฟล์", "File details")} size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex gap-2">
            {d && <a href={d.url} target="_blank" rel="noreferrer" className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center">{t("⬇ ดาวน์โหลด", "⬇ Download")}</a>}
            <button onClick={copyLink} className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("🔗 คัดลอกลิงก์", "🔗 Copy link")}</button>
            {!trashed && (
              <button onClick={() => replaceRef.current?.click()} disabled={replacing}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                {replacing ? t("กำลังแทนที่…", "Replacing…") : t("🔄 แทนที่ไฟล์", "🔄 Replace file")}</button>
            )}
            <input ref={replaceRef} type="file" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void doReplace(f); e.currentTarget.value = ""; }} />
          </div>
          <div className="flex gap-2">
            {trashed
              ? <button onClick={restore} className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{t("♻ กู้คืน", "♻ Restore")}</button>
              : <button onClick={() => { setAlsoDrive(false); setConfirmTrash(true); }} className="h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">{t("🗑️ ลบ", "🗑️ Delete")}</button>}
            {!trashed && <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? t("บันทึก…", "Saving…") : t("บันทึก", "Save")}</button>}
          </div>
        </div>
      }>
      {/* ปุ่มเลื่อนดูรูปก่อนหน้า/ถัดไป (ลอยข้างจอ) */}
      {onNavigate && prevId && (
        <button onClick={() => onNavigate(prevId)} title={t("รูปก่อนหน้า", "Previous image")}
          className="fixed left-3 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 text-2xl leading-none flex items-center justify-center hover:bg-slate-50">‹</button>
      )}
      {onNavigate && nextId && (
        <button onClick={() => onNavigate(nextId)} title={t("รูปถัดไป", "Next image")}
          className="fixed right-3 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 text-2xl leading-none flex items-center justify-center hover:bg-slate-50">›</button>
      )}
      {(driveBusy || linkBusy) && <LoadingOverlay message={linkBusy ? t("กำลังผูกโฟลเดอร์ + ก็อปรูป…", "Linking folder + copying images…") : t("กำลังทำงานกับ Drive… อาจใช้เวลาสักครู่", "Working with Drive… this may take a moment")} />}
      {!d ? (
        <div className="py-12 text-center text-slate-400 text-sm">{t("กำลังโหลด…", "Loading…")}</div>
      ) : (
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] bg-slate-100 rounded-xl flex items-center justify-center min-h-[240px] overflow-hidden">
            {isImage(d) ? (
              <button type="button" onClick={() => setZoom(true)} title={t("กดเพื่อดูรูปใหญ่", "Click to view larger")}
                className="group relative w-full h-full min-h-[240px] flex items-center justify-center cursor-zoom-in">
                <img src={withImageWidth(d.url, 768) ?? d.url} alt={d.title} className="max-w-full max-h-[360px] object-contain" />
                <span className="absolute bottom-2 right-2 text-[11px] px-2 py-0.5 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">{t("🔍 ดูรูปใหญ่", "🔍 View larger")}</span>
              </button>
            ) : d.asset_type === "video" ? (
              <video src={d.url} controls playsInline preload="metadata" className="max-w-full max-h-[360px] rounded-lg bg-black" />
            ) : <div className="text-center"><div className="text-5xl">{TYPE_ICON[d.asset_type]}</div><p className="text-[11px] text-slate-400 mt-2">{(d.ext ?? "").toUpperCase()}</p></div>}
          </div>

          <div className="flex-1 min-w-[240px]">
            <label className="text-[12px] text-slate-500">{t("ชื่อไฟล์", "File name")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={trashed}
                className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
            </label>

            {d.source === "artwork" && (
              <div className="block text-[12px] text-slate-500 mt-2">{t("ชนิด artwork", "Artwork type")} <span className="text-[10px] text-slate-400">{t("— เลือกได้หลายอัน", "— multiple allowed")}</span>
                <div className="mt-1"><ArtTypeMultiSelect value={artTypesSel} types={artTypeList} onChange={setArtTypesSel} onCreated={(t) => setArtTypeList((c) => [...c, t])} disabled={trashed} /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="text-[12px] text-slate-500">{t("อัลบั้ม", "Album")} <span className="text-[10px] text-slate-400">{t("(เลือกได้หลายอัน)", "(multiple allowed)")}</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {collections.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่มีอัลบั้ม", "No albums yet")}</span>}
                  {collections.map((c) => {
                    const on = collectionIds.includes(c.id);
                    return (
                      <button key={c.id} type="button" disabled={trashed}
                        onClick={() => setCollectionIds((s) => on ? s.filter((x) => x !== c.id) : [...s, c.id])}
                        className={`text-[11px] px-2.5 py-1 rounded-full border disabled:opacity-50 ${on
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
                        {on ? "✓ " : ""}{c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-[12px] text-slate-500">{t("แท็ก", "Tags")}
                <div className="mt-1">{trashed ? <span className="text-[11px] text-slate-400">{tags.join(", ") || "—"}</span> : <TagPickerField value={tags} onChange={setTags} />}</div>
              </div>
            </div>

            <label className="block text-[12px] text-slate-500 mt-3">{t("คำค้นเพิ่มเติม (keyword)", "Extra keywords")}
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={trashed}
                placeholder={t("คำพ้อง/ชื่ออื่น เช่น flower ดอกไม้ summer", "synonyms/other names e.g. flower summer")}
                className="mt-1 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" /></label>

            {(d.source === "artwork" || d.source === "print") && (
              <>
                <div className="mt-3"><p className="text-[12px] font-medium text-slate-600 mb-1">📐 {d.source === "print" ? t("ขนาดแผ่น", "Sheet size") : t("ขนาด (กว้าง × สูง)", "Size (W × H)")}</p><SizesEditor value={sizes} onChange={setSizes} disabled={trashed} /></div>
                {/* งานพิมพ์: Artwork ในแผ่น + จำนวน (แก้แล้วกด "บันทึก") */}
                {d.source === "print" && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <PrintItemsField value={printItems} onChange={setPrintItems} disabled={trashed} />
                  </div>
                )}
                <div className="mt-3"><p className="text-[12px] font-medium text-slate-600 mb-1">{t("📦 Parent SKU ที่ใช้", "📦 Parent SKUs used")}</p><ParentSkuField value={parentCodes} onChange={setParentCodes} disabled={trashed} /></div>
                {/* ไฟล์พิมพ์ PNG ตัวจริง (ไฟล์เดียวกับที่หน้าจัดเรียงใช้) — เฉพาะลาย */}
                {d.source === "artwork" && <PrintFileSlot key={d.id} assetId={d.id} previewUrl={d.url} readOnly={trashed} />}
              </>
            )}

            <table className="w-full text-[12px] mt-3">
              <tbody>
                <Meta label={t("ชนิด", "Type")} value={ASSET_TYPE_LABEL[d.asset_type]} />
                <Meta label={t("ขนาด", "Size")} value={formatBytes(d.size_bytes)} />
                {d.width && d.height ? <Meta label={t("ความละเอียด", "Resolution")} value={`${d.width} × ${d.height}`} /> : null}
                <Meta label={t("ผู้อัป", "Uploaded by")} value={d.uploaded_by ?? "—"} />
                <Meta label={t("วันที่อัป", "Uploaded at")} value={new Date(d.created_at).toLocaleString("th-TH")} />
              </tbody>
            </table>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("📁 ไฟล์ต้นฉบับ", "📁 Source file")} <span className="text-[10px] text-slate-400 font-normal">{t("— คลังเก็บแค่ “ที่อยู่/ลิงก์” ไม่ได้เก็บไฟล์ใหญ่ (อยู่ NAS หรือ Drive ก็ได้)", "— the library only stores the “location/link”, not the large file (it can live on NAS or Drive)")}</span></p>
              <input value={masterPath} onChange={(e) => { setMasterPath(e.target.value); setPathAuto(false); }} disabled={trashed}
                placeholder={t("\\\\nas\\Artwork\\PIX\\PIX32-02_v3.ai  หรือ  Z:\\Artwork\\…", "\\\\nas\\Artwork\\PIX\\PIX32-02_v3.ai  or  Z:\\Artwork\\…")}
                className={`w-full h-8 px-2 text-[12px] border rounded-lg font-mono disabled:bg-slate-50 ${pathWarn ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`} />
              {pathWarn && <p className="text-[11px] text-amber-600 mt-1">{t("⚠ ไม่ได้อยู่ในโฟลเดอร์มาตรฐาน — ควรเก็บใต้", "⚠ Not under a standard folder — should be stored under")} <b className="font-mono">{rule.base_paths.join(t(" หรือ ", " or "))}</b></p>}
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <button onClick={copyPath} disabled={!masterPath} className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">{t("📋 คัดลอก path", "📋 Copy path")}</button>
                <button onClick={openFolder} disabled={!masterPath} className="h-7 px-2.5 text-[11px] border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 disabled:opacity-40">{t("📂 เปิดโฟลเดอร์", "📂 Open folder")}</button>
                {masterUrl && <a href={masterUrl} target="_blank" rel="noreferrer" className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 flex items-center">{t("🌐 เปิดต้นฉบับ", "🌐 Open source")}</a>}
                {!trashed && /\/folders\//.test(masterUrl) && (
                  <button onClick={() => { setRenameName(driveFolderNameOf({ master_path: masterPath, title: d?.title, file_name: d?.file_name })); setRenameOpen(true); }}
                    className="h-7 px-2.5 text-[11px] border border-amber-200 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100">{t("✏️ เปลี่ยนชื่อโฟลเดอร์", "✏️ Rename folder")}</button>
                )}
              </div>
              <input value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} disabled={trashed}
                placeholder={t("ลิงก์ Google Drive / Synology (เปิดได้ทุกที่) — ไม่ใส่ก็ได้", "Google Drive / Synology link (opens anywhere) — optional")}
                className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded-lg mt-1.5 disabled:bg-slate-50" />

              {/* ในโฟลเดอร์นี้มีไฟล์อะไรบ้าง (ของกลาง) — โหลดเองแบบไม่บล็อก + ปุ่มเปิดทีละไฟล์ใน Drive */}
              {/\/folders\//.test(masterUrl) && <DriveFolderFiles folder={masterUrl} reloadKey={driveFilesKey} />}

              {/* เพิ่มไฟล์ต้นฉบับขึ้น Drive ย้อนหลัง (ลืมใส่ตอนสร้าง) → สร้างโฟลเดอร์ใหม่ หรือ ใช้โฟลเดอร์เดียวกับรูปอื่น */}
              {driveOn && !trashed && (
                <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200">
                  <p className="text-[12px] font-medium text-slate-600 mb-1.5 flex items-center justify-between">{t("📤 ไฟล์ต้นฉบับบน Drive", "📤 Source files on Drive")} <HelpButton guideKey="drive-link" /></p>
                  {/* เลือกปลายทาง: โฟลเดอร์ใหม่ vs ใช้โฟลเดอร์เดียวกับรูปอื่น (ไม่อยากสร้างหลายโฟลเดอร์) */}
                  <div className="flex gap-1 mb-2 p-0.5 bg-slate-100 rounded-lg">
                    <button type="button" onClick={() => setDriveMode("new")}
                      className={`flex-1 h-7 text-[11px] font-medium rounded-md transition ${driveMode === "new" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("🆕 โฟลเดอร์ใหม่", "🆕 New folder")}</button>
                    <button type="button" onClick={() => setDriveMode("shared")}
                      className={`flex-1 h-7 text-[11px] font-medium rounded-md transition ${driveMode === "shared" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("📎 ใช้โฟลเดอร์เดียวกับรูปอื่น", "📎 Use another image's folder")}</button>
                  </div>

                  {driveMode === "new" ? (
                    <>
                      <p className="text-[10px] text-slate-400 mb-1.5">{t("สร้างโฟลเดอร์ใหม่ + ก็อปรูปตัวอย่างให้อัตโนมัติ", "Create a new folder + auto-copy the preview image")}</p>
                      <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
                        className={`w-full h-8 px-2 text-[12px] border rounded-lg bg-white mb-1.5 ${brandId ? "border-slate-200" : "border-amber-300"}`}>
                        <option value="">{t("— เลือกแบรนด์ (ไว้จัดโฟลเดอร์) —", "— Select brand (to organize the folder) —")}</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <div onClick={() => srcInputRef.current?.click()}
                        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]); }}
                        onDragOver={(e) => e.preventDefault()}
                        className="border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-center text-[12px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
                        {t("+ ลากไฟล์ AI/PSD/PDF มาวาง หรือคลิกเลือก", "+ Drag AI/PSD/PDF files here or click to choose")}
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
                        </div>
                      )}
                      {/* ปุ่มโชว์เสมอ: มีไฟล์ = อัป+สร้างโฟลเดอร์+ดึง preview · ไม่มีไฟล์ = แค่สร้างโฟลเดอร์ + ดึง preview */}
                      <button type="button" onClick={doDriveUpload} disabled={driveBusy || !brandId}
                        className="w-full h-8 mt-1.5 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {driveBusy && <Spinner size={13} />}
                        {driveBusy ? (driveProg.total ? `${t("กำลังอัป", "Uploading")} ${driveProg.done}/${driveProg.total}…` : t("กำลังทำ…", "Working…"))
                          : srcFiles.length > 0 ? t("⬆ อัปขึ้น Drive + เก็บลิงก์", "⬆ Upload to Drive + save link") : t("📁 สร้างโฟลเดอร์ + ดึงรูป preview", "📁 Create folder + pull preview")}
                      </button>
                      {!srcFiles.length && <p className="text-[11px] text-slate-400 mt-1">{t("ยังไม่แนบไฟล์ต้นฉบับก็กดได้ — จะสร้างโฟลเดอร์ Drive + ก็อปรูปตัวอย่างเข้าไปให้ แล้วค่อยลากไฟล์ .ai เข้าเองทีหลัง", "You can click even without attaching source files — it will create a Drive folder + copy the preview in, then you can drag the .ai file in later")}</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-slate-400 mb-1.5">{t("เลือกรูปที่มีโฟลเดอร์อยู่แล้ว → ผูกรูปนี้เข้าโฟลเดอร์เดียวกัน + ก็อปรูปตัวอย่างของรูปนี้เข้าไปด้วย (ไม่สร้างโฟลเดอร์ใหม่)", "Pick an image that already has a folder → link this image into the same folder + copy this image's preview in (no new folder created)")}</p>
                      <button type="button" onClick={() => setLinkPickerOpen(true)} disabled={linkBusy}
                        className="w-full h-8 text-[12px] font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {linkBusy && <Spinner size={13} />}{linkBusy ? t("กำลังผูกโฟลเดอร์…", "Linking folder…") : t("📎 เลือกรูปที่มีโฟลเดอร์แล้ว", "📎 Pick an image that has a folder")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <UsageList usages={d.usages} />
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmTrash} onClose={() => setConfirmTrash(false)} onConfirm={trash}
        title={t("ย้ายไฟล์ลงถังขยะ?", "Move file to trash?")} confirmText={t("ย้ายลงถังขยะ", "Move to trash")} variant="danger"
        message={
          <div>
            <p>{t("ไฟล์นี้จะถูกย้ายลงถังขยะ — กู้คืนได้ภายใน 30 วัน", "This file will be moved to trash — recoverable within 30 days")}</p>
            {/\/folders\//.test(masterUrl) && (
              <label className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 cursor-pointer">
                <input type="checkbox" checked={alsoDrive} onChange={(e) => setAlsoDrive(e.target.checked)} className="mt-0.5 shrink-0" />
                <span className="text-[12px] text-rose-700">
                  <b>{t("ลบโฟลเดอร์ใน Google Drive ด้วย", "Also delete the folder in Google Drive")}</b>
                  <span className="block text-[11px] text-rose-600 mt-0.5">{t("โฟลเดอร์ + ไฟล์ต้นฉบับข้างในจะถูกย้ายไป “ถังขยะของ Drive” (ยังกู้คืนได้ในถังขยะ Drive ~30 วัน)", "The folder + source files inside will be moved to “Drive trash” (still recoverable in Drive trash for ~30 days)")}</span>
                </span>
              </label>
            )}
          </div>
        } />

      {zoom && d && isImage(d) && (
        <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-6" onClick={() => setZoom(false)}>
          <img src={d.url} alt={d.title} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setZoom(false)} title={t("ปิด", "Close")}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-slate-700 text-lg flex items-center justify-center hover:bg-white">✕</button>
        </div>
      )}

      {/* เลือกรูปต้นทางเพื่อผูกโฟลเดอร์เดียวกัน (โหมด 📎 ใช้โฟลเดอร์เดียวกับรูปอื่น) */}
      <AssetPicker open={linkPickerOpen} onClose={() => setLinkPickerOpen(false)} typeFilter="image" defaultSource={d?.source === "print" ? "print" : "artwork"} requireDriveFolder
        defaultSearch={commonNameSeed([d?.title ?? title])}
        title={d?.source === "print" ? t("เลือกงานพิมพ์ที่มีโฟลเดอร์ Drive แล้ว", "Select a print job that already has a Drive folder") : t("เลือกรูปที่มีโฟลเดอร์ Drive แล้ว", "Select an image that already has a Drive folder")} contextLabel={t("ผูกโฟลเดอร์เดียวกับงานนี้", "Link to the same folder as this item")}
        onSelect={(assets) => { const s = assets[0]; if (s) { setLinkPickerOpen(false); setLinkConfirmSrc(s); } }} />
      {/* เปลี่ยนชื่อโฟลเดอร์ Drive — มีผลกับทุกรูปที่ใช้โฟลเดอร์นี้ */}
      <ConfirmDialog open={renameOpen} onClose={() => setRenameOpen(false)} onConfirm={doRenameFolder}
        title={t("เปลี่ยนชื่อโฟลเดอร์ต้นฉบับ", "Rename source folder")} confirmText={renameBusy ? t("กำลังเปลี่ยน…", "Renaming…") : t("เปลี่ยนชื่อ", "Rename")} loading={renameBusy}
        message={
          <div>
            <p className="mb-2">{t("เปลี่ยนชื่อโฟลเดอร์ใน Google Drive จริง — และอัปเดต path ให้", "Rename the actual folder in Google Drive — and update the path for")}<b>{t("ทุกรูปที่ใช้โฟลเดอร์นี้", "all images using this folder")}</b>{t("ด้วย", " too")}</p>
            <input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !renameBusy) void doRenameFolder(); }}
              placeholder={t("ชื่อโฟลเดอร์ใหม่", "New folder name")}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-[11px] text-slate-400 mt-1.5">{t("ไฟล์ข้างในไม่ถูกแตะ · ชื่อรูปในคลังไม่เปลี่ยน (เปลี่ยนแค่ชื่อโฟลเดอร์)", "Files inside are untouched · image names in the library don't change (only the folder name changes)")}</p>
          </div>
        } />

      {/* ยืนยันก่อนผูก — โชว์ชื่อโฟลเดอร์ปลายทาง */}
      <ConfirmDialog open={!!linkConfirmSrc} onClose={() => setLinkConfirmSrc(null)}
        onConfirm={() => { const s = linkConfirmSrc; setLinkConfirmSrc(null); if (s) void linkToSharedFolder(s); }}
        title={t("ผูกเข้าโฟลเดอร์นี้?", "Link into this folder?")} confirmText={t("ผูกโฟลเดอร์", "Link folder")}
        message={linkConfirmSrc ? `${t("จะผูกรูปนี้เข้าโฟลเดอร์", "Will link this image into folder")} “${driveFolderNameOf(linkConfirmSrc)}” (${t("เดียวกับ", "same as")} “${linkConfirmSrc.title || linkConfirmSrc.file_name}”) + ${t("ก็อปรูปตัวอย่างเข้าไปด้วย", "and copy the preview in too")}` : ""} />
    </ERPModal>
  );
}
