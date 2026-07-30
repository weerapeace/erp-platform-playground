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
import { normalizeFieldMap } from "@/lib/website-field-map";

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
  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  // preview=1 → ใช้ "ร่าง" ที่ยังไม่เผยแพร่ (หน้าตั้งค่าธีมใช้ดูผลก่อนกดเผยแพร่)
  const preview = url.searchParams.get("preview") === "1";
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();
  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status, theme, theme_draft, home_layout, home_layout_draft, field_map")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);

  const s = shop as {
    id: string;
    name: string;
    slug: string;
    status: string;
    theme: unknown;
    theme_draft: unknown;
    home_layout: unknown;
    home_layout_draft: unknown;
    field_map: unknown;
  };

  const themeSource = preview && s.theme_draft != null ? s.theme_draft : s.theme;
  const layoutSource = preview && s.home_layout_draft != null ? s.home_layout_draft : s.home_layout;

  return json({
    shop: s.slug,
    shopName: s.name,
    active: s.status === "active",
    preview,
    theme: normalizeTheme(themeSource),
    /** โครงหน้าแรก — [] = ยังไม่เคยตั้ง ให้เว็บใช้โครงเริ่มต้นของตัวเอง */
    layout: Array.isArray(layoutSource) ? layoutSource : [],
    /**
     * หมวดสินค้าของร้าน [{key,label,icon}] — เจ้าของเพิ่ม/แก้เองได้ในแท็บจับคู่ฟิลด์
     * เว็บร้านต้องวาดเมนูหมวดจากรายการนี้ ห้ามฝังไว้ในโค้ดเว็บ ไม่งั้นเพิ่มหมวดแล้วไม่ขึ้น
     */
    categories: normalizeFieldMap(s.field_map).categories,
  });
}
