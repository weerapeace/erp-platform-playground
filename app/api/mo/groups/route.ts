/**
 * กลุ่มใบสั่งงาน (production batches) — /api/mo/groups
 *  GET    → รายการกลุ่ม (active)
 *  POST   → สร้างกลุ่มใหม่ { name, note?, color?, mo_nos? }
 *  PATCH  → แก้ { id, name?, note?, color?, mo_nos? | add_mos? | remove_mos? }
 *  DELETE → ?id=  (soft delete: is_active=false)
 * ของกลาง: guardApi + supabaseAdmin + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoGroup = {
  id: string; name: string; note: string | null; color: string | null;
  mo_nos: string[]; sort_order: number;
};

const asMoNos = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
const uniq = (arr: string[]) => [...new Set(arr)];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("mo_groups")
    .select("id, name, note, color, mo_nos, sort_order")
    .eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (data ?? []).map((g) => ({ ...g, mo_nos: asMoNos((g as Record<string, unknown>).mo_nos) })) as MoGroup[];
  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อกลุ่ม" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("mo_groups").insert({
    name, note: body.note ? String(body.note) : null, color: body.color ? String(body.color) : null,
    mo_nos: uniq(asMoNos(body.mo_nos)), created_by: user?.email ?? user?.id ?? null,
  }).select("id, name, note, color, mo_nos, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id: user?.id ?? null, action: "create", entity_type: "mo_group", entity_id: data.id, metadata: { name, count: asMoNos(data.mo_nos).length } }).then(() => {}, () => {});
  return NextResponse.json({ data: { ...data, mo_nos: asMoNos(data.mo_nos) }, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("mo_groups").select("mo_nos").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบกลุ่ม" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (body.note !== undefined) patch.note = body.note ? String(body.note) : null;
  if (body.color !== undefined) patch.color = body.color ? String(body.color) : null;
  if (body.mo_nos !== undefined) patch.mo_nos = uniq(asMoNos(body.mo_nos));
  else if (body.add_mos !== undefined) patch.mo_nos = uniq([...asMoNos(cur.mo_nos), ...asMoNos(body.add_mos)]);
  else if (body.remove_mos !== undefined) { const rm = new Set(asMoNos(body.remove_mos)); patch.mo_nos = asMoNos(cur.mo_nos).filter((m) => !rm.has(m)); }

  const { data, error } = await admin.from("mo_groups").update(patch).eq("id", id).select("id, name, note, color, mo_nos, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id: user?.id ?? null, action: "update", entity_type: "mo_group", entity_id: id, metadata: { ...patch } }).then(() => {}, () => {});
  return NextResponse.json({ data: { ...data, mo_nos: asMoNos(data.mo_nos) }, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("mo_groups").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: user?.id ?? null, action: "delete", entity_type: "mo_group", entity_id: id, metadata: {} }).then(() => {}, () => {});
  return NextResponse.json({ error: null });
}
