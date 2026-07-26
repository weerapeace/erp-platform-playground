"use client";

/**
 * AssetLibrary — ของกลางคลังไฟล์กลาง (DAM)
 *
 * กริดรูป + ค้นหา + ฟิลเตอร์ชนิด + อัลบั้ม + แท็ก + อัปโหลด(ลากวาง) + รายละเอียด + ถังขยะ
 * "อัปครั้งเดียว ใช้ได้ทุกที่" — ภายหลังมี AssetPicker หยิบไฟล์จากคลังนี้ไปใช้ในโมดูลอื่น
 *
 * ใช้ของกลาง: apiFetch · useToast · ERPModal · ConfirmDialog · R2 (ผ่าน /api/assets)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { HelpTabsButton } from "@/components/help-tabs";
import { StorageCard } from "./storage-card";
import { HelpGuideInline } from "@/components/help-guides";
import { useAuth } from "@/components/auth";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ASSET_TYPE_LABEL, formatBytes, type AssetType } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { downscaleImageWidth } from "@/lib/image-resize";
import { downloadImagesAsZip } from "@/lib/zip";
import { type AssetRow, type AssetDetail, type AssetUsage, type AssetSize, type PrintItem } from "@/app/api/assets/shared";
import { BrandAlbumBrowser } from "./brand-album";
import { AssetPicker } from "@/components/asset-picker";
import { Pager } from "@/components/pager";
import { Spinner, LoadingOverlay } from "@/components/spinner";
import { HoverPreview } from "@/components/hover-image";
import { ParentSkuMultiPickerModal } from "@/components/parent-sku-multi-picker";
import { DriveFolderFiles } from "@/components/drive-folder-files";
import { HelpButton } from "@/components/help-guides";
import { runBackgroundTask } from "@/lib/background-tasks";
import { useRefresh, triggerRefresh } from "@/lib/refresh-bus";
import type { PrintType } from "@/app/api/print-types/route";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import type { AssetTag } from "@/app/api/assets/tags/route";

const TYPE_ICON: Record<AssetType, string> = { image: "🖼️", design: "🎨", document: "📄", video: "🎬", other: "📦" };
const TYPE_FILTERS: { key: string; label: string; en: string }[] = [
  { key: "", label: "ทั้งหมด", en: "All" },
  { key: "image", label: "🖼️ รูปภาพ", en: "🖼️ Images" },
  { key: "design", label: "🎨 ไฟล์ออกแบบ", en: "🎨 Design files" },
  { key: "document", label: "📄 เอกสาร", en: "📄 Documents" },
  { key: "video", label: "🎬 วิดีโอ", en: "🎬 Videos" },
];

type LookupItem = { id: string; name: string };   // ชนิด artwork จาก lookup กลาง (erp_lookups type=artwork_type)

const isImage = (a: { asset_type: AssetType }) => a.asset_type === "image";

export function AssetLibrary() {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const [actor, setActor] = useState<string | null>(null);

  const [rows, setRows] = useState<AssetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);   // หน้าปัจจุบัน (0-based)
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 60;

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<{ id: string; label: string } | null>(null);   // ดูรูปในโฟลเดอร์ Drive เดียวกัน
  const [type, setType] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null); // null=ทั้งหมด, "none"=ไม่อยู่อัลบั้ม
  const [tag, setTag] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);
  const [source, setSource] = useState("upload");   // upload = อัปเอง · artwork · print (งานพิมพ์) · odoo_product
  const [artworkType, setArtworkType] = useState("");   // ฟิลเตอร์ชนิด artwork
  const [artTypes, setArtTypes] = useState<LookupItem[]>([]);   // รายการชนิด (lookup)
  const [printType, setPrintType] = useState("");   // ฟิลเตอร์ประเภทงานพิมพ์ (DTF/UV)
  const [printTypes, setPrintTypes] = useState<PrintType[]>([]);   // ประเภทงานพิมพ์ (ตั้งค่าเองได้)
  const [printAddOpen, setPrintAddOpen] = useState(false);
  const [massPrintOpen, setMassPrintOpen] = useState(false);   // เพิ่มงานพิมพ์หลายงาน (ตาราง)
  const [managePrintOpen, setManagePrintOpen] = useState(false);

  const [collections, setCollections] = useState<AssetCollection[]>([]);
  const [tags, setTags] = useState<AssetTag[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newColOpen, setNewColOpen] = useState(false);
  const [artworkAddOpen, setArtworkAddOpen] = useState(false);
  const [massOpen, setMassOpen] = useState(false);   // โหมด MASS: เพิ่ม Artwork หลายรายการแบบตาราง inline
  const [pendingFile, setPendingFile] = useState<File | null>(null);    // ลาก 1 รูปมาวาง → เปิด Artwork พร้อมรูป
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null); // ลากหลายรูป → เปิดเพิ่มหลายรูป
  const [pendingTargetFolder, setPendingTargetFolder] = useState<{ id: string; url: string; label: string } | null>(null); // ลากเข้ามุมมองโฟลเดอร์ → เพิ่มเข้าโฟลเดอร์นั้น
  const [pageDrag, setPageDrag] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [driveScanOpen, setDriveScanOpen] = useState(false);   // หาโฟลเดอร์ Drive ที่ยังไม่เชื่อม
  const [folderScan, setFolderScan] = useState<{ folderId: string; folderName: string; folderLink: string } | null>(null);   // หารูปยังไม่ลง เฉพาะโฟลเดอร์ที่กำลังดู
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);   // เลือกรูปต้นทางเพื่อผูกโฟลเดอร์เดียวกัน (bulk)
  const [bulkLinkBusy, setBulkLinkBusy] = useState(false);
  const [linkSource, setLinkSource] = useState<AssetRow | null>(null);   // รูปต้นทางที่เลือก (รอ confirm)
  const [linkConfirmOpen, setLinkConfirmOpen] = useState(false);
  const [brandReload, setBrandReload] = useState(0);   // bump เพื่อรีเฟรชมุมมอง "ดูตามแบรนด์"
  const [driveOn, setDriveOn] = useState(false);
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);   // สร้างโฟลเดอร์ Drive (แยก/รวม) หลายรูป
  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  const [searchFolders, setSearchFolders] = useState<{ id: string; code: string; name: string }[]>([]);   // โฟลเดอร์ Parent ที่ตรงคำค้น
  const [brandOpenParent, setBrandOpenParent] = useState<string | null>(null);   // กดโฟลเดอร์จากผลค้นหา → เปิด parent ในมุมมองแบรนด์
  const searching = search.trim().length > 0 && !folderFilter;
  const byBrand = source === "by-brand";
  const showBrandView = byBrand && !searching && !folderFilter;   // ค้นหา/ดูโฟลเดอร์ = ใช้กริดปกติ

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => setActor(data.user?.email ?? null)).catch(() => {});
  }, []);

  // ── โหลดรายการไฟล์ ──
  const load = useCallback(async () => {
    // โหมดดูรูปในโฟลเดอร์ Drive เดียวกัน — ข้ามฟิลเตอร์อื่น
    if (folderFilter) {
      setLoading(true);
      try {
        const p = new URLSearchParams({ status: "active", source: "all", folder: folderFilter.id, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
        const res = await apiFetch(`/api/assets?${p.toString()}`); const j = await res.json();
        if (j.error) throw new Error(j.error);
        setRows(j.data ?? []); setTotal(j.total ?? 0);
      } catch (e) { toast.error(e instanceof Error ? e.message : t("โหลดคลังไม่สำเร็จ", "Failed to load the library")); }
      finally { setLoading(false); }
      return;
    }
    const isSearch = search.trim().length > 0;
    // มุมมองแบรนด์: ถ้าไม่ได้ค้นหา ปล่อยให้ BrandAlbumBrowser จัดการ (API แยก)
    if (source === "by-brand" && !isSearch) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (isSearch) p.set("search", search.trim());
      if (type) p.set("type", type);
      if (!isSearch && collectionId) p.set("collection_id", collectionId);
      if (!isSearch && tag) p.set("tag", tag);
      p.set("status", trash ? "trashed" : "active");
      // ค้นหา = หาทั้งหมดทุกที่มา (อัปเอง/Artwork/รูปสินค้า) ไม่ต้องเลือกเมนูซ้าย · ไม่ค้นหา = ตามที่มาที่เลือก
      p.set("source", isSearch ? "all" : source);
      if (!isSearch && artworkType) p.set("artwork_type", artworkType);
      if (!isSearch && printType) p.set("print_type", printType);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(page * PAGE_SIZE));
      const res = await apiFetch(`/api/assets?${p.toString()}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setRows(j.data ?? []);
      setTotal(j.total ?? 0);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("โหลดคลังไม่สำเร็จ", "Failed to load the library")); }
    finally { setLoading(false); }
  }, [search, type, collectionId, tag, trash, source, artworkType, printType, folderFilter, page, toast]);

  const loadMeta = useCallback(async () => {
    try {
      const [c, t, a] = await Promise.all([
        apiFetch("/api/assets/collections"), apiFetch("/api/assets/tags"), apiFetch(`/api/lookups?type=artwork_type&_=${Date.now()}`),
      ]);
      setCollections((await c.json()).data ?? []);
      setTags((await t.json()).data ?? []);
      setArtTypes(((await a.json()).data ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
    } catch { /* ignore */ }
    // ประเภทงานพิมพ์ (ตั้งค่าเองได้) — โหลดแยก ไม่ให้พังทั้งก้อนถ้า API ยังไม่พร้อม
    try { setPrintTypes(((await (await apiFetch("/api/print-types")).json()).data ?? []) as PrintType[]); } catch { /* ignore */ }
  }, []);

  useEffect(() => { const t = setTimeout(() => { void load(); }, 250); return () => clearTimeout(t); }, [load]);   // debounce กันยิงทุกคีย์
  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useRefresh(() => { void load(); void loadMeta(); });   // งานเบื้องหลัง (เพิ่ม Artwork หลายรูป) เสร็จ → รีเฟรชลิสต์
  useEffect(() => { setSelected(new Set()); }, [type, collectionId, tag, trash, source]);
  useEffect(() => { setArtworkType(""); setPrintType(""); }, [source]);   // เปลี่ยนหมวด → ล้างฟิลเตอร์ชนิด
  useEffect(() => { setPage(0); }, [search, type, collectionId, tag, trash, source, artworkType, printType, folderFilter]);   // เปลี่ยนฟิลเตอร์/ค้นหา → กลับหน้าแรก
  useEffect(() => { setFolderFilter(null); }, [search, type, collectionId, tag, trash, source, artworkType, printType]);   // ยุ่งกับฟิลเตอร์อื่น = ออกจากโหมดดูโฟลเดอร์
  const goPage = (p: number) => { setPage(p); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  // อยู่หน้าที่เกินช่วง (เช่นลบจนเหลือน้อย) → เด้งกลับหน้าสุดท้ายที่มีจริง
  useEffect(() => { if (!loading && page > 0 && rows.length === 0 && total > 0) setPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)); }, [loading, page, rows.length, total]);

  // ค้นหา → หาโฟลเดอร์สินค้า (Parent SKU) ที่ตรงคำค้นด้วย (กดแล้วกระโดดเข้ามุมมองแบรนด์)
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchFolders([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      apiFetch(`/api/sku-browser?entity=parent-skus&search=${encodeURIComponent(q)}&limit=12`).then((r) => r.json())
        .then((j) => { if (alive) setSearchFolders(((j.cards ?? []) as { id: string; code: string; name: string }[]).map((c) => ({ id: c.id, code: c.code, name: c.name }))); })
        .catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [search]);
  const openFolder = (parentId: string) => { setBrandOpenParent(parentId); setSearch(""); setSource("by-brand"); };

  // ดาวน์โหลดรูปในผลค้นหา (เฉพาะที่เป็นรูปภาพ) เป็นไฟล์ zip
  const [zipBusy, setZipBusy] = useState(false);
  const [zipMsg, setZipMsg] = useState("");
  const downloadSearchZip = async () => {
    if (zipBusy) return;
    const clean = (t: string) => (t || "").replace(/[\\/:*?"<>|]+/g, "_").trim();
    const guessExt = (t: string) => (/\.[a-z0-9]{2,5}$/i.test(t || "") ? "" : ".jpg");
    const imgs = rows.filter((r) => isImage(r)).map((r, i) => ({ url: r.url, name: `${String(i + 1).padStart(2, "0")}_${clean(r.title) || "image"}${guessExt(r.title)}` }));
    if (imgs.length === 0) { toast.error(t("ไม่มีรูปในผลค้นหานี้", "No images in these results")); return; }
    setZipBusy(true); setZipMsg("");
    try {
      const n = await downloadImagesAsZip(imgs, `${t("ค้นหา", "search")}-${search.trim() || t("รูป", "images")}`,
        (done, total) => setZipMsg(total ? `${t("กำลังโหลดรูป", "Loading images")} ${Math.min(done + 1, total)}/${total}…` : t("กำลังบีบไฟล์…", "Compressing…")));
      if (n > 0) toast.success(`${t("ดาวน์โหลด", "Downloaded")} ${n} ${t("รูปเป็น zip แล้ว", "images as zip")}`);
      else toast.error(t("ดาวน์โหลดรูปไม่สำเร็จ", "Failed to download images"));
    } catch { toast.error(t("ดาวน์โหลดไม่สำเร็จ", "Download failed")); }
    finally { setZipBusy(false); setZipMsg(""); }
  };

  // ── เลือกไฟล์ ──
  const toggleSel = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => setSelected(new Set());

  // ── ลบที่เลือก (→ ถังขยะ) ──
  const bulkTrash = async () => {
    setBulkTrashOpen(false);
    let ok = 0, blocked = 0;
    for (const id of selected) {
      try {
        const res = await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
        if (res.ok) ok++; else blocked++;
      } catch { blocked++; }
    }
    clearSel();
    await load(); await loadMeta();
    if (blocked) toast.error(`${t("ลบ", "Deleted")} ${ok} ${t("ไฟล์ · ข้าม", "files · skipped")} ${blocked} ${t("ไฟล์ (ยังถูกใช้อยู่)", "files (still in use)")}`);
    else toast.success(`${t("ย้าย", "Moved")} ${ok} ${t("ไฟล์ลงถังขยะแล้ว", "files to trash")}`);
  };

  // ── ติดแท็ก / ย้ายอัลบั้ม หลายไฟล์พร้อมกัน ──
  const bulkApi = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(okMsg); clearSel(); await load(); await loadMeta();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ทำรายการไม่สำเร็จ", "Action failed")); }
  };
  const bulkTag = (tag: string) => { setBulkTagOpen(false); void bulkApi({ action: "tag", asset_ids: Array.from(selected), tag }, `${t("ติดแท็ก", "Tagged")} “${tag}” ${t("ให้", "on")} ${selected.size} ${t("ไฟล์แล้ว", "files")}`); };
  const bulkMove = (collectionId: string) => { setBulkMoveOpen(false); void bulkApi({ action: "move", asset_ids: Array.from(selected), collection_id: collectionId || null }, `${t("อัปเดตอัลบั้ม", "Updated album for")} ${selected.size} ${t("ไฟล์แล้ว", "files")}`); };

  const selCount = selected.size;

  const anyModalOpen = artworkAddOpen || massOpen || uploadOpen || bulkTrashOpen || bulkTagOpen || bulkMoveOpen || bulkEditOpen || bulkLinkOpen || bulkFolderOpen || manageTypesOpen || driveScanOpen || !!folderScan || printAddOpen || massPrintOpen || managePrintOpen;

  // ── ผูกหลายรูปที่เลือกเข้าโฟลเดอร์ Drive เดียวกับรูปต้นทาง (bulk) ──
  const bulkLinkFolder = async (source: AssetRow) => {
    const ids = Array.from(selected).filter((x) => x !== source.id);
    setBulkLinkOpen(false);
    if (!/\/folders\//.test(source.master_url ?? "")) { toast.error(`${t("รูป", "Image")} “${source.title || source.file_name}” ${t("ยังไม่มีโฟลเดอร์ Drive — เลือกรูปที่มีโฟลเดอร์แล้ว", "has no Drive folder yet — pick an image that already has a folder")}`); return; }
    if (!ids.length) { toast.error(t("ไม่มีรูปอื่นให้ผูก (เลือกรูปที่ยังไม่มีโฟลเดอร์ด้วย)", "No other images to link (also select images without a folder)")); return; }
    setBulkLinkBusy(true);
    try {
      const res = await apiFetch("/api/assets/drive-folders/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, source_id: source.id, follow_path: true }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ผูกโฟลเดอร์ไม่สำเร็จ", "Failed to link folder"));
      toast.success(`${t("ผูก", "Linked")} ${j.count ?? ids.length} ${t("รูปเข้าโฟลเดอร์เดียวกับ", "images into the same folder as")} “${source.title || source.file_name}”`);
      clearSel(); await load(); await loadMeta();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ผูกโฟลเดอร์ไม่สำเร็จ", "Failed to link folder")); }
    finally { setBulkLinkBusy(false); }
  };
  const onPageDrop = (e: React.DragEvent) => {
    setPageDrag(false);
    if (anyModalOpen) return;
    const imgs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    // อยู่ในมุมมองโฟลเดอร์เดียวกัน → เพิ่มเข้าโฟลเดอร์นั้นเลย (Artwork ผูกโฟลเดอร์ Drive เดิม)
    if (folderFilter) {
      setPendingTargetFolder({ id: folderFilter.id, url: `https://drive.google.com/drive/folders/${folderFilter.id}`, label: folderFilter.label });
      if (imgs.length === 1) { setPendingFile(imgs[0]); setArtworkAddOpen(true); }
      else { setPendingFiles(imgs); setMassOpen(true); }
      return;
    }
    // มุมมอง Artwork → ฟอร์ม Artwork · งานพิมพ์ → ฟอร์มงานพิมพ์ · อื่น ๆ → ฟอร์มอัปรูปธรรมดา
    if (source === "artwork") {
      if (imgs.length === 1) { setPendingFile(imgs[0]); setArtworkAddOpen(true); }
      else { setPendingFiles(imgs); setMassOpen(true); }
    } else if (source === "print") {
      if (imgs.length === 1) { setPendingFile(imgs[0]); setPrintAddOpen(true); }
      else { setPendingFiles(imgs); setMassPrintOpen(true); }
    } else {
      setPendingFiles(imgs); setUploadOpen(true);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-5 relative"
      onDragOver={(e) => { if (anyModalOpen) return; if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setPageDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPageDrag(false); }}
      onDrop={onPageDrop}>
      {pageDrag && (
        <div className="absolute inset-2 z-40 bg-indigo-500/10 border-2 border-dashed border-indigo-400 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="bg-white px-4 py-2 rounded-lg shadow text-sm text-indigo-700 font-medium">{t("🎨 วางรูปที่นี่ → เพิ่ม Artwork · หลายรูป = เพิ่มหลายรูป", "🎨 Drop images here → add Artwork · multiple images = add several")}</div>
        </div>
      )}
      {/* header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            {t("🖼️ คลังไฟล์กลาง", "🖼️ Asset library")}
            {/* ปุ่มช่วยเหลือเดียว → ป๊อปอัปมีแท็บ (ของกลาง HelpTabsButton) */}
            <HelpTabsButton title={t("คู่มือคลังไฟล์กลาง", "Asset library guide")} tabs={[
              { key: "howto", label: `📘 ${t("วิธีใช้", "How to use")}`, content: (
              <ol className="list-decimal pl-4 space-y-2">
                <li><b>{t("อัปครั้งเดียว ใช้ได้ทุกที่", "Upload once, reuse anywhere")}</b> — {t("กด “⬆ อัปโหลด” หรือลากไฟล์มาวางบนหน้านี้ · ไฟล์ที่อัปที่นี่จะไปโผล่ในทุกที่ที่มีปุ่ม “📁 เลือกจากคลัง” (ฟอร์มสินค้า/ใบเสนอ/งาน)", "Use “⬆ Upload” or drag files onto this page · anything here shows up wherever there is a “📁 From library” button (product forms, offers, tasks)")}</li>
                <li><b>{t("ที่มา (แถบซ้าย)", "Source (left sidebar)")}</b> — {t("รูปที่อัปเอง · Artwork (ไฟล์ออกแบบ ต้นฉบับอยู่ NAS/Drive) · งานพิมพ์ (DTF/UV) · รูปสินค้า (Odoo) — คนละหมวดกัน เลือกดูทีละหมวด", "My uploads · Artwork (design files, masters on NAS/Drive) · Print jobs (DTF/UV) · Product images (Odoo) — separate sections")}</li>
                <li><b>{t("จัดของ", "Organize")}</b> — {t("อัลบั้ม = โฟลเดอร์ (1 ไฟล์อยู่ได้หลายอัลบั้ม) · แท็ก = คำค้น · ติ๊กหลายไฟล์แล้วใช้แถบด้านล่างเพื่อติดแท็ก/ย้ายอัลบั้ม/แก้หลายรายการพร้อมกัน", "Albums = folders (a file can be in several) · tags = keywords · tick multiple files then use the bottom bar to tag / move / bulk-edit")}</li>
                <li><b>{t("ค้นหา", "Search")}</b> — {t("พิมพ์ชื่อไฟล์/คำอธิบาย/คีย์เวิร์ด · พิมพ์รหัสสินค้า (เช่น PIX34) จะเจอ “โฟลเดอร์สินค้า” ขึ้นก่อน กดเข้าไปดูรูปทั้งชุดได้", "Type a file name / description / keyword · typing a product code (e.g. PIX34) surfaces its product folder first")}</li>
                <li><b>{t("กดที่ไฟล์", "Click a file")}</b> — {t("เปิดรายละเอียด แก้ชื่อ/แท็ก/อัลบั้ม/ขนาด/ที่เก็บไฟล์ต้นฉบับ · มีปุ่มแทนที่ไฟล์ (ทุกที่ที่ใช้รูปนี้จะเปลี่ยนตาม)", "Opens details — rename, tags, albums, sizes, master file path · “Replace file” updates it everywhere it is used")}</li>
              </ol>
              ) },
              { key: "rules", label: `📐 ${t("กฎของรูป", "Image rules")}`, content: (
              <ul className="list-disc pl-4 space-y-2">
                <li><b>{t("ขนาดไฟล์สูงสุด 25 MB / ไฟล์", "Max 25 MB per file")}</b> — {t("ใหญ่กว่านี้อัปไม่ได้ (ไฟล์ต้นฉบับใหญ่ ๆ เช่น .ai/.psd ให้เก็บไว้บน Drive/NAS แล้วใส่ลิงก์แทน)", "Larger files are rejected (keep big masters like .ai/.psd on Drive/NAS and link them instead)")}</li>
                <li><b>{t("ระบบย่อรูปให้อัตโนมัติ", "Images are auto-shrunk")}</b> — {t("ตอนอัปเลือกได้ 800 / 1200 (ค่าเริ่มต้น) / 1600 px หรือ “ขนาดจริง” · ย่อตามด้านกว้าง คงสัดส่วนเดิม — ทำให้เว็บโหลดเร็ว (ไฟล์ที่ไม่ใช่รูปจะไม่ถูกย่อ)", "On upload pick 800 / 1200 (default) / 1600 px or “Full size” · scales by width, keeps aspect ratio (non-images are never shrunk)")}</li>
                <li><b>{t("ไฟล์ซ้ำไม่เก็บซ้ำ", "Duplicates are skipped")}</b> — {t("ถ้าอัปไฟล์เดิมซ้ำ ระบบจะรู้และใช้ไฟล์เดิม (เพิ่มให้แค่แท็ก/อัลบั้ม) — ยกเว้นหมวด Artwork/งานพิมพ์ ที่ตั้งใจให้แต่ละใบแยกกัน", "Re-uploading the same file reuses the existing one (only tags/albums are added) — except Artwork/Print jobs, which are intentionally separate records")}</li>
                <li><b>{t("รูปย่อในหน้าเว็บ", "Thumbnails")}</b> — {t("ทุกที่ที่โชว์รูปจะดึงเวอร์ชันย่อ (webp) ให้เอง ไม่ได้โหลดไฟล์เต็ม — กดที่รูปถึงจะเห็นตัวเต็ม", "Everywhere shows an auto-generated small webp, not the full file — click to see the original")}</li>
                <li><b>{t("ลบ = ลงถังขยะ กู้คืนได้ 30 วัน", "Delete = trash, restorable for 30 days")}</b> — {t("ไฟล์ที่ยังถูกใช้อยู่ (ผูกกับสินค้า/งาน) จะลบไม่ได้ ระบบจะข้ามให้ · ดูของในถังได้ที่ปุ่ม 🗑 ถังขยะ มุมขวาบน", "Files still in use (linked to a product/task) are skipped · see the 🗑 Trash button at the top right")}</li>
                <li><b>{t("ชนิดไฟล์ที่รับ", "Accepted types")}</b> — {t("รูปภาพ · PDF · ไฟล์ออกแบบ · วิดีโอ", "Images · PDF · design files · video")}</li>
              </ul>
              ) },
              // แท็บนี้ดึงเนื้อหาจากคู่มือในฐานข้อมูล → แอดมินกด "แก้เนื้อหาส่วนนี้" แก้เองได้ ไม่ต้องแก้โค้ด
              { key: "flow", label: `🔀 ${t("Flow รูป & งาน", "Image & work flow")}`, content: (
                <HelpGuideInline guideKey="asset-flow" newIcon="🔀"
                  newTitle={t("Flow รูปและงาน", "Image & work flow")}
                  newDescription={t("รูปเดินทางยังไงตั้งแต่ถ่าย/ออกแบบ จนขึ้นสินค้าและใช้งานจริง", "How an image travels from shoot/design to product and real use")} />
              ) },
            ]} />
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("อัปไฟล์ครั้งเดียว เก็บที่เดียว ค้น/แท็ก/จัดอัลบั้ม แล้วหยิบไปใช้ซ้ำได้ทุกที่", "Upload once, store once, search/tag/organize into albums, then reuse anywhere")} · {total} {t("ไฟล์", "files")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder={t("ค้นหา ชื่อไฟล์ / คำอธิบาย…", "Search file name / description…")}
              className="w-56 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {source === "artwork" && (
            <button onClick={() => setMassOpen(true)}
              className="h-9 px-3 text-sm font-medium border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
            >{t("📋 เพิ่มหลายรูป", "📋 Add multiple")}</button>
          )}
          {source === "print" && (
            <button onClick={() => setMassPrintOpen(true)}
              className="h-9 px-3 text-sm font-medium border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
            >{t("📋 เพิ่มหลายงาน", "📋 Add multiple jobs")}</button>
          )}
          <button
            onClick={() => {
              if (source === "artwork") setArtworkAddOpen(true);
              else if (source === "print") setPrintAddOpen(true);
              else { setPendingFiles(null); setUploadOpen(true); }
            }}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
          >{source === "artwork" ? t("🎨 เพิ่ม Artwork", "🎨 Add Artwork") : source === "print" ? t("🖨 เพิ่มงานพิมพ์", "🖨 Add print job") : t("⬆ อัปโหลด", "⬆ Upload")}</button>
        </div>
      </div>

      {/* พื้นที่ที่ใช้จริงใน R2 (นับจากบัคเก็ต · แยกรายโฟลเดอร์) */}
      {!byBrand && <div className="mb-3"><StorageCard canManage={can("assets.manage")} pushToast={(type, m) => toast[type](m)} /></div>}

      {/* type filter + trash toggle */}
      {!byBrand && (
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {source === "artwork"
          ? <>
              {[{ key: "", label: t("ทั้งหมด", "All") }, ...artTypes.map((t) => ({ key: t.name, label: t.name }))].map((f) => (
                <button key={f.key || "all"} onClick={() => setArtworkType(f.key)}
                  className={`h-8 px-3 text-[13px] rounded-lg border ${artworkType === f.key
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
              ))}
              <button onClick={() => setManageTypesOpen(true)}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">{t("⚙️ จัดการชนิด", "⚙️ Manage types")}</button>
              {driveOn && <button onClick={() => setDriveScanOpen(true)}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">{t("🔍 หาใน Drive ที่ยังไม่เชื่อม", "🔍 Find unlinked in Drive")}</button>}
            </>
          : source === "print"
          ? <>
              {[{ key: "", label: t("ทั้งหมด", "All") }, ...printTypes.map((t) => ({ key: t.code, label: t.name }))].map((f) => (
                <button key={f.key || "all"} onClick={() => setPrintType(f.key)}
                  className={`h-8 px-3 text-[13px] rounded-lg border ${printType === f.key
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
              ))}
              <button onClick={() => setManagePrintOpen(true)}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">{t("⚙️ จัดการประเภทงานพิมพ์", "⚙️ Manage print types")}</button>
            </>
          : TYPE_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`h-8 px-3 text-[13px] rounded-lg border ${type === f.key
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t(f.label, f.en)}</button>
            ))}
        <div className="flex-1" />
        <button
          onClick={() => setTrash((v) => !v)}
          className={`h-8 px-3 text-[13px] rounded-lg border ${trash
            ? "bg-rose-50 border-rose-300 text-rose-700 font-medium"
            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >{t("🗑️ ถังขยะ", "🗑️ Trash")}</button>
      </div>
      )}

      <div className="flex gap-4 items-start">
        {/* sidebar */}
        <aside className="w-44 shrink-0 hidden md:block">
          <p className="text-[11px] font-medium text-slate-400 mb-1.5">{t("มุมมอง", "View")}</p>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={source === "by-brand"} onClick={() => setSource("by-brand")} label={t("ดูตามแบรนด์", "By brand")} icon="🏷️" />
          </div>
          <p className="text-[11px] font-medium text-slate-400 mb-1.5">{t("ที่มา", "Source")}</p>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={source === "upload"} onClick={() => setSource("upload")} label={t("รูปที่อัปเอง", "My uploads")} icon="📤" />
            <SideItem active={source === "artwork"} onClick={() => setSource("artwork")} label="Artwork" icon="🎨" />
            <SideItem active={source === "print"} onClick={() => setSource("print")} label={t("งานพิมพ์", "Print jobs")} icon="🖨" />
            <SideItem active={source === "odoo_product"} onClick={() => setSource("odoo_product")} label={t("รูปสินค้า (Odoo)", "Product images (Odoo)")} icon="🛍️" />
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-slate-400">{t("อัลบั้ม", "Albums")}</p>
            <button onClick={() => setNewColOpen(true)} className="text-[11px] text-indigo-600 hover:underline">{t("＋ ใหม่", "＋ New")}</button>
          </div>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={collectionId === null} onClick={() => setCollectionId(null)} label={t("ทั้งหมด", "All")} />
            <SideItem active={collectionId === "none"} onClick={() => setCollectionId("none")} label={t("ไม่อยู่อัลบั้ม", "No album")} />
            {collections.map((c) => (
              <SideItem key={c.id} active={collectionId === c.id} onClick={() => setCollectionId(c.id)}
                label={c.name} count={c.count} icon="📁" />
            ))}
          </div>
          {tags.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-slate-400 mb-1.5">{t("แท็ก", "Tags")}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button key={t.id} onClick={() => setTag(tag === t.id ? null : t.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border ${tag === t.id
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >{t.name}{t.count ? ` ${t.count}` : ""}</button>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* grid */}
        <main className="flex-1 min-w-0">
          {folderFilter && (
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
              <p className="text-[12px] text-indigo-700">{t("📁 รูปในโฟลเดอร์เดียวกับ", "📁 Images in the same folder as")} “<b>{folderFilter.label}</b>” · {total.toLocaleString("th-TH")} {t("รูป", "images")}</p>
              <div className="flex items-center gap-3">
                {driveOn && (
                  <button onClick={() => setFolderScan({ folderId: folderFilter.id, folderName: folderFilter.label, folderLink: `https://drive.google.com/drive/folders/${folderFilter.id}` })}
                    title={t("สแกนหารูปในโฟลเดอร์นี้ที่ยังไม่ได้ลงคลัง แล้วนำเข้า", "Scan this folder for images not yet in the library and import them")}
                    className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-100 whitespace-nowrap">
                    {t("🔍 หารูปที่ยังไม่ลงในโฟลเดอร์นี้", "🔍 Find unlinked in this folder")}
                  </button>
                )}
                <button onClick={() => setFolderFilter(null)} className="text-[12px] text-indigo-600 hover:underline">{t("✕ ออกจากมุมมองโฟลเดอร์", "✕ Exit folder view")}</button>
              </div>
            </div>
          )}
          {searching && (
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-[12px] text-slate-500">{t("🔍 ผลค้นหา", "🔍 Search results")} “<b>{search.trim()}</b>” {t("ทั้งคลัง", "in whole library")} · {total.toLocaleString("th-TH")} {t("ไฟล์", "files")}</p>
              {rows.some((r) => isImage(r)) && (
                <button onClick={downloadSearchZip} disabled={zipBusy} title={t("โหลดรูปทั้งหมดในผลค้นหานี้เป็นไฟล์ zip", "Download all images in these results as a zip")}
                  className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap">
                  {zipBusy ? (zipMsg || t("กำลังเตรียม…", "Preparing…")) : t("⬇ ดาวน์โหลดรูปผลค้นหา (zip)", "⬇ Download result images (zip)")}
                </button>
              )}
            </div>
          )}
          {searching && searchFolders.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("📂 อัลบั้มสินค้า (Parent SKU) ที่ตรงคำค้น — กดเพื่อเปิดดูรูปทั้งหมดแบบ “ดูตามแบรนด์”", "📂 Product albums (Parent SKU) matching your search — click to open all images in “By brand” view")}</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                {searchFolders.map((f) => (
                  <button key={f.id} onClick={() => openFolder(f.id)}
                    className="flex items-center gap-2 text-left rounded-xl border border-slate-200 bg-white p-2.5 hover:border-indigo-400 hover:bg-indigo-50/40 hover:shadow-sm transition">
                    <span className="text-xl shrink-0">📂</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[12px] text-slate-700">{f.code}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{f.name}</span>
                    </span>
                    <span className="text-[10px] text-indigo-600 font-medium shrink-0 whitespace-nowrap">{t("เปิดอัลบั้ม ›", "Open album ›")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!showBrandView && !loading && total > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
              {rows.length > 0
                ? <button onClick={() => { const all = rows.every((r) => selected.has(r.id)); setSelected(all ? new Set() : new Set(rows.map((r) => r.id))); }}
                    className="h-8 px-3 text-[12px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shrink-0">
                    {rows.every((r) => selected.has(r.id)) ? t("☑ ล้างที่เลือก", "☑ Clear selection") : `${t("☐ เลือกทั้งหมดในหน้านี้", "☐ Select all on this page")} (${rows.length})`}
                  </button>
                : <span />}
              <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={goPage} unitLabel={t("ไฟล์", "files")} />
            </div>
          )}
          {showBrandView ? (
            <BrandAlbumBrowser reloadKey={brandReload} openParentId={brandOpenParent} />
          ) : loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">{t("กำลังโหลด…", "Loading…")}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              {searching ? `${t("ไม่พบไฟล์ที่ตรงกับ", "No files match")} “${search.trim()}”`
                : trash ? t("ถังขยะว่าง", "Trash is empty")
                : source === "artwork" ? t("ยังไม่มี Artwork — กด “เพิ่ม Artwork” เพื่อลงบัตรงานออกแบบ (รูปตัวอย่าง + path ไฟล์ต้นฉบับ)", "No Artwork yet — click “Add Artwork” to create a design card (preview image + source file path)")
                : source === "print" ? t("ยังไม่มีงานพิมพ์ — กด “เพิ่มงานพิมพ์” เพื่อลงรูป preview + ไฟล์ .ai/.pdf สำหรับส่งพิมพ์", "No print jobs yet — click “Add print job” to add a preview image + .ai/.pdf files for printing")
                : source === "odoo_product" ? t("ยังไม่มีรูปสินค้านำเข้า", "No imported product images")
                : t("ยังไม่มีไฟล์ในคลัง — กด “อัปโหลด” เพื่อเริ่มเก็บไฟล์", "No files in the library — click “Upload” to start storing files")}
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {rows.map((a) => (
                <AssetCard key={a.id} a={a} selected={selected.has(a.id)} selectionMode={selCount > 0}
                  onToggle={() => toggleSel(a.id)} onOpen={() => setDetailId(a.id)}
                  onSameFolder={(id, label) => setFolderFilter({ id, label })} />
              ))}
            </div>
          )}
          {!showBrandView && !loading && total > 0 && rows.length > 0 && (
            <div className="mt-4"><Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={goPage} unitLabel={t("ไฟล์", "files")} /></div>
          )}
        </main>
      </div>

      {/* bulk bar — อยู่ล่าง (ที่เดิม) · z สูง ลอยอยู่หน้าสุดไม่โดนบัง */}
      {selCount > 0 && (
        <div className="sticky bottom-4 z-40 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-600 text-white shadow-lg w-fit mx-auto flex-wrap justify-center">
          <span className="text-sm font-medium">{t("เลือก", "Selected")} {selCount} {t("ไฟล์", "files")}</span>
          {!trash && <button onClick={() => setBulkEditOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("✏️ แก้หลายรายการ", "✏️ Edit many")}</button>}
          {!trash && <button onClick={() => setBulkTagOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("🏷️ ติดแท็ก", "🏷️ Add tag")}</button>}
          {!trash && <button onClick={() => setBulkMoveOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("📁 จัดอัลบั้ม", "📁 Organize album")}</button>}
          {!trash && driveOn && <button onClick={() => setBulkFolderOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("🗂️ สร้าง Folder Drive", "🗂️ Create Drive folder")}</button>}
          {!trash && driveOn && <button onClick={() => setBulkLinkOpen(true)} disabled={bulkLinkBusy} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50">{bulkLinkBusy ? t("กำลังผูก…", "Linking…") : t("📎 ใช้โฟลเดอร์เดียวกัน", "📎 Use same folder")}</button>}
          <button onClick={() => setBulkTrashOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("🗑️ ลบ", "🗑️ Delete")}</button>
          <button onClick={clearSel} className="text-sm px-2 py-1 rounded-lg hover:bg-white/15">{t("ยกเลิก", "Cancel")}</button>
        </div>
      )}

      {/* modals */}
      {uploadOpen && (
        <UploadModal
          actor={actor} collections={collections} initialFiles={pendingFiles}
          defaultCollectionId={collectionId && collectionId !== "none" ? collectionId : null}
          onClose={() => { setUploadOpen(false); setPendingFiles(null); }}
          onDone={async () => { setUploadOpen(false); setPendingFiles(null); await load(); await loadMeta(); }}
        />
      )}
      {artworkAddOpen && (
        <ArtworkAddModal actor={actor} artTypes={artTypes} collections={collections} initialFile={pendingFile} targetFolder={pendingTargetFolder}
          defaultCollectionIds={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => { setArtworkAddOpen(false); setPendingFile(null); setPendingTargetFolder(null); }}
          onDone={async () => { setArtworkAddOpen(false); setPendingFile(null); setPendingTargetFolder(null); await load(); await loadMeta(); }} />
      )}
      {massOpen && (
        <MassArtworkModal actor={actor} artTypes={artTypes} collections={collections} initialFiles={pendingFiles} targetFolder={pendingTargetFolder}
          defaultAlbums={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => { setMassOpen(false); setPendingFiles(null); setPendingTargetFolder(null); }}
          onDone={async () => { setMassOpen(false); setPendingFiles(null); setPendingTargetFolder(null); await load(); await loadMeta(); }} />
      )}
      {manageTypesOpen && (
        <ManageTypesModal types={artTypes} onClose={() => setManageTypesOpen(false)}
          onChanged={async () => { await loadMeta(); }} />
      )}
      {printAddOpen && (
        <PrintJobAddModal actor={actor} printTypes={printTypes} collections={collections} initialFile={pendingFile}
          defaultCollectionIds={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => { setPrintAddOpen(false); setPendingFile(null); }}
          onDone={async () => { setPrintAddOpen(false); setPendingFile(null); await load(); await loadMeta(); }} />
      )}
      {massPrintOpen && (
        <MassPrintModal actor={actor} printTypes={printTypes} collections={collections} initialFiles={pendingFiles}
          defaultCollectionIds={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => { setMassPrintOpen(false); setPendingFiles(null); }}
          onDone={async () => { setMassPrintOpen(false); setPendingFiles(null); await load(); await loadMeta(); }} />
      )}
      {managePrintOpen && (
        <ManagePrintTypesModal types={printTypes} onClose={() => setManagePrintOpen(false)}
          onChanged={async () => { await loadMeta(); }} />
      )}
      {driveScanOpen && (
        <DriveScanModal artTypes={artTypes} onClose={() => setDriveScanOpen(false)}
          onDone={async () => { setDriveScanOpen(false); await load(); await loadMeta(); }} />
      )}
      {folderScan && (
        <DriveScanModal artTypes={artTypes} presetFolder={folderScan} onClose={() => setFolderScan(null)}
          onDone={async () => { setFolderScan(null); await load(); await loadMeta(); }} />
      )}
      {detailId && (
        <DetailModal
          key={detailId} id={detailId} actor={actor} collections={collections} artTypes={artTypes}
          ids={rows.map((r) => r.id)} onNavigate={(nid) => setDetailId(nid)}
          onClose={() => setDetailId(null)}
          onChanged={async () => { setBrandReload((k) => k + 1); await load(); await loadMeta(); }}
        />
      )}
      {newColOpen && (
        <NewCollectionModal onClose={() => setNewColOpen(false)}
          onDone={async () => { setNewColOpen(false); await loadMeta(); }} />
      )}
      <ConfirmDialog
        open={bulkTrashOpen} onClose={() => setBulkTrashOpen(false)} onConfirm={bulkTrash}
        title={t("ย้ายไฟล์ลงถังขยะ?", "Move files to trash?")} message={`${t("จะย้าย", "Will move")} ${selCount} ${t("ไฟล์ลงถังขยะ (กู้คืนได้ 30 วัน) — ไฟล์ที่ยังถูกใช้อยู่จะถูกข้าม", "files to trash (recoverable for 30 days) — files still in use will be skipped")}`}
        confirmText={t("ย้ายลงถังขยะ", "Move to trash")} variant="danger"
      />
      {bulkTagOpen && <BulkTagModal count={selCount} tags={tags} onClose={() => setBulkTagOpen(false)} onApply={bulkTag} />}
      {bulkMoveOpen && <BulkMoveModal count={selCount} collections={collections} onClose={() => setBulkMoveOpen(false)} onApply={bulkMove} />}
      {bulkEditOpen && <BulkEditModal ids={Array.from(selected)} artTypes={artTypes}
        onClose={() => setBulkEditOpen(false)}
        onDone={async () => { setBulkEditOpen(false); clearSel(); await load(); await loadMeta(); }} />}
      {bulkFolderOpen && <BulkFolderModal ids={Array.from(selected)} firstAsset={rows.find((r) => selected.has(r.id)) ?? null}
        onClose={() => setBulkFolderOpen(false)}
        onDone={async () => { setBulkFolderOpen(false); clearSel(); await load(); await loadMeta(); }} />}
      {bulkLinkBusy && <LoadingOverlay message={t("กำลังผูกโฟลเดอร์ + ก็อปรูป… อาจใช้เวลาสักครู่", "Linking folder + copying images… this may take a moment")} />}
      {/* bulk: เลือกรูปต้นทาง (ที่มีโฟลเดอร์ Drive) → ผูกทุกรูปที่เลือกเข้าโฟลเดอร์เดียวกัน */}
      <AssetPicker open={bulkLinkOpen} onClose={() => setBulkLinkOpen(false)} typeFilter="image" defaultSource="artwork" requireDriveFolder
        defaultSearch={commonNameSeed(rows.filter((r) => selected.has(r.id)).map((r) => r.title))}
        title={t("เลือกรูปต้นทางที่มีโฟลเดอร์ Drive แล้ว", "Select a source image that already has a Drive folder")} contextLabel={`${t("ผูก", "Link")} ${selCount} ${t("รูปที่เลือกเข้าโฟลเดอร์เดียวกัน", "selected images into the same folder")}`}
        onSelect={(assets) => { const s = assets[0]; if (s) { setBulkLinkOpen(false); setLinkSource(s); setLinkConfirmOpen(true); } }} />
      {/* ยืนยันก่อนผูก — โชว์ชื่อโฟลเดอร์ปลายทาง */}
      <ConfirmDialog open={linkConfirmOpen} onClose={() => setLinkConfirmOpen(false)}
        onConfirm={() => { setLinkConfirmOpen(false); if (linkSource) void bulkLinkFolder(linkSource); }}
        title={t("ผูกเข้าโฟลเดอร์นี้?", "Link into this folder?")} confirmText={t("ผูกโฟลเดอร์", "Link folder")}
        message={linkSource
          ? `${t("จะผูก", "Will link")} ${Array.from(selected).filter((x) => x !== linkSource.id).length} ${t("รูปเข้าโฟลเดอร์", "images into folder")} “${driveFolderNameOf(linkSource)}” (${t("เดียวกับ", "same as")} “${linkSource.title || linkSource.file_name}”) + ${t("ก็อปรูปตัวอย่างของแต่ละรูปเข้าไปด้วย", "and copy each image's preview into it too")}`
          : ""} />
    </div>
  );
}

// ─────────────────────────── sub-components ───────────────────────────

function SideItem({ active, onClick, label, count, icon }: {
  active: boolean; onClick: () => void; label: string; count?: number; icon?: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] text-left ${active
        ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
      {icon && <span className="text-[13px]">{icon}</span>}
      <span className="truncate flex-1">{label}</span>
      {count != null && count > 0 && <span className="text-[11px] text-slate-400">{count}</span>}
    </button>
  );
}

// ── แกะขนาดจริง (cm) จากรูป: px ÷ DPI × 2.54 ──
const DEFAULT_DPI = 300;   // ค่ามาตรฐานเมื่อรูปไม่ได้ฝัง DPI ไว้ (งานเรา export ขนาดจริง 300 DPI)
// อ่าน DPI ที่ฝังในไฟล์รูป (JPEG JFIF/APP0 · PNG pHYs) — ไม่มี = null
async function readImageDpi(file: File): Promise<number | null> {
  try {
    const buf = new Uint8Array(await file.slice(0, 65536).arrayBuffer());   // อ่านหัวไฟล์พอ (metadata อยู่ต้นไฟล์)
    // PNG: signature 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      let p = 8;
      while (p + 12 <= buf.length) {
        const len = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
        const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
        if (type === "pHYs") {
          const ppuX = (buf[p + 8] << 24) | (buf[p + 9] << 16) | (buf[p + 10] << 8) | buf[p + 11];
          const unit = buf[p + 16];
          return unit === 1 && ppuX > 0 ? Math.round(ppuX * 0.0254) : null;   // per meter → per inch
        }
        if (type === "IDAT" || type === "IEND") break;
        p += 12 + len;
      }
      return null;
    }
    // JPEG: FF D8 → หา APP0 (JFIF) เอา density
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let p = 2;
      while (p + 4 < buf.length) {
        if (buf[p] !== 0xff) { p++; continue; }
        const marker = buf[p + 1];
        if (marker === 0xda) break;   // start of scan → หมด metadata
        const len = (buf[p + 2] << 8) | buf[p + 3];
        if (marker === 0xe0) {   // APP0
          const s = p + 4;
          if (buf[s] === 0x4a && buf[s + 1] === 0x46 && buf[s + 2] === 0x49 && buf[s + 3] === 0x46) {   // "JFIF"
            const units = buf[s + 7];
            const xden = (buf[s + 8] << 8) | buf[s + 9];
            if (units === 1 && xden > 0) return xden;                         // dots/inch
            if (units === 2 && xden > 0) return Math.round(xden * 2.54);      // dots/cm → inch
          }
        }
        p += 2 + len;
      }
      return null;
    }
  } catch { /* ignore */ }
  return null;
}
// ประเมินขนาดจริง (cm) จากรูป — เชื่อ DPI จากรูปเฉพาะที่ดูเป็นงานพิมพ์ (≥150) ไม่งั้นใช้ค่ามาตรฐาน
async function estimateSizeCm(file: File): Promise<{ w: number; h: number; px: { w: number; h: number }; dpi: number; fromImage: boolean } | null> {
  if (!file.type.startsWith("image/")) return null;
  const dims = await new Promise<{ w: number; h: number } | null>((res) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u); };
    img.onerror = () => { res(null); URL.revokeObjectURL(u); };
    img.src = u;
  });
  if (!dims || !dims.w || !dims.h) return null;
  const dpiRaw = await readImageDpi(file);
  const fromImage = !!dpiRaw && dpiRaw >= 150;
  const dpi = fromImage ? (dpiRaw as number) : DEFAULT_DPI;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { w: r2(dims.w / dpi * 2.54), h: r2(dims.h / dpi * 2.54), px: dims, dpi, fromImage };
}

// ชื่อโฟลเดอร์ Drive ของรูป = ชั้นสุดท้ายของ master_path (ตามโครง …\<ชื่อโฟลเดอร์>) · ไม่มี = ชื่อรูป
const driveFolderNameOf = (a: { master_path?: string | null; title?: string | null; file_name?: string }) =>
  (a.master_path || "").split(/[\\/]+/).filter(Boolean).pop() || a.title || a.file_name || "โฟลเดอร์";

// หาคำร่วมนำหน้าของชื่อรูปที่เลือก (เช่น "Cherry Rose Pattern 2/3" → "Cherry Rose Pattern") ใช้เป็นคำค้นเริ่มต้น
function commonNameSeed(titles: string[]): string {
  const clean = titles.map((t) => (t || "").trim()).filter(Boolean);
  if (!clean.length) return "";
  const wordsOf = (s: string) => s.split(/[\s_]+/).filter(Boolean);
  let common = wordsOf(clean[0]);
  for (const t of clean.slice(1)) {
    const w = wordsOf(t);
    let i = 0;
    while (i < common.length && i < w.length && common[i].toLowerCase() === w[i].toLowerCase()) i++;
    common = common.slice(0, i);
    if (!common.length) break;
  }
  if (!common.length) return wordsOf(clean[0])[0] ?? "";   // ไม่มีคำร่วม → คำแรกของตัวแรก
  while (common.length > 1 && /^\d+$/.test(common[common.length - 1])) common.pop();   // ตัดเลขล้วนท้าย
  return common.join(" ");
}


function AssetCard({ a, selected, selectionMode, onToggle, onOpen, onSameFolder }: {
  a: AssetRow; selected: boolean; selectionMode: boolean; onToggle: () => void; onOpen: () => void; onSameFolder?: (id: string, label: string) => void;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  return (
    <div className={`group relative rounded-xl border overflow-hidden bg-white ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"}`}>
      {/* ในโหมดเลือก (มีของเลือกอยู่แล้ว): กล่องติ๊กใหญ่ขึ้น + โชว์ตลอด กดง่าย */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`absolute top-1.5 left-1.5 z-10 rounded-md border flex items-center justify-center ${selectionMode ? "w-7 h-7 text-sm" : "w-5 h-5 text-[11px]"} ${selected
          ? "bg-indigo-600 border-indigo-600 text-white" : selectionMode ? "bg-white border-slate-400 text-slate-300 shadow-sm" : "bg-white/90 border-slate-300 text-transparent group-hover:text-slate-300"}`}
      >✓</button>
      {/* ป้ายเตือน "ยังไม่ครบ" (เฉพาะ Artwork) — ไม่มีโฟลเดอร์ Drive / ยังไม่ใส่ขนาด */}
      {a.source === "artwork" && (
        <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
          {!/\/folders\//.test(a.master_url ?? "") && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">{t("📁 ไม่มีโฟลเดอร์", "📁 No folder")}</span>}
          {!a.sizes?.length && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">{t("📐 ไม่มีขนาด", "📐 No size")}</span>}
        </div>
      )}
      {/* งานพิมพ์: ป้ายประเภท (DTF/UV) + เตือนถ้ายังไม่มีไฟล์พิมพ์ */}
      {a.source === "print" && (
        <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
          {a.print_type && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700 border border-violet-200 shadow-sm">🖨 {a.print_type}</span>}
          {!/\/folders\//.test(a.master_url ?? "") && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">{t("⚠ ยังไม่มีไฟล์พิมพ์", "⚠ No print file")}</span>}
        </div>
      )}
      <button onClick={selectionMode ? (e) => { e.stopPropagation(); onToggle(); } : onOpen} className="block w-full text-left">
        <HoverPreview url={isImage(a) && !broken ? a.url : null} previewW={440}>
          {/* กรอบ 1:1 — รูปแสดงเต็มทั้งใบ (object-contain) ไม่ตัดขอบ/ตัวหนังสือ */}
          <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
            {isImage(a) && !broken ? (
              <img src={withImageWidth(a.url, 320) ?? a.url} alt={a.title} loading="lazy" onError={() => setBroken(true)}
                className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-3xl">{TYPE_ICON[a.asset_type]}</span>
            )}
          </div>
        </HoverPreview>
      </button>
      <div className="px-2 py-1.5 cursor-pointer" onClick={selectionMode ? () => onToggle() : onOpen}>
        <p className="text-[12px] font-medium text-slate-700 truncate">{a.title}</p>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-[10px] text-slate-400 truncate">
            {formatBytes(a.size_bytes)}
            {a.source === "print"
              ? (a.sizes?.length ? ` · ${a.sizes[0].w}×${a.sizes[0].h} ${a.sizes[0].unit}` : "")
              : a.usage_count > 0 ? ` · ${t("ใช้อยู่", "in use at")} ${a.usage_count} ${t("ที่", "places")}` : a.status === "active" ? t(" · ยังไม่ถูกใช้", " · not used yet") : ""}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/^https?:\/\//i.test(a.master_url ?? "") && (
              <a href={(a.master_url ?? "").trim()} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                title={t("เปิดโฟลเดอร์/ไฟล์ต้นฉบับบน Google Drive", "Open source folder/file on Google Drive")}
                className="text-[10px] text-emerald-600 hover:underline">↗ {/drive\.google\.com|\/folders\//i.test(a.master_url ?? "") ? "Drive" : t("เปิด", "Open")}</a>
            )}
            {onSameFolder && a.source === "artwork" && /\/folders\//.test(a.master_url ?? "") && (
              <button type="button" title={t("ดูรูปทั้งหมดในโฟลเดอร์ Drive เดียวกัน", "View all images in the same Drive folder")}
                onClick={(e) => { e.stopPropagation(); const m = (a.master_url ?? "").match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) onSameFolder(m[1], driveFolderNameOf(a)); }}
                className="text-[10px] text-indigo-600 hover:underline">{t("📁 โฟลเดอร์", "📁 Folder")}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── อัปโหลด (ลากวาง) ──
type UpItem = { file: File; status: "pending" | "uploading" | "done" | "dup" | "error"; msg?: string };

function UploadModal({ actor, collections, onClose, onDone, initialFiles, defaultCollectionId }: {
  actor: string | null; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFiles?: File[] | null; defaultCollectionId?: string | null;
}) {
  const toast = useToast();
  const t = useT();
  const [items, setItems] = useState<UpItem[]>([]);
  const [tagsStr, setTagsStr] = useState("");
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? "");   // เปิดอยู่ในอัลบั้มไหน → ตั้งให้เลย
  const [resizeW, setResizeW] = useState(1200);   // ย่อด้านกว้างก่อนอัป (0 = ขนาดจริง) · ไฟล์ที่ไม่ใช่รูปไม่ถูกย่ออยู่แล้ว
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).map((file) => ({ file, status: "pending" as const }));
    setItems((s) => [...s, ...arr]);
  };
  // ลากไฟล์มาวางบนหน้าคลัง (มุมมองรูปที่อัปเอง) → เปิดฟอร์มพร้อมไฟล์ที่ลากมา
  useEffect(() => { if (initialFiles?.length) addFiles(initialFiles); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const imgDims = (file: File): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      if (!file.type.startsWith("image/")) return res(null);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { res(null); URL.revokeObjectURL(url); };
      img.src = url;
    });

  const upload = async () => {
    if (items.length === 0) { toast.error(t("ยังไม่ได้เลือกไฟล์", "No files selected yet")); return; }
    setBusy(true);
    let done = 0;
    const next = [...items];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status === "done" || next[i].status === "dup") { done++; continue; }
      next[i] = { ...next[i], status: "uploading" }; setItems([...next]);
      try {
        // ย่อด้านกว้างตามที่เลือก (0 = ขนาดจริง ไม่ย่อ) · ไฟล์ที่ไม่ใช่รูป/เล็กกว่าอยู่แล้ว = ผ่านไปเลย
        const upFile = resizeW > 0 ? await downscaleImageWidth(next[i].file, resizeW) : next[i].file;
        const fd = new FormData();
        fd.append("file", upFile);
        if (tagsStr.trim()) fd.append("tags", tagsStr.trim());
        if (collectionId) fd.append("collection_id", collectionId);
        if (actor) fd.append("actor", actor);
        const d = await imgDims(upFile);
        if (d) { fd.append("width", String(d.w)); fd.append("height", String(d.h)); }
        const res = await apiFetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || t("อัปโหลดไม่สำเร็จ", "Upload failed"));
        next[i] = { ...next[i], status: j.duplicate ? "dup" : "done", msg: j.duplicate ? t("มีอยู่แล้ว — ใช้ตัวเดิม", "Already exists — reused") : undefined };
        done++;
      } catch (e) {
        next[i] = { ...next[i], status: "error", msg: e instanceof Error ? e.message : t("ผิดพลาด", "Error") };
      }
      setItems([...next]);
    }
    setBusy(false);
    toast.success(`${t("อัปโหลดเสร็จ", "Uploaded")} ${done}/${items.length} ${t("ไฟล์", "files")}`);
    if (done > 0) onDone();
  };

  return (
    <ERPModal open onClose={onClose} title={t("อัปโหลดไฟล์เข้าคลัง", "Upload files to library")} size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{t("รองรับ รูป / PDF / ไฟล์ออกแบบ / วิดีโอ · ไม่เกิน 25MB ต่อไฟล์", "Supports images / PDF / design files / video · max 25MB per file")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={upload} disabled={busy || items.length === 0}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {busy ? t("กำลังอัป…", "Uploading…") : t("บันทึกเข้าคลัง", "Save to library")}
            </button>
          </div>
        </div>
      }>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center mb-3 ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
      >
        <div className="text-3xl mb-1">⬆️</div>
        <p className="text-sm font-medium text-slate-700">{t("ลากไฟล์มาวางที่นี่", "Drag files here")}</p>
        <p className="text-[12px] text-slate-400">{t("หรือ คลิกเพื่อเลือกไฟล์", "or click to choose files")}</p>
        <input ref={inputRef} type="file" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3 max-h-48 overflow-auto">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="truncate flex-1">{it.file.name}</span>
              <span className={
                it.status === "done" ? "text-emerald-600" :
                it.status === "dup" ? "text-amber-600" :
                it.status === "error" ? "text-rose-600" :
                it.status === "uploading" ? "text-indigo-600" : "text-slate-400"
              }>
                {it.status === "done" ? t("✓ เสร็จ", "✓ Done") : it.status === "dup" ? t("ซ้ำ — ใช้ตัวเดิม", "Duplicate — reused") :
                 it.status === "error" ? `✕ ${it.msg ?? t("ผิดพลาด", "Error")}` : it.status === "uploading" ? t("กำลังอัป…", "Uploading…") : formatBytes(it.file.size)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ย่อขนาดรูปก่อนอัป — ประหยัดพื้นที่/โหลดเร็ว · เลือก "ขนาดจริง" ถ้าต้องเก็บไฟล์เต็ม */}
      <div className="mb-3">
        <p className="text-[12px] text-slate-500 mb-1">{t("ย่อขนาดรูปก่อนอัป", "Shrink image before upload")} <span className="text-[10px] text-slate-400">{t("(ด้านกว้าง · ไฟล์ที่ไม่ใช่รูปไม่ถูกย่อ)", "(width · non-image files aren't shrunk)")}</span></p>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {[{ w: 800, label: "800px" }, { w: 1200, label: "1200px" }, { w: 1600, label: "1600px" }, { w: 0, label: t("ขนาดจริง", "Full size") }].map((o, i) => (
            <button key={o.w} type="button" onClick={() => setResizeW(o.w)} disabled={busy}
              className={`h-8 px-3 text-[12px] ${i > 0 ? "border-l border-slate-200" : ""} ${resizeW === o.w ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"} disabled:opacity-50`}>
              {resizeW === o.w ? "✓ " : ""}{o.label}
            </button>
          ))}
        </div>
        {resizeW === 0 && <p className="text-[11px] text-amber-600 mt-1">{t("⚠ เก็บขนาดจริง — ไฟล์ใหญ่ขึ้น (ไม่เกิน 25MB/ไฟล์)", "⚠ Keeping full size — larger files (max 25MB/file)")}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] text-slate-500">
          {t("แท็ก (คั่นด้วย ,)", "Tags (comma-separated)")}
          <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder={t("สินค้า, กระเป๋า", "product, bag")}
            className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>
        <label className="text-[12px] text-slate-500">
          {t("อัลบั้ม", "Album")}
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}
            className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">{t("— ไม่ระบุ —", "— None —")}</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
    </ERPModal>
  );
}

// ── รายละเอียดไฟล์ ──
function DetailModal({ id, actor, collections, artTypes, onClose, onChanged, ids, onNavigate }: {
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-1 text-slate-500">{label}</td>
      <td className="py-1 text-right text-slate-700">{value}</td>
    </tr>
  );
}

function UsageList({ usages }: { usages: AssetUsage[] }) {
  const t = useT();
  if (usages.length === 0)
    return <p className="text-[12px] text-slate-400 mt-3 pt-3 border-t border-slate-100">{t("ยังไม่ถูกใช้ที่ไหน — ลบได้", "Not used anywhere — can be deleted")}</p>;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("🔗 ถูกใช้อยู่", "🔗 In use at")} {usages.length} {t("ที่", "places")} <span className="text-[11px] text-slate-400 font-normal">{t("— ลบไม่ได้จนกว่าจะเอาออกจากที่ใช้งาน", "— can't delete until removed from where it's used")}</span></p>
      <div className="flex flex-col gap-1">
        {usages.map((u, i) => (
          <div key={i} className="text-[12px] text-slate-600">
            <span className="text-slate-400">{u.module}</span> · {u.record_label ?? u.record_id}{u.field ? ` (${u.field})` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── สร้างอัลบั้มใหม่ ──
function NewCollectionModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) { toast.error(t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name first")); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/assets/collections", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("สร้างอัลบั้มแล้ว", "Album created")); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สร้างไม่สำเร็จ", "Create failed")); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={t("สร้างอัลบั้มใหม่", "New album")} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={create} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("สร้าง", "Create")}</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">{t("ชื่ออัลบั้ม", "Album name")}
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder={t("เช่น รูปสินค้าใหม่ Q2", "e.g. New product images Q2")}
          className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </label>
    </ERPModal>
  );
}

// ── ติดแท็กหลายไฟล์ ──
function BulkTagModal({ count, tags, onClose, onApply }: {
  count: number; tags: AssetTag[]; onClose: () => void; onApply: (tag: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const apply = () => { if (name.trim()) onApply(name.trim()); };
  return (
    <ERPModal open onClose={onClose} title={`${t("ติดแท็กให้", "Tag")} ${count} ${t("ไฟล์", "files")}`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={apply} disabled={!name.trim()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("ติดแท็ก", "Add tag")}</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">{t("ชื่อแท็ก (มีอยู่แล้วหรือพิมพ์ใหม่)", "Tag name (existing or type a new one)")}
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder={t("เช่น โปรโมชั่น", "e.g. promotion")}
          className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.map((t) => (
            <button key={t.id} onClick={() => setName(t.name)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100">{t.name}</button>
          ))}
        </div>
      )}
    </ERPModal>
  );
}

// ── ย้ายหลายไฟล์ไปอัลบั้ม ──
function BulkMoveModal({ count, collections, onClose, onApply }: {
  count: number; collections: AssetCollection[]; onClose: () => void; onApply: (collectionId: string) => void;
}) {
  const t = useT();
  const [col, setCol] = useState("");
  return (
    <ERPModal open onClose={onClose} title={`${t("เพิ่ม", "Add")} ${count} ${t("ไฟล์เข้าอัลบั้ม", "files to album")}`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => onApply(col)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t("ตกลง", "OK")}</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">{t("เลือกอัลบั้ม (asset อยู่ได้หลายอัลบั้ม)", "Select album (an asset can be in multiple albums)")}
        <select value={col} onChange={(e) => setCol(e.target.value)}
          className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">{t("— เอาออกจากทุกอัลบั้ม —", "— Remove from all albums —")}</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </ERPModal>
  );
}

// แถวฟิลด์ใน bulk edit — ติ๊กเปิด/ปิดการแก้ฟิลด์ (module-level กัน remount ตอนพิมพ์)
function BulkEditRow({ on, setOn, label, preview, children }: { on: boolean; setOn: (v: boolean) => void; label: string; preview?: React.ReactNode; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className={`rounded-lg border p-2.5 ${on ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200"}`}>
      <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> {label}
      </label>
      {preview != null && <div className="mt-1 pl-6 text-[11px] text-slate-500">{t("เดิม:", "Was:")} {preview}</div>}
      {on && <div className="mt-2">{children}</div>}
    </div>
  );
}

// สวิตช์โหมด "ใส่ค่าเดียว (ทุกไฟล์)" ↔ "แก้แยกแต่ละไฟล์"
function BulkModeToggle({ mode, setMode }: { mode: "all" | "each"; setMode: (m: "all" | "each") => void }) {
  const t = useT();
  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 text-[11px]">
      <button type="button" onClick={() => setMode("all")} className={`px-2.5 h-6 rounded-md ${mode === "all" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>{t("ใส่ค่าเดียว (ทุกไฟล์)", "One value (all files)")}</button>
      <button type="button" onClick={() => setMode("each")} className={`px-2.5 h-6 rounded-md ${mode === "each" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>{t("แก้แยกแต่ละไฟล์", "Edit each file")}</button>
    </div>
  );
}

// ── แก้หลายรายการพร้อมกัน (bulk edit) — ติ๊กเลือกฟิลด์ที่จะแก้ · ขนาด/Parent SKU เลือก "รวม" หรือ "แยกรายไฟล์" ได้ ──
function BulkEditModal({ ids, artTypes, onClose, onDone }: {
  ids: string[]; artTypes: LookupItem[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const [enBrand, setEnBrand] = useState(false); const [brandId, setBrandId] = useState("");
  const [enType, setEnType] = useState(false); const [types, setTypes] = useState<string[]>([]);
  const [enSize, setEnSize] = useState(false); const [sizes, setSizes] = useState<AssetSize[]>([]); const [sizeMode, setSizeMode] = useState<"all" | "each">("all");
  const [enParent, setEnParent] = useState(false); const [parents, setParents] = useState<string[]>([]); const [parentMode, setParentMode] = useState<"all" | "each">("all");
  const [enTags, setEnTags] = useState(false); const [tags, setTags] = useState<string[]>([]);
  const [enKw, setEnKw] = useState(false); const [kw, setKw] = useState("");
  const [enLoc, setEnLoc] = useState(false); const [locMode, setLocMode] = useState<"all" | "each">("each"); const [locPath, setLocPath] = useState(""); const [locUrl, setLocUrl] = useState("");
  // ข้อมูลไฟล์รายใบ (ดึงค่าเดิมมาโชว์ + prefill ตอนแก้)
  type BEItem = { id: string; title: string; url: string; isImg: boolean; brandId: string; types: string[]; sizes: AssetSize[]; parents: string[]; keywords: string; path: string; masterUrl: string };
  const [items, setItems] = useState<BEItem[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [pfSizes, setPfSizes] = useState<Record<string, AssetSize[]>>({});
  const [pfParents, setPfParents] = useState<Record<string, string[]>>({});
  const [pfPath, setPfPath] = useState<Record<string, string>>({});
  const [pfUrl, setPfUrl] = useState<Record<string, string>>({});
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);

  const needPerFile = (enSize && sizeMode === "each") || (enParent && parentMode === "each") || (enLoc && locMode === "each");
  const PREFILL_CAP = 40;   // ดึงค่าเดิมอัตโนมัติเมื่อไฟล์ไม่เยอะ (กันยิงเยอะเกิน)
  const wantLoad = needPerFile || ids.length <= PREFILL_CAP;
  // โหลดไฟล์ที่เลือก → เก็บค่าเดิมทุกฟิลด์ (ไว้โชว์ "เดิม: …" + prefill + แก้แยกรายไฟล์)
  useEffect(() => {
    if (!wantLoad || items !== null || itemsLoading) return;
    setItemsLoading(true);
    Promise.all(ids.map((id) => apiFetch(`/api/assets/${id}`).then((r) => r.json()).then((j) => j.data as AssetDetail).catch(() => null)))
      .then((got) => {
        const list = got.filter(Boolean) as AssetDetail[];
        setItems(list.map((d) => ({ id: d.id, title: d.title, url: d.url, isImg: isImage(d), brandId: d.brand_id ?? "", types: d.artwork_types ?? [], sizes: d.sizes ?? [], parents: d.parent_sku_codes ?? [], keywords: d.keywords ?? "", path: d.master_path ?? "", masterUrl: d.master_url ?? "" })));
        const s: Record<string, AssetSize[]> = {}, p: Record<string, string[]> = {}, pa: Record<string, string> = {}, u: Record<string, string> = {};
        for (const d of list) { s[d.id] = d.sizes ?? []; p[d.id] = d.parent_sku_codes ?? []; pa[d.id] = d.master_path ?? ""; u[d.id] = d.master_url ?? ""; }
        setPfSizes(s); setPfParents(p); setPfPath(pa); setPfUrl(u);
      })
      .finally(() => setItemsLoading(false));
  }, [wantLoad, items, itemsLoading, ids]);

  // ค่าเดิม "ร่วม" ของไฟล์ที่เลือก (ต่างกัน = mixed) — ไว้โชว์ + prefill
  const cur = (() => {
    if (!items || items.length === 0) return null;
    const oneStr = (get: (i: BEItem) => string) => { const vs = items.map(get); return { mixed: new Set(vs).size > 1, value: vs[0] }; };
    const oneArr = <T,>(get: (i: BEItem) => T[], keyOf: (v: T[]) => string) => { const vs = items.map(get); return { mixed: new Set(vs.map(keyOf)).size > 1, value: vs[0] }; };
    const sortKey = (v: string[]) => JSON.stringify([...v].sort());
    return {
      brand: oneStr((i) => i.brandId),
      types: oneArr((i) => i.types, sortKey),
      sizes: oneArr((i) => i.sizes, (v) => JSON.stringify(v)),
      parents: oneArr((i) => i.parents, sortKey),
      keywords: oneStr((i) => i.keywords),
      path: oneStr((i) => i.path),
      url: oneStr((i) => i.masterUrl),
    };
  })();
  // เติมค่าเดิมลงช่องแก้ (ครั้งเดียว) — เฉพาะฟิลด์ที่ทุกไฟล์ค่าตรงกัน
  useEffect(() => {
    if (!cur || prefilled) return;
    if (!cur.brand.mixed) setBrandId(cur.brand.value);
    if (!cur.types.mixed) setTypes(cur.types.value);
    if (!cur.sizes.mixed) setSizes(cur.sizes.value);
    if (!cur.parents.mixed) setParents(cur.parents.value);
    if (!cur.keywords.mixed) setKw(cur.keywords.value);
    if (!cur.path.mixed) setLocPath(cur.path.value);
    if (!cur.url.mixed) setLocUrl(cur.url.value);
    setPrefilled(true);
  }, [cur, prefilled]);

  // ป้ายค่าเดิมแต่ละฟิลด์ (โชว์ใต้ชื่อฟิลด์)
  const mixedTag = <span className="text-amber-600">{t("ค่าต่างกัน", "Values differ")} ({ids.length} {t("ไฟล์", "files")})</span>;
  const brandLabel = (id: string) => id ? (brands.find((b) => b.id === id)?.name ?? t("แบรนด์อื่น", "Other brand")) : t("— ไม่มีแบรนด์ —", "— No brand —");
  const sizeLabel = (ss: AssetSize[]) => ss.length ? ss.map((s) => `${s.w}×${s.h} ${s.unit}`).join(", ") : "—";
  const prev = (field: keyof NonNullable<typeof cur>, render: (v: never) => React.ReactNode): React.ReactNode => {
    if (itemsLoading) return <span className="text-slate-400">{t("กำลังโหลดค่าเดิม…", "Loading current values…")}</span>;
    if (!cur) return ids.length > PREFILL_CAP ? <span className="text-slate-400">{t("ไฟล์เยอะ — ไม่ดึงค่าเดิม", "Many files — not loading current values")}</span> : null;
    const f = cur[field]; return f.mixed ? mixedTag : render(f.value as never);
  };

  const save = async () => {
    // ฟิลด์ "รวม" (ค่าเดียวทุกไฟล์) → bulk action edit
    const fields: Record<string, unknown> = {};
    if (enBrand) fields.brand_id = brandId || null;
    if (enType) fields.artwork_types = types;
    if (enKw) fields.keywords = kw.trim();
    if (enTags) fields.add_tags = tags;
    if (enSize && sizeMode === "all") fields.sizes = sizes;
    if (enParent && parentMode === "all") fields.parent_sku_codes = parents;
    if (enLoc && locMode === "all") { fields.master_path = locPath.trim(); fields.master_url = locUrl.trim(); }
    const anyShared = Object.keys(fields).length > 0;
    if (!anyShared && !needPerFile) { toast.error(t("ติ๊กเลือกฟิลด์ที่จะแก้ก่อน", "Check the fields you want to edit first")); return; }
    setBusy(true);
    try {
      if (anyShared) {
        const res = await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", asset_ids: ids, fields }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("แก้ไม่สำเร็จ", "Edit failed"));
      }
      // ฟิลด์ "แยกรายไฟล์" → PATCH ทีละใบ
      if (needPerFile && items) {
        for (const it of items) {
          const patch: Record<string, unknown> = {};
          if (enSize && sizeMode === "each") patch.sizes = pfSizes[it.id] ?? [];
          if (enParent && parentMode === "each") patch.parent_sku_codes = pfParents[it.id] ?? [];
          if (enLoc && locMode === "each") { patch.master_path = (pfPath[it.id] ?? "").trim() || null; patch.master_url = (pfUrl[it.id] ?? "").trim() || null; }
          if (Object.keys(patch).length) await apiFetch(`/api/assets/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        }
      }
      toast.success(`${t("แก้", "Edited")} ${ids.length} ${t("ไฟล์แล้ว", "files")}`); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ไม่สำเร็จ", "Edit failed")); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`✏️ ${t("แก้", "Edit")} ${ids.length} ${t("ไฟล์พร้อมกัน", "files at once")}`} size="lg"
      description={t("ติ๊กเฉพาะฟิลด์ที่จะแก้ · ขนาด/Parent SKU เลือกได้ว่า “ใส่ค่าเดียวทุกไฟล์” หรือ “แก้แยกแต่ละไฟล์” · แท็ก = เพิ่มเข้าไป", "Check only the fields you want to edit · Size/Parent SKU can be “one value for all files” or “edit each file” · Tags = added on")}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-amber-600">{t("จะแก้", "Will edit")} {ids.length} {t("ไฟล์ที่เลือก", "selected files")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? t("กำลังบันทึก…", "Saving…") : `${t("บันทึก", "Save")} ${ids.length} ${t("ไฟล์", "files")}`}</button>
          </div>
        </div>
      }>
      {busy && <LoadingOverlay message={t("กำลังบันทึก…", "Saving…")} />}
      <div className="space-y-2.5">
        <BulkEditRow on={enBrand} setOn={setEnBrand} label={t("แบรนด์", "Brand")} preview={prev("brand", (v: string) => brandLabel(v))}>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">{t("— ไม่มีแบรนด์ —", "— No brand —")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </BulkEditRow>
        <BulkEditRow on={enType} setOn={setEnType} label={t("ชนิด (แทนที่ของเดิม)", "Type (replaces existing)")} preview={prev("types", (v: string[]) => (v.length ? v.join(", ") : "—"))}>
          <ArtTypeMultiSelect value={types} types={artTypeList} onChange={setTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
        </BulkEditRow>
        <BulkEditRow on={enSize} setOn={setEnSize} label={t("ขนาด (กว้าง × สูง)", "Size (W × H)")} preview={prev("sizes", (v: AssetSize[]) => sizeLabel(v))}>
          <BulkModeToggle mode={sizeMode} setMode={setSizeMode} />
          {sizeMode === "all"
            ? <div className="mt-1.5"><SizesEditor value={sizes} onChange={setSizes} /><p className="text-[10px] text-slate-400 mt-1">{t("ใส่ค่าเดียว → แทนที่ทุกไฟล์", "One value → replace all files")}</p></div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">{t("↓ แก้ขนาดแยกแต่ละไฟล์ในส่วนล่าง", "↓ Edit size per file in the section below")}</p>}
        </BulkEditRow>
        <BulkEditRow on={enParent} setOn={setEnParent} label="Parent SKU" preview={prev("parents", (v: string[]) => (v.length ? v.join(", ") : "—"))}>
          <BulkModeToggle mode={parentMode} setMode={setParentMode} />
          {parentMode === "all"
            ? <div className="mt-1.5"><ParentSkuField value={parents} onChange={setParents} /><p className="text-[10px] text-slate-400 mt-1">{t("เลือกชุดเดียว → แทนที่ทุกไฟล์", "Pick one set → replace all files")}</p></div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">{t("↓ แก้ Parent SKU แยกแต่ละไฟล์ในส่วนล่าง", "↓ Edit Parent SKU per file in the section below")}</p>}
        </BulkEditRow>
        <BulkEditRow on={enTags} setOn={setEnTags} label={t("แท็ก (เพิ่มเข้าไป)", "Tags (add)")}>
          <TagPickerField value={tags} onChange={setTags} />
        </BulkEditRow>
        <BulkEditRow on={enKw} setOn={setEnKw} label={t("คำค้นเพิ่มเติม (keyword — แทนที่ของเดิม)", "Extra keywords (replaces existing)")} preview={prev("keywords", (v: string) => v || "—")}>
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("เช่น flower ดอกไม้ summer", "e.g. flower summer")}
            className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
        </BulkEditRow>
        <BulkEditRow on={enLoc} setOn={setEnLoc} label={t("ที่เก็บไฟล์ต้นฉบับ (path / ลิงก์โฟลเดอร์)", "Source file location (path / folder link)")}
          preview={prev("path", (v: string) => <>{v || "—"}{cur && !cur.url.mixed && cur.url.value ? <span className="text-slate-400"> {t("· มีลิงก์โฟลเดอร์", "· has folder link")}</span> : null}</>)}>
          <BulkModeToggle mode={locMode} setMode={setLocMode} />
          {locMode === "all"
            ? <div className="mt-1.5 space-y-1.5">
                <input value={locPath} onChange={(e) => setLocPath(e.target.value)} placeholder={t("path เช่น G:\Shared drives\…\Bow (Purple)", "path e.g. G:\Shared drives\…\Bow (Purple)")} className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
                <input value={locUrl} onChange={(e) => setLocUrl(e.target.value)} placeholder={t("ลิงก์โฟลเดอร์ Drive (https://drive.google.com/…)", "Drive folder link (https://drive.google.com/…)")} className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
                <p className="text-[10px] text-slate-400">{t("ใส่ค่าเดียว → แทนที่ทุกไฟล์ (เว้นว่าง = ล้างค่า)", "One value → replace all files (blank = clear)")}</p>
              </div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">{t("↓ แก้ path/ลิงก์แยกแต่ละไฟล์ในส่วนล่าง", "↓ Edit path/link per file in the section below")}</p>}
        </BulkEditRow>

        {needPerFile && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/20 p-2.5">
            <p className="text-[12px] font-medium text-slate-700 mb-2">{t("🗂️ แก้รายไฟล์", "🗂️ Edit per file")} ({ids.length} {t("ไฟล์", "files")})
              {enSize && sizeMode === "each" ? t(" · ขนาด", " · Size") : ""}{enParent && parentMode === "each" ? " · Parent SKU" : ""}{enLoc && locMode === "each" ? t(" · ที่เก็บไฟล์", " · Location") : ""}</p>
            {itemsLoading || items === null ? (
              <p className="text-[12px] text-slate-400 py-4 text-center">{t("กำลังโหลดไฟล์ที่เลือก…", "Loading selected files…")}</p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {it.isImg ? <img src={withImageWidth(it.url, 80) ?? it.url} alt="" className="w-9 h-9 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" /> : <span className="text-xl shrink-0">🎨</span>}
                      <span className="text-[12px] text-slate-700 truncate">{it.title}</span>
                    </div>
                    {enSize && sizeMode === "each" && (
                      <div className="mb-1.5"><p className="text-[10px] text-slate-400 mb-0.5">{t("📐 ขนาด (กว้าง × สูง)", "📐 Size (W × H)")}</p><SizesEditor value={pfSizes[it.id] ?? []} onChange={(v) => setPfSizes((m) => ({ ...m, [it.id]: v }))} /></div>
                    )}
                    {enParent && parentMode === "each" && (
                      <div><p className="text-[10px] text-slate-400 mb-0.5">📦 Parent SKU</p><ParentSkuField value={pfParents[it.id] ?? []} onChange={(v) => setPfParents((m) => ({ ...m, [it.id]: v }))} /></div>
                    )}
                    {enLoc && locMode === "each" && (
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10px] text-slate-400 mb-0.5">{t("📁 ที่เก็บไฟล์ต้นฉบับ", "📁 Source file location")}</p>
                        <input value={pfPath[it.id] ?? ""} onChange={(e) => setPfPath((m) => ({ ...m, [it.id]: e.target.value }))} placeholder={t("path เช่น G:\Shared drives\…", "path e.g. G:\Shared drives\…")} className="w-full h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg" />
                        <input value={pfUrl[it.id] ?? ""} onChange={(e) => setPfUrl((m) => ({ ...m, [it.id]: e.target.value }))} placeholder={t("ลิงก์โฟลเดอร์ Drive", "Drive folder link")} className="w-full h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ERPModal>
  );
}

// ── สร้างโฟลเดอร์ Drive หลายรูป — เลือก "แยก (รูปละโฟลเดอร์)" หรือ "รวมเป็นโฟลเดอร์เดียว" (ตั้งชื่อได้) ──
function BulkFolderModal({ ids, firstAsset, onClose, onDone }: {
  ids: string[]; firstAsset: AssetRow | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const { brandBase, typeSub } = useDriveFolderMaps();
  const t = useT();
  const [mode, setMode] = useState<"separate" | "combined">("separate");
  const [folderName, setFolderName] = useState(firstAsset?.title ?? "");   // default = ชื่อรูปแรก
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const artType = firstAsset?.artwork_types?.[0] ?? firstAsset?.artwork_type ?? undefined;
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  // ดึงแบรนด์จากรูปแรกมาเป็นค่าเริ่มต้น (ไว้จัดที่ตั้งโฟลเดอร์รวม)
  useEffect(() => { if (firstAsset) apiFetch(`/api/assets/${firstAsset.id}`).then((r) => r.json()).then((j) => { if (j.data?.brand_id) setBrandId(j.data.brand_id); }).catch(() => {}); }, [firstAsset]);

  const run = async () => {
    setBusy(true);
    try {
      if (mode === "separate") {
        const res = await apiFetch("/api/assets/drive-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ทำไม่สำเร็จ", "Action failed"));
        toast.success(`${t("สร้างโฟลเดอร์", "Created folder for")} ${j.created} ${t("ไฟล์", "files")}${j.skipped ? ` · ${t("ข้าม(มีแล้ว)", "skipped (existing)")} ${j.skipped}` : ""}${j.failed ? ` · ${t("ล้มเหลว", "failed")} ${j.failed}` : ""}`);
      } else {
        const nm = folderName.trim(); if (!nm) { toast.error(t("ตั้งชื่อโฟลเดอร์ก่อน", "Name the folder first")); setBusy(false); return; }
        const master_path = brandFolderPath(nm, brandId, artType, brandBase, typeSub);   // path ในเครื่องตามแบรนด์/ชนิด/ชื่อ
        const res = await apiFetch("/api/assets/drive-folders/combined", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, brand_id: brandId || undefined, artwork_type: artType, folder_name: nm, master_path: master_path || undefined }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ทำไม่สำเร็จ", "Action failed"));
        toast.success(`${t("สร้างโฟลเดอร์", "Created folder")} “${nm}” + ${t("ใส่", "added")} ${j.count ?? ids.length} ${t("รูปแล้ว", "images")}`);
      }
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ทำไม่สำเร็จ", "Action failed")); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`🗂️ ${t("สร้างโฟลเดอร์ Drive", "Create Drive folder")} (${ids.length} ${t("รูป", "images")})`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={run} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? t("กำลังทำ…", "Working…") : t("สร้าง", "Create")}</button>
        </div>
      }>
      {busy && <LoadingOverlay message={mode === "combined" ? t("กำลังสร้างโฟลเดอร์ + ก็อปรูป… อาจใช้เวลาสักครู่", "Creating folder + copying images… this may take a moment") : t("กำลังสร้างโฟลเดอร์ทีละรูป… อาจใช้เวลาสักครู่", "Creating a folder per image… this may take a moment")} />}
      <div className="flex gap-1 mb-3 p-0.5 bg-slate-100 rounded-lg">
        <button type="button" onClick={() => setMode("separate")}
          className={`flex-1 h-8 text-[12px] font-medium rounded-md transition ${mode === "separate" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("🗂️ แยก (รูปละโฟลเดอร์)", "🗂️ Separate (one folder per image)")}</button>
        <button type="button" onClick={() => setMode("combined")}
          className={`flex-1 h-8 text-[12px] font-medium rounded-md transition ${mode === "combined" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("📦 รวมโฟลเดอร์เดียว", "📦 One combined folder")}</button>
      </div>

      {mode === "separate" ? (
        <p className="text-[12px] text-slate-500">{t("แต่ละรูปจะได้โฟลเดอร์ Drive ของตัวเอง (ตามชื่อรูป + แบรนด์/ชนิดของรูปนั้น) · รูปที่มีโฟลเดอร์อยู่แล้วจะข้าม", "Each image gets its own Drive folder (by image name + that image's brand/type) · images that already have a folder are skipped")}</p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] text-slate-500">{t("สร้างโฟลเดอร์ Drive", "Create a Drive folder")} <b>{t("1 อัน", "(just one)")}</b> {t("แล้วเอาทุกรูปที่เลือกใส่เข้าไป (ก็อปรูปตัวอย่างให้ด้วย)", "then put all selected images in it (previews copied too)")}</p>
          <label className="block text-[12px] text-slate-500">{t("ชื่อโฟลเดอร์", "Folder name")} <span className="text-red-500">*</span>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={t("เช่น Cherry Collection", "e.g. Cherry Collection")}
              className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg ${folderName.trim() ? "border-slate-200" : "border-amber-300"}`} /></label>
          <label className="block text-[12px] text-slate-500">{t("แบรนด์ (ไว้จัดที่ตั้งโฟลเดอร์)", "Brand (to place the folder)")}
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">{t("— โฟลเดอร์แม่ (ไม่จัดตามแบรนด์) —", "— Parent folder (not organized by brand) —")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
        </div>
      )}
    </ERPModal>
  );
}

// ── ของกลาง: อัปไฟล์ต้นฉบับ + ก็อปรูป preview ขึ้น Google Drive (ใช้ทั้งตอนสร้างใหม่ + หน้ารายละเอียด) ──
// สร้างโฟลเดอร์ตามชื่องาน (ใต้แบรนด์/ชนิด) → ตั้งชื่อไฟล์ตามชื่องาน → ก็อปรูปตัวอย่างเข้าโฟลเดอร์ด้วย (เปิดดูลายจาก Drive ได้เลย)
const DRIVE_MAX_PROXY = 4 * 1024 * 1024;   // ไฟล์ ≤4MB อัปผ่านแอป · ใหญ่กว่า = อัปเอง (ลิมิต body Vercel)
const drivePreviewExt = (f: File) => f.type === "image/jpeg" ? ".jpg" : f.type === "image/webp" ? ".webp" : (f.name.match(/\.[^.]+$/)?.[0] || ".png");
// รูป preview สำหรับก็อปลง Drive: เต็มขนาดถ้า ≤4MB · เกินก็ย่อลงให้พอดี 4MB (คลัง R2 ยังย่อ 1200 แยกต่างหาก)
async function previewForDrive(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= DRIVE_MAX_PROXY) return file;   // เต็มขนาด
  for (const w of [3000, 2200, 1600]) { const d = await downscaleImageWidth(file, w); if (d.size <= DRIVE_MAX_PROXY) return d; }
  return await downscaleImageWidth(file, 1600);
}
async function uploadArtworkToDrive(opts: {
  name: string; artworkType?: string; brandId?: string;
  srcFiles: File[]; previewFile?: File | null;
  folderId?: string;   // ส่งมา = อัปเข้าโฟลเดอร์นี้เลย (ไม่สร้างใหม่) — ใช้ตอน "หลายรูป โฟลเดอร์เดียว"
  folderName?: string; // ตั้งชื่อโฟลเดอร์แยกจากชื่อไฟล์ (โหมดโฟลเดอร์รวม — ไฟล์ยังชื่อตามรูปแต่ละใบ)
  subpath?: string;    // path ซ้อนชั้นเอง (เช่น "Printed/DTF" ของงานพิมพ์) แทนการแม็ปตามชนิด
  rootFolderId?: string;   // โฟลเดอร์แม่เฉพาะ (งานพิมพ์ไปโฟลเดอร์เดียวไม่สนแบรนด์)
  flat?: boolean;      // ไม่สร้างโฟลเดอร์ชื่องาน → ไฟล์ลงในซับตรง ๆ (งานพิมพ์)
  onProgress?: (done: number, total: number) => void;
}): Promise<{ folderId: string; folderLink: string; largeCount: number }> {
  const nm = opts.name.trim() || "artwork";
  const folderNm = opts.folderName?.trim() || nm;   // ชื่อโฟลเดอร์ (ตั้งแยกได้) · ไม่ตั้ง = ชื่อไฟล์
  const named = opts.srcFiles.map((f, i) => ({ file: f, filename: `${nm}${i > 0 ? `_${i + 1}` : ""}${f.name.match(/\.[^.]+$/)?.[0] ?? ""}` }));
  const small = named.filter((x) => x.file.size <= DRIVE_MAX_PROXY);
  const large = named.filter((x) => x.file.size > DRIVE_MAX_PROXY);

  let folderId = opts.folderId ?? "", folderLink = "";
  const doUpload = async (x: { file: File; filename: string } | null) => {
    const fd = new FormData();
    fd.append("name", folderNm);
    if (opts.artworkType) fd.append("artworkType", opts.artworkType);
    if (opts.subpath) fd.append("subpath", opts.subpath);
    if (opts.rootFolderId) fd.append("root_folder_id", opts.rootFolderId);
    if (opts.flat) fd.append("flat", "1");
    if (opts.brandId) fd.append("brand_id", opts.brandId);
    if (folderId) fd.append("folderId", folderId);
    if (x) { fd.append("filename", x.filename); fd.append("file", x.file); }
    const res = await apiFetch("/api/drive/upload", { method: "POST", body: fd });
    const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "อัป Drive ไม่สำเร็จ");
    folderId = j.folderId; folderLink = j.folderLink;
  };

  opts.onProgress?.(0, small.length);
  for (let i = 0; i < small.length; i++) { await doUpload(small[i]); opts.onProgress?.(i + 1, small.length); }
  if (!folderId && (large.length || opts.previewFile)) await doUpload(null);   // ยังไม่มีโฟลเดอร์ → สร้างก่อน
  // ก็อปรูป preview เข้าโฟลเดอร์เดียวกัน (best-effort — พังไม่ทำให้ทั้งงานพัง · ชื่อ = <ชื่องาน>.png)
  if (opts.previewFile && folderId) {
    try { await doUpload({ file: opts.previewFile, filename: `${nm}${drivePreviewExt(opts.previewFile)}` }); } catch { /* ปล่อยผ่าน */ }
  }
  opts.onProgress?.(0, 0);
  return { folderId, folderLink, largeCount: large.length };
}

// ── เพิ่ม Artwork ลงบัตร (รูป + ชนิด + ชื่อ + แท็ก + ไซส์ + location + อัลบั้ม + Parent SKU + keyword) ──
function ArtworkAddModal({ actor, artTypes, collections, onClose, onDone, initialFile, defaultCollectionIds, targetFolder }: { actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFile?: File | null; defaultCollectionIds?: string[]; targetFolder?: { id: string; url: string; label: string } | null }) {
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
type MassRow = { id: number; file: File; preview: string | null; name: string; types: string[]; path: string; url: string; srcFiles: File[]; sizes: AssetSize[]; parentCodes: string[]; pathAuto: boolean };
function MassArtworkModal({ actor, artTypes, collections, onClose, onDone, initialFiles, defaultAlbums, targetFolder }: {
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

// ── ตัวเลือกแท็กแบบ chips (m2m) — เลือกของเดิม + เพิ่มใหม่ ──
function TagChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [all, setAll] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    apiFetch("/api/assets/tags").then((r) => r.json())
      .then((j) => setAll(((j.data ?? []) as { name: string }[]).map((t) => t.name))).catch(() => {});
  }, []);
  const add = (name: string) => { const n = name.trim(); if (n && !value.includes(n)) onChange([...value, n]); setInput(""); };
  const remove = (name: string) => onChange(value.filter((x) => x !== name));
  const suggest = all.filter((t) => !value.includes(t) && (!input || t.toLowerCase().includes(input.toLowerCase()))).slice(0, 12);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {value.map((t) => (
          <span key={t} className="text-[11px] pl-2 pr-1 py-0.5 rounded-full bg-indigo-600 text-white inline-flex items-center gap-1">
            {t}<button type="button" onClick={() => remove(t)} className="hover:bg-white/25 rounded-full w-4 h-4 leading-none flex items-center justify-center">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่มีแท็ก", "No tags yet")}</span>}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
        placeholder={t("พิมพ์แท็ก + Enter / เลือกจากด้านล่าง", "Type a tag + Enter / pick from below")}
        className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded-lg" />
      {suggest.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {suggest.map((t) => (
            <button key={t} type="button" onClick={() => add(t)}
              className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100">+ {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── เลือก Group Album หลายอัน (m2m) + สร้างอัลบั้มใหม่ inline ──
function CollectionMultiSelect({ value, collections, onChange, onCreated }: {
  value: string[]; collections: AssetCollection[]; onChange: (v: string[]) => void; onCreated: (c: AssetCollection) => void;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useT();
  const nameOf = (id: string) => collections.find((c) => c.id === id)?.name ?? id;
  const add = (id: string) => { if (id && !value.includes(id)) onChange([...value, id]); };
  const remaining = collections.filter((c) => !value.includes(c.id));
  const create = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
      const j = await r.json(); if (!r.ok || j.error || !j.data) throw new Error(j.error || t("สร้างอัลบั้มไม่สำเร็จ", "Failed to create album"));
      const col = j.data as AssetCollection;
      onCreated(col); onChange([...value, col.id]); setNewName(""); setCreating(false);
      toast.success(`${t("สร้างอัลบั้ม", "Created album")} "${n}"`);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สร้างอัลบั้มไม่สำเร็จ", "Failed to create album")); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded">
            {nameOf(id)}<button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="text-emerald-300 hover:text-rose-500 leading-none">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("— ไม่ระบุ —", "— None —")}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ""; }}
          className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white max-w-[150px]">
          <option value="">{t("＋ เลือกอัลบั้ม…", "＋ Choose album…")}</option>
          {remaining.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="text-[11px] px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50">{t("＋ อัลบั้มใหม่", "＋ New album")}</button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder={t("ชื่ออัลบั้มใหม่", "New album name")} className="h-8 w-32 px-2 text-[12px] border border-emerald-300 rounded-lg" />
            <button type="button" onClick={() => void create()} disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          </span>
        )}
      </div>
    </div>
  );
}

// ── เลือกชนิด Artwork หลายอัน (m2m) + เพิ่มชนิดใหม่ inline (lookup กลาง) ──
function ArtTypeMultiSelect({ value, types, onChange, onCreated, disabled }: {
  value: string[]; types: LookupItem[]; onChange: (v: string[]) => void; onCreated: (t: LookupItem) => void; disabled?: boolean;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const add = (name: string) => { const n = name.trim(); if (n && !value.includes(n)) onChange([...value, n]); };
  const t = useT();
  const remaining = types.filter((t) => !value.includes(t.name));
  const create = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/lookups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookup_type: "artwork_type", name: n }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || t("เพิ่มชนิดไม่สำเร็จ", "Failed to add type"));
      const item: LookupItem = j.data ? { id: String(j.data.id ?? n), name: String(j.data.name ?? n) } : { id: n, name: n };
      onCreated(item); add(item.name); setNewName(""); setCreating(false);
      toast.success(`${t("เพิ่มชนิด", "Added type")} "${n}"`);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มชนิดไม่สำเร็จ", "Failed to add type")); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 rounded">
            {n}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== n))} className="text-indigo-300 hover:text-rose-500 leading-none">✕</button>}
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("— ไม่ระบุ —", "— None —")}</span>}
      </div>
      {!disabled && <div className="flex items-center gap-1.5 mt-1">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ""; }}
          className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white max-w-[150px]">
          <option value="">{t("＋ เลือกชนิด…", "＋ Choose type…")}</option>
          {remaining.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="text-[11px] px-2 py-1 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50">{t("＋ ชนิดใหม่", "＋ New type")}</button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder={t("ชื่อชนิดใหม่", "New type name")} className="h-8 w-28 px-2 text-[12px] border border-indigo-300 rounded-lg" />
            <button type="button" onClick={() => void create()} disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          </span>
        )}
      </div>}
    </div>
  );
}

// ── รายการ Artwork ในแผ่นงานพิมพ์ + ไซส์ + จำนวน (เลือกหลายรายการผ่าน AssetPicker ของกลาง) ──
//    ไซส์ = "SKU" ของ artwork (1 ลายมีหลายไซส์) → ลายเดียวกันคนละไซส์ = คนละแถวได้ (ปุ่ม ⧉)
const sizeText = (s: AssetSize | null | undefined) => (s ? `${s.label ? `${s.label} · ` : ""}${s.w ?? "?"}×${s.h ?? "?"} ${s.unit}` : "");
function PrintItemsField({ value, onChange, disabled }: { value: PrintItem[]; onChange: (v: PrintItem[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const [availById, setAvailById] = useState<Record<string, AssetSize[]>>({});   // ไซส์ที่ artwork แต่ละลายมี (ไว้ทำ dropdown)
  const totalQty = value.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  // โหลดไซส์ของลายที่ยังไม่รู้ (ตอนเปิดของเดิมมาแก้)
  useEffect(() => {
    const missing = [...new Set(value.map((i) => i.asset_id))].filter((id) => !(id in availById));
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((id) => apiFetch(`/api/assets/${id}`).then((r) => r.json()).then((j) => [id, (j.data?.sizes ?? []) as AssetSize[]] as const).catch(() => [id, [] as AssetSize[]] as const)))
      .then((pairs) => { if (alive) setAvailById((m) => ({ ...m, ...Object.fromEntries(pairs) })); });
    return () => { alive = false; };
  }, [value, availById]);

  const addPicked = (rows: AssetRow[]) => {
    const have = new Set(value.map((i) => i.asset_id));
    const fresh = rows.filter((r) => !have.has(r.id));
    setAvailById((m) => ({ ...m, ...Object.fromEntries(rows.map((r) => [r.id, r.sizes ?? []])) }));
    const added: PrintItem[] = fresh.map((r) => ({
      asset_id: r.id, title: r.title || r.file_name, url: r.url ?? null,
      size: (r.sizes ?? []).length === 1 ? r.sizes[0] : null,   // มีไซส์เดียว → เลือกให้เลย
      qty: 1,
    }));
    if (added.length) onChange([...value, ...added]);
    setOpen(false);
  };

  const patchAt = (idx: number, p: Partial<PrintItem>) => onChange(value.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const dupAt = (idx: number) => onChange([...value.slice(0, idx + 1), { ...value[idx], size: null, qty: 1 }, ...value.slice(idx + 1)]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-slate-500">{t("🎨 Artwork ในแผ่นนี้", "🎨 Artwork on this sheet")} {value.length > 0 && <span className="text-slate-400">({value.length} {t("รายการ · รวม", "items · total")} {totalQty} {t("ชิ้น", "pcs")})</span>}</span>
        {!disabled && <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50">{t("＋ เลือก Artwork", "＋ Select Artwork")}</button>}
      </div>

      {value.length === 0 ? (
        <p className="text-[11px] text-slate-400">{t("ยังไม่ได้เลือก Artwork", "No Artwork selected")}</p>
      ) : (
        <div className="space-y-1">
          {value.map((it, idx) => {
            const avail = availById[it.asset_id] ?? [];
            const curKey = it.size ? sizeText(it.size) : "";
            const needSize = avail.length > 1 && !it.size;   // มีหลายไซส์แต่ยังไม่เลือก → เตือน
            return (
              <div key={`${it.asset_id}-${idx}`} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${needSize ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                {it.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={withImageWidth(it.url, 80) ?? it.url} alt="" className="w-8 h-8 rounded object-contain border border-slate-200 bg-slate-50 shrink-0" />
                  : <span className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs shrink-0">🎨</span>}
                <span className="flex-1 min-w-0 text-[12px] text-slate-700 truncate" title={it.title}>{it.title}</span>

                {/* ไซส์ที่ใช้ (เหมือนเลือก SKU ของลายนี้) */}
                {avail.length > 0 ? (
                  <select value={curKey} disabled={disabled}
                    onChange={(e) => patchAt(idx, { size: avail.find((s) => sizeText(s) === e.target.value) ?? null })}
                    className={`h-7 px-1.5 text-[11px] border rounded-lg bg-white max-w-[9.5rem] ${needSize ? "border-amber-400 text-amber-700" : "border-slate-200"}`}>
                    <option value="">{t("— เลือกไซส์ —", "— Select size —")}</option>
                    {avail.map((s) => <option key={sizeText(s)} value={sizeText(s)}>{sizeText(s)}</option>)}
                  </select>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0">{it.size ? sizeText(it.size) : t("ลายนี้ยังไม่ใส่ไซส์", "no size set for this design")}</span>
                )}

                <input type="number" min={1} value={it.qty} disabled={disabled}
                  onChange={(e) => patchAt(idx, { qty: Math.max(1, Math.round(Number(e.target.value)) || 1) })}
                  className="w-14 h-7 px-2 text-[12px] text-center border border-slate-200 rounded-lg disabled:bg-slate-50" />
                <span className="text-[10px] text-slate-400 shrink-0">{t("ชิ้น", "pcs")}</span>
                {!disabled && <>
                  <button type="button" onClick={() => dupAt(idx)} className="text-slate-400 hover:text-indigo-600 shrink-0 text-xs" title={t("เพิ่มลายนี้อีกไซส์", "Add another size for this design")}>⧉</button>
                  <button type="button" onClick={() => removeAt(idx)} className="text-slate-400 hover:text-red-500 shrink-0 text-sm" title={t("เอาออก", "Remove")}>✕</button>
                </>}
              </div>
            );
          })}
        </div>
      )}

      <AssetPicker open={open} onClose={() => setOpen(false)} onSelect={addPicked} multiple typeFilter="image"
        defaultSource="artwork" title={t("เลือก Artwork ที่อยู่ในแผ่นนี้", "Select the Artwork on this sheet")} />
    </div>
  );
}

// ── เพิ่มงานพิมพ์ (DTF/UV) — รูป preview + ไฟล์ .ai/.pdf ขึ้นโฟลเดอร์ Drive + ประเภท/ขนาดแผ่น ──
function PrintJobAddModal({ actor, printTypes, collections, defaultCollectionIds, initialFile, onClose, onDone }: {
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
type MassPrintRow = { id: number; file: File; preview: string | null; name: string; sizes: AssetSize[]; group: string; srcFiles: File[]; printItems: PrintItem[] };
function MassPrintModal({ actor, printTypes, collections, defaultCollectionIds, initialFiles, onClose, onDone }: {
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

// ── จัดการประเภทงานพิมพ์ (DTF/UV/…) + ขนาดเริ่มต้นต่อประเภท — ตั้งค่าเองได้ ไม่ต้องแก้โค้ด ──
function ManagePrintTypesModal({ types, onClose, onChanged }: { types: PrintType[]; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const t = useT();
  const [rows, setRows] = useState<PrintType[]>(types);
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState({ code: "", name: "", w: "", h: "", unit: "cm", sub: "" });
  const [delTarget, setDelTarget] = useState<PrintType | null>(null);
  const [root, setRoot] = useState<{ folder_id: string; local_base_path: string }>({ folder_id: "", local_base_path: "" });
  const [rootBusy, setRootBusy] = useState(false);
  const [rootEdit, setRootEdit] = useState(false);   // ตั้งค่าแล้ว = โชว์แบบ readonly มีปุ่มแก้ไข

  useEffect(() => { apiFetch("/api/ui-config?key=print_drive_root").then((r) => r.json()).then((j) => setRoot({ folder_id: String(j.value?.folder_id ?? ""), local_base_path: String(j.value?.local_base_path ?? "") })).catch(() => {}); }, []);
  const saveRoot = async (next: { folder_id: string; local_base_path: string }) => {
    setRootBusy(true);
    try { await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "print_drive_root", value: next }) }); }
    catch { toast.error(t("บันทึกโฟลเดอร์แม่ไม่สำเร็จ", "Failed to save parent folder")); } finally { setRootBusy(false); }
  };

  const reload = async () => {
    try { const j = await (await apiFetch(`/api/print-types?_=${Date.now()}`)).json(); setRows((j.data ?? []) as PrintType[]); } catch { /* ignore */ }
    await onChanged();
  };

  const add = async () => {
    const code = nc.code.trim(); if (!code) { toast.error(t("ใส่รหัสประเภทก่อน (เช่น DTF)", "Enter a type code first (e.g. DTF)")); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/print-types", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: nc.name.trim() || code, default_w: nc.w, default_h: nc.h, unit: nc.unit, drive_subpath: nc.sub }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("เพิ่มไม่สำเร็จ", "Failed to add"));
      setNc({ code: "", name: "", w: "", h: "", unit: "cm", sub: "" }); toast.success(`${t("เพิ่ม", "Added")} “${code}”`); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มไม่สำเร็จ", "Failed to add")); }
    finally { setBusy(false); }
  };

  const patch = async (pt: PrintType, body: Record<string, unknown>) => {
    try {
      const res = await apiFetch(`/api/print-types/${pt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("แก้ไม่สำเร็จ", "Edit failed"));
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ไม่สำเร็จ", "Edit failed")); }
  };

  const doDelete = async () => {
    const dt = delTarget; if (!dt) return; setDelTarget(null); setBusy(true);
    try {
      const res = await apiFetch(`/api/print-types/${dt.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || t("ลบไม่สำเร็จ", "Delete failed"));
      toast.success(`${t("ปิดใช้", "Disabled")} “${dt.code}”`); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
    finally { setBusy(false); }
  };

  const inp = "h-8 px-2 text-[12px] border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title={t("⚙️ ประเภทงานพิมพ์", "⚙️ Print types")} size="md"
      description={t("ตั้งขนาดเริ่มต้นต่อประเภท — เลือกประเภทตอนเพิ่มงานพิมพ์แล้วจะเติมขนาดให้เอง (แก้ทับได้)", "Set a default size per type — picking a type when adding a print job fills in the size for you (overridable)")}
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
      {/* โฟลเดอร์แม่ของงานพิมพ์ — งานพิมพ์ทุกชิ้นไปที่นี่ (ไม่สนแบรนด์) · ตั้งแล้ว = readonly + ปุ่มแก้ */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 mb-3">
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <p className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5">{t("📁 โฟลเดอร์แม่ของงานพิมพ์", "📁 Print jobs parent folder")} <HelpButton guideKey="drive-setup" label={t("ตั้งค่า Drive", "Set up Drive")} /></p>
          {root.folder_id && !rootEdit && <button type="button" onClick={() => setRootEdit(true)} className="text-[11px] text-indigo-600 hover:underline shrink-0">{t("✏️ แก้ไข", "✏️ Edit")}</button>}
        </div>
        {root.folder_id && !rootEdit ? (
          // โหมดอ่าน — ตั้งค่าแล้ว
          <div className="space-y-0.5">
            <p className="text-[11px] text-slate-500">Folder ID: <span className="font-mono text-slate-700">{root.folder_id}</span></p>
            {root.local_base_path && <p className="text-[11px] text-slate-500">{t("path ในเครื่อง:", "Local path:")} <span className="font-mono text-slate-700">{root.local_base_path}</span></p>}
            <p className="text-[10px] text-emerald-600 mt-0.5">{t("✓ งานพิมพ์ทุกชิ้นจะเก็บใต้โฟลเดอร์นี้ (ไม่แยกตามแบรนด์)", "✓ Every print job is stored under this folder (not split by brand)")}</p>
          </div>
        ) : (
          // โหมดแก้ไข
          <>
            <p className="text-[10px] text-slate-500 mb-1.5">{t("งานพิมพ์ทุกชิ้นจะเก็บใต้โฟลเดอร์นี้ (ไม่แยกตามแบรนด์) · ต้องแชร์โฟลเดอร์นี้ให้ Service Account เดิมก่อน", "Every print job is stored under this folder (not split by brand) · share this folder with the same Service Account first")}</p>
            <label className="block text-[11px] text-slate-500">Folder ID <span className="text-slate-300">{t("(จาก URL หลัง /folders/)", "(from the URL after /folders/)")}</span>
              <input defaultValue={root.folder_id} onBlur={(e) => { const v = e.target.value.trim(); if (v !== root.folder_id) { const nx = { ...root, folder_id: v }; setRoot(nx); void saveRoot(nx); } }}
                placeholder={t("เช่น 1mCsDfY-E15CHm46_Vvwg9U", "e.g. 1mCsDfY-E15CHm46_Vvwg9U")} className={`${inp} font-mono mt-0.5`} /></label>
            <label className="block text-[11px] text-slate-500 mt-1.5">{t("path ในเครื่อง", "Local path")} <span className="text-slate-300">{t("(ถ้ามี — ไว้ทำ path ต้นฉบับ)", "(if any — used to build the source path)")}</span>
              <input defaultValue={root.local_base_path} onBlur={(e) => { const v = e.target.value.trim(); if (v !== root.local_base_path) { const nx = { ...root, local_base_path: v }; setRoot(nx); void saveRoot(nx); } }}
                placeholder={t("เช่น G:\Shared drives\Printed", "e.g. G:\Shared drives\Printed")} className={`${inp} font-mono mt-0.5`} /></label>
            <div className="flex items-center justify-between mt-1">
              {rootBusy ? <span className="text-[10px] text-indigo-500">{t("กำลังบันทึก…", "Saving…")}</span>
                : !root.folder_id ? <span className="text-[10px] text-amber-600">{t("⚠ ยังไม่ตั้ง — งานพิมพ์จะไปโฟลเดอร์แม่หลัก/ตามแบรนด์แทน", "⚠ Not set yet — print jobs will go to the main parent folder / by brand instead")}</span>
                : <span />}
              {root.folder_id && <button type="button" onClick={() => setRootEdit(false)} className="text-[11px] text-slate-500 hover:text-slate-700">{t("เสร็จ", "Done")}</button>}
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5 mb-3">
        {rows.length === 0 && <p className="text-[12px] text-slate-400 py-3 text-center">{t("ยังไม่มีประเภทงานพิมพ์", "No print types yet")}</p>}
        {rows.map((pt) => (
          <div key={pt.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="w-20 font-mono text-[12px] text-slate-700 truncate">{pt.code}</span>
              <input defaultValue={pt.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== pt.name) void patch(pt, { name: v }); }}
                className={`${inp} flex-1`} placeholder={t("ชื่อที่แสดง", "Display name")} />
              <div className="flex items-center gap-1">
                <input defaultValue={pt.default_w ?? ""} inputMode="decimal" placeholder={t("กว้าง", "Width")}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(pt.default_w ?? "")) void patch(pt, { default_w: v }); }}
                  className={`${inp} w-12 text-center`} />
                <span className="text-slate-300 text-[11px]">×</span>
                <input defaultValue={pt.default_h ?? ""} inputMode="decimal" placeholder={t("สูง", "Height")}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(pt.default_h ?? "")) void patch(pt, { default_h: v }); }}
                  className={`${inp} w-12 text-center`} />
                <span className="text-[10px] text-slate-400">{pt.unit}</span>
              </div>
              <button onClick={() => setDelTarget(pt)} disabled={busy} className="w-6 text-slate-400 hover:text-red-500 text-sm" title={t("ปิดใช้ประเภทนี้", "Disable this type")}>🗑</button>
            </div>
            <div className="flex items-center gap-1.5 mt-1 pl-[5.5rem]">
              <span className="text-[10px] text-slate-400 shrink-0">{t("📁 โฟลเดอร์ Drive", "📁 Drive folder")}</span>
              <input defaultValue={pt.drive_subpath ?? ""} placeholder={t("เช่น Printed/DTF (เว้นว่าง = ใช้รหัส)", "e.g. Printed/DTF (blank = use the code)")}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (pt.drive_subpath ?? "")) void patch(pt, { drive_subpath: v }); }}
                className={`${inp} flex-1 font-mono`} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-2.5">
        <p className="text-[11px] font-medium text-slate-500 mb-1.5">{t("+ เพิ่มประเภทใหม่", "+ Add a new type")}</p>
        <div className="flex items-center gap-2">
          <input value={nc.code} onChange={(e) => setNc((s) => ({ ...s, code: e.target.value }))} placeholder={t("รหัส เช่น SCREEN", "code, e.g. SCREEN")} className={`${inp} w-24`} />
          <input value={nc.name} onChange={(e) => setNc((s) => ({ ...s, name: e.target.value }))} placeholder={t("ชื่อที่แสดง", "Display name")} className={`${inp} flex-1`} />
          <input value={nc.w} onChange={(e) => setNc((s) => ({ ...s, w: e.target.value }))} inputMode="decimal" placeholder={t("กว้าง", "Width")} className={`${inp} w-14 text-center`} />
          <span className="text-slate-300 text-[11px]">×</span>
          <input value={nc.h} onChange={(e) => setNc((s) => ({ ...s, h: e.target.value }))} inputMode="decimal" placeholder={t("สูง", "Height")} className={`${inp} w-14 text-center`} />
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <input value={nc.sub} onChange={(e) => setNc((s) => ({ ...s, sub: e.target.value }))} placeholder={t("📁 โฟลเดอร์ Drive เช่น Printed/SCREEN", "📁 Drive folder, e.g. Printed/SCREEN")} className={`${inp} flex-1 font-mono`} />
          <button onClick={add} disabled={busy} className="h-8 px-3 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
        </div>
      </div>

      {delTarget && (
        <ConfirmDialog open title={t("ปิดใช้ประเภทนี้?", "Disable this type?")} variant="danger" confirmText={t("ปิดใช้", "Disable")}
          message={`“${delTarget.code}” ${t("จะไม่โผล่ให้เลือกอีก · งานพิมพ์เดิมที่ใช้ประเภทนี้ยังอยู่ครบ", "won't appear for selection anymore · existing print jobs using this type stay intact")}`}
          onConfirm={doDelete} onClose={() => setDelTarget(null)} />
      )}
    </ERPModal>
  );
}

// ── จัดการชนิด Artwork (lookup กลาง: เพิ่ม/แก้/ลบ) ──
function ManageTypesModal({ types, onClose, onChanged }: { types: LookupItem[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const t = useT();
  const [items, setItems] = useState<LookupItem[]>(types);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      // bust cache — GET /api/lookups ตั้ง max-age=600 ไม่งั้นได้ลิสต์เก่าหลังเพิ่ม/ลบ/แก้ (ดูเหมือนทำไม่ได้)
      const r = await apiFetch(`/api/lookups?type=artwork_type&_=${Date.now()}`); const j = await r.json();
      setItems(((j.data ?? []) as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })));
    } catch { /* ignore */ }
    onChanged();
  };
  const add = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/lookups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookup_type: "artwork_type", name: n }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setNewName(""); await reload(); toast.success(t("เพิ่มชนิดแล้ว", "Type added"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มไม่สำเร็จ", "Failed to add")); } finally { setBusy(false); }
  };
  const rename = async (id: string, name: string) => {
    const n = name.trim(); if (!n) return;
    try {
      const r = await apiFetch(`/api/lookups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
      const j = await r.json(); if (j.error) throw new Error(j.error); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ไม่สำเร็จ", "Edit failed")); }
  };
  const del = async (id: string) => {
    try {
      const r = await apiFetch(`/api/lookups/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({})); if (j.error) throw new Error(j.error);
      await reload(); toast.success(t("ลบแล้ว", "Deleted"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
  };

  return (
    <ERPModal open onClose={onClose} title={t("จัดการชนิด Artwork", "Manage Artwork types")} size="sm"
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
      <div className="flex flex-col gap-1.5 mb-3">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input defaultValue={it.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.name) void rename(it.id, v); }}
              className="flex-1 h-8 px-2 text-[13px] border border-slate-200 rounded-lg" />
            <button onClick={() => del(it.id)} className="h-8 px-2.5 text-[12px] text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">{t("ลบ", "Delete")}</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-[12px] text-slate-400">{t("ยังไม่มีชนิด — เพิ่มด้านล่าง", "No types yet — add one below")}</p>}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("ชนิดใหม่ เช่น แบนเนอร์", "new type, e.g. banner")}
          className="flex-1 h-8 px-2 text-[13px] border border-slate-200 rounded-lg" />
        <button onClick={add} disabled={busy || !newName.trim()} className="h-8 px-3 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("＋ เพิ่ม", "＋ Add")}</button>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">{t("แก้ชื่อ: พิมพ์ทับในช่องแล้วคลิกที่อื่นเพื่อบันทึก · ลบแล้วงานเดิมยังเก็บชื่อชนิดไว้", "Rename: type over the field then click elsewhere to save · after deleting, existing items keep their type name")}</p>
    </ERPModal>
  );
}

// ── หาโฟลเดอร์ Drive ที่ยังไม่เชื่อม → สแกน → กรอกรายละเอียด → นำเข้า ──
type ScanFolder = { folderId: string; folderName: string; folderLink: string; typeSubName: string; artworkType: string; master_path: string; newCount?: number; total?: number };
type ImportRow = { key: string; folderName: string; folderLink: string; master_path: string; fileId: string; fileName: string; title: string; types: string[]; sizes: AssetSize[]; parentCodes: string[] };
function DriveScanModal({ artTypes, presetFolder, onClose, onDone }: { artTypes: LookupItem[]; presetFolder?: { folderId: string; folderName: string; folderLink: string } | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandId, setBrandId] = useState("");
  const t = useT();
  const [scanning, setScanning] = useState(false);
  const [folders, setFolders] = useState<ScanFolder[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"scan" | "form">(presetFolder ? "form" : "scan");   // preset = เจาะโฟลเดอร์เดียว ข้ามขั้นสแกน
  const [loadingImgs, setLoadingImgs] = useState(!!presetFolder);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [cols, setCols] = useState<AssetCollection[]>([]);
  const [batchAlbums, setBatchAlbums] = useState<string[]>([]);
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchKw, setBatchKw] = useState("");
  const [batchTypes, setBatchTypes] = useState<string[]>([]);       // ชนิด → ใส่ทุกใบ
  const [batchParents, setBatchParents] = useState<string[]>([]);   // Parent SKU → ใส่ทุกใบ
  const [impProg, setImpProg] = useState<{ done: number; total: number } | null>(null);   // ความคืบหน้านำเข้า (ยิงทีละชุด)
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/assets/collections").then((r) => r.json()).then((j) => setCols((j.data ?? []) as AssetCollection[])).catch(() => {}); }, []);
  useEffect(() => { setArtTypeList((cur) => { const s = new Set(cur.map((t) => t.name)); return [...cur, ...artTypes.filter((t) => !s.has(t.name))]; }); }, [artTypes]);

  const scan = async () => {
    if (!brandId) { toast.error(t("เลือกแบรนด์ก่อน", "Select a brand first")); return; }
    setScanning(true); setFolders(null); setSel(new Set()); setStep("scan");
    try {
      const res = await apiFetch("/api/assets/drive-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("สแกนไม่สำเร็จ", "Scan failed"));
      const fs = (j.folders ?? []) as ScanFolder[];
      setFolders(fs); setScanned(j.scanned ?? 0); setSel(new Set(fs.map((f) => f.folderId)));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สแกนไม่สำเร็จ", "Scan failed")); }
    finally { setScanning(false); }
  };

  // ดึงรูปในโฟลเดอร์ที่เลือก (เฉพาะที่ยังไม่ลงคลัง) → สร้างแถวฟอร์ม (1 แถว/รูป) · คืน true ถ้ามีรูปใหม่
  const buildRows = async (picked: ScanFolder[]): Promise<boolean> => {
    setLoadingImgs(true);
    try {
      const res = await apiFetch("/api/drive/folder-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_ids: picked.map((f) => f.folderId), only_new: true }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ดึงรูปไม่สำเร็จ", "Failed to fetch images"));
      const imgMap = (j.images ?? {}) as Record<string, { id: string; name: string; width?: number; height?: number }[]>;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const sizesFrom = (w?: number, h?: number): AssetSize[] => (w && h) ? [{ label: "ขนาด #1", w: r2(w / DEFAULT_DPI * 2.54), h: r2(h / DEFAULT_DPI * 2.54), unit: "cm" }] : [];   // px÷300×2.54 (งาน export 300 DPI)
      const newRows: ImportRow[] = []; let n = 0;
      for (const f of picked) for (const img of (imgMap[f.folderId] ?? [])) {
        newRows.push({ key: `r${n++}`, folderName: f.folderName, folderLink: f.folderLink, master_path: f.master_path, fileId: img.id, fileName: img.name, title: img.name.replace(/\.[^.]+$/, "").trim() || f.folderName, types: f.artworkType ? [f.artworkType] : [], sizes: sizesFrom(img.width, img.height), parentCodes: [] });
      }
      if (!newRows.length) { toast.error(t("ไม่มีรูปใหม่ที่ยังไม่ลงในโฟลเดอร์นี้ — ลงครบแล้ว", "No new images left to add in this folder — all done")); return false; }
      setRows(newRows); setStep("form"); return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ดึงรูปไม่สำเร็จ", "Failed to fetch images")); return false; }
    finally { setLoadingImgs(false); }
  };

  // ไปขั้นกรอกรายละเอียด (โหมดสแกนทั้งแบรนด์): เอาโฟลเดอร์ที่ติ๊กไว้
  const toForm = async () => {
    const picked = (folders ?? []).filter((f) => sel.has(f.folderId));
    if (!picked.length) { toast.error(t("เลือกโฟลเดอร์ก่อน", "Select a folder first")); return; }
    await buildRows(picked);
  };

  // โหมดเจาะโฟลเดอร์เดียว (จากมุมมองโฟลเดอร์) → ดึงรูปยังไม่ลงของโฟลเดอร์นั้นทันที ไม่มีรูปใหม่ก็ปิด
  const presetRan = useRef(false);
  useEffect(() => {
    if (!presetFolder || presetRan.current) return;
    presetRan.current = true;
    (async () => {
      const ok = await buildRows([{ folderId: presetFolder.folderId, folderName: presetFolder.folderName, folderLink: presetFolder.folderLink, typeSubName: "", artworkType: "", master_path: "" }]);
      if (!ok) onClose();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFolder]);

  const setRow = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // นำเข้า — ยิงทีละชุด (4 รูป/รอบ) กัน timeout รูปเยอะ · อ่าน response แบบกัน JSON พัง
  const doImport = async () => {
    if (!rows.length) { toast.error(t("ไม่มีรายการ", "Nothing to import")); return; }
    setImporting(true);
    const items = rows.map((r) => ({ fileId: r.fileId, fileName: r.fileName, folderLink: r.folderLink, master_path: r.master_path, title: r.title, artwork_types: r.types, sizes: r.sizes, parent_sku_codes: r.parentCodes }));
    const CHUNK = 4;
    let imported = 0, failed = 0;
    try {
      for (let i = 0; i < items.length; i += CHUNK) {
        setImpProg({ done: i, total: items.length });
        const slice = items.slice(i, i + CHUNK);
        const res = await apiFetch("/api/assets/drive-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, items: slice, tags: batchTags, keywords: batchKw.trim(), collection_ids: batchAlbums }) });
        const txt = await res.text();
        let j: { imported?: number; failed?: number; error?: string };
        try { j = txt ? JSON.parse(txt) : {}; }
        catch { throw new Error(res.status >= 500 ? t("เซิร์ฟเวอร์ทำงานนานเกินไป — ลองแบ่งนำเข้าน้อยลง", "The server took too long — try importing fewer at a time") : (txt.slice(0, 100) || t("ตอบกลับไม่ถูกต้อง", "Invalid response"))); }
        if (!res.ok || j.error) throw new Error(j.error || t("นำเข้าไม่สำเร็จ", "Import failed"));
        imported += j.imported ?? 0; failed += j.failed ?? 0;
      }
      setImpProg(null);
      toast.success(`${t("นำเข้า", "Imported")} ${imported} ${t("รูปแล้ว", "images")}${failed ? ` · ${t("ล้มเหลว", "failed")} ${failed}` : ""}`);
      onDone();
    } catch (e) {
      setImpProg(null);
      toast.error(`${e instanceof Error ? e.message : t("นำเข้าไม่สำเร็จ", "Import failed")}${imported ? ` ${t("(นำเข้าไปแล้ว", "(imported")} ${imported} ${t("ก่อนหยุด)", "before stopping)")}` : ""}`);
    } finally { setImporting(false); }
  };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const busy = scanning || loadingImgs || importing;

  return (
    <ERPModal open onClose={onClose} title={presetFolder ? `${t("🔍 หารูปที่ยังไม่ลงในโฟลเดอร์", "🔍 Find images not yet added in folder")} “${presetFolder.folderName}”` : t("🔍 หารูปใน Drive ที่ยังไม่ลงคลัง", "🔍 Find Drive images not yet in the library")} size="xl"
      description={presetFolder ? t("รูปในโฟลเดอร์นี้ที่ยังไม่ได้ลงคลัง — กรอกรายละเอียดแล้วนำเข้าได้เลย", "Images in this folder not yet in the library — fill in details and import") : step === "scan" ? t("เลือกแบรนด์ → สแกน → เลือกโฟลเดอร์ที่มีรูปยังไม่ลง → กรอกรายละเอียดก่อนนำเข้า", "Pick a brand → scan → select folders with images not yet added → fill in details before importing") : t("กรอกรายละเอียดแต่ละรูป (เหมือนเพิ่มรูปใหม่) แล้วนำเข้า", "Fill in details for each image (like adding a new image), then import")}
      footer={
        step === "scan" ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] text-slate-400">{folders ? `${t("มีรูปใหม่", "New images in")} ${folders.length} ${t("โฟลเดอร์ · เลือก", "folders · selected")} ${sel.size}` : ""}</span>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
              <button onClick={toForm} disabled={busy || !sel.size} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("ถัดไป — กรอกรายละเอียด", "Next — fill in details")} ({sel.size})</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <button onClick={() => (presetFolder ? onClose() : setStep("scan"))} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{presetFolder ? t("ปิด", "Close") : t("‹ กลับ", "‹ Back")}</button>
            <button onClick={doImport} disabled={busy || !rows.length} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{importing && <Spinner />}{importing ? t("กำลังนำเข้า…", "Importing…") : `${t("นำเข้า", "Import")} ${rows.length} ${t("รูป", "images")}`}</button>
          </div>
        )
      }>
      {busy && <LoadingOverlay message={scanning ? t("กำลังสแกน Drive…", "Scanning Drive…") : loadingImgs ? t("กำลังดึงรายการรูป…", "Loading image list…") : impProg ? `${t("กำลังนำเข้า", "Importing")} ${impProg.done}/${impProg.total} ${t("รูป…", "images…")}` : t("กำลังนำเข้า + ดึงรูป…", "Importing + fetching images…")} />}

      {step === "scan" ? (
        <>
          <div className="flex items-end gap-2 mb-3">
            <label className="flex-1 text-[12px] text-slate-500">{t("แบรนด์", "Brand")}
              <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setFolders(null); }}
                className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">{t("— เลือกแบรนด์ —", "— Select brand —")}</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
            <button onClick={scan} disabled={scanning || !brandId} className="h-9 px-4 text-sm font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50">{t("🔍 สแกน", "🔍 Scan")}</button>
          </div>
          {folders === null ? (
            <p className="text-[12px] text-slate-400 py-8 text-center">{t("เลือกแบรนด์แล้วกด “สแกน”", "Pick a brand then click “Scan”")}</p>
          ) : folders.length === 0 ? (
            <p className="text-[13px] text-emerald-600 py-8 text-center">{t("🎉 รูปในโฟลเดอร์ลงคลังครบแล้ว (สแกน", "🎉 All images in the folders are in the library (scanned")} {scanned} {t("โฟลเดอร์)", "folders)")}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] text-slate-600">{t("เจอ", "Found")} <b>{folders.length}</b> {t("โฟลเดอร์ที่มีรูปยังไม่ลง (จาก", "folders with images not yet added (of")} {scanned})</p>
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => setSel(new Set(folders.map((f) => f.folderId)))} className="text-indigo-600 hover:underline">{t("เลือกทั้งหมด", "Select all")}</button>
                  <button onClick={() => setSel(new Set())} className="text-slate-500 hover:underline">{t("ไม่เลือก", "Clear")}</button>
                </div>
              </div>
              <div className="space-y-1 max-h-[46vh] overflow-y-auto pr-1">
                {folders.map((f) => (
                  <label key={f.folderId} className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer ${sel.has(f.folderId) ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200"}`}>
                    <input type="checkbox" checked={sel.has(f.folderId)} onChange={() => toggle(f.folderId)} className="w-4 h-4 accent-indigo-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="text-[13px] text-slate-700 truncate block">📁 {f.folderName}</span>
                      <span className="text-[10px] text-slate-400 font-mono truncate block">{f.typeSubName}{f.artworkType && f.artworkType !== f.typeSubName ? ` · ${f.artworkType}` : ""}</span>
                    </span>
                    {f.newCount != null && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200" title={`${t("ในโฟลเดอร์มี", "Folder has")} ${f.total ?? "?"} ${t("รูป", "images")}`}>
                        +{f.newCount} {t("รูปใหม่", "new")}{f.total != null && f.total > f.newCount ? ` / ${f.total}` : ""}
                      </span>
                    )}
                    <a href={f.folderLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-indigo-600 hover:underline shrink-0">{t("เปิด ›", "Open ›")}</a>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {/* batch ใช้กับทุกรูป */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2.5">
            <p className="text-[11px] font-medium text-slate-500">{t("ใช้กับทุกรูป", "Applies to all images")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-[12px] text-slate-500">{t("อัลบั้ม", "Album")}
                <div className="mt-0.5"><CollectionMultiSelect value={batchAlbums} collections={cols} onChange={setBatchAlbums} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
              <div className="text-[12px] text-slate-500">{t("แท็ก", "Tags")}
                <div className="mt-0.5"><TagPickerField value={batchTags} onChange={setBatchTags} /></div></div>
            </div>
            <label className="block text-[12px] text-slate-500">{t("คำค้นเพิ่มเติม (keyword)", "Extra keywords")}
              <input value={batchKw} onChange={(e) => setBatchKw(e.target.value)} placeholder={t("เช่น flower ดอกไม้ summer", "e.g. flower summer")}
                className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-200/70">
              <div className="text-[12px] text-slate-500">
                <div className="flex items-center gap-2">{t("ชนิด (ใส่ทุกใบ)", "Type (apply to all)")}
                  {batchTypes.length > 0 && rows.length > 0 && <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, types: [...batchTypes] })))} className="text-[10px] text-indigo-600 hover:underline">{t("→ ใส่ทุกใบ", "→ Apply to all")}</button>}</div>
                <div className="mt-0.5"><ArtTypeMultiSelect value={batchTypes} types={artTypeList} onChange={setBatchTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div>
              </div>
              <div className="text-[12px] text-slate-500">
                <div className="flex items-center gap-2">Parent SKU {t("(ใส่ทุกใบ)", "(apply to all)")}
                  {batchParents.length > 0 && rows.length > 0 && <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, parentCodes: [...batchParents] })))} className="text-[10px] text-indigo-600 hover:underline">{t("→ ใส่ทุกใบ", "→ Apply to all")}</button>}</div>
                <div className="mt-0.5"><ParentSkuField value={batchParents} onChange={setBatchParents} /></div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.key} className="border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-start gap-2.5">
                  <img src={`/api/drive/thumb?id=${encodeURIComponent(r.fileId)}&w=180`} alt="" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    className="w-14 h-14 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} placeholder={t("ชื่อรูป", "Image name")}
                        className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} title={t("เอาออก", "Remove")}
                        className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded shrink-0">🗑</button>
                    </div>
                    <ArtTypeMultiSelect value={r.types} types={artTypeList} onChange={(v) => setRow(r.key, { types: v })} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
                    <p className="text-[10px] text-slate-400 font-mono truncate">📁 {r.folderName} · {r.fileName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2">
                  <div><p className="text-[11px] text-slate-500 mb-1">{t("📐 ขนาด (กว้าง × สูง)", "📐 Size (W × H)")}</p><SizesEditor value={r.sizes} onChange={(v) => setRow(r.key, { sizes: v })} /></div>
                  <div><p className="text-[11px] text-slate-500 mb-1">{t("📦 Parent SKU ที่ใช้", "📦 Parent SKUs used")}</p><ParentSkuField value={r.parentCodes} onChange={(v) => setRow(r.key, { parentCodes: v })} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ERPModal>
  );
}

// ── ตัวแก้ "หลายไซส์" (กว้าง×สูง + ชื่อกำกับ + หน่วยต่อไซส์) ──
const SIZE_UNITS: { v: AssetSize["unit"]; label: string; en: string }[] = [
  { v: "cm", label: "ซม.", en: "cm" }, { v: "mm", label: "มม.", en: "mm" }, { v: "in", label: "นิ้ว", en: "in" }, { v: "px", label: "px", en: "px" },
];
function SizesEditor({ value, onChange, disabled }: { value: AssetSize[]; onChange: (v: AssetSize[]) => void; disabled?: boolean }) {
  const t = useT();
  const set = (i: number, patch: Partial<AssetSize>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled}
            placeholder={t("ชื่อไซส์ เช่น ป้ายใหญ่", "size name, e.g. large label")} className="flex-1 min-w-0 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <input type="number" value={s.w ?? ""} onChange={(e) => set(i, { w: numOrNull(e.target.value) })} disabled={disabled}
            placeholder={t("กว้าง", "Width")} className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <span className="text-slate-400 text-xs">×</span>
          <input type="number" value={s.h ?? ""} onChange={(e) => set(i, { h: numOrNull(e.target.value) })} disabled={disabled}
            placeholder={t("สูง", "Height")} className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <select value={s.unit} onChange={(e) => set(i, { unit: e.target.value as AssetSize["unit"] })} disabled={disabled}
            className="h-8 px-1 text-[12px] border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
            {SIZE_UNITS.map((u) => <option key={u.v} value={u.v}>{t(u.label, u.en)}</option>)}
          </select>
          {!disabled && <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500 text-sm px-1">✕</button>}
        </div>
      ))}
      {disabled && value.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
      {!disabled && <button type="button" onClick={() => onChange([...value, { label: `ขนาด #${value.length + 1}`, w: null, h: null, unit: "cm" }])}
        className="self-start text-[12px] text-indigo-600 hover:underline">{t("＋ เพิ่มไซส์", "＋ Add size")}</button>}
    </div>
  );
}

// ── เลือก Parent SKU ที่ใช้ (multi) — ค้นจาก /api/sku-browser?entity=parent-skus ──
function ParentSkuField({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded">
            {c}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-violet-300 hover:text-rose-500 leading-none">✕</button>}
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่ผูก Parent SKU", "No Parent SKU linked")}</span>}
        {!disabled && <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50">{t("＋ เลือก Parent SKU", "＋ Select Parent SKU")}</button>}
      </div>
      {/* ของกลาง: ค้น + ไล่ดูทั้งหมด + แบ่งหน้า (Pager) — เลิกใช้ picker เขียนเองที่ตัดแค่ 40 รายการ */}
      <ParentSkuMultiPickerModal open={open} onClose={() => setOpen(false)} excludeCodes={value}
        title={t("เลือก Parent SKU ที่ใช้ artwork นี้", "Select Parent SKUs that use this artwork")}
        onConfirm={(items) => { onChange([...new Set([...value, ...items.map((x) => x.code)])]); setOpen(false); }} />
    </div>
  );
}


// ── เลือกแท็กแบบ "ปุ่มกด" (เก็บความรกของชิป/ตัวช่วยไว้ในป๊อปอัป) ──
function TagPickerField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-indigo-600 text-white">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="hover:bg-white/25 rounded-full w-3.5 h-3.5 leading-none flex items-center justify-center">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่มีแท็ก", "No tags yet")}</span>}
        <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50">{t("🏷️ เลือกแท็ก", "🏷️ Select tags")}</button>
      </div>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} title={t("เลือก / เพิ่มแท็ก", "Select / add tags")} size="sm"
          footer={<div className="flex justify-end w-full"><button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t("เสร็จ", "Done")}</button></div>}>
          <TagChips value={value} onChange={onChange} />
        </ERPModal>
      )}
    </div>
  );
}

// ── กฎ "โฟลเดอร์มาตรฐาน" (global) — เก็บใน ui_config key=artwork_path_rule ──
type PathRule = { base_paths: string[] };
function useArtworkPathRule(): [PathRule, boolean, () => void] {
  const [rule, setRule] = useState<PathRule>({ base_paths: [] });
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    apiFetch("/api/ui-config?key=artwork_path_rule").then((r) => r.json())
      .then((j) => { const v = (j.value ?? {}) as { base_paths?: unknown }; setRule({ base_paths: Array.isArray(v.base_paths) ? v.base_paths.map(String) : [] }); })
      .catch(() => {}).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return [rule, loaded, reload];
}
function pathMatchesRule(path: string, basePaths: string[]): boolean {
  if (!path.trim() || basePaths.length === 0) return true;   // ไม่ได้ตั้งกฎ / ยังไม่กรอก = ไม่เตือน
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase().trim().replace(/\/+$/, "");
  const p = norm(path);
  return basePaths.some((b) => b.trim() && p.startsWith(norm(b)));
}

// ต่อ path แบบ Windows: base คงรูป (drive letter / UNC) + ต่อชั้นถัด ๆ ด้วย "\" ข้ามชั้นที่ว่าง
function winJoin(base: string, ...rest: string[]): string {
  const b = base.trim().replace(/[\\/]+$/, "");
  const tail = rest.map((p) => p.trim().replace(/^[\\/]+|[\\/]+$/g, "")).filter(Boolean);
  return [b, ...tail].filter(Boolean).join("\\");
}

// แม็ป แบรนด์ → path ในเครื่อง (ฐาน) + ชนิด → ชื่อซับโฟลเดอร์ (ใช้ auto-fill master_path ให้ตรงโครง Drive)
function useDriveFolderMaps(): { brandBase: Record<string, string>; typeSub: Record<string, string> } {
  const [brandBase, setBrandBase] = useState<Record<string, string>>({});
  const [typeSub, setTypeSub] = useState<Record<string, string>>({});
  useEffect(() => {
    apiFetch("/api/drive/brand-folders").then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const r of (j.data ?? []) as { brand_id: string; local_base_path?: string | null }[]) if (r.local_base_path) m[r.brand_id] = r.local_base_path;
      setBrandBase(m);
    }).catch(() => {});
    apiFetch("/api/drive/folders").then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const r of (j.data ?? []) as { artwork_type: string; subfolder_name?: string | null }[]) if (r.subfolder_name) m[r.artwork_type] = r.subfolder_name;
      setTypeSub(m);
    }).catch(() => {});
  }, []);
  return { brandBase, typeSub };
}
// สร้าง path โฟลเดอร์ต้นฉบับตามแบรนด์: <ฐานในเครื่อง> \ <ซับตามชนิด> \ <ชื่องาน> (จบที่โฟลเดอร์ — ไม่ใส่นามสกุล)
// ไม่มีฐานของแบรนด์ = คืน "" (ให้ผู้เรียก fallback ไปกฎเดิม)
function brandFolderPath(name: string, brandId: string, firstType: string | undefined, brandBase: Record<string, string>, typeSub: Record<string, string>): string {
  const nm = name.trim(); if (!nm) return "";
  const base = brandId ? brandBase[brandId] : ""; if (!base) return "";
  const sub = firstType ? (typeSub[firstType] || firstType) : "";
  return winJoin(base, sub, nm);
}

// ตั้งค่าโฟลเดอร์ Drive: แบรนด์ → โฟลเดอร์ฐาน · ชนิด → ชื่อซับโฟลเดอร์ (โชว์เมื่อ Drive ตั้งค่าแล้ว)
function DriveFolderMap() {
  const toast = useToast();
  const t = useT();
  const [driveOn, setDriveOn] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [bDraft, setBDraft] = useState<Record<string, string>>({});   // brand_id → folder id
  const [bLabel, setBLabel] = useState<Record<string, string>>({});   // brand_id → ชื่อโฟลเดอร์ (ตรวจแล้ว)
  const [bLocal, setBLocal] = useState<Record<string, string>>({});   // brand_id → path ในเครื่อง (ฐาน)
  const [tDraft, setTDraft] = useState<Record<string, string>>({});   // type → subfolder name
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {});
    apiFetch("/api/lookups?type=artwork_type").then((r) => r.json()).then((j) => setTypes(((j.data ?? []) as { name: string }[]).map((x) => x.name).filter(Boolean))).catch(() => {});
    apiFetch("/api/drive/brand-folders").then((r) => r.json()).then((j) => {
      setDriveOn(!!j.configured);
      const d: Record<string, string> = {}, l: Record<string, string> = {}, lo: Record<string, string> = {};
      for (const r of (j.data ?? []) as { brand_id: string; folder_id: string | null; folder_label: string | null; local_base_path: string | null }[]) { d[r.brand_id] = r.folder_id ?? ""; l[r.brand_id] = r.folder_label ?? ""; lo[r.brand_id] = r.local_base_path ?? ""; }
      setBDraft(d); setBLabel(l); setBLocal(lo);
    }).catch(() => {});
    apiFetch("/api/drive/folders").then((r) => r.json()).then((j) => {
      const d: Record<string, string> = {};
      for (const r of (j.data ?? []) as { artwork_type: string; subfolder_name: string | null }[]) d[r.artwork_type] = r.subfolder_name ?? "";
      setTDraft(d);
    }).catch(() => {});
  }, []);
  const saveBrand = async (id: string) => {
    const fid = (bDraft[id] ?? "").trim();
    const lbp = (bLocal[id] ?? "").trim();
    try {
      if (!fid && !lbp) { await apiFetch(`/api/drive/brand-folders?brand_id=${encodeURIComponent(id)}`, { method: "DELETE" }); setBLabel((m) => { const n = { ...m }; delete n[id]; return n; }); toast.success(t("ล้างแล้ว", "Cleared")); return; }
      const res = await apiFetch("/api/drive/brand-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: id, folder_id: fid, local_base_path: lbp }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Save failed")); return; }
      setBLabel((m) => ({ ...m, [id]: j.folder_label ?? "" })); toast.success(j.pathUpdated ? `${t("บันทึกแล้ว · อัปเดต path", "Saved · updated path for")} ${j.pathUpdated} ${t("รูปตามฐานใหม่", "images to the new base")}` : t("บันทึกแล้ว", "Saved"));
    } catch { toast.error(t("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  const saveType = async (at: string) => {
    try {
      const res = await apiFetch("/api/drive/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artwork_type: at, subfolder_name: tDraft[at] ?? "" }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Save failed")); return; }
      const extra = [j.renamed ? `${t("เปลี่ยนชื่อโฟลเดอร์ Drive", "Renamed Drive folder")} ${j.renamed}` : "", j.pathUpdated ? `${t("อัปเดต path", "updated path")} ${j.pathUpdated} ${t("รูป", "images")}` : ""].filter(Boolean).join(" · ");
      toast.success(extra ? `${t("บันทึกแล้ว ·", "Saved ·")} ${extra}` : t("บันทึกแล้ว", "Saved"));
    } catch { toast.error(t("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  if (!driveOn) return null;
  return (
    <>
      <div className="mt-4 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">{t("📁 โฟลเดอร์ตามแบรนด์ (Drive folder id + path ในเครื่อง)", "📁 Folder by brand (Drive folder id + local path)")}</p>
        <p className="text-[11px] text-slate-400 mb-2">{t("Drive folder id = ที่อัปไฟล์ขึ้น (ต้องแชร์ให้ service account) · path ในเครื่อง = ฐานสำหรับเติมช่อง “path ต้นฉบับ” อัตโนมัติ เช่น", "Drive folder id = where files are uploaded (must be shared with the service account) · local path = base for auto-filling the “source path” field, e.g.")} <span className="font-mono">G:\Shared drives\Louis Montini\[01] Catalogs\01_Assets\[01] Louis Montini</span></p>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {brands.map((b) => (
            <div key={b.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex-1 text-[12px] text-slate-700 font-medium truncate" title={b.name}>{b.name}</span>
                {bLabel[b.id] && <span className="text-[11px] text-emerald-600 truncate max-w-[120px] shrink-0" title={bLabel[b.id]}>✓ {bLabel[b.id]}</span>}
                <button type="button" onClick={() => saveBrand(b.id)} className="h-7 px-2.5 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">{t("บันทึก", "Save")}</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-slate-400 shrink-0">Drive folder id</span>
                <input value={bDraft[b.id] ?? ""} onChange={(e) => setBDraft((d) => ({ ...d, [b.id]: e.target.value }))} placeholder={t("ปล่อยว่าง = ใช้โฟลเดอร์แม่", "leave blank = use parent folder")}
                  className="flex-1 h-7 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-24 text-[11px] text-slate-400 shrink-0">{t("path ในเครื่อง", "Local path")}</span>
                <input value={bLocal[b.id] ?? ""} onChange={(e) => setBLocal((d) => ({ ...d, [b.id]: e.target.value }))} placeholder="G:\Shared drives\…\[01] Louis Montini"
                  className="flex-1 h-7 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              </div>
            </div>
          ))}
          {brands.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่มีแบรนด์", "No brands yet")}</p>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">{t("🗂️ ชื่อซับโฟลเดอร์ตามชนิด (ใต้โฟลเดอร์แบรนด์)", "🗂️ Subfolder name by type (under the brand folder)")}</p>
        <p className="text-[11px] text-slate-400 mb-2">{t("เช่น โลโก้ → “01_Logo” · ปล่อยว่าง = ใช้ชื่อชนิดเป็นชื่อซับ", "e.g. logo → “01_Logo” · blank = use the type name as the subfolder")}</p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {types.map((ty) => (
            <div key={ty} className="flex items-center gap-2">
              <span className="w-24 text-[12px] text-slate-600 truncate shrink-0" title={ty}>{ty}</span>
              <input value={tDraft[ty] ?? ""} onChange={(e) => setTDraft((d) => ({ ...d, [ty]: e.target.value }))} placeholder={ty}
                className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
              <button type="button" onClick={() => saveType(ty)} className="h-8 px-2 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">{t("บันทึก", "Save")}</button>
            </div>
          ))}
          {types.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่มีชนิดงาน", "No work types yet")}</p>}
        </div>
      </div>
    </>
  );
}

// ตั้งค่าโฟลเดอร์มาตรฐาน (admin) — หลาย path ได้ (บรรทัดละ 1)
function ArtworkPathRuleModal({ rule, onClose, onSaved }: { rule: PathRule; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
  const [text, setText] = useState(rule.base_paths.join("\n"));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const base_paths = text.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "artwork_path_rule", value: { base_paths } }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(t("บันทึกโฟลเดอร์มาตรฐานแล้ว", "Standard folders saved")); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); } finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={t("ตั้งค่าโฟลเดอร์มาตรฐานของ Artwork", "Configure standard Artwork folders")} size="md"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? t("บันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
      </div>}>
      <p className="text-[12px] text-slate-500 mb-2">{t("artwork ทุกอันควรเก็บใต้โฟลเดอร์เหล่านี้ — ถ้า path ที่กรอกไม่ขึ้นต้นด้วยอันใดอันหนึ่ง ระบบจะ", "All artwork should be stored under these folders — if the entered path doesn't start with one of them, the system will")} <b className="text-amber-600">{t("เตือน", "warn")}</b> {t("(ไม่บล็อก). ใส่ได้หลายโฟลเดอร์ บรรทัดละ 1", "(not blocking). Enter multiple folders, one per line")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} spellCheck={false}
        placeholder={"G:\\Shared drives\\Louis Montini\\[4] Assets\\4. Artworks\n\\\\nas\\Artwork"}
        className="w-full px-3 py-2 text-[12px] font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <DriveFolderMap />
    </ERPModal>
  );
}

// ── ของกลาง: เปิดป๊อปอัปรายละเอียด/แก้ไฟล์คลังกลาง จากที่ไหนก็ได้ (โหลด collections/artTypes/actor ให้เอง) ──
export function AssetDetailPopup({ assetId, onClose, onChanged }: { assetId: string; onClose: () => void; onChanged?: () => void }) {
  const [actor, setActor] = useState<string | null>(null);
  const [collections, setCollections] = useState<AssetCollection[]>([]);
  const [artTypes, setArtTypes] = useState<LookupItem[]>([]);
  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => setActor(data.user?.email ?? null)).catch(() => {});
    apiFetch("/api/assets/collections").then((r) => r.json()).then((j) => setCollections((j.data ?? []) as AssetCollection[])).catch(() => {});
    apiFetch("/api/lookups?type=artwork_type").then((r) => r.json()).then((j) => setArtTypes(((j.data ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })))).catch(() => {});
  }, []);
  return <DetailModal id={assetId} actor={actor} collections={collections} artTypes={artTypes} onClose={onClose} onChanged={() => onChanged?.()} />;
}
