"use client";

// ============================================================
// 📸 ชิ้นส่วนหน้าตาของ SAMPLE Images ที่ใช้ร่วมกัน (เจ้าของสั่ง 2026-11-15 "view เหมือนเปิดใน SAMPLE IMAGE เลย")
//   ใช้ที่: หน้า /tasks/samples (./index.tsx) · แท็บ "SAMPLE Images" ในตัวเลือกไฟล์กลาง AssetPicker (./picker.tsx)
//   แก้หน้าตาแถบแบรนด์ / การ์ดอัลบั้ม / เส้นทาง / ช่องรูป ที่นี่ที่เดียว → ทั้งสองที่เปลี่ยนตาม
//   ชิ้นส่วนรับ props ลาก-วาง (extra) จากหน้าเจ้าของได้ — หน้า SAMPLE ใส่ลากย้าย · ตัวเลือกไฟล์ไม่ใส่ (ดู+เลือกอย่างเดียว)
// ชื่อ/ตัวเลข: lib/sample-images (albumCardLabel · albumFullName · brandPhotoTotals · เทสต์)
// ============================================================

import { useMemo, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { AlbumCover } from "@/components/album-cover";
import { Popover } from "@/components/popover";
import { safeColor } from "@/components/design-dashboard/dashboard-helpers";
import { withImageWidth } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import {
  SAMPLE_TAB_ALL, SAMPLE_TAB_NONE, albumCardLabel, brandPhotoTotals, isAlbumSort, isPhotoSort,
  type SampleAlbum, type SampleAlbumSort, type SampleBrand, type SamplePhoto, type SamplePhotoSort,
  productLinkLabel, isAutoAlbumName,
} from "@/lib/sample-images";

/** วิธีเรียงที่เลือกไว้ (จำรายคน · หน้า SAMPLE กับแท็บในตัวเลือกไฟล์ใช้ค่าเดียวกัน) — อัลบั้ม: ล่าสุดก่อน · รูป: ตามลำดับที่ลง */
export function useSampleSorts() {
  const [albumSort, setAlbumSort] = useUserPref<SampleAlbumSort>("sample_images_album_sort", "newest", (v) => (isAlbumSort(v) ? v : null));
  const [photoSort, setPhotoSort] = useUserPref<SamplePhotoSort>("sample_images_photo_sort", "oldest", (v) => (isPhotoSort(v) ? v : null));
  return { albumSort, setAlbumSort, photoSort, setPhotoSort };
}

/** แถวค้นหา + เรียง (เจ้าของสั่ง 2026-11-15) — ช่องค้น (มีปุ่มล้าง · Esc = ล้าง) + เลือกวิธีเรียง · children = ของต่อท้ายแถว */
export function SampleSearchSort<K extends string>({ query, onQuery, placeholder, sort, onSort, options, children }: {
  query: string; onQuery: (q: string) => void; placeholder: string;
  sort: K; onSort: (k: K) => void; options: { key: K; th: string; en: string }[]; children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] max-w-md flex-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon value="i:search" /></span>
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); onQuery(""); } }}
          placeholder={placeholder} aria-label={placeholder}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200 [&::-webkit-search-cancel-button]:hidden" />
        {query && (
          <button type="button" onClick={() => onQuery("")} aria-label={t("ล้างคำค้น", "Clear search")} title={t("ล้างคำค้น", "Clear search")}
            className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Icon value="i:x" /></button>
        )}
      </div>
      <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
        <Icon value="i:arrows-sort" />{t("เรียง", "Sort")}
        <select value={sort} onChange={(e) => onSort(e.target.value as K)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200">
          {options.map((o) => <option key={o.key} value={o.key}>{t(o.th, o.en)}</option>)}
        </select>
      </label>
      {children}
    </div>
  );
}

/** ลิงก์รูปจากคลัง (w = ย่อความกว้างให้โหลดเร็ว) */
export const sampleImgUrl = (key: string, w?: number) => {
  const u = `/api/r2-image?key=${encodeURIComponent(key)}`;
  return w ? withImageWidth(u, w) ?? u : u;
};

/** จุดสีแบรนด์ (ไม่มีสี = เทาอ่อน · สีผิดรูปแบบ = สีกลางของแบรนด์ ตาม safeColor) */
export function BrandDot({ color }: { color: string | null | undefined }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ? safeColor(color) : "#cbd5e1" }} />;
}

const pill = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${on ? "border-violet-300 bg-violet-50 font-medium text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;

/** แถบแบรนด์: ทุกแบรนด์ · แต่ละแบรนด์ (+จำนวนรูป) · ไม่ระบุแบรนด์ (มีอัลบั้มไม่ระบุแบรนด์ หรือกำลังเปิดแท็บนี้) */
export function SampleBrandBar({ brands, albums, tab, onTab }: { brands: SampleBrand[]; albums: SampleAlbum[]; tab: string; onTab: (tab: string) => void }) {
  const t = useT();
  const totals = useMemo(() => brandPhotoTotals(albums), [albums]);
  const hasNoBrand = albums.some((a) => !a.brand_id);
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      <button type="button" className={pill(tab === SAMPLE_TAB_ALL)} onClick={() => onTab(SAMPLE_TAB_ALL)}><Icon value="i:layout-grid" />{t("ทุกแบรนด์", "All brands")}</button>
      {brands.map((b) => (
        <button key={b.id} type="button" className={pill(tab === b.id)} onClick={() => onTab(b.id)}>
          <BrandDot color={b.color} />{b.name}{totals.get(b.id) ? <span className="text-[11px] tabular-nums text-slate-400">{totals.get(b.id)}</span> : null}
        </button>
      ))}
      {(hasNoBrand || tab === SAMPLE_TAB_NONE) && (
        <button type="button" className={pill(tab === SAMPLE_TAB_NONE)} onClick={() => onTab(SAMPLE_TAB_NONE)}>
          <Icon value="i:help-circle" />{t("ไม่ระบุแบรนด์", "No brand")}<span className="text-[11px] tabular-nums text-slate-400">{totals.get(SAMPLE_TAB_NONE) ?? 0}</span>
        </button>
      )}
    </div>
  );
}

type CardExtra = ButtonHTMLAttributes<HTMLButtonElement>;

/** ไอคอน "มีโน้ต" บนการ์ดอัลบั้ม — ชี้ค้าง = เห็นโน้ต (เจ้าของเลือก 2026-11-16) */
function NoteMark({ note }: { note: string }) {
  const t = useT();
  return <span className="inline-flex items-center gap-1 text-amber-700" title={note}><Icon value="i:notes" />{t("มีโน้ต", "Note")}</span>;
}

/** การ์ดอัลบั้ม ปกรวมรูป (ของกลาง AlbumCover แบบ C) — หน้าแฟ้ม (ชื่อ = วันที่/ชื่อจริง + แบรนด์) หรือ sub = อัลบั้มย่อย (ไอคอนแฟ้ม + ชื่อ)
 *  highlight = ไฮไลต์ตอนลากผ่าน · extra = props ลาก-วางจากหน้าเจ้าของ */
export function SampleAlbumCard({ album, brand, onOpen, sub, highlight, extra, inside, edge, selected, menu, dropLabel, order, bigOrder, onShift }: {
  album: SampleAlbum; brand?: SampleBrand | null; onOpen: () => void; sub?: boolean; highlight?: boolean; extra?: CardExtra;
  /** ถูกเลือกอยู่ (ลากกรอบเลือก) — กรอบม่วง + ติ๊ก */
  selected?: boolean;
  /** ลากสลับลำดับ: โชว์เส้นตำแหน่งที่จะวาง (ก่อน = ซ้าย · หลัง = ขวา) */
  edge?: "before" | "after" | null;
  /** ผลค้นหาที่เป็นอัลบั้มย่อย → บอกว่าอยู่ในอัลบั้มไหน (เช่น "Good Goods · 15 พ.ย. 2569") */
  inside?: string | null;
  /** เมนู ⋯ บนการ์ดอัลบั้มย่อย (เช่น "ย้ายออก 1 ชั้น") */
  menu?: { label: string; icon?: string; onClick: () => void }[];
  /** ลากไฟล์จากเครื่องมาค้างบนการ์ด → ป้ายทับ "วางเพื่อลงรูปใน …" */
  dropLabel?: string | null;
  /** เลขลำดับ #n บนปก (อัลบั้มย่อย) · ชื่อที่ระบบตั้งเอง (Product 012) ไม่โชว์ — โชว์สินค้าที่เชื่อมแทน */
  order?: number;
  /** โหมดจัดลำดับ: เลขใหญ่ + ปุ่ม ← → */
  bigOrder?: boolean;
  onShift?: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const a = album;
  const bar = edge ? <span aria-hidden className={`pointer-events-none absolute inset-y-1 z-10 w-1 rounded-full bg-violet-500 ${edge === "before" ? "-left-2" : "-right-2"}`} /> : null;
  const auto = order !== undefined && isAutoAlbumName(a.name);
  const link = productLinkLabel(a);
  if (sub) return (
    <button type="button" onClick={onOpen} {...extra}
      className={`relative overflow-visible rounded-xl border bg-white text-left transition hover:shadow-md ${highlight ? "border-emerald-400 ring-2 ring-emerald-300" : selected ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200 hover:border-slate-300"}`}>
      {bar}
      {selected && <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
      {dropLabel && <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-emerald-500/85 p-2 text-center text-[13px] font-semibold text-white">{dropLabel}</span>}
      <div className="relative overflow-hidden rounded-t-xl"><AlbumCover keys={a.preview_keys} total={a.deep.photos} />
        {order !== undefined && <span className={`absolute left-1.5 top-1.5 rounded-lg bg-violet-600 font-bold tabular-nums text-white shadow ${bigOrder ? "px-2.5 py-1 text-lg" : "px-1.5 text-[12px]"}`}>#{order}</span>}
        {onShift && (
          <span className="absolute bottom-1.5 right-1.5 flex gap-1" onClick={(e) => e.stopPropagation()}>
            {([-1, 1] as const).map((d) => (
              <span key={d} role="button" tabIndex={0} aria-label={d < 0 ? t("เลื่อนไปก่อน", "Move earlier") : t("เลื่อนไปหลัง", "Move later")}
                onClick={() => onShift(d)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onShift(d); } }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-base font-bold text-violet-700 shadow hover:bg-violet-50">{d < 0 ? "←" : "→"}</span>
            ))}
          </span>
        )}
      </div>
      <div className="space-y-1 p-2.5">
        <div className="flex items-center gap-1 text-[13px] font-medium text-slate-800">
          <Icon value="i:folder" /><span className={`min-w-0 flex-1 truncate ${auto && !link ? "font-normal text-slate-400" : ""}`}>{auto ? (link ?? t("ยังไม่เชื่อมสินค้า", "No product linked")) : a.name}</span>
          {!!menu?.length && (
            // ปุ่ม ⋯ อยู่ในการ์ด (ที่เป็นปุ่ม) → หยุดคลิกไม่ให้เปิดอัลบั้ม · แผงอยู่ใน portal แต่คลิกยังไหลถึงการ์ด จึงหยุดที่แผงด้วย
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="shrink-0">
              <Popover align="right" panelClassName="w-60 py-1"
                trigger={(toggle) => <span role="button" tabIndex={0} aria-label={t("เมนูอัลบั้ม", "Album menu")} onClick={toggle}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:dots-vertical" /></span>}>
                {(close) => <div onClick={(e) => e.stopPropagation()}>
                  {menu.map((m) => <button key={m.label} type="button" onClick={() => { close(); m.onClick(); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-violet-50">{m.icon && <Icon value={m.icon} />}{m.label}</button>)}
                </div>}
              </Popover>
            </span>
          )}
        </div>
        <div className="gallery-label flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Icon value="i:photo" />{a.deep.photos}</span>
          {a.deep.sub_count > 0 && <span className="inline-flex items-center gap-1"><Icon value="i:folder" />{a.deep.sub_count}</span>}
          {a.note && <NoteMark note={a.note} />}
          {a.deep.sent > 0 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-1.5 text-emerald-700">{t(`ส่งเข้าใบงาน ${a.deep.sent}`, `${a.deep.sent} in sheets`)}</span>}
          {link && !auto && <span className="inline-flex h-5 max-w-full items-center gap-0.5 truncate rounded-full bg-violet-100 px-1.5 text-violet-800"><Icon value="i:link" />{link}</span>}
        </div>
      </div>
    </button>
  );
  return (
    <button type="button" onClick={onOpen} {...extra}
      className={`relative overflow-hidden rounded-xl border bg-white text-left transition hover:shadow-md ${highlight || dropLabel ? "border-emerald-400 ring-2 ring-emerald-300" : "border-slate-200 hover:border-slate-300"}`}>
      {dropLabel && <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-emerald-500/85 p-2 text-center text-[13px] font-semibold text-white">{dropLabel}</span>}
      <AlbumCover keys={a.preview_keys} total={a.deep.photos} />
      <div className="space-y-1.5 p-3">
        <div className="font-medium text-slate-800">{albumCardLabel(a)}</div>
        {inside && <div className="gallery-label flex items-center gap-1 truncate text-[11px] text-slate-400"><Icon value="i:folder" /><span className="truncate">{t(`อยู่ใน ${inside}`, `In ${inside}`)}</span></div>}
        <div className="gallery-label flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><BrandDot color={brand?.color} />{brand?.name ?? t("ไม่ระบุแบรนด์", "No brand")}</span>
          <span className="inline-flex items-center gap-1"><Icon value="i:photo" />{a.deep.photos}</span>
          {a.deep.sub_count > 0 && <span className="inline-flex items-center gap-1" title={t("อัลบั้มย่อย", "Sub-albums")}><Icon value="i:folder" />{a.deep.sub_count}</span>}
          {a.note && <NoteMark note={a.note} />}
          {a.deep.sent > 0 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">{t(`ส่งเข้าใบงาน ${a.deep.sent}`, `${a.deep.sent} in sheets`)}</span>}
          {productLinkLabel(a) && <span className="inline-flex h-5 max-w-full items-center gap-0.5 truncate rounded-full bg-violet-100 px-2 text-[11px] text-violet-800"><Icon value="i:link" />{productLinkLabel(a)}</span>}
        </div>
      </div>
    </button>
  );
}

/** เส้นทาง: ← อัลบั้มทั้งหมด · อัลบั้มชั้นบน › อัลบั้มย่อย (กดชื่อ = เปิดอัลบั้มนั้น)
 *  ใส่ในแถวของหน้าเจ้าของ (คืนเป็นชิ้น ๆ ไม่ห่อกล่อง) · crumbExtra = props ลาก-วางบนชื่อ · overKey "al:<id>" = ไฮไลต์ */
export function SampleAlbumPath({ path, brandColor, nameOf, onBack, onOpen, crumbExtra, overKey }: {
  path: SampleAlbum[]; brandColor?: string | null; nameOf: (a: SampleAlbum) => string;
  onBack: () => void; onOpen: (id: string) => void; crumbExtra?: (a: SampleAlbum) => CardExtra; overKey?: string | null;
}) {
  const t = useT();
  return (
    <>
      <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:arrow-left" />{t("อัลบั้มทั้งหมด", "All albums")}</button>
      {path.map((a, i) => {
        const last = i === path.length - 1;
        return (
          <span key={a.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300">›</span>}
            <button type="button" {...(last ? {} : crumbExtra?.(a) ?? {})} onClick={() => { if (!last) onOpen(a.id); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[14px] ${last ? "cursor-default font-semibold text-slate-800" : "text-slate-600 hover:bg-slate-100"} ${overKey === `al:${a.id}` ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}>
              {i === 0 ? <BrandDot color={brandColor} /> : <Icon value="i:folder" />}{nameOf(a)}
            </button>
          </span>
        );
      })}
    </>
  );
}

/** ช่องรูป 1 รูป: กด = เลือก/เลิกเลือก · ชี้แล้วมีปุ่มดูรูปเต็ม · ป้าย → DS-xxxx = อยู่ในใบงานแล้ว
 *  faded = รูปในถังขยะ · highlight = ลากผ่าน · extra = props ลาก-วาง · children = ป้ายลอยเพิ่ม (เช่น "ปล่อย = รวมเป็นอัลบั้มใหม่") */
export function SamplePhotoTile({ photo, on, onToggle, faded, highlight, extra, children, thumbW = 480 }: {
  photo: SamplePhoto; on: boolean; onToggle: () => void; faded?: boolean; highlight?: boolean; thumbW?: number;
  extra?: HTMLAttributes<HTMLDivElement>; children?: ReactNode;
}) {
  const t = useT();
  const p = photo;
  return (
    <div {...extra} className={`group relative overflow-hidden rounded-xl border bg-white ${highlight ? "border-emerald-400 ring-2 ring-emerald-300" : on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
      <button type="button" onClick={onToggle} className="block w-full cursor-pointer" aria-pressed={on} title={p.file_name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sampleImgUrl(p.r2_key, thumbW)} alt={p.file_name} loading="lazy" draggable={false} className={`aspect-square w-full bg-slate-50 object-contain ${faded ? "opacity-60" : ""}`} />
      </button>
      <a href={sampleImgUrl(p.r2_key)} target="_blank" rel="noopener noreferrer" title={t("ดูรูปเต็ม", "Open full image")} draggable={false}
        className="absolute left-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-violet-700 group-hover:inline-flex"><Icon value="i:external-link" /></a>
      {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
      {children}
      <div className="gallery-label space-y-1 px-2 py-1.5">
        <div className="truncate text-[11px] text-slate-500">{p.file_name}</div>
        {p.moved_to.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.moved_to.map((s) => (
              <a key={s.id} href={`/master/design-dashboard?open=${encodeURIComponent(s.id)}`} target="_blank" rel="noopener noreferrer" draggable={false} title={t(`อยู่ในใบงาน ${s.code} · ${s.name} — กดเปิด`, `In ${s.code} — open`)}
                className="max-w-full truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] text-emerald-700 hover:bg-emerald-100">→ {s.code}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
