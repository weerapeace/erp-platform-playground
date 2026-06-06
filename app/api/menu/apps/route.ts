/**
 * /api/menu/apps — โมดูลใหญ่ (App groups) สำหรับ tabs บนสุด
 * GET (ทุก user) · POST/PATCH/DELETE (admin.users)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AppGroup = { id?: string; key: string; label: string; icon: string | null; sort_order: number; permission_key: string | null; is_active: boolean };

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์จัดการโมดูลใหญ่ (admin.users)";
  return null;
}

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request)
    .from("erp_app_groups").select("*").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=600" } });
}

export async function POST(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: { item?: AppGroup };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.item?.key || !body.item?.label) return NextResponse.json({ error: "ต้องมี key + label" }, { status: 400 });
  if (!/^[a-z][a-z0-9_-]{0,30}$/.test(body.item.key)) return NextResponse.json({ error: "key: a-z, 0-9, _ - เริ่มด้วยตัวอักษร" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("erp_app_groups").insert(body.item).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: { id?: string; patch?: Partial<AppGroup> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id || !body.patch) return NextResponse.json({ error: "ต้องมี id + patch" }, { status: 400 });
  const { id: _d, ...patch } = body.patch as Record<string, unknown>; void _d;
  const { data, error } = await supabaseAdmin().from("erp_app_groups").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_app_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
