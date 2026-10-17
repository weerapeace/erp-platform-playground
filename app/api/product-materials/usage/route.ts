/**
 * 🧵 วัสดุนี้ถูกพูดถึงในสินค้าบนเว็บร้านกี่รุ่น — GET /api/product-materials/usage?id=<uuid>
 *
 * ใช้ที่หน้าดูวัสดุ (components/product-materials/material-view) → "ลิงก์ขึ้นใน N รุ่น" ต่อร้าน + ปุ่มเปิดหน้าวัสดุบนเว็บ
 * นับจากสินค้าที่เผยแพร่ (store_listings.is_published) ของร้านที่เปิดอยู่ · จับคำแบบเดียวกับเว็บ (lib/product-materials)
 *   ข้อความที่ตรวจ: คำอธิบายที่ร้านกรอกทับ + คำอธิบาย/คำโปรย/คำแนะนำ ไทย-อังกฤษ ของ Parent SKU + ฟิลด์สเปกที่ส่งออกเว็บ
 *   ≈ ใกล้เคียงหน้าเว็บจริง (เว็บเลือกคำอธิบายตามการจับคู่ฟิลด์ของแต่ละร้าน) · นับแม้วัสดุยังไม่มีคำอธิบาย
 *     (ใช้บอกว่า "เขียนแล้วจะลิงก์ได้กี่รุ่น")
 * สิทธิ์ products.view · อ่านอย่างเดียว (ไม่มี audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { hasMaterialPage, mentionsMaterial, MATERIAL_SELECT, type MaterialRow } from "@/lib/product-materials";
import { loadParentWebFields, resolveRelatedValues, productWebAttrs } from "@/lib/website-parent-fields";
import { loadShopSiteUrls } from "@/lib/website-site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** คอลัมน์ข้อความของ Parent SKU ที่เว็บอาจใช้เป็นคำอธิบาย (ดู lib/website-field-map DescSource) */
const DESC_COLS = ["description", "description_en", "platform_description", "introduction", "introduction_en", "english_description"];

export type MaterialUsageShop = { id: string; name: string; siteUrl: string | null; listed: number; count: number };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "ไม่พบวัสดุ" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: mat, error: matErr } = await sb.from("product_materials").select(MATERIAL_SELECT).eq("id", id).maybeSingle();
  if (matErr) return NextResponse.json({ error: "โหลดข้อมูลวัสดุไม่สำเร็จ" }, { status: 500 });
  if (!mat) return NextResponse.json({ error: "ไม่พบวัสดุ" }, { status: 404 });
  const m = mat as MaterialRow;

  const { data: shopRows } = await sb.from("shops").select("id, name").eq("status", "active").order("name");
  const shops = (shopRows ?? []) as { id: string; name: string }[];
  if (!shops.length) return NextResponse.json({ data: { hasPage: hasMaterialPage(m), shops: [] } });

  const { data: listRows, error: listErr } = await sb
    .from("store_listings")
    .select("shop_id, parent_sku_id, web_description")
    .eq("is_published", true)
    .in("shop_id", shops.map((x) => x.id));
  if (listErr) return NextResponse.json({ error: "โหลดสินค้าบนเว็บไม่สำเร็จ" }, { status: 500 });
  const listings = (listRows ?? []) as { shop_id: string; parent_sku_id: string | null; web_description: unknown }[];

  // Parent SKU ของสินค้าที่เผยแพร่ (แบ่งชุดกัน URL ยาวเกิน)
  const parentIds = [...new Set(listings.map((l) => l.parent_sku_id).filter((x): x is string => !!x))];
  const parents: Record<string, unknown>[] = [];
  for (let i = 0; i < parentIds.length; i += 150) {
    const { data } = await sb.from("parent_skus_v2").select("*").in("id", parentIds.slice(i, i + 150));
    parents.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const parentFields = await loadParentWebFields(sb);
  const related = await resolveRelatedValues(sb, parentFields, parents);
  const byId = new Map(parents.map((p) => [String(p.id), p]));

  const listed = new Map<string, number>();
  const count = new Map<string, number>();
  for (const l of listings) {
    const p = l.parent_sku_id ? byId.get(l.parent_sku_id) : undefined;
    if (!p) continue;
    listed.set(l.shop_id, (listed.get(l.shop_id) ?? 0) + 1);
    const texts = [l.web_description, ...DESC_COLS.map((k) => p[k]), ...Object.values(productWebAttrs(p, parentFields, related))];
    if (mentionsMaterial(texts, m)) count.set(l.shop_id, (count.get(l.shop_id) ?? 0) + 1);
  }

  const urls = await loadShopSiteUrls(sb, shops.map((x) => x.id));
  const out: MaterialUsageShop[] = shops
    .filter((x) => listed.has(x.id))
    .map((x) => ({ id: x.id, name: x.name, siteUrl: urls.get(x.id) ?? null, listed: listed.get(x.id) ?? 0, count: count.get(x.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || b.listed - a.listed);
  return NextResponse.json({ data: { hasPage: hasMaterialPage(m), shops: out } });
}
