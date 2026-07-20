/**
 * PATCH /api/print-types/[id] — แก้ชื่อ/ขนาดเริ่มต้น · DELETE — ปิดใช้งาน (soft, ไม่ลบจริง กันข้อมูลเก่าพัง)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const { id } = await params;
  let b: { name?: string; default_w?: number | string | null; default_h?: number | string | null; unit?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = String(b.name).trim() || null;
  if (b.default_w !== undefined) patch.default_w = num(b.default_w);
  if (b.default_h !== undefined) patch.default_h = num(b.default_h);
  if (b.unit !== undefined) patch.unit = String(b.unit).trim() || "cm";
  if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_print_types").update(patch).eq("id", id)
    .select("id, code, name, default_w, default_h, unit, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_print_types").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
