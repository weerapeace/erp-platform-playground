"use client";

// ============================================================
// 📸 แท็บ "SAMPLE Images" ในตัวเลือกไฟล์กลาง (AssetPicker) — เจ้าของสั่ง 2026-11-15 (เลือกแบบแท็บใหม่จาก widget)
//   หน้าตาเหมือนหน้า SAMPLE Images (ใช้ชิ้นส่วน ./parts ร่วมกัน ไม่ได้ทำใหม่) แต่ "ดู + เลือก" อย่างเดียว
//   ไม่มีลาก/ย้าย/ลบ/อัปโหลด — จัดการรูปทำที่หน้า /tasks/samples (มีลิงก์เปิดให้)
//   อัลบั้มล่าสุดก่อน · แถบแบรนด์ (จำแบรนด์ร่วมกับหน้า SAMPLE) · เปิดอัลบั้ม → อัลบั้มย่อย + รูป · เลือกข้ามอัลบั้มได้
//   ค้นหา + เรียง (เจ้าของสั่ง 2026-11-15): หน้าแฟ้ม = ค้นอัลบั้มทุกชั้น · ในอัลบั้ม = ค้นรูป/อัลบั้มย่อย · วิธีเรียงจำร่วมกับหน้า SAMPLE
//   ไม่เก็บรายการที่เลือกเอง — AssetPicker ถือไว้ (isSelected / onToggle / onPickMany) แล้วแปลงเป็น AssetRow ตอนกด "ใช้รูปที่เลือก"
// ข้อมูล: ./api (loadSamples → /api/sample-images · สิทธิ์ assets.view เท่ากับคลังกลาง)
// โหลดแบบแยกชิ้น (next/dynamic ใน AssetPicker) — ช่องรูปที่ไม่เปิดแท็บนี้ไม่ต้องโหลดโค้ดส่วนนี้
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { useUserPref } from "@/lib/use-user-pref";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";   // ขนาดรูป − N + / Ctrl+ลูกกลิ้ง
import {
  SAMPLE_ALBUM_SORTS, SAMPLE_PHOTO_SORTS, SAMPLE_TAB_ALL, SAMPLE_TAB_NONE,
  albumFullName, albumMatches, albumPath, browseAlbums, photoMatches, sortAlbums, sortPhotos,
  type SampleAlbum, type SampleBrand, type SamplePhoto,
} from "@/lib/sample-images";
import { SampleAlbumCard, SampleAlbumPath, SampleBrandBar, SamplePhotoTile, SampleSearchSort, useSampleSorts } from "./parts";
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

export default function SamplePickerPanel({ multiple, isSelected, onToggle, onPickMany }: SamplePickerPanelProps) {
  const t = useT();
  const [brands, setBrands] = useState<SampleBrand[]>([]);
  const [albums, setAlbums] = useState<SampleAlbum[] | null>(null);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SamplePhoto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // แบรนด์ที่เลือกไว้ + วิธีเรียง = ค่าเดียวกับหน้า SAMPLE Images (เปิดมาเจอแบบที่ดูล่าสุด)
  const [tab, setTab] = useUserPref<string>("sample_images_brand", SAMPLE_TAB_ALL, strPref);
  const { albumSort, setAlbumSort, photoSort, setPhotoSort } = useSampleSorts();
  // ขนาดรูปในอัลบั้ม (ของกลาง มุมมองการ์ดกลาง) — จำรายคน · Ctrl+ลูกกลิ้งบนรูป = ย่อ/ขยาย
  const gallery = useGalleryColumns("sample-picker-photos", 6, "0.6rem");

  const loadList = async () => {
    try { setErr(null); const d = await loadSamples(null); setBrands(d.brands); setAlbums(d.albums); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** เปิดอัลบั้ม / กลับหน้าแฟ้ม / เปลี่ยนแบรนด์ = ล้างคำค้น (คำค้นของหน้าแฟ้มกับในอัลบั้มคนละเรื่อง) */
  const openAlbum = async (id: string) => {
    setAlbumId(id); setPhotos(null); setQuery("");
    try { const d = await loadSamples(id); setBrands(d.brands); setAlbums(d.albums); setPhotos(d.photos ?? []); }
    catch (e) { setErr((e as Error).message); }
  };
  const closeAlbum = () => { setAlbumId(null); setPhotos(null); setQuery(""); };
  const switchTab = (next: string) => { setTab(next); closeAlbum(); };

  const brandOf = (id: string | null | undefined) => (id ? brands.find((b) => b.id === id) ?? null : null);
  const brandName = (id: string | null) => brandOf(id)?.name ?? null;
  const nameOf = (a: SampleAlbum) => albumFullName(a, brandName(a.brand_id));
  const album = albums?.find((a) => a.id === albumId) ?? null;
  const cards = useMemo(() => browseAlbums(albums ?? [], tab, query, albumSort, (id) => brands.find((b) => b.id === id)?.name ?? null), [albums, tab, query, albumSort, brands]);
  const tree = useMemo(() => (albums ?? []).map((a) => ({ id: a.id, parent_id: a.parent_id })), [albums]);
  const path = useMemo(() => (album && albums ? albumPath(tree, album.id).map((id) => albums.find((a) => a.id === id)).filter((a): a is SampleAlbum => !!a) : []), [album, tree, albums]);
  const children = useMemo(() => (album ? sortAlbums((albums ?? []).filter((a) => a.parent_id === album.id && albumMatches(a, query)), albumSort) : []), [album, albums, query, albumSort]);
  // รูปในถังขยะไม่ให้เลือก · กรองตามคำค้น · เรียงตามที่เลือก
  const list = useMemo(() => sortPhotos((photos ?? []).filter((p) => !p.trashed && photoMatches(p, query)), photoSort), [photos, query, photoSort]);
  const total = (photos ?? []).filter((p) => !p.trashed).length;
  const allOn = list.length > 0 && list.every((p) => isSelected(p.id));
  const searching = !!query.trim();

  if (err) return <ErrorState title={t("โหลด SAMPLE Images ไม่สำเร็จ", "Could not load SAMPLE Images")} hint={err} onRetry={() => { if (albumId) void openAlbum(albumId); else void loadList(); }} />;
  if (!albums) return <LoadingState className="py-12 text-sm" />;

  const noMatch = (
    <EmptyState icon={<Icon value="i:search" />} className="p-8" title={t(`ไม่พบ "${query.trim()}"`, `No match for "${query.trim()}"`)}
      hint={t("ลองคำอื่น หรือเปลี่ยนแบรนด์ด้านบน", "Try another word or brand")} />
  );

  return (
    <div className="space-y-3">
      <SampleBrandBar brands={brands} albums={albums} tab={tab} onTab={switchTab} />

      {album ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <SampleAlbumPath path={path} brandColor={brandOf(album.brand_id)?.color} nameOf={nameOf} onBack={closeAlbum} onOpen={(id) => void openAlbum(id)} />
          </div>
          <SampleSearchSort query={query} onQuery={setQuery} placeholder={t("ค้นชื่อรูป / อัลบั้มย่อย / เลขใบงาน DS-…", "Search photo / sub-album / DS-…")}
            sort={photoSort} onSort={setPhotoSort} options={SAMPLE_PHOTO_SORTS}>
            <span className="flex-1" />
            <GalleryColumnsControl as="stepper" cols={gallery.cols} onChange={gallery.setCols} options={gallery.options} />
            {searching && photos && <span className="text-[12px] text-slate-500">{t(`พบ ${list.length} จาก ${total} รูป`, `${list.length} of ${total}`)}</span>}
            {multiple && list.length > 0 && (
              <button type="button" onClick={() => onPickMany(list, !allOn)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50">
                {allOn
                  ? t(searching ? "ไม่เลือกที่ค้นเจอ" : "ไม่เลือกทั้งอัลบั้ม", searching ? "Clear found" : "Clear album")
                  : t(searching ? `เลือกที่ค้นเจอ (${list.length})` : `เลือกทั้งอัลบั้ม (${list.length})`, searching ? `Select found (${list.length})` : `Select album (${list.length})`)}
              </button>
            )}
          </SampleSearchSort>

          {children.length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-slate-400">{t(`อัลบั้มย่อย (${children.length})`, `Sub-albums (${children.length})`)}</div>
              <div style={cardGrid}>
                {children.map((c) => <SampleAlbumCard key={c.id} sub album={c} onOpen={() => void openAlbum(c.id)} />)}
              </div>
            </div>
          )}

          {photos === null ? <LoadingState className="py-10 text-sm" />
            : !list.length ? (children.length ? null : searching && total ? noMatch : <EmptyState icon={<Icon value="i:photo" />} className="p-8" title={t("ยังไม่มีรูปในอัลบั้มนี้", "No images in this album")} />)
            : (
              <div ref={gallery.wheelRef} {...gallery.compactAttr} style={gallery.gridStyle}>
                {list.map((p) => <SamplePhotoTile key={p.id} photo={p} on={isSelected(p.id)} onToggle={() => onToggle(p)} />)}
              </div>
            )}
        </>
      ) : (
        <>
          <SampleSearchSort query={query} onQuery={setQuery} placeholder={t("ค้นชื่ออัลบั้ม / วันที่ / แบรนด์…", "Search album / date / brand…")}
            sort={albumSort} onSort={setAlbumSort} options={SAMPLE_ALBUM_SORTS}>
            <span className="flex-1" />
            <a href="/tasks/samples" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-violet-700 hover:underline"><Icon value="i:external-link" />{t("เปิดหน้า SAMPLE Images", "Open SAMPLE Images")}</a>
          </SampleSearchSort>
          <div className="text-[13px] text-slate-500">
            <b className="font-semibold text-slate-800">{tab === SAMPLE_TAB_ALL ? t("อัลบั้มทุกแบรนด์", "All albums") : tab === SAMPLE_TAB_NONE ? t("อัลบั้มที่ยังไม่ระบุแบรนด์", "Albums without a brand") : t(`อัลบั้มของ ${brandOf(tab)?.name ?? ""}`, `Albums of ${brandOf(tab)?.name ?? ""}`)}</b>
            {cards.length > 0 && <> · {searching ? t(`พบ ${cards.length} อัลบั้ม (รวมอัลบั้มย่อย)`, `${cards.length} found (incl. sub-albums)`) : t(`${cards.length} อัลบั้ม`, `${cards.length} albums`)}</>}
          </div>
          {!cards.length
            ? (searching ? noMatch : <EmptyState icon={<Icon value="i:folder" />} className="p-8" title={t("ยังไม่มีอัลบั้ม SAMPLE", "No SAMPLE albums yet")} hint={t("ลงรูปตัวอย่างได้ที่หน้า SAMPLE Images", "Add sample photos on the SAMPLE Images page")} />)
            : (
              <div style={cardGrid}>
                {cards.map(({ album: a, inside }) => <SampleAlbumCard key={a.id} album={a} brand={brandOf(a.brand_id)} inside={inside} onOpen={() => void openAlbum(a.id)} />)}
              </div>
            )}
        </>
      )}
    </div>
  );
}
