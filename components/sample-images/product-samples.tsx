"use client";
/**
 * ส่วน "รูป SAMPLE" ในหน้า Parent SKU / SKU ลูก (เจ้าของเลือกจาก widget 2026-11-17: โชว์แบบ A แยกจากรูปขาย + ข้อ 4, 5)
 * - รวมรูปจากทุกอัลบั้ม SAMPLE ที่เชื่อมกับสินค้านี้ (1 สินค้าเชื่อมได้หลายอัลบั้ม) · กดรูป = ดูใหญ่ · กดชื่ออัลบั้ม = เปิดหน้า SAMPLE ที่อัลบั้มนั้น
 * - ปุ่ม "เชื่อมอัลบั้ม SAMPLE" (เชื่อมจากฝั่งสินค้าได้ด้วย) → เลือกอัลบั้ม → POST /api/sample-images {action:"link"}
 * ไม่แตะแกลเลอรี/รูปปกของสินค้า · ข้อมูล GET /api/sample-images?product=parent:<id>|sku:<id>
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { usePushToast } from "@/components/toast";
import { ImageThumbnail } from "@/components/image-manager/thumbnail";   // รูปย่อแบบเบา (ไม่ดึงตัวจัดการรูปทั้งก้อน)
import { askConfirm } from "@/components/modal/ask-dialog";
import { EmptyState, LoadingState } from "@/components/state-views";
import { albumMatches, sortAlbums, type SampleAlbum } from "@/lib/sample-images";
import { SampleAlbumCard, sampleImgUrl } from "./parts";
import { linkAlbumProduct, loadProductSamples, loadSamples, type ProductSamples } from "./api";

export function ProductSampleImages({ kind, recordId }: { kind: "parent" | "sku"; recordId: string | null }) {
  const t = useT();
  const { can, permsReady } = useAuth();
  const pushToast = usePushToast();
  const canView = can("assets.view"), canEdit = can("assets.edit");
  const [data, setData] = useState<ProductSamples | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    if (!recordId) return;
    setErr(null);
    try { setData(await loadProductSamples(kind, recordId)); } catch (e) { setErr((e as Error).message); }
  }, [kind, recordId]);
  useEffect(() => { if (permsReady && canView) void load(); }, [permsReady, canView, load]);

  if (!recordId || (permsReady && !canView)) return null;
  const albums = data?.albums ?? [];
  const total = albums.reduce((n, a) => n + a.total, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"><Icon value="i:camera" /> {t(`รูป SAMPLE${total ? ` (${total})` : ""}`, `SAMPLE photos${total ? ` (${total})` : ""}`)}</span>
        <span className="text-[11px] text-slate-400">{t("แยกจากรูปขาย", "separate from product photos")}</span>
        <span className="flex-1" />
        {canEdit && data?.parent_code && (
          <button type="button" onClick={() => setPicking(true)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:link" />{t("เชื่อมอัลบั้ม SAMPLE", "Link SAMPLE album")}</button>
        )}
      </div>
      {err ? <p className="text-[12px] text-rose-600">{err} <button type="button" onClick={() => void load()} className="underline">{t("ลองใหม่", "Retry")}</button></p>
        : !data ? <LoadingState className="py-4 text-sm" />
        : !albums.length ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-[12px] text-slate-500">{t("ยังไม่มีอัลบั้ม SAMPLE ที่เชื่อมกับสินค้านี้", "No SAMPLE album linked yet")}</p>
        : albums.map((a) => (
          <div key={a.id} className="rounded-lg border border-slate-200 p-2">
            <a href={`/tasks/samples?album=${encodeURIComponent(a.id)}`} target="_blank" rel="noopener noreferrer" className="mb-1.5 inline-flex max-w-full items-center gap-1 truncate text-[12px] text-violet-700 hover:underline">
              <Icon value="i:folder" />{a.parent_name ? `${a.parent_name} › ` : ""}{a.name} · {a.total} {t("รูป", "photos")}{a.sku_codes.length ? ` · ${a.sku_codes.join(", ")}` : ""}<Icon value="i:external-link" />
            </a>
            {a.photos.length ? (
              <div className="flex flex-wrap gap-1.5">
                {a.photos.map((p) => <ImageThumbnail key={p.id} url={sampleImgUrl(p.key, 1600)} size={64} enlargeable />)}
                {a.total > a.photos.length && <span className="self-center px-1 text-[12px] text-slate-400">+{a.total - a.photos.length}</span>}
              </div>
            ) : <p className="text-[12px] text-slate-400">{t("อัลบั้มนี้ยังไม่มีรูป", "No photos in this album yet")}</p>}
          </div>
        ))}
      {picking && data?.parent_code && (
        <PickAlbumDialog parentCode={data.parent_code} skuCode={kind === "sku" ? data.sku_code : null} linkedIds={new Set(albums.map((a) => a.id))}
          onClose={() => setPicking(false)}
          onLinked={(name) => { setPicking(false); pushToast("success", t(`เชื่อมอัลบั้ม ${name} แล้ว`, `Linked ${name}`)); void load(); }} />
      )}
    </div>
  );
}

/** เลือกอัลบั้ม SAMPLE มาเชื่อมกับสินค้านี้ (หน้าตาการ์ดชุดเดียวกับหน้า SAMPLE — ./parts) */
function PickAlbumDialog({ parentCode, skuCode, linkedIds, onClose, onLinked }: {
  parentCode: string; skuCode: string | null; linkedIds: Set<string>;
  onClose: () => void; onLinked: (albumName: string) => void;
}) {
  const t = useT();
  const [albums, setAlbums] = useState<SampleAlbum[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadSamples(null).then((d) => setAlbums(d.albums)).catch((e) => { setAlbums([]); setErr((e as Error).message); }); }, []);
  const nameOf = (a: SampleAlbum) => a.display_name?.trim() || a.name;
  const shown = useMemo(() => sortAlbums((albums ?? []).filter((a) => !linkedIds.has(a.id) && albumMatches(a, q)), "newest").slice(0, 60), [albums, q, linkedIds]);

  const pick = async (a: SampleAlbum) => {
    const sameParent = (a.parent_sku_codes ?? []).includes(parentCode);
    const cur = a.sku_codes ?? [];
    // หน้า SKU: อัลบั้มเชื่อมทั้งรุ่นอยู่แล้ว = ครอบ SKU นี้แล้ว · เชื่อมรุ่นเดียวกันแบบเลือก SKU = เติม SKU นี้ · อื่น ๆ = เชื่อมใหม่
    const skus = skuCode ? (sameParent ? (cur.length ? [...new Set([...cur, skuCode])] : []) : [skuCode]) : (sameParent ? cur : []);
    if ((a.parent_sku_codes ?? []).length && !sameParent && !(await askConfirm({ title: t("เปลี่ยนสินค้าที่เชื่อม?", "Switch linked product?"), message: t(`อัลบั้มนี้เชื่อมกับ ${(a.parent_sku_codes ?? []).join(", ")} อยู่ — เปลี่ยนมาเชื่อมกับ ${parentCode} แทนไหม?`, `This album is linked to ${(a.parent_sku_codes ?? []).join(", ")} — switch to ${parentCode}?`), confirmText: t("เปลี่ยน", "Switch") }))) return;
    setBusy(true); setErr(null);
    try { await linkAlbumProduct(a.id, [parentCode], skus); onLinked(nameOf(a)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="xl" defaultExpanded={false} storageKey="sample-pick-album"
      title={t(`เชื่อมอัลบั้ม SAMPLE กับ ${skuCode ?? parentCode}`, `Link a SAMPLE album to ${skuCode ?? parentCode}`)}
      description={t("ค้นชื่ออัลบั้ม / วันที่ / แบรนด์ · กดการ์ดเพื่อเชื่อม", "Search album / date / brand · click a card to link")}>
      <div className="space-y-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400"><Icon value="i:search" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t("เช่น Product 004 · 16 พ.ย.", "e.g. Product 004")} aria-label={t("ค้นอัลบั้ม", "Search albums")}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        {err && <p className="text-[13px] text-rose-600">{err}</p>}
        {!albums ? <LoadingState className="py-10 text-sm" />
          : !shown.length ? <EmptyState icon={<Icon value="i:folder" />} className="p-6" title={t("ไม่พบอัลบั้ม", "No albums found")} />
          : (
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${busy ? "pointer-events-none opacity-60" : ""}`}>
              {shown.map((a) => <SampleAlbumCard key={a.id} sub album={a} onOpen={() => void pick(a)} />)}
            </div>
          )}
      </div>
    </ERPModal>
  );
}
