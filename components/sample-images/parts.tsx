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
import { safeColor } from "@/components/design-dashboard/dashboard-helpers";
import { withImageWidth } from "@/lib/r2-image";
import {
  SAMPLE_TAB_ALL, SAMPLE_TAB_NONE, albumCardLabel, brandPhotoTotals,
  type SampleAlbum, type SampleBrand, type SamplePhoto,
} from "@/lib/sample-images";

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

/** การ์ดอัลบั้ม ปกรวมรูป (ของกลาง AlbumCover แบบ C) — หน้าแฟ้ม (ชื่อ = วันที่/ชื่อจริง + แบรนด์) หรือ sub = อัลบั้มย่อย (ไอคอนแฟ้ม + ชื่อ)
 *  highlight = ไฮไลต์ตอนลากผ่าน · extra = props ลาก-วางจากหน้าเจ้าของ */
export function SampleAlbumCard({ album, brand, onOpen, sub, highlight, extra }: {
  album: SampleAlbum; brand?: SampleBrand | null; onOpen: () => void; sub?: boolean; highlight?: boolean; extra?: CardExtra;
}) {
  const t = useT();
  const a = album;
  if (sub) return (
    <button type="button" onClick={onOpen} {...extra}
      className={`overflow-hidden rounded-xl border bg-white text-left transition hover:shadow-md ${highlight ? "border-emerald-400 ring-2 ring-emerald-300" : "border-slate-200 hover:border-slate-300"}`}>
      <AlbumCover keys={a.preview_keys} total={a.deep.photos} />
      <div className="space-y-1 p-2.5">
        <div className="flex items-center gap-1 truncate text-[13px] font-medium text-slate-800"><Icon value="i:folder" />{a.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Icon value="i:photo" />{a.deep.photos}</span>
          {a.deep.sub_count > 0 && <span className="inline-flex items-center gap-1"><Icon value="i:folder" />{a.deep.sub_count}</span>}
          {a.deep.sent > 0 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-1.5 text-emerald-700">{t(`ส่งเข้าใบงาน ${a.deep.sent}`, `${a.deep.sent} in sheets`)}</span>}
        </div>
      </div>
    </button>
  );
  return (
    <button type="button" onClick={onOpen} {...extra}
      className={`overflow-hidden rounded-xl border bg-white text-left transition hover:shadow-md ${highlight ? "border-emerald-400 ring-2 ring-emerald-300" : "border-slate-200 hover:border-slate-300"}`}>
      <AlbumCover keys={a.preview_keys} total={a.deep.photos} />
      <div className="space-y-1.5 p-3">
        <div className="font-medium text-slate-800">{albumCardLabel(a)}</div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><BrandDot color={brand?.color} />{brand?.name ?? t("ไม่ระบุแบรนด์", "No brand")}</span>
          <span className="inline-flex items-center gap-1"><Icon value="i:photo" />{a.deep.photos}</span>
          {a.deep.sub_count > 0 && <span className="inline-flex items-center gap-1" title={t("อัลบั้มย่อย", "Sub-albums")}><Icon value="i:folder" />{a.deep.sub_count}</span>}
          {a.deep.sent > 0 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">{t(`ส่งเข้าใบงาน ${a.deep.sent}`, `${a.deep.sent} in sheets`)}</span>}
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
export function SamplePhotoTile({ photo, on, onToggle, faded, highlight, extra, children }: {
  photo: SamplePhoto; on: boolean; onToggle: () => void; faded?: boolean; highlight?: boolean;
  extra?: HTMLAttributes<HTMLDivElement>; children?: ReactNode;
}) {
  const t = useT();
  const p = photo;
  return (
    <div {...extra} className={`group relative overflow-hidden rounded-xl border bg-white ${highlight ? "border-emerald-400 ring-2 ring-emerald-300" : on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
      <button type="button" onClick={onToggle} className="block w-full cursor-pointer" aria-pressed={on} title={p.file_name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sampleImgUrl(p.r2_key, 480)} alt={p.file_name} loading="lazy" draggable={false} className={`aspect-square w-full bg-slate-50 object-contain ${faded ? "opacity-60" : ""}`} />
      </button>
      <a href={sampleImgUrl(p.r2_key)} target="_blank" rel="noopener noreferrer" title={t("ดูรูปเต็ม", "Open full image")} draggable={false}
        className="absolute left-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-violet-700 group-hover:inline-flex"><Icon value="i:external-link" /></a>
      {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
      {children}
      <div className="space-y-1 px-2 py-1.5">
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
