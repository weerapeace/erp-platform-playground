"use client";

/**
 * หน้าดู / ตั้งค่าแผ่น Swatch (เต็มจอ)
 *   โหมดดู    — เห็นแต่รูป ไม่มีเส้นกรอบ · หลายรูป = แถบรูปย่อด้านบน · ชี้ที่ชิ้น = รหัสภายใน/สี/ชื่อ/เลขบนแผง (+ SKU ถ้าผูกแล้ว)
 *               · กด = เมนูเล็ก: เลือกชิ้นนี้ (onPickSpot) / ขอซื้อ / ดูรายละเอียด / เลือกหลายรายการ · ชิ้นที่ยังไม่ผูก = ผูก SKU / สร้าง SKU จากชิ้นนี้
 *   โหมดตั้งค่า — BoardEditor (รูป: เพิ่ม/ครอป/หมุน/เรียง/ปก/ลบ · ชิ้น: วาด/อ่านจากรูป/แบ่ง/แก้รหัส-สี-ชื่อ/ผูก SKU)
 * ⚠ หน้านี้ z-[140] — ตอนเปิด Drawer/ป๊อปของกลาง (z-50) ต้องถอยไป z-[45] (behind) ไม่งั้นบังป๊อป
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { ConfirmDialog } from "@/components/modal";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { ImageRegions } from "@/components/image-regions";
import { ZoomBox, ZoomControls } from "@/components/zoom-box";
import { PrCreateModal, type PrCreateItem } from "@/components/pr-create-modal";
import { BundleAddModal, type BundleAddItem } from "@/components/bundle-add-modal";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import type { SwatchDetail, SwatchSpot } from "@/app/api/sku-swatches/route";
import { BoardEditor, photoFromApi, previewCodes, useBoardDraft } from "./board-editor";
import { chipsToApi, uploadPendingPhotos, type DraftChip } from "./swatch-tools";
import type { SwatchSpotPick } from "./index";

const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
const SkuWizard = nextDynamic(() => import("@/app/master/skus/sku-wizard").then((m) => m.SkuWizard), { ssr: false });

const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };
export const swatchTitle = (s: { name: string | null; seq: number; code?: string | null }) => s.name?.trim() || s.code || `Swatch #${s.seq}`;

const spotToChip = (s: SwatchSpot, firstImage: string): DraftChip => ({
  id: s.id, photo: s.image_id || firstImage, x: s.x, y: s.y, w: s.w, h: s.h, code: s.code, name: s.name, label: s.label,
  color_hex: s.color_hex, source: s.source, sku_id: s.sku_id, sku: s.sku,
});

export function SwatchViewer({ id, startEdit, canEdit, focusSpotId, onClose, onChanged, onDeleted, onPickSkus, onPickSpot }: {
  onPickSpot?: (pick: SwatchSpotPick) => void;
  id: string; startEdit: boolean; canEdit: boolean; focusSpotId?: string | null; onClose: () => void; onChanged: () => void; onDeleted: () => void;
  onPickSkus?: (items: PrCreateItem[], sourceNote: string) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<SwatchDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">(startEdit && canEdit ? "edit" : "view");
  const [zoom, setZoom] = useState(1);
  const [photoId, setPhotoId] = useState<string | null>(null);   // รูปที่ดูอยู่ (โหมดดู)
  const [skuDrawer, setSkuDrawer] = useState<string | null>(null);
  // ── โหมดดู: ขอซื้อ / เลือกหลายรายการ ──
  const canPr = usePermission("pr.create");
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [prItems, setPrItems] = useState<PrCreateItem[] | null>(null);
  const [bundleItems, setBundleItems] = useState<BundleAddItem[] | null>(null);
  const stopSelecting = () => { setSelecting(false); setChecked(new Set()); };
  // ── โหมดตั้งค่า ──
  const draft = useBoardDraft();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<TagFilterValue>(EMPTY_FILTER);
  const [infoDirty, setInfoDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [confirm, setConfirm] = useState<null | "leave" | "close" | "delete">(null);
  const [editorOverlay, setEditorOverlay] = useState(false);
  const [wizardFor, setWizardFor] = useState<DraftChip | null>(null);
  const [pendingChip, setPendingChip] = useState<{ id: string; wizard: boolean } | null>(null);   // ผูก/สร้าง SKU จากเมนูโหมดดู
  const dirty = draft.dirty || infoDirty;

  const resetEdit = useCallback((d: SwatchDetail) => {
    const photos = d.images.map(photoFromApi);
    const first = photos[0]?.key ?? "";
    draft.reset(photos, d.spots.map((s) => spotToChip(s, first)));
    setName(d.name ?? ""); setNote(d.note ?? ""); setTags({ tagIds: d.family_tag_ids, none: false }); setInfoDirty(false);
  }, [draft.reset]);   // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/sku-swatches?id=${encodeURIComponent(id)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const d = j.swatch as SwatchDetail;
      setData(d); resetEdit(d);
      setPhotoId((cur) => {
        const focus = focusSpotId ? d.spots.find((s) => s.id === focusSpotId)?.image_id : null;
        return focus || (cur && d.images.some((i) => i.id === cur) ? cur : d.images[0]?.id ?? null);
      });
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id, resetEdit, focusSpotId]);
  useEffect(() => { void load(); }, [load]);

  // เมนูโหมดดู → "ผูก SKU" / "สร้าง SKU" = เข้าโหมดตั้งค่าแล้วเลือกชิ้นนั้น
  useEffect(() => {
    if (!pendingChip || mode !== "edit") return;
    const ch = draft.chips.find((c) => c.id === pendingChip.id);
    if (!ch) return;
    draft.setCur(ch.photo); draft.setSelId(ch.id);
    if (pendingChip.wizard) setWizardFor(ch);
    setPendingChip(null);
  }, [pendingChip, mode, draft]);

  const tryClose = () => { if (mode === "edit" && dirty) setConfirm("close"); else onClose(); };
  const tryLeaveEdit = () => { if (dirty) setConfirm("leave"); else setMode("view"); };

  // ปุ่มลัด: Esc ปิด/ออกจากโหมดตั้งค่า · Delete ลบชิ้นที่เลือก (ตอนไม่ได้พิมพ์อยู่)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (skuDrawer || confirm || prItems || bundleItems || editorOverlay || wizardFor) return;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName ?? "");
      if (e.key === "Escape" && !typing) { if (mode === "edit") tryLeaveEdit(); else if (selecting) stopSelecting(); else onClose(); }
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "edit" && draft.selId && !typing) { e.preventDefault(); draft.removeChip(draft.selId); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, draft.selId, dirty, skuDrawer, confirm, prItems, bundleItems, selecting, editorOverlay, wizardFor]);

  const save = async () => {
    if (!data || saving) return;
    if (!draft.photos.length) { toast.error("แผ่นต้องมีรูปอย่างน้อย 1 รูป"); return; }
    setSaving(true);
    try {
      const keys = await uploadPendingPhotos(draft.photos, { target: `แผ่น ${swatchTitle(data)}`, existingKeys: data.images.map((i) => i.image_key) }, setUp);
      if (!keys) return;
      const body = {
        id: data.id, name, note, family_tag_ids: tags.tagIds,
        images: draft.photos.map((p) => ({ id: p.id ?? undefined, image_key: keys.get(p.key) ?? p.image_key, image_w: p.w, image_h: p.h })),
        spots: chipsToApi(draft.chips, draft.photos),
      };
      const j = await apiFetch("/api/sku-swatches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const added = Number(j.spots?.added ?? 0);
      toast.success(added ? `บันทึกแล้ว — ออกรหัสให้ชิ้นใหม่ ${added} ชิ้น` : "บันทึกแล้ว");
      await load(); onChanged(); setMode("view");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
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

  const behind = !!confirm || !!skuDrawer || !!prItems || !!bundleItems || editorOverlay || !!wizardFor;
  const images = data?.images ?? [];
  const photo = images.find((i) => i.id === photoId) ?? images[0] ?? null;
  const viewSpots = useMemo(() => (data?.spots ?? []).filter((s) => (s.image_id || images[0]?.id) === photo?.id), [data, photo, images]);
  const linkedAll = useMemo(() => (data?.spots ?? []).filter((s) => !!s.sku), [data]);
  const toPrItems = (list: SwatchSpot[]): PrCreateItem[] => {
    const seen = new Set<string>(); const out: PrCreateItem[] = [];
    for (const s of list) {
      if (!s.sku || seen.has(s.sku.id)) continue;
      seen.add(s.sku.id);
      out.push({ sku_id: s.sku.id, code: s.sku.code, name: s.sku.name, image: s.sku.image, image_key: s.sku.image_key, uom: s.sku.uom });
    }
    return out;
  };
  const checkedItems = toPrItems(linkedAll.filter((s) => checked.has(s.id)));
  const requestItems = (items: PrCreateItem[]) => {
    if (!items.length) return;
    if (onPickSkus) { onPickSkus(items, `จากแผงผ้า: ${data ? swatchTitle(data) : ""}`.trim()); stopSelecting(); onClose(); return; }
    setPrItems(items);
  };
  const src = photo ? r2ImageUrl(photo.image_key, zoom > 1.5 ? 2400 : 1600) ?? "" : "";
  const codes = useMemo(() => previewCodes(draft.chips, draft.photos, data?.code ?? "SW", data?.next_chip_no ?? 1), [draft.chips, draft.photos, data]);
  const enterEdit = (chip?: { id: string; wizard: boolean }) => { if (!data) return; resetEdit(data); stopSelecting(); setMode("edit"); if (chip) setPendingChip(chip); };
  const chipTitle = (r: SwatchSpot) => [r.code, r.label ? `เลขบนแผง ${r.label}` : null].filter(Boolean).join(" · ");

  return createPortal(
    <>
      <div className={`fixed inset-0 flex flex-col bg-white ${behind ? "z-[45] pointer-events-none" : "z-[140]"}`}>
        {/* หัว */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-200 shrink-0">
          <span className="text-xl">🎨</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-slate-800 truncate">
              {data ? swatchTitle(mode === "edit" ? { name, seq: data.seq, code: data.code } : data) : "กำลังโหลด…"}
              {data?.code && (data.name?.trim() || mode === "edit") && <span className="ml-2 font-mono text-[12px] font-normal text-slate-400">{data.code}</span>}
            </div>
            {data && (
              <div className="text-[11px] text-slate-400 truncate">
                {mode === "edit" ? `โหมดตั้งค่า · ${draft.photos.length} รูป · ${draft.chips.length} ชิ้น · ผูก SKU แล้ว ${draft.chips.filter((c) => c.sku_id).length}`
                  : selecting ? "โหมดเลือกหลายรายการ · กดที่ชิ้นบนรูปเพื่อติ๊กเลือก (เฉพาะชิ้นที่ผูก SKU)"
                  : `${data.spots.length} ชิ้น · ผูก SKU แล้ว ${linkedAll.length} · กดที่ชิ้นบนรูปเพื่อดูเมนู`}
                {mode === "view" && data.tags.length > 0 && <> · {data.tags.map((t) => t.name).join(", ")}</>}
              </div>
            )}
          </div>
          {mode === "view" && <ZoomControls zoom={zoom} onZoom={setZoom} className="hidden sm:inline-flex" />}
          {mode === "view" && data && linkedAll.length > 0 && (
            <button onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className={`h-9 px-3 text-sm rounded-lg border ${selecting ? "border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {selecting ? "✕ เลิกเลือก" : "☑ เลือกหลายรายการ"}
            </button>
          )}
          {mode === "view" && canEdit && data && !selecting && (
            <button onClick={() => enterEdit()} className="h-9 px-3 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">✏️ ตั้งค่า</button>
          )}
          {mode === "edit" && (
            <>
              {up && <UploadProgress {...up} className="hidden md:flex w-56" />}
              <button onClick={tryLeaveEdit} disabled={saving} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => void save()} disabled={saving || !dirty} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
            </>
          )}
          <button onClick={tryClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500" title="ปิด (Esc)">✕</button>
        </div>

        {/* ข้อมูลแผ่น (โหมดตั้งค่า) */}
        {mode === "edit" && data && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
            <input value={name} onChange={(e) => { setName(e.target.value); setInfoDirty(true); }} placeholder={`ชื่อแผ่น (ว่าง = ${data.code ?? `Swatch #${data.seq}`})`}
              className="h-8 px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 w-56 max-w-full" />
            <input value={note} onChange={(e) => { setNote(e.target.value); setInfoDirty(true); }} placeholder="โน้ต เช่น ร้าน / เล่มตัวอย่างเล่มไหน"
              className="h-8 px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 flex-1 min-w-[160px]" />
            <TagGroupFilter value={tags} onChange={(v) => { setTags(v); setInfoDirty(true); }} label="🏷️ แท็ก" showNone={false} />
            <span className="text-[11px] text-slate-500">{tags.tagIds.length > 0 ? `${tags.tagIds.length} แท็ก` : "ยังไม่ติดแท็ก"}</span>
            <button onClick={() => setConfirm("delete")} disabled={saving} className="h-8 px-2.5 text-[12px] rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 ml-auto">🗑 ลบแผ่นนี้</button>
          </div>
        )}

        {/* เนื้อหา */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {mode === "edit" && data ? (
            <BoardEditor draft={draft} codes={codes} layout="full" onOverlay={setEditorOverlay} onCreateSku={(c) => setWizardFor(c)} />
          ) : (
            <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-slate-100 p-3 sm:p-5">
              {err ? (
                <div className="text-center py-16 text-sm text-rose-600">⚠ {err} <button onClick={() => void load()} className="underline ml-1">ลองใหม่</button></div>
              ) : !data ? (
                <div className="mx-auto max-w-4xl h-[60vh] rounded-xl bg-slate-200 animate-pulse" />
              ) : !src ? (
                <div className="text-center py-16 text-sm text-slate-400">แผ่นนี้ยังไม่มีรูป</div>
              ) : (
                <>
                  {images.length > 1 && (
                    <div className="mx-auto max-w-4xl flex gap-2 overflow-x-auto pb-2 mb-1">
                      {images.map((im, i) => (
                        <button key={im.id || i} type="button" onClick={() => { setPhotoId(im.id); setZoom(1); }}
                          className={`relative shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 bg-white ${im.id === photo?.id ? "border-indigo-500" : "border-transparent hover:border-slate-300"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r2ImageUrl(im.image_key, 240) ?? ""} alt="" className="w-full h-full object-cover" />
                          <span className="absolute right-1 bottom-1 text-[10px] px-1 rounded bg-slate-900/70 text-white tabular-nums">{data.spots.filter((s) => (s.image_id || images[0]?.id) === im.id).length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <ZoomBox zoom={zoom} onZoom={setZoom} aspect={photo?.image_w && photo?.image_h ? photo.image_w / photo.image_h : null} maxFitWidth={896} className="flex-1 min-h-0">
                    <ImageRegions<SwatchSpot> src={src} alt={swatchTitle(data)} className="w-full shadow-lg rounded-md overflow-visible" mode="view" regions={viewSpots}
                      regionLabel={(r) => r.sku?.code ?? r.code ?? null}
                      selecting={selecting} checkedIds={checked} pulseId={focusSpotId ?? null}
                      onToggleCheck={(r) => { if (!r.sku) { toast.warning("ชิ้นนี้ยังไม่ผูก SKU — เลือกขอซื้อ/เข้า Bundle ไม่ได้"); return; } setChecked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); }}
                      renderMenu={(r, close) => (
                        <div className="w-60 rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-left">
                          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <span className="w-7 h-7 rounded shrink-0 ring-1 ring-black/10" style={{ background: r.color_hex ?? "#e2e8f0" }} />
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] text-slate-500 truncate">{chipTitle(r) || "ชิ้นบนแผง"}</div>
                              <div className="text-[12.5px] text-slate-800 truncate" title={r.sku?.name ?? r.name ?? ""}>{r.sku ? `${r.sku.code} · ${r.sku.name}` : r.name || "ยังไม่ผูก SKU"}</div>
                            </div>
                          </div>
                          {onPickSpot && data && (
                            <button type="button" role="menuitem"
                              onClick={() => { close(); onPickSpot({ swatch_id: data.id, swatch_name: swatchTitle(data), image_key: r.image_key ?? photo?.image_key ?? data.image_key, image_w: photo?.image_w ?? data.image_w, image_h: photo?.image_h ?? data.image_h, spot_id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, label: r.label, code: r.code, name: r.name, color_hex: r.color_hex, sku: r.sku }); onClose(); }}
                              className="w-full px-3 py-2 flex items-center gap-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
                              <span>✓</span><span className="flex-1">เลือกชิ้นนี้</span>
                            </button>
                          )}
                          {r.sku ? (
                            <>
                              <button type="button" role="menuitem" disabled={!canPr} title={canPr ? "สร้างใบขอซื้อของชิ้นนี้" : "คุณไม่มีสิทธิ์สร้างใบขอซื้อ"}
                                onClick={() => { close(); requestItems(toPrItems([r])); }}
                                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-white">
                                <span>🛒</span><span className="flex-1">ขอซื้อ</span>{!canPr && <span className="text-[10px] text-slate-400">ไม่มีสิทธิ์</span>}
                              </button>
                              <button type="button" role="menuitem" onClick={() => { close(); setSkuDrawer(r.sku!.id); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50">
                                <span>🔍</span><span className="flex-1">ดูรายละเอียด SKU</span>
                              </button>
                              <button type="button" role="menuitem" onClick={() => { close(); setChecked(new Set([r.id])); setSelecting(true); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50 border-t border-slate-100">
                                <span>☑</span><span className="flex-1">เลือกหลายรายการ</span>
                              </button>
                            </>
                          ) : canEdit ? (
                            <>
                              <button type="button" role="menuitem" onClick={() => { close(); enterEdit({ id: r.id, wizard: false }); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50">
                                <span>🔗</span><span className="flex-1">ผูก SKU ที่มีอยู่</span>
                              </button>
                              <button type="button" role="menuitem" onClick={() => { close(); enterEdit({ id: r.id, wizard: true }); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-700 hover:bg-blue-50">
                                <span>➕</span><span className="flex-1">สร้าง SKU จากชิ้นนี้</span>
                              </button>
                            </>
                          ) : <p className="px-3 py-2 text-[12px] text-slate-400">ยังไม่ผูก SKU — ขอซื้อไม่ได้จนกว่าจะผูก</p>}
                        </div>
                      )}
                      renderTooltip={(r) => (
                        <div className="flex items-center gap-2">
                          {r.sku?.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={`${r.sku.image}&w=80`} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                            : <span className="w-8 h-8 rounded shrink-0 ring-1 ring-white/30" style={{ background: r.color_hex ?? "#64748b" }} />}
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] text-amber-300 truncate">{chipTitle(r) || r.sku?.code || "ชิ้นบนแผง"}</div>
                            <div className="truncate">{r.sku ? `${r.sku.code} · ${r.sku.name}` : r.name || "—"}</div>
                            <div className="text-[10.5px] text-slate-300">
                              {r.sku ? <>{r.sku.color ? `สี ${r.sku.color} · ` : ""}สต๊อก {r.sku.qty_on_hand != null ? r.sku.qty_on_hand.toLocaleString("th-TH") : "—"}{!r.sku.is_active ? " · ปิดใช้งาน" : ""}</> : "ยังไม่ผูก SKU"}
                            </div>
                          </div>
                        </div>
                      )} />
                  </ZoomBox>
                </>
              )}
            </div>
          )}
        </div>

        {/* แถบเลือกหลายรายการ (โหมดดู) — ลอยด้านล่าง */}
        {mode === "view" && selecting && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-[7] max-w-[94vw] flex items-center gap-2 px-3 h-12 rounded-full bg-slate-900 text-white shadow-2xl">
            <span className="text-sm whitespace-nowrap">เลือก <b className="tabular-nums">{checkedItems.length}</b> รายการ</span>
            <button onClick={() => setChecked(checked.size === linkedAll.length ? new Set() : new Set(linkedAll.map((s) => s.id)))}
              className="h-8 px-3 text-[12px] rounded-full bg-white/10 hover:bg-white/20 whitespace-nowrap">{checked.size === linkedAll.length ? "ไม่เลือกเลย" : "เลือกทั้งแผ่น"}</button>
            <button onClick={() => requestItems(checkedItems)} disabled={checkedItems.length === 0 || !canPr}
              title={!canPr ? "คุณไม่มีสิทธิ์สร้างใบขอซื้อ" : checkedItems.length === 0 ? "กดที่ชิ้นบนรูปเพื่อเลือกก่อน" : undefined}
              className="h-8 px-4 text-[13px] font-medium rounded-full bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:hover:bg-blue-500 whitespace-nowrap">{onPickSkus ? "🛒 ใส่ตะกร้าขอซื้อ" : "🛒 สร้างใบขอซื้อ"}</button>
            <button onClick={() => setBundleItems(checkedItems.map((i) => ({ sku_id: i.sku_id, code: i.code, name: i.name, image: i.image })))} disabled={checkedItems.length === 0 || !canEdit}
              title={!canEdit ? "คุณไม่มีสิทธิ์แก้ไขสินค้า" : checkedItems.length === 0 ? "กดที่ชิ้นบนรูปเพื่อเลือกก่อน" : "สร้าง Bundle ใหม่ หรือเพิ่มเข้า Bundle ที่มีอยู่"}
              className="h-8 px-4 text-[13px] font-medium rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 whitespace-nowrap">📦 เข้า Bundle</button>
            <button onClick={stopSelecting} className="h-8 px-3 text-[12px] rounded-full hover:bg-white/10 whitespace-nowrap">ยกเลิก</button>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirm === "leave" || confirm === "close"} onClose={() => setConfirm(null)} variant="danger"
        title="คุณมีข้อมูลที่ยังไม่ได้บันทึก" message="ต้องการออกโดยไม่บันทึกหรือไม่? รูป ชิ้น และ SKU ที่เพิ่งแก้จะหายไป" confirmText="ออกโดยไม่บันทึก" cancelText="อยู่ต่อ"
        onConfirm={() => { const c = confirm; setConfirm(null); if (c === "close") onClose(); else { if (data) resetEdit(data); setMode("view"); } }} />
      <ConfirmDialog open={confirm === "delete"} onClose={() => setConfirm(null)} onConfirm={() => void del()} loading={saving} variant="danger"
        title="ลบแผ่น swatch นี้?" message={`"${data ? swatchTitle(data) : ""}" พร้อมรูปและชิ้นทั้งหมดบนแผ่นจะถูกลบ — SKU ที่ผูกไว้ยังอยู่ตามเดิม ไม่ถูกลบ`} confirmText="ลบแผ่น" />
      {skuDrawer && <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" title="SKU" recordId={skuDrawer} onClose={() => setSkuDrawer(null)} onChanged={() => void load()} />}
      {prItems && prItems.length > 0 && data && (
        <PrCreateModal items={prItems} sourceNote={`จาก Swatch: ${swatchTitle(data)}`} onClose={() => setPrItems(null)} onCreated={() => stopSelecting()} />
      )}
      {bundleItems && bundleItems.length > 0 && (
        <BundleAddModal items={bundleItems} onClose={() => setBundleItems(null)} onDone={() => stopSelecting()} />
      )}
      {wizardFor && (
        <SkuWizard open onClose={() => setWizardFor(null)}
          prefill={{ name_th: wizardFor.name ?? "", color: wizardFor.name ?? "" }}
          onCreated={(res) => {
            const sku = res?.skus?.[0];
            const chip = wizardFor;
            setWizardFor(null);
            if (sku && chip) {
              draft.patchChip(chip.id, { sku_id: sku.id, sku: { id: sku.id, code: sku.code, name: chip.name ?? sku.code, image: null, image_key: null, uom: null, color: chip.name, qty_on_hand: null, is_active: true } });
              toast.success(`สร้าง ${sku.code} แล้ว — กด บันทึก เพื่อผูกกับชิ้น ${codes.get(chip.id) ?? ""}`);
            }
          }} />
      )}
    </>,
    document.body,
  );
}
