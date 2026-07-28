/**
 * รายชื่อเว็บร้านทั้งหมด (สำหรับหน้ารวม /website) — /api/website/shops
 * GET → ร้าน + จำนวนสินค้าบนเว็บ + จำนวนที่เผยแพร่ + โดเมนเว็บจริง (ถ้าตั้งไว้)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const sb = supabaseAdmin();

  const [{ data: shopsData }, { data: listings }, { data: domains }] = await Promise.all([
    sb.from("shops").select("id, name, slug, is_default, status").order("is_default", { ascending: false }).order("name"),
    sb.from("store_listings").select("shop_id, is_published"),
    sb.from("shop_domains").select("shop_id, domain"),
  ]);

  const shops = (shopsData ?? []) as { id: string; name: string; slug: string; is_default: boolean; status: string }[];

  const total = new Map<string, number>();
  const published = new Map<string, number>();
  for (const l of (listings ?? []) as { shop_id: string; is_published: boolean }[]) {
    total.set(l.shop_id, (total.get(l.shop_id) ?? 0) + 1);
    if (l.is_published) published.set(l.shop_id, (published.get(l.shop_id) ?? 0) + 1);
  }

  const domainByShop = new Map<string, string>();
  for (const d of (domains ?? []) as { shop_id: string; domain: string }[]) {
    if (!domainByShop.has(d.shop_id)) domainByShop.set(d.shop_id, d.domain);
  }

  return NextResponse.json({
    shops: shops.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      isDefault: s.is_default,
      status: s.status,
      total: total.get(s.id) ?? 0,
      published: published.get(s.id) ?? 0,
      domain: domainByShop.get(s.id) ?? null,
    })),
  });
}
