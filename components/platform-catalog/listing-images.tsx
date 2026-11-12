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
 * ของกลางที่ใช้: ERPModal · LoadingState · Icon · SortableList
 */
import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { r2ImageUrl } from "@/lib/r2-image";
import { systemImageKey, systemImageRef } from "@/lib/line-listing-edit";

/** รูปในฟอร์ม → src ที่แสดงได้ ("r2:<key>" = ย่อจาก R2 · อื่น ๆ = ลิงก์ของร้าน) */
export const listingImgSrc = (ref: string | null | undefined, w = 400): string => {
  const k = systemImageKey(ref);
  return k ? r2ImageUrl(k, w) ?? "" : (ref ?? "");
};

export type SystemImage = { key: string; source: string };
/** คลังรูปของสินค้าในระบบที่จับคู่ (/api/product-platforms?parent_sku_id=) — โหลดครั้งเดียวเมื่อเรียก load() */
export function useSystemImages(parentSkuId: string | null): { images: SystemImage[] | null; load: () => void } {
  const [state, setState] = useState<{ for: string | null; images: SystemImage[] | null }>({ for: null, images: null });
  const images = state.for === parentSkuId ? state.images : null;
  const load = useCallback(() => {
    if (!parentSkuId || (state.for === parentSkuId && state.images)) return;
    const pid = parentSkuId;
    apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(pid)}`).then((r) => r.json())
      .then((j: { images?: SystemImage[] }) => setState({ for: pid, images: Array.isArray(j.images) ? j.images : [] }))
      .catch(() => setState({ for: pid, images: [] }));
  }, [parentSkuId, state]);
  return { images, load };
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
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((ref, i) => {
          const isNew = !!systemImageKey(ref);
          return (
            <div key={`${ref}-${i}`} {...(canEdit ? drag.rowProps(i) : {})}
              className={`relative aspect-square overflow-hidden rounded-lg border bg-slate-50 ${isNew ? "border-violet-300" : "border-slate-200"} ${canEdit ? drag.rowCls(i) : ""}`}>
              <button type="button" onClick={() => onOpen(i)} {...(canEdit ? drag.holdProps(i) : {})} title={canEdit ? "แตะ = ดูรูปใหญ่ · กดค้างแล้วลาก = เรียงลำดับ" : undefined} className="h-full w-full"><img src={listingImgSrc(ref)} alt="" loading="lazy" draggable={false} className="pointer-events-none h-full w-full object-cover" /></button>
              {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-violet-700">ปก</span>}
              {isNew && <span className="absolute right-1 top-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">ใหม่</span>}
              {canEdit && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-white/90 px-1 py-0.5 text-[10px]">
                  <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียงลำดับ" />
                  {i !== 0 && <button type="button" onClick={() => onChange(moveItem(images, i, 0))} className="text-violet-700 hover:underline">ตั้งเป็นปก</button>}
                  <button type="button" disabled={images.length <= 1} onClick={() => onChange(images.filter((_, k) => k !== i))}
                    title={images.length <= 1 ? "ต้องเหลืออย่างน้อย 1 รูป" : "เอารูปนี้ออก"} className="ml-auto text-rose-600 hover:underline disabled:opacity-30">ลบ</button>
                </div>
              )}
            </div>
          );
        })}
        {canEdit && images.length < max && (
          <button type="button" disabled={!canAdd} onClick={onAdd}
            title={canAdd ? "เลือกรูปจากคลังรูปของสินค้าในระบบ" : "จับคู่สินค้าในระบบก่อน ถึงจะเพิ่มรูปจากระบบได้"}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <Icon name="add" />เพิ่มจากรูปในระบบ
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400">{platformName} รับ 1–{max} รูป · รูปแรก = ปก · กดค้างที่รูปแล้วลากเพื่อเรียง (หรือลากที่หูจับ) · รูปป้าย “ใหม่” = จากคลังรูปในระบบ (ส่งตอนกดบันทึก){note ? ` · ${note}` : ""}</p>
    </div>
  );
}

/**
 * เลือกรูป — mode "product" = เพิ่มรูปสินค้า (เลือกได้หลายรูป ป๊อปค้างไว้) · "variant" = รูปของตัวเลือก (รูปสินค้าบนร้าน + คลังรูปในระบบ · เลือกแล้วผู้เรียกปิดเอง)
 */
export function ListingImagePicker({ open, onClose, mode, title, description, shopImages, showShop, matchedParent, matchedCode, sysImages, isUsed, full, onPick, storageKey = "listing-drawer-image-picker" }: {
  open: boolean;
  onClose: () => void;
  mode: "product" | "variant";
  title: string;
  description: string;
  /** รูปสินค้าบนร้าน (โชว์ใน mode variant หรือเมื่อ showShop) */
  shopImages?: string[];
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
}) {
  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey={storageKey} title={title} description={description}>
      {open && (
        <div className="space-y-3">
          {(mode === "variant" || showShop) && (shopImages?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 text-xs text-slate-500">รูปสินค้าบนร้าน</div>
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
    </ERPModal>
  );
}
