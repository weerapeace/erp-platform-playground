/**
 * แบรนด์ (Brands) — สำหรับตั้งสีประจำแบรนด์ (ใช้ทำกรอบการ์ดบนบอร์ดจ่ายงาน)
 * GET   /api/brands         → รายชื่อแบรนด์ + สี
 * POST  /api/brands         → สร้างแบรนด์ใหม่ { name, color? } (ปุ่ม ＋ ในฟอร์ม Design Sheets)
 * PATCH /api/brands         → ตั้งสี { id, color }
 * อ่าน/เขียนผ่าน supabaseAdmin + ตรวจ login
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Brand = { id: string; name: string; color: string | null; is_customer_job?: boolean };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้อง login" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("brands").select("id, name, color, is_customer_job").eq("is_active", true).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as Brand[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { name?: string; color?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อแบรนด์" }, { status: 400 });
  const color = body.color && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;

  const admin = supabaseAdmin();
  const { data: dup } = await admin.from("brands").select("id").ilike("name", name).limit(1);
  if ((dup ?? []).length > 0) return NextResponse.json({ error: `มีแบรนด์ชื่อ "${name}" อยู่แล้ว` }, { status: 400 });

  // slug จากชื่อ — ถ้าชนของเดิม เติมท้ายด้วยรหัสสั้น
  const baseSlug = name.toLowerCase().replace(/\s+/g, "-");
  let result = await admin.from("brands").insert({ name, slug: baseSlug, color, is_active: true }).select("id, name, color").single();
  if (result.error && /duplicate|unique/i.test(result.error.message)) {
    result = await admin.from("brands").insert({ name, slug: `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`, color, is_active: true }).select("id, name, color").single();
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

  await writeAudit(admin, { action: "create", entityType: "brand", entityId: result.data.id, actorId: user.id, actorName: user.email ?? null, metadata: { name, color } });
  return NextResponse.json({ data: result.data as Brand, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { id?: string; name?: string; color?: string | null; is_customer_job?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่พบแบรนด์" }, { status: 400 });

  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if ("color" in body) patch.color = body.color && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;
  if ("is_customer_job" in body) patch.is_customer_job = !!body.is_customer_job;
  if ("name" in body) {
    const nm = (body.name ?? "").trim();
    if (!nm) return NextResponse.json({ error: "ชื่อแบรนด์ห้ามว่าง" }, { status: 400 });
    const { data: dup } = await admin.from("brands").select("id").ilike("name", nm).neq("id", body.id).limit(1);
    if ((dup ?? []).length > 0) return NextResponse.json({ error: `มีแบรนด์ชื่อ "${nm}" อยู่แล้ว` }, { status: 400 });
    patch.name = nm;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ id: body.id, error: null });

  const { error } = await admin.from("brands").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "brand", entityId: body.id, actorId: user.id, actorName: user.email ?? null, metadata: patch });
  return NextResponse.json({ id: body.id, ...patch, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่พบแบรนด์" }, { status: 400 });

  // soft delete — ซ่อนจากรายการ (is_active=false) แต่ข้อมูลเดิมที่อ้างถึงแบรนด์นี้ยังอยู่ ไม่พัง
  const admin = supabaseAdmin();
  const { error } = await admin.from("brands").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "brand", entityId: id, actorId: user.id, actorName: user.email ?? null, metadata: { soft: true } });
  return NextResponse.json({ ok: true, error: null });
}
