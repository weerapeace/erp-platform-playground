/**
 * GET /api/admin/schema/tables
 * คืนรายชื่อ table ใน Supabase ที่ใช้เป็น relation target ได้ (มี column id)
 * ใช้โดย Field Creator (เลือก table ปลายทางของ many2one/many2many)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { data, error } = await supabaseAdmin().rpc("erp_admin_list_tables");
  if (error) return NextResponse.json({ tables: [], error: error.message }, { status: 500 });
  return NextResponse.json({ tables: data ?? [], error: null });
}
