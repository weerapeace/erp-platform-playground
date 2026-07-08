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
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("product_families")
    .select("id, name, code_prefix, default_name, default_uom_id, group_id, product_family_groups ( name )")
    .eq("is_active", true).order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  // แปลง default_uom_id → ชื่อหน่วย (โชว์ใน UI + prefill wizard) — ไม่มี FK เลย query แยก
  const uomIds = [...new Set((data ?? []).map((t) => t.default_uom_id as string | null).filter(Boolean))] as string[];
  const uomMap = new Map<string, string>();
  if (uomIds.length) {
    const { data: u } = await admin.from("uoms").select("id, name").in("id", uomIds);
    for (const x of (u ?? []) as { id: string; name: string }[]) uomMap.set(x.id, x.name);
  }

  const rows = (data ?? []).map((t) => ({
    id: t.id as string, name: t.name as string, code_prefix: (t.code_prefix as string | null) ?? "",
    default_name: (t.default_name as string | null) ?? "",
    default_uom_id: (t.default_uom_id as string | null) ?? null,
    default_uom_label: t.default_uom_id ? (uomMap.get(t.default_uom_id as string) ?? "") : "",
    group_name: (t.product_family_groups as { name?: string } | null)?.name ?? null,
  }));
  return NextResponse.json({ data: rows, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; code_prefix?: string; default_name?: string; default_uom_id?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  // อัปเดตเฉพาะฟิลด์ที่ส่งมา (ตั้ง/แก้/ล้าง prefix + ชื่อ default + หน่วย default)
  const patch: Record<string, unknown> = {};
  if (body.code_prefix !== undefined)   patch.code_prefix = (body.code_prefix ?? "").trim() || null;
  if (body.default_name !== undefined)  patch.default_name = (body.default_name ?? "").trim() || null;
  if (body.default_uom_id !== undefined) patch.default_uom_id = body.default_uom_id || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้อัปเดต" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("product_families").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "set_family_defaults", entityType: "product_families", entityId: body.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch,
  });
  return NextResponse.json({ id: body.id, ...patch, error: null });
}
