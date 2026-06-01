/**
 * R2 Image Proxy — F15 + F20
 *
 * GET /api/r2-image?key=<r2_key>
 *
 * F20: ใช้ R2 native binding (env.R2_IMAGES.get) ตรงๆ — ไม่ผ่าน AWS SDK
 * → bundle เล็กลงหลาย MB → ไม่ชน Worker 1102 + ไม่ต้อง sign URL
 * fallback: ถ้าไม่มี binding (local dev) → AWS SDK signed URL
 *
 * Headers:
 *   Content-Type      = จาก R2 object metadata
 *   Cache-Control     = public, max-age=3600 (browser cache 1 ชม.)
 *   CDN-Cache-Control = public, max-age=86400 (Cloudflare edge cache 1 วัน)
 */

import { NextRequest } from "next/server";
import { getR2Binding, r2GetSignedUrl } from "@/lib/r2";

// SAFE: key อนุญาตเฉพาะ a-z0-9_-/. (กัน path traversal)
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
    // ---- F20: R2 native binding (เร็ว, ไม่มี AWS SDK) ----
    const bucket = await getR2Binding();
    if (bucket) {
      const obj = await bucket.get(key);
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
    }

    // ---- Fallback: AWS SDK signed URL (local dev ที่ไม่มี binding) ----
    const signedUrl = await r2GetSignedUrl(key, 60);
    const r2Res = await fetch(signedUrl);
    if (!r2Res.ok) {
      return new Response(JSON.stringify({ error: "ไม่พบรูป", status: r2Res.status, key }), {
        status: r2Res.status, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(r2Res.body, {
      status: 200,
      headers: {
        "Content-Type":   r2Res.headers.get("content-type") ?? "image/jpeg",
        "Content-Length": r2Res.headers.get("content-length") ?? "",
        ...CACHE_HEADERS,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
