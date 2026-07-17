/**
 * /api/subscriptions/streaming-services/[id] — แก้/ลบ บริการ streaming (เจ้าของเท่านั้น)
 * PATCH  → เปลี่ยนชื่อ { name }
 * DELETE → ลบบริการ + ถอด id ออกจากทุกรายการส่วนตัวของฉันที่ติ๊กไว้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function meId(request: NextRequest): Promise<string> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user?.id ?? "";
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { id } = await params;
  const me = await meId(request);
  if (!me) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });

  let body: { name?: string; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อบริการ" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: dup } = await db.from("subscription_streaming_services")
    .select("id").eq("owner_id", me).ilike("name", name).neq("id", id).maybeSingle();
  if (dup) return NextResponse.json({ error: "มีบริการชื่อนี้อยู่แล้ว" }, { status: 400 });

  const { data, error } = await db.from("subscription_streaming_services")
    .update({ name }).eq("id", id).eq("owner_id", me).select("id, name, sort_order").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "แก้ไม่สำเร็จ" }, { status: 500 });

  await writeAudit(db, {
    action: "update", entityType: "subscription_streaming_services", entityId: null,
    actorId: me, actorName: body.actor ?? null, metadata: { id, name },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { id } = await params;
  const me = await meId(request);
  if (!me) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });

  const db = supabaseAdmin();
  // ถอด id ออกจากทุกรายการส่วนตัวของฉันที่ติ๊กบริการนี้ไว้
  const { data: subs } = await db.from("subscriptions")
    .select("id, streaming").eq("owner_id", me).contains("streaming", [id]);
  for (const s of (subs ?? []) as { id: string; streaming: string[] }[]) {
    const next = (s.streaming ?? []).filter((x) => x !== id);
    await db.from("subscriptions").update({ streaming: next }).eq("id", s.id);
  }

  const { error } = await db.from("subscription_streaming_services").delete().eq("id", id).eq("owner_id", me);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, {
    action: "delete", entityType: "subscription_streaming_services", entityId: null,
    actorId: me, actorName: null, metadata: { id, unlinked_from: subs?.length ?? 0 },
  });
  return NextResponse.json({ ok: true, error: null });
}
