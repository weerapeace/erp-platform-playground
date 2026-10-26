/**
 * หน้าจับคู่เร็ว — /api/platform-match
 *  GET ?platform_id=&brand_id=  (products.platforms.view)
 *   → สินค้าที่ยังไม่จับคู่ ERP + "รหัสที่ระบบเดาว่าใช่" (suggest) ต่อแถว (ให้กดยืนยันทีเดียว)
 * จับคู่จริงใช้ /api/platform-catalog/match (POST) เดิม
 * เดาด้วยของกลาง lib/platform-match-server (ตัวเดียวกับหน้าสินค้าบนแพลตฟอร์ม)
 *   หน้านี้มีปุ่ม "ยืนยันทั้งหมด" → ส่ง suggest เฉพาะตัวที่รหัสตรงกันและไม่กำกวม (มั่นใจสูง) เท่านั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { computeMatchSuggestions } from "@/lib/platform-match-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  if (!platformId) return NextResponse.json({ listings: [], matchedCount: 0, error: null });
  const admin = supabaseAdmin();

  // ยอดจับคู่แล้ว (ไว้โชว์ความคืบหน้า) + รายการที่ยังไม่จับคู่พร้อมคู่ที่เดา
  let baseTotal = admin.from("platform_catalog_listings").select("id", { count: "exact", head: true }).eq("platform_id", platformId).not("matched_parent_sku_id", "is", null);
  if (brandId) baseTotal = baseTotal.eq("brand_id", brandId);
  const [{ count: matchedCount }, res] = await Promise.all([baseTotal, computeMatchSuggestions(admin, { platformId, brandId })]);
  const high = new Set(res.high);

  const listings = res.listings.map((r) => {
    const top = high.has(r.id) ? res.suggestions[r.id]?.[0] : undefined;
    return {
      id: r.id, external_product_id: r.external_product_id, title: r.title, sku_code: r.sku_code, price: r.price,
      suggest: top ? { parent_sku_id: top.parent_sku_id, code: top.code, name: top.name ?? top.code } : null,
    };
  });

  return NextResponse.json({ listings, matchedCount: matchedCount ?? 0, unmatched: listings.length, error: null });
}
