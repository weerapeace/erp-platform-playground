/**
 * คุณสมบัติที่หมวด Lazada ต้องการ — /api/lazada/category-attributes?brand_id=&category_id=
 * GET → { attributes: [{name,label,required,input_type,is_sale_prop,options}] }  (ดึงสดจาก Lazada)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazGetCategoryAttributes } from "@/lib/lazada";
import { getPlatformId, ensureLazToken } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const sp = new URL(request.url).searchParams;
  const brandId = (sp.get("brand_id") ?? "").trim();
  const categoryId = (sp.get("category_id") ?? "").trim();
  if (!brandId || !categoryId) return NextResponse.json({ error: "ต้องมี brand_id + category_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม lazada" }, { status: 400 });
  const tok = await ensureLazToken(admin, brandId, lazId, user?.id ?? null);
  if (!tok) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้เชื่อมต่อ Lazada" }, { status: 400 });

  try {
    const attributes = await lazGetCategoryAttributes(tok.gateway, tok.accessToken, categoryId);
    return NextResponse.json({ attributes, error: null });
  } catch (e) {
    return NextResponse.json({ error: `ดึงคุณสมบัติไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 });
  }
}
