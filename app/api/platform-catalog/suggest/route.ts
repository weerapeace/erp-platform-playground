/**
 * เดาคู่ "สินค้าบนร้าน" ↔ "สินค้าในระบบ" — /api/platform-catalog/suggest
 * GET ?platform_id=&brand_id=&listing_id=  (products.platforms.view)
 *   → suggestions { [listing_id]: MatchSuggestion[] (สูงสุด 3) }
 *     high: listing_id[]  = รหัสตรงกันและไม่กำกวม (ใช้กับปุ่ม "ยืนยันทั้งหมดที่รหัสตรงกัน")
 *     stats { unmatched, suggested, high }
 * ปกติเดาเฉพาะตัวที่ "ยังไม่จับคู่" · ส่ง listing_id = ขอตัวเดียว (แม้จับคู่แล้ว — ใช้ตอนกดเปลี่ยนคู่)
 * แค่เสนอ ไม่บันทึกอะไร — บันทึกจริงที่ /api/platform-catalog/match (คนกดยืนยันเท่านั้น)
 * กติกาการเดา: lib/platform-match-suggest · อ่าน DB: lib/platform-match-server
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
  const listingId = (sp.get("listing_id") ?? "").trim();
  if (!platformId && !listingId) return NextResponse.json({ suggestions: {}, high: [], stats: { unmatched: 0, suggested: 0, high: 0 }, error: null });

  const { listings, suggestions, high } = await computeMatchSuggestions(supabaseAdmin(), { platformId, brandId, listingId });
  return NextResponse.json({
    suggestions, high,
    stats: { unmatched: listings.length, suggested: Object.keys(suggestions).length, high: high.length },
    error: null,
  });
}
