/**
 * /api/parent-skus/[id]/health — "ต้องแก้ N อย่าง" ของรุ่นสินค้า (ป้ายหัวลิ้นชัก Parent SKU · components/parent-health-badge)
 *   เก็บข้อเท็จจริงแบบเบา (นับ/มีไหม) แล้วให้กฎกลาง lib/parent-health ตัดสิน · อ่านอย่างเดียว · guardApi products.view
 *   ไม่ส่งตัวเลขต้นทุน (บอกแค่ "มี/ไม่มีสูตร/ราคาซื้อ") — คนไม่มีสิทธิ์ต้นทุนก็ดูได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { parentHealthChecks, healthSummary } from "@/lib/parent-health";
import { isSellingPlatform } from "@/lib/selling-platforms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const filled = (v: unknown) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim().length > 0 : v != null && v !== "" && v !== 0);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const a = supabaseAdmin();

  const [{ data: p }, { data: skuData }, { data: drafts }, { data: listings }] = await Promise.all([
    a.from("parent_skus_v2").select("id, brand_id, cover_image_r2_key, category_id, platform_category_id, description, platform_description, weight_g").eq("id", id).maybeSingle(),
    a.from("skus_v2").select("id, code, is_active, list_price, standard_price").eq("parent_sku_id", id),
    a.from("platform_listing_drafts").select("platform_id, status, last_sync_status, platform_product_id").eq("parent_sku_id", id),
    a.from("platform_catalog_listings").select("platform_id, status").eq("matched_parent_sku_id", id),
  ]);
  if (!p) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const parent = p as Row;
  const skus = (skuData ?? []) as Row[];
  const codes = skus.map((s) => String(s.code)).filter(Boolean);

  // มีสูตรผลิตไหม (นับอย่างเดียว) + ร้านขายที่แบรนด์เชื่อมแล้ว
  const [{ count: bomCount }, { data: accts }] = await Promise.all([
    codes.length ? a.from("bom_headers").select("id", { count: "exact", head: true }).in("product_sku", codes).eq("is_active", true) : Promise.resolve({ count: 0 }),
    parent.brand_id ? a.from("platform_accounts").select("platform_id, is_active").eq("brand_id", parent.brand_id as string) : Promise.resolve({ data: [] }),
  ]);
  const connected = ((accts ?? []) as Row[]).filter((x) => x.is_active !== false).map((x) => String(x.platform_id));
  const onSale = new Set<string>([
    ...((drafts ?? []) as Row[]).filter((d) => d.status === "published" || d.last_sync_status === "success" || !!d.platform_product_id).map((d) => String(d.platform_id)),
    ...((listings ?? []) as Row[]).filter((l) => l.status !== "removed").map((l) => String(l.platform_id)),
  ]);
  const missingIds = connected.filter((pid) => !onSale.has(pid));
  let notListedOn: string[] = [];
  if (missingIds.length) {
    const { data: pf } = await a.from("erp_platforms").select("id, code, name_th").in("id", missingIds);
    notListedOn = ((pf ?? []) as Row[]).filter((x) => isSellingPlatform(String(x.code ?? ""))).map((x) => String(x.name_th ?? x.code));
  }

  const active = skus.filter((s) => s.is_active !== false);
  const items = parentHealthChecks({
    hasCover: filled(parent.cover_image_r2_key),
    hasCategory: filled(parent.category_id),
    hasPlatformCategory: filled(parent.platform_category_id),
    hasDescription: filled(parent.description) || filled(parent.platform_description),
    hasWeight: Number(parent.weight_g) > 0,
    skuCount: active.length,
    skuNoPrice: active.filter((s) => !(Number(s.list_price) > 0)).length,
    hasBom: (bomCount ?? 0) > 0,
    hasBuyPrice: skus.some((s) => Number(s.standard_price) > 0),
    notListedOn,
  });
  return NextResponse.json({ items, summary: healthSummary(items), error: null }, { headers: { "Cache-Control": "no-store" } });
}
