/**
 * Card Layouts (ของกลาง) — เลือก field ที่จะโชว์บนการ์ด + ลำดับ
 *   default ของทุกคน (owner_email NULL, admin ตั้ง) + ส่วนตัวรายคน (owner_email = อีเมล)
 *
 * GET  /api/card-layouts?scope=receive-tracking
 *   → { default: string[]|null, mine: string[]|null }
 * PUT  /api/card-layouts
 *   body: { scope, fields: string[], target: 'all'|'me' }
 *   target='all' = default ทุกคน (ต้องสิทธิ์ products.edit) · 'me' = ของตัวเอง
 * DELETE /api/card-layouts?scope=&target=all|me  → ล้าง (กลับไปใช้ค่าถัดลงไป)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const scope = request.nextUrl.searchParams.get("scope");
  if (!scope) return NextResponse.json({ default: null, mine: null, error: "missing ?scope=" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("card_layouts").select("owner_email, fields").eq("scope_key", scope);
  if (error) return NextResponse.json({ default: null, mine: null, error: error.message }, { status: 500 });
  const rows = (data ?? []) as { owner_email: string | null; fields: unknown }[];
  const asArr = (v: unknown) => Array.isArray(v) ? (v as string[]) : null;
  const def = rows.find((r) => r.owner_email == null);
  const mine = user?.email ? rows.find((r) => r.owner_email === user.email) : undefined;
  return NextResponse.json({ default: def ? asArr(def.fields) : null, mine: mine ? asArr(mine.fields) : null, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: { scope?: string; fields?: unknown; target?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const scope = String(body.scope ?? "");
  const target = body.target === "all" ? "all" : "me";
  const fields = Array.isArray(body.fields) ? body.fields.filter((x) => typeof x === "string") : [];
  if (!scope) return NextResponse.json({ error: "scope required" }, { status: 400 });

  // ตั้ง default ทุกคน = ต้องสิทธิ์ products.edit · ของตัวเอง = แค่ login
  const denied = await guardApi(request, target === "all" ? "products.edit" : "products.view"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const ownerEmail = target === "all" ? null : user.email;
  const admin = supabaseAdmin();
  // upsert ด้วยมือ (partial unique index ทำให้ onConflict ไม่ตรงไปตรงมา)
  const q = admin.from("card_layouts").select("id").eq("scope_key", scope);
  const { data: existing } = await (ownerEmail == null ? q.is("owner_email", null) : q.eq("owner_email", ownerEmail)).maybeSingle();
  if (existing) {
    const { error } = await admin.from("card_layouts").update({ fields, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("card_layouts").insert({ scope_key: scope, owner_email: ownerEmail, fields, created_by: user.email });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (target === "all") await writeAudit(admin, { action: "update", entityType: "card_layouts", entityId: scope, actorId: user.id, actorName: user.email ?? "", metadata: { scope, fields } });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const scope = request.nextUrl.searchParams.get("scope");
  const target = request.nextUrl.searchParams.get("target") === "all" ? "all" : "me";
  if (!scope) return NextResponse.json({ error: "missing ?scope=" }, { status: 400 });
  const denied = await guardApi(request, target === "all" ? "products.edit" : "products.view"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const admin = supabaseAdmin();
  const q = admin.from("card_layouts").delete().eq("scope_key", scope);
  const { error } = await (target === "all" ? q.is("owner_email", null) : q.eq("owner_email", user.email));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
