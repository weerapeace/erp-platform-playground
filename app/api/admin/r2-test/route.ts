/**
 * R2 Diagnostic — debug ทำไมรูปไม่ขึ้น
 *
 * GET /api/admin/r2-test?key=<r2_key>
 *   → return config + test signed URL + server-side fetch result
 *
 * ใช้ login → ดู status R2 access + bucket + key validity
 */

import { NextRequest, NextResponse } from "next/server";
import { r2GetSignedUrl, R2_BUCKET } from "@/lib/r2";

export async function GET(request: NextRequest) {
  // F18: public diagnostic ชั่วคราว — CF Access กั้นด้านนอกอยู่แล้ว
  // (ไม่ตรวจ login เพื่อให้ดู R2 status code จริงได้)

  const key = new URL(request.url).searchParams.get("key") ?? "parent_skus/19230/2025-10-31-02-17-25/original";

  const diag: Record<string, unknown> = {
    config: {
      bucket:                  R2_BUCKET,
      account_id_prefix:       (process.env.R2_ACCOUNT_ID ?? "").slice(0, 8) + "...",
      access_key_id_prefix:    (process.env.R2_ACCESS_KEY_ID ?? "").slice(0, 8) + "...",
      secret_set:              !!process.env.R2_SECRET_ACCESS_KEY,
      endpoint:                `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    },
    test_key: key,
  };

  // 1. generate signed URL
  try {
    const url = await r2GetSignedUrl(key, 300);
    diag.signed_url = url;

    // 2. fetch จาก R2 (server-side ไม่ติด CORS/cache)
    try {
      const r = await fetch(url, { method: "HEAD" });
      diag.fetch_result = {
        status:        r.status,
        ok:            r.ok,
        content_type:  r.headers.get("content-type"),
        content_length: r.headers.get("content-length"),
        cf_ray:        r.headers.get("cf-ray"),
      };
      if (!r.ok) {
        // ถ้า fail ลองอ่าน body เพื่อดู error message
        try {
          const r2 = await fetch(url, { method: "GET" });
          const text = await r2.text();
          diag.fetch_error_body = text.slice(0, 500);
        } catch (e) {
          diag.fetch_error_body = String((e as Error).message ?? e);
        }
      }
    } catch (fetchErr) {
      diag.fetch_error = String((fetchErr as Error).message ?? fetchErr);
    }
  } catch (signErr) {
    diag.sign_error = String((signErr as Error).message ?? signErr);
  }

  return NextResponse.json(diag, { status: 200 });
}
