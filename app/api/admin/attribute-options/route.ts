/**
 * จัดการตัวเลือกของฟิลด์ many2one/multiselect (product_attribute_options) — /api/admin/attribute-options
 * POST   → เพิ่มตัวเลือก { definition_id, label, value? }
 * PATCH  → แก้ { id, label?, value?, display_order? }
 * DELETE ?id= → ลบ
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { id?: string; definition_id?: string; label?: string; value?: string; display_order?: number };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: Body; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const defId = (b.definition_id ?? "").trim(); const label = (b.label ?? "").trim();
  if (!defId || !label) return NextResponse.json({ error: "ต้องระบุฟิลด์และชื่อตัวเลือก" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("product_attribute_options").select("display_order").eq("definition_id", defId).order("display_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (Number((maxRow as { display_order?: number } | null)?.display_order) || 0) + 1;
  const { data, error } = await admin.from("product_attribute_options").insert({
    definition_id: defId, label, value: (b.value && b.value.trim()) || label, display_order: nextOrder, is_active: true,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "attribute_option", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { definition_id: defId, label } });
  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: Body; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof b.label === "string") patch.label = b.label.trim();
  if (typeof b.value === "string") patch.value = b.value.trim();
  if (typeof b.display_order === "number") patch.display_order = b.display_order;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("product_attribute_options").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "attribute_option", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch });
  return NextResponse.json({ id: b.id, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("product_attribute_options").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "attribute_option", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
