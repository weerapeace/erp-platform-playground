"use client";

/**
 * 📍 ตำแหน่งของ "ช่องใส่ของ" บนรูปสินค้า — ป๊อปจากตารางช่องใส่ของ (components/compartments-editor)
 *
 *   เลือกรูป (รูปปก + แกลเลอรีของ Parent SKU · แต่ละช่องใช้รูปต่างกันได้) → เลือกทรงเส้น → ลากกรอบบนรูป
 *   ค่า = CompartmentArea {img,x,y,w,h,shape} (% ของรูป) เก็บในช่องนั้นของ parent_skus_v2.compartments
 *   ป๊อป 📏 เทียบขนาดบนเว็บร้านวาดเส้นช่อง + ลูกศรขนาด (ซม. จากตาราง ไม่ได้วัดจากรูป) ตามกรอบนี้
 *   ของกลางที่ใช้: ERPModal · ImageAreaMarker · areaPath/AREA_SHAPES (lib/fit-check — ตัวเดียวกับเว็บร้าน)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { ImageAreaMarker, type MarkerArea } from "@/components/image-area-marker";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { AREA_SHAPES, areaPath, type AreaShape, type CompartmentArea } from "@/lib/fit-check";

export type AreaRow = { id: string; name: string; w: string; h: string; d: string; area?: CompartmentArea };

/** รูปของ Parent SKU (รูปปกก่อน แล้วแกลเลอรี) — โหลดครั้งเดียวต่อรุ่น */
const imgCache = new Map<string, Promise<string[]>>();
function loadParentImages(parentId: string, coverKey?: string | null): Promise<string[]> {
  const k = `${parentId}|${coverKey ?? ""}`;
  let p = imgCache.get(k);
  if (!p) {
    p = Promise.all([
      coverKey ? Promise.resolve(coverKey) : apiFetch(`/api/master-v2/parent-skus/${parentId}`).then((r) => r.json()).then((j) => (j?.data?.cover_image_r2_key as string | null) ?? null).catch(() => null),
      apiFetch(`/api/attachments?entity_type=parent_skus_v2&entity_id=${encodeURIComponent(parentId)}`)
        .then((r) => r.json())
        .then((j) => ((j?.data ?? []) as { file_path: string | null; content_type: string | null }[]).filter((a) => a.file_path && (!a.content_type || a.content_type.startsWith("image/"))).map((a) => a.file_path as string))
        .catch(() => [] as string[]),
    ]).then(([cover, gallery]) => [...new Set([...(cover ? [cover] : []), ...gallery])].slice(0, 24));
    p.catch(() => imgCache.delete(k));
    imgCache.set(k, p);
  }
  return p;
}

export function CompartmentAreaDialog({
  open,
  onClose,
  rows,
  index,
  parentId,
  coverKey,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** ทุกช่องของรุ่นนี้ (โชว์กรอบช่องอื่นบนรูปเดียวกันจาง ๆ) */
  rows: AreaRow[];
  index: number;
  parentId: string | null;
  coverKey?: string | null;
  onApply: (area: CompartmentArea | undefined) => void;
}) {
  const row = rows[index];
  const [images, setImages] = useState<string[] | null>(null);
  const [img, setImg] = useState<string>(row?.area?.img ?? coverKey ?? "");
  const [shape, setShape] = useState<AreaShape>(row?.area?.shape ?? "round");
  const [box, setBox] = useState<MarkerArea | null>(row?.area ? { x: row.area.x, y: row.area.y, w: row.area.w, h: row.area.h } : null);

  useEffect(() => {
    if (!open) return;
    setImg(row?.area?.img ?? coverKey ?? "");
    setShape(row?.area?.shape ?? "round");
    setBox(row?.area ? { x: row.area.x, y: row.area.y, w: row.area.w, h: row.area.h } : null);
    if (!parentId) {
      setImages(coverKey ? [coverKey] : []);
      return;
    }
    let alive = true;
    setImages(null);
    void loadParentImages(parentId, coverKey).then((list) => {
      if (!alive) return;
      setImages(list);
      setImg((cur) => cur || list[0] || "");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, parentId, coverKey]);

  if (!row) return null;
  const initial = JSON.stringify(row.area ?? null);
  const current: CompartmentArea | undefined = box && img ? { img, ...box, ...(shape !== "round" ? { shape } : {}) } : undefined;
  const dirty = JSON.stringify(current ?? null) !== initial;
  const sizeLabel = [row.w, row.h].every((v) => Number(v) > 0) ? `${row.w}×${row.h} ซม.` : "";
  // กรอบของช่องอื่นที่อยู่บนรูปเดียวกัน (ช่องที่ไม่ได้เลือกรูป = รูปปก)
  const others = rows.flatMap((r, i) =>
    i !== index && r.area && (r.area.img ?? coverKey ?? "") === img ? [{ id: r.id, label: r.name || `ช่องที่ ${i + 1}`, area: r.area, shape: r.area.shape }] : [],
  );

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      size="lg"
      defaultExpanded={false}
      hasUnsavedChanges={dirty}
      title={`ตำแหน่ง "${row.name || `ช่องที่ ${index + 1}`}" บนรูป`}
      description="ลากบนรูปเพื่อวาดกรอบ · ลากในกรอบเพื่อย้าย · ลากจุดมุมขวาล่างเพื่อปรับขนาด — ตัวเลข ซม. ใช้จากตาราง ไม่ได้วัดจากรูป"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setBox(null)}
            disabled={!box}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Icon name="delete" /> ลบกรอบ
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(current);
                onClose();
              }}
              className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600"
              data-area-apply
            >
              ตกลง
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3" data-compartment-area-dialog>
        <div>
          <p className="mb-1 text-[11px] text-slate-500">รูปที่ใช้ (แต่ละช่องเลือกรูปเองได้ · ช่องข้าง/ด้านหลังใช้รูปมุมอื่นได้)</p>
          {images === null ? (
            <p className="text-xs text-slate-400">กำลังโหลดรูป…</p>
          ) : !images.length ? (
            <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800">
              รุ่นนี้ยังไม่มีรูป{parentId ? "" : " (บันทึกสินค้าก่อน)"} — ใส่รูปปก/แกลเลอรีของ Parent SKU ก่อน แล้วค่อยวาดตำแหน่งช่อง
            </p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {images.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setImg(k)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 ${k === img ? "border-pink-500" : "border-transparent hover:border-slate-300"}`}
                  aria-pressed={k === img}
                  aria-label={k === coverKey ? "รูปปก" : "รูปแกลเลอรี"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r2ImageUrl(k, 120) ?? ""} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="ทรงของเส้นกรอบ">
          <span className="mr-1 text-[11px] text-slate-500">ทรงเส้น</span>
          {AREA_SHAPES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={shape === s.key}
              onClick={() => setShape(s.key)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs ${shape === s.key ? "border-pink-500 bg-pink-50 text-pink-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <svg viewBox="0 0 20 16" className="h-3.5 w-4" aria-hidden>
                <path d={areaPath(s.key, 1, 1, 18, 14)} fill="none" stroke="currentColor" strokeWidth={1.6} />
              </svg>
              {s.th}
            </button>
          ))}
        </div>

        {img ? (
          <div className="mx-auto max-w-md">
            <ImageAreaMarker src={r2ImageUrl(img, 1000) ?? ""} value={box} onChange={setBox} shape={shape} label={`${row.name || "ช่องนี้"}${sizeLabel ? ` · ${sizeLabel}` : ""}`} others={others} />
          </div>
        ) : null}
        {!box && img && <p className="text-center text-xs text-slate-400">ยังไม่มีกรอบ — ลากบนรูปตรงตำแหน่งของช่องนี้</p>}
      </div>
    </ERPModal>
  );
}
