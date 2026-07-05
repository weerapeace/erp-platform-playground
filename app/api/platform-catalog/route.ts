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
  const search = (sp.get("search") ?? "").trim();                       // ค้นหา listing (สำหรับ picker จับคู่)
  const limit = Math.min(5000, Math.max(1, parseInt(sp.get("limit") ?? "5000", 10)));
  if (!platformId) return NextResponse.json({ fields: [], listings: [], summary: { total: 0, matched: 0 }, error: null });
  const admin = supabaseAdmin();

  let lq = admin.from("platform_catalog_listings").select("id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at").eq("platform_id", platformId).order("created_at", { ascending: false }).limit(limit);
  if (brandId) lq = lq.eq("brand_id", brandId);
  if (search) lq = lq.or(`title.ilike.%${search}%,sku_code.ilike.%${search}%,external_product_id.ilike.%${search}%`);
  const [{ data: fields }, { data: listings }] = await Promise.all([
    admin.from("platform_field_schemas").select("field_key, field_label, data_type, is_required, sample, source").eq("platform_id", platformId).order("sort_order", { ascending: true }),
    lq,
  ]);
  const rows = (listings ?? []) as Record<string, unknown>[];
  // เติมรหัส/ชื่อ Parent SKU ที่จับคู่ไว้ (ไว้โชว์ว่าจับกับอะไร) — ถามเป็นชุดย่อยกัน .in() ยาวเกิน
  const matchedIds = [...new Set(rows.map((r) => r.matched_parent_sku_id).filter(Boolean) as string[])];
  const pMap = new Map<string, { code: string | null; name: string | null }>();
  for (let i = 0; i < matchedIds.length; i += 200) {
    const { data: ps } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", matchedIds.slice(i, i + 200));
    for (const p of ((ps ?? []) as Record<string, unknown>[])) pMap.set(String(p.id), { code: (p.code as string) ?? null, name: (p.name_th as string) ?? null });
  }
  for (const r of rows) {
    const m = r.matched_parent_sku_id ? pMap.get(String(r.matched_parent_sku_id)) : null;
    r.matched_code = m?.code ?? null; r.matched_name = m?.name ?? null;
  }
  return NextResponse.json({
    fields: (fields ?? []) as Record<string, unknown>[],
    listings: rows,
    summary: { total: rows.length, matched: rows.filter((r) => !!r.matched_parent_sku_id).length },
    error: null,
  });
}
