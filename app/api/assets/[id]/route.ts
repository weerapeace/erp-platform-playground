/**
 * GET    /api/assets/[id]  — รายละเอียดไฟล์ + "ถูกใช้ที่ไหนบ้าง"
 * PATCH  /api/assets/[id]  — แก้ชื่อ/คำอธิบาย/อัลบั้ม/แท็ก  หรือ  กู้คืนจากถังขยะ ({ restore:true })
 * DELETE /api/assets/[id]  — ย้ายลงถังขยะ (soft delete) — บล็อกถ้ายัง "ถูกใช้อยู่"
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { type AssetDetail, type AssetUsage, rowOf, attachTags, actorId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- GET ----
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const { id } = await ctx.params;

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("assets").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ data: null, error: "ไม่พบไฟล์" }, { status: 404 });

  const base = await rowOf(admin, data as Parameters<typeof rowOf>[1]);
  const { data: u } = await admin.from("asset_usages")
    .select("module, record_id, record_label, field, created_at").eq("asset_id", id)
    .order("created_at", { ascending: false });

  const detail: AssetDetail = { ...base, usages: (u ?? []) as AssetUsage[] };
  return NextResponse.json({ data: detail, error: null });
}

// ---- PATCH ----
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: {
    title?: string; description?: string | null; collection_id?: string | null;
    tags?: string[]; restore?: boolean;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();

  // กู้คืนจากถังขยะ
  if (body.restore) {
    const { error } = await admin.from("assets").update({ status: "active", trashed_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(admin, { action: "restore", entityType: "asset", entityId: id, actorId: await actorId(request) });
    const { data } = await admin.from("assets").select("*").eq("id", id).maybeSingle();
    return NextResponse.json({ data: data ? await rowOf(admin, data as Parameters<typeof rowOf>[1]) : null, error: null });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined)         patch.title = String(body.title).trim();
  if (body.description !== undefined)   patch.description = body.description;
  if (body.collection_id !== undefined) patch.collection_id = body.collection_id || null;

  const { error } = await admin.from("assets").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // แท็ก: แทนที่ทั้งชุด
  if (Array.isArray(body.tags)) {
    await admin.from("asset_tag_map").delete().eq("asset_id", id);
    await attachTags(admin, id, body.tags);
  }

  await writeAudit(admin, { action: "update", entityType: "asset", entityId: id, actorId: await actorId(request) });

  const { data } = await admin.from("assets").select("*").eq("id", id).maybeSingle();
  return NextResponse.json({ data: data ? await rowOf(admin, data as Parameters<typeof rowOf>[1]) : null, error: null });
}

// ---- DELETE (→ ถังขยะ) ----
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "assets.delete");
  if (denied) return denied;
  const { id } = await ctx.params;

  const admin = supabaseAdmin();

  // กันลบไฟล์ที่ยังถูกใช้อยู่ (offer sheet/แคมเปญ/สินค้า ฯลฯ)
  const { count } = await admin.from("asset_usages").select("id", { count: "exact", head: true }).eq("asset_id", id);
  if ((count ?? 0) > 0)
    return NextResponse.json(
      { error: `ลบไม่ได้ — ไฟล์นี้ถูกใช้อยู่ ${count} ที่ กรุณาเอาออกจากที่ใช้งานก่อน` }, { status: 409 });

  const { error } = await admin.from("assets")
    .update({ status: "trashed", trashed_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "delete", entityType: "asset", entityId: id, actorId: await actorId(request) });
  return NextResponse.json({ ok: true, error: null });
}
