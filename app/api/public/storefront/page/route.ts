/**
 * API สาธารณะ — หน้าเว็บที่สร้างจากหลังบ้าน : /api/public/storefront/page?shop=<slug>&page=<slug>
 *
 * ไม่ระบุ page → คืนรายการหน้าที่เผยแพร่แล้ว (ไว้ทำเมนู/แผนผังเว็บ)
 * ระบุ page    → คืนบล็อกของหน้านั้น (+ SEO)
 * preview=1    → ใช้ร่างและมองเห็นหน้าที่ยังไม่เผยแพร่ด้วย
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา + มี CORS (เหมือน products/site)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
  const pageSlug = (url.searchParams.get("page") ?? "").trim();
  const preview = url.searchParams.get("preview") === "1";
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", shopSlug).maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const s = shop as { id: string; status: string };
  if (s.status !== "active") return json({ pages: [] });

  // รายการหน้า (ไว้ทำเมนู)
  if (!pageSlug) {
    const q = sb
      .from("store_pages")
      .select("slug, title, status, sort_order")
      .eq("shop_id", s.id)
      .eq("is_home", false)
      .order("sort_order");
    const { data } = preview ? await q : await q.eq("status", "published");
    return json({
      pages: ((data ?? []) as { slug: string; title: string }[]).map((p) => ({ slug: p.slug, title: p.title })),
    });
  }

  const { data: p } = await sb
    .from("store_pages")
    .select("slug, title, status, seo, layout, draft_layout")
    .eq("shop_id", s.id)
    .eq("slug", pageSlug)
    .maybeSingle();
  if (!p) return json({ error: "ไม่พบหน้านี้" }, 404);

  const row = p as {
    slug: string;
    title: string;
    status: string;
    seo: unknown;
    layout: unknown;
    draft_layout: unknown;
  };

  // หน้าที่ยังไม่เผยแพร่ เห็นได้เฉพาะโหมดพรีวิว
  if (row.status !== "published" && !preview) return json({ error: "ไม่พบหน้านี้" }, 404);

  const layout = preview && row.draft_layout != null ? row.draft_layout : row.layout;

  return json({
    slug: row.slug,
    title: row.title,
    seo: (row.seo ?? {}) as Record<string, string>,
    layout: Array.isArray(layout) ? layout : [],
  });
}
