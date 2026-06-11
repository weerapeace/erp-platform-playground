/**
 * Design Sheets — รายการสถานะจากระบบ Workflow กลาง
 * GET /api/design-sheets/statuses → [{ state_key, label, color, is_terminal }] เรียงตามลำดับ
 * แก้/เพิ่ม/ลบสถานะได้ที่ /admin/workflows (entity_type = design_sheet) — ไม่ต้องแก้โค้ด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("erp_workflow_states")
    .select("state_key, label, color, is_terminal")
    .eq("entity_type", "design_sheet").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}
