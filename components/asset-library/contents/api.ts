/**
 * อัลบั้ม Contents — ตัวเรียก API (เบา · ไม่ลากตัวอัปไฟล์มาด้วย) + ค่าตั้งต้นป๊อปสร้างโพสต์จากอัลบั้ม
 * ใช้ได้ทุกหน้า (เช่นปฏิทินคอนเทนต์) · ตัวอัปไฟล์อยู่ ./data (export ทุกอย่างจากไฟล์นี้ต่อด้วย)
 */
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import type { ContentAlbum, AlbumFile } from "@/lib/content-albums-server";
import type { ContentCreatePreset } from "@/app/tasks/content/content-create-modal";

export type { ContentAlbum, AlbumFile };
export type AlbumDetail = ContentAlbum & { files: AlbumFile[] };
export type AlbumDriveInfo = { ok: true; label: string; folder_url: string | null; pending: boolean } | { ok: false; reason: string };

export async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => null);
  if (!j) throw new Error(tr(`เซิร์ฟเวอร์ตอบไม่ถูกต้อง (รหัส ${res.status})`, `Bad server response (${res.status})`));
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j as T;
}
export const send = (url: string, method: string, body?: unknown) =>
  apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export async function listContentAlbums(opts: { trash?: boolean } = {}): Promise<ContentAlbum[]> {
  return (await json<{ data: ContentAlbum[] }>(await apiFetch(`/api/content-albums${opts.trash ? "?trash=1" : ""}`))).data ?? [];
}
export async function getContentAlbum(id: string, lite = false): Promise<AlbumDetail> {
  return (await json<{ data: AlbumDetail }>(await apiFetch(`/api/content-albums/${id}${lite ? "?lite=1" : ""}`))).data;
}
export type AlbumFields = Partial<{
  name: string; description: string | null; brand_id: string | null; assignee_ids: string[]; due_date: string | null;
  planned_platforms: string[]; caption_draft: string | null; picked_asset_ids: string[]; file_order: string[]; parent_sku_codes: string[];
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

/** ดึงไฟล์ที่ใส่เองในโฟลเดอร์ Drive ของอัลบั้ม + ตรวจไฟล์ที่หายจาก Drive (เรียกซ้ำจน remaining = 0) */
export async function syncAlbumDrive(id: string): Promise<{ added: number; remaining: number; missing: number; restored: number; skipped: number }> {
  return (await json<{ data: { added: number; remaining: number; missing: number; restored: number; skipped: number } }>(await send(`/api/content-albums/${id}/drive-sync`, "POST"))).data;
}

/** ให้ AI ร่างแคปชั่นของอัลบั้ม (ไม่บันทึกเอง · สิทธิ์ ai.caption · มีค่าใช้จ่าย) */
export async function aiAlbumCaption(id: string, extra?: string): Promise<{ caption: string; hashtags: string[]; images_used: number }> {
  return await json<{ caption: string; hashtags: string[]; images_used: number }>(await send(`/api/content-albums/${id}/ai-caption`, "POST", { extra: extra ?? "" }));
}

/** ค่าตั้งต้นป๊อปสร้างโพสต์จากอัลบั้ม (ใช้ร่วม: ปุ่มในอัลบั้ม + ลากอัลบั้มลงวันในปฏิทิน) — ไฟล์ที่เลือกไว้ก่อน ไม่เลือก = ทั้งอัลบั้ม (≤50) · สินค้าแรกที่แท็ก = สินค้าหลักของโพสต์ */
export const ALBUM_POST_MAX_FILES = 50;
export function albumPostPreset(album: AlbumDetail): ContentCreatePreset {
  const pool = album.picked_asset_ids.length ? album.files.filter((f) => album.picked_asset_ids.includes(f.id)) : album.files;
  const ids = pool.slice(0, ALBUM_POST_MAX_FILES).map((f) => f.id);
  const hasVideo = pool.some((f) => f.asset_type === "video");
  const hasImage = pool.some((f) => f.asset_type !== "video");
  const p = album.products[0];
  return {
    title: album.name, platforms: album.planned_platforms,
    post_types: hasVideo && hasImage ? ["image", "video"] : hasVideo ? ["video"] : ids.length > 1 ? ["album"] : ["image"],
    ...(p ? { parent: { id: p.id, code: p.code, name: p.name, image_key: p.image_key } } : {}),
    album: { id: album.id, name: album.name, asset_ids: ids, caption: album.caption_draft },
  };
}
