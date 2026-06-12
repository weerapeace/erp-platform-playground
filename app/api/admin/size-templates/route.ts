/**
 * ชุดไซส์มาตรฐาน (size_templates) — /api/admin/size-templates
 * GET    → list (active, เรียง sort_order)
 * POST   → { name, labels:string[] }
 * PATCH  → { id, name?, labels?, sort_order? }
 * DELETE ?id= → ลบ (soft: is_active=false)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SizeTemplate = { id: string; name: string; labels: string[]; sort_order: number };

const cleanLabels = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin()
    .from("size_templates").select("id, name, labels, sort_order").eq("is_active", true)
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const out: SizeTemplate[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), name: String(r.name ?? ""), labels: cleanLabels(r.labels), sort_order: Number(r.sort_order) || 0,
  }));
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { name?: string; labels?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อชุดไซส์" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("size_templates").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (Number((maxRow as { sort_order?: number } | null)?.sort_order) || 0) + 1;
  const { data, error } = await admin.from("size_templates").insert({ name, labels: cleanLabels(b.labels), sort_order: nextOrder }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "size_template", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name } });
  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { id?: string; name?: string; labels?: unknown; sort_order?: number }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (b.labels !== undefined) patch.labels = cleanLabels(b.labels);
  if (typeof b.sort_order === "number") patch.sort_order = b.sort_order;
  const admin = supabaseAdmin();
  const { error } = await admin.from("size_templates").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "size_template", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch });
  return NextResponse.json({ id: b.id, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("size_templates").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "size_template", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
