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
import { useFileDrop } from "@/components/file-drop";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { GalleryColumnsControl, useGalleryColumns } from "@/components/gallery-columns";
import { DesignSheetPickerModal, type PickedDesignSheet } from "@/components/design-sheet-picker";
import { AlbumCover } from "@/components/album-cover";
import { safeColor } from "@/components/design-dashboard/dashboard-helpers";
import { withImageWidth } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { albumPath, canMoveAlbum, photosToMove, splitSampleFiles, thaiShortDate, type SampleAlbum, type SampleBrand, type SamplePhoto } from "@/lib/sample-images";
import { createSubAlbum, deleteEmptyAlbum, ensureTodayAlbum, loadSamples, moveAlbumTo, movePhotosTo, moveToSheet, renameAlbum, restoreSample, setAlbumBrand, trashSample, uploadSample } from "./api";

/** ลากภายในหน้า (รูป/อัลบั้ม) — ใช้ชนิดข้อมูลของเราเอง ตัวรับไฟล์จากเครื่อง (useFileDrop) จะไม่ยุ่ง */
const DRAG_MIME = "application/x-erp-sample";
type DragItem = { kind: "photos"; ids: string[] } | { kind: "album"; id: string };

/** แท็บแบรนด์: "all" = ทุกแบรนด์ · "none" = ไม่ระบุแบรนด์ · อื่น ๆ = id แบรนด์ */
type BrandTab = string;
const ALL = "all", NONE = "none";
const strPref = (raw: unknown) => (typeof raw === "string" && raw ? raw : null);

const imgUrl = (key: string, w?: number) => {
  const u = `/api/r2-image?key=${encodeURIComponent(key)}`;
  return w ? withImageWidth(u, w) ?? u : u;
};
const inTab = (a: SampleAlbum, tab: BrandTab) => tab === ALL || (tab === NONE ? !a.brand_id : a.brand_id === tab);

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
  const [chooser, setChooser] = useState<null | "photos" | "album">(null);   // แผงเลือกอัลบั้มปลายทาง
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const cancelRef = useRef(false);
  const [picking, setPicking] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [toBrand, setToBrand] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { cols, setCols, gridStyle } = useGalleryColumns("sample-images", 6);
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
      setBrands(d.brands); setAlbums(d.albums); setAlbumId(pickId); setPhotos(pickId ? d.photos ?? [] : null);
      setSel(new Set());
    } catch (e) { setErr((e as Error).message); }
  }, [albumId, tab]);
  useEffect(() => { if (permsReady && canView) void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [permsReady, canView]);

  const openAlbum = async (id: string) => {
    setAlbumId(id); setPhotos(null); setSel(new Set()); setTrashView(false); setToBrand(false); setChooser(null);
    try { const d = await loadSamples(id); setAlbums(d.albums); setBrands(d.brands); setPhotos(d.photos ?? []); }
    catch (e) { setErr((e as Error).message); }
  };
  /** กลับหน้าแฟ้ม (การ์ดอัลบั้ม) */
  const closeAlbum = () => { setAlbumId(null); setPhotos(null); setSel(new Set()); setTrashView(false); setToBrand(false); setChooser(null); };
  const switchTab = (next: BrandTab) => { setTab(next); closeAlbum(); };

  // ── แบรนด์ที่จะลงรูป: แท็บแบรนด์ = แบรนด์นั้น · ไม่ระบุแบรนด์ = ไม่มี · ทุกแบรนด์ = ปุ่มเลือกในกรอบวางรูป (จำล่าสุด) ──
  const uploadBrandId: string | null = tab === NONE ? null : tab !== ALL ? tab : (brandOf(lastBrand)?.id ?? brands[0]?.id ?? null);

  const upload = async (files: File[]) => {
    if (!canUpload) { pushToast("error", t("คุณไม่มีสิทธิ์ลงรูป", "You can't upload images")); return; }
    if (up) { pushToast("info", t("กำลังลงรูปชุดก่อนอยู่ — รอสักครู่", "Still uploading — please wait")); return; }
    const { ok, unsupported, notImage } = splitSampleFiles(files);
    if (unsupported.length) pushToast("warning", t(`ข้าม ${unsupported.length} ไฟล์ (RAW/ไฟล์งาน แปลงเป็น JPEG ในเว็บไม่ได้ — ลง JPG/PNG/HEIC แทน)`, `Skipped ${unsupported.length} RAW/work files`));
    if (notImage.length) pushToast("warning", t(`ข้าม ${notImage.length} ไฟล์ที่ไม่ใช่รูป`, `Skipped ${notImage.length} non-image files`));
    if (!ok.length) return;
    // เปิดอัลบั้มอยู่ = เพิ่มเข้าอัลบั้มนั้น (เหมือนวางของลงแฟ้ม · เจ้าของเลือก 2026-11-14) · หน้าแฟ้ม = อัลบั้มของแบรนด์ + วันนี้
    const openNow = albums?.find((a) => a.id === albumId) ?? null;
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
      setTrashView(false);
      await reload(album.id, nextTab);
      if (done) pushToast("success", t(`ลง ${done} รูปใน ${album.name} แล้ว${dup ? ` (${dup} รูปเคยลงไว้ ใช้รูปเดิม)` : ""}`, `Added ${done} image(s) to ${album.name}`));
      if (fails.length) pushToast("error", t(`ลงไม่สำเร็จ ${fails.length} รูป — ${fails[0]}`, `${fails.length} failed — ${fails[0]}`));
      if (cancelRef.current) pushToast("info", t("หยุดลงรูปแล้ว", "Upload stopped"));
    } catch (e) {
      pushToast("error", (e as Error).message);
    } finally { setUp(null); }
  };
  const drop = useFileDrop((files) => void upload(files), { folders: true, disabled: !canUpload || !!up, onBusy: () => pushToast("info", t("กำลังลงรูปอยู่ — รอสักครู่", "Uploading — please wait")) });

  // ── รายการ ──
  const album = albums?.find((a) => a.id === albumId) ?? null;
  const albumBrand = brandOf(album?.brand_id);
  // หน้าแฟ้ม = อัลบั้มชั้นบนสุดของแท็บ · อัลบั้มย่อยโผล่ตอนเปิดอัลบั้มแม่
  const tabAlbums = useMemo(() => (albums ?? []).filter((a) => inTab(a, tab) && !a.parent_id), [albums, tab]);
  const tree = useMemo(() => (albums ?? []).map((a) => ({ id: a.id, parent_id: a.parent_id })), [albums]);
  const path = useMemo(() => (album ? albumPath(tree, album.id).map((id) => albums!.find((a) => a.id === id)!) : []), [album, tree, albums]);
  const children = useMemo(() => (album ? (albums ?? []).filter((a) => a.parent_id === album.id) : []), [album, albums]);
  const list = useMemo(() => (photos ?? []).filter((p) => p.trashed === trashView), [photos, trashView]);
  const trashCount = (photos ?? []).filter((p) => p.trashed).length;
  const selected = list.filter((p) => sel.has(p.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = list.length > 0 && list.every((p) => sel.has(p.id));
  const brandTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of albums ?? []) { const k = a.brand_id ?? NONE; m.set(k, (m.get(k) ?? 0) + a.counts.photos); }
    return m;
  }, [albums]);
  const hasNoBrand = (albums ?? []).some((a) => !a.brand_id);

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
  const nameOf = (a: SampleAlbum | null | undefined) => (a ? (a.parent_id ? a.name : `${brandOf(a.brand_id)?.name ? `${brandOf(a.brand_id)!.name} · ` : ""}${thaiShortDate(new Date(a.created_at))}`) : "");
  const act = async (fn: () => Promise<string | null>, stayOn?: string | null) => {
    setBusy(true);
    try { const msg = await fn(); if (msg) pushToast("success", msg); await reload(stayOn); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  const createSub = async (ids: string[]) => {
    if (!album) return;
    const name = await askText({ title: ids.length ? t(`รวม ${ids.length} รูปเป็นอัลบั้มใหม่`, `New album from ${ids.length} image(s)`) : t("สร้างอัลบั้มย่อย", "New sub-album"), message: t(`อยู่ใน ${nameOf(album)}`, `Inside ${nameOf(album)}`), initial: t("อัลบั้มใหม่", "New album"), required: true, confirmText: t("สร้างอัลบั้ม", "Create album") });
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
    if (!album?.parent_id) return;
    const name = await askText({ title: t("เปลี่ยนชื่ออัลบั้ม", "Rename album"), initial: album.name, required: true, confirmText: t("บันทึก", "Save") });
    if (!name?.trim() || name.trim() === album.name) return;
    await act(async () => { await renameAlbum(album.id, name.trim()); return t("เปลี่ยนชื่ออัลบั้มแล้ว", "Album renamed"); }, album.id);
  };
  const removeEmpty = async () => {
    if (!album?.parent_id) return;
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

  if (permsReady && !canView) return <EmptyState icon={<Icon value="i:lock" />} title={t("คุณไม่มีสิทธิ์ดูคลังไฟล์", "You can't view the file library")} hint={t("ขอสิทธิ์ \"ดูคลังไฟล์\" จากแอดมิน", "Ask an admin for file library access")} />;

  const dot = (color: string | null | undefined) => <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ? safeColor(color) : "#cbd5e1" }} />;
  const pill = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${on ? "border-violet-300 bg-violet-50 font-medium text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
  const albumLabel = (a: SampleAlbum) => (a.parent_id ? a.name : thaiShortDate(new Date(a.created_at)));

  return (
    <div {...drop.guard} className="space-y-4 px-4 py-5 sm:px-8">
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
            {/* แถบแบรนด์ */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button type="button" className={pill(tab === ALL)} onClick={() => switchTab(ALL)}><Icon value="i:layout-grid" />{t("ทุกแบรนด์", "All brands")}</button>
              {brands.map((b) => (
                <button key={b.id} type="button" className={pill(tab === b.id)} onClick={() => switchTab(b.id)}>
                  {dot(b.color)}{b.name}{brandTotals.get(b.id) ? <span className="text-[11px] tabular-nums text-slate-400">{brandTotals.get(b.id)}</span> : null}
                </button>
              ))}
              {(hasNoBrand || tab === NONE) && <button type="button" className={pill(tab === NONE)} onClick={() => switchTab(NONE)}><Icon value="i:help-circle" />{t("ไม่ระบุแบรนด์", "No brand")}<span className="text-[11px] tabular-nums text-slate-400">{brandTotals.get(NONE) ?? 0}</span></button>}
            </div>

            <div className="min-w-0 space-y-3">
              {!album && (
                <div className="text-[13px] text-slate-500">
                  <b className="font-semibold text-slate-800">{tab === ALL ? t("อัลบั้มทุกแบรนด์", "All albums") : tab === NONE ? t("อัลบั้มที่ยังไม่ระบุแบรนด์", "Albums without a brand") : t(`อัลบั้มของ ${brandOf(tab)?.name ?? ""}`, `Albums of ${brandOf(tab)?.name ?? ""}`)}</b>
                  {tabAlbums.length > 0 && <> · {t(`${tabAlbums.length} อัลบั้ม`, `${tabAlbums.length} albums`)}</>}
                </div>
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
                  <button type="button" onClick={closeAlbum} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:arrow-left" />{t("อัลบั้มทั้งหมด", "All albums")}</button>
                  {path.map((a, i) => {
                    const last = i === path.length - 1;
                    return (
                      <span key={a.id} className="flex items-center gap-1">
                        {i > 0 && <span className="text-slate-300">›</span>}
                        <button type="button" {...(last ? {} : dropOnAlbum(a))} onClick={() => { if (!last) void openAlbum(a.id); }}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[14px] ${last ? "cursor-default font-semibold text-slate-800" : "text-slate-600 hover:bg-slate-100"} ${overKey === `al:${a.id}` ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}>
                          {i === 0 ? dot(albumBrand?.color) : <Icon value="i:folder" />}{nameOf(a)}
                        </button>
                      </span>
                    );
                  })}
                  {!album.brand_id && !album.parent_id && canEdit && brands.length > 0 && (
                    <button type="button" onClick={() => setToBrand((x) => !x)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 text-[12px] text-violet-700 hover:bg-violet-50"><Icon value="i:arrow-right" />{t("ย้ายอัลบั้มเข้าแบรนด์", "Move album into a brand")}</button>
                  )}
                  {album.parent_id && canEdit && (
                    <>
                      <button type="button" onClick={() => void rename()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:pencil" />{t("เปลี่ยนชื่อ", "Rename")}</button>
                      <button type="button" onClick={() => setChooser((c) => (c === "album" ? null : "album"))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:transfer-out" />{t("ย้ายอัลบั้มนี้", "Move album")}</button>
                      {album.counts.photos + album.counts.trash === 0 && !children.length && (
                        <button type="button" onClick={() => void removeEmpty()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-[12px] text-rose-600 hover:bg-rose-50"><Icon value="i:trash" />{t("ลบอัลบั้ม (ว่าง)", "Delete empty album")}</button>
                      )}
                    </>
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
                  <GalleryColumnsControl cols={cols} onChange={setCols} as="select" />
                </div>

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
                      <span className="font-medium text-slate-700">{chooser === "photos" ? t(`ย้าย ${selected.length} รูปไปอัลบั้มไหน?`, `Move ${selected.length} image(s) to which album?`) : t(`ย้ายอัลบั้ม "${album.name}" ไปไว้ที่ไหน?`, `Move "${album.name}" where?`)}</span>
                      <button type="button" onClick={() => setChooser(null)} aria-label={t("ปิด", "Close")} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Icon value="i:x" /></button>
                    </div>
                    <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                      {chooser === "album" && <button type="button" disabled={busy} onClick={() => moveAlbum(album.id, null)} className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 hover:border-violet-300"><Icon value="i:layout-grid" />{t("ชั้นบนสุด (หน้าแฟ้ม)", "Top level")}</button>}
                      {(albums ?? []).filter((a) => a.brand_id === album.brand_id && (chooser === "photos" ? a.id !== album.id : a.id !== album.parent_id && canMoveAlbum(tree, album.id, a.id))).slice(0, 60).map((a) => (
                        <button key={a.id} type="button" disabled={busy} onClick={() => (chooser === "photos" ? movePhotos(selected.map((p) => p.id), a) : moveAlbum(album.id, a))}
                          className="inline-flex h-8 max-w-full items-center gap-1 truncate rounded-full border border-slate-200 bg-white px-3 text-slate-700 hover:border-violet-300 disabled:opacity-60">
                          <Icon value="i:folder" />{albumPath(tree, a.id).map((id) => nameOf(albums?.find((x) => x.id === id))).join(" › ")}
                        </button>
                      ))}
                      {chooser === "photos" && canUpload && <button type="button" disabled={busy} onClick={() => void createSub(selected.map((p) => p.id))} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-violet-300 bg-violet-50 px-3 text-violet-700"><Icon value="i:folders" />{t("อัลบั้มใหม่ในอัลบั้มนี้", "New album here")}</button>}
                    </div>
                  </div>
                )}

                {/* อัลบั้มย่อย — กดเปิด · ลากรูป/อัลบั้มมาวาง = ย้ายเข้า · ลากการ์ดไปวางที่อื่น = ย้ายทั้งอัลบั้ม */}
                {children.length > 0 && !trashView && (
                  <div>
                    <div className="mb-1.5 text-[12px] font-medium text-slate-400">{t(`อัลบั้มย่อย (${children.length})`, `Sub-albums (${children.length})`)}</div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {children.map((c) => (
                        <button key={c.id} type="button" onClick={() => void openAlbum(c.id)} {...dragProps(() => ({ kind: "album", id: c.id }))} {...dropOnAlbum(c)}
                          className={`overflow-hidden rounded-xl border bg-white text-left transition hover:shadow-md ${overKey === `al:${c.id}` ? "border-emerald-400 ring-2 ring-emerald-300" : "border-slate-200 hover:border-slate-300"}`}>
                          <AlbumCover keys={c.preview_keys} total={c.deep.photos} />
                          <div className="space-y-1 p-2.5">
                            <div className="flex items-center gap-1 truncate text-[13px] font-medium text-slate-800"><Icon value="i:folder" />{c.name}</div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1"><Icon value="i:photo" />{c.deep.photos}</span>
                              {c.deep.sub_count > 0 && <span className="inline-flex items-center gap-1"><Icon value="i:folder" />{c.deep.sub_count}</span>}
                              {c.deep.sent > 0 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-1.5 text-emerald-700">{t(`ส่งเข้าใบงาน ${c.deep.sent}`, `${c.deep.sent} in sheets`)}</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {canEdit && !trashView && list.length > 1 && (
                  <p className="text-[11px] text-slate-400">{t("ลากรูปไปวางบนอีกรูป = รวมเป็นอัลบั้มใหม่ · วางบนการ์ดอัลบั้ม หรือชื่ออัลบั้มด้านบน = ย้ายไปที่นั่น · เลือกหลายรูปแล้วลากไปพร้อมกันได้", "Drop a photo on another photo to make an album · drop on an album card or the path above to move it")}</p>
                )}

                {photos === null ? <LoadingState className="py-12 text-sm" />
                  : !list.length ? ((children.length && !trashView) ? null : <EmptyState icon={<Icon value={trashView ? "i:trash" : "i:photo"} />} className="p-8"
                      title={trashView ? t("ถังขยะว่าง", "Trash is empty") : t("ยังไม่มีรูปในอัลบั้มนี้", "No images yet")}
                      hint={trashView ? undefined : t("ลากรูปมาวางด้านบนได้เลย", "Drop images above")} />)
                  : (
                    <div className="grid" style={gridStyle}>
                      {list.map((p) => {
                        const on = sel.has(p.id);
                        const over = overKey === `ph:${p.id}`;
                        return (
                          <div key={p.id} {...dragProps(() => photoDrag(p.id))}
                            {...(trashView ? {} : dropProps(`ph:${p.id}`, (d) => d.kind === "photos" && !d.ids.includes(p.id), (d) => { if (d.kind === "photos") void createSub([...new Set([...d.ids, p.id])]); }))}
                            className={`group relative overflow-hidden rounded-xl border bg-white ${over ? "border-emerald-400 ring-2 ring-emerald-300" : on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
                            <button type="button" onClick={() => toggle(p.id)} className="block w-full cursor-pointer" aria-pressed={on} title={p.file_name}>
                              <img src={imgUrl(p.r2_key, 480)} alt={p.file_name} loading="lazy" draggable={false} className={`aspect-square w-full bg-slate-50 object-contain ${trashView ? "opacity-60" : ""}`} />
                            </button>
                            <a href={imgUrl(p.r2_key)} target="_blank" rel="noopener noreferrer" title={t("ดูรูปเต็ม", "Open full image")} draggable={false}
                              className="absolute left-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-violet-700 group-hover:inline-flex"><Icon value="i:external-link" /></a>
                            {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
                            {over && <span className="pointer-events-none absolute inset-x-1.5 top-1.5 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-center text-[11px] text-white">{t("ปล่อย = รวมเป็นอัลบั้มใหม่", "Drop to make an album")}</span>}
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
                      })}
                    </div>
                  )}
                </>
              ) : !tabAlbums.length ? (
                <EmptyState icon={<Icon value="i:folder" />} className="p-8" title={t("ยังไม่มีอัลบั้ม", "No albums yet")} hint={canUpload ? t("ลากรูปมาวางด้านบน ระบบสร้างอัลบั้มของวันนี้ให้เอง", "Drop photos above — today's album is created for you") : undefined} />
              ) : (
                /* หน้าแฟ้ม: การ์ดอัลบั้ม ปกรวมรูปแบบปรับตามจำนวนรูป (ของกลาง AlbumCover — แบบ C ที่เจ้าของเลือก) */
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {tabAlbums.map((a) => {
                    const b = brandOf(a.brand_id);
                    return (
                      <button key={a.id} type="button" onClick={() => void openAlbum(a.id)} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md">
                        <AlbumCover keys={a.preview_keys} total={a.deep.photos} />
                        <div className="space-y-1.5 p-3">
                          <div className="font-medium text-slate-800">{albumLabel(a)}</div>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">{dot(b?.color)}{b?.name ?? t("ไม่ระบุแบรนด์", "No brand")}</span>
                            <span className="inline-flex items-center gap-1"><Icon value="i:photo" />{a.deep.photos}</span>
                            {a.deep.sub_count > 0 && <span className="inline-flex items-center gap-1" title={t("อัลบั้มย่อย", "Sub-albums")}><Icon value="i:folder" />{a.deep.sub_count}</span>}
                            {a.deep.sent > 0 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">{t(`ส่งเข้าใบงาน ${a.deep.sent}`, `${a.deep.sent} in sheets`)}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

      <BulkActionBar count={selected.length} unit={t("รูป", "images")} onClear={() => setSel(new Set())}>
        {!trashView && (
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

      <DesignSheetPickerModal open={picking} onClose={() => setPicking(false)} onConfirm={doMove}
        initialBrand={albumBrand?.name ?? null}
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
