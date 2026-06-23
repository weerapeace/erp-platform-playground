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
import { type AssetRow, type AssetDetail, type AssetUsage } from "@/app/api/assets/shared";
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
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => setActor(data.user?.email ?? null)).catch(() => {});
  }, []);

  // ── โหลดรายการไฟล์ ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (type) p.set("type", type);
      if (collectionId) p.set("collection_id", collectionId);
      if (tag) p.set("tag", tag);
      p.set("status", trash ? "trashed" : "active");
      p.set("source", source);
      if (artworkType) p.set("artwork_type", artworkType);
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

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { setSelected(new Set()); }, [type, collectionId, tag, trash, source]);
  useEffect(() => { setArtworkType(""); }, [source]);   // เปลี่ยนหมวด → ล้างฟิลเตอร์ชนิด artwork

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
          <button
            onClick={() => source === "artwork" ? setArtworkAddOpen(true) : setUploadOpen(true)}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
          >{source === "artwork" ? "🎨 เพิ่ม Artwork" : "⬆ อัปโหลด"}</button>
        </div>
      </div>

      {/* type filter + trash toggle */}
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

      <div className="flex gap-4 items-start">
        {/* sidebar */}
        <aside className="w-44 shrink-0 hidden md:block">
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
          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              {trash ? "ถังขยะว่าง"
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
        <ArtworkAddModal actor={actor} artTypes={artTypes}
          onClose={() => setArtworkAddOpen(false)}
          onDone={async () => { setArtworkAddOpen(false); await load(); await loadMeta(); }} />
      )}
      {manageTypesOpen && (
        <ManageTypesModal types={artTypes} onClose={() => setManageTypesOpen(false)}
          onChanged={async () => { await loadMeta(); }} />
      )}
      {detailId && (
        <DetailModal
          id={detailId} actor={actor} collections={collections} artTypes={artTypes}
          onClose={() => setDetailId(null)}
          onChanged={async () => { await load(); await loadMeta(); }}
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
        <div className="h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
          {isImage(a) && !broken ? (
            <img src={withImageWidth(a.url, 320) ?? a.url} alt={a.title} loading="lazy" onError={() => setBroken(true)}
              className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">{TYPE_ICON[a.asset_type]}</span>
          )}
        </div>
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
        const fd = new FormData();
        fd.append("file", next[i].file);
        if (tagsStr.trim()) fd.append("tags", tagsStr.trim());
        if (collectionId) fd.append("collection_id", collectionId);
        if (actor) fd.append("actor", actor);
        const d = await imgDims(next[i].file);
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
  const [artType, setArtType] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/assets/${id}`); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const det = j.data as AssetDetail;
      setD(det); setTitle(det.title); setTags(det.tags ?? []); setCollectionIds(det.collection_ids ?? []);
      setMasterPath(det.master_path ?? ""); setMasterUrl(det.master_url ?? ""); setArtType(det.artwork_type ?? ""); setKeywords(det.keywords ?? "");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); onClose(); }
  }, [id, toast, onClose]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/assets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tags, collection_ids: collectionIds, master_path: masterPath, master_url: masterUrl, artwork_type: artType, keywords }),
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
            {isImage(d) ? <img src={withImageWidth(d.url, 768) ?? d.url} alt={d.title} className="max-w-full max-h-[360px] object-contain" />
              : <div className="text-center"><div className="text-5xl">{TYPE_ICON[d.asset_type]}</div><p className="text-[11px] text-slate-400 mt-2">{(d.ext ?? "").toUpperCase()}</p></div>}
          </div>

          <div className="flex-1 min-w-[240px]">
            <label className="text-[12px] text-slate-500">ชื่อไฟล์
              <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={trashed}
                className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
            </label>

            {d.source === "artwork" && (
              <label className="block text-[12px] text-slate-500 mt-2">ชนิด artwork
                <select value={artType} onChange={(e) => setArtType(e.target.value)} disabled={trashed}
                  className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
                  {artType && !artTypes.some((t) => t.name === artType) && <option value={artType}>{artType}</option>}
                  {artTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </label>
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
                <div className="mt-1">{trashed ? <span className="text-[11px] text-slate-400">{tags.join(", ") || "—"}</span> : <TagChips value={tags} onChange={setTags} />}</div>
              </div>
            </div>

            <label className="block text-[12px] text-slate-500 mt-3">คำค้นเพิ่มเติม (keyword)
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={trashed}
                placeholder="คำพ้อง/ชื่ออื่น เช่น flower ดอกไม้ summer"
                className="mt-1 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" /></label>

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
                className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded-lg font-mono disabled:bg-slate-50" />
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

// ── เพิ่ม Artwork ลงบัตร (รูปตัวอย่าง + path ต้นฉบับ + ชนิด + แท็ก จบในป๊อปอัปเดียว) ──
function ArtworkAddModal({ actor, artTypes, onClose, onDone }: { actor: string | null; artTypes: LookupItem[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artType, setArtType] = useState(artTypes[0]?.name ?? "");
  const [masterPath, setMasterPath] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const save = async () => {
    if (!file) { toast.error("แนบรูปตัวอย่างก่อน (export JPG/PNG จากงานออกแบบ)"); return; }
    if (!masterPath.trim() && !masterUrl.trim()) { toast.error("ใส่ที่อยู่ไฟล์ต้นฉบับอย่างน้อย 1 อย่าง (path NAS หรือ ลิงก์ Google Drive)"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", "artwork");
      fd.append("artwork_type", artType);
      if (title.trim()) fd.append("title", title.trim());
      if (masterPath.trim()) fd.append("master_path", masterPath.trim());
      if (masterUrl.trim()) fd.append("master_url", masterUrl.trim());
      if (keywords.trim()) fd.append("keywords", keywords.trim());
      if (tags.length) fd.append("tags", tags.join(","));
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
      const res = await apiFetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success("เพิ่ม Artwork ลงคลังแล้ว"); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="เพิ่ม Artwork ลงคลัง" size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-slate-400">รูปตัวอย่างเล็กพอ — ไฟล์ใหญ่ .ai/.psd เก็บที่ NAS</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ลายดอกไม้ PIX32"
              className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
          <label className="text-[12px] text-slate-500">ชนิด
            <select value={artType} onChange={(e) => setArtType(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {artType && !artTypes.some((t) => t.name === artType) && <option value={artType}>{artType}</option>}
              {artTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select></label>
          <div className="text-[12px] text-slate-500">แท็ก
            <div className="mt-0.5"><TagChips value={tags} onChange={setTags} /></div></div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-3 mb-1">ที่อยู่ไฟล์ต้นฉบับ — ใส่อย่างน้อย 1 อย่าง (path NAS หรือ ลิงก์ Google Drive)</p>
      <label className="block text-[12px] text-slate-500">path NAS
        <input value={masterPath} onChange={(e) => setMasterPath(e.target.value)}
          placeholder="\\nas\Artwork\PIX\PIX32-02_v3.ai  หรือ  Z:\Artwork\…"
          className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg font-mono" /></label>
      <label className="block text-[12px] text-slate-500 mt-2">ลิงก์ Google Drive / Synology (เปิดได้ทุกที่)
        <input value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} placeholder="https://drive.google.com/…  หรือ  ลิงก์ Synology Drive"
          className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
      <label className="block text-[12px] text-slate-500 mt-2">คำค้นเพิ่มเติม (keyword) <span className="text-[10px] text-slate-400">— คำพ้อง/ชื่ออื่น พิมพ์แล้วเจอ</span>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="เช่น flower ดอกไม้ summer ฤดูร้อน"
          className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
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
