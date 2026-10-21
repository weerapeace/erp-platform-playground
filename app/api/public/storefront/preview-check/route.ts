/**
 * API สาธารณะ — เช็กรหัสพรีวิวเว็บร้าน : GET /api/public/storefront/preview-check?shop=<slug>&pk=<รหัส>
 *   → { ok: true | false }
 *
 * เว็บร้านเรียกจากเซิร์ฟเวอร์ตอนร้าน "ปิดเว็บ" แต่มีคนเปิดด้วย ?preview=1 — ผ่านหน้าปิดได้เฉพาะรหัสถูก (lib/storefront-preview-key)
 * ⚠️ ไม่มี guardApi โดยเจตนา: คืนแค่ ถูก/ไม่ถูก ไม่มีข้อมูลร้าน · รหัสเซ็นด้วยกุญแจลับ เดาไม่ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyPreviewKey } from "@/lib/storefront-preview-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") ?? "").trim();
  const ok = verifyPreviewKey(shop, url.searchParams.get("pk"));
  return NextResponse.json({ ok }, { headers: { ...CORS, "Cache-Control": "no-store" } });
}
