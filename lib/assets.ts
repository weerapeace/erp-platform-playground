/**
 * Assets Library (DAM) — ของกลาง helper (ใช้ได้ทั้ง server และ client)
 *
 * คลังรูป/ไฟล์งานออกแบบกลาง: เก็บไฟล์ครั้งเดียว แล้วหยิบไปใช้ซ้ำได้ทุกโมดูล
 * ไฟล์นี้เก็บเฉพาะ "ค่าคงที่ + ตัวช่วยล้วน" (ไม่แตะ DB/R2) ให้ import ได้ทั้งสองฝั่ง
 */

export type AssetType = "image" | "design" | "document" | "video" | "other";

/** เพดานขนาดไฟล์ต่อชิ้น (25MB — รูป/PDF/ไฟล์ออกแบบ/วิดีโอสั้น) */
export const ASSET_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_EXT  = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "heic", "heif", "avif"];
const DESIGN_EXT = ["ai", "psd", "eps", "sketch", "fig", "xd", "cdr", "indd"];
const DOC_EXT    = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"];
const VIDEO_EXT  = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  image: "รูปภาพ", design: "ไฟล์ออกแบบ", document: "เอกสาร", video: "วิดีโอ", other: "อื่นๆ",
};

/** นามสกุลไฟล์ (ตัวพิมพ์เล็ก) — คืน "" ถ้าไม่มี */
export function extOf(fileName: string): string {
  const p = fileName.split(".");
  return p.length > 1 ? (p.pop() as string).toLowerCase() : "";
}

/** เดาชนิดไฟล์จาก content-type + นามสกุล */
export function detectAssetType(contentType: string | null | undefined, fileName: string): AssetType {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct === "application/pdf") return "document";
  const e = extOf(fileName);
  if (IMAGE_EXT.includes(e))  return "image";
  if (DESIGN_EXT.includes(e)) return "design";
  if (VIDEO_EXT.includes(e))  return "video";
  if (DOC_EXT.includes(e))    return "document";
  return "other";
}

/** แปลงไบต์เป็นข้อความอ่านง่าย เช่น 1.2 MB */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${i === 0 ? n : Math.round(n * 10) / 10} ${u[i]}`;
}

/**
 * sha256 hex ของไฟล์ — ลายนิ้วมือกันอัปซ้ำ
 * ใช้ Web Crypto (crypto.subtle) ทำงานได้ทั้ง Node และ Edge/Workers/Vercel
 */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
