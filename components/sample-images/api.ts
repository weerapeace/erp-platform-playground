// ตัวเรียก API ของหน้า SAMPLE Images (ไม่ query ฐานข้อมูลตรงจากหน้า) — ใช้ API กลางเดิมทุกตัวที่มีอยู่แล้ว
//   รายการ/อัลบั้มของวัน = /api/sample-images · ลงรูป = /api/assets · ย้ายเข้าใบงาน = /api/attachments/from-library
//   ลบ (ถังขยะ) / เอากลับ = /api/assets/[id]
import { apiFetch } from "@/lib/api";
import { prepareResizedImage } from "@/components/image-attach";
import { SAMPLE_MAX_PX, SAMPLE_SOURCE, type SampleAlbum, type SamplePhoto } from "@/lib/sample-images";

const JSON_HDR = { "Content-Type": "application/json" };

async function json<T>(res: Response, fallback: string): Promise<T> {
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error((j && j.error) || fallback);
  return j as T;
}

export async function loadSamples(albumId: string | null): Promise<{ albums: SampleAlbum[]; photos: SamplePhoto[] | null }> {
  const q = albumId ? `?album=${encodeURIComponent(albumId)}` : "";
  const j = await json<{ data: { albums: SampleAlbum[]; photos: SamplePhoto[] | null } }>(await apiFetch(`/api/sample-images${q}`), "โหลดรูปตัวอย่างไม่สำเร็จ");
  return j.data;
}

/** หา/สร้างอัลบั้มของวันนี้ (ชื่อตามวันที่ลง) */
export async function ensureTodayAlbum(): Promise<{ id: string; name: string }> {
  const j = await json<{ data: { id: string; name: string } }>(await apiFetch("/api/sample-images", { method: "POST", headers: JSON_HDR, body: JSON.stringify({ action: "album" }) }), "สร้างอัลบั้มของวันนี้ไม่สำเร็จ");
  return j.data;
}

/** ย่อ + แปลงเป็น JPEG แล้วลงคลังไฟล์กลาง (เข้าอัลบั้ม) → duplicate = รูปนี้เคยลงแล้ว ใช้แถวเดิม ไม่อัปซ้ำ */
export async function uploadSample(file: File, albumId: string, actor: string | null, onStep?: (step: "prepare" | "upload") => void): Promise<{ duplicate: boolean }> {
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
