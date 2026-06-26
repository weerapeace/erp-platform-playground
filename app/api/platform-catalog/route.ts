/**
 * Platform Catalog (ทิศอ่าน) — /api/platform-catalog (โครง เฟสนี้ยังไม่ดึงข้อมูลจริง)
 * GET ?platform_id=&brand_id=  (products.platforms.view)
 *   → fields (ฟิลด์ของแพลตฟอร์มนั้น), listings (สินค้าบนร้าน), summary {total, matched}
 * การนำเข้าจริง (อัปไฟล์ export / ต่อ API) มาเฟสถัดไป — โครงตาราง+หน้าพร้อมแล้ว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  if (!platformId) return NextResponse.json({ fields: [], listings: [], summary: { total: 0, matched: 0 }, error: null });
  const admin = supabaseAdmin();

  let lq = admin.from("platform_catalog_listings").select("id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at").eq("platform_id", platformId).order("created_at", { ascending: false }).limit(500);
  if (brandId) lq = lq.eq("brand_id", brandId);
  const [{ data: fields }, { data: listings }] = await Promise.all([
    admin.from("platform_field_schemas").select("field_key, field_label, data_type, is_required, sample, source").eq("platform_id", platformId).order("sort_order", { ascending: true }),
    lq,
  ]);
  const rows = (listings ?? []) as Record<string, unknown>[];
  return NextResponse.json({
    fields: (fields ?? []) as Record<string, unknown>[],
    listings: rows,
    summary: { total: rows.length, matched: rows.filter((r) => !!r.matched_parent_sku_id).length },
    error: null,
  });
}
