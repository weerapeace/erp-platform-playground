/**
 * ช่วยคัดรูปในอัลบั้ม (ฝั่งหน้าจอ) — วัดความคมจากรูปย่อในเบราว์เซอร์ แล้วใช้กติกากลาง lib/content-album-cull
 * ไม่ส่งรูปไปไหน ไม่มีค่าใช้จ่าย · รูปคล้ายใช้ลายนิ้วมือที่เก็บไว้ตอนอัป (assets.phash)
 */
import { r2ImageUrl } from "@/lib/r2-image";
import { laplacianVariance, cullAlbum, type CullResult } from "@/lib/content-album-cull";
import type { AlbumFile } from "./api";

const SIDE = 256;   // ย่อก่อนวัด — เทียบกันในอัลบั้มเดียวกัน ขนาดเท่ากันทุกรูป

async function sharpnessOf(url: string): Promise<number | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous"; // รูปถูกส่งต่อไป erp-img (คนละโดเมน) — ไม่ใส่ = อ่านจุดภาพมาวัดความคมไม่ได้
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const r = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(3, Math.round(img.naturalWidth * r)), h = Math.max(3, Math.round(img.naturalHeight * r));
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    return laplacianVariance(gray, w, h);
  } catch { return null; }
}

/** วิเคราะห์รูปทั้งอัลบั้ม (เฉพาะรูปที่มีรูปย่อ · วิดีโอไม่นับ) */
export async function analyzeAlbumPhotos(files: AlbumFile[], onProgress?: (done: number, total: number) => void): Promise<CullResult & { checked: number }> {
  const photos = files.filter((f) => f.asset_type !== "video" && !f.r2_key.startsWith("drive:"));
  const items = [];
  for (const [i, f] of photos.entries()) {
    onProgress?.(i, photos.length);
    items.push({ id: f.id, score: await sharpnessOf(r2ImageUrl(f.r2_key, 512) ?? ""), phash: f.phash, area: (f.width ?? 0) * (f.height ?? 0) });
  }
  onProgress?.(photos.length, photos.length);
  return { ...cullAlbum(items), checked: photos.length };
}
