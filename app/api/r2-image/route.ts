/**
 * R2 Image Proxy — F15
 *
 * GET /api/r2-image?key=<r2_key>
 *
 * Fetch รูปจาก R2 (server-side) แล้ว stream กลับ → กัน CORS + ใช้ Edge cache
 *
 * ใช้แทน /api/master-v2/r2-signed-url สำหรับการแสดงรูปใน <img>
 * (signed URL ยังใช้ได้สำหรับกรณีอื่น เช่น download)
 *
 * Headers ที่ส่งกลับ:
 *   Content-Type      = ตามรูปที่ R2 ตอบ (image/jpeg, image/webp, ฯลฯ)
 *   Cache-Control     = public, max-age=3600 (browser cache 1 ชม.)
 *   CDN-Cache-Control = public, max-age=86400 (Cloudflare edge cache 1 วัน)
 */

import { NextRequest } from "next/server";
import { r2GetSignedUrl } from "@/lib/r2";

// SAFE: key อนุญาตเฉพาะ a-z0-9_-/. (กัน path traversal)
const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

export async function GET(request: NextRequest): Promise<Response> {
  // F17: ไม่ต้อง auth — Cloudflare Access protects URL (email allow-list)
  // image proxy = read-only public ตามมาตรฐาน CDN
  // ทำให้ <img src=...> ใช้งานได้ (browser ไม่ส่ง Authorization header)

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !SAFE_KEY.test(key)) {
    return new Response(JSON.stringify({ error: "invalid key" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // generate signed URL (short TTL — เราจะ fetch ทันที)
    const signedUrl = await r2GetSignedUrl(key, 60);

    // fetch จาก R2 server-side (ไม่ติด CORS เพราะ Worker → R2 = server-to-server)
    const r2Res = await fetch(signedUrl);
    if (!r2Res.ok) {
      return new Response(JSON.stringify({
        error:  "ไม่พบรูป",
        status: r2Res.status,
        key,
      }), {
        status:  r2Res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // stream กลับให้ browser พร้อม cache headers
    const contentType = r2Res.headers.get("content-type") ?? "image/jpeg";
    return new Response(r2Res.body, {
      status: 200,
      headers: {
        "Content-Type":      contentType,
        "Cache-Control":     "public, max-age=3600, stale-while-revalidate=86400",
        "CDN-Cache-Control": "public, max-age=86400",
        "Content-Length":    r2Res.headers.get("content-length") ?? "",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
