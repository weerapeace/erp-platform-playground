/**
 * ⬆ อัปโหลดรูป/วิดีโอขึ้น R2 (ของกลาง ฝั่งหน้าจอ) — ใช้โดย MediaUploadField · WebsiteVideoField
 *
 * - ไฟล์ ≤ 4 MB → /api/admin/upload (ทางเดิม · ผ่าน ERP · ลงคลังกลางอัตโนมัติ)
 * - ไฟล์ใหญ่ (วิดีโอ ≤ 200 MB · รูป ≤ 20 MB) → ขอลิงก์จาก /api/website/video-upload แล้วเบราว์เซอร์ส่งไฟล์ตรงเข้า R2 (มีแถบ %)
 *   เหตุผล: Vercel รับ request ได้ ~4.5 MB · ⚠️ ทางนี้ต้องตั้ง CORS ของ bucket R2 ก่อน 1 ครั้ง (docs/website-video.md)
 *   ยังไม่ตั้ง = โยน MediaUploadError("blocked") ให้หน้าจอบอกวิธี — ไม่พังเงียบ
 * - ชนิดไฟล์ดูจาก "หัวไฟล์" ก่อนเสมอ (normalizeMediaFile) — บางเครื่องส่ง MP4 มาไม่บอกชนิด
 * - รูปนิ่ง (JPG/PNG/WebP/BMP/AVIF) ใหญ่เกิน 4 MB → ย่อให้อัตโนมัติ (≤ 3200 px · WebP) แล้วส่งทางเล็ก — ใช้ได้เลยไม่ต้องรอ CORS
 * ⚠️ ห้าม import ไฟล์นี้จาก API route (ใช้ apiFetch / XMLHttpRequest ของเบราว์เซอร์)
 */
import { apiFetch } from "@/lib/api";
import { SMALL_UPLOAD_BYTES, fileMb, uploadMaxBytes, resolveMediaType, sniffMediaType } from "@/lib/media-upload-limits";
import { SHRINKABLE_IMAGE_TYPES, shrinkImageToFit } from "@/lib/image-resize";

export { SMALL_UPLOAD_BYTES, BIG_VIDEO_MAX_BYTES, BIG_IMAGE_MAX_BYTES, fileMb, uploadMaxBytes } from "@/lib/media-upload-limits";

/**
 * ใส่ชนิดไฟล์ที่ถูกต้อง (ดูจากหัวไฟล์ → ชนิดที่เบราว์เซอร์บอก → นามสกุล)
 * บางเครื่องส่ง MP4 มาแบบไม่บอกชนิด → เคยถูกนึกว่าเป็นรูปและตัดที่ 4 MB · เรียกก่อนตัดสินว่า "รูป/วิดีโอ" เสมอ
 */
export async function normalizeMediaFile(file: File): Promise<File> {
  let head = new Uint8Array(0);
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    /* อ่านหัวไฟล์ไม่ได้ = ใช้ชนิดที่เบราว์เซอร์บอก */
  }
  const type = resolveMediaType(file.type, sniffMediaType(head), file.name);
  return type && type !== file.type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

/** ข้อความเมื่อไฟล์เกินเพดาน */
export function tooBigMessage(file: { type: string; size: number }): string {
  const isVideo = file.type.startsWith("video/");
  if (file.type === "image/gif") return `GIF ใหญ่เกิน 4 MB (${fileMb(file.size)}) — แนะนำใช้วิดีโอ MP4 แทน (ไฟล์เล็กกว่ามาก ภาพคมกว่า)`;
  if (!isVideo && !file.type.startsWith("image/")) return `ไฟล์ชนิดนี้ (${file.type || "ไม่รู้จัก"} · ${fileMb(file.size)}) อัปเป็นรูป/วิดีโอไม่ได้ — ใช้ MP4 / WebM หรือรูป JPG / PNG / WebP`;
  if (!isVideo && !SHRINKABLE_IMAGE_TYPES.includes(file.type)) return `รูปชนิด ${file.type.replace("image/", "").toUpperCase()} ใหญ่เกิน 4 MB (${fileMb(file.size)}) — บันทึกเป็น JPG / PNG ก่อน (ระบบย่อให้อัตโนมัติ)`;
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
 * - ชนิดไฟล์ดูจากหัวไฟล์ (normalizeMediaFile) · รูปนิ่งใหญ่เกิน 4 MB = ย่ออัตโนมัติ (ด้านยาว ≤ 3200 px · WebP) → ส่งทางเล็ก ไม่ต้องรอ CORS
 * onProgress(pct) = เฉพาะไฟล์ใหญ่ (0–100) · onStart(handle) = ได้ปุ่มยกเลิก · onNotice = ข้อความแจ้ง (เช่น ย่อรูปให้แล้ว)
 */
export async function uploadMediaFile(
  input: File,
  opts: { folder: string; onProgress?: (pct: number) => void; onStart?: (h: UploadHandle) => void; onNotice?: (msg: string) => void },
): Promise<string> {
  let file = await normalizeMediaFile(input);
  if (file.size > SMALL_UPLOAD_BYTES && SHRINKABLE_IMAGE_TYPES.includes(file.type)) {
    const s = await shrinkImageToFit(file, SMALL_UPLOAD_BYTES);
    if (s) {
      opts.onNotice?.(`ย่อรูปให้อัตโนมัติ ${fileMb(file.size)} → ${fileMb(s.file.size)} (${s.width}×${s.height} px) — ยังคมพอสำหรับเว็บ`);
      file = s.file;
    }
  }
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
