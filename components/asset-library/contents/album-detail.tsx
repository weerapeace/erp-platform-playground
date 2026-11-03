"use client";

/**
 * หน้าในอัลบั้ม Contents (ป๊อปเต็มจอ)
 *   ที่อยู่ใน Drive + ลากไฟล์มาวาง (ตัวจริงขึ้น Drive ทีละชิ้น วิ่งเบื้องหลัง ปิดป๊อปได้) · กริดไฟล์ (เลือกใช้ / ตั้งปก / ใช้แล้วที่โพสต์ไหน / หายจาก Drive)
 *   สถานะต่อแพลตฟอร์ม + โพสต์ที่สร้างจากอัลบั้ม · แคปชั่นร่าง (+ AI ร่าง) · ส่งเข้าปฏิทิน (ป๊อปสร้างโพสต์กลาง ContentCreateModal)
 *   ช่วยคัดรูป (เบลอ/คล้าย · ./cull) · ดาวน์โหลดทั้งอัลบั้มเป็น zip (lib/zip)
 * ใช้ของกลาง: ERPModal · ConfirmDialog · UploadProgress · runBackgroundTask · ContentCreateModal · askDuplicateUploads (ผ่าน ./data)
 * สิทธิ์: แก้/อัป assets.upload · ลบไฟล์ assets.delete · ลบอัลบั้ม assets.manage · สร้างโพสต์ tasks.create
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { UploadProgress } from "@/components/upload-progress";
import { runBackgroundTask } from "@/lib/background-tasks";
import { r2ImageUrl } from "@/lib/r2-image";
import { downloadImagesAsZip } from "@/lib/zip";
import { askConfirm } from "@/components/modal/ask-dialog";
import { analyzeAlbumPhotos } from "./cull";
import { formatBytes } from "@/lib/assets";
import { useCreativeOptions } from "@/app/tasks/use-options";
import { listCampaigns, type BrandOption } from "@/app/tasks/data";
import type { ContentCreatePreset } from "@/app/tasks/content/content-create-modal";
import { getContentAlbum, getAlbumDriveInfo, updateContentAlbum, trashContentAlbum, removeAlbumFile, uploadFilesToAlbum, syncAlbumDrive, aiAlbumCaption,
  albumPostPreset, pendingUploadsFor, clearPendingUploads,
  type AlbumDetail, type AlbumDriveInfo, type AlbumFile, type AlbumUploadStep, type PendingUpload } from "./data";
import { StageBadge, PlatChip, FileThumb } from "./album-bits";
import { AlbumFormModal } from "./album-form-modal";

const ContentCreateModal = nextDynamic(() => import("@/app/tasks/content/content-create-modal").then((m) => m.ContentCreateModal), { ssr: false });
const SYNC_ROUNDS = 15;   // ดึงไฟล์จาก Drive ครั้งละไม่กี่ไฟล์ → วนซ้ำจนครบ (กันค้างนานเกินในคำขอเดียว)
const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;

export function AlbumDetailModal({ albumId, brands, onClose, onChanged }: {
  albumId: string;
  brands: BrandOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const { platforms } = useCreativeOptions();
  const platMeta = useMemo(() => new Map(platforms.map((p) => [p.value, p])), [platforms]);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drive, setDrive] = useState<AlbumDriveInfo | null>(null);
  const [step, setStep] = useState<AlbumUploadStep | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [caption, setCaption] = useState("");
  const [captionSaving, setCaptionSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewFile, setViewFile] = useState<AlbumFile | null>(null);
  const [delFile, setDelFile] = useState<AlbumFile | null>(null);
  const [delDrive, setDelDrive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [postPreset, setPostPreset] = useState<ContentCreatePreset | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const [cullMsg, setCullMsg] = useState<string | null>(null);
  const [cull, setCull] = useState<{ blurry: Set<string>; groupOf: Map<string, number>; groups: number; keep: string[]; checked: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canEdit = can("assets.upload");
  const refreshPending = useCallback(() => setPending(pendingUploadsFor(albumId)), [albumId]);
  useEffect(() => { refreshPending(); }, [refreshPending]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const a = await getContentAlbum(albumId);
      setAlbum(a);
      setCaption((cur) => (quiet ? cur : a.caption_draft ?? ""));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [albumId]);
  const loadDrive = useCallback(() => { getAlbumDriveInfo(albumId).then(setDrive).catch((e) => setDrive({ ok: false, reason: (e as Error).message })); }, [albumId]);
  useEffect(() => { void load(); loadDrive(); }, [load, loadDrive]);

  const captionDirty = !!album && caption.trim() !== (album.caption_draft ?? "").trim();
  const patch = async (fields: Parameters<typeof updateContentAlbum>[1], okMsg?: string) => {
    try {
      await updateContentAlbum(albumId, fields);
      if (okMsg) toast.success(okMsg);
      await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };
  const saveCaption = async () => { setCaptionSaving(true); await patch({ caption_draft: caption.trim() || null }, t("บันทึกแคปชั่นร่างแล้ว", "Draft caption saved")); setCaptionSaving(false); };

  // ── อัปไฟล์ (วิ่งเบื้องหลัง — ปิดป๊อปได้ ดูความคืบหน้ามุมขวาล่าง) ──
  const startUpload = (list: FileList | File[]) => {
    const files = [...list].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) { toast.error(t("ลากได้เฉพาะรูปหรือวิดีโอ", "Only photos or videos")); return; }
    if (!album || !drive?.ok) return;
    const total = files.reduce((n, f) => n + f.size, 0);
    runBackgroundTask({
      label: t(`อัปเข้าอัลบั้ม ${album.name} (${files.length} ไฟล์)`, `Upload to ${album.name} (${files.length} files)`), total: mb(total), unit: "MB",
      run: async (report) => {
        const r = await uploadFilesToAlbum({
          albumId, albumName: album.name, files, existingKeys: album.files.map((f) => f.r2_key),
          onStep: (s) => { setStep(s); refreshPending(); }, onFileDone: () => { void load(true); onChanged(); loadDrive(); refreshPending(); },
          onBytes: (sent, tot) => report(mb(sent), mb(tot)),
        });
        refreshPending();
        if (!r) return { ok: 0, message: t("ยกเลิกแล้ว", "Cancelled") };
        const done = r.ok + r.reused;
        const parts = [t(`ลงอัลบั้มแล้ว ${done} ไฟล์`, `${done} file(s) added`)];
        if (r.reused) parts.push(t(`ใช้รูปเดิม ${r.reused}`, `${r.reused} reused`));
        if (r.skipped) parts.push(t(`ข้าม ${r.skipped}`, `${r.skipped} skipped`));
        if (r.failed.length) parts.push(t(`ไม่สำเร็จ: ${r.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`, `Failed: ${r.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`));
        return { ok: done, fail: r.failed.length, message: parts.join(" · ") };
      },
    });
  };

  const togglePick = (f: AlbumFile) => {
    if (!album) return;
    const ids = f.picked ? album.picked_asset_ids.filter((x) => x !== f.id) : [...album.picked_asset_ids, f.id];
    setAlbum({ ...album, picked_asset_ids: ids, files: album.files.map((x) => (x.id === f.id ? { ...x, picked: !x.picked } : x)) });
    void patch({ picked_asset_ids: ids });
  };
  const setCover = (f: AlbumFile) => void patch({ cover_asset_id: album?.cover_asset_id === f.id ? null : f.id }, t("ตั้งปกอัลบั้มแล้ว", "Cover set"));

  const doDeleteFile = async () => {
    if (!delFile) return;
    setBusy(true);
    try {
      const r = await removeAlbumFile(albumId, delFile.id, delDrive);
      toast.success(r.drive_trashed ? t("เอาออกแล้ว · ไฟล์ใน Drive ไปถังขยะ (กู้คืนได้ใน Drive)", "Removed · Drive file moved to trash") : t("เอาออกจากอัลบั้มแล้ว · ไฟล์ใน Drive ยังอยู่", "Removed · Drive file kept"));
      setDelFile(null); setDelDrive(false); await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const doTrashAlbum = async () => {
    setBusy(true);
    try { await trashContentAlbum(albumId); toast.success(t("ย้ายอัลบั้มไปถังขยะแล้ว (ไฟล์ใน Drive ไม่ถูกลบ)", "Album moved to trash (Drive files kept)")); onChanged(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setTrashOpen(false); }
  };

  const openPost = () => {
    if (!album) return;
    if (!campaigns.length) listCampaigns().then((cs) => setCampaigns(cs.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
    setPostPreset(albumPostPreset(album));
  };

  // ดึงไฟล์ที่ใส่เองในโฟลเดอร์ Drive + ตรวจไฟล์ที่หาย (วนทีละชุดจนครบ)
  const syncDrive = async () => {
    setSyncing(t("กำลังดูโฟลเดอร์ Drive...", "Checking the Drive folder..."));
    let added = 0, missing = 0, restored = 0;
    try {
      for (let round = 0; round < SYNC_ROUNDS; round++) {
        const r = await syncAlbumDrive(albumId);
        added += r.added; missing = r.missing; restored += r.restored;
        if (r.added) { void load(true); onChanged(); }
        if (!r.remaining) break;
        setSyncing(t(`ดึงแล้ว ${added} ไฟล์ · เหลืออีก ${r.remaining}`, `${added} added · ${r.remaining} left`));
      }
      const parts = [added ? t(`ดึงไฟล์ใหม่ ${added} ไฟล์`, `${added} new file(s)`) : t("ไม่มีไฟล์ใหม่ในโฟลเดอร์", "No new files in the folder")];
      if (missing) parts.push(t(`${missing} ไฟล์หายจาก Drive`, `${missing} missing in Drive`));
      if (restored) parts.push(t(`${restored} ไฟล์กลับมาแล้ว`, `${restored} back again`));
      if (missing) toast.error(parts.join(" · ")); else toast.success(parts.join(" · "));
      await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncing(null); }
  };

  // ✨ AI ร่างแคปชั่นจากรูปที่เลือก + การ์ดแบรนด์ (ไม่บันทึกเอง ให้ตรวจแล้วกดบันทึก)
  const aiCaption = async () => {
    if (caption.trim() && !(await askConfirm({ title: t("ให้ AI เขียนทับแคปชั่นเดิม?", "Replace the current caption?"), message: t("แคปชั่นที่เขียนไว้จะถูกแทนที่ (ยังไม่บันทึกจนกว่าจะกดบันทึก)", "The current text will be replaced (not saved until you press save)"), confirmText: t("เขียนใหม่", "Rewrite") }))) return;
    setAiBusy(true);
    try {
      const r = await aiAlbumCaption(albumId);
      setCaption([r.caption, r.hashtags.join(" ")].filter(Boolean).join("\n\n"));
      toast.success(r.images_used ? t(`AI ร่างจาก ${r.images_used} รูปแล้ว — ตรวจแล้วกดบันทึก`, `Drafted from ${r.images_used} photo(s) — review and save`) : t("AI ร่างแล้ว (ไม่มีรูปให้ดู) — ตรวจแล้วกดบันทึก", "Drafted without photos — review and save"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setAiBusy(false); }
  };

  // ⬇ ดาวน์โหลดรูปทั้งอัลบั้ม (ต้นฉบับจาก Drive · ไฟล์ใหญ่เกิน 30MB ใช้รูปย่อ) — วิดีโอไม่รวม (เปิดจาก Drive)
  const downloadZip = async () => {
    if (!album) return;
    const photos = (album.picked_asset_ids.length ? album.files.filter((f) => f.picked) : album.files).filter((f) => f.asset_type !== "video");
    if (!photos.length) { toast.error(t("ไม่มีรูปให้ดาวน์โหลด (วิดีโอเปิดจาก Drive)", "No photos to download (open videos in Drive)")); return; }
    const big = 30 * 1024 * 1024;
    const useOriginal = (f: AlbumFile) => !!f.drive_file_id && !f.drive_missing && (f.size_bytes ?? 0) <= big;
    const total = photos.reduce((n, f) => n + (useOriginal(f) ? f.size_bytes ?? 0 : 0), 0);
    if (total > 600 * 1024 * 1024 && !(await askConfirm({ title: t("ไฟล์รวมใหญ่มาก", "Very large download"), message: t(`รวมราว ${Math.round(total / 1048576)} MB อาจใช้เวลานานและกินหน่วยความจำเครื่อง — ดาวน์โหลดต่อไหม?`, `About ${Math.round(total / 1048576)} MB — continue?`), confirmText: t("ดาวน์โหลด", "Download") }))) return;
    setZipMsg(t("กำลังเตรียม…", "Preparing…"));
    try {
      const n = await downloadImagesAsZip(photos.map((f) => ({
        url: useOriginal(f) ? `/api/drive-video/${f.drive_file_id}` : (r2ImageUrl(f.r2_key) ?? ""),
        name: f.file_name,
      })), album.name || "album", (d, tot) => setZipMsg(t(`กำลังโหลด ${d}/${tot}`, `Downloading ${d}/${tot}`)));
      if (!n) toast.error(t("โหลดรูปไม่ได้เลย ลองใหม่อีกครั้ง", "Couldn't download any photo"));
      else toast.success(t(`ดาวน์โหลด ${n} รูปแล้ว${album.video_count ? ` (วิดีโอ ${album.video_count} ไฟล์ เปิดจาก Drive)` : ""}`, `${n} photo(s) downloaded`));
    } catch (e) { toast.error((e as Error).message); }
    finally { setZipMsg(null); }
  };

  // 🔍 ช่วยคัดรูป: รูปอาจเบลอ + รูปคล้ายกัน (ถ่ายรัว) → แนะนำรูปที่ควรเก็บ (ไม่มีค่าใช้จ่าย)
  const runCull = async () => {
    if (!album) return;
    setCullMsg(t("กำลังดูรูป…", "Checking photos…"));
    try {
      const r = await analyzeAlbumPhotos(album.files, (d, tot) => setCullMsg(t(`กำลังดูรูป ${d}/${tot}`, `Checking ${d}/${tot}`)));
      const groupOf = new Map<string, number>();
      r.groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, i + 1)));
      setCull({ blurry: new Set(r.blurry), groupOf, groups: r.groups.length, keep: r.keep, checked: r.checked });
      if (!r.blurry.length && !r.groups.length) toast.success(t(`ดู ${r.checked} รูปแล้ว ไม่เจอรูปเบลอหรือรูปซ้ำ`, `Checked ${r.checked} photos — nothing to cull`));
    } catch (e) { toast.error((e as Error).message); }
    finally { setCullMsg(null); }
  };
  const applyCull = async () => {
    if (!album || !cull) return;
    // วิดีโอไม่ได้ถูกตรวจ → คงสถานะเลือกเดิมของวิดีโอไว้
    const keep = [...cull.keep, ...album.files.filter((f) => f.asset_type === "video" && f.picked).map((f) => f.id)];
    if (album.picked_asset_ids.length && !(await askConfirm({ title: t("แทนรูปที่เลือกไว้?", "Replace current picks?"), message: t(`ตอนนี้เลือกไว้ ${album.picked_asset_ids.length} ไฟล์ — จะเปลี่ยนเป็น ${keep.length} ไฟล์ตามที่แนะนำ`, `Currently ${album.picked_asset_ids.length} picked — switch to ${keep.length} suggested`), confirmText: t("ใช้ตามที่แนะนำ", "Use suggestions") }))) return;
    await patch({ picked_asset_ids: keep }, t(`เลือกใช้ ${keep.length} ไฟล์ตามที่แนะนำแล้ว`, `${keep.length} file(s) picked`));
    setCull(null);
  };

  const files = album?.files ?? [];
  const pickedCount = album?.picked_asset_ids.length ?? 0;
  return (
    <ERPModal open onClose={onClose} title={album?.name || t("อัลบั้ม", "Album")} size="xl" storageKey="content-album-detail" hasUnsavedChanges={captionDirty}
      footer={album ? (
        <div className="flex flex-wrap items-center gap-2 w-full">
          {can("assets.manage") && <button onClick={() => setTrashOpen(true)} className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-red-600 rounded-lg hover:bg-red-50"><Icon name="delete" />{t("ลบอัลบั้ม", "Delete album")}</button>}
          {canEdit && (
            <button onClick={() => void patch({ closed: !album.closed_at }, album.closed_at ? t("เปิดอัลบั้มอีกครั้งแล้ว", "Album reopened") : t("ปิดอัลบั้มแล้ว", "Album closed"))}
              className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{album.closed_at ? t("เปิดอัลบั้มอีกครั้ง", "Reopen") : t("ปิดอัลบั้ม (จบแล้ว)", "Close album")}</button>
          )}
          <span className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {can("tasks.create") && (
            <button onClick={openPost} disabled={!files.length}
              title={!files.length ? t("ยังไม่มีไฟล์ในอัลบั้ม", "No files yet") : undefined}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
              <Icon name="calendar" />{pickedCount ? t(`ส่งเข้าปฏิทิน (${pickedCount} ไฟล์ที่เลือก)`, `Send to calendar (${pickedCount} picked)`) : t("ส่งเข้าปฏิทิน", "Send to calendar")}
            </button>
          )}
        </div>
      ) : undefined}>
      {loading && !album ? <LoadingState /> : error && !album ? <ErrorState hint={error} onRetry={() => void load()} /> : album && (
        <div className="space-y-5">
          {/* หัว: สถานะ + ข้อมูลอัลบั้ม */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <StageBadge stage={album.status.stage} />
            {album.brand_name && <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: album.brand_color || "#94a3b8" }} />{album.brand_name}</span>}
            {album.due_date && <span className="inline-flex items-center gap-1 text-slate-600"><Icon name="calendar" />{t("ลงภายใน", "Post by")} {new Date(`${album.due_date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>}
            {album.assignees.length > 0 && <span className="inline-flex items-center gap-1 text-slate-600"><Icon name="user" />{album.assignees.map((p) => p.name).filter(Boolean).join(", ")}</span>}
            {canEdit && <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="edit" />{t("แก้ข้อมูล", "Edit")}</button>}
          </div>
          {album.products.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Icon name="tag" />
              {album.products.map((p) => <span key={p.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-slate-100 text-slate-700"><span className="font-mono">{p.code}</span>{p.name ? <span className="text-slate-500 truncate max-w-[180px]">{p.name}</span> : null}</span>)}
            </div>
          )}
          {album.description && <p className="text-sm text-slate-600 whitespace-pre-line">{album.description}</p>}

          {/* ที่อยู่ใน Drive */}
          <div className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-sm ${drive && !drive.ok ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
            <Icon name={drive && !drive.ok ? "warning" : "folder"} />
            {!drive ? t("กำลังดูโฟลเดอร์ Drive...", "Checking Drive folder...") : drive.ok ? (
              <>
                <span className="min-w-0 break-words">Google Drive › {drive.label}{drive.pending ? t(" (สร้างให้ตอนอัปไฟล์แรก)", " (created on first upload)") : ""}</span>
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  {canEdit && drive.folder_url && (
                    <button onClick={() => void syncDrive()} disabled={!!syncing} title={t("ไฟล์ที่อัปเองผ่านแอป Google Drive เข้าโฟลเดอร์นี้ + ตรวจไฟล์ที่ถูกลบใน Drive", "Files added straight to this Drive folder + check for files deleted in Drive")}
                      className="inline-flex items-center gap-1 text-violet-700 hover:underline disabled:opacity-60"><Icon name="refresh" />{syncing ?? t("ดึงไฟล์ใหม่จาก Drive", "Pull new files from Drive")}</button>
                  )}
                  {drive.folder_url && <a href={drive.folder_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline"><Icon name="open" />{t("เปิดใน Drive", "Open in Drive")}</a>}
                </span>
              </>
            ) : <span>{drive.reason}</span>}
          </div>
          {files.some((f) => f.drive_missing) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <Icon name="warning" />{t(`${files.filter((f) => f.drive_missing).length} ไฟล์หายจาก Drive (ถูกลบหรืออยู่ในถังขยะ) — โพสต์ที่ใช้ไฟล์นี้จะโพสต์ไม่ได้ · กู้คืนใน Drive แล้วกด “ดึงไฟล์ใหม่จาก Drive” หรือเอาไฟล์ออกจากอัลบั้ม`, `${files.filter((f) => f.drive_missing).length} file(s) missing in Drive — posts using them will fail · restore in Drive then pull again, or remove them`)}
            </div>
          )}
          {pending.length > 0 && canEdit && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
              <Icon name="waiting" />
              <span className="min-w-0 flex-1">{t(`อัปค้าง ${pending.length} ไฟล์ (${pending.map((p) => p.name).join(", ")}) — ลากไฟล์เดิมมาวางอีกครั้ง ระบบจะส่งต่อจากที่ค้าง ไม่ต้องเริ่มใหม่`, `${pending.length} unfinished upload(s) (${pending.map((p) => p.name).join(", ")}) — drop the same files again to resume`)}</span>
              <button onClick={() => { clearPendingUploads(albumId); refreshPending(); }} className="text-xs text-amber-700 hover:underline">{t("ล้างรายการ", "Clear")}</button>
            </div>
          )}

          {/* ลากไฟล์มาวาง */}
          {canEdit && drive?.ok && !album.closed_at && (
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) startUpload(e.dataTransfer.files); }}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition ${dragOver ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}>
              <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { if (e.target.files?.length) startUpload(e.target.files); e.target.value = ""; }} />
              <p className="text-sm text-slate-600 flex items-center justify-center gap-2"><Icon name="upload" />{t("ลากรูป/วิดีโอมาวางที่นี่ หรือ", "Drop photos/videos here or")}
                <button type="button" onClick={() => inputRef.current?.click()} className="text-violet-700 font-medium hover:underline">{t("เลือกไฟล์", "choose files")}</button></p>
              <p className="text-xs text-slate-400 mt-1">{t("ไฟล์ตัวจริงขึ้น Google Drive (ไม่เกิน 5GB ต่อไฟล์) · ระบบเก็บแค่รูปย่อไว้โชว์ · อัปเบื้องหลัง ปิดหน้าต่างนี้ได้ · ถ้าเผลอปิดแท็บกลางคัน ลากไฟล์เดิมมาวางใหม่ = ส่งต่อจากที่ค้าง (เครื่องเดิม ภายใน 6 วัน)", "Originals go to Google Drive (≤5GB each) · only small previews stay here · runs in the background · closed the tab midway? drop the same files again to resume (same device, within 6 days)")}</p>
              {step && <UploadProgress name={step.name} size={step.size} pct={step.pct} label={step.label} count={{ current: step.current, total: step.total }} className="mt-3 text-left" />}
            </div>
          )}

          {/* สถานะต่อแพลตฟอร์ม + โพสต์ */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">{t("ลงที่ไหนแล้วบ้าง", "Where it's posted")}</h3>
            {album.status.platforms.length === 0 ? (
              <p className="text-sm text-slate-500">{t("ยังไม่ได้เลือกแพลตฟอร์ม — กด “แก้ข้อมูล” เลือกที่จะลง หรือกด “ส่งเข้าปฏิทิน”", "No platforms yet — Edit to pick, or Send to calendar")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {album.status.platforms.map((p) => <PlatChip key={p.code} code={p.code} state={p.state} label={platMeta.get(p.code)?.label} iconKey={platMeta.get(p.code)?.icon_key} />)}
              </div>
            )}
            {album.posts.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {album.posts.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${!p.is_active || p.status === "cancelled" ? "opacity-50" : ""}`}>
                    <a href={`/tasks/content-calendar?content=${p.id}`} target="_blank" rel="noreferrer" className="font-medium text-violet-700 hover:underline">{p.content_no ?? "—"}</a>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{p.title}</span>
                    {p.scheduled_at && <span className="text-xs text-slate-500">{new Date(p.scheduled_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>}
                    <span className="flex gap-1">{p.platforms.map((code) => {
                      const st = p.post_status[code];
                      if (st === "skip") return null;
                      return <PlatChip key={code} code={code} state={st === "posted" ? "posted" : st === "scheduled" ? "scheduled" : st === "failed" ? "failed" : "ready"} label={platMeta.get(code)?.label} iconKey={platMeta.get(code)?.icon_key} compact />;
                    })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* แคปชั่นร่าง */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700">{t("แคปชั่นร่าง", "Draft caption")}</h3>
              {canEdit && can("ai.caption") && (
                <button onClick={() => void aiCaption()} disabled={aiBusy || !files.length} title={t("AI ดูรูปที่เลือกใช้ (สูงสุด 4 รูป) + การ์ดรู้จักแบรนด์ แล้วร่างแคปชั่น · มีค่าใช้จ่ายเล็กน้อยต่อครั้ง", "AI looks at up to 4 picked photos + the brand card · small cost per use")}
                  className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-violet-200 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Icon name="ai" />{aiBusy ? t("AI กำลังเขียน…", "AI writing…") : t("AI ร่างแคปชั่น", "AI draft")}</button>
              )}
            </div>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} disabled={!canEdit}
              placeholder={t("เขียนแคปชั่นไว้ก่อน ตอนส่งเข้าปฏิทินจะใส่ให้ทุกแพลตฟอร์ม", "Write a caption — it's copied into every platform of new posts")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-slate-50" />
            {captionDirty && canEdit && (
              <div className="flex justify-end gap-2">
                <button onClick={() => setCaption(album.caption_draft ?? "")} className="h-8 px-3 text-sm text-slate-600 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Discard")}</button>
                <button onClick={() => void saveCaption()} disabled={captionSaving} className="h-8 px-3 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{captionSaving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกแคปชั่น", "Save caption")}</button>
              </div>
            )}
          </section>

          {/* ไฟล์ในอัลบั้ม */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700">{t(`ไฟล์ในอัลบั้ม (${files.length})`, `Files (${files.length})`)}</h3>
              {pickedCount > 0 && <span className="text-xs text-violet-700">{t(`เลือกใช้ ${pickedCount} ไฟล์`, `${pickedCount} picked`)}</span>}
              {canEdit && files.length > 0 && <span className="text-xs text-slate-400">{t("ติ๊กมุมซ้าย = เลือกใช้ (ส่งเข้าโพสต์เฉพาะที่เลือก) · ดาว = ปกอัลบั้ม", "Tick = pick for posts · star = cover")}</span>}
              {files.length > 0 && (
                <span className="ml-auto flex flex-wrap gap-2">
                  {canEdit && files.some((f) => f.asset_type !== "video") && (
                    <button onClick={() => void runCull()} disabled={!!cullMsg} title={t("หารูปที่อาจเบลอ + รูปคล้ายกันที่ถ่ายรัว แล้วแนะนำรูปที่ควรเก็บ (ไม่มีค่าใช้จ่าย)", "Find blurry and burst look-alike photos, suggest which to keep (free)")}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"><Icon name="inspect" />{cullMsg ?? t("ช่วยคัดรูป", "Help me cull")}</button>
                  )}
                  <button onClick={() => void downloadZip()} disabled={!!zipMsg} title={t("รูปต้นฉบับทั้งอัลบั้ม (หรือเฉพาะที่เลือกใช้) เป็นไฟล์ zip · วิดีโอเปิดจาก Drive", "All photos (or picked ones) as a zip · videos stay in Drive")}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"><Icon name="download" />{zipMsg ?? (pickedCount ? t("ดาวน์โหลดที่เลือก (zip)", "Download picked (zip)") : t("ดาวน์โหลดทั้งอัลบั้ม (zip)", "Download all (zip)"))}</button>
                </span>
              )}
            </div>
            {cull && (cull.blurry.size > 0 || cull.groups > 0) && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-800">
                <Icon name="inspect" />
                <span className="min-w-0 flex-1">{t(`ดู ${cull.checked} รูป · อาจเบลอ ${cull.blurry.size} รูป · รูปคล้ายกัน ${cull.groups} ชุด → แนะนำเก็บ ${cull.keep.length} รูป (ชุดคล้ายเก็บรูปที่คมสุด)`, `${cull.checked} checked · ${cull.blurry.size} maybe blurry · ${cull.groups} look-alike sets → keep ${cull.keep.length}`)}</span>
                {canEdit && <button onClick={() => void applyCull()} className="h-7 px-2.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700">{t("เลือกใช้ตามที่แนะนำ", "Pick suggested")}</button>}
                <button onClick={() => setCull(null)} className="text-xs text-sky-700 hover:underline">{t("ปิด", "Dismiss")}</button>
              </div>
            )}
            {files.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">{t("ยังไม่มีไฟล์ — ลากรูป/วิดีโอมาวางด้านบน", "No files yet — drop photos/videos above")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {files.map((f) => {
                  const cover = album.cover_asset_id === f.id;
                  return (
                    <div key={f.id} className={`group relative rounded-lg overflow-hidden border ${f.picked ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
                      <button onClick={() => setViewFile(f)} className="block w-full" title={f.file_name}>
                        <FileThumb r2Key={f.r2_key} type={f.asset_type} duration={f.duration_sec} className="aspect-square" />
                      </button>
                      {canEdit && (
                        <>
                          <button onClick={() => togglePick(f)} aria-pressed={f.picked} title={f.picked ? t("เลิกเลือก", "Unpick") : t("เลือกใช้", "Pick")}
                            className={`absolute top-1 left-1 w-6 h-6 grid place-items-center rounded-md border ${f.picked ? "bg-violet-600 border-violet-600 text-white" : "bg-white/90 border-slate-300 text-transparent hover:text-slate-400"}`}><Icon name="done" size={14} /></button>
                          <button onClick={() => setCover(f)} title={cover ? t("ปกอัลบั้ม (กดเพื่อเอาออก)", "Cover (click to unset)") : t("ตั้งเป็นปก", "Set as cover")}
                            className={`absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-md ${cover ? "bg-amber-400 text-white" : "bg-white/90 text-slate-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}><Icon name="star" size={14} /></button>
                        </>
                      )}
                      {can("assets.delete") && (
                        <button onClick={() => { setDelFile(f); setDelDrive(false); }} title={t("เอาออก", "Remove")}
                          className="absolute bottom-1 right-1 w-6 h-6 grid place-items-center rounded-md bg-white/90 text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><Icon name="delete" size={14} /></button>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 p-1 pointer-events-none pr-8">
                        {f.drive_missing && <span className="px-1 rounded bg-red-600 text-white text-[10px]">{t("หายจาก Drive", "Missing in Drive")}</span>}
                        {cull?.blurry.has(f.id) && <span className="px-1 rounded bg-amber-500 text-white text-[10px]">{t("อาจเบลอ", "Blurry?")}</span>}
                        {cull?.groupOf.has(f.id) && <span className={`px-1 rounded text-white text-[10px] ${cull.keep.includes(f.id) ? "bg-sky-600" : "bg-slate-500"}`}>{t(`คล้าย #${cull.groupOf.get(f.id)}`, `Alike #${cull.groupOf.get(f.id)}`)}{cull.keep.includes(f.id) ? " ★" : ""}</span>}
                        {f.used_in.length > 0 && <span className="px-1 rounded bg-emerald-600 text-white text-[10px]" title={f.used_in.map((u) => u.label).filter(Boolean).join(", ")}>{t(`ใช้แล้ว ${f.used_in.length}`, `Used ${f.used_in.length}`)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ดูไฟล์ใหญ่ */}
      {viewFile && (
        <ERPModal open onClose={() => setViewFile(null)} title={viewFile.file_name} size="xl" storageKey="content-album-file" zIndex={60}
          footer={<div className="flex flex-wrap items-center gap-2 w-full text-sm text-slate-500">
            <span>{[viewFile.width && viewFile.height ? `${viewFile.width}×${viewFile.height}` : null, viewFile.size_bytes ? formatBytes(viewFile.size_bytes) : null].filter(Boolean).join(" · ")}</span>
            <span className="flex-1" />
            {viewFile.drive_file_id && <a href={driveFileUrl(viewFile.drive_file_id)} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><Icon name="open" />{t("เปิดใน Drive", "Open in Drive")}</a>}
            {viewFile.drive_file_id && <a href={`/api/drive-video/${viewFile.drive_file_id}?dl=1`} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><Icon name="download" />{t("ดาวน์โหลดต้นฉบับ", "Download original")}</a>}
          </div>}>
          <div className="grid place-items-center bg-slate-900/5 rounded-lg min-h-[50vh]">
            {viewFile.asset_type === "video" && viewFile.drive_file_id ? (
              <video controls preload="metadata" className="max-h-[70vh] max-w-full" src={`/api/drive-video/${viewFile.drive_file_id}`}
                poster={viewFile.r2_key.startsWith("drive:") ? undefined : r2ImageUrl(viewFile.r2_key, 1280) ?? undefined} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={viewFile.file_name} className="max-h-[70vh] max-w-full object-contain"
                src={(viewFile.drive_file_id ? r2ImageUrl(`drive:${viewFile.drive_file_id}`, 2000) : r2ImageUrl(viewFile.r2_key, 1600)) ?? ""} />
            )}
          </div>
          {viewFile.used_in.length > 0 && <p className="mt-2 text-sm text-slate-600">{t("ใช้ในโพสต์:", "Used in:")} {viewFile.used_in.map((u) => u.label).filter(Boolean).join(", ")}</p>}
        </ERPModal>
      )}

      <ConfirmDialog open={!!delFile} onClose={() => setDelFile(null)} onConfirm={() => void doDeleteFile()} loading={busy} variant="danger"
        title={t("เอาไฟล์ออกจากอัลบั้ม", "Remove file from album")} confirmText={delDrive ? t("เอาออก + ลบใน Drive", "Remove + trash in Drive") : t("เอาออก", "Remove")}
        message={delFile ? (
          <div className="space-y-2 text-sm">
            <p>{delFile.file_name}</p>
            {delFile.used_in.length > 0 && <p className="text-amber-700">{t(`ไฟล์นี้ใช้อยู่ใน ${delFile.used_in.map((u) => u.label).filter(Boolean).join(", ")} — โพสต์ยังใช้ได้ (ลบใน Drive ไม่ได้)`, `Used in ${delFile.used_in.map((u) => u.label).filter(Boolean).join(", ")} — posts keep it (can't trash in Drive)`)}</p>}
            {delFile.drive_file_id && delFile.used_in.length === 0 && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={delDrive} onChange={(e) => setDelDrive(e.target.checked)} />{t("ย้ายไฟล์ใน Google Drive ไปถังขยะด้วย (กู้คืนได้ใน Drive 30 วัน)", "Also move the Google Drive file to trash (recoverable for 30 days)")}</label>
            )}
          </div>
        ) : ""} />
      <ConfirmDialog open={trashOpen} onClose={() => setTrashOpen(false)} onConfirm={() => void doTrashAlbum()} loading={busy} variant="danger"
        title={t("ลบอัลบั้ม", "Delete album")} confirmText={t("ย้ายไปถังขยะ", "Move to trash")}
        message={t("อัลบั้มไปอยู่ในถังขยะ (กู้คืนได้) · ไฟล์ใน Google Drive และโพสต์ที่สร้างไปแล้วไม่ถูกลบ", "The album goes to trash (restorable) · Drive files and existing posts are kept")} />
      {album && <AlbumFormModal open={editOpen} album={album} brands={brands} onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); toast.success(t("บันทึกแล้ว", "Saved")); void load(true); loadDrive(); onChanged(); }} />}
      {postPreset && album && (
        <ContentCreateModal open preset={postPreset} brands={brands} campaigns={campaigns} defaultBrandId={album.brand_id} defaultDate={album.due_date}
          onClose={() => setPostPreset(null)} pushToast={(type, m) => toast.show(m, type)}
          onCreated={() => { setPostPreset(null); void load(true); onChanged(); }} />
      )}
    </ERPModal>
  );
}
