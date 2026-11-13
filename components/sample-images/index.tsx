"use client";

// ============================================================
// 📸 SAMPLE Images — อัลบั้มรูปตัวอย่างประจำแบรนด์ + ส่งรูปเข้าใบงานใน Design Dashboard (เจ้าของขอ 2026-11-13)
//
// แถบแบรนด์ด้านบน (ทุกแบรนด์ · แบรนด์ของเรา · ไม่ระบุแบรนด์) → อัลบั้มของแบรนด์นั้นเรียงตามวันที่ลง (1 แบรนด์ 1 วัน = 1 อัลบั้ม)
// ลากรูปมาวาง (ทั้งโฟลเดอร์ก็ได้) → ย่อ ≤2400px + JPEG → คลังไฟล์กลาง → อัลบั้มของแบรนด์ + วันนี้ ทันที (ไม่มีขั้นรอ)
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
import { useFileDrop } from "@/components/file-drop";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { GalleryColumnsControl, useGalleryColumns } from "@/components/gallery-columns";
import { DesignSheetPickerModal, type PickedDesignSheet } from "@/components/design-sheet-picker";
import { safeColor } from "@/components/design-dashboard/dashboard-helpers";
import { withImageWidth } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { photosToMove, splitSampleFiles, thaiShortDate, type SampleAlbum, type SampleBrand, type SamplePhoto } from "@/lib/sample-images";
import { ensureTodayAlbum, loadSamples, moveToSheet, restoreSample, setAlbumBrand, trashSample, uploadSample } from "./api";

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

  /** โหลดรายการใหม่ · want = อัลบั้มที่อยากเปิด (ไม่ส่ง = ตัวเดิม ถ้ายังอยู่ในแท็บนี้) */
  const reload = useCallback(async (want?: string | null, forTab: BrandTab = tab) => {
    try {
      setErr(null);
      const first = await loadSamples(null);
      const list = first.albums.filter((a) => inTab(a, forTab));
      const id = want !== undefined ? want : albumId;
      const pickId = id && list.some((a) => a.id === id) ? id : list[0]?.id ?? null;
      const d = pickId ? await loadSamples(pickId) : first;
      setBrands(d.brands); setAlbums(d.albums); setAlbumId(pickId); setPhotos(pickId ? d.photos ?? [] : []);
      setSel(new Set());
    } catch (e) { setErr((e as Error).message); }
  }, [albumId, tab]);
  useEffect(() => { if (permsReady && canView) void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [permsReady, canView]);

  const openAlbum = async (id: string) => {
    if (id === albumId) return;
    setAlbumId(id); setPhotos(null); setSel(new Set()); setTrashView(false); setToBrand(false);
    try { const d = await loadSamples(id); setAlbums(d.albums); setBrands(d.brands); setPhotos(d.photos ?? []); }
    catch (e) { setErr((e as Error).message); }
  };
  const switchTab = (next: BrandTab) => {
    setTab(next); setTrashView(false); setToBrand(false); setSel(new Set());
    const first = (albums ?? []).find((a) => inTab(a, next));
    if (first) void openAlbum(first.id); else { setAlbumId(null); setPhotos([]); }
  };

  // ── แบรนด์ที่จะลงรูป: แท็บแบรนด์ = แบรนด์นั้น · ไม่ระบุแบรนด์ = ไม่มี · ทุกแบรนด์ = ปุ่มเลือกในกรอบวางรูป (จำล่าสุด) ──
  const uploadBrandId: string | null = tab === NONE ? null : tab !== ALL ? tab : (brandOf(lastBrand)?.id ?? brands[0]?.id ?? null);

  const upload = async (files: File[]) => {
    if (!canUpload) { pushToast("error", t("คุณไม่มีสิทธิ์ลงรูป", "You can't upload images")); return; }
    if (up) { pushToast("info", t("กำลังลงรูปชุดก่อนอยู่ — รอสักครู่", "Still uploading — please wait")); return; }
    const { ok, unsupported, notImage } = splitSampleFiles(files);
    if (unsupported.length) pushToast("warning", t(`ข้าม ${unsupported.length} ไฟล์ (RAW/ไฟล์งาน แปลงเป็น JPEG ในเว็บไม่ได้ — ลง JPG/PNG/HEIC แทน)`, `Skipped ${unsupported.length} RAW/work files`));
    if (notImage.length) pushToast("warning", t(`ข้าม ${notImage.length} ไฟล์ที่ไม่ใช่รูป`, `Skipped ${notImage.length} non-image files`));
    if (!ok.length) return;
    const brandId = uploadBrandId;
    cancelRef.current = false;
    let done = 0, dup = 0;
    const fails: string[] = [];
    try {
      setUp({ name: t(`${ok.length} รูป`, `${ok.length} images`), pct: null, label: t("กำลังเตรียมอัลบั้มของวันนี้", "Preparing today's album") });
      const album = await ensureTodayAlbum(brandId);
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
  const tabAlbums = useMemo(() => (albums ?? []).filter((a) => inTab(a, tab)), [albums, tab]);
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

  if (permsReady && !canView) return <EmptyState icon={<Icon value="i:lock" />} title={t("คุณไม่มีสิทธิ์ดูคลังไฟล์", "You can't view the file library")} hint={t("ขอสิทธิ์ \"ดูคลังไฟล์\" จากแอดมิน", "Ask an admin for file library access")} />;

  const dot = (color: string | null | undefined) => <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ? safeColor(color) : "#cbd5e1" }} />;
  const pill = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${on ? "border-violet-300 bg-violet-50 font-medium text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
  const albumLabel = (a: SampleAlbum) => thaiShortDate(new Date(a.created_at));

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

            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              {/* อัลบั้มของแบรนด์ (ตามวันที่ลง) — มือถือเป็นแถวเลื่อนได้ */}
              <div className="min-w-0">
                <div className="mb-1.5 text-[12px] font-medium text-slate-400">
                  {tab === ALL ? t("อัลบั้มทุกแบรนด์", "All albums") : tab === NONE ? t("อัลบั้มที่ยังไม่ระบุแบรนด์", "Albums without a brand") : t(`อัลบั้มของ ${brandOf(tab)?.name ?? ""}`, `Albums of ${brandOf(tab)?.name ?? ""}`)}
                </div>
                {!tabAlbums.length ? <div className="rounded-lg border border-dashed border-slate-200 p-3 text-[12px] text-slate-400">{t("ยังไม่มีอัลบั้ม — ลงรูปชุดแรกแล้วระบบสร้างให้เอง", "No albums yet — your first upload creates one")}</div> : (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                    {tabAlbums.map((a) => (
                      <button key={a.id} type="button" onClick={() => void openAlbum(a.id)}
                        className={`flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] lg:w-full ${a.id === albumId ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                        <span className="flex min-w-0 items-center gap-1.5 truncate">{tab === ALL ? dot(brandOf(a.brand_id)?.color) : <Icon value="i:photo" />}{albumLabel(a)}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{t(`${a.counts.photos} รูป`, `${a.counts.photos}`)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                {/* ที่วางรูป / ความคืบหน้า */}
                {up ? <UploadProgress {...up} onCancel={() => { cancelRef.current = true; }} />
                  : canUpload && (
                    <div {...drop.zone("main")} className={`rounded-xl border-2 border-dashed px-4 py-4 text-center text-sm transition ${drop.over === "main" ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"}`}>
                      <button type="button" onClick={() => fileRef.current?.click()} className="w-full">
                        <div className="text-2xl text-slate-400"><Icon value="i:upload" /></div>
                        {t("ลากรูปมาวางได้ทีละหลายรูป (ทั้งโฟลเดอร์ก็ได้) หรือกดเพื่อเลือก", "Drag in many photos (or a whole folder), or click to choose")}
                        <div className="mt-0.5 text-[12px] text-slate-400">
                          {t(`เข้าอัลบั้ม ${brandOf(uploadBrandId)?.name ?? "ไม่ระบุแบรนด์"} · ${thaiShortDate(new Date())} · ย่อไม่เกิน 2,400px + แปลงเป็น JPEG ให้เอง`, `Goes into ${brandOf(uploadBrandId)?.name ?? "no brand"} · today · shrunk to ≤2,400px JPEG`)}
                        </div>
                      </button>
                      {tab === ALL && brands.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                          <span className="text-[12px] text-slate-500">{t("ลงเข้าแบรนด์:", "Into brand:")}</span>
                          {brands.map((b) => (
                            <button key={b.id} type="button" onClick={() => setLastBrand(b.id)} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] ${uploadBrandId === b.id ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{dot(b.color)}{b.name}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {album && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-1 flex items-center gap-1.5 text-[15px] font-semibold text-slate-800">{albumBrand ? <>{dot(albumBrand.color)}{albumBrand.name} · </> : null}{albumLabel(album)}</span>
                      {!album.brand_id && canEdit && brands.length > 0 && (
                        <button type="button" onClick={() => setToBrand((x) => !x)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 text-[12px] text-violet-700 hover:bg-violet-50"><Icon value="i:arrow-right" />{t("ย้ายอัลบั้มเข้าแบรนด์", "Move album into a brand")}</button>
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

                    {photos === null ? <LoadingState className="py-12 text-sm" />
                      : !list.length ? <EmptyState icon={<Icon value={trashView ? "i:trash" : "i:photo"} />} className="p-8"
                          title={trashView ? t("ถังขยะว่าง", "Trash is empty") : t("ยังไม่มีรูปในอัลบั้มนี้", "No images yet")}
                          hint={trashView ? undefined : t("ลากรูปมาวางด้านบนได้เลย", "Drop images above")} />
                      : (
                        <div className="grid" style={gridStyle}>
                          {list.map((p) => {
                            const on = sel.has(p.id);
                            return (
                              <div key={p.id} className={`group relative overflow-hidden rounded-xl border bg-white ${on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
                                <button type="button" onClick={() => toggle(p.id)} className="block w-full cursor-pointer" aria-pressed={on} title={p.file_name}>
                                  <img src={imgUrl(p.r2_key, 480)} alt={p.file_name} loading="lazy" className={`aspect-square w-full bg-slate-50 object-contain ${trashView ? "opacity-60" : ""}`} />
                                </button>
                                <a href={imgUrl(p.r2_key)} target="_blank" rel="noopener noreferrer" title={t("ดูรูปเต็ม", "Open full image")}
                                  className="absolute left-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-violet-700 group-hover:inline-flex"><Icon value="i:external-link" /></a>
                                {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
                                <div className="space-y-1 px-2 py-1.5">
                                  <div className="truncate text-[11px] text-slate-500">{p.file_name}</div>
                                  {p.moved_to.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {p.moved_to.map((s) => (
                                        <a key={s.id} href={`/master/design-dashboard?open=${encodeURIComponent(s.id)}`} target="_blank" rel="noopener noreferrer" title={t(`อยู่ในใบงาน ${s.code} · ${s.name} — กดเปิด`, `In ${s.code} — open`)}
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
                )}
              </div>
            </div>
          </>
        )}

      <BulkActionBar count={selected.length} unit={t("รูป", "images")} onClear={() => setSel(new Set())}>
        {!trashView && (
          <>
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
