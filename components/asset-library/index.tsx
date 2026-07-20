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
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ASSET_TYPE_LABEL, formatBytes, type AssetType } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { downscaleImageWidth } from "@/lib/image-resize";
import { downloadImagesAsZip } from "@/lib/zip";
import { type AssetRow, type AssetDetail, type AssetUsage, type AssetSize } from "@/app/api/assets/shared";
import { BrandAlbumBrowser } from "./brand-album";
import { AssetPicker } from "@/components/asset-picker";
import { Pager } from "@/components/pager";
import { Spinner, LoadingOverlay } from "@/components/spinner";
import { HoverPreview } from "@/components/hover-image";
import { ParentSkuMultiPickerModal } from "@/components/parent-sku-multi-picker";
import { DriveFolderFiles } from "@/components/drive-folder-files";
import { runBackgroundTask } from "@/lib/background-tasks";
import { useRefresh, triggerRefresh } from "@/lib/refresh-bus";
import type { PrintType } from "@/app/api/print-types/route";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import type { AssetTag } from "@/app/api/assets/tags/route";

const TYPE_ICON: Record<AssetType, string> = { image: "🖼️", design: "🎨", document: "📄", video: "🎬", other: "📦" };
const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "ทั้งหมด" },
  { key: "image", label: "🖼️ รูปภาพ" },
  { key: "design", label: "🎨 ไฟล์ออกแบบ" },
  { key: "document", label: "📄 เอกสาร" },
  { key: "video", label: "🎬 วิดีโอ" },
];

type LookupItem = { id: string; name: string };   // ชนิด artwork จาก lookup กลาง (erp_lookups type=artwork_type)

const isImage = (a: { asset_type: AssetType }) => a.asset_type === "image";

export function AssetLibrary() {
  const toast = useToast();
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
  const [pageDrag, setPageDrag] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [driveScanOpen, setDriveScanOpen] = useState(false);   // หาโฟลเดอร์ Drive ที่ยังไม่เชื่อม
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
      } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดคลังไม่สำเร็จ"); }
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
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดคลังไม่สำเร็จ"); }
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
    if (imgs.length === 0) { toast.error("ไม่มีรูปในผลค้นหานี้"); return; }
    setZipBusy(true); setZipMsg("");
    try {
      const n = await downloadImagesAsZip(imgs, `ค้นหา-${search.trim() || "รูป"}`,
        (done, total) => setZipMsg(total ? `กำลังโหลดรูป ${Math.min(done + 1, total)}/${total}…` : "กำลังบีบไฟล์…"));
      if (n > 0) toast.success(`ดาวน์โหลด ${n} รูปเป็น zip แล้ว`);
      else toast.error("ดาวน์โหลดรูปไม่สำเร็จ");
    } catch { toast.error("ดาวน์โหลดไม่สำเร็จ"); }
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
    if (blocked) toast.error(`ลบ ${ok} ไฟล์ · ข้าม ${blocked} ไฟล์ (ยังถูกใช้อยู่)`);
    else toast.success(`ย้าย ${ok} ไฟล์ลงถังขยะแล้ว`);
  };

  // ── ติดแท็ก / ย้ายอัลบั้ม หลายไฟล์พร้อมกัน ──
  const bulkApi = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(okMsg); clearSel(); await load(); await loadMeta();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
  };
  const bulkTag = (tag: string) => { setBulkTagOpen(false); void bulkApi({ action: "tag", asset_ids: Array.from(selected), tag }, `ติดแท็ก “${tag}” ให้ ${selected.size} ไฟล์แล้ว`); };
  const bulkMove = (collectionId: string) => { setBulkMoveOpen(false); void bulkApi({ action: "move", asset_ids: Array.from(selected), collection_id: collectionId || null }, `อัปเดตอัลบั้ม ${selected.size} ไฟล์แล้ว`); };

  const selCount = selected.size;

  const anyModalOpen = artworkAddOpen || massOpen || uploadOpen || bulkTrashOpen || bulkTagOpen || bulkMoveOpen || bulkEditOpen || bulkLinkOpen || bulkFolderOpen || manageTypesOpen || driveScanOpen || printAddOpen || managePrintOpen;

  // ── ผูกหลายรูปที่เลือกเข้าโฟลเดอร์ Drive เดียวกับรูปต้นทาง (bulk) ──
  const bulkLinkFolder = async (source: AssetRow) => {
    const ids = Array.from(selected).filter((x) => x !== source.id);
    setBulkLinkOpen(false);
    if (!/\/folders\//.test(source.master_url ?? "")) { toast.error(`รูป “${source.title || source.file_name}” ยังไม่มีโฟลเดอร์ Drive — เลือกรูปที่มีโฟลเดอร์แล้ว`); return; }
    if (!ids.length) { toast.error("ไม่มีรูปอื่นให้ผูก (เลือกรูปที่ยังไม่มีโฟลเดอร์ด้วย)"); return; }
    setBulkLinkBusy(true);
    try {
      const res = await apiFetch("/api/assets/drive-folders/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, source_id: source.id, follow_path: true }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ผูกโฟลเดอร์ไม่สำเร็จ");
      toast.success(`ผูก ${j.count ?? ids.length} รูปเข้าโฟลเดอร์เดียวกับ “${source.title || source.file_name}” แล้ว`);
      clearSel(); await load(); await loadMeta();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ผูกโฟลเดอร์ไม่สำเร็จ"); }
    finally { setBulkLinkBusy(false); }
  };
  const onPageDrop = (e: React.DragEvent) => {
    setPageDrag(false);
    if (anyModalOpen) return;
    const imgs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    // มุมมอง Artwork → ฟอร์ม Artwork · มุมมองอื่น (รูปที่อัปเอง ฯลฯ) → ฟอร์มอัปรูปธรรมดา
    if (source === "artwork") {
      if (imgs.length === 1) { setPendingFile(imgs[0]); setArtworkAddOpen(true); }
      else { setPendingFiles(imgs); setMassOpen(true); }
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
          <div className="bg-white px-4 py-2 rounded-lg shadow text-sm text-indigo-700 font-medium">🎨 วางรูปที่นี่ → เพิ่ม Artwork · หลายรูป = เพิ่มหลายรูป</div>
        </div>
      )}
      {/* header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🖼️ คลังไฟล์กลาง</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            อัปไฟล์ครั้งเดียว เก็บที่เดียว ค้น/แท็ก/จัดอัลบั้ม แล้วหยิบไปใช้ซ้ำได้ทุกที่ · {total} ไฟล์
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="ค้นหา ชื่อไฟล์ / คำอธิบาย…"
              className="w-56 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {source === "artwork" && (
            <button onClick={() => setMassOpen(true)}
              className="h-9 px-3 text-sm font-medium border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
            >📋 เพิ่มหลายรูป</button>
          )}
          <button
            onClick={() => {
              if (source === "artwork") setArtworkAddOpen(true);
              else if (source === "print") setPrintAddOpen(true);
              else { setPendingFiles(null); setUploadOpen(true); }
            }}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
          >{source === "artwork" ? "🎨 เพิ่ม Artwork" : source === "print" ? "🖨 เพิ่มงานพิมพ์" : "⬆ อัปโหลด"}</button>
        </div>
      </div>

      {/* type filter + trash toggle */}
      {!byBrand && (
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {source === "artwork"
          ? <>
              {[{ key: "", label: "ทั้งหมด" }, ...artTypes.map((t) => ({ key: t.name, label: t.name }))].map((f) => (
                <button key={f.key || "all"} onClick={() => setArtworkType(f.key)}
                  className={`h-8 px-3 text-[13px] rounded-lg border ${artworkType === f.key
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
              ))}
              <button onClick={() => setManageTypesOpen(true)}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">⚙️ จัดการชนิด</button>
              {driveOn && <button onClick={() => setDriveScanOpen(true)}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">🔍 หาใน Drive ที่ยังไม่เชื่อม</button>}
            </>
          : source === "print"
          ? <>
              {[{ key: "", label: "ทั้งหมด" }, ...printTypes.map((t) => ({ key: t.code, label: t.name }))].map((f) => (
                <button key={f.key || "all"} onClick={() => setPrintType(f.key)}
                  className={`h-8 px-3 text-[13px] rounded-lg border ${printType === f.key
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
              ))}
              <button onClick={() => setManagePrintOpen(true)}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">⚙️ จัดการประเภทงานพิมพ์</button>
            </>
          : TYPE_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`h-8 px-3 text-[13px] rounded-lg border ${type === f.key
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
            ))}
        <div className="flex-1" />
        <button
          onClick={() => setTrash((v) => !v)}
          className={`h-8 px-3 text-[13px] rounded-lg border ${trash
            ? "bg-rose-50 border-rose-300 text-rose-700 font-medium"
            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >🗑️ ถังขยะ</button>
      </div>
      )}

      <div className="flex gap-4 items-start">
        {/* sidebar */}
        <aside className="w-44 shrink-0 hidden md:block">
          <p className="text-[11px] font-medium text-slate-400 mb-1.5">มุมมอง</p>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={source === "by-brand"} onClick={() => setSource("by-brand")} label="ดูตามแบรนด์" icon="🏷️" />
          </div>
          <p className="text-[11px] font-medium text-slate-400 mb-1.5">ที่มา</p>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={source === "upload"} onClick={() => setSource("upload")} label="รูปที่อัปเอง" icon="📤" />
            <SideItem active={source === "artwork"} onClick={() => setSource("artwork")} label="Artwork" icon="🎨" />
            <SideItem active={source === "print"} onClick={() => setSource("print")} label="งานพิมพ์" icon="🖨" />
            <SideItem active={source === "odoo_product"} onClick={() => setSource("odoo_product")} label="รูปสินค้า (Odoo)" icon="🛍️" />
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-slate-400">อัลบั้ม</p>
            <button onClick={() => setNewColOpen(true)} className="text-[11px] text-indigo-600 hover:underline">＋ ใหม่</button>
          </div>
          <div className="flex flex-col gap-0.5 mb-4">
            <SideItem active={collectionId === null} onClick={() => setCollectionId(null)} label="ทั้งหมด" />
            <SideItem active={collectionId === "none"} onClick={() => setCollectionId("none")} label="ไม่อยู่อัลบั้ม" />
            {collections.map((c) => (
              <SideItem key={c.id} active={collectionId === c.id} onClick={() => setCollectionId(c.id)}
                label={c.name} count={c.count} icon="📁" />
            ))}
          </div>
          {tags.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-slate-400 mb-1.5">แท็ก</p>
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
              <p className="text-[12px] text-indigo-700">📁 รูปในโฟลเดอร์เดียวกับ “<b>{folderFilter.label}</b>” · {total.toLocaleString("th-TH")} รูป</p>
              <button onClick={() => setFolderFilter(null)} className="text-[12px] text-indigo-600 hover:underline">✕ ออกจากมุมมองโฟลเดอร์</button>
            </div>
          )}
          {searching && (
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-[12px] text-slate-500">🔍 ผลค้นหา “<b>{search.trim()}</b>” ทั้งคลัง · {total.toLocaleString("th-TH")} ไฟล์</p>
              {rows.some((r) => isImage(r)) && (
                <button onClick={downloadSearchZip} disabled={zipBusy} title="โหลดรูปทั้งหมดในผลค้นหานี้เป็นไฟล์ zip"
                  className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap">
                  {zipBusy ? (zipMsg || "กำลังเตรียม…") : "⬇ ดาวน์โหลดรูปผลค้นหา (zip)"}
                </button>
              )}
            </div>
          )}
          {searching && searchFolders.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-medium text-slate-600 mb-1.5">📂 อัลบั้มสินค้า (Parent SKU) ที่ตรงคำค้น — กดเพื่อเปิดดูรูปทั้งหมดแบบ “ดูตามแบรนด์”</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                {searchFolders.map((f) => (
                  <button key={f.id} onClick={() => openFolder(f.id)}
                    className="flex items-center gap-2 text-left rounded-xl border border-slate-200 bg-white p-2.5 hover:border-indigo-400 hover:bg-indigo-50/40 hover:shadow-sm transition">
                    <span className="text-xl shrink-0">📂</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[12px] text-slate-700">{f.code}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{f.name}</span>
                    </span>
                    <span className="text-[10px] text-indigo-600 font-medium shrink-0 whitespace-nowrap">เปิดอัลบั้ม ›</span>
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
                    {rows.every((r) => selected.has(r.id)) ? "☑ ล้างที่เลือก" : `☐ เลือกทั้งหมดในหน้านี้ (${rows.length})`}
                  </button>
                : <span />}
              <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={goPage} unitLabel="ไฟล์" />
            </div>
          )}
          {showBrandView ? (
            <BrandAlbumBrowser reloadKey={brandReload} openParentId={brandOpenParent} />
          ) : loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              {searching ? `ไม่พบไฟล์ที่ตรงกับ “${search.trim()}”`
                : trash ? "ถังขยะว่าง"
                : source === "artwork" ? "ยังไม่มี Artwork — กด “เพิ่ม Artwork” เพื่อลงบัตรงานออกแบบ (รูปตัวอย่าง + path ไฟล์ต้นฉบับ)"
                : source === "print" ? "ยังไม่มีงานพิมพ์ — กด “เพิ่มงานพิมพ์” เพื่อลงรูป preview + ไฟล์ .ai/.pdf สำหรับส่งพิมพ์"
                : source === "odoo_product" ? "ยังไม่มีรูปสินค้านำเข้า"
                : "ยังไม่มีไฟล์ในคลัง — กด “อัปโหลด” เพื่อเริ่มเก็บไฟล์"}
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
            <div className="mt-4"><Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={goPage} unitLabel="ไฟล์" /></div>
          )}
        </main>
      </div>

      {/* bulk bar — อยู่ล่าง (ที่เดิม) · z สูง ลอยอยู่หน้าสุดไม่โดนบัง */}
      {selCount > 0 && (
        <div className="sticky bottom-4 z-40 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-600 text-white shadow-lg w-fit mx-auto flex-wrap justify-center">
          <span className="text-sm font-medium">เลือก {selCount} ไฟล์</span>
          {!trash && <button onClick={() => setBulkEditOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">✏️ แก้หลายรายการ</button>}
          {!trash && <button onClick={() => setBulkTagOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">🏷️ ติดแท็ก</button>}
          {!trash && <button onClick={() => setBulkMoveOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">📁 จัดอัลบั้ม</button>}
          {!trash && driveOn && <button onClick={() => setBulkFolderOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">🗂️ สร้าง Folder Drive</button>}
          {!trash && driveOn && <button onClick={() => setBulkLinkOpen(true)} disabled={bulkLinkBusy} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50">{bulkLinkBusy ? "กำลังผูก…" : "📎 ใช้โฟลเดอร์เดียวกัน"}</button>}
          <button onClick={() => setBulkTrashOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">🗑️ ลบ</button>
          <button onClick={clearSel} className="text-sm px-2 py-1 rounded-lg hover:bg-white/15">ยกเลิก</button>
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
        <ArtworkAddModal actor={actor} artTypes={artTypes} collections={collections} initialFile={pendingFile}
          defaultCollectionIds={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => { setArtworkAddOpen(false); setPendingFile(null); }}
          onDone={async () => { setArtworkAddOpen(false); setPendingFile(null); await load(); await loadMeta(); }} />
      )}
      {massOpen && (
        <MassArtworkModal actor={actor} artTypes={artTypes} collections={collections} initialFiles={pendingFiles}
          defaultAlbums={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => { setMassOpen(false); setPendingFiles(null); }}
          onDone={async () => { setMassOpen(false); setPendingFiles(null); await load(); await loadMeta(); }} />
      )}
      {manageTypesOpen && (
        <ManageTypesModal types={artTypes} onClose={() => setManageTypesOpen(false)}
          onChanged={async () => { await loadMeta(); }} />
      )}
      {printAddOpen && (
        <PrintJobAddModal actor={actor} printTypes={printTypes} collections={collections}
          defaultCollectionIds={collectionId && collectionId !== "none" ? [collectionId] : []}
          onClose={() => setPrintAddOpen(false)}
          onDone={async () => { setPrintAddOpen(false); await load(); await loadMeta(); }} />
      )}
      {managePrintOpen && (
        <ManagePrintTypesModal types={printTypes} onClose={() => setManagePrintOpen(false)}
          onChanged={async () => { await loadMeta(); }} />
      )}
      {driveScanOpen && (
        <DriveScanModal artTypes={artTypes} onClose={() => setDriveScanOpen(false)}
          onDone={async () => { setDriveScanOpen(false); await load(); await loadMeta(); }} />
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
        title="ย้ายไฟล์ลงถังขยะ?" message={`จะย้าย ${selCount} ไฟล์ลงถังขยะ (กู้คืนได้ 30 วัน) — ไฟล์ที่ยังถูกใช้อยู่จะถูกข้าม`}
        confirmText="ย้ายลงถังขยะ" variant="danger"
      />
      {bulkTagOpen && <BulkTagModal count={selCount} tags={tags} onClose={() => setBulkTagOpen(false)} onApply={bulkTag} />}
      {bulkMoveOpen && <BulkMoveModal count={selCount} collections={collections} onClose={() => setBulkMoveOpen(false)} onApply={bulkMove} />}
      {bulkEditOpen && <BulkEditModal ids={Array.from(selected)} artTypes={artTypes}
        onClose={() => setBulkEditOpen(false)}
        onDone={async () => { setBulkEditOpen(false); clearSel(); await load(); await loadMeta(); }} />}
      {bulkFolderOpen && <BulkFolderModal ids={Array.from(selected)} firstAsset={rows.find((r) => selected.has(r.id)) ?? null}
        onClose={() => setBulkFolderOpen(false)}
        onDone={async () => { setBulkFolderOpen(false); clearSel(); await load(); await loadMeta(); }} />}
      {bulkLinkBusy && <LoadingOverlay message="กำลังผูกโฟลเดอร์ + ก็อปรูป… อาจใช้เวลาสักครู่" />}
      {/* bulk: เลือกรูปต้นทาง (ที่มีโฟลเดอร์ Drive) → ผูกทุกรูปที่เลือกเข้าโฟลเดอร์เดียวกัน */}
      <AssetPicker open={bulkLinkOpen} onClose={() => setBulkLinkOpen(false)} typeFilter="image" defaultSource="artwork" requireDriveFolder
        defaultSearch={commonNameSeed(rows.filter((r) => selected.has(r.id)).map((r) => r.title))}
        title="เลือกรูปต้นทางที่มีโฟลเดอร์ Drive แล้ว" contextLabel={`ผูก ${selCount} รูปที่เลือกเข้าโฟลเดอร์เดียวกัน`}
        onSelect={(assets) => { const s = assets[0]; if (s) { setBulkLinkOpen(false); setLinkSource(s); setLinkConfirmOpen(true); } }} />
      {/* ยืนยันก่อนผูก — โชว์ชื่อโฟลเดอร์ปลายทาง */}
      <ConfirmDialog open={linkConfirmOpen} onClose={() => setLinkConfirmOpen(false)}
        onConfirm={() => { setLinkConfirmOpen(false); if (linkSource) void bulkLinkFolder(linkSource); }}
        title="ผูกเข้าโฟลเดอร์นี้?" confirmText="ผูกโฟลเดอร์"
        message={linkSource
          ? `จะผูก ${Array.from(selected).filter((x) => x !== linkSource.id).length} รูปเข้าโฟลเดอร์ “${driveFolderNameOf(linkSource)}” (เดียวกับ “${linkSource.title || linkSource.file_name}”) + ก็อปรูปตัวอย่างของแต่ละรูปเข้าไปด้วย`
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
          {!/\/folders\//.test(a.master_url ?? "") && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">📁 ไม่มีโฟลเดอร์</span>}
          {!a.sizes?.length && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">📐 ไม่มีขนาด</span>}
        </div>
      )}
      {/* งานพิมพ์: ป้ายประเภท (DTF/UV) + เตือนถ้ายังไม่มีไฟล์พิมพ์ */}
      {a.source === "print" && (
        <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
          {a.print_type && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700 border border-violet-200 shadow-sm">🖨 {a.print_type}</span>}
          {!/\/folders\//.test(a.master_url ?? "") && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">⚠ ยังไม่มีไฟล์พิมพ์</span>}
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
              : a.usage_count > 0 ? ` · ใช้อยู่ ${a.usage_count} ที่` : a.status === "active" ? " · ยังไม่ถูกใช้" : ""}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/^https?:\/\//i.test(a.master_url ?? "") && (
              <a href={(a.master_url ?? "").trim()} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                title="เปิดโฟลเดอร์/ไฟล์ต้นฉบับบน Google Drive"
                className="text-[10px] text-emerald-600 hover:underline">↗ {/drive\.google\.com|\/folders\//i.test(a.master_url ?? "") ? "Drive" : "เปิด"}</a>
            )}
            {onSameFolder && a.source === "artwork" && /\/folders\//.test(a.master_url ?? "") && (
              <button type="button" title="ดูรูปทั้งหมดในโฟลเดอร์ Drive เดียวกัน"
                onClick={(e) => { e.stopPropagation(); const m = (a.master_url ?? "").match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) onSameFolder(m[1], driveFolderNameOf(a)); }}
                className="text-[10px] text-indigo-600 hover:underline">📁 โฟลเดอร์</button>
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
    if (items.length === 0) { toast.error("ยังไม่ได้เลือกไฟล์"); return; }
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
        if (!res.ok || j.error) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
        next[i] = { ...next[i], status: j.duplicate ? "dup" : "done", msg: j.duplicate ? "มีอยู่แล้ว — ใช้ตัวเดิม" : undefined };
        done++;
      } catch (e) {
        next[i] = { ...next[i], status: "error", msg: e instanceof Error ? e.message : "ผิดพลาด" };
      }
      setItems([...next]);
    }
    setBusy(false);
    toast.success(`อัปโหลดเสร็จ ${done}/${items.length} ไฟล์`);
    if (done > 0) onDone();
  };

  return (
    <ERPModal open onClose={onClose} title="อัปโหลดไฟล์เข้าคลัง" size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">รองรับ รูป / PDF / ไฟล์ออกแบบ / วิดีโอ · ไม่เกิน 25MB ต่อไฟล์</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <button onClick={upload} disabled={busy || items.length === 0}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {busy ? "กำลังอัป…" : "บันทึกเข้าคลัง"}
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
        <p className="text-sm font-medium text-slate-700">ลากไฟล์มาวางที่นี่</p>
        <p className="text-[12px] text-slate-400">หรือ คลิกเพื่อเลือกไฟล์</p>
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
                {it.status === "done" ? "✓ เสร็จ" : it.status === "dup" ? "ซ้ำ — ใช้ตัวเดิม" :
                 it.status === "error" ? `✕ ${it.msg ?? "ผิดพลาด"}` : it.status === "uploading" ? "กำลังอัป…" : formatBytes(it.file.size)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ย่อขนาดรูปก่อนอัป — ประหยัดพื้นที่/โหลดเร็ว · เลือก "ขนาดจริง" ถ้าต้องเก็บไฟล์เต็ม */}
      <div className="mb-3">
        <p className="text-[12px] text-slate-500 mb-1">ย่อขนาดรูปก่อนอัป <span className="text-[10px] text-slate-400">(ด้านกว้าง · ไฟล์ที่ไม่ใช่รูปไม่ถูกย่อ)</span></p>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {[{ w: 800, label: "800px" }, { w: 1200, label: "1200px" }, { w: 1600, label: "1600px" }, { w: 0, label: "ขนาดจริง" }].map((o, i) => (
            <button key={o.w} type="button" onClick={() => setResizeW(o.w)} disabled={busy}
              className={`h-8 px-3 text-[12px] ${i > 0 ? "border-l border-slate-200" : ""} ${resizeW === o.w ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"} disabled:opacity-50`}>
              {resizeW === o.w ? "✓ " : ""}{o.label}
            </button>
          ))}
        </div>
        {resizeW === 0 && <p className="text-[11px] text-amber-600 mt-1">⚠ เก็บขนาดจริง — ไฟล์ใหญ่ขึ้น (ไม่เกิน 25MB/ไฟล์)</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] text-slate-500">
          แท็ก (คั่นด้วย ,)
          <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="สินค้า, กระเป๋า"
            className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>
        <label className="text-[12px] text-slate-500">
          อัลบั้ม
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}
            className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— ไม่ระบุ —</option>
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
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); onClose(); }
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
        body: JSON.stringify({ title, tags, collection_ids: collectionIds, master_path: masterPath, master_url: masterUrl, artwork_types: artTypesSel, keywords, sizes, parent_sku_codes: parentCodes }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกแล้ว"); await loadDetail(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const trash = async () => {
    setConfirmTrash(false);
    try {
      const res = await apiFetch(`/api/assets/${id}${alsoDrive ? "?drive=1" : ""}`, { method: "DELETE" });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(j.driveTrashed ? "ย้ายลงถังขยะ + ทิ้งโฟลเดอร์ Drive แล้ว" : "ย้ายลงถังขยะแล้ว");
      if (alsoDrive && !j.driveTrashed) toast.warning("ลบไฟล์ในคลังแล้ว แต่ทิ้งโฟลเดอร์ Drive ไม่สำเร็จ — ลองลบใน Drive เอง");
      onChanged(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const restore = async () => {
    try {
      const res = await apiFetch(`/api/assets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("กู้คืนแล้ว"); onChanged(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };

  const copyLink = () => {
    if (!d) return;
    navigator.clipboard?.writeText(window.location.origin + d.url).then(
      () => toast.success("คัดลอกลิงก์แล้ว"), () => toast.error("คัดลอกไม่สำเร็จ"));
  };
  const copyPath = () => {
    if (!masterPath) return;
    navigator.clipboard?.writeText(masterPath).then(
      () => toast.success("คัดลอก path แล้ว — เปิด File Explorer แล้ววาง (Ctrl+V) ที่ช่องที่อยู่"),
      () => toast.error("คัดลอกไม่สำเร็จ"));
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
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "แทนที่ไม่สำเร็จ");
      toast.success("แทนที่ไฟล์แล้ว"); await loadDetail(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แทนที่ไม่สำเร็จ"); }
    finally { setReplacing(false); }
  };

  // สร้างโฟลเดอร์ Drive + ก็อปรูป preview (จาก R2 ไม่ลบของเดิม) + อัปไฟล์ต้นฉบับถ้ามี → เก็บลิงก์โฟลเดอร์ทันที
  // ใช้ได้ทั้งกรณีมีไฟล์ต้นฉบับ และกรณี "แค่สร้างโฟลเดอร์ + ดึง preview" (ไม่แนบไฟล์)
  const doDriveUpload = async () => {
    if (!brandId) { toast.error("เลือกแบรนด์ก่อน (ไว้จัดโฟลเดอร์)"); return; }
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
      if (largeCount) toast.warning(`ไฟล์ใหญ่ ${largeCount} ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์แล้วลากขึ้นเอง`);
      if (folderLink) {
        setMasterUrl(folderLink);
        // path ต้นฉบับตามโฟลเดอร์ใหม่ (ถ้ายัง auto) = <ฐานแบรนด์>\<ซับชนิด>\<ชื่องาน>
        const newPath = pathAuto ? brandFolderPath(title.trim() || d.file_name, brandId, artTypesSel[0], brandBase, typeSub) : "";
        const patch: Record<string, unknown> = { master_url: folderLink };
        if (newPath) { patch.master_path = newPath; setMasterPath(newPath); }
        await apiFetch(`/api/assets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        toast.success(srcFiles.length ? "อัปขึ้น Drive + เก็บลิงก์แล้ว" : "สร้างโฟลเดอร์ + ดึงรูป preview แล้ว"); setSrcFiles([]); setDriveFilesKey((k) => k + 1); await loadDetail(); onChanged();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัป Drive ไม่สำเร็จ"); }
    finally { setDriveBusy(false); setDriveProg({ done: 0, total: 0 }); }
  };

  // ผูกไฟล์นี้เข้าโฟลเดอร์ Drive เดียวกับรูปที่เลือก (ไม่สร้างโฟลเดอร์ใหม่) + ก็อปรูป preview เข้าไปด้วย
  const linkToSharedFolder = async (src: AssetRow) => {
    if (!d) return;
    if (src.id === id) { toast.error("เลือกรูปอื่นที่ไม่ใช่รูปนี้"); return; }
    if (!/\/folders\//.test(src.master_url ?? "")) { toast.error(`รูป “${src.title || src.file_name}” ยังไม่มีโฟลเดอร์ Drive — เลือกรูปที่มีโฟลเดอร์แล้ว`); return; }
    setLinkBusy(true);
    try {
      const res = await apiFetch("/api/assets/drive-folders/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, source_id: src.id, follow_path: pathAuto }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ผูกโฟลเดอร์ไม่สำเร็จ");
      if (j.folderLink) { setMasterUrl(j.folderLink); await loadDetail(); onChanged(); }   // path ตามโฟลเดอร์ (server เซ็ตให้เมื่อ follow_path) → loadDetail สะท้อน
      toast.success(`ผูกโฟลเดอร์เดียวกับ “${src.title || src.file_name}” แล้ว`);
      setLinkPickerOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ผูกโฟลเดอร์ไม่สำเร็จ"); }
    finally { setLinkBusy(false); }
  };

  // เปลี่ยนชื่อโฟลเดอร์ Drive จริง + อัปเดต path ของ "ทุกรูปที่ใช้โฟลเดอร์นี้"
  const doRenameFolder = async () => {
    const nm = renameName.trim();
    if (!nm) { toast.error("ใส่ชื่อใหม่ก่อน"); return; }
    setRenameBusy(true);
    try {
      const res = await apiFetch("/api/assets/drive-folders/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_url: masterUrl, new_name: nm }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "เปลี่ยนชื่อไม่สำเร็จ");
      toast.success(`เปลี่ยนชื่อโฟลเดอร์เป็น “${nm}” แล้ว · อัปเดต ${j.count ?? 1} รูปที่ใช้โฟลเดอร์นี้`);
      setRenameOpen(false); await loadDetail(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปลี่ยนชื่อไม่สำเร็จ"); }
    finally { setRenameBusy(false); }
  };

  const trashed = d?.status === "trashed";
  const pathWarn = !trashed && !!masterPath.trim() && !pathMatchesRule(masterPath, rule.base_paths);

  return (
    <ERPModal open onClose={onClose} title={d?.file_name ?? "รายละเอียดไฟล์"} size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex gap-2">
            {d && <a href={d.url} target="_blank" rel="noreferrer" className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center">⬇ ดาวน์โหลด</a>}
            <button onClick={copyLink} className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">🔗 คัดลอกลิงก์</button>
            {!trashed && (
              <button onClick={() => replaceRef.current?.click()} disabled={replacing}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                {replacing ? "กำลังแทนที่…" : "🔄 แทนที่ไฟล์"}</button>
            )}
            <input ref={replaceRef} type="file" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void doReplace(f); e.currentTarget.value = ""; }} />
          </div>
          <div className="flex gap-2">
            {trashed
              ? <button onClick={restore} className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">♻ กู้คืน</button>
              : <button onClick={() => { setAlsoDrive(false); setConfirmTrash(true); }} className="h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">🗑️ ลบ</button>}
            {!trashed && <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "บันทึก…" : "บันทึก"}</button>}
          </div>
        </div>
      }>
      {/* ปุ่มเลื่อนดูรูปก่อนหน้า/ถัดไป (ลอยข้างจอ) */}
      {onNavigate && prevId && (
        <button onClick={() => onNavigate(prevId)} title="รูปก่อนหน้า"
          className="fixed left-3 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 text-2xl leading-none flex items-center justify-center hover:bg-slate-50">‹</button>
      )}
      {onNavigate && nextId && (
        <button onClick={() => onNavigate(nextId)} title="รูปถัดไป"
          className="fixed right-3 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 text-2xl leading-none flex items-center justify-center hover:bg-slate-50">›</button>
      )}
      {(driveBusy || linkBusy) && <LoadingOverlay message={linkBusy ? "กำลังผูกโฟลเดอร์ + ก็อปรูป…" : "กำลังทำงานกับ Drive… อาจใช้เวลาสักครู่"} />}
      {!d ? (
        <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>
      ) : (
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] bg-slate-100 rounded-xl flex items-center justify-center min-h-[240px] overflow-hidden">
            {isImage(d) ? (
              <button type="button" onClick={() => setZoom(true)} title="กดเพื่อดูรูปใหญ่"
                className="group relative w-full h-full min-h-[240px] flex items-center justify-center cursor-zoom-in">
                <img src={withImageWidth(d.url, 768) ?? d.url} alt={d.title} className="max-w-full max-h-[360px] object-contain" />
                <span className="absolute bottom-2 right-2 text-[11px] px-2 py-0.5 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 ดูรูปใหญ่</span>
              </button>
            ) : <div className="text-center"><div className="text-5xl">{TYPE_ICON[d.asset_type]}</div><p className="text-[11px] text-slate-400 mt-2">{(d.ext ?? "").toUpperCase()}</p></div>}
          </div>

          <div className="flex-1 min-w-[240px]">
            <label className="text-[12px] text-slate-500">ชื่อไฟล์
              <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={trashed}
                className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
            </label>

            {d.source === "artwork" && (
              <div className="block text-[12px] text-slate-500 mt-2">ชนิด artwork <span className="text-[10px] text-slate-400">— เลือกได้หลายอัน</span>
                <div className="mt-1"><ArtTypeMultiSelect value={artTypesSel} types={artTypeList} onChange={setArtTypesSel} onCreated={(t) => setArtTypeList((c) => [...c, t])} disabled={trashed} /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="text-[12px] text-slate-500">อัลบั้ม <span className="text-[10px] text-slate-400">(เลือกได้หลายอัน)</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {collections.length === 0 && <span className="text-[11px] text-slate-400">ยังไม่มีอัลบั้ม</span>}
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
              <div className="text-[12px] text-slate-500">แท็ก
                <div className="mt-1">{trashed ? <span className="text-[11px] text-slate-400">{tags.join(", ") || "—"}</span> : <TagPickerField value={tags} onChange={setTags} />}</div>
              </div>
            </div>

            <label className="block text-[12px] text-slate-500 mt-3">คำค้นเพิ่มเติม (keyword)
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={trashed}
                placeholder="คำพ้อง/ชื่ออื่น เช่น flower ดอกไม้ summer"
                className="mt-1 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" /></label>

            {d.source === "artwork" && (
              <>
                <div className="mt-3"><p className="text-[12px] font-medium text-slate-600 mb-1">📐 ขนาด (กว้าง × สูง)</p><SizesEditor value={sizes} onChange={setSizes} disabled={trashed} /></div>
                <div className="mt-3"><p className="text-[12px] font-medium text-slate-600 mb-1">📦 Parent SKU ที่ใช้</p><ParentSkuField value={parentCodes} onChange={setParentCodes} disabled={trashed} /></div>
              </>
            )}

            <table className="w-full text-[12px] mt-3">
              <tbody>
                <Meta label="ชนิด" value={ASSET_TYPE_LABEL[d.asset_type]} />
                <Meta label="ขนาด" value={formatBytes(d.size_bytes)} />
                {d.width && d.height ? <Meta label="ความละเอียด" value={`${d.width} × ${d.height}`} /> : null}
                <Meta label="ผู้อัป" value={d.uploaded_by ?? "—"} />
                <Meta label="วันที่อัป" value={new Date(d.created_at).toLocaleString("th-TH")} />
              </tbody>
            </table>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[12px] font-medium text-slate-600 mb-1.5">📁 ไฟล์ต้นฉบับ <span className="text-[10px] text-slate-400 font-normal">— คลังเก็บแค่ “ที่อยู่/ลิงก์” ไม่ได้เก็บไฟล์ใหญ่ (อยู่ NAS หรือ Drive ก็ได้)</span></p>
              <input value={masterPath} onChange={(e) => { setMasterPath(e.target.value); setPathAuto(false); }} disabled={trashed}
                placeholder="\\nas\Artwork\PIX\PIX32-02_v3.ai  หรือ  Z:\Artwork\…"
                className={`w-full h-8 px-2 text-[12px] border rounded-lg font-mono disabled:bg-slate-50 ${pathWarn ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`} />
              {pathWarn && <p className="text-[11px] text-amber-600 mt-1">⚠ ไม่ได้อยู่ในโฟลเดอร์มาตรฐาน — ควรเก็บใต้ <b className="font-mono">{rule.base_paths.join(" หรือ ")}</b></p>}
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <button onClick={copyPath} disabled={!masterPath} className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">📋 คัดลอก path</button>
                <button onClick={openFolder} disabled={!masterPath} className="h-7 px-2.5 text-[11px] border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 disabled:opacity-40">📂 เปิดโฟลเดอร์</button>
                {masterUrl && <a href={masterUrl} target="_blank" rel="noreferrer" className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 flex items-center">🌐 เปิดต้นฉบับ</a>}
                {!trashed && /\/folders\//.test(masterUrl) && (
                  <button onClick={() => { setRenameName(driveFolderNameOf({ master_path: masterPath, title: d?.title, file_name: d?.file_name })); setRenameOpen(true); }}
                    className="h-7 px-2.5 text-[11px] border border-amber-200 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100">✏️ เปลี่ยนชื่อโฟลเดอร์</button>
                )}
              </div>
              <input value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} disabled={trashed}
                placeholder="ลิงก์ Google Drive / Synology (เปิดได้ทุกที่) — ไม่ใส่ก็ได้"
                className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded-lg mt-1.5 disabled:bg-slate-50" />

              {/* ในโฟลเดอร์นี้มีไฟล์อะไรบ้าง (ของกลาง) — โหลดเองแบบไม่บล็อก + ปุ่มเปิดทีละไฟล์ใน Drive */}
              {/\/folders\//.test(masterUrl) && <DriveFolderFiles folder={masterUrl} reloadKey={driveFilesKey} />}

              {/* เพิ่มไฟล์ต้นฉบับขึ้น Drive ย้อนหลัง (ลืมใส่ตอนสร้าง) → สร้างโฟลเดอร์ใหม่ หรือ ใช้โฟลเดอร์เดียวกับรูปอื่น */}
              {driveOn && !trashed && (
                <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200">
                  <p className="text-[12px] font-medium text-slate-600 mb-1.5">📤 ไฟล์ต้นฉบับบน Drive</p>
                  {/* เลือกปลายทาง: โฟลเดอร์ใหม่ vs ใช้โฟลเดอร์เดียวกับรูปอื่น (ไม่อยากสร้างหลายโฟลเดอร์) */}
                  <div className="flex gap-1 mb-2 p-0.5 bg-slate-100 rounded-lg">
                    <button type="button" onClick={() => setDriveMode("new")}
                      className={`flex-1 h-7 text-[11px] font-medium rounded-md transition ${driveMode === "new" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>🆕 โฟลเดอร์ใหม่</button>
                    <button type="button" onClick={() => setDriveMode("shared")}
                      className={`flex-1 h-7 text-[11px] font-medium rounded-md transition ${driveMode === "shared" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>📎 ใช้โฟลเดอร์เดียวกับรูปอื่น</button>
                  </div>

                  {driveMode === "new" ? (
                    <>
                      <p className="text-[10px] text-slate-400 mb-1.5">สร้างโฟลเดอร์ใหม่ + ก็อปรูปตัวอย่างให้อัตโนมัติ</p>
                      <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
                        className={`w-full h-8 px-2 text-[12px] border rounded-lg bg-white mb-1.5 ${brandId ? "border-slate-200" : "border-amber-300"}`}>
                        <option value="">— เลือกแบรนด์ (ไว้จัดโฟลเดอร์) —</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <div onClick={() => srcInputRef.current?.click()}
                        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]); }}
                        onDragOver={(e) => e.preventDefault()}
                        className="border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-center text-[12px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
                        + ลากไฟล์ AI/PSD/PDF มาวาง หรือคลิกเลือก
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
                        {driveBusy ? (driveProg.total ? `กำลังอัป ${driveProg.done}/${driveProg.total}…` : "กำลังทำ…")
                          : srcFiles.length > 0 ? "⬆ อัปขึ้น Drive + เก็บลิงก์" : "📁 สร้างโฟลเดอร์ + ดึงรูป preview"}
                      </button>
                      {!srcFiles.length && <p className="text-[11px] text-slate-400 mt-1">ยังไม่แนบไฟล์ต้นฉบับก็กดได้ — จะสร้างโฟลเดอร์ Drive + ก็อปรูปตัวอย่างเข้าไปให้ แล้วค่อยลากไฟล์ .ai เข้าเองทีหลัง</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-slate-400 mb-1.5">เลือกรูปที่มีโฟลเดอร์อยู่แล้ว → ผูกรูปนี้เข้าโฟลเดอร์เดียวกัน + ก็อปรูปตัวอย่างของรูปนี้เข้าไปด้วย (ไม่สร้างโฟลเดอร์ใหม่)</p>
                      <button type="button" onClick={() => setLinkPickerOpen(true)} disabled={linkBusy}
                        className="w-full h-8 text-[12px] font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {linkBusy && <Spinner size={13} />}{linkBusy ? "กำลังผูกโฟลเดอร์…" : "📎 เลือกรูปที่มีโฟลเดอร์แล้ว"}
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
        title="ย้ายไฟล์ลงถังขยะ?" confirmText="ย้ายลงถังขยะ" variant="danger"
        message={
          <div>
            <p>ไฟล์นี้จะถูกย้ายลงถังขยะ — กู้คืนได้ภายใน 30 วัน</p>
            {/\/folders\//.test(masterUrl) && (
              <label className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 cursor-pointer">
                <input type="checkbox" checked={alsoDrive} onChange={(e) => setAlsoDrive(e.target.checked)} className="mt-0.5 shrink-0" />
                <span className="text-[12px] text-rose-700">
                  <b>ลบโฟลเดอร์ใน Google Drive ด้วย</b>
                  <span className="block text-[11px] text-rose-600 mt-0.5">โฟลเดอร์ + ไฟล์ต้นฉบับข้างในจะถูกย้ายไป “ถังขยะของ Drive” (ยังกู้คืนได้ในถังขยะ Drive ~30 วัน)</span>
                </span>
              </label>
            )}
          </div>
        } />

      {zoom && d && isImage(d) && (
        <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-6" onClick={() => setZoom(false)}>
          <img src={d.url} alt={d.title} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setZoom(false)} title="ปิด"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-slate-700 text-lg flex items-center justify-center hover:bg-white">✕</button>
        </div>
      )}

      {/* เลือกรูปต้นทางเพื่อผูกโฟลเดอร์เดียวกัน (โหมด 📎 ใช้โฟลเดอร์เดียวกับรูปอื่น) */}
      <AssetPicker open={linkPickerOpen} onClose={() => setLinkPickerOpen(false)} typeFilter="image" defaultSource="artwork" requireDriveFolder
        defaultSearch={commonNameSeed([d?.title ?? title])}
        title="เลือกรูปที่มีโฟลเดอร์ Drive แล้ว" contextLabel="ผูกโฟลเดอร์เดียวกับรูปนี้"
        onSelect={(assets) => { const s = assets[0]; if (s) { setLinkPickerOpen(false); setLinkConfirmSrc(s); } }} />
      {/* เปลี่ยนชื่อโฟลเดอร์ Drive — มีผลกับทุกรูปที่ใช้โฟลเดอร์นี้ */}
      <ConfirmDialog open={renameOpen} onClose={() => setRenameOpen(false)} onConfirm={doRenameFolder}
        title="เปลี่ยนชื่อโฟลเดอร์ต้นฉบับ" confirmText={renameBusy ? "กำลังเปลี่ยน…" : "เปลี่ยนชื่อ"} loading={renameBusy}
        message={
          <div>
            <p className="mb-2">เปลี่ยนชื่อโฟลเดอร์ใน Google Drive จริง — และอัปเดต path ให้<b>ทุกรูปที่ใช้โฟลเดอร์นี้</b>ด้วย</p>
            <input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !renameBusy) void doRenameFolder(); }}
              placeholder="ชื่อโฟลเดอร์ใหม่"
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-[11px] text-slate-400 mt-1.5">ไฟล์ข้างในไม่ถูกแตะ · ชื่อรูปในคลังไม่เปลี่ยน (เปลี่ยนแค่ชื่อโฟลเดอร์)</p>
          </div>
        } />

      {/* ยืนยันก่อนผูก — โชว์ชื่อโฟลเดอร์ปลายทาง */}
      <ConfirmDialog open={!!linkConfirmSrc} onClose={() => setLinkConfirmSrc(null)}
        onConfirm={() => { const s = linkConfirmSrc; setLinkConfirmSrc(null); if (s) void linkToSharedFolder(s); }}
        title="ผูกเข้าโฟลเดอร์นี้?" confirmText="ผูกโฟลเดอร์"
        message={linkConfirmSrc ? `จะผูกรูปนี้เข้าโฟลเดอร์ “${driveFolderNameOf(linkConfirmSrc)}” (เดียวกับ “${linkConfirmSrc.title || linkConfirmSrc.file_name}”) + ก็อปรูปตัวอย่างเข้าไปด้วย` : ""} />
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
  if (usages.length === 0)
    return <p className="text-[12px] text-slate-400 mt-3 pt-3 border-t border-slate-100">ยังไม่ถูกใช้ที่ไหน — ลบได้</p>;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-[12px] font-medium text-slate-600 mb-1.5">🔗 ถูกใช้อยู่ {usages.length} ที่ <span className="text-[11px] text-slate-400 font-normal">— ลบไม่ได้จนกว่าจะเอาออกจากที่ใช้งาน</span></p>
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
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) { toast.error("ใส่ชื่ออัลบั้มก่อน"); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/assets/collections", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("สร้างอัลบั้มแล้ว"); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title="สร้างอัลบั้มใหม่" size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={create} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">สร้าง</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">ชื่ออัลบั้ม
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="เช่น รูปสินค้าใหม่ Q2"
          className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </label>
    </ERPModal>
  );
}

// ── ติดแท็กหลายไฟล์ ──
function BulkTagModal({ count, tags, onClose, onApply }: {
  count: number; tags: AssetTag[]; onClose: () => void; onApply: (tag: string) => void;
}) {
  const [name, setName] = useState("");
  const apply = () => { if (name.trim()) onApply(name.trim()); };
  return (
    <ERPModal open onClose={onClose} title={`ติดแท็กให้ ${count} ไฟล์`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={apply} disabled={!name.trim()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">ติดแท็ก</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">ชื่อแท็ก (มีอยู่แล้วหรือพิมพ์ใหม่)
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="เช่น โปรโมชั่น"
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
  const [col, setCol] = useState("");
  return (
    <ERPModal open onClose={onClose} title={`เพิ่ม ${count} ไฟล์เข้าอัลบั้ม`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => onApply(col)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">ตกลง</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">เลือกอัลบั้ม (asset อยู่ได้หลายอัลบั้ม)
        <select value={col} onChange={(e) => setCol(e.target.value)}
          className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">— เอาออกจากทุกอัลบั้ม —</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </ERPModal>
  );
}

// แถวฟิลด์ใน bulk edit — ติ๊กเปิด/ปิดการแก้ฟิลด์ (module-level กัน remount ตอนพิมพ์)
function BulkEditRow({ on, setOn, label, preview, children }: { on: boolean; setOn: (v: boolean) => void; label: string; preview?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-2.5 ${on ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200"}`}>
      <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> {label}
      </label>
      {preview != null && <div className="mt-1 pl-6 text-[11px] text-slate-500">เดิม: {preview}</div>}
      {on && <div className="mt-2">{children}</div>}
    </div>
  );
}

// สวิตช์โหมด "ใส่ค่าเดียว (ทุกไฟล์)" ↔ "แก้แยกแต่ละไฟล์"
function BulkModeToggle({ mode, setMode }: { mode: "all" | "each"; setMode: (m: "all" | "each") => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 text-[11px]">
      <button type="button" onClick={() => setMode("all")} className={`px-2.5 h-6 rounded-md ${mode === "all" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>ใส่ค่าเดียว (ทุกไฟล์)</button>
      <button type="button" onClick={() => setMode("each")} className={`px-2.5 h-6 rounded-md ${mode === "each" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>แก้แยกแต่ละไฟล์</button>
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
  const mixedTag = <span className="text-amber-600">ค่าต่างกัน ({ids.length} ไฟล์)</span>;
  const brandLabel = (id: string) => id ? (brands.find((b) => b.id === id)?.name ?? "แบรนด์อื่น") : "— ไม่มีแบรนด์ —";
  const sizeLabel = (ss: AssetSize[]) => ss.length ? ss.map((s) => `${s.w}×${s.h} ${s.unit}`).join(", ") : "—";
  const prev = (field: keyof NonNullable<typeof cur>, render: (v: never) => React.ReactNode): React.ReactNode => {
    if (itemsLoading) return <span className="text-slate-400">กำลังโหลดค่าเดิม…</span>;
    if (!cur) return ids.length > PREFILL_CAP ? <span className="text-slate-400">ไฟล์เยอะ — ไม่ดึงค่าเดิม</span> : null;
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
    if (!anyShared && !needPerFile) { toast.error("ติ๊กเลือกฟิลด์ที่จะแก้ก่อน"); return; }
    setBusy(true);
    try {
      if (anyShared) {
        const res = await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", asset_ids: ids, fields }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "แก้ไม่สำเร็จ");
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
      toast.success(`แก้ ${ids.length} ไฟล์แล้ว`); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`✏️ แก้ ${ids.length} ไฟล์พร้อมกัน`} size="lg"
      description="ติ๊กเฉพาะฟิลด์ที่จะแก้ · ขนาด/Parent SKU เลือกได้ว่า “ใส่ค่าเดียวทุกไฟล์” หรือ “แก้แยกแต่ละไฟล์” · แท็ก = เพิ่มเข้าไป"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-amber-600">จะแก้ {ids.length} ไฟล์ที่เลือก</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? "กำลังบันทึก…" : `บันทึก ${ids.length} ไฟล์`}</button>
          </div>
        </div>
      }>
      {busy && <LoadingOverlay message="กำลังบันทึก…" />}
      <div className="space-y-2.5">
        <BulkEditRow on={enBrand} setOn={setEnBrand} label="แบรนด์" preview={prev("brand", (v: string) => brandLabel(v))}>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">— ไม่มีแบรนด์ —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </BulkEditRow>
        <BulkEditRow on={enType} setOn={setEnType} label="ชนิด (แทนที่ของเดิม)" preview={prev("types", (v: string[]) => (v.length ? v.join(", ") : "—"))}>
          <ArtTypeMultiSelect value={types} types={artTypeList} onChange={setTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
        </BulkEditRow>
        <BulkEditRow on={enSize} setOn={setEnSize} label="ขนาด (กว้าง × สูง)" preview={prev("sizes", (v: AssetSize[]) => sizeLabel(v))}>
          <BulkModeToggle mode={sizeMode} setMode={setSizeMode} />
          {sizeMode === "all"
            ? <div className="mt-1.5"><SizesEditor value={sizes} onChange={setSizes} /><p className="text-[10px] text-slate-400 mt-1">ใส่ค่าเดียว → แทนที่ทุกไฟล์</p></div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">↓ แก้ขนาดแยกแต่ละไฟล์ในส่วนล่าง</p>}
        </BulkEditRow>
        <BulkEditRow on={enParent} setOn={setEnParent} label="Parent SKU" preview={prev("parents", (v: string[]) => (v.length ? v.join(", ") : "—"))}>
          <BulkModeToggle mode={parentMode} setMode={setParentMode} />
          {parentMode === "all"
            ? <div className="mt-1.5"><ParentSkuField value={parents} onChange={setParents} /><p className="text-[10px] text-slate-400 mt-1">เลือกชุดเดียว → แทนที่ทุกไฟล์</p></div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">↓ แก้ Parent SKU แยกแต่ละไฟล์ในส่วนล่าง</p>}
        </BulkEditRow>
        <BulkEditRow on={enTags} setOn={setEnTags} label="แท็ก (เพิ่มเข้าไป)">
          <TagPickerField value={tags} onChange={setTags} />
        </BulkEditRow>
        <BulkEditRow on={enKw} setOn={setEnKw} label="คำค้นเพิ่มเติม (keyword — แทนที่ของเดิม)" preview={prev("keywords", (v: string) => v || "—")}>
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="เช่น flower ดอกไม้ summer"
            className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
        </BulkEditRow>
        <BulkEditRow on={enLoc} setOn={setEnLoc} label="ที่เก็บไฟล์ต้นฉบับ (path / ลิงก์โฟลเดอร์)"
          preview={prev("path", (v: string) => <>{v || "—"}{cur && !cur.url.mixed && cur.url.value ? <span className="text-slate-400"> · มีลิงก์โฟลเดอร์</span> : null}</>)}>
          <BulkModeToggle mode={locMode} setMode={setLocMode} />
          {locMode === "all"
            ? <div className="mt-1.5 space-y-1.5">
                <input value={locPath} onChange={(e) => setLocPath(e.target.value)} placeholder="path เช่น G:\Shared drives\…\Bow (Purple)" className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
                <input value={locUrl} onChange={(e) => setLocUrl(e.target.value)} placeholder="ลิงก์โฟลเดอร์ Drive (https://drive.google.com/…)" className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
                <p className="text-[10px] text-slate-400">ใส่ค่าเดียว → แทนที่ทุกไฟล์ (เว้นว่าง = ล้างค่า)</p>
              </div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">↓ แก้ path/ลิงก์แยกแต่ละไฟล์ในส่วนล่าง</p>}
        </BulkEditRow>

        {needPerFile && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/20 p-2.5">
            <p className="text-[12px] font-medium text-slate-700 mb-2">🗂️ แก้รายไฟล์ ({ids.length} ไฟล์)
              {enSize && sizeMode === "each" ? " · ขนาด" : ""}{enParent && parentMode === "each" ? " · Parent SKU" : ""}{enLoc && locMode === "each" ? " · ที่เก็บไฟล์" : ""}</p>
            {itemsLoading || items === null ? (
              <p className="text-[12px] text-slate-400 py-4 text-center">กำลังโหลดไฟล์ที่เลือก…</p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {it.isImg ? <img src={withImageWidth(it.url, 80) ?? it.url} alt="" className="w-9 h-9 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" /> : <span className="text-xl shrink-0">🎨</span>}
                      <span className="text-[12px] text-slate-700 truncate">{it.title}</span>
                    </div>
                    {enSize && sizeMode === "each" && (
                      <div className="mb-1.5"><p className="text-[10px] text-slate-400 mb-0.5">📐 ขนาด (กว้าง × สูง)</p><SizesEditor value={pfSizes[it.id] ?? []} onChange={(v) => setPfSizes((m) => ({ ...m, [it.id]: v }))} /></div>
                    )}
                    {enParent && parentMode === "each" && (
                      <div><p className="text-[10px] text-slate-400 mb-0.5">📦 Parent SKU</p><ParentSkuField value={pfParents[it.id] ?? []} onChange={(v) => setPfParents((m) => ({ ...m, [it.id]: v }))} /></div>
                    )}
                    {enLoc && locMode === "each" && (
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10px] text-slate-400 mb-0.5">📁 ที่เก็บไฟล์ต้นฉบับ</p>
                        <input value={pfPath[it.id] ?? ""} onChange={(e) => setPfPath((m) => ({ ...m, [it.id]: e.target.value }))} placeholder="path เช่น G:\Shared drives\…" className="w-full h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg" />
                        <input value={pfUrl[it.id] ?? ""} onChange={(e) => setPfUrl((m) => ({ ...m, [it.id]: e.target.value }))} placeholder="ลิงก์โฟลเดอร์ Drive" className="w-full h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg" />
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
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ทำไม่สำเร็จ");
        toast.success(`สร้างโฟลเดอร์ ${j.created} ไฟล์${j.skipped ? ` · ข้าม(มีแล้ว) ${j.skipped}` : ""}${j.failed ? ` · ล้มเหลว ${j.failed}` : ""}`);
      } else {
        const nm = folderName.trim(); if (!nm) { toast.error("ตั้งชื่อโฟลเดอร์ก่อน"); setBusy(false); return; }
        const master_path = brandFolderPath(nm, brandId, artType, brandBase, typeSub);   // path ในเครื่องตามแบรนด์/ชนิด/ชื่อ
        const res = await apiFetch("/api/assets/drive-folders/combined", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, brand_id: brandId || undefined, artwork_type: artType, folder_name: nm, master_path: master_path || undefined }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ทำไม่สำเร็จ");
        toast.success(`สร้างโฟลเดอร์ “${nm}” + ใส่ ${j.count ?? ids.length} รูปแล้ว`);
      }
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`🗂️ สร้างโฟลเดอร์ Drive (${ids.length} รูป)`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={run} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? "กำลังทำ…" : "สร้าง"}</button>
        </div>
      }>
      {busy && <LoadingOverlay message={mode === "combined" ? "กำลังสร้างโฟลเดอร์ + ก็อปรูป… อาจใช้เวลาสักครู่" : "กำลังสร้างโฟลเดอร์ทีละรูป… อาจใช้เวลาสักครู่"} />}
      <div className="flex gap-1 mb-3 p-0.5 bg-slate-100 rounded-lg">
        <button type="button" onClick={() => setMode("separate")}
          className={`flex-1 h-8 text-[12px] font-medium rounded-md transition ${mode === "separate" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>🗂️ แยก (รูปละโฟลเดอร์)</button>
        <button type="button" onClick={() => setMode("combined")}
          className={`flex-1 h-8 text-[12px] font-medium rounded-md transition ${mode === "combined" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>📦 รวมโฟลเดอร์เดียว</button>
      </div>

      {mode === "separate" ? (
        <p className="text-[12px] text-slate-500">แต่ละรูปจะได้โฟลเดอร์ Drive ของตัวเอง (ตามชื่อรูป + แบรนด์/ชนิดของรูปนั้น) · รูปที่มีโฟลเดอร์อยู่แล้วจะข้าม</p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] text-slate-500">สร้างโฟลเดอร์ Drive <b>1 อัน</b> แล้วเอาทุกรูปที่เลือกใส่เข้าไป (ก็อปรูปตัวอย่างให้ด้วย)</p>
          <label className="block text-[12px] text-slate-500">ชื่อโฟลเดอร์ <span className="text-red-500">*</span>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="เช่น Cherry Collection"
              className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg ${folderName.trim() ? "border-slate-200" : "border-amber-300"}`} /></label>
          <label className="block text-[12px] text-slate-500">แบรนด์ (ไว้จัดที่ตั้งโฟลเดอร์)
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">— โฟลเดอร์แม่ (ไม่จัดตามแบรนด์) —</option>
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
function ArtworkAddModal({ actor, artTypes, collections, onClose, onDone, initialFile, defaultCollectionIds }: { actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFile?: File | null; defaultCollectionIds?: string[] }) {
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
      onProgress: (done, total) => setDriveProg({ done, total }),
    });
    if (largeCount) toast.warning(`ไฟล์ใหญ่ ${largeCount} ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์ Drive จากลิงก์แล้วลากขึ้นเอง`);
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

  // ลากรูปมาวางบนหน้าคลัง → เปิด popup พร้อมรูปที่ลากมา
  useEffect(() => { if (initialFile) pick(initialFile); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // เลือกแบรนด์/ชนิด หรือแม็ปโหลดเสร็จ → เติม path ตามแบรนด์ใหม่ (ถ้ายัง auto อยู่)
  useEffect(() => { if (pathAuto && title.trim()) setMasterPath(buildPath(title)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brandId, artTypesSel, brandBase, typeSub]);

  const save = async () => {
    if (!file) { toast.error("แนบรูปตัวอย่างก่อน (export JPG/PNG จากงานออกแบบ)"); return; }
    if (!brandId) { toast.error("เลือกแบรนด์ก่อน"); return; }
    if (!artTypesSel.length) { toast.error("เลือกชนิด artwork ก่อน"); return; }
    // สร้างโฟลเดอร์ Drive เมื่อ: มีไฟล์ต้นฉบับโยนขึ้น หรือ ติ๊ก "สร้างอัตโนมัติ" และยังไม่มีลิงก์เอง
    const willAutoFolder = driveOn && autoFolder && !masterUrl.trim();
    const willDrive = driveOn && (srcFiles.length > 0 || willAutoFolder);
    if (!masterPath.trim() && !masterUrl.trim() && !willDrive) { toast.error("ใส่ที่อยู่ไฟล์ต้นฉบับอย่างน้อย 1 อย่าง (path NAS / ลิงก์ / สร้างโฟลเดอร์ Drive)"); return; }
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
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success("เพิ่ม Artwork ลงคลังแล้ว"); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="เพิ่ม Artwork ลงคลัง" size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">
            {driveProg.total > 0 ? `📤 อัปขึ้น Drive ${driveProg.done}/${driveProg.total}…` : "รูปตัวอย่างเล็กพอ — ไฟล์ใหญ่ .ai/.psd เก็บที่ NAS/Drive"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? (driveProg.total > 0 ? `อัป Drive ${driveProg.done}/${driveProg.total}…` : "กำลังบันทึก…") : "บันทึก"}</button>
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
            : <div className="text-center py-6"><div className="text-3xl">🎨</div><p className="text-[12px] text-slate-500 mt-1">วางรูปตัวอย่าง / คลิกเลือก</p></div>}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px] text-slate-500">ชื่อ
            <input value={title} onChange={(e) => { const v = e.target.value; setTitle(v); if (pathAuto) setMasterPath(buildPath(v, fileExt)); }} placeholder="เช่น ลายดอกไม้ PIX32"
              className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
          <label className="text-[12px] text-slate-500">แบรนด์ <span className="text-red-500">*</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg bg-white ${brandId ? "border-slate-200" : "border-amber-300"}`}>
              <option value="">— เลือกแบรนด์ —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-[12px] text-slate-500">ชนิด <span className="text-red-500">*</span> <span className="text-[10px] text-slate-400">— เลือกได้หลายอัน</span>
              <div className={`mt-0.5 rounded-lg ${artTypesSel.length ? "" : "ring-1 ring-amber-300"}`}><ArtTypeMultiSelect value={artTypesSel} types={artTypeList} onChange={setArtTypesSel} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div></div>
            <div className="text-[12px] text-slate-500">Group Album <span className="text-[10px] text-slate-400">— เลือกได้หลายอัน / สร้างใหม่ได้</span>
              <div className="mt-0.5"><CollectionMultiSelect value={collectionIds} collections={cols} onChange={setCollectionIds} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
          </div>
          <div className="text-[12px] text-slate-500">แท็ก <span className="text-[10px] text-slate-400">— กดเลือกในป๊อปอัป</span>
            <div className="mt-0.5"><TagPickerField value={tags} onChange={setTags} /></div></div>
        </div>
      </div>

      {/* ขนาด (หลายไซส์ + ชื่อกำกับ + หน่วย) */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] font-medium text-slate-600 mb-1.5">📐 ขนาด (กว้าง × สูง) <span className="text-[10px] text-slate-400 font-normal">— เพิ่มได้หลายไซส์ ใส่ชื่อกำกับ + เลือกหน่วยต่อไซส์</span></p>
        {sizeHint && (
          <p className="text-[11px] text-slate-400 mb-1">📷 จากรูป {sizeHint.px.w}×{sizeHint.px.h} px @ {sizeHint.dpi} DPI {sizeHint.fromImage ? "(อ่านจากไฟล์)" : "(ใช้ค่ามาตรฐาน 300)"} → เติมขนาด cm ให้เป็น<b>ค่าประมาณ</b> แก้ได้</p>
        )}
        <SizesEditor value={sizes} onChange={setSizes} />
      </div>

      {/* Parent SKU ที่ใช้ */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] font-medium text-slate-600 mb-1.5">📦 Parent SKU ที่ใช้ artwork นี้</p>
        <ParentSkuField value={parentCodes} onChange={setParentCodes} />
      </div>

      {/* location ไฟล์ต้นฉบับ + tooltip + จับผิดโฟลเดอร์ */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[12px] font-medium text-slate-600">📁 ที่เก็บไฟล์ต้นฉบับ <span className="text-[10px] text-slate-400 font-normal">— ใส่อย่างน้อย 1 อย่าง (path NAS หรือ ลิงก์)</span></p>
          <button type="button" onClick={() => setRuleOpen(true)} className="text-[11px] text-indigo-600 hover:underline">⚙️ ตั้งโฟลเดอร์มาตรฐาน</button>
        </div>
        <label className="block text-[12px] text-slate-500">path NAS / โฟลเดอร์
          <span className="ml-1 text-slate-300" title="ใส่ที่อยู่เต็มของไฟล์/โฟลเดอร์ต้นฉบับบนเครื่อง เช่น G:\Shared drives\Louis Montini\[4] Assets\4. Artworks\PIX32-02_v3.ai">ⓘ</span>
          <input value={masterPath} onChange={(e) => { setMasterPath(e.target.value); setPathAuto(false); }}
            title="ที่อยู่เต็มของไฟล์ต้นฉบับ — ควรอยู่ใต้โฟลเดอร์มาตรฐานที่ตั้งไว้ · แก้เองแล้วจะไม่ตามชื่ออัตโนมัติ"
            placeholder={rule.base_paths[0] ? `${rule.base_paths[0]}\\…` : "\\\\nas\\Artwork\\PIX\\PIX32-02_v3.ai  หรือ  Z:\\Artwork\\…"}
            className={`mt-0.5 w-full h-9 px-3 text-[12px] border rounded-lg font-mono focus:outline-none focus:ring-2 ${pathWarn ? "border-amber-300 focus:ring-amber-400 bg-amber-50/40" : "border-slate-200 focus:ring-indigo-500"}`} /></label>
        {pathWarn && (
          <p className="text-[11px] text-amber-600 mt-1">⚠ ที่อยู่นี้ไม่ได้อยู่ในโฟลเดอร์มาตรฐาน — ควรเก็บไว้ใต้ <b className="font-mono">{rule.base_paths.join(" หรือ ")}</b> (เพิ่มได้ แต่เช็คว่าตั้งใจ)</p>
        )}
        <label className="block text-[12px] text-slate-500 mt-2">ลิงก์ Google Drive / Synology <span className="text-slate-300" title="ลิงก์ที่เปิดได้จากที่ไหนก็ได้ (นอกออฟฟิศ) — ไม่ใส่ก็ได้ถ้ามี path NAS แล้ว">ⓘ</span>
          <input value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} placeholder="https://drive.google.com/…  หรือ  ลิงก์ Synology Drive"
            className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>

        {/* สร้างโฟลเดอร์ Drive อัตโนมัติ + โยนไฟล์ต้นฉบับ */}
        {driveOn && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
              <input type="checkbox" checked={autoFolder} onChange={(e) => setAutoFolder(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
              <span className="text-[12px] text-slate-700">
                🗂️ <b>สร้างโฟลเดอร์ Drive ให้อัตโนมัติ</b> + ก็อปรูปตัวอย่างเข้าไป
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  {autoFolder
                    ? <>จะสร้างโฟลเดอร์ชื่อ “{title.trim() || "(ใส่ชื่อก่อน)"}” แล้วเติมลิงก์ Drive ให้ · {masterUrl.trim() ? "มีลิงก์เองแล้ว จะไม่สร้างซ้ำ" : "ไม่ต้องไปสร้างทีหลัง"}</>
                    : "ปิดอยู่ — ต้องใส่ path/ลิงก์เอง หรือไปสร้างโฟลเดอร์ทีหลัง"}
                </span>
              </span>
            </label>
            <span className="block mt-3 text-[12px] text-slate-500">📤 หรือ โยนไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Google Drive ให้อัตโนมัติ</span>
            <div onClick={() => srcInputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]); }}
              onDragOver={(e) => e.preventDefault()}
              className="mt-1 border border-dashed border-slate-300 rounded-lg px-3 py-3 text-center text-[12px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
              + ลากไฟล์มาวาง หรือคลิกเลือก
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
                <p className="text-[11px] text-slate-400">จะสร้างโฟลเดอร์ชื่อ “{title.trim() || "(ใส่ชื่อก่อน)"}” + ตั้งชื่อไฟล์ตามชื่องาน + เติมลิงก์ Drive ให้อัตโนมัติ</p>
              </div>
            )}
          </div>
        )}
      </div>

      <label className="block text-[12px] text-slate-500 mt-3">คำค้นเพิ่มเติม (keyword) <span className="text-[10px] text-slate-400">— คำพ้อง/ชื่ออื่น พิมพ์แล้วเจอ</span>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="เช่น flower ดอกไม้ summer ฤดูร้อน"
          className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>

      {ruleOpen && <ArtworkPathRuleModal rule={rule} onClose={() => setRuleOpen(false)} onSaved={reloadRule} />}
    </ERPModal>
  );
}

// ── เพิ่ม Artwork หลายรูปพร้อมกัน (ตาราง inline) — ลากหลายไฟล์ → 1 แถว/ไฟล์ → แก้แล้วบันทึกทีเดียว ──
type MassRow = { id: number; file: File; preview: string | null; name: string; types: string[]; path: string; url: string; srcFiles: File[]; sizes: AssetSize[]; parentCodes: string[]; pathAuto: boolean };
function MassArtworkModal({ actor, artTypes, collections, onClose, onDone, initialFiles, defaultAlbums }: {
  actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void; initialFiles?: File[] | null; defaultAlbums?: string[];
}) {
  const toast = useToast();
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
    if (!imgs.length) { toast.error("รับเฉพาะไฟล์รูปภาพ (JPG/PNG/…)"); return; }
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
    if (rows.length === 0) { toast.error("ยังไม่มีรายการ — ลากไฟล์รูปเข้ามาก่อน"); return; }
    if (!batchBrandId) { toast.error("เลือกแบรนด์ก่อน (ใช้กับทุกรูป)"); return; }
    // โหมดโฟลเดอร์เดียว = ทุกใบได้ลิงก์ Drive อยู่แล้ว → ไม่ต้องมี path/ลิงก์เอง
    // แถวที่ไม่มี path/ลิงก์ แต่มีไฟล์ต้นฉบับให้อัปขึ้น Drive ก็ถือว่าครบ (ได้ลิงก์โฟลเดอร์มาเติมให้)
    const missing = (driveOn && oneFolder) ? [] : rows.filter((r) => !r.path.trim() && !r.url.trim() && !(driveOn && r.srcFiles.length > 0));
    if (missing.length) { toast.error(`มี ${missing.length} แถวยังไม่ใส่ที่อยู่ไฟล์ต้นฉบับ (path / ลิงก์ / โยนไฟล์ขึ้น Drive)`); return; }
    // ชื่อโฟลเดอร์รวม (โหมดโฟลเดอร์เดียว) = ที่ตั้งไว้ · ไม่ตั้ง = ชื่อร่วมของรูป/รูปแรก
    const combinedName = oneFolderName.trim() || commonNameSeed(rows.map((r) => r.name)) || rows[0]?.name?.trim() || "artwork";
    const combinedPath = oneFolder ? massPath(combinedName, rows[0]?.types ?? []) : "";   // path ชี้โฟลเดอร์รวม (ทุกใบเหมือนกัน)

    // snapshot ค่าที่ต้องใช้ (โมดัลปิดแล้วยังทำงานต่อได้) → ส่งงานไปวิ่งเบื้องหลัง + โชว์กล่องสถานะมุมจอ
    const jobRows = rows, jobBrand = batchBrandId, jobAlbums = batchAlbums, jobDrive = driveOn, jobOneFolder = oneFolder;
    runBackgroundTask({
      label: `เพิ่ม Artwork ${jobRows.length} รูป`,
      total: jobRows.length,
      run: async (report) => {
        let ok = 0, fail = 0, largeTotal = 0;
        let sharedFolderId = "";   // โหมดโฟลเดอร์เดียว: ใบแรกสร้างโฟลเดอร์ → ใบต่อ ๆ ไปอัปเข้าโฟลเดอร์นี้
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
        const parts = [`เพิ่ม ${ok} รูป`];
        if (fail) parts.push(`ล้มเหลว ${fail}`);
        if (largeTotal) parts.push(`ไฟล์ใหญ่ ${largeTotal} ต้องลากขึ้น Drive เอง`);
        return { ok, fail, message: parts.join(" · ") };
      },
    });
    onDone();   // ปิดโมดัลทันที — งานวิ่งต่อเบื้องหลัง
  };

  return (
    <ERPModal open onClose={onClose} title="📋 เพิ่ม Artwork หลายรูป" size="xl"
      description="ลากไฟล์รูปหลายไฟล์เข้ามา → ได้ 1 การ์ดต่อ 1 รูป (เลือกแบรนด์ใช้ทุกรูป · แต่ละรูปแนบไฟล์ต้นฉบับ/ใส่ขนาด/Parent SKU ได้) → กดบันทึกแล้วปิดได้เลย งานวิ่งเบื้องหลัง"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{rows.length} รายการ · บันทึกแล้ววิ่งเบื้องหลัง (ดูสถานะมุมจอ)</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={rows.length === 0} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">บันทึกทั้งหมด ({rows.length})</button>
          </div>
        </div>
      }>
      {/* โซนลากไฟล์หลายไฟล์ */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed flex items-center justify-center py-4 mb-3 text-center ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}>
        <div><span className="text-2xl">🎨</span><p className="text-[12px] text-slate-500 mt-1">ลากไฟล์รูปหลายไฟล์มาที่นี่ / คลิกเพื่อเลือกหลายไฟล์</p></div>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* ตั้งค่าทั้งชุด */}
      <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
        <label className="block text-[12px] text-slate-500">แบรนด์ <span className="text-red-500">*</span> <span className="text-[10px] text-slate-400">— ใช้กับทุกรูป (จัดโฟลเดอร์ Drive + เก็บกับทุกใบ)</span>
          <select value={batchBrandId} onChange={(e) => setBatchBrandId(e.target.value)}
            className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg bg-white ${batchBrandId ? "border-slate-200" : "border-amber-300"}`}>
            <option value="">— เลือกแบรนด์ —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        {driveOn && (
          <div>
            <label className="flex items-start gap-2 text-[12px] text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={oneFolder} onChange={(e) => setOneFolder(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
              <span>📎 รูปชุดนี้ใช้โฟลเดอร์ Drive เดียวกัน <span className="text-[10px] text-slate-400">— สร้างโฟลเดอร์เดียว เก็บทุกรูปในนี้ (ก็อปรูปตัวอย่าง + ไฟล์ต้นฉบับที่แนบ) แทนที่จะแยกโฟลเดอร์ทุกใบ</span></span>
            </label>
            {oneFolder && (
              <label className="block text-[12px] text-slate-500 mt-1.5 ml-6">ชื่อโฟลเดอร์รวม <span className="text-[10px] text-slate-400">— ไม่ตั้ง = ใช้ชื่อร่วมของรูป/รูปแรก</span>
                <input value={oneFolderName} onChange={(e) => setOneFolderName(e.target.value)}
                  placeholder={commonNameSeed(rows.map((r) => r.name)) || rows[0]?.name || "เช่น Tabby Brown Cat"}
                  className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-[12px] text-slate-500">อัลบั้ม (ใช้กับทุกแถว)
            <div className="mt-0.5"><CollectionMultiSelect value={batchAlbums} collections={cols} onChange={setBatchAlbums} onCreated={(c) => setCols((cur) => [...cur, c])} /></div>
          </div>
          <div className="text-[12px] text-slate-500 flex flex-col">ชนิดเริ่มต้น
            <div className="mt-0.5"><ArtTypeMultiSelect value={batchTypes} types={artTypeList} onChange={setBatchTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div>
            {rows.length > 0 && batchTypes.length > 0 && <button type="button" onClick={applyTypesToAll} className="self-start mt-1 text-[11px] text-indigo-600 hover:underline">→ ใส่ชนิดนี้ให้ทุกแถว</button>}
          </div>
        </div>
      </div>

      {/* การ์ดรายรูป — 1 ใบ/รูป: ชื่อ+ชนิด · path/ลิงก์ · ไฟล์ต้นฉบับ→Drive · ขนาด · Parent SKU */}
      {rows.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-[13px]">ยังไม่มีรายการ — ลากไฟล์เข้ามาด้านบน</div>
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
                    <input value={r.name} onChange={(e) => setName(r.id, e.target.value)} placeholder="ชื่อรูป"
                      className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
                    <button type="button" onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))} title="ลบรูปนี้"
                      className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded shrink-0">🗑</button>
                  </div>
                  <ArtTypeMultiSelect value={r.types} types={artTypeList} onChange={(v) => setTypes(r.id, v)} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
                </div>
              </div>

              {/* path ต้นฉบับ / ลิงก์ */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input value={r.path} onChange={(e) => setRow(r.id, { path: e.target.value, pathAuto: false })} placeholder={base ? "path NAS…" : "\\\\nas\\… หรือ Z:\\…"}
                  className="h-8 px-2 text-[11px] font-mono border border-slate-200 rounded" />
                <input value={r.url} onChange={(e) => setRow(r.id, { url: e.target.value })} placeholder="ลิงก์ Drive / Synology (ถ้ามี)"
                  className="h-8 px-2 text-[11px] border border-slate-200 rounded" />
              </div>

              {/* แนบไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Drive + ก็อปรูปตัวอย่าง */}
              {driveOn && (
                <div className="mt-2">
                  <p className="text-[11px] text-slate-500 mb-1">📤 ไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Drive + ก็อปรูปตัวอย่างให้อัตโนมัติ</p>
                  <label onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setRow(r.id, { srcFiles: [...r.srcFiles, ...Array.from(e.dataTransfer.files)] }); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="block border border-dashed border-slate-300 rounded-lg px-3 py-2 text-center text-[11px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
                    + ลากไฟล์มาวาง / คลิกเลือก
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
                    <p className="text-[11px] text-slate-500">📐 ขนาด (กว้าง × สูง)</p>
                    {r.sizes.length > 0 && rows.length > 1 && <button type="button" onClick={() => applySizesToAll(r.sizes)} className="text-[10px] text-indigo-600 hover:underline">→ ใส่ทุกใบ</button>}
                  </div>
                  <SizesEditor value={r.sizes} onChange={(v) => setRow(r.id, { sizes: v })} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[11px] text-slate-500">📦 Parent SKU ที่ใช้</p>
                    {r.parentCodes.length > 0 && rows.length > 1 && <button type="button" onClick={() => applyParentsToAll(r.parentCodes)} className="text-[10px] text-indigo-600 hover:underline">→ ใส่ทุกใบ</button>}
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
        {value.length === 0 && <span className="text-[11px] text-slate-400">ยังไม่มีแท็ก</span>}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
        placeholder="พิมพ์แท็ก + Enter / เลือกจากด้านล่าง"
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
  const nameOf = (id: string) => collections.find((c) => c.id === id)?.name ?? id;
  const add = (id: string) => { if (id && !value.includes(id)) onChange([...value, id]); };
  const remaining = collections.filter((c) => !value.includes(c.id));
  const create = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
      const j = await r.json(); if (!r.ok || j.error || !j.data) throw new Error(j.error || "สร้างอัลบั้มไม่สำเร็จ");
      const col = j.data as AssetCollection;
      onCreated(col); onChange([...value, col.id]); setNewName(""); setCreating(false);
      toast.success(`สร้างอัลบั้ม "${n}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างอัลบั้มไม่สำเร็จ"); }
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
        {value.length === 0 && <span className="text-[11px] text-slate-400">— ไม่ระบุ —</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ""; }}
          className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white max-w-[150px]">
          <option value="">＋ เลือกอัลบั้ม…</option>
          {remaining.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="text-[11px] px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50">＋ อัลบั้มใหม่</button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder="ชื่ออัลบั้มใหม่" className="h-8 w-32 px-2 text-[12px] border border-emerald-300 rounded-lg" />
            <button type="button" onClick={() => void create()} disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">เพิ่ม</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">ยกเลิก</button>
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
  const remaining = types.filter((t) => !value.includes(t.name));
  const create = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/lookups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookup_type: "artwork_type", name: n }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "เพิ่มชนิดไม่สำเร็จ");
      const item: LookupItem = j.data ? { id: String(j.data.id ?? n), name: String(j.data.name ?? n) } : { id: n, name: n };
      onCreated(item); add(item.name); setNewName(""); setCreating(false);
      toast.success(`เพิ่มชนิด "${n}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มชนิดไม่สำเร็จ"); }
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
        {value.length === 0 && <span className="text-[11px] text-slate-400">— ไม่ระบุ —</span>}
      </div>
      {!disabled && <div className="flex items-center gap-1.5 mt-1">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ""; }}
          className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white max-w-[150px]">
          <option value="">＋ เลือกชนิด…</option>
          {remaining.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="text-[11px] px-2 py-1 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50">＋ ชนิดใหม่</button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder="ชื่อชนิดใหม่" className="h-8 w-28 px-2 text-[12px] border border-indigo-300 rounded-lg" />
            <button type="button" onClick={() => void create()} disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">เพิ่ม</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">ยกเลิก</button>
          </span>
        )}
      </div>}
    </div>
  );
}

// ── เพิ่มงานพิมพ์ (DTF/UV) — รูป preview + ไฟล์ .ai/.pdf ขึ้นโฟลเดอร์ Drive + ประเภท/ขนาดแผ่น ──
function PrintJobAddModal({ actor, printTypes, collections, defaultCollectionIds, onClose, onDone }: {
  actor: string | null; printTypes: PrintType[]; collections: AssetCollection[];
  defaultCollectionIds?: string[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const { brandBase, typeSub } = useDriveFolderMaps();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [ptype, setPtype] = useState("");                       // ประเภทงานพิมพ์ (code)
  const [sizes, setSizes] = useState<AssetSize[]>([]);
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [srcFiles, setSrcFiles] = useState<File[]>([]);         // ไฟล์พิมพ์ .ai/.pdf → Drive
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
  const inputRef = useRef<HTMLInputElement>(null);
  const srcInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);

  // เลือกประเภท → เติมขนาดเริ่มต้นให้ (แก้ทับได้ · ไม่ทับถ้าใส่ขนาดเองแล้ว)
  const pickType = (code: string) => {
    setPtype(code);
    const t = printTypes.find((x) => x.code === code);
    if (t?.default_w && t?.default_h) {
      const one: AssetSize = { label: "ขนาดแผ่น", w: Number(t.default_w), h: Number(t.default_h), unit: (t.unit || "cm") as AssetSize["unit"] };
      setSizes((cur) => (cur.length ? cur : [one]));
    }
  };

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const save = async () => {
    if (!file) { toast.error("แนบรูป preview ของงานพิมพ์ก่อน"); return; }
    if (!ptype) { toast.error("เลือกประเภทงานพิมพ์ (DTF/UV) ก่อน"); return; }
    setBusy(true);
    try {
      // มีไฟล์พิมพ์ หรือติ๊กสร้างโฟลเดอร์ → สร้างโฟลเดอร์ Drive + ก็อป preview + อัปไฟล์พิมพ์
      let effUrl = "", effPath = "";
      if (driveOn && (srcFiles.length > 0 || autoFolder)) {
        const nm = title.trim() || file.name.replace(/\.[^.]+$/, "") || "งานพิมพ์";
        const previewFile = await previewForDrive(file);
        const { folderLink, largeCount } = await uploadArtworkToDrive({
          name: nm, artworkType: ptype, brandId, srcFiles, previewFile,
          onProgress: (done, total) => setDriveProg({ done, total }),
        });
        if (largeCount) toast.warning(`ไฟล์ใหญ่ ${largeCount} ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์ Drive แล้วลากขึ้นเอง`);
        if (folderLink) effUrl = folderLink;
        effPath = brandFolderPath(nm, brandId, ptype, brandBase, typeSub);
      }

      const upFile = await downscaleImageWidth(file, 1600);
      const fd = new FormData();
      fd.append("file", upFile);
      fd.append("source", "print");
      fd.append("print_type", ptype);
      if (title.trim()) fd.append("title", title.trim());
      if (brandId) fd.append("brand_id", brandId);
      if (effPath) fd.append("master_path", effPath);
      if (effUrl) fd.append("master_url", effUrl);
      if (sizes.length) fd.append("sizes", JSON.stringify(sizes));
      if (parentCodes.length) fd.append("parent_sku_codes", JSON.stringify(parentCodes));
      if (collectionIds.length) fd.append("collection_ids", JSON.stringify(collectionIds));
      if (tags.length) fd.append("tags", tags.join(","));
      if (keywords.trim()) fd.append("keywords", keywords.trim());
      if (actor) fd.append("actor", actor);
      const res = await apiFetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success("เพิ่มงานพิมพ์แล้ว"); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); setDriveProg({ done: 0, total: 0 }); }
  };

  return (
    <ERPModal open onClose={() => !busy && onClose()} title="🖨 เพิ่มงานพิมพ์" size="lg"
      description="รูป preview ของแผ่น + ไฟล์ .ai/.pdf สำหรับส่งพิมพ์ (ใส่ทีหลังได้) + ประเภท/ขนาดแผ่น"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{driveProg.total > 0 ? `📤 อัปขึ้น Drive ${driveProg.done}/${driveProg.total}…` : "ไฟล์พิมพ์เก็บบน Drive · รูป preview เก็บในคลัง"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </div>
      }>
      {busy && <LoadingOverlay message="กำลังบันทึกงานพิมพ์…" />}

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
              : <span className="text-[12px] text-slate-400 text-center px-4">ลากรูป preview ของแผ่นมาวาง<br />หรือคลิกเลือก</span>}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>
          <label className="block text-[12px] text-slate-500 mt-2">ชื่องาน
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น DTF 60cm. ช้างใบใหญ่"
              className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
        </div>

        {/* ขวา: ประเภท/ขนาด/ไฟล์พิมพ์ */}
        <div className="space-y-2.5">
          <div className="text-[12px] text-slate-500">ประเภทงานพิมพ์ <span className="text-rose-500">*</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {printTypes.length === 0 && <span className="text-[11px] text-amber-600">ยังไม่มีประเภท — ตั้งค่าที่ปุ่ม ⚙️ ก่อน</span>}
              {printTypes.map((t) => (
                <button key={t.id} type="button" onClick={() => pickType(t.code)}
                  className={`h-8 px-3 text-[12px] rounded-lg border ${ptype === t.code ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {t.name}{t.default_w && t.default_h ? <span className="text-slate-400 ml-1">{t.default_w}×{t.default_h}</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[12px] text-slate-500">ขนาดแผ่น <span className="text-[10px] text-slate-400">— เติมให้ตามประเภท แก้ได้</span>
            <div className="mt-1"><SizesEditor value={sizes} onChange={setSizes} /></div>
          </div>

          <label className="block text-[12px] text-slate-500">แบรนด์ <span className="text-[10px] text-slate-400">(ใช้จัดที่ตั้งโฟลเดอร์ Drive)</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">— ไม่ระบุ —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>

          {driveOn && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={autoFolder} onChange={(e) => setAutoFolder(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
                <span className="text-[12px] text-slate-700">🗂️ <b>สร้างโฟลเดอร์ Drive ให้อัตโนมัติ</b> + ก็อปรูป preview เข้าไป</span>
              </label>
              <span className="block mt-2 text-[12px] text-slate-500">📎 ไฟล์พิมพ์ (.ai / .pdf) <span className="text-[10px] text-slate-400">— ไม่ใส่ตอนนี้ก็ได้</span></span>
              <div onClick={() => srcInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setSrcFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]); }}
                onDragOver={(e) => e.preventDefault()}
                className="mt-1 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-center text-[12px] text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer">
                + ลากไฟล์พิมพ์มาวาง หรือคลิกเลือก
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

          <div className="text-[12px] text-slate-500">📦 Parent SKU ที่อยู่ในแผ่นนี้ <span className="text-[10px] text-slate-400">(ไม่บังคับ)</span>
            <div className="mt-0.5"><ParentSkuField value={parentCodes} onChange={setParentCodes} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-[12px] text-slate-500">อัลบั้ม
              <div className="mt-0.5"><CollectionMultiSelect value={collectionIds} collections={cols} onChange={setCollectionIds} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
            <div className="text-[12px] text-slate-500">แท็ก
              <div className="mt-0.5"><TagPickerField value={tags} onChange={setTags} /></div></div>
          </div>
          <label className="block text-[12px] text-slate-500">คำค้นเพิ่มเติม
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="เช่น ช้าง งานพิมพ์ ลูกค้า A"
              className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
        </div>
      </div>
    </ERPModal>
  );
}

// ── จัดการประเภทงานพิมพ์ (DTF/UV/…) + ขนาดเริ่มต้นต่อประเภท — ตั้งค่าเองได้ ไม่ต้องแก้โค้ด ──
function ManagePrintTypesModal({ types, onClose, onChanged }: { types: PrintType[]; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [rows, setRows] = useState<PrintType[]>(types);
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState({ code: "", name: "", w: "", h: "", unit: "cm" });
  const [delTarget, setDelTarget] = useState<PrintType | null>(null);

  const reload = async () => {
    try { const j = await (await apiFetch(`/api/print-types?_=${Date.now()}`)).json(); setRows((j.data ?? []) as PrintType[]); } catch { /* ignore */ }
    await onChanged();
  };

  const add = async () => {
    const code = nc.code.trim(); if (!code) { toast.error("ใส่รหัสประเภทก่อน (เช่น DTF)"); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/print-types", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: nc.name.trim() || code, default_w: nc.w, default_h: nc.h, unit: nc.unit }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      setNc({ code: "", name: "", w: "", h: "", unit: "cm" }); toast.success(`เพิ่ม “${code}” แล้ว`); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const patch = async (t: PrintType, body: Record<string, unknown>) => {
    try {
      const res = await apiFetch(`/api/print-types/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "แก้ไม่สำเร็จ");
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
  };

  const doDelete = async () => {
    const t = delTarget; if (!t) return; setDelTarget(null); setBusy(true);
    try {
      const res = await apiFetch(`/api/print-types/${t.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(`ปิดใช้ “${t.code}” แล้ว`); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const inp = "h-8 px-2 text-[12px] border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title="⚙️ ประเภทงานพิมพ์" size="md"
      description="ตั้งขนาดเริ่มต้นต่อประเภท — เลือกประเภทตอนเพิ่มงานพิมพ์แล้วจะเติมขนาดให้เอง (แก้ทับได้)"
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button></div>}>
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-[10px] text-slate-400 px-1">
          <span className="w-20">รหัส</span><span className="flex-1">ชื่อที่แสดง</span><span className="w-32">ขนาดเริ่มต้น</span><span className="w-6" />
        </div>
        {rows.length === 0 && <p className="text-[12px] text-slate-400 py-3 text-center">ยังไม่มีประเภทงานพิมพ์</p>}
        {rows.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <span className="w-20 font-mono text-[12px] text-slate-700 truncate">{t.code}</span>
            <input defaultValue={t.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void patch(t, { name: v }); }}
              className={`${inp} flex-1`} />
            <div className="w-32 flex items-center gap-1">
              <input defaultValue={t.default_w ?? ""} inputMode="decimal" placeholder="กว้าง"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(t.default_w ?? "")) void patch(t, { default_w: v }); }}
                className={`${inp} w-12 text-center`} />
              <span className="text-slate-300 text-[11px]">×</span>
              <input defaultValue={t.default_h ?? ""} inputMode="decimal" placeholder="สูง"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(t.default_h ?? "")) void patch(t, { default_h: v }); }}
                className={`${inp} w-12 text-center`} />
              <span className="text-[10px] text-slate-400">{t.unit}</span>
            </div>
            <button onClick={() => setDelTarget(t)} disabled={busy} className="w-6 text-slate-400 hover:text-red-500 text-sm" title="ปิดใช้ประเภทนี้">🗑</button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-2.5">
        <p className="text-[11px] font-medium text-slate-500 mb-1.5">+ เพิ่มประเภทใหม่</p>
        <div className="flex items-center gap-2">
          <input value={nc.code} onChange={(e) => setNc((s) => ({ ...s, code: e.target.value }))} placeholder="รหัส เช่น SCREEN" className={`${inp} w-24`} />
          <input value={nc.name} onChange={(e) => setNc((s) => ({ ...s, name: e.target.value }))} placeholder="ชื่อที่แสดง" className={`${inp} flex-1`} />
          <input value={nc.w} onChange={(e) => setNc((s) => ({ ...s, w: e.target.value }))} inputMode="decimal" placeholder="กว้าง" className={`${inp} w-14 text-center`} />
          <span className="text-slate-300 text-[11px]">×</span>
          <input value={nc.h} onChange={(e) => setNc((s) => ({ ...s, h: e.target.value }))} inputMode="decimal" placeholder="สูง" className={`${inp} w-14 text-center`} />
          <button onClick={add} disabled={busy} className="h-8 px-3 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">เพิ่ม</button>
        </div>
      </div>

      {delTarget && (
        <ConfirmDialog open title="ปิดใช้ประเภทนี้?" variant="danger" confirmText="ปิดใช้"
          message={`“${delTarget.code}” จะไม่โผล่ให้เลือกอีก · งานพิมพ์เดิมที่ใช้ประเภทนี้ยังอยู่ครบ`}
          onConfirm={doDelete} onClose={() => setDelTarget(null)} />
      )}
    </ERPModal>
  );
}

// ── จัดการชนิด Artwork (lookup กลาง: เพิ่ม/แก้/ลบ) ──
function ManageTypesModal({ types, onClose, onChanged }: { types: LookupItem[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
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
      setNewName(""); await reload(); toast.success("เพิ่มชนิดแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const rename = async (id: string, name: string) => {
    const n = name.trim(); if (!n) return;
    try {
      const r = await apiFetch(`/api/lookups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
      const j = await r.json(); if (j.error) throw new Error(j.error); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
  };
  const del = async (id: string) => {
    try {
      const r = await apiFetch(`/api/lookups/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({})); if (j.error) throw new Error(j.error);
      await reload(); toast.success("ลบแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <ERPModal open onClose={onClose} title="จัดการชนิด Artwork" size="sm"
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button></div>}>
      <div className="flex flex-col gap-1.5 mb-3">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input defaultValue={it.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.name) void rename(it.id, v); }}
              className="flex-1 h-8 px-2 text-[13px] border border-slate-200 rounded-lg" />
            <button onClick={() => del(it.id)} className="h-8 px-2.5 text-[12px] text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">ลบ</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-[12px] text-slate-400">ยังไม่มีชนิด — เพิ่มด้านล่าง</p>}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="ชนิดใหม่ เช่น แบนเนอร์"
          className="flex-1 h-8 px-2 text-[13px] border border-slate-200 rounded-lg" />
        <button onClick={add} disabled={busy || !newName.trim()} className="h-8 px-3 text-[12px] font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">＋ เพิ่ม</button>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">แก้ชื่อ: พิมพ์ทับในช่องแล้วคลิกที่อื่นเพื่อบันทึก · ลบแล้วงานเดิมยังเก็บชื่อชนิดไว้</p>
    </ERPModal>
  );
}

// ── หาโฟลเดอร์ Drive ที่ยังไม่เชื่อม → สแกน → กรอกรายละเอียด → นำเข้า ──
type ScanFolder = { folderId: string; folderName: string; folderLink: string; typeSubName: string; artworkType: string; master_path: string; newCount?: number; total?: number };
type ImportRow = { key: string; folderName: string; folderLink: string; master_path: string; fileId: string; fileName: string; title: string; types: string[]; sizes: AssetSize[]; parentCodes: string[] };
function DriveScanModal({ artTypes, onClose, onDone }: { artTypes: LookupItem[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandId, setBrandId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [folders, setFolders] = useState<ScanFolder[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"scan" | "form">("scan");
  const [loadingImgs, setLoadingImgs] = useState(false);
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
    if (!brandId) { toast.error("เลือกแบรนด์ก่อน"); return; }
    setScanning(true); setFolders(null); setSel(new Set()); setStep("scan");
    try {
      const res = await apiFetch("/api/assets/drive-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "สแกนไม่สำเร็จ");
      const fs = (j.folders ?? []) as ScanFolder[];
      setFolders(fs); setScanned(j.scanned ?? 0); setSel(new Set(fs.map((f) => f.folderId)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "สแกนไม่สำเร็จ"); }
    finally { setScanning(false); }
  };

  // ไปขั้นกรอกรายละเอียด: ดึงรูปในโฟลเดอร์ที่เลือก → สร้างแถวฟอร์ม (1 แถว/รูป)
  const toForm = async () => {
    const picked = (folders ?? []).filter((f) => sel.has(f.folderId));
    if (!picked.length) { toast.error("เลือกโฟลเดอร์ก่อน"); return; }
    setLoadingImgs(true);
    try {
      const res = await apiFetch("/api/drive/folder-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_ids: picked.map((f) => f.folderId), only_new: true }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ดึงรูปไม่สำเร็จ");
      const imgMap = (j.images ?? {}) as Record<string, { id: string; name: string; width?: number; height?: number }[]>;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const sizesFrom = (w?: number, h?: number): AssetSize[] => (w && h) ? [{ label: "ขนาด #1", w: r2(w / DEFAULT_DPI * 2.54), h: r2(h / DEFAULT_DPI * 2.54), unit: "cm" }] : [];   // px÷300×2.54 (งาน export 300 DPI)
      const newRows: ImportRow[] = []; let n = 0;
      for (const f of picked) for (const img of (imgMap[f.folderId] ?? [])) {
        newRows.push({ key: `r${n++}`, folderName: f.folderName, folderLink: f.folderLink, master_path: f.master_path, fileId: img.id, fileName: img.name, title: img.name.replace(/\.[^.]+$/, "").trim() || f.folderName, types: f.artworkType ? [f.artworkType] : [], sizes: sizesFrom(img.width, img.height), parentCodes: [] });
      }
      if (!newRows.length) { toast.error("ไม่มีรูปใหม่ที่ยังไม่ลงในโฟลเดอร์ที่เลือก"); return; }
      setRows(newRows); setStep("form");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ดึงรูปไม่สำเร็จ"); }
    finally { setLoadingImgs(false); }
  };

  const setRow = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // นำเข้า — ยิงทีละชุด (4 รูป/รอบ) กัน timeout รูปเยอะ · อ่าน response แบบกัน JSON พัง
  const doImport = async () => {
    if (!rows.length) { toast.error("ไม่มีรายการ"); return; }
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
        catch { throw new Error(res.status >= 500 ? "เซิร์ฟเวอร์ทำงานนานเกินไป — ลองแบ่งนำเข้าน้อยลง" : (txt.slice(0, 100) || "ตอบกลับไม่ถูกต้อง")); }
        if (!res.ok || j.error) throw new Error(j.error || "นำเข้าไม่สำเร็จ");
        imported += j.imported ?? 0; failed += j.failed ?? 0;
      }
      setImpProg(null);
      toast.success(`นำเข้า ${imported} รูปแล้ว${failed ? ` · ล้มเหลว ${failed}` : ""}`);
      onDone();
    } catch (e) {
      setImpProg(null);
      toast.error(`${e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ"}${imported ? ` (นำเข้าไปแล้ว ${imported} ก่อนหยุด)` : ""}`);
    } finally { setImporting(false); }
  };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const busy = scanning || loadingImgs || importing;

  return (
    <ERPModal open onClose={onClose} title="🔍 หารูปใน Drive ที่ยังไม่ลงคลัง" size="xl"
      description={step === "scan" ? "เลือกแบรนด์ → สแกน → เลือกโฟลเดอร์ที่มีรูปยังไม่ลง → กรอกรายละเอียดก่อนนำเข้า" : "กรอกรายละเอียดแต่ละรูป (เหมือนเพิ่มรูปใหม่) แล้วนำเข้า"}
      footer={
        step === "scan" ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] text-slate-400">{folders ? `มีรูปใหม่ ${folders.length} โฟลเดอร์ · เลือก ${sel.size}` : ""}</span>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
              <button onClick={toForm} disabled={busy || !sel.size} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">ถัดไป — กรอกรายละเอียด ({sel.size})</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <button onClick={() => setStep("scan")} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">‹ กลับ</button>
            <button onClick={doImport} disabled={busy || !rows.length} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{importing && <Spinner />}{importing ? "กำลังนำเข้า…" : `นำเข้า ${rows.length} รูป`}</button>
          </div>
        )
      }>
      {busy && <LoadingOverlay message={scanning ? "กำลังสแกน Drive…" : loadingImgs ? "กำลังดึงรายการรูป…" : impProg ? `กำลังนำเข้า ${impProg.done}/${impProg.total} รูป…` : "กำลังนำเข้า + ดึงรูป…"} />}

      {step === "scan" ? (
        <>
          <div className="flex items-end gap-2 mb-3">
            <label className="flex-1 text-[12px] text-slate-500">แบรนด์
              <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setFolders(null); }}
                className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">— เลือกแบรนด์ —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
            <button onClick={scan} disabled={scanning || !brandId} className="h-9 px-4 text-sm font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50">🔍 สแกน</button>
          </div>
          {folders === null ? (
            <p className="text-[12px] text-slate-400 py-8 text-center">เลือกแบรนด์แล้วกด “สแกน”</p>
          ) : folders.length === 0 ? (
            <p className="text-[13px] text-emerald-600 py-8 text-center">🎉 รูปในโฟลเดอร์ลงคลังครบแล้ว (สแกน {scanned} โฟลเดอร์)</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] text-slate-600">เจอ <b>{folders.length}</b> โฟลเดอร์ที่มีรูปยังไม่ลง (จาก {scanned})</p>
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => setSel(new Set(folders.map((f) => f.folderId)))} className="text-indigo-600 hover:underline">เลือกทั้งหมด</button>
                  <button onClick={() => setSel(new Set())} className="text-slate-500 hover:underline">ไม่เลือก</button>
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
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200" title={`ในโฟลเดอร์มี ${f.total ?? "?"} รูป`}>
                        +{f.newCount} รูปใหม่{f.total != null && f.total > f.newCount ? ` / ${f.total}` : ""}
                      </span>
                    )}
                    <a href={f.folderLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-indigo-600 hover:underline shrink-0">เปิด ›</a>
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
            <p className="text-[11px] font-medium text-slate-500">ใช้กับทุกรูป</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-[12px] text-slate-500">อัลบั้ม
                <div className="mt-0.5"><CollectionMultiSelect value={batchAlbums} collections={cols} onChange={setBatchAlbums} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
              <div className="text-[12px] text-slate-500">แท็ก
                <div className="mt-0.5"><TagPickerField value={batchTags} onChange={setBatchTags} /></div></div>
            </div>
            <label className="block text-[12px] text-slate-500">คำค้นเพิ่มเติม (keyword)
              <input value={batchKw} onChange={(e) => setBatchKw(e.target.value)} placeholder="เช่น flower ดอกไม้ summer"
                className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-200/70">
              <div className="text-[12px] text-slate-500">
                <div className="flex items-center gap-2">ชนิด (ใส่ทุกใบ)
                  {batchTypes.length > 0 && rows.length > 0 && <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, types: [...batchTypes] })))} className="text-[10px] text-indigo-600 hover:underline">→ ใส่ทุกใบ</button>}</div>
                <div className="mt-0.5"><ArtTypeMultiSelect value={batchTypes} types={artTypeList} onChange={setBatchTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div>
              </div>
              <div className="text-[12px] text-slate-500">
                <div className="flex items-center gap-2">Parent SKU (ใส่ทุกใบ)
                  {batchParents.length > 0 && rows.length > 0 && <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, parentCodes: [...batchParents] })))} className="text-[10px] text-indigo-600 hover:underline">→ ใส่ทุกใบ</button>}</div>
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
                      <input value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} placeholder="ชื่อรูป"
                        className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} title="เอาออก"
                        className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded shrink-0">🗑</button>
                    </div>
                    <ArtTypeMultiSelect value={r.types} types={artTypeList} onChange={(v) => setRow(r.key, { types: v })} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
                    <p className="text-[10px] text-slate-400 font-mono truncate">📁 {r.folderName} · {r.fileName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2">
                  <div><p className="text-[11px] text-slate-500 mb-1">📐 ขนาด (กว้าง × สูง)</p><SizesEditor value={r.sizes} onChange={(v) => setRow(r.key, { sizes: v })} /></div>
                  <div><p className="text-[11px] text-slate-500 mb-1">📦 Parent SKU ที่ใช้</p><ParentSkuField value={r.parentCodes} onChange={(v) => setRow(r.key, { parentCodes: v })} /></div>
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
const SIZE_UNITS: { v: AssetSize["unit"]; label: string }[] = [
  { v: "cm", label: "ซม." }, { v: "mm", label: "มม." }, { v: "in", label: "นิ้ว" }, { v: "px", label: "px" },
];
function SizesEditor({ value, onChange, disabled }: { value: AssetSize[]; onChange: (v: AssetSize[]) => void; disabled?: boolean }) {
  const set = (i: number, patch: Partial<AssetSize>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled}
            placeholder="ชื่อไซส์ เช่น ป้ายใหญ่" className="flex-1 min-w-0 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <input type="number" value={s.w ?? ""} onChange={(e) => set(i, { w: numOrNull(e.target.value) })} disabled={disabled}
            placeholder="กว้าง" className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <span className="text-slate-400 text-xs">×</span>
          <input type="number" value={s.h ?? ""} onChange={(e) => set(i, { h: numOrNull(e.target.value) })} disabled={disabled}
            placeholder="สูง" className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <select value={s.unit} onChange={(e) => set(i, { unit: e.target.value as AssetSize["unit"] })} disabled={disabled}
            className="h-8 px-1 text-[12px] border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
            {SIZE_UNITS.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
          </select>
          {!disabled && <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500 text-sm px-1">✕</button>}
        </div>
      ))}
      {disabled && value.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
      {!disabled && <button type="button" onClick={() => onChange([...value, { label: `ขนาด #${value.length + 1}`, w: null, h: null, unit: "cm" }])}
        className="self-start text-[12px] text-indigo-600 hover:underline">＋ เพิ่มไซส์</button>}
    </div>
  );
}

// ── เลือก Parent SKU ที่ใช้ (multi) — ค้นจาก /api/sku-browser?entity=parent-skus ──
function ParentSkuField({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded">
            {c}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-violet-300 hover:text-rose-500 leading-none">✕</button>}
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">ยังไม่ผูก Parent SKU</span>}
        {!disabled && <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50">＋ เลือก Parent SKU</button>}
      </div>
      {/* ของกลาง: ค้น + ไล่ดูทั้งหมด + แบ่งหน้า (Pager) — เลิกใช้ picker เขียนเองที่ตัดแค่ 40 รายการ */}
      <ParentSkuMultiPickerModal open={open} onClose={() => setOpen(false)} excludeCodes={value}
        title="เลือก Parent SKU ที่ใช้ artwork นี้"
        onConfirm={(items) => { onChange([...new Set([...value, ...items.map((x) => x.code)])]); setOpen(false); }} />
    </div>
  );
}


// ── เลือกแท็กแบบ "ปุ่มกด" (เก็บความรกของชิป/ตัวช่วยไว้ในป๊อปอัป) ──
function TagPickerField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-indigo-600 text-white">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="hover:bg-white/25 rounded-full w-3.5 h-3.5 leading-none flex items-center justify-center">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">ยังไม่มีแท็ก</span>}
        <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50">🏷️ เลือกแท็ก</button>
      </div>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} title="เลือก / เพิ่มแท็ก" size="sm"
          footer={<div className="flex justify-end w-full"><button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">เสร็จ</button></div>}>
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
      if (!fid && !lbp) { await apiFetch(`/api/drive/brand-folders?brand_id=${encodeURIComponent(id)}`, { method: "DELETE" }); setBLabel((m) => { const n = { ...m }; delete n[id]; return n; }); toast.success("ล้างแล้ว"); return; }
      const res = await apiFetch("/api/drive/brand-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: id, folder_id: fid, local_base_path: lbp }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
      setBLabel((m) => ({ ...m, [id]: j.folder_label ?? "" })); toast.success(j.pathUpdated ? `บันทึกแล้ว · อัปเดต path ${j.pathUpdated} รูปตามฐานใหม่` : "บันทึกแล้ว");
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
  };
  const saveType = async (t: string) => {
    try {
      const res = await apiFetch("/api/drive/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artwork_type: t, subfolder_name: tDraft[t] ?? "" }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
      const extra = [j.renamed ? `เปลี่ยนชื่อโฟลเดอร์ Drive ${j.renamed}` : "", j.pathUpdated ? `อัปเดต path ${j.pathUpdated} รูป` : ""].filter(Boolean).join(" · ");
      toast.success(extra ? `บันทึกแล้ว · ${extra}` : "บันทึกแล้ว");
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
  };
  if (!driveOn) return null;
  return (
    <>
      <div className="mt-4 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">📁 โฟลเดอร์ตามแบรนด์ (Drive folder id + path ในเครื่อง)</p>
        <p className="text-[11px] text-slate-400 mb-2">Drive folder id = ที่อัปไฟล์ขึ้น (ต้องแชร์ให้ service account) · path ในเครื่อง = ฐานสำหรับเติมช่อง “path ต้นฉบับ” อัตโนมัติ เช่น <span className="font-mono">G:\Shared drives\Louis Montini\[01] Catalogs\01_Assets\[01] Louis Montini</span></p>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {brands.map((b) => (
            <div key={b.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex-1 text-[12px] text-slate-700 font-medium truncate" title={b.name}>{b.name}</span>
                {bLabel[b.id] && <span className="text-[11px] text-emerald-600 truncate max-w-[120px] shrink-0" title={bLabel[b.id]}>✓ {bLabel[b.id]}</span>}
                <button type="button" onClick={() => saveBrand(b.id)} className="h-7 px-2.5 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">บันทึก</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-slate-400 shrink-0">Drive folder id</span>
                <input value={bDraft[b.id] ?? ""} onChange={(e) => setBDraft((d) => ({ ...d, [b.id]: e.target.value }))} placeholder="ปล่อยว่าง = ใช้โฟลเดอร์แม่"
                  className="flex-1 h-7 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-24 text-[11px] text-slate-400 shrink-0">path ในเครื่อง</span>
                <input value={bLocal[b.id] ?? ""} onChange={(e) => setBLocal((d) => ({ ...d, [b.id]: e.target.value }))} placeholder="G:\Shared drives\…\[01] Louis Montini"
                  className="flex-1 h-7 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              </div>
            </div>
          ))}
          {brands.length === 0 && <p className="text-[11px] text-slate-400">ยังไม่มีแบรนด์</p>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">🗂️ ชื่อซับโฟลเดอร์ตามชนิด (ใต้โฟลเดอร์แบรนด์)</p>
        <p className="text-[11px] text-slate-400 mb-2">เช่น โลโก้ → “01_Logo” · ปล่อยว่าง = ใช้ชื่อชนิดเป็นชื่อซับ</p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {types.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-24 text-[12px] text-slate-600 truncate shrink-0" title={t}>{t}</span>
              <input value={tDraft[t] ?? ""} onChange={(e) => setTDraft((d) => ({ ...d, [t]: e.target.value }))} placeholder={t}
                className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
              <button type="button" onClick={() => saveType(t)} className="h-8 px-2 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">บันทึก</button>
            </div>
          ))}
          {types.length === 0 && <p className="text-[11px] text-slate-400">ยังไม่มีชนิดงาน</p>}
        </div>
      </div>
    </>
  );
}

// ตั้งค่าโฟลเดอร์มาตรฐาน (admin) — หลาย path ได้ (บรรทัดละ 1)
function ArtworkPathRuleModal({ rule, onClose, onSaved }: { rule: PathRule; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(rule.base_paths.join("\n"));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const base_paths = text.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "artwork_path_rule", value: { base_paths } }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success("บันทึกโฟลเดอร์มาตรฐานแล้ว"); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title="ตั้งค่าโฟลเดอร์มาตรฐานของ Artwork" size="md"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? "บันทึก…" : "บันทึก"}</button>
      </div>}>
      <p className="text-[12px] text-slate-500 mb-2">artwork ทุกอันควรเก็บใต้โฟลเดอร์เหล่านี้ — ถ้า path ที่กรอกไม่ขึ้นต้นด้วยอันใดอันหนึ่ง ระบบจะ <b className="text-amber-600">เตือน</b> (ไม่บล็อก). ใส่ได้หลายโฟลเดอร์ บรรทัดละ 1</p>
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
