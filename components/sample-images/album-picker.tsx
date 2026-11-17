"use client";
/**
 * SampleAlbumPickerModal — หน้าต่างเลือกอัลบั้ม SAMPLE แบบ "มีรูปปก" (ของกลางของหน้า SAMPLE Images · 2026-11-17)
 * ใช้ที่: ปุ่ม "ย้ายไปอัลบั้ม…" (รูป / อัลบั้ม) และ "ใส่อัลบั้มที่มีอยู่แล้ว…" ในหน้าจัดรูป
 * - การ์ด = ปก AlbumCover + ชื่อ (หรือเส้นทาง) + จำนวนรูป + สินค้าที่เชื่อม
 * - ช่องค้น (ชื่อ / รหัสสินค้า · albumMatches) · ไม่พิมพ์ = โชว์ initial (ไม่ส่ง = ทั้งหมด)
 * - extra = ปุ่มพิเศษเหนือกริด (เช่น "ชั้นบนสุด" / "อัลบั้มใหม่ในอัลบั้มนี้")
 * ไม่ทำ: ย้าย/บันทึกเอง — ส่งอัลบั้มที่เลือกกลับทาง onPick
 */
import { useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { AlbumCover } from "@/components/album-cover";
import { albumFullName, albumMatches, productLinkLabel, type SampleAlbum } from "@/lib/sample-images";

const MAX_SHOWN = 150;

export function SampleAlbumPickerModal({ open, onClose, title, description, albums, initial, labelOf, brandName, onPick, extra, busy }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** อัลบั้มที่เลือกได้ทั้งหมด (ใช้ตอนค้น) */
  albums: readonly SampleAlbum[];
  /** โชว์ตอนยังไม่พิมพ์ค้น (ไม่ส่ง = albums) */
  initial?: readonly SampleAlbum[];
  /** ชื่อบนการ์ด (เช่น เส้นทาง "Good Goods · 13 พ.ย. › Product 019") · ไม่ส่ง = ชื่ออัลบั้ม */
  labelOf?: (a: SampleAlbum) => string;
  brandName?: string | null;
  onPick: (a: SampleAlbum) => void;
  extra?: ReactNode;
  busy?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (!open) return [];
    const query = q.trim();
    return (query ? albums.filter((a) => albumMatches(a, query, brandName) || (labelOf ? labelOf(a).toLowerCase().includes(query.toLowerCase()) : false)) : initial ?? albums).slice(0, MAX_SHOWN);
  }, [open, q, albums, initial, brandName, labelOf]);
  const close = () => { setQ(""); onClose(); };

  return (
    <ERPModal open={open} onClose={close} size="xl" storageKey="sample-album-picker" title={title} description={description}>
      <div className="space-y-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t("ค้นชื่ออัลบั้ม / รหัสสินค้า…", "Search album / product code…")}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-violet-400 focus:outline-none" />
        {extra && <div className="flex flex-wrap gap-1.5">{extra}</div>}
        {list.length === 0
          ? <p className="py-8 text-center text-[13px] text-slate-400">{q.trim() ? t("ไม่พบอัลบั้มที่ตรงคำค้น", "No matching albums") : t("ยังไม่มีอัลบั้มให้เลือก — พิมพ์ค้นได้", "No albums — type to search")}</p>
          : (
            <div className="grid max-h-[62vh] grid-cols-2 gap-2.5 overflow-y-auto p-0.5 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((a) => {
                const link = productLinkLabel(a);
                return (
                  <button key={a.id} type="button" disabled={busy} onClick={() => { setQ(""); onPick(a); }}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-violet-400 hover:shadow-md disabled:opacity-60">
                    <AlbumCover keys={a.preview_keys ?? []} total={a.deep?.photos} />
                    <div className="space-y-0.5 p-2">
                      <div className="line-clamp-2 text-[12.5px] font-medium leading-snug text-slate-800">{labelOf ? labelOf(a) : albumFullName(a, brandName)}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span>{t(`${a.deep?.photos ?? 0} รูป`, `${a.deep?.photos ?? 0} photos`)}</span>
                        {link && <span className="max-w-full truncate rounded-full bg-violet-100 px-1.5 text-violet-800">{link}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        {list.length >= MAX_SHOWN && <p className="text-[12px] text-slate-400">{t(`โชว์ ${MAX_SHOWN} อัลบั้มแรก — พิมพ์ค้นเพื่อหาที่เหลือ`, `Showing first ${MAX_SHOWN} — type to search`)}</p>}
      </div>
    </ERPModal>
  );
}
