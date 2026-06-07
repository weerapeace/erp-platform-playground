/**
 * GET /api/bom/material-groups → รายการกลุ่มวัตถุดิบ (material_groups) + กฎคำนวณ
 * ใช้: dropdown เลือกชนิด + ตัวคูณสูตร (calc_method/divisor/loss) ในตัวแก้บรรทัด BOM
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MaterialGroup = {
  id: string; code: string; name: string;
  calc_method: string; loss_percent: number; divisor: number | null; uom_default: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data, error } = await supabaseFromRequest(request)
    .from("material_groups")
    .select("id, code, name, calc_method, loss_percent, divisor, uom_default")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as MaterialGroup[], error: null });
}
