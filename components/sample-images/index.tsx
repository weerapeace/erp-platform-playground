"use client";

// ============================================================
// 📸 SAMPLE Images — ลงรูปตัวอย่างที่รอเอาไปใส่ใบงานใน Design Dashboard (เจ้าของขอ 2026-11-13)
//
// ลากรูปมาวางทีละหลายรูป (ทั้งโฟลเดอร์ก็ได้) → ย่อ ≤2400px + แปลงเป็น JPEG → ลงคลังไฟล์กลาง → อัลบั้มของวันนี้ (ชื่อตามวันที่ลง)
// แต่ละอัลบั้ม: รอย้าย · ย้ายแล้ว (ป้ายใบงาน กดเปิดได้) · ถังขยะ (เอากลับได้)
// เลือกรูป → "ย้ายไป Design Dashboard" → ตัวเลือกใบงานกลาง (DesignSheetPickerModal) → ใบงานแนบรูปเดิมจากคลัง (ไม่ก๊อปไฟล์)
// ของกลาง: StandaloneShell · useFileDrop · UploadProgress · BulkActionBar · ConfirmDialog · gallery-columns · DesignSheetPickerModal
// ข้อมูล: components/sample-images/api.ts → API กลางเดิม · ตรรกะ: lib/sample-images · doc: docs/sample-images.md
// สิทธิ์: ดู assets.view · ลงรูป assets.upload · ลบ assets.delete · เอากลับ assets.edit · ย้าย attachments.upload (ด่านใน DB)
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
import { withImageWidth } from "@/lib/r2-image";
import { photosToMove, splitSampleFiles, type SampleAlbum, type SamplePhoto, type SampleStatus } from "@/lib/sample-images";
import { ensureTodayAlbum, loadSamples, moveToSheet, restoreSample, trashSample, uploadSample } from "./api";

const imgUrl = (key: string, w?: number) => {
  const u = `/api/r2-image?key=${encodeURIComponent(key)}`;
  return w ? withImageWidth(u, w) ?? u : u;
};

export function SampleImagesPage() {
  const t = useT();
  const { can, permsReady, user } = useAuth();
  const pushToast = usePushToast();
  const actor = user?.name ?? user?.email ?? null;
  const [albums, setAlbums] = useState<SampleAlbum[] | null>(null);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SamplePhoto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<SampleStatus>("wait");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const cancelRef = useRef(false);
  const [picking, setPicking] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { cols, setCols, gridStyle } = useGalleryColumns("sample-images", 6);
  const canView = can("assets.view"), canUpload = can("assets.upload"), canDelete = can("assets.delete"), canRestore = can("assets.edit");
  const canMove = can("attachments.upload");   // ย้ายเข้าใบงาน = แนบไฟล์ (ด่านเดียวกับใน DB) — ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม

  const reload = useCallback(async (want?: string | null) => {
    try {
      setErr(null);
      const first = await loadSamples(null);
      const id = want !== undefined ? want : albumId;
      const pickId = id && first.albums.some((a) => a.id === id) ? id : first.albums[0]?.id ?? null;
      const withPhotos = pickId ? await loadSamples(pickId) : { albums: first.albums, photos: [] };
      setAlbums(withPhotos.albums);
      setAlbumId(pickId);
      setPhotos(withPhotos.photos ?? []);
      setSel(new Set());
    } catch (e) { setErr((e as Error).message); }
  }, [albumId]);
  useEffect(() => { if (permsReady && canView) void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [permsReady, canView]);

  const openAlbum = async (id: string) => {
    if (id === albumId) return;
    setAlbumId(id); setPhotos(null); setSel(new Set()); setTab("wait");
    try { const d = await loadSamples(id); setAlbums(d.albums); setPhotos(d.photos ?? []); }
    catch (e) { setErr((e as Error).message); }
  };

  // ── ลงรูป ──
  const upload = async (files: File[]) => {
    if (!canUpload) { pushToast("error", t("คุณไม่มีสิทธิ์ลงรูป", "You can't upload images")); return; }
    if (up) { pushToast("info", t("กำลังลงรูปชุดก่อนอยู่ — รอสักครู่", "Still uploading — please wait")); return; }
    const { ok, unsupported, notImage } = splitSampleFiles(files);
    if (unsupported.length) pushToast("warning", t(`ข้าม ${unsupported.length} ไฟล์ (RAW/ไฟล์งาน แปลงเป็น JPEG ในเว็บไม่ได้ — ลง JPG/PNG/HEIC แทน)`, `Skipped ${unsupported.length} RAW/work files`));
    if (notImage.length) pushToast("warning", t(`ข้าม ${notImage.length} ไฟล์ที่ไม่ใช่รูป`, `Skipped ${notImage.length} non-image files`));
    if (!ok.length) return;
    cancelRef.current = false;
    let done = 0, dup = 0;
    const fails: string[] = [];
    try {
      setUp({ name: t(`${ok.length} รูป`, `${ok.length} images`), pct: null, label: t("กำลังเตรียมอัลบั้มของวันนี้", "Preparing today's album") });
      const album = await ensureTodayAlbum();
      for (let i = 0; i < ok.length; i++) {
        if (cancelRef.current) break;
        const f = ok[i];
        try {
          const r = await uploadSample(f, album.id, actor, (step) => setUp({ name: f.name, size: f.size, count: { current: i + 1, total: ok.length }, pct: Math.round((i / ok.length) * 100), label: step === "prepare" ? t("กำลังย่อ + แปลงเป็น JPEG", "Resizing to JPEG") : t("กำลังอัปโหลด", "Uploading") }));
          done++; if (r.duplicate) dup++;
        } catch (e) { fails.push(`${f.name}: ${(e as Error).message}`); }
      }
      await reload(album.id);
      setTab("wait");
      if (done) pushToast("success", t(`ลง ${done} รูปใน ${album.name} แล้ว${dup ? ` (${dup} รูปเคยลงไว้ ใช้รูปเดิม)` : ""}`, `Added ${done} image(s) to ${album.name}`));
      if (fails.length) pushToast("error", t(`ลงไม่สำเร็จ ${fails.length} รูป — ${fails[0]}`, `${fails.length} failed — ${fails[0]}`));
      if (cancelRef.current) pushToast("info", t("หยุดลงรูปแล้ว", "Upload stopped"));
    } catch (e) {
      pushToast("error", (e as Error).message);
    } finally { setUp(null); }
  };
  const drop = useFileDrop((files) => void upload(files), { folders: true, disabled: !canUpload || !!up, onBusy: () => pushToast("info", t("กำลังลงรูปอยู่ — รอสักครู่", "Uploading — please wait")) });

  // ── รายการในแท็บ ──
  const album = albums?.find((a) => a.id === albumId) ?? null;
  const list = useMemo(() => (photos ?? []).filter((p) => p.status === tab), [photos, tab]);
  const counts = useMemo(() => {
    const c: Record<SampleStatus, number> = { wait: 0, moved: 0, trash: 0 };
    for (const p of photos ?? []) c[p.status]++;
    return c;
  }, [photos]);
  const selected = list.filter((p) => sel.has(p.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = list.length > 0 && list.every((p) => sel.has(p.id));

  // ── ย้าย / ลบ / เอากลับ ──
  const doMove = async (sheet: PickedDesignSheet) => {
    const ids = photosToMove(photos ?? [], sel, sheet.id);
    if (!ids.length) { pushToast("info", t("รูปที่เลือกอยู่ในใบงานนี้แล้ว", "These images are already in that sheet")); setPicking(false); return; }
    try {
      const n = await moveToSheet(sheet.id, ids, actor);
      pushToast("success", t(`ย้าย ${n} รูปไป ${sheet.code} · ${sheet.name} แล้ว`, `Moved ${n} image(s) to ${sheet.code}`));
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
    if (ids.length - fails.length) pushToast("success", t(`ย้าย ${ids.length - fails.length} รูปไปถังขยะแล้ว — เอากลับได้ที่แท็บถังขยะ`, `${ids.length - fails.length} moved to trash`));
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

  if (permsReady && !canView) return <EmptyState icon={<Icon value="i:lock" />} title={t("คุณไม่มีสิทธิ์ดูคลังไฟล์", "You can't view the file library")} hint={t("ขอสิทธิ์ \"ดูคลังไฟล์\" จากแอดมิน", "Ask an admin for file library access")} />;

  const tabBtn = (k: SampleStatus, label: string) => (
    <button key={k} type="button" onClick={() => { setTab(k); setSel(new Set()); }}
      className={`h-8 rounded-full border px-3 text-[13px] ${tab === k ? "border-violet-300 bg-violet-50 font-medium text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {label} <span className="tabular-nums">· {counts[k]}</span>
    </button>
  );

  return (
    <div {...drop.guard} className="space-y-4 px-4 py-5 sm:px-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Icon value="i:camera" /> SAMPLE Images</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("ลงรูปตัวอย่างไว้ที่นี่ก่อน แล้วเลือกย้ายเข้าใบงานใน Design Dashboard — รูปแปลงเป็น JPEG และเก็บในคลังไฟล์กลาง", "Drop sample photos here, then move them into Design Dashboard sheets")}</p>
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
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            {/* อัลบั้ม (ตามวันที่ลง) — มือถือเป็นแถวเลื่อนได้ */}
            <div className="min-w-0">
              <div className="mb-1.5 text-[12px] font-medium text-slate-400">{t("อัลบั้ม (ตามวันที่ลง)", "Albums (by upload date)")}</div>
              {!albums.length ? <div className="rounded-lg border border-dashed border-slate-200 p-3 text-[12px] text-slate-400">{t("ยังไม่มีอัลบั้ม — ลงรูปชุดแรกแล้วระบบสร้างให้เอง", "No albums yet — your first upload creates one")}</div> : (
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {albums.map((a) => (
                    <button key={a.id} type="button" onClick={() => void openAlbum(a.id)}
                      className={`flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] lg:w-full ${a.id === albumId ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                      <span className="truncate"><Icon value="i:photo" /> {a.name.replace(/^SAMPLE\s+/, "")}</span>
                      <span className={`shrink-0 rounded-full px-1.5 text-[11px] ${a.counts.wait ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{a.counts.wait ? t(`รอ ${a.counts.wait}`, `${a.counts.wait} left`) : t("ครบ", "done")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-3">
              {/* ที่วางรูป / ความคืบหน้า */}
              {up ? <UploadProgress {...up} onCancel={() => { cancelRef.current = true; }} />
                : canUpload && (
                  <div {...drop.zone("main")} onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
                    className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition ${drop.over === "main" ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
                    <div className="text-2xl text-slate-400"><Icon value="i:upload" /></div>
                    {t("ลากรูปมาวางได้ทีละหลายรูป (ทั้งโฟลเดอร์ก็ได้) หรือกดเพื่อเลือก", "Drag in many photos (or a whole folder), or click to choose")}
                    <div className="mt-0.5 text-[12px] text-slate-400">{t("ย่อด้านยาวไม่เกิน 2,400px + แปลงเป็น JPEG ให้เอง · เข้าอัลบั้มของวันนี้", "Shrunk to ≤2,400px JPEG · goes into today's album")}</div>
                  </div>
                )}

              {album && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-[15px] font-semibold text-slate-800">{album.name}</span>
                    {tabBtn("wait", t("รอย้าย", "Waiting"))}
                    {tabBtn("moved", t("ย้ายแล้ว", "Moved"))}
                    {tabBtn("trash", t("ถังขยะ", "Trash"))}
                    <span className="flex-1" />
                    {list.length > 0 && tab !== "moved" && (
                      <button type="button" onClick={() => setSel(allOn ? new Set() : new Set(list.map((p) => p.id)))} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50">
                        {allOn ? t("ไม่เลือกทั้งหมด", "Clear all") : t(`เลือกทั้งหมด (${list.length})`, `Select all (${list.length})`)}
                      </button>
                    )}
                    <GalleryColumnsControl cols={cols} onChange={setCols} as="select" />
                  </div>

                  {photos === null ? <LoadingState className="py-12 text-sm" />
                    : !list.length ? <EmptyState icon={<Icon value={tab === "trash" ? "i:trash" : "i:photo"} />} className="p-8"
                        title={tab === "wait" ? (counts.moved ? t("ย้ายครบแล้ว ไม่มีรูปรอย้าย", "All moved") : t("ยังไม่มีรูปในอัลบั้มนี้", "No images yet")) : tab === "moved" ? t("ยังไม่มีรูปที่ย้ายเข้าใบงาน", "Nothing moved yet") : t("ถังขยะว่าง", "Trash is empty")}
                        hint={tab === "wait" && !counts.moved ? t("ลากรูปมาวางด้านบนได้เลย", "Drop images above") : undefined} />
                    : (
                      <div className="grid" style={gridStyle}>
                        {list.map((p) => {
                          const on = sel.has(p.id);
                          const selectable = tab !== "moved";
                          return (
                            <div key={p.id} className={`group relative overflow-hidden rounded-xl border bg-white ${on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
                              <button type="button" onClick={() => selectable && toggle(p.id)} className={`block w-full ${selectable ? "cursor-pointer" : "cursor-default"}`} aria-pressed={selectable ? on : undefined} title={p.file_name}>
                                <img src={imgUrl(p.r2_key, 480)} alt={p.file_name} loading="lazy" className={`aspect-square w-full bg-slate-50 object-contain ${tab === "trash" ? "opacity-60" : ""}`} />
                              </button>
                              <a href={imgUrl(p.r2_key)} target="_blank" rel="noopener noreferrer" title={t("ดูรูปเต็ม", "Open full image")}
                                className="absolute left-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-violet-700 group-hover:inline-flex"><Icon value="i:external-link" /></a>
                              {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
                              <div className="space-y-1 px-2 py-1.5">
                                <div className="truncate text-[11px] text-slate-500">{p.file_name}</div>
                                {p.moved_to.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {p.moved_to.map((s) => (
                                      <a key={s.id} href={`/master/design-dashboard?open=${encodeURIComponent(s.id)}`} target="_blank" rel="noopener noreferrer" title={t(`เปิดใบงาน ${s.code} · ${s.name}`, `Open ${s.code}`)}
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
        )}

      <BulkActionBar count={selected.length} unit={t("รูป", "images")} onClear={() => setSel(new Set())}>
        {tab === "wait" && (
          <>
            {canMove && <button type="button" onClick={() => setPicking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"><Icon value="i:arrow-right" />{t("ย้ายไป Design Dashboard", "Move to Design Dashboard")}</button>}
            {!canMove && !canDelete && <span className="text-[12px] text-slate-500">{t("คุณดูได้อย่างเดียว — ย้าย/ลบต้องมีสิทธิ์เพิ่ม", "View only — moving/deleting needs more access")}</span>}
            {canDelete && <button type="button" onClick={() => setAskDelete(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-600 hover:bg-rose-50"><Icon value="i:trash" />{t("ลบ (ไปถังขยะ)", "Delete (to trash)")}</button>}
          </>
        )}
        {tab === "trash" && canRestore && <button type="button" onClick={() => void doRestore()} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon value="i:arrow-back-up" />{t("เอากลับ", "Restore")}</button>}
      </BulkActionBar>

      <DesignSheetPickerModal open={picking} onClose={() => setPicking(false)} onConfirm={doMove}
        title={t(`ย้าย ${selected.length} รูปไปใบงานไหน?`, `Move ${selected.length} image(s) to which sheet?`)}
        confirmText={t(`ย้าย ${selected.length} รูป`, `Move ${selected.length}`)}
        head={(
          <div className="flex gap-1 overflow-x-auto pb-1">
            {selected.slice(0, 12).map((p) => <img key={p.id} src={imgUrl(p.r2_key, 120)} alt="" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />)}
            {selected.length > 12 && <span className="self-center px-1 text-[12px] text-slate-400">+{selected.length - 12}</span>}
          </div>
        )} />

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={() => void doDelete()} variant="danger" loading={busy}
        title={t(`ลบ ${selected.length} รูป?`, `Delete ${selected.length} image(s)?`)}
        message={t("รูปจะไปอยู่แท็บถังขยะ เอากลับได้ภายหลัง · รูปที่ใช้อยู่ที่อื่นในระบบ ระบบจะไม่ยอมลบ", "Images go to the trash tab and can be restored · images used elsewhere can't be deleted")}
        confirmText={t("ลบไปถังขยะ", "Move to trash")} />
    </div>
  );
}
