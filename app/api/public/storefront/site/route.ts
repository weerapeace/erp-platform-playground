/**
 * API สาธารณะ — ตั้งค่าเว็บร้าน (ธีม/โลโก้) : /api/public/storefront/site?shop=<slug>
 *
 * ใครเรียกได้: ทุกคน (ไม่ต้องล็อกอิน) — เว็บร้านภายนอกดึงไปตกแต่งหน้าเว็บ
 * ส่งเฉพาะข้อมูลหน้าตาเว็บ ไม่มีข้อมูลภายใน (คู่กับ /api/public/storefront/products)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา + มี CORS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeTheme } from "@/lib/website-theme";

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

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();
  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status, theme, home_layout")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);

  const s = shop as {
    id: string;
    name: string;
    slug: string;
    status: string;
    theme: unknown;
    home_layout: unknown;
  };

  return json({
    shop: s.slug,
    shopName: s.name,
    active: s.status === "active",
    theme: normalizeTheme(s.theme),
    // เตรียมไว้สำหรับเฟสถัดไป (page builder) — ตอนนี้ปกติจะเป็น []
    layout: Array.isArray(s.home_layout) ? s.home_layout : [],
  });
}
