/**
 * Design Sheets — SKU ที่สร้างจากใบงานนี้ (ไว้เลือกในโมดอลส่งไปใบเสนอราคา)
 *
 * GET /api/design-sheets/[id]/skus
 * → { data: [{ id, code, name_th, color, list_price, cover_image_r2_key }], error }
 *   ดึง skus_v2 ที่อยู่ใต้ Parent SKU ของใบ (จาก parent_sku_codes / parent_sku_code)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SheetSku = {
  id: string; code: string; name_th: string | null; color: string | null;
  list_price: number | null; cover_image_r2_key: string | null;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: sheet } = await admin.from("design_sheets").select("parent_sku_code, parent_sku_codes").eq("id", id).maybeSingle();
  const codes = new Set<string>();
  if (Array.isArray(sheet?.parent_sku_codes)) for (const c of sheet!.parent_sku_codes as string[]) if (c) codes.add(String(c));
  if (sheet?.parent_sku_code) codes.add(String(sheet.parent_sku_code));
  if (codes.size === 0) return NextResponse.json({ data: [], error: null });

  const { data: parents } = await admin.from("parent_skus_v2").select("id").in("code", Array.from(codes));
  const parentIds = (parents ?? []).map((p) => p.id as string);
  if (parentIds.length === 0) return NextResponse.json({ data: [], error: null });

  const { data, error } = await admin.from("skus_v2")
    .select("id, code, name_th, color, list_price, cover_image_r2_key")
    .in("parent_sku_id", parentIds).order("code");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  return NextResponse.json({ data: (data ?? []) as SheetSku[], error: null });
}
