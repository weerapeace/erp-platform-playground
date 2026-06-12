/**
 * ตั้ง "รหัสนำหน้า SKU (code_prefix)" ให้แท็ก/ประเภท (product_families)
 *
 * GET   /api/skus/tag-prefix                       → [{id,name,code_prefix,group_name}] ทุกแท็ก (ไว้ทำ UI)
 * PATCH /api/skus/tag-prefix  body {id, code_prefix}  → ตั้ง/แก้/ล้าง prefix ของแท็กนั้น
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
  const { data, error } = await supabaseAdmin().from("product_families")
    .select("id, name, code_prefix, group_id, product_family_groups ( name )")
    .eq("is_active", true).order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (data ?? []).map((t) => ({
    id: t.id as string, name: t.name as string, code_prefix: (t.code_prefix as string | null) ?? "",
    group_name: (t.product_family_groups as { name?: string } | null)?.name ?? null,
  }));
  return NextResponse.json({ data: rows, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; code_prefix?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const prefix = (body.code_prefix ?? "").trim() || null;

  const admin = supabaseAdmin();
  const { error } = await admin.from("product_families").update({ code_prefix: prefix }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "set_code_prefix", entityType: "product_families", entityId: body.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code_prefix: prefix },
  });
  return NextResponse.json({ id: body.id, code_prefix: prefix, error: null });
}
