"use client";
// คลังไฟล์: "มาจากไฟล์ไหน + ชิ้นพี่น้อง" ในหน้ารายละเอียด — PNG ที่ตัวแยกชิ้น (components/vector-splitter) แตกออกมา
//   PNG ชิ้นหนึ่ง → โชว์ไฟล์ต้นฉบับ + ชิ้นอื่นจากไฟล์เดียวกัน · ไฟล์ต้นฉบับ → โชว์ทุกชิ้นที่แยกออกมา
// ผูกด้วย assets.source_asset_id · ไม่มีความเกี่ยวข้อง = ไม่แสดงอะไร
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { withImageWidth } from "@/lib/r2-image";
import type { AssetRow } from "@/app/api/assets/shared";
import { isImage, TYPE_ICON } from "./asset-shared";

export function SplitFamily({ asset, onOpen }: { asset: Pick<AssetRow, "id" | "source_asset_id">; onOpen?: (id: string) => void }) {
  const t = useT();
  const [source, setSource] = useState<AssetRow | null>(null);
  const [pieces, setPieces] = useState<AssetRow[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    const rootId = asset.source_asset_id ?? asset.id;
    (async () => {
      try {
        const [srcRes, kidsRes] = await Promise.all([
          asset.source_asset_id ? apiFetch(`/api/assets?id=${encodeURIComponent(asset.source_asset_id)}&source=all&status=active`).then((r) => r.json()) : Promise.resolve(null),
          apiFetch(`/api/assets?source_asset_id=${encodeURIComponent(rootId)}&source=all&status=active&limit=60`).then((r) => r.json()),
        ]);
        if (!alive) return;
        setSource(((srcRes?.data ?? [])[0] as AssetRow | undefined) ?? null);
        setPieces((kidsRes.data ?? []) as AssetRow[]);
        setTotal(Number(kidsRes.total ?? 0));
      } catch { /* ส่วนเสริม — โหลดไม่ได้ก็ไม่โชว์ */ }
    })();
    return () => { alive = false; };
  }, [asset.id, asset.source_asset_id]);

  if (!asset.source_asset_id && !pieces.length) return null;
  const Thumb = ({ a, current }: { a: AssetRow; current?: boolean }) => (
    <button type="button" onClick={() => onOpen?.(a.id)} disabled={!onOpen || current} title={a.title}
      className={`w-14 h-14 shrink-0 rounded-lg border overflow-hidden bg-white flex items-center justify-center ${current ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-400"}`}>
      {isImage(a)
        // eslint-disable-next-line @next/next/no-img-element -- รูปย่อจากคลัง
        ? <img src={withImageWidth(a.url, 120) ?? a.url} alt="" className="max-w-full max-h-full object-contain" loading="lazy" />
        : <span className="text-xl">{TYPE_ICON[a.asset_type] ?? "📄"}</span>}
    </button>
  );
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      {asset.source_asset_id && (
        <div className="mb-2">
          <p className="text-[12px] font-medium text-slate-600 mb-1">✂️ {t("แยกมาจากไฟล์", "Split from file")}</p>
          {source ? (
            <button type="button" onClick={() => onOpen?.(source.id)} disabled={!onOpen}
              className="w-full flex items-center gap-2 text-left rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50">
              <Thumb a={source} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{source.title}</span>
            </button>
          ) : <p className="text-[12px] text-slate-400">{t("ไฟล์ต้นฉบับถูกลบหรือย้ายลงถังขยะแล้ว", "The original was deleted or trashed")}</p>}
        </div>
      )}
      {pieces.length > 0 && (
        <>
          <p className="text-[12px] font-medium text-slate-600 mb-1">
            {asset.source_asset_id ? t("ชิ้นอื่นจากไฟล์เดียวกัน", "Other pieces from the same file") : t("ชิ้นที่แยกออกมา", "Pieces split from this file")} <span className="font-normal text-slate-400">{total}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pieces.map((p) => <Thumb key={p.id} a={p} current={p.id === asset.id} />)}
          </div>
          {total > pieces.length && <p className="text-[11px] text-slate-400 mt-1">{t("แสดง", "Showing")} {pieces.length}/{total}</p>}
        </>
      )}
    </div>
  );
}
