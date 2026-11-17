"use client";
/**
 * ป๊อป "ลากอัลบั้มมาวางบนอัลบั้ม — จะทำอะไร?" (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17 ข้อ 1-3)
 * 2 ทาง: รวมเป็นอัลบั้มเดียว (รูป + อัลบั้มย่อยของตัวที่ลากย้ายเข้าปลายทาง แล้วตัวที่ลากหายไป) / ใส่ไว้ข้างใน (เป็นอัลบั้มย่อย)
 * ทำงานจริง + ย้อนกลับ อยู่ที่หน้า (index.tsx mergeAlbums / moveAlbum) — ป๊อปนี้แค่ถาม
 */
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { AlbumCover } from "@/components/album-cover";
import type { SampleAlbum } from "@/lib/sample-images";

function Mini({ a, label }: { a: SampleAlbum; label: string }) {
  const t = useT();
  return (
    <div className="w-32 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <AlbumCover keys={a.preview_keys ?? []} total={a.deep?.photos} />
      <div className="p-1.5 text-center text-[11.5px]"><div className="truncate font-medium text-slate-800">{label}</div><div className="text-slate-500">{t(`${a.deep?.photos ?? 0} รูป`, `${a.deep?.photos ?? 0} photos`)}</div></div>
    </div>
  );
}

export function AlbumDropDialog({ src, dst, nameOf, onMerge, onNest, onClose }: {
  src: SampleAlbum | null;
  dst: SampleAlbum | null;
  nameOf: (a: SampleAlbum) => string;
  onMerge: () => void;
  onNest: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const open = !!src && !!dst;
  const s = src ? nameOf(src) : "", d = dst ? nameOf(dst) : "";
  const total = (src?.deep?.photos ?? 0) + (dst?.deep?.photos ?? 0);
  const op = "flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-500 hover:ring-2 hover:ring-violet-200";
  return (
    <ERPModal open={open} onClose={onClose} size="md" title={t(`ลาก "${s}" มาวางบน "${d}" — จะทำอะไร?`, `Dropped "${s}" on "${d}" — what now?`)}
      description={t("ทำแล้วกดย้อนกลับได้", "You can undo afterwards")}>
      {src && dst && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3"><Mini a={src} label={s} /><Icon value="i:transfer-out" /><Mini a={dst} label={d} /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={onMerge} className={op}>
              <span className="text-sm font-semibold text-slate-800">{t("รวมเป็นอัลบั้มเดียว", "Merge into one album")}</span>
              <span className="text-[12px] text-slate-500">{t(`รูปของ "${s}" ย้ายเข้า "${d}" (รวม ${total} รูป) แล้ว "${s}" หายไป`, `Photos of "${s}" move into "${d}" (${total} total), "${s}" is removed`)}</span>
            </button>
            <button type="button" onClick={onNest} className={op}>
              <span className="text-sm font-semibold text-slate-800">{t(`ใส่ไว้ข้างใน "${d}"`, `Put inside "${d}"`)}</span>
              <span className="text-[12px] text-slate-500">{t(`"${s}" ยังอยู่ครบ เป็นอัลบั้มย่อย (เช่น Version) ใน "${d}"`, `"${s}" stays whole as a sub-album of "${d}"`)}</span>
            </button>
          </div>
        </div>
      )}
    </ERPModal>
  );
}
