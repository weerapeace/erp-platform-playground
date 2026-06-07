/**
 * GET /api/bom/material-families → รายการกลุ่มวัตถุดิบ (product_families) + %เผื่อเสีย
 * ใช้กับ dropdown "ติด tag กลุ่มวัตถุดิบ" ในตัวแก้บรรทัด BOM
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MaterialFamily = { id: string; name: string; loss_percentage: number | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data, error } = await supabaseFromRequest(request)
    .from("product_families")
    .select("id, name, loss_percentage")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as MaterialFamily[], error: null });
}
