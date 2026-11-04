/**
 * อัลบั้ม Contents — ตัวเรียก API + ตัวอัปไฟล์ฝั่งหน้าจอ (ของกลางของ components/asset-library/contents)
 *
 * อัปไฟล์ 1 ชิ้น: ทำรูปย่อ/ภาพปกวิดีโอ → R2 (ไม่ลงคลังซ้ำ) → ตัวจริงขึ้น Drive ทีละชิ้น (lib/drive-chunk-upload) → ลงทะเบียนเข้าอัลบั้ม
 * รูปตรวจซ้ำกับคลังก่อน (components/duplicate-upload) · วิดีโอเทียบขนาดไฟล์กับวิดีโอที่เคยอัป (เตือน ไม่บังคับ)
 * อัปต่อจากที่ค้าง: จำลิงก์อัปของแต่ละไฟล์ไว้ในเครื่อง (localStorage) → ปิดแท็บแล้วเลือกไฟล์เดิมใหม่ = ส่งต่อจากไบต์ที่ค้าง
 */
import { apiFetch } from "@/lib/api";
import { sha256Hex } from "@/lib/assets";
import { lookHashOfBlob } from "@/lib/image-hash";
import { uploadFileToDrive, queryDriveUpload } from "@/lib/drive-chunk-upload";
import { captureVideoPoster } from "@/lib/video-poster";
import { prepareResizedImage } from "@/components/image-attach";
import { askDuplicateUploads } from "@/components/duplicate-upload";
import { askConfirm } from "@/components/modal/ask-dialog";
import { tr } from "@/lib/lang";
import { runBackgroundTask } from "@/lib/background-tasks";
import { json, send } from "./api";

export * from "./api";

/** รูป Reference → ย่อ ≤1600 แล้วอัป R2 (โฟลเดอร์ content-refs · ไม่ลงคลังกลาง — เป็นภาพตัวอย่าง ไม่ใช่งานของเรา) */
export async function uploadRefImage(file: File): Promise<string> {
  const prepared = await prepareResizedImage(file, 1600);
  const fd = new FormData();
  fd.append("file", prepared); fd.append("folder", "content-refs"); fd.append("no_library", "1");
  return (await json<{ r2_key: string }>(await apiFetch("/api/admin/upload", { method: "POST", body: fd }))).r2_key;
}

// ── อัปต่อจากที่ค้าง (จำในเครื่องนี้ · ลิงก์อัปของ Google ใช้ได้ราว 1 สัปดาห์) ──
type PendingMeta = { preview_key: string | null; width: number | null; height: number | null; duration_sec: number | null; checksum: string | null; phash: string | null; phash_color: string | null; mime: string | null };
export type PendingUpload = { albumId: string; name: string; size: number; lastModified: number; uploadUrl: string; savedAt: number; meta: PendingMeta };
const PENDING_KEY = "erp.contentAlbum.pendingUploads.v1";
const PENDING_MAX_AGE = 6 * 86400000;
function readPending(): PendingUpload[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as PendingUpload[];
    return Array.isArray(v) ? v.filter((p) => p && Date.now() - p.savedAt < PENDING_MAX_AGE) : [];
  } catch { return []; }
}
function writePending(list: PendingUpload[]) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* เครื่องไม่ให้จำ = อัปต่อไม่ได้ แต่อัปปกติได้ */ } }
const sameFile = (p: PendingUpload, albumId: string, f: File) => p.albumId === albumId && p.name === f.name && p.size === f.size && p.lastModified === f.lastModified;
const forgetPending = (albumId: string, f: File) => writePending(readPending().filter((p) => !sameFile(p, albumId, f)));
/** ไฟล์ที่อัปค้างของอัลบั้มนี้ (โชว์ให้เลือกไฟล์เดิมอีกครั้ง) */
export const pendingUploadsFor = (albumId: string) => readPending().filter((p) => p.albumId === albumId);
export const clearPendingUploads = (albumId: string) => writePending(readPending().filter((p) => p.albumId !== albumId));

// ระหว่างอัป — เตือนก่อนปิดแท็บ/รีเฟรช (ไฟล์ที่ยังไม่ครบจะค้าง)
let activeUploads = 0;
const warnLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
function uploadStarted() { if (activeUploads++ === 0) window.addEventListener("beforeunload", warnLeave); }
function uploadEnded() { if (--activeUploads <= 0) { activeUploads = 0; window.removeEventListener("beforeunload", warnLeave); } }

type VideoMatch = { size: number; matches: { asset_id: string; file_name: string; albums: { id: string; name: string }[] }[] };
async function findSameVideos(sizes: number[]): Promise<VideoMatch[]> {
  if (!sizes.length) return [];
  try { return (await json<{ data: VideoMatch[] }>(await send("/api/content-albums/check-videos", "POST", { sizes }))).data ?? []; }
  catch { return []; }   // ตรวจไม่ได้ = อัปตามปกติ
}

/** รูปย่อ/ภาพปก → R2 (no_library = ไม่ลงคลังซ้ำ — ตัวไฟล์ในคลังคือรายการของอัลบั้มเอง) */
async function uploadPreview(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file); fd.append("folder", "content-albums"); fd.append("no_library", "1");
  const j = await json<{ r2_key: string }>(await apiFetch("/api/admin/upload", { method: "POST", body: fd }));
  return j.r2_key;
}

async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try { const b = await createImageBitmap(file); const s = { width: b.width, height: b.height }; b.close(); return s; } catch { return null; }
}

export type AlbumUploadStep = { name: string; size: number; pct: number | null; label: string; current: number; total: number };

/** เตรียมรูปย่อ (ถ้าย่อได้) — HEIC/ไฟล์ที่เบราว์เซอร์เปิดไม่ได้ = ไม่มีรูปย่อ (ยังอัปตัวจริงได้) */
async function preparePreview(file: File): Promise<File | null> {
  if (!file.type.startsWith("image/") || /heic|heif/i.test(file.type)) return null;
  try { return await prepareResizedImage(file, 1600); } catch { return null; }
}

/**
 * อัปไฟล์หลายชิ้นเข้าอัลบั้ม (ทีละไฟล์) — รูปถามซ้ำก่อน (ป๊อปกลาง) · คืน null = ผู้ใช้กดยกเลิกตอนถามซ้ำ
 * onStep = ความคืบหน้าทีละไฟล์ (โชว์ UploadProgress) · onFileDone = ไฟล์เสร็จ (รีโหลดอัลบั้ม)
 */
export async function uploadFilesToAlbum(p: {
  albumId: string; albumName: string; files: File[]; existingKeys: string[];
  onStep?: (s: AlbumUploadStep | null) => void; onFileDone?: () => void;
  onBytes?: (sent: number, total: number) => void;
}): Promise<{ ok: number; reused: number; skipped: number; failed: { name: string; error: string }[] } | null> {
  // ส่งความคืบหน้าออกช่องกลางด้วย — หน้าในอัลบั้มที่เปิดอยู่เห็นแถบอัป/ไฟล์ใหม่ ไม่ว่าเริ่มอัปจากหน้าไหน
  const q = {
    ...p,
    onStep: (st: AlbumUploadStep | null) => { p.onStep?.(st); emitAlbumUpload({ albumId: p.albumId, step: st }); },
    onFileDone: () => { p.onFileDone?.(); emitAlbumUpload({ albumId: p.albumId, step: undefined, fileDone: true }); },
  };
  uploadStarted();
  try { return await runAlbumUpload(q); }
  finally { uploadEnded(); q.onStep(null); }
}

// ── ช่องกลางบอกความคืบหน้าการอัป (ต่ออัลบั้ม) ──
export type AlbumUploadEvent = { albumId: string; step?: AlbumUploadStep | null; fileDone?: boolean };
const uploadListeners = new Set<(e: AlbumUploadEvent) => void>();
function emitAlbumUpload(e: AlbumUploadEvent) { uploadListeners.forEach((l) => { try { l(e); } catch { /* ผู้ฟังพังไม่กระทบการอัป */ } }); }
/** ฟังความคืบหน้าการอัปทุกอัลบั้ม → คืนฟังก์ชันเลิกฟัง */
export function onAlbumUpload(cb: (e: AlbumUploadEvent) => void): () => void { uploadListeners.add(cb); return () => { uploadListeners.delete(cb); }; }

const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
/**
 * เริ่มอัปไฟล์เข้าอัลบั้มเป็นงานเบื้องหลัง (กล่องความคืบหน้ามุมขวาล่าง · ปิดป๊อปได้) — ใช้ร่วม: ลากวางในอัลบั้ม + ลากวาง/เลือกโฟลเดอร์ที่หน้ารวม
 * ความคืบหน้ารายไฟล์ออกทาง onAlbumUpload · onEnd = จบงาน (สำเร็จ/ยกเลิก/พัง)
 */
let uploadQueue: Promise<void> = Promise.resolve();
export function startAlbumUploadTask(p: { albumId: string; albumName: string; files: File[]; existingKeys: string[]; onEnd?: () => void }): void {
  const total = p.files.reduce((n, f) => n + f.size, 0);
  // หลายอัลบั้มพร้อมกัน (ลากหลายโฟลเดอร์) = ต่อคิวทีละอัลบั้ม
  const prev = uploadQueue;
  let release: () => void = () => {};
  uploadQueue = new Promise<void>((r) => { release = r; });
  runBackgroundTask({
    label: tr(`อัปเข้าอัลบั้ม ${p.albumName} (${p.files.length} ไฟล์)`, `Upload to ${p.albumName} (${p.files.length} files)`), total: mb(total), unit: "MB",
    run: async (report) => {
      await prev;
      try {
        const r = await uploadFilesToAlbum({ albumId: p.albumId, albumName: p.albumName, files: p.files, existingKeys: p.existingKeys, onBytes: (sent, tot) => report(mb(sent), mb(tot)) });
        if (!r) return { ok: 0, message: tr("ยกเลิกแล้ว", "Cancelled") };
        const done = r.ok + r.reused;
        const parts = [tr(`ลงอัลบั้มแล้ว ${done} ไฟล์`, `${done} file(s) added`)];
        if (r.reused) parts.push(tr(`ใช้ไฟล์เดิม ${r.reused}`, `${r.reused} reused`));
        if (r.skipped) parts.push(tr(`ข้าม ${r.skipped}`, `${r.skipped} skipped`));
        if (r.failed.length) parts.push(tr(`ไม่สำเร็จ: ${r.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`, `Failed: ${r.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`));
        return { ok: done, fail: r.failed.length, message: parts.join(" · ") };
      } finally { release(); p.onEnd?.(); }
    },
  });
}

type Prepared = { original: File; preview: File | null; resume: PendingUpload | null; reuseId: string | null };

async function runAlbumUpload(p: Parameters<typeof uploadFilesToAlbum>[0]): Promise<Awaited<ReturnType<typeof uploadFilesToAlbum>>> {
  const pending = readPending();
  // ไฟล์ที่เคยอัปค้าง (ชื่อ/ขนาด/เวลาแก้ไฟล์ตรงกัน) = ส่งต่อ ไม่ต้องทำรูปย่อหรือถามซ้ำใหม่
  const prepared: Prepared[] = await Promise.all(p.files.map(async (f) => {
    const resume = pending.find((x) => sameFile(x, p.albumId, f)) ?? null;
    return { original: f, preview: resume ? null : await preparePreview(f), resume, reuseId: null };
  }));

  // รูปที่ย่อได้ → ตรวจซ้ำกับคลัง (ไฟล์เป๊ะ + หน้าตาเหมือน)
  const imgs = prepared.filter((x) => x.preview);
  const plan = imgs.length
    ? await askDuplicateUploads(imgs.map((x) => ({ file: x.preview!, original: x.original, x })), { target: tr(`อัลบั้ม ${p.albumName}`, `album ${p.albumName}`), existingKeys: p.existingKeys })
    : [];
  if (plan === null) return null;
  for (const r of plan) r.item.x.reuseId = r.reuse?.id ?? null;
  const planned = new Set(plan.map((r) => r.item.x));
  let keep = prepared.filter((x) => !x.preview || planned.has(x));

  // วิดีโอ: ขนาดไฟล์ตรงกับวิดีโอที่เคยอัปไว้ = น่าจะไฟล์เดียวกัน → ถามก่อน (ใช้ไฟล์เดิม / อัปใหม่)
  const vids = keep.filter((x) => !x.resume && x.original.type.startsWith("video/"));
  const same = await findSameVideos(vids.map((x) => x.original.size));
  const hits = vids.map((x) => ({ x, m: same.find((s) => s.size === x.original.size)?.matches[0] ?? null })).filter((h) => h.m);
  if (hits.length) {
    const reuse = await askConfirm({
      title: tr("เจอวิดีโอที่น่าจะเคยอัปแล้ว", "These videos look already uploaded"),
      message: hits.map((h) => `${h.x.original.name} = ${h.m!.file_name}${h.m!.albums.length ? ` (${tr("อัลบั้ม", "album")} ${h.m!.albums.map((a) => a.name).join(", ")})` : ""}`).join(" · ")
        + " — " + tr("ใช้ไฟล์เดิมใน Drive ไม่ต้องอัปซ้ำ (ประหยัดเวลา + พื้นที่) หรือจะอัปใหม่?", "Use the existing Drive files instead of uploading again, or upload new copies?"),
      confirmText: tr("ใช้ไฟล์เดิม", "Use existing"), cancelText: tr("อัปใหม่", "Upload new"),
    });
    if (reuse) for (const h of hits) h.x.reuseId = h.m!.asset_id;
  }
  // ไฟล์ที่ใช้ของเดิมและอยู่ในอัลบั้มนี้แล้ว = ข้าม
  keep = keep.filter((x) => !(x.reuseId && same.some((s) => s.matches.some((m) => m.asset_id === x.reuseId && m.albums.some((a) => a.id === p.albumId)))));
  const skipped = prepared.length - keep.length;
  const totalBytes = keep.reduce((n, x) => n + (x.reuseId ? 0 : x.original.size), 0);
  let sentBefore = 0, ok = 0, reused = 0;
  const failed: { name: string; error: string }[] = [];

  for (const [i, x] of keep.entries()) {
    const f = x.original;
    const step = (label: string, pct: number | null) => p.onStep?.({ name: f.name, size: f.size, pct, label, current: i + 1, total: keep.length });
    const driveLabel = tr("กำลังส่งขึ้น Google Drive", "Uploading to Google Drive");
    try {
      if (x.reuseId) {
        step(tr("ใช้ไฟล์เดิมในคลัง", "Using existing file"), null);
        await json(await send(`/api/content-albums/${p.albumId}/files`, "POST", { asset_id: x.reuseId }));
        reused++; p.onFileDone?.(); continue;
      }
      let uploadUrl: string | null = null, startAt = 0, doneId: string | null = null;
      let meta: PendingMeta;
      if (x.resume) {
        step(tr("กำลังดูว่าค้างไว้ถึงไหน", "Checking where it stopped"), null);
        const st = await queryDriveUpload(x.resume.uploadUrl, f.size).catch(() => ({ expired: true as const }));
        meta = x.resume.meta;
        if ("expired" in st) forgetPending(p.albumId, f);   // ลิงก์หมดอายุ → เริ่มส่งใหม่ (รูปย่อเดิมใช้ต่อได้)
        else if (st.done) doneId = st.file_id;
        else { uploadUrl = x.resume.uploadUrl; startAt = st.next; }
      } else {
        step(tr("กำลังทำรูปย่อ", "Making preview"), null);
        meta = { preview_key: null, width: null, height: null, duration_sec: null, checksum: null, phash: null, phash_color: null, mime: f.type || null };
        if (f.type.startsWith("video/")) {
          const poster = await captureVideoPoster(f);
          if (poster) { meta.preview_key = await uploadPreview(poster.file).catch(() => null); meta.width = poster.width; meta.height = poster.height; meta.duration_sec = Math.round(poster.duration * 10) / 10; }
        } else if (x.preview) {
          meta.preview_key = await uploadPreview(x.preview);
          const size = await imageSize(f); meta.width = size?.width ?? null; meta.height = size?.height ?? null;
          if (f.size <= 60 * 1024 * 1024) meta.checksum = await sha256Hex(await f.arrayBuffer());
          const look = await lookHashOfBlob(x.preview).catch(() => null);
          meta.phash = look?.phash ?? null; meta.phash_color = look?.color ?? null;
        }
      }
      if (!doneId) {
        if (!uploadUrl) {
          step(driveLabel, 0);
          const { data } = await json<{ data: { upload_url: string } }>(await send(`/api/content-albums/${p.albumId}/drive`, "POST", { name: f.name, mime: f.type || "application/octet-stream", size: f.size }));
          uploadUrl = data.upload_url;
          writePending([...readPending().filter((q) => !sameFile(q, p.albumId, f)), { albumId: p.albumId, name: f.name, size: f.size, lastModified: f.lastModified, uploadUrl, savedAt: Date.now(), meta }]);
        }
        doneId = await uploadFileToDrive(f, uploadUrl, (sent, total) => {
          step(driveLabel, total ? Math.round((sent / total) * 100) : null);
          p.onBytes?.(sentBefore + sent, totalBytes);
        }, startAt);
      }
      await json(await send(`/api/content-albums/${p.albumId}/files`, "POST", {
        drive_file_id: doneId, preview_key: meta.preview_key, file_name: f.name, mime: meta.mime ?? f.type ?? null, size: f.size,
        width: meta.width, height: meta.height, duration_sec: meta.duration_sec, checksum: meta.checksum, phash: meta.phash, phash_color: meta.phash_color,
      }));
      forgetPending(p.albumId, f);
      ok++; p.onFileDone?.();
    } catch (e) {
      failed.push({ name: f.name, error: (e as Error).message });
    } finally {
      if (!x.reuseId) sentBefore += f.size;
    }
  }
  return { ok, reused, skipped, failed };
}
