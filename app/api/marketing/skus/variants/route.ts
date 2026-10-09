import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isUuid, type MarketingSkuVariant } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

// GET ?parent_id= → SKU ย่อย (สี/แบบ) ของรุ่น — โหลดเฉพาะตอนกดดูในช่อง "SKU ที่เหลือ"
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;
  const parentId = new URL(request.url).searchParams.get("parent_id");
  if (!isUuid(parentId)) return NextResponse.json({ data: null, error: "ไม่พบรุ่น" }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("skus_v2")
    .select("code, color_th, color, is_active, cover_image_r2_key").eq("parent_sku_id", parentId).order("code").limit(500);
  if (error) return NextResponse.json({ data: null, error: "โหลดสี/แบบไม่สำเร็จ: " + error.message }, { status: 500 });

  const variants: MarketingSkuVariant[] = (data ?? []).map((v) => ({
    code: v.code ?? "", color: v.color_th || v.color || null, is_active: v.is_active !== false, image_key: v.cover_image_r2_key ?? null,
  }));
  return NextResponse.json({ data: variants, error: null });
}
