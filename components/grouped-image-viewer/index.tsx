"use client";

// ============================================================
// GroupedImageViewer (ของกลาง) — ป๊อป "ดูรูปอย่างเดียว" แบ่งเป็นกลุ่ม
//   กลุ่ม (เช่น Parent SKU / SKU / Description / คอนเทนต์) → เจ้าของรูป (เช่น SKU แต่ละสี) → รูป
//   ชิปด้านบนกรองกลุ่ม · ตัวที่ยังไม่มีรูปขึ้นเตือนสีเหลือง · กดรูป = เต็มจอ (ImageLightbox) พร้อมชิปกลุ่ม + แถบรูปเล็ก
//   ไม่มีปุ่มแก้/ลบ — ใช้ตอนตรวจงานหรือดูรูปทั้งชุดเร็ว ๆ
// ใช้ที่: ลิ้นชักงาน Task Manager (app/tasks/task-images-viewer.tsx)
// คู่มือ: docs/grouped-image-viewer.md
// ============================================================

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { tr } from "@/lib/lang";

export type ViewerImage = { url: string; thumbUrl?: string | null; label?: string | null; cover?: boolean };
export type ViewerOwner = {
  key: string;
  label: string;
  /** ป้ายเล็กต่อท้ายชื่อ เช่น ชื่อสี */
  hint?: string | null;
  images: ViewerImage[];
  /** ไม่มีรูปแล้วขึ้นเตือนไหม (ค่าเริ่ม true) */
  warnWhenEmpty?: boolean;
};
export type ViewerGroup = {
  key: string;
  label: string;
  /** ชื่อไอคอนกลาง (<Icon name>) */
  icon?: string;
  owners: ViewerOwner[];
  /** ไม่มีเจ้าของรูปเลย = ซ่อนทั้งกลุ่ม (เช่น งานที่ไม่มีคอนเทนต์) */
  hideWhenEmpty?: boolean;
  /** ข้อความเมื่อกลุ่มนี้ไม่มีรูป */
  emptyText?: string;
};

const countGroup = (g: ViewerGroup) => g.owners.reduce((n, o) => n + o.images.length, 0);

export function GroupedImageViewer({ open, onClose, title, description, groups, loading = false, error = null, onRetry, emptyTitle, emptyHint }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  groups: ViewerGroup[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [lbIndex, setLbIndex] = useState(-1);

  const visible = useMemo(() => groups.filter((g) => !(g.hideWhenEmpty && g.owners.length === 0)), [groups]);
  const total = useMemo(() => visible.reduce((n, g) => n + countGroup(g), 0), [visible]);
  const shown = filter === "all" ? visible : visible.filter((g) => g.key === filter);

  // รูปทั้งหมดที่กำลังดู (ตามชิปที่เลือก) เรียงเป็นแถวเดียว → ส่งให้จอเต็ม · จำตำแหน่งเริ่มของแต่ละรูปไว้กดเปิด
  const { flat, startOf } = useMemo(() => {
    const flat: LightboxImage[] = [];
    const startOf = new Map<string, number>();
    for (const g of shown) for (const o of g.owners) o.images.forEach((im, i) => {
      startOf.set(`${g.key}|${o.key}|${i}`, flat.length);
      flat.push({ url: im.url, thumbUrl: im.thumbUrl ?? null, group: g.key, label: `${o.label}${o.hint ? ` · ${o.hint}` : ""}${im.cover ? ` · ${tr("ปก", "cover")}` : ""}` });
    });
    return { flat, startOf };
  }, [shown]);
  const lbGroups = useMemo(() => shown.map((g) => ({ key: g.key, label: g.label })), [shown]);

  const chip = (key: string, label: string, n: number, icon?: string) => (
    <button key={key} type="button" onClick={() => setFilter(key)}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs border transition-colors ${filter === key ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {icon && <Icon name={icon} />}{label} <span className="text-slate-400">{n}</span>
    </button>
  );

  let body: React.ReactNode;
  if (loading) body = <LoadingState />;
  else if (error) body = <ErrorState title={tr("โหลดรูปไม่สำเร็จ", "Couldn't load images")} hint={error} onRetry={onRetry} />;
  else if (visible.length === 0 || (total === 0 && visible.every((g) => g.owners.every((o) => o.warnWhenEmpty === false)))) {
    body = <EmptyState icon={<Icon name="image" />} title={emptyTitle ?? tr("ยังไม่มีรูป", "No images yet")} hint={emptyHint} />;
  } else {
    body = (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {chip("all", tr("ทั้งหมด", "All"), total)}
          {visible.map((g) => chip(g.key, g.label, countGroup(g), g.icon))}
        </div>
        {shown.map((g) => {
          const n = countGroup(g);
          const showOwnerLabel = g.owners.length > 1 || g.owners.some((o) => o.images.length === 0);
          return (
            <section key={g.key}>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                {g.icon && <Icon name={g.icon} className="text-slate-400" />}{g.label}
                <span className="text-xs font-normal text-slate-400">· {n} {tr("รูป", "images")}</span>
              </h3>
              {g.owners.length === 0 && <p className="text-xs text-slate-400">{g.emptyText ?? tr("ไม่มีรูปในกลุ่มนี้", "No images in this group")}</p>}
              <div className="space-y-3">
                {g.owners.map((o) => (
                  <div key={o.key}>
                    {showOwnerLabel && (
                      <p className="text-xs text-slate-500 mb-1">{o.label}{o.hint ? <span className="text-slate-400"> · {o.hint}</span> : null} <span className="text-slate-400">· {o.images.length} {tr("รูป", "images")}</span></p>
                    )}
                    {o.images.length === 0 ? (
                      o.warnWhenEmpty === false
                        ? <p className="text-xs text-slate-400">{tr("ยังไม่มีรูป", "No images yet")}</p>
                        : <p className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"><Icon name="warning" />{o.label} {tr("ยังไม่มีรูป", "has no images yet")}</p>
                    ) : (
                      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(110px,1fr))]">
                        {o.images.map((im, i) => (
                          <button key={`${im.url}-${i}`} type="button" onClick={() => setLbIndex(startOf.get(`${g.key}|${o.key}|${i}`) ?? 0)}
                            title={tr("กดดูเต็มจอ", "View full screen")}
                            className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white hover:border-violet-400 hover:shadow-sm transition cursor-zoom-in">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={im.thumbUrl || im.url} alt={o.label} loading="lazy" draggable={false} className="h-full w-full object-contain" />
                            {im.cover && <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">{tr("ปก", "Cover")}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* กด Esc ตอนดูเต็มจอ = ปิดแค่จอเต็ม (ป๊อปยังอยู่) */}
      <ERPModal open={open} onClose={() => { if (lbIndex < 0) onClose(); }} title={title} description={description} size="xl" storageKey="grouped-image-viewer">
        {body}
      </ERPModal>
      <ImageLightbox images={flat} index={lbIndex} onClose={() => setLbIndex(-1)} onIndex={setLbIndex} groups={lbGroups} thumbnails />
    </>
  );
}
