/**
 * context ของประเภท (แท็ก) สำหรับ Wizard เพิ่ม SKU
 * GET /api/skus/tag-context?family_tag_id=<uuid>
 *   → { fabric_widths: number[], sellers: [{id,name,count}] }
 * ใช้เสนอ "หน้ากว้างที่ใช้บ่อย" (badge) + "ผู้ขายที่ใช้บ่อย" (ติดดาว) ของประเภทนั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type TagContext = { fabric_widths: number[]; sellers: { id: string; name: string | null; count: number }[] };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const tagId = new URL(request.url).searchParams.get("family_tag_id");
  if (!tagId) return NextResponse.json({ fabric_widths: [], sellers: [], error: "family_tag_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin().rpc("erp_sku_tag_context", { p_tag: tagId });
  if (error) return NextResponse.json({ fabric_widths: [], sellers: [], error: error.message }, { status: 500 });

  const ctx = (data ?? {}) as Partial<TagContext>;
  return NextResponse.json({ fabric_widths: ctx.fabric_widths ?? [], sellers: ctx.sellers ?? [], error: null });
}
