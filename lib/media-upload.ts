/**
 * ⬆ อัปโหลดรูป/วิดีโอขึ้น R2 (ของกลาง ฝั่งหน้าจอ) — ใช้โดย MediaUploadField · WebsiteVideoField
 *
 * - ไฟล์ ≤ 4 MB → /api/admin/upload (ทางเดิม · ผ่าน ERP · ลงคลังกลางอัตโนมัติ)
 * - ไฟล์ใหญ่ (วิดีโอ ≤ 200 MB · รูป ≤ 20 MB) → ขอลิงก์จาก /api/website/video-upload แล้วเบราว์เซอร์ส่งไฟล์ตรงเข้า R2 (มีแถบ %)
 *   เหตุผล: Vercel รับ request ได้ ~4.5 MB · ⚠️ ทางนี้ต้องตั้ง CORS ของ bucket R2 ก่อน 1 ครั้ง (docs/website-video.md)
 *   ยังไม่ตั้ง = โยน MediaUploadError("blocked") ให้หน้าจอบอกวิธี — ไม่พังเงียบ
 * ⚠️ ห้าม import ไฟล์นี้จาก API route (ใช้ apiFetch / XMLHttpRequest ของเบราว์เซอร์)
 */
import { apiFetch } from "@/lib/api";
import { SMALL_UPLOAD_BYTES, fileMb, uploadMaxBytes } from "@/lib/media-upload-limits";

export { SMALL_UPLOAD_BYTES, BIG_VIDEO_MAX_BYTES, BIG_IMAGE_MAX_BYTES, fileMb, uploadMaxBytes } from "@/lib/media-upload-limits";

/** ข้อความเมื่อไฟล์เกินเพดาน */
export function tooBigMessage(file: { type: string; size: number }): string {
  const isVideo = file.type.startsWith("video/");
  return `ไฟล์ใหญ่เกิน ${fileMb(uploadMaxBytes(file.type))} (${fileMb(file.size)}) — ${isVideo ? "ตัดคลิปให้สั้นลง/ลดความละเอียด หรือใช้ลิงก์ YouTube/Vimeo" : "ย่อรูปก่อนอัปโหลด"}`;
}

/** ข้อความเมื่อไฟล์ใหญ่ส่งตรงเข้า R2 ไม่ได้ (ยังไม่เปิด CORS ของ bucket) */
export function blockedMessage(file: { size: number }): string {
  return `ไฟล์ใหญ่ (${fileMb(file.size)}) ยังอัปไม่ได้ — ต้องเปิดสิทธิ์อัปโหลดไฟล์ใหญ่ใน Cloudflare ก่อน 1 ครั้ง (ขั้นตอนในคู่มือ "วิดีโอเว็บ") · ระหว่างนี้ใช้ไฟล์ ≤ 4 MB`;
}

export class MediaUploadError extends Error {
  /** blocked = ส่งตรงเข้า R2 ไม่ผ่าน (CORS/เน็ตหลุด) · aborted = ผู้ใช้กดยกเลิก */
  constructor(public code: "blocked" | "aborted" | "failed", message: string) {
    super(message);
  }
}

export interface UploadHandle {
  /** ยกเลิกการอัปโหลด (เฉพาะไฟล์ใหญ่ที่มีแถบ %) */
  abort: () => void;
}

/**
 * อัปโหลด 1 ไฟล์ → คืน r2 key
 * onProgress(pct) = เฉพาะไฟล์ใหญ่ (0–100) · onStart(handle) = ได้ปุ่มยกเลิก
 */
export async function uploadMediaFile(
  file: File,
  opts: { folder: string; onProgress?: (pct: number) => void; onStart?: (h: UploadHandle) => void },
): Promise<string> {
  if (file.size > uploadMaxBytes(file.type)) throw new MediaUploadError("failed", tooBigMessage(file));

  if (file.size <= SMALL_UPLOAD_BYTES) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", opts.folder);
    const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ error: r.status === 413 ? "ไฟล์ใหญ่เกินที่ระบบรับได้" : "อัปโหลดไม่สำเร็จ" }));
    if (!j.r2_key) throw new MediaUploadError("failed", j.error ?? "อัปโหลดไม่สำเร็จ");
    return j.r2_key as string;
  }

  // ไฟล์ใหญ่: ขอลิงก์ (สิทธิ์ files.upload · หมดอายุ 15 นาที) แล้วส่งตรงเข้า R2 ไม่ผ่าน ERP
  const r = await apiFetch("/api/website/video-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size, folder: opts.folder }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new MediaUploadError("failed", j.error ?? "ขอสิทธิ์อัปโหลดไม่สำเร็จ");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", j.url as string);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new MediaUploadError("failed", `ที่เก็บไฟล์ตอบ ${xhr.status}`)));
    // status 0 = เบราว์เซอร์ถูกกันไม่ให้ส่ง (ยังไม่ได้เปิด CORS ของ bucket) หรือเน็ตหลุด
    xhr.onerror = () => reject(new MediaUploadError("blocked", blockedMessage(file)));
    xhr.onabort = () => reject(new MediaUploadError("aborted", "ยกเลิกการอัปโหลดแล้ว"));
    opts.onStart?.({ abort: () => xhr.abort() });
    xhr.send(file);
  });
  return j.key as string;
}
