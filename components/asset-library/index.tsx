"use client";

/**
 * AssetLibrary — ของกลางคลังไฟล์กลาง (DAM)
 *
 * กริดรูป + ค้นหา + ฟิลเตอร์ชนิด + อัลบั้ม + แท็ก + อัปโหลด(ลากวาง) + รายละเอียด + ถังขยะ
 * "อัปครั้งเดียว ใช้ได้ทุกที่" — ภายหลังมี AssetPicker หยิบไฟล์จากคลังนี้ไปใช้ในโมดูลอื่น
 *
 * ใช้ของกลาง: apiFetch · useToast · ERPModal · ConfirmDialog · R2 (ผ่าน /api/assets)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { HelpTabsButton } from "@/components/help-tabs";
import { StorageCard } from "./storage-card";
import { HelpGuideInline } from "@/components/help-guides";
import { useAuth } from "@/components/auth";
import { ConfirmDialog } from "@/components/modal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { downloadImagesAsZip } from "@/lib/zip";
import { type AssetRow } from "@/app/api/assets/shared";
import { BrandAlbumBrowser } from "./brand-album";
import { AssetPicker } from "@/components/asset-picker";
import { Pager } from "@/components/pager";
import { useGalleryColumns, CardGrid, CardViewBar } from "@/components/gallery-columns";   // มุมมองการ์ดกลาง (ซูม Ctrl+ลูกกลิ้ง)
import { EmptyState } from "@/components/state-views";
import { LoadingOverlay } from "@/components/spinner";
import { useRefresh } from "@/lib/refresh-bus";
import type { PrintType } from "@/app/api/print-types/route";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import type { AssetTag } from "@/app/api/assets/tags/route";
import { type LookupItem, isImage, driveFolderNameOf, commonNameSeed } from "./asset-shared";
import { ManageMetaModal, NewCollectionModal, ManagePrintTypesModal, ManageTypesModal } from "./manage-modals";
import { BulkTagModal, BulkMoveModal, BulkEditModal, BulkFolderModal } from "./bulk-modals";
import { ArtworkAddModal, MassArtworkModal } from "./artwork-modals";
import { PrintJobAddModal, MassPrintModal } from "./print-modals";
import { DriveScanModal } from "./drive-scan-modal";
import { FileSortSettingsModal } from "./file-sort-settings";
import { UploadModal } from "./upload-modal";
import { DetailModal } from "./detail-modal";
import { AssetCard } from "./asset-card";
import { Icon } from "@/components/icon";
import { AlbumTree, albumFullName, buildAlbumOptions } from "@/components/album-picker";
import { AlbumRowMenu, AlbumMoveModal, AlbumTrashModal, ASSET_DRAG_TYPE, InlineSubAlbum, BulkNewAlbumModal, type AlbumAction } from "./album-tree-actions";
import { isVectorFile } from "@/lib/vector-split";
import { useSelectMode } from "@/components/select-mode";
import { useUserPref } from "@/lib/use-user-pref";
import { FolderPath, FolderStrip, type FolderMode } from "./folder-view";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { Popover } from "@/components/popover";
import { AssetActionList, AssetContextMenu, type AssetActionItem, type AssetActionKey } from "./bulk-actions";

// 🗂 Contents — อัลบั้มรูป/วิดีโอจากการถ่าย (ไฟล์ตัวจริงอยู่ Drive) → แตกเป็นโพสต์ในปฏิทิน · โหลดเมื่อเปิดแถบนี้
const ContentAlbumsBoard = nextDynamic(() => import("./contents").then((m) => m.ContentAlbumsBoard), { ssr: false });

// 📂 จัดรูปสินค้าหลายโฟลเดอร์ (ของกลาง — ตัวเดียวกับหน้า Parent SKU) · โหลดเมื่อกดปุ่ม
const ProductImageRouter = nextDynamic(() => import("@/components/product-image-router").then((m) => m.ProductImageRouter), { ssr: false });
// ✂️ แยกชิ้นจากไฟล์ออกแบบ (.ai/.pdf/.svg) เป็น PNG พื้นใส · โหลดเมื่อกดปุ่ม/ลากไฟล์ออกแบบมาวาง
const VectorSplitterModal = nextDynamic(() => import("@/components/vector-splitter").then((m) => m.VectorSplitterModal), { ssr: false });
const TYPE_FILTERS: { key: string; label: string; en: string }[] = [
  { key: "", label: "ทั้งหมด", en: "All" },
  { key: "image", label: "🖼️ รูปภาพ", en: "🖼️ Images" },
  { key: "design", label: "🎨 ไฟล์ออกแบบ", en: "🎨 Design files" },
  { key: "document", label: "📄 เอกสาร", en: "📄 Documents" },
  { key: "video", label: "🎬 วิดีโอ", en: "🎬 Videos" },
];

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
  const [bulkNewAlbumOpen, setBulkNewAlbumOpen] = useState(false);
  // 📁 มุมมองโฟลเดอร์ (อัลบั้มย่อยเป็นการ์ดบนสุด) — จำรายคน · เจ้าของเลือก 2026-11-27
  const [folderMode, setFolderMode] = useUserPref<FolderMode>("assets_folder_mode", "folder", (r) => (r === "folder" || r === "files" ? r : null));   // ใส่ไฟล์ที่ติ๊กเข้าอัลบั้มย่อยใหม่
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
  // ขนาดการ์ดไฟล์ (ของกลาง มุมมองการ์ดกลาง) — จำรายคน · Ctrl+ลูกกลิ้งบนการ์ด = ย่อ/ขยาย
  const gallery = useGalleryColumns("asset-library", 6);
  const [uploadOpen, setUploadOpen] = useState(false);
  // null = ยังไม่เคยเปิด · เปิดแล้วคงไว้ (อัปเบื้องหลังต่อได้ · กลับมาดูผล/ย้อนทั้งชุดได้)
  const [routerOpen, setRouterOpen] = useState<boolean | null>(null);
  const canRoute = can("products.edit") && can("files.upload");
  const [fileSortOpen, setFileSortOpen] = useState(false);   // ตั้งค่าตัวแยกไฟล์ ERP (สูตรแยกไฟล์ · โปรแกรมบนเครื่อง)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newColOpen, setNewColOpen] = useState(false);
  const [albumAct, setAlbumAct] = useState<{ kind: AlbumAction; album: AssetCollection } | null>(null);   // เมนู ⋯ ของอัลบั้มในแถบซ้าย
  const [albumTrashOpen, setAlbumTrashOpen] = useState(false);
  const [splitter, setSplitter] = useState<{ file: File | null } | null>(null);   // ✂️ แยกชิ้นจากไฟล์ออกแบบ
  const [metaMgr, setMetaMgr] = useState<"albums" | "tags" | null>(null);   // หน้าต่างจัดการ อัลบั้ม / แท็ก (เปลี่ยนชื่อ + ลบ)
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
  const [bulkMoveOpen, setBulkMoveOpen] = useState<false | "add" | "move">(false);   // add = ใส่อัลบั้มเพิ่ม · move = ย้ายออกจากอัลบั้มที่เปิดไปอัลบั้มอื่น
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; title: string } | null>(null);   // เมนูคลิกขวาที่รูป
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
  const contentsView = source === "contents";   // แถบ Contents = หน้าอัลบั้มของมันเอง (ไม่ใช้กริด/ค้นหา/ตัวกรองของคลัง)
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  // ลิงก์ตรง ?source=contents&album=<id> (เช่น ป้าย "จากอัลบั้ม" ในป๊อปโพสต์)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("source") === "contents" || sp.get("album")) { setSource("contents"); setOpenAlbumId(sp.get("album")); }
    // ลิงก์ตรงเปิดการ์ด ?source=artwork&asset=<id> (เช่น ปุ่ม "เปิดการ์ดในคลัง" ของตัวแยกไฟล์ ERP)
    const assetId = sp.get("asset");
    if (assetId) { if (sp.get("source") === "artwork") setSource("artwork"); setDetailId(assetId); }
    // ลิงก์ตรงเปิดอัลบั้ม ?collection=<id> (เช่น ปุ่ม "เปิดในคลังรูป" ของอัลบั้มปกโปร) — ทุกที่มา (รูปในอัลบั้มมาจากหลายที่)
    const colId = sp.get("collection");
    if (colId) { setSource("all"); setCollectionId(colId); }
  }, []);

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
    if (source === "contents") { setRows([]); setTotal(0); setLoading(false); return; }   // อัลบั้ม Contents โหลดเอง (/api/content-albums)
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
  // ติ๊ก + Shift เลือกเป็นช่วง + กดค้างบนมือถือ (ของกลาง select-mode · เจ้าของเลือก 2026-11-27)
  const sm = useSelectMode({ order: () => rows.map((r) => r.id), selected, onChange: setSelected, enabled: !showBrandView });
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
  const postBulk = async (body: Record<string, unknown>) => {
    const j = await (await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (j.error) throw new Error(j.error);
    return j as { added?: string[] };
  };
  const openAlbum = collectionId && collectionId !== "none" ? collections.find((c) => c.id === collectionId) ?? null : null;
  // เอาออกจากอัลบั้มที่เปิดอยู่ (ไฟล์ยังอยู่ในคลัง) + ย้อนกลับ = ใส่คืน
  const removeFromAlbum = async (ids: string[], album: AssetCollection) => {
    if (!ids.length) return;
    try {
      await postBulk({ action: "remove_from", asset_ids: ids, collection_id: album.id });
      clearSel(); await load(); await loadMeta();
      toast.undo(`${t("เอาออกจาก", "Removed from")} “${album.name}” ${ids.length} ${t("ไฟล์ · ไฟล์ยังอยู่ในคลัง", "files · still in library")}`, async () => {
        await postBulk({ action: "move", asset_ids: ids, collection_id: album.id });
        await load(); await loadMeta();
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เอาออกไม่สำเร็จ", "Remove failed")); }
  };
  // ย้ายไปอัลบั้มอื่น = ใส่อัลบั้มใหม่ + เอาออกจากอัลบั้มที่เปิด · ย้อนกลับ = ใส่คืน + เอาออกเฉพาะตัวที่เพิ่งเข้าใหม่
  const moveToAlbum = async (targetId: string) => {
    setBulkMoveOpen(false);
    const from = openAlbum; const ids = Array.from(selected);
    const target = collections.find((c) => c.id === targetId);
    if (!from || !target || !ids.length || target.id === from.id) return;
    try {
      const { added = ids } = await postBulk({ action: "move", asset_ids: ids, collection_id: target.id });
      await postBulk({ action: "remove_from", asset_ids: ids, collection_id: from.id });
      clearSel(); await load(); await loadMeta();
      toast.undo(`${t("ย้าย", "Moved")} ${ids.length} ${t("ไฟล์", "files")} “${from.name}” → “${target.name}”`, async () => {
        await postBulk({ action: "move", asset_ids: ids, collection_id: from.id });
        if (added.length) await postBulk({ action: "remove_from", asset_ids: added, collection_id: target.id });
        await load(); await loadMeta();
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้ายไม่สำเร็จ", "Move failed")); }
  };
  // รายการคำสั่ง (ชุดเดียว ใช้ทั้งแถบล่างและคลิกขวา)
  const albumItems: AssetActionItem[] = trash ? [] : [
    { key: "add", label: t("ใส่อัลบั้มเพิ่ม", "Add to album"), icon: "i:folder-plus" },
    ...(openAlbum ? [{ key: "move_to" as const, label: t("ย้ายไปอัลบั้มอื่น", "Move to another album"), icon: "i:arrows-exchange" }] : []),
    ...(can("assets.manage") ? [{ key: "new_sub" as const, label: t("ใส่อัลบั้มย่อยใหม่", "Add to new sub-album"), icon: "i:folders" }] : []),
    ...(openAlbum ? [{ key: "remove" as const, label: t("เอาออกจากอัลบั้มนี้", "Remove from this album"), icon: "i:minus", tone: "warn" as const }] : []),
  ];
  const moreItems: AssetActionItem[] = trash ? [] : [
    { key: "edit", label: t("แก้หลายรายการ", "Edit many"), icon: "i:pencil" },
    ...(driveOn ? [{ key: "drive_folder" as const, label: t("สร้าง Folder Drive", "Create Drive folder"), icon: "i:cloud-upload" }] : []),
    ...(driveOn ? [{ key: "same_folder" as const, label: bulkLinkBusy ? t("กำลังผูก…", "Linking…") : t("ใช้โฟลเดอร์เดียวกัน", "Use same folder"), icon: "i:paperclip" }] : []),
  ];
  const ctxItems: AssetActionItem[] = [
    ...albumItems, ...(albumItems.length ? ["sep" as const] : []),
    ...(trash ? [] : [{ key: "tag" as const, label: t("ติดแท็ก", "Add tag"), icon: "i:tag" }]),
    ...moreItems, "sep",
    { key: "trash", label: t("ลบ", "Delete"), icon: "i:trash", tone: "danger" },
  ];
  const runAction = (k: AssetActionKey) => {
    if (k === "add") setBulkMoveOpen("add");
    else if (k === "move_to") setBulkMoveOpen("move");
    else if (k === "new_sub") setBulkNewAlbumOpen(true);
    else if (k === "remove") { if (openAlbum) void removeFromAlbum(Array.from(selected), openAlbum); }
    else if (k === "tag") setBulkTagOpen(true);
    else if (k === "edit") setBulkEditOpen(true);
    else if (k === "drive_folder") setBulkFolderOpen(true);
    else if (k === "same_folder") { if (!bulkLinkBusy) setBulkLinkOpen(true); }
    else if (k === "trash") setBulkTrashOpen(true);
  };
  // คลิกขวาที่รูป: รูปที่ยังไม่ได้ติ๊ก = เลือกรูปนั้นรูปเดียวก่อน (แบบ Windows) · กดค้างบนมือถือ = โหมดเลือก ไม่เปิดเมนู
  const openCtx = (e: React.MouseEvent, a: AssetRow) => {
    if (e.defaultPrevented || showBrandView) return;
    e.preventDefault();
    const n = selected.has(a.id) ? selected.size : 1;
    if (!selected.has(a.id)) setSelected(new Set([a.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY, title: n > 1 ? `${n} ${t("ไฟล์ที่เลือก", "files selected")}` : (a.title || a.file_name || "") });
  };

  const selCount = selected.size;

  // ── อัลบั้มย่อย: ลบ (เก็บในถังขยะ + ปุ่มย้อนกลับ) · ลากรูปวางบนอัลบั้ม (ย้อนกลับได้) ──
  const deleteAlbum = async (a: AssetCollection) => {
    try {
      const j = await (await apiFetch(`/api/assets/collections?id=${encodeURIComponent(a.id)}`, { method: "DELETE" })).json();
      if (j.error) throw new Error(j.error);
      if (collectionId === a.id) setCollectionId(null);
      await loadMeta();
      const more = (j.data?.albums ?? 1) > 1 ? ` (${t("รวมอัลบั้มย่อย", "incl. sub-albums")} ${(j.data.albums as number) - 1})` : "";
      toast.undo(`${t("ลบอัลบั้ม", "Deleted album")} “${a.name}”${more} — ${t("อยู่ในถังขยะอัลบั้ม", "in album trash")}`, async () => {
        await apiFetch("/api/assets/collections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, restore: true }) });
        await loadMeta();
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
  };
  const onAlbumAction = (kind: AlbumAction, album: AssetCollection) => {
    if (kind === "delete") { void deleteAlbum(album); return; }
    setAlbumAct({ kind, album });
  };
  const dropAssetsOnAlbum = async (album: AssetCollection, ids: string[]) => {
    if (!ids.length) return;
    try {
      const j = await (await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", asset_ids: ids, collection_id: album.id }) })).json();
      if (j.error) throw new Error(j.error);
      const added = (j.added ?? ids) as string[];
      clearSel(); await loadMeta(); await load();
      if (!added.length) { toast.info(`${t("อยู่ใน", "Already in")} “${album.name}” ${t("อยู่แล้ว", "")}`); return; }
      toast.undo(`${t("ใส่", "Added")} ${added.length} ${t("ไฟล์เข้า", "files to")} “${album.name}”`, async () => {
        await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_from", asset_ids: added, collection_id: album.id }) });
        await loadMeta(); await load();
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ใส่อัลบั้มไม่สำเร็จ", "Failed to add to album")); }
  };

  const anyModalOpen = bulkNewAlbumOpen || artworkAddOpen || massOpen || uploadOpen || bulkTrashOpen || bulkTagOpen || !!bulkMoveOpen || bulkEditOpen || bulkLinkOpen || bulkFolderOpen || manageTypesOpen || driveScanOpen || !!folderScan || printAddOpen || massPrintOpen || managePrintOpen || fileSortOpen;

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
    if (anyModalOpen || contentsView) return;   // แถบ Contents มีตัวรับลากวางของมันเอง (ถามว่าลงอัลบั้มไหน)
    // ไฟล์ออกแบบ (.ai/.pdf/.svg/.eps) → เปิดหน้าแยกชิ้นเป็น PNG
    const vector = Array.from(e.dataTransfer.files).find((f) => isVectorFile(f));
    if (vector) { e.preventDefault(); setSplitter({ file: vector }); return; }
    const imgs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") && !isVectorFile(f));
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
      onDragOver={(e) => { if (anyModalOpen || contentsView) return; if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setPageDrag(true); } }}
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
        <div className={`flex items-center gap-2 ${contentsView ? "hidden" : ""}`}>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder={t("ค้นหา ชื่อไฟล์ / คำอธิบาย…", "Search file name / description…")}
              className="w-56 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {source === "artwork" && can("assets.manage") && (
            <button onClick={() => setFileSortOpen(true)}
              title={t("ตั้งว่าโปรแกรมตัวแยกไฟล์ส่งไฟล์แต่ละนามสกุลไปคลัง / Google Drive / Z:", "Set where the File Sorter app sends each file type: library / Google Drive / Z:")}
              className="h-9 px-3 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap inline-flex items-center gap-1.5"
            ><Icon name="settings" /> {t("ตัวแยกไฟล์", "File sorter")}</button>
          )}
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
          {canRoute && source !== "artwork" && source !== "print" && (
            <button onClick={() => setRouterOpen(true)}
              title={t("ลากหลายโฟลเดอร์ (ชื่อโฟลเดอร์ = รหัส SKU ลูก / รหัสรุ่น) แล้วเลือกว่ารูปไหนลงปก · SKU ลูก · แกลเลอรี Parent · Hero · Description", "Drop many folders (named by SKU / model code) and choose where each image goes")}
              className="h-9 px-3 text-sm font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 whitespace-nowrap"
            >{t("📂 จัดรูปสินค้าหลายโฟลเดอร์", "📂 Sort product images")}</button>
          )}
          {can("assets.upload") && source !== "print" && (
            <button onClick={() => setSplitter({ file: null })}
              title={t("โยนไฟล์ .ai / .pdf / .svg ที่มีหลายชิ้นในแผ่นเดียว → เลือกชิ้นที่ต้องการ → ได้ PNG พื้นใสเข้าอัลบั้ม", "Drop an .ai / .pdf / .svg sheet → pick pieces → transparent PNGs into an album")}
              className="h-9 px-3 text-sm font-medium border border-pink-300 text-pink-700 rounded-lg hover:bg-pink-50 whitespace-nowrap"
            >{t("✂️ แยกชิ้นจากไฟล์ออกแบบ", "✂️ Split design file")}</button>
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
      {/* มือถือ: แถบซ้ายซ่อนอยู่ → เลือกที่มาจากแถบนี้แทน */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 mb-3">
        {([["contents", "Contents", "📚"], ["by-brand", t("ดูตามแบรนด์", "By brand"), "🏷️"], ["upload", t("รูปที่อัปเอง", "My uploads"), "📤"], ["artwork", "Artwork", "🎨"], ["print", t("งานพิมพ์", "Print jobs"), "🖨"], ["odoo_product", t("รูปสินค้า", "Product images"), "🛍️"]] as const).map(([k, label, ic]) => (
          <button key={k} onClick={() => setSource(k)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] ${source === k ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-600"}`}>
            <Icon value={ic} />{label}
          </button>
        ))}
      </div>

      {!byBrand && !contentsView && <div className="mb-3"><StorageCard canManage={can("assets.manage")} pushToast={(type, m) => toast[type](m)} /></div>}

      {/* type filter + trash toggle */}
      {!byBrand && !contentsView && (
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
            <SideItem active={source === "contents"} onClick={() => setSource("contents")} label="Contents" icon="📚" />
            <SideItem active={source === "upload"} onClick={() => setSource("upload")} label={t("รูปที่อัปเอง", "My uploads")} icon="📤" />
            <SideItem active={source === "artwork"} onClick={() => setSource("artwork")} label="Artwork" icon="🎨" />
            <SideItem active={source === "print"} onClick={() => setSource("print")} label={t("งานพิมพ์", "Print jobs")} icon="🖨" />
            <SideItem active={source === "odoo_product"} onClick={() => setSource("odoo_product")} label={t("รูปสินค้า (Odoo)", "Product images (Odoo)")} icon="🛍️" />
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-slate-400">{t("อัลบั้ม", "Albums")}</p>
            <span className="flex items-center gap-2">
              {can("assets.manage") && collections.length > 0 && <button onClick={() => setMetaMgr("albums")} title={t("เปลี่ยนชื่อ / ลบ อัลบั้ม", "Rename / delete albums")} className="text-[11px] text-slate-400 hover:text-indigo-600 hover:underline">⚙️ {t("จัดการ", "Manage")}</button>}
              <button onClick={() => setNewColOpen(true)} className="text-[11px] text-indigo-600 hover:underline">{t("＋ ใหม่", "＋ New")}</button>
            </span>
          </div>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={collectionId === null} onClick={() => setCollectionId(null)} label={t("ทั้งหมด", "All")} />
            <SideItem active={collectionId === "none"} onClick={() => setCollectionId("none")} label={t("ไม่อยู่อัลบั้ม", "No album")}
              dropTitle={openAlbum ? `${t("วางที่นี่ = เอาออกจาก", "Drop here = remove from")} “${openAlbum.name}”` : undefined}
              onDropIds={openAlbum && can("assets.edit") ? (ids) => void removeFromAlbum(ids, openAlbum) : undefined} />
            <SideAlbums collections={collections} activeId={collectionId} onSelect={setCollectionId}
              canManage={can("assets.manage")} canDrop={can("assets.edit")} onAction={onAlbumAction} onDropAssets={dropAssetsOnAlbum} />
            {can("assets.manage") && (() => { const cur = collections.find((c) => c.id === collectionId); return cur ? <InlineSubAlbum parent={cur} onCreated={() => loadMeta()} /> : null; })()}
            {can("assets.manage") && (
              <button onClick={() => setAlbumTrashOpen(true)} className="mt-1 self-start px-2 text-[11px] text-slate-400 hover:text-indigo-600 hover:underline">🗑 {t("ถังขยะอัลบั้ม", "Album trash")}</button>
            )}
          </div>
          {tags.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-slate-400">{t("แท็ก", "Tags")}</p>
                {can("assets.manage") && <button onClick={() => setMetaMgr("tags")} title={t("เปลี่ยนชื่อ / ลบ แท็ก", "Rename / delete tags")} className="text-[11px] text-slate-400 hover:text-indigo-600 hover:underline">⚙️ {t("จัดการ", "Manage")}</button>}
              </div>
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
          {contentsView ? <ContentAlbumsBoard openAlbumId={openAlbumId} /> : (<>
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
          {!showBrandView && !trash && !searching && !folderFilter && collectionId !== "none" && (<>
            <FolderPath collections={collections} currentId={collectionId} onOpen={setCollectionId} mode={folderMode} onMode={setFolderMode} />
            {folderMode === "folder" && (
              <FolderStrip collections={collections} currentId={collectionId} onOpen={setCollectionId}
                canManage={can("assets.manage")} canDrop={can("assets.edit")} onAction={onAlbumAction} onDropAssets={dropAssetsOnAlbum} />
            )}
          </>)}
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
            <CardGrid gallery={gallery} loading />
          ) : rows.length === 0 ? (
            <EmptyState icon="🗂️" title={
              searching ? `${t("ไม่พบไฟล์ที่ตรงกับ", "No files match")} “${search.trim()}”`
                : trash ? t("ถังขยะว่าง", "Trash is empty")
                : source === "artwork" ? t("ยังไม่มี Artwork — กด “เพิ่ม Artwork” เพื่อลงบัตรงานออกแบบ (รูปตัวอย่าง + path ไฟล์ต้นฉบับ)", "No Artwork yet — click “Add Artwork” to create a design card (preview image + source file path)")
                : source === "print" ? t("ยังไม่มีงานพิมพ์ — กด “เพิ่มงานพิมพ์” เพื่อลงรูป preview + ไฟล์ .ai/.pdf สำหรับส่งพิมพ์", "No print jobs yet — click “Add print job” to add a preview image + .ai/.pdf files for printing")
                : source === "odoo_product" ? t("ยังไม่มีรูปสินค้านำเข้า", "No imported product images")
                : t("ยังไม่มีไฟล์ในคลัง — กด “อัปโหลด” เพื่อเริ่มเก็บไฟล์", "No files in the library — click “Upload” to start storing files")} />
          ) : (<>
            <CardViewBar gallery={gallery} count={`${total.toLocaleString("th-TH")} ${t("ไฟล์", "files")}`} />
            <CardGrid gallery={gallery}>
              {rows.map((a) => (
                <div key={a.id} className="contents" onContextMenu={(e) => openCtx(e, a)}>
                <AssetCard a={a} selected={selected.has(a.id)} selectionMode={selCount > 0}
                  dragIds={() => (selected.has(a.id) ? Array.from(selected) : [a.id])}
                  onToggle={(e) => sm.pick(a.id, e)} onOpen={() => setDetailId(a.id)} pressProps={sm.pressProps(a.id)}
                  onSameFolder={(id, label) => setFolderFilter({ id, label })} />
                </div>
              ))}
            </CardGrid>
          </>)}
          {!showBrandView && !loading && total > 0 && rows.length > 0 && (
            <div className="mt-4"><Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={goPage} unitLabel={t("ไฟล์", "files")} /></div>
          )}
          </>)}
        </main>
      </div>

      {/* แถบคำสั่งหลายไฟล์ = ของกลาง BulkActionBar (ลอยล่างจอ · มือถืออยู่เหนือเมนูล่าง) · ปุ่มหลัก 4 + ⋯ (เจ้าของเลือก 2026-11-27) */}
      <BulkActionBar count={selCount} unit={t("ไฟล์", "files")} onClear={clearSel}>
        {albumItems.length > 0 && (
          <Popover align="right" panelClassName="rounded-xl border border-slate-200 bg-white shadow-xl"
            trigger={(toggle) => <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] bg-white/10 hover:bg-white/20"><Icon value="i:folder" /> {t("อัลบั้ม", "Album")} <span className="text-[10px] opacity-70">▾</span></button>}>
            {(close) => <AssetActionList items={albumItems} onPick={(k) => { close(); runAction(k); }} />}
          </Popover>
        )}
        {openAlbum && !trash && (
          <button type="button" onClick={() => runAction("remove")} title={`${t("เอาออกจาก", "Remove from")} “${openAlbum.name}” · ${t("ไฟล์ยังอยู่ในคลัง", "files stay in library")}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] bg-amber-600 hover:bg-amber-500"><Icon value="i:minus" /> <span className="hidden sm:inline">{t("เอาออกจากอัลบั้มนี้", "Remove from album")}</span><span className="sm:hidden">{t("เอาออก", "Remove")}</span></button>
        )}
        {!trash && <button type="button" onClick={() => runAction("tag")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] bg-white/10 hover:bg-white/20 max-sm:hidden"><Icon value="i:tag" /> {t("ติดแท็ก", "Tag")}</button>}
        <button type="button" onClick={() => runAction("trash")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] bg-white/10 hover:bg-white/20"><Icon value="i:trash" /> {t("ลบ", "Delete")}</button>
        {!trash && (
          <Popover align="right" panelClassName="rounded-xl border border-slate-200 bg-white shadow-xl"
            trigger={(toggle) => <button type="button" onClick={toggle} title={t("คำสั่งอื่น", "More")} aria-label={t("คำสั่งอื่น", "More")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] bg-white/10 hover:bg-white/20"><Icon value="i:dots-vertical" /></button>}>
            {(close) => <AssetActionList items={window.innerWidth < 640 ? [{ key: "tag", label: t("ติดแท็ก", "Add tag"), icon: "i:tag" } as AssetActionItem, ...moreItems] : moreItems /* มือถือซ่อนปุ่มติดแท็กบนแถบ → อยู่ในนี้ */} onPick={(k) => { close(); runAction(k); }} />}
          </Popover>
        )}
      </BulkActionBar>
      {ctxMenu && selCount > 0 && <AssetContextMenu x={ctxMenu.x} y={ctxMenu.y} title={ctxMenu.title} items={ctxItems} onPick={runAction} onClose={() => setCtxMenu(null)} />}

      {/* modals */}
      {fileSortOpen && <FileSortSettingsModal canEdit={can("assets.manage")} onClose={() => setFileSortOpen(false)} />}
      {routerOpen !== null && <ProductImageRouter open={routerOpen} onClose={() => setRouterOpen(false)} onDone={() => void load()} />}
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
      {(albumAct?.kind === "sub" || albumAct?.kind === "rename") && (
        <NewCollectionModal onClose={() => setAlbumAct(null)}
          parent={albumAct.kind === "sub" ? albumAct.album : null} rename={albumAct.kind === "rename" ? albumAct.album : null}
          onDone={async () => { setAlbumAct(null); await loadMeta(); }} />
      )}
      {albumAct?.kind === "move" && (
        <AlbumMoveModal album={albumAct.album} collections={collections} onClose={() => setAlbumAct(null)}
          onMoved={async (fromParent) => {
            const a = albumAct.album;
            setAlbumAct(null); await loadMeta();
            toast.undo(`${t("ย้ายอัลบั้ม", "Moved album")} “${a.name}” ${t("แล้ว", "")}`, async () => {
              await apiFetch("/api/assets/collections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, parent_id: fromParent }) });
              await loadMeta();
            });
          }} />
      )}
      {albumTrashOpen && <AlbumTrashModal onClose={() => setAlbumTrashOpen(false)} onRestored={() => { void loadMeta(); }} />}
      {splitter && (
        <VectorSplitterModal initialFile={splitter.file} collections={collections} actor={actor}
          defaultCollectionId={collectionId && collectionId !== "none" ? collectionId : null}
          onClose={() => setSplitter(null)}
          onDone={async () => { setSplitter(null); await load(); await loadMeta(); }} />
      )}
      {metaMgr && (
        <ManageMetaModal kind={metaMgr} items={metaMgr === "albums" ? collections : tags}
          onClose={() => setMetaMgr(null)}
          onChanged={async (deletedId) => {
            if (deletedId && metaMgr === "albums" && collectionId === deletedId) setCollectionId(null);
            if (deletedId && metaMgr === "tags" && tag === deletedId) setTag(null);
            await loadMeta(); await load();
          }} />
      )}
      <ConfirmDialog
        open={bulkTrashOpen} onClose={() => setBulkTrashOpen(false)} onConfirm={bulkTrash}
        title={t("ย้ายไฟล์ลงถังขยะ?", "Move files to trash?")} message={`${t("จะย้าย", "Will move")} ${selCount} ${t("ไฟล์ลงถังขยะ (กู้คืนได้ 30 วัน) — ไฟล์ที่ยังถูกใช้อยู่จะถูกข้าม", "files to trash (recoverable for 30 days) — files still in use will be skipped")}`}
        confirmText={t("ย้ายลงถังขยะ", "Move to trash")} variant="danger"
      />
      {bulkTagOpen && <BulkTagModal count={selCount} tags={tags} onClose={() => setBulkTagOpen(false)} onApply={bulkTag} />}
      {bulkMoveOpen && <BulkMoveModal count={selCount} collections={bulkMoveOpen === "move" ? collections.filter((c) => c.id !== openAlbum?.id) : collections}
        mode={bulkMoveOpen} fromName={openAlbum?.name} onClose={() => setBulkMoveOpen(false)} onApply={bulkMoveOpen === "move" ? (id) => void moveToAlbum(id) : bulkMove} />}
      {bulkNewAlbumOpen && <BulkNewAlbumModal ids={Array.from(selected)} collections={collections} defaultParent={collectionId && collectionId !== "none" ? collectionId : null}
        onClose={() => setBulkNewAlbumOpen(false)} onDone={async () => { clearSel(); await loadMeta(); await load(); }} />}
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

// แถบซ้าย: อัลบั้มเป็นต้นไม้ของกลาง — อัลบั้มปกติ (เกิน 6 ย่อ) → กลุ่ม SAMPLE ตามแบรนด์ (ยุบไว้) → กางทีละชั้น
// อัลบั้มย่อย: เมนู ⋯ (สร้างย่อย/เปลี่ยนชื่อ/ย้าย/ลบ) · ลากการ์ดไฟล์มาวางบนแถว = ใส่เข้าอัลบั้มนั้น
function SideAlbums({ collections, activeId, onSelect, canManage, canDrop, onAction, onDropAssets }: {
  collections: AssetCollection[]; activeId: string | null; onSelect: (id: string) => void;
  canManage?: boolean; canDrop?: boolean;
  onAction?: (kind: AlbumAction, album: AssetCollection) => void;
  onDropAssets?: (album: AssetCollection, ids: string[]) => void;
}) {
  const t = useT();
  const options = useMemo(() => buildAlbumOptions(collections), [collections]);
  const byId = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const [over, setOver] = useState<string | null>(null);
  return (
    <AlbumTree key={options.length ? "ready" : "empty"} options={options} activeId={activeId}
      renderRow={(o, x) => {
        const album = byId.get(o.value);
        return (
          <div className={`group/albumrow flex items-center min-w-0 rounded-lg ${over === o.value ? "ring-2 ring-indigo-400 bg-indigo-50" : ""}`} style={{ paddingLeft: x.depth * 12 }}
            onDragOver={(e) => { if (!canDrop || !album || !Array.from(e.dataTransfer.types).includes(ASSET_DRAG_TYPE)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(o.value); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((v) => (v === o.value ? null : v)); }}
            onDrop={(e) => {
              setOver(null);
              const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE);
              if (!raw || !album) return;
              e.preventDefault(); e.stopPropagation();
              try { onDropAssets?.(album, JSON.parse(raw) as string[]); } catch { /* ข้อมูลลากเสีย */ }
            }}>
            {x.hasKids
              ? <button type="button" onClick={x.toggle} className="w-4 shrink-0 text-[10px] text-slate-400 hover:text-slate-700" aria-label={x.expanded ? t("ยุบ", "Collapse") : t("กาง", "Expand")}>{x.expanded ? "▾" : "▸"}</button>
              : <span className="w-4 shrink-0" />}
            <div className="flex-1 min-w-0 flex flex-col" title={albumFullName(o)}>
              <SideItem active={activeId === o.value} onClick={() => onSelect(o.value)} label={o.label} count={o.count} icon="📁" />
            </div>
            {canManage && album && onAction && <AlbumRowMenu album={album} onAction={(k) => onAction(k, album)} />}
          </div>
        );
      }} />
  );
}

function SideItem({ active, onClick, label, count, icon, onDropIds, dropTitle }: {
  active: boolean; onClick: () => void; label: string; count?: number; icon?: string;
  /** ลากรูปมาวางได้ (เช่น "ไม่อยู่อัลบั้ม" = เอาออกจากอัลบั้มที่เปิดอยู่) */
  onDropIds?: (ids: string[]) => void; dropTitle?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <button onClick={onClick} title={onDropIds ? dropTitle : undefined}
      onDragOver={(e) => { if (!onDropIds || !Array.from(e.dataTransfer.types).includes(ASSET_DRAG_TYPE)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const raw = onDropIds ? e.dataTransfer.getData(ASSET_DRAG_TYPE) : "";
        if (!raw) return;
        e.preventDefault();
        try { onDropIds?.(JSON.parse(raw) as string[]); } catch { /* ข้อมูลลากเสีย */ }
      }}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] text-left ${over ? "bg-amber-50 text-amber-800 ring-2 ring-amber-300" : active
        ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
      {icon && <span className="text-[13px]"><Icon value={icon} /></span>}
      <span className="truncate flex-1">{label}</span>
      {count != null && count > 0 && <span className="text-[11px] text-slate-400">{count}</span>}
    </button>
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
