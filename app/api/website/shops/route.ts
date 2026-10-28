/**
 * รายชื่อเว็บร้านทั้งหมด (สำหรับหน้ารวม /website) — /api/website/shops
 * GET → ร้าน + จำนวนสินค้าบนเว็บ + จำนวนที่เผยแพร่ + โดเมนเว็บจริง (ถ้าตั้งไว้)
 *        + หน้าตาการ์ด: โลโก้ (ธีม) + สีหลัก + ลิงก์พรีวิวเว็บ (siteUrl + previewKey — ร้านปิดเว็บก็เห็นหน้าแรก)
 *        เฉพาะร้านที่ผู้ใช้เข้าได้ (website.shop.<slug>)
 * ของกลาง: guardWebsite (สิทธิ์เว็บไซต์ · lib/website-access) + supabaseAdmin · normalizeTheme · issuePreviewKey
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite, websiteCanShop } from "@/lib/website-api-guard";
import { normalizeTheme } from "@/lib/website-theme";
import { issuePreviewKey } from "@/lib/storefront-preview-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;

  const sb = supabaseAdmin();

  const [{ data: shopsData }, { data: listings }, { data: domains }] = await Promise.all([
    sb.from("shops").select("id, name, slug, is_default, status, theme").order("is_default", { ascending: false }).order("name"),
    sb.from("store_listings").select("shop_id, is_published"),
    sb.from("shop_domains").select("shop_id, domain"),
  ]);

  const allShops = (shopsData ?? []) as { id: string; name: string; slug: string; is_default: boolean; status: string; theme: unknown }[];
  const allowed = await Promise.all(allShops.map((s) => websiteCanShop(request, s.slug)));
  const shops = allShops.filter((_, i) => allowed[i]);

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

  const img = (key: string | null) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}&w=320` : null);
  return NextResponse.json({
    shops: shops.map((s) => {
      const domain = domainByShop.get(s.id) ?? null;
      const siteUrl = domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : null;
      const th = normalizeTheme(s.theme);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        isDefault: s.is_default,
        status: s.status,
        total: total.get(s.id) ?? 0,
        published: published.get(s.id) ?? 0,
        domain,
        siteUrl,
        previewKey: siteUrl ? issuePreviewKey(s.slug) : null,
        // โลโก้: โหมดรูป = รูป · โหมดอื่น = ตัวอักษรในกล่อง + ข้อความ (แบบเดียวกับหัวเว็บ)
        logo: { mode: th.logo.mode, imageUrl: th.logo.mode === "image" ? img(th.logo.imageKey) : null, mark: th.logo.mark, text: th.logo.text },
        colors: { brand: th.colors.brand, brandDeep: th.colors.brandDeep, ink: th.colors.ink },
      };
    }),
  });
}
