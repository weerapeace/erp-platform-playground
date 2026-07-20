/**
 * GET /api/parent-skus/[id]/first-child-image — รูปปกของ SKU ลูกตัวแรก (เรียงตาม code) ที่มีรูป
 *   ใช้เป็น "รูปตัวอย่าง" ตอน Parent ยังไม่มีรูปของตัวเอง
 *   → { url, sku_code } หรือ { url: null }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ url: null, error: null });

  const admin = supabaseAdmin();
  const { data } = await admin.from("skus_v2")
    .select("code, cover_image_r2_key")
    .eq("parent_sku_id", id).not("cover_image_r2_key", "is", null)
    .order("code", { ascending: true }).limit(1).maybeSingle();
  const row = data as { code: string; cover_image_r2_key: string | null } | null;
  if (!row?.cover_image_r2_key) return NextResponse.json({ url: null, error: null });
  return NextResponse.json({ url: `/api/r2-image?key=${encodeURIComponent(row.cover_image_r2_key)}`, sku_code: row.code, error: null });
}
