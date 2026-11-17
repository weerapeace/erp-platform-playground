/**
 * GET /api/admin/schema/referencing-fks?module=<moduleKey>   (หรือ ?table=<table>)
 * คืน "ตารางลูก + ช่อง FK" ที่ชี้กลับมาหาตารางของโมดูลนี้
 * ใช้ในหน้าสร้างฟิลด์ one2many — กรองตารางให้เหลือเฉพาะที่ชี้กลับมาได้ + เติม FK อัตโนมัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FkRow = { child_table: string; fk_column: string; child_is_module: boolean; child_label: string };

export async function GET(request: NextRequest) {
  // 🔒 ต้องล็อกอิน (เดิมเปิดให้คนนอกเห็นโครงสร้างตาราง — audit 2026-11-17)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ links: [], error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module");
  let table = searchParams.get("table");

  const admin = supabaseAdmin();

  // resolve moduleKey → table_name
  if (!table && moduleKey) {
    const { data: mod } = await admin.from("erp_modules").select("table_name").eq("module_key", moduleKey).maybeSingle();
    table = (mod?.table_name as string | undefined) ?? null;
  }
  if (!table) return NextResponse.json({ links: [], error: "ต้องระบุ module หรือ table" }, { status: 400 });

  const { data, error } = await admin.rpc("erp_admin_referencing_fks", { p_target_table: table });
  if (error) return NextResponse.json({ links: [], error: error.message }, { status: 500 });

  // ตัด junction ของ many2many (เช่น *_m2m) ออก — ไม่ใช่ตารางลูกแบบ one2many
  const links = ((data ?? []) as FkRow[]).filter((r) => !/_m2m$/.test(r.child_table));
  return NextResponse.json({ links, error: null });
}
