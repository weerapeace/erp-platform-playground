/**
 * GET /api/drive/thumb?id=<fileId>&w=200 — พรีวิวรูปจาก Google Drive (ย่อผ่าน sharp) สำหรับฟอร์มนำเข้า
 * no-auth เหมือน /api/r2-image (เสิร์ฟเฉพาะไฟล์ที่ service account เข้าถึง = งานเราเอง)
 */
import { NextRequest } from "next/server";
import { driveConfigured, driveDownloadFile } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const id = (sp.get("id") ?? "").trim();
  const w = Math.min(800, Math.max(40, Number(sp.get("w")) || 200));
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return new Response("invalid id", { status: 400 });
  if (!driveConfigured()) return new Response("drive not configured", { status: 503 });

  const dl = await driveDownloadFile(id);
  if (!dl) return new Response("not found", { status: 404 });

  let bytes: Uint8Array = dl.bytes; let ct = dl.mimeType || "image/png";
  if (!/gif|svg/i.test(ct)) {
    try {
      const sharp = (await import("sharp")).default;
      bytes = new Uint8Array(await sharp(dl.bytes).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer());
      ct = "image/webp";
    } catch { /* ย่อไม่ได้ → ส่งตัวเต็ม */ }
  }
  return new Response(bytes as BodyInit, { headers: { "Content-Type": ct, "Cache-Control": "private, max-age=300" } });
}
