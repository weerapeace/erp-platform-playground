/**
 * GET /api/admin/schema/columns?table=<table>
 * คืนรายชื่อคอลัมน์จริงของตาราง (จาก information_schema ผ่าน RPC get_table_columns)
 * ใช้ทำ dropdown เลือก "ชื่อแสดง" + คอลัมน์ย่อยในหน้าสร้างฟิลด์ one2many
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ColRow = { column_name: string; data_type: string; ordinal_position: number };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "admin.schema.view");
  if (denied) return denied;

  const table = new URL(request.url).searchParams.get("table");
  if (!table) return NextResponse.json({ columns: [], error: "ต้องระบุ table" }, { status: 400 });

  const { data, error } = await supabaseAdmin().rpc("get_table_columns", { p_table_name: table });
  if (error) return NextResponse.json({ columns: [], error: error.message }, { status: 500 });

  const columns = ((data ?? []) as ColRow[])
    .map((c) => ({ column: c.column_name, type: c.data_type }));
  return NextResponse.json({ columns, error: null });
}
