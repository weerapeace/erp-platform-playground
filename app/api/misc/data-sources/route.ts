/**
 * Misc — รายชื่อ "ข้อมูลที่เรามี" (โมดูลจริงในระบบ) สำหรับตัวช่วยขอแอปใหม่
 * GET /api/misc/data-sources → { data: [{ module_key, label, group_label }] }
 * ดึงจาก erp_modules จริง (ไม่ hardcode) ให้ผู้ใช้ติ๊กว่าแอปใหม่จะเชื่อมกับข้อมูลไหน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MiscDataSource = { module_key: string; label: string; group_label: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "app.misc"); if (denied) return denied;
  const { data, error } = await supabaseAdmin()
    .from("erp_modules").select("module_key, label, group_label")
    .order("group_label", { ascending: true, nullsFirst: false }).order("label", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as MiscDataSource[], error: null });
}
