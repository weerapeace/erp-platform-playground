/**
 * 🏷️ เดาแท็กให้สินค้า "ที่กำลังสร้าง" — GET /api/product-tags/suggest/new (เจ้าของสั่ง 2026-11-20)
 *   ?code=&name=&brand_id=&category_id=&parent_sku_id=
 *   → { data: NewItemTagSuggestion[] } · กฎกลาง lib/tag-suggest-rules (suggestTagsForNewItem) · ไม่ใช้ AI · อ่านอย่างเดียว
 * ใช้ที่: ปุ่มแนะนำแท็กในฟอร์มสร้าง SKU / Parent (components/relation-multi)
 * สิทธิ์: products.view
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { suggestTagsForNewItem } from "@/lib/tag-suggest-rules";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const denied = await guardApi(req, "products.view");
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const code = (sp.get("code") ?? "").slice(0, 120);
  const name = (sp.get("name") ?? "").slice(0, 300);
  const brandId = sp.get("brand_id") ?? "";
  const categoryId = sp.get("category_id") ?? "";
  const parentId = sp.get("parent_sku_id") ?? "";
  const admin = supabaseAdmin();
  try {
    const [fams, grps, brand, cat, parentTags] = await Promise.all([
      admin.from("product_families").select("id, name, group_id").not("is_active", "is", false),
      admin.from("product_family_groups").select("id, name, parent_group_id, single_select"),
      UUID.test(brandId) ? admin.from("brands").select("name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      UUID.test(categoryId) ? admin.from("product_categories").select("name").eq("id", categoryId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      UUID.test(parentId) ? admin.from("parent_skus_v2_product_family_m2m").select("tgt_id").eq("src_id", parentId) : Promise.resolve({ data: [], error: null }),
    ]);
    if (fams.error || grps.error) throw new Error(fams.error?.message ?? grps.error?.message);
    const tags = (fams.data ?? []).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), group_id: r.group_id ? String(r.group_id) : null }));
    const groups = (grps.data ?? []).map((g) => ({ id: String(g.id), name: String(g.name ?? ""), parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null, single_select: !!g.single_select }));
    const data = suggestTagsForNewItem({
      code, name,
      brandName: (brand.data as { name?: string } | null)?.name ?? null,
      categoryName: (cat.data as { name?: string } | null)?.name ?? null,
      parentTagIds: ((parentTags.data ?? []) as { tgt_id: string }[]).map((r) => String(r.tgt_id)),
    }, tags, groups);
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ data: [], error: "เดาแท็กไม่สำเร็จ ลองใหม่อีกครั้ง" + (e instanceof Error ? ` (${e.message})` : "") }, { status: 500 });
  }
}
