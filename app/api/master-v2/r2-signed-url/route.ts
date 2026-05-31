export const runtime = "edge";

/**
 * Master Data v2 — R2 Signed URL generator
 *
 * GET /api/master-v2/r2-signed-url?key=<r2_key>&ttl=3600
 *
 * Returns time-limited signed URL สำหรับโหลดรูปจาก private R2 bucket
 * (admin app's bucket = odoo-product-images, ไม่มี public URL)
 */

import { NextRequest, NextResponse } from "next/server";
import { r2GetSignedUrl, isR2Configured } from "@/lib/r2";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export async function GET(request: NextRequest) {
  // ตรวจว่า user login
  const supabase = supabaseFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ url: null, error: "ต้อง login" }, { status: 401 });
  }

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
    return NextResponse.json({ url: null, error: "R2 ยังไม่ตั้งค่า" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const ttl = Math.min(86400, Math.max(60, parseInt(searchParams.get("ttl") ?? "3600", 10)));

  if (!key) {
    return NextResponse.json({ url: null, error: "ต้องระบุ key" }, { status: 400 });
  }

  try {
    const url = await r2GetSignedUrl(key, ttl);
    return NextResponse.json({ url, ttl, error: null });
  } catch (e) {
    return NextResponse.json(
      { url: null, error: String((e as Error).message ?? e) },
      { status: 500 }
    );
  }
}
