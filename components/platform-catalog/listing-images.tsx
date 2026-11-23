"use client";
/**
 * รูปสินค้าบนร้าน (ลิ้นชักสินค้าบนร้าน) — ใช้ร่วม LINE + Lazada
 *
 *   <ListingImageGrid images={form.images} onChange={setImages} canEdit max={7} platformName="LINE" onOpen={setLightbox} onAdd={() => openPicker()} canAdd={!!matchedParent} />
 *   const sys = useSystemImages(matchedParentSkuId);         // คลังรูปของสินค้าในระบบ (โหลดเมื่อเรียก sys.load())
 *   <ListingImagePicker open mode="product" … onPick={(ref) => …} />
 *
 * รูปในฟอร์ม: ลิงก์ของร้าน หรือ "r2:<key>" = รูปจากคลังรูปในระบบ (systemImageRef) → API ของแต่ละร้านแปลง/ฝากรูปก่อนส่ง
 *   LINE: ลิงก์สาธารณะ /api/r2-image · Lazada: ฝากรูปกับ Lazada (/image/migrate) ได้ลิงก์ slatic.net
 * ลากเรียง = ของกลาง SortableList (useDragReorder · กดค้างที่รูป holdProps หรือหูจับ) · ตั้งปก = ย้ายไปแรก · ลบ (เหลือ ≥ 1)
 * 2026-11-20 (เจ้าของขอจากหน้าลง Shopee): ช่องรูปเล็กลง (เต็มแถวอัตโนมัติ ~88px) · ชี้เมาส์ = รูปใหญ่ (HoverPreview) · ปุ่มตั้งปก/ลบเป็นไอคอน (เดสก์ท็อปโผล่ตอนชี้)
 * ของกลางที่ใช้: ERPModal · LoadingState · Icon · SortableList · HoverPreview
 */
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { HoverPreview } from "@/components/hover-image";
import { r2ImageUrl } from "@/lib/r2-image";
import { systemImageKey, systemImageRef } from "@/lib/line-listing-edit";
import type { AssetRow } from "@/app/api/assets/shared";

// คลังรูปกลาง (มีแท็บอัปโหลดจากเครื่อง) — หนัก โหลดตอนกดเท่านั้น
const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

/** รูปในฟอร์ม → src ที่แสดงได้ ("r2:<key>" = ย่อจาก R2 · อื่น ๆ = ลิงก์ของร้าน) */
export const listingImgSrc = (ref: string | null | undefined, w = 400): string => {
  const k = systemImageKey(ref);
  return k ? r2ImageUrl(k, w) ?? "" : (ref ?? "");
};

export type SystemImage = { key: string; source: string };
/**
 * คลังรูปของสินค้าในระบบที่จับคู่ (/api/product-platforms?parent_sku_id=) — โหลดครั้งเดียวเมื่อเรียก load()
 * withSkuImages = โหลด "รูปทั้งหมดของแต่ละ SKU" มาด้วย (skuImages { รหัส SKU: [r2 key] } · รวมรูปตัวสีให้ตัวขายแล้ว)
 */
export function useSystemImages(parentSkuId: string | null, opts?: { withSkuImages?: boolean }): { images: SystemImage[] | null; skuImages: Record<string, string[]> | null; load: () => void } {
  const withSku = !!opts?.withSkuImages;
  const [state, setState] = useState<{ for: string | null; images: SystemImage[] | null; skuImages: Record<string, string[]> | null }>({ for: null, images: null, skuImages: null });
  const mine = state.for === parentSkuId;
  const load = useCallback(() => {
    if (!parentSkuId || (state.for === parentSkuId && state.images)) return;
    const pid = parentSkuId;
    apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(pid)}${withSku ? "&with=sku_images" : ""}`).then((r) => r.json())
      .then((j: { images?: SystemImage[]; sku_images?: Record<string, string[]> }) => setState({ for: pid, images: Array.isArray(j.images) ? j.images : [], skuImages: j.sku_images && typeof j.sku_images === "object" ? j.sku_images : null }))
      .catch(() => setState({ for: pid, images: [], skuImages: null }));
  }, [parentSkuId, state, withSku]);
  return { images: mine ? state.images : null, skuImages: mine ? state.skuImages : null, load };
}

/** ตารางรูปสินค้า — ลากเรียง · ตั้งปก · ลบ · ปุ่มเพิ่มจากรูปในระบบ */
export function ListingImageGrid({ images, onChange, canEdit, max, platformName, onOpen, onAdd, canAdd, dragGroup = "listing-images", note }: {
  images: string[];
  onChange: (next: string[]) => void;
  canEdit: boolean;
  /** จำนวนรูปสูงสุดที่ร้านรับ */
  max: number;
  platformName: string;
  onOpen: (index: number) => void;
  onAdd: () => void;
  /** เพิ่มจากรูปในระบบได้ไหม (ต้องจับคู่สินค้าในระบบก่อน) */
  canAdd: boolean;
  dragGroup?: string;
  /** ข้อความเพิ่มใต้ตาราง (กติการูปของร้าน) */
  note?: string;
}) {
  const drag = useDragReorder((from, to) => onChange(moveItem(images, from, to)), { group: dragGroup });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
        {images.map((ref, i) => {
          const isNew = !!systemImageKey(ref);
          return (
            <div key={`${ref}-${i}`} {...(canEdit ? drag.rowProps(i) : {})}
              className={`group relative aspect-square overflow-hidden rounded-lg border bg-slate-50 ${isNew ? "border-violet-300" : "border-slate-200"} ${canEdit ? drag.rowCls(i) : ""}`}>
              <HoverPreview url={listingImgSrc(ref, 800)} previewW={420}>
                <button type="button" onClick={() => onOpen(i)} {...(canEdit ? drag.holdProps(i) : {})} title={canEdit ? "ชี้ = ดูรูปใหญ่ · กดค้างแล้วลาก = เรียงลำดับ" : undefined} className="block aspect-square w-full"><img src={listingImgSrc(ref, 240)} alt="" loading="lazy" draggable={false} className="pointer-events-none h-full w-full object-cover" /></button>
              </HoverPreview>
              {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-violet-700">ปก</span>}
              {isNew && <span className="absolute right-1 top-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">ใหม่</span>}
              {canEdit && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-0.5 bg-white/90 px-0.5 py-0.5 text-xs transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียงลำดับ" />
                  {i !== 0 && <button type="button" onClick={() => onChange(moveItem(images, i, 0))} title="ตั้งเป็นปก" aria-label="ตั้งเป็นปก" className="rounded px-0.5 text-violet-700 hover:bg-violet-50"><Icon name="star" /></button>}
                  <button type="button" disabled={images.length <= 1} onClick={() => onChange(images.filter((_, k) => k !== i))} aria-label="เอารูปนี้ออก"
                    title={images.length <= 1 ? "ต้องเหลืออย่างน้อย 1 รูป" : "เอารูปนี้ออก"} className="ml-auto rounded px-0.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Icon name="delete" /></button>
                </div>
              )}
            </div>
          );
        })}
        {canEdit && images.length < max && (
          <button type="button" disabled={!canAdd} onClick={onAdd}
            title={canAdd ? "เลือกรูปจากคลังรูปของสินค้าในระบบ" : "จับคู่สินค้าในระบบก่อน ถึงจะเพิ่มรูปจากระบบได้"}
            className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 p-1 text-center text-[11px] leading-tight text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <Icon name="add" />เพิ่มรูป
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400">{platformName} รับ 1–{max} รูป · รูปแรก = ปก · ชี้ที่รูป = ดูรูปใหญ่ · กดค้างที่รูปแล้วลากเพื่อเรียง (หรือลากที่หูจับ) · รูปป้าย “ใหม่” = จากคลังรูปในระบบ (ส่งตอนกดบันทึก){note ? ` · ${note}` : ""}</p>
    </div>
  );
}

/**
 * เลือกรูป — mode "product" = เพิ่มรูปสินค้า (เลือกได้หลายรูป ป๊อปค้างไว้) · "variant" = รูปของตัวเลือก (รูปสินค้าบนร้าน + คลังรูปในระบบ · เลือกแล้วผู้เรียกปิดเอง)
 * ปุ่ม "อัปโหลดจากเครื่อง / คลังรูปทั้งหมด" (เจ้าของเลือก 2026-11-23 ข้อ 3) = คลังรูปกลาง AssetPicker (แท็บอัปโหลด) → รูปเข้าคลังด้วย ใช้ซ้ำร้านอื่นได้ → ได้ "r2:<key>" เหมือนรูปในระบบ
 *   ปิดได้ด้วย allowLibrary={false}
 */
export function ListingImagePicker({ open, onClose, mode, title, description, shopImages, shopLabel = "รูปสินค้าบนร้าน", showShop, matchedParent, matchedCode, sysImages, isUsed, full, onPick, storageKey = "listing-drawer-image-picker", allowLibrary = true }: {
  open: boolean;
  onClose: () => void;
  mode: "product" | "variant";
  title: string;
  description: string;
  /** รูปสินค้าบนร้าน (โชว์ใน mode variant หรือเมื่อ showShop) */
  shopImages?: string[];
  /** หัวข้อของชุด shopImages (ค่าเริ่ม "รูปสินค้าบนร้าน" · หน้าลงสินค้าใหม่ = "รูปที่จะส่ง") */
  shopLabel?: string;
  /** โชว์รูปสินค้าบนร้านใน mode product ด้วย (เลือกหลายรูป — เช่น รูปตัวเลือก Lazada) */
  showShop?: boolean;
  matchedParent: string | null;
  matchedCode?: string | null;
  sysImages: SystemImage[] | null;
  /** รูปนี้อยู่ในชุดแล้ว (mode product) */
  isUsed?: (ref: string) => boolean;
  /** ชุดเต็มแล้ว (mode product) */
  full?: boolean;
  onPick: (ref: string) => void;
  storageKey?: string;
  /** ปุ่มอัปโหลดจากเครื่อง / เลือกจากคลังรูปทั้งหมด (ค่าเริ่ม เปิด) */
  allowLibrary?: boolean;
}) {
  const [lib, setLib] = useState(false);
  const pickAssets = (assets: AssetRow[]) => {
    const refs = assets.map((a) => a.r2_key).filter((k): k is string => !!k).map(systemImageRef);
    (mode === "variant" ? refs.slice(0, 1) : refs).forEach((ref) => onPick(ref));
    setLib(false);
  };
  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey={storageKey} title={title} description={description}>
      {open && (
        <div className="space-y-3">
          {allowLibrary && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
              <button type="button" disabled={mode === "product" && !!full} onClick={() => setLib(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Icon name="upload" />อัปโหลดจากเครื่อง / คลังรูปทั้งหมด</button>
              <span className="text-[11px] text-slate-500">รูปที่อัปโหลดเข้าคลังรูปกลางด้วย — ใช้ซ้ำกับร้านอื่นได้</span>
            </div>
          )}
          {(mode === "variant" || showShop) && (shopImages?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 text-xs text-slate-500">{shopLabel}</div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {shopImages!.map((ref, i) => {
                  const used = mode === "product" && !!isUsed?.(ref);
                  return (
                    <button key={`p-${i}`} type="button" disabled={used || (mode === "product" && !!full)} onClick={() => onPick(ref)}
                      className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:ring-2 hover:ring-violet-300 disabled:opacity-40 disabled:hover:ring-0">
                      <img src={listingImgSrc(ref, 300)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {used && <span className="absolute inset-x-0 bottom-0 bg-white/90 text-center text-[10px] text-slate-600">เพิ่มแล้ว</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs text-slate-500">คลังรูปของสินค้าในระบบ{matchedCode ? ` (${matchedCode})` : ""}</div>
            {!matchedParent ? <p className="text-xs text-amber-700">ยังไม่จับคู่สินค้าในระบบ — จับคู่ก่อนถึงจะใช้รูปจากระบบได้</p>
              : sysImages == null ? <LoadingState label="กำลังโหลดรูปในระบบ…" />
              : sysImages.length === 0 ? <p className="text-xs text-slate-500">สินค้าในระบบยังไม่มีรูป</p>
              : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {sysImages.map((im) => {
                    const ref = systemImageRef(im.key);
                    const used = mode === "product" && !!isUsed?.(ref);
                    const disabled = used || (mode === "product" && !!full);
                    return (
                      <button key={im.key} type="button" disabled={disabled} onClick={() => onPick(ref)}
                        className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:ring-2 hover:ring-violet-300 disabled:opacity-40 disabled:hover:ring-0">
                        <img src={r2ImageUrl(im.key, 300) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {used && <span className="absolute inset-x-0 bottom-0 bg-white/90 text-center text-[10px] text-slate-600">เพิ่มแล้ว</span>}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      )}
      {lib && <AssetPicker open onClose={() => setLib(false)} onSelect={pickAssets} multiple={mode === "product"} typeFilter="image"
        title={title} contextLabel={matchedCode ?? undefined} defaultSearch={matchedCode ?? undefined} />}
    </ERPModal>
  );
}
