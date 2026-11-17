"use client";

// ============================================================
// 📸 SAMPLE Images — อัลบั้มรูปตัวอย่างประจำแบรนด์ + ส่งรูปเข้าใบงานใน Design Dashboard (เจ้าของขอ 2026-11-13)
//
// แถบแบรนด์ด้านบน → หน้าแฟ้ม = การ์ดอัลบั้ม ปกรวมรูป (ของกลาง AlbumCover แบบ C) เรียงวันที่ลง (1 แบรนด์ 1 วัน = 1 อัลบั้ม) → กดเปิดอัลบั้ม / ← กลับ
// ลากรูปมาวาง (ทั้งโฟลเดอร์ก็ได้) → ย่อ ≤2400px + JPEG → คลังไฟล์กลาง → เปิดอัลบั้มอยู่ = เข้าอัลบั้มนั้น · หน้าแฟ้ม = อัลบั้มของแบรนด์ + วันนี้ (ไม่มีขั้นรอ)
//   แท็บ "ทุกแบรนด์" = เลือกแบรนด์ที่ปุ่มในกรอบวางรูปก่อนวาง (จำแบรนด์ล่าสุด)
// ไม่มีระบบรอย้ายแล้ว (เจ้าของสั่ง "ไม่ต้องทำเป็นรอ") — รูปอยู่ในอัลบั้มตลอด · ส่งเข้าใบงานแล้วมีป้าย → DS-xxxx
// เลือกรูป → "ส่งไป Design Dashboard" → ตัวเลือกใบงานกลาง (กรองแบรนด์ของอัลบั้มไว้ให้) → ใบงานแนบรูปเดิมจากคลัง (ไม่ก๊อปไฟล์)
// อัลบั้มไม่ระบุแบรนด์ (ลงก่อนมีระบบแบรนด์) → ปุ่ม "ย้ายอัลบั้มเข้าแบรนด์" (ป้าย แนะนำ = แบรนด์ของใบงานที่รูปถูกส่งไป)
// ของกลาง: StandaloneShell · useFileDrop · UploadProgress · BulkActionBar · ConfirmDialog · gallery-columns · DesignSheetPickerModal
// ค้นหา + เรียง (เจ้าของสั่ง 2026-11-15): แถวค้นหาใต้แถบแบรนด์ — หน้าแฟ้มค้นอัลบั้มทุกชั้น · ในอัลบั้มค้นรูป/อัลบั้มย่อย/เลข DS · วิธีเรียงจำรายคน
// หน้าตาแถบแบรนด์/การ์ดอัลบั้ม/เส้นทาง/ช่องรูป = ./parts ใช้ร่วมกับแท็บ "SAMPLE Images" ในตัวเลือกไฟล์กลาง (./picker · AssetPicker) — แก้ที่ parts ทั้งสองที่เปลี่ยนตาม
// ข้อมูล: components/sample-images/api.ts → API กลางเดิม · ตรรกะ: lib/sample-images · doc: docs/sample-images.md
// สิทธิ์: ดู assets.view · ลงรูป assets.upload · ลบ assets.delete · เอากลับ/ย้ายอัลบั้มเข้าแบรนด์ assets.edit · ส่งเข้าใบงาน attachments.upload
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { usePushToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { filePathOf, useFileDrop } from "@/components/file-drop";
import { useMarqueeSelect } from "@/lib/use-marquee-select";
import { DropAlbumDialog, commonFolderName, type DropMode, type DropPlan } from "./drop-album-dialog";
import { LinkProductDialog } from "./link-product-dialog";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { GALLERY_COL_CHOICES, GalleryColumnsControl, useGalleryColumns } from "@/components/gallery-columns";
import { DesignSheetPickerModal, type PickedDesignSheet } from "@/components/design-sheet-picker";
import { useUserPref } from "@/lib/use-user-pref";
import { useStepHistory } from "@/lib/use-step-history";
import { SAMPLE_ALBUM_SORTS, SAMPLE_NOTE_MAX, SAMPLE_PHOTO_SORTS, SAMPLE_TAB_ALL, SAMPLE_TAB_NONE, albumCardLabel, albumFullName, albumMatches, albumPath, browseAlbums, productLinkLabel, canMoveAlbum, inBrandTab, isDayAlbum, nextProductName, photoMatches, photosToMove, reorderIds, sortAlbums, sortPhotos, splitSampleFiles, thaiShortDate, type SampleAlbum, type SampleBrand, type SamplePhoto } from "@/lib/sample-images";
import { BrandDot, SampleAlbumCard, SampleAlbumPath, SampleBrandBar, SamplePhotoTile, SampleSearchSort, sampleImgUrl, useSampleSorts } from "./parts";
import { linkAlbumProduct } from "./api";
import { createSubAlbum, deleteEmptyAlbum, ensureTodayAlbum, loadSamples, moveAlbumTo, movePhotosTo, moveToSheet, renameAlbum, reorderAlbums, reorderPhotos, restoreSample, saveAlbumNote, setAlbumBrand, trashSample, uploadSample } from "./api";

/** ลากสลับลำดับ: ตำแหน่งที่ชี้บนรูป/การ์ด — ขอบซ้าย 30% = วางก่อน · ขอบขวา 30% = วางหลัง · กลาง = รวม/ย้ายเข้า (แบบเดิม) */
type DropZone = "before" | "after" | "merge";
const zoneOf = (e: React.DragEvent): DropZone => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = (e.clientX - r.left) / Math.max(1, r.width);
  return x < 0.3 ? "before" : x > 0.7 ? "after" : "merge";
};

/** โน้ตของอัลบั้ม (เจ้าของสั่ง 2026-11-16) — พิมพ์แล้วบันทึกเองเมื่อหยุดพิมพ์ / ออกจากช่อง · ไม่มีสิทธิ์แก้ = อ่านอย่างเดียว */
function AlbumNoteBox({ albumId, note, canEdit, label, onSaved }: { albumId: string; note: string | null; canEdit: boolean; label: string; onSaved: (note: string | null) => void }) {
  const t = useT();
  const pushToast = usePushToast();
  const [val, setVal] = useState(note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const saved = useRef(note ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // เปลี่ยนอัลบั้ม = โหลดโน้ตของอัลบั้มนั้น · โน้ตเปลี่ยนจากที่อื่น (โหลดใหม่) = ใช้ค่าใหม่ — แต่ไม่ทับตอนเพิ่งบันทึกเอง (กันตัวอักษรที่พิมพ์ต่อหาย)
  const shownFor = useRef(albumId);
  useEffect(() => {
    if (shownFor.current !== albumId) { shownFor.current = albumId; setVal(note ?? ""); saved.current = note ?? ""; setState("idle"); return; }
    if ((note ?? "") !== saved.current) { setVal(note ?? ""); saved.current = note ?? ""; }
  }, [albumId, note]);
  const flush = useCallback(async (text: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (text.trim() === saved.current.trim()) return;
    setState("saving");
    try { const r = await saveAlbumNote(albumId, text); saved.current = r.note ?? ""; setState("saved"); onSaved(r.note); }
    catch (e) { setState("idle"); pushToast("error", (e as Error).message); }
  }, [albumId, onSaved, pushToast]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!canEdit && !note) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-slate-500">
        <Icon value="i:notes" />{t(`โน้ตของ ${label}`, `Note for ${label}`)}
        {canEdit && <span className="text-slate-400">{state === "saving" ? t("· กำลังบันทึก…", "· Saving…") : state === "saved" ? t("· บันทึกแล้ว", "· Saved") : t("· บันทึกเองเมื่อพิมพ์เสร็จ", "· Saves when you stop typing")}</span>}
      </div>
      {canEdit ? (
        <textarea value={val} maxLength={SAMPLE_NOTE_MAX} rows={2}
          onChange={(e) => { const v = e.target.value; setVal(v); setState("idle"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void flush(v), 1200); }}
          onBlur={() => void flush(val)}
          placeholder={t("เช่น ส่งมาวันไหน ขาดรูปอะไร สี/ขนาดที่ต้องจำ…", "e.g. what arrived, what's missing, colours/sizes…")}
          className="block min-h-[56px] w-full resize-y rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[13px] text-amber-950 placeholder:text-amber-900/40 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200" />
      ) : (
        <p className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[13px] text-amber-950">{note}</p>
      )}
    </div>
  );
}

/** ลากภายในหน้า (รูป/อัลบั้ม) — ใช้ชนิดข้อมูลของเราเอง ตัวรับไฟล์จากเครื่อง (useFileDrop) จะไม่ยุ่ง */
const DRAG_MIME = "application/x-erp-sample";
type DragItem = { kind: "photos"; ids: string[] } | { kind: "album"; id: string };

/** แท็บแบรนด์: "all" = ทุกแบรนด์ · "none" = ไม่ระบุแบรนด์ · อื่น ๆ = id แบรนด์ */
type BrandTab = string;
const ALL = SAMPLE_TAB_ALL, NONE = SAMPLE_TAB_NONE;
const strPref = (raw: unknown) => (typeof raw === "string" && raw ? raw : null);

const imgUrl = sampleImgUrl;
const inTab = inBrandTab;

export function SampleImagesPage() {
  const t = useT();
  const { can, permsReady, user } = useAuth();
  const pushToast = usePushToast();
  const actor = user?.name ?? user?.email ?? null;
  const [brands, setBrands] = useState<SampleBrand[]>([]);
  const [albums, setAlbums] = useState<SampleAlbum[] | null>(null);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SamplePhoto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useUserPref<BrandTab>("sample_images_brand", ALL, strPref);
  const [lastBrand, setLastBrand] = useUserPref<string>("sample_images_last_brand", "", strPref);
  const [trashView, setTrashView] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const dragRef = useRef<DragItem | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);   // ที่ที่กำลังลากผ่าน (ไฮไลต์)
  const [chooser, setChooser] = useState<null | "photos" | "album" | "albums">(null);
  const [selAlbums, setSelAlbums] = useState<Set<string>>(new Set());   // อัลบั้มย่อยที่ลากกรอบเลือก (ย้ายพร้อมกัน)
  // วางรูปตอนเปิดอัลบั้ม → ป๊อปสร้างอัลบั้มย่อยใหม่ (เจ้าของเลือก 2026-11-17) · จำทางที่เลือกล่าสุดรายคน
  const [dropFiles, setDropFiles] = useState<File[] | null>(null);
  const [dropPref, setDropPref] = useUserPref<DropMode>("sample_images_drop_mode", "new", (r) => (r === "new" || r === "here" ? r : null));
  const [dropMode, setDropMode] = useState<DropMode>("new");
  const [lastParent, setLastParent] = useUserPref<string>("sample_images_last_parent", "", strPref);   // Parent ล่าสุดที่เลือกในป๊อปลงรูป
  // เชื่อมสินค้า (2026-11-17): ป๊อปเชื่อม + รูปที่มีอยู่แล้วของสินค้าที่อัลบั้มเชื่อม (ไว้เทียบ)
  const [linking, setLinking] = useState(false);
  const [linkedImgs, setLinkedImgs] = useState<{ key: string; label: string }[]>([]);   // แผงเลือกอัลบั้มปลายทาง
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const cancelRef = useRef(false);
  const [picking, setPicking] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [toBrand, setToBrand] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ctrl + ลูกกลิ้งบนกริด = ย่อ/ขยาย (เจ้าของสั่ง 2026-11-15) — รูปในอัลบั้ม และการ์ดอัลบั้มหน้าแฟ้ม (จำแยกกัน รายคน)
  const { cols, setCols, gridStyle, wheelRef } = useGalleryColumns("sample-images", 6, "0.75rem", { ctrlWheel: true });
  const albumGrid = useGalleryColumns("sample-albums", 3, "0.75rem", { options: GALLERY_COL_CHOICES, ctrlWheel: true });
  // ค้นหา + เรียง (เจ้าของสั่ง 2026-11-15) — หน้าแฟ้ม = ค้นอัลบั้มทุกชั้น · ในอัลบั้ม = ค้นรูป/อัลบั้มย่อย · วิธีเรียงจำรายคน (ใช้ร่วมกับแท็บในตัวเลือกไฟล์)
  const [query, setQuery] = useState("");
  const { albumSort, setAlbumSort, photoSort, setPhotoSort } = useSampleSorts();
  const searching = !!query.trim();
  const canView = can("assets.view"), canUpload = can("assets.upload"), canDelete = can("assets.delete"), canEdit = can("assets.edit");
  const canMove = can("attachments.upload");   // ส่งเข้าใบงาน = แนบไฟล์ (ด่านเดียวกับใน DB) — ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม
  const brandOf = useCallback((id: string | null | undefined) => (id ? brands.find((b) => b.id === id) ?? null : null), [brands]);

  /** โหลดรายการใหม่ · want = อัลบั้มที่อยากเปิด (null = หน้าแฟ้ม · ไม่ส่ง = อัลบั้มที่เปิดอยู่ ถ้ายังอยู่ในแท็บนี้) */
  const reload = useCallback(async (want?: string | null, forTab: BrandTab = tab) => {
    try {
      setErr(null);
      const first = await loadSamples(null);
      const list = first.albums.filter((a) => inTab(a, forTab));
      const id = want !== undefined ? want : albumId;
      const pickId = id && list.some((a) => a.id === id) ? id : null;
      const d = pickId ? await loadSamples(pickId) : first;
      setBrands(d.brands); setAlbums(d.albums); setAlbumId(pickId); setPhotos(pickId ? d.photos ?? [] : null); setLinkedImgs(pickId ? d.linked_images ?? [] : []);
      setSel(new Set());
    } catch (e) { setErr((e as Error).message); }
  }, [albumId, tab]);
  // เปิดจากหน้าสินค้า (ส่วน "รูป SAMPLE") → /tasks/samples?album=<id> เปิดอัลบั้มนั้นเลย (ทุกแบรนด์)
  useEffect(() => {
    if (!permsReady || !canView) return;
    const want = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("album") : null;
    void (want ? reload(want, ALL) : reload());
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [permsReady, canView]);

  // ปุ่ม Back ย้อนทีละก้าวตามที่เดินมา (อัลบั้มย่อย → อัลบั้มแม่ → หน้าแฟ้ม) — เจ้าของสั่ง 2026-11-15 · ของกลาง lib/use-step-history
  const steps = useStepHistory<{ album: string | null }>("sample-album", (s) => {
    const want = s?.album ?? null;
    if (want === albumId) return;            // ป๊อปที่เพิ่งปิดพากลับมาก้าวเดิม — อยู่ที่เดิมแล้ว
    if (want) void openAlbum(want, true); else closeAlbum(true);
  });
  /** เปิดอัลบั้ม · fromHistory = มาจากปุ่ม Back (ไม่จดก้าวซ้ำ) */
  const openAlbum = async (id: string, fromHistory = false) => {
    if (!fromHistory && id !== albumId) steps.push({ album: id });
    setAlbumId(id); setPhotos(null); setSel(new Set()); setTrashView(false); setToBrand(false); setChooser(null); setQuery("");
    setLinkedImgs([]);
    try { const d = await loadSamples(id); setAlbums(d.albums); setBrands(d.brands); setPhotos(d.photos ?? []); setLinkedImgs(d.linked_images ?? []); }
    catch (e) { setErr((e as Error).message); }
  };
  /** กลับหน้าแฟ้ม (การ์ดอัลบั้ม) */
  const closeAlbum = (fromHistory = false) => {
    if (!fromHistory && albumId) steps.push({ album: null });
    setAlbumId(null); setPhotos(null); setSel(new Set()); setTrashView(false); setToBrand(false); setChooser(null); setQuery("");
  };
  const switchTab = (next: BrandTab) => { setTab(next); closeAlbum(); };

  // ── แบรนด์ที่จะลงรูป: แท็บแบรนด์ = แบรนด์นั้น · ไม่ระบุแบรนด์ = ไม่มี · ทุกแบรนด์ = ปุ่มเลือกในกรอบวางรูป (จำล่าสุด) ──
  const uploadBrandId: string | null = tab === NONE ? null : tab !== ALL ? tab : (brandOf(lastBrand)?.id ?? brands[0]?.id ?? null);

  /** into = ลงอัลบั้มนี้แทนอัลบั้มที่เปิดอยู่ · stayOn = หลังลงเสร็จเปิดอัลบั้มไหน (ไม่ส่ง = อัลบั้มที่ลง) */
  const upload = async (files: File[], into?: { id: string; name: string; brand_id: string | null }, stayOn?: string) => {
    if (!canUpload) { pushToast("error", t("คุณไม่มีสิทธิ์ลงรูป", "You can't upload images")); return; }
    if (up) { pushToast("info", t("กำลังลงรูปชุดก่อนอยู่ — รอสักครู่", "Still uploading — please wait")); return; }
    const { ok, unsupported, notImage } = splitSampleFiles(files);
    if (unsupported.length) pushToast("warning", t(`ข้าม ${unsupported.length} ไฟล์ (RAW/ไฟล์งาน แปลงเป็น JPEG ในเว็บไม่ได้ — ลง JPG/PNG/HEIC แทน)`, `Skipped ${unsupported.length} RAW/work files`));
    if (notImage.length) pushToast("warning", t(`ข้าม ${notImage.length} ไฟล์ที่ไม่ใช่รูป`, `Skipped ${notImage.length} non-image files`));
    if (!ok.length) return;
    // เปิดอัลบั้มอยู่ = เพิ่มเข้าอัลบั้มนั้น (เหมือนวางของลงแฟ้ม · เจ้าของเลือก 2026-11-14) · หน้าแฟ้ม = อัลบั้มของแบรนด์ + วันนี้
    const openNow = into ?? albums?.find((a) => a.id === albumId) ?? null;
    const brandId = openNow ? openNow.brand_id : uploadBrandId;
    cancelRef.current = false;
    let done = 0, dup = 0;
    const fails: string[] = [];
    try {
      setUp({ name: t(`${ok.length} รูป`, `${ok.length} images`), pct: null, label: openNow ? t("กำลังเตรียมลงรูปในอัลบั้มนี้", "Preparing") : t("กำลังเตรียมอัลบั้มของวันนี้", "Preparing today's album") });
      const album = openNow ? { id: openNow.id, name: openNow.name } : await ensureTodayAlbum(brandId);
      if (brandId) setLastBrand(brandId);
      for (let i = 0; i < ok.length; i++) {
        if (cancelRef.current) break;
        const f = ok[i];
        try {
          const r = await uploadSample(f, album.id, brandId, actor, (step) => setUp({ name: f.name, size: f.size, count: { current: i + 1, total: ok.length }, pct: Math.round((i / ok.length) * 100), label: step === "prepare" ? t("กำลังย่อ + แปลงเป็น JPEG", "Resizing to JPEG") : t("กำลังอัปโหลด", "Uploading") }));
          done++; if (r.duplicate) dup++;
        } catch (e) { fails.push(`${f.name}: ${(e as Error).message}`); }
      }
      const nextTab = tab === ALL ? ALL : brandId ?? NONE;
      if (nextTab !== tab) setTab(nextTab);
      setTrashView(false); setQuery("");   // ลงรูปใหม่ = โชว์ทั้งอัลบั้ม (ไม่ให้รูปที่เพิ่งลงโดนคำค้นซ่อน)
      await reload(stayOn ?? album.id, nextTab);
      if (done) pushToast("success", t(`ลง ${done} รูปใน ${album.name} แล้ว${dup ? ` (${dup} รูปเคยลงไว้ ใช้รูปเดิม)` : ""}`, `Added ${done} image(s) to ${album.name}`));
      if (fails.length) pushToast("error", t(`ลงไม่สำเร็จ ${fails.length} รูป — ${fails[0]}`, `${fails.length} failed — ${fails[0]}`));
      if (cancelRef.current) pushToast("info", t("หยุดลงรูปแล้ว", "Upload stopped"));
    } catch (e) {
      pushToast("error", (e as Error).message);
    } finally { setUp(null); }
  };
  // เปิดอัลบั้มอยู่ → ถามก่อน: สร้างอัลบั้มย่อยใหม่ (Product ### นับต่อทั้งแบรนด์ / ชื่อโฟลเดอร์ที่ลากมา) หรือใส่อัลบั้มนี้ · หน้ารวมอัลบั้ม = ลงอัลบั้มของวันนี้ทันที (เจ้าของเลือก)
  const onDropFiles = (files: File[]) => {
    const openNow = albums?.find((a) => a.id === albumId) ?? null;
    if (!openNow || trashView || !canUpload || !splitSampleFiles(files).ok.length) { void upload(files); return; }
    setDropMode(dropPref); setDropFiles(files);
  };
  const dropName = useMemo(() => {
    if (!dropFiles) return "";
    const openNow = albums?.find((a) => a.id === albumId);
    return commonFolderName(splitSampleFiles(dropFiles).ok.map(filePathOf)) ?? nextProductName(albums ?? [], openNow?.brand_id ?? null);
  }, [dropFiles, albums, albumId]);
  // แผนจากป๊อป: ใส่อัลบั้มนี้ / สร้าง 1 อัลบั้มขึ้นไป (แยกตาม SKU) แต่ละอัลบั้มเชื่อม Parent + SKU (เจ้าของเลือก 2026-11-17)
  const confirmDrop = async (plan: DropPlan) => {
    const files = dropFiles; const parent = albums?.find((a) => a.id === albumId) ?? null;
    setDropFiles(null);
    if (!files) return;
    setDropPref(plan.mode === "here" ? "here" : "new");
    if (plan.mode === "here" || !parent) { void upload(files); return; }
    for (const g of plan.groups) {
      if (!g.files.length) continue;
      try {
        const made = await createSubAlbum(parent.id, g.name);
        if (g.parentCode) { await linkAlbumProduct(made.id, [g.parentCode], g.skuCodes); setLastParent(g.parentCode); }
        await upload(g.files, { id: made.id, name: made.name, brand_id: parent.brand_id }, parent.id);   // อยู่ที่อัลบั้มแม่ต่อ — วางชุดถัดไปได้เลย
      } catch (e) { pushToast("error", t(`สร้าง "${g.name}" ไม่สำเร็จ — ${(e as Error).message}`, `Could not create "${g.name}" — ${(e as Error).message}`)); break; }
    }
  };
  const drop = useFileDrop((files) => onDropFiles(files), { folders: true, disabled: !canUpload || !!up, onBusy: () => pushToast("info", t("กำลังลงรูปอยู่ — รอสักครู่", "Uploading — please wait")) });

  // ── รายการ ──
  const album = albums?.find((a) => a.id === albumId) ?? null;
  const albumBrand = brandOf(album?.brand_id);
  // หน้าแฟ้ม = อัลบั้มชั้นบนสุดของแท็บ · อัลบั้มย่อยโผล่ตอนเปิดอัลบั้มแม่
  // การ์ดหน้าแฟ้ม: ไม่ค้น = ชั้นบนสุดของแท็บ · ค้น = ทุกชั้นที่ตรง (บอกว่าอยู่ในอัลบั้มไหน) — lib/sample-images browseAlbums
  const cards = useMemo(() => browseAlbums(albums ?? [], tab, query, albumSort, (id) => brands.find((b) => b.id === id)?.name ?? null), [albums, tab, query, albumSort, brands]);
  const tree = useMemo(() => (albums ?? []).map((a) => ({ id: a.id, parent_id: a.parent_id })), [albums]);
  const path = useMemo(() => (album ? albumPath(tree, album.id).map((id) => albums!.find((a) => a.id === id)!) : []), [album, tree, albums]);
  const children = useMemo(() => (album ? (albums ?? []).filter((a) => a.parent_id === album.id) : []), [album, albums]);
  // อัลบั้มย่อยในอัลบั้ม = ลำดับจัดเองเสมอ (ยังไม่จัด = ตามลำดับที่สร้าง Product 001, 002…) — เจ้าของสั่ง 2026-11-16 · ตัวเลือกเรียงในหน้านี้เป็นของรูป
  const shownChildren = useMemo(() => sortAlbums(children.filter((a) => albumMatches(a, query)), "manual"), [children, query]);
  const allInView = useMemo(() => (photos ?? []).filter((p) => p.trashed === trashView), [photos, trashView]);
  // รูปที่โชว์ = ตามคำค้น + วิธีเรียง (เลือกทั้งหมด / ลาก / ส่ง ใช้กับรูปที่โชว์อยู่)
  const list = useMemo(() => sortPhotos(allInView.filter((p) => photoMatches(p, query)), photoSort), [allInView, query, photoSort]);
  const trashCount = (photos ?? []).filter((p) => p.trashed).length;
  const selected = list.filter((p) => sel.has(p.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = list.length > 0 && list.every((p) => sel.has(p.id));
  // ลากกรอบจากที่ว่าง = เลือกหลายรูป + การ์ดอัลบั้มย่อย (เจ้าของขอ 2026-11-17 · ของกลาง lib/use-marquee-select) · id = "p:<รูป>" / "a:<อัลบั้ม>"
  const mq = useMarqueeSelect({
    disabled: !album,
    getSelected: () => [...[...sel].map((id) => `p:${id}`), ...[...selAlbums].map((id) => `a:${id}`)],
    setSelected: (ids) => {
      setSel(new Set(ids.filter((x) => x.startsWith("p:")).map((x) => x.slice(2))));
      setSelAlbums(new Set(trashView ? [] : ids.filter((x) => x.startsWith("a:")).map((x) => x.slice(2))));
    },
  });
  useEffect(() => { setSelAlbums(new Set()); }, [albumId, trashView, albums]);
  const toggleAlbum = (id: string) => setSelAlbums((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selAttr = (id: string) => ({ "data-select-id": id }) as Record<string, string>;
  const moveAlbums = (ids: string[], toParent: SampleAlbum | null) => {
    const bad = ids.filter((id) => !canMoveAlbum(tree, id, toParent?.id ?? null));
    if (bad.length) { pushToast("warning", t("ย้ายอัลบั้มเข้าไปในตัวเอง หรือในอัลบั้มย่อยของตัวเองไม่ได้", "Can't move an album into itself")); return; }
    void act(async () => { for (const id of ids) await moveAlbumTo(id, toParent?.id ?? null); setChooser(null); return t(`ย้าย ${ids.length} อัลบั้ม${toParent ? `ไปไว้ใน "${nameOf(toParent)}"` : "ขึ้นชั้นบนสุด"} แล้ว`, `Moved ${ids.length} album(s)`); }, albumId);
  };

  // ── ส่งเข้าใบงาน / ลบ / เอากลับ / ย้ายอัลบั้มเข้าแบรนด์ ──
  const doMove = async (sheet: PickedDesignSheet) => {
    const ids = photosToMove(photos ?? [], sel, sheet.id);
    if (!ids.length) { pushToast("info", t("รูปที่เลือกอยู่ในใบงานนี้แล้ว", "These images are already in that sheet")); setPicking(false); return; }
    try {
      const n = await moveToSheet(sheet.id, ids, actor);
      pushToast("success", t(`ส่ง ${n} รูปไป ${sheet.code} · ${sheet.name} แล้ว`, `Sent ${n} image(s) to ${sheet.code}`));
      setPicking(false);
      await reload();
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  const runEach = async (ids: string[], fn: (id: string) => Promise<void>) => {
    setBusy(true);
    const fails: string[] = [];
    for (const id of ids) { try { await fn(id); } catch (e) { fails.push((e as Error).message); } }
    setBusy(false);
    return fails;
  };
  const doDelete = async () => {
    const ids = selected.map((p) => p.id);
    const fails = await runEach(ids, trashSample);
    setAskDelete(false);
    if (ids.length - fails.length) pushToast("success", t(`ย้าย ${ids.length - fails.length} รูปไปถังขยะแล้ว — เอากลับได้ที่ถังขยะของอัลบั้มนี้`, `${ids.length - fails.length} moved to trash`));
    if (fails.length) pushToast("error", t(`ลบไม่ได้ ${fails.length} รูป — ${fails[0]}`, `${fails.length} could not be deleted — ${fails[0]}`));
    await reload();
  };
  const doRestore = async () => {
    const ids = selected.map((p) => p.id);
    const fails = await runEach(ids, restoreSample);
    if (ids.length - fails.length) pushToast("success", t(`เอากลับ ${ids.length - fails.length} รูปแล้ว`, `Restored ${ids.length - fails.length}`));
    if (fails.length) pushToast("error", fails[0]);
    await reload();
  };
  const doSetBrand = async (brandId: string) => {
    if (!album) return;
    setBusy(true);
    try {
      const r = await setAlbumBrand(album.id, brandId);
      pushToast("success", t(`ย้ายอัลบั้มเข้า ${brandOf(brandId)?.name ?? ""} แล้ว${r.merged ? " (รวมกับอัลบั้มวันเดียวกันที่มีอยู่)" : ""}`, "Album moved into the brand"));
      setToBrand(false);
      setTab(brandId);
      await reload(r.id, brandId);
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };

  // ── อัลบั้มในอัลบั้ม (เจ้าของสั่ง 2026-11-14): สร้างจากรูปที่เลือก · ย้ายรูป/อัลบั้ม · เปลี่ยนชื่อ · ลบอัลบั้มว่าง ──
  // อัลบั้มของวัน = โชว์เป็นวันที่ · อัลบั้มที่ตั้งชื่อเอง (ชั้นไหนก็ได้ เช่น Louis Batch สร้าง) = ชื่อจริง
  const nameOf = (a: SampleAlbum | null | undefined) => (a ? albumFullName(a, brandOf(a.brand_id)?.name) : "");
  const act = async (fn: () => Promise<string | null>, stayOn?: string | null) => {
    setBusy(true);
    try { const msg = await fn(); if (msg) pushToast("success", msg); await reload(stayOn); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  const createSub = async (ids: string[]) => {
    if (!album) return;
    // ชื่อสำเร็จรูป "Product 001" นับต่อจากเลขสูงสุดของแบรนด์นี้ (เจ้าของเลือก 2026-11-16) — แก้ชื่อเองได้
    const name = await askText({ title: ids.length ? t(`รวม ${ids.length} รูปเป็นอัลบั้มใหม่`, `New album from ${ids.length} image(s)`) : t("สร้างอัลบั้มย่อย", "New sub-album"), message: t(`อยู่ใน ${nameOf(album)}`, `Inside ${nameOf(album)}`), initial: nextProductName(albums ?? [], album.brand_id), required: true, confirmText: t("สร้างอัลบั้ม", "Create album") });
    if (!name?.trim()) return;
    await act(async () => { const r = await createSubAlbum(album.id, name.trim(), ids, album.id); setChooser(null); return t(`สร้างอัลบั้ม "${r.name}" แล้ว${r.moved ? ` · ย้าย ${r.moved} รูปเข้าไป` : ""}`, `Album "${r.name}" created`); }, album.id);
  };
  const movePhotos = (ids: string[], to: SampleAlbum) => {
    if (!album || !ids.length || to.id === album.id) return;
    void act(async () => { const r = await movePhotosTo(ids, album.id, to.id); setChooser(null); return t(`ย้าย ${r.moved} รูปไป "${nameOf(to)}" แล้ว`, `Moved ${r.moved} image(s)`); }, album.id);
  };
  const moveAlbum = (id: string, toParent: SampleAlbum | null) => {
    if (!canMoveAlbum(tree, id, toParent?.id ?? null)) { pushToast("warning", t("ย้ายอัลบั้มเข้าไปในตัวเอง หรือในอัลบั้มย่อยของตัวเองไม่ได้", "Can't move an album into itself")); return; }
    const moving = albums?.find((a) => a.id === id);
    void act(async () => { await moveAlbumTo(id, toParent?.id ?? null); setChooser(null); return t(`ย้ายอัลบั้ม "${nameOf(moving)}" ${toParent ? `ไปไว้ใน "${nameOf(toParent)}"` : "ขึ้นชั้นบนสุด"} แล้ว`, "Album moved"); }, albumId);
  };
  const rename = async () => {
    if (!album) return;
    if (isDayAlbum(album)) {
      // อัลบั้มของวัน: ตั้ง "ชื่อที่โชว์" (ชื่อจริงตามวันที่เก็บไว้ ใช้หาอัลบั้มของวันนี้ตอนลงรูป) · เว้นว่าง = กลับไปโชว์วันที่
      const name = await askText({ title: t("ตั้งชื่ออัลบั้ม", "Name this album"), message: t(`อัลบั้มของวันที่ ${thaiShortDate(new Date(album.created_at))} — วันที่ยังเก็บไว้ · เว้นว่าง = โชว์เป็นวันที่เหมือนเดิม`, "The date is kept · leave empty to show the date"), initial: album.display_name ?? "", required: false, confirmText: t("บันทึก", "Save") });
      if (name === null || name === undefined || name.trim() === (album.display_name ?? "")) return;
      await act(async () => { await renameAlbum(album.id, name.trim()); return name.trim() ? t("ตั้งชื่ออัลบั้มแล้ว", "Album named") : t("กลับไปโชว์เป็นวันที่แล้ว", "Showing the date again"); }, album.id);
      return;
    }
    const name = await askText({ title: t("เปลี่ยนชื่ออัลบั้ม", "Rename album"), initial: album.name, required: true, confirmText: t("บันทึก", "Save") });
    if (!name?.trim() || name.trim() === album.name) return;
    await act(async () => { await renameAlbum(album.id, name.trim()); return t("เปลี่ยนชื่ออัลบั้มแล้ว", "Album renamed"); }, album.id);
  };

  // ── ลากสลับลำดับ (เจ้าของสั่ง 2026-11-16 · จำลำดับต่ออัลบั้ม — เปลี่ยนวิธีเรียงแล้วลำดับที่จัดไว้ไม่หาย) ──
  //   ใช้ได้ตอนไม่ค้นหา · ลากแล้วสลับไปโหมด "จัดเอง" ให้เอง
  const canReorder = canEdit && !trashView && !searching;
  const movePhotoOrder = async (ids: string[], target: string, place: "before" | "after") => {
    if (!album) return;
    const cur = list.map((p) => p.id);
    const order = reorderIds(cur, ids, target, place);
    if (order.join() === cur.join()) return;
    const rank = new Map(order.map((id, i) => [id, i + 1]));
    setPhotos((ps) => ps && ps.map((p) => (rank.has(p.id) ? { ...p, sort_order: rank.get(p.id)! } : p)));
    if (photoSort !== "manual") setPhotoSort("manual");
    try { await reorderPhotos(album.id, order); }
    catch (e) { pushToast("error", (e as Error).message); void reload(album.id); }
  };
  const moveAlbumOrder = async (id: string, target: string, place: "before" | "after") => {
    if (!album) return;
    const cur = shownChildren.map((c) => c.id);
    const order = reorderIds(cur, [id], target, place);
    if (order.join() === cur.join()) return;
    const rank = new Map(order.map((x, i) => [x, i + 1]));
    setAlbums((as) => as && as.map((a) => (rank.has(a.id) ? { ...a, sort_order: rank.get(a.id)! } : a)));
    try { await reorderAlbums(album.id, order); }
    catch (e) { pushToast("error", (e as Error).message); void reload(album.id); }
  };
  const removeEmpty = async () => {
    if (!album || isDayAlbum(album)) return;
    if (!(await askConfirm({ title: t(`ลบอัลบั้ม "${album.name}"?`, `Delete "${album.name}"?`), message: t("อัลบั้มนี้ว่างแล้ว (ไม่มีรูป ไม่มีอัลบั้มย่อย)", "This album is empty"), variant: "danger", confirmText: t("ลบอัลบั้ม", "Delete album") }))) return;
    const parent = album.parent_id;
    await act(async () => { await deleteEmptyAlbum(album.id); return t("ลบอัลบั้มแล้ว", "Album deleted"); }, parent);
  };

  // ── ลากภายในหน้า: รูป → รูป = รวมเป็นอัลบั้มใหม่ · รูป → การ์ดอัลบั้ม/ชื่อในเส้นทาง = ย้ายเข้า · การ์ดอัลบั้ม → การ์ด/เส้นทาง = ย้ายทั้งอัลบั้ม ──
  const dragProps = (item: () => DragItem) => canEdit && !trashView ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { dragRef.current = item(); e.dataTransfer.setData(DRAG_MIME, "1"); e.dataTransfer.effectAllowed = "move"; },
    onDragEnd: () => { dragRef.current = null; setOverKey(null); },
  } : {};
  const isOurDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_MIME);
  const dropProps = (key: string, accept: (d: DragItem) => boolean, onDrop: (d: DragItem) => void) => ({
    onDragOver: (e: React.DragEvent) => { const d = dragRef.current; if (!isOurDrag(e) || !d || !accept(d)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; if (overKey !== key) setOverKey(key); },
    onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => { const d = dragRef.current; if (!isOurDrag(e) || !d || !accept(d)) return; e.preventDefault(); e.stopPropagation(); setOverKey(null); dragRef.current = null; onDrop(d); },
  });
  /** ลากรูป: ลากรูปที่เลือกไว้ = ไปทั้งชุด · ลากรูปที่ไม่ได้เลือก = รูปนั้นรูปเดียว */
  const photoDrag = (id: string): DragItem => ({ kind: "photos", ids: sel.has(id) ? [...sel] : [id] });
  /** ปล่อยบนอัลบั้ม: รูป = ย้ายเข้า · อัลบั้ม = ย้ายทั้งอัลบั้มเข้าไป */
  const dropOnAlbum = (target: SampleAlbum) => dropProps(`al:${target.id}`,
    (d) => (d.kind === "photos" ? target.id !== album?.id : canMoveAlbum(tree, d.id, target.id) && albums?.find((a) => a.id === d.id)?.parent_id !== target.id),
    (d) => (d.kind === "photos" ? movePhotos(d.ids, target) : moveAlbum(d.id, target)));

  /** ปล่อยบนรูป: ขอบซ้าย/ขวา = สลับลำดับ · กลาง = รวมเป็นอัลบั้มใหม่ (แบบเดิม) */
  const photoDrop = (id: string) => {
    const zoneHere = (e: React.DragEvent): DropZone => (canReorder ? zoneOf(e) : "merge");
    const ok = (e: React.DragEvent) => { const d = dragRef.current; return isOurDrag(e) && d?.kind === "photos" && !d.ids.includes(id) ? d : null; };
    return {
      onDragOver: (e: React.DragEvent) => { if (!ok(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; const key = `ph:${id}:${zoneHere(e)}`; if (overKey !== key) setOverKey(key); },
      onDragLeave: () => setOverKey((k) => (k?.startsWith(`ph:${id}:`) ? null : k)),
      onDrop: (e: React.DragEvent) => {
        const d = ok(e); if (!d || d.kind !== "photos") return;
        e.preventDefault(); e.stopPropagation();
        const z = zoneHere(e);
        setOverKey(null); dragRef.current = null;
        if (z === "merge") void createSub([...new Set([...d.ids, id])]);
        else void movePhotoOrder(d.ids, id, z);
      },
    };
  };
  /** ปล่อยบนการ์ดอัลบั้มย่อย: ลากอัลบั้มพี่น้องมาที่ขอบ = สลับลำดับ · กลาง (หรือลากรูปมา) = ย้ายเข้า (แบบเดิม) */
  const subAlbumDrop = (target: SampleAlbum) => {
    const into = dropOnAlbum(target);
    const sibling = (d: DragItem | null) => d?.kind === "album" && d.id !== target.id && albums?.find((a) => a.id === d.id)?.parent_id === target.parent_id;
    const zoneHere = (e: React.DragEvent): DropZone => { const d = dragRef.current; return canReorder && sibling(d) ? zoneOf(e) : "merge"; };
    return {
      onDragOver: (e: React.DragEvent) => {
        if (zoneHere(e) === "merge") { setOverKey((k) => (k?.startsWith(`alo:${target.id}:`) ? null : k)); into.onDragOver(e); return; }
        if (!isOurDrag(e)) return;
        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move";
        const key = `alo:${target.id}:${zoneOf(e)}`; if (overKey !== key) setOverKey(key);
      },
      onDragLeave: () => { setOverKey((k) => (k?.startsWith(`alo:${target.id}:`) || k === `al:${target.id}` ? null : k)); },
      onDrop: (e: React.DragEvent) => {
        const z = zoneHere(e);
        if (z === "merge") { into.onDrop(e); return; }
        const d = dragRef.current; if (!isOurDrag(e) || !d || d.kind !== "album") return;
        e.preventDefault(); e.stopPropagation(); setOverKey(null); dragRef.current = null;
        void moveAlbumOrder(d.id, target.id, z);
      },
    };
  };

  if (permsReady && !canView) return <EmptyState icon={<Icon value="i:lock" />} title={t("คุณไม่มีสิทธิ์ดูคลังไฟล์", "You can't view the file library")} hint={t("ขอสิทธิ์ \"ดูคลังไฟล์\" จากแอดมิน", "Ask an admin for file library access")} />;

  const dot = (color: string | null | undefined) => <BrandDot color={color} />;
  const albumLabel = albumCardLabel;

  return (
    <div {...drop.guard} ref={album ? wheelRef : albumGrid.wheelRef} className="space-y-4 px-4 py-5 sm:px-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Icon value="i:camera" /> SAMPLE Images</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("อัลบั้มรูปตัวอย่างของแต่ละแบรนด์ — เลือกรูปส่งเข้าใบงานใน Design Dashboard ได้ · รูปแปลงเป็น JPEG และเก็บในคลังไฟล์กลาง", "Sample photo albums per brand — send photos into Design Dashboard sheets")}</p>
        </div>
        {canUpload && (
          <>
            <input ref={fileRef} type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void upload(fs); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!up} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"><Icon value="i:upload" />{t("เลือกรูป", "Choose images")}</button>
          </>
        )}
        <a href="/master/design-dashboard" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon value="i:external-link" />Design Dashboard</a>
      </div>

      {err ? <ErrorState title={t("โหลดรูปตัวอย่างไม่สำเร็จ", "Could not load sample images")} hint={err} onRetry={() => void reload()} />
        : !albums ? <LoadingState className="py-16 text-sm" />
        : (
          <>
            {/* แถบแบรนด์ (ชิ้นส่วนร่วม ./parts — ใช้ในตัวเลือกไฟล์กลางด้วย) */}
            <SampleBrandBar brands={brands} albums={albums} tab={tab} onTab={switchTab} />

            <div ref={mq.ref} className="relative min-w-0 space-y-3">
              {mq.box && <div style={mq.box} className="rounded-sm border border-violet-500 bg-violet-500/10" />}
              {!album && (
                <>
                  <SampleSearchSort query={query} onQuery={setQuery} placeholder={t("ค้นชื่ออัลบั้ม / วันที่ / แบรนด์…", "Search album / date / brand…")}
                    sort={albumSort} onSort={setAlbumSort} options={SAMPLE_ALBUM_SORTS}>
                    <span className="flex-1" />
                    {cards.length > 0 && <GalleryColumnsControl cols={albumGrid.cols} onChange={albumGrid.setCols} options={GALLERY_COL_CHOICES} as="select" wheelHint className="max-sm:hidden" />}
                  </SampleSearchSort>
                  <div className="text-[13px] text-slate-500">
                    <b className="font-semibold text-slate-800">{tab === ALL ? t("อัลบั้มทุกแบรนด์", "All albums") : tab === NONE ? t("อัลบั้มที่ยังไม่ระบุแบรนด์", "Albums without a brand") : t(`อัลบั้มของ ${brandOf(tab)?.name ?? ""}`, `Albums of ${brandOf(tab)?.name ?? ""}`)}</b>
                    {cards.length > 0 && <> · {searching ? t(`พบ ${cards.length} อัลบั้ม (รวมอัลบั้มย่อย)`, `${cards.length} found (incl. sub-albums)`) : t(`${cards.length} อัลบั้ม`, `${cards.length} albums`)}</>}
                  </div>
                </>
              )}

              {/* ที่วางรูป / ความคืบหน้า — เปิดอัลบั้มอยู่ = เพิ่มเข้าอัลบั้มนั้น · หน้าแฟ้ม = อัลบั้มของแบรนด์ + วันนี้ */}
              {up ? <UploadProgress {...up} onCancel={() => { cancelRef.current = true; }} />
                : canUpload && (
                  <div {...drop.zone("main")} className={`rounded-xl border-2 border-dashed px-4 py-4 text-center text-sm transition ${drop.over === "main" ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"}`}>
                    <button type="button" onClick={() => fileRef.current?.click()} className="w-full">
                      <div className="text-2xl text-slate-400"><Icon value="i:upload" /></div>
                      {t("ลากรูปมาวางได้ทีละหลายรูป (ทั้งโฟลเดอร์ก็ได้) หรือกดเพื่อเลือก", "Drag in many photos (or a whole folder), or click to choose")}
                      <div className="mt-0.5 text-[12px] text-slate-400">
                        {album
                          ? t(`เพิ่มเข้าอัลบั้มนี้ (${albumBrand ? albumBrand.name + " · " : ""}${albumLabel(album)}) · ย่อไม่เกิน 2,400px + แปลงเป็น JPEG ให้เอง`, "Adds to this album · shrunk to ≤2,400px JPEG")
                          : t(`เข้าอัลบั้ม ${brandOf(uploadBrandId)?.name ?? "ไม่ระบุแบรนด์"} · ${thaiShortDate(new Date())} · ย่อไม่เกิน 2,400px + แปลงเป็น JPEG ให้เอง`, `Goes into ${brandOf(uploadBrandId)?.name ?? "no brand"} · today · shrunk to ≤2,400px JPEG`)}
                      </div>
                    </button>
                    {!album && tab === ALL && brands.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                        <span className="text-[12px] text-slate-500">{t("ลงเข้าแบรนด์:", "Into brand:")}</span>
                        {brands.map((b) => (
                          <button key={b.id} type="button" onClick={() => setLastBrand(b.id)} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] ${uploadBrandId === b.id ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{dot(b.color)}{b.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {album ? (
                <>
                {/* เส้นทาง: ← อัลบั้มทั้งหมด · อัลบั้มของวัน › อัลบั้มย่อย — วางรูป/อัลบั้มบนชื่อ = ย้ายขึ้นไปที่นั่น */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <SampleAlbumPath path={path} brandColor={albumBrand?.color} nameOf={nameOf} onBack={() => closeAlbum()} onOpen={(id) => void openAlbum(id)} crumbExtra={dropOnAlbum} overKey={overKey} />
                  {!album.brand_id && !album.parent_id && canEdit && brands.length > 0 && (
                    <button type="button" onClick={() => setToBrand((x) => !x)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 text-[12px] text-violet-700 hover:bg-violet-50"><Icon value="i:arrow-right" />{t("ย้ายอัลบั้มเข้าแบรนด์", "Move album into a brand")}</button>
                  )}
                  {isDayAlbum(album) && canEdit && (
                    <button type="button" onClick={() => void rename()} disabled={busy} title={t("ตั้งชื่อให้อัลบั้มของวันนี้ (วันที่ยังเก็บไว้)", "Give this day album a name (date is kept)")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:pencil" />{album.display_name ? t("แก้ชื่อ", "Rename") : t("ตั้งชื่อ", "Name it")}</button>
                  )}
                  {!isDayAlbum(album) && canEdit && (
                    <>
                      <button type="button" onClick={() => void rename()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:pencil" />{t("เปลี่ยนชื่อ", "Rename")}</button>
                      <button type="button" onClick={() => setChooser((c) => (c === "album" ? null : "album"))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:transfer-out" />{t("ย้ายอัลบั้มนี้", "Move album")}</button>
                      {album.counts.photos + album.counts.trash === 0 && !children.length && (
                        <button type="button" onClick={() => void removeEmpty()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-[12px] text-rose-600 hover:bg-rose-50"><Icon value="i:trash" />{t("ลบอัลบั้ม (ว่าง)", "Delete empty album")}</button>
                      )}
                    </>
                  )}
                  {!trashView && (canEdit || productLinkLabel(album)) && (
                    productLinkLabel(album)
                      ? <button type="button" onClick={() => canEdit && setLinking(true)} title={canEdit ? t("แก้การเชื่อมสินค้า", "Edit product link") : undefined}
                          className="inline-flex h-8 max-w-[16rem] items-center gap-1 truncate rounded-full bg-violet-100 px-3 text-[12px] font-medium text-violet-800 hover:bg-violet-200"><Icon value="i:link" />{productLinkLabel(album)}</button>
                      : <button type="button" onClick={() => setLinking(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:link" />{t("เชื่อม SKU / Parent", "Link SKU / Parent")}</button>
                  )}
                  {canUpload && !trashView && (
                    <button type="button" onClick={() => void createSub([])} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:folders" />{t("อัลบั้มย่อย", "Sub-album")}</button>
                  )}
                  <span className="flex-1" />
                  {list.length > 0 && (
                    <button type="button" onClick={() => setSel(allOn ? new Set() : new Set(list.map((p) => p.id)))} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50">
                      {allOn ? t("ไม่เลือกทั้งหมด", "Clear all") : t(`เลือกทั้งหมด (${list.length})`, `Select all (${list.length})`)}
                    </button>
                  )}
                  {(trashCount > 0 || trashView) && (
                    <button type="button" onClick={() => { setTrashView((x) => !x); setSel(new Set()); }} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-[12px] ${trashView ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      <Icon value={trashView ? "i:arrow-left" : "i:trash"} />{trashView ? t("กลับไปที่รูป", "Back to photos") : t(`ถังขยะ (${trashCount})`, `Trash (${trashCount})`)}
                    </button>
                  )}
                  <GalleryColumnsControl cols={cols} onChange={setCols} as="select" wheelHint />
                </div>

                {/* รูปที่มีอยู่แล้วของสินค้าที่เชื่อม — เทียบกับ SAMPLE ได้เลย (ข้อเสนอ 1) */}
                {!trashView && linkedImgs.length > 0 && (
                  <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-2">
                    <div className="mb-1.5 text-[12px] text-violet-800"><Icon value="i:photo" /> {t(`รูปที่มีอยู่แล้วของ ${productLinkLabel(album) ?? ""}`, `Existing photos of ${productLinkLabel(album) ?? ""}`)}</div>
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                      {linkedImgs.map((im) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={im.key} src={imgUrl(im.key, 160)} alt="" title={im.label} loading="lazy" className="h-16 w-16 shrink-0 rounded-md border border-violet-100 bg-white object-cover" />
                      ))}
                    </div>
                  </div>
                )}

                {!trashView && <AlbumNoteBox albumId={album.id} note={album.note ?? null} canEdit={canEdit} label={nameOf(album)}
                  onSaved={(n) => setAlbums((as) => as && as.map((a) => (a.id === album.id ? { ...a, note: n } : a)))} />}

                <SampleSearchSort query={query} onQuery={setQuery} placeholder={t("ค้นชื่อรูป / อัลบั้มย่อย / เลขใบงาน DS-…", "Search photo / sub-album / DS-…")}
                  sort={photoSort} onSort={setPhotoSort} options={SAMPLE_PHOTO_SORTS}>
                  {searching && photos && <span className="text-[12px] text-slate-500">{t(`พบ ${list.length} จาก ${allInView.length} รูป`, `${list.length} of ${allInView.length}`)}</span>}
                </SampleSearchSort>

                {toBrand && !album.brand_id && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/50 p-2 text-[12px]">
                    <span className="text-slate-600">{t("อัลบั้มนี้เป็นของแบรนด์ไหน?", "Which brand is this album?")}</span>
                    {brands.map((b) => (
                      <button key={b.id} type="button" disabled={busy} onClick={() => void doSetBrand(b.id)}
                        className={`relative inline-flex h-8 items-center gap-1 rounded-full border bg-white px-3 text-[12px] hover:border-violet-300 disabled:opacity-60 ${album.suggested_brand_id === b.id ? "border-violet-400 text-violet-800" : "border-slate-200 text-slate-700"}`}>
                        {dot(b.color)}{b.name}{album.suggested_brand_id === b.id && <span className="ml-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{t("แนะนำ", "Suggested")}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* แผงเลือกอัลบั้มปลายทาง: ย้ายรูปที่เลือก / ย้ายทั้งอัลบั้มนี้ (ใช้ได้ทุกเครื่อง รวมมือถือที่ลากไม่สะดวก) */}
                {chooser && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2 text-[12px]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="font-medium text-slate-700">{chooser === "photos" ? t(`ย้าย ${selected.length} รูปไปอัลบั้มไหน?`, `Move ${selected.length} image(s) to which album?`) : chooser === "albums" ? t(`ย้าย ${selAlbums.size} อัลบั้มไปไว้ที่ไหน?`, `Move ${selAlbums.size} album(s) where?`) : t(`ย้ายอัลบั้ม "${album.name}" ไปไว้ที่ไหน?`, `Move "${album.name}" where?`)}</span>
                      <button type="button" onClick={() => setChooser(null)} aria-label={t("ปิด", "Close")} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Icon value="i:x" /></button>
                    </div>
                    <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                      {chooser === "albums" && <button type="button" disabled={busy} onClick={() => moveAlbums([...selAlbums], null)} className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 hover:border-violet-300"><Icon value="i:layout-grid" />{t("ชั้นบนสุด (หน้าแฟ้ม)", "Top level")}</button>}
                      {chooser === "album" && album.parent_id && <button type="button" disabled={busy} onClick={() => moveAlbum(album.id, null)} className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 hover:border-violet-300"><Icon value="i:layout-grid" />{t("ชั้นบนสุด (หน้าแฟ้ม)", "Top level")}</button>}
                      {(albums ?? []).filter((a) => a.brand_id === album.brand_id && (chooser === "photos" ? a.id !== album.id : chooser === "albums" ? a.id !== album.id && !selAlbums.has(a.id) && [...selAlbums].every((id) => canMoveAlbum(tree, id, a.id)) : a.id !== album.parent_id && canMoveAlbum(tree, album.id, a.id))).slice(0, 60).map((a) => (
                        <button key={a.id} type="button" disabled={busy} onClick={() => (chooser === "photos" ? movePhotos(selected.map((p) => p.id), a) : chooser === "albums" ? moveAlbums([...selAlbums], a) : moveAlbum(album.id, a))}
                          className="inline-flex h-8 max-w-full items-center gap-1 truncate rounded-full border border-slate-200 bg-white px-3 text-slate-700 hover:border-violet-300 disabled:opacity-60">
                          <Icon value="i:folder" />{albumPath(tree, a.id).map((id) => nameOf(albums?.find((x) => x.id === id))).join(" › ")}
                        </button>
                      ))}
                      {chooser === "photos" && canUpload && <button type="button" disabled={busy} onClick={() => void createSub(selected.map((p) => p.id))} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-violet-300 bg-violet-50 px-3 text-violet-700"><Icon value="i:folders" />{t("อัลบั้มใหม่ในอัลบั้มนี้", "New album here")}</button>}
                    </div>
                  </div>
                )}

                {/* อัลบั้มย่อย — กดเปิด · ลากรูป/อัลบั้มมาวาง = ย้ายเข้า · ลากการ์ดไปวางที่อื่น = ย้ายทั้งอัลบั้ม */}
                {shownChildren.length > 0 && !trashView && (
                  <div>
                    <div className="mb-1.5 text-[12px] font-medium text-slate-400">{t(`อัลบั้มย่อย (${shownChildren.length})`, `Sub-albums (${shownChildren.length})`)}</div>
                    <div className="grid max-sm:!grid-cols-2" style={gridStyle}>
                      {shownChildren.map((c) => (
                        <SampleAlbumCard key={c.id} sub album={c} selected={selAlbums.has(c.id)} onOpen={() => (selAlbums.size ? toggleAlbum(c.id) : void openAlbum(c.id))} highlight={overKey === `al:${c.id}`}
                          edge={overKey === `alo:${c.id}:before` ? "before" : overKey === `alo:${c.id}:after` ? "after" : null}
                          extra={{ ...dragProps(() => ({ kind: "album", id: c.id })), ...subAlbumDrop(c), ...selAttr(`a:${c.id}`) }} />
                      ))}
                    </div>
                  </div>
                )}

                {canEdit && !trashView && list.length > 1 && (
                  <p className="text-[11px] text-slate-400">{canReorder
                    ? t("ลากรูปไปวางที่ขอบซ้าย/ขวาของอีกรูป = สลับลำดับ (รูปแรก = ปก) · วางกลางรูป = รวมเป็นอัลบั้มใหม่ · วางบนการ์ดอัลบั้ม หรือชื่ออัลบั้มด้านบน = ย้ายไปที่นั่น · อัลบั้มย่อยลากที่ขอบการ์ดเพื่อสลับลำดับได้เหมือนกัน", "Drop on the left/right edge of a photo to reorder (first = cover) · drop in the middle to make an album · drop on an album card or the path to move")
                    : t("ลากรูปไปวางบนอีกรูป = รวมเป็นอัลบั้มใหม่ · วางบนการ์ดอัลบั้ม หรือชื่ออัลบั้มด้านบน = ย้ายไปที่นั่น · เลือกหลายรูปแล้วลากไปพร้อมกันได้ (ล้างคำค้นก่อน ถึงจะลากสลับลำดับได้)", "Drop a photo on another photo to make an album · drop on an album card or the path above to move it")}</p>
                )}

                {photos === null ? <LoadingState className="py-12 text-sm" />
                  : !list.length ? ((shownChildren.length && !trashView) ? null : searching && allInView.length ? <EmptyState icon={<Icon value="i:search" />} className="p-8" title={t(`ไม่พบ "${query.trim()}"`, `No match for "${query.trim()}"`)} hint={t("ลองคำอื่น หรือกดกากบาทในช่องค้นเพื่อดูทั้งหมด", "Try another word, or clear the search")} /> : <EmptyState icon={<Icon value={trashView ? "i:trash" : "i:photo"} />} className="p-8"
                      title={trashView ? t("ถังขยะว่าง", "Trash is empty") : t("ยังไม่มีรูปในอัลบั้มนี้", "No images yet")}
                      hint={trashView ? undefined : t("ลากรูปมาวางด้านบนได้เลย", "Drop images above")} />)
                  : (
                    <div className="grid" style={gridStyle}>
                      {list.map((p) => {
                        const on = sel.has(p.id);
                        const zone = overKey?.startsWith(`ph:${p.id}:`) ? (overKey.slice(`ph:${p.id}:`.length) as DropZone) : null;
                        const over = zone === "merge";
                        const idx = list.indexOf(p);
                        return (
                          <SamplePhotoTile key={p.id} photo={p} on={on} onToggle={() => toggle(p.id)} faded={trashView} highlight={over}
                            extra={{ ...dragProps(() => photoDrag(p.id)), ...(trashView ? {} : photoDrop(p.id)), ...selAttr(`p:${p.id}`) }}>
                            {over && <span className="pointer-events-none absolute inset-x-1.5 top-1.5 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-center text-[11px] text-white">{t("ปล่อย = รวมเป็นอัลบั้มใหม่", "Drop to make an album")}</span>}
                            {(zone === "before" || zone === "after") && <span aria-hidden className={`pointer-events-none absolute inset-y-1 z-10 w-1.5 rounded-full bg-violet-500 ${zone === "before" ? "left-0" : "right-0"}`} />}
                            {photoSort === "manual" && !searching && !trashView && <span className="pointer-events-none absolute bottom-[34px] left-1.5 rounded-md bg-white/90 px-1.5 text-[10.5px] font-medium text-slate-600 shadow-sm">{idx === 0 ? t("ปก", "Cover") : idx + 1}</span>}
                          </SamplePhotoTile>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : !cards.length ? (
                searching ? <EmptyState icon={<Icon value="i:search" />} className="p-8" title={t(`ไม่พบ "${query.trim()}"`, `No match for "${query.trim()}"`)} hint={t("ลองคำอื่น หรือเปลี่ยนแบรนด์ด้านบน", "Try another word or brand")} />
                : <EmptyState icon={<Icon value="i:folder" />} className="p-8" title={t("ยังไม่มีอัลบั้ม", "No albums yet")} hint={canUpload ? t("ลากรูปมาวางด้านบน ระบบสร้างอัลบั้มของวันนี้ให้เอง", "Drop photos above — today's album is created for you") : undefined} />
              ) : (
                /* หน้าแฟ้ม: การ์ดอัลบั้ม ปกรวมรูปแบบปรับตามจำนวนรูป (ของกลาง AlbumCover — แบบ C ที่เจ้าของเลือก) */
                /* จำนวนการ์ดต่อแถวตามที่เลือก (Ctrl + ลูกกลิ้ง / ▦) · มือถือคงไว้ 1–2 ต่อแถวเหมือนเดิม */
                <div style={albumGrid.gridStyle} className="max-sm:!grid-cols-2 max-[419px]:!grid-cols-1">
                  {cards.map(({ album: a, inside }) => <SampleAlbumCard key={a.id} album={a} brand={brandOf(a.brand_id)} inside={inside} onOpen={() => void openAlbum(a.id)} />)}
                </div>
              )}
            </div>
          </>
        )}

      <BulkActionBar count={selected.length + selAlbums.size}
        unit={selAlbums.size && !selected.length ? t("อัลบั้ม", "albums") : selAlbums.size ? t("รายการ", "items") : t("รูป", "images")}
        onClear={() => { setSel(new Set()); setSelAlbums(new Set()); }}>
        {selAlbums.size > 0 && canEdit && (
          <button type="button" onClick={() => setChooser("albums")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:transfer-out" />{t(`ย้าย ${selAlbums.size} อัลบั้มไป…`, `Move ${selAlbums.size} album(s)…`)}</button>
        )}
        {selAlbums.size > 0 && selected.length > 0 && <span className="text-[12px] text-slate-500">{t("เลือกทั้งรูปและอัลบั้ม — ทำกับรูปได้เมื่อเลือกแต่รูป", "Photos and albums selected — photo actions need photos only")}</span>}
        {!trashView && !selAlbums.size && (
          <>
            {album && canUpload && <button type="button" onClick={() => void createSub(selected.map((p) => p.id))} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon value="i:folders" />{t("สร้างอัลบั้มจากที่เลือก", "New album from selection")}</button>}
            {album && canEdit && <button type="button" onClick={() => setChooser("photos")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:transfer-out" />{t("ย้ายไปอัลบั้ม…", "Move to album…")}</button>}
            {canMove && <button type="button" onClick={() => setPicking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"><Icon value="i:arrow-right" />{t("ส่งไป Design Dashboard", "Send to Design Dashboard")}</button>}
            {canDelete && <button type="button" onClick={() => setAskDelete(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-600 hover:bg-rose-50"><Icon value="i:trash" />{t("ลบ (ไปถังขยะ)", "Delete (to trash)")}</button>}
            {!canMove && !canDelete && <span className="text-[12px] text-slate-500">{t("คุณดูได้อย่างเดียว — ส่ง/ลบต้องมีสิทธิ์เพิ่ม", "View only — sending/deleting needs more access")}</span>}
          </>
        )}
        {trashView && canEdit && <button type="button" onClick={() => void doRestore()} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon value="i:arrow-back-up" />{t("เอากลับ", "Restore")}</button>}
      </BulkActionBar>

      {album && (
        <LinkProductDialog open={linking} albumId={album.id} albumName={nameOf(album)} parentCodes={album.parent_sku_codes ?? []} skuCodes={album.sku_codes ?? []}
          onClose={() => setLinking(false)}
          onSaved={(r) => {
            setAlbums((as) => as && as.map((a) => (a.id === album.id ? { ...a, ...r } : a)));
            pushToast("success", r.parent_sku_codes.length ? t(`เชื่อมกับ ${r.parent_sku_codes.join(", ")} แล้ว — รูปโชว์ที่หน้าสินค้าในส่วน "รูป SAMPLE"`, "Linked") : t("เลิกเชื่อมสินค้าแล้ว", "Unlinked"));
            void reload(album.id);
          }} />
      )}

      <DropAlbumDialog files={dropFiles} inside={album ? nameOf(album) : ""} defaultName={dropName} mode={dropMode} onMode={setDropMode}
        defaultParentCode={album?.parent_sku_codes?.[0] || lastParent || null}
        onCancel={() => setDropFiles(null)} onConfirm={(plan) => void confirmDrop(plan)} />

      <DesignSheetPickerModal open={picking} onClose={() => setPicking(false)} onConfirm={doMove}
        initialBrand={albumBrand?.name ?? null}
        createNew={canMove && selected.length ? {   // ＋ สร้างใบงานใหม่จากรูปที่เลือก (เจ้าของขอ 2026-11-16) · ชื่อตั้งต้น = ชื่ออัลบั้ม · แบรนด์ = แบรนด์อัลบั้ม
          assetIds: selected.map((p) => p.id), imageUrls: selected.map((p) => imgUrl(p.r2_key, 240)), brandId: albumBrand?.id ?? null,
          name: album ? (isDayAlbum(album) && !album.display_name?.trim() ? album.name : albumCardLabel(album)) : null,
          imagesLabel: t(`รูปจาก SAMPLE Images ${selected.length} รูป — แนบให้ตอนกดบันทึก (รูปแรก = ปก)`, `${selected.length} SAMPLE image(s) — attached when you save (first = cover)`),
          onCreated: async () => { setSel(new Set()); await reload(); },
        } : null}
        title={t(`ส่ง ${selected.length} รูปไปใบงานไหน?`, `Send ${selected.length} image(s) to which sheet?`)}
        confirmText={t(`ส่ง ${selected.length} รูป`, `Send ${selected.length}`)}
        head={(
          <div className="flex gap-1 overflow-x-auto pb-1">
            {selected.slice(0, 12).map((p) => <img key={p.id} src={imgUrl(p.r2_key, 120)} alt="" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />)}
            {selected.length > 12 && <span className="self-center px-1 text-[12px] text-slate-400">+{selected.length - 12}</span>}
          </div>
        )} />

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={() => void doDelete()} variant="danger" loading={busy}
        title={t(`ลบ ${selected.length} รูป?`, `Delete ${selected.length} image(s)?`)}
        message={t("รูปจะไปอยู่ถังขยะของอัลบั้มนี้ เอากลับได้ภายหลัง · รูปที่อยู่ในใบงานหรือใช้อยู่ที่อื่น ระบบจะไม่ยอมลบ", "Images go to this album's trash and can be restored · images used in sheets or elsewhere can't be deleted")}
        confirmText={t("ลบไปถังขยะ", "Move to trash")} />
    </div>
  );
}
