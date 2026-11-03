/**
 * อัลบั้ม Contents — ตัวเรียก API + ตัวอัปไฟล์ฝั่งหน้าจอ (ของกลางของ components/asset-library/contents)
 *
 * อัปไฟล์ 1 ชิ้น: ทำรูปย่อ/ภาพปกวิดีโอ → R2 (ไม่ลงคลังซ้ำ) → ตัวจริงขึ้น Drive ทีละชิ้น (lib/drive-chunk-upload) → ลงทะเบียนเข้าอัลบั้ม
 * รูปตรวจซ้ำกับคลังก่อน (components/duplicate-upload) · วิดีโอยังไม่ตรวจซ้ำ (เฟส 2)
 */
import { apiFetch } from "@/lib/api";
import { sha256Hex } from "@/lib/assets";
import { lookHashOfBlob } from "@/lib/image-hash";
import { uploadFileToDrive } from "@/lib/drive-chunk-upload";
import { captureVideoPoster } from "@/lib/video-poster";
import { prepareResizedImage } from "@/components/image-attach";
import { askDuplicateUploads } from "@/components/duplicate-upload";
import { tr } from "@/lib/lang";
import type { ContentAlbum, AlbumFile } from "@/lib/content-albums-server";

export type { ContentAlbum, AlbumFile };
export type AlbumDetail = ContentAlbum & { files: AlbumFile[] };
export type AlbumDriveInfo = { ok: true; label: string; folder_url: string | null; pending: boolean } | { ok: false; reason: string };

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => null);
  if (!j) throw new Error(tr(`เซิร์ฟเวอร์ตอบไม่ถูกต้อง (รหัส ${res.status})`, `Bad server response (${res.status})`));
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j as T;
}
const send = (url: string, method: string, body?: unknown) =>
  apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export async function listContentAlbums(opts: { trash?: boolean } = {}): Promise<ContentAlbum[]> {
  return (await json<{ data: ContentAlbum[] }>(await apiFetch(`/api/content-albums${opts.trash ? "?trash=1" : ""}`))).data ?? [];
}
export async function getContentAlbum(id: string, lite = false): Promise<AlbumDetail> {
  return (await json<{ data: AlbumDetail }>(await apiFetch(`/api/content-albums/${id}${lite ? "?lite=1" : ""}`))).data;
}
export type AlbumFields = Partial<{
  name: string; description: string | null; brand_id: string | null; assignee_ids: string[]; due_date: string | null;
  planned_platforms: string[]; caption_draft: string | null; picked_asset_ids: string[]; parent_sku_codes: string[];
  cover_asset_id: string | null; closed: boolean; restore: boolean;
}>;
export async function createContentAlbum(fields: AlbumFields & { name: string }): Promise<ContentAlbum> {
  return (await json<{ data: ContentAlbum }>(await send("/api/content-albums", "POST", fields))).data;
}
export async function updateContentAlbum(id: string, fields: AlbumFields): Promise<ContentAlbum> {
  return (await json<{ data: ContentAlbum }>(await send(`/api/content-albums/${id}`, "PATCH", fields))).data;
}
export async function trashContentAlbum(id: string): Promise<void> {
  await json(await send(`/api/content-albums/${id}`, "DELETE"));
}
export async function getAlbumDriveInfo(id: string): Promise<AlbumDriveInfo> {
  return (await json<{ data: AlbumDriveInfo }>(await apiFetch(`/api/content-albums/${id}/drive`))).data;
}
export async function removeAlbumFile(id: string, assetId: string, trashDrive: boolean): Promise<{ drive_trashed: boolean }> {
  return (await json<{ data: { drive_trashed: boolean } }>(await send(`/api/content-albums/${id}/files?asset_id=${assetId}${trashDrive ? "&drive=1" : ""}`, "DELETE"))).data;
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
  const prepared = await Promise.all(p.files.map(async (f) => ({ original: f, preview: await preparePreview(f) })));
  // รูปที่ย่อได้ → ตรวจซ้ำกับคลัง (ไฟล์เป๊ะ + หน้าตาเหมือน) · ไฟล์อื่นอัปเลย
  const imgs = prepared.filter((x) => x.preview);
  const plan = imgs.length
    ? await askDuplicateUploads(imgs.map((x) => ({ file: x.preview!, original: x.original, x })), { target: tr(`อัลบั้ม ${p.albumName}`, `album ${p.albumName}`), existingKeys: p.existingKeys })
    : [];
  if (plan === null) return null;
  const reuseOf = new Map(plan.map((r) => [r.item.x, r.reuse]));
  const keep = prepared.filter((x) => !x.preview || reuseOf.has(x));
  const skipped = prepared.length - keep.length;
  const totalBytes = keep.reduce((n, x) => n + (reuseOf.get(x) ? 0 : x.original.size), 0);
  let sentBefore = 0, ok = 0, reused = 0;
  const failed: { name: string; error: string }[] = [];

  for (const [i, x] of keep.entries()) {
    const f = x.original;
    const step = (label: string, pct: number | null) => p.onStep?.({ name: f.name, size: f.size, pct, label, current: i + 1, total: keep.length });
    try {
      const reuse = reuseOf.get(x);
      if (reuse) {
        step(tr("ใช้รูปเดิมในคลัง", "Using existing image"), null);
        await json(await send(`/api/content-albums/${p.albumId}/files`, "POST", { asset_id: reuse.id }));
        reused++; p.onFileDone?.(); continue;
      }
      step(tr("กำลังทำรูปย่อ", "Making preview"), null);
      let previewKey: string | null = null, width: number | null = null, height: number | null = null, duration: number | null = null;
      let checksum: string | null = null, phash: string | null = null, phashColor: string | null = null;
      if (f.type.startsWith("video/")) {
        const poster = await captureVideoPoster(f);
        if (poster) { previewKey = await uploadPreview(poster.file).catch(() => null); width = poster.width; height = poster.height; duration = Math.round(poster.duration * 10) / 10; }
      } else if (x.preview) {
        previewKey = await uploadPreview(x.preview);
        const size = await imageSize(f); width = size?.width ?? null; height = size?.height ?? null;
        if (f.size <= 60 * 1024 * 1024) checksum = await sha256Hex(await f.arrayBuffer());
        const look = await lookHashOfBlob(x.preview).catch(() => null);
        phash = look?.phash ?? null; phashColor = look?.color ?? null;
      }
      step(tr("กำลังส่งขึ้น Google Drive", "Uploading to Google Drive"), 0);
      const { data } = await json<{ data: { upload_url: string } }>(await send(`/api/content-albums/${p.albumId}/drive`, "POST", { name: f.name, mime: f.type || "application/octet-stream", size: f.size }));
      const fileId = await uploadFileToDrive(f, data.upload_url, (sent, total) => {
        step(tr("กำลังส่งขึ้น Google Drive", "Uploading to Google Drive"), total ? Math.round((sent / total) * 100) : null);
        p.onBytes?.(sentBefore + sent, totalBytes);
      });
      await json(await send(`/api/content-albums/${p.albumId}/files`, "POST", {
        drive_file_id: fileId, preview_key: previewKey, file_name: f.name, mime: f.type || null, size: f.size,
        width, height, duration_sec: duration, checksum, phash, phash_color: phashColor,
      }));
      ok++; p.onFileDone?.();
    } catch (e) {
      failed.push({ name: f.name, error: (e as Error).message });
    } finally {
      if (!reuseOf.get(x)) sentBefore += f.size;
    }
  }
  p.onStep?.(null);
  return { ok, reused, skipped, failed };
}
