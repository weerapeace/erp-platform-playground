/**
 * ตารางคำนวณบนกระดาน — สร้างใหม่
 * POST /api/canvas-tables  { title?, rows?, cols? } → { id, title, data }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { title?: string; rows?: number; cols?: number };
  try { body = await request.json(); } catch { body = {}; }
  const rows = Math.min(Math.max(Number(body.rows) || 5, 1), 50);
  const cols = Math.min(Math.max(Number(body.cols) || 4, 1), 20);
  const data: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("erp_canvas_tables")
    .insert({ title: (body.title ?? "").trim() || "ตาราง", data, created_by: user?.id ?? null })
    .select("id, title, data").single();
  if (error || !row) return NextResponse.json({ error: error?.message ?? "สร้างตารางไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ id: row.id, title: row.title, data: row.data, error: null });
}
