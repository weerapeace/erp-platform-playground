/**
 * PATCH  /api/help-guides/[id]  — แก้คู่มือ (ชื่อ/ไอคอน/คำอธิบาย) หรือ **แทนที่ขั้นตอนทั้งชุด** ({ steps: [...] })
 * DELETE /api/help-guides/[id]  — ปิดใช้ (soft)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StepIn = { title?: string; body?: string; image_r2_key?: string | null; link_url?: string | null };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const { id } = await params;
  let b: { title?: string; icon?: string; description?: string; category?: string; steps?: StepIn[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.title !== undefined) patch.title = String(b.title).trim() || null;
  if (b.icon !== undefined) patch.icon = String(b.icon).trim() || null;
  if (b.description !== undefined) patch.description = String(b.description).trim() || null;
  if (b.category !== undefined) patch.category = String(b.category).trim() || null;
  if (Object.keys(patch).length > 1) {
    const { error } = await admin.from("erp_help_guides").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // แทนที่ขั้นตอนทั้งชุด (ลากเรียง/เพิ่ม/ลบในหน้าเดียว → ส่งมาทั้งหมด)
  if (Array.isArray(b.steps)) {
    await admin.from("erp_help_guide_steps").delete().eq("guide_id", id);
    const rows = b.steps
      .map((s, i) => ({
        guide_id: id, step_no: i + 1, sort_order: i,
        title: String(s.title ?? "").trim() || `ขั้นตอน ${i + 1}`,
        body: (s.body ?? "").toString().trim() || null,
        image_r2_key: (s.image_r2_key ?? "") || null,
        link_url: (s.link_url ?? "")?.toString().trim() || null,
      }));
    if (rows.length) { const { error } = await admin.from("erp_help_guide_steps").insert(rows); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); }
  }
  return NextResponse.json({ data: { ok: true }, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_help_guides").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
