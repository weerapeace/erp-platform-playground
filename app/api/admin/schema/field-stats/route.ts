/**
 * GET /api/admin/schema/field-stats?module=<key>&field=<column>
 * คืนจำนวนแถวทั้งหมด + จำนวนแถวที่ "มีข้อมูล" ในคอลัมน์นั้น (สำหรับเตือนตอนเปลี่ยนประเภท field)
 *   → { total, filled }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE = /^[a-z_][a-z0-9_]*$/i;

export async function GET(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module") ?? "";
  const field = searchParams.get("field") ?? "";
  if (!moduleKey || !field || !SAFE.test(field)) {
    return NextResponse.json({ error: "ต้องมี module + field (ชื่อถูกต้อง)" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: mod } = await admin.from("erp_modules").select("table_name").eq("module_key", moduleKey).maybeSingle();
  if (!mod) return NextResponse.json({ error: "ไม่พบ module" }, { status: 404 });
  const table = mod.table_name as string;

  // จำนวนทั้งหมด
  const totalRes = await admin.from(table).select("*", { count: "exact", head: true });
  if (totalRes.error) return NextResponse.json({ error: totalRes.error.message }, { status: 500 });

  // จำนวนที่มีข้อมูล (ไม่ใช่ null) — ถ้าคอลัมน์ไม่มีจริง (virtual) จะ error → filled = 0
  let filled = 0;
  const filledRes = await admin.from(table).select("*", { count: "exact", head: true }).not(field, "is", null);
  if (!filledRes.error) filled = filledRes.count ?? 0;

  return NextResponse.json({ total: totalRes.count ?? 0, filled, error: null });
}
