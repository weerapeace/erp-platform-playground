// ตัวเรียก API ของหน้า SAMPLE Images (ไม่ query ฐานข้อมูลตรงจากหน้า) — ใช้ API กลางเดิมทุกตัวที่มีอยู่แล้ว
//   รายการ/อัลบั้มของวัน = /api/sample-images · ลงรูป = /api/assets · ย้ายเข้าใบงาน = /api/attachments/from-library
//   ลบ (ถังขยะ) / เอากลับ = /api/assets/[id]
import { apiFetch } from "@/lib/api";
import { prepareResizedImage } from "@/components/image-attach";
import { SAMPLE_MAX_PX, SAMPLE_SOURCE, type SampleAlbum, type SampleBrand, type SamplePhoto } from "@/lib/sample-images";

const JSON_HDR = { "Content-Type": "application/json" };

async function json<T>(res: Response, fallback: string): Promise<T> {
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error((j && j.error) || fallback);
  return j as T;
}

export type SampleData = { brands: SampleBrand[]; albums: SampleAlbum[]; photos: SamplePhoto[] | null };

export async function loadSamples(albumId: string | null): Promise<SampleData> {
  const q = albumId ? `?album=${encodeURIComponent(albumId)}` : "";
  const j = await json<{ data: SampleData }>(await apiFetch(`/api/sample-images${q}`), "โหลดรูปตัวอย่างไม่สำเร็จ");
  return j.data;
}

/** หา/สร้างอัลบั้มของแบรนด์ + วันนี้ (ชื่อ "SAMPLE <แบรนด์> <วันที่>") · brandId null = ไม่ระบุแบรนด์ */
export async function ensureTodayAlbum(brandId: string | null): Promise<{ id: string; name: string }> {
  const j = await json<{ data: { id: string; name: string } }>(await apiFetch("/api/sample-images", { method: "POST", headers: JSON_HDR, body: JSON.stringify({ action: "album", brand_id: brandId }) }), "สร้างอัลบั้มของวันนี้ไม่สำเร็จ");
  return j.data;
}

/** ย้ายอัลบั้มที่ยังไม่ระบุแบรนด์เข้าแบรนด์ (มีอัลบั้มแบรนด์+วันเดียวกันแล้ว = รวม) → id อัลบั้มที่รูปอยู่ตอนนี้ */
export async function setAlbumBrand(albumId: string, brandId: string): Promise<{ id: string; name: string; merged: boolean }> {
  const j = await json<{ data: { id: string; name: string; merged: boolean } }>(await apiFetch("/api/sample-images", { method: "POST", headers: JSON_HDR, body: JSON.stringify({ action: "set_brand", album_id: albumId, brand_id: brandId }) }), "ย้ายอัลบั้มเข้าแบรนด์ไม่สำเร็จ");
  return j.data;
}

/** ย่อ + แปลงเป็น JPEG แล้วลงคลังไฟล์กลาง (เข้าอัลบั้ม) → duplicate = รูปนี้เคยลงแล้ว ใช้แถวเดิม ไม่อัปซ้ำ */
export async function uploadSample(file: File, albumId: string, brandId: string | null, actor: string | null, onStep?: (step: "prepare" | "upload") => void): Promise<{ duplicate: boolean }> {
  onStep?.("prepare");
  const jpg = await prepareResizedImage(file, SAMPLE_MAX_PX, { jpeg: true });
  let width = 0, height = 0;
  try { const bmp = await createImageBitmap(jpg); width = bmp.width; height = bmp.height; bmp.close(); } catch { /* ไม่รู้ขนาดก็ลงได้ */ }
  onStep?.("upload");
  const fd = new FormData();
  fd.append("file", jpg);
  fd.append("title", file.name.replace(/\.[^.]+$/, ""));
  fd.append("source", SAMPLE_SOURCE);
  fd.append("collection_id", albumId);
  if (brandId) fd.append("brand_id", brandId);
  if (width && height) { fd.append("width", String(width)); fd.append("height", String(height)); }
  if (actor) fd.append("actor", actor);
  const res = await apiFetch("/api/assets", { method: "POST", body: fd });
  if (res.status === 413) throw new Error("ไฟล์ใหญ่เกินที่ส่งได้");
  const j = await json<{ duplicate?: boolean }>(res, "ลงรูปไม่สำเร็จ");
  return { duplicate: !!j.duplicate };
}

/** ย้ายเข้าใบงาน = ใบงานแนบรูปเดิมจากคลัง (ไม่ก๊อปไฟล์) · ลงประวัติที่ใบงาน (attach) */
export async function moveToSheet(sheetId: string, assetIds: string[], actor: string | null): Promise<number> {
  const j = await json<{ attached: number }>(await apiFetch("/api/attachments/from-library", {
    method: "POST", headers: JSON_HDR, body: JSON.stringify({ entity_type: "design_sheet", entity_id: sheetId, asset_ids: assetIds, actor }),
  }), "ย้ายรูปเข้าใบงานไม่สำเร็จ");
  return j.attached ?? 0;
}

/** ลบ = ย้ายเข้าถังขยะของคลัง (ไฟล์ที่ใช้อยู่ที่อื่น ระบบไม่ยอมลบ) */
export async function trashSample(id: string): Promise<void> {
  await json(await apiFetch(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" }), "ลบไม่สำเร็จ");
}

export async function restoreSample(id: string): Promise<void> {
  await json(await apiFetch(`/api/assets/${encodeURIComponent(id)}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ restore: true }) }), "เอากลับไม่สำเร็จ");
}

// ── อัลบั้มในอัลบั้ม (เจ้าของสั่ง 2026-11-14) ──
const post = async <T,>(body: Record<string, unknown>, fallback: string): Promise<T> =>
  (await json<{ data: T }>(await apiFetch("/api/sample-images", { method: "POST", headers: JSON_HDR, body: JSON.stringify(body) }), fallback)).data;

/** สร้างอัลบั้มย่อยใน parentId (+ ย้ายรูปที่เลือกจาก fromAlbumId เข้าไป) */
export const createSubAlbum = (parentId: string, name: string, assetIds: string[] = [], fromAlbumId?: string) =>
  post<{ id: string; name: string; moved: number }>({ action: "create_sub", parent_id: parentId, name, asset_ids: assetIds, from_album_id: fromAlbumId }, "สร้างอัลบั้มไม่สำเร็จ");

/** ย้ายรูปจากอัลบั้มหนึ่งไปอีกอัลบั้ม */
export const movePhotosTo = (assetIds: string[], fromAlbumId: string, toAlbumId: string) =>
  post<{ moved: number }>({ action: "move_photos", asset_ids: assetIds, from_album_id: fromAlbumId, to_album_id: toAlbumId }, "ย้ายรูปไม่สำเร็จ");

/** ย้ายทั้งอัลบั้มเข้าไปในอีกอัลบั้ม (null = ขึ้นชั้นบนสุด) */
export const moveAlbumTo = (albumId: string, toParentId: string | null) =>
  post<{ id: string }>({ action: "move_album", album_id: albumId, to_parent_id: toParentId }, "ย้ายอัลบั้มไม่สำเร็จ");

export const renameAlbum = (albumId: string, name: string) =>
  post<{ id: string; name: string }>({ action: "rename", album_id: albumId, name }, "เปลี่ยนชื่ออัลบั้มไม่สำเร็จ");

/** ลบอัลบั้มย่อยที่ว่างแล้ว */
export const deleteEmptyAlbum = (albumId: string) =>
  post<{ id: string; parent_id: string | null }>({ action: "delete_album", album_id: albumId }, "ลบอัลบั้มไม่สำเร็จ");
