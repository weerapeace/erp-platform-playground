/**
 * API สาธารณะ — ข้อมูลหน้า "ออกแบบสินค้าเอง" (ตัวประกอบสินค้า) : /api/public/storefront/configurator
 *
 * GET ?shop=<slug>&model=<รหัสทรง?>&preview=1&pk=<รหัสพรีวิว>
 *   → { models: การ์ดทรงที่เปิดอยู่[], data: ข้อมูลครบของทรงที่เลือก (ไม่ระบุ = ทรงแรก) | null }
 *   พรีวิวที่รหัสพรีวิวถูก (lib/storefront-preview-key) = เห็นทรงที่ยังปิดอยู่ด้วย (เจ้าของลองก่อนเปิดจริง)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (หน้าเว็บสาธารณะ) + CORS · ส่งเฉพาะของที่เปิดอยู่ ไม่มีข้อมูลภายใน (lib/product-configurator-public)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";
import { verifyPreviewKey } from "@/lib/storefront-preview-key";
import { buildConfiguratorPayload } from "@/lib/product-configurator-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET");
export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}
const json = corsJson(CORS);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  const slug = (sp.get("shop") ?? "").trim();
  if (!slug) return json({ models: [], data: null, error: "ต้องระบุ shop" }, 400);
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug<{ id: string; slug: string }>(sb, slug, "id, slug");
  if (!shop) return json({ models: [], data: null, error: "ไม่พบร้าน" }, 404);
  const preview = sp.get("preview") === "1" && verifyPreviewKey(shop.slug, sp.get("pk"));
  const payload = await buildConfiguratorPayload(sb, shop.id, { model: sp.get("model"), includeInactive: preview });
  // พรีวิว = ไม่แคช · ปกติ = แคชสั้น ๆ ที่ขอบ (ร้านแก้ราคา/รูปแล้วเห็นภายใน 1 นาที)
  return json({ ...payload, preview }, 200, preview ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300");
}
