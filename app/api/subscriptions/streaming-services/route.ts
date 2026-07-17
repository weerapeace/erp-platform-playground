/**
 * /api/subscriptions/streaming-services — คลังบริการ streaming ต่อผู้ใช้ (เฉพาะโหมดส่วนตัว)
 *
 * GET  → { data: StreamingService[] }  (ของฉันเท่านั้น)
 * POST → เพิ่มบริการใหม่ { name }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const me = user?.id ?? "";
  if (!me) return NextResponse.json({ data: [], error: null });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("subscription_streaming_services")
    .select("id, name, sort_order")
    .eq("owner_id", me)
    .order("sort_order").order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const me = user?.id ?? "";
  if (!me) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });

  let body: { name?: string; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อบริการ streaming" }, { status: 400 });

  const db = supabaseAdmin();
  // กันชื่อซ้ำในคลังของตัวเอง (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
  const { data: dup } = await db.from("subscription_streaming_services").select("id").eq("owner_id", me).ilike("name", name).maybeSingle();
  if (dup) return NextResponse.json({ error: "มีบริการชื่อนี้อยู่แล้ว" }, { status: 400 });

  const { data, error } = await db
    .from("subscription_streaming_services")
    .insert({ owner_id: me, name })
    .select("id, name, sort_order").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "เพิ่มไม่สำเร็จ" }, { status: 500 });

  await writeAudit(db, {
    action: "create", entityType: "subscription_streaming_services", entityId: null,
    actorId: me, actorName: body.actor ?? null, metadata: { id: data.id, name: data.name },
  });
  return NextResponse.json({ data, error: null });
}
