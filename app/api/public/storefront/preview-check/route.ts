/**
 * API สาธารณะ — เช็กรหัสพรีวิวเว็บร้าน : GET /api/public/storefront/preview-check?shop=<slug>&pk=<รหัส>
 *   → { ok: true | false }
 *
 * เว็บร้านเรียกจากเซิร์ฟเวอร์ตอนร้าน "ปิดเว็บ" แต่มีคนเปิดด้วย ?preview=1 — ผ่านหน้าปิดได้เฉพาะรหัสถูก (lib/storefront-preview-key)
 * ⚠️ ไม่มี guardApi โดยเจตนา: คืนแค่ ถูก/ไม่ถูก ไม่มีข้อมูลร้าน · รหัสเซ็นด้วยกุญแจลับ เดาไม่ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyPreviewKey } from "@/lib/storefront-preview-key";
import { storefrontCors, corsPreflight } from "@/lib/storefront-cors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") ?? "").trim();
  const ok = verifyPreviewKey(shop, url.searchParams.get("pk"));
  return NextResponse.json({ ok }, { headers: { ...CORS, "Cache-Control": "no-store" } });
}
