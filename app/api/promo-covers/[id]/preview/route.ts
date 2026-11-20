/**
 * 🖼 ดูก่อนยืนยัน — ชุดโปรนี้จะเปลี่ยนปกสินค้าบนร้านไหนบ้าง (อ่านอย่างเดียว ไม่แตะร้าน)
 *  GET → { summary: PlatformSummary[], targets: PlannedTarget[] (ตัด 2,000 รายการแรก), missingImage: [item ids], total }   (products.platforms.view)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isPromoPlatform } from "@/lib/promo-cover";
import { loadCampaignFull, planTargets } from "@/lib/promo-cover-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const full = await loadCampaignFull(admin, id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  try {
    const { targets, summary } = await planTargets(admin, full.campaign.platforms.filter(isPromoPlatform), full.items);
    const missingImage = full.items.filter((i) => !i.promo_key).map((i) => i.id);
    return NextResponse.json({ summary, targets: targets.slice(0, 2000), total: targets.length, missingImage }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `ดูรายการร้านไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
