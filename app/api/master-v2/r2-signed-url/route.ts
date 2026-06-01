/**
 * R2 Signed URL — F21: deprecated, redirect ไป /api/r2-image proxy
 *
 * เดิมสร้าง signed URL ผ่าน AWS SDK presigner
 * ตอนนี้ตัด AWS SDK ออกแล้ว (กัน Worker 1102) → ใช้ proxy /api/r2-image แทน
 *
 * GET /api/master-v2/r2-signed-url?key=X → { url: "/api/r2-image?key=X" }
 * (คง endpoint ไว้เพื่อ backward-compat กับ code เก่าที่ยังเรียก)
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ url: null, error: "ต้องระบุ key" }, { status: 400 });
  // คืน proxy URL (same-origin, ไม่ต้อง sign)
  return NextResponse.json({ url: `/api/r2-image?key=${encodeURIComponent(key)}`, error: null });
}
