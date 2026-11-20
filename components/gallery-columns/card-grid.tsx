"use client";

/**
 * มุมมองการ์ดกลาง (ของกลาง · ต่อยอดจาก GalleryColumns — เจ้าของสั่ง 2026-11-20)
 *   ทุกหน้าที่โชว์การ์ดเป็นกริด ใช้ชุดนี้ชุดเดียว → แก้ที่เดียว ทุกหน้าเปลี่ยนตาม
 *
 *   const gallery = useGalleryColumns("sku-browser", 6);
 *   <CardViewBar gallery={gallery} count="12,199 รายการ" view={view} onView={setView}>
 *     …ปุ่มของหน้าเอง (เลือกทั้งหมด · ตัวกรอง · เรียง)…
 *   </CardViewBar>
 *   <CardGrid gallery={gallery} loading={loading} error={error} onRetry={load}
 *     isEmpty={rows.length === 0} empty={<EmptyState title="ไม่พบรายการ" />}>
 *     {rows.map((r) => <MyCard key={r.id} … />)}   // ชื่อ/ป้ายใต้การ์ดใส่ className={GALLERY_LABEL} = การ์ดเล็กมากซ่อนเอง
 *   </CardGrid>
 *
 * ได้ฟรี: Ctrl (⌘) + หมุนลูกกลิ้งบนกริด = ย่อ/ขยาย · ปุ่ม − / + · จำขนาดรายคนต่อหน้า · จอแคบลดจำนวนเอง (การ์ด ≥ 70px)
 *        · 12 ใบต่อแถวขึ้นไปซ่อนชื่อ · โหลด (โครงสีเทาขนาดเท่าการ์ดจริง) / ว่าง / โหลดพลาด + ลองใหม่
 * ห้ามใช้เมื่อ: ตารางแถว (ใช้ DataTable / MiniTable) · กระดานลากวางอิสระ (CanvasSketch) · การ์ดที่ต้องสูงไม่เท่ากันแบบ masonry
 */
import { useCallback, type HTMLAttributes, type ReactNode } from "react";
import { useT } from "@/components/i18n";
import { ErrorState, SkeletonBar } from "@/components/state-views";
import { LayoutSwitch, type MiniLayout } from "@/components/mini-table/layout-switch";
import { GalleryColumnsControl, type GalleryState } from "./index";

/** กริดการ์ด + สถานะ โหลด/ว่าง/พลาด — ผูก Ctrl+ลูกกลิ้ง + ขนาดการ์ดจาก gallery ให้เอง */
export function CardGrid({ gallery, loading = false, error, onRetry, isEmpty = false, empty, skeletonCount, className = "", children, ...rest }: {
  gallery: GalleryState;
  loading?: boolean;
  /** โหลดพลาด (true หรือข้อความ) → กล่อง "โหลดไม่สำเร็จ" + ปุ่มลองใหม่ (ห้ามโชว์เป็น "ว่าง" หลอก ๆ) */
  error?: boolean | string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  /** กล่องตอนไม่มีข้อมูล — ส่ง <EmptyState …/> (ของกลาง) */
  empty?: ReactNode;
  /** จำนวนการ์ดโครงสีเทาตอนโหลด (ค่าเริ่ม = 2 แถว) */
  skeletonCount?: number;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "style" | "children" | "className">) {
  const t = useT();
  const { wheelRef, gridStyle, compactAttr, cols } = gallery;
  const ref = useCallback((el: HTMLDivElement | null) => wheelRef(el), [wheelRef]);
  if (error) {
    return <ErrorState onRetry={onRetry} hint={typeof error === "string" ? error : undefined} />;
  }
  if (loading) {
    const n = skeletonCount ?? Math.max(4, Math.min(cols * 2, 24));
    return (
      <div ref={ref} style={gridStyle} {...compactAttr} className={className} aria-busy="true" aria-label={t("กำลังโหลด...", "Loading...")}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-slate-100">
            <SkeletonBar className="aspect-[5/4] w-full rounded-none" />
            <div className="p-2"><SkeletonBar className="h-3 w-3/4" /><SkeletonBar className="mt-1.5 h-3 w-1/3" /></div>
          </div>
        ))}
      </div>
    );
  }
  if (isEmpty) return <>{empty}</>;
  return (
    <div ref={ref} style={gridStyle} {...compactAttr} className={className} {...rest}>
      {children}
    </div>
  );
}

/** แถบเครื่องมือเหนือกริด: จำนวน · ปุ่มของหน้า (children) · สลับการ์ด/ตาราง · ขนาดการ์ด (− N +) */
export function CardViewBar({ gallery, count, view, onView, children, className = "" }: {
  gallery?: GalleryState;
  /** ข้อความซ้ายสุด เช่น "12,199 รายการ" */
  count?: ReactNode;
  /** ใส่คู่กับ onView = มีปุ่มสลับ การ์ด / ตาราง (จำค่าเองที่หน้า) */
  view?: MiniLayout;
  onView?: (v: MiniLayout) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex flex-wrap items-center gap-2 ${className}`}>
      {count != null && <p className="text-[12px] text-slate-400">{count}</p>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        {onView && <LayoutSwitch value={view ?? "cards"} onChange={onView} />}
        {gallery && view !== "table" && (
          <GalleryColumnsControl as="stepper" cols={gallery.cols} onChange={gallery.setCols} options={gallery.options} />
        )}
      </div>
    </div>
  );
}
