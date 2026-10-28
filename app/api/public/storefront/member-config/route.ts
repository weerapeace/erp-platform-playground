/**
 * 👤 ค่าระบบสมาชิกของร้าน (สาธารณะ — เว็บร้านฝั่งเซิร์ฟเวอร์ดึงไปแคช 60 วิ) — /api/public/storefront/member-config?shop=<slug>
 * → { ok, enabled, jwk, providers: { google?: { clientId }, line?: {…}, facebook?: {…} } }
 *   enabled = ERP ออกบัตรสมาชิกได้ · jwk = กุญแจสาธารณะไว้ตรวจบัตร (lib/storefront-member-token)
 *   providers = ช่องทางที่ตั้งครบ + เปิดอยู่ (lib/storefront-oauth providerReady) — มีแค่ Client ID (เปิดเผยได้) ไม่มีรหัสลับ
 * ไม่มีช่องทางไหนตั้งเลย = เว็บร้านไม่โชว์ปุ่มสมัคร (สมาชิกทดลองยังเข้าได้ด้วยลิงก์จาก ERP)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { activeShopBySlug } from "@/lib/website-shop";
import { memberPublicJwk } from "@/lib/storefront-member-token";
import { providerReady, readLoginProviders, type OAuthProvider } from "@/lib/storefront-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug(sb, request.nextUrl.searchParams.get("shop"));
  if (!shop) return NextResponse.json({ ok: false, error: "ไม่พบร้าน" }, { status: 404 });
  const jwk = memberPublicJwk();
  const providers: Partial<Record<OAuthProvider, { clientId: string }>> = {};
  if (jwk) for (const [p, r] of await readLoginProviders(sb, shop.id)) if (providerReady(r)) providers[p] = { clientId: r.client_id.trim() };
  return NextResponse.json({ ok: true, enabled: !!jwk, jwk, providers }, { headers: { "Cache-Control": "no-store" } });
}
