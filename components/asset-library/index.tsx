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
import { HoverPreview } from "@/components/hover-image";
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
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null); // null=ทั้งหมด, "none"=ไม่อยู่อัลบั้ม
  const [tag, setTag] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);
  const [source, setSource] = useState("upload");   // upload = อัปเอง · artwork · odoo_product
  const [artworkType, setArtworkType] = useState("");   // ฟิลเตอร์ชนิด artwork
  const [artTypes, setArtTypes] = useState<LookupItem[]>([]);   // รายการชนิด (lookup)

  const [collections, setCollections] = useState<AssetCollection[]>([]);
  const [tags, setTags] = useState<AssetTag[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newColOpen, setNewColOpen] = useState(false);
  const [artworkAddOpen, setArtworkAddOpen] = useState(false);
  const [massOpen, setMassOpen] = useState(false);   // โหมด MASS: เพิ่ม Artwork หลายรายการแบบตาราง inline
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [brandReload, setBrandReload] = useState(0);   // bump เพื่อรีเฟรชมุมมอง "ดูตามแบรนด์"
  const [searchFolders, setSearchFolders] = useState<{ id: string; code: string; name: string }[]>([]);   // โฟลเดอร์ Parent ที่ตรงคำค้น
  const [brandOpenParent, setBrandOpenParent] = useState<string | null>(null);   // กดโฟลเดอร์จากผลค้นหา → เปิด parent ในมุมมองแบรนด์
  const searching = search.trim().length > 0;
  const byBrand = source === "by-brand";
  const showBrandView = byBrand && !searching;   // ค้นหา = โชว์ผลค้นหาทั่วทั้งคลังแทนมุมมองแบรนด์

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => setActor(data.user?.email ?? null)).catch(() => {});
  }, []);

  // ── โหลดรายการไฟล์ ──
  const load = useCallback(async () => {
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
      const res = await apiFetch(`/api/assets?${p.toString()}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setRows(j.data ?? []);
      setTotal(j.total ?? 0);
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดคลังไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [search, type, collectionId, tag, trash, source, artworkType, toast]);

  const loadMeta = useCallback(async () => {
    try {
      const [c, t, a] = await Promise.all([
        apiFetch("/api/assets/collections"), apiFetch("/api/assets/tags"), apiFetch("/api/lookups?type=artwork_type"),
      ]);
      setCollections((await c.json()).data ?? []);
      setTags((await t.json()).data ?? []);
      setArtTypes(((await a.json()).data ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { const t = setTimeout(() => { void load(); }, 250); return () => clearTimeout(t); }, [load]);   // debounce กันยิงทุกคีย์
  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { setSelected(new Set()); }, [type, collectionId, tag, trash, source]);
  useEffect(() => { setArtworkType(""); }, [source]);   // เปลี่ยนหมวด → ล้างฟิลเตอร์ชนิด artwork

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

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-5">
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
            onClick={() => source === "artwork" ? setArtworkAddOpen(true) : setUploadOpen(true)}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
          >{source === "artwork" ? "🎨 เพิ่ม Artwork" : "⬆ อัปโหลด"}</button>
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
          {showBrandView ? (
            <BrandAlbumBrowser reloadKey={brandReload} openParentId={brandOpenParent} />
          ) : loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              {searching ? `ไม่พบไฟล์ที่ตรงกับ “${search.trim()}”`
                : trash ? "ถังขยะว่าง"
                : source === "artwork" ? "ยังไม่มี Artwork — กด “เพิ่ม Artwork” เพื่อลงบัตรงานออกแบบ (รูปตัวอย่าง + path ไฟล์ต้นฉบับ)"
                : source === "odoo_product" ? "ยังไม่มีรูปสินค้านำเข้า"
                : "ยังไม่มีไฟล์ในคลัง — กด “อัปโหลด” เพื่อเริ่มเก็บไฟล์"}
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {rows.map((a) => (
                <AssetCard key={a.id} a={a} selected={selected.has(a.id)}
                  onToggle={() => toggleSel(a.id)} onOpen={() => setDetailId(a.id)} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* bulk bar */}
      {selCount > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-600 text-white shadow-lg w-fit mx-auto">
          <span className="text-sm font-medium">เลือก {selCount} ไฟล์</span>
          {!trash && <button onClick={() => setBulkTagOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">🏷️ ติดแท็ก</button>}
          {!trash && <button onClick={() => setBulkMoveOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">📁 จัดอัลบั้ม</button>}
          <button onClick={() => setBulkTrashOpen(true)} className="text-sm px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">🗑️ ลบ</button>
          <button onClick={clearSel} className="text-sm px-2 py-1 rounded-lg hover:bg-white/15">ยกเลิก</button>
        </div>
      )}

      {/* modals */}
      {uploadOpen && (
        <UploadModal
          actor={actor} collections={collections}
          onClose={() => setUploadOpen(false)}
          onDone={async () => { setUploadOpen(false); await load(); await loadMeta(); }}
        />
      )}
      {artworkAddOpen && (
        <ArtworkAddModal actor={actor} artTypes={artTypes} collections={collections}
          onClose={() => setArtworkAddOpen(false)}
          onDone={async () => { setArtworkAddOpen(false); await load(); await loadMeta(); }} />
      )}
      {massOpen && (
        <MassArtworkModal actor={actor} artTypes={artTypes} collections={collections}
          onClose={() => setMassOpen(false)}
          onDone={async () => { setMassOpen(false); await load(); await loadMeta(); }} />
      )}
      {manageTypesOpen && (
        <ManageTypesModal types={artTypes} onClose={() => setManageTypesOpen(false)}
          onChanged={async () => { await loadMeta(); }} />
      )}
      {detailId && (
        <DetailModal
          id={detailId} actor={actor} collections={collections} artTypes={artTypes}
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

function AssetCard({ a, selected, onToggle, onOpen }: {
  a: AssetRow; selected: boolean; onToggle: () => void; onOpen: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`group relative rounded-xl border overflow-hidden bg-white ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"}`}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] ${selected
          ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white/90 border-slate-300 text-transparent group-hover:text-slate-300"}`}
      >✓</button>
      <button onClick={onOpen} className="block w-full text-left">
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
        <div className="px-2 py-1.5">
          <p className="text-[12px] font-medium text-slate-700 truncate">{a.title}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {formatBytes(a.size_bytes)}
            {a.usage_count > 0 ? ` · ใช้อยู่ ${a.usage_count} ที่` : a.status === "active" ? " · ยังไม่ถูกใช้" : ""}
          </p>
        </div>
      </button>
    </div>
  );
}

// ── อัปโหลด (ลากวาง) ──
type UpItem = { file: File; status: "pending" | "uploading" | "done" | "dup" | "error"; msg?: string };

function UploadModal({ actor, collections, onClose, onDone }: {
  actor: string | null; collections: AssetCollection[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<UpItem[]>([]);
  const [tagsStr, setTagsStr] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).map((file) => ({ file, status: "pending" as const }));
    setItems((s) => [...s, ...arr]);
  };

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
        const upFile = await downscaleImageWidth(next[i].file, 1200);   // ย่อด้านกว้าง ≤ 1200px ตอนอัป
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
function DetailModal({ id, actor, collections, artTypes, onClose, onChanged }: {
  id: string; actor: string | null; collections: AssetCollection[]; artTypes: LookupItem[]; onClose: () => void; onChanged: () => void;
}) {
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
  const [replacing, setReplacing] = useState(false);
  const [zoom, setZoom] = useState(false);   // กดรูป → ดูเต็มจอ
  const replaceRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/assets/${id}`); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const det = j.data as AssetDetail;
      setD(det); setTitle(det.title); setTags(det.tags ?? []); setCollectionIds(det.collection_ids ?? []);
      setMasterPath(det.master_path ?? ""); setMasterUrl(det.master_url ?? ""); setKeywords(det.keywords ?? "");
      setArtTypesSel(det.artwork_types?.length ? det.artwork_types : (det.artwork_type ? [det.artwork_type] : []));
      setSizes(det.sizes ?? []); setParentCodes(det.parent_sku_codes ?? []);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); onClose(); }
  }, [id, toast, onClose]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);
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
      const res = await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success("ย้ายลงถังขยะแล้ว"); onChanged(); onClose();
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
              : <button onClick={() => setConfirmTrash(true)} className="h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">🗑️ ลบ</button>}
            {!trashed && <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "บันทึก…" : "บันทึก"}</button>}
          </div>
        </div>
      }>
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
                <div className="mt-3"><p className="text-[12px] font-medium text-slate-600 mb-1">📐 ขนาด (กว้าง × ยาว)</p><SizesEditor value={sizes} onChange={setSizes} disabled={trashed} /></div>
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
              <input value={masterPath} onChange={(e) => setMasterPath(e.target.value)} disabled={trashed}
                placeholder="\\nas\Artwork\PIX\PIX32-02_v3.ai  หรือ  Z:\Artwork\…"
                className={`w-full h-8 px-2 text-[12px] border rounded-lg font-mono disabled:bg-slate-50 ${pathWarn ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`} />
              {pathWarn && <p className="text-[11px] text-amber-600 mt-1">⚠ ไม่ได้อยู่ในโฟลเดอร์มาตรฐาน — ควรเก็บใต้ <b className="font-mono">{rule.base_paths.join(" หรือ ")}</b></p>}
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <button onClick={copyPath} disabled={!masterPath} className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">📋 คัดลอก path</button>
                <button onClick={openFolder} disabled={!masterPath} className="h-7 px-2.5 text-[11px] border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 disabled:opacity-40">📂 เปิดโฟลเดอร์</button>
                {masterUrl && <a href={masterUrl} target="_blank" rel="noreferrer" className="h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 flex items-center">🌐 เปิดต้นฉบับ</a>}
              </div>
              <input value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} disabled={trashed}
                placeholder="ลิงก์ Google Drive / Synology (เปิดได้ทุกที่) — ไม่ใส่ก็ได้"
                className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded-lg mt-1.5 disabled:bg-slate-50" />
            </div>

            <UsageList usages={d.usages} />
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmTrash} onClose={() => setConfirmTrash(false)} onConfirm={trash}
        title="ย้ายไฟล์ลงถังขยะ?" message="กู้คืนได้ภายใน 30 วัน" confirmText="ย้ายลงถังขยะ" variant="danger" />

      {zoom && d && isImage(d) && (
        <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-6" onClick={() => setZoom(false)}>
          <img src={d.url} alt={d.title} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setZoom(false)} title="ปิด"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-slate-700 text-lg flex items-center justify-center hover:bg-white">✕</button>
        </div>
      )}
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

// ── เพิ่ม Artwork ลงบัตร (รูป + ชนิด + ชื่อ + แท็ก + ไซส์ + location + อัลบั้ม + Parent SKU + keyword) ──
function ArtworkAddModal({ actor, artTypes, collections, onClose, onDone }: { actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void }) {
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
  const [parentCodes, setParentCodes] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);      // อัลบั้มหลายอัน (m2m)
  const [cols, setCols] = useState<AssetCollection[]>(collections);       // สำเนาไว้ต่อท้ายเมื่อสร้างอัลบั้มใหม่ในฟอร์ม
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rule, , reloadRule] = useArtworkPathRule();
  const pathWarn = !!masterPath.trim() && !pathMatchesRule(masterPath, rule.base_paths);
  const [fileExt, setFileExt] = useState("");
  const [pathAuto, setPathAuto] = useState(true);   // path ยังตามชื่ออัตโนมัติอยู่ไหม (ผู้ใช้แก้เอง = หยุด)
  const [srcFiles, setSrcFiles] = useState<File[]>([]);   // ไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Drive
  const [driveOn, setDriveOn] = useState(false);
  const [driveProg, setDriveProg] = useState({ done: 0, total: 0 });   // สถานะอัป Drive
  const srcInputRef = useRef<HTMLInputElement>(null);
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { apiFetch("/api/drive").then((r) => r.json()).then((j) => setDriveOn(!!j.configured)).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);

  // อัปไฟล์ต้นฉบับขึ้น Google Drive "ผ่านแอป" (เลี่ยง CORS) — สร้างโฟลเดอร์ตามชื่อ + ตั้งชื่อไฟล์ตามชื่อ → คืนลิงก์โฟลเดอร์
  const MAX_PROXY = 4 * 1024 * 1024;   // ไฟล์เล็ก ≤4MB อัปผ่านแอป · ใหญ่กว่า = อัปเอง (ลิมิต body Vercel)
  const uploadSourcesToDrive = async (): Promise<string> => {
    const nm = title.trim() || "artwork";
    const named = srcFiles.map((f, i) => ({ file: f, filename: `${nm}${i > 0 ? `_${i + 1}` : ""}${f.name.match(/\.[^.]+$/)?.[0] ?? ""}` }));
    const small = named.filter((x) => x.file.size <= MAX_PROXY);
    const large = named.filter((x) => x.file.size > MAX_PROXY);

    let folderId = "", folderLink = "";
    const doUpload = async (x: { file: File; filename: string } | null) => {
      const fd = new FormData();
      fd.append("name", nm);
      if (artTypesSel[0]) fd.append("artworkType", artTypesSel[0]);
      if (brandId) fd.append("brand_id", brandId);
      if (folderId) fd.append("folderId", folderId);
      if (x) { fd.append("filename", x.filename); fd.append("file", x.file); }
      const res = await apiFetch("/api/drive/upload", { method: "POST", body: fd });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "อัป Drive ไม่สำเร็จ");
      folderId = j.folderId; folderLink = j.folderLink;
    };

    setDriveProg({ done: 0, total: small.length });
    for (let i = 0; i < small.length; i++) { await doUpload(small[i]); setDriveProg({ done: i + 1, total: small.length }); }
    if (!folderId && large.length) await doUpload(null);   // มีแต่ไฟล์ใหญ่ → สร้างโฟลเดอร์อย่างเดียว
    setDriveProg({ done: 0, total: 0 });
    if (large.length) toast.warning(`ไฟล์ใหญ่ ${large.length} ไฟล์ยังไม่อัปอัตโนมัติ (เกิน 4MB) — เปิดโฟลเดอร์ Drive จากลิงก์แล้วลากขึ้นเอง`);
    return folderLink;
  };

  const buildPath = (name: string, ext: string) => {
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
      // เติม path = โฟลเดอร์มาตรฐาน + ชื่อ + นามสกุล (ตามชื่อในฟอร์ม — เบราว์เซอร์อ่าน path จริงไม่ได้)
      if (pathAuto) setMasterPath(buildPath(nm, ext));
    }
  };

  const save = async () => {
    if (!file) { toast.error("แนบรูปตัวอย่างก่อน (export JPG/PNG จากงานออกแบบ)"); return; }
    if (!brandId) { toast.error("เลือกแบรนด์ก่อน"); return; }
    const willDrive = srcFiles.length > 0 && driveOn;
    if (!masterPath.trim() && !masterUrl.trim() && !willDrive) { toast.error("ใส่ที่อยู่ไฟล์ต้นฉบับอย่างน้อย 1 อย่าง (path NAS / ลิงก์ / โยนไฟล์ขึ้น Drive)"); return; }
    setBusy(true);
    try {
      // อัปไฟล์ต้นฉบับขึ้น Drive ก่อน (ได้ลิงก์โฟลเดอร์มาเติมให้)
      let effUrl = masterUrl.trim();
      if (willDrive) { const link = await uploadSourcesToDrive(); if (link) { effUrl = link; setMasterUrl(link); } }

      const upFile = await downscaleImageWidth(file, 1200);   // ย่อด้านกว้าง ≤ 1200px ตอนอัป
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
            <div className="text-[12px] text-slate-500">ชนิด <span className="text-[10px] text-slate-400">— เลือกได้หลายอัน</span>
              <div className="mt-0.5"><ArtTypeMultiSelect value={artTypesSel} types={artTypeList} onChange={setArtTypesSel} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div></div>
            <div className="text-[12px] text-slate-500">Group Album <span className="text-[10px] text-slate-400">— เลือกได้หลายอัน / สร้างใหม่ได้</span>
              <div className="mt-0.5"><CollectionMultiSelect value={collectionIds} collections={cols} onChange={setCollectionIds} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
          </div>
          <div className="text-[12px] text-slate-500">แท็ก <span className="text-[10px] text-slate-400">— กดเลือกในป๊อปอัป</span>
            <div className="mt-0.5"><TagPickerField value={tags} onChange={setTags} /></div></div>
        </div>
      </div>

      {/* ขนาด (หลายไซส์ + ชื่อกำกับ + หน่วย) */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[12px] font-medium text-slate-600 mb-1.5">📐 ขนาด (กว้าง × ยาว) <span className="text-[10px] text-slate-400 font-normal">— เพิ่มได้หลายไซส์ ใส่ชื่อกำกับ + เลือกหน่วยต่อไซส์</span></p>
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

        {/* โยนไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Google Drive อัตโนมัติ */}
        {driveOn && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <span className="text-[12px] text-slate-500">📤 หรือ โยนไฟล์ต้นฉบับ (AI/PSD/PDF) → อัปขึ้น Google Drive ให้อัตโนมัติ</span>
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
type MassRow = { id: number; file: File; preview: string | null; name: string; types: string[]; path: string; url: string };
function MassArtworkModal({ actor, artTypes, collections, onClose, onDone }: {
  actor: string | null; artTypes: LookupItem[]; collections: AssetCollection[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<MassRow[]>([]);
  const [cols, setCols] = useState<AssetCollection[]>(collections);
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [batchAlbums, setBatchAlbums] = useState<string[]>([]);   // อัลบั้มใช้กับทั้งชุด
  const [batchTypes, setBatchTypes] = useState<string[]>([]);     // ชนิดเริ่มต้น → กดใส่ให้ทุกแถว
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rule] = useArtworkPathRule();
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const base = rule.base_paths[0];

  const makeRow = (f: File): MassRow => ({
    id: ++idRef.current, file: f,
    preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
    name: f.name.replace(/\.[^.]+$/, ""), types: [...batchTypes],
    path: base ? `${base.replace(/[\\/]+$/, "")}\\${f.name}` : "", url: "",
  });
  const addFiles = (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setRows((r) => [...r, ...imgs.map(makeRow)]);
    else toast.error("รับเฉพาะไฟล์รูปภาพ (JPG/PNG/…)");
  };
  const setRow = (id: number, patch: Partial<MassRow>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const applyTypesToAll = () => setRows((r) => r.map((x) => ({ ...x, types: [...batchTypes] })));

  const save = async () => {
    if (rows.length === 0) { toast.error("ยังไม่มีรายการ — ลากไฟล์รูปเข้ามาก่อน"); return; }
    const missing = rows.filter((r) => !r.path.trim() && !r.url.trim());
    if (missing.length) { toast.error(`มี ${missing.length} แถวยังไม่ใส่ที่อยู่ไฟล์ต้นฉบับ (path หรือ ลิงก์)`); return; }
    setBusy(true); setProgress({ done: 0, total: rows.length });
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const upFile = await downscaleImageWidth(r.file, 1200);
        const fd = new FormData();
        fd.append("file", upFile); fd.append("source", "artwork");
        if (r.name.trim()) fd.append("title", r.name.trim());
        if (r.types.length) fd.append("artwork_types", JSON.stringify(r.types));
        if (r.path.trim()) fd.append("master_path", r.path.trim());
        if (r.url.trim()) fd.append("master_url", r.url.trim());
        if (batchAlbums.length) fd.append("collection_ids", JSON.stringify(batchAlbums));
        if (actor) fd.append("actor", actor);
        const res = await apiFetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "");
        ok++;
      } catch { fail++; }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setBusy(false); setProgress(null);
    if (ok) { toast.success(`เพิ่ม ${ok} รูปแล้ว${fail ? ` · ล้มเหลว ${fail}` : ""}`); onDone(); }
    else toast.error(`เพิ่มไม่สำเร็จ (${fail} รายการ)`);
  };

  return (
    <ERPModal open onClose={() => !busy && onClose()} title="📋 เพิ่ม Artwork หลายรูป (ตาราง)" size="xl"
      description="ลากไฟล์รูปหลายไฟล์เข้ามา → ได้ 1 แถวต่อ 1 รูป (ชื่อ+path เติมอัตโนมัติ) → แก้ในตาราง แล้วบันทึกทีเดียว"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">{progress ? `กำลังบันทึก ${progress.done}/${progress.total}…` : `${rows.length} รายการ`}</span>
          <div className="flex gap-2">
            <button onClick={() => !busy && onClose()} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={busy || rows.length === 0} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : `บันทึกทั้งหมด (${rows.length})`}</button>
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
      <div className="grid grid-cols-2 gap-3 mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
        <div className="text-[12px] text-slate-500">อัลบั้ม (ใช้กับทุกแถว)
          <div className="mt-0.5"><CollectionMultiSelect value={batchAlbums} collections={cols} onChange={setBatchAlbums} onCreated={(c) => setCols((cur) => [...cur, c])} /></div>
        </div>
        <div className="text-[12px] text-slate-500 flex flex-col">ชนิดเริ่มต้น
          <div className="mt-0.5"><ArtTypeMultiSelect value={batchTypes} types={artTypeList} onChange={setBatchTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div>
          {rows.length > 0 && batchTypes.length > 0 && <button type="button" onClick={applyTypesToAll} className="self-start mt-1 text-[11px] text-indigo-600 hover:underline">→ ใส่ชนิดนี้ให้ทุกแถว</button>}
        </div>
      </div>

      {/* ตาราง inline */}
      {rows.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-[13px]">ยังไม่มีรายการ — ลากไฟล์เข้ามาด้านบน</div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="border-b border-slate-200 px-2 py-1.5 w-14 text-center">รูป</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-left min-w-[140px]">ชื่อ</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-left min-w-[180px]">ชนิด</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-left min-w-[220px]">path ต้นฉบับ / ลิงก์</th>
                <th className="border-b border-slate-200 px-1 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="border-b border-slate-100 px-2 py-1.5 text-center">
                    {r.preview ? <img src={r.preview} alt="" className="w-11 h-11 object-contain rounded border border-slate-200 bg-slate-50 mx-auto" /> : <span className="text-xl">🎨</span>}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })}
                      className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded" />
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <ArtTypeMultiSelect value={r.types} types={artTypeList} onChange={(v) => setRow(r.id, { types: v })} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <input value={r.path} onChange={(e) => setRow(r.id, { path: e.target.value })} placeholder={base ? "path NAS…" : "\\\\nas\\… หรือ Z:\\…"}
                      className="w-full h-8 px-2 text-[11px] font-mono border border-slate-200 rounded mb-1" />
                    <input value={r.url} onChange={(e) => setRow(r.id, { url: e.target.value })} placeholder="ลิงก์ Drive / Synology (ถ้ามี)"
                      className="w-full h-8 px-2 text-[11px] border border-slate-200 rounded" />
                  </td>
                  <td className="border-b border-slate-100 px-1 py-1.5 text-center">
                    <button type="button" onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))} disabled={busy} title="ลบแถว"
                      className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ── จัดการชนิด Artwork (lookup กลาง: เพิ่ม/แก้/ลบ) ──
function ManageTypesModal({ types, onClose, onChanged }: { types: LookupItem[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<LookupItem[]>(types);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const r = await apiFetch("/api/lookups?type=artwork_type"); const j = await r.json();
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

// ── ตัวแก้ "หลายไซส์" (กว้าง×ยาว + ชื่อกำกับ + หน่วยต่อไซส์) ──
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
            placeholder="ยาว" className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
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
      {open && <ParentSkuPickerModal selected={value} onClose={() => setOpen(false)}
        onConfirm={(codes) => { onChange([...new Set([...value, ...codes])]); setOpen(false); }} />}
    </div>
  );
}

function ParentSkuPickerModal({ selected, onClose, onConfirm }: { selected: string[]; onClose: () => void; onConfirm: (codes: string[]) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; code: string; name: string; image: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const search = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ entity: "parent-skus", search: term, limit: "40" });
      const j = await apiFetch(`/api/sku-browser?${p.toString()}`).then((r) => r.json());
      setRows(((j.cards ?? []) as { id: string; code: string; name: string; image: string | null }[]).map((c) => ({ id: c.id, code: c.code, name: c.name, image: c.image })));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => { if (q.trim()) void search(q.trim()); else setRows([]); }, 250); return () => clearTimeout(t); }, [q, search]);
  const toggle = (code: string) => setPicked((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  return (
    <ERPModal open onClose={onClose} title="เลือก Parent SKU ที่ใช้ artwork นี้" size="md"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => onConfirm([...picked])} disabled={picked.size === 0}
          className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">เพิ่ม {picked.size || ""}</button>
      </div>}>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="พิมพ์รหัส/ชื่อ Parent SKU…"
        className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <div className="max-h-[46vh] overflow-auto flex flex-col gap-1">
        {loading ? <div className="py-8 text-center text-slate-400 text-sm">กำลังค้น…</div>
          : rows.length === 0 ? <div className="py-8 text-center text-slate-400 text-sm">{q.trim() ? "ไม่พบ" : "พิมพ์เพื่อค้นหา Parent SKU"}</div>
          : rows.map((r) => {
              const already = selected.includes(r.code);
              const on = already || picked.has(r.code);
              return (
                <button key={r.id} type="button" disabled={already} onClick={() => toggle(r.code)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left disabled:opacity-60 ${on ? "bg-indigo-50 border-indigo-300" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${on ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                  {r.image ? <img src={withImageWidth(r.image, 80) ?? r.image} alt="" className="w-8 h-8 rounded object-cover border border-slate-200" />
                    : <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs">📦</div>}
                  <span className="font-mono text-[12px] text-slate-700">{r.code}</span>
                  <span className="text-[12px] text-slate-500 truncate flex-1">{r.name}</span>
                  {already && <span className="text-[10px] text-slate-400 shrink-0">เลือกแล้ว</span>}
                </button>
              );
            })}
      </div>
    </ERPModal>
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

// ตั้งค่าโฟลเดอร์ Drive: แบรนด์ → โฟลเดอร์ฐาน · ชนิด → ชื่อซับโฟลเดอร์ (โชว์เมื่อ Drive ตั้งค่าแล้ว)
function DriveFolderMap() {
  const toast = useToast();
  const [driveOn, setDriveOn] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [bDraft, setBDraft] = useState<Record<string, string>>({});   // brand_id → folder id
  const [bLabel, setBLabel] = useState<Record<string, string>>({});   // brand_id → ชื่อโฟลเดอร์ (ตรวจแล้ว)
  const [tDraft, setTDraft] = useState<Record<string, string>>({});   // type → subfolder name
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {});
    apiFetch("/api/lookups?type=artwork_type").then((r) => r.json()).then((j) => setTypes(((j.data ?? []) as { name: string }[]).map((x) => x.name).filter(Boolean))).catch(() => {});
    apiFetch("/api/drive/brand-folders").then((r) => r.json()).then((j) => {
      setDriveOn(!!j.configured);
      const d: Record<string, string> = {}, l: Record<string, string> = {};
      for (const r of (j.data ?? []) as { brand_id: string; folder_id: string; folder_label: string | null }[]) { d[r.brand_id] = r.folder_id; l[r.brand_id] = r.folder_label ?? ""; }
      setBDraft(d); setBLabel(l);
    }).catch(() => {});
    apiFetch("/api/drive/folders").then((r) => r.json()).then((j) => {
      const d: Record<string, string> = {};
      for (const r of (j.data ?? []) as { artwork_type: string; subfolder_name: string | null }[]) d[r.artwork_type] = r.subfolder_name ?? "";
      setTDraft(d);
    }).catch(() => {});
  }, []);
  const saveBrand = async (id: string) => {
    const fid = (bDraft[id] ?? "").trim();
    try {
      if (!fid) { await apiFetch(`/api/drive/brand-folders?brand_id=${encodeURIComponent(id)}`, { method: "DELETE" }); setBLabel((m) => { const n = { ...m }; delete n[id]; return n; }); toast.success("ล้างแล้ว"); return; }
      const res = await apiFetch("/api/drive/brand-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: id, folder_id: fid }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
      setBLabel((m) => ({ ...m, [id]: j.folder_label ?? "" })); toast.success("บันทึก + ตรวจโฟลเดอร์แล้ว");
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
  };
  const saveType = async (t: string) => {
    try {
      const res = await apiFetch("/api/drive/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artwork_type: t, subfolder_name: tDraft[t] ?? "" }) });
      const j = await res.json(); if (!res.ok || j.error) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
      toast.success("บันทึกแล้ว");
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
  };
  if (!driveOn) return null;
  return (
    <>
      <div className="mt-4 pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-600 font-medium">📁 โฟลเดอร์ Drive ตามแบรนด์ (folder id ฐานของแต่ละแบรนด์)</p>
        <p className="text-[11px] text-slate-400 mb-2">ต้องแชร์โฟลเดอร์ให้ service account ก่อน · ปล่อยว่าง = ใช้โฟลเดอร์แม่</p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {brands.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="w-28 text-[12px] text-slate-600 truncate shrink-0" title={b.name}>{b.name}</span>
              <input value={bDraft[b.id] ?? ""} onChange={(e) => setBDraft((d) => ({ ...d, [b.id]: e.target.value }))} placeholder="folder id"
                className="flex-1 h-8 px-2 text-[12px] font-mono border border-slate-200 rounded" />
              {bLabel[b.id] && <span className="text-[11px] text-emerald-600 truncate max-w-[90px] shrink-0" title={bLabel[b.id]}>✓ {bLabel[b.id]}</span>}
              <button type="button" onClick={() => saveBrand(b.id)} className="h-8 px-2 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0">บันทึก</button>
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
