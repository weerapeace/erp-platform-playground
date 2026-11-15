"use client";

// ============================================================
// 📸 แท็บ "SAMPLE Images" ในตัวเลือกไฟล์กลาง (AssetPicker) — เจ้าของสั่ง 2026-11-15 (เลือกแบบแท็บใหม่จาก widget)
//   หน้าตาเหมือนหน้า SAMPLE Images (ใช้ชิ้นส่วน ./parts ร่วมกัน ไม่ได้ทำใหม่) แต่ "ดู + เลือก" อย่างเดียว
//   ไม่มีลาก/ย้าย/ลบ/อัปโหลด — จัดการรูปทำที่หน้า /tasks/samples (มีลิงก์เปิดให้)
//   อัลบั้มล่าสุดก่อน · แถบแบรนด์ (จำแบรนด์ร่วมกับหน้า SAMPLE) · เปิดอัลบั้ม → อัลบั้มย่อย + รูป · เลือกข้ามอัลบั้มได้
//   ไม่เก็บรายการที่เลือกเอง — AssetPicker ถือไว้ (isSelected / onToggle / onPickMany) แล้วแปลงเป็น AssetRow ตอนกด "ใช้รูปที่เลือก"
// ข้อมูล: ./api (loadSamples → /api/sample-images · สิทธิ์ assets.view เท่ากับคลังกลาง)
// โหลดแบบแยกชิ้น (next/dynamic ใน AssetPicker) — ช่องรูปที่ไม่เปิดแท็บนี้ไม่ต้องโหลดโค้ดส่วนนี้
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { useUserPref } from "@/lib/use-user-pref";
import { SAMPLE_TAB_ALL, SAMPLE_TAB_NONE, albumFullName, albumPath, inBrandTab, type SampleAlbum, type SampleBrand, type SamplePhoto } from "@/lib/sample-images";
import { SampleAlbumCard, SampleAlbumPath, SampleBrandBar, SamplePhotoTile } from "./parts";
import { loadSamples } from "./api";

export type SamplePickerPanelProps = {
  /** เลือกได้หลายรูป (ตามช่องที่เปิดตัวเลือก) — มีปุ่ม "เลือกทั้งอัลบั้ม" */
  multiple: boolean;
  isSelected: (id: string) => boolean;
  onToggle: (photo: SamplePhoto) => void;
  /** เลือก/เลิกเลือกทั้งชุด (ปุ่มเลือกทั้งอัลบั้ม) */
  onPickMany: (photos: SamplePhoto[], on: boolean) => void;
};

const strPref = (raw: unknown) => (typeof raw === "string" && raw ? raw : null);
const cardGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem" } as const;
const photoGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.6rem" } as const;

export default function SamplePickerPanel({ multiple, isSelected, onToggle, onPickMany }: SamplePickerPanelProps) {
  const t = useT();
  const [brands, setBrands] = useState<SampleBrand[]>([]);
  const [albums, setAlbums] = useState<SampleAlbum[] | null>(null);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SamplePhoto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // แบรนด์ที่เลือกไว้ = ค่าเดียวกับหน้า SAMPLE Images (เปิดมาเจอแบรนด์ที่ดูล่าสุด)
  const [tab, setTab] = useUserPref<string>("sample_images_brand", SAMPLE_TAB_ALL, strPref);

  const loadList = async () => {
    try { setErr(null); const d = await loadSamples(null); setBrands(d.brands); setAlbums(d.albums); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAlbum = async (id: string) => {
    setAlbumId(id); setPhotos(null);
    try { const d = await loadSamples(id); setBrands(d.brands); setAlbums(d.albums); setPhotos(d.photos ?? []); }
    catch (e) { setErr((e as Error).message); }
  };
  const closeAlbum = () => { setAlbumId(null); setPhotos(null); };
  const switchTab = (next: string) => { setTab(next); closeAlbum(); };

  const brandOf = (id: string | null | undefined) => (id ? brands.find((b) => b.id === id) ?? null : null);
  const nameOf = (a: SampleAlbum) => albumFullName(a, brandOf(a.brand_id)?.name);
  const album = albums?.find((a) => a.id === albumId) ?? null;
  const tabAlbums = useMemo(() => (albums ?? []).filter((a) => inBrandTab(a, tab) && !a.parent_id), [albums, tab]);
  const tree = useMemo(() => (albums ?? []).map((a) => ({ id: a.id, parent_id: a.parent_id })), [albums]);
  const path = useMemo(() => (album && albums ? albumPath(tree, album.id).map((id) => albums.find((a) => a.id === id)).filter((a): a is SampleAlbum => !!a) : []), [album, tree, albums]);
  const children = useMemo(() => (album ? (albums ?? []).filter((a) => a.parent_id === album.id) : []), [album, albums]);
  const list = useMemo(() => (photos ?? []).filter((p) => !p.trashed), [photos]);   // รูปในถังขยะไม่ให้เลือก
  const allOn = list.length > 0 && list.every((p) => isSelected(p.id));

  if (err) return <ErrorState title={t("โหลด SAMPLE Images ไม่สำเร็จ", "Could not load SAMPLE Images")} hint={err} onRetry={() => { if (albumId) void openAlbum(albumId); else void loadList(); }} />;
  if (!albums) return <LoadingState className="py-12 text-sm" />;

  return (
    <div className="space-y-3">
      <SampleBrandBar brands={brands} albums={albums} tab={tab} onTab={switchTab} />

      {album ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <SampleAlbumPath path={path} brandColor={brandOf(album.brand_id)?.color} nameOf={nameOf} onBack={closeAlbum} onOpen={(id) => void openAlbum(id)} />
            <span className="flex-1" />
            {multiple && list.length > 0 && (
              <button type="button" onClick={() => onPickMany(list, !allOn)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50">
                {allOn ? t("ไม่เลือกทั้งอัลบั้ม", "Clear album") : t(`เลือกทั้งอัลบั้ม (${list.length})`, `Select album (${list.length})`)}
              </button>
            )}
          </div>

          {children.length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-slate-400">{t(`อัลบั้มย่อย (${children.length})`, `Sub-albums (${children.length})`)}</div>
              <div style={cardGrid}>
                {children.map((c) => <SampleAlbumCard key={c.id} sub album={c} onOpen={() => void openAlbum(c.id)} />)}
              </div>
            </div>
          )}

          {photos === null ? <LoadingState className="py-10 text-sm" />
            : !list.length ? (children.length ? null : <EmptyState icon={<Icon value="i:photo" />} className="p-8" title={t("ยังไม่มีรูปในอัลบั้มนี้", "No images in this album")} />)
            : (
              <div style={photoGrid}>
                {list.map((p) => <SamplePhotoTile key={p.id} photo={p} on={isSelected(p.id)} onToggle={() => onToggle(p)} />)}
              </div>
            )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
            <span>
              <b className="font-semibold text-slate-800">{tab === SAMPLE_TAB_ALL ? t("อัลบั้มทุกแบรนด์", "All albums") : tab === SAMPLE_TAB_NONE ? t("อัลบั้มที่ยังไม่ระบุแบรนด์", "Albums without a brand") : t(`อัลบั้มของ ${brandOf(tab)?.name ?? ""}`, `Albums of ${brandOf(tab)?.name ?? ""}`)}</b>
              {tabAlbums.length > 0 && <> · {t(`${tabAlbums.length} อัลบั้ม · ล่าสุดก่อน`, `${tabAlbums.length} albums · newest first`)}</>}
            </span>
            <span className="flex-1" />
            <a href="/tasks/samples" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-violet-700 hover:underline"><Icon value="i:external-link" />{t("เปิดหน้า SAMPLE Images", "Open SAMPLE Images")}</a>
          </div>
          {!tabAlbums.length
            ? <EmptyState icon={<Icon value="i:folder" />} className="p-8" title={t("ยังไม่มีอัลบั้ม SAMPLE", "No SAMPLE albums yet")} hint={t("ลงรูปตัวอย่างได้ที่หน้า SAMPLE Images", "Add sample photos on the SAMPLE Images page")} />
            : (
              <div style={cardGrid}>
                {tabAlbums.map((a) => <SampleAlbumCard key={a.id} album={a} brand={brandOf(a.brand_id)} onOpen={() => void openAlbum(a.id)} />)}
              </div>
            )}
        </>
      )}
    </div>
  );
}
