/**
 * ตัดการเชื่อมต่อ Shopee ของแบรนด์ — /api/shopee/disconnect
 * POST { brand_id } → ล้างกุญแจ + สถานะในระบบ (ไม่แตะอะไรบนร้าน · สิทธิ์ฝั่ง Shopee หมดเองตามวันที่ร้านเลือกตอนอนุญาต)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsBrandMismatch as shopNameMismatch } from "@/lib/tiktok-shop";
import { brandNameOf, getPlatformId, loadShopeeConn, saveShopeeConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ต้องมี brand_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม shopee" }, { status: 400 });
  const before = await loadShopeeConn(admin, brandId, spId);
  try { await saveShopeeConn(admin, brandId, spId, null, null, { stage: "disconnected" }, user?.id ?? null); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  // ร้านที่ชื่อไม่ตรงแบรนด์ (เชื่อมผิดแบรนด์) → ล้างรหัสร้านที่อาจถูกเติมไว้ในบัญชีร้านของแบรนด์นี้ (กันลิงก์สินค้าชี้ร้านอื่น)
  let clearedShopId = false;
  const shopId = before?.meta.shop_id ?? null;
  if (shopId && shopNameMismatch(before?.meta.shop_name, await brandNameOf(admin, brandId))) {
    const { data } = await admin.from("platform_accounts").update({ external_shop_id: null, updated_at: new Date().toISOString() })
      .eq("brand_id", brandId).eq("platform_id", spId).eq("external_shop_id", shopId).select("id");
    clearedShopId = (data ?? []).length > 0;
  }
  await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, platform: "shopee", disconnected: true, shop_id: shopId, shop_name: before?.meta.shop_name ?? null, cleared_shop_id: clearedShopId } });
  return NextResponse.json({ ok: true, error: null });
}
