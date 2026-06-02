/**
 * GET /api/admin/modules — รายชื่อโมดูลทั้งหมดจากทะเบียน (erp_modules)
 * ใช้แทนการ hardcode รายชื่อโมดูล (เช่น dropdown ใน Schema Sync)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request)
    .from("erp_modules")
    .select("module_key, label, table_name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const modules = (data ?? []).map((m) => ({ key: m.module_key as string, label: m.label as string, table: m.table_name as string }));
  return NextResponse.json({ data: modules, error: null });
}
