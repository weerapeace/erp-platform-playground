/**
 * ตารางคำนวณบนกระดาน — อ่าน / บันทึก
 * GET   /api/canvas-tables/[id]  → { id, title, data }
 * PATCH /api/canvas-tables/[id]  { title?, data? } → { id, title, data }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const { data: row, error } = await supabaseAdmin().from("erp_canvas_tables").select("id, title, data").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบตาราง" }, { status: 404 });
  return NextResponse.json({ id: row.id, title: row.title, data: row.data ?? [], error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { title?: string; data?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title;
  // data ต้องเป็น string[][]
  if (Array.isArray(body.data)) patch.data = (body.data as unknown[]).map((r) => Array.isArray(r) ? (r as unknown[]).map((c) => (c == null ? "" : String(c))) : []);
  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("erp_canvas_tables").update(patch).eq("id", id).select("id, title, data").single();
  if (error || !row) return NextResponse.json({ error: error?.message ?? "บันทึกไม่สำเร็จ" }, { status: 400 });
  return NextResponse.json({ id: row.id, title: row.title, data: row.data ?? [], error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { error } = await supabaseAdmin().from("erp_canvas_tables").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, error: null });
}
