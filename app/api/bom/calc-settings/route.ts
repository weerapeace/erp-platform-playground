/**
 * GET /api/bom/calc-settings → ค่าตั้งคำนวณกลางต่อชนิดวัตถุดิบ (bom_calc_settings)
 * ใช้ autofill หน้ากว้างผ้า / %เผื่อเสีย / หน่วย+ตัวแปลง ตอนเลือกชนิดในบรรทัด BOM
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CalcSetting = {
  material_type: string;
  default_face_width_cm: number | null;
  loss_percent: number;
  uom: string;
  cm_per_unit: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data, error } = await supabaseFromRequest(request)
    .from("bom_calc_settings")
    .select("material_type, default_face_width_cm, loss_percent, uom, cm_per_unit")
    .eq("is_active", true)
    .order("material_type", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as CalcSetting[], error: null });
}
