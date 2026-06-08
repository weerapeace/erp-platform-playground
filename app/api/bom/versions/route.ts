/**
 * GET /api/bom/versions?product_sku=X → รายการเวอร์ชั่นของสูตรสำหรับสินค้าหนึ่ง
 * ใช้กับ dropdown สลับเวอร์ชั่น + คำนวณเวอร์ชั่น/รหัสถัดไปอัตโนมัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BomVersion = { id: string; bom_code: string; version: string | null; status: string | null; is_default: boolean };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const productSku = (new URL(request.url).searchParams.get("product_sku") ?? "").trim();
  if (!productSku) return NextResponse.json({ data: [], error: null });

  const { data, error } = await supabaseFromRequest(request)
    .from("bom_headers")
    .select("id, bom_code, version, status, is_default")
    .eq("product_sku", productSku)
    .eq("is_active", true)
    .order("version", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as BomVersion[], error: null });
}
