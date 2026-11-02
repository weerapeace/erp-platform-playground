/**
 * /api/post-image?k=<r2 key | drive:<fileId>> — รูปสำหรับให้แพลตฟอร์มโซเชียลดึงไปโพสต์ (ตัวยิงโพสต์ใช้ผ่าน lib/social-publish/media)
 *
 * - JPEG ที่กว้าง ≤2048 อยู่แล้ว = ส่งไฟล์เดิมเป๊ะ (ไม่บีบซ้ำ) · อย่างอื่นแปลงเป็น JPEG q92 (Instagram รับ JPEG เท่านั้น · PNG/WebP/HEIC จาก Drive โดนปฏิเสธ)
 *   กว้าง ≤ 2048 · หมุนตาม EXIF · พื้นใสเป็นขาว
 * - รูปบน Google Drive ดึงตรงจาก Drive ตอนแพลตฟอร์มขอ (ไม่ก็อปลง R2)
 * - ไม่ต้องล็อกอิน (เซิร์ฟเวอร์ Meta เรียก) — ปลอดภัยเท่า "ต้องรู้ key" เหมือน /api/r2-image และ /api/drive-video
 */
import { NextRequest } from "next/server";
import { isSafeR2Key, r2GetObject } from "@/lib/r2";
import { driveConfigured, driveDownloadFile } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const DRIVE_ID = /^[a-zA-Z0-9_-]{10,}$/;
const bad = (msg: string, status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function loadBytes(k: string): Promise<{ bytes: Uint8Array; type: string } | Response> {
  if (k.startsWith("drive:")) {
    const id = k.slice(6);
    if (!DRIVE_ID.test(id)) return bad("invalid drive id");
    if (!driveConfigured()) return bad("Google Drive ยังไม่ได้ตั้งค่า", 503);
    const dl = await driveDownloadFile(id);
    if (!dl) return bad("อ่านรูปจาก Drive ไม่ได้ — ตรวจว่าแชร์ไฟล์ให้บัญชีระบบแล้ว", 404);
    return { bytes: dl.bytes, type: dl.mimeType };
  }
  if (!SAFE_KEY.test(k) || !isSafeR2Key(k)) return bad("invalid key");
  const obj = await r2GetObject(k);
  if (!obj) return bad("ไม่พบรูป", 404);
  return { bytes: new Uint8Array(await new Response(obj.body).arrayBuffer()), type: obj.httpMetadata?.contentType ?? "" };
}

export async function GET(request: NextRequest): Promise<Response> {
  const k = (new URL(request.url).searchParams.get("k") ?? "").trim();
  if (!k) return bad("ต้องมี k");
  let src: { bytes: Uint8Array; type: string } | Response;
  try { src = await loadBytes(k); } catch (e) { return bad(`โหลดรูปไม่สำเร็จ: ${(e as Error).message}`, 502); }
  if (src instanceof Response) return src;

  let out: Uint8Array = src.bytes; let ct = src.type || "image/jpeg";
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(src.bytes).metadata();
    // เป็น JPEG อยู่แล้ว + ไม่เกิน 2048 + ไม่ต้องหมุน → ส่งไฟล์เดิมเป๊ะ (ไม่บีบอัดซ้ำ คมเท่าต้นฉบับในระบบ)
    const keep = meta.format === "jpeg" && (meta.width ?? 0) <= 2048 && (!meta.orientation || meta.orientation === 1);
    if (!keep) {
      out = new Uint8Array(await sharp(src.bytes).rotate().resize({ width: 2048, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer());
    }
    ct = "image/jpeg";
  } catch { /* แปลงไม่ได้ → ส่งไฟล์เดิม (แพลตฟอร์มอาจปฏิเสธเองถ้าไม่ใช่ JPEG) */ }
  return new Response(out as BodyInit, {
    headers: { "Content-Type": ct, "Content-Length": String(out.byteLength), "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
