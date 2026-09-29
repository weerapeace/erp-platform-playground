"use client";

/**
 * SwatchBrowser — แท็บ 🎨 Swatch ในหน้า /master/skus (ข้าง 📦 Bundle)
 *
 * Swatch = รูปแผ่นตัวอย่างจริง (การ์ดสีผ้า / ด้าย / อะไหล่) ที่ "กดบนรูปแล้วเปิด SKU ของชิ้นนั้น"
 *   โหมดดู    — เห็นแต่รูป ไม่มีเส้นกรอบ · ชี้ที่ชิ้น = ป้ายรหัส/ชื่อ/สต๊อก
 *               · กด = เมนูเล็ก: 🛒 ขอซื้อ / 🔍 ดูรายละเอียด (Drawer SKU) / ☑ เลือกหลายรายการ (แล้วสร้างใบขอซื้อรวดเดียว)
 *   โหมดตั้งค่า — ลากสี่เหลี่ยมบนรูป → ตัวเลือก SKU เด้งให้ผูกทันที (1 กรอบ = 1 SKU) · ย้าย/ปรับขนาด/ลบได้
 * จัดหมวดด้วยแท็กกลาง (product_families) ชุดเดียวกับหน้า SKU
 *
 * ของกลางที่ใช้: ImageRegions (จุดบนรูป) · SkuPicker · TagGroupFilter · uploadResizedImage · ERPModal · ConfirmDialog
 *               · MasterRecordDrawer · usePermission · useToast · apiFetch · r2ImageUrl
 * API: /api/sku-swatches (GET/POST/PATCH/DELETE) · สิทธิ์ตั้งค่า = products.edit · ดู = products.view
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { uploadResizedImage } from "@/components/image-attach";
import { ImageRegions } from "@/components/image-regions";
import { PrCreateModal, type PrCreateItem } from "@/components/pr-create-modal";
import { BundleAddModal, type BundleAddItem } from "@/components/bundle-add-modal";
import type { SwatchCard, SwatchDetail, SwatchSpot } from "@/app/api/sku-swatches/route";

const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

const PAGE = 60;
const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };
const ZOOMS = [1, 1.5, 2, 3];
const titleOf = (s: { name: string | null; seq: number }) => s.name?.trim() || `Swatch #${s.seq}`;

/** อ่านขนาดรูป (px) จากไฟล์ — เก็บไว้กับแผ่นเพื่อจองพื้นที่ตอนโหลด */
function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
async function uploadSwatchImage(file: File) {
  const [size, up] = await Promise.all([readImageSize(file), uploadResizedImage(file, { folder: "swatches", max: 2400 })]);
  // รูปถูกย่อให้ด้านยาว ≤ 2400 — เก็บสัดส่วนเดิม (พิกัดจุดเป็น % จึงไม่กระทบ)
  return { image_key: up.r2_key, image_w: size.w, image_h: size.h };
}

export function SwatchBrowser({ openId, focusSpotId }: {
  /** เปิดแผ่นนี้ทันที (มาจากลิงก์ในหน้า SKU) */
  openId?: string | null;
  /** ชี้ตำแหน่งจุดนี้บนแผ่นที่เปิด (วงกะพริบชั่วคราว) */
  focusSpotId?: string | null;
} = {}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [rows, setRows] = useState<SwatchCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilterValue>(EMPTY_FILTER);
  const [createOpen, setCreateOpen] = useState(false);
  const [open, setOpen] = useState<{ id: string; edit: boolean; spotId?: string | null } | null>(openId ? { id: openId, edit: false, spotId: focusSpotId ?? null } : null);
  // ลิงก์มาถึงหลังหน้าโหลดแล้ว (พารามิเตอร์อ่านใน effect ของหน้าแม่) → เปิดตาม
  useEffect(() => { if (openId) setOpen({ id: openId, edit: false, spotId: focusSpotId ?? null }); }, [openId, focusSpotId]);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (append = false, have = 0) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(append ? have : 0) });
      if (q) p.set("search", q);
      if (tagFilter.tagIds.length) p.set("family_ids", tagFilter.tagIds.join(","));
      const j = await apiFetch(`/api/sku-swatches?${p}`).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      setRows((prev) => (append ? [...prev, ...(j.swatches as SwatchCard[])] : (j.swatches as SwatchCard[])));
      setTotal(Number(j.total ?? 0));
    } catch { toast.error("โหลด swatch ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [q, tagFilter, toast]);
  useEffect(() => { void load(false); }, [load]);

  return (
    <div>
      {/* แถบบน: ค้นหา + กรองแท็ก + เพิ่ม */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 min-w-[240px] bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา swatch (ชื่อแผ่น / รหัสหรือชื่อ SKU ที่อยู่บนแผ่น)"
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <TagGroupFilter value={tagFilter} onChange={setTagFilter} label="กรองแท็ก" showNone={false} />
        {canEdit && <button onClick={() => setCreateOpen(true)} className="h-10 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0">+ เพิ่ม Swatch</button>}
      </div>
      {tagFilter.tagIds.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-[12.5px] text-amber-800">🏷️ กำลังดูเฉพาะแท็กที่เลือก ({tagFilter.tagIds.length} แท็ก)</span>
          <button onClick={() => setTagFilter(EMPTY_FILTER)} className="h-7 px-2.5 text-[12px] rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 ml-auto">✕ ล้างตัวกรองแท็ก</button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-56 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">🎨</p>
          <p className="text-slate-500 text-sm font-medium">{q || tagFilter.tagIds.length ? "ไม่พบ swatch ที่ตรงกับตัวกรอง" : "ยังไม่มีแผ่น swatch"}</p>
          {!q && !tagFilter.tagIds.length && (
            <p className="text-slate-400 text-[13px] mt-1">
              {canEdit ? <>กด <b>+ เพิ่ม Swatch</b> → อัปโหลดรูปการ์ดสี/แผ่นตัวอย่าง → ลากสี่เหลี่ยมครอบแต่ละชิ้นแล้วผูก SKU</> : "ยังไม่มีใครเพิ่มแผ่นตัวอย่าง (ต้องมีสิทธิ์แก้ไขสินค้าจึงจะเพิ่มได้)"}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-[12px] text-slate-400 mb-2">{total.toLocaleString("th-TH")} แผ่น</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {rows.map((s) => (
              <button key={s.id} onClick={() => setOpen({ id: s.id, edit: false })}
                className="text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition overflow-hidden flex flex-col">
                <div className="h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {s.image_key
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r2ImageUrl(s.image_key, 480) ?? ""} alt={titleOf(s)} loading="lazy" className="w-full h-full object-cover" />
                    : <span className="text-3xl text-slate-300">🎨</span>}
                </div>
                <div className="p-2.5 min-w-0">
                  <div className="text-[13px] font-medium text-slate-800 truncate" title={titleOf(s)}>{titleOf(s)}</div>
                  <div className="text-[11px] mt-0.5 flex items-center gap-2">
                    <span className="text-slate-500">{s.linked_count.toLocaleString("th-TH")} ชิ้น</span>
                    {canEdit && s.spot_count > s.linked_count && <span className="text-amber-600">⚠ ยังไม่ผูก {s.spot_count - s.linked_count} จุด</span>}
                    {canEdit && s.spot_count === 0 && <span className="text-amber-600">⚠ ยังไม่ได้ตั้งจุด</span>}
                  </div>
                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.tags.slice(0, 3).map((t) => <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t.name}</span>)}
                      {s.tags.length > 3 && <span className="text-[10px] text-slate-400">+{s.tags.length - 3}</span>}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {rows.length < total && (
            <div className="text-center mt-4">
              <button onClick={() => void load(true, rows.length)} disabled={loading} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
                {loading ? "กำลังโหลด…" : `โหลดเพิ่ม (เหลืออีก ${(total - rows.length).toLocaleString("th-TH")})`}
              </button>
            </div>
          )}
        </>
      )}

      {createOpen && <CreateSwatchModal onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); void load(false); setOpen({ id, edit: true }); }} />}
      {open && (
        <SwatchViewer key={open.id} id={open.id} startEdit={open.edit} canEdit={canEdit} focusSpotId={open.spotId ?? null}
          onClose={() => setOpen(null)} onChanged={() => void load(false)} onDeleted={() => { setOpen(null); void load(false); }} />
      )}
    </div>
  );
}

// ───────────────────────────── ช่องเลือกรูป (ลากวาง / วาง Ctrl+V / เลือกไฟล์) ─────────────────────────────
function ImageDrop({ file, onFile, busy }: { file: File | null; onFile: (f: File) => void; busy?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) onFile(f);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onFile]);
  const pick = (files: FileList | null) => { const f = Array.from(files ?? []).find((x) => x.type.startsWith("image/")); if (f) onFile(f); };
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
      onClick={() => !busy && inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed cursor-pointer flex items-center justify-center overflow-hidden min-h-[180px] ${over ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-300"}`}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {preview
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={preview} alt="" className="max-h-72 max-w-full object-contain" />
        : <div className="text-center text-sm text-slate-500 p-6"><div className="text-3xl mb-1">🖼️</div>ลากรูปมาวาง · กด Ctrl+V · หรือคลิกเพื่อเลือกไฟล์<div className="text-[11px] text-slate-400 mt-1">ถ่ายให้ตรง ไม่เอียง จะครอบกรอบได้พอดีที่สุด</div></div>}
    </div>
  );
}

// ───────────────────────────── สร้างแผ่นใหม่ ─────────────────────────────
function CreateSwatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<TagFilterValue>(EMPTY_FILTER);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!file || saving) return;
    setSaving(true);
    try {
      const img = await uploadSwatchImage(file);
      const j = await apiFetch("/api/sku-swatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, family_tag_ids: tags.tagIds, ...img }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success("เพิ่มแผ่น swatch แล้ว — ลากสี่เหลี่ยมบนรูปเพื่อผูก SKU ได้เลย");
      onCreated(j.id as string);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  return (
    <ERPModal open onClose={onClose} title="🎨 เพิ่มแผ่น Swatch" size="md" hasUnsavedChanges={!!file || !!name} loading={saving}
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={!file || saving} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังอัปโหลด…" : "บันทึก แล้วไปตั้งจุด"}</button>
      </div>}>
      <div className="space-y-3">
        <ImageDrop file={file} onFile={setFile} busy={saving} />
        <label className="block text-sm">
          <span className="text-slate-600">ชื่อแผ่น <span className="text-slate-400 text-xs">(ไม่ใส่ก็ได้ ระบบตั้งให้เป็น Swatch #ลำดับ)</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น หนัง PU ลายตาราง ชุด A" className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">หมวด (แท็กกลาง)</span>
          <TagGroupFilter value={tags} onChange={setTags} label="🏷️ เลือกแท็ก" showNone={false} />
          {tags.tagIds.length > 0 && <span className="text-xs text-slate-500">{tags.tagIds.length} แท็ก</span>}
        </div>
      </div>
    </ERPModal>
  );
}

// ───────────────────────────── หน้าดู / ตั้งค่าแผ่น (เต็มจอ) ─────────────────────────────
type EditSpot = SwatchSpot;
let tempSeq = 0;

function SwatchViewer({ id, startEdit, canEdit, focusSpotId, onClose, onChanged, onDeleted }: {
  id: string; startEdit: boolean; canEdit: boolean; focusSpotId?: string | null; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<SwatchDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">(startEdit && canEdit ? "edit" : "view");
  const [zoom, setZoom] = useState(1);
  const [skuDrawer, setSkuDrawer] = useState<string | null>(null);
  // ── โหมดดู: ขอซื้อ / เลือกหลายรายการ ──
  const canPr = usePermission("pr.create");
  const [selecting, setSelecting] = useState(false);                 // โหมดติ๊กเลือกหลายชิ้น
  const [checked, setChecked] = useState<Set<string>>(new Set());    // id ของจุดที่ติ๊ก
  const [prItems, setPrItems] = useState<PrCreateItem[] | null>(null);   // เปิดฟอร์มสร้างใบขอซื้อ
  const [bundleItems, setBundleItems] = useState<BundleAddItem[] | null>(null);   // เปิดป๊อปส่งเข้า Bundle
  const stopSelecting = () => { setSelecting(false); setChecked(new Set()); };
  // ── สถานะโหมดตั้งค่า ──
  const [spots, setSpots] = useState<EditSpot[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<TagFilterValue>(EMPTY_FILTER);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "close" | "delete" | "replace">(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetEdit = useCallback((d: SwatchDetail) => {
    setSpots(d.spots); setName(d.name ?? ""); setNote(d.note ?? ""); setTags({ tagIds: d.family_tag_ids, none: false }); setSelId(null); setDirty(false);
  }, []);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/sku-swatches?id=${encodeURIComponent(id)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setData(j.swatch as SwatchDetail); resetEdit(j.swatch as SwatchDetail);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id, resetEdit]);
  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => spots.find((s) => s.id === selId) ?? null, [spots, selId]);
  const patchSpot = (sid: string, p: Partial<EditSpot>) => { setSpots((prev) => prev.map((s) => (s.id === sid ? { ...s, ...p } : s))); setDirty(true); };
  const removeSpot = (sid: string) => { setSpots((prev) => prev.filter((s) => s.id !== sid)); setSelId((c) => (c === sid ? null : c)); setDirty(true); };
  /** เปิดตัวเลือก SKU ของจุดที่เลือก (หลังวาดกรอบ/กดจุดที่ยังไม่ผูก) */
  const openPicker = () => setTimeout(() => pickerRef.current?.querySelector<HTMLButtonElement>("button")?.click(), 60);

  const tryClose = () => { if (mode === "edit" && dirty) setConfirm("close"); else onClose(); };
  const tryLeaveEdit = () => { if (dirty) setConfirm("leave"); else setMode("view"); };

  // ปุ่มลัด: Esc ปิด/ออกจากโหมดตั้งค่า · Delete ลบจุดที่เลือก (ตอนไม่ได้พิมพ์อยู่)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (skuDrawer || confirm || prItems || bundleItems) return;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName ?? "");
      if (e.key === "Escape" && !typing) { if (mode === "edit") tryLeaveEdit(); else if (selecting) stopSelecting(); else onClose(); }
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "edit" && selId && !typing) { e.preventDefault(); removeSpot(selId); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selId, dirty, skuDrawer, confirm, prItems, bundleItems, selecting]);

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    try {
      const body = {
        id: data.id, name, note, family_tag_ids: tags.tagIds,
        spots: spots.map((s) => ({ id: s.id.startsWith("new-") ? undefined : s.id, sku_id: s.sku_id, x: s.x, y: s.y, w: s.w, h: s.h, label: s.label })),
      };
      const j = await apiFetch("/api/sku-swatches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const unlinked = spots.filter((s) => !s.sku_id).length;
      toast.success(unlinked > 0 ? `บันทึกแล้ว — ยังมี ${unlinked} จุดที่ยังไม่ผูก SKU (จุดพวกนี้จะไม่แสดงตอนดู)` : "บันทึกแล้ว");
      await load(); onChanged(); setMode("view");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const replaceImage = async (file: File) => {
    if (!data) return;
    setSaving(true);
    try {
      const img = await uploadSwatchImage(file);
      const j = await apiFetch("/api/sku-swatches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id, ...img }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setData({ ...data, ...img });
      toast.success("เปลี่ยนรูปแล้ว — ตรวจตำแหน่งกรอบอีกครั้ง"); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปลี่ยนรูปไม่สำเร็จ"); }
    finally { setSaving(false); setPendingFile(null); }
  };
  const del = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const j = await apiFetch(`/api/sku-swatches?id=${data.id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success("ลบแผ่น swatch แล้ว (SKU ไม่ถูกลบ)"); onDeleted();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setSaving(false); setConfirm(null); }
  };

  // Drawer SKU และป๊อปยืนยันของกลางอยู่ชั้น z-50 (ต่ำกว่าหน้านี้) → ถอยหน้านี้ไปข้างหลังตอนมีอย่างใดอย่างหนึ่งเปิด
  // (เดิมถอยเฉพาะตอนมีป๊อปยืนยัน → กดชิ้นบนรูปแล้ว Drawer เปิดจริงแต่ถูกหน้านี้บังมิด)
  const behind = !!confirm || !!skuDrawer || !!prItems || !!bundleItems;
  const viewSpots = useMemo(() => (data?.spots ?? []).filter((s) => !!s.sku), [data]);
  /** จุดบนแผ่น → รายการสำหรับฟอร์มขอซื้อ (SKU เดียวกันหลายจุด นับครั้งเดียว) */
  const toPrItems = (list: SwatchSpot[]): PrCreateItem[] => {
    const seen = new Set<string>(); const out: PrCreateItem[] = [];
    for (const s of list) {
      if (!s.sku || seen.has(s.sku.id)) continue;
      seen.add(s.sku.id);
      out.push({ sku_id: s.sku.id, code: s.sku.code, name: s.sku.name, image: s.sku.image, image_key: s.sku.image_key, uom: s.sku.uom });
    }
    return out;
  };
  const checkedItems = toPrItems(viewSpots.filter((s) => checked.has(s.id)));
  const src = data?.image_key ? r2ImageUrl(data.image_key, zoom > 1.5 ? 2400 : 1600) ?? "" : "";
  const dupOf = (s: EditSpot) => !!s.sku_id && spots.some((o) => o.id !== s.id && o.sku_id === s.sku_id);

  return createPortal(
    <>
      <div className={`fixed inset-0 flex flex-col bg-white ${behind ? "z-[45] pointer-events-none" : "z-[140]"}`}>
        {/* หัว */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-200 shrink-0">
          <span className="text-xl">🎨</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-slate-800 truncate">{data ? titleOf(mode === "edit" ? { name, seq: data.seq } : data) : "กำลังโหลด…"}</div>
            {data && (
              <div className="text-[11px] text-slate-400 truncate">
                {mode === "edit" ? `โหมดตั้งค่า · ${spots.length} จุด · ผูกแล้ว ${spots.filter((s) => s.sku_id).length}` : selecting ? `โหมดเลือกหลายรายการ · กดที่ชิ้นบนรูปเพื่อติ๊กเลือก` : `${viewSpots.length} ชิ้น · กดที่ชิ้นบนรูปเพื่อขอซื้อ / ดูรายละเอียด`}
                {mode === "view" && data.tags.length > 0 && <> · {data.tags.map((t) => t.name).join(", ")}</>}
              </div>
            )}
          </div>
          {/* ซูม */}
          <div className="hidden sm:inline-flex items-center rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])} disabled={zoom === ZOOMS[0]} className="w-8 h-8 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="ซูมออก">−</button>
            <span className="w-12 text-center text-[12px] text-slate-500 tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} className="w-8 h-8 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="ซูมเข้า">+</button>
          </div>
          {mode === "view" && data && viewSpots.length > 0 && (
            <button onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className={`h-9 px-3 text-sm rounded-lg border ${selecting ? "border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {selecting ? "✕ เลิกเลือก" : "☑ เลือกหลายรายการ"}
            </button>
          )}
          {mode === "view" && canEdit && data && !selecting && (
            <button onClick={() => { resetEdit(data); setMode("edit"); }} className="h-9 px-3 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">✏️ ตั้งค่าจุด</button>
          )}
          {mode === "edit" && (
            <>
              <button onClick={tryLeaveEdit} disabled={saving} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => void save()} disabled={saving || !dirty} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
            </>
          )}
          <button onClick={tryClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500" title="ปิด (Esc)">✕</button>
        </div>

        {/* เนื้อหา */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-slate-100 p-3 sm:p-5">
            {err ? (
              <div className="text-center py-16 text-sm text-rose-600">⚠ {err} <button onClick={() => void load()} className="underline ml-1">ลองใหม่</button></div>
            ) : !data ? (
              <div className="mx-auto max-w-4xl h-[60vh] rounded-xl bg-slate-200 animate-pulse" />
            ) : !src ? (
              <div className="text-center py-16 text-sm text-slate-400">แผ่นนี้ยังไม่มีรูป</div>
            ) : (
              <div className={zoom === 1 ? "mx-auto max-w-4xl" : ""} style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}>
                {mode === "view" ? (
                  <ImageRegions<SwatchSpot> src={src} alt={titleOf(data)} className="w-full shadow-lg rounded-md overflow-visible" mode="view" regions={viewSpots}
                    regionLabel={(r) => r.sku?.code ?? null}
                    selecting={selecting} checkedIds={checked} pulseId={focusSpotId ?? null}
                    onToggleCheck={(r) => setChecked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                    renderMenu={(r, close) => r.sku ? (
                      <div className="w-56 rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-left">
                        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                          <div className="font-mono text-[11px] text-slate-500 truncate">{r.sku.code}{r.label ? ` · ${r.label}` : ""}</div>
                          <div className="text-[12.5px] text-slate-800 truncate" title={r.sku.name}>{r.sku.name || "—"}</div>
                        </div>
                        <button type="button" role="menuitem" disabled={!canPr}
                          title={canPr ? "สร้างใบขอซื้อของชิ้นนี้" : "คุณไม่มีสิทธิ์สร้างใบขอซื้อ"}
                          onClick={() => { close(); setPrItems(toPrItems([r])); }}
                          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-white">
                          <span>🛒</span><span className="flex-1">ขอซื้อ</span>{!canPr && <span className="text-[10px] text-slate-400">ไม่มีสิทธิ์</span>}
                        </button>
                        <button type="button" role="menuitem" onClick={() => { close(); setSkuDrawer(r.sku!.id); }}
                          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50">
                          <span>🔍</span><span className="flex-1">ดูรายละเอียด</span>
                        </button>
                        <button type="button" role="menuitem" onClick={() => { close(); setChecked(new Set([r.id])); setSelecting(true); }}
                          className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50 border-t border-slate-100">
                          <span>☑</span><span className="flex-1">เลือกหลายรายการ</span>
                        </button>
                      </div>
                    ) : null}
                    renderTooltip={(r) => r.sku ? (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.sku.image && <img src={`${r.sku.image}&w=80`} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] text-amber-300 truncate">{r.sku.code}{r.label ? ` · ${r.label}` : ""}</div>
                          <div className="truncate">{r.sku.name || "—"}</div>
                          <div className="text-[10.5px] text-slate-300">
                            {r.sku.color ? `สี ${r.sku.color} · ` : ""}สต๊อก {r.sku.qty_on_hand != null ? r.sku.qty_on_hand.toLocaleString("th-TH") : "—"}{!r.sku.is_active ? " · ปิดใช้งาน" : ""}
                          </div>
                        </div>
                      </div>
                    ) : null} />
                ) : (
                  <ImageRegions<EditSpot> src={src} alt={titleOf(data)} className="w-full shadow-lg rounded-md" mode="edit" regions={spots} selectedId={selId}
                    onSelect={(sid) => setSelId(sid)}
                    onChange={(sid, rect) => patchSpot(sid, rect)}
                    onCreate={(rect) => {
                      const nid = `new-${++tempSeq}`;
                      setSpots((prev) => [...prev, { id: nid, ...rect, label: null, sort_order: prev.length, sku_id: null, sku: null }]);
                      setSelId(nid); setDirty(true); openPicker();
                    }}
                    regionLabel={(r) => r.sku?.code ?? r.label ?? "ยังไม่ผูก"}
                    isMuted={(r) => !r.sku_id} />
                )}
              </div>
            )}
          </div>

          {/* แผงตั้งค่า (เฉพาะโหมดตั้งค่า) */}
          {mode === "edit" && data && (
            <aside className="w-full lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white overflow-y-auto max-h-[45vh] lg:max-h-none">
              <div className="p-3 border-b border-slate-100 bg-indigo-50/50 text-[12px] text-indigo-900 leading-relaxed">
                <b>วิธีใช้:</b> ลากเมาส์บนรูปเพื่อวาดกรอบ → เลือก SKU · ลากกรอบเพื่อย้าย · ลากมุมเพื่อปรับขนาด · กด Delete เพื่อลบ<br />
                <span className="text-indigo-700/80">ตอนดูจริงจะไม่เห็นเส้นกรอบ เห็นแต่รูป</span>
              </div>

              {/* จุดที่เลือก */}
              <div className="p-3 border-b border-slate-100">
                <div className="text-[12px] font-medium text-slate-600 mb-1.5">จุดที่เลือก</div>
                {selected ? (
                  <div className="space-y-2">
                    <div ref={pickerRef}>
                      <SkuPicker key={selected.id}
                        value={selected.sku ? ({ id: selected.sku.id, code: selected.sku.code, name: selected.sku.name, image_url: selected.sku.image } as SkuPickerValue) : null}
                        placeholder="เลือก SKU ของชิ้นนี้"
                        onChange={(v) => patchSpot(selected.id, v
                          ? { sku_id: v.id, sku: { id: v.id, code: v.code, name: v.name, image: v.image_url ?? (v.image_key ? r2ImageUrl(v.image_key) : null), image_key: v.image_key ?? null, uom: v.uom_name ?? null, color: v.color ?? null, qty_on_hand: null, is_active: true } }
                          : { sku_id: null, sku: null })} />
                    </div>
                    {dupOf(selected) && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ SKU นี้ถูกผูกกับอีกจุดในแผ่นนี้แล้ว</p>}
                    <input value={selected.label ?? ""} onChange={(e) => patchSpot(selected.id, { label: e.target.value || null })} placeholder="ป้ายบนแผ่น (ไม่บังคับ) เช่น 2A"
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    <button onClick={() => removeSpot(selected.id)} className="h-8 px-2.5 text-[12px] rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">🗑 ลบจุดนี้</button>
                  </div>
                ) : <p className="text-[12px] text-slate-400">ยังไม่ได้เลือกจุด — ลากบนรูปเพื่อวาดกรอบใหม่ หรือกดกรอบที่มีอยู่</p>}
              </div>

              {/* รายการจุด */}
              <div className="p-3 border-b border-slate-100">
                <div className="text-[12px] font-medium text-slate-600 mb-1.5">จุดทั้งหมด ({spots.length})</div>
                {spots.length === 0 ? <p className="text-[12px] text-slate-400">ยังไม่มีจุด</p> : (
                  <ul className="space-y-1">
                    {spots.map((s, i) => (
                      <li key={s.id}>
                        <button onClick={() => { setSelId(s.id); if (!s.sku_id) openPicker(); }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left ${s.id === selId ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                          <span className="w-5 text-[11px] text-slate-400 tabular-nums shrink-0">{i + 1}</span>
                          {s.sku ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {s.sku.image ? <img src={`${s.sku.image}&w=60`} alt="" className="w-6 h-6 rounded object-cover shrink-0" /> : <span className="w-6 h-6 rounded bg-slate-100 shrink-0" />}
                              <span className="min-w-0 flex-1">
                                <span className="block font-mono text-[11px] text-slate-600 truncate">{s.sku.code}{s.label ? ` · ${s.label}` : ""}</span>
                                <span className="block text-[11px] text-slate-400 truncate">{s.sku.name}</span>
                              </span>
                            </>
                          ) : <span className="flex-1 text-[12px] text-amber-700">⚠ ยังไม่ผูก SKU{s.label ? ` · ${s.label}` : ""}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ข้อมูลแผ่น */}
              <div className="p-3 space-y-2">
                <div className="text-[12px] font-medium text-slate-600">ข้อมูลแผ่น</div>
                <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder={`Swatch #${data.seq} (ว่าง = ใช้ชื่ออัตโนมัติ)`}
                  className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <textarea value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} placeholder="โน้ต เช่น ร้าน / เล่มตัวอย่างเล่มไหน" rows={2}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <div className="flex items-center gap-2">
                  <TagGroupFilter value={tags} onChange={(v) => { setTags(v); setDirty(true); }} label="🏷️ แท็ก" showNone={false} />
                  <span className="text-[11px] text-slate-500">{tags.tagIds.length > 0 ? `${tags.tagIds.length} แท็ก` : "ยังไม่ติดแท็ก"}</span>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (spots.length > 0) { setPendingFile(f); setConfirm("replace"); } else void replaceImage(f); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={saving} className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">🖼 เปลี่ยนรูป</button>
                  <button onClick={() => setConfirm("delete")} disabled={saving} className="h-8 px-2.5 text-[12px] rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 ml-auto">🗑 ลบแผ่นนี้</button>
                </div>
              </div>
            </aside>
          )}
        </div>

        {/* แถบเลือกหลายรายการ (โหมดดู) — ลอยด้านล่าง */}
        {mode === "view" && selecting && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-[7] max-w-[94vw] flex items-center gap-2 px-3 h-12 rounded-full bg-slate-900 text-white shadow-2xl">
            <span className="text-sm whitespace-nowrap">เลือก <b className="tabular-nums">{checkedItems.length}</b> รายการ</span>
            <button onClick={() => setChecked(checked.size === viewSpots.length ? new Set() : new Set(viewSpots.map((s) => s.id)))}
              className="h-8 px-3 text-[12px] rounded-full bg-white/10 hover:bg-white/20 whitespace-nowrap">{checked.size === viewSpots.length ? "ไม่เลือกเลย" : "เลือกทั้งแผ่น"}</button>
            <button onClick={() => setPrItems(checkedItems)} disabled={checkedItems.length === 0 || !canPr}
              title={!canPr ? "คุณไม่มีสิทธิ์สร้างใบขอซื้อ" : checkedItems.length === 0 ? "กดที่ชิ้นบนรูปเพื่อเลือกก่อน" : undefined}
              className="h-8 px-4 text-[13px] font-medium rounded-full bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:hover:bg-blue-500 whitespace-nowrap">🛒 สร้างใบขอซื้อ</button>
            <button onClick={() => setBundleItems(checkedItems.map((i) => ({ sku_id: i.sku_id, code: i.code, name: i.name, image: i.image })))} disabled={checkedItems.length === 0 || !canEdit}
              title={!canEdit ? "คุณไม่มีสิทธิ์แก้ไขสินค้า" : checkedItems.length === 0 ? "กดที่ชิ้นบนรูปเพื่อเลือกก่อน" : "สร้าง Bundle ใหม่ หรือเพิ่มเข้า Bundle ที่มีอยู่"}
              className="h-8 px-4 text-[13px] font-medium rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 whitespace-nowrap">📦 เข้า Bundle</button>
            <button onClick={stopSelecting} className="h-8 px-3 text-[12px] rounded-full hover:bg-white/10 whitespace-nowrap">ยกเลิก</button>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirm === "leave" || confirm === "close"} onClose={() => setConfirm(null)} variant="danger"
        title="คุณมีข้อมูลที่ยังไม่ได้บันทึก" message="ต้องการออกโดยไม่บันทึกหรือไม่? กรอบและ SKU ที่เพิ่งตั้งจะหายไป" confirmText="ออกโดยไม่บันทึก" cancelText="อยู่ต่อ"
        onConfirm={() => { const c = confirm; setConfirm(null); if (c === "close") onClose(); else { if (data) resetEdit(data); setMode("view"); } }} />
      <ConfirmDialog open={confirm === "delete"} onClose={() => setConfirm(null)} onConfirm={() => void del()} loading={saving} variant="danger"
        title="ลบแผ่น swatch นี้?" message={`"${data ? titleOf(data) : ""}" และจุดทั้งหมดบนแผ่นจะถูกลบ — SKU ที่ผูกไว้ยังอยู่ตามเดิม ไม่ถูกลบ`} confirmText="ลบแผ่น" />
      <ConfirmDialog open={confirm === "replace"} onClose={() => { setConfirm(null); setPendingFile(null); }} variant="danger"
        title="เปลี่ยนรูปของแผ่นนี้?" message={`แผ่นนี้มี ${spots.length} จุดที่ตั้งตำแหน่งตามรูปเดิม ถ้ารูปใหม่จัดวางไม่เหมือนเดิม กรอบจะไม่ตรงชิ้น ต้องลากปรับใหม่`} confirmText="เปลี่ยนรูป"
        onConfirm={() => { setConfirm(null); if (pendingFile) void replaceImage(pendingFile); }} />
      {skuDrawer && <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" title="SKU" recordId={skuDrawer} onClose={() => setSkuDrawer(null)} onChanged={() => void load()} />}
      {prItems && prItems.length > 0 && data && (
        <PrCreateModal items={prItems} sourceNote={`จาก Swatch: ${titleOf(data)}`}
          onClose={() => setPrItems(null)} onCreated={() => stopSelecting()} />
      )}
      {bundleItems && bundleItems.length > 0 && (
        <BundleAddModal items={bundleItems} onClose={() => setBundleItems(null)} onDone={() => stopSelecting()} />
      )}
    </>,
    document.body,
  );
}
