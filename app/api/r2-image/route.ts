/**
 * R2 Image Proxy — F15 + F21
 *
 * GET /api/r2-image?key=<r2_key>
 *
 * F21: ใช้ R2 native binding (env.R2_IMAGES.get) ตรงๆ — ไม่มี AWS SDK
 * → bundle เล็ก → ไม่ชน Worker 1102 + ไม่ต้อง sign URL
 *
 * Headers:
 *   Content-Type      = จาก R2 object metadata
 *   Cache-Control     = public, max-age=3600 (browser cache 1 ชม.)
 *   CDN-Cache-Control = public, max-age=86400 (Cloudflare edge cache 1 วัน)
 */

import { NextRequest } from "next/server";
import { r2GetObject } from "@/lib/r2";

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

const CACHE_HEADERS = {
  "Cache-Control":     "public, max-age=3600, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, max-age=86400",
};

export async function GET(request: NextRequest): Promise<Response> {
  // F17: ไม่ต้อง auth — Cloudflare Access protects URL (image proxy = read-only CDN)
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !SAFE_KEY.test(key)) {
    return new Response(JSON.stringify({ error: "invalid key" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const obj = await r2GetObject(key);
    if (!obj) {
      return new Response(JSON.stringify({ error: "ไม่พบรูป", key }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type":   obj.httpMetadata?.contentType ?? "image/jpeg",
        "Content-Length": String(obj.size),
        ...CACHE_HEADERS,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
